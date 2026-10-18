// CARRERAS Y CONTADOR: las tres cosas que no se podian probar sin tocar datos reales.
//
// POR QUE EXISTE. Estos tres fallos se arreglaron en su dia, pero solo se pudieron verificar
// LEYENDO el codigo: reproducirlos de verdad exige abrir dos salas con latencia, mandar un
// comentario duplicado (que habria que borrar) y destruir un hilo de comentarios de alguien.
// Nada de eso es aceptable contra produccion. Aqui se simula el backend con `window.fetch`
// y se controlan los TIEMPOS, que es justo lo que hace falta para que una carrera sea
// determinista en vez de "a veces".
//
//   1) CARRERA AL CAMBIAR DE SALA (chat.js). Si abres A y enseguida B, la respuesta lenta de A
//      llegaba despues y BORRABA la lista de B (y marcaba A como leida sin verla). Aqui A tarda
//      800 ms y B 80 ms, a proposito.
//   2) DOBLE ENVIO DE COMENTARIO (comentarios.js). El Enter va por `keydown`, NO por el boton,
//      asi que `btnEnviar.disabled` no frena un segundo Enter. Aqui se mandan dos Enter en el
//      mismo instante y se cuenta cuantas peticiones salen: tiene que salir UNA.
//   3) CONTADOR AL BORRAR (comentarios.js). El backend borra el HILO COMPLETO y devuelve
//      `borrados`; la tarjeta restaba 1. Aqui un hilo de 4 y una tarjeta en 10: tras borrar
//      tiene que quedar en 6. Y si el borrado FALLA, el numero no se mueve.
//
// Los tres instrumentos de arriba son NEGATIVOS (comprueban que algo NO pasa): si alguien quita
// la guarda, esto se pone en rojo. Ese es el motivo del fichero.
//
// Uso: node scripts/verificar-carreras-y-contador.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9811;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';

// PREFLIGHT: sin servidor esto mediria una pagina de error y los fallos serian mentira.
try {
    const r = await fetch(URL_BASE + 'index.html');
    if (!r.ok) throw new Error('HTTP ' + r.status);
} catch (e) {
    console.error(`NO HAY SERVIDOR en ${URL_BASE} (${e.message}).`);
    console.error('Levantalo antes con:  node scripts/servidor-local.mjs 8099');
    process.exit(2);
}

const perfil = mkdtempSync(join(tmpdir(), 'verif-carreras-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${perfil}`, '--window-size=420,900', 'about:blank'
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
let id = 0; const pend = new Map(); const excepciones = [];
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
        excepciones.push(String(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text).slice(0, 180));
    }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};

let pruebas = 0, fallos = 0;
function check(nombre, ok, detalle) {
    pruebas++;
    if (ok) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
}

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });

