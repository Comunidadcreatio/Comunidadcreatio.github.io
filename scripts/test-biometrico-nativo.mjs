// Verifica la ruta NATIVA (APK): con window.Capacitor + plugin NativeBiometric,
// la biometría está disponible, no se registra WebAuthn, el avatar aparece y
// el reingreso usa el plugin (verifyIdentity).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'nativo-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9272',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9272/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9272/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9272/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      // Simular el entorno NATIVO (APK): window.Capacitor con el plugin
      window.__verifyLlamado = 0;
      window.Capacitor = {
          isNativePlatform: () => true,
          registerPlugin: (name, impl) => { window.__reg = name; },
          Plugins: {
              NativeBiometric: {
                  verifyIdentity: async () => { window.__verifyLlamado++; return { verified: true }; }
              }
          }
      };
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('/api/artistas/login')) return json({ success: true, artista: { id: 1, nombre_artista: 'NativoUser', email: 'n@n.com' }, token: 'token-nativo' });
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

console.log('=== 1) Entorno nativo: biometría disponible SIN WebAuthn ===');
console.log(await evalJs(`(async () => {
    const m = await import('./js/biometric-login.js?v=' + Date.now());
    return JSON.stringify({
        nativa: m.esPlataformaNativa(),
        disponible: m.biometriaDisponible(),
        registrada: m.biometriaRegistrada(),
        webauthn: !!window.PublicKeyCredential
    });
})()`));

console.log('\n=== 2) Login con Sí → no registra WebAuthn, guarda sesión ===');
await evalJs(`document.getElementById('btn-mostrar-login').click()`);
await sleep(500);
await evalJs(`(() => {
    document.getElementById('login-email').value = 'n@n.com';
    document.getElementById('login-pass').value = 'clave';
    return 'ok';
})()`);
await evalJs(`document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
await sleep(1500);
await evalJs(`document.querySelector('.confirm-btn-ok').click()`);
await sleep(3000);
console.log(await evalJs(`JSON.stringify({
    creds: !!localStorage.getItem('creatio_remembered_creds'),
    identidad: localStorage.getItem('creatio_remembered_user'),
    credWebAuthn: !!localStorage.getItem('creatio_bio_cred'), // no debe existir en nativo
    path: location.pathname
})`));

console.log('\n=== 3) Cerrar sesión → avatar visible (nativo) ===');
await evalJs(`(() => { localStorage.removeItem('artistaData'); sessionStorage.clear(); localStorage.setItem('creatio_olvido_explicito', '1'); return 'ok'; })()`);
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1200);
await evalJs(`document.getElementById('btn-mostrar-login').click()`);
await sleep(500);
console.log('avatar visible:', await evalJs(`!document.getElementById('login-biometrico-wrapper').classList.contains('hidden')`));
console.log('nombre:', await evalJs(`document.getElementById('login-bio-nombre').textContent`));

console.log('\n=== 4) Pulsar avatar → plugin verifyIdentity → login ===');
await evalJs(`document.getElementById('btn-login-biometrico').click()`);
await sleep(3000);
console.log(await evalJs(`JSON.stringify({
    verifyLlamado: window.__verifyLlamado,
    path: location.pathname,
    artista: JSON.parse(localStorage.getItem('artistaData') || 'null')?.nombre_artista || null
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
