// Test: el "+" solo aparece en Cavents (carrusel), NO en Explorar (grid).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'plusg-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9243',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9243/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9243/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9243/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('sesiones-activas')) return json({ success: true, count: 1 });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json({ obras: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);

const estado = () => evalJs(`(() => {
    const plus = document.getElementById('btn-crear-cavent');
    const c = document.getElementById('galeria-container');
    return JSON.stringify({
        plus: (plus.classList.contains('hidden') ? 'oculto' : 'visible'),
        modoGrid: c.classList.contains('modo-grid')
    });
})()`);

console.log('=== 1) Cavents (carrusel) → "+" visible ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
console.log(await estado());

console.log('\n=== 2) Lupa → Explorar (grid) → "+" OCULTO ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 30; i++) { if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid')`)) break; await sleep(100); }
await sleep(500);
console.log(await estado());

console.log('\n=== 3) Volver a Cavents (carrusel) → "+" vuelve ===');
await evalJs(`document.getElementById('search-close').click()`); // flecha < del buscador
await sleep(500);
await evalJs(`document.getElementById('btn-cavents-hub').click()`); // abrir carrusel de nuevo
await sleep(900);
console.log(await estado());

console.log('\n=== 4) Desde Explorar, el "+" no abre Crear (no está) ===');
console.log('plus existe:', await evalJs(`!!document.getElementById('btn-crear-cavent')`), '| hidden:', await evalJs(`document.getElementById('btn-crear-cavent').classList.contains('hidden')`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