// ── BACKEND SIMULADO ────────────────────────────────────────────────────────────────────────────
// OJO: el texto de aqui abajo viaja dentro de una plantilla. NADA de backticks ni de ${} dentro
// (la trampa que este proyecto ya piso seis veces): solo comillas simples y concatenacion.
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
            localStorage.setItem('theme', 'light');
        } catch (_) {}

        const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
        const ahora = Date.now();

        // --- chat: dos conversaciones, una LENTA (A) y otra rapida (B) ---
        const CANAL_A = 'priv:480001:900001';
        const CANAL_B = 'priv:480001:900002';
        const convA = { canal: CANAL_A, otro_nombre: 'Ana', otro_foto: '', ultima_actividad: new Date(ahora).toISOString(),
                        ultimo: { contenido: 'hola de Ana', created_at: new Date(ahora - 1000).toISOString() } };
        const convB = { canal: CANAL_B, otro_nombre: 'Beto', otro_foto: '', ultima_actividad: new Date(ahora).toISOString(),
                        ultimo: { contenido: 'hola de Beto', created_at: new Date(ahora - 2000).toISOString() } };
        const msgA = { id: 11, canal: CANAL_A, autor_id: 900001, autor_nombre: 'Ana', contenido: 'MENSAJE-DE-A',
                       created_at: new Date(ahora).toISOString(), likes_count: 0 };
        const msgB = { id: 22, canal: CANAL_B, autor_id: 900002, autor_nombre: 'Beto', contenido: 'MENSAJE-DE-B',
                       created_at: new Date(ahora).toISOString(), likes_count: 0 };

        // Lo que se quiere medir, expuesto a la prueba.
        window.__leidos = [];        // canales marcados como leidos
        window.__envios = 0;         // POST de comentario que llegaron al servidor
        window.__fallarBorrado = false;

        // --- comentarios de la obra: un HILO de 4 (900 + 3 respuestas) y otro suelto (950) ---
        let comentarios = [
            { id: 900, usuario_id: 480001, autor_nombre: 'T', autor_foto: '', texto: 'Padre del hilo', created_at: new Date(ahora).toISOString(), likes_count: 0, comentario_padre_id: null },
            { id: 901, usuario_id: 42, autor_nombre: 'Otra', autor_foto: '', texto: 'Respuesta 1', created_at: new Date(ahora).toISOString(), likes_count: 0, comentario_padre_id: 900 },
            { id: 902, usuario_id: 42, autor_nombre: 'Otra', autor_foto: '', texto: 'Respuesta 2', created_at: new Date(ahora).toISOString(), likes_count: 0, comentario_padre_id: 900 },
            { id: 903, usuario_id: 42, autor_nombre: 'Otra', autor_foto: '', texto: 'Respuesta 3', created_at: new Date(ahora).toISOString(), likes_count: 0, comentario_padre_id: 900 },
            { id: 950, usuario_id: 480001, autor_nombre: 'T', autor_foto: '', texto: 'Suelto', created_at: new Date(ahora).toISOString(), likes_count: 0, comentario_padre_id: null }
        ];
        const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, w, h); return cv.toDataURL('image/jpeg', 0.8); };
        const obrasMock = [{ id: 1, titulo: 'Obra de prueba', artista: 'T', artista_user_id: 480001, imagen_url: mkImg(800, 1000, '#cc3344'),
            etiquetas: '', ano: 2024, ancho: 80, alto: 100, likes_count: 0, views_count: 0, comments_count: 10, precio: '', foto_artista: '' }];

        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            const metodo = ((init && init.method) || 'GET').toUpperCase();
            if (u.indexOf('backend-fundacion-atpe.onrender.com') === -1) return realFetch(input, init);

            // --- CHAT ---
            if (u.indexOf('/chat/conversaciones') !== -1) return json({ success: true, conversaciones: [convA, convB], no_leidos: 0 });
            if (u.indexOf('/chat/mensajes') !== -1) {
                if (u.indexOf('desde=') !== -1) return json({ success: true, mensajes: [] });   // polling: nada nuevo
                const trozo = u.split('canal=')[1] || '';
                const canal = decodeURIComponent(trozo.split('&')[0]);
                if (canal === CANAL_A) { await esperar(800); return json({ success: true, mensajes: [msgA], leido_hasta: 0, entregado_hasta: 0 }); }
                if (canal === CANAL_B) { await esperar(80); return json({ success: true, mensajes: [msgB], leido_hasta: 0, entregado_hasta: 0 }); }
                return json({ success: true, mensajes: [] });
            }
            if (u.indexOf('/chat/leido') !== -1) {
                try { window.__leidos.push(JSON.parse(init.body).canal); } catch (e) {}
                return json({ success: true });
            }
            if (u.indexOf('/chat/directorio') !== -1) return json({ success: true, pueblos: {} });
            if (u.indexOf('/chat/bloqueados') !== -1) return json({ success: true, bloqueados: [] });
            if (u.indexOf('/chat/no-leidos') !== -1) return json({ success: true, no_leidos: 0 });

            // --- COMENTARIOS DE LA OBRA ---
            if (u.indexOf('/obras/1/comentarios') !== -1) {
                if (metodo === 'POST') {
                    window.__envios++;
                    let texto = '';
                    try { texto = JSON.parse(init.body).texto; } catch (e) {}
                    comentarios.push({ id: 990, usuario_id: 480001, autor_nombre: 'T', autor_foto: '', texto: texto,
                        created_at: new Date().toISOString(), likes_count: 0, comentario_padre_id: null });
                    return json({ success: true, id: 990 });
                }
                if (metodo === 'DELETE') {
                    if (window.__fallarBorrado) return json({ success: false, error: 'fallo simulado' });
                    const id = Number(u.split('/').pop());
                    const antes = comentarios.length;
                    comentarios = comentarios.filter((c) => c.id !== id && c.comentario_padre_id !== id);
                    return json({ success: true, id: id, borrados: antes - comentarios.length });
                }
                if (metodo === 'PUT') return json({ success: true });
                return json({ comentarios: comentarios });
            }

            // --- resto de la app ---
            if (u.indexOf('heartbeat') !== -1) return json({ ok: true });
            if (u.indexOf('mis-reacciones') !== -1) return json({ reacciones: [] });
            if (u.indexOf('/problogs') !== -1) return json({ success: true, problogs: [], total: 0 });
            if (u.indexOf('/obras') !== -1) return json(obrasMock);
            if (u.indexOf('usuarios') !== -1 || u.indexOf('artistas/buscar') !== -1) return json({ usuarios: [] });
            if (u.indexOf('artistas/perfil') !== -1) return json({ success: true, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});

