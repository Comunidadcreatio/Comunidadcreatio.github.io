// FOTO DE ESTILOS CALCULADOS: red de seguridad para refactorizar el CSS sin miedo.
//
// Captura el estilo CALCULADO de una lista de elementos (una muestra de elementos
// basicos + piezas reales de la app) en los dos temas y en dos anchos, y lo guarda en
// un JSON. Con `--comparar` se compara una foto nueva contra la de antes y se listan
// las diferencias: si no hay ninguna, el cambio de CSS no movio nada.
//
// Se lee DOS veces cada valor y solo se guardan los que coinciden en las dos lecturas,
// para no confundir diferencias reales con valores que bailan (transiciones, animaciones).
//
// Uso:
//   node scripts/foto-estilos.mjs http://127.0.0.1:8099/ --salida scripts/foto-antes.json
//   node scripts/foto-estilos.mjs http://127.0.0.1:8099/ --salida scripts/foto-despues.json
//   node scripts/foto-estilos.mjs --comparar scripts/foto-antes.json scripts/foto-despues.json
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9722;
const args = process.argv.slice(2);
const salir = (codigo) => { try { ws?.close(); } catch {} try { chrome?.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(codigo); };

// ---------- modo COMPARAR (no necesita navegador) ----------
if (args.includes('--comparar')) {
    const i = args.indexOf('--comparar');
    const antes = JSON.parse(readFileSync(args[i + 1], 'utf8'));
    const despues = JSON.parse(readFileSync(args[i + 2], 'utf8'));
    const claves = new Set([...Object.keys(antes.datos), ...Object.keys(despues.datos)]);
    const diferencias = [];
    for (const clave of claves) {
        const a = antes.datos[clave];
        const b = despues.datos[clave];
        if (!a || !b) { diferencias.push({ clave, propiedad: '(elemento)', antes: a ? 'existe' : 'NO', despues: b ? 'existe' : 'NO' }); continue; }
        const props = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const prop of props) {
            if (a[prop] === b[prop]) continue;
            diferencias.push({ clave, propiedad: prop, antes: a[prop], despues: b[prop] });
        }
    }
    console.log(`Foto A: ${antes.cuando}  ·  ${Object.keys(antes.datos).length} elementos`);
    console.log(`Foto B: ${despues.cuando}  ·  ${Object.keys(despues.datos).length} elementos`);
    if (!diferencias.length) {
        console.log('\nSIN DIFERENCIAS: el cambio de CSS no movio ni un valor calculado.');
        process.exit(0);
    }
    console.log(`\nDIFERENCIAS: ${diferencias.length}`);
    for (const d of diferencias.slice(0, 60)) console.log(`  ${d.clave} · ${d.propiedad}: "${d.antes}" -> "${d.despues}"`);
    if (diferencias.length > 60) console.log(`  ... y ${diferencias.length - 60} mas`);
    process.exit(1);
}

// ---------- modo CAPTURA ----------
const iSalida = args.indexOf('--salida');
if (iSalida < 0) { console.error('Falta --salida <ruta.json>'); process.exit(2); }
const rutaSalida = args[iSalida + 1];
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';

