// Verifica las herramientas INLINE en el carrusel:
// 1) Botones Cuadrar/Editar SIEMPRE visibles (con y sin archivo, p.ej. cavent subido).
// 2) Cuadrar: primer toque activa modo (etiqueta + chip cancelar + slide marcado);
//    pinch/pan cambian la imagen; segundo toque GUARDA.
// 3) Editar: primer toque muestra "Brillo: 0"; deslizar horizontal ajusta valor;
//    deslizar vertical cambia de herramienta; segundo toque GUARDA.
// 4) Con modo activo, el swipe del carrusel NO cambia de slide.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'inline-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9277',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9277/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9277/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9277/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com' }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json({ obras: [] });
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);

console.log('=== 1) Botones visibles al agregar imagen ===');
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 1000;
    const x = c.getContext('2d'); x.fillStyle = '#cc4444'; x.fillRect(0,0,800,1000);
    x.fillStyle = '#ffee00'; x.fillRect(250,200,300,600);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    const inp = document.getElementById('input-imagen-0');
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await sleep(1800);
console.log(await evalJs(`JSON.stringify({
    cuadrar: !!document.querySelector('.btn-cuadrar-slide'),
    editar: !!document.querySelector('.btn-editar-slide:not(.btn-cuadrar-slide)')
})`));

console.log('\n=== 2) CUADRAR: activar en el sitio ===');
await evalJs(`document.querySelector('.btn-cuadrar-slide').click()`);
await sleep(1000);
console.log(await evalJs(`JSON.stringify({
    etiqueta: document.querySelector('.inline-tool-label')?.textContent || null,
    chipCancelar: !!document.querySelector('.inline-cancel-chip'),
    slideMarcado: !!document.querySelector('.carrusel-slide.inline-modo'),
    btnVerde: document.querySelector('.btn-cuadrar-slide').style.background.includes('46,125,50')
})`));

console.log('  pinch sobre la imagen (dentro del slide):');
const imgR = await evalJs(`(() => { const r = document.querySelector('.carrusel-slide img').getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
  { x: imgR.x - 20, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: imgR.x + 20, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
  { x: imgR.x - 60, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: imgR.x + 60, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
const t1 = await evalJs(`document.querySelector('.carrusel-slide img').style.transform`);
console.log('  transform tras pinch:', t1);

console.log('\n=== 3) Cuadrar: segundo toque GUARDA (imagen reemplazada, modo sale) ===');
await evalJs(`document.querySelector('.btn-cuadrar-slide').click()`);
await sleep(1200);
console.log(await evalJs(`JSON.stringify({
    modoFuera: !document.querySelector('.inline-tool-label'),
    slideSinModo: !document.querySelector('.carrusel-slide.inline-modo'),
    esBlob: document.querySelector('.carrusel-slide img').src.startsWith('blob:')
})`));

console.log('\n=== 4) EDITAR inline: muestra Brillo, ajuste horizontal, cambio de herramienta vertical ===');
await evalJs(`document.querySelector('.btn-editar-slide:not(.btn-cuadrar-slide)').click()`);
await sleep(800);
console.log('etiqueta inicial:', await evalJs(`document.querySelector('.inline-tool-label')?.textContent`));
// Deslizar HORIZONTAL (derecha) para subir brillo
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: imgR.x, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(50);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: imgR.x + 80, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(500);
console.log('tras deslizar derecha:', await evalJs(`document.querySelector('.inline-tool-label')?.textContent`));
// Deslizar VERTICAL (arriba) para cambiar de herramienta
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: imgR.x, y: imgR.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(50);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: imgR.x, y: imgR.y - 60, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(400);
console.log('tras deslizar arriba:', await evalJs(`document.querySelector('.inline-tool-label')?.textContent`));

console.log('\n=== 5) Editar: segundo toque GUARDA ===');
await evalJs(`document.querySelector('.btn-editar-slide:not(.btn-cuadrar-slide)').click()`);
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    modoFuera: !document.querySelector('.inline-tool-label'),
    esBlob: document.querySelector('.carrusel-slide img').src.startsWith('blob:')
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
