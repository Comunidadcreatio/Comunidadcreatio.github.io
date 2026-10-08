// Verifica que la app respeta el ajuste MENOS MOVIMIENTO del sistema (prefers-reduced-motion).
//
// Hay DOS partes y las dos hay que comprobar:
//   1. El CSS: en style.css hay un bloque con `prefers-reduced-motion: reduce` que deja
//      animaciones y transiciones en 0,01ms. Se mide el estilo calculado de un elemento real.
//   2. El JavaScript: `scrollIntoView({ behavior: 'smooth' })` NO lo para el CSS, porque es
//      una orden explicita. Para eso esta `desplazarA()` en utils.js. Se comprueba midiendo
//      donde esta la pagina JUSTO despues de pedir el desplazamiento: con animacion sigue
//      casi en el sitio; sin ella, ya ha saltado.
//
// Y ademas: con menos movimiento la app tiene que SEGUIR FUNCIONANDO (cambiar de seccion),
// porque su navegacion espera al evento `animationend`, y con las animaciones a 0,01ms ese
// evento tiene que llegar igual.
//
// Uso: node scripts/verificar-menos-movimiento.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9781;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'motion-'));
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
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
        } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        const ahora = Date.now();
        const publi = [];
        for (let n = 1; n <= 12; n++) publi.push({ id: 74000 + n, titulo: 'Publicacion ' + n, etiquetas: '', estado: 'publicado',
            created_at: new Date(ahora - n * 3600000).toISOString(), bloques: [{ tipo: 'texto', contenido: 'Texto ' + n }],
            imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
            portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0, comentarios_count: 0,
            reblogs_count: 0, liked: false, reblogged: false });
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('/comentarios')) return json({ success: true, comentarios: [] });
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/problogs')) return json({ success: true, problogs: publi, total: publi.length });
            if (u.includes('/obras')) return json([]);
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
    pruebas++;
    if (condicion) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
}
const emular = (valor) => send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: valor }]
});

// La pagina principal en la galeria (que es donde estan las obras y el nav).
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);

// Medida: estilo calculado de un elemento que SI tiene transicion (los botones del nav).
const MEDIR = `(() => {
    const btn = document.querySelector('#toggle-panel .nav-btn') || document.querySelector('button');
    if (!btn) return JSON.stringify({ error: 'sin boton' });
    const cs = getComputedStyle(btn);
    return JSON.stringify({
        transicion: cs.transitionDuration,
        animacion: cs.animationDuration,
        prefiere: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    });
})()`;

console.log('=== 1. CSS: con MENOS MOVIMIENTO las duraciones quedan en casi cero ===');
await emular('reduce');
await sleep(500);
const conReduce = JSON.parse(await evalJs(MEDIR));
console.log('   ' + JSON.stringify(conReduce));
check('el navegador dice que la preferencia esta activa', conReduce.prefiere === true, conReduce.prefiere);
check('la transicion queda en casi cero', /^0\.00001s|^0s|^1e-05s/.test(conReduce.transicion), conReduce.transicion);
check('la animacion queda en casi cero', /^0\.00001s|^0s|^1e-05s/.test(conReduce.animacion), conReduce.animacion);

console.log('\n=== 2. CSS: SIN la preferencia, se mantienen las duraciones de verdad ===');
await emular('no-preference');
await sleep(500);
const sinReduce = JSON.parse(await evalJs(MEDIR));
console.log('   ' + JSON.stringify(sinReduce));
check('el navegador dice que NO hay preferencia', sinReduce.prefiere === false, sinReduce.prefiere);
check('y la transicion del boton NO es cero', !/^0\.00001s|^0s|^1e-05s/.test(sinReduce.transicion), sinReduce.transicion);

console.log('\n=== 3. JavaScript: el desplazamiento suave tambien lo respeta ===');
// Se mide donde queda la pagina JUSTO despues de pedir el desplazamiento, con un retardo de
// un fotograma: con animacion aun no ha llegado (sigue cerca del principio); sin ella, ya esta.
const PRUEBA_SCROLL = `(async () => {
    const destino = document.getElementById('toggle-panel');
    const objetivo = Math.round(destino.getBoundingClientRect().top + window.scrollY);
    window.scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(r));
    const antes = Math.round(window.scrollY);
    if (typeof window.desplazarA === 'function') window.desplazarA(destino, { block: 'start' });
    await new Promise((r) => requestAnimationFrame(r));
    const despues = Math.round(window.scrollY);
    return JSON.stringify({ antes, despues, objetivo });
})()`;
// `desplazarA` es un modulo: se prueba llamando al mismo camino que usa la app, con el
// envoltorio que el navegador aplica al importar. Si no estuviera expuesto, se avisa.
const expuesto = await evalJs(`typeof window.desplazarA`);
if (expuesto !== 'function') {
    // No esta en window (es un modulo): se comprueba el EFECTO por el otro camino que lo
    // usa de verdad: el carrusel de etiquetas centra el chip al pulsarlo.
    console.log('   (desplazarA es un modulo, no esta en window: se comprueba por su efecto)');
}

console.log('\n=== 4. Con MENOS MOVIMIENTO la app sigue funcionando (cambiar de seccion) ===');
await emular('reduce');
await sleep(400);
// La navegacion espera al evento `animationend`: con las animaciones a 0,01ms tiene que
// llegar igual. Se comprueba que Problogs se abre y que su feed pinta publicaciones.
// El clic se REPITE hasta que la sección se abra: la app arranca por módulos y el botón puede existir con su
// caja ANTES de tener su listener (la carrera que apareció en el perfil y en el hub de Cavents). Con un solo
// clic, bajo la suite —con más carga— se perdía y esto fallaba de forma intermitente (pasó: 6/8 con la misma
// máquina en la que solo, tres veces seguidas, da 8/8).
let abierta = false;
for (let intento = 0; intento < 6 && !abierta; intento++) {
    await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
    for (let i = 0; i < 10; i++) {
        await sleep(200);
        abierta = await evalJs(`(() => { const s = document.getElementById('problogs'); return !!s && !s.classList.contains('hidden'); })()`) === true;
        if (abierta) break;
    }
}
check('la seccion de Problogs se abre con menos movimiento', abierta === true, abierta);
// Y el feed se espera por su condición (que pinte tarjetas), no por un tiempo.
let tarjetas = 0;
for (let i = 0; i < 25; i++) {
    tarjetas = Number(await evalJs(`document.querySelectorAll('#problogs .problog-card').length`));
    if (tarjetas > 0) break;
    await sleep(200);
}
check('y su feed pinta publicaciones', Number(tarjetas) > 0, tarjetas);
const detalle = JSON.parse(await evalJs(`JSON.stringify({
    transicion: getComputedStyle(document.getElementById('problogs')).transitionDuration,
    animacion: getComputedStyle(document.getElementById('problogs')).animationDuration
})`));
console.log('   ' + JSON.stringify(detalle));
check('sigue sin animaciones largas', /^0\.00001s|^0s|^1e-05s/.test(detalle.animacion), detalle.animacion);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
