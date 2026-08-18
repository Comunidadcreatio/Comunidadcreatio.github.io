// Test del icono Problogs: alterna Problogs ↔ Cavents.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'pro-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9244',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9244/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9244/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9244/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
    const p = document.getElementById('problogs');
    const pb = document.getElementById('btn-problogs');
    const plus = document.getElementById('btn-crear-cavent');
    const ham = document.getElementById('btn-configuracion');
    return JSON.stringify({
        problogsVisible: !p.classList.contains('hidden'),
        iconoProblogsVisible: !pb.classList.contains('hidden'),
        placeholder: !!p.querySelector('.problogs-placeholder'),
        plus: (plus.classList.contains('hidden') ? 'oculto' : 'visible'),
        ham: (ham.classList.contains('hidden') ? 'oculto' : 'visible'),
        seccion: [...document.querySelectorAll('main section')].find(s => !s.classList.contains('hidden'))?.id || 'none'
    });
})()`);

console.log('=== 1) Icono Problogs presente y visible ===');
console.log(await estado());

console.log('\n=== 2) Presionar Problogs desde el inicio → se abre Problogs ===');
await evalJs(`document.getElementById('btn-problogs').click()`);
await sleep(800);
console.log(await estado());

console.log('\n=== 3) Presionar de nuevo → vuelve a Cavents ===');
await evalJs(`document.getElementById('btn-problogs').click()`);
await sleep(900);
console.log(await estado());

console.log('\n=== 4) Desde Cavents → Problogs → de nuevo → Cavents ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
console.log('en Cavents:', await estado());
await evalJs(`document.getElementById('btn-problogs').click()`);
await sleep(800);
console.log('tras Problogs:', await estado());
await evalJs(`document.getElementById('btn-problogs').click()`);
await sleep(900);
console.log('de nuevo:', await estado());

console.log('\n=== 5) Desde perfil → Problogs → de nuevo → Cavents ===');
await evalJs(`document.getElementById('btn-perfil-sidebar').click()`);
await sleep(800);
console.log('en perfil:', await estado());
await evalJs(`document.getElementById('btn-problogs').click()`);
await sleep(800);
console.log('tras Problogs:', await estado());
await evalJs(`document.getElementById('btn-problogs').click()`);
await sleep(900);
console.log('de nuevo:', await estado());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
