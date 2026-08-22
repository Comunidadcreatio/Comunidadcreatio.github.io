// Verifica el nuevo tamaño de recorte de imágenes:
// - ratio 4/5 → imagen de 1080×1350 px
// - ratio 1/1 → imagen de 1080×1080 px
// Y que el aspect-ratio detectado en tarjetas (4:5 → 0.8, 1:1 → 1) siga bien.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'ratio45-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9279',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9279/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9279/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9279/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com' }));
          localStorage.setItem('creatio_auth_token_persist', 'tokentest');
      } catch (_) {}
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
console.log('url:', await evalJs(`location.href`));
console.log('bodyLen:', await evalJs(`document.body ? document.body.innerHTML.length : -1`));
console.log('tieneAuth:', await evalJs(`!!document.getElementById('auth-container')`));
console.log('diagnostico inicial:', await evalJs(`JSON.stringify({
    caventsHub: !!document.getElementById('btn-cavents-hub'),
    crear: !!document.getElementById('btn-crear-cavent'),
    panelCrearVisible: (() => { const p = document.getElementById('panel-artista'); return p && !p.classList.contains('hidden'); })()
})`));
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
console.log('tras cavents:', await evalJs(`JSON.stringify({
    galeriaVisible: (() => { const g = document.getElementById('galeria-publica'); return g && !g.classList.contains('hidden'); })(),
    crearBtnVisible: !document.getElementById('btn-crear-cavent').classList.contains('hidden')
})`));
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);
console.log('tras crear:', await evalJs(`JSON.stringify({
    panelCrearVisible: (() => { const p = document.getElementById('panel-artista'); return p && !p.classList.contains('hidden'); })(),
    input0: !!document.getElementById('input-imagen-0')
})`));

console.log('=== 1) Subir imagen con ratio 4/5 (por defecto) → 1080×1350 ===');
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const x = c.getContext('2d');
    x.fillStyle = '#cc3344'; x.fillRect(0,0,2400,1800);
    x.fillStyle = '#ffee00'; x.fillRect(600,400,1200,1000);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    const inp = document.getElementById('input-imagen-0');
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await sleep(2200);
console.log(await evalJs(`(async () => {
    const img = document.querySelector('#carrusel-track .carrusel-slide img');
    const dim = await new Promise((res) => {
        const t = new Image();
        t.onload = () => res({ w: t.naturalWidth, h: t.naturalHeight });
        t.onerror = () => res({ error: true });
        t.src = img.src;
    });
    return JSON.stringify({ dim, es45: dim.w === 1080 && dim.h === 1350 });
})()`));

console.log('\n=== 2) Cambiar ratio a 1/1 y subir otra → 1080×1080 ===');
await evalJs(`document.querySelector('.ratio-btn[data-ratio="1/1"]').click()`);
await sleep(1500);
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 1500; c.height = 2000;
    const x = c.getContext('2d');
    x.fillStyle = '#2255cc'; x.fillRect(0,0,1500,2000);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'cuadrada.jpg', { type: 'image/jpeg' });
    const inp = document.getElementById('input-imagen-1');
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await sleep(2200);
console.log(await evalJs(`(async () => {
    const imgs = [...document.querySelectorAll('#carrusel-track .carrusel-slide img')];
    const dims = [];
    for (const el of imgs) {
        dims.push(await new Promise((res) => {
            const t = new Image();
            t.onload = () => res({ w: t.naturalWidth, h: t.naturalHeight });
            t.onerror = () => res({ error: true });
            t.src = el.src;
        }));
    }
    return JSON.stringify(dims);
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
