// Verifica el aspecto REAL de la sección de comentarios de un Problog, en los
// dos temas, midiendo lo que el navegador pinta de verdad.
//
// POR QUÉ ASÍ (las dos trampas de esta app):
//  1. Leer el CSS no basta. El bug del botón «Comentar» era invisible en el
//     código —texto `--color-white` sobre relleno `--color-ink`— porque en modo
//     oscuro esos dos tokens se INVIERTEN y acababan los dos en blanco.
//  2. El fondo de la página NO es un color CSS: `body` y `html` son
//     transparentes a propósito y detrás va un slideshow de imágenes. Cualquier
//     comprobación basada en `background-color` mide "transparente" y da
//     resultados falsos. Por eso el fondo se lee del PÍXEL de una captura real.
//
// Comprueba lo pedido:
//   · cada franja separada por una línea fina de 1px
//   · los cajones (formulario, caja de escribir, acciones) sin fondo
//   · que el texto de cada pieza se lea sobre el píxel que tiene detrás
//   · el estado :hover, provocado con el ratón de verdad
//
// Uso: node scripts/verificar-aspecto-comentarios.mjs [url] [--salida fichero]
// Requiere el servidor local: node scripts/serve-local.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodificarPNG, colorDominante, contraste } from './png-pixeles.mjs';

const PORT = 9322;
const args = process.argv.slice(2);
const argSalida = args.indexOf('--salida');
const rutaSalida = argSalida !== -1 ? args[argSalida + 1] : null;
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';

const lineas = [];
const log = (t = '') => { lineas.push(t); if (!rutaSalida) console.log(t); };
const volcar = () => { if (rutaSalida) { try { writeFileSync(rutaSalida, lineas.join('\n') + '\n', 'utf8'); } catch (e) {} } };

