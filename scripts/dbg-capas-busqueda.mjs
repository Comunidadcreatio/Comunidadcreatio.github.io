// Analiza qué se ve en modo B: superposición panel/etiquetas, fondos
// reales (backgroundImage del panel, fondo del .search-panel-top) y
// elementFromPoint en varios puntos.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'capas-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9254',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9254/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9254/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9254/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9 && !document.getElementById('tags-carrusel').classList.contains('hidden')`)) break;
  await sleep(400);
}
await sleep(600);
await evalJs(`document.getElementById('btn-lupa-explorar').click()`);
await sleep(500);

console.log('=== Capas y fondos en modo B ===');
console.log(await evalJs(`(() => {
    const panel = document.getElementById('search-panel');
    const top = document.querySelector('.search-panel-top');
    const wrapper = document.querySelector('.search-input-wrapper');
    const input = document.getElementById('search-input');
    const tags = document.getElementById('tags-carrusel');
    const veil = document.getElementById('galeria-publica');
    const pr = panel.getBoundingClientRect();
    const tr = tags.getBoundingClientRect();
    const ps = getComputedStyle(panel);
    const ts = getComputedStyle(top);
    const ws = getComputedStyle(wrapper);
    const is = getComputedStyle(input);
    const points = [110, 120, 135, 145, 160, 175].map(y => {
        const el = document.elementFromPoint(210, y);
        return { y, el: el ? el.tagName + '#' + el.id + '.' + (typeof el.className === 'string' ? el.className.slice(0,30) : '') : 'null' };
    });
    return JSON.stringify({
        panelRect: { y: Math.round(pr.y), h: Math.round(pr.height), bottom: Math.round(pr.bottom) },
        panelBgImage: ps.backgroundImage.slice(0, 60),
        panelBgColor: ps.backgroundColor,
        topBg: ts.backgroundColor, topBgImage: ts.backgroundImage.slice(0, 40),
        wrapperBg: ws.backgroundColor, wrapperBorder: ws.borderColor,
        inputBg: is.backgroundColor,
        tagsRect: { y: Math.round(tr.y), bottom: Math.round(tr.bottom) },
        zs: { panel: ps.zIndex, tags: getComputedStyle(tags).zIndex, veil: getComputedStyle(veil, '::before').zIndex },
        points
    });
})()`));
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
