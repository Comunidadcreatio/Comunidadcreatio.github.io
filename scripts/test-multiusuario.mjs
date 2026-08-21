// Reproduce el escenario del usuario: A guarda sesión → B inicia (¿pregunta?),
// B dice No (A se conserva) → A vuelve a iniciar (misma cuenta, sin pregunta).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'multi-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9273',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9273/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9273/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9273/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('/api/artistas/login')) {
                  const body = JSON.parse(init.body || '{}');
                  const email = (body.email || '').toLowerCase();
                  const nombre = email.startsWith('b@') ? 'UsuarioB' : 'UsuarioA';
                  return json({ success: true, artista: { id: email.startsWith('b@') ? 2 : 1, nombre_artista: nombre, email }, token: 'tok-' + email });
              }
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
await sleep(1200);

const login = async (email, pass) => {
  await evalJs(`document.getElementById('btn-mostrar-login').click()`);
  await sleep(400);
  await evalJs(`(() => {
      document.getElementById('login-email').value = ${JSON.stringify(email)};
      document.getElementById('login-pass').value = ${JSON.stringify(pass)};
      return 'ok';
  })()`);
  await evalJs(`document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
  await sleep(1500);
};
const responder = async (boton) => {
  const hay = await evalJs(`!!document.querySelector('.confirm-dialog')`);
  if (hay) await evalJs(`document.querySelector('.confirm-btn-${boton}').click()`);
  await sleep(3000);
  return hay;
};
const salir = () => evalJs(`(() => { localStorage.removeItem('artistaData'); sessionStorage.clear(); localStorage.setItem('creatio_olvido_explicito', '1'); return 'ok'; })()`);
const estado = () => evalJs(`JSON.stringify({
    identidad: JSON.parse(localStorage.getItem('creatio_remembered_user') || 'null'),
    creds: !!localStorage.getItem('creatio_remembered_creds')
})`);

console.log('=== 1) Login UsuarioA → pregunta → Sí (guarda A) ===');
await login('a@a.com', 'passA');
const pregA = await responder('ok');
console.log('preguntó:', pregA, '| estado:', await estado());

console.log('\n=== 2) Cerrar sesión y login UsuarioB → DEBE preguntar (cuenta distinta) ===');
await salir();
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1200);
await login('b@b.com', 'passB');
const pregB = await responder('cancel'); // B dice "No"
console.log('preguntó a B:', pregB, '| estado (A debe conservarse):', await estado());

console.log('\n=== 3) Cerrar sesión y volver a login UsuarioA → NO debe preguntar (misma cuenta) ===');
await salir();
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1200);
await login('a@a.com', 'passA');
const pregA2 = await responder('ok');
console.log('preguntó a A otra vez:', pregA2, '(esperado: false) | estado:', await estado());

console.log('\n=== 4) Si B dijera Sí, reemplazaría a A ===');
await salir();
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1200);
await login('b@b.com', 'passB');
const pregB2 = await responder('ok'); // B dice "Sí"
console.log('B dijo Sí → estado (A reemplazado por B):', await estado());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
