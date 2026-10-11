// EDITAR Y BORRAR MI COMENTARIO: las dos acciones, en el cajon de comentarios.
//
// Lo que importa vigilar, y por eso existe este verificador:
//   1) que los botones salgan SOLO en los comentarios propios (`usuario_id`),
//   2) que editar CAMBIE el texto y que el cambio SIGA al cerrar y reabrir el cajon,
//   3) que borrar pida confirmacion y el comentario desaparezca,
//   4) y que SIN `usuario_id` (como los comentarios de OBRA hoy) los botones NO salgan.
//
// Ese punto 4 es el que documenta la limitacion actual: en Cavents no se ofrecen todavia, y es a proposito.
//
// Uso: node scripts/verificar-comentarios-acciones.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9313;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';

// PREFLIGHT: sin servidor esto mediria una pagina de error y los fallos serian mentira.
try { const r = await fetch(URL_BASE + 'index.html'); if (!r.ok) throw new Error('HTTP ' + r.status); }
catch (e) { console.error(`NO HAY SERVIDOR en ${URL_BASE} (${e.message}).`); console.error('Levantalo antes con:  node scripts/servidor-local.mjs 8099'); process.exit(2); }

const profileDir = mkdtempSync(join(tmpdir(), 'verif-acc-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

let pruebas = 0, fallos = 0;
function check(nombre, ok, detalle) {
    pruebas++;
    if (ok) console.log(`  PASS  ${nombre}${detalle ? ' → ' + detalle : ''}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}

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
        // La lista de comentarios CON MEMORIA: editar cambia el texto y borrar lo quita, para que al recargar
        // se vea el estado de verdad (si el mock devolviera siempre lo mismo, la prueba no probaria nada).
        let comentarios = [
            { id: 900, usuario_id: 1, autor_nombre: 'T', autor_foto: '', texto: 'Comentario mio de prueba', created_at: new Date().toISOString(), likes_count: 3, editado: 1, eliminado: 0, comentario_padre_id: null },
            { id: 901, usuario_id: 42, autor_nombre: 'Otra persona', autor_foto: '', texto: 'Comentario ajeno', created_at: new Date().toISOString(), likes_count: 1, editado: 0, eliminado: 0, comentario_padre_id: null },
            // MIO y CON UNA RESPUESTA: es el que se borra para comprobar que el borrado se lleva el hilo
            // entero (y que no queda ninguna respuesta huerfana).
            { id: 902, usuario_id: 1, autor_nombre: 'T', autor_foto: '', texto: 'Comentario con respuesta', created_at: new Date().toISOString(), likes_count: 0, editado: 0, eliminado: 0, comentario_padre_id: null },
            { id: 903, usuario_id: 42, autor_nombre: 'Otra persona', autor_foto: '', texto: 'Respuesta que se va con el', created_at: new Date().toISOString(), likes_count: 0, editado: 0, eliminado: 0, comentario_padre_id: 902 },
            // MIO y sin respuestas: se queda hasta el final, para poder abrir el editor y mirar su aspecto.
            { id: 904, usuario_id: 1, autor_nombre: 'T', autor_foto: '', texto: 'Comentario para mirar el aspecto', created_at: new Date().toISOString(), likes_count: 0, editado: 0, eliminado: 0, comentario_padre_id: null }
        ];
        // Los comentarios de PROBLOGS: otra lista, porque son otro recurso (y los pinta otro modulo).
        let comentariosProblog = [
            { id: 700, problog_id: 60001, usuario_id: 1, autor_nombre: 'T', autor_foto: '', texto: 'Comentario mio en el problog', created_at: new Date().toISOString(), likes_count: 0, editado: 0, eliminado: 0, comentario_padre_id: null },
            { id: 701, problog_id: 60001, usuario_id: 42, autor_nombre: 'Otra persona', autor_foto: '', texto: 'Comentario ajeno en el problog', created_at: new Date().toISOString(), likes_count: 0, editado: 0, eliminado: 0, comentario_padre_id: null }
        ];
        const pubMock = { id: 60001, titulo: 'Una publicacion', etiquetas: 'arte', estado: 'publicado', created_at: new Date().toISOString(), bloques: [{ tipo: 'texto', contenido: 'Texto de la publicacion.' }], imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null], portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 1, comentarios_count: 2, reblogs_count: 0, liked: false, reblogged: false };
        // Interruptor para probar los DOS casos: con usuario_id (como Problogs) y sin el (como obras hoy).
        let mandarUsuarioId = true;
        window.__mandarUsuarioId = function (v) { mandarUsuarioId = v; };
        window.__comentarios = function () { return comentarios.map(function (c) { return c.texto; }); };
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            const metodo = (init && init.method) || 'GET';
            if (u.includes('backend-fundacion-atpe.onrender.com')) {
                const json = async (data) => ({ ok: true, status: 200, json: async () => data });
                if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
                if (u.includes('mis-reacciones')) return json({ reacciones: [] });
                if (u.includes('/comentarios')) {
                    const id = Number(u.split('/').pop());
                    // Los comentarios de PROBLOGS son otra lista (y otro recurso): se distinguen por la URL.
                    const esProblog = u.indexOf('/problogs/') > -1;
                    // OJO CON EL METODO: el backend define PUT para editar. Si el frontend mandara PATCH, la
                    // peticion no casaria con ninguna ruta y el cambio no se guardaria (paso en produccion).
                    // Aqui se responde 404 igual que el backend de verdad, para que ese fallo NO pueda pasar
                    // desapercibido otra vez.
                    if (metodo === 'PATCH') return { ok: false, status: 404, json: async () => ({ success: false, error: 'Cannot PATCH' }) };
                    if (metodo === 'PUT') {
                        let texto = '';
                        try { texto = JSON.parse(init.body).texto; } catch (e) {}
                        if (esProblog) comentariosProblog = comentariosProblog.map(function (c) { return c.id === id ? Object.assign({}, c, { texto: texto, editado: 1 }) : c; });
                        else comentarios = comentarios.map(function (c) { return c.id === id ? Object.assign({}, c, { texto: texto, editado: 1 }) : c; });
                        return json({ success: true, comentario: { id: id, texto: texto, editado: 1 } });
                    }
                    if (metodo === 'DELETE') {
                        if (esProblog) comentariosProblog = comentariosProblog.filter(function (c) { return c.id !== id && c.comentario_padre_id !== id; });
                        else comentarios = comentarios.filter(function (c) { return c.id !== id && c.comentario_padre_id !== id; });
                        return json({ success: true, id: id });
                    }
                    const fuente = esProblog ? comentariosProblog : comentarios;
                    const salida = fuente.map(function (c) {
                        if (mandarUsuarioId) return c;
                        const copia = Object.assign({}, c); delete copia.usuario_id; return copia;
                    });
                    return json({ comentarios: salida });
                }
                if (u.includes('/problogs/') && !u.includes('/comentarios')) {
                    // El detalle de la publicacion (los comentarios ya se han servido arriba).
                    return json(pubMock);
                }
                if (u.includes('/problogs')) return json({ success: true, problogs: [pubMock], publicaciones: [pubMock], total: 1 });
                if (u.includes('/obras')) return json(obrasMock);
                if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
                return json({ success: true });
            }
            return realFetch(input, init);
        };
    })();`
});

// Abre el cajon de comentarios de Cavents (dos comentarios en el mock).
async function abrirCajon() {
    for (let intento = 0; intento < 8; intento++) {
        await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
        await sleep(800);
        if (await evalJs(`(() => { const m = document.querySelector('.metrica-comentario'); return !!m && m.getBoundingClientRect().width > 0; })()`) === true) break;
    }
    for (let i = 0; i < 30; i++) {
        await evalJs(`document.querySelector('.metrica-comentario')?.click()`);
        await sleep(400);
        if (await evalJs(`document.querySelectorAll('.comentario-item').length >= 2`) === true) break;
    }
    await sleep(600);
}

await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) {
    const listo = await evalJs(`(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`);
    if (listo === true) break;
    await sleep(300);
}
await sleep(1000);

console.log('\n=== 1) Con usuario_id (como los comentarios de PROBLOGS hoy) ===');
await abrirCajon();
const estado = JSON.parse(await evalJs(`(() => {
    const items = Array.from(document.querySelectorAll('.comentario-item'));
    return JSON.stringify({
        total: items.length,
        mio: { botones: items[0] ? Array.from(items[0].querySelectorAll('.comentario-btn-editar, .comentario-btn-eliminar')).map(function (b) { return b.textContent.trim(); }) : [] },
        ajeno: { botones: items[1] ? Array.from(items[1].querySelectorAll('.comentario-btn-editar, .comentario-btn-eliminar')).map(function (b) { return b.textContent.trim(); }) : [] }
    });
})()`) || '{}');
check('el comentario propio ofrece Editar y Eliminar', estado.mio.botones.join(',') === 'Editar,Eliminar', JSON.stringify(estado.mio.botones));
check('el comentario AJENO no ofrece ninguno de los dos', estado.ajeno.botones.length === 0, JSON.stringify(estado.ajeno.botones));

console.log('\n=== 2) Editar ===');
await evalJs(`document.querySelector('.comentario-item .comentario-btn-editar')?.click()`);
await sleep(500);
const editor = JSON.parse(await evalJs(`(() => {
    const campo = document.querySelector('.comentario-editor-campo');
    return JSON.stringify({ hay: !!campo, texto: campo ? campo.value : '' });
})()`) || '{}');
check('al pulsar Editar aparece el campo con el texto actual', editor.hay === true && editor.texto === 'Comentario mio de prueba', JSON.stringify(editor));

// Cancelar primero: no debe guardar nada.
await evalJs(`document.querySelector('.comentario-item .comentario-btn-cancelar')?.click()`);
await sleep(900);
const trasCancelar = await evalJs(`window.__comentarios()`);
check('Cancelar no guarda nada', Array.isArray(trasCancelar) && trasCancelar[0] === 'Comentario mio de prueba', JSON.stringify(trasCancelar));

// Y ahora editar de verdad.
await evalJs(`document.querySelector('.comentario-item .comentario-btn-editar')?.click()`);
await sleep(400);
await evalJs(`(() => {
    const campo = document.querySelector('.comentario-editor-campo');
    if (!campo) return 'sin campo';
    campo.value = 'Texto editado de prueba';
    return 'ok';
})()`);
await evalJs(`document.querySelector('.comentario-item .comentario-btn-guardar')?.click()`);
await sleep(1200);
const trasGuardar = await evalJs(`window.__comentarios()`);
check('al guardar, el cambio llega al servidor', Array.isArray(trasGuardar) && trasGuardar[0] === 'Texto editado de prueba', JSON.stringify(trasGuardar));
// El rotulo «editado» se comprueba AQUI (recien editado): mas tarde la prueba borra ese comentario, y un
// comentario borrado no lleva rotulo (a proposito).
const rotulo = await evalJs(`(document.querySelector('.comentario-item .comentario-editado') || {}).textContent || ''`);
check('un comentario editado lleva su rotulo al lado de la fecha', rotulo.trim() === 'editado', JSON.stringify(rotulo));

// Cerrar y volver a abrir: el texto tiene que seguir cambiado.
await evalJs(`document.getElementById('btn-buscar')?.click()`);
await sleep(900);
await abrirCajon();
const trasReabrir = await evalJs(`(document.querySelector('.comentario-item .comentario-texto') || {}).textContent || ''`);
check('el texto editado SIGUE al cerrar y reabrir el cajon', trasReabrir.trim() === 'Texto editado de prueba', JSON.stringify(trasReabrir.trim()));

console.log('\n=== 3) Borrar el comentario QUE TIENE UNA RESPUESTA ===');
const antesDeBorrar = await evalJs(`window.__comentarios()`);
await evalJs(`document.querySelector('.comentario-item[data-id="902"] .comentario-btn-eliminar')?.click()`);
await sleep(500);
const confirmar = await evalJs(`!!document.querySelector('.comentario-item[data-id="902"] .comentario-confirmar')`);
check('al pulsar Eliminar se pide confirmacion (en linea)', confirmar === true);
await evalJs(`document.querySelector('.comentario-item[data-id="902"] .comentario-btn-borrar-si')?.click()`);
await sleep(1400);
const trasBorrar = JSON.parse(await evalJs(`JSON.stringify({
    textos: window.__comentarios(),
    idsEnPantalla: Array.from(document.querySelectorAll('.comentario-item')).map(function (e) { return e.getAttribute('data-id'); }),
    respuestasEnPantalla: document.querySelectorAll('.comentario-replies .comentario-item').length
})`) || '{}');
check('al confirmar, el comentario DESAPARECE de verdad (borrado real)',
    Array.isArray(trasBorrar.textos) && trasBorrar.textos.indexOf('Comentario con respuesta') === -1 && trasBorrar.textos.length === antesDeBorrar.length - 2,
    JSON.stringify(trasBorrar.textos));
check('y se lleva su RESPUESTA (nada de huerfanas invisibles)',
    Array.isArray(trasBorrar.idsEnPantalla) && trasBorrar.idsEnPantalla.indexOf('902') === -1 && trasBorrar.idsEnPantalla.indexOf('903') === -1,
    JSON.stringify(trasBorrar.idsEnPantalla));
check('y no queda ninguna respuesta colgando sin su comentario', trasBorrar.respuestasEnPantalla === 0, 'respuestas=' + trasBorrar.respuestasEnPantalla);

console.log('\n=== 4) El campo de editar: sin fondo, con su aire y sin el anillo ambar ===');
await evalJs(`document.querySelector('.comentario-item[data-id="904"] .comentario-btn-editar')?.click()`);
await sleep(500);
// El foco se pone con un CLIC DE VERDAD (eventos por CDP), no con `campo.focus()`: un foco puesto por script
// NO dispara `:focus-visible`, asi que el anillo del navegador no se dibujaria y la comprobacion de abajo
// pasaria sin comprobar nada (paso: la provoque y seguia en verde).
const centroCampo = await evalJs(`(() => {
    const c = document.querySelector('.comentario-editor-campo');
    if (!c) return '';
    const r = c.getBoundingClientRect();
    return Math.round(r.left + r.width / 2) + ',' + Math.round(r.top + r.height / 2);
})()`);
if (typeof centroCampo === 'string' && centroCampo.indexOf(',') > 0) {
    const [cx, cy] = centroCampo.split(',').map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
}
await sleep(300);
const campo = JSON.parse(await evalJs(`(() => {
    const c = document.querySelector('.comentario-editor-campo');
    if (!c) return JSON.stringify({ hay: false });
    const cs = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    const cuerpo = c.closest('.comentario-body');
    const rb = cuerpo ? cuerpo.getBoundingClientRect() : null;
    return JSON.stringify({
        hay: true,
        fondo: cs.backgroundColor,
        borde: cs.borderTopColor,
        anillo: cs.outlineStyle,
        anilloAncho: cs.outlineWidth,
        // El ambar del tema CLARO no es el outline: es un box-shadow exterior. Hay que mirar los dos.
        sombra: cs.boxShadow,
        // Quien tiene el foco de verdad, y si el campo coincide con :focus-visible (que es cuando el
        // navegador dibuja su anillo).
        activo: document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : 'ninguno',
        focusVisible: c.matches(':focus-visible'),
        // El aire de los lados: la caja NO puede salirse del cuerpo del comentario.
        derechaCampo: Math.round(r.right),
        derechaCuerpo: rb ? Math.round(rb.right) : null,
        rellenoDerecha: cs.paddingRight
    });
})()`) || '{}');
check('el campo de editar existe (si no, lo de abajo no valdria nada)', campo.hay === true);
check('el campo de editar no tiene fondo (transparente)', campo.hay === true && (campo.fondo === 'rgba(0, 0, 0, 0)' || campo.fondo === 'transparent'), String(campo.fondo));
check('el campo respeta el aire de la derecha (no se pega ni se sale)', campo.hay === true && campo.derechaCuerpo !== null && campo.derechaCampo <= campo.derechaCuerpo, 'campo=' + campo.derechaCampo + ' cuerpo=' + campo.derechaCuerpo + ' relleno=' + campo.rellenoDerecha);
check('el campo se queda con el foco tras el clic (si no, lo del anillo no se puede juzgar)', campo.hay === true && String(campo.activo).indexOf('comentario-editor-campo') > -1, 'activo=' + campo.activo + ' focus-visible=' + campo.focusVisible);
check('al enfocar NO sale ningun anillo VISIBLE del navegador (el ambar en oscuro)',
    campo.hay === true && (campo.anillo === 'none' || campo.anilloAncho === '0px'),
    'outline-style=' + campo.anillo + ' grosor=' + campo.anilloAncho + ' focus-visible=' + campo.focusVisible);
check('ni el halo ambar del tema claro (que es un box-shadow, no el outline)',
    campo.hay === true && (campo.sombra === 'none' || campo.sombra === '' || campo.sombra === undefined),
    'box-shadow=' + campo.sombra);

console.log('\n=== 5) Sin usuario_id (como los comentarios de OBRA hasta hoy) ===');
await evalJs(`window.__mandarUsuarioId(false)`);
await evalJs(`document.getElementById('btn-buscar')?.click()`);
await sleep(900);
await abrirCajon();
const sinId = JSON.parse(await evalJs(`(() => {
    const items = Array.from(document.querySelectorAll('.comentario-item'));
    return JSON.stringify({ total: items.length, botones: Array.from(document.querySelectorAll('.comentario-btn-editar, .comentario-btn-eliminar')).length });
})()`) || '{}');
check('sin usuario_id NO se ofrecen los botones (es a proposito: mejor no ofrecer que ofrecer y fallar)', sinId.total > 0 && sinId.botones === 0, JSON.stringify(sinId));

console.log('\n=== 6) Los mismos botones en los comentarios de PROBLOGS ===');
// OJO: hay que DEVOLVER el interruptor a true. En el punto anterior se apago para probar el caso sin
// `usuario_id`, y si se queda apagado los comentarios de Problogs llegan sin el y no salen los botones.
await evalJs(`window.__mandarUsuarioId(true)`);
// Problogs pinta sus comentarios con OTRO modulo (problogs.js) y no con el cajon, asi que hay que probarlo
// aparte: era justo el sitio donde el guardado no funcionaba.
for (let intento = 0; intento < 8; intento++) {
    await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
    await sleep(900);
    const hayTarjeta = await evalJs(`(() => { const c = document.querySelector('#problogs .problog-card'); return !!c && c.getBoundingClientRect().height > 0; })()`);
    if (hayTarjeta === true) break;
}
for (let intento = 0; intento < 8; intento++) {
    await evalJs(`document.querySelector('#problogs .problog-card')?.click()`);
    await sleep(900);
    const abierto = await evalJs(`(() => { const d = document.getElementById('problogs-detalle'); return !!d && !d.classList.contains('hidden') && document.querySelectorAll('.problog-comentario').length >= 2; })()`);
    if (abierto === true) break;
}
const problogUI = JSON.parse(await evalJs(`(() => {
    const items = Array.from(document.querySelectorAll('.problog-comentario'));
    const botonesDe = (el) => el ? Array.from(el.querySelectorAll('[data-comentario-editar], [data-comentario-eliminar]')).map(function (b) { return b.textContent.trim(); }) : [];
    return JSON.stringify({ total: items.length, mio: botonesDe(items[0]), ajeno: botonesDe(items[1]) });
})()`) || '{}');
check('en Problogs el comentario propio tambien ofrece Editar y Eliminar', problogUI.mio.join(',') === 'Editar,Eliminar', JSON.stringify(problogUI));
check('y el ajeno tampoco ofrece nada en Problogs', problogUI.ajeno.length === 0, JSON.stringify(problogUI.ajeno));

// EDITAR: aqui estaba el fallo (se mandaba PATCH y el backend define PUT).
await evalJs(`document.querySelector('.problog-comentario [data-comentario-editar]')?.click()`);
await sleep(500);
const editorProblog = JSON.parse(await evalJs(`(() => {
    const campo = document.querySelector('.problog-comentario-editor .problog-comentario-input');
    return JSON.stringify({ hay: !!campo, texto: campo ? campo.value : '' });
})()`) || '{}');
check('en Problogs, Editar abre el campo con el texto actual', editorProblog.hay === true && editorProblog.texto === 'Comentario mio en el problog', JSON.stringify(editorProblog));
await evalJs(`(() => { const c = document.querySelector('.problog-comentario-editor .problog-comentario-input'); if (c) c.value = 'Texto editado en el problog'; })()`);
await evalJs(`document.querySelector('[data-comentario-guardar-edicion]')?.click()`);
await sleep(1500);
const trasEditarProblog = await evalJs(`(document.querySelector('.problog-comentario .problog-comentario-texto') || {}).textContent || ''`);
check('en Problogs EL CAMBIO SE APLICA Y SE VE (con PUT, que es lo que define el backend)', trasEditarProblog.trim() === 'Texto editado en el problog', JSON.stringify(trasEditarProblog.trim()));

// El anillo ambar en los campos de Problogs.
await evalJs(`document.querySelector('.problog-comentario [data-comentario-editar]')?.click()`);
await sleep(500);
const centroProblog = await evalJs(`(() => {
    const c = document.querySelector('.problog-comentario-editor .problog-comentario-input');
    if (!c) return '';
    const r = c.getBoundingClientRect();
    return Math.round(r.left + r.width / 2) + ',' + Math.round(r.top + r.height / 2);
})()`);
if (typeof centroProblog === 'string' && centroProblog.indexOf(',') > 0) {
    const [px, py] = centroProblog.split(',').map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
    await sleep(300);
}
const campoProblog = JSON.parse(await evalJs(`(() => {
    const c = document.querySelector('.problog-comentario-editor .problog-comentario-input');
    if (!c) return JSON.stringify({ hay: false });
    const cs = getComputedStyle(c);
    return JSON.stringify({ hay: true, anillo: cs.outlineStyle, anilloAncho: cs.outlineWidth, sombra: cs.boxShadow, fondo: cs.backgroundColor, activo: document.activeElement === c });
})()`) || '{}');
check('en Problogs el campo de escribir tampoco lleva el anillo ambar', campoProblog.hay === true && campoProblog.activo === true && (campoProblog.anillo === 'none' || campoProblog.anilloAncho === '0px') && (campoProblog.sombra === 'none' || !campoProblog.sombra), 'outline=' + campoProblog.anillo + ' sombra=' + campoProblog.sombra + ' activo=' + campoProblog.activo);

// BORRAR en Problogs.
await evalJs(`document.querySelector('[data-comentario-cancelar-edicion]')?.click()`);
await sleep(900);
await evalJs(`document.querySelector('.problog-comentario [data-comentario-eliminar]')?.click()`);
await sleep(500);
const confirmaProblog = await evalJs(`!!document.querySelector('.problog-comentario-confirmar')`);
check('en Problogs, al pulsar Eliminar se pide confirmacion', confirmaProblog === true);
await evalJs(`document.querySelector('[data-comentario-borrar-si]')?.click()`);
await sleep(1500);
const trasBorrarProblog = JSON.parse(await evalJs(`(() => {
    const textos = Array.from(document.querySelectorAll('.problog-comentario .problog-comentario-texto')).map(function (e) { return e.textContent.trim(); });
    return JSON.stringify({ textos: textos, quedan: document.querySelectorAll('.problog-comentario').length });
})()`) || '{}');
check('en Problogs el comentario borrado desaparece', Array.isArray(trasBorrarProblog.textos) && trasBorrarProblog.textos.indexOf('Texto editado en el problog') === -1, JSON.stringify(trasBorrarProblog.textos));
check('y el ajeno sigue en su sitio', Array.isArray(trasBorrarProblog.textos) && trasBorrarProblog.textos.indexOf('Comentario ajeno en el problog') > -1, JSON.stringify(trasBorrarProblog.textos));

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
try { chrome.kill(); } catch {}
process.exit(fallos ? 1 : 0);
