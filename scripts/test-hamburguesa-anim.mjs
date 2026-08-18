// Verifica la animación de aparición de la hamburguesa + desliz de la campana.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'anim-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9237',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9237/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9237/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9237/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

console.log('=== Entrar al perfil (hamburguesa debe aparecer animada) ===');
await evalJs(`document.getElementById('btn-perfil-sidebar').click()`);
// Esperar a que la transición de sección termine y la hamburguesa se muestre
let vis = false;
for (let i = 0; i < 30; i++) {
  vis = await evalJs(`!document.getElementById('btn-configuracion').classList.contains('hidden')`);
  if (vis) break;
  await sleep(50);
}
await sleep(40); // justo al inicio de la animación de la hamburguesa
console.log('inicio animación:', await evalJs(`(() => {
    const ham = document.getElementById('btn-configuracion');
    const campana = document.getElementById('btn-notificaciones');
    return JSON.stringify({
        hamAnim: ham.getAnimations().map(a => a.animationName),
        hamOpacity: getComputedStyle(ham).opacity,
        campanaAnim: campana.getAnimations().map(a => a.animationName),
        campanaX: Math.round(campana.getBoundingClientRect().left)
    });
})()`));
await sleep(500); // animación terminada
console.log('a +500ms:', await evalJs(`(() => {
    const ham = document.getElementById('btn-configuracion');
    const campana = document.getElementById('btn-notificaciones');
    return JSON.stringify({
        hamOpacity: getComputedStyle(ham).opacity,
        campanaTransform: getComputedStyle(campana).transform,
        campanaX: Math.round(campana.getBoundingClientRect().left)
    });
})()`));
await sleep(800); // estado totalmente estable
console.log('a +1300ms (estable):', await evalJs(`getComputedStyle(document.getElementById('btn-notificaciones')).transform`));

console.log('\n=== Salir (oculta) y volver a entrar (debe re-animar) ===');
await evalJs(`(() => {
    window.__animStarts = [];
    const ham = document.getElementById('btn-configuracion');
    ham.addEventListener('animationstart', (e) => window.__animStarts.push(e.animationName));
    return 'ok';
})()`);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(700);
await evalJs(`document.getElementById('btn-perfil-sidebar').click()`); // volver al perfil
let vis2 = false;
for (let i = 0; i < 30; i++) {
  vis2 = await evalJs(`!document.getElementById('btn-configuracion').classList.contains('hidden')`);
  if (vis2) break;
  await sleep(50);
}
await sleep(40);
console.log('re-aparición anim:', await evalJs(`JSON.stringify({ starts: window.__animStarts, actuales: document.getElementById('btn-configuracion').getAnimations().map(a => a.animationName) })`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
