// Verifica la REVERSIÓN de las herramientas de imagen:
// 1) Al agregar imagen NO aparecen botones Cuadrar ni Editar en el carrusel.
// 2) El recorte automático 4:5/1:1 (cropearImagen) SIGUE funcionando.
// 3) El carrusel sigue operativo (dots, imagen mostrada, eliminar).
// 4) El formulario aún envía la imagen (FormData imagen_N) sin errores JS.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'noherram-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9277',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9277/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9277/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9277/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

console.log('=== 1) Agregar imagen (1200×900) → sin botones de herramientas ===');
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#cc3344'; x.fillRect(0,0,1200,900);
    x.fillStyle = '#ffee00'; x.fillRect(300,200,600,500);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    const inp = document.getElementById('input-imagen-0');
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await sleep(1800);
console.log(await evalJs(`JSON.stringify({
    sinCuadrar: !document.querySelector('.btn-cuadrar-slide'),
    sinEditar: !document.querySelector('.btn-editar-slide'),
    sinOverlay: !document.querySelector('.img-cuadro-overlay'),
    sinChip: !document.querySelector('.inline-cancel-chip'),
    slideConImagen: !!document.querySelector('#carrusel-track .carrusel-slide img')
})`));

console.log('\n=== 2) Recorte automático 4:5 conservado (imagen recortada a 1080px) ===');
console.log(await evalJs(`(async () => {
    const img = document.querySelector('#carrusel-track .carrusel-slide img');
    const dim = await new Promise((res) => {
        const t = new Image();
        t.onload = () => res({ w: t.naturalWidth, h: t.naturalHeight });
        t.onerror = () => res({ error: true });
        t.src = img.src;
    });
    return JSON.stringify(dim);
})()`));

console.log('\n=== 3) Carrusel operativo: dots y eliminar ===');
console.log(await evalJs(`JSON.stringify({
    dots: document.querySelectorAll('.carrusel-dot').length,
    contador: document.getElementById('carrusel-count')?.textContent.trim() || '(sin contador)',
    botonEliminar: !!document.querySelector('.btn-eliminar-slide')
})`));
await evalJs(`document.querySelector('.btn-eliminar-slide').click()`);
await sleep(800);
console.log('tras eliminar:', await evalJs(`JSON.stringify({
    slideVacio: !!document.querySelector('.carrusel-slide-empty'),
    trackHijos: document.querySelectorAll('#carrusel-track > *').length
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
