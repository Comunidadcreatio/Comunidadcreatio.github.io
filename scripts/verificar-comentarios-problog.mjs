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
await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
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
// El botón «Responder» ya NO rellena un chip en el cajón de abajo: abre la barra
// temporal de arriba, justo debajo del menú principal, con su propio input.
await evalJs(`document.querySelector('[data-comentario-responder="1"]')?.click()`);
await sleep(500);
const barra = JSON.parse(await evalJs(`(() => {
    const b = document.getElementById('problog-responder-barra');
    if (!b) return JSON.stringify({ falta: true });
    const r = b.getBoundingClientRect();
    const titulo = b.querySelector('.problog-responder-titulo');
    const input = document.getElementById('problog-responder-texto');
    const iconos = b.querySelectorAll('.problog-responder-icono');
    const ir = input ? input.getBoundingClientRect() : null;
    const ultimo = iconos.length ? iconos[iconos.length - 1].getBoundingClientRect() : null;
    return JSON.stringify({
        visible: !b.classList.contains('hidden'),
        titulo: (titulo ? titulo.textContent : '').replace(/\\s+/g, ' ').trim(),
        tieneInput: !!input,
        iconos: iconos.length,
        // Va ABAJO, pegada por encima del menú principal (que en móvil va fijo
        // abajo), y dentro de la pantalla.
        nav: (() => {
            const n = document.getElementById('toggle-panel');
            if (!n) return null;
            const rn = n.getBoundingClientRect();
            return { arriba: rn.top, visible: rn.height > 0 && getComputedStyle(n).display !== 'none' };
        })(),
        ventana: { ancho: window.innerWidth, alto: window.innerHeight },
        // Los iconos van a la derecha, después del input.
        iconosALaDerecha: !!(ir && ultimo) && ultimo.left >= ir.right - 1,
        chipViejo: !!document.querySelector('[data-comentario-respondiendo]'),
        // DISEÑO: sin teclado es fixed (pegada encima del menu y sin depender del
        // scroll, asi que no se mueve nada al desplazar). Con el teclado abierto el
        // CSS la pasa a absolute y se le pone el top medido, para poder quedar justo
        // encima del teclado aunque eso este por debajo del fondo del layout.
        posicion: getComputedStyle(b).position,
        abajo: r.bottom,
        // NO puede tapar el contenido: el bloque de la publicación acaba antes.
        contenidoLibre: (() => {
            const d = document.getElementById('problogs-detalle');
            const s = d ? getComputedStyle(d) : null;
            return s ? parseFloat(s.paddingBottom) : null;
        })()
    });
})()`) || 'null');
console.log('   ' + JSON.stringify(barra));
check('al pulsar «Responder» aparece la barra de respuesta', barra && barra.visible === true, JSON.stringify(barra));
check('la barra lleva el subtítulo «Respondiendo a X»', !!barra && /^Respondiendo a Ana/.test(barra.titulo), barra && barra.titulo);
check('la barra tiene su propio input', !!barra && barra.tieneInput === true);
check('la barra tiene los iconos de enviar y cancelar', !!barra && barra.iconos === 2, barra && String(barra.iconos));
check('los iconos de la barra van justificados a la derecha', !!barra && barra.iconosALaDerecha === true);
check('sin teclado la barra es `fixed` (pegada al menú, sin depender del scroll)',
  !!barra && barra.posicion === 'fixed', barra && barra.posicion);
// Lo pedido: abajo, justo encima del menú principal.
if (barra && barra.nav && barra.nav.visible) {
  const separacion = Math.abs(barra.nav.arriba - barra.abajo);
  console.log(`   · barra hasta y=${barra.abajo}, menú principal empieza en y=${barra.nav.arriba} (separación ${separacion.toFixed(1)}px)`);
  check(`la barra va pegada ENCIMA del menú principal (${separacion.toFixed(1)}px)`, separacion <= 1.5, `${separacion.toFixed(1)}px`);
  check('la barra queda dentro de la pantalla', barra.abajo <= barra.ventana.alto + 1,
    `abajo=${barra.abajo} ventana=${barra.ventana.alto}`);
  check(`el bloque de la publicación reserva el hueco de la barra (relleno ${barra.contenidoLibre}px)`,
    (barra.contenidoLibre || 0) >= 90, String(barra.contenidoLibre));
} else {
  check('se pudo medir el menú principal', false, JSON.stringify(barra && barra.nav));
}
check('el chip viejo de «respondiendo a…» ya no existe', !!barra && barra.chipViejo === false);

