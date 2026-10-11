// Renderiza VARIAS opciones de corazon EN EL CAJON REAL de comentarios de Cavents, y saca una captura de
// cada una. Es una herramienta de diseño: sirve para ELEGIR VIENDO, que es lo unico honesto cuando la
// decision es estetica. No comprueba nada ni forma parte de la suite.
//
// Uso: node scripts/_corazones.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9399;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'corazones-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PREFLIGHT, como los demas instrumentos: sin servidor, esto mediria una pagina de error y el diagnostico
// ("no hay app en la pagina") pareceria un fallo de la app. Ya paso una vez en esta herramienta.
try {
    const r = await fetch(URL_BASE + 'index.html');
    if (!r.ok) throw new Error('HTTP ' + r.status);
} catch (e) {
    console.error(`NO HAY SERVIDOR en ${URL_BASE} (${e.message}).`);
    console.error('Levantalo antes con:  node scripts/servidor-local.mjs 8099');
    process.exit(2);
}

const getJson = async (u) => (await fetch(u)).json();
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const page = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const excepciones = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') excepciones.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0].slice(0, 160));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
            localStorage.setItem('theme', 'light');
        } catch (_) {}
        const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
        const img45 = mkImg(800,1000,'#cc3344');
        const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (u.includes('backend-fundacion-atpe.onrender.com')) {
                const json = async (data) => ({ ok: true, status: 200, json: async () => data });
                if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
                if (u.includes('mis-reacciones')) return json({ reacciones: [] });
                if (u.includes('/comentarios')) return json({ comentarios: [{ id: 900, autor_nombre: 'Ana', autor_foto: '', texto: 'Que bonito este retrato, me encanta la luz.', created_at: new Date().toISOString(), likes_count: 3, comentario_padre_id: null }] });
                if (u.includes('/problogs')) return json({ success: true, publicaciones: [], total: 0 });
                if (u.includes('/obras')) return json(obrasMock);
                if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
                return json({ success: true });
            }
            return realFetch(input, init);
        };
    })();`
});

await send('Page.navigate', { url: URL_BASE });
// La condicion de ARRANQUE buena (la de la foto): preloader oculto, contenedor visible y barra lista. Con
// `#toggle-panel` a secas se hace clic demasiado pronto y el cajon nunca se abre.
for (let i = 0; i < 60; i++) {
    const listo = await evalJs(`(() => {
        const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container');
        return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible'));
    })()`);
    if (listo === true) break;
    await sleep(300);
}
await sleep(1200);
await evalJs(`document.documentElement.setAttribute('data-theme','light')`);
// El hub de Cavents y luego la metrica, con reintento: la app arranca por modulos y el clic se pierde.
for (let intento = 0; intento < 8; intento++) {
    await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
    await sleep(900);
    const hayTarjeta = await evalJs(`(() => { const m = document.querySelector('.metrica-comentario'); return !!m && m.getBoundingClientRect().width > 0; })()`);
    if (hayTarjeta === true) break;
}
await evalJs(`document.querySelector('.metrica-comentario')?.click()`);
for (let i = 0; i < 40; i++) {
    const listo = await evalJs(`(() => {
        const d = document.getElementById('comentarios-drawer');
        return !!d && d.classList.contains('visible') && !!document.querySelector('.comentario-btn-like');
    })()`);
    if (listo === true) break;
    await evalJs(`document.querySelector('.metrica-comentario')?.click()`);
    await sleep(300);
}
await sleep(800);

console.log('  PASO app-lista: ' + await evalJs(`(() => {
    const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container');
    return JSON.stringify({ toggle: !!t, preloaderOculto: !p || p.classList.contains('hidden'), contenedorVisible: !!a && a.classList.contains('visible'), hub: !!document.getElementById('btn-cavents-hub'), tarjetas: document.querySelectorAll('.metrica-comentario').length });
})()`));
console.log('  EXCEPCIONES en la pagina: ' + (excepciones.length ? excepciones.slice(0, 4).join(' | ') : 'ninguna'));
console.log('  DIAGNOSTICO: ' + await evalJs(`(() => {
    const b = document.querySelector('.comentario-btn-like');
    const r = b ? b.getBoundingClientRect() : null;
    return JSON.stringify({
        hayBoton: !!b,
        comentarios: document.querySelectorAll('.comentario-item').length,
        cajon: (document.getElementById('comentarios-drawer') || {}).className || 'sin cajon',
        caja: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null,
        ventana: { w: window.innerWidth, h: window.innerHeight }
    });
})()`));

// ---- candidatos ------------------------------------------------------------------------------------
const FEATHER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const REDONDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M12 20.4 4.7 13.6A5.2 5.2 0 0 1 12 6.1a5.2 5.2 0 0 1 7.3 7.5L12 20.4z"/></svg>';
const REDONDO_SOLIDO = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 20.4 4.7 13.6A5.2 5.2 0 0 1 12 6.1a5.2 5.2 0 0 1 7.3 7.5L12 20.4z"/></svg>';

const CANDIDATOS = [
    { id: 'FINAL', titulo: 'resultado real, en reposo', html: null, estilo: '' },
    { id: 'FINAL-liked', titulo: 'resultado real, con «me gusta» puesto (clase liked)', html: null, estilo: '', liked: true }
];

for (const c of CANDIDATOS) {
    await evalJs(`(() => {
        const b = document.querySelector('.comentario-btn-like');
        if (!b) return 'sin boton';
        // Con html null NO se toca el boton: se captura TAL CUAL lo pinta la app (el resultado real).
        if (${c.html === null ? 'true' : 'false'}) {
            b.classList.toggle('liked', ${c.liked ? 'true' : 'false'});
            return 'real';
        }
        let st = document.getElementById('estilo-candidato');
        if (!st) { st = document.createElement('style'); st.id = 'estilo-candidato'; document.head.appendChild(st); }
        st.textContent = ${JSON.stringify(c.estilo)};
        b.style.display = 'inline-flex'; b.style.alignItems = 'center'; b.style.gap = '5px';
        b.innerHTML = ${JSON.stringify(c.html)};
        return 'ok';
    })()`);
    await sleep(400);
    const caja = JSON.parse(await evalJs(`(() => {
        const b = document.querySelector('.comentario-btn-like');
        const r = b.getBoundingClientRect();
        return JSON.stringify({ x: Math.max(0, r.left - 14), y: Math.max(0, r.top - 14), width: r.width + 28, height: r.height + 28 });
    })()`) || '{}');
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...caja, scale: 4 } });
    const data = shot.result?.data;
    if (!data) { console.log(`  ${c.id}: NO se pudo capturar -> ${JSON.stringify(shot.error || shot).slice(0, 160)}  (caja ${JSON.stringify(caja)})`); continue; }
    const ruta = `scripts/_corazon-${c.id}.png`;
    writeFileSync(ruta, Buffer.from(data, 'base64'));
    console.log(`  ${c.id.padEnd(14)} -> ${ruta}   (${c.titulo})`);
}

console.log('\nlisto. Capturas en scripts/_corazon-*.png');
try { chrome.kill(); } catch {}
process.exit(0);
