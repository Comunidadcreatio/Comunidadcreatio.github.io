// Verifica el FOCO VISIBLE para quien navega con el teclado.
//
// POR QUE EXISTE: la app tenía más de veinte reglas `outline: none` y ni un solo
// `:focus-visible`, así que con el teclado no se veía dónde estabas. Esta prueba:
//   1. Tabula de verdad (eventos de teclado por CDP) y comprueba que CADA elemento
//      enfocado dibuja un anillo: ancho, estilo y color.
//   2. Comprueba que con el RATÓN no aparece (eso es lo que distingue `:focus-visible` de
//      `:focus`: si apareciera, sería un `:focus` normal).
//   3. Cambia a modo oscuro y mira que el anillo cambia de color (uno negro sobre fondo
//      oscuro no se vería).
//   4. Mide el CONTRASTE del anillo contra el fondo, que es lo que exige la norma de
//      accesibilidad (3:1 para elementos no textuales).
//
// Uso: node scripts/verificar-foco-visible.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9791;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'foco-'));
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
const tabular = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    await sleep(160);
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

// Lee el anillo del elemento enfocado y su contraste contra el fondo.
const LEER_FOCO = `(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return JSON.stringify({ nada: true });
    const cs = getComputedStyle(el);
    // El fondo que se ve por detrás del anillo: se sube por los padres hasta uno opaco.
    let fondo = 'rgba(0, 0, 0, 0)';
    let p = el;
    while (p && (fondo === 'rgba(0, 0, 0, 0)' || fondo === 'transparent')) { fondo = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    const aRgb = (c) => {
        if (!c) return null;
        // OJO: en box-shadow el color computado sale al FINAL y antes puede aparecer un
        // rgba(0, 0, 0, 0) transparente. Si se coge el primero, se mide el color
        // equivocado (eso hizo que el verificador diera un contraste falso de 1,4).
        const todos = [...String(c).matchAll(/rgba?\\(([^)]+)\\)/g)];
        if (!todos.length) return null;
        const n = todos[todos.length - 1][1].split(',').map((x) => parseFloat(x));
        return [n[0], n[1], n[2]];
    };
    const lum = (rgb) => { const c = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const cAnillo = aRgb(cs.outlineColor);
    const cSombra = aRgb(cs.boxShadow);
    const cPagina = aRgb(getComputedStyle(document.body).backgroundColor);
    const ratio = (a, b) => { if (!a || !b) return null; const l1 = lum(a), l2 = lum(b); const max = Math.max(l1, l2), min = Math.min(l1, l2); return Math.round(((max + 0.05) / (min + 0.05)) * 10) / 10; };
    // Lo que garantiza que el foco se vea es que los DOS anillos contrasten ENTRE SI: si el
    // de dentro es oscuro y el de fuera claro, sobre cualquier fondo se ve uno de los dos.
    // Medir contra el fondo del propio boton no vale: muchos son transparentes.
    const entreAnillos = ratio(cAnillo, cSombra);
    const conPagina = Math.max(ratio(cAnillo, cPagina) || 0, ratio(cSombra, cPagina) || 0);
    return JSON.stringify({
        tag: el.tagName, id: el.id || '', clase: (el.className || '').toString().slice(0, 30),
        ancho: cs.outlineWidth, estilo: cs.outlineStyle, color: cs.outlineColor, offset: cs.outlineOffset,
        sombra: cs.boxShadow,
        contrasteEntreAnillos: entreAnillos,
        contrasteConPagina: conPagina,
        contraste: entreAnillos,
        visible: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
    });
})()`;

await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);
// El tema se FIJA Y SE COMPRUEBA: theme.js lo elige por la hora del día, así que sin esto
// las comprobaciones de "modo claro" podrían estar corriendo en oscuro sin que se note.
await evalJs(`(() => { try { localStorage.setItem('theme', 'light'); } catch (_) {} document.documentElement.setAttribute('data-theme', 'light'); })()`);
await sleep(500);
const temaInicial = await evalJs(`document.documentElement.getAttribute('data-theme')`);
if (temaInicial !== 'light') console.log(`   OJO: no se pudo fijar el tema claro (quedó ${temaInicial})`);
// Se enfoca el body para empezar a tabular desde el principio.
await evalJs(`document.body.focus()`);

