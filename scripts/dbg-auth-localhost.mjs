// Diagnóstico: ¿por qué auth-logic no funciona vía localhost? Captura consola.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'authd-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9266',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9266/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9266/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9266/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push('[CONSOLE.' + m.params.type + '] ' + (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ').slice(0, 250));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
// Activar WebAuthn + autenticador virtual (el factor que parece romper el flujo)
await send('WebAuthn.enable');
await send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
});
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('/api/artistas/login')) return json({ success: true, artista: { id: 1, nombre_artista: 'Tester', email: 't@t.com' }, token: 'fake-token' });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json({ obras: [] });
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1000);
logs.length = 0;

// ¿Cargaron los módulos?
console.log('módulos cargados:', await evalJs(`performance.getEntriesByType('resource').filter(r => r.name.includes('.js')).map(r => r.name.split('/').pop() + (r.responseStatus ? ' (' + r.responseStatus + ')' : '')).join(', ')`));
console.log('hay listener submit:', await evalJs(`(() => { const f = document.getElementById('login-form'); return typeof f.onsubmit === 'function' ? 'onsubmit' : 'listeners?'; })()`));
// Probar abrir el form y enviar
await evalJs(`document.getElementById('btn-mostrar-login').click()`);
await sleep(300);
await evalJs(`(() => {
    document.getElementById('login-email').value = 't@t.com';
    document.getElementById('login-pass').value = 'clave123';
    document.getElementById('login-recordarme').checked = true;
    document.getElementById('login-recordarme').dispatchEvent(new Event('change'));
    return 'ok';
})()`);
await sleep(200);
console.log('fila bio:', await evalJs(`document.getElementById('login-biometria-row').style.display`));
await evalJs(`document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
await sleep(2000);
console.log('creds:', await evalJs(`!!localStorage.getItem('creatio_remembered_creds')`));
console.log('--- CONSOLA ---');
logs.forEach(l => console.log(l));
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
