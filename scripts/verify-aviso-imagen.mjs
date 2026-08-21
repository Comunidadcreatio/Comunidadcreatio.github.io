// Verifica que al añadir una imagen no procesable (HEIC/corrupta) aparece el
// aviso warning, y que las imágenes normales NO lo muestran.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'aviso-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9263',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9263/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9263/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9263/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json({ obras: [] });
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);

// Limpiar toasts entre pruebas
const limpiar = () => evalJs(`(() => { document.querySelectorAll('.notification').forEach(n => n.remove()); return 'ok'; })()`);
const avisos = () => evalJs(`JSON.stringify([...document.querySelectorAll('.notification.warning .notification-message')].map(n => n.textContent.slice(0, 60)))`);

const inyectar = (nombre, tipo, genJs) => evalJs(`(async () => {
    const blob = await (${genJs});
    const file = new File([blob], ${JSON.stringify(nombre)}, { type: ${JSON.stringify(tipo)} });
    const inp = document.getElementById('input-imagen-0');
    const dt = new DataTransfer();
    dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    return 'ok';
})()`);

const genJpeg = `new Promise(r => { const c = document.createElement('canvas'); c.width = 800; c.height = 1000; const x = c.getContext('2d'); x.fillStyle = '#ff8800'; x.fillRect(0,0,800,1000); c.toBlob(r, 'image/jpeg', 0.9); })`;
const genHeic = `Promise.resolve(new Blob([new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99])], { type: 'image/heic' }))`;

console.log('=== 1) Imagen JPEG normal → NO debe haber aviso ===');
await limpiar();
await inyectar('foto.jpg', 'image/jpeg', genJpeg);
console.log('avisos:', await avisos());
await limpiar();

console.log('\n=== 2) Imagen HEIC (no decodificable) → DEBE aparecer el aviso ===');
await inyectar('IMG_123.heic', 'image/heic', genHeic);
console.log('avisos:', await avisos());

console.log('\n=== 3) Tras un JPG normal de nuevo → aviso anterior ya no está ===');
await limpiar();
await inyectar('otra.jpg', 'image/jpeg', genJpeg);
console.log('avisos:', await avisos());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
