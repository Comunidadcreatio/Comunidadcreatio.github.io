// Prueba exhaustiva del flujo Explorar con TOQUES reales:
// estado completo en cada paso (clases, estilos calculados, rects, pantallas).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'expod-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9253',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9253/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9253/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9253/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
              if (u.includes('/obras') && !u.includes('reacciones')) return json({ obras });
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

const tocar = async (sel) => {
    const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display, visible: r.width > 0 && r.height > 0 }; })()`);
    if (!r || !r.visible) { console.log(`[tocar] ${sel} NO visible:`, JSON.stringify(r)); return false; }
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
    await sleep(50);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return r;
};

const dump = () => evalJs(`(() => {
    const lupaH = document.getElementById('btn-lupa-explorar');
    const navBuscar = document.getElementById('btn-buscar');
    const panel = document.getElementById('search-panel');
    const input = document.getElementById('search-input');
    const tags = document.getElementById('tags-carrusel');
    const grid = document.getElementById('galeria-container');
    const veil = getComputedStyle(document.getElementById('galeria-publica'), '::before');
    const lr = lupaH.getBoundingClientRect();
    const nr = navBuscar.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const tr = tags.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    const lcs = getComputedStyle(lupaH);
    return JSON.stringify({
        seccion: document.getElementById('galeria-publica').classList.contains('hidden') ? 'oculta' : 'visible',
        galeriaModo: window._galeriaModoDbg || null,
        searchAbierto: document.body.classList.contains('search-abierto'),
        searchEscribiendo: document.body.classList.contains('search-escribiendo'),
        lupaHeader: { hidden: lupaH.classList.contains('hidden'), ocultando: lupaH.classList.contains('ocultando'), display: lcs.display, opacity: lcs.opacity, rect: { x: Math.round(lr.x), y: Math.round(lr.y), w: Math.round(lr.width), h: Math.round(lr.height) } },
        navBuscar: { display: getComputedStyle(navBuscar).display, rect: { x: Math.round(nr.x), y: Math.round(nr.y), w: Math.round(nr.width), h: Math.round(nr.height) } },
        panel: { hidden: panel.classList.contains('hidden'), modoBusqueda: panel.classList.contains('modo-busqueda'), display: getComputedStyle(panel).display, bg: getComputedStyle(panel).backgroundColor, rect: { y: Math.round(pr.y), h: Math.round(pr.height), bottom: Math.round(pr.bottom) } },
        input: { display: getComputedStyle(input).display, focused: document.activeElement === input, rect: { y: Math.round(ir.y), h: Math.round(ir.height) } },
        tags: { display: getComputedStyle(tags).display, rect: { y: Math.round(tr.y), bottom: Math.round(tr.bottom) } },
        gridTop: Math.round(gr.y),
        veilOpacity: veil.opacity
    });
})()`);

const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join('scripts', name), Buffer.from(res.result.data, 'base64'));
    console.log('  📸', name);
};

console.log('=== Estado inicial (antes de tocar nada) ===');
console.log(await dump());

console.log('\n=== TOQUE en nav "Buscar" ===');
console.log(await tocar('#btn-buscar'));
let ready = false;
for (let i = 0; i < 40; i++) {
  ready = await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9 && !document.getElementById('tags-carrusel').classList.contains('hidden')`);
  if (ready) break;
  await sleep(400);
}
await sleep(700);
console.log('Explorar listo:', ready);
console.log(await dump());
await shot('explorar-1-nav.png');

console.log('\n=== TOQUE en la LUPA del header ===');
console.log(await tocar('#btn-lupa-explorar'));
await sleep(600);
console.log(await dump());
await shot('explorar-2-lupa-header.png');

console.log('\n=== Escribir "ana" en el input ===');
await evalJs(`(() => { const i = document.getElementById('search-input'); i.value = 'ana'; i.dispatchEvent(new Event('input', { bubbles: true })); return 'ok'; })()`);
await sleep(700);
console.log(await evalJs(`(() => {
    const res = document.getElementById('search-results-dropdown');
    const r = res.getBoundingClientRect();
    return JSON.stringify({ resultados: res.children.length, rect: { y: Math.round(r.y), bottom: Math.round(r.bottom) } });
})()`));
await shot('explorar-3-resultados.png');

console.log('\n=== Flecha < ===');
console.log(await tocar('#search-close'));
await sleep(500);
console.log(await dump());

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
