// Test de la nueva hamburguesa: abre Mi Cuenta directo (sin popover),
// acordeón Modo con toggle claro/oscuro, y el buscador se cierra al navegar.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'ham-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9233',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9233/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9233/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9233/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', pais: 'VE' }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('sesiones-activas')) return json({ success: true, count: 1 });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras') && !u.includes('reacciones')) return json({ obras: [] });
              return json({ success: true, no_leidas: 0, usuarios: [] });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);

console.log('=== 1) Click en hamburguesa → Mi Cuenta directo ===');
await evalJs(`document.getElementById('btn-configuracion').click()`);
await sleep(700);
console.log(await evalJs(`JSON.stringify({
    popoverExiste: !!document.getElementById('header-config-menu'),
    miCuentaVisible: !document.getElementById('mi-cuenta').classList.contains('hidden'),
    miCuentaActiva: document.getElementById('mi-cuenta').classList.contains('section-entering')
})`));

console.log('\n=== 2) Acordeón Modo existe y abre ===');
console.log(await evalJs(`JSON.stringify({
    accordionModo: !!document.getElementById('accordion-modo'),
    modoContentInicial: document.getElementById('modo-content').hidden,
    botonModo: !!document.getElementById('config-dark-mode'),
    label: document.getElementById('config-dark-label') ? document.getElementById('config-dark-label').textContent : null
})`));
await evalJs(`document.getElementById('accordion-modo').click()`);
await sleep(400);
console.log('tras abrir acordeón:', await evalJs(`JSON.stringify({ expanded: document.getElementById('accordion-modo').getAttribute('aria-expanded'), hidden: document.getElementById('modo-content').hidden })`));

console.log('\n=== 3) Toggle claro/oscuro desde Mi Cuenta ===');
const antes = await evalJs(`document.documentElement.getAttribute('data-theme')`);
await evalJs(`document.getElementById('config-dark-mode').click()`);
await sleep(200);
const despues = await evalJs(`document.documentElement.getAttribute('data-theme')`);
console.log(`tema: ${antes} → ${despues} (${antes !== despues ? 'CAMBIÓ ✓' : 'SIN CAMBIO ✗'})`);

console.log('\n=== 4) El buscador se cierra al navegar a Mi Cuenta ===');
await evalJs(`document.getElementById('btn-buscar').click()`); // abre Explorar + buscador
let searchOk = false;
for (let i = 0; i < 30; i++) {
  searchOk = await evalJs(`document.body.classList.contains('search-abierto') && document.getElementById('galeria-container').classList.contains('modo-grid')`);
  if (searchOk) break;
  await sleep(300);
}
await sleep(300);
console.log('buscador abierto (Explorar):', await evalJs(`JSON.stringify({ searchAbierto: document.body.classList.contains('search-abierto'), panelVisible: !document.getElementById('search-panel').classList.contains('hidden'), grid: document.getElementById('galeria-container').classList.contains('modo-grid') })`));
await evalJs(`document.getElementById('btn-configuracion').click()`); // hamburguesa
await sleep(800);
console.log('tras hamburguesa:', await evalJs(`JSON.stringify({ searchAbierto: document.body.classList.contains('search-abierto'), miCuentaVisible: !document.getElementById('mi-cuenta').classList.contains('hidden') })`));

console.log('\n=== 5) Cerrar Mi Cuenta con la hamburguesa (toggle) ===');
await evalJs(`document.getElementById('btn-configuracion').click()`);
await sleep(600);
console.log(await evalJs(`JSON.stringify({ miCuentaVisible: !document.getElementById('mi-cuenta').classList.contains('hidden') })`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
