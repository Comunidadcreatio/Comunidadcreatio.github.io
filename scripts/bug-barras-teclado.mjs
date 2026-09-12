// Verifica si las barras de creación (pasos de Cavents, pestañas y barra de
// Problogs) se descolocan cuando llega un resize con el nav OCULTO (teclado
// abierto): positionAll mide el rect del nav, y oculto su top es 0.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'bugbar-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9301',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9301/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9301/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9301/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || '').slice(0, 200)); return null; }
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json([]);
              if (u.includes('/problogs')) return json({ success: true, publicaciones: [], total: 0 });
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1200);

const leer = `JSON.stringify({
    navVisible: (() => { const n = document.getElementById('toggle-panel'); return !!n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0; })(),
    navTop: Math.round((document.getElementById('toggle-panel')||{getBoundingClientRect:()=>({top:0})}).getBoundingClientRect().top),
    innerHeight: window.innerHeight,
    stepBarBottom: document.getElementById('obra-step-bar')?.style.bottom || '(sin fijar)',
    tabsBottom: document.getElementById('crear-tabs')?.style.bottom || '(sin fijar)',
    fondoBottom: document.getElementById('crear-fondo')?.style.bottom || '(sin fijar)',
    fondoHeight: document.getElementById('crear-fondo')?.style.height || '(sin fijar)'
})`;

console.log('=== A) Con el nav VISIBLE (estado normal) ===');
console.log(await evalJs(`(() => {
    document.getElementById('panel-artista')?.classList.remove('hidden');
    window.dispatchEvent(new Event('resize'));
    return ${leer};
})()`));
await sleep(300);

console.log('\n=== B) Simular teclado abierto (chat.js oculta el nav) + resize ===');
console.log(await evalJs(`(() => {
    document.body.classList.add('teclado-abierto');   // lo hace chat.js globalmente
    window.dispatchEvent(new Event('resize'));         // WebView que redimensiona el layout
    return ${leer};
})()`));
await sleep(400);

console.log('\n=== C) Al cerrar el teclado y volver a medir ===');
console.log(await evalJs(`(() => {
    document.body.classList.remove('teclado-abierto');
    window.dispatchEvent(new Event('resize'));
    return ${leer};
})()`));
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
