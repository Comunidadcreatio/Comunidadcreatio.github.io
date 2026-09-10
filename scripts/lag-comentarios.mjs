// Comprueba POR PÍXELES que durante la animación del teclado (el cajón se
// mueve con su propia interpolación, a distinta velocidad que el sistema)
// NUNCA se ve la página por encima de la línea del teclado.
// En headless no hay teclado físico, así que la franja POR DEBAJO de la línea
// del teclado muestra la galería roja (204,51,69) — eso es normal (ahí iría el
// teclado). Lo que se verifica es que por ENCIMA de esa línea todo sea cajón.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'pixtec-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9296',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9296/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9296/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9296/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 250)); return null; }
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#cc3344');
      const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Óleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Óleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras/1/comentarios')) return json({ comentarios: [] });
              if (u.includes('/obras')) return json(obrasMock);
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(800);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(2000);
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(1500);

const patch = await evalJs(`(() => {
    const vv = window.visualViewport;
    let h = vv.height, off = 0;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => off });
    window.__setVv = (nh) => { h = nh; window.dispatchEvent(new Event('resize')); };
    return 'ok';
})()`);
console.log('patch:', patch);

// Muestrea la columna central de una captura y cuenta píxeles de "página"
// (galería roja) por encima de la línea del teclado.
async function analizar(drawerTop, keyboardTop) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    return evalJs(`(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${shot.result.data}';
        await new Promise(r => { img.onload = r; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const x = cv.getContext('2d');
        x.drawImage(img, 0, 0);
        const cx = Math.floor(cv.width * 0.5);
        const esPagina = (d) => d[0] > 140 && d[1] < 110 && d[2] < 130; // rojo galería
        let rojasEnCajon = 0, rojasBajoTeclado = 0;
        for (let y = Math.max(0, Math.round(${drawerTop}) + 8); y < cv.height; y += 4) {
            const d = x.getImageData(cx, y, 1, 1).data;
            if (esPagina(d)) {
                if (y < Math.round(${keyboardTop}) - 4) rojasEnCajon++;
                else rojasBajoTeclado++;
            }
        }
        return JSON.stringify({ rojasEnCajon, rojasBajoTeclado });
    })()`);
}

async function geometria() {
    return JSON.parse(await evalJs(`(() => {
        const d = document.getElementById('comentarios-drawer');
        const r = d.getBoundingClientRect();
        const vv = window.visualViewport;
        const inp = document.getElementById('comentarios-input');
        return JSON.stringify({
            drawerTop: Math.round(r.top), drawerBottom: Math.round(r.bottom),
            keyboardTop: Math.round(vv.height + (vv.offsetTop || 0)),
            pad: Math.round(parseFloat(d.style.paddingBottom) || 0),
            inputBottom: Math.round(inp.getBoundingClientRect().bottom)
        });
    })()`));
}

let ok = true;
async function barrido(nombre, alturas) {
    console.log(`\n=== ${nombre} ===`);
    let peor = 0, muestras = 0;
    for (const h of alturas) {
        await evalJs(`__setVv(${h})`);
        await sleep(45); // deja avanzar la interpolación del cajón
        const g = await geometria();
        const a = JSON.parse(await analizar(g.drawerTop, g.keyboardTop));
        muestras++;
        if (a.rojasEnCajon > peor) peor = a.rojasEnCajon;
        console.log(`  ${a.rojasEnCajon === 0 ? '✓' : '✗'} vvH=${h} cajón=${g.drawerTop}..${g.drawerBottom} teclado=${g.keyboardTop} pad=${g.pad} input=${g.inputBottom} | rojas sobre el teclado: ${a.rojasEnCajon} (bajo: ${a.rojasBajoTeclado})`);
        if (a.rojasEnCajon > 0) ok = false;
    }
    console.log(peor === 0 ? `  ✓ ninguna muestra con página visible (${muestras} muestras)` : `  ✗ página visible en alguna muestra (máx ${peor} px)`);
    return peor;
}

await barrido('ABRIENDO el teclado (900 -> 620)', [900, 870, 840, 810, 780, 750, 720, 690, 660, 630, 620]);
await sleep(400);
await barrido('CERRANDO el teclado (620 -> 900)', [620, 650, 680, 710, 740, 770, 800, 830, 860, 890, 900]);
await sleep(400);
await barrido('ABRIENDO lento (pasos pequeños)', [900, 880, 860, 840, 820, 800, 780, 760, 740, 720, 700, 680, 660, 640, 620]);
await sleep(500);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK (nunca se ve la página durante la animación)' : '\nRESULTADO: SE VE LA PÁGINA');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