await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 120; i++) {
    const listo = await evalJs(`(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`);
    if (listo === true) break;
    await sleep(250);
}
await sleep(900);

// ── 1) LA CARRERA DEL CHAT ─────────────────────────────────────────────────────────────────────
console.log('=== 1) Carrera al cambiar de sala (A tarda 800 ms, B 80 ms) ===');
await evalJs(`document.getElementById('btn-chat-global')?.click()`);
let hayConvs = false;
for (let i = 0; i < 60; i++) {
    hayConvs = await evalJs(`document.querySelectorAll('.chat-conv-item').length >= 2`) === true;
    if (hayConvs) break;
    await sleep(250);
}
check('se pintan las dos conversaciones (necesario para la prueba)', hayConvs, 'no llegaron a pintarse');

// Pulsar A y, SIN esperar, pulsar B. Es exactamente lo que hace una persona impaciente.
const pulsado = await evalJs(`(() => {
    const items = Array.from(document.querySelectorAll('.chat-conv-item'));
    const a = items.find((x) => x.dataset.canal === 'priv:480001:900001');
    const b = items.find((x) => x.dataset.canal === 'priv:480001:900002');
    if (!a || !b) return 'faltan items: ' + items.length;
    a.click();
    b.click();
    return 'las dos pulsadas';
})()`);
check('se pudieron pulsar A y B seguidas', pulsado === 'las dos pulsadas', pulsado);

// Se deja que llegue la respuesta LENTA de A (800 ms) despues de que B ya haya pintado.
await sleep(1400);
const trasCarrera = await evalJs(`(() => {
    const titulo = document.getElementById('chat-sala-titulo');
    const lista = document.getElementById('chat-mensajes');
    return JSON.stringify({
        titulo: titulo ? titulo.textContent.trim() : '(sin titulo)',
        mensajes: lista ? lista.textContent.trim() : '(sin lista)',
        leidos: (window.__leidos || []).slice()
    });
})()`);
const carrera = typeof trasCarrera === 'string' ? JSON.parse(trasCarrera) : {};
console.log('   ' + JSON.stringify(carrera));
check('la sala que queda abierta es la B (la ultima pulsada)', String(carrera.titulo || '').indexOf('Beto') !== -1, carrera.titulo);
check('la lista sigue mostrando los mensajes de B', String(carrera.mensajes || '').indexOf('MENSAJE-DE-B') !== -1, carrera.mensajes);
check('la respuesta lenta de A NO se cuela en la lista de B', String(carrera.mensajes || '').indexOf('MENSAJE-DE-A') === -1, carrera.mensajes);
check('A NO se marco como leida sin que la vieras', (carrera.leidos || []).indexOf('priv:480001:900001') === -1, JSON.stringify(carrera.leidos));

