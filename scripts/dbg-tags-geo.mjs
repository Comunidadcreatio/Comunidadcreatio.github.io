// Mide la geometría del carrusel de etiquetas: rect del contenedor, chips,
// padding, scroll y qué chips quedan cortados en los laterales.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tagsg-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9232',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9232/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9232/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9232/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
const TAG_COUNT = parseInt(process.argv[3] || '3', 10);
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com' }));
      const SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#888"/></svg>');
      const TAGS = Array.from({ length: ${TAG_COUNT} }, (_, i) => 'etiqueta' + (i + 1)).join(',');
      const obras = Array.from({ length: 12 }, (_, i) => ({
          id: i + 1, titulo: 'Obra ' + (i + 1), artista: 'A' + (i + 1),
          precio: 10, views_count: 1, likes_count: 0, comments_count: 0,
          imagen_url: SVG, etiquetas: TAGS, artista_user_id: 1
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
await sleep(500);

const dump = () => evalJs(`(() => {
    const t = document.getElementById('tags-carrusel');
    const cs = getComputedStyle(t);
    const tr = t.getBoundingClientRect();
    const chips = [...t.querySelectorAll('.tag-chip')].map(c => { const r = c.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), text: c.textContent.trim().slice(0, 16) }; });
    return JSON.stringify({
        viewport: innerWidth,
        contRect: { left: Math.round(tr.left), right: Math.round(tr.right), w: Math.round(tr.width) },
        paddingL: cs.paddingLeft,
        paddingR: cs.paddingRight,
        scrollLeft: Math.round(t.scrollLeft),
        scrollWidth: t.scrollWidth,
        clientWidth: t.clientWidth,
        desborda: t.classList.contains('desborda'),
        mask: cs.webkitMaskImage || cs.maskImage || 'none',
        chips: chips.slice(0, 6),
        totalChips: chips.length
    });
})()`);

console.log('=== SCROLL POSICIÓN INICIAL (scrollLeft=0) ===');
console.log(await dump());

console.log('\n=== SCROLL AL FINAL ===');
await evalJs(`(() => { const t = document.getElementById('tags-carrusel'); t.scrollLeft = t.scrollWidth; return t.scrollLeft; })()`);
await sleep(300);
console.log(await dump());

console.log('\n=== SCROLL DE VUELTA AL INICIO (snap) ===');
await evalJs(`(() => { const t = document.getElementById('tags-carrusel'); t.scrollLeft = 0; return 'ok'; })()`);
await sleep(300);
console.log(await dump());

ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
