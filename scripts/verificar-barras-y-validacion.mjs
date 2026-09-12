// Verifica el arreglo de tres hallazgos:
//
//  INT-4  Con el teclado abierto, chat.js le pone display:none al nav; su rect
//         pasa a 0 y las barras de creación se calculaban con
//         "innerHeight - 0" => se iban ~840px fuera de la pantalla.
//  CAV-4  El formulario es novalidate y se puede guardar desde cualquier paso:
//         se podía crear una obra sin título, año, precio ni descripción.
//  CAV-7  Los botones de "Limpiar campos" (Cavents #obra-step-limpiar y Problogs
//         #problog-nav-limpiar) vaciaban sin confirmar.
//
// Uso: node scripts/verificar-barras-y-validacion.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9309;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-bar-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const page = await (async () => {
  try { return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`); }
  catch { return (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || '').slice(0, 300)); return null; }
  return r.result?.result?.value;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      window.__posts = [];
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          if (method === 'POST' && u.endsWith('/obras')) {
              const body = init && init.body;
              const reg = { titulo: body && body.get ? body.get('titulo') : null };
              window.__posts.push(reg);
              await new Promise(r => setTimeout(r, 800));
              return json({ success: true, id: 99 });
          }
          if (method === 'PUT' || method === 'POST') return json({ success: true, id: 99 });
          if (u.includes('/api/artistas/mis-obras')) return json({ success: true, obras: [], total: 0 });
          if (u.includes('/obras')) return json([]);
          if (u.includes('/problogs')) return json({ success: true, problogs: [], total: 0, page: 1, limit: 10 });
          if (u.includes('heartbeat')) return json({ ok: true });
          if (u.includes('mis-reacciones')) return json({ reacciones: [] });
          if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
          return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
      };
  })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1500);

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) console.log(`  PASS  ${nombre}`);
  else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}

// Abrir el panel de creación por el flujo real ("+")
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1000);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1600);

// ============================================================
// INT-4 — barras y nav oculto (teclado)
// ============================================================
console.log('=== INT-4: barras de creación con el teclado abierto ===');
const LEER = `(() => {
    const datos = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { bottom: el.style.bottom || '', top: Math.round(r.top), alto: Math.round(r.height),
                 enPantalla: r.height > 0 && r.top < window.innerHeight && r.bottom > 0 };
    };
    const nav = document.getElementById('toggle-panel');
    const navRect = nav.getBoundingClientRect();
    return JSON.stringify({
        navVisible: getComputedStyle(nav).display !== 'none' && navRect.height > 0,
        innerHeight: window.innerHeight,
        stepBar: datos('obra-step-bar'),
        tabs: datos('crear-tabs'),
        fondo: datos('crear-fondo'),
        problogBar: datos('problog-nav-bar')
    });
})()`;
await evalJs(`window.dispatchEvent(new Event('resize'))`);
await sleep(400);
const A = JSON.parse(await evalJs(LEER));
console.log('   A (nav visible): ' + JSON.stringify({ stepBar: A.stepBar.bottom, tabs: A.tabs.bottom, fondo: A.fondo.bottom }));
const num = (s) => parseFloat(String(s).replace('px', '')) || 0;
check('con el nav visible las barras están pegadas abajo', num(A.stepBar.bottom) <= 150 && num(A.tabs.bottom) <= 150 && num(A.fondo.bottom) <= 150, JSON.stringify(A.stepBar.bottom + '/' + A.tabs.bottom + '/' + A.fondo.bottom));
check('la barra de pasos se ve en pantalla', A.stepBar.enPantalla === true, JSON.stringify(A.stepBar));
check('las pestañas se ven en pantalla', A.tabs.enPantalla === true, JSON.stringify(A.tabs));

// Teclado abierto: chat.js oculta el nav y el layout se redimensiona
await evalJs(`document.body.classList.add('teclado-abierto'); window.dispatchEvent(new Event('resize'));`);
await sleep(400);
const B = JSON.parse(await evalJs(LEER));
console.log('   B (teclado):     ' + JSON.stringify({ nav: B.navVisible, stepBar: B.stepBar.bottom, tabs: B.tabs.bottom, fondo: B.fondo.bottom }));
check('el nav queda oculto (como con el teclado)', B.navVisible === false, JSON.stringify(B.navVisible));
check('las barras NO se van fuera de la pantalla', num(B.stepBar.bottom) <= 150 && num(B.tabs.bottom) <= 150 && num(B.fondo.bottom) <= 150, JSON.stringify(B.stepBar.bottom + '/' + B.tabs.bottom + '/' + B.fondo.bottom));
check('la barra de pasos sigue en pantalla con el teclado', B.stepBar.enPantalla === true, JSON.stringify(B.stepBar));
check('las pestañas siguen en pantalla con el teclado', B.tabs.enPantalla === true, JSON.stringify(B.tabs));
check('el fondo de las barras sigue en pantalla', B.fondo.enPantalla === true, JSON.stringify(B.fondo));
// La barra del desplegable "Mis Cavents" usaba la misma fórmula
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(900);
const barraDesp = JSON.parse(await evalJs(`(() => {
    const b = document.getElementById('obra-cavents-bar');
    if (!b) return JSON.stringify({ existe: false });
    const r = b.getBoundingClientRect();
    return JSON.stringify({ existe: true, bottom: b.style.bottom || '', top: Math.round(r.top),
                            enPantalla: r.height > 0 && r.top < window.innerHeight && r.bottom > 0 });
})()`));
console.log('   barra Mis Cavents: ' + JSON.stringify(barraDesp));
check('la barra de "Mis Cavents" tampoco se va fuera con el teclado',
  barraDesp.existe === true && num(barraDesp.bottom) <= 250, JSON.stringify(barraDesp));
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(400);

// Al cerrar el teclado vuelve al estado normal
await evalJs(`document.body.classList.remove('teclado-abierto'); window.dispatchEvent(new Event('resize'));`);
await sleep(400);
const C = JSON.parse(await evalJs(LEER));
check('al cerrar el teclado todo vuelve a su sitio', C.stepBar.bottom === A.stepBar.bottom && C.tabs.bottom === A.tabs.bottom, JSON.stringify({ A: A.stepBar.bottom, C: C.stepBar.bottom }));

// ============================================================
// CAV-4 — obligatorios
// ============================================================
console.log('\n=== CAV-4: no se puede guardar sin los campos obligatorios ===');
// Una imagen (para que no salte antes el aviso de imágenes) pero sin rellenar nada
await evalJs(`(async () => {
    const blob = await new Promise((res) => {
        const cv = document.createElement('canvas'); cv.width = 800; cv.height = 1000;
        const x = cv.getContext('2d'); x.fillStyle = '#cc3344'; x.fillRect(0, 0, 800, 1000);
        cv.toBlob(res, 'image/jpeg', 0.85);
    });
    const file = new File([blob], 'prueba.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(file);
    const inp = document.getElementById('input-imagen-0');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
for (let i = 0; i < 20; i++) { await sleep(300); if (await evalJs(`document.querySelectorAll('#carrusel-track .carrusel-slide').length > 1`)) break; }
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(1200);
const vacio = JSON.parse(await evalJs(`JSON.stringify({
    posts: window.__posts.length,
    aviso: document.body.innerText.includes('obligatorios'),
    pasoBasica: !document.querySelector('.form-section[data-section="basica"]').classList.contains('hidden')
})`));
console.log('   ' + JSON.stringify(vacio));
check('no se guardó nada con el formulario vacío', vacio.posts === 0, `posts=${vacio.posts}`);
check('se avisa de los campos obligatorios', vacio.aviso === true);
check('el formulario salta al paso del primer campo que falta (Información Básica)', vacio.pasoBasica === true);

// Rellenar TODO lo obligatorio (los selects con una opción real) y guardar
const rellenado = await evalJs(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('input-titulo', 'Obra completa');
    set('input-ano', '2024');
    set('input-precio', '120');
    set('input-ancho', '80');
    set('input-alto', '100');
    set('input-descripcion-artistica', 'Una descripcion de prueba.');
    set('input-etiquetas', 'arte, prueba');
    const selects = ['input-status', 'input-estado-obra', 'input-descripcion-tecnica', 'input-soporte',
                     'input-marcos', 'input-procedencia', 'input-certificado', 'input-firma', 'input-conservacion'];
    const sinOpcion = [];
    selects.forEach((id) => {
        const sel = document.getElementById(id);
        const opt = Array.from(sel.options).find(o => o.value);
        if (opt) sel.value = opt.value; else sinOpcion.push(id);
    });
    return JSON.stringify({ sinOpcion });
})()`);
console.log('   selects sin opción: ' + rellenado);
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(3000);
const completo = JSON.parse(await evalJs(`JSON.stringify({ posts: window.__posts, aviso: document.body.innerText.includes('obligatorios') })`));
console.log('   ' + JSON.stringify(completo));
check('con todo relleno la obra SÍ se guarda (sin falsos positivos)', completo.posts.length === 1, JSON.stringify(completo.posts));
check('el título enviado es el correcto', completo.posts[0] && completo.posts[0].titulo === 'Obra completa', JSON.stringify(completo.posts[0]));

// ============================================================
// CAV-7 — limpiar con confirmación
// ============================================================
console.log('\n=== CAV-7: "Limpiar campos" pide confirmación ===');
await evalJs(`(() => { const t = document.getElementById('input-titulo'); t.value = 'No me borres'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await evalJs(`document.getElementById('obra-step-limpiar')?.click()`);
await sleep(500);
const hayDialogo = await evalJs(`!!document.querySelector('.confirm-overlay')`);
check('al pulsar limpiar aparece la confirmación', hayDialogo === true);
await evalJs(`document.querySelector('.confirm-overlay .confirm-btn-cancel')?.click()`);
await sleep(600);
check('si se cancela, no se borra lo escrito', (await evalJs(`document.getElementById('input-titulo').value`)) === 'No me borres');
await evalJs(`document.getElementById('obra-step-limpiar')?.click()`);
await sleep(500);
await evalJs(`document.querySelector('.confirm-overlay .confirm-btn-ok')?.click()`);
await sleep(700);
check('si se acepta, el formulario queda vacío', (await evalJs(`document.getElementById('input-titulo').value`)) === '');

console.log('\n=== CAV-7b: lo mismo en el editor de Problogs ===');
await evalJs(`document.getElementById('tab-problogs')?.click()`);
await sleep(600);
await evalJs(`(() => { const t = document.getElementById('problog-titulo'); t.value = 'Titulo de problog'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await evalJs(`document.getElementById('problog-nav-limpiar')?.click()`);
await sleep(500);
check('el limpiar de Problogs también confirma', (await evalJs(`!!document.querySelector('.confirm-overlay')`)) === true);
await evalJs(`document.querySelector('.confirm-overlay .confirm-btn-cancel')?.click()`);
await sleep(600);
check('al cancelar se conserva el título del problog', (await evalJs(`document.getElementById('problog-titulo').value`)) === 'Titulo de problog');

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
