// Verifica el ARREGLO de las capas flotantes que sobrevivían a la navegación
// (grupo 1 del informe de bugs): vista previa de Problogs, cajón de comentarios
// y modal de descripción de Cavents.
//
// Antes (bug): al navegar con una capa abierta, la capa seguía encima de la
// sección nueva y el fondo quedaba con overflow:hidden (la app parecía trabada).
// Ahora: switchSection/abrirChat/ocultarTodasLasSecciones/mostrarResultadosBusqueda
// cierran todas las capas registradas en js/overlays.js.
//
// Uso: node scripts/verificar-overlays-navegacion.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9301;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-ovl-'));
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
  if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || '').slice(0, 200)); return null; }
  return r.result?.result?.value;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#cc3344');
      const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Oleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '-', certificado: '-', firma: '-', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
      const realFetch = window.fetch.bind(window);
      // FUERA del wrapper, no dentro: si se declara dentro del bloque, se reinicia en CADA peticion y el
      // contador nunca sube (paso, y la comprobacion del numero lo destapo).
      let likes900 = 3;
      // Y las peticiones que hace la app, para poder diagnosticar desde la comprobacion.
      window.__pedidas = [];
      window.fetch = async (input, init) => {
          const u = String(input);
          window.__pedidas.push(u.split('onrender.com')[1] || u);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              // UN comentario de verdad, no la lista vacia: con una lista vacia el cajon se abre sin nada, no hay
        // boton de «me gusta» que mirar y por eso nadie habia visto que pintaba simbolos raros en vez del
        // corazon (js/comentarios.js tenia el caracter corrupto: una "a" con tilde, un simbolo de marca y un
        // yen, en vez de un corazon).
        // El «me gusta» de un comentario: la app lee los campos liked y likes_count de la respuesta. Va
        // ANTES de la rama de /comentarios, porque su URL tambien contiene /comentarios.
        if (u.includes('/like')) { likes900 = likes900 + 1; return json({ success: true, liked: true, likes_count: likes900 }); }
        if (u.includes('/comentarios')) return json({ comentarios: [{ id: 900, autor_nombre: 'Ana', autor_foto: '', texto: 'Un comentario de prueba', created_at: new Date().toISOString(), likes_count: likes900, comentario_padre_id: null }] });
              if (u.includes('/problogs')) return json({ success: true, publicaciones: [], total: 0 });
              if (u.includes('/obras')) return json(obrasMock);
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: URL_BASE });
// ESPERA A QUE LA APP ESTE LISTA, no solo a que exista un elemento. La condicion vieja ("existe
// #toggle-panel y no esta hidden") se cumple DETRAS del preloader: la app todavia no responde, y los clics
// (que aqui son programaticos y se saltan el hit-testing) se colaban en ese hueco. Por eso habia despues un
// `sleep` de asentamiento: tapaba esta carrera. Ahora se espera a lo que de verdad hace falta: panel
// visible + preloader retirado + contenedor con .visible (la senal que pone la app al terminar de arrancar).
for (let i = 0; i < 120; i++) { if (await evalJs(`(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`) === true) break; await sleep(150); }
// Ir a la galería (necesaria para tarjetas y para la lupa)
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(2000);

// --- utilidades de comprobación -------------------------------------------
let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) { console.log(`  PASS  ${nombre}`); }
  else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}
// ESPERA A QUE LA APP SE ASIENTE. Sustituye a los `sleep` que iban despues de una accion (un clic, un
// submit, un cambio de metricas): en vez de un tiempo a ojo, se espera a que el DOM deje de cambiar.
//   - MINIMO 350 ms: una comprobacion NEGATIVA no cambia nada, asi que "estable" seria cierto al instante y
//     se mediria antes de que la app hubiera podido reaccionar.
//   - MAXIMO 2,5 s: si algo se queda cambiando (una animacion larga), no se espera para siempre.
async function asentar(minimoMs = 350, maximoMs = 2500) {
    const firma = () => evalJs(`(() => {
        const clases = [];
        for (const el of document.body.children) {
            if (el.className && typeof el.className === 'string') clases.push(el.id + ':' + el.className);
        }
        return clases.join('|') + '#' + document.querySelectorAll('*').length + '#' + document.querySelectorAll('.hidden').length;
    })()`);
    const t0 = Date.now();
    let anterior = '';
    await sleep(minimoMs);
    while (Date.now() - t0 < maximoMs) {
        const ahora = await firma();
        if (typeof ahora === 'string' && ahora && ahora === anterior) return true;
        anterior = typeof ahora === 'string' ? ahora : '';
        await sleep(120);
    }
    return false;
}

