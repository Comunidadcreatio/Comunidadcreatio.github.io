// Verifica el grid masonry de Explorar:
// 1) El contenedor usa multi-column (3 columnas) en modo grid.
// 2) Las tarjetas conservan su aspect-ratio real (4:5 → 0.8, 1:1 → 1).
// 3) Las alturas de las tarjetas son VARIADAS (masonry), no uniformes.
// 4) Sin excepciones JS.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'masonry-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9280',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9280/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9280/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9280/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const mkImg = (w, h, color) => {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
          return cv.toDataURL('image/jpeg', 0.8);
      };
      // 6 obras: 3 en 4:5 (800x1000), 3 en 1:1 (800x800) → alturas variadas
      const img45 = mkImg(800, 1000, '#cc3344');
      const img11 = mkImg(800, 800, '#2255cc');
      const obrasMock = [1,2,3,4,5,6].map(i => ({
          id: i, titulo: 'Obra ' + i, artista: 'T', artista_user_id: 1,
          imagen_url: (i % 2 === 0) ? img45 : img11,
          etiquetas: 'Óleo, Retrato',
          likes_count: i, views_count: i * 2, comments_count: i, precio: '100',
          foto_artista: ''
      }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
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

console.log('=== Entrar a Explorar (grid masonry) ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
await sleep(2500);

console.log('\n=== 1) Contenedor multi-column (3 columnas) ===');
console.log(await evalJs(`(() => {
    const c = document.getElementById('galeria-container');
    const cs = getComputedStyle(c);
    return JSON.stringify({ display: cs.display, columnCount: cs.columnCount, columnGap: cs.columnGap });
})()`));

console.log('\n=== 2) Aspect-ratio real por tarjeta ===');
console.log(await evalJs(`JSON.stringify({
    cards: document.querySelectorAll('#galeria-container .obra-card').length,
    ratios: [...document.querySelectorAll('#galeria-container .obra-carousel-viewport')].map(v => v.style.aspectRatio || '(fallback 4/5)')
})`));

console.log('\n=== 3) Alturas VARIADAS (masonry) ===');
console.log(await evalJs(`(() => {
    const cards = [...document.querySelectorAll('#galeria-container .obra-card')];
    const alturas = cards.map(c => Math.round(c.getBoundingClientRect().height));
    const xs = cards.map(c => Math.round(c.getBoundingClientRect().left));
    const distintas = new Set(alturas).size;
    return JSON.stringify({ alturas, alturasDistintas: distintas, columnasX: [...new Set(xs)].length });
})()`));

console.log('\n=== 4) Filtro por etiqueta sigue funcionando (re-render) ===');
await evalJs(`(async () => {
    const chip = document.querySelector('#tags-carrusel .tag-chip');
    if (chip) chip.click();
    return 'ok';
})()`);
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    cardsTrasFiltro: document.querySelectorAll('#galeria-container .obra-card').length,
    columnCount: getComputedStyle(document.getElementById('galeria-container')).columnCount
})`));

console.log('\n=== 5) Esquinas RECTAS y sin aire lateral ===');
console.log(await evalJs(`(() => {
    const c = document.getElementById('galeria-container');
    const img = document.querySelector('#galeria-container .obra-carousel-slide img');
    const overlay = document.querySelector('#galeria-container .obra-grid-overlay');
    const cs = getComputedStyle(c);
    return JSON.stringify({
        paddingLateral: cs.paddingLeft,
        borderRadiusImg: img ? getComputedStyle(img).borderRadius : '(sin img)',
        borderRadiusOverlay: overlay ? getComputedStyle(overlay).borderRadius : '(sin overlay)',
        esquinasRectas: (!img || getComputedStyle(img).borderRadius === '0px') && (!overlay || getComputedStyle(overlay).borderRadius === '0px')
    });
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
