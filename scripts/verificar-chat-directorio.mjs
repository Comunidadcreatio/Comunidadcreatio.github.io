// Verifica el DIRECTORIO DEL CHAT: la lista de los pueblos de Táchira con sus banderas,
// sus contadores y el acordeón que se abre al tocar uno.
//
// POR QUE EXISTE: el chat no tenía NINGÚN verificador, y un fallo de codificación en
// ciudades.js (los nombres con tilde quedaron doblemente codificados) dejó la pantalla en
// "No hay pueblos disponibles" sin que ninguna prueba lo viera. Esta prueba mira
// exactamente eso:
//   1. La búsqueda que hace chat.js: window.CIUDADES_POR_PAIS['Venezuela']['Táchira'].
//   2. Que se pinten los 29 pueblos, con el nombre BIEN (sin doble codificación).
//   3. Que la bandera exista de verdad (la imagen carga, no solo que tenga src).
//   4. Que el acordeón abra uno y cierre el anterior.
//
// Uso: node scripts/verificar-chat-directorio.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9771;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'chat-'));
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        logs.push((m.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 160));
    }
    if (m.method === 'Runtime.exceptionThrown') {
        logs.push('EXCEPCION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 160));
    }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 220);
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });

// Se simula el backend. El directorio devuelve UN pueblo con un artista dentro (para poder
// mirar los contadores y la fila de usuario): el resto salen vacíos, y tienen que salir
// igualmente, porque la lista de pueblos viene de ciudades.js, no del servidor.
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
        } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        const ahora = Date.now();
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('/chat/directorio')) {
                return json({ success: true, pueblos: {
                    'San Cristóbal': [{ id: 99, nombre_artista: 'Ana', foto_perfil: '',
                        ultima_actividad: new Date(ahora).toISOString() }]
                } });
            }
            if (u.includes('/chat/conversaciones')) return json({ success: true, conversaciones: [] });
            if (u.includes('/chat/bloqueados')) return json({ success: true, bloqueados: [] });
            if (u.includes('/chat/no-leidos')) return json({ success: true, no_leidos: 0 });
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/problogs')) return json({ success: true, problogs: [], total: 0 });
            if (u.includes('/obras')) return json([]);
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            if (u.includes('artistas/perfil')) return json({ success: true, usuario: { id: 1, nombre_artista: 'T', rol: 'artista' } });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
    pruebas++;
    if (condicion) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
}

// ------------------------------------------------------------
// 1. Los DATOS que usa el chat (la búsqueda literal de chat.js)
// ------------------------------------------------------------
console.log('=== 1. Datos de los pueblos (window.CIUDADES_POR_PAIS) ===');
const datos = JSON.parse(await evalJs(`(() => {
    const p = window.CIUDADES_POR_PAIS;
    const lista = (p && p['Venezuela'] && p['Venezuela']['Táchira']) || [];
    const b = window.BANDERA_POR_CIUDAD || {};
    const claves = p && p['Venezuela'] ? Object.keys(p['Venezuela']) : [];
    return JSON.stringify({
        cuantos: lista.length,
        primero: lista[0] || '',
        tieneSanCristobal: lista.indexOf('San Cristóbal') !== -1,
        banderaSanCristobal: b['San Cristóbal'] || '',
        clavesDeVenezuela: claves,
        conMojibake: claves.filter((k) => /Ã|Â/.test(k)).length
    });
})()`));
console.log('   ' + JSON.stringify(datos));
check('la búsqueda del chat encuentra los pueblos de Táchira', datos.cuantos === 29, datos.cuantos);
check('el estado se llama "Táchira", con su tilde (si no, el chat dice "No hay pueblos")',
    datos.conMojibake === 0 && datos.clavesDeVenezuela.some((k) => k === 'Táchira'), JSON.stringify(datos.clavesDeVenezuela));
check('está "San Cristóbal" con su tilde', datos.tieneSanCristobal === true, datos.primero);
check('la bandera de San Cristóbal está definida', datos.banderaSanCristobal === 'san-cristobal.webp', datos.banderaSanCristobal);

