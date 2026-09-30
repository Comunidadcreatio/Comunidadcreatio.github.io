// Verifica los ESTADOS de los campos del formulario de auth: es lo que gobiernan las reglas
// de :invalid / :valid / .input-error de auth.css (las que llevan !important y selectores con
// id para ganar por especificidad).
//
// POR QUE EXISTE: la foto de estilos mide los campos VACIOS (estado :invalid), pero nadie
// medía el estado RELLENO (:valid) ni el de error (.input-error), que es exactamente lo que
// esas reglas controlan. Sin esta prueba, quitar el !important sería a ciegas.
//
// Lo que comprueba (la INTENCION, no un color concreto):
//   1. Un campo obligatorio VACIO se ve GRIS: sin rojo y sin verde (el comentario de auth.css
//      dice "mismo gris que normal"), sin sombra y sin outline.
//   2. Un campo RELLENO y valido: borde VERDE (exito) y sin sombra.
//   3. Con la clase .input-error: ROJO, sea el campo valido o no (la clase tiene que ganar).
//   4. Lo mismo en modo OSCURO, y alli el gris neutro NO puede ser el mismo que en claro.
//
// Ademas imprime los valores calculados de cada estado: sirve para comparar dos corridas
// (antes/despues de tocar el CSS) y ver que no se movio ni un valor.
//
// Uso: node scripts/verificar-estados-inputs-auth.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9793;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'estados-auth-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=393,852', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null;
const logs = [];
const salir = (c) => { try { ws?.close(); } catch {} try { chrome.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(c); };
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PUERTO}/json/version`); break; } catch { await sleep(250); } }
const pagina = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PUERTO}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPCION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 140));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
// El backend no se toca: auth-logic.js comprueba sesion al cargar y no hace falta para medir.
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try { localStorage.removeItem('artistaData'); localStorage.removeItem('creatio_auth_token_persist'); } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('heartbeat')) return json({ ok: true });
            return json({ success: true, no_leidas: 0, count: 0, usuario: null });
        };
    })();`
});

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
    pruebas++;
    if (condicion) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
}

// --- Utilidades de color (en Node, sobre lo que devuelve la pagina) ---
const rgb = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').map((x) => parseFloat(x)) : null; };
const esNeutro = (c) => { const n = rgb(c); return !!n && Math.abs(n[0] - n[1]) < 12 && Math.abs(n[1] - n[2]) < 12; };
const esVerde = (c) => { const n = rgb(c); return !!n && n[1] > n[0] + 20 && n[1] > n[2] + 20; };
const esRojo = (c) => { const n = rgb(c); return !!n && n[0] > n[1] + 40 && n[0] > n[2] + 40; };

// Lee el estado calculado de un campo. `visible` es solo informativo.
const LEER = (sel) => `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return 'null';
    const cs = getComputedStyle(el);
    return JSON.stringify({
        sel: ${JSON.stringify(sel)},
        borde: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
        color: cs.borderTopColor,
        sombra: cs.boxShadow,
        fondo: cs.backgroundColor,
        outline: cs.outlineStyle,
        requerido: !!el.required,
        claseError: el.classList.contains('input-error')
    });
})()`;

const MEDIR = async (sel) => JSON.parse(await evalJs(LEER(sel)));
const PONER = (sel, valor) => evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return 'no-existe';
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valor)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
})()`);
const CLASE_ERROR = (sel, activa) => evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return 'no-existe';
    el.classList.toggle('input-error', ${activa ? 'true' : 'false'});
    return el.className;
})()`);
const TEMA = (t) => evalJs(`(() => { try { localStorage.setItem('theme', '${t}'); } catch (_) {} document.documentElement.setAttribute('data-theme', '${t}'); return document.documentElement.getAttribute('data-theme'); })()`);

const EMAIL = '#login-email';
const PASS = '#login-pass';
const SELECT = '#reg-rol';

const linea = (etiqueta, m) => `   ${etiqueta.padEnd(26)} borde=${m.borde}  sombra=${m.sombra}  fondo=${m.fondo}  outline=${m.outline}  error=${m.claseError}`;

