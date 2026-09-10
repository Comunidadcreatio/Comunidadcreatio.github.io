// Prueba INTEGRACIÓN del manejo de teclado del cajón de comentarios.
// Parchea window.visualViewport (height y offsetTop) y dispara resize para que
// corra el MISMO código real (setupKeyboardDrawer -> ajustarTecladoDrawer) y
// comprueba:
//   1) Con el teclado abierto el cajón y la LISTA no se mueven ni se reordenan;
//      solo sube el área del input y el nav queda oculto.
//   2) El input queda visible, con ~12px de aire sobre el teclado.
//   3) Desplazamiento del viewport visual (caso real: off=288): en pantalla el
//      cajón sigue en su sitio (se compensa).
//   4) Al cerrar el teclado todo vuelve a su sitio.
//   5) REGRESIÓN: un toque simple NO cierra el cajón aunque su transform tenga
//      la compensación del viewport; un arrastre >80px sí lo cierra.
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
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 250)); return null; }
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) {}
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#cc3344');
      const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Oleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '-', certificado: '-', firma: '-', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
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
await sleep(1500);

const patch = await evalJs(`(() => {
    try {
        const vv = window.visualViewport;
        let h = vv.height, off = 0;
        Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
        Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => off });
        window.__setVv = (x, o) => { h = x; off = o || 0; window.dispatchEvent(new Event('resize')); };
        return 'ok actual=' + h;
    } catch (e) { return 'FAIL ' + e.message; }
})()`);
console.log('parche vv:', patch);

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
        if (tr && tr !== 'none') { const m = tr.match(/matrix\\(([^)]+)\\)/); if (m) lift = -parseFloat(m[1].split(',')[5]); }
        const vv = window.visualViewport;
        const off = vv.offsetTop || 0;
        const keyboardTop = Math.round(vv.height + off);
        const header = document.getElementById('main-header');
        const hr = header ? header.getBoundingClientRect() : null;
        const main = document.getElementById('main-content');
        const mr = main ? main.getBoundingClientRect() : null;
        const velo = document.getElementById('velo-teclado');
        return JSON.stringify({
            veloVisible: velo ? !velo.classList.contains('hidden') : null,
            drawerTop: Math.round(r.top), drawerBottom: Math.round(r.bottom),
            drawerScreenTop: Math.round(r.top - off),
            listTop: Math.round(lr.top), listBottom: Math.round(lr.bottom),
            listScreenTop: Math.round(lr.top - off), listScreenBottom: Math.round(lr.bottom - off),
            headerScreenTop: hr ? Math.round(hr.top - off) : null,
            mainScreenTop: mr ? Math.round(mr.top - off) : null,
            lift: Math.round(lift), areaBottom: Math.round(ar.bottom),
            inputBottom: Math.round(ir.bottom), keyboardTop,
            noHayPagina: r.bottom + 0.5 >= keyboardTop,
            inputVisible: ir.bottom - off <= vv.height + 1,
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
console.log('\n[estado inicial, cajon abierto, sin teclado]');
let st = await estado(); console.log(' ', st);
const base = JSON.parse(st);

console.log('\n--- teclado ABIERTO (vv 900->620) ---');
await evalJs(`__setVv(620, 0)`);
await sleep(520);
st = await estado(); console.log(' ', st);
let fails = checks(st, {
    drawerTop: base.drawerTop,
    drawerBottom: base.drawerBottom,
    listTop: base.listTop,
    listBottom: base.listBottom,
    tecladoAbierto: true,
    navHidden: true,
    noHayPagina: true,
    lift: (v) => v > 100
});
console.log(fails.length ? '  FALLO ' + fails.join(' | ') : '  OK cajon y lista inmoviles; solo sube el input; nav oculto');
ok = ok && fails.length === 0;
{
    const e = JSON.parse(st);
    console.log(e.inputVisible ? '  OK input visible sobre el teclado' : '  FALLO input tras el teclado: ' + e.inputBottom);
    ok = ok && e.inputVisible;
    const aire = e.keyboardTop - e.inputBottom;
    console.log(aire >= 0 && aire <= 20 ? '  OK aire bajo el input: ' + aire + 'px' : '  FALLO aire incorrecto: ' + aire + 'px');
    ok = ok && aire >= 0 && aire <= 20;
}

console.log('\n--- desplazamiento del viewport (vv=551 off=288, como el dispositivo) ---');
await evalJs(`__setVv(551, 288)`);
await sleep(520);
st = await estado(); console.log(' ', st);
fails = checks(st, {
    drawerScreenTop: base.drawerTop,
    listScreenTop: base.listTop,
    headerScreenTop: base.headerScreenTop,   // la cabecera de detras NO sube
    mainScreenTop: base.mainScreenTop,       // el contenido de detras NO sube
    tecladoAbierto: true,
    navHidden: true,
    inputVisible: true,
    veloVisible: true,          // con desplazamiento, se cubre la franja superior
    lift: (v) => v > 100
});
console.log(fails.length ? '  FALLO ' + fails.join(' | ') : '  OK compensado y velo puesto: nada de detras puede verse moverse');
ok = ok && fails.length === 0;
console.log('\n--- barrido progresivo 900->840->760->690->620 ---');
await evalJs(`__setVv(900, 0)`);
await sleep(520);
const lifts = [];
let nadaSeMueve = true;
for (const h of [840, 760, 690, 620]) {
    await evalJs(`__setVv(${h}, 0)`);
    await sleep(90);
    const e = JSON.parse(await estado());
    lifts.push(e.lift);
    if (e.drawerScreenTop !== base.drawerTop || e.drawerBottom !== base.drawerBottom ||
        e.listTop !== base.listTop || e.listBottom !== base.listBottom) nadaSeMueve = false;
}
console.log(' lifts: ' + lifts.join(', '));
const crece = lifts.every((x, i) => i === 0 || x >= lifts[i - 1]);
console.log(crece ? '  OK el area del input sube progresivamente' : '  FALLO movimiento no monotono');
console.log(nadaSeMueve ? '  OK el cajon y la lista permanecen en su sitio' : '  FALLO algo mas se movio');
ok = ok && crece && nadaSeMueve;

console.log('\n--- teclado CERRADO (vv 620->900) ---');
await evalJs(`__setVv(900, 0)`);
await sleep(520);
st = await estado(); console.log(' ', st);
fails = checks(st, {
    drawerTop: base.drawerTop, drawerBottom: base.drawerBottom,
    listTop: base.listTop, listBottom: base.listBottom,
    lift: 0, tecladoAbierto: false, navHidden: false, veloVisible: false
});
console.log(fails.length ? '  FALLO ' + fails.join(' | ') : '  OK todo restaurado (input abajo, nav visible)');
ok = ok && fails.length === 0;

console.log('\n--- regresion: toque simple con transform de compensacion ---');
await evalJs(`(() => {
    const d = document.getElementById('comentarios-drawer');
    d.style.transform = 'translateY(288px)';
    const mkTouch = (y) => new Touch({ identifier: 1, target: d, clientX: 20, clientY: y });
    const ev = (type, touches) => new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: touches, targetTouches: touches });
    d.dispatchEvent(ev('touchstart', [mkTouch(300)]));
    d.dispatchEvent(ev('touchend', []));
    return 'ok';
})()`);
await sleep(450);
const sigueVisible = await evalJs(`document.getElementById('comentarios-drawer').classList.contains('visible')`);
console.log(sigueVisible ? '  OK el toque simple NO cierra el cajon' : '  FALLO el cajon se cerro con un toque simple');
ok = ok && sigueVisible;

console.log('\n--- arrastre real (>80px) si debe cerrar ---');
await evalJs(`(() => {
    const d = document.getElementById('comentarios-drawer');
    d.style.transform = '';
    const mkTouch = (y) => new Touch({ identifier: 1, target: d, clientX: 20, clientY: y });
    const ev = (type, touches) => new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: touches, targetTouches: touches });
    d.dispatchEvent(ev('touchstart', [mkTouch(300)]));
    d.dispatchEvent(ev('touchmove', [mkTouch(500)]));
    d.dispatchEvent(ev('touchend', []));
    return 'ok';
})()`);
await sleep(700);
const cerrado = await evalJs(`document.getElementById('comentarios-drawer').classList.contains('hidden')`);
console.log(cerrado ? '  OK el arrastre si cierra el cajon' : '  FALLO el arrastre no cierra');
ok = ok && cerrado;

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: PROBLEMAS');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
