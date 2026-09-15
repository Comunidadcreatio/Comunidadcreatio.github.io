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
      const publicacion = { id: 31001, titulo: 'Proceso de la obra', etiquetas: 'arte', estado: 'publicado',
          created_at: new Date(ahora - 3600000).toISOString(),
          bloques: [{ tipo: 'texto', contenido: 'Texto del cuerpo de la publicacion.' }],
          imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
          portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 3, comentarios_count: 3,
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

await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1200);
await evalJs(`document.getElementById('btn-problogs')?.click()`);
await sleep(1800);
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
    const cs = (el) => el ? getComputedStyle(el) : null;
    const dato = (nombre, el) => {
        if (!el) return { nombre, falta: true };
        const s = cs(el);
        const lados = {
            arriba: s.borderTopWidth + ' ' + s.borderTopColor,
            abajo: s.borderBottomWidth + ' ' + s.borderBottomColor,
            izquierda: s.borderLeftWidth + ' ' + s.borderLeftColor
        };
        const gruesos = [s.borderTopWidth, s.borderBottomWidth, s.borderLeftWidth];
        return { nombre, fondo: s.backgroundColor, color: s.color, lados,
                 ladosConLinea: gruesos.map((w, i) => (w === '1px' ? ['arriba', 'abajo', 'izquierda'][i] : null)).filter(Boolean) };
    };
    const r = sec.getBoundingClientRect();
    return JSON.stringify({
        rectSeccion: { left: r.left, top: r.top, width: r.width, height: r.height },
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
const transparente = (c) => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || c === 'rgba(255, 255, 255, 0)';

for (const tema of ['dark', 'light']) {
  log(`\n=== Tema ${tema.toUpperCase()} ===`);
  // La sección tiene que estar dentro de la ventana: si no, sus coordenadas caen
  // fuera de la captura y el fondo saldría null (una medida a ciegas).
  await evalJs(`document.documentElement.setAttribute('data-theme', '${tema}')`);
  await evalJs(`document.querySelector('[data-problog-comentarios]')?.scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(500);
  await apartarRaton();

  const d = JSON.parse(await evalJs(MEDIR(tema)));
  if (d.error) { check('la sección de comentarios existe', false, JSON.stringify(d)); continue; }
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

  // 4) Todo repartido por líneas finas de 1px.
  check('la cabecera se cierra con una línea de 1px abajo',
    caja('cabecera (titulo + contador)').lados?.abajo?.startsWith('1px'), caja('cabecera (titulo + contador)').lados?.abajo);
  check('el cajón de escribir lleva línea de 1px arriba y abajo',
    caja('cajon de escribir (form)').lados?.arriba?.startsWith('1px') && caja('cajon de escribir (form)').lados?.abajo?.startsWith('1px'),
    JSON.stringify(caja('cajon de escribir (form)').lados));
  check('el PRIMER comentario lleva línea de 1px arriba',
    caja('primer comentario').lados?.arriba?.startsWith('1px'), caja('primer comentario').lados?.arriba);
  check('la guía de las respuestas es una línea de 1px a la izquierda',
    caja('guia de respuestas').lados?.izquierda?.startsWith('1px'), caja('guia de respuestas').lados?.izquierda);
}

log(`\nEXCEPCIONES: ${logs.length ? logs.join(' | ') : 'ninguna'}`);
if (logs.length) fallos++;
log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
volcar();
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