const fondoBloqueado = async () => JSON.parse(await evalJs(`JSON.stringify({
    html: document.documentElement.style.overflow || '',
    body: document.body.style.overflow || '',
    galeria: (document.getElementById('galeria-container')||{}).style?.overflow || '',
    touchmoveCancelado: (() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()
})`));

// --- 1) Vista previa + navegación por el nav inferior ---------------------
console.log('\n=== 1) Vista previa de Problogs + navegar con el nav (Cavents) ===');
// Flujo real: "+" del header abre el panel de creación (switchSection).
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await asentar();
console.log('   ' + await evalJs(`(() => {
      document.getElementById('tab-problogs')?.click();
      const t = document.getElementById('problog-titulo'); if (t) t.value = 'Prueba';
      const c = document.getElementById('problog-contenido'); if (c) c.value = 'Texto de prueba';
      document.getElementById('problog-vista-previa')?.click();
      return JSON.stringify({ capa: !!document.getElementById('problog-vista-previa-capa'), panelVisible: !document.getElementById('panel-artista').classList.contains('hidden') });
  })()`));
await sleep(400);
check('la vista previa queda abierta y el fondo bloqueado (estado de partida)',
  (await fondoBloqueado()).html === 'hidden' || (await evalJs(`!!document.getElementById('problog-vista-previa-capa')`)));
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await asentar();
let capa = await evalJs(`!!document.getElementById('problog-vista-previa-capa')`);
let fondo = await fondoBloqueado();
check('la capa de vista previa se retira al navegar', capa === false);
check('el fondo queda libre (html/body/#galeria-container)', fondo.html !== 'hidden' && fondo.body !== 'hidden' && fondo.galeria !== 'hidden', JSON.stringify(fondo));

// --- 2) Vista previa + Chat (camino que NO pasa por switchSection) --------
console.log('\n=== 2) Vista previa + abrir el Chat (abrirChat no pasa por switchSection) ===');
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await asentar();
await evalJs(`(() => {
      document.getElementById('tab-problogs')?.click();
      const c = document.getElementById('problog-contenido'); if (c) c.value = 'Texto de prueba 2';
      document.getElementById('problog-vista-previa')?.click();
  })()`);
await sleep(400);
await evalJs(`document.getElementById('btn-chat-global')?.click()`);
await asentar();
capa = await evalJs(`!!document.getElementById('problog-vista-previa-capa')`);
fondo = await fondoBloqueado();
check('la vista previa se cierra al abrir el Chat', capa === false);
check('el fondo queda libre tras abrir el Chat', fondo.html !== 'hidden' && fondo.body !== 'hidden', JSON.stringify(fondo));
await evalJs(`document.getElementById('chat-cerrar')?.click()`);
await asentar();

