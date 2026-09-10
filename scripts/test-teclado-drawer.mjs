// Prueba INTEGRACIÃ“N del manejo de teclado del cajÃ³n de comentarios:
// parchea window.visualViewport.height y dispara window resize para que corra
// el MISMO cÃ³digo real (setupKeyboardDrawer -> ajustar) y comprueba:
//   1) Abrir teclado (vv 900->620): cajÃ³n sube a bottom ~280, clase
//      teclado-abierto puesta, nav oculto, input visible sobre la lÃ­nea.
//   2) Barrido suave: valores intermedios de bottom mientras el vv cambia.
//   3) Cerrar del todo (vv ->900): restauraciÃ³n AL INSTANTE (sin transiciÃ³n
//      que deje ver la pÃ¡gina) -> bottom 0, clase quitada, nav visible.
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
      const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Ã“leo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Ã“leo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: 'â€”', certificado: 'â€”', firma: 'â€”', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
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
// estÃ¡ conectado el listener vÃ­a init->setupKeyboardDrawer al abrir el cajÃ³n)
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
        const list = document.getElementById('comentarios-lista');
        const lr = list.getBoundingClientRect();
        const area = d.querySelector('.comentarios-input-area');
        const ar = area.getBoundingClientRect();
        const input = document.getElementById('comentarios-input');
        const ir = input.getBoundingClientRect();
        let lift = 0;
        const tr = getComputedStyle(area).transform;
        if (tr && tr !== 'none') { const m = tr.match(/matrix\(([^)]+)\)/); if (m) lift = -parseFloat(m[1].split(',')[5]); }
        const vv = window.visualViewport;
        const keyboardTop = Math.round(vv.height + (vv.offsetTop || 0));
        return JSON.stringify({
            drawerTop: Math.round(r.top), drawerBottom: Math.round(r.bottom),
            listTop: Math.round(lr.top), listBottom: Math.round(lr.bottom),
            lift: Math.round(lift), areaBottom: Math.round(ar.bottom),
            inputBottom: Math.round(ir.bottom), keyboardTop,
            noHayPagina: r.bottom + 0.5 >= keyboardTop,
            inputVisible: ir.bottom <= keyboardTop + 1,
            tecladoAbierto: document.body.classList.contains('teclado-abierto'),
            navHidden: nav.classList.contains('hidden') || getComputedStyle(nav).display === 'none',
            vvH: vv.height
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
console.log('\n[estado inicial, cajón abierto, sin teclado]');
let st = await estado(); console.log(' ', st);
const base = JSON.parse(st);

// 1) Abrir teclado con un solo evento (vv ya en 620)
console.log('\n--- teclado ABIERTO (vv 900->620) ---');
await evalJs(`__setVvH(620)`);
await sleep(520);
st = await estado(); console.log(' ', st);
let fails = checks(st, {
    drawerTop: base.drawerTop,          // el cajón NO se mueve
    drawerBottom: base.drawerBottom,
    listTop: base.listTop,              // la lista NO se reordena ni se mueve
    listBottom: base.listBottom,
    tecladoAbierto: true,
    navHidden: true,
    noHayPagina: true,
    lift: (v) => v > 100                // solo sube el área del input
});
console.log(fails.length ? '  ? ' + fails.join(' | ') : '  ? cajón y lista inmóviles; solo sube el input; nav oculto');
ok = ok && fails.length === 0;
{
    const e = JSON.parse(st);
    console.log(e.inputVisible ? `  ? input visible (borde ${e.inputBottom} <= teclado ${e.keyboardTop})` : `  ? input tras el teclado: ${e.inputBottom}`);
    ok = ok && e.inputVisible;
    const aire = e.keyboardTop - e.inputBottom;
    console.log(aire >= 8 && aire <= 20 ? `  ? aire bajo el input: ${aire}px` : `  ? aire incorrecto: ${aire}px`);
    ok = ok && aire >= 8 && aire <= 20;
}

// 2) Barrido progresivo: el lift sube de forma monótona y nada más se mueve
console.log('\n--- barrido progresivo 900->840->760->690->620 ---');
await evalJs(`__setVvH(900)`);
await sleep(520);
const lifts = [];
let nadaSeMueve = true;
for (const h of [840, 760, 690, 620]) {
    await evalJs(`__setVvH(${h})`);
    await sleep(90);
    const e = JSON.parse(await estado());
    lifts.push(e.lift);
    if (e.drawerTop !== base.drawerTop || e.drawerBottom !== base.drawerBottom ||
        e.listTop !== base.listTop || e.listBottom !== base.listBottom) nadaSeMueve = false;
}
console.log(' lifts: ' + lifts.join(', '));
const crece = lifts.every((x, i) => i === 0 || x >= lifts[i - 1]);
console.log(crece ? '  ? el área del input sube progresivamente' : '  ? movimiento no monótono');
console.log(nadaSeMueve ? '  ? el cajón y la lista permanecen exactamente en su sitio' : '  ? algo más se movió');
ok = ok && crece && nadaSeMueve;

// 3) Cerrar el teclado de golpe
console.log('\n--- teclado CERRADO (vv 620->900) ---');
await evalJs(`__setVvH(900)`);
await sleep(520);
st = await estado(); console.log(' ', st);
fails = checks(st, {
    drawerTop: base.drawerTop, drawerBottom: base.drawerBottom,
    listTop: base.listTop, listBottom: base.listBottom,
    lift: 0, tecladoAbierto: false, navHidden: false
});
console.log(fails.length ? '  ? ' + fails.join(' | ') : '  ? todo restaurado (input abajo, nav visible)');
ok = ok && fails.length === 0;

// 4) Cerrar el cajón con el teclado abierto y reabrirlo
console.log('\n--- cerrar cajón con teclado abierto y reabrir ---');
await evalJs(`__setVvH(620)`);
await sleep(520);
st = await estado(); console.log('  abierto con teclado: ', st);
await evalJs(`document.getElementById('comentarios-close').click()`);
await sleep(500);
const oculto = await evalJs(`document.getElementById('comentarios-drawer').classList.contains('hidden')`);
console.log(oculto ? '  ? cajón cerrado' : '  ? no se ocultó');
ok = ok && oculto;
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(600);
st = await estado(); console.log('  reabierto con teclado arriba: ', st);
fails = checks(st, {
    drawerTop: base.drawerTop, drawerBottom: base.drawerBottom,
    tecladoAbierto: true, navHidden: true, noHayPagina: true,
    lift: (v) => v > 100
});
console.log(fails.length ? '  ? ' + fails.join(' | ') + ' (no se levantó al reabrir)' : '  ? se levantó solo al reabrir con el teclado abierto');
ok = ok && fails.length === 0;
await evalJs(`__setVvH(900)`);
await sleep(520);
st = await estado(); console.log('  teclado cerrado tras reabrir: ', st);
fails = checks(st, { lift: 0, tecladoAbierto: false });
console.log(fails.length ? '  ? ' + fails.join(' | ') : '  ? restaurado');
ok = ok && fails.length === 0;

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: PROBLEMAS');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);