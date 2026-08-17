// Verifica el carrusel de etiquetas con el buscador:
// - Modo A (buscador abierto): etiquetas visibles entre barra y grid.
// - Modo B (input enfocado): el VELO las tapa (siguen visibles, no display:none),
//   los resultados aparecen DEBAJO de las etiquetas y el grid queda bajo el velo.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tags-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9231',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9231/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9231/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9231/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
// Abrir Explorar (grid) desde la lupa
await evalJs(`document.getElementById('btn-buscar').click()`);
let ready = false;
for (let i = 0; i < 40; i++) {
  ready = await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9 && !document.getElementById('tags-carrusel').classList.contains('hidden')`);
  if (ready) break;
  await sleep(400);
}
await sleep(500);
console.log('Explorar listo:', ready);

const estado = () => evalJs(`(() => {
    const tags = document.getElementById('tags-carrusel');
    const grid = document.getElementById('galeria-container');
    const panel = document.getElementById('search-panel');
    const res = document.getElementById('search-results-dropdown');
    const t = tags.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const r = res.getBoundingClientRect();
    const veil = getComputedStyle(document.getElementById('galeria-publica'), '::before');
    return JSON.stringify({
        modoBusqueda: panel.classList.contains('modo-busqueda'),
        searchEscribiendo: document.body.classList.contains('search-escribiendo'),
        searchAbierto: document.body.classList.contains('search-abierto'),
        conEtiquetas: document.body.classList.contains('search-con-etiquetas'),
        tagsDisplay: getComputedStyle(tags).display,
        tagsRect: { y: Math.round(t.y), h: Math.round(t.height) },
        gridTop: Math.round(g.y),
        gridDisplay: getComputedStyle(grid).display,
        veilOpacity: veil.opacity,
        veilZ: veil.zIndex,
        tagsZ: getComputedStyle(tags).zIndex,
        resultsRect: { y: Math.round(r.y), h: Math.round(r.height) },
        chips: tags.querySelectorAll('.tag-chip').length
    });
})()`);

console.log('\n=== MODO A (buscador abierto, sin escribir) ===');
console.log(await estado());

console.log('\n=== MODO B (toque real sobre el input → velo + etiquetas tapadas) ===');
const inputRect = await evalJs(`(() => { const el = document.getElementById('search-input'); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
console.log('input coords:', JSON.stringify(inputRect));
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: inputRect.x, y: inputRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(600);
console.log('activeElement:', await evalJs(`document.activeElement ? document.activeElement.id : 'none'`));
console.log(await estado());

// Verificar qué elemento está encima de una etiqueta (debe ser el velo/section, no la etiqueta)
const hit = await evalJs(`(() => {
    const chip = document.querySelector('.tag-chip');
    if (!chip) return 'no chips';
    const r = chip.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return el ? el.tagName + '#' + el.id + '.' + (typeof el.className === 'string' ? el.className : '') : 'null';
})()`);
console.log('elementFromPoint sobre chip (modo B):', hit);

console.log('\n=== Volver al grid (flecha <) ===');
await evalJs(`document.getElementById('search-close').click()`);
await sleep(500);
console.log(await estado());

console.log('\n=== Click en un chip (filtro sin cerrar el buscador) ===');
await evalJs(`(() => { const chip = document.querySelector('.tag-chip'); if (chip) chip.click(); return 'ok'; })()`);
await sleep(400);
console.log(await evalJs(`JSON.stringify({
    searchAbierto: document.body.classList.contains('search-abierto'),
    chipActiva: !!document.querySelector('.tag-chip.activa'),
    cardsVisibles: document.querySelectorAll('#galeria-container .obra-card').length
})`));

console.log('\n=== Cerrar buscador (lupa) ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
await sleep(400);
console.log(await estado());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
