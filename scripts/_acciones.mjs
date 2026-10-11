// Renderiza VARIANTES de la interfaz de «editar / borrar mi comentario», en el cajon real de comentarios.
// Es una herramienta de DISEÑO: sirve para elegir viendo. No comprueba nada ni entra en la suite.
//
// Uso: node scripts/_acciones.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9398;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'acciones-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PREFLIGHT: sin servidor esto mediria una pagina de error y el diagnostico enganaria.
try { const r = await fetch(URL_BASE + 'index.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
catch (e) { console.error(`NO HAY SERVIDOR en ${URL_BASE} (${e.message}).`); console.error('Levantalo antes con:  node scripts/servidor-local.mjs 8099'); process.exit(2); }

const getJson = async (u) => (await fetch(u)).json();
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const page = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
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
        const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, likes_count: 2, views_count: 5, comments_count: 2, precio: '100', foto_artista: '' }];
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (u.includes('backend-fundacion-atpe.onrender.com')) {
                const json = async (data) => ({ ok: true, status: 200, json: async () => data });
                if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
                if (u.includes('mis-reacciones')) return json({ reacciones: [] });
                if (u.includes('/comentarios')) return json({ comentarios: [
                    { id: 900, usuario_id: 1, autor_nombre: 'T', autor_foto: '', texto: 'Que bonito este retrato, me encanta como entra la luz por la izquierda.', created_at: new Date().toISOString(), likes_count: 3, comentario_padre_id: null },
                    { id: 901, usuario_id: 42, autor_nombre: 'Otra persona', autor_foto: '', texto: 'Precioso, felicidades.', created_at: new Date().toISOString(), likes_count: 1, comentario_padre_id: null }
                ] });
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
for (let i = 0; i < 60; i++) {
    const listo = await evalJs(`(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`);
    if (listo === true) break;
    await sleep(300);
}
await sleep(1200);
await evalJs(`document.documentElement.setAttribute('data-theme','light')`);
for (let intento = 0; intento < 8; intento++) {
    await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
    await sleep(900);
    if (await evalJs(`(() => { const m = document.querySelector('.metrica-comentario'); return !!m && m.getBoundingClientRect().width > 0; })()`) === true) break;
}
for (let i = 0; i < 40; i++) {
    await evalJs(`document.querySelector('.metrica-comentario')?.click()`);
    await sleep(400);
    if (await evalJs(`document.querySelectorAll('.comentario-item').length >= 2`) === true) break;
}
await sleep(900);

// El CSS de las variantes: la fila de acciones y los elementos nuevos (lo que llevaria la implementacion real).
const CSS_VARIANTES = `
.comentario-acciones-propia { display: inline-flex; align-items: center; gap: 10px; }
.comentario-btn-accion { background: none; border: none; padding: 0; font: inherit; font-size: 12px; color: var(--color-gray-500); cursor: pointer; }
.comentario-btn-accion:hover { color: var(--color-ink); }
.comentario-btn-accion.peligro:hover { color: var(--color-danger); }
.comentario-menu-btn { background: none; border: none; padding: 0 2px; font: inherit; font-size: 15px; line-height: 1; color: var(--color-gray-500); cursor: pointer; }
.comentario-menu { position: relative; display: inline-block; }
.comentario-menu-lista { position: absolute; right: 0; top: 20px; background: var(--color-white); border: 1px solid var(--color-gray-200); border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.14); padding: 4px; min-width: 130px; z-index: 5; }
.comentario-menu-item { display: block; width: 100%; text-align: left; background: none; border: none; padding: 8px 10px; font: inherit; font-size: 13px; color: var(--color-ink); border-radius: 6px; cursor: pointer; }
.comentario-menu-item:hover { background: var(--color-gray-100); }
.comentario-menu-item.peligro { color: var(--color-danger); }
.comentario-editor { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }
.comentario-editor textarea { width: 100%; min-height: 62px; resize: vertical; font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--color-gray-300); border-radius: 8px; background: var(--color-white); color: var(--color-ink); }
.comentario-editor-botones { display: flex; gap: 8px; }
.comentario-btn-guardar { background: var(--color-ink); color: var(--color-white); border: none; border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 12px; cursor: pointer; }
.comentario-btn-cancelar { background: none; border: 1px solid var(--color-gray-300); border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 12px; color: var(--color-gray-600); cursor: pointer; }
.comentario-confirmar { display: flex; align-items: center; gap: 10px; margin-top: 6px; padding: 8px 10px; border-radius: 8px; background: var(--color-danger-soft, rgba(220,38,38,.08)); font-size: 12px; color: var(--color-ink); }
.comentario-confirmar .peligro-fuerte { background: var(--color-danger); color: #fff; border: none; border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12px; cursor: pointer; }
`;

const ICONO_LAPIZ = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICONO_PAPELERA = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

// Cada variante se inyecta en la fila de acciones del comentario PROPIO (el primero).
const VARIANTES = [
    {
        id: '1-en-linea', titulo: 'A · enlaces en linea (como «Responder»)',
        html: '<span class="comentario-acciones-propia"><button class="comentario-btn-accion">Editar</button><button class="comentario-btn-accion peligro">Eliminar</button></span>'
    },
    {
        id: '2-menu', titulo: 'B · menu de tres puntos (cerrado)',
        html: '<span class="comentario-menu"><button class="comentario-menu-btn" aria-label="Mas opciones">&#8943;</button></span>'
    },
    {
        id: '2-menu-abierto', titulo: 'B · menu de tres puntos (abierto)',
        html: '<span class="comentario-menu"><button class="comentario-menu-btn" aria-label="Mas opciones">&#8943;</button><span class="comentario-menu-lista"><button class="comentario-menu-item">Editar</button><button class="comentario-menu-item peligro">Eliminar</button></span></span>'
    },
    {
        id: '3-iconos', titulo: 'C · iconos (lapiz y papelera)',
        html: `<span class="comentario-acciones-propia"><button class="comentario-btn-accion" aria-label="Editar" title="Editar">${ICONO_LAPIZ}</button><button class="comentario-btn-accion peligro" aria-label="Eliminar" title="Eliminar">${ICONO_PAPELERA}</button></span>`
    },
    {
        id: '5-confirmar-borrado', titulo: 'E · confirmacion de borrado en linea (con A)',
        html: '<span class="comentario-acciones-propia"><button class="comentario-btn-accion">Editar</button><button class="comentario-btn-accion peligro">Eliminar</button></span>',
        confirmar: true
    },
    {
        // ESTA VA LA ULTIMA a proposito: sustituye el texto por el campo, y eso no se puede deshacer sin
        // recargar. Si fuera antes, las siguientes saldrian sin el texto del comentario.
        id: '4-editando', titulo: 'D · editando en linea (con A)',
        html: '<span class="comentario-acciones-propia"><button class="comentario-btn-accion">Editar</button><button class="comentario-btn-accion peligro">Eliminar</button></span>',
        editor: true
    }
];

for (const v of VARIANTES) {
    await evalJs(`(() => {
        let st = document.getElementById('estilo-acciones');
        if (!st) { st = document.createElement('style'); st.id = 'estilo-acciones'; document.head.appendChild(st); }
        st.textContent = ${JSON.stringify(CSS_VARIANTES)};
        // Se limpia lo que hubiera de la variante anterior.
        document.querySelectorAll('.comentario-acciones-propia, .comentario-menu, .comentario-editor, .comentario-confirmar').forEach(function (e) { e.remove(); });
        const items = document.querySelectorAll('.comentario-item');
        const meta = items[0] && items[0].querySelector('.comentario-meta');
        if (!meta) return 'sin meta';
        const cont = document.createElement('span');
        cont.innerHTML = ${JSON.stringify(v.html)};
        meta.appendChild(cont);
        if (${v.editor ? 'true' : 'false'}) {
            const txt = items[0].querySelector('.comentario-texto');
            if (txt) {
                const ta = document.createElement('textarea');
                ta.value = txt.textContent.trim();
                const wrap = document.createElement('div');
                wrap.className = 'comentario-editor';
                wrap.appendChild(ta);
                const b = document.createElement('div');
                b.className = 'comentario-editor-botones';
                b.innerHTML = '<button class="comentario-btn-guardar">Guardar</button><button class="comentario-btn-cancelar">Cancelar</button>';
                wrap.appendChild(b);
                txt.replaceWith(wrap);
            }
        }
        if (${v.confirmar ? 'true' : 'false'}) {
            const c = document.createElement('div');
            c.className = 'comentario-confirmar';
            c.innerHTML = '<span>¿Eliminar este comentario?</span><button class="peligro-fuerte">Si, eliminar</button><button class="comentario-btn-cancelar">Cancelar</button>';
            items[0].querySelector('.comentario-body').appendChild(c);
        }
        return 'ok';
    })()`);
    await sleep(450);
    const caja = JSON.parse(await evalJs(`(() => {
        const it = document.querySelector('.comentario-item');
        const r = it.getBoundingClientRect();
        return JSON.stringify({ x: Math.max(0, r.left - 12), y: Math.max(0, r.top - 12), width: r.width + 24, height: r.height + 140 });
    })()`) || '{}');
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...caja, scale: 3 } });
    if (!shot.result?.data) { console.log(`  ${v.id}: NO se pudo capturar -> ${JSON.stringify(shot.error || {}).slice(0, 120)} caja=${JSON.stringify(caja)}`); continue; }
    const ruta = `scripts/_accion-${v.id}.png`;
    writeFileSync(ruta, Buffer.from(shot.result.data, 'base64'));
    console.log(`  ${v.id.padEnd(20)} -> ${ruta}   (${v.titulo})`);
}

console.log('\nlisto.');
try { chrome.kill(); } catch {}
process.exit(0);
