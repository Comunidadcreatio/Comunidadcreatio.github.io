// Diagnóstico del pipeline de imágenes de Cavents:
// qué tipos/formatos fallan en el recorte (cropearImagen) y qué archivo
// acaba en el FormData (recortado vs ORIGINAL), más qué envía el submit.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'updiag-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9259',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9259/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9259/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9259/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      // Interceptar el POST /obras para inspeccionar el FormData real
      window.__ultimoFormData = null;
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (init && init.body && typeof init.body !== 'string' && typeof init.body.forEach === 'function') {
              window.__ultimoFormData = [];
              for (const [k, val] of init.body.entries()) {
                  window.__ultimoFormData.push({ k, tipo: val && val.name ? 'file:' + val.name + ' (' + val.type + ', ' + val.size + 'B)' : 'txt:' + String(val).slice(0, 40) });
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
// Abrir el panel de creación
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);

// Generar imágenes de prueba y probar el pipeline una a una
const pruebas = [
  { nombre: 'foto-jpeg.jpg', tipo: 'image/jpeg', desc: 'JPEG normal (canvas)' },
  { nombre: 'foto-png.png', tipo: 'image/png', desc: 'PNG grande con alpha' },
  { nombre: 'foto-webp.webp', tipo: 'image/webp', desc: 'WebP' },
  { nombre: 'foto-heic.heic', tipo: 'image/heic', desc: 'HEIC (iPhone) — el navegador NO puede decodificarlo' },
  { nombre: 'foto-tiff.tiff', tipo: 'image/tiff', desc: 'TIFF — el navegador NO lo decodifica' },
  { nombre: 'foto-corrupta.jpg', tipo: 'image/jpeg', desc: 'Archivo corrupto (basura con .jpg)' },
  { nombre: 'foto-muy-grande.jpg', tipo: 'image/jpeg', desc: 'JPEG gigante 6000x8000 (12MB aprox)' }
];

for (const p of pruebas) {
  // Limpiar el carrusel entre pruebas
  await evalJs(`(() => { try { document.getElementById('btn-guardar').textContent = 'Crear Cavent'; } catch(e){} })()`);
  const r = await evalJs(`(async () => {
      // Generar el archivo según la prueba
      let blob;
      const nombre = ${JSON.stringify(p.nombre)};
      const tipo = ${JSON.stringify(p.tipo)};
      if (nombre.includes('grande')) {
          const c = document.createElement('canvas');
          c.width = 6000; c.height = 8000;
          const ctx = c.getContext('2d');
          const g = ctx.createLinearGradient(0,0,6000,8000);
          g.addColorStop(0,'#ff0000'); g.addColorStop(1,'#0000ff');
          ctx.fillStyle = g; ctx.fillRect(0,0,6000,8000);
          blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      } else if (tipo === 'image/heic' || tipo === 'image/tiff') {
          blob = new Blob([new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99])], { type: tipo });
      } else if (nombre.includes('corrupta')) {
          blob = new Blob([new Uint8Array([255,216,255,224,0,0,0,0,123,45,67,89])], { type: 'image/jpeg' });
      } else if (tipo === 'image/webp') {
          const c = document.createElement('canvas');
          c.width = 800; c.height = 1000;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#00ff00'; ctx.fillRect(0,0,800,1000);
          blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9));
      } else if (tipo === 'image/png') {
          const c = document.createElement('canvas');
          c.width = 2500; c.height = 3500;
          const ctx = c.getContext('2d');
          ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(0,0,2500,3500);
          blob = await new Promise(r => c.toBlob(r, 'image/png'));
      } else {
          const c = document.createElement('canvas');
          c.width = 1200; c.height = 1500;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ff8800'; ctx.fillRect(0,0,1200,1500);
          blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      }
      const file = new File([blob], nombre, { type: tipo });
      const resultado = { original: { nombre, tipo, tamano: file.size } };

      // Probar cropearImagen directamente (expuesto en el módulo)
      try {
          const mod = await import('./js/panel-ui.js?v=' + Date.now());
          // cropearImagen no está exportado; probar via el input real:
          const inp = document.getElementById('input-imagen-0');
          const dt = new DataTransfer();
          dt.items.add(file);
          inp.files = dt.files;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 1200));
          const estado = window._estadoCarrusel || null;
          resultado.trasCrop = {};
          // Leer imagenesData a través del DOM del carrusel
          const imgEl = document.querySelector('#carrusel-track img, #carrusel-track .slide img');
          if (imgEl) resultado.trasCrop.srcTipo = imgEl.src.slice(0, 30);
          // El archivo que se adjuntaría: no accesible directamente; usar el submit
          return JSON.stringify(resultado);
      } catch (e) {
          resultado.error = String(e && e.message || e);
          return JSON.stringify(resultado);
      }
  })()`);
  console.log(p.desc, '→', r);
  // Limpiar el formulario entre pruebas
  await evalJs(`(() => { const i = document.getElementById('input-imagen-0'); if (i) i.value = ''; document.getElementById('carrusel-track').innerHTML = ''; })()`);
}

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
