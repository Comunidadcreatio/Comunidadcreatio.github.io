// Verifica el ajuste del teclado del cajón con el nuevo modelo:
//   - el CAJÓN nunca cambia de posición (su fondo llega siempre al borde
//     inferior de la pantalla)  ->  es imposible ver la página detrás.
//   - el CONTENIDO se sube con padding-bottom, medido sobre el borde inferior
//     del área del input, solo lo justo para dejarlo encima del teclado.
// Se simulan los distintos comportamientos de WebView.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tecm-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9294',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9294/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9294/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9294/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 300)); return null; }
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

const setup = await evalJs(`(() => {
    const vv = window.visualViewport;
    let h = vv.height, off = vv.offsetTop || 0;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => off });
    window.__setVv = (nh, no) => { h = nh; off = no || 0; window.dispatchEvent(new Event('resize')); };
    const d = document.getElementById('comentarios-drawer');
    const area = d.querySelector('.comentarios-input-area');
    window.__estado = () => {
        const tr = getComputedStyle(area).transform;
        let lift = 0;
        if (tr && tr !== 'none') {
            const m = tr.match(/matrix\\(([^)]+)\\)/);
            if (m) lift = -parseFloat(m[1].split(',')[5]);
        }
        const ar = area.getBoundingClientRect();
        const vv2 = window.visualViewport;
        return JSON.stringify({
            lift: Math.round(lift),
            areaBottom: Math.round(ar.bottom),
            keyboardTop: Math.round(vv2.height + (vv2.offsetTop || 0)),
            drawerBottom: Math.round(d.getBoundingClientRect().bottom),
            clase: document.body.classList.contains('teclado-abierto')
        });
    };
    window.__resetDrawer = () => { d.style.bottom = ''; area.style.transition = ''; area.style.transform = ''; };
    return 'ok';
})()`);
console.log('setup:', setup);

async function correr(nombre, { vvH, offsetTop, simularLiftNavegador, innerH }, esperado) {
    await evalJs(`__resetDrawer()`);
    if (simularLiftNavegador) {
        // Simula que el WebView ya reacomodó el cajón encima del teclado: se
        // mueve su caja de LAYOUT (bottom), no un transform, como haría el
        // navegador al redimensionar/reposicionar elementos fijos.
        await evalJs(`document.getElementById('comentarios-drawer').style.bottom = '${simularLiftNavegador}px'`);
    }
    if (innerH) await evalJs(`Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => ${innerH} })`);
    await evalJs(`__setVv(${vvH}, ${offsetTop})`);
    await sleep(420); // deja pasar el gesto + la corrección de asentado
    const o = JSON.parse(await evalJs(`__estado()`));
    const keyboardTop = vvH + offsetTop;
    const sinPagina = o.drawerBottom >= keyboardTop;      // el fondo del cajón cubre hasta el teclado
    const inputArriba = o.areaBottom <= keyboardTop + 1;  // el área no queda tras el teclado
    const ok = o.lift === esperado.lift && o.clase === esperado.clase && sinPagina && inputArriba;
    console.log(`  ${ok ? '✓' : '✗'} ${nombre}: lift=${o.lift} areaBottom=${o.areaBottom} (teclado en ${keyboardTop}) navOculto=${o.clase} fondoCubre=${sinPagina}`);
    if (!ok) console.log(`      esperado lift=${esperado.lift} navOculto=${esperado.clase}`);
    return ok;
}

console.log('\n=== modos de WebView ===');
let ok = true;
// A) overlay simple: área natural 840, teclado en 620 -> sube 220
ok = (await correr('A overlay simple', { vvH: 620, offsetTop: 0 }, { lift: 220, clase: true })) && ok;
// B) auto-lift: el WebView ya dejó el cajón subido (área natural 560) -> 0
ok = (await correr('B auto-lift (navegador ya sube)', { vvH: 620, offsetTop: 0, simularLiftNavegador: 280 }, { lift: 0, clase: true })) && ok;
// C) overlay + offsetTop: teclado en 720 -> sube 120 (no 220)
ok = (await correr('C overlay con offsetTop=100', { vvH: 620, offsetTop: 100 }, { lift: 120, clase: true })) && ok;
// D) resizes-content: layout reducido (área natural 560), teclado 620 -> 0
ok = (await correr('D resizes-content', { vvH: 620, offsetTop: 0, simularLiftNavegador: 280, innerH: 620 }, { lift: 0, clase: true })) && ok;
// E) teclado más bajo que el espacio del nav: área natural 840, teclado 860 -> 0
ok = (await correr('E teclado bajo (40px)', { vvH: 860, offsetTop: 0 }, { lift: 0, clase: true })) && ok;

// Cerrar teclado
await evalJs(`Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 900 })`);
await evalJs(`__setVv(900, 0)`);
await sleep(420);
const o = JSON.parse(await evalJs(`__estado()`));
const okCierre = o.lift === 0 && o.clase === false;
console.log(`  ${okCierre ? '✓' : '✗'} F teclado cerrado: lift=${o.lift} navOculto=${o.clase}`);
ok = ok && okCierre;

await evalJs(`__resetDrawer()`);
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: FALLOS');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
