// Verifica el editor de imágenes en la creación de Cavents:
// 1) Se agrega una imagen → aparece el botón "Editar".
// 2) Se abre el editor con los 7 controles (brillo, contraste, saturación,
//    ambiente, sombras, calidez, zonas brillantes).
// 3) Ajustar brillo → aplicar → la imagen del carrusel se reemplaza por la
//    editada (archivo JPEG distinto al original).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'editor-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9274',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9274/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9274/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9274/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

console.log('=== 1) Agregar imagen → botón Editar visible ===');
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 1000;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0,0,800,1000);
    g.addColorStop(0, '#2233aa'); g.addColorStop(1, '#ffaa22');
    x.fillStyle = g; x.fillRect(0,0,800,1000);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    const inp = document.getElementById('input-imagen-0');
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await sleep(1800);
console.log('botón editar presente:', await evalJs(`!!document.querySelector('.btn-editar-slide:not(.btn-cuadrar-slide)')`));

console.log('\n=== 2) Abrir editor → 7 controles ===');
await evalJs(`document.querySelector('.btn-editar-slide:not(.btn-cuadrar-slide)').click()`);
await sleep(1000);
console.log(await evalJs(`JSON.stringify({
    overlay: !!document.querySelector('.img-editor-overlay'),
    sliders: [...document.querySelectorAll('.img-editor-row label')].map(l => l.textContent)
})`));

console.log('\n=== 3) Ajustar brillo +40 → aplicar → imagen reemplazada ===');
await evalJs(`(() => {
    const s = document.getElementById('ie-brillo');
    s.value = 40;
    s.dispatchEvent(new Event('input'));
    return 'ok';
})()`);
await sleep(400);
await evalJs(`document.getElementById('ie-apply').click()`);
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    editorCerrado: !document.querySelector('.img-editor-overlay'),
    previewSrc: document.querySelector('#carrusel-track .carrusel-slide img') ? document.querySelector('#carrusel-track .carrusel-slide img').src.slice(0, 25) : 'sin img',
    esObjectUrl: document.querySelector('#carrusel-track .carrusel-slide img') ? document.querySelector('#carrusel-track .carrusel-slide img').src.startsWith('blob:') : false
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