// ------------------------------------------------------------
// 2. La pantalla del directorio
// ------------------------------------------------------------
console.log('\n=== 2. El directorio en pantalla ===');
await evalJs(`document.getElementById('btn-chat-global')?.click()`);
await sleep(2000);
const dir = JSON.parse(await evalJs(`(() => {
    const acc = document.getElementById('chat-accordion');
    const items = acc ? [...acc.querySelectorAll('.chat-pueblo')] : [];
    const nombres = items.map((i) => (i.querySelector('.chat-pueblo-nombre') || {}).textContent || '');
    const primero = items[0];
    const img = primero ? primero.querySelector('.chat-pueblo-bandera') : null;
    const conUsers = items.find((i) => i.querySelector('.chat-user-row'));
    const sinUsers = items.find((i) => i.querySelector('.chat-pueblo-vacio'));
    const cuenta = (el, sel) => { const c = el ? el.querySelector(sel) : null; return c ? c.textContent.trim() : ''; };
    const seccion = document.getElementById('chat-global');
    const directorio = document.getElementById('chat-directorio');
    return JSON.stringify({
        seccionVisible: seccion ? getComputedStyle(seccion).display !== 'none' : false,
        directorioVisible: directorio ? getComputedStyle(directorio).display !== 'none' : false,
        items: items.length,
        nombresConMojibake: nombres.filter((n) => /Ã|Â/.test(n)).length,
        primerNombre: nombres[0] || '',
        ultimoNombre: nombres[nombres.length - 1] || '',
        banderaSrc: img ? (img.getAttribute('src') || '') : '',
        banderaCargada: img ? (img.tagName === 'IMG' && img.naturalWidth > 0) : false,
        countsDeConUsers: conUsers ? (cuenta(conUsers, '.chat-pueblo-count.tot') + ' / ' + cuenta(conUsers, '.chat-pueblo-count.act')) : '',
        hayFilaDeUsuario: !!conUsers,
        hayAvisoDeVacio: !!sinUsers
    });
})()`));
console.log('   ' + JSON.stringify(dir));
check('el chat abre en el directorio', dir.seccionVisible === true && dir.directorioVisible === true, JSON.stringify(dir));
check('se pintan los 29 pueblos', dir.items === 29, dir.items);
check('los nombres se ven BIEN, sin doble codificación', dir.nombresConMojibake === 0, dir.nombresConMojibake);
check('el primero es San Cristóbal', dir.primerNombre === 'San Cristóbal', dir.primerNombre);
check('la bandera apunta a su fichero', dir.banderaSrc.indexOf('san-cristobal.webp') !== -1, dir.banderaSrc);
check('la bandera CARGA de verdad (el fichero existe)', dir.banderaCargada === true, dir.banderaSrc);
check('el pueblo con un artista enseña "1 Artistas"', /1 Artistas/.test(dir.countsDeConUsers), dir.countsDeConUsers);
check('ese mismo pueblo enseña "1 Activos" (el artista está en línea)', /1 Activos/.test(dir.countsDeConUsers), dir.countsDeConUsers);
check('el pueblo con artista tiene su fila de usuario', dir.hayFilaDeUsuario === true, dir.hayFilaDeUsuario);
check('un pueblo sin artistas avisa de que no hay ninguno', dir.hayAvisoDeVacio === true, dir.hayAvisoDeVacio);

// ------------------------------------------------------------
// 3. El acordeón
// ------------------------------------------------------------
console.log('\n=== 3. El acordeón ===');
const trasAbrir1 = JSON.parse(await evalJs(`(() => {
    const items = [...document.querySelectorAll('#chat-accordion .chat-pueblo')];
    items[0].querySelector('.chat-pueblo-header').click();
    const abiertos = items.filter((i) => i.classList.contains('open'));
    return JSON.stringify({
        abiertos: abiertos.length,
        esElPrimero: abiertos[0] === items[0],
        aria: items[0].querySelector('.chat-pueblo-header').getAttribute('aria-expanded')
    });
})()`));
console.log('   ' + JSON.stringify(trasAbrir1));
check('al tocar un pueblo se abre (uno solo)', trasAbrir1.abiertos === 1 && trasAbrir1.esElPrimero === true, JSON.stringify(trasAbrir1));

const trasAbrir2 = JSON.parse(await evalJs(`(() => {
    const items = [...document.querySelectorAll('#chat-accordion .chat-pueblo')];
    items[1].querySelector('.chat-pueblo-header').click();
    const abiertos = items.filter((i) => i.classList.contains('open'));
    return JSON.stringify({
        abiertos: abiertos.length,
        esElSegundo: abiertos[0] === items[1],
        primeroCerrado: !items[0].classList.contains('open')
    });
})()`));
console.log('   ' + JSON.stringify(trasAbrir2));
check('al tocar otro, se abre ese y se cierra el anterior',
    trasAbrir2.abiertos === 1 && trasAbrir2.esElSegundo === true && trasAbrir2.primeroCerrado === true,
    JSON.stringify(trasAbrir2));

const trasCerrar = JSON.parse(await evalJs(`(() => {
    const items = [...document.querySelectorAll('#chat-accordion .chat-pueblo')];
    items[1].querySelector('.chat-pueblo-header').click();
    return JSON.stringify({ abiertos: items.filter((i) => i.classList.contains('open')).length });
})()`));
check('al volver a tocar el mismo, se cierra', trasCerrar.abiertos === 0, JSON.stringify(trasCerrar));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
