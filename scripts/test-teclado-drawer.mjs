// Prueba INTEGRACIÓN del manejo de teclado del cajón de comentarios:
// parchea window.visualViewport.height y dispara window resize para que corra
// el MISMO código real (setupKeyboardDrawer -> ajustar) y comprueba:
//   1) Abrir teclado (vv 900->620): cajón sube a bottom ~280, clase
//      teclado-abierto puesta, nav oculto, input visible sobre la línea.
//   2) Barrido suave: valores intermedios de bottom mientras el vv cambia.
//   3) Cerrar del todo (vv ->900): restauración AL INSTANTE (sin transición
//      que deje ver la página) -> bottom 0, clase quitada, nav visible.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tecdraw-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9291',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9291/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9291/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9291/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

// Parchear vv.height para simular el teclado (antes de que el drawer abra ya
// está conectado el listener vía init->setupKeyboardDrawer al abrir el cajón)
const patch = await evalJs(`(() => {
    try {
        const vv = window.visualViewport;
        let h = vv.height;
        Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
        window.__setVvH = (x) => { h = x; window.dispatchEvent(new Event('resize')); };
        return 'patched ok actual=' + h;
    } catch (e) { return 'patch FAIL: ' + e.message; }
})()`);
console.log('parche vv.height:', patch);

async function estado() {
    return evalJs(`(() => {
        const d = document.getElementById('comentarios-drawer');
        const r = d.getBoundingClientRect();
        const nav = document.getElementById('toggle-panel');
        const input = document.getElementById('comentarios-input');
        const ir = input.getBoundingClientRect();
        return JSON.stringify({
            bottom: Math.round(r.bottom), top: Math.round(r.top),
            inlineBottom: d.style.bottom || '(0)',
            tecladoAbierto: document.body.classList.contains('teclado-abierto'),
            navHidden: nav.classList.contains('hidden') || getComputedStyle(nav).display === 'none',
            inputBottom: Math.round(ir.bottom),
            vvH: window.visualViewport.height
        });
    })()`);
}
function checks(estadoJson, espera) {
    const e = JSON.parse(estadoJson);
    const fails = [];
    for (const [k, cond] of Object.entries(espera)) {
        if (typeof cond === 'function' ? !cond(e[k]) : e[k] !== cond) fails.push(k + '=' + e[k]);
    }
    return fails;
}

let ok = true;
console.log('\n[estado inicial, drawer abierto]');
let st = await estado(); console.log(' ', st);

// 1) Abrir teclado: un solo evento con vv ya en 620 (teclado 280px)
console.log('\n--- evento: teclado ABIERTO (vv 900->620) ---');
await evalJs(`__setVvH(620)`);
await sleep(450); // deja terminar la transición (280ms) y el timer de limpieza
st = await estado(); console.log(' ', st);
let fails = checks(st, { bottom: 620, top: 180, tecladoAbierto: true, navHidden: true });
console.log(fails.length ? '  ✗ ' + fails.join(' | ') : '  ✓ cajón arriba, nav oculto, teclado-abierto');
ok = ok && fails.length === 0;
// El input debe quedar VISIBLE sobre la línea 620 (su borde < 620)
const inputBottom = JSON.parse(st).inputBottom;
console.log(inputBottom <= 618 ? `  ✓ input visible (borde inferior ${inputBottom} <= 618)` : `  ✗ input bajo la línea del teclado: ${inputBottom}`);
ok = ok && inputBottom <= 618;

// 2) Barrido suave al abrir en varios pasos (teclado subiendo)
console.log('\n--- barrido progresivo 900->840->760->690->620 ---');
await evalJs(`__setVvH(900)`); // cerrar primero
await sleep(120);
const serie = [];
for (const h of [840, 760, 690, 620]) {
    await evalJs(`__setVvH(${h})`);
    await sleep(70);
    const b = JSON.parse(await estado()).bottom;
    serie.push(b);
}
console.log(' bottoms tras cada paso: ' + serie.join(', '));
const decrece = serie.every((b, i) => i === 0 || b < serie[i - 1]);
console.log(decrece ? '  ✓ el cajón sube progresivamente (sin saltos hacia abajo)' : '  ✗ movimiento no monotónico');
ok = ok && decrece;

// 3) Cerrar del todo con UN solo evento tardío (vv ya 900)
console.log('\n--- evento tardío: teclado CERRADO (vv 620->900 de golpe) ---');
await evalJs(`__setVvH(900)`);
await sleep(120); // sin transición: debe estar restaurado ya
st = await estado(); console.log(' ', st);
fails = checks(st, { bottom: 900, tecladoAbierto: false, navHidden: false });
console.log(fails.length ? '  ✗ ' + fails.join(' | ') + ' (restauración lenta dejaría ver la página)' : '  ✓ restauración inmediata (bottom 900, nav visible)');
ok = ok && fails.length === 0;

// El cajón sigue visible (no se cerró el drawer, solo el teclado)
const sigueAbierto = await evalJs(`document.getElementById('comentarios-drawer').classList.contains('visible')`);
console.log(sigueAbierto ? '  ✓ el cajón sigue abierto tras cerrar el teclado' : '  ✗ el cajón se cerró');
ok = ok && sigueAbierto;

// 4) Cerrar el CAJÓN con el teclado aún ABIERTO, luego reabrirlo:
//    al reabrir debe volver a levantarse solo (estado reseteado).
console.log('\n--- cerrar cajón con teclado abierto y reabrir ---');
await evalJs(`__setVvH(620)`); // teclado abierto de nuevo
await sleep(350);
st = await estado(); console.log('  abierto con teclado: ', st);
await evalJs(`document.getElementById('comentarios-close').click()`); // cierra el cajón
await sleep(450);
const oculto = await evalJs(`document.getElementById('comentarios-drawer').classList.contains('hidden')`);
console.log(oculto ? '  ✓ cajón cerrado' : '  ✗ no se ocultó');
ok = ok && oculto;
// Reabrir (mismo flujo que el icono de comentarios)
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(400);
st = await estado(); console.log('  reabierto con teclado aún arriba: ', st);
fails = checks(st, { bottom: 620, tecladoAbierto: true, navHidden: true });
console.log(fails.length ? '  ✗ ' + fails.join(' | ') + ' (no se levantó al reabrir)' : '  ✓ se levantó solo al reabrir con teclado abierto');
ok = ok && fails.length === 0;
// Cerrar teclado para limpiar
await evalJs(`__setVvH(900)`);
await sleep(150);
st = await estado(); console.log('  teclado cerrado tras reabrir: ', st);
fails = checks(st, { bottom: 900, tecladoAbierto: false });
console.log(fails.length ? '  ✗ ' + fails.join(' | ') : '  ✓ restaurado');
ok = ok && fails.length === 0;

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: PROBLEMAS');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