const perfil = mkdtempSync(join(tmpdir(), 'foto-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=393,852', '--force-device-scale-factor=1', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null;
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PUERTO}/json/version`); break; } catch { await sleep(250); } }
const pagina = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PUERTO}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
// La app usa el atributo en <html> (theme.js).
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
            localStorage.setItem('creatio_tema', 'light');
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

const PROPIEDADES = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'width', 'height',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'backgroundColor', 'backgroundImage', 'color', 'opacity', 'visibility', 'overflow',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderLeftWidth', 'borderLeftStyle',
    'borderRadius', 'boxShadow', 'backdropFilter', 'transform', 'boxSizing', 'appearance',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
    'textDecorationLine', 'cursor', 'outlineWidth', 'outlineStyle', 'pointerEvents'
];

const ANCHOS = [393, 1280];
const TEMAS = ['light', 'dark'];

const datos = {};
console.log(`Foto de estilos: ${URL_BASE}`);

for (const ancho of ANCHOS) {
    await send('Emulation.setDeviceMetricsOverride', { width: ancho, height: ancho < 500 ? 852 : 900, deviceScaleFactor: 1, mobile: ancho < 500 });
    if (ancho === ANCHOS[0]) {
        await send('Page.navigate', { url: URL_BASE });
        // Se espera a que la app este montada (el menu principal es lo primero que aparece).
        for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
        await sleep(1500);
        // Muestra de elementos basicos SIN clases, fuera de pantalla pero renderizada:
        // aisla las reglas de BASE (las que dependen solo de la etiqueta) del resto.
        const montado = await evalJs(`(() => {
            const f = document.createElement('div');
            f.id = 'fixture-foto';
            f.style.cssText = 'position:absolute;left:-9000px;top:0;width:320px;height:auto;';
            f.innerHTML = [
                '<input id="fx-input" type="text" value="texto">',
                '<input id="fx-email" type="email" value="a@b.c">',
                '<input id="fx-pass" type="password" value="secreta">',
                '<textarea id="fx-textarea">texto</textarea>',
                '<select id="fx-select"><option>uno</option><option>dos</option></select>',
                '<button id="fx-button">boton</button>',
                '<button id="fx-submit" type="submit">enviar</button>',
                '<p id="fx-p">parrafo</p>',
                '<h2 id="fx-h2">titulo</h2>',
                '<label id="fx-label">etiqueta</label>',
                '<a id="fx-a" href="#">enlace</a>',
                '<span id="fx-span">span</span>',
                '<ul id="fx-ul"><li id="fx-li">elemento</li></ul>',
                '<div id="fx-hidden" class="hidden">oculto</div>',
                '<div id="fx-div">div</div>'
            ].join('');
            document.body.appendChild(f);
            return 'ok';
        })()`);
        if (montado !== 'ok') { console.error('No se pudo montar la muestra:', montado); salir(2); }
    }
    for (const tema of TEMAS) {
        await evalJs(`document.documentElement.setAttribute('data-theme', '${tema}')`);
        await sleep(500);
        const lectura = `(() => {
            const props = ${JSON.stringify(PROPIEDADES)};
            const ids = ['fx-input','fx-email','fx-pass','fx-textarea','fx-select','fx-button','fx-submit',
                         'fx-p','fx-h2','fx-label','fx-a','fx-span','fx-div'];
            const reales = { 'body': document.body, '#main-header': document.getElementById('main-header'),
                '#toggle-panel': document.getElementById('toggle-panel'),
                '.nav-btn': document.querySelector('#toggle-panel .nav-btn'),
                '#btn-notificaciones': document.getElementById('btn-notificaciones') };
            const salida = {};
            const medir = (nombre, el) => {
                if (!el) return;
                const cs = getComputedStyle(el);
                const o = {};
                for (const p of props) { const v = cs[p]; o[p] = (v === undefined || v === null) ? null : String(v); }
                // Solo lo que ocupa sitio: asi se ve si un cambio lo saca del flujo.
                const r = el.getBoundingClientRect();
                o.__ancho = String(Math.round(r.width)); o.__alto = String(Math.round(r.height));
                salida[nombre] = o;
            };
            for (const id of ids) medir('#' + id, document.getElementById(id));
            for (const [nombre, el] of Object.entries(reales)) medir(nombre, el);
            return JSON.stringify(salida);
        })()`;
        const a = await evalJs(lectura);
        await sleep(200);
        const b = await evalJs(lectura);
        if (a === 'EXC' || typeof a !== 'string' || a.startsWith('EXC')) { console.error('Fallo al leer:', String(a).slice(0, 200)); salir(2); }
        const uno = JSON.parse(a), dos = JSON.parse(b);
        for (const [nombre, props] of Object.entries(uno)) {
            const clave = `${tema} · ${ancho}px · ${nombre}`;
            const filtrado = {};
            for (const [prop, valor] of Object.entries(props)) {
                // Se descarta lo que baila entre las dos lecturas (animaciones, transiciones).
                if (dos[nombre] && dos[nombre][prop] !== valor) continue;
                filtrado[prop] = valor;
            }
            datos[clave] = filtrado;
        }
        console.log(`   leido ${tema} · ${ancho}px (${Object.keys(uno).length} elementos)`);
    }
}

writeFileSync(rutaSalida, JSON.stringify({ cuando: new Date().toISOString(), url: URL_BASE, elementos: Object.keys(datos).length, datos }, null, 1), 'utf8');
console.log(`\nFoto guardada en ${rutaSalida}: ${Object.keys(datos).length} elementos x ${PROPIEDADES.length + 2} propiedades`);
salir(0);
