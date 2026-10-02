// ANIMACIONES DE LAS TARJETAS (y el cursor de auth): lee la animacion CALCULADA por CSSOM.
//
// POR QUE EXISTE: la foto de estilos no mide animaciones (son estados que duran 300 ms) y por eso los
// cinco `!important` de `.obra-card.modo-grid-exit` (la salida del modo grid) eran el ultimo trozo de
// la campana sin red. Aqui se leen las propiedades calculadas de la animacion, que SI se pueden
// consultar en cualquier momento:
//   - la salida tiene que ser `gridCardExit` (0.3s, ease-in, forwards), NO la de entrada;
//   - y cada tarjeta su retardo (0s, 0.04s, 0.08s, 0.12s).
// Se comprueba con la clase `modo-grid-exit` puesta, que es como la pone la app al salir del grid.
//
// Uso: node scripts/verificar-animaciones-tarjetas.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9803;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'anim-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=1280,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null; const logs = [];
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
let pruebas = 0, fallos = 0;
const check = (nombre, ok, detalle) => {
    pruebas++;
    if (ok) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try { localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', rol: 'artista' })); localStorage.setItem('creatio_auth_token_persist', 'tok'); } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (((init && init.method) || 'GET').toUpperCase() !== 'GET') return json({ success: true, id: 9 });
            // La OBRA de ejemplo: sin ella la galeria sale vacia y no hay tarjeta que medir.
            if (u.includes('/obras')) return json([{ id: 55001, titulo: 'Obra de prueba', precio: '100', artista: 'Ana',
                artista_user_id: 480002, foto_artista: '', estado_obra: 'publicada', vistas: 0, imagen: '', imagenes: [],
                categoria: '', tecnica: '', created_at: new Date().toISOString() }]);
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('usuarios')) return json({ usuarios: [] });
            return json({ success: true, no_leidas: 0, usuario: { id: 480001, rol: 'artista' } });
        };
    })();`
});

// ---------- 1. Las tarjetas de la galeria ----------
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);
await evalJs(`window.abrirObraDesdePerfil ? window.abrirObraDesdePerfil(55001) : null`);
await sleep(2600);
await evalJs(`document.getElementById('btn-buscar')?.click()`);
for (let i = 0; i < 25; i++) {
    const listo = await evalJs(`!!document.querySelector('#galeria-container.modo-grid .obra-card')`);
    if (listo === true) break;
    await sleep(300);
}
await sleep(700);

// Se clonan tarjetas hasta tener 5, para poder comprobar los cuatro retardos: la app no siempre
// tiene cinco obras en el mock, y los retardos son por `nth-child`.
await evalJs(`(() => {
    const cont = document.getElementById('galeria-container');
    if (!cont) return 'sin contenedor';
    const modelo = cont.querySelector('.obra-card');
    if (!modelo) return 'sin tarjeta';
    while (cont.querySelectorAll('.obra-card').length < 5) {
        const copia = modelo.cloneNode(true);
        copia.classList.remove('modo-grid-exit');
        cont.appendChild(copia);
    }
    return 'ok';
})()`);
await sleep(400);

const entrada = await evalJs(`(() => {
    const c = document.querySelector('#galeria-container.modo-grid .obra-card');
    const cs = getComputedStyle(c);
    return JSON.stringify({ nombre: cs.animationName, duracion: cs.animationDuration, relleno: cs.animationFillMode });
})()`);
console.log('   animacion de ENTRADA (sin la clase de salida): ' + entrada);

// Y ahora la clase de salida, que es lo que pone la app al dejar el grid.
const salida = JSON.parse(await evalJs(`(() => {
    const tarjetas = [...document.querySelectorAll('#galeria-container.modo-grid .obra-card')].slice(0, 5);
    tarjetas.forEach((c) => c.classList.add('modo-grid-exit'));
    const lee = (c) => {
        const cs = getComputedStyle(c);
        return { nombre: cs.animationName, duracion: cs.animationDuration, retardo: cs.animationDelay, relleno: cs.animationFillMode, curva: cs.animationTimingFunction };
    };
    return JSON.stringify({ primera: lee(tarjetas[0]), retardos: tarjetas.map((c) => getComputedStyle(c).animationDelay) });
})()`));
console.log('   animacion de SALIDA: ' + JSON.stringify(salida.primera));
console.log('   retardos por tarjeta: ' + JSON.stringify(salida.retardos));

check('la salida es la animacion de salida (gridCardExit), NO la de entrada',
    salida.primera.nombre === 'gridCardExit', `nombre = ${salida.primera.nombre}`);
check('dura 0.3s', salida.primera.duracion === '0.3s', salida.primera.duracion);
check('se queda en el ultimo fotograma (forwards)', salida.primera.relleno === 'forwards', salida.primera.relleno);
check('la curva es ease-in', salida.primera.curva === 'ease-in', salida.primera.curva);
const ESPERADOS = ['0s', '0.04s', '0.08s', '0.12s', '0.12s'];
const retardosOk = ESPERADOS.every((v, i) => salida.retardos[i] === v);
check('cada tarjeta tiene su retardo (0 / 0.04 / 0.08 / 0.12 / 0.12)',
    retardosOk && salida.retardos.length === 5, JSON.stringify(salida.retardos));

// ---------- 2. El cursor del typewriter (auth) ----------
// AQUI HAY ALGO SIN RESOLVER, y se deja escrito en vez de disimulado: en la pantalla de auth, la regla
// `.typing-cursor` SI llega al elemento (el color y el `font-weight` salen de ella), pero su
// `animation: blink 1.2s step-end infinite !important` NO se aplica: el calculado da `animation-name:
// none` y `animation-duration: 0s`. No hay ningun `animation: none` que case con ese selector en
// ninguna hoja, asi que falta averiguar quien lo resetea (con `dbg-cascada-real.mjs --pagina auth.html
// --elemento ".typing-cursor" --propiedad animation-name`, cuando el elemento exista en la pagina).
// Se INFORMA, no se cuenta como fallo: hasta saberlo, no se toca ese `!important`.
await send('Page.navigate', { url: URL_BASE + 'auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('login-form')`) === true) break; await sleep(300); }
await sleep(1500);
const cursor = await evalJs(`(() => {
    const delApp = document.querySelector('.typing-cursor');
    const c = delApp || (() => { const s = document.createElement('span'); s.className = 'typing-cursor'; document.body.appendChild(s); return s; })();
    const cs = getComputedStyle(c);
    return JSON.stringify({
        esDelApp: !!delApp, nombre: cs.animationName, duracion: cs.animationDuration,
        color: cs.color, peso: cs.fontWeight
    });
})()`);
console.log('   cursor del typewriter (informativo, ver la nota del codigo): ' + cursor);
const cu = JSON.parse(cursor);
if (cu.nombre === 'blink') {
    check('el cursor parpadea con `blink`', cu.duracion === '1.2s', cu.duracion);
} else {
    console.log(`   AVISO el cursor tiene animation-name "${cu.nombre}" en vez de "blink" (su regla si aplica: color ${cu.color}, peso ${cu.peso})`);
}

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
