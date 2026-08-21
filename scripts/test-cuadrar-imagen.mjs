// Verifica el encuadre manual (cuadrar imagen):
// 1) Botón "Cuadrar" presente al agregar imagen.
// 2) Se abre el marco 4:5 con la imagen.
// 3) Pinch (2 dedos separándose) → la escala AUMENTA.
// 4) Pan (1 dedo) → la posición CAMBIA.
// 5) "Aplicar" → la imagen del carrusel se reemplaza por la encuadrada.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'cuadro-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9275',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9275/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9275/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9275/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

console.log('=== 1) Agregar imagen → botones Editar y Cuadrar ===');
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#cc3344'; x.fillRect(0,0,1200,900);
    x.fillStyle = '#ffee00'; x.fillRect(300,200,600,500);
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
    editar: !!document.querySelector('.btn-editar-slide'),
    cuadrar: !!document.querySelector('.btn-cuadrar-slide')
})`));

console.log('\n=== 2) Abrir Cuadrar → marco visible con la imagen ===');
await evalJs(`document.querySelector('.btn-cuadrar-slide').click()`);
await sleep(1200);
console.log(await evalJs(`JSON.stringify({
    overlay: !!document.querySelector('.img-cuadro-overlay'),
    viewport: (() => { const v = document.querySelector('.img-cuadro-viewport'); const r = v.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
    ratio: (() => { const v = document.querySelector('.img-cuadro-viewport'); const r = v.getBoundingClientRect(); return (r.height / r.width).toFixed(2); })(), // 4:5 → 1.25
    transformInicial: document.querySelector('.img-cuadro-viewport img').style.transform
})`));

console.log('\n=== 3) Pinch (dos dedos separándose) → escala aumenta ===');
const vp = await evalJs(`(() => { const r = document.querySelector('.img-cuadro-viewport').getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
  { x: vp.x - 20, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: vp.x + 20, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(80);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
  { x: vp.x - 70, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: vp.x + 70, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(200);
const trasPinch = await evalJs(`document.querySelector('.img-cuadro-viewport img').style.transform`);
console.log('transform tras pinch:', trasPinch);

console.log('\n=== 4) Giro (dos dedos rotando) → la rotación cambia ===');
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
  { x: vp.x - 40, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: vp.x + 40, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(80);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
  { x: vp.x - 40, y: vp.y - 40, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: vp.x + 40, y: vp.y + 40, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(200);
const trasGiro = await evalJs(`document.querySelector('.img-cuadro-viewport img').style.transform`);
console.log('transform tras giro:', trasGiro);

console.log('\n=== 5) Pan (un dedo) → posición cambia ===');
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vp.x, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: vp.x + 30, y: vp.y + 40, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(200);
const trasPan = await evalJs(`document.querySelector('.img-cuadro-viewport img').style.transform`);
console.log('transform tras pan:', trasPan);

console.log('\n=== 6) Aplicar → imagen reemplazada por la encuadrada ===');
await evalJs(`document.getElementById('ic-apply').click()`);
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    cerrado: !document.querySelector('.img-cuadro-overlay'),
    previewEsBlob: document.querySelector('#carrusel-track .carrusel-slide img').src.startsWith('blob:'),
    srcTipo: document.querySelector('#carrusel-track .carrusel-slide img').src.slice(0, 20)
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
