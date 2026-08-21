// Diagnóstico de los 3 arreglos:
// 1) Secuencia campana→lupa al entrar a Explorar (sin solape visual).
// 2) Círculo crece desde pequeño + etiquetas/grid bajan suaves en la recarga.
// 3) Carrusel: el círculo NO se superpone al cavent de abajo (tiene espacio).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 't3-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9258',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9258/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9258/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9258/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#888"/></svg>');
      const obras = Array.from({ length: 9 }, (_, i) => ({
          id: i + 1, titulo: 'Obra ' + (i + 1), artista: 'A' + (i + 1),
          precio: 10, views_count: 1, likes_count: 0, comments_count: 0,
          imagen_url: SVG, etiquetas: i % 2 ? 'paisaje,abstracto' : 'retrato',
          artista_user_id: 1
      }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras') && !u.includes('reacciones')) {
                  await new Promise(r => setTimeout(r, 900));
                  return json({ obras });
              }
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

console.log('=== 1) Secuencia campana→lupa al entrar a Explorar ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
// muestrear cada 100ms durante la transición
for (let t = 0; t <= 600; t += 120) {
  await sleep(t === 0 ? 60 : 120);
  const s = await evalJs(`(() => {
      const camp = document.getElementById('btn-notificaciones');
      const lupa = document.getElementById('btn-lupa-explorar');
      return JSON.stringify({
          campana: camp.classList.contains('hidden') ? 'oculta' : (camp.classList.contains('ocultando') ? 'ocultando' : 'visible'),
          lupa: lupa.classList.contains('hidden') ? 'oculta' : (lupa.classList.contains('ocultando') ? 'ocultando' : 'visible')
      });
  })()`);
  console.log('t+' + t + 'ms:', s);
}
await sleep(400);
console.log('final:', await evalJs(`JSON.stringify({
    campana: document.getElementById('btn-notificaciones').classList.contains('hidden') ? 'oculta' : 'visible',
    lupa: document.getElementById('btn-lupa-explorar').classList.contains('hidden') ? 'oculta' : 'visible',
    grid: document.getElementById('galeria-container').classList.contains('modo-grid')
})`));

console.log('\n=== 2) Recarga por lupa del NAV: círculo crece + contenido baja suave ===');
// Esperar a que el grid Y las etiquetas estén realmente listos
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9 && document.querySelectorAll('.tag-chip').length >= 3`)) break;
  await sleep(300);
}
await sleep(300);
await evalJs(`document.getElementById('btn-buscar').click()`); // Explorar ya abierto → refresca
await sleep(80);
console.log('durante:', await evalJs(`(() => {
    const ind = document.querySelector('.pull-refresh-indicator');
    const circle = document.querySelector('.ptr-circle');
    const tags = document.getElementById('tags-carrusel');
    return JSON.stringify({
        visible: ind.classList.contains('visible'),
        loading: ind.classList.contains('loading'),
        escala: circle ? getComputedStyle(circle).transform : 'n/a',
        tagsTransform: tags.style.transform || 'ninguno',
        tagsVisible: getComputedStyle(tags).display !== 'none'
    });
})()`));
await sleep(200);
console.log('creciendo:', await evalJs(`(() => {
    const circle = document.querySelector('.ptr-circle');
    const tags = document.getElementById('tags-carrusel');
    const tr = tags.getBoundingClientRect();
    return JSON.stringify({
        escala: circle ? getComputedStyle(circle).transform : 'n/a',
        tagsTransform: tags.style.transform || 'ninguno',
        tagsY: Math.round(tr.y),
        gridPadding: document.getElementById('galeria-container').style.paddingTop
    });
})()`));
await sleep(1200);

console.log('\n=== 3) Carrusel: círculo con su espacio (no tapa el cavent) ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`); // a carrusel desde Explorar
await sleep(900);
const gridRect = await evalJs(`(() => { const r = document.getElementById('galeria-container').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gridRect.x, y: gridRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gridRect.x, y: gridRect.y + 100, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(120);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300);
console.log('en carga:', await evalJs(`(() => {
    const ind = document.querySelector('.pull-refresh-indicator');
    const card = document.querySelector('#galeria-container .obra-card');
    const ir = ind.getBoundingClientRect();
    const cr = card ? card.getBoundingClientRect() : null;
    return JSON.stringify({
        indicadorEn: ind.parentNode.id || ind.parentNode.tagName,
        circulo: { y: Math.round(ir.y), h: Math.round(ir.height), bottom: Math.round(ir.bottom) },
        cardTop: cr ? Math.round(cr.y) : null,
        sinSuperponer: cr ? Math.round(ir.bottom) <= Math.round(cr.y) : null
    });
})()`));
await sleep(1200);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