// ── 2) DOBLE ENVIO DE COMENTARIO ───────────────────────────────────────────────────────────────
console.log('\n=== 2) Doble Enter en el comentario (debe salir UNA peticion) ===');
// Se cierra el chat para no tapar el cajon.
await evalJs(`document.body.click()`);
let abierto = false;
for (let intento = 0; intento < 8 && !abierto; intento++) {
    await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
    await sleep(700);
    abierto = await evalJs(`(() => { const m = document.querySelector('.metrica-comentario'); return !!m && m.getBoundingClientRect().width > 0; })()`) === true;
}
for (let i = 0; i < 30; i++) {
    await evalJs(`document.querySelector('.metrica-comentario')?.click()`);
    await sleep(350);
    if (await evalJs(`document.querySelectorAll('.comentario-item').length >= 5`) === true) break;
}
await sleep(500);
const enCajon = await evalJs(`document.querySelectorAll('.comentario-item').length`);
check('el cajón abre con el hilo de 4 + el suelto (5 en total)', enCajon >= 5, enCajon);

const emitidos = await evalJs(`(() => {
    const input = document.getElementById('comentarios-input');
    if (!input) return 'sin input';
    input.value = 'Comentario de prueba';
    const tecla = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    tecla();
    tecla();          // el segundo Enter, sin dejar que el primero termine
    return 'dos Enter';
})()`);
check('se pudieron emitir los dos Enter', emitidos === 'dos Enter', emitidos);

await sleep(1500);   // que resuelva el POST y se recargue la lista
const envios = await evalJs(`window.__envios`);
const inputTrasEnviar = await evalJs(`(document.getElementById('comentarios-input') || {}).value`);
console.log('   peticiones POST que llegaron al servidor: ' + envios + '   input tras enviar: ' + JSON.stringify(inputTrasEnviar));
check('dos Enter seguidos mandan UNA sola peticion (no dos comentarios)', envios === 1, envios);
check('el texto se limpia tras el envio', inputTrasEnviar === '', JSON.stringify(inputTrasEnviar));

// ── 3) EL CONTADOR AL BORRAR ───────────────────────────────────────────────────────────────────
console.log('\n=== 3) Contador al borrar un hilo de 4 ===');
// La tarjeta es el segundo .metrica-item de .metrica-right (asi lo lee actualizarContador).
const leerBadge = () => evalJs(`(() => {
    const card = document.querySelector('.obra-card');
    if (!card) return 'sin tarjeta';
    const items = card.querySelectorAll('.metrica-right .metrica-item');
    const span = items[1] ? items[1].querySelector('span') : null;
    return span ? span.textContent.trim() : 'sin span';
})()`);
const antes = Number(await leerBadge());
console.log('   contador antes de borrar: ' + antes + '   (10 del servidor + 1 del comentario que manda la prueba 2)');
check('el contador arranca en lo que dice el servidor (10) mas el comentario anterior', antes === 11, antes);

// Borrar el padre del hilo: el backend se lleva 4 y devuelve `borrados: 4`.
await evalJs(`document.querySelector('.comentario-item[data-id="900"] .comentario-btn-eliminar')?.click()`);
await sleep(400);
await evalJs(`document.querySelector('.comentario-btn-borrar-si')?.click()`);
await sleep(1500);
const trasBorrar = await leerBadge();
console.log('   contador tras borrar el hilo de 4: ' + trasBorrar);
check('el contador baja lo que borro el servidor (antes - 4 = ' + (antes - 4) + '), no 1', Number(trasBorrar) === antes - 4, trasBorrar);

// Y si el borrado FALLA, el numero no se toca.
await evalJs(`window.__fallarBorrado = true`);
await evalJs(`document.querySelector('.comentario-item[data-id="950"] .comentario-btn-eliminar')?.click()`);
await sleep(400);
await evalJs(`document.querySelector('.comentario-btn-borrar-si')?.click()`);
await sleep(1200);
const trasFallar = await leerBadge();
console.log('   contador tras un borrado fallido: ' + trasFallar);
check('si el borrado falla, el contador NO se mueve', trasFallar === trasBorrar, trasFallar + ' vs ' + trasBorrar);

console.log('\nEXCEPCIONES:', excepciones.length ? excepciones.join(' | ') : 'ninguna');
if (excepciones.length) fallos++;

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
try { ws.close(); } catch (e) { /* nada */ }
try { chrome.kill(); } catch (e) { /* nada */ }
try { rmSync(perfil, { recursive: true, force: true }); } catch (e) { /* nada */ }
process.exit(fallos ? 1 : 0);