// --- 3) Cajón de comentarios + navegación --------------------------------
console.log('\n=== 3) Cajón de comentarios + navegar ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await asentar();
const abrioCajon = await evalJs(`(() => { const m = document.querySelector('.metrica-comentario'); if (!m) return false; m.click(); return true; })()`);
await asentar();
if (!abrioCajon) {
  check('el cajón de comentarios se pudo abrir (necesario para la prueba)', false, 'no hay tarjeta con métrica de comentario');
} else {
  const abierto = JSON.parse(await evalJs(`JSON.stringify({
      visible: document.getElementById('comentarios-drawer')?.classList.contains('visible') || false,
      html: document.documentElement.style.overflow || ''
  })`));
  check('el cajón está abierto y bloquea el fondo (estado de partida)', abierto.visible && abierto.html === 'hidden', JSON.stringify(abierto));
  // Y LO QUE VE EL USUARIO EN EL CAJÓN: el botón de «me gusta» tiene que pintar un CORAZÓN, no símbolos.
  // Nació de un aviso real («aparecen símbolos extraños en vez del corazón»): el fichero tenía el carácter
  // corrupto por un UTF-8 releído como Windows-1252, y el HTML era válido, así que ninguna prueba de
  // comportamiento lo veía. Esto lo mira PINTADO, que es donde se nota.
  const glifos = JSON.parse(await evalJs(`JSON.stringify({
      like: (document.querySelector('.comentario-btn-like') || {}).textContent || '',
      enviar: (document.querySelector('.comentario-reply-send') || {}).textContent || '',
      hayLike: !!document.querySelector('.comentario-btn-like'),
      haySvg: !!document.querySelector('.comentario-btn-like .comentario-corazon svg')
  })`));
  check('el cajón pinta un comentario con su botón de me gusta', glifos.hayLike === true, glifos.like.trim());
  // El corazón es un SVG (no un carácter de la fuente: el glifo cambiaba de forma según el dispositivo). Y
  // sigue sin poder aparecer mojibake, que es el aviso que originó todo esto.
  check('el botón de me gusta pinta su CORAZÓN como icono (SVG) y sin símbolos', glifos.haySvg === true && !glifos.like.includes('â') && !glifos.enviar.includes('â'), `svg=${glifos.haySvg} texto=${JSON.stringify(glifos.like.trim())}`);
  check('el botón de enviar de una respuesta pinta su flecha y no símbolos', glifos.enviar.includes('➤') && !glifos.enviar.includes('â'), JSON.stringify(glifos.enviar.trim()));
  // Y EL FALLO QUE REPORTÓ EL USUARIO: el «me gusta» se veía rojo, pero al cerrar el cajón y volver a
  // abrirlo el rojo se perdía. La causa medida: la API de los comentarios de OBRA no devuelve `liked` (la de
  // Problogs sí), así que al repintar no había forma de saber que YA estaba marcado.
  await evalJs(`document.querySelector('.comentario-btn-like')?.click()`);
  await sleep(1000);
  const trasLike = JSON.parse(await evalJs(`JSON.stringify({
      liked: !!document.querySelector('.comentario-btn-like.liked'),
      cuenta: (document.querySelector('.comentario-likes-count') || {}).textContent || ''
  })`));
  check('al pulsar «me gusta» el corazón se marca y sube el contador', trasLike.liked === true && trasLike.cuenta === '4', JSON.stringify(trasLike));
  await evalJs(`document.getElementById('btn-buscar')?.click()`);
  // El cajón se cierra con una TRANSICIÓN y la app lo deja en `display: none` al terminar. El asentamiento
  // genérico se queda corto: el DOM "se asienta" en cuanto desaparece la clase `visible`, pero el cajón
  // sigue teniendo caja mientras se desliza (por eso esta comprobación fallaba de forma INTERMITENTE).
  for (let i = 0; i < 30; i++) {
      const fuera = await evalJs(`(() => {
          const d = document.getElementById('comentarios-drawer');
          if (!d) return true;
          const r = d.getBoundingClientRect();
          return getComputedStyle(d).display === 'none' || r.width === 0 || r.height === 0;
      })()`);
      if (fuera === true) break;
      await sleep(100);
  }
  const tras = JSON.parse(await evalJs(`JSON.stringify({
      visible: document.getElementById('comentarios-drawer')?.classList.contains('visible') || false,
      enPantalla: (() => { const d = document.getElementById('comentarios-drawer'); if (!d) return false; const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(d).display !== 'none'; })(),
      html: document.documentElement.style.overflow || '',
      body: document.body.style.overflow || ''
  })`));
  check('el cajón se cierra al navegar', !tras.visible && !tras.enPantalla, JSON.stringify(tras));
  check('el fondo queda libre tras cerrar el cajón', tras.html !== 'hidden' && tras.body !== 'hidden', JSON.stringify(tras));

  // Y AL VOLVER A ABRIRLO, el corazón tiene que seguir marcado: es exactamente lo que fallaba.
  for (let intento = 0; intento < 8; intento++) {
      await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
      await sleep(900);
      await evalJs(`document.querySelector('.metrica-comentario')?.click()`);
      await sleep(900);
      if (await evalJs(`!!document.querySelector('.comentario-btn-like')`) === true) break;
  }
  const trasReabrir = JSON.parse(await evalJs(`JSON.stringify({
      liked: !!document.querySelector('.comentario-btn-like.liked'),
      relleno: (() => { const s = document.querySelector('.comentario-btn-like .comentario-corazon svg'); return s ? s.getAttribute('fill') : null; })(),
      cuenta: (document.querySelector('.comentario-likes-count') || {}).textContent || ''
  })`));
  check('al CERRAR y REABRIR el cajón, el corazón sigue marcado (y el contador sigue subido)', trasReabrir.liked === true && trasReabrir.cuenta === '4', JSON.stringify(trasReabrir));
  check('y el corazón sigue relleno al reabrir (no solo la clase)', trasReabrir.relleno !== 'none' && trasReabrir.relleno !== null, `fill=${trasReabrir.relleno}`);
}

// --- 4) Modal de descripción (lupa) + botón "+" (crear) ------------------
console.log('\n=== 4) Modal de descripción de un Cavent + pulsar "+" (crear) ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await asentar();
const abrioModal = await evalJs(`(() => { const b = document.querySelector('.btn-detalles-toggle'); if (!b) return false; b.click(); return true; })()`);
await asentar();
if (!abrioModal) {
  check('el modal de descripción se pudo abrir (necesario para la prueba)', false, 'no hay tarjeta con botón de detalles');
} else {
  const antes = JSON.parse(await evalJs(`JSON.stringify({
      abierto: !document.getElementById('modal-detalles-cavent').classList.contains('hidden')
  })`));
  const fondoAntes = await fondoBloqueado();
  check('el modal está abierto y bloquea el fondo + el gesto (estado de partida)',
    antes.abierto && fondoAntes.html === 'hidden' && fondoAntes.touchmoveCancelado === true, JSON.stringify({ ...antes, ...fondoAntes }));
  await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
  await asentar();
  const despues = JSON.parse(await evalJs(`JSON.stringify({
      modalOculto: document.getElementById('modal-detalles-cavent').classList.contains('hidden'),
      panelVisible: !document.getElementById('panel-artista').classList.contains('hidden')
  })`));
  const fondoDespues = await fondoBloqueado();
  check('el modal se cierra al entrar a crear', despues.modalOculto, JSON.stringify(despues));
  check('el panel de creación quedó abierto (la navegación funciona)', despues.panelVisible, JSON.stringify(despues));
  check('el editor de creación puede scrollear (fondo libre y gesto no cancelado)',
    fondoDespues.html !== 'hidden' && fondoDespues.body !== 'hidden' && fondoDespues.touchmoveCancelado === false, JSON.stringify(fondoDespues));
}

// --- 5) Regresión: cerrar con el propio ✕ sigue funcionando --------------
console.log('\n=== 5) Regresión: la vista previa se sigue cerrando con su ✕ ===');
await evalJs(`(() => {
      document.getElementById('tab-problogs')?.click();
      const c = document.getElementById('problog-contenido'); if (c) c.value = 'Texto de prueba 3';
      document.getElementById('problog-vista-previa')?.click();
  })()`);
await sleep(400);
const abiertaOtraVez = await evalJs(`!!document.getElementById('problog-vista-previa-capa')`);
await evalJs(`document.querySelector('[data-cerrar-vista-previa]')?.click()`);
await sleep(400);
const cerradaConEquis = await evalJs(`!document.getElementById('problog-vista-previa-capa')`);
fondo = await fondoBloqueado();
check('la vista previa se abre de nuevo', abiertaOtraVez === true);
check('se cierra con su propio ✕', cerradaConEquis === true);
check('el fondo queda libre al cerrarla con ✕', fondo.html !== 'hidden' && fondo.body !== 'hidden', JSON.stringify(fondo));

// --- resultado ------------------------------------------------------------
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
