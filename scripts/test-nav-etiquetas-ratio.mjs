// Verifica los 4 fixes:
// 1) Icono Cavents del nav NO se vuelve azul al activarse.
// 2) Al entrar a Explorar (desde carrusel) las etiquetas SIEMPRE aparecen.
// 3) Al salir de Explorar a otra sección, las etiquetas se ocultan al instante
//    (search-abierto quitado + tags hidden de inmediato, sin quedar flotando).
// 4) Tarjetas con aspecto real 4:5 o 1:1 en el carrusel de Cavents y en el
//    grid de "Mis Cavents" del perfil.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'navfix-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9278',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9278/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9278/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9278/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      // Imágenes reales: una 4:5 (800x1000) y una 1:1 (800x800)
      const mkImg = (w, h, color) => {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
          return cv.toDataURL('image/jpeg', 0.8);
      };
      const img45 = mkImg(800, 1000, '#cc3344');
      const img11 = mkImg(800, 800, '#2255cc');
      const obrasMock = [
          { id: 1, titulo: 'Retrato al óleo', artista: 'T', artista_user_id: 1,
            imagen_url: img45, etiquetas: 'Óleo, Retrato',
            likes_count: 2, views_count: 5, comments_count: 1, precio: '100',
            foto_artista: '' },
          { id: 2, titulo: 'Paisaje', artista: 'T', artista_user_id: 1,
            imagen_url: img11, etiquetas: 'Paisaje, Acuarela',
            likes_count: 0, views_count: 3, comments_count: 0, precio: 'N/A',
            foto_artista: '' }
      ];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/api/artistas/mis-obras')) return json({ success: true, obras: obrasMock });
              if (u.includes('/obras')) return json(obrasMock);
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

console.log('=== 1) Cavents (carrusel) → icono activo SIN azul ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(2500);
console.log(await evalJs(`(() => {
    const btn = document.getElementById('btn-cavents-hub');
    const svg = btn.querySelector('svg');
    const cs = getComputedStyle(btn);
    const svgCs = getComputedStyle(svg);
    return JSON.stringify({
        activo: btn.classList.contains('nav-btn-active'),
        color: cs.color,
        fill: svgCs.fill,
        stroke: svgCs.stroke,
        noAzul: cs.color !== 'rgb(91, 160, 217)' && svgCs.fill !== 'rgb(91, 160, 217)'
    });
})()`));

console.log('\n=== 4a) Carrusel: viewport con aspect-ratio real (4:5 y 1:1) ===');
console.log(await evalJs(`JSON.stringify({
    cards: document.querySelectorAll('.obra-card').length,
    ratios: [...document.querySelectorAll('.obra-carousel-viewport')].map(v => v.style.aspectRatio || '(sin inline)')
})`));

console.log('\n=== 2) Explorar desde el carrusel → etiquetas visibles ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
await sleep(1800);
console.log(await evalJs(`JSON.stringify({
    searchAbierto: document.body.classList.contains('search-abierto'),
    tagsVisible: (() => { const t = document.getElementById('tags-carrusel'); return t && !t.classList.contains('hidden') && getComputedStyle(t).display !== 'none'; })(),
    chips: document.querySelectorAll('#tags-carrusel .tag-chip').length,
    chipTextos: [...document.querySelectorAll('#tags-carrusel .tag-chip .tag-nombre')].map(n => n.textContent)
})`));

console.log('\n=== 3) Salir a Perfil → etiquetas ocultas INMEDIATAMENTE ===');
await evalJs(`document.getElementById('btn-perfil-sidebar').click()`);
await sleep(100); // sin esperar la animación: verificar el estado inmediato
console.log(await evalJs(`JSON.stringify({
    searchAbierto: document.body.classList.contains('search-abierto'),
    tagsHidden: (() => { const t = document.getElementById('tags-carrusel'); return !t || t.classList.contains('hidden') || getComputedStyle(t).display === 'none'; })()
})`));

console.log('\n=== 4b) Perfil: Mis Cavents con aspect-ratio real ===');
await sleep(2500);
console.log(await evalJs(`JSON.stringify({
    cards: document.querySelectorAll('.perfil-obra-card').length,
    ratios: [...document.querySelectorAll('.perfil-obra-card')].map(c => c.style.aspectRatio || '(sin inline)')
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
