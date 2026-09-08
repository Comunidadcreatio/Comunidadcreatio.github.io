// Verifica que el oscurecido del modal de descripción SOLO abarque la imagen:
// 1) El contenedor #modal-detalles-cavent tiene fondo transparente (ya no
//    oscurece toda la pantalla con rgba(0,0,0,0.5)).
// 2) El panel .modal-cavent-detalle (oscuro) coincide con el rect del carrusel.
// 3) El texto de descripción se ve y el modal funciona.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'modosc-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9284',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9284/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9284/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9284/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, color) => {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
          return cv.toDataURL('image/jpeg', 0.8);
      };
      const img45 = mkImg(800, 1000, '#cc3344');
      const obrasMock = [
          { id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1,
            imagen_url: img45, etiquetas: 'Óleo', ano: 2024, ancho: 80, alto: 100,
            descripcion_tecnica: 'Óleo', soporte: 'Lienzo', marcos: 'No',
            estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Descripción de prueba',
            procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena',
            likes_count: 2, views_count: 5, comments_count: 1, precio: '100',
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
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(800);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(2200);

console.log('=== Abrir modal de descripción (lupa) ===');
await evalJs(`document.querySelector('.btn-detalles-toggle').click()`);
await sleep(1600);
console.log(await evalJs(`(() => {
    const modal = document.getElementById('modal-detalles-cavent');
    const panel = modal.querySelector('.modal-cavent-detalle');
    const carr = document.querySelector('.obra-card .obra-carousel').getBoundingClientRect();
    const modalBg = getComputedStyle(modal).backgroundColor;
    const pRect = panel.getBoundingClientRect();
    const pBg = getComputedStyle(panel).backgroundColor;
    return JSON.stringify({
        modalVisible: !modal.classList.contains('hidden'),
        fondoModalTransparente: modalBg === 'rgba(0, 0, 0, 0)' || modalBg === 'transparent',
        // El panel oscuro debe coincidir con el rect de la imagen (tolerancia 4px)
        panelSobreImagen: Math.abs(pRect.top - carr.top) < 4 && Math.abs(pRect.bottom - carr.bottom) < 4,
        panelNoOcupaTodaLaPantalla: pRect.height < window.innerHeight - 50,
        panelBg: pBg,
        panel: { top: Math.round(pRect.top), bottom: Math.round(pRect.bottom) },
        carrusel: { top: Math.round(carr.top), bottom: Math.round(carr.bottom) },
        pantalla: window.innerHeight,
        descripcionVisible: !!document.getElementById('detalle-descripcion').textContent
    });
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
