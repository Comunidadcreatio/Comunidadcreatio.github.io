// Comprueba que las VIEW TRANSITIONS funcionan de verdad en Problogs: que el navegador
// las soporte, que problogs.js las dispare al abrir y al cerrar la lectura, que se
// generen las animaciones de los pseudo-elementos, y que la cabecera y el menú queden
// FIJADOS (sin animación) para que no se mueva el marco.
//
// Uso: node scripts/dbg-viewtransition.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9744;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'vt-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=393,852', 'about:blank'
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
        const bloques = [];
        for (let i = 1; i <= 12; i++) bloques.push({ tipo: 'texto', contenido: 'Parrafo ' + i + ' de prueba para la lectura.' });
        const pub = { id: 72001, titulo: 'Prueba transicion', etiquetas: '', estado: 'publicado',
            created_at: new Date(ahora - 3600000).toISOString(), bloques,
            imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
            portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0,
            comentarios_count: 1, reblogs_count: 0, liked: false, reblogged: false };
        const comentarios = [{ id: 1, problog_id: 72001, usuario_id: 10, texto: 'Comentario', comentario_padre_id: null,
            created_at: new Date(ahora - 1800000).toISOString(), autor_nombre: 'Ana', autor_foto: '', likes_count: 0, liked: false }];
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('/comentarios')) return json({ success: true, comentarios });
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('mis-problogs') || u.includes('mis-reblogs')) return json({ success: true, problogs: [pub], total: 1 });
            if (u.includes('/problogs/72001')) return json(pub);
            if (u.includes('/problogs')) return json({ success: true, problogs: [pub], total: 1 });
            if (u.includes('/obras')) return json([]);
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);

const soporta = await evalJs(`typeof document.startViewTransition === 'function'`);
console.log(`Soporte de View Transitions: ${soporta}`);

// Se envuelve `startViewTransition` para CONTAR las llamadas y ver las animaciones que
// genera (los pseudo-elementos ::view-transition-*).
await evalJs(`(() => {
    window.__vt = { llamadas: 0, animaciones: 0 };
    const real = document.startViewTransition.bind(document);
    document.startViewTransition = (cb) => {
        window.__vt.llamadas++;
        const t = real(cb);
        const mirar = () => {
            const anims = document.getAnimations ? document.getAnimations() : [];
            const vt = anims.filter((a) => (a.effect && a.effect.pseudoElement || '').includes('view-transition'));
            if (vt.length > window.__vt.animaciones) window.__vt.animaciones = vt.length;
        };
        mirar(); setTimeout(mirar, 30); setTimeout(mirar, 90); setTimeout(mirar, 180);
        return t;
    };
    return 'ok';
})()`);

// Se abre Problogs y se pulsa una tarjeta (feed -> lectura).
await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
await sleep(1800);
const antes = await evalJs(`JSON.stringify({
    llamadas: window.__vt.llamadas,
    feed: getComputedStyle(document.querySelector('#problogs .problogs-feed')).display,
    detalle: getComputedStyle(document.getElementById('problogs-detalle')).display,
    nombreCabecera: getComputedStyle(document.getElementById('main-header')).viewTransitionName,
    nombreMenu: getComputedStyle(document.getElementById('toggle-panel')).viewTransitionName
})`);
console.log(`Tras cambiar de seccion (nav -> Problogs): ${antes}`);
await evalJs(`document.querySelector('#problogs .problog-card')?.click()`);
await sleep(1200);
const trasAbrir = await evalJs(`JSON.stringify({
    llamadas: window.__vt.llamadas, animaciones: window.__vt.animaciones,
    feed: getComputedStyle(document.querySelector('#problogs .problogs-feed')).display,
    detalle: getComputedStyle(document.getElementById('problogs-detalle')).display
})`);
console.log(`Tras abrir la lectura: ${trasAbrir}`);

// Y se vuelve con el icono del header (lectura -> feed).
await evalJs(`document.getElementById('btn-problog-volver')?.click()`);
await sleep(1200);
const trasCerrar = await evalJs(`JSON.stringify({
    llamadas: window.__vt.llamadas, animaciones: window.__vt.animaciones,
    feed: getComputedStyle(document.querySelector('#problogs .problogs-feed')).display,
    detalle: getComputedStyle(document.getElementById('problogs-detalle')).display
})`);
console.log(`Tras volver al feed:   ${trasCerrar}`);

const v = JSON.parse(trasCerrar);
const a = JSON.parse(trasAbrir);
const ok = soporta === true && a.llamadas >= 1 && v.llamadas >= 2 && a.animaciones > 0
    && a.detalle !== 'none' && a.feed === 'none' && v.feed !== 'none' && v.detalle === 'none';
console.log(ok ? '\nOK: la transición se dispara al abrir y al cerrar, y las vistas cambian bien.'
    : '\nFALLO: revisar los números de arriba.');
salir(ok ? 0 : 1);
