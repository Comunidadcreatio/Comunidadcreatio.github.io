// Verifica el nuevo flujo de comentarios de los Problogs:
//   - La fila de likes/comentarios/reblogs va AL FINAL de la publicación y el
//     bloque de comentarios justo debajo, con los comentarios de la gente ahí.
//   - Ya NO se usa el cajón de comentarios de Cavents.
//   - Publicar, responder y dar me gusta a un comentario.
//   - El botón de comentarios de una tarjeta del feed abre la publicación.
//
// Uso: node scripts/verificar-comentarios-problog.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9311;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-com-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const page = await (async () => {
  try { return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`); }
  catch { return (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || '').slice(0, 300)); return null; }
  return r.result?.result?.value;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const ahora = Date.now();
      const publicacion = { id: 30001, titulo: 'Proceso de la obra', etiquetas: 'arte', estado: 'publicado',
          created_at: new Date(ahora - 3600000).toISOString(),
          bloques: [{ tipo: 'texto', contenido: 'Un texto largo de la publicacion para que haya cuerpo.' }],
          imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
          portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 1, comentarios_count: 2,
          reblogs_count: 0, liked: false, reblogged: false };
      window.__comentarios = [
          { id: 1, problog_id: 30001, usuario_id: 10, texto: 'Primer comentario', comentario_padre_id: null,
            created_at: new Date(ahora - 1800000).toISOString(), autor_nombre: 'Ana', autor_foto: '', likes_count: 2, liked: false },
          { id: 2, problog_id: 30001, usuario_id: 11, texto: 'Una respuesta anidada', comentario_padre_id: 1,
            created_at: new Date(ahora - 900000).toISOString(), autor_nombre: 'Luis', autor_foto: '', likes_count: 0, liked: false }
      ];
      window.__enviados = [];
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.__gets = [];
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (u.includes('backend-fundacion-atpe.onrender.com') && method === 'GET') {
              window.__gets.push(u.replace('https://backend-fundacion-atpe.onrender.com', ''));
          }
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          // --- comentarios de una publicación ---
          const mLikeComentario = u.match(/\\/problogs\\/(\\d+)\\/comentarios\\/(\\d+)\\/like/);
          if (mLikeComentario) {
              const cid = parseInt(mLikeComentario[2], 10);
              const c = window.__comentarios.find((x) => x.id === cid);
              window.__enviados.push({ tipo: 'like-comentario', comentario: cid });
              if (c) { c.liked = !c.liked; c.likes_count += c.liked ? 1 : -1; }
              return json({ success: true, liked: c ? c.liked : true, likes_count: c ? c.likes_count : 1 });
          }
          if (/\\/problogs\\/\\d+\\/comentarios$/.test(u)) {
              if (method === 'POST') {
                  const body = JSON.parse((init && init.body) || '{}');
                  window.__enviados.push({ tipo: 'comentario', texto: body.texto, padre: body.comentario_padre_id });
                  window.__comentarios.push({ id: 100 + window.__comentarios.length, problog_id: 30001, usuario_id: 480001,
                      texto: body.texto, comentario_padre_id: body.comentario_padre_id || null,
                      created_at: new Date().toISOString(), autor_nombre: 'T', autor_foto: '', likes_count: 0, liked: false });
                  return json({ success: true, id: 999 });
              }
              return json({ success: true, comentarios: window.__comentarios });
          }
          if (method === 'POST' || method === 'PUT' || method === 'DELETE') return json({ success: true, id: 99 });
          // OJO: '/api/artistas/mis-problogs' NO contiene la subcadena '/problogs'
          // (va con guion), así que necesita su propia rama.
          if (u.includes('/api/artistas/mis-problogs') || u.includes('/api/artistas/mis-reblogs')) {
              return json({ success: true, problogs: [publicacion], total: 1 });
          }
          if (u.includes('/problogs/30001')) return json(publicacion);
          if (u.includes('/problogs')) return json({ success: true, problogs: [publicacion], total: 1, page: 1, limit: 10 });
          if (u.includes('heartbeat')) return json({ ok: true });
          if (u.includes('mis-reacciones')) return json({ reacciones: [] });
          if (u.includes('/obras')) return json([]);
          if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
          return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
      };
  })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1500);

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) console.log(`  PASS  ${nombre}`);
  else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}
const enviados = async () => JSON.parse(await evalJs(`JSON.stringify(window.__enviados)`));

// ============================================================
// Botón de comentarios de la TARJETA: abre la publicación
// ============================================================
console.log('=== Desde la tarjeta del feed ===');
await evalJs(`document.getElementById('btn-problogs')?.click()`);
await sleep(2500);
await evalJs(`document.querySelector('.problog-card [data-problog-comentar]')?.click()`);
await sleep(2500);
const trasTarjeta = JSON.parse(await evalJs(`JSON.stringify({
    lectura: !document.getElementById('problogs-detalle').classList.contains('hidden'),
    comentarios: !!document.querySelector('[data-problog-comentarios]'),
    cajon: document.getElementById('comentarios-drawer')?.classList.contains('visible') || false
})`));
console.log('   ' + JSON.stringify(trasTarjeta));
check('el botón abre la publicación con sus comentarios', trasTarjeta.lectura && trasTarjeta.comentarios, JSON.stringify(trasTarjeta));
check('NO se abre el cajón de comentarios de Cavents', trasTarjeta.cajon === false);

// ============================================================
// Orden: cuerpo -> marcadores -> comentarios
// ============================================================
console.log('\n=== Orden dentro de la publicación ===');
await sleep(600);
const orden = JSON.parse(await evalJs(`(() => {
    const caja = document.querySelector('.problogs-detalle');
    const cuerpo = caja.querySelector('.problog-lectura-cuerpo');
    const social = caja.querySelector('.problog-social');
    const comentarios = caja.querySelector('[data-problog-comentarios]');
    const r = (el) => el ? el.getBoundingClientRect() : null;
    return JSON.stringify({
        hayTodo: !!(cuerpo && social && comentarios),
        cuerpoBottom: Math.round(r(cuerpo).bottom),
        socialTop: Math.round(r(social).top),
        socialBottom: Math.round(r(social).bottom),
        comentariosTop: Math.round(r(comentarios).top)
    });
})()`));
console.log('   ' + JSON.stringify(orden));
check('están el cuerpo, la fila social y los comentarios', orden.hayTodo === true, JSON.stringify(orden));
check('la fila de likes/comentarios/reblogs va DESPUÉS del texto', orden.socialTop >= orden.cuerpoBottom - 2, JSON.stringify(orden));
check('el bloque de comentarios va justo DEBAJO de la fila', orden.comentariosTop >= orden.socialBottom - 2, JSON.stringify(orden));

// ============================================================
// Comentarios pintados (con respuesta anidada) y contador
// ============================================================
console.log('\n=== Comentarios de la gente ===');
const pintados = JSON.parse(await evalJs(`(() => {
    const seccion = document.querySelector('[data-problog-comentarios]');
    const autores = Array.from(seccion.querySelectorAll('.problog-comentario-autor')).map((e) => e.textContent.trim());
    const textos = Array.from(seccion.querySelectorAll('.problog-comentario-texto')).map((e) => e.textContent.trim());
    const anidadas = seccion.querySelectorAll('.problog-comentario-respuestas .problog-comentario').length;
    const enTitulo = seccion.querySelector('[data-comentarios-cuenta]')?.textContent;
    const enBarra = document.querySelector('[data-problog-comentar] .problog-social-num')?.textContent;
    return JSON.stringify({ autores, textos, anidadas, enTitulo, enBarra });
})()`));
console.log('   ' + JSON.stringify(pintados));
check('se ven los dos comentarios con su autor', pintados.textos.length === 2 && pintados.autores.join(',').includes('Ana'), JSON.stringify(pintados));
check('la respuesta sale anidada dentro del comentario', pintados.anidadas === 1, String(pintados.anidadas));
check('el contador del bloque y de la fila coinciden', pintados.enTitulo === '2' && pintados.enBarra === '2', JSON.stringify(pintados));

// ============================================================
// Publicar un comentario
// ============================================================
console.log('\n=== Publicar un comentario ===');
await evalJs(`(() => {
    const caja = document.querySelector('[data-problog-comentarios]');
    caja.querySelector('[data-comentario-texto]').value = 'Comentario de prueba';
    caja.querySelector('[data-problog-comentario-form]').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
})()`);
await sleep(2200);
let todos = await enviados();
const publicado = todos.filter((e) => e.tipo === 'comentario').pop();
const trasPublicar = JSON.parse(await evalJs(`(() => {
    const seccion = document.querySelector('[data-problog-comentarios]');
    return JSON.stringify({
        textos: seccion.querySelectorAll('.problog-comentario-texto').length,
        enBarra: document.querySelector('[data-problog-comentar] .problog-social-num')?.textContent,
        input: seccion.querySelector('[data-comentario-texto]').value
    });
})()`));
console.log('   ' + JSON.stringify({ enviado: publicado, tras: trasPublicar }));
check('se envió el comentario con su texto', publicado && publicado.texto === 'Comentario de prueba', JSON.stringify(publicado));
check('sin padre (es un comentario raíz)', publicado && (publicado.padre === null || publicado.padre === undefined), JSON.stringify(publicado));
check('aparece en la lista y el contador sube a 3', trasPublicar.textos === 3 && trasPublicar.enBarra === '3', JSON.stringify(trasPublicar));
check('el cuadro de escritura se vacía', trasPublicar.input === '', JSON.stringify(trasPublicar.input));

// ============================================================
// Responder a un comentario
// ============================================================
console.log('\n=== Responder ===');
await evalJs(`document.querySelector('[data-comentario-responder="1"]')?.click()`);
await sleep(500);
const chip = await evalJs(`(() => { const c = document.querySelector('[data-comentario-respondiendo]'); return c && !c.classList.contains('hidden') ? c.textContent.trim() : ''; })()`);
check('el chip dice a quién se responde', /Respondiendo a Ana/.test(chip || ''), JSON.stringify(chip));
await evalJs(`(() => {
    const caja = document.querySelector('[data-problog-comentarios]');
    caja.querySelector('[data-comentario-texto]').value = 'Respuesta de prueba';
    caja.querySelector('[data-problog-comentario-form]').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
})()`);
await sleep(2200);
todos = await enviados();
const respuesta = todos.filter((e) => e.tipo === 'comentario').pop();
check('la respuesta se envía con comentario_padre_id = 1', respuesta && respuesta.padre === 1, JSON.stringify(respuesta));
const anidadasTras = await evalJs(`document.querySelectorAll('.problog-comentario-respuestas .problog-comentario').length`);
check('la respuesta se ve anidada', anidadasTras === 2, String(anidadasTras));
const chipTras = await evalJs(`document.querySelector('[data-comentario-respondiendo]').classList.contains('hidden')`);
check('el chip de responder se limpia tras enviar', chipTras === true);

// ============================================================
// Me gusta en un comentario
// ============================================================
console.log('\n=== Me gusta en un comentario ===');
const antesLike = await evalJs(`document.querySelector('[data-comentario-like="1"] [data-comentario-likes]').textContent`);
await evalJs(`document.querySelector('[data-comentario-like="1"]')?.click()`);
await sleep(1500);
const trasLike = JSON.parse(await evalJs(`(() => {
    const b = document.querySelector('[data-comentario-like="1"]');
    return JSON.stringify({ num: b.querySelector('[data-comentario-likes]').textContent, liked: b.classList.contains('liked'), pressed: b.getAttribute('aria-pressed') });
})()`));
console.log('   ' + JSON.stringify({ antes: antesLike, despues: trasLike }));
const likeEnviado = (await enviados()).filter((e) => e.tipo === 'like-comentario').pop();
check('el me gusta llega al backend', likeEnviado && likeEnviado.comentario === 1, JSON.stringify(likeEnviado));
check('el número sube y el botón queda marcado', Number(trasLike.num) === Number(antesLike) + 1 && trasLike.liked === true, JSON.stringify(trasLike));

// ============================================================
// El botón de la fila social tampoco abre el cajón
// ============================================================
console.log('\n=== Botón de comentarios de la fila social ===');
await evalJs(`document.querySelector('.problog-social [data-problog-comentar]')?.click()`);
await sleep(1500);
const trasBoton = JSON.parse(await evalJs(`JSON.stringify({
    cajon: document.getElementById('comentarios-drawer')?.classList.contains('visible') || false,
    seccion: !!document.querySelector('[data-problog-comentarios]')
})`));
check('sigue sin abrirse el cajón de Cavents', trasBoton.cajon === false, JSON.stringify(trasBoton));
check('y la publicación sigue con sus comentarios a la vista', trasBoton.seccion === true);

// ============================================================
// Desde el PERFIL: hay que ir a Problogs primero
// ============================================================
console.log('\n=== Comentarios desde el perfil ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1500);
await evalJs(`document.getElementById('btn-perfil-sidebar')?.click()`);
await sleep(2000);
const perfil = JSON.parse(await evalJs(`JSON.stringify({ visible: !document.getElementById('perfil-usuario').classList.contains('hidden') })`));
check('el perfil propio está abierto', perfil.visible === true, JSON.stringify(perfil));
await evalJs(`document.querySelector('.perfil-tab-btn[data-tab="problogs"]')?.click()`);
await sleep(2500);
const diagPerfil = JSON.parse(await evalJs(`(() => {
    const c = document.getElementById('perfil-tab-content');
    return JSON.stringify({
        tabActiva: (document.querySelector('.perfil-tab-btn.active') || {}).dataset?.tab || '',
        cards: c ? c.querySelectorAll('.problog-card').length : 0,
        botones: c ? c.querySelectorAll('[data-problog-comentar]').length : 0
    });
})()`));
console.log('   perfil: ' + JSON.stringify(diagPerfil));
const hayTarjeta = await evalJs(`!!document.querySelector('#perfil-tab-content .problog-card [data-problog-comentar]')`);
check('el perfil lista publicaciones con su botón de comentarios', hayTarjeta === true, JSON.stringify(diagPerfil));
await evalJs(`document.querySelector('#perfil-tab-content .problog-card [data-problog-comentar]')?.click()`);
await sleep(3500);
const trasPerfil = JSON.parse(await evalJs(`JSON.stringify({
    enProblogs: !document.getElementById('problogs').classList.contains('hidden'),
    lectura: !document.getElementById('problogs-detalle').classList.contains('hidden'),
    comentarios: !!document.querySelector('[data-problog-comentarios]'),
    textos: document.querySelectorAll('.problog-comentario-texto').length
})`));
console.log('   ' + JSON.stringify(trasPerfil));
check('lleva a la sección Problogs con la publicación abierta', trasPerfil.enProblogs && trasPerfil.lectura, JSON.stringify(trasPerfil));
check('y muestra sus comentarios', trasPerfil.comentarios && trasPerfil.textos >= 2, JSON.stringify(trasPerfil));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
