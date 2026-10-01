// FOTO DE ESTILOS CALCULADOS: red de seguridad para refactorizar el CSS sin miedo.
//
// Captura el estilo CALCULADO de una lista de elementos en DOS paginas (index y auth),
// en los DOS temas y en DOS anchos, y lo guarda en un JSON. Con `--comparar` se compara
// una foto nueva contra la de antes y se listan las diferencias: si no hay ninguna, el
// cambio de CSS no movio nada.
//
// Cosas que se hacen a proposito para que la medida sea FIABLE (cada una salio de un
// falso positivo real):
//   - El tema se fija Y SE COMPRUEBA. theme.js lo elige por la HORA del dia y lo guarda
//     en localStorage['theme']; si solo se cambiara el atributo, su inicializacion podia
//     revertirlo a mitad de la captura y se mediria el tema equivocado.
//   - Se APAGAN las transiciones (la app tiene `transition` de 300 ms): si no, los
//     valores cambian entre las dos lecturas y se descartan propiedades.
//   - Se espera a document.fonts.ready: si la fuente web (Nunito) carga despues de
//     medir, cambian los altos.
//   - Cada valor se lee DOS veces y se descartan los que bailan.
//   - Se guarda el tema REAL de cada medida, para que una captura con el tema
//     equivocado se note en vez de parecer un cambio.
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

const PROPIEDADES = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'width', 'height',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'backgroundColor', 'backgroundImage', 'color', 'opacity', 'visibility', 'overflow',
    'overflowX', 'overflowY', 'borderTopWidth', 'borderTopStyle', 'borderTopColor',
    'borderLeftWidth', 'borderLeftStyle', 'borderRadius', 'boxShadow', 'backdropFilter',
    'transform', 'boxSizing', 'appearance', 'fontFamily', 'fontSize', 'fontWeight',
    'lineHeight', 'letterSpacing', 'textAlign', 'textDecorationLine', 'cursor',
    'outlineWidth', 'outlineStyle', 'pointerEvents', 'flexDirection', 'minHeight',
    'scrollbarWidth', 'msOverflowStyle'
];