// ============================================================
// El teclado de Android
// ============================================================
// En Android el teclado NO siempre encoge el viewport de layout (puede encoger solo
// el visual), así que una pieza `fixed` pegada abajo se queda tapada. Se reproduce
// esa geometría sustituyendo `visualViewport` y se comprueba que la barra sube y
// queda pegada al borde visible, sin aire. Casos: teclado normal, teclado grande,
// iOS (donde además el viewport visual se desplaza) y habiendo bajado hasta el final
// de una publicación larga, que es donde el usuario veía el hueco.
// La colocación se hace con un DESPLAZAMIENTO medido contra el borde visible
// (`--barra-desplazada`), no con un `bottom` calculado: así da igual si el navegador
// encoge el layout o no.
console.log('\n=== La barra con el teclado de Android ===');
const CASOS_TECLADO = [
  ['teclado de Android (~400px)', 450, 0, false],
  ['teclado grande (~520px)', 330, 0, false],
  ['iOS (visual desplazado)', 400, 100, false],
  ['Android habiendo bajado al final', 450, 0, true],
];
for (const [nombre, altoVisual, desplazamiento, bajarAlFinal] of CASOS_TECLADO) {
  if (bajarAlFinal) {
    await evalJs(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await sleep(500);
  }
  await evalJs(`(() => {
      // El modulo lee window.__vvPrueba antes que el real: asi la prueba es
      // reversible (en Chromium visualViewport no se puede borrar).
      window.__vvPrueba = { height: ${altoVisual}, width: window.innerWidth, offsetTop: ${desplazamiento}, offsetLeft: 0, scale: 1,
          addEventListener: () => {}, removeEventListener: () => {} };
      window.dispatchEvent(new Event('resize'));
      window.scrollBy(0, 1); window.scrollBy(0, -1);
  })()`);
  await sleep(700);
  const conTeclado = JSON.parse((await evalJs(`(() => {
      const b = document.getElementById('problog-responder-barra').getBoundingClientRect();
      const vv = window.__vvPrueba || window.visualViewport;
      const bordeVisible = (vv.offsetTop || 0) + vv.height;
      const n = document.getElementById('toggle-panel');
      const sn = getComputedStyle(n);
      return JSON.stringify({
          barra: Math.round(b.top) + '..' + Math.round(b.bottom),
          bordeVisible: Math.round(bordeVisible),
          dentro: b.bottom <= bordeVisible + 1 && b.top >= vv.offsetTop - 1,
          // Sin aire: el borde de abajo de la barra coincide con el borde visible.
          hueco: Math.round(bordeVisible - b.bottom),
          clase: document.body.classList.contains('responder-teclado'),
          // El menú principal se oculta: es lo que hacía el hueco.
          navOculto: sn.visibility === 'hidden'
      });
  })()`)) || 'null');
  console.log(`   · ${nombre}: barra ${conTeclado && conTeclado.barra} vs borde visible ${conTeclado && conTeclado.bordeVisible} (hueco ${conTeclado && conTeclado.hueco}px, navOculto ${conTeclado && conTeclado.navOculto})`);
  check(`${nombre}: la barra sube y queda dentro de lo visible`, !!conTeclado && conTeclado.dentro === true, JSON.stringify(conTeclado));
  check(`${nombre}: la barra queda pegada al borde visible, SIN aire`,
    !!conTeclado && Math.abs(conTeclado.hueco) <= 1.5, JSON.stringify(conTeclado));
  check(`${nombre}: el teclado se detecta`, !!conTeclado && conTeclado.clase === true, JSON.stringify(conTeclado));
  check(`${nombre}: el menú principal se oculta (como en Cavents)`,
    !!conTeclado && conTeclado.navOculto === true, JSON.stringify(conTeclado));
  // NO PUEDE TEMBLAR: con el teclado abierto se scrollea y se mira la posición de la
  // barra EN PANTALLA (debe ser siempre la misma) y, sobre todo, CUÁNTAS VECES SE
  // ESCRIBE su estilo. Si es 0 durante el scroll, no hay nada que pueda moverse: es la
  // garantía de fondo, mejor que medir el temblor. Se mete además ruido de ±2px en las
  // medidas del viewport visual, que es lo que hace el navegador de verdad.
  const temblor = JSON.parse((await evalJs(`(async () => {
      const b = document.getElementById('problog-responder-barra');
      const st = b.style;
      const set0 = st.setProperty.bind(st);
      const rem0 = st.removeProperty.bind(st);
      let escrituras = 0;
      st.setProperty = function (...a) { escrituras++; return set0(...a); };
      st.removeProperty = function (...a) { escrituras++; return rem0(...a); };
      const posiciones = [];
      const ruido = [0, 2, 1, -1, 0, 1, -1, 2, 0, 1];
      for (let i = 0; i < 12; i++) {
          window.scrollTo(0, 400 + i * 120);
          window.__vvPrueba = { height: ${altoVisual} + ruido[i % ruido.length], width: window.innerWidth,
              offsetTop: ${desplazamiento}, offsetLeft: 0, scale: 1,
              addEventListener: () => {}, removeEventListener: () => {} };
          window.dispatchEvent(new Event('resize'));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          posiciones.push(Math.round(b.getBoundingClientRect().top));
      }
      st.setProperty = set0; st.removeProperty = rem0;
      const min = Math.min(...posiciones), max = Math.max(...posiciones);
      return JSON.stringify({ min, max, rango: max - min, escrituras });
  })()`)) || 'null');
  console.log(`   · ${nombre}: al scrollear, la barra se mueve ${temblor && temblor.rango}px y su estilo se escribe ${temblor && temblor.escrituras} vez/veces`);
  check(`${nombre}: la barra NO tiembla al scrollear con el teclado abierto`,
    !!temblor && temblor.rango <= 1, JSON.stringify(temblor));
  // Lo importante de fondo: durante el scroll NO se toca el estilo.
  check(`${nombre}: al scrollear NO se reescribe el estilo de la barra`,
    !!temblor && temblor.escrituras === 0, JSON.stringify(temblor));
  const posicionConTeclado = await evalJs(`getComputedStyle(document.getElementById('problog-responder-barra')).position`);
  check(`${nombre}: con el teclado abierto la barra sigue siendo fija (no depende del scroll)`,
    posicionConTeclado === 'fixed', String(posicionConTeclado));
  // Y se coloca con un `top` en píxeles (propiedad de layout, sin capa del compositor).
  const topPuesto = await evalJs(`document.getElementById('problog-responder-barra').style.getPropertyValue('--barra-top')`);
  check(`${nombre}: la barra se coloca con su top medido (${topPuesto || 'sin valor'})`,
    !!topPuesto && parseFloat(topPuesto) > 0, String(topPuesto));
}
// Se quita el viewport falso para no dejar la página tocada.
await evalJs(`(() => { delete window.__vvPrueba; window.dispatchEvent(new Event('resize')); })()`);
await sleep(500);

// 3) EL CIERRE DEL TECLADO SIN AVISO. Se comprobó que hay casos en los que el
//    teclado se cierra y el navegador no dispara NINGÚN evento: la barra se quedaba
//    con el `bottom` de cuando estaba abierto y aparecía CORTADA (asomaba su parte
//    de arriba, la de «Respondiendo a …»). Aquí se reproducen los dos caminos: que
//    sí avise y que no avise (el que fallaba).
console.log('\n=== El teclado se CIERRA ===');
const CIERRES = [
  ['avisa el navegador', true],
  ['NO avisa (el caso que fallaba)', false],
];
for (const [nombre, avisa] of CIERRES) {
  // Se abre el teclado (solo visual, el caso clásico).
  await evalJs(`(() => {
      window.__vvPrueba = { height: 450, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1,
          addEventListener: () => {}, removeEventListener: () => {} };
      window.dispatchEvent(new Event('resize'));
  })()`);
  await sleep(800);
  // Y se cierra: si `avisa`, se lanza el evento; si no, solo cambia la medida.
  await evalJs(`(() => {
      delete window.__vvPrueba;
      ${avisa ? "window.dispatchEvent(new Event('resize'));" : '/* sin avisar */'}
  })()`);
  await sleep(1400);
  const cerrado = JSON.parse((await evalJs(`(() => {
      const b = document.getElementById('problog-responder-barra');
      const r = b.getBoundingClientRect();
      const n = document.getElementById('toggle-panel');
      const sn = getComputedStyle(n);
      return JSON.stringify({
          barra: Math.round(r.top) + '..' + Math.round(r.bottom),
          bottomCss: getComputedStyle(b).bottom,
          ventana: window.innerHeight,
          // No puede quedar cortada: entera dentro de la pantalla…
          cabeEntera: r.top >= -1 && r.bottom <= window.innerHeight + 1,
          // …ni el menú principal puede taparla por abajo.
          noLaTapaElNav: r.bottom <= n.getBoundingClientRect().top + 1,
          // …y con el teclado cerrado, apoyada encima del menú principal.
          pegadaAlNav: Math.abs(n.getBoundingClientRect().top - r.bottom) <= 1.5,
          navVisible: sn.visibility !== 'hidden'
      });
  })()`)) || 'null');
  console.log(`   · ${nombre}: barra ${cerrado && cerrado.barra}, bottom ${cerrado && cerrado.bottomCss} (ventana ${cerrado && cerrado.ventana})`);
  check(`${nombre}: la barra NO se queda cortada al cerrarse el teclado`,
    !!cerrado && cerrado.cabeEntera === true, JSON.stringify(cerrado));
  check(`${nombre}: el menú principal NO tapa la barra`,
    !!cerrado && cerrado.noLaTapaElNav === true, JSON.stringify(cerrado));
  check(`${nombre}: vuelve a apoyarse encima del menú principal`,
    !!cerrado && cerrado.pegadaAlNav === true, JSON.stringify(cerrado));
  check(`${nombre}: el menú principal vuelve a verse`,
    !!cerrado && cerrado.navVisible === true, JSON.stringify(cerrado));
}

// 2) La ventana encogida SIN teclado (por ejemplo el usuario redimensionando en
//    escritorio, un cambio pequeño): aquí NO hay teclado, así que el menú principal
//    sigue a la vista y la barra se apoya encima de él. Sirve para comprobar que el
//    cálculo no se confunde y cree que hay un teclado donde no lo hay.
console.log('\n=== La ventana encogida sin teclado ===');
for (const [nombre, altoVentana] of [['ventana 752px', 752], ['ventana 700px', 700]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: altoVentana, deviceScaleFactor: 1, mobile: true });
  await sleep(900);
  const encogido = JSON.parse((await evalJs(`(() => {
      const b = document.getElementById('problog-responder-barra');
      const r = b.getBoundingClientRect();
      const n = document.getElementById('toggle-panel');
      const sn = getComputedStyle(n);
      return JSON.stringify({
          altoVentana: window.innerHeight,
          barra: Math.round(r.top) + '..' + Math.round(r.bottom),
          nav: Math.round(n.getBoundingClientRect().top) + '..' + Math.round(n.getBoundingClientRect().bottom),
          // Sin teclado el menú sigue a la vista, así que el hueco hasta el final
          // de la ventana es su alto (60px), y eso es lo correcto.
          hueco: Math.round(window.innerHeight - r.bottom),
          cabeEntera: r.top >= -1 && r.bottom <= window.innerHeight + 1,
          navOcultoSinTeclado: sn.visibility === 'hidden',
          transform: getComputedStyle(b).transform
      });
  })()`)) || 'null');
  // El navegador devuelve la matriz identidad aunque el desplazamiento sea 0, así
  // que se mira el valor: 0 es "no hizo falta desplazarla".
  const sinDesplazamientoPropio = (t) => {
    if (!t || t === 'none') return true;
    const nums = String(t).match(/-?[\d.]+/g) || [];
    const y = nums.length >= 6 ? parseFloat(nums[5]) : 0;
    return Math.abs(y) < 1;
  };
  console.log(`   · ${nombre}: barra ${encogido && encogido.barra}, nav ${encogido && encogido.nav}, ventana ${encogido && encogido.altoVentana} (hueco ${encogido && encogido.hueco}px)`);
  // Sin teclado, lo que importa es que la barra quede ENTERA dentro de la pantalla y
  // pegada al menú principal. El hueco hasta el final de la ventana es el alto del
  // menú (60px), así que se comprueba con margen: en esta simulación el navegador
  // ajusta el scroll al encoger y el viewport visual puede desplazarse unos píxeles,
  // así que exigir el píxel exacto daría un falso fallo.
  check(`${nombre}: sin teclado, la barra queda pegada al menú principal (hueco ≈60px)`,
    !!encogido && Math.abs(encogido.hueco - 60) <= 8, JSON.stringify(encogido));
  check(`${nombre}: sin teclado, la barra NO queda cortada`,
    !!encogido && encogido.cabeEntera === true, JSON.stringify(encogido));
  check(`${nombre}: sin teclado, el menú principal está a la vista (no tapado)`,
    !!encogido && encogido.navOcultoSinTeclado === false, JSON.stringify(encogido));
  check(`${nombre}: la barra no lleva desplazamiento propio`,
    !!encogido && sinDesplazamientoPropio(encogido.transform), JSON.stringify(encogido));
}
// Se devuelve la ventana a su tamaño para el resto de comprobaciones.
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await sleep(700);
await evalJs(`(() => {
    const input = document.getElementById('problog-responder-texto');
    input.value = 'Respuesta de prueba';
    document.getElementById('problog-responder-barra').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
})()`);
await sleep(2400);
todos = await enviados();
const respuesta = todos.filter((e) => e.tipo === 'comentario').pop();
check('la respuesta se envía con comentario_padre_id = 1', respuesta && respuesta.padre === 1, JSON.stringify(respuesta));
const anidadasTras = await evalJs(`document.querySelectorAll('.problog-comentario-respuestas .problog-comentario').length`);
check('la respuesta se ve anidada', anidadasTras === 2, String(anidadasTras));
const barraTras = await evalJs(`document.getElementById('problog-responder-barra').classList.contains('hidden')`);
check('la barra se cierra tras enviar la respuesta', barraTras === true);

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

