// Captura el error real de cropearImagen en la consola.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'upd3-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9261',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9261/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9261/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9261/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const consola = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const args = (m.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
    consola.push('[' + m.params.type + '] ' + args);
  }
  if (m.method === 'Runtime.exceptionThrown') consola.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
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
consola.length = 0;

// Probar cropearImagen directamente: copiar la lógica en el contexto
const r = await evalJs(`(async () => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1500;
    const x = c.getContext('2d');
    x.fillStyle = '#ff8800'; x.fillRect(0,0,1200,1500);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    const url = URL.createObjectURL(file);
    const img = new Image();
    const salida = {};
    img.onload = () => {
        try {
            const target = 4/5;
            const iw = img.naturalWidth, ih = img.naturalHeight;
            const imgAspect = iw / ih;
            let sw, sh, sx, sy;
            if (imgAspect > target) { sh = ih; sw = Math.round(ih * target); sx = Math.round((iw - sw) / 2); sy = 0; }
            else { sw = iw; sh = Math.round(iw / target); sx = 0; sy = Math.round((ih - sh) / 2); }
            const outH = 1080;
            const outW = Math.round(outH * target);
            const canvas = document.createElement('canvas');
            canvas.width = outW; canvas.height = outH;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
            salida.cropOK = 'dibujado ' + iw + 'x' + ih;
            canvas.toBlob((b2) => {
                salida.toBlob = b2 ? 'blob ' + b2.size + 'B' : 'null!';
                window.__diagDone = true;
            }, 'image/jpeg', 0.9);
            salida.esperando = true;
        } catch (e) { salida.error = String(e && e.message || e); window.__diagDone = true; }
    };
    img.onerror = () => { salida.error = 'img.onerror'; window.__diagDone = true; };
    img.src = url;
    return 'iniciado';
})()`);
console.log('iniciado:', r);
// Esperar a que termine el canvas.toBlob
for (let i = 0; i < 30; i++) { if (await evalJs(`window.__diagDone === true`)) break; await sleep(200); }
console.log('resultado:', await evalJs(`window.__diagResultado || '(no guardado)'`));

console.log('\n=== CONSOLA (últimas 40) ===');
consola.slice(-40).forEach(l => console.log(l));
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
