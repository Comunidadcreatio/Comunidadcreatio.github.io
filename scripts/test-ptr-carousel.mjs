// Verifica el PTR en modo CARRUSEL (Global Cavents): círculo arriba sin hueco
// y sin superposición durante la carga, y sin scroll residual del snap.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'car-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9230',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9230/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9230/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9230/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const obras = Array.from({ length: 4 }, (_, i) => ({
          id: i + 1, titulo: 'Obra ' + (i + 1), artista: 'A' + (i + 1),
          precio: 10, views_count: 1, likes_count: 0, comments_count: 0,
          imagen_url: SVG, etiquetas: 'x', artista_user_id: 1
      }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras') && !u.includes('reacciones')) {
                  await new Promise(r => setTimeout(r, 1200));
                  return json({ obras });
              }
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(1000);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
for (let i = 0; i < 40; i++) { if ((await evalJs(`document.querySelectorAll('#galeria-container .obra-card').length`)) >= 4) break; await sleep(300); }
await sleep(600);
console.log('modo carrusel:', await evalJs(`!document.getElementById('galeria-container').classList.contains('modo-grid')`));

const st = () => evalJs(`(() => {
    const c = document.getElementById('galeria-container');
    const el = document.querySelector('.pull-refresh-indicator');
    const cr = el ? el.querySelector('.ptr-circle').getBoundingClientRect() : null;
    const card = c.querySelector('.obra-card');
    const cardR = card ? card.getBoundingClientRect() : null;
    return JSON.stringify({
        classes: el ? el.className : 'NO-IND',
        scrollTop: c.scrollTop,
        snap: getComputedStyle(c).scrollSnapType,
        indH: el ? Math.round(el.getBoundingClientRect().height) : 0,
        circuloY: cr ? Math.round(cr.y) : null,
        circuloH: cr ? Math.round(cr.height) : null,
        cardY: cardR ? Math.round(cardR.y) : null,
        overflow: c.style.overflow
    });
})()`);

const touch = async (type, x, y) => {
  const params = { type, touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] };
  if (type === 'touchEnd') params.touchPoints = [];
  await send('Input.dispatchTouchEvent', params);
  if (type === 'touchStart') await sleep(60);
};

console.log('\n--- PULL COMPLETO (carrusel) ---');
await touch('touchStart', 200, 400);
await touch('touchMove', 200, 450); await sleep(30);
await touch('touchMove', 200, 510); await sleep(30);
console.log('antes de soltar:', await st());
await touch('touchEnd', 200, 510); await sleep(80);
console.log('A3 loading:', await st());
await sleep(600);
console.log('A3b loading asentado:', await st());
await sleep(1500);
console.log('A4 tras refrescar:', await st());

// --- PULL CORTO (carrusel) ---
console.log('\n--- PULL CORTO (carrusel) ---');
await evalJs(`(() => { const c = document.getElementById('galeria-container'); c.scrollTop = 0; return 'ok'; })()`);
await touch('touchStart', 200, 400);
await touch('touchMove', 200, 420); await sleep(30);
await touch('touchMove', 200, 430); await sleep(30);
await touch('touchEnd', 200, 430); await sleep(800);
console.log('tras pull corto:', await st());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