// ============================================================
// El teclado YA ABIERTO al pulsar «Responder»
// ============================================================
// El usuario venía de escribir en la caja de comentarios (teclado ya desplegado) y
// pulsaba «Responder». Es el caso que rompía la detección: la altura de referencia se
// tomaba ya con el teclado puesto, el teclado dejaba de detectarse y la barra se
// quedaba abajo (con hueco) en vez de subir. Va AL FINAL a propósito: abre la barra y
// cambia el estado, así que no puede contaminar las comprobaciones de arriba.
console.log('\n=== El teclado YA estaba abierto al pulsar «Responder» ===');
await evalJs(`(() => {
    // Se abre una publicación y se deja el teclado ya desplegado ANTES de responder.
    window.__vvPrueba = { height: 450, width: window.innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1,
        addEventListener: () => {}, removeEventListener: () => {} };
    window.dispatchEvent(new Event('resize'));
})()`);
await sleep(600);
await evalJs(`document.querySelector('#problogs-detalle [data-comentario-responder]')?.click()`);
await sleep(1200);
const yaAbierto = JSON.parse((await evalJs(`(() => {
    const b = document.getElementById('problog-responder-barra');
    const r = b.getBoundingClientRect();
    const vv = window.__vvPrueba;
    const fondo = (vv.offsetTop || 0) + vv.height;
    return JSON.stringify({
        barra: Math.round(r.top) + '..' + Math.round(r.bottom),
        fondoVisible: Math.round(fondo),
        hueco: Math.round(fondo - r.bottom),
        posicion: getComputedStyle(b).position,
        clase: document.body.classList.contains('responder-teclado')
    });
})()`)) || 'null');
console.log(`   · barra ${yaAbierto && yaAbierto.barra} vs fondo visible ${yaAbierto && yaAbierto.fondoVisible} (hueco ${yaAbierto && yaAbierto.hueco}px, ${yaAbierto && yaAbierto.posicion})`);
check('con el teclado ya abierto, el teclado se detecta',
  !!yaAbierto && yaAbierto.clase === true, JSON.stringify(yaAbierto));
check('con el teclado ya abierto, la barra se coloca encima del teclado (sin hueco)',
  !!yaAbierto && Math.abs(yaAbierto.hueco) <= 6, JSON.stringify(yaAbierto));
check('con el teclado ya abierto, la barra sigue siendo fija',
  !!yaAbierto && yaAbierto.posicion === 'fixed', JSON.stringify(yaAbierto));
await evalJs(`(() => { delete window.__vvPrueba; window.dispatchEvent(new Event('resize')); })()`);
await sleep(600);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
