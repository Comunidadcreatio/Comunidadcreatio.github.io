// Verifica los 4 arreglos de Explorar:
// 1) Círculo PTR FIJO bajo el header (encima de las etiquetas) + etiquetas
//    que bajan con el arrastre y vuelven al soltar.
// 2) Etiquetas con aire del header (--explorar-air 6px).
// 3) La lupa del header anima con hamburguesaAparece/Oculta.
// 4) Cavents desde Explorar: sale del grid, oculta etiquetas y la lupa del
//    nav vuelve a ABRIR Explorar (no refresca el carrusel).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'fix4-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9255',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9255/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9255/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9255/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#888"/></svg>');
      const obras = Array.from({ length: 9 }, (_, i) => ({
          id: i + 1, titulo: 'Obra ' + (i + 1), artista: 'A' + (i + 1),
          precio: 10, views_count: 1, likes_count: 0, comments_count: 0,
          imagen_url: SVG, etiquetas: i % 2 ? 'paisaje,abstracto' : 'retrato',
          artista_user_id: 1
      }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras') && !u.includes('reacciones')) return json({ obras });
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

// Abrir Explorar
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9`)) break;
  await sleep(400);
}
await sleep(600);

console.log('=== 2) Aire de las etiquetas en Explorar ===');
console.log(await evalJs(`(() => {
    const t = document.getElementById('tags-carrusel');
    const g = document.getElementById('galeria-container');
    const tr = t.getBoundingClientRect();
    const gr = g.getBoundingClientRect();
    return JSON.stringify({ tagsY: Math.round(tr.y), gridTop: Math.round(gr.y), aireTop: Math.round(tr.y) - 88 });
})()`));

console.log('\n=== 3) Animación de la lupa del header ===');
console.log(await evalJs(`JSON.stringify({
    aparecer: getComputedStyle(document.getElementById('btn-lupa-explorar')).animationName,
    display: getComputedStyle(document.getElementById('btn-lupa-explorar')).display
})`));

console.log('\n=== 1) Gesto PTR: círculo encima de las etiquetas ===');
const gridRect = await evalJs(`(() => { const r = document.getElementById('galeria-container').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gridRect.x, y: gridRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gridRect.x, y: gridRect.y + 100, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(120);
console.log('durante el arrastre:', await evalJs(`(() => {
    const ind = document.querySelector('.pull-refresh-indicator');
    const tags = document.getElementById('tags-carrusel');
    const ir = ind.getBoundingClientRect();
    const tr = tags.getBoundingClientRect();
    return JSON.stringify({
        indicadorVisible: ind.classList.contains('visible'),
        indicadorY: Math.round(ir.y),
        tagsTransform: tags.style.transform,
        tagsY: Math.round(tr.y),
        gridPadding: document.getElementById('galeria-container').style.paddingTop
    });
})()`));
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(900);
console.log('tras soltar (refresh):', await evalJs(`(() => {
    const ind = document.querySelector('.pull-refresh-indicator');
    const tags = document.getElementById('tags-carrusel');
    return JSON.stringify({
        cargando: ind.classList.contains('loading') || ind.classList.contains('done'),
        tagsTransform: tags.style.transform,
        cards: document.querySelectorAll('#galeria-container .obra-card').length
    });
})()`));
await sleep(700);

console.log('\n=== 4) Cavents desde Explorar: sin etiquetas ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
console.log(await evalJs(`JSON.stringify({
    galeriaModoGrid: document.getElementById('galeria-container').classList.contains('modo-grid'),
    searchAbierto: document.body.classList.contains('search-abierto'),
    tagsDisplay: getComputedStyle(document.getElementById('tags-carrusel')).display,
    lupaHeaderHidden: document.getElementById('btn-lupa-explorar').classList.contains('hidden')
})`));

console.log('\n=== 4b) Nav lupa desde Cavents → abre Explorar (no refresca) ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9`)) break;
  await sleep(400);
}
await sleep(600);
console.log(await evalJs(`JSON.stringify({
    modoGrid: document.getElementById('galeria-container').classList.contains('modo-grid'),
    searchAbierto: document.body.classList.contains('search-abierto'),
    tagsDisplay: getComputedStyle(document.getElementById('tags-carrusel')).display,
    lupaHeaderVisible: !document.getElementById('btn-lupa-explorar').classList.contains('hidden')
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
