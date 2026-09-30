// Verifica las CONTAINER QUERIES: la tarjeta de Problogs se adapta al ancho de SU
// CONTENEDOR, no al de la pantalla.
//
// POR QUE EXISTE: la misma tarjeta se usa en el feed principal (ancho de pantalla) y en la
// pestaña de Problogs del PERFIL (columna mas estrecha, porque al lado hay barra lateral).
// Con una media query eso no se puede saber. Aqui se meten dos tarjetas IDENTICAS en dos
// contenedores de ancho distinto, EN LA MISMA PANTALLA: si la tarjeta mirara la pantalla,
// las dos saldrian iguales; si mira su contenedor, la estrecha se aprieta.
//
// Uso: node scripts/verificar-container-queries.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9801;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'cq-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=900,900', 'about:blank'
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
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
        } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/problogs')) return json({ success: true, problogs: [], total: 0 });
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

await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);

// El HTML se arma AQUI y se le pasa como dato: meter comillas y concatenaciones dentro de
// la plantilla que se evalua es lo que rompe estos scripts una y otra vez.
const trozo = (ancho) => '<div class="problogs-feed" data-ancho="' + ancho + '" style="width:' + ancho + 'px">' +
    '<article class="problog-card"><h3 class="problog-card-titulo">Titulo de prueba</h3>' +
    '<p class="problog-card-extracto">Extracto de prueba para medir el tamano.</p></article></div>';
const html = trozo(300) + trozo(345);
await evalJs(`(() => {
    const viejo = document.getElementById('prueba-cq');
    if (viejo) viejo.remove();
    const cont = document.createElement('div');
    cont.id = 'prueba-cq';
    cont.style.cssText = 'position:absolute;left:0;top:0;z-index:9;background:#fff;';
    cont.innerHTML = ${JSON.stringify(html)};
    document.body.appendChild(cont);
    return 'ok';
})()`);
await sleep(800);

const m = JSON.parse(await evalJs(`(() => {
    const leer = (ancho) => {
        const caja = document.querySelector('#prueba-cq .problogs-feed[data-ancho="' + ancho + '"]');
        if (!caja) return null;
        const cs = getComputedStyle(caja.querySelector('.problog-card'));
        return {
            anchoCaja: Math.round(caja.getBoundingClientRect().width),
            paddingIzq: cs.paddingLeft,
            titulo: getComputedStyle(caja.querySelector('.problog-card-titulo')).fontSize,
            extracto: getComputedStyle(caja.querySelector('.problog-card-extracto')).fontSize
        };
    };
    return JSON.stringify({ estrecha: leer(300), normal: leer(345) });
})()`));
console.log('   contenedor de 300px: ' + JSON.stringify(m.estrecha));
console.log('   contenedor de 345px: ' + JSON.stringify(m.normal));

check('las dos cajas se midieron', !!m.estrecha && !!m.normal);
check('la estrecha tiene el titulo mas pequeño', parseFloat(m.estrecha.titulo) < parseFloat(m.normal.titulo),
    `${m.estrecha.titulo} vs ${m.normal.titulo}`);
check('y el extracto mas pequeño', parseFloat(m.estrecha.extracto) < parseFloat(m.normal.extracto),
    `${m.estrecha.extracto} vs ${m.normal.extracto}`);
check('con la MISMA pantalla para las dos (si mirara la pantalla saldrian iguales)',
    m.estrecha.titulo !== m.normal.titulo, 'salen distintas: mira el contenedor');
check('en el ancho de siempre (345px) se queda con la tipografia normal (16.8px)',
    Math.abs(parseFloat(m.normal.titulo) - 16.8) < 0.2, m.normal.titulo);
check('y la tarjeta NO gana padding lateral (el texto va de borde a borde)',
    parseFloat(m.normal.paddingIzq) === 0 && parseFloat(m.estrecha.paddingIzq) === 0,
    `${m.estrecha.paddingIzq} / ${m.normal.paddingIzq}`);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
