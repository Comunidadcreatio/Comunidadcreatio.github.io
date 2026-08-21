// Verifica los nuevos requisitos:
// A) Campana OCULTA en Explorar (solo lupa); visible en otras secciones.
// B) El buscador se despliega DESDE el header (panel top:0, tapa el logo).
// C) Las etiquetas se quedan INMÓVILES al abrir el buscador y con resultados.
// D) PTR: durante la carga, etiquetas Y grid se mantienen abajo juntos (56px)
//    y vuelven juntos (sin chocar).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'exp2-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9256',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9256/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9256/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9256/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
                  await new Promise(r => setTimeout(r, 800)); // carga lenta: poder observar el estado 'loading'
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

// Abrir Explorar
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9`)) break;
  await sleep(400);
}
await sleep(600);

console.log('=== A) Campana oculta en Explorar; lupa visible ===');
console.log(await evalJs(`JSON.stringify({
    campanaVisible: !document.getElementById('btn-notificaciones').classList.contains('hidden'),
    lupaVisible: !document.getElementById('btn-lupa-explorar').classList.contains('hidden'),
    lupaX: Math.round(document.getElementById('btn-lupa-explorar').getBoundingClientRect().x)
})`));

console.log('\n=== B+C) Abrir buscador: panel DESDE el header, etiquetas inmóviles ===');
await evalJs(`document.getElementById('btn-lupa-explorar').click()`);
await sleep(400);
console.log(await evalJs(`(() => {
    const panel = document.getElementById('search-panel');
    const tags = document.getElementById('tags-carrusel');
    const pr = panel.getBoundingClientRect();
    const tr = tags.getBoundingClientRect();
    return JSON.stringify({
        panelTop: Math.round(pr.y),
        panelBg: getComputedStyle(panel).backgroundImage !== 'none' ? 'degradado' : 'none',
        animacion: getComputedStyle(panel).animationName,
        tagsY: Math.round(tr.y),
        tagsTransform: tags.style.transform || 'sin transform',
        searchEscribiendo: document.body.classList.contains('search-escribiendo'),
        panelVisible: !panel.classList.contains('hidden')
    });
})()`));

console.log('\n=== C) Escribir → resultados DEBAJO de las etiquetas (inmóviles) ===');
await evalJs(`(() => { const i = document.getElementById('search-input'); i.value = 'ana'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
await sleep(700);
console.log(await evalJs(`(() => {
    const res = document.getElementById('search-results-dropdown');
    const tags = document.getElementById('tags-carrusel');
    const r = res.getBoundingClientRect();
    const tr = tags.getBoundingClientRect();
    return JSON.stringify({
        resultsY: Math.round(r.y),
        resultsItems: res.children.length,
        tagsY: Math.round(tr.y),
        tagsTransform: tags.style.transform || 'sin transform',
        resultadosDebajoEtiquetas: Math.round(r.y) > Math.round(tr.bottom)
    });
})()`));

console.log('\n=== Cerrar buscador (flecha) ===');
await evalJs(`document.getElementById('search-close').click()`);
await sleep(300);
console.log(await evalJs(`JSON.stringify({
    panelHidden: document.getElementById('search-panel').classList.contains('hidden'),
    tagsY: Math.round(document.getElementById('tags-carrusel').getBoundingClientRect().y)
})`));

console.log('\n=== D) PTR: durante la carga, etiquetas Y grid juntos abajo ===');
const gridRect = await evalJs(`(() => { const r = document.getElementById('galeria-container').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gridRect.x, y: gridRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gridRect.x, y: gridRect.y + 100, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(120);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(250); // ya soltado, en plena carga (fetch tarda 800ms)
console.log('en carga:', await evalJs(`(() => {
    const ind = document.querySelector('.pull-refresh-indicator');
    const tags = document.getElementById('tags-carrusel');
    const grid = document.getElementById('galeria-container');
    const primeraCard = grid.querySelector('.obra-card');
    const tr = tags.getBoundingClientRect();
    const cr = primeraCard ? primeraCard.getBoundingClientRect() : null;
    return JSON.stringify({
        loading: ind.classList.contains('loading'),
        tagsTransform: tags.style.transform,
        gridPadding: grid.style.paddingTop,
        tagsY: Math.round(tr.y), tagsBottom: Math.round(tr.bottom),
        primeraCardTop: cr ? Math.round(cr.y) : null,
        sinChoque: cr ? Math.round(cr.y) >= Math.round(tr.bottom) : null
    });
})()`));
await sleep(1100); // termina la carga
console.log('tras terminar:', await evalJs(`(() => {
    const tags = document.getElementById('tags-carrusel');
    const grid = document.getElementById('galeria-container');
    return JSON.stringify({
        tagsTransform: tags.style.transform || 'ninguno',
        gridPadding: grid.style.paddingTop || 'ninguno',
        cards: document.querySelectorAll('#galeria-container .obra-card').length
    });
})()`));

console.log('\n=== A2) Campana visible en Cavents carrusel ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
console.log(await evalJs(`JSON.stringify({
    campanaVisible: !document.getElementById('btn-notificaciones').classList.contains('hidden'),
    modoGrid: document.getElementById('galeria-container').classList.contains('modo-grid'),
    tagsDisplay: getComputedStyle(document.getElementById('tags-carrusel')).display
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
