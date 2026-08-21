// Simula "cerrar y reabrir la app" con Recordarme:
// 1) Login con recordarme → token persistente + credenciales guardadas.
// 2) Cerrar sesión de pestaña (sessionStorage + artistaData borrados, la
//    sesión del backend caducó → heartbeat 401).
// 3) Reabrir index → auto-login silencioso con las credenciales recordadas →
//    el usuario queda autenticado SIN teclear nada.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'rean-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9269',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9269/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9269/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9269/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      // Control: si __hb401 = true, el heartbeat responde 401 (sesión caducada)
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const okJson = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) {
                  if (window.__hb401) return { ok: false, status: 401, json: async () => ({ success: false }) };
                  return okJson({ ok: true });
              }
              if (u.includes('/api/artistas/login')) {
                  // Si hay token persistente (recordarme) el login acepta; si no, rechaza
                  return okJson({ success: true, artista: { id: 1, nombre_artista: 'Tester', email: 't@t.com' }, token: 'token-persistido-' + Date.now() });
              }
              if (u.includes('mis-reacciones')) return okJson({ reacciones: [] });
              if (u.includes('/obras')) return okJson({ obras: [] });
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return okJson({ usuarios: [] });
              return okJson({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(1200);

console.log('=== 1) Login con Recordarme (sin biometría) ===');
await evalJs(`document.getElementById('btn-mostrar-login').click()`);
await sleep(500);
await evalJs(`(() => {
    document.getElementById('login-email').value = 't@t.com';
    document.getElementById('login-pass').value = 'clave123';
    const chk = document.getElementById('login-recordarme');
    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await evalJs(`document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))`);
await sleep(2500);
console.log(await evalJs(`JSON.stringify({
    creds: !!localStorage.getItem('creatio_remembered_creds'),
    tokenPersistente: !!localStorage.getItem('creatio_auth_token_persist'),
    tokenSesion: !!sessionStorage.getItem('creatio_auth_token'),
    path: location.pathname
})`));

console.log('\n=== 2) Cerrar la app (pestaña): sesión de pestaña + artistaData borrados; el backend ya no reconoce la sesión (heartbeat 401) ===');
await evalJs(`(() => {
    sessionStorage.clear();
    localStorage.removeItem('artistaData');
    window.__hb401 = true;
    return 'ok';
})()`);
console.log('estado tras "cerrar":', await evalJs(`JSON.stringify({
    artistaData: !!localStorage.getItem('artistaData'),
    tokenPersistente: !!localStorage.getItem('creatio_auth_token_persist'),
    creds: !!localStorage.getItem('creatio_remembered_creds')
})`));

console.log('\n=== 3) Reabrir index.html → auto-login silencioso con Recordarme ===');
await send('Page.navigate', { url: 'http://localhost:8099/index.html' });
for (let i = 0; i < 80; i++) {
  if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break;
  await sleep(400);
}
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    enIndex: location.pathname,
    artista: JSON.parse(localStorage.getItem('artistaData') || 'null')?.nombre_artista || null,
    tokenRenovado: !!localStorage.getItem('creatio_auth_token_persist'),
    appCargada: !!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
