// Diagnóstico: (1) choque tras arrastre FUERTE (>56px) en carga; (2) hueco
// entre la barra del buscador y los resultados; (3) visibilidad del logo.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'diag-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9257',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9257/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9257/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9257/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
await evalJs(`document.getElementById('btn-buscar').click()`);
for (let i = 0; i < 40; i++) {
  if (await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9`)) break;
  await sleep(400);
}
await sleep(600);

console.log('=== Header/lupa/logo referencia ===');
console.log(await evalJs(`(() => {
    const lupa = document.getElementById('btn-lupa-explorar').getBoundingClientRect();
    const logo = document.querySelector('.header__logo').getBoundingClientRect();
    const header = document.getElementById('main-header').getBoundingClientRect();
    return JSON.stringify({ header: { y: Math.round(header.y), h: Math.round(header.height) }, lupa: { y: Math.round(lupa.y), h: Math.round(lupa.height) }, logo: { y: Math.round(logo.y), h: Math.round(logo.height) } });
})()`));

console.log('\n=== Buscador: barra, logo, hueco de resultados ===');
await evalJs(`document.getElementById('btn-lupa-explorar').click()`);
await sleep(400);
await evalJs(`(() => { const i = document.getElementById('search-input'); i.value = 'ana'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
await sleep(700);
console.log(await evalJs(`(() => {
    const panel = document.getElementById('search-panel');
    const top = document.querySelector('.search-panel-top');
    const res = document.getElementById('search-results-dropdown');
    const logo = document.querySelector('.header__logo');
    const pr = panel.getBoundingClientRect();
    const tr = top.getBoundingClientRect();
    const rr = res.getBoundingClientRect();
    const lr = logo.getBoundingClientRect();
    const encimaLogo = document.elementFromPoint(Math.round(lr.left + lr.width / 2), Math.round(lr.top + lr.height / 2));
    return JSON.stringify({
        panel: { y: Math.round(pr.y), h: Math.round(pr.height) },
        barra: { y: Math.round(tr.y), bottom: Math.round(tr.bottom), bg: getComputedStyle(top).backgroundColor },
        resultados: { y: Math.round(rr.y), items: res.children.length },
        huecoBarraResultados: rr.y > 0 ? Math.round(rr.y - tr.bottom) : null,
        logoRect: { y: Math.round(lr.y), bottom: Math.round(lr.bottom) },
        encimaDelLogo: encimaLogo ? encimaLogo.tagName + '#' + encimaLogo.id + '.' + (typeof encimaLogo.className === 'string' ? encimaLogo.className.slice(0,30) : '') : 'null'
    });
})()`));
console.log('(cerrar buscador antes del PTR)');
await evalJs(`document.getElementById('search-close').click()`);
await sleep(300);

console.log('\n=== PTR con arrastre FUERTE: choque en carga? ===');
const gridRect = await evalJs(`(() => { const r = document.getElementById('galeria-container').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gridRect.x, y: gridRect.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
await sleep(60);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gridRect.x, y: gridRect.y + 200, radiusX: 2, radiusY: 2, force: 1, id: 1 }] }); // dist 200 → damped 90
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(300); // en plena carga
console.log('en carga:', await evalJs(`(() => {
    const tags = document.getElementById('tags-carrusel');
    const grid = document.getElementById('galeria-container');
    const card = grid.querySelector('.obra-card');
    const tr = tags.getBoundingClientRect();
    const cr = card ? card.getBoundingClientRect() : null;
    return JSON.stringify({
        tagsTransform: tags.style.transform,
        gridPadding: grid.style.paddingTop,
        tags: { y: Math.round(tr.y), bottom: Math.round(tr.bottom) },
        cardTop: cr ? Math.round(cr.y) : null,
        choque: cr ? Math.round(cr.y) < Math.round(tr.bottom) : null
    });
})()`));
await sleep(1200);
console.log('final:', await evalJs(`JSON.stringify({
    tagsTransform: document.getElementById('tags-carrusel').style.transform || 'ninguno',
    gridPadding: document.getElementById('galeria-container').style.paddingTop || 'ninguno',
    gridTransition: document.getElementById('galeria-container').style.transition || '(css)'
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
