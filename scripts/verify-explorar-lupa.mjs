// Verifica el nuevo flujo de Explorar:
// 1) Lupa del NAV abre Explorar SIN el buscador (solo etiquetas + grid),
//    y aparece la lupa en el HEADER.
// 2) Lupa del HEADER abre el buscador en modo B (flecha <, velo, input enfocado).
// 3) La flecha < cierra el buscador y deja Explorar intacto.
// 4) Al salir de Explorar (p.ej. Chat) la lupa del header se oculta y el
//    buscador se cierra.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'expo-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9252',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9252/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9252/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9252/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

const estado = () => evalJs(`(() => {
    const tags = document.getElementById('tags-carrusel');
    const grid = document.getElementById('galeria-container');
    const panel = document.getElementById('search-panel');
    const lupaH = document.getElementById('btn-lupa-explorar');
    const t = tags.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const veil = getComputedStyle(document.getElementById('galeria-publica'), '::before');
    return JSON.stringify({
        searchAbierto: document.body.classList.contains('search-abierto'),
        searchEscribiendo: document.body.classList.contains('search-escribiendo'),
        panelHidden: panel.classList.contains('hidden'),
        modoBusqueda: panel.classList.contains('modo-busqueda'),
        lupaHeaderVisible: !lupaH.classList.contains('hidden'),
        lupaHeaderOcultando: lupaH.classList.contains('ocultando'),
        tagsVisible: getComputedStyle(tags).display !== 'none',
        tagsY: Math.round(t.y), tagsBottom: Math.round(t.bottom),
        gridTop: Math.round(g.y),
        chips: tags.querySelectorAll('.tag-chip').length,
        veilOpacity: veil.opacity,
        focusEnInput: document.activeElement && document.activeElement.id === 'search-input'
    });
})()`);

console.log('=== 1) Lupa NAV abre Explorar SIN buscador ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
let ready = false;
for (let i = 0; i < 40; i++) {
  ready = await evalJs(`document.getElementById('galeria-container').classList.contains('modo-grid') && document.querySelectorAll('#galeria-container .obra-card').length >= 9 && !document.getElementById('tags-carrusel').classList.contains('hidden')`);
  if (ready) break;
  await sleep(400);
}
await sleep(600);
console.log(await estado());

console.log('\n=== 2) Lupa HEADER abre el buscador (modo B) ===');
await evalJs(`document.getElementById('btn-lupa-explorar').click()`);
await sleep(500);
console.log(await estado());

console.log('\n=== 3) Flecha < cierra el buscador, Explorar intacto ===');
await evalJs(`document.getElementById('search-close').click()`);
await sleep(400);
console.log(await estado());

console.log('\n=== 4) Nav lupa de nuevo (Explorar abierto) → refresca, sin buscador ===');
await evalJs(`document.getElementById('btn-buscar').click()`);
await sleep(600);
console.log(await estado());

console.log('\n=== 5) Ir a Chat → lupa header se oculta, buscador cerrado ===');
await evalJs(`document.getElementById('btn-chat-global').click()`);
await sleep(900);
console.log(await evalJs(`JSON.stringify({
    lupaHeaderVisible: !document.getElementById('btn-lupa-explorar').classList.contains('hidden'),
    searchAbierto: document.body.classList.contains('search-abierto'),
    panelHidden: document.getElementById('search-panel').classList.contains('hidden'),
    chatVisible: !document.getElementById('chat-global').classList.contains('hidden')
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
