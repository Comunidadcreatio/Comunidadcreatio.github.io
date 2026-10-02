// CONTRASTE DE SUPERFICIES: mide el contraste real de los textos de la interfaz, en los dos temas.
//
// POR QUE EXISTE: hasta ahora solo habia contraste medido en los COMENTARIOS (`verificar-contraste-
// comentarios.mjs`, 48 comprobaciones). El resto de la interfaz (etiquetas del panel, tarjetas,
// pildoras de estado, botones, campos y la pantalla de auth) estaba sin red: nadie sabia si el texto
// se lee. Y es justo la clase de cosa que se rompe sin querer al cambiar un color de la paleta.
//
// COMO MIDE: para cada par (elemento, etiqueta) lee el COLOR del texto y su tamano y peso, y busca
// el PRIMER FONDO NO TRANSPARENTE subiendo por los padres (el fondo efectivo, que casi nunca es el
// del propio elemento). Calcula el contraste con la formula de WCAG y exige:
//   - 4.5:1 para texto normal
//   - 3:1 para texto grande (>=24px, o >=18.66px en negrita), que es lo que pide AA
// Los elementos que no existen en esa vista NO cuentan como fallo: se informan aparte.
//
// Uso: node scripts/verificar-contraste-superficies.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9802;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'contraste-'));
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
const MOCK = `(() => {
    try {
        const enAuth = /(auth|reset-password)\\.html$/.test(location.pathname);
        if (enAuth) { localStorage.removeItem('artistaData'); localStorage.removeItem('creatio_auth_token_persist'); }
        else { localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', role: 'artista', rol: 'artista' })); localStorage.setItem('creatio_auth_token_persist', 'tok'); }
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
        if (u.includes('mis-obras')) return json({ success: true, obras: [
            { id: 9001, titulo: 'Cavent de prueba', precio: '100', status: 'Activo' },
            { id: 9002, titulo: 'Otro Cavent', precio: '200', status: 'Inactivo' }] });
        if (u.includes('/obras')) return json([]);
        if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
        return json({ success: true, no_leidas: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
    };
})();`;

// La medida se hace EN LA PAGINA: el navegador es el unico que sabe el fondo efectivo.
const MEDIR = (sel) => `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const cs = getComputedStyle(el);
    const aRgb = (t) => {
        const m = t.match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const p = m[1].split(',').map((x) => parseFloat(x));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    let fondo = null, nodo = el;
    while (nodo && nodo !== document.documentElement.parentNode) {
        const c = aRgb(getComputedStyle(nodo).backgroundColor);
        if (c && c.a > 0.05) { fondo = c; break; }
        nodo = nodo.parentElement;
    }
    if (!fondo) fondo = { r: 255, g: 255, b: 255, a: 1 };
    const texto = aRgb(cs.color);
    return JSON.stringify({
        color: cs.color, fondo: 'rgb(' + fondo.r + ', ' + fondo.g + ', ' + fondo.b + ')',
        tamano: parseFloat(cs.fontSize), peso: parseInt(cs.fontWeight, 10) || 400,
        visible: !!(el.getBoundingClientRect().width && el.getBoundingClientRect().height)
    });
})()`;

const lum = ([r, g, b]) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const aRgb = (t) => { const m = String(t).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2]]; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let pruebas = 0, fallos = 0;
const check = (nombre, ok, detalle) => {
    pruebas++;
    if (ok) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });

const PARES = {
    auth: [
        ['.auth-section h1', 'titulo de la pantalla de auth'],
        ['.auth-section p', 'parrafo de la pantalla de auth'],
        ['.form-group label', 'etiqueta de campo (auth)'],
        ['#login-email', 'texto del campo de email'],
        ['button[type="submit"]', 'texto del boton principal'],
        ['.secondary-btn', 'texto del boton secundario']
    ],
    index: [
        ['.form-block .form-group label', 'etiqueta de campo (panel)'],
        ['#input-titulo', 'texto de un campo del panel'],
        ['.cavent-item-titulo', 'titulo de la tarjeta de Cavent'],
        ['.cavent-item-meta span', 'meta de la tarjeta (precio)'],
        ['.status-badge.status-activo', 'pildora de estado activo'],
        ['.status-badge.status-inactivo', 'pildora de estado inactivo'],
        ['.ratio-btn.active', 'texto del boton de ratio']
    ]
};

