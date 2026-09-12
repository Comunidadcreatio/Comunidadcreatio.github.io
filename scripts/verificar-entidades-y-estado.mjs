// Verifica el arreglo del grupo 5:
//
//  CAV-9  El backend guarda los textos con .escape() (validator: "/"→"&#x2F;",
//         "'"→"&#x27;", "\\"→"&#x5C;", "`"→"&#x60;"). El frontend decodificaba
//         una lista incompleta y el TÍTULO no se decodificaba al editar, así que
//         se veía la entidad y al volver a guardar se re-escapaba el "&":
//         el título se corrompía un poco más en cada edición.
//  PRO-3  El selector de estado se quitó de la interfaz, pero guardar() seguía
//         mandando siempre 'publicado': abrir un borrador y guardar lo publicaba.
//
// Uso: node scripts/verificar-entidades-y-estado.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9306;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const TITULO_GUARDADO = 'Retrato &#x2F; Estudio de &#x27;prueba&#x27;';
const TITULO_REAL = "Retrato / Estudio de 'prueba'";
const MARCOS_GUARDADO = 'Sin enmarcar (solo lienzo&#x2F;bastidor)';
const MARCOS_REAL = 'Sin enmarcar (solo lienzo/bastidor)';
const DESCRIPCION_GUARDADA = 'Obra d&#x27;artista con &#x5C; y &#x60;';
const DESCRIPCION_REAL = "Obra d'artista con \\ y `";

