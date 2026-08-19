// Verifica: (1) fila superior de la tarjeta SIN relleno en ambos modos,
// (2) iconos de métricas (lupa/vistos/comentarios/likes) NEGROS en claro y
// BLANCOS en oscuro.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'cardv-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9250',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9250/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9250/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9250/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const obras = Array.from({ length: 3 }, (_, i) => ({
          id: i + 1, titulo: 'Obra ' + (i + 1), artista: 'A' + (i + 1),
          precio: 10, views_count: 5, likes_count: 2, comments_count: 3,
          imagen_url: SVG, etiquetas: '', artista_user_id: 1
      }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json({ obras });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);
// Abrir el carrusel de Cavents (nav inferior)
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
let cards = 0;
for (let i = 0; i < 40; i++) {
  cards = await evalJs(`document.querySelectorAll('.obra-card').length`);
  if (cards >= 3) break;
  await sleep(400);
}
await sleep(600);
console.log('tarjetas en carrusel:', cards);

const dump = () => evalJs(`(() => {
    const row = document.querySelector('.obra-artista-row');
    const metrica = document.querySelector('.obra-metricas-bar');
    const item = document.querySelector('.obra-metricas-bar .metrica-item');
    const svg = document.querySelector('.obra-metricas-bar .metrica-item svg');
    const btn = document.querySelector('.btn-ver-detalles');
    return JSON.stringify({
        theme: document.documentElement.getAttribute('data-theme'),
        artistaRowBg: row ? getComputedStyle(row).backgroundColor : 'sin fila',
        metricasBg: metrica ? getComputedStyle(metrica).backgroundColor : 'sin barra',
        iconoColor: svg ? getComputedStyle(svg).color : 'sin svg',
        itemColor: item ? getComputedStyle(item).color : 'sin item',
        btnColor: btn ? getComputedStyle(btn).color : 'sin btn',
        btnBorder: btn ? getComputedStyle(btn).borderColor : 'sin btn',
        hayLupa: btn ? !!btn.querySelector('.icon-lupa, svg') : false
    });
})()`);

console.log('=== MODO CLARO ===');
await evalJs(`document.documentElement.setAttribute('data-theme', 'light')`);
await sleep(400);
console.log(await dump());

console.log('\n=== MODO OSCURO ===');
await evalJs(`document.documentElement.setAttribute('data-theme', 'dark')`);
await sleep(400);
console.log(await dump());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
