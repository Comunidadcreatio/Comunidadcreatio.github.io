// Verifica la barra compacta de etiquetas y la transición fluida al filtrar:
// - Altura de barra/chips reducida, gap menor.
// - El grid queda DEBAJO de la barra (sin solape).
// - Al tocar un chip: clase .grid-filtrando aparece (fade out) y desaparece
//   (fade in); el chip hace "pop" (tag-pop) y NO salta de tamaño.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tagsv-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9234',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9234/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9234/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9234/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com' }));
      const SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#888"/></svg>');
      const obras = Array.from({ length: 12 }, (_, i) => ({
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
await evalJs(`document.getElementById('btn-buscar').click()`);
let ready = false;
for (let i = 0; i < 40; i++) {
  ready = await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 12 && !document.getElementById('tags-carrusel').classList.contains('hidden')`);
  if (ready) break;
  await sleep(400);
}
await sleep(600);

const estado = () => evalJs(`(() => {
    const t = document.getElementById('tags-carrusel');
    const g = document.getElementById('galeria-container');
    const panel = document.getElementById('search-panel');
    const res = document.getElementById('search-results-dropdown');
    const tr = t.getBoundingClientRect();
    const gr = g.getBoundingClientRect();
    const chips = [...t.querySelectorAll('.tag-chip')].map(c => { const r = c.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; });
    return JSON.stringify({
        barraH: Math.round(tr.height),
        barraBottom: Math.round(tr.bottom),
        gridTop: Math.round(gr.y),
        gridDebajo: Math.round(gr.y) >= Math.round(tr.bottom),
        gap: getComputedStyle(t).gap,
        chips
    });
})()`);

console.log('=== MODO A: geometría compacta ===');
console.log(await estado());

console.log('\n=== Click en chip → transición fluida ===');
const antes = await evalJs(`(() => { const c = document.querySelector('.tag-chip'); const r = c.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; })()`);
await evalJs(`(() => { const chip = document.querySelector('.tag-chip'); chip.click(); return 'ok'; })()`);
await sleep(60); // durante el fade out
const durante = await evalJs(`JSON.stringify({
    filtrando: document.getElementById('galeria-container').classList.contains('grid-filtrando'),
    opacity: getComputedStyle(document.getElementById('galeria-container')).opacity,
    pop: !!document.querySelector('.tag-chip.tag-pop'),
    activa: !!document.querySelector('.tag-chip.activa')
})`);
console.log('durante fade out:', durante);
await sleep(400); // tras fade in
const despues = await evalJs(`(() => { const c = document.querySelector('.tag-chip'); const r = c.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; })()`);
const estadoFiltrado = await evalJs(`JSON.stringify({
    filtrando: document.getElementById('galeria-container').classList.contains('grid-filtrando'),
    opacity: getComputedStyle(document.getElementById('galeria-container')).opacity,
    cards: document.querySelectorAll('#galeria-container .obra-card').length
})`);
console.log('antes:', JSON.stringify(antes), '→ después:', JSON.stringify(despues), '(altura constante:', antes.h === despues.h, ')');
console.log('tras fade in:', estadoFiltrado);

console.log('\n=== Buscador en modo B: resultados debajo de la barra ===');
const inputRect = await evalJs(`(() => { const el = document.getElementById('search-input'); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: inputRect.x, y: inputRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(600);
console.log(await evalJs(`(() => {
    const res = document.getElementById('search-results-dropdown');
    const t = document.getElementById('tags-carrusel');
    const r = res.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    return JSON.stringify({
        resultsTop: Math.round(r.y),
        barraBottom: Math.round(tr.bottom),
        resultadosDebajo: Math.round(r.y) >= Math.round(tr.bottom)
    });
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
