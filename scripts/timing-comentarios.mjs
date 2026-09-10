// Mide si la transición de bottom del cajón ANIMA suavemente (no salta):
// lee getBoundingClientRect() varias veces durante la transición CSS y
// verifica que el borde inferior avanza de forma intermedia/continua.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'timcom-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9290',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9290/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9290/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9290/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#cc3344');
      const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Óleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Óleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras/1/comentarios')) return json({ comentarios: [] });
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
await sleep(2000);
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(1400);

// Mide la SUAVIDAD del movimiento real: se cambia la altura del teclado y se
// muestrea, frame a frame, el padding-bottom que aplica el cajón (el cajón en
// sí no se mueve nunca; lo que se desplaza es su contenido).
const serie = await evalJs(`(async () => {
    const vv = window.visualViewport;
    let h = vv.height;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    const drawer = document.getElementById('comentarios-drawer');
    const puntos = [];
    const registra = () => puntos.push(Math.round(parseFloat(drawer.style.paddingBottom) || 0));
    registra(); // reposo (0)
    h = 620;
    window.dispatchEvent(new Event('resize'));
    await new Promise(res => { const t0 = performance.now(); (function tick() {
        registra();
        if (performance.now() - t0 < 420) requestAnimationFrame(tick); else res();
    })(); });
    return puntos.join(',');
})()`);
console.log('padding-bottom a lo largo del tiempo (px, 0 -> ~220):');
console.log(serie);

// Análisis: ¿hay valores intermedios (interpolación suave) o solo salta?
const vals = serie.split(',').map(Number);
const unicos = [...new Set(vals)];
console.log('valores distintos:', unicos.length > 20 ? unicos.slice(0, 20).join(', ') + '...' : unicos.join(', '));
const intermedios = vals.filter(v => v > 0 && v < 215);
const finalOk = vals[vals.length - 1] >= 200 && vals[vals.length - 1] <= 230;
console.log(intermedios.length >= 5
    ? '✓ EL CONTENIDO SUBE SUAVE: ' + intermedios.length + ' muestras intermedias (p.ej. ' + intermedios.slice(0, 6).join(',') + '...)'
    : '✗ SALTA: sin valores intermedios (0 -> 220 directo)');
console.log(finalOk ? `  ✓ converge al valor correcto (${vals[vals.length - 1]}px)` : `  ✗ valor final inesperado: ${vals[vals.length - 1]}px`);
console.log('EXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit((intermedios.length >= 5 && finalOk) ? 0 : 1);
