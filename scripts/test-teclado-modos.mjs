// Verifica que el ajuste del teclado del cajón suba SOLO la diferencia exacta
// hasta el borde del teclado en los distintos comportamientos de WebView:
//   A) overlay simple ......... hay que subir todo (280px)
//   B) auto-lift (el navegador ya lo sube) ... no hay que subir nada (0)
//   C) overlay con offsetTop (el WebView desplaza el viewport al enfocar)
//      ...................... hay que subir solo 180px (antes subía 280 = bug
//      "se va muy arriba" dejando hueco)
//   D) resizes-content (el layout se reduce) .. no subir nada y ocultar nav
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

// Instalar patch + stub de medición
const setup = await evalJs(`(() => {
    const vv = window.visualViewport;
    let h = vv.height, off = vv.offsetTop || 0;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => off });
    window.__setVv = (nh, no) => { h = nh; off = no || 0; window.dispatchEvent(new Event('resize')); };
    const d = document.getElementById('comentarios-drawer');
    window.__origRect = d.getBoundingClientRect.bind(d);
    // baseSimulada = borde inferior del cajón con bottom:0 en el modo simulado
    window.__base = 900;
    d.getBoundingClientRect = function () {
        const aplicado = parseFloat(d.style.bottom) || 0;
        const r = window.__origRect();
        return { top: r.top, bottom: window.__base - aplicado, left: r.left, right: r.right, width: r.width, height: r.height, x: r.x, y: r.y };
    };
    window.__restaurarRect = () => { d.getBoundingClientRect = window.__origRect; };
    window.__bottom = () => d.style.bottom;
    window.__clase = () => document.body.classList.contains('teclado-abierto');
    window.__reset = () => { d.style.bottom = ''; d.style.transition = ''; };
    return 'ok';
})()`);
console.log('setup:', setup);

async function correr(nombre, { vvH, offsetTop, base, innerH }, esperado) {
    await evalJs(`__reset()`);
    await evalJs(`__base = ${base}`);
    if (innerH) await evalJs(`Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => ${innerH} })`);
    await evalJs(`__setVv(${vvH}, ${offsetTop})`);
    await sleep(60);
    const st = await evalJs(`JSON.stringify({ bottom: __bottom(), clase: __clase() })`);
    const o = JSON.parse(st);
    const ok = o.bottom === esperado.bottom && o.clase === esperado.clase;
    console.log(`  ${ok ? '✓' : '✗'} ${nombre}: bottom="${o.bottom || '(0)'}" navOculto=${o.clase} | esperado bottom="${esperado.bottom || '(0)'}" navOculto=${esperado.clase}`);
    return ok;
}

console.log('\n=== modos de WebView ===');
let ok = true;
// A) overlay simple: keyboardTop=620, base=900 -> necesario 280
ok = (await correr('A overlay simple', { vvH: 620, offsetTop: 0, base: 900 }, { bottom: '280px', clase: true })) && ok;
// B) auto-lift: el navegador ya subió el cajón (base=620) -> necesario 0
ok = (await correr('B auto-lift (navegador ya sube)', { vvH: 620, offsetTop: 0, base: 620 }, { bottom: '', clase: true })) && ok;
// C) overlay + offsetTop: keyboardTop=720, base=900 -> necesario 180 (antes 280 = "se va muy arriba")
ok = (await correr('C overlay con offsetTop=100', { vvH: 620, offsetTop: 100, base: 900 }, { bottom: '180px', clase: true })) && ok;
// D) resizes-content: innerHeight 620 == vvH -> layoutReducido, base=620 -> 0
ok = (await correr('D resizes-content', { vvH: 620, offsetTop: 0, base: 620, innerH: 620 }, { bottom: '', clase: true })) && ok;

// Restaurar innerHeight y comprobar restauración al cerrar el teclado
await evalJs(`Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 900 })`);
await evalJs(`__base = 900`);
await evalJs(`__setVv(900, 0)`);
await sleep(60);
const cerrado = await evalJs(`JSON.stringify({ bottom: __bottom(), clase: __clase() })`);
const oc = JSON.parse(cerrado);
const okCierre = oc.bottom === '' && oc.clase === false;
console.log(`  ${okCierre ? '✓' : '✗'} E teclado cerrado: bottom="${oc.bottom || '(0)'}" navOculto=${oc.clase}`);
ok = ok && okCierre;

await evalJs(`__restaurarRect()`);
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: FALLOS');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