for (const [vista, pares] of Object.entries(PARES)) {
    await send('Page.navigate', { url: URL_BASE + (vista === 'auth' ? 'auth.html' : '') });
    const listo = vista === 'auth' ? `!!document.getElementById('login-form')` : `!!document.getElementById('toggle-panel')`;
    for (let i = 0; i < 60; i++) { if (await evalJs(listo) === true) break; await sleep(300); }
    await sleep(1500);
    if (vista === 'auth') {
        await evalJs(`document.getElementById('btn-mostrar-login')?.click()`);
        // Estado DETERMINISTA: el formulario tiene que estar VISIBLE (con tamaño) antes de medir.
        for (let i = 0; i < 20; i++) {
            const visible = await evalJs(`(() => { const f = document.getElementById('login-form'); return !!f && f.getBoundingClientRect().height > 0; })()`);
            if (visible === true) break;
            await sleep(300);
        }
        await sleep(400);
    } else {
        // El panel (con el desplegable de Mis Cavents abierto) es donde viven las tarjetas. Se espera
        // al MISMO estado que espera la foto (pestaña de Cavents activa y caja de Problogs oculta):
        // sin eso, la mitad de las corridas medían una pantalla a medio montar y el recuento bailaba.
        await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
        for (let i = 0; i < 25; i++) {
            const listo = await evalJs(`(() => {
                const t = document.getElementById('tab-cavents');
                const p = document.getElementById('crear-problogs-contenido');
                const o = document.getElementById('obra-form');
                return !!t && t.classList.contains('activa') && !!p && p.classList.contains('hidden') && !!o
                    && o.getBoundingClientRect().height > 0;
            })()`);
            if (listo === true) break;
            await sleep(300);
        }
        await sleep(600);
        await evalJs(`document.getElementById('cavents-trigger')?.click()`);
        for (let i = 0; i < 20; i++) {
            const listo = await evalJs(`(() => {
                const it = document.querySelector('.cavent-item');
                return !!it && it.getBoundingClientRect().height > 0;
            })()`);
            if (listo === true) break;
            await sleep(300);
        }
        await sleep(500);
    }
    for (const tema of ['light', 'dark']) {
        await evalJs(`(() => { try { localStorage.setItem('theme', '${tema}'); } catch (_) {} document.documentElement.setAttribute('data-theme', '${tema}'); })()`);
        await sleep(400);
        console.log(`\n--- ${vista === 'auth' ? 'auth.html' : 'index (panel)'} · tema ${tema}`);
        for (const [sel, etiqueta] of pares) {
            const crudo = await evalJs(MEDIR(sel));
            if (!crudo || typeof crudo !== 'string' || crudo[0] !== '{') { console.log(`  --    ${etiqueta}: no esta en esta vista`); continue; }
            const m = JSON.parse(crudo);
            // Un elemento con tamaño CERO no se pinta: su "fondo efectivo" seria el de un padre que
            // tampoco se ve, y el contraste calculado no significa nada. Se informa y NO cuenta.
            if (!m.visible) { console.log(`  --    ${etiqueta}: el elemento esta oculto (no se mide)`); continue; }
            const c = aRgb(m.color), f = aRgb(m.fondo);
            const ratio = contraste(c, f);
            const grande = m.tamano >= 24 || (m.peso >= 700 && m.tamano >= 18.66);
            const minimo = grande ? 3 : 4.5;
            check(`${etiqueta} [${tema}]`, ratio >= minimo,
                `${ratio.toFixed(2)}:1 (minimo ${minimo}, texto ${m.tamano}px/${m.peso}) ${m.color} sobre ${m.fondo}`);
        }
    }
}

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
