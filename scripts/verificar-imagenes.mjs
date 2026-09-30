// Verifica que las imágenes se piden del TAMAÑO ADECUADO (srcset/sizes) y no siempre a 1080.
//
// POR QUE EXISTE: `cloudinaryUrl` pide 1080px por defecto y casi ninguna llamada pasaba
// ancho, así que TODO se pedía a 1080: la tarjeta de la galería (hueco de hasta 500px) y
// hasta los avatares de 36px. Esta prueba no mira el HTML: mira `img.currentSrc`, que es la
// URL que el navegador HA ELEGIDO de verdad, y saca de ella el ancho (w_640...). Eso es lo
// que se descarga el usuario.
//
// Uso: node scripts/verificar-imagenes.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9799;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'img-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=1280,900', 'about:blank'
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
await send('Runtime.enable'); await send('Page.enable');
// Las imagenes falsas apuntan al servidor local (con /upload/ para que Cloudinary las
// transforme): asi no se molesta a ningun servidor de fuera y no hay esperas de red.
const BASE_IMG = URL_BASE.replace(/\/$/, '');
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
        } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        const img = (n) => '${BASE_IMG}/upload/v123/foto' + n + '.jpg';
        const obra = { id: 66001, titulo: 'Obra con fotos', precio: '100', artista: 'Ana',
            artista_user_id: 480002, foto_artista: img('a'), estado_obra: 'publicada', vistas: 0,
            imagen_url: img(1), imagen_url_1: img(2), imagen_url_2: img(3),
            imagen_url_3: '', imagen_url_4: '', imagen_thumbnail_url: '',
            categoria: '', tecnica: '', created_at: new Date().toISOString() };
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/obras')) return json([obra]);
            if (u.includes('/problogs')) return json({ success: true, problogs: [], total: 0 });
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
const cargar = async (ancho, dpr) => {
    await send('Emulation.setDeviceMetricsOverride', { width: ancho, height: 900, deviceScaleFactor: dpr, mobile: dpr > 1 });
    await send('Page.navigate', { url: URL_BASE });
    for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`) === true) break; await sleep(300); }
    // La galeria se abre con el boton de Explorar del nav (es el camino del usuario) y se
    // espera a que aparezca una tarjeta. Antes se probo con window.abrirObraDesdePerfil y no
    // bastaba: esa funcion llama a toggleGaleria, que SE SALE EN SILENCIO si hay una
    // transicion en curso, y en el arranque la hay.
    for (let intento = 0; intento < 8; intento++) {
        const tarjetas = await evalJs(`document.querySelectorAll('.obra-card').length`);
        if (Number(tarjetas) > 0) break;
        await evalJs(`document.getElementById('btn-buscar')?.click()`);
        await sleep(1600);
    }
    await sleep(2000);
};
// Saca el ancho elegido (w_640) de la URL que el navegador ha escogido.
const LEER = `(() => {
    const anchoDe = (u) => { const m = String(u).match(/w_(\\d+)/); return m ? Number(m[1]) : null; };
    const card = document.querySelector('.obra-card');
    const foto = card ? card.querySelector('.obra-carousel-slide img') : null;
    const avatar = card ? card.querySelector('img.obra-avatar-round') : null;
    const slides = card ? [...card.querySelectorAll('.obra-carousel-slide img')] : [];
    const galeria = document.getElementById('galeria-publica');
    const cont = document.getElementById('galeria-container');
    return JSON.stringify({
        diag: {
            tieneGlobal: typeof window.abrirObraDesdePerfil === 'function',
            galeriaVisible: galeria ? !galeria.classList.contains('hidden') : null,
            contHijos: cont ? cont.children.length : -1,
            contTexto: cont ? cont.textContent.trim().slice(0, 60) : '(sin contenedor)',
            blancaLibre: document.getElementById('pagina-blanca') ? document.getElementById('pagina-blanca').classList.contains('hidden') : null
        },
        hayTarjeta: !!card, hayFoto: !!foto, hayAvatar: !!avatar,
        fotoSrcset: foto ? (foto.getAttribute('srcset') || '') : '',
        fotoSizes: foto ? (foto.getAttribute('sizes') || '') : '',
        fotoElegido: foto ? anchoDe(foto.currentSrc) : null,
        fotoSrc: foto ? anchoDe(foto.getAttribute('src')) : null,
        fotoAnchoReal: foto ? Math.round(foto.getBoundingClientRect().width) : null,
        avatarSrcset: avatar ? (avatar.getAttribute('srcset') || '') : '',
        avatarElegido: avatar ? anchoDe(avatar.currentSrc) : null,
        avatarAnchoReal: avatar ? Math.round(avatar.getBoundingClientRect().width) : null,
        // El ancho mas grande que OFRECE el avatar. No se mira el currentSrc porque el avatar
        // lleva loading="lazy": si esta fuera de pantalla, el navegador aun no ha elegido
        // candidato y sale vacio (eso hizo fallar la comprobacion sin motivo).
        avatarMaxOfrecido: (() => { const m = [...String(avatar ? (avatar.getAttribute('srcset') || '') : '').matchAll(/w_(\\d+)/g)].map((x) => Number(x[1])); return m.length ? Math.max(...m) : null; })(),
        avatarSrc: avatar ? Number((String(avatar.getAttribute('src')).match(/w_(\\d+)/) || [])[1]) : null,
        // Solo se exige srcset a los avatares cuya URL es de Cloudinary: el avatar por
        // defecto es una ruta local y ahi un srcset vacio es lo correcto. Se usa indexOf en
        // vez de una expresion regular: dentro de estas plantillas los regex se lian.
        avataresSinSrcset: [...document.querySelectorAll('img[class*="avatar"]')].filter((i) => (i.getAttribute('src') || '').indexOf('/upload/') !== -1 && !i.getAttribute('srcset')).map((i) => (i.className || '').toString().slice(0, 26)),
        avataresTotal: document.querySelectorAll('img[class*="avatar"]').length,
        slides: slides.length,
        eager: slides.filter((s) => s.getAttribute('loading') === 'eager').length,
        lazy: slides.filter((s) => s.getAttribute('loading') === 'lazy').length,
        asyncTodos: slides.every((s) => s.getAttribute('decoding') === 'async')
    });
})()`;

console.log('=== 1. Escritorio normal (1280px, densidad 1): hueco de 500px ===');
await cargar(1280, 1);
const escritorio = JSON.parse(await evalJs(LEER));
console.log('   ' + JSON.stringify({ foto: escritorio.fotoElegido, src: escritorio.fotoSrc, hueco: escritorio.fotoAnchoReal, sizes: escritorio.fotoSizes, slides: escritorio.slides }));
console.log('   diagnostico: ' + JSON.stringify(escritorio.diag));
check('la tarjeta de la obra existe', escritorio.hayTarjeta === true);
check('la foto tiene srcset', (escritorio.fotoSrcset.match(/w/g) || []).length >= 3, escritorio.fotoSrcset.slice(0, 60));
check('y tiene sizes', !!escritorio.fotoSizes, escritorio.fotoSizes);
check('el navegador elige un ancho RAZONABLE para un hueco de ~500px (no 1080)',
    escritorio.fotoElegido !== null && escritorio.fotoElegido <= 800, `${escritorio.fotoElegido}px para un hueco de ${escritorio.fotoAnchoReal}px`);
check('el src de reserva sigue estando', escritorio.fotoSrc !== null, escritorio.fotoSrc);

console.log('\n=== 2. El avatar: antes pedia la imagen ORIGINAL para un hueco diminuto ===');
console.log('   ' + JSON.stringify({ ofrece: escritorio.avatarMaxOfrecido, src: escritorio.avatarSrc, srcset: (escritorio.avatarSrcset || '').slice(0, 70) }));
check('el avatar tiene srcset', (escritorio.avatarSrcset.match(/w/g) || []).length >= 3, escritorio.avatarSrcset.slice(0, 50));
check('el avatar NO ofrece nada mayor de 240px (antes pedia la original, que puede ser de 1080)',
    escritorio.avatarMaxOfrecido !== null && escritorio.avatarMaxOfrecido <= 240, escritorio.avatarMaxOfrecido);
check('y su src de reserva tambien es pequeno', escritorio.avatarSrc !== null && escritorio.avatarSrc <= 240, escritorio.avatarSrc);
check('los avatares de la galeria y los comentarios llevan srcset', escritorio.avataresSinSrcset.length === 0,
    `pendientes: ${JSON.stringify(escritorio.avataresSinSrcset)}`);

console.log('\n=== 3. Carga diferida: la primera imagen ya, las demas cuando hagan falta ===');
check('la primera imagen se carga ya (eager)', escritorio.eager === 1, escritorio.eager);
check('las siguientes son perezosas (lazy)', escritorio.lazy === escritorio.slides - 1 && escritorio.slides > 1, `${escritorio.lazy} de ${escritorio.slides}`);
check('todas decodifican en segundo plano (async)', escritorio.asyncTodos === true);

console.log('\n=== 4. Movil de pantalla densa (393px, densidad 3): ahi SI conviene el grande ===');
await cargar(393, 3);
const movil = JSON.parse(await evalJs(LEER));
console.log('   ' + JSON.stringify({ foto: movil.fotoElegido, hueco: movil.fotoAnchoReal, avatar: movil.avatarElegido }));
check('en movil denso el navegador pide una foto mayor (es lo correcto)',
    movil.fotoElegido !== null && movil.fotoElegido >= 800, movil.fotoElegido);
check('y el avatar sigue ofreciendo solo tamaños pequeños', movil.avatarMaxOfrecido !== null && movil.avatarMaxOfrecido <= 240, movil.avatarMaxOfrecido);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
