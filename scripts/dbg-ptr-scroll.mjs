// Aisla el scroll del grid durante el loading del PTR: muestrea scrollTop
// cada 50ms tras soltar y comprueba overflow-anchor computado.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'sc-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9229',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9229/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9229/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9229/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
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
let cards = 0;
for (let i = 0; i < 40; i++) { cards = await evalJs(`document.querySelectorAll('#galeria-container .obra-card').length`); if (cards >= 9) break; await sleep(300); }
await sleep(600);
console.log('overflow-anchor computado:', await evalJs(`getComputedStyle(document.getElementById('galeria-container')).overflowAnchor`));
console.log('grid con', cards, 'tarjetas');

// Registrar eventos de scroll con timestamp
await evalJs(`(() => {
    const c = document.getElementById('galeria-container');
    window.__scrollLog = [];
    const t0 = performance.now();
    c.addEventListener('scroll', () => {
        window.__scrollLog.push(Math.round(performance.now() - t0) + 'ms st=' + c.scrollTop);
    }, { passive: true });
    return 'ok';
})()`);

const touch = async (type, x, y) => {
  const params = { type, touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] };
  if (type === 'touchEnd') params.touchPoints = [];
  await send('Input.dispatchTouchEvent', params);
  if (type === 'touchStart') await sleep(60);
};

// --- PULL COMPLETO (umbral superado) ---
console.log('\n--- PULL COMPLETO ---');
await touch('touchStart', 200, 150);
await touch('touchMove', 200, 200); await sleep(30);
await touch('touchMove', 200, 260); await sleep(30);
console.log('antes de soltar scrollTop:', await evalJs(`document.getElementById('galeria-container').scrollTop`));
await touch('touchEnd', 200, 260);
await sleep(700);
console.log('scrollTop tras soltar (700ms):', await evalJs(`document.getElementById('galeria-container').scrollTop`));
console.log('log scroll:', await evalJs(`window.__scrollLog.join(' | ')`));
await sleep(1500); // termina refresh + done

// --- PULL CORTO (no supera umbral) ---
console.log('\n--- PULL CORTO ---');
await evalJs(`(() => { const c = document.getElementById('galeria-container'); c.scrollTop = 0; window.__scrollLog = []; return 'reset'; })()`);
await touch('touchStart', 200, 150);
await touch('touchMove', 200, 170); await sleep(30);
await touch('touchMove', 200, 180); await sleep(30);
await touch('touchEnd', 200, 180);
await sleep(700);
console.log('scrollTop tras pull corto (700ms):', await evalJs(`document.getElementById('galeria-container').scrollTop`));
console.log('log scroll:', await evalJs(`window.__scrollLog.join(' | ')`));

// --- PULL MEDIO SIN SOLTAR: ¿scrolla durante el arrastre? ---
console.log('\n--- PULL MEDIO (durante arrastre) ---');
await evalJs(`(() => { const c = document.getElementById('galeria-container'); c.scrollTop = 0; window.__scrollLog = []; return 'reset'; })()`);
await touch('touchStart', 200, 150);
await touch('touchMove', 200, 180); await sleep(30);
console.log('mid-pull scrollTop:', await evalJs(`document.getElementById('galeria-container').scrollTop`));
await touch('touchMove', 200, 210); await sleep(30);
console.log('mid-pull scrollTop:', await evalJs(`document.getElementById('galeria-container').scrollTop`));
await touch('touchMove', 200, 240); await sleep(30);
console.log('mid-pull scrollTop:', await evalJs(`document.getElementById('galeria-container').scrollTop`));
await touch('touchEnd', 200, 240);
await sleep(700);
console.log('scrollTop tras soltar:', await evalJs(`document.getElementById('galeria-container').scrollTop`));
console.log('log scroll:', await evalJs(`window.__scrollLog.join(' | ')`));

ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