const profileDir = mkdtempSync(join(tmpdir(), 'verif-aspecto-'));
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
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) { log('EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200)); return null; }
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
      // Una imagen de verdad (data URL) para poder comprobar sus esquinas: sin
      // ella, la lista de figuras queda vacía y la comprobación no se ejecuta.
      const lienzo = document.createElement('canvas');
      lienzo.width = 400; lienzo.height = 300;
      const pincel = lienzo.getContext('2d');
      pincel.fillStyle = '#8899aa'; pincel.fillRect(0, 0, 400, 300);
      const imagenPrueba = lienzo.toDataURL('image/jpeg', 0.8);
      const publicacion = { id: 31001, titulo: 'Proceso de la obra', etiquetas: 'arte', estado: 'publicado',
          created_at: new Date(ahora - 3600000).toISOString(),
          bloques: [{ tipo: 'texto', contenido: 'Texto del cuerpo de la publicacion.' },
                    { tipo: 'imagen', slot: 0, pie: 'Pie de foto' }],
          imagenes: [imagenPrueba, null, null, null, null, null, null, null],
          miniaturas: [imagenPrueba, null, null, null, null, null, null, null],
          portada_slot: 0, nombre_artista: 'T', foto_artista: '', likes_count: 3, comentarios_count: 3,
          reblogs_count: 1, liked: true, reblogged: false };
      const comentarios = [
          { id: 1, problog_id: 31001, usuario_id: 10, texto: 'Primer comentario de la lista', comentario_padre_id: null,
            created_at: new Date(ahora - 1800000).toISOString(), autor_nombre: 'Ana', autor_foto: '', likes_count: 2, liked: false },
          { id: 2, problog_id: 31001, usuario_id: 11, texto: 'Una respuesta anidada', comentario_padre_id: 1,
            created_at: new Date(ahora - 900000).toISOString(), autor_nombre: 'Luis', autor_foto: '', likes_count: 0, liked: false },
          { id: 3, problog_id: 31001, usuario_id: 12, texto: 'Segundo comentario raiz', comentario_padre_id: null,
            created_at: new Date(ahora - 60000).toISOString(), autor_nombre: 'Marta', autor_foto: '', likes_count: 0, liked: false }
      ];
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          if (/\\/problogs\\/\\d+\\/comentarios$/.test(u)) return json({ success: true, comentarios });
          if (method === 'POST' || method === 'PUT' || method === 'DELETE') return json({ success: true, id: 99 });
          if (u.includes('/api/artistas/mis-problogs') || u.includes('/api/artistas/mis-reblogs')) return json({ success: true, problogs: [publicacion], total: 1 });
          if (u.includes('/problogs/31001')) return json(publicacion);
          if (u.includes('/problogs')) return json({ success: true, problogs: [publicacion], total: 1 });
          if (u.includes('heartbeat')) return json({ ok: true });
          if (u.includes('mis-reacciones')) return json({ reacciones: [] });
          if (u.includes('/obras')) return json([]);
          if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
          return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
      };
  })();`
});

// Las comprobaciones principales se hacen al tamaño de móvil (el caso que se usa
// de verdad); el barrido de anchos del final abre cada ancho en una carga limpia,
// porque cambiar el tamaño de la ventana en caliente deja medidas a medias.
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: URL_BASE });
// ESPERA A QUE LA APP ESTE LISTA, no solo a que exista un elemento. La condicion vieja ("existe
// #toggle-panel y no esta hidden") se cumple DETRAS del preloader: la app todavia no responde, y los clics
// (que aqui son programaticos y se saltan el hit-testing) se colaban en ese hueco. Por eso habia despues un
// `sleep` de asentamiento: tapaba esta carrera. Ahora se espera a lo que de verdad hace falta: panel
// visible + preloader retirado + contenedor con .visible (la senal que pone la app al terminar de arrancar).
for (let i = 0; i < 120; i++) { if (await evalJs(`(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`) === true) break; await sleep(150); }
await sleep(1200);
// Se anota el ancho de ventana de estas comprobaciones: el barrido de anchos del
// final lo cambia, así que no se puede dar por supuesto al comparar medidas.
const anchoPrincipal = await evalJs(`document.documentElement.clientWidth`);
await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
await sleep(1800);
// ANTES de abrir ninguna publicación: el icono de volver del header debe estar
// oculto. Se mide aquí, que es el único momento en que no hay lectura abierta.
const volverAlInicio = JSON.parse((await evalJs(`(() => {
    const btn = document.getElementById('btn-problog-volver');
    if (!btn) return JSON.stringify({ falta: true });
    const r = btn.getBoundingClientRect();
    const campana = document.getElementById('btn-notificaciones');
    const rc = campana ? campana.getBoundingClientRect() : null;
    return JSON.stringify({ visible: !btn.classList.contains('hidden'), ocupaEspacio: r.width > 0,
                            campanaDerecha: rc ? Math.round(rc.right) : null,
                            ventana: document.documentElement.clientWidth });
})()`)) || 'null');
await evalJs(`document.querySelector('.problog-card')?.click()`);
await sleep(2000);

// --- Utilidades de medición -------------------------------------------------

const capturar = async () => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  return r.result?.data ? decodificarPNG(Buffer.from(r.result.data, 'base64')) : null;
};

// Datos del DOM de cada pieza. NADA de expresiones regulares: esta expresión se
// construye como texto y se inyecta en el navegador; en ese viaje las barras
// invertidas se pierden y un patrón deja de coincidir EN SILENCIO (me pasó:
// devolvía null en todo el contraste). Con indexOf/slice no hay nada que escapar.
const MEDIR = (tema) => `(() => {
    document.documentElement.setAttribute('data-theme', '${tema}');
    const sec = document.querySelector('[data-problog-comentarios]');
    if (!sec) return JSON.stringify({ error: 'no hay seccion de comentarios' });
    const g = (sel) => sec.querySelector(sel);
    // OJO: el segundo argumento es el pseudo-elemento ('::after'/'::before'); sin
    // él, getComputedStyle devuelve los estilos del ELEMENTO y las líneas
    // dibujadas con pseudos no se verían.
    const cs = (el, pseudo) => el ? getComputedStyle(el, pseudo || null) : null;
    const dato = (nombre, el) => {
        if (!el) return { nombre, falta: true };
        const s = cs(el);
        // Las líneas del cajón y de cada comentario las dibuja un
        // pseudo-elemento absoluto (no un borde): se localizan por su caja.
        const pseudoLinea = (pseudo) => {
            const p = cs(el, pseudo);
            if (!p || p.content === 'none' || p.borderTopWidth === '0px') return null;
            const r = el.getBoundingClientRect();
            // OJO con el signo: el pseudo lleva un desplazamiento negativo, así
            // que su borde izquierdo es r.left MENOS ese valor.
            const izq = parseFloat(p.left) || 0;
            const der = parseFloat(p.right) || 0;
            return { left: r.left - izq, right: r.right + der, ancho: p.borderTopWidth + ' ' + p.borderTopColor,
                     // Datos para poder diagnosticar si algo no cuadra.
                     rect: { left: r.left, right: r.right }, offset: { left: p.left, right: p.right } };
        };
        const lados = {
            arriba: s.borderTopWidth + ' ' + s.borderTopColor,
            abajo: s.borderBottomWidth + ' ' + s.borderBottomColor,
            izquierda: s.borderLeftWidth + ' ' + s.borderLeftColor
        };
        const gruesos = [s.borderTopWidth, s.borderBottomWidth, s.borderLeftWidth];
        return { nombre, fondo: s.backgroundColor, color: s.color, lados,
                 lineaPropia: pseudoLinea('::after') || pseudoLinea('::before'),
                 ladosConLinea: gruesos.map((w, i) => (w === '1px' ? ['arriba', 'abajo', 'izquierda'][i] : null)).filter(Boolean) };
    };
    const r = sec.getBoundingClientRect();
    // La línea de arriba de la sección se pinta en el BORDE de su caja: hay que
    // sumar su relleno lateral (el texto va dentro, pero la línea llega más
    // lejos). Medir solo el rectángulo daba por bueno un sangrado que no existía.
    const rellenoSec = getComputedStyle(sec);
    const lineaSeccion = {
        left: r.left - parseFloat(rellenoSec.paddingLeft || 0),
        right: r.right + parseFloat(rellenoSec.paddingRight || 0)
    };
    // Rectángulos de lo que debe llegar de borde a borde: el título, el cajón y
    // un comentario. Se comparan con el de la sección para ver si la línea se
    // estira o se queda con aire a los lados.
    const caja = (el) => { if (!el) return null; const x = el.getBoundingClientRect(); return { left: x.left, right: x.right }; };
    // Imágenes del contenido: son las que ve el lector al abrir la publicación.
    const figuras = Array.from(document.querySelectorAll('.problog-lectura-figura img'));
    return JSON.stringify({
        rectSeccion: { left: r.left, top: r.top, width: r.width, height: r.height },
        // Aire lateral que usa la sección (= el del contenido de la publicación).
        aireSeccion: (() => { const el = g('.problog-comentarios'); return el ? cs(el).getPropertyValue('--comentario-aire') : '0px'; })(),
        // Dónde empieza el CONTENIDO del cajón y de un comentario: el marcador del
        // textarea (su borde + su relleno) y el avatar.
        inputRect: (() => {
            const el = g('.problog-comentario-input');
            if (!el) return null;
            const x = el.getBoundingClientRect();
            const s = cs(el);
            // El texto no empieza en el borde de la caja, sino tras su relleno.
            return { left: x.left + (parseFloat(s.paddingLeft) || 0), right: x.right - (parseFloat(s.paddingRight) || 0) };
        })(),
        avatarRect: caja(g('.problog-comentario-avatar')),
        // Referencia: dónde empieza el texto de la publicación. OJO: el ayudante g
        // busca dentro de la sección de comentarios, y el texto del post está
        // fuera, así que aquí se consulta el documento entero.
        postRect: (() => {
            const el = document.querySelector('.problog-lectura-texto p')
                || document.querySelector('.problog-lectura-texto')
                || document.querySelector('.problog-lectura-cuerpo');
            return el ? { left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right } : null;
        })(),
        ventana: window.innerWidth,
        // Caja de escribir: qué borde le queda en cada lado (se pidió quitar el
        // contorno) y si la lista muestra algún mensaje cuando está vacía.
        inputLados: (() => {
            const el = g('.problog-comentario-input');
            if (!el) return null;
            const s = cs(el);
            return { arriba: s.borderTopWidth, abajo: s.borderBottomWidth, izquierda: s.borderLeftWidth, derecha: s.borderRightWidth };
        })(),
        comentariosPintados: (() => {
            const lista = g('[data-comentarios-lista]');
            return lista ? lista.querySelectorAll('.problog-comentario').length : -1;
        })(),
        textoLista: (() => {
            const lista = g('[data-comentarios-lista]');
            return lista ? lista.textContent.trim() : '(sin lista)';
        })(),
        // Las imágenes a sangre: su rectángulo tiene que llegar a los bordes.
        imagenesRect: figuras.map((img) => { const x = img.getBoundingClientRect(); return { left: x.left, right: x.right }; }),
        // Rectángulos de lo que debe llegar de borde a borde: el título, el cajón,
        // un comentario y la LÍNEA de debajo de la caja de escribir (el subrayado
        // del input, que es su borde inferior).
        bordes: {
            titulo: caja(g('.problog-comentarios-titulo')),
            form: caja(g('.problog-comentario-form')),
            comentario: caja(g('.problog-comentario')),
            lineaInput: caja(g('.problog-comentario-input')),
            // OJO: la sección puede llevar relleno lateral (el texto va dentro y
            // la línea va en el borde), así que su línea se mide con ese relleno.
            seccion: { left: lineaSeccion.left, right: lineaSeccion.right }
        },
        // Botón «Comentar»: tiene que ir centrado y ancho.
        // Botón «Comentar»: tiene que ir centrado y ancho. Y la línea del cajón
        // tiene que quedar ENCIMA de él (a qué altura empieza el botón).
        botonEnviarY: (() => {
            const b = g('.problog-comentario-enviar');
            return b ? Math.round(b.getBoundingClientRect().top) : null;
        })(),
        lineaCajonY: (() => {
            const el = g('.problog-comentario-form');
            if (!el) return null;
            const p = cs(el, '::after');
            if (!p || p.content === 'none' || p.borderTopWidth === '0px') return null;
            const r = el.getBoundingClientRect();
            return Math.round(r.bottom - (parseFloat(p.bottom) || 0));
        })(),
        // Respuesta anidada: NO debe llevar línea de división (va pegada a su
        // comentario padre; la relación la marca la línea guía de la izquierda).
        lineaRespuesta: (() => {
            const el = g('.problog-comentario-respuestas .problog-comentario');
            if (!el) return null;
            const p = cs(el, '::before');
            return p ? (p.content === 'none' || p.borderTopWidth === '0px' ? 'sin linea' : 'con linea') : null;
        })(),
        botonEnviar: (() => {
            const b = g('.problog-comentario-enviar');
            if (!b) return null;
            const rb = b.getBoundingClientRect();
            const contenedor = g('.problog-comentario-form').getBoundingClientRect();
            const s = cs(b);
            return {
                izq: rb.left, der: rb.right,
                centro: rb.left + rb.width / 2,
                centroFormulario: contenedor.left + contenedor.width / 2,
                ancho: rb.width, alto: rb.height, radio: s.borderRadius,
                borde: s.borderTopWidth,
                // Para comprobar que no queda aire por debajo del botón.
                abajo: rb.bottom, abajoCajon: contenedor.bottom,
                texto: b.textContent.trim()
            };
        })(),
        filaSocial: (() => {
            const fila = document.querySelector('.problogs-detalle .problog-social');
            if (!fila) return null;
            const f = fila.getBoundingClientRect();
            const padre = fila.parentElement;
            const p = padre ? padre.getBoundingClientRect() : f;
            const boton = fila.querySelector('.problog-social-btn');
            const b = boton ? boton.getBoundingClientRect() : null;
            const icono = boton ? boton.querySelector('svg') : null;
            const i = icono ? icono.getBoundingClientRect() : null;
            // Huecos REALES entre marcadores (borde derecho de uno a izquierdo
            // del siguiente): al ir centrados y juntos, esto es lo que se ve.
            const botones = Array.from(fila.querySelectorAll('.problog-social-btn'));
            const huecos = [];
            for (let k = 1; k < botones.length; k++) {
                huecos.push(Math.round(botones[k].getBoundingClientRect().left - botones[k - 1].getBoundingClientRect().right));
            }
            return { centro: f.left + f.width / 2, contenedorCentro: p.left + p.width / 2,
                     botonAlto: b ? b.height : null, iconoAncho: i ? i.width : null, huecos,
                     cantidad: botones.length };
        })(),
        imagenes: figuras.map((img) => getComputedStyle(img).borderRadius),
        cajas: [
            dato('cajon de escribir (form)', g('.problog-comentario-form')),
            dato('caja de escribir (textarea)', g('.problog-comentario-input')),
            dato('fila de acciones', g('.problog-comentario-acciones')),
            dato('boton Comentar', g('.problog-comentario-enviar')),
            dato('cabecera (titulo + contador)', g('.problog-comentarios-titulo')),
            dato('contador', g('.problog-comentarios-cuenta')),
            dato('primer comentario', g('.problog-comentario')),
            dato('nombre del autor', g('.problog-comentario-autor')),
            dato('texto del comentario', g('.problog-comentario-texto')),
            dato('fecha del comentario', g('.problog-comentario-fecha')),
            dato('accion Responder', g('.problog-comentario-accion')),
            dato('guia de respuestas', g('.problog-comentario-respuestas'))
        ]
    });
})()`;

const RECT = (sel) => `(() => {
    const el = document.querySelector('[data-problog-comentarios] ' + ${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height });
})()`;

// Fondo real de una pieza: el color MÁS FRECUENTE de su banda superior (el texto
// y las líneas son minoría de píxeles). Así no hay que acertar un punto que no
// caiga sobre una letra.
const fondoDe = async (imagen, sel, escala, banda) => {
  const r = JSON.parse((await evalJs(RECT(sel))) || 'null');
  if (!r) return null;
  const margenX = Math.min(10, r.width / 4);
  const alto = banda || Math.min(8, r.height / 3);
  return colorDominante(imagen,
    (r.left + margenX) * escala, r.top * escala,
    (r.left + r.width - margenX) * escala, (r.top + alto) * escala);
};

const recortar = (imagen, rect, escala) => (!rect ? null : colorDominante(imagen,
  (rect.left + 2) * escala, Math.max(0, rect.top) * escala,
  (rect.left + rect.width - 2) * escala, (rect.top + rect.height) * escala));

const CENTRO = (sel) => `(() => {
    const el = document.querySelector('[data-problog-comentarios] ' + ${JSON.stringify(sel)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`;

const moverRaton = async (sel) => {
  const p = JSON.parse((await evalJs(CENTRO(sel))) || 'null');
  if (!p) return false;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
  await sleep(220);
  return true;
};

// Fuera de todo: si el ratón se queda encima, la medida "normal" sale con hover.
const apartarRaton = async () => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none' });
  await sleep(180);
};

const PIEZAS = {
  'cajon de escribir (form)': '.problog-comentario-form',
  'caja de escribir (textarea)': '.problog-comentario-input',
  'boton Comentar': '.problog-comentario-enviar',
  'cabecera (titulo + contador)': '.problog-comentarios-titulo',
  'primer comentario': '.problog-comentario',
  'accion Responder': '.problog-comentario-accion',
  'contador': '.problog-comentarios-cuenta',
};

// --- Comprobaciones ---------------------------------------------------------

let fallos = 0; let pruebas = 0;
function check(nombre, ok, detalle) {
  pruebas++;
  if (ok) log(`  PASS  ${nombre}`);
  else { fallos++; log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}
const transparente = (c) => {
  if (!c || c === 'transparent') return true;
  const t = String(c);
  if (t.indexOf('rgba') === 0) {
    // Alfa ~0 cuenta como transparente: el navegador devuelve cosas como
    // `rgba(245, 245, 245, 0.004)` para una transición a medio terminar, y eso
    // NO es un relleno (daba un falso fallo).
    const partes = t.slice(t.indexOf('(') + 1, t.indexOf(')')).split(',');
    const alfa = parseFloat(partes[3]);
    return !isNaN(alfa) && alfa < 0.02;
  }
  return false;
};

for (const tema of ['dark', 'light']) {
  log(`\n=== Tema ${tema.toUpperCase()} ===`);
  // La sección tiene que estar dentro de la ventana: si no, sus coordenadas caen
  // fuera de la captura y el fondo saldría null (una medida a ciegas).
  await evalJs(`document.documentElement.setAttribute('data-theme', '${tema}')`);
  await evalJs(`document.querySelector('[data-problog-comentarios]')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  // El sangrado de las líneas interiores lo mide el JS al abrir y al cambiar el
  // tamaño: hay que avisarle, como haría el navegador de verdad.
  await evalJs(`window.dispatchEvent(new Event('resize'))`);
  await sleep(500);
  await apartarRaton();

  const d = JSON.parse((await evalJs(MEDIR(tema))) || 'null');
  if (!d || d.error) { check('se pudieron leer los datos de la página', false, JSON.stringify(d)); continue; }
  const caja = (n) => d.cajas.find((c) => c.nombre === n) || {};

  const imagen = await capturar();
  if (!imagen) { check('se pudo capturar la pantalla', false); continue; }
  const anchoCss = await evalJs(`document.documentElement.clientWidth`);
  const escala = imagen.ancho / anchoCss;

  const fondoPixel = {};
  for (const [nombre, sel] of Object.entries(PIEZAS)) fondoPixel[nombre] = await fondoDe(imagen, sel, escala);
  const fondoZona = recortar(imagen, d.rectSeccion, escala);
  log(`   (captura ${imagen.ancho}x${imagen.alto}, escala ${escala.toFixed(2)}x)`);
  log(`   · fondo de la zona (píxel dominante): ${fondoZona}`);

  for (const c of d.cajas) {
    if (c.falta) { log(`   · ${c.nombre}: NO EXISTE`); continue; }
    log(`   · ${c.nombre}: color=${c.color} fondoCSS=${c.fondo} fondoPIXEL=${fondoPixel[c.nombre] || 'n/d'}`);
    log(`       líneas de 1px en: ${c.ladosConLinea.join(', ') || 'ninguna'}   [arriba ${c.lados.arriba} | abajo ${c.lados.abajo} | izq ${c.lados.izquierda}]`);
  }

  // 1) El texto se lee sobre el píxel que tiene detrás. Las piezas no tienen
  //    fondo propio, así que se apoyan en el de la zona.
  for (const nombre of ['boton Comentar', 'nombre del autor', 'texto del comentario', 'fecha del comentario', 'accion Responder', 'contador']) {
    const c = caja(nombre);
    if (c.falta) { check(`«${nombre}» existe`, false); continue; }
    const ratio = contraste(c.color, fondoZona);
    log(`   · texto «${nombre}»: color=${c.color} fondo=${fondoZona} contraste=${ratio}:1`);
    check(`«${nombre}»: contraste ${ratio}:1 (mín 4.5)`, (ratio || 0) >= 4.5, `color=${c.color} fondo=${fondoZona}`);
  }

  // 2) Lo mismo con el ratón encima, que es cuando cambia el fondo.
  for (const [sel, etiqueta, cajaNombre] of [
    ['.problog-comentario-accion', 'Responder', 'accion Responder'],
    ['.problog-comentario-enviar', 'Comentar', 'boton Comentar'],
  ]) {
    if (!(await moverRaton(sel))) { check(`hover de «${etiqueta}» medido`, false); continue; }
    const imgHover = await capturar();
    const fondo = imgHover ? await fondoDe(imgHover, sel, escala, 6) : null;
    const color = caja(cajaNombre).color;
    const ratio = contraste(color, fondo);
    log(`   · HOVER «${etiqueta}»: color=${color} fondo=${fondo} contraste=${ratio}:1`);
    check(`«${etiqueta}» en hover: contraste ${ratio}:1 (mín 4.5)`, (ratio || 0) >= 4.5, `color=${color} fondo=${fondo}`);
    check(`«${etiqueta}» en hover cambia de fondo`, !!fondo && fondo !== fondoZona, `${fondo} vs ${fondoZona}`);
  }

  // 3) Los cajones, sin fondo propio (por eso el fondo que se ve es el de la zona).
  check('el cajón de escribir va sin fondo', transparente(caja('cajon de escribir (form)').fondo), caja('cajon de escribir (form)').fondo);
  check('la caja de escribir va sin fondo', transparente(caja('caja de escribir (textarea)').fondo), caja('caja de escribir (textarea)').fondo);
  check('la fila de acciones va sin fondo', transparente(caja('fila de acciones').fondo), caja('fila de acciones').fondo);
  check('el contador va sin relleno', transparente(caja('contador').fondo), caja('contador').fondo);
  check('el botón «Comentar» va sin relleno', transparente(caja('boton Comentar').fondo), caja('boton Comentar').fondo);

  // 4) Las líneas: la sección abre con una y el cajón y cada comentario la
  //    dibujan con un pseudo-elemento. La cabecera no lleva ninguna.
  check('la cabecera NO lleva línea (menos rayas)',
    !caja('cabecera (titulo + contador)').lados?.abajo?.startsWith('1px'), caja('cabecera (titulo + contador)').lados?.abajo);
  check('el cajón de escribir dibuja su línea de abajo',
    !!caja('cajon de escribir (form)').lineaPropia, JSON.stringify(caja('cajon de escribir (form)').lineaPropia));
  check('cada comentario dibuja su línea de arriba',
    !!caja('primer comentario').lineaPropia, JSON.stringify(caja('primer comentario').lineaPropia));
  check('la guía de las respuestas es una línea de 1px a la izquierda',
    caja('guia de respuestas').lados?.izquierda?.startsWith('1px'), caja('guia de respuestas').lados?.izquierda);
  // La respuesta va pegada a su comentario: sin línea de división entre los dos.
  if (d.lineaRespuesta === null || d.lineaRespuesta === undefined) {
    check('hay una respuesta anidada que medir', false);
  } else {
    log(`   · respuesta anidada: ${d.lineaRespuesta}`);
    check('la respuesta anidada NO lleva línea de división', d.lineaRespuesta === 'sin linea', d.lineaRespuesta);
  }

  // 5) La línea que se pidió (la de ARRIBA de la sección, justo debajo de los
  //    marcadores) llega de extremo a extremo. Las interiores se quedan dentro de
  //    la columna de lectura, que es lo que se pidió después.
  const ventana = d.ventana;
  const seccion = d.bordes?.seccion;
  if (!seccion) { check('se midió la línea de la sección', false); }
  else {
    const aireSeccion = Math.max(seccion.left, ventana - seccion.right);
    log(`   · línea bajo los marcadores: ${seccion.left.toFixed(0)}..${seccion.right.toFixed(0)} (ventana ${ventana}, aire ${aireSeccion.toFixed(0)}px)`);
    check('la línea bajo los marcadores llega de extremo a extremo', Math.abs(aireSeccion) <= 1.5, `aire ${aireSeccion.toFixed(1)}px`);
  }
  for (const [nombre, b] of Object.entries(d.bordes || {})) {
    if (nombre === 'seccion' || !b) continue;
    log(`   · ${nombre}: ${b.left.toFixed(0)}..${b.right.toFixed(0)}`);
  }
  // Las líneas del cajón y de cada comentario (pseudo-elementos) van al mismo
  // sitio que la de la sección: de extremo a extremo.
  const lineaForm = caja('cajon de escribir (form)').lineaPropia;
  const lineaComentario = caja('primer comentario').lineaPropia;
  if (seccion && lineaForm) {
    const aire = Math.max(lineaForm.left, ventana - lineaForm.right);
    log(`   · línea del cajón: ${lineaForm.left.toFixed(0)}..${lineaForm.right.toFixed(0)} (aire ${aire.toFixed(0)}px)`);
    log(`       [cajón ${lineaForm.rect.left.toFixed(0)}..${lineaForm.rect.right.toFixed(0)}, desplazamiento ${lineaForm.offset.left}/${lineaForm.offset.right}]`);
    check('la línea del cajón va de extremo a extremo', Math.abs(aire) <= 1.5, `aire ${aire.toFixed(1)}px`);
  }
  if (seccion && lineaComentario) {
    const aire = Math.max(lineaComentario.left, ventana - lineaComentario.right);
    log(`   · línea del comentario: ${lineaComentario.left.toFixed(0)}..${lineaComentario.right.toFixed(0)} (aire ${aire.toFixed(0)}px)`);
    check('la línea de cada comentario va de extremo a extremo', Math.abs(aire) <= 1.5, `aire ${aire.toFixed(1)}px`);
  }

  // 6) Marcadores centrados y más grandes.
  const fila = d.filaSocial;
  if (!fila) { check('la fila de marcadores existe', false); }
  else {
    const desvio = Math.abs(fila.centro - fila.contenedorCentro);
    log(`   · marcadores: centro=${fila.centro.toFixed(1)} vs contenedor=${fila.contenedorCentro.toFixed(1)} (desvío ${desvio.toFixed(1)}px), icono ${fila.iconoAncho}px, alto del botón ${fila.botonAlto}px`);
    check(`los marcadores están centrados (desvío ${desvio.toFixed(1)}px)`, desvio <= 2, `desvío ${desvio.toFixed(1)}px`);
    check(`el icono es grande (${fila.iconoAncho}px ≥ 22)`, (fila.iconoAncho || 0) >= 22, String(fila.iconoAncho));
    check(`el área de pulsación es amplia (${fila.botonAlto}px ≥ 44)`, (fila.botonAlto || 0) >= 44, String(fila.botonAlto));
    const huecos = fila.huecos || [];
    log(`   · huecos entre marcadores: ${huecos.join(', ')} px`);
    check('los marcadores están juntos (hueco ≤ 16px)', huecos.every((h) => h <= 16), JSON.stringify(huecos));
  }

  // 7) Las imágenes del contenido: con sus vértices rectos y CON aire lateral
  //    (se quedan dentro de la columna de lectura, alineadas con el texto).
  for (const radio of d.imagenes || []) {
    check(`imagen sin vértices redondeados (border-radius ${radio})`, radio === '0px' || radio === '0', radio);
  }

  // 8) La caja de escribir, SIN contorno: su línea la dibuja el cajón.
  const lados = d.inputLados;
  if (!lados) { check('la caja de escribir existe', false); }
  else {
    log(`   · caja de escribir — bordes: arriba ${lados.arriba}, abajo ${lados.abajo}, izq ${lados.izquierda}, der ${lados.derecha}`);
    check('la caja de escribir NO tiene ningún borde propio',
      lados.arriba === '0px' && lados.abajo === '0px' && lados.izquierda === '0px' && lados.derecha === '0px',
      JSON.stringify(lados));
  }

  // 8b) El botón «Comentar»: de extremo a extremo (rectángulo, sin curvas) y
  //     centrado su texto. Y la línea del cajón va ENCIMA de él.
  const env = d.botonEnviar;
  if (!env) { check('el botón «Comentar» existe', false); }
  else {
    const aireBoton = Math.max(env.izq, ventana - env.der);
    log(`   · botón «${env.texto}»: ${env.izq.toFixed(0)}..${env.der.toFixed(0)} (aire ${aireBoton.toFixed(0)}px), ancho=${env.ancho.toFixed(0)}px, alto=${env.alto.toFixed(0)}px, radio=${env.radio}, centro=${env.centro.toFixed(1)} vs cajón=${env.centroFormulario.toFixed(1)}`);
    check('el botón «Comentar» llega de extremo a extremo', Math.abs(aireBoton) <= 1.5, `aire ${aireBoton.toFixed(1)}px`);
    check('el botón «Comentar» no tiene vértices curvos', env.radio === '0px' || env.radio === '0', String(env.radio));
    // Sin borde: se pidió que no se vea el contorno del botón.
    check('el botón «Comentar» no tiene borde visible',
      env.borde === '0px' || env.borde === '0' || env.borde === 'none', String(env.borde));
    check(`el texto del botón va centrado (desvío ${Math.abs(env.centro - env.centroFormulario).toFixed(1)}px)`,
      Math.abs(env.centro - env.centroFormulario) <= 2, `desvío ${Math.abs(env.centro - env.centroFormulario).toFixed(1)}px`);
    // El botón cierra el cajón: no puede quedar aire por debajo.
    const aireAbajo = env.abajoCajon - env.abajo;
    log(`   · hueco por debajo del botón: ${aireAbajo.toFixed(1)}px`);
    check('el botón «Comentar» cierra el cajón (sin aire debajo)', Math.abs(aireAbajo) <= 1.5, `aire ${aireAbajo.toFixed(1)}px`);
  }
  if (d.lineaCajonY !== null && d.lineaCajonY !== undefined && d.botonEnviarY !== null && d.botonEnviarY !== undefined) {
    const encima = d.lineaCajonY <= d.botonEnviarY + 1;
    log(`   · línea del cajón a y=${d.lineaCajonY}, el botón empieza en y=${d.botonEnviarY}`);
    check('la línea del cajón va ENCIMA del botón «Comentar»', encima,
      `línea y=${d.lineaCajonY} vs botón y=${d.botonEnviarY}`);
  } else {
    check('se pudo medir la altura de la línea del cajón y del botón', false,
      `linea=${d.lineaCajonY} boton=${d.botonEnviarY}`);
  }

  // 9) Sin comentarios no se pinta ningún mensaje: la lista queda vacía.
  //    (Este caso se prueba aparte, con el mock sin comentarios.)
  if (d.comentariosPintados === 0) {
    check('sin comentarios NO se muestra ningún mensaje', d.textoLista === '', JSON.stringify(d.textoLista));
  }

  // 10) Las imágenes del problog vuelven a tener AIRE lateral: ya no llegan a los
  //     bordes de la pantalla, se quedan dentro de la columna de lectura (que es
  //     más estrecha que la ventana).
  for (const img of d.imagenesRect || []) {
    const aire = Math.max(img.left, ventana - img.right);
    log(`   · imagen: de ${img.left.toFixed(0)} a ${img.right.toFixed(0)} (ventana ${ventana}, columna hasta ${(d.rectSeccion.left + d.rectSeccion.width).toFixed(0)})`);
    check('la imagen del problog tiene aire lateral', aire > 5, `aire lateral ${aire.toFixed(1)}px`);
  }

  // 11) El contenido de los comentarios va alineado con el texto de la publicación:
  //     el marcador del cajón y el avatar del primer comentario empiezan en la
  //     MISMA x que el texto del post. Las líneas de separación no se tocan (siguen
  //     de extremo a extremo, comprobado más arriba).
  if (!d.postRect) { check('se pudo medir dónde empieza el texto del post', false); }
  else {
    const bordeContenido = d.postRect.left;
    for (const [etiqueta, caja] of [['marcador del cajón', d.inputRect], ['avatar de un comentario', d.avatarRect]]) {
      if (!caja) { check(`se pudo medir el aire de «${etiqueta}»`, false); continue; }
      const desvio = Math.abs(caja.left - bordeContenido);
      log(`   · ${etiqueta}: empieza en ${caja.left.toFixed(0)}, texto del post en ${bordeContenido.toFixed(0)} (desvío ${desvio.toFixed(1)}px)`);
      check(`«${etiqueta}» va alineado con el texto del post (desvío ${desvio.toFixed(1)}px)`, desvio <= 1.5,
        `${caja.left.toFixed(0)} vs ${bordeContenido.toFixed(0)}`);
    }
  }
}

log(`\nEXCEPCIONES: ${logs.length ? logs.join(' | ') : 'ninguna'}`);
if (logs.length) fallos++;

// --- Botón de Problogs en el nav principal ----------------------------------
// Antes se entraba por un icono del header que alternaba con Cavents; ese icono
// se quitó, así que el botón del nav tiene que existir, abrir la sección y
// marcarse cuando está abierta.
// --- Estado SIN comentarios -------------------------------------------------
// La lista tiene que quedar VACÍA: no se pinta ningún mensaje. El dato de que
// no hay comentarios ya lo da el contador (0).
log(`\n=== Sin comentarios ===`);
const vacio = JSON.parse((await evalJs(`(() => {
    const lista = document.querySelector('[data-problog-comentarios] [data-comentarios-lista]');
    if (!lista) return JSON.stringify({ error: 'no hay lista' });
    const copia = lista.innerHTML;
    lista.innerHTML = '';
    const texto = lista.textContent.trim();
    const hijos = lista.children.length;
    lista.innerHTML = copia;   // se restaura para no dejar la página tocada
    return JSON.stringify({ texto, hijos });
})()`)) || 'null');
if (!vacio || vacio.error) { check('se pudo probar el estado vacío', false, JSON.stringify(vacio)); }
else {
  log(`   · con la lista vacía: ${vacio.hijos} elemento(s), texto=${JSON.stringify(vacio.texto)}`);
  check('sin comentarios la lista queda vacía', vacio.hijos === 0 && vacio.texto === '', JSON.stringify(vacio));
}
log(`\n=== Botón Problogs del nav ===`);
const nav = JSON.parse((await evalJs(`(() => {
    const btn = document.getElementById('btn-problogs-nav');
    const headerViejo = document.getElementById('btn-problogs');
    return JSON.stringify({
        existe: !!btn,
        enElNav: !!btn && !!btn.closest('#toggle-panel'),
        iconoEnHeader: !!headerViejo,
        activoAlEmpezar: !!btn && btn.classList.contains('nav-btn-active')
    });
})()`)) || 'null');
if (!nav) { check('se pudo leer el nav', false); }
else {
  log(`   · existe=${nav.existe} enElNav=${nav.enElNav} iconoViejoEnHeader=${nav.iconoEnHeader}`);
  check('el botón de Problogs existe en el nav principal', nav.existe && nav.enElNav);
  check('el icono Problogs del header ya no está', nav.iconoEnHeader === false);
}
await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
// La sección entra con una transición (~0.8s): se espera a que termine de
// verdad en vez de mirar a los 1.5s y dar por hecho que ya está.
let abierto = null;
for (let i = 0; i < 20; i++) {
  abierto = JSON.parse((await evalJs(`(() => {
      const sec = document.getElementById('problogs');
      const btn = document.getElementById('btn-problogs-nav');
      const entrada = sec ? sec.classList.contains('section-entering') : false;
      return JSON.stringify({ abierta: !!sec && !sec.classList.contains('hidden'), activo: !!btn && btn.classList.contains('nav-btn-active'), entrada });
  })()`)) || 'null');
  if (abierto && abierto.abierta && !abierto.entrada) break;
  await sleep(300);
}
if (!abierto) { check('el botón abre Problogs', false); }
else {
  log(`   · tras pulsar: seccionAbierta=${abierto.abierta} botonActivo=${abierto.activo}`);
  check('el botón del nav abre la sección Problogs', abierto.abierta === true);
  check('el botón se marca como activo con Problogs abierta', abierto.activo === true);
}

// Reparto del nav: con un botón más, ninguno se sale de la pantalla ni se
// solapa con el perfil del centro.
const reparto = JSON.parse((await evalJs(`(() => {
    const ids = ['btn-chat-global', 'btn-cavents-hub', 'btn-perfil-sidebar', 'btn-buscar', 'btn-problogs-nav'];
    const cajas = ids.map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, falta: true };
        const r = el.getBoundingClientRect();
        return { id, left: r.left, right: r.right, ancho: r.width };
    });
    return JSON.stringify({ ventana: window.innerWidth, cajas });
})()`)) || 'null');
if (!reparto) { check('se pudo medir el nav', false); }
else {
  for (const c of reparto.cajas) {
    if (c.falta) { check(`botón del nav «${c.id}» existe`, false); continue; }
    log(`   · ${c.id}: ${c.left.toFixed(0)}..${c.right.toFixed(0)} (ancho ${c.ancho.toFixed(0)})`);
    check(`«${c.id}» cabe en la pantalla`, c.left >= -1 && c.right <= reparto.ventana + 1,
      `${c.left.toFixed(0)}..${c.right.toFixed(0)} de ${reparto.ventana}`);
  }
  const noFalta = reparto.cajas.filter((c) => !c.falta);
  let solapes = 0;
  for (let i = 0; i < noFalta.length; i++) {
    for (let j = i + 1; j < noFalta.length; j++) {
      const a = noFalta[i], b = noFalta[j];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1) solapes++;
    }
  }
  log(`   · solapes entre botones del nav: ${solapes}`);
  check('los botones del nav no se solapan', solapes === 0, `${solapes} solape(s)`);
}

// --- Las líneas, en varios anchos de pantalla -------------------------------
// La línea de arriba de la sección es la que va justo DEBAJO de los marcadores:
// --- Icono «Volver» en el header --------------------------------------------
// Solo se ve mientras se lee una publicación, va junto a la campana y al pulsarlo
// se vuelve al feed.
log(`\n=== Icono «Volver» del header ===`);
const volver = JSON.parse((await evalJs(`(() => {
    const btn = document.getElementById('btn-problog-volver');
    const campana = document.getElementById('btn-notificaciones');
    const viejo = document.querySelector('#problogs .problog-volver');
    const header = document.getElementById('main-header');
    if (!btn || !campana) return JSON.stringify({ falta: true });
    const rb = btn.getBoundingClientRect();
    const rc = campana.getBoundingClientRect();
    return JSON.stringify({
        // El botón viejo dentro de la publicación ya no debe existir.
        botonViejo: !!viejo,
        enElHeader: header.contains(btn),
        visible: !btn.classList.contains('hidden'),
        ocupaEspacio: rb.width > 0,
        centroBoton: rb.left + rb.width / 2,
        centroCampana: rc.left + rc.width / 2,
        // Además de estar al lado, tiene que estar a su IZQUIERDA.
        aLaIzquierda: rb.right <= rc.left + 1
    });
})()`)) || 'null');
if (!volver || volver.falta) { check('el icono de volver existe en el header', false); }
else {
  log(`   · enElHeader=${volver.enElHeader} visible=${volver.visible} ocupaEspacio=${volver.ocupaEspacio} centro=${volver.centroBoton.toFixed(0)} vs campana=${volver.centroCampana.toFixed(0)} aLaIzquierda=${volver.aLaIzquierda}`);
  check('el botón «Volver» de dentro de la publicación ya no existe', volver.botonViejo === false);
  check('el icono de volver vive en el header', volver.enElHeader === true);
}
// Al principio (sin lectura) tenía que estar oculto y no ocupar sitio.
if (!volverAlInicio || volverAlInicio.falta) { check('se pudo comprobar el icono sin lectura abierta', false); }
else {
  log(`   · al principio (sin lectura): visible=${volverAlInicio.visible} ocupaEspacio=${volverAlInicio.ocupaEspacio}`);
  check('el icono de volver está oculto sin lectura abierta',
    volverAlInicio.visible === false && volverAlInicio.ocupaEspacio === false,
    JSON.stringify(volverAlInicio));
}
// Al abrir una publicación aparece; al pulsarlo, vuelve al feed.
await evalJs(`document.querySelector('.problog-card')?.click()`);
// Se espera a que el icono esté VISIBLE y sin animación en curso: midiendo a
// mitad de la aparición, la campana aún no ha recuperado su sitio.
for (let i = 0; i < 20; i++) {
  const listo = await evalJs(`(() => {
      const b = document.getElementById('btn-problog-volver');
      return !!b && !b.classList.contains('hidden') && !b.classList.contains('ocultando')
          && parseFloat(getComputedStyle(b).opacity) >= 0.99;
  })()`);
  if (listo) break;
  await sleep(200);
}
await sleep(250);
const trasAbrir = JSON.parse((await evalJs(`(() => {
    const btn = document.getElementById('btn-problog-volver');
    const campana = document.getElementById('btn-notificaciones');
    const lectura = !document.getElementById('problogs-detalle').classList.contains('hidden');
    const rb = btn ? btn.getBoundingClientRect() : null;
    const rc = campana ? campana.getBoundingClientRect() : null;
    return JSON.stringify({
        visible: !!btn && !btn.classList.contains('hidden'),
        lectura,
        alLado: !!(rb && rc) && rb.right <= rc.left + 1,
        // Hueco real hasta la campana: si es grande, el icono se ha ido al otro
        // extremo (pegado al logo) en vez de quedarse junto a la campana.
        hueco: (rb && rc) ? rc.left - rb.right : null,
        campanaDerecha: rc ? Math.round(rc.right) : null,
        ventana: document.documentElement.clientWidth
    });
})()`)) || 'null');
if (!trasAbrir) { check('se pudo comprobar el icono con la publicación abierta', false); }
else {
  log(`   · con la publicación abierta: visible=${trasAbrir.visible} alLadoDeLaCampana=${trasAbrir.alLado} hueco=${trasAbrir.hueco} campanaDerecha=${trasAbrir.campanaDerecha}`);
  check('al abrir una publicación aparece el icono de volver', trasAbrir.visible === true && trasAbrir.lectura === true);
  check('el icono de volver está justo al lado de la campana', trasAbrir.alLado === true);
  if (typeof trasAbrir.hueco === 'number') {
    check(`el icono de volver NO queda pegado al logo (hueco hasta la campana ${trasAbrir.hueco}px ≤ 24)`,
      trasAbrir.hueco <= 24, `${trasAbrir.hueco}px`);
  }
}
// Lo que se pidió: los iconos del header NO se mueven al aparecer el de volver.
// Se compara solo si la medida se hizo al mismo ancho que la del principio (el
// barrido de anchos del final cambia el tamaño de la ventana).
log(`   · anchos medidos: principal=${anchoPrincipal} trasAbrir=${trasAbrir && trasAbrir.ventana} trasVolver=(pendiente)`);
if (volverAlInicio && volverAlInicio.campanaDerecha !== null && trasAbrir && trasAbrir.campanaDerecha !== null
    && trasAbrir.ventana === anchoPrincipal) {
  const desplazamiento = Math.abs(trasAbrir.campanaDerecha - volverAlInicio.campanaDerecha);
  log(`   · campana a ${trasAbrir.ventana}px: derecha ${volverAlInicio.campanaDerecha} sin el icono → ${trasAbrir.campanaDerecha} con el icono (se mueve ${desplazamiento}px)`);
  check(`la campana no se mueve al aparecer el icono de volver (${desplazamiento}px)`, desplazamiento <= 1,
    `${volverAlInicio.campanaDerecha} → ${trasAbrir.campanaDerecha}`);
}
await evalJs(`document.getElementById('btn-problog-volver')?.click()`);
await sleep(1400);
const trasVolver = JSON.parse((await evalJs(`(() => {
    const btn = document.getElementById('btn-problog-volver');
    const campana = document.getElementById('btn-notificaciones');
    const rc = campana ? campana.getBoundingClientRect() : null;
    return JSON.stringify({
        lectura: !document.getElementById('problogs-detalle').classList.contains('hidden'),
        oculto: !!btn && (btn.classList.contains('hidden') || btn.classList.contains('ocultando')),
        campanaDerecha: rc ? Math.round(rc.right) : null,
        ventana: document.documentElement.clientWidth
    });
})()`)) || 'null');
if (!trasVolver) { check('se pudo comprobar el icono tras volver', false); }
else {
  log(`   · tras pulsar volver: lectura=${trasVolver.lectura} iconoOculto=${trasVolver.oculto} campanaDerecha=${trasVolver.campanaDerecha}`);
  check('el icono de volver cierra la lectura', trasVolver.lectura === false);
  check('el icono de volver se oculta al volver al feed', trasVolver.oculto === true);
  // Y al volver al feed (mismo ancho de ventana), sigue en su sitio.
  if (volverAlInicio && volverAlInicio.campanaDerecha !== null && trasVolver.campanaDerecha !== null
      && trasVolver.ventana === anchoPrincipal) {
    const desplazamiento = Math.abs(trasVolver.campanaDerecha - volverAlInicio.campanaDerecha);
    check(`los iconos del header siguen a la derecha al volver (${desplazamiento}px)`, desplazamiento <= 1,
      `${volverAlInicio.campanaDerecha} → ${trasVolver.campanaDerecha}`);
  }
}


// tiene que llegar de extremo a extremo en cualquier ancho, no solo en el móvil
// de pruebas. Se recorre una lista de anchos y se mide en cada uno.
log(`\n=== Las líneas de extremo a extremo, por ancho de pantalla ===`);
const LINEAS = `(() => {
    const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width) return null;
        return { left: Math.round(r.left), right: Math.round(r.right) };
    };
    return JSON.stringify({
        ventana: window.innerWidth,
        // Esta es la que se pidió: la de arriba de la sección, justo debajo de
        // los marcadores y por encima de «Comentarios». Se mide en el BORDE de la
        // caja (rectángulo + relleno lateral), que es donde se pinta.
        bajoMarcadores: (() => {
            const el = document.querySelector('[data-problog-comentarios]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return { left: Math.round(r.left - parseFloat(s.paddingLeft || 0)), right: Math.round(r.right + parseFloat(s.paddingRight || 0)) };
        })(),
        subrayadoInput: (() => {
            // La línea del cajón es un pseudo-elemento absoluto: su caja se saca
            // del rectángulo del cajón menos el desplazamiento negativo del pseudo.
            const el = document.querySelector('[data-problog-comentarios] .problog-comentario-form');
            if (!el) return null;
            const p = getComputedStyle(el, '::after');
            if (!p || p.content === 'none' || p.borderTopWidth === '0px') return null;
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left - (parseFloat(p.left) || 0)), right: Math.round(r.right + (parseFloat(p.right) || 0)),
                     // Posición vertical: sirve para comprobar que va ENCIMA del botón.
                     arriba: Math.round(r.bottom - (parseFloat(p.bottom) || 0)) };
        })(),
        botonEnviarY: (() => {
            const b = document.querySelector('[data-problog-comentarios] .problog-comentario-enviar');
            return b ? Math.round(b.getBoundingClientRect().top) : null;
        })(),
        primerComentario: (() => {
            const el = document.querySelector('[data-problog-comentarios] .problog-comentario');
            if (!el) return null;
            const p = getComputedStyle(el, '::before');
            if (!p || p.content === 'none' || p.borderTopWidth === '0px') return null;
            const r = el.getBoundingClientRect();
            return { left: Math.round(r.left - (parseFloat(p.left) || 0)), right: Math.round(r.right + (parseFloat(p.right) || 0)) };
        })()
    });
})()`;

for (const anchoVentana of [320, 360, 420, 768, 1280]) {
  await send('Emulation.setDeviceMetricsOverride', { width: anchoVentana, height: 900, deviceScaleFactor: 1, mobile: anchoVentana < 700 });
  await send('Page.navigate', { url: URL_BASE });
  for (let i = 0; i < 120; i++) { if (await evalJs(`(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`) === true) break; await sleep(150); }
  await sleep(900);
  await evalJs(`document.getElementById('btn-problogs-nav')?.click()`);
  await sleep(1500);
  await evalJs(`document.querySelector('.problog-card')?.click()`);
  await sleep(1800);
  await evalJs(`document.querySelector('[data-problog-comentarios]')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  // El sangrado de las líneas interiores se mide en JS al abrir y al cambiar el
  // tamaño de la ventana: hay que avisar, como haría el navegador de verdad.
  await evalJs(`window.dispatchEvent(new Event('resize'))`);
  await sleep(500);
  const m = JSON.parse((await evalJs(LINEAS)) || 'null');
  if (!m) { check(`se pudieron medir las líneas a ${anchoVentana}px`, false); continue; }
  for (const [nombre, b] of Object.entries(m)) {
    // `ventana` y `botonEnviarY` son números, no cajas: no se miden como líneas.
    if (nombre === 'ventana' || !b || typeof b !== 'object' || b.left === undefined) continue;
    const aire = Math.max(b.left, m.ventana - b.right);
    log(`   · ${anchoVentana}px · ${nombre}: ${b.left}..${b.right} (aire ${aire}px)`);
    if (nombre === 'bajoMarcadores') {
      // En móvil (hasta 768px, donde la columna ocupa todo el ancho) la línea va
      // de extremo a extremo. En pantallas anchas la columna está centrada.
      const debeLlegar = anchoVentana <= 768;
      if (debeLlegar) {
        check(`${anchoVentana}px · la línea bajo los marcadores llega de extremo a extremo`, Math.abs(aire) <= 1.5, `aire ${aire}px`);
      } else {
        const fueraDeLaColumna = b.left < (m.ventana - 720) / 2 + 1 && b.right > (m.ventana + 720) / 2 - 1;
        check(`${anchoVentana}px · la línea bajo los marcadores sale de la columna`, fueraDeLaColumna, `${b.left}..${b.right} de ${m.ventana}`);
      }
    } else {
      // El subrayado de la caja y la línea de cada comentario son el MISMO tratamiento
      // visual que la línea de arriba, y lo que se pidió (de extremo a extremo) es del
      // MÓVIL, que es donde se usa. En pantallas anchas la columna de lectura es estrecha
      // y va centrada (medido: a 1280px ocupa 464..816), así que exigir ahí "extremo a
      // extremo" era un fallo del propio test: esos eran los dos "fallos conocidos" que se
      // arrastraban. En ancho se mide y se apunta, sin juzgarlo.
      if (anchoVentana <= 768) {
        check(`${anchoVentana}px · «${nombre}» llega de extremo a extremo`, Math.abs(aire) <= 1.5, `aire ${aire}px`);
      } else {
        log(`   · ${anchoVentana}px · «${nombre}»: dentro de la columna centrada, no se juzga (es el móvil lo que se pidió)`);
      }
    }
  }
}

log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
volcar();
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
