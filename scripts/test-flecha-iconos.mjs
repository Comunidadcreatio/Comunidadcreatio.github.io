// Test del icono que se convierte en flecha de volver (hamburguesa y "+").
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'arrow-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9242',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9242/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9242/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9242/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
    const ham = document.getElementById('btn-configuracion');
    const plus = document.getElementById('btn-crear-cavent');
    const flecha = (b) => b.classList.contains('modo-flecha') && !b.querySelector('.icono-flecha').classList.contains('hidden') && getComputedStyle(b.querySelector('.icono-flecha')).display !== 'none';
    return JSON.stringify({
        ham: (ham.classList.contains('hidden') ? 'oculto' : (ham.classList.contains('modo-flecha') ? 'FLECHA' : 'hamburguesa')),
        plus: (plus.classList.contains('hidden') ? 'oculto' : (plus.classList.contains('modo-flecha') ? 'FLECHA' : 'mas')),
        seccion: [...document.querySelectorAll('main section')].find(s => !s.classList.contains('hidden'))?.id || 'none'
    });
})()`);

console.log('=== 1) Perfil → hamburguesa → Mi Cuenta (flecha) → volver ===');
await evalJs(`document.getElementById('btn-perfil-sidebar').click()`);
await sleep(800);
console.log('perfil:', await estado());
await evalJs(`document.getElementById('btn-configuracion').click()`);
await sleep(800);
console.log('tras hamburguesa (Mi Cuenta + flecha):', await estado());
await evalJs(`document.getElementById('btn-configuracion').click()`); // la flecha
await sleep(800);
console.log('tras flecha (vuelve al perfil):', await estado());

console.log('\n=== 2) Cavents → "+" → Crear (flecha) → volver ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
console.log('cavents:', await estado());
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);
console.log('tras "+" (Crear + flecha):', await estado());
await evalJs(`document.getElementById('btn-crear-cavent').click()`); // la flecha
await sleep(900);
console.log('tras flecha (vuelve a Cavents):', await estado());

console.log('\n=== 3) Desde el GRID (Explorar) → "+" → volver al grid ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
let gridOk = false;
for (let i = 0; i < 30; i++) { gridOk = await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid')`); if (gridOk) break; await sleep(100); }
await sleep(400);
console.log('en grid:', await estado());
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);
console.log('tras "+" (Crear):', await estado());
await evalJs(`document.getElementById('btn-crear-cavent').click()`); // flecha
await sleep(900);
console.log('tras flecha (¿vuelve al grid?):', await estado());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
