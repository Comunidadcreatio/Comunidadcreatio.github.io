// INSPECTOR DE CASCADA: dice QUÉ regla gana una propiedad en un elemento, de verdad.
//
// Existe porque deducir el ganador a base de `grep` cuesta vueltas y da falsos positivos:
// hay reglas con el selector repartido en varias líneas, listas de selectores mezcladas y
// capas de por medio. Aquí se le pregunta al navegador: se recorren TODAS las hojas (con
// sus @media y sus @layer) y se listan las reglas que casan con el elemento y declaran la
// propiedad, ordenadas por el orden REAL de la cascada. La última de la lista es la que
// gana. Además se pinta la cadena de padres con su ancho, para ver quién encoge a quién.
//
// Uso:
//   node scripts/dbg-cascada.mjs http://127.0.0.1:8099/ --estado editor \
//        --elemento "#problog-form" --propiedades width,padding-top,font-size
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9733;
const args = process.argv.slice(2);
const arg = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const ESTADO = arg('--estado', 'editor');
const ELEMENTO = arg('--elemento', '#problog-form');
const PROPIEDADES = arg('--propiedades', 'width,padding-top,font-size,overflow-x').split(',').map((s) => s.trim());
const ANCHO = Number(arg('--ancho', '393'));

const perfil = mkdtempSync(join(tmpdir(), 'casc-'));
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
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300);
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: 852, deviceScaleFactor: 1, mobile: ANCHO < 500 });
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
        for (let i = 1; i <= 12; i++) bloques.push({ tipo: 'texto', contenido: 'Parrafo ' + i + ' de prueba.' });
        const pub = { id: 71001, titulo: 'Prueba', etiquetas: '', estado: 'publicado', created_at: new Date(ahora - 3600000).toISOString(),
            bloques, imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
            portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0, comentarios_count: 1, reblogs_count: 0,
            liked: false, reblogged: false };
        const comentarios = [{ id: 1, problog_id: 71001, usuario_id: 10, texto: 'Comentario', comentario_padre_id: null,
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
            if (u.includes('/problogs/71001')) return json(pub);
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

// Se abre el estado pedido, igual que hace la foto de estilos.
if (ESTADO === 'editor') {
    await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
    await sleep(1600);
    await evalJs(`document.getElementById('tab-problogs')?.click()`);
    await sleep(1800);
} else if (ESTADO === 'problogs') {
    await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
    await sleep(1800);
    await evalJs(`document.querySelector('#problogs .problog-card')?.click()`);
    await sleep(2200);
}

const analisis = await evalJs(`(() => {
    const props = ${JSON.stringify(PROPIEDADES)};
    const el = document.querySelector(${JSON.stringify(ELEMENTO)});
    if (!el) return JSON.stringify({ error: 'no existe el elemento' });
    const especificidad = (sel) => {
        const ids = (sel.match(/#[\\w-]+/g) || []).length;
        const clases = (sel.match(/\\.[\\w-]+|\\[[^\\]]+\\]|:(?!:)[a-z-]+(?:\\([^)]*\\))?/g) || []).length;
        const etiquetas = (sel.replace(/::?[a-z-]+(?:\\([^)]*\\))?/g, '').match(/(^|[\\s>+~,])([a-z]+)/g) || []).length;
        return [ids, clases, etiquetas];
    };
    const filas = [];
    let orden = 0;
    const hojas = [...document.styleSheets];
    hojas.forEach((hoja, iHoja) => {
        let reglas; try { reglas = hoja.cssRules; } catch (_) { return; }
        const recorrer = (lista, contexto) => {
            for (const r of lista) {
                if (!r) continue;
                if (r.cssRules && r.conditionText !== undefined) { recorrer(r.cssRules, contexto + ' ' + (r.conditionText || '')); continue; }
                if (r.cssRules && !r.selectorText) { recorrer(r.cssRules, contexto); continue; }
                if (!r.selectorText) continue;
                let coincide = false; try { coincide = el.matches(r.selectorText); } catch (_) { coincide = false; }
                if (!coincide) continue;
                for (const p of props) {
                    const v = r.style.getPropertyValue(p);
                    if (!v) continue;
                    const esp = especificidad(r.selectorText);
                    filas.push({ hoja: (hoja.href || '(inline)').split('/').pop(), iHoja, orden: orden++,
                        media: contexto.trim(), selector: r.selectorText, prop: p, valor: v,
                        importante: r.style.getPropertyPriority(p) === 'important',
                        ids: esp[0], clases: esp[1], etiquetas: esp[2] });
                }
            }
        };
        recorrer(reglas, '');
    });
    // Cadena de padres con su ancho: para ver quien encoge a quien.
    const cadena = [];
    let n = el;
    while (n && n !== document.documentElement.parentNode) {
        const r = n.getBoundingClientRect();
        const cs = getComputedStyle(n);
        cadena.push({ etiqueta: n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : ''),
            ancho: Math.round(r.width), padding: cs.paddingLeft + '/' + cs.paddingRight, paddingTop: cs.paddingTop,
            display: cs.display, boxSizing: cs.boxSizing });
        n = n.parentElement;
    }
    return JSON.stringify({ elemento: ${JSON.stringify(ELEMENTO)}, props, filas, cadena,
        computado: Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])) });
})()`);

if (typeof analisis !== 'string' || analisis.startsWith('EXC')) { console.error('Fallo:', String(analisis).slice(0, 300)); salir(2); }
const a = JSON.parse(analisis);
if (a.error) { console.error(a.error); salir(2); }
console.log(`Elemento ${a.elemento}  (estado: ${ESTADO}, ancho ${ANCHO}px)`);
console.log('Computado:', JSON.stringify(a.computado));
console.log('\nCadena de padres (de dentro afuera):');
for (const c of a.cadena.slice(0, 7)) console.log(`  ${String(c.ancho).padStart(5)}px  ${c.etiqueta.slice(0, 60)}  [${c.display}, ${c.boxSizing}, pad ${c.padding}, pt ${c.paddingTop}]`);
console.log('\nReglas que declaran esas propiedades (la ULTIMA gana):');
// Orden real de la cascada: primero las capadas (por hoja/orden), despues las sueltas
// (por especificidad y luego por orden). Dentro de esto, lo importante va al final.
const sueltas = a.filas.filter((f) => !/\\(layer\\)/.test(f.selector));
const cmp = (x, y) => {
    if (x.importante !== y.importante) return x.importante ? 1 : -1;
    if (x.ids !== y.ids) return x.ids - y.ids;
    if (x.clases !== y.clases) return x.clases - y.clases;
    if (x.etiquetas !== y.etiquetas) return x.etiquetas - y.etiquetas;
    return x.orden - y.orden;
};
for (const f of [...a.filas].sort(cmp)) {
    const esp = `${f.ids},${f.clases},${f.etiquetas}`;
    console.log(`  (${esp}) ${f.prop}: ${f.valor}${f.importante ? ' !important' : ''}  ${f.hoja}${f.media ? ' @' + f.media : ''}`);
    console.log(`        ${f.selector.slice(0, 110)}`);
}
console.log('\n(Nota: esta lista es orientativa; el ganador real es el que coincide con el valor computado de arriba.)');
void sueltas;
salir(0);
