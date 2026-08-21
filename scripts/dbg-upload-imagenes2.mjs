// Diagnóstico 2 del pipeline de imágenes: limpia el formulario entre pruebas,
// inspecciona el FormData REAL del submit (recortado vs ORIGINAL) y la vista previa.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'upd2-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9260',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9260/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9260/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9260/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      window.__ultimoFormData = null;
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (init && init.body && typeof init.body.forEach === 'function') {
              window.__ultimoFormData = [];
              for (const [k, val] of init.body.entries()) {
                  window.__ultimoFormData.push({ k, tipo: val && val.name ? 'FILE ' + val.name + ' | ' + val.type + ' | ' + val.size + 'B' : 'TXT ' + String(val).slice(0, 30) });
              }
          }
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras') && !u.includes('reacciones') && init && init.method === 'POST') {
                  return json({ success: true, obra: { id: 99 } });
              }
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

// Inyectar una imagen en el input y devolver el estado tras el crop
const probarImagen = (nombre, tipo, genJs) => evalJs(`(async () => {
    const paso = {};
    try {
        const blob = await (${genJs});
        paso.original = blob.size + 'B ' + ${JSON.stringify(tipo)};
        const file = new File([blob], ${JSON.stringify(nombre)}, { type: ${JSON.stringify(tipo)} });
        try {
            const mod = await import('./js/panel-ui.js?v=' + Date.now());
            mod.limpiarFormularioCompleto(true);
        } catch (e) { paso.limpiaError = String(e && e.message || e); }
        await new Promise(r => setTimeout(r, 200));
        const inp = document.getElementById('input-imagen-0');
        if (!inp) { paso.error = 'sin input-imagen-0'; return JSON.stringify(paso); }
        const dt = new DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1400));
        const imgEl = document.querySelector('#carrusel-track .slide img, #carrusel-track img');
        paso.preview = imgEl ? imgEl.src.slice(0, 40) : '(sin preview)';
        paso.slides = document.querySelectorAll('#carrusel-track .slide').length;
        document.getElementById('input-titulo').value = 'Prueba diag';
        const ev = new Event('submit', { bubbles: true, cancelable: true });
        document.getElementById('obra-form').dispatchEvent(ev);
        await new Promise(r => setTimeout(r, 500));
        const fd = window.__ultimoFormData || [];
        paso.formData = fd.map(x => x.tipo);
        paso.archivoImagen0 = fd.find(f => f.k === 'imagen_0') ? fd.find(f => f.k === 'imagen_0').tipo : '(no imagen_0 en FormData)';
    } catch (e) {
        paso.error = String(e && e.message || e) + ' | stack: ' + String(e && e.stack || '').slice(0, 120);
    }
    return JSON.stringify(paso);
})()`);

const genJpeg = `new Promise(r => { const c = document.createElement('canvas'); c.width = 1200; c.height = 1500; const x = c.getContext('2d'); x.fillStyle = '#ff8800'; x.fillRect(0,0,1200,1500); c.toBlob(r, 'image/jpeg', 0.9); })`;
const genPng = `new Promise(r => { const c = document.createElement('canvas'); c.width = 2500; c.height = 3500; const x = c.getContext('2d'); x.fillStyle = 'rgba(255,0,0,0.5)'; x.fillRect(0,0,2500,3500); c.toBlob(r, 'image/png'); })`;
const genWebp = `new Promise(r => { const c = document.createElement('canvas'); c.width = 800; c.height = 1000; const x = c.getContext('2d'); x.fillStyle = '#00ff00'; x.fillRect(0,0,800,1000); c.toBlob(r, 'image/webp', 0.9); })`;
const genGrande = `new Promise(r => { const c = document.createElement('canvas'); c.width = 6000; c.height = 8000; const x = c.getContext('2d'); const g = x.createLinearGradient(0,0,6000,8000); g.addColorStop(0,'#ff0000'); g.addColorStop(1,'#0000ff'); x.fillStyle = g; x.fillRect(0,0,6000,8000); c.toBlob(r, 'image/jpeg', 0.92); })`;
const genBasura = `Promise.resolve(new Blob([new Uint8Array([255,216,255,224,0,0,0,0,123,45,67,89,90])], { type: 'image/jpeg' }))`;
const genHeic = `Promise.resolve(new Blob([new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99])], { type: 'image/heic' }))`;

console.log('=== JPEG normal ===');
console.log(await probarImagen('foto.jpg', 'image/jpeg', genJpeg));
console.log('\n=== PNG grande con alpha ===');
console.log(await probarImagen('foto.png', 'image/png', genPng));
console.log('\n=== WebP ===');
console.log(await probarImagen('foto.webp', 'image/webp', genWebp));
console.log('\n=== JPEG GIGANTE 6000x8000 ===');
console.log(await probarImagen('foto-grande.jpg', 'image/jpeg', genGrande));
console.log('\n=== HEIC (iPhone) — navegador no lo decodifica ===');
console.log(await probarImagen('IMG_123.heic', 'image/heic', genHeic));
console.log('\n=== Archivo CORRUPTO con .jpg ===');
console.log(await probarImagen('roto.jpg', 'image/jpeg', genBasura));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