// Elementos que se vigilan en cada pagina. Son SELECTORES: `querySelector` sirve igual
// para ids, clases y etiquetas, y asi una sola lista vale para todo.
const PAGINAS = [
    {
        nombre: 'index',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        // Muestra de etiquetas SIN clases, fuera de pantalla pero renderizada: aisla las
        // reglas de BASE (las que dependen solo de la etiqueta) del resto de la app.
        fixture: true,
        selectores: [
            '#fx-input', '#fx-email', '#fx-pass', '#fx-textarea', '#fx-select', '#fx-button',
            '#fx-submit', '#fx-p', '#fx-h2', '#fx-label', '#fx-a', '#fx-span', '#fx-div',
            '#fx-main', '#fx-picture', '#fx-img', '#fx-form', '#fx-fieldset', '#fx-legend',
            '#fx-invalid', '#fx-invalid-select',
            'html', 'body', '#main-header', '#toggle-panel', '#toggle-panel .nav-btn',
            '#btn-notificaciones', '#desktop-logout-all', '#desktop-logout-single',
            '#mobile-logout-all', '#mobile-logout-single', '#problog-responder-barra'
        ]
    },
    {
        nombre: 'auth',
        ruta: 'auth.html',
        esperar: `!!document.getElementById('login-form') || !!document.getElementById('main-content')`,
        fixture: false,
        selectores: [
            'html', 'body', '#main-content', '#login-section', '#login-landing',
            '#login-form', '#login-email', '#login-pass', '.auth-container',
            'button[type="submit"]', '#auth-dark-mode-btn',
            // Los estados de estos campos los gobiernan las reglas de :invalid / :valid de
            // auth.css, y su competidora es el estilo base de los campos (formularios.css).
            // Sin ellos en la lista, ese trozo de cascada se quedaba sin red.
            '#forgot-section', '#forgot-email', '#reg-rol'
        ]
    },
    {
        // La vista de Problogs: se ABRE (feed + publicacion) en vez de solo cargar la
        // pagina. Sin esto, cualquier cambio en problogs.css se quedaria sin cubrir.
        nombre: 'problogs',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        fixture: false,
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-problogs-nav')?.click()`);
            await dormir(1800);
            for (let intento = 0; intento < 6; intento++) {
                await ev(`document.querySelector('#problogs .problog-card')?.click()`);
                await dormir(1500);
                const abierta = await ev(`!!document.getElementById('problogs-detalle') && !document.getElementById('problogs-detalle').classList.contains('hidden')`);
                if (abierta === true) break;
                await ev(`document.getElementById('btn-problogs-nav')?.click()`);
                await dormir(1200);
            }
            await dormir(1000);
            // Y se pulsa «Responder» para que la barra de responder este de verdad en
            // pantalla (no oculta) y su sitio se pueda medir.
            const centro = await ev(`(() => {
                const b = document.querySelector('#problogs-detalle [data-comentario-responder]');
                if (!b) return null;
                b.scrollIntoView({ block: 'center', behavior: 'instant' });
                const r = b.getBoundingClientRect();
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (centro && typeof centro === 'string') {
                const c = JSON.parse(centro);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(1000);
        },
        selectores: [
            '#problogs', '#problogs .problogs-feed', '#problogs .problog-card',
            '#problogs-detalle', '#problogs-detalle .problog-titulo',
            '#problogs-detalle .problog-contenido', '[data-problog-comentarios]',
            '.problog-comentario', '.problog-comentario-avatar', '.problog-comentario-texto',
            '.problog-comentario-input', '.problog-comentario-enviar',
            '.problog-social-btn', '.problog-marcadores',
            '#problog-responder-barra', '#problog-responder-texto', '.problog-responder-icono'
        ]
    },
    {
        // El PANEL del artista: el formulario de la OBRA (Cavents) tal cual se ve. Faltaba
        // por completo, y es justo donde vive el estilo BASE de los campos
        // (`#panel-artista input` en formularios.css, que style.css importa) que compite con
        // las reglas de estado de auth.css. Sin esta vista, mover ese estilo de capa se hacia
        // a ciegas. Se abre el panel y se deja la pestaña de Cavents activa (la de por
        // defecto), para medir los campos VISIBLES.
        nombre: 'panel',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        fixture: false,
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-crear-cavent')?.click()`);
            await dormir(1600);
            await ev(`document.getElementById('tab-cavents')?.click()`);
            await dormir(1200);
        },
        selectores: [
            '#obra-form', '#obra-form .form-section', '#obra-form .form-group',
            '#input-titulo', '#input-artista', '#input-ano', '#input-precio',
            '#input-ancho', '#input-alto', '#input-etiquetas', '#obra-etiquetas-bar',
            '#input-status', '#input-estado-obra', '#input-descripcion-tecnica',
            '.custom-select', '.custom-select-trigger', '#obra-step-bar',
            '#obra-form .form-section-content'
        ]
    },
    {
        // El DIRECTORIO del chat. Hace falta porque el chat no tenia ninguna cobertura
        // visual (ni verificador hasta hace poco), y ahi vive una familia entera de
        // reglas de chat.css. Se ABRE el chat y se despliega el primer pueblo, para que la
        // fila de usuario tambien quede medida.
        nombre: 'chat',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        fixture: false,
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-chat-global')?.click()`);
            await dormir(2200);
            await ev(`document.querySelector('#chat-accordion .chat-pueblo-header')?.click()`);
            await dormir(900);
        },
        selectores: [
            '#chat-global', '#chat-directorio', '#chat-conversaciones',
            '#chat-accordion', '#chat-accordion .chat-pueblo',
            '.chat-pueblo-header', '.chat-pueblo-nombre', '.chat-pueblo-bandera',
            '.chat-pueblo-counts', '.chat-pueblo-count', '.chat-pueblo-count.act',
            '.chat-pueblo-count.tot', '.chat-pueblo-chevron',
            '.chat-pueblo-cuerpo', '.chat-pueblo-cuerpo-contenido', '.chat-pueblo-vacio',
            '.chat-user-row', '.chat-user-nombre', '.chat-user-estado',
            '#btn-chat-global-fab', '#chat-cerrar'
        ]
    },
    {
        // El PERFIL de otro artista. Se llega por el CAMINO REAL (no llamando a una funcion):
        // la galeria es la seccion inicial, su tarjeta lleva el avatar del artista con
        // data-artista-id, y al tocarlo se abre su perfil. Antes no estaba cubierto y el
        // perfil tiene su propia familia de reglas en galeria-publica.css / style.css.
        nombre: 'perfil',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        fixture: false,
        abrir: async (ev, dormir) => {
            // Al arrancar, la app llama a mostrarPaginaBlanca() y la galeria solo aparece
            // al navegar. Se usa el mismo camino que la app: `abrirObraDesdePerfil` (que
            // main.js expone en window) muestra la galeria con la obra Y conecta el clic
            // del avatar con verPerfilArtistaDesdeGaleria.
            await ev(`window.abrirObraDesdePerfil ? window.abrirObraDesdePerfil(55001) : null`);
            await dormir(2600);   // que la galeria cargue su obra
            const antes = await ev(`(() => {
                const av = document.querySelector('.obra-avatar-clickable');
                const ids = ['galeria-publica','panel-artista','mi-cuenta','perfil-usuario','resultados-busqueda','pagina-blanca','problogs','chat-global'];
                const visibles = ids.filter((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
                const gc = document.getElementById('galeria-container');
                return JSON.stringify({
                    visibles: visibles,
                    galeriaOculta: document.getElementById('galeria-publica').classList.contains('hidden'),
                    tarjetas: document.querySelectorAll('.obra-card').length,
                    avatares: document.querySelectorAll('.obra-avatar-clickable').length,
                    conDataId: document.querySelectorAll('.obra-avatar-clickable[data-artista-id]').length,
                    dataId: av ? (av.dataset ? av.dataset.artistaId : null) : null,
                    gcHijos: gc ? gc.children.length : -1,
                    gcTexto: gc ? gc.textContent.trim().slice(0, 70) : '(sin contenedor)'
                });
            })()`);
            console.log('   [perfil] antes del clic: ' + antes);
            const clic = await ev(`(() => {
                const a = document.querySelector('.obra-avatar-clickable[data-artista-id]')
                    || document.querySelector('.obra-avatar-clickable');
                if (!a) return null;
                a.scrollIntoView({ block: 'center', behavior: 'instant' });
                const r = a.getBoundingClientRect();
                if (!r.width || !r.height) return null;
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (clic && typeof clic === 'string' && clic.charAt(0) === '{') {
                const c = JSON.parse(clic);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(2600);
            const despues = await ev(`JSON.stringify({
                perfilOculto: document.getElementById('perfil-usuario').classList.contains('hidden'),
                galeriaOculta: document.getElementById('galeria-publica').classList.contains('hidden')
            })`);
            console.log('   [perfil] despues del clic: ' + despues);
        },
        selectores: [
            '#perfil-usuario', '#perfil-avatar-seccion', '.perfil-nombre-artista-seccion',
            '.perfil-nombre-real-seccion', '.perfil-ciudad', '#perfil-avatar-btn',
            '#perfil-online-indicator', '.perfil-avatar-overlay',
            '#perfil-usuario .perfil-tabs', '#perfil-usuario .perfil-tab',
            '#perfil-usuario .perfil-stats', '#perfil-usuario .perfil-grid',
            '#galeria-publica', '#galeria-container', '.obra-card',
            '.obra-avatar-clickable', '.obra-avatar-placeholder', '.obra-card-titulo'
        ]
    },
    {
        // El EDITOR de Problogs. Hace falta porque dentro de su modal hay reglas de
        // formularios.css (una móvil con mucha especificidad) que compiten con las de
        // problogs.css: sin abrirlo, un cambio de capas ahí pasaria inadvertido.
        nombre: 'editor',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        fixture: false,
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-crear-cavent')?.click()`);
            await dormir(1600);
            await ev(`document.getElementById('tab-problogs')?.click()`);
            await dormir(1600);
            // Se anade un parrafo para que aparezcan los botones de accion del bloque.
            const centro = await ev(`(() => {
                const b = document.querySelector('#crear-problogs-contenido .problog-anadir-btn')
                    || document.querySelector('.problog-anadir-btn');
                if (!b) return null;
                const r = b.getBoundingClientRect();
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (centro && typeof centro === 'string') {
                const c = JSON.parse(centro);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(1400);
        },
        selectores: [
            '#crear-problogs-contenido', '#problog-form', '#problog-nav-bar',
            '.problog-anadir-btn', '.problog-btn-icono', '.problog-bloque',
            '#crear-problogs-contenido button', '.problog-anadir-btn:not(.hidden)',
            '#problog-nav-bar .nav-btn', '#problog-nav-bar .crear-btn',
            '#problog-nav-bar .limpiar-btn', '#obra-step-bar', '#obra-step-bar .crear-btn',
            '#obra-step-bar .limpiar-btn', '#obra-etiquetas-bar',
            '#obra-etiquetas-bar .input-etiquetas-subtle'
        ]
    }
];

const ANCHOS = [393, 1280];
const TEMAS = ['light', 'dark'];

const salir = (codigo) => { try { ws?.close(); } catch {} try { chrome?.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(codigo); };

// ---------- modo COMPARAR (no necesita navegador) ----------
if (args.includes('--comparar')) {
    const i = args.indexOf('--comparar');
    const antes = JSON.parse(readFileSync(args[i + 1], 'utf8'));
    const despues = JSON.parse(readFileSync(args[i + 2], 'utf8'));
    const claves = new Set([...Object.keys(antes.datos), ...Object.keys(despues.datos)]);
    const diferencias = [];
    const inestables = [];
    for (const clave of claves) {
        const a = antes.datos[clave];
        const b = despues.datos[clave];
        if (!a || !b) { diferencias.push({ clave, propiedad: '(elemento)', antes: a ? 'existe' : 'NO', despues: b ? 'existe' : 'NO' }); continue; }
        const props = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const prop of props) {
            if (a[prop] === b[prop]) continue;
            // Una propiedad que falta en una de las dos fotos es una medida INESTABLE que se
            // descarto al capturar (transicion, animacion, fuente a medio cargar): no es un
            // cambio del CSS. Se informa aparte para no confundirlo con una regresion.
            if (!(prop in a) || !(prop in b)) { inestables.push({ clave, propiedad: prop }); continue; }
            diferencias.push({ clave, propiedad: prop, antes: a[prop], despues: b[prop] });
        }
    }
    console.log(`Foto A: ${antes.cuando}  ·  ${Object.keys(antes.datos).length} medidas`);
    console.log(`Foto B: ${despues.cuando}  ·  ${Object.keys(despues.datos).length} medidas`);
    if (inestables.length) {
        console.log(`\nAVISO: ${inestables.length} valores no se pudieron comparar (inestables al capturar):`);
        for (const d of inestables.slice(0, 10)) console.log(`  ${d.clave} · ${d.propiedad}`);
        if (inestables.length > 10) console.log(`  ... y ${inestables.length - 10} mas`);
    }
    if (!diferencias.length) {
        console.log('\nSIN DIFERENCIAS: el cambio de CSS no movio ni un valor calculado.');
        process.exit(inestables.length ? 1 : 0);
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
const BASE = URL_BASE.replace(/\/[^/]*$/, '/');

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

// Respuestas falsas del backend + sesion, para que las dos paginas monten sin servidor.
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
        } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        // Datos falsos: una publicacion larga con un comentario, para poder abrir la
        // vista de Problogs de verdad.
        const ahora = Date.now();
        const bloques = [];
        for (let i = 1; i <= 25; i++) bloques.push({ tipo: 'texto', contenido: 'Parrafo ' + i + ' de la publicacion de prueba.' });
        const pub = { id: 70001, titulo: 'Publicacion de prueba', etiquetas: '', estado: 'publicado',
            created_at: new Date(ahora - 3600000).toISOString(), bloques,
            imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
            portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0,
            comentarios_count: 1, reblogs_count: 0, liked: false, reblogged: false };
        const comentarios = [{ id: 1, problog_id: 70001, usuario_id: 10, texto: 'Un comentario de prueba',
            comentario_padre_id: null, created_at: new Date(ahora - 1800000).toISOString(),
            autor_nombre: 'Ana', autor_foto: '', likes_count: 0, liked: false }];
        // Una obra en la galeria. Hace falta para poder ABRIR EL PERFIL por su camino real:
        // la tarjeta pone el avatar del artista (sin foto -> un div con data-artista-id) y
        // al tocarlo se abre su perfil.
        const obra = { id: 55001, titulo: 'Obra de prueba', precio: '100', artista: 'Ana',
            artista_user_id: 480002, foto_artista: '', estado_obra: 'publicada',
            vistas: 0, imagen: '', imagenes: [], categoria: '', tecnica: '',
            created_at: new Date(ahora - 86400000).toISOString() };
        // El perfil de OTRO artista (id distinto del mio, para ver la variante de visita).
        const usuarioAjeno = { id: 480002, nombre_real: 'Ana Pérez', nombre_artista: 'Ana',
            foto_perfil: '', ciudad: 'San Cristóbal', rol: 'artista', activo: false,
            ultima_actividad: new Date(ahora - 7200000).toISOString(),
            cavents: 1, problogs: 1, comcons: 0, seguidores: 0, siguiendo: 0 };
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('/comentarios')) return json({ success: true, comentarios });
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            // Directorio del chat: sin esto la seccion sale vacia ("No hay pueblos") y se
            // fotografia el estado equivocado. Un pueblo con un artista (para los
            // contadores y la fila) y el resto vacios, que es el caso normal.
            if (u.includes('/chat/directorio')) return json({ success: true, pueblos: {
                'San Cristóbal': [{ id: 99, nombre_artista: 'Ana', foto_perfil: '',
                    ultima_actividad: new Date(ahora).toISOString() }],
                'San Antonio del Táchira': []
            } });
            if (u.includes('/chat/conversaciones')) return json({ success: true, conversaciones: [] });
            if (u.includes('/chat/bloqueados')) return json({ success: true, bloqueados: [] });
            if (u.includes('/chat/no-leidos')) return json({ success: true, no_leidos: 0 });
            if (u.includes('mis-problogs') || u.includes('mis-reblogs')) return json({ success: true, problogs: [pub], total: 1 });
            if (u.includes('/problogs/70001')) return json(pub);
            if (u.includes('/problogs')) return json({ success: true, problogs: [pub], total: 1 });
            if (u.includes('/obras')) return json([obra]);
            // El perfil de un artista concreto (para el estado perfil, de mas abajo).
            if (u.includes('artistas/perfil/480002')) return json({ success: true, usuario: usuarioAjeno });
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            // Sesion VALIDA: si esto devuelve success:false la app cree que no hay sesion y
            // se queda en la pagina en blanco, asi que la galeria no se pinta nunca (y sin
            // galeria no se puede abrir el perfil por su camino real).
            if (u.includes('verificar') || u.includes('sesion')) {
                return json({ success: true, valido: true, activo: true,
                    usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
            }
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});

const FIXTURE = `(() => {
    const f = document.createElement('div');
    f.id = 'fixture-foto';
    f.style.cssText = 'position:absolute;left:-9000px;top:0;width:320px;height:auto;';
    const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
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
        '<div id="fx-div">div</div>',
        // Elementos que faltaban por cubrir: hay reglas de etiqueta sobre ellos, y sin
        // tenerlos aquí no se podía comprobar si moverlos de capa cambia algo.
        '<main id="fx-main">principal</main>',
        '<picture id="fx-picture"><source srcset="' + gif + '"><img id="fx-img" src="' + gif + '" alt=""></picture>',
        // Pseudo-clase :invalid de verdad: un email mal formado y un select requerido vacio.
        '<form id="fx-form"><fieldset id="fx-fieldset"><legend id="fx-legend">leyenda</legend>' +
            '<input id="fx-invalid" type="email" value="no-es-email" required>' +
            '<select id="fx-invalid-select" required><option value="">elige</option></select>' +
        '</fieldset></form>'
    ].join('');
    document.body.appendChild(f);
    return 'ok';
})()`;

const datos = {};
console.log(`Foto de estilos: ${BASE}`);

for (const pag of PAGINAS) {
    for (const ancho of ANCHOS) {
        await send('Emulation.setDeviceMetricsOverride', { width: ancho, height: ancho < 500 ? 852 : 900, deviceScaleFactor: 1, mobile: ancho < 500 });
        await send('Page.navigate', { url: BASE + pag.ruta });
        for (let i = 0; i < 60; i++) { if (await evalJs(pag.esperar) === true) break; await sleep(300); }
        await sleep(1500);
        // Se apagan las transiciones (si no, los valores cambian entre las dos lecturas).
        await evalJs(`(() => {
            if (document.getElementById('foto-sin-transiciones')) return;
            const st = document.createElement('style');
            st.id = 'foto-sin-transiciones';
            st.textContent = '*, *::before, *::after { transition: none !important; }';
            document.head.appendChild(st);
        })()`);
        // Y se espera a la fuente web (Nunito): cambia altos y anchos si llega tarde.
        await evalJs(`document.fonts ? document.fonts.ready.then(() => 'ok') : 'ok'`);
        await sleep(400);
        if (pag.fixture) {
            const ok = await evalJs(FIXTURE);
            if (ok !== 'ok') { console.error(`No se pudo montar la muestra en ${pag.nombre}:`, ok); salir(2); }
        }
        // Algunas vistas hay que ABRIRLAS (Problogs: feed + publicacion + barra).
        if (pag.abrir) await pag.abrir(evalJs, sleep);
        for (const tema of TEMAS) {
            // El tema se fija Y SE COMPRUEBA (theme.js lo elige por la hora del dia).
            for (let intento = 0; intento < 4; intento++) {
                await evalJs(`(() => {
                    try { localStorage.setItem('theme', '${tema}'); } catch (_) {}
                    document.documentElement.setAttribute('data-theme', '${tema}');
                })()`);
                await sleep(400);
                if (await evalJs(`document.documentElement.getAttribute('data-theme')`) === tema) break;
            }
            const temaReal = await evalJs(`document.documentElement.getAttribute('data-theme')`);
            if (temaReal !== tema) { console.error(`No se pudo fijar el tema ${tema} en ${pag.nombre} (quedo ${temaReal})`); salir(2); }
            await sleep(300);
            const lectura = `(() => {
                const props = ${JSON.stringify(PROPIEDADES)};
                const selectores = ${JSON.stringify(pag.selectores)};
                const salida = {};
                for (const sel of selectores) {
                    const el = document.querySelector(sel);
                    if (!el) continue;
                    const cs = getComputedStyle(el);
                    const o = {};
                    for (const p of props) { const v = cs[p]; o[p] = (v === undefined || v === null) ? null : String(v); }
                    const r = el.getBoundingClientRect();
                    o.__ancho = String(Math.round(r.width)); o.__alto = String(Math.round(r.height));
                    o.__tema = document.documentElement.getAttribute('data-theme');
                    salida[sel] = o;
                }
                return JSON.stringify(salida);
            })()`;
            const a = await evalJs(lectura);
            await sleep(400);
            const b = await evalJs(lectura);
            if (typeof a !== 'string' || a.startsWith('EXC')) { console.error('Fallo al leer:', String(a).slice(0, 200)); salir(2); }
            const uno = JSON.parse(a), dos = JSON.parse(b);
            let inestables = 0;
            for (const [sel, props] of Object.entries(uno)) {
                const clave = `${pag.nombre} · ${tema} · ${ancho}px · ${sel}`;
                const filtrado = {};
                for (const [prop, valor] of Object.entries(props)) {
                    if (dos[sel] && dos[sel][prop] !== valor) { inestables++; continue; }
                    filtrado[prop] = valor;
                }
                datos[clave] = filtrado;
            }
            console.log(`   ${pag.nombre} · ${tema} · ${ancho}px: ${Object.keys(uno).length} elementos, ${inestables} valores inestables`);
        }
    }
}

writeFileSync(rutaSalida, JSON.stringify({ cuando: new Date().toISOString(), url: BASE, medidas: Object.keys(datos).length, datos }, null, 1), 'utf8');
console.log(`\nFoto guardada en ${rutaSalida}: ${Object.keys(datos).length} medidas`);
salir(0);