// Replica el .escape() de validator 13.x, para comprobar que lo que se envía
// vuelve a producir EXACTAMENTE el valor guardado (sin acumular escapes).
const escapeBackend = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\//g, '&#x2F;')
  .replace(/\\/g, '&#x5C;').replace(/`/g, '&#96;');

const profileDir = mkdtempSync(join(tmpdir(), 'verif-ent-'));
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
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#3366cc');
      // Valores tal y como los devuelve el backend (escapados).
      const obra = {
          id: 1, titulo: ${JSON.stringify(TITULO_GUARDADO)}, artista: 'T', artista_user_id: 480001,
          imagen_url: img45, imagen_url_1: null, imagen_url_2: null, imagen_url_3: null, imagen_url_4: null,
          etiquetas: 'Oleo, Prueba', ano: 2024, ancho: 80, alto: 100,
          descripcion_tecnica: 'Oleo', descripcion_artistica: ${JSON.stringify(DESCRIPCION_GUARDADA)},
          soporte: 'Lienzo', marcos: ${JSON.stringify(MARCOS_GUARDADO)}, procedencia: '-', certificado: '-',
          firma: '-', conservacion: 'Buena', status: 'Activo (Visible en Galería)',
          estado_obra: 'Disponible (en venta)', precio: '100', foto_artista: '',
          likes_count: 0, views_count: 0, comments_count: 0
      };
      const borrador = {
          id: 30001, titulo: 'Borrador guardado', etiquetas: 'arte', estado: 'borrador',
          created_at: new Date().toISOString(),
          bloques: [{ tipo: 'texto', contenido: 'Texto del borrador que quiero seguir editando.' }],
          imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
          portada_slot: null, nombre_artista: 'T', foto_artista: '',
          likes_count: 0, comentarios_count: 0, reblogs_count: 0, liked: false, reblogged: false
      };
      window.__enviados = [];
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          // Escrituras: se registra TODO lo que se envía (FormData) y se responde ok.
          if (method === 'PUT' || method === 'POST') {
              const body = init && init.body;
              const registro = { method: method, url: u.replace('https://backend-fundacion-atpe.onrender.com', '') };
              if (body && body.get) {
                  for (const k of Array.from(body.keys())) {
                      if (k.startsWith('imagen_')) { const f = body.get(k); registro[k] = f && f.name ? f.name : 'archivo'; }
                      else registro[k] = body.get(k);
                  }
              }
              window.__enviados.push(registro);
              return json({ success: true, id: 30002, message: 'ok' });
          }
          if (u.includes('/problogs/30001')) return json(borrador);
          if (u.includes('/api/artistas/mis-problogs') || u.includes('/api/artistas/mis-reblogs')) return json({ success: true, problogs: [borrador], total: 1 });
          if (u.includes('/problogs')) return json({ success: true, problogs: [borrador], total: 1, page: 1, limit: 10 });
          if (u.includes('/api/artistas/mis-obras')) return json({ success: true, obras: [obra], total: 1 });
          if (u.includes('/obras/1')) return json(obra);
          if (u.includes('/obras')) return json([obra]);
          if (u.includes('heartbeat')) return json({ ok: true });
          if (u.includes('mis-reacciones')) return json({ reacciones: [] });
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
// CAV-9 — entidades HTML
// ============================================================
console.log('=== CAV-9: textos guardados con entidades ===');
// 1) Tarjeta de la galería
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(2500);
const tarjeta = JSON.parse(await evalJs(`(() => {
    const t = document.querySelector('.obra-titulo-marquee .marquee-text') || document.querySelector('.obra-grid-titulo');
    const m = document.querySelector('.obra-meta-marcos');
    return JSON.stringify({ titulo: t ? t.textContent.trim() : '(sin tarjeta)', marcos: m ? m.textContent.trim() : '(sin franja)' });
})()`));
console.log('   ' + JSON.stringify(tarjeta));
check('la tarjeta muestra el título sin entidades', tarjeta.titulo === TITULO_REAL, tarjeta.titulo);
// La franja muestra solo la parte fuera del paréntesis ("Sin enmarcar"): lo que
// se comprueba es que no quede ninguna entidad a la vista.
check('la franja de marcos no muestra entidades', !/&#/.test(tarjeta.marcos) && tarjeta.marcos === 'Sin enmarcar', tarjeta.marcos);

// 2) Modal de descripción (textContent no interpreta entidades: hay que decodificar)
const abrioModal = await evalJs(`(() => { const b = document.querySelector('.btn-detalles-toggle'); if (!b) return false; b.click(); return true; })()`);
if (abrioModal) {
  await sleep(1200);
  const desc = await evalJs(`document.getElementById('detalle-descripcion').textContent`);
  check('la descripción del modal muestra el texto real', desc === DESCRIPCION_REAL, JSON.stringify(desc));
  await evalJs(`document.querySelector('.btn-detalles-toggle')?.click()`);
  await sleep(300);
}

// 3) Editar: el campo Título debe venir decodificado (antes no) y al guardar debe
//    enviarse el texto real, de modo que el backend lo re-escape UNA sola vez.
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(1200);
const hayEdit = await evalJs(`!!document.querySelector('.cavent-item .btn-edit')`);
check('la lista de Mis Cavents está disponible', hayEdit === true);
await evalJs(`document.querySelector('.cavent-item .btn-edit')?.click()`);
await sleep(1500);
const tituloCampo = await evalJs(`document.getElementById('input-titulo').value`);
check('el campo Título se rellena con el texto real (sin entidades)', tituloCampo === TITULO_REAL, JSON.stringify(tituloCampo));
const marcosCampo = await evalJs(`document.getElementById('input-marcos').value`);
check('el campo Marcos también', marcosCampo === MARCOS_REAL, JSON.stringify(marcosCampo));
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(2500);
const guardadas = await enviados();
const put = guardadas.filter(e => e.method === 'PUT').pop();
check('se envió la actualización de la obra', !!put, JSON.stringify(guardadas));
check('el título enviado es el texto real', put && put.titulo === TITULO_REAL, JSON.stringify(put && put.titulo));
check('no se acumula el escape (volver a escaparlo da el valor guardado)',
  !!put && escapeBackend(put.titulo) === TITULO_GUARDADO,
  put ? `${escapeBackend(put.titulo)} vs ${TITULO_GUARDADO}` : 'sin PUT');
check('los marcos enviados son el texto real', put && put.marcos === MARCOS_REAL, JSON.stringify(put && put.marcos));

// ============================================================
// PRO-3 — el borrador no se publica al editarlo
// ============================================================
console.log('\n=== PRO-3: estado al crear y al editar ===');
// 3a) CREAR: sin selector de estado debe enviarse 'publicado'
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(800);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1600);
await evalJs(`(() => {
    document.getElementById('tab-problogs')?.click();
    document.getElementById('problog-titulo').value = 'Publicacion nueva';
    document.getElementById('problog-contenido').value = 'Contenido de la publicacion nueva.';
})()`);
await sleep(400);
await evalJs(`document.getElementById('problog-nav-publicar')?.click()`);
await sleep(2000);
let todos = await enviados();
let creado = todos.filter(e => e.method === 'POST' && e.url === '/problogs').pop();
check('al crear se envía estado="publicado"', creado && creado.estado === 'publicado', JSON.stringify(creado && creado.estado));

// 3b) EDITAR un borrador: debe conservar 'borrador'
await evalJs(`(() => {
    const cont = document.getElementById('problogs-feed');
    const b = document.createElement('button');
    b.setAttribute('data-problog-editar', '30001');
    cont.appendChild(b);
    b.click();
})()`);
await sleep(2200);
const enEdicion = JSON.parse(await evalJs(`JSON.stringify({
    titulo: document.getElementById('problog-titulo').value,
    contenido: document.getElementById('problog-contenido').value.slice(0, 30),
    boton: document.getElementById('problog-nav-publicar').textContent.trim()
})`));
console.log('   ' + JSON.stringify(enEdicion));
check('el borrador se abrió para editar', enEdicion.boton.includes('Guardar cambios'), JSON.stringify(enEdicion));
await evalJs(`document.getElementById('problog-nav-publicar')?.click()`);
await sleep(2500);
todos = await enviados();
const editado = todos.filter(e => e.method === 'PUT' && e.url === '/problogs/30001').pop();
check('se envió la actualización del borrador', !!editado, JSON.stringify(todos.map(t => t.method + ' ' + t.url)));
check('el borrador sigue siendo borrador (no se publica solo)',
  editado && editado.estado === 'borrador', JSON.stringify(editado && editado.estado));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