await send('Page.navigate', { url: URL_BASE + 'auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('login-form')`) === true) break; await sleep(300); }
await sleep(800);
// El formulario se abre como lo abre el usuario (el boton de la portada).
await evalJs(`document.getElementById('btn-mostrar-login')?.click()`);
await sleep(400);

const temaFijado = await TEMA('light');
if (temaFijado !== 'light') console.log(`   OJO: no se pudo fijar el tema claro (quedo ${temaFijado})`);
await sleep(400);

console.log('=== 1. Modo CLARO ===');
const emailVacio = await MEDIR(EMAIL);
console.log(linea('email vacio (invalid)', emailVacio));
check('el campo obligatorio vacio NO se marca en rojo', !esRojo(emailVacio.color), emailVacio.color);
check('ni en verde: se ve GRIS (neutro)', esNeutro(emailVacio.color), emailVacio.color);
check('sin sombra', emailVacio.sombra === 'none', emailVacio.sombra);
check('sin outline', emailVacio.outline === 'none', emailVacio.outline);
const passVacio = await MEDIR(PASS);
console.log(linea('contrasena vacia', passVacio));
check('la contrasena vacia tambien se ve neutra', esNeutro(passVacio.color), passVacio.color);
const selectVacio = await MEDIR(SELECT);
console.log(linea('select obligatorio vacio', selectVacio));
check('el select obligatorio vacio se ve neutro', esNeutro(selectVacio.color), selectVacio.color);

await PONER(EMAIL, 'artista@creatio.test');
await sleep(250);
const emailValido = await MEDIR(EMAIL);
console.log(linea('email relleno (valid)', emailValido));
check('el campo relleno y valido se pone VERDE', esVerde(emailValido.color), emailValido.color);
check('y sin sombra', emailValido.sombra === 'none', emailValido.sombra);
check('y con fondo propio (no transparente)', emailValido.fondo !== 'rgba(0, 0, 0, 0)', emailValido.fondo);

await CLASE_ERROR(EMAIL, true);
await sleep(250);
const validoConError = await MEDIR(EMAIL);
console.log(linea('valido + .input-error', validoConError));
check('con .input-error manda el ROJO aunque el campo sea valido', esRojo(validoConError.color), validoConError.color);

await PONER(EMAIL, '');
// El caso del campo VACIO marcado: primero se vacia y DESPUES se marca, que es el orden real
// (la app quita la marca en cuanto el campo cambia y la vuelve a poner al validar). Al reves
// se mediria un estado que no existe: la clase ya no estaria puesta.
await CLASE_ERROR(EMAIL, true);
await sleep(250);
const vacioConError = await MEDIR(EMAIL);
console.log(linea('vacio + .input-error', vacioConError));
check('vacio + .input-error tambien es ROJO', esRojo(vacioConError.color), vacioConError.color);
await CLASE_ERROR(EMAIL, false);

console.log('\n=== 2. Modo OSCURO ===');
const temaOscuro = await TEMA('dark');
if (temaOscuro !== 'dark') console.log(`   OJO: no se pudo fijar el tema oscuro (quedo ${temaOscuro})`);
await sleep(600);
const emailOscuro = await MEDIR(EMAIL);
console.log(linea('email vacio (invalid)', emailOscuro));
check('en oscuro el campo vacio sigue siendo GRIS (ni rojo ni verde)', esNeutro(emailOscuro.color), emailOscuro.color);
check('y el gris de oscuro NO es el de claro (si no, no se veria)', emailOscuro.color !== emailVacio.color,
    `${emailVacio.color} vs ${emailOscuro.color}`);
const passOscuro = await MEDIR(PASS);
console.log(linea('contrasena vacia', passOscuro));
check('la contrasena vacia tambien es neutra en oscuro', esNeutro(passOscuro.color), passOscuro.color);

await PONER(EMAIL, 'artista@creatio.test');
await sleep(250);
const validoOscuro = await MEDIR(EMAIL);
console.log(linea('email relleno (valid)', validoOscuro));
check('en oscuro el campo valido tambien se pone VERDE', esVerde(validoOscuro.color), validoOscuro.color);

await CLASE_ERROR(EMAIL, true);
await sleep(250);
const errorOscuro = await MEDIR(EMAIL);
console.log(linea('valido + .input-error', errorOscuro));
check('en oscuro .input-error tambien manda ROJO', esRojo(errorOscuro.color), errorOscuro.color);
await CLASE_ERROR(EMAIL, false);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
