// Verifica los 3 cambios de detalles en carruseles:
// 1) Dots del carrusel en la parte INFERIOR IZQUIERDA dentro del contenedor.
// 2) El modal "ver detalles" ya NO muestra Etiquetas (ni Año ni Dimensiones).
// 3) La tarjeta muestra Año (arriba-derecha) y Dimensiones (arriba-izquierda),
//    justo encima del carrusel de imágenes.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'detalles-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9281',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9281/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9281/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9281/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const img45 = mkImg(800, 1000, '#cc3344');
      const img11 = mkImg(800, 800, '#2255cc');
      const obrasMock = [
          { id: 1, titulo: 'Retrato al óleo', artista: 'T', artista_user_id: 1,
            imagen_url: img45, imagen_url_1: img11, etiquetas: 'Óleo, Retrato',
            ano: 2024, ancho: 80, alto: 100,
            descripcion_tecnica: 'Óleo', soporte: 'Lienzo (Algodón, lino, Mezcla)', marcos: 'No',
            estado_obra: 'Disponible', descripcion_artistica: 'Texto',
            procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena',
            likes_count: 2, views_count: 5, comments_count: 1, precio: '100',
            foto_artista: '' },
          { id: 2, titulo: 'Paisaje', artista: 'T', artista_user_id: 1,
            imagen_url: img11, etiquetas: 'Paisaje',
            ano: 2023, ancho: 50, alto: 50,
            descripcion_tecnica: 'Acuarela', soporte: 'Papel', marcos: 'No',
            estado_obra: 'Vendido', descripcion_artistica: 'Texto2',
            procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena',
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
              if (u.includes('/obras/1')) return json({ obra: obrasMock[0] });
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

console.log('=== Entrar a Cavents (carrusel) ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(2500);

console.log('\n=== 1) Dots en la parte INFERIOR IZQUIERDA del carrusel ===');
console.log(await evalJs(`(() => {
    const dots = document.querySelector('.obra-carousel-dots');
    const cs = getComputedStyle(dots);
    const viewport = document.querySelector('.obra-carousel-viewport').getBoundingClientRect();
    const dr = dots.getBoundingClientRect();
    const carr = document.querySelector('.obra-carousel').getBoundingClientRect();
    return JSON.stringify({
        bottom: cs.bottom, top: cs.top, justifyContent: cs.justifyContent,
        geometria: {
            vp: { l: Math.round(viewport.left), r: Math.round(viewport.right), t: Math.round(viewport.top), b: Math.round(viewport.bottom) },
            d: { l: Math.round(dr.left), r: Math.round(dr.right), t: Math.round(dr.top), b: Math.round(dr.bottom) },
            c: { l: Math.round(carr.left), r: Math.round(carr.right), t: Math.round(carr.top), b: Math.round(carr.bottom) }
        },
        izquierda: dr.left - viewport.left < 15,
        abajo: (viewport.bottom - dr.bottom) < 15,
        dotsInternos: dr.left >= viewport.left && dr.right <= viewport.right && dr.bottom <= viewport.bottom && dr.top >= viewport.top
    });
})()`));

console.log('\n=== 3) Franja técnica/soporte/año/dimensiones encima del carrusel ===');
console.log(await evalJs(`(() => {
    const card = document.querySelector('.obra-card');
    const bar = card.querySelector('.obra-meta-bar');
    const barR = bar.getBoundingClientRect();
    const carr = card.querySelector('.obra-carousel').getBoundingClientRect();
    const dim = card.querySelector('.obra-meta-dimensiones');
    const anio = card.querySelector('.obra-meta-ano');
    const tecnica = card.querySelector('.obra-meta-tecnica');
    const soporte = card.querySelector('.obra-meta-soporte');
    const dimR = dim.getBoundingClientRect();
    const anioR = anio.getBoundingClientRect();
    const tecR = tecnica.getBoundingClientRect();
    const sopR = soporte.getBoundingClientRect();
    return JSON.stringify({
        existe: !!bar,
        tecnica: tecnica.textContent,
        soporte: soporte.textContent,
        soporteSinParentesis: !soporte.textContent.includes('('),
        dimensiones: dim.textContent,
        anio: anio.textContent,
        encimaDelCarrusel: barR.bottom <= carr.top + 2,
        tecnicaAlLadoDeDimensiones: Math.abs(tecR.left - dimR.left) < 2 || tecR.right <= dimR.left + 2,
        soporteAlLadoDelAnio: sopR.right <= anioR.left + 2,
        ladoIzq: tecR.left < anioR.left,
        ladoDer: sopR.left > dimR.right
    });
})()`));

console.log('\n=== 2) Modal ver detalles: SIN Etiquetas / Año / Dimensiones ===');
await evalJs(`document.querySelector('.btn-detalles-toggle').click()`);
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    sinEtiquetas: !document.getElementById('detalle-etiquetas'),
    sinAno: !document.getElementById('detalle-ano'),
    sinDimensiones: !document.getElementById('detalle-dimensiones'),
    modalVisible: !document.getElementById('modal-detalles-cavent').classList.contains('hidden'),
    tecnica: document.getElementById('detalle-tecnica').textContent
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
