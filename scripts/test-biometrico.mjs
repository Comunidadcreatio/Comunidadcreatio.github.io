// Verifica el NUEVO flujo:
// 1) Primer login → la app pregunta "¿Guardar tu sesión en este dispositivo?" (Sí/No).
// 2) "Sí" → se guarda identidad + credenciales + biometría; redirige a index.
// 3) Cerrar sesión manualmente → al volver al auth aparece el avatar + nombre.
// 4) Pulsar el avatar → pide biometría (autenticador virtual) → login automático.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'bio3-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9270',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9270/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9270/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9270/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
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
              if (u.includes('/api/artistas/heartbeat')) {
                  // Después del cierre de sesión manual, el backend rechaza (401)
                  if (window.__hb401) return { ok: false, status: 401, json: async () => ({ success: false }) };
                  return json({ ok: true });
              }
              if (u.includes('/api/artistas/login')) return json({ success: true, artista: { id: 1, nombre_artista: 'Tester', email: 't@t.com', foto_perfil: '' }, token: 'token-' + Date.now() });
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

console.log('=== 1) Primer login → aparece la pregunta Sí/No ===');
await evalJs(`document.getElementById('btn-mostrar-login').click()`);
await sleep(500);
console.log('sin checkbox recordarme:', await evalJs(`!document.getElementById('login-recordarme')`));
await evalJs(`(() => {
    document.getElementById('login-email').value = 't@t.com';
    document.getElementById('login-pass').value = 'clave123';
    return 'ok';
})()`);
await evalJs(`document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
await sleep(1500);
console.log('diálogo visible:', await evalJs(`!!document.querySelector('.confirm-dialog')`));
console.log('mensaje:', await evalJs(`document.querySelector('.confirm-message')?.textContent`));

console.log('\n=== 2) Pulsar "Sí" → guarda sesión + biometría, redirige ===');
await evalJs(`document.querySelector('.confirm-btn-ok').click()`);
await sleep(3500);
console.log(await evalJs(`JSON.stringify({
    identidad: localStorage.getItem('creatio_remembered_user') || null,
    creds: !!localStorage.getItem('creatio_remembered_creds'),
    bio: !!localStorage.getItem('creatio_bio_cred'),
    tokenPersistente: !!localStorage.getItem('creatio_auth_token_persist'),
    path: location.pathname
})`));

console.log('\n=== 3) Cerrar sesión manualmente → avatar + nombre en el auth ===');
await evalJs(`(() => {
    window.__hb401 = true;
    localStorage.removeItem('artistaData');
    sessionStorage.clear();
    localStorage.setItem('creatio_olvido_explicito', '1'); // equivalente a logout()
    return 'ok';
})()`);
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1200);
await evalJs(`document.getElementById('btn-mostrar-login').click()`);
await sleep(500);
console.log('botón avatar visible:', await evalJs(`!document.getElementById('login-biometrico-wrapper').classList.contains('hidden')`));
console.log('nombre mostrado:', await evalJs(`document.getElementById('login-bio-nombre').textContent`));

console.log('\n=== 4) Pulsar el avatar → biometría (autenticador virtual) → login ===');
await evalJs(`document.getElementById('btn-login-biometrico').click()`);
await sleep(3500);
console.log(await evalJs(`JSON.stringify({ path: location.pathname, artista: JSON.parse(localStorage.getItem('artistaData') || 'null')?.nombre_artista || null })`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