console.log('=== 1. Con TECLADO (Tab): cada elemento enfocado tiene que dibujar el anillo ===');
const conTeclado = [];
for (let i = 0; i < 8; i++) {
    await tabular();
    const f = JSON.parse(await evalJs(LEER_FOCO));
    if (f.nada) continue;
    conTeclado.push(f);
    console.log(`   Tab ${i + 1}: <${f.tag.toLowerCase()}${f.id ? '#' + f.id : ''}>  anillo=${f.ancho}/${f.estilo} color=${f.color} offset=${f.offset} contraste=${f.contraste}`);
}
check('se pudieron enfocar elementos con el teclado', conTeclado.length >= 4, conTeclado.length);
check('TODOS los enfocados dibujan anillo visible', conTeclado.every((f) => f.visible === true),
    JSON.stringify(conTeclado.filter((f) => !f.visible).map((f) => f.tag)));
check('el anillo es de 3px', conTeclado.every((f) => f.ancho === '3px'), JSON.stringify(conTeclado.map((f) => f.ancho)));
// El anillo va pegado al elemento (offset 0) y por fuera lleva un SEGUNDO anillo de otro
// color: eso es lo que hace que se vea sobre cualquier elemento y cualquier fondo.
check('hay un SEGUNDO anillo por fuera (el doble anillo)', conTeclado.every((f) => f.sombra && f.sombra !== 'none'), JSON.stringify(conTeclado.map((f) => f.sombra)));
check('el anillo interior va pegado al elemento (offset 0)', conTeclado.every((f) => f.offset === '0px'), JSON.stringify(conTeclado.map((f) => f.offset)));
const malContraste = conTeclado.filter((f) => f.contraste !== null && f.contraste < 3);
check('el anillo contrasta con el fondo (mínimo 3:1 de la norma)', malContraste.length === 0,
    JSON.stringify(malContraste.map((f) => `${f.tag}:${f.contraste}`)));

console.log('\n=== 2. Con RATÓN: no tiene que aparecer ningún anillo ===');
await evalJs(`document.activeElement && document.activeElement.blur()`);
const centro = JSON.parse(await evalJs(`(() => {
    const b = document.querySelector('#toggle-panel .nav-btn') || document.querySelector('button');
    if (!b) return 'null';
    const r = b.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`));
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: centro.x, y: centro.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: centro.x, y: centro.y, button: 'left', clickCount: 1 });
await sleep(500);
const conRaton = JSON.parse(await evalJs(LEER_FOCO));
console.log('   ' + JSON.stringify({ tag: conRaton.tag, anillo: conRaton.ancho + '/' + conRaton.estilo, visible: conRaton.visible }));
check('al pulsar con el ratón NO aparece el anillo (es :focus-visible, no :focus)',
    conRaton.nada === true || conRaton.visible === false, JSON.stringify(conRaton.visible));

console.log('\n=== 3. Modo OSCURO: el anillo cambia de color para poder verse ===');
await evalJs(`(() => { document.documentElement.setAttribute('data-theme', 'dark'); try { localStorage.setItem('theme','dark'); } catch (_) {} })()`);
await sleep(600);
const coloresOscuro = [];
for (let i = 0; i < 5; i++) {
    await tabular();
    const f = JSON.parse(await evalJs(LEER_FOCO));
    if (!f.nada) coloresOscuro.push(f);
}
const conAnillo = coloresOscuro.filter((f) => f.visible);
console.log('   ' + JSON.stringify(conAnillo.slice(0, 3).map((f) => ({ tag: f.tag, color: f.color, contraste: f.contraste }))));
check('en oscuro el anillo NO es el negro de claro', conAnillo.every((f) => f.color !== 'rgb(26, 26, 26)'),
    JSON.stringify(conAnillo.map((f) => f.color)));
const malOscuro = conAnillo.filter((f) => f.contraste !== null && f.contraste < 3);
check('y en oscuro también contrasta (3:1)', malOscuro.length === 0, JSON.stringify(malOscuro.map((f) => `${f.tag}:${f.contraste}`)));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
