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
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/comentarios')) return json({ comentarios: [] });
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
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1200);
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
await sleep(1600);
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
await sleep(1200);
let capa = await evalJs(`!!document.getElementById('problog-vista-previa-capa')`);
let fondo = await fondoBloqueado();
check('la capa de vista previa se retira al navegar', capa === false);
check('el fondo queda libre (html/body/#galeria-container)', fondo.html !== 'hidden' && fondo.body !== 'hidden' && fondo.galeria !== 'hidden', JSON.stringify(fondo));

// --- 2) Vista previa + Chat (camino que NO pasa por switchSection) --------
console.log('\n=== 2) Vista previa + abrir el Chat (abrirChat no pasa por switchSection) ===');
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1600);
await evalJs(`(() => {
      document.getElementById('tab-problogs')?.click();
      const c = document.getElementById('problog-contenido'); if (c) c.value = 'Texto de prueba 2';
      document.getElementById('problog-vista-previa')?.click();
  })()`);
await sleep(400);
await evalJs(`document.getElementById('btn-chat-global')?.click()`);
await sleep(1400);
capa = await evalJs(`!!document.getElementById('problog-vista-previa-capa')`);
fondo = await fondoBloqueado();
check('la vista previa se cierra al abrir el Chat', capa === false);
check('el fondo queda libre tras abrir el Chat', fondo.html !== 'hidden' && fondo.body !== 'hidden', JSON.stringify(fondo));
await evalJs(`document.getElementById('chat-cerrar')?.click()`);
await sleep(600);

// --- 3) Cajón de comentarios + navegación --------------------------------
console.log('\n=== 3) Cajón de comentarios + navegar ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(2000);
const abrioCajon = await evalJs(`(() => { const m = document.querySelector('.metrica-comentario'); if (!m) return false; m.click(); return true; })()`);
await sleep(1200);
if (!abrioCajon) {
  check('el cajón de comentarios se pudo abrir (necesario para la prueba)', false, 'no hay tarjeta con métrica de comentario');
} else {
  const abierto = JSON.parse(await evalJs(`JSON.stringify({
      visible: document.getElementById('comentarios-drawer')?.classList.contains('visible') || false,
      html: document.documentElement.style.overflow || ''
  })`));
  check('el cajón está abierto y bloquea el fondo (estado de partida)', abierto.visible && abierto.html === 'hidden', JSON.stringify(abierto));
  await evalJs(`document.getElementById('btn-buscar')?.click()`);
  await sleep(1300);
  const tras = JSON.parse(await evalJs(`JSON.stringify({
      visible: document.getElementById('comentarios-drawer')?.classList.contains('visible') || false,
      enPantalla: (() => { const d = document.getElementById('comentarios-drawer'); if (!d) return false; const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(d).display !== 'none'; })(),
      html: document.documentElement.style.overflow || '',
      body: document.body.style.overflow || ''
  })`));
  check('el cajón se cierra al navegar', !tras.visible && !tras.enPantalla, JSON.stringify(tras));
  check('el fondo queda libre tras cerrar el cajón', tras.html !== 'hidden' && tras.body !== 'hidden', JSON.stringify(tras));
}

// --- 4) Modal de descripción (lupa) + botón "+" (crear) ------------------
console.log('\n=== 4) Modal de descripción de un Cavent + pulsar "+" (crear) ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(2000);
const abrioModal = await evalJs(`(() => { const b = document.querySelector('.btn-detalles-toggle'); if (!b) return false; b.click(); return true; })()`);
await sleep(900);
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
  await sleep(1300);
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
