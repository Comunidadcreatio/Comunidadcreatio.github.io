// Reproduce el flujo EXACTO de test-tags.mjs (modo B → flecha < → click chip)
// e inspecciona por qué el conteo de tarjetas difiere del clic directo.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tagflow-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9236',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9236/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9236/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9236/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
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
      // Instrumentación: registra cada llamada a filtrarGridPorEtiqueta
      window.__filtros = [];
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 12 && !document.getElementById('tags-carrusel').classList.contains('hidden')`)) break;
  await sleep(400);
}
await sleep(500);
// Instrumentar filtrarGridPorEtiqueta (módulo ES import — monkey-patch el contenedor no sirve,
// así que observamos el DOM: contamos tarjetas con el mismo dataset de etiquetas)
console.log('chips:', await evalJs(`[...document.querySelectorAll('.tag-chip')].map(c => c.textContent.trim() + '|' + c.dataset.tag)`));
console.log('cards antes:', await evalJs(`document.querySelectorAll('#galeria-container .obra-card').length`));

// === Flujo exacto de test-tags.mjs ===
const inputRect = await evalJs(`(() => { const el = document.getElementById('search-input'); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: inputRect.x, y: inputRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(600);
console.log('modo B: activeElement =', await evalJs(`document.activeElement ? document.activeElement.id : 'none'`));
await evalJs(`document.getElementById('search-close').click()`);
await sleep(500);
console.log('tras flecha <: modoBusqueda =', await evalJs(`document.getElementById('search-panel').classList.contains('modo-busqueda')`));
console.log('  chips:', await evalJs(`[...document.querySelectorAll('.tag-chip')].map(c => c.textContent.trim() + '|' + c.dataset.tag)`));
console.log('  cards:', await evalJs(`document.querySelectorAll('#galeria-container .obra-card').length`));

await evalJs(`(() => { const chip = document.querySelector('.tag-chip'); if (chip) chip.click(); return 'ok'; })()`);
let t0 = Date.now();
for (const target of [200, 400, 700]) {
  const wait = target - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  console.log('t+' + (Date.now() - t0) + 'ms:', await evalJs(`JSON.stringify({
      cards: document.querySelectorAll('#galeria-container .obra-card').length,
      chipActiva: !!document.querySelector('.tag-chip.activa'),
      activaText: document.querySelector('.tag-chip.activa') ? document.querySelector('.tag-chip.activa').dataset.tag : null,
      filtrando: document.getElementById('galeria-container').classList.contains('grid-filtrando')
  })`));
}
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
