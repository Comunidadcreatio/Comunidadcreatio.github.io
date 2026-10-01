// Verifica el HOVER de los botones de la barra de pasos del panel (Crear / Limpiar).
//
// POR QUE EXISTE: la campana de `!important` tenia un punto ciego justo aqui. La foto de estilos
// mide el estado de REPOSO, asi que un `!important` dentro de un `:hover` se podia quitar sin que
// nada lo notara (paso el 2026-10-01, en la barra de pasos). Esta prueba mueve el raton DE VERDAD
// (eventos por CDP, no `:hover` forzado: asi se comprueba tambien que el navegador lo activa).
//
// QUE SE ESPERA, y por que:
//   1. El HOVER CAMBIA EL BORDE (a color de tinta) y, en el boton Limpiar (que es un icono), el
//      COLOR. Es el aviso visual que tiene el usuario.
//   2. El FONDO NO CAMBIA: se queda transparente. Lo decide una regla de style.css que lo pone con
//      `!important` (`#obra-step-bar .crear-btn:hover { background: transparent !important }`), o
//      sea que ESE `!important` es portante: si se quitara, el boton se rellenaria de gris al pasar
//      por encima. Se comprueba justo eso.
//   3. Al salir el raton, todo vuelve al estado de reposo.
// Se prueba en los dos temas.
//
// Uso: node scripts/verificar-hover-botones.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9797;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'hover-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=1280,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null;
const salir = (c) => { try { ws?.close(); } catch {} try { chrome.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(c); };
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
const mover = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(260);
};
// Lee el estado ESPERANDO A QUE SE ESTABILICE. El boton tiene `transition: all 0.2s ease`, y
// midiendo a tiempo fijo se pillaba el borde a medio camino (rgb(211) en vez de rgb(212)) y salia
// un fallo que no existe. Se lee hasta que dos lecturas seguidas coinciden.
const estadoEstable = async (sel) => {
    let anterior = null;
    for (let i = 0; i < 12; i++) {
        const ahora = await estado(sel);
        if (ahora !== null && ahora === anterior) return ahora;
        anterior = ahora;
        await sleep(200);
    }
    return anterior;
};
const centroDe = async (sel) => {
    const r = await evalJs(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`);
    return r && typeof r === 'string' && r[0] === '{' ? JSON.parse(r) : null;
};
const estado = async (sel) => evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const s = getComputedStyle(el);
    return JSON.stringify({ fondo: s.backgroundColor, borde: s.borderTopColor, color: s.color });
})()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
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
            if (u.includes('/obras')) return json([]);
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1800);
await evalJs(`document.getElementById('tab-cavents')?.click()`);
await sleep(1200);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(600);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
for (let i = 0; i < 20; i++) {
    const listo = await evalJs(`(() => {
        const t = document.getElementById('tab-cavents');
        const p = document.getElementById('crear-problogs-contenido');
        return !!t && t.classList.contains('activa') && !!p && p.classList.contains('hidden');
    })()`);
    if (listo === true) break;
    await sleep(300);
}
// El boton Crear de la barra esta oculto hasta que el formulario es valido: para el hover se usa
// uno VISIBLE (el de limpiar) y, para el de crear, se le quita la clase `hidden` solo aqui.
await evalJs(`document.getElementById('obra-step-crear')?.classList.remove('hidden')`);
await sleep(400);

const checks = [];
const apunta = (nombre, ok, detalle) => { checks.push({ nombre, ok, detalle }); console.log(`${ok ? 'OK  ' : 'FALLO'} ${nombre}${detalle ? ' — ' + detalle : ''}`); };
const probar = async (tema, sel, etiqueta, propiedades) => {
    await evalJs(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(tema)})`);
    await sleep(200);
    const reposo = await estadoEstable(sel);
    const c = await centroDe(sel);
    if (!c || !reposo) { apunta(`${etiqueta} (${tema}): existe y se puede medir`, false, 'no se encontro el elemento'); return; }
    const r = JSON.parse(reposo);
    await mover(c.x, c.y);
    const e = JSON.parse(await estadoEstable(sel));
    for (const prop of propiedades) {
        if (prop === 'borde') apunta(`${etiqueta} (${tema}): el borde cambia al pasar el raton`, e.borde !== r.borde, `${r.borde} -> ${e.borde}`);
        if (prop === 'color') apunta(`${etiqueta} (${tema}): el color cambia al pasar el raton`, e.color !== r.color, `${r.color} -> ${e.color}`);
    }
    // El fondo NO se rellena: lo impone un `!important` de style.css que es portante.
    apunta(`${etiqueta} (${tema}): el fondo sigue TRANSPARENTE en hover`, e.fondo === 'rgba(0, 0, 0, 0)', `fondo en hover: ${e.fondo}`);
    // Y al salir, vuelve.
    await mover(4, 4);
    const f = JSON.parse(await estadoEstable(sel));
    apunta(`${etiqueta} (${tema}): al salir vuelve el estado de reposo`, f.fondo === r.fondo && f.borde === r.borde && f.color === r.color, `borde ${r.borde}->${f.borde} · color ${r.color}->${f.color} · fondo ${r.fondo}->${f.fondo}`);
};
await probar('light', '#obra-step-crear', 'boton Crear', ['borde']);
await probar('dark', '#obra-step-crear', 'boton Crear', ['borde']);
await probar('light', '#obra-step-limpiar', 'boton Limpiar', ['color']);
await probar('dark', '#obra-step-limpiar', 'boton Limpiar', ['color']);

const fallos = checks.filter((c) => !c.ok);
console.log(`\nRESULTADO: ${checks.length - fallos.length}/${checks.length} comprobaciones OK — ${fallos.length ? fallos.length + ' fallos' : 'sin fallos'}`);
salir(fallos.length ? 1 : 0);
