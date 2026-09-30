// Comprueba el efecto de entrada del feed de Problogs, que va atado al SCROLL.
//
// Lo que se mide (con un feed largo de 30 publicaciones):
//   - Que la animacion este atada a una `ViewTimeline` (no al tiempo): eso es lo que la
//     hace depender del scroll sin JavaScript, sin IntersectionObserver y sin listeners.
//   - Que una tarjeta que TODAVIA NO ha entrado este al 0% de su animacion, y que al
//     bajar hasta ella llegue al 100%. Esa es la prueba de que sigue al scroll.
//   - Que `content-visibility` NO este aplicado: se probo y se quito (ver problogs.css).
//
// Uso: node scripts/dbg-feed-rendimiento.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9755;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'cv-'));
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
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 220);
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
        const lista = [];
        for (let n = 1; n <= 30; n++) {
            lista.push({ id: 73000 + n, titulo: 'Publicacion ' + n, etiquetas: '', estado: 'publicado',
                created_at: new Date(ahora - n * 3600000).toISOString(),
                bloques: [{ tipo: 'texto', contenido: 'Texto de la publicacion numero ' + n + '.' }],
                imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
                portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0,
                comentarios_count: 0, reblogs_count: 0, liked: false, reblogged: false });
        }
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('/comentarios')) return json({ success: true, comentarios: [] });
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('mis-problogs') || u.includes('mis-reblogs')) return json({ success: true, problogs: lista, total: lista.length });
            if (u.includes('/problogs')) return json({ success: true, problogs: lista, total: lista.length });
            if (u.includes('/obras')) return json([]);
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
await sleep(1500);
await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
await sleep(2500);

const mide21 = `(() => {
    const t = [...document.querySelectorAll('#problogs .problog-card')][20];
    if (!t) return JSON.stringify({ error: 'no hay 21 tarjetas' });
    const a = (t.getAnimations ? t.getAnimations() : [])
        .find((x) => x.timeline && x.timeline.constructor && x.timeline.constructor.name === 'ViewTimeline');
    const r = t.getBoundingClientRect();
    return JSON.stringify({
        top: Math.round(r.top),
        progreso: a ? Math.round(((a.effect.getComputedTiming().progress) || 0) * 100) : null,
        opacidad: getComputedStyle(t).opacity,
        contentVisibility: getComputedStyle(t).contentVisibility
    });
})()`;

const general = JSON.parse((await evalJs(`(() => {
    const tarjetas = [...document.querySelectorAll('#problogs .problog-card')];
    const primera = tarjetas[0];
    const estilos = getComputedStyle(primera);
    const a = (primera.getAnimations ? primera.getAnimations() : [])
        .find((x) => x.timeline && x.timeline.constructor && x.timeline.constructor.name === 'ViewTimeline');
    return JSON.stringify({
        tarjetas: tarjetas.length,
        hayViewTimeline: !!a,
        contentVisibility: estilos.contentVisibility,
        animationRange: estilos.animationRange || estilos.animationTimeline
    });
})()`)) || 'null');
console.log(`Feed: ${general.tarjetas} tarjetas · animacion atada a ViewTimeline: ${general.hayViewTimeline}`);
console.log(`content-visibility: ${general.contentVisibility} (se probo y se quito a proposito)`);

await evalJs(`window.scrollTo(0, 0)`);
await sleep(700);
const antes = JSON.parse((await evalJs(mide21)) || 'null');
console.log(`Tarjeta 21 sin haber bajado (top ${antes.top}px): progreso ${antes.progreso}%, opacidad ${antes.opacidad}`);

await evalJs(`document.querySelectorAll('#problogs .problog-card')[20].scrollIntoView({ block: 'center' })`);
await sleep(900);
const despues = JSON.parse((await evalJs(mide21)) || 'null');
console.log(`Tarjeta 21 ya en pantalla (top ${despues.top}px):   progreso ${despues.progreso}%, opacidad ${despues.opacidad}`);

const ok = general.tarjetas > 20
    && general.hayViewTimeline === true          // atada a una ViewTimeline (no al tiempo)
    && general.contentVisibility === 'visible'   // content-visibility quitado a proposito
    && antes.progreso === 0                       // aun no ha entrado: al 0%
    && despues.progreso === 100                   // ya ha entrado: al 100%
    && Number(despues.opacidad) === 1;            // y se ve del todo
console.log(ok ? '\nOK: las tarjetas entran animadas siguiendo el scroll, sin JavaScript.'
    : '\nFALLO: revisar los numeros de arriba.');
salir(ok ? 0 : 1);
