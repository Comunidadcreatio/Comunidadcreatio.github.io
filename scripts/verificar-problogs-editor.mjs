// Verifica el arreglo del grupo 4 (Altos de Problogs):
//
//  PRO-1  Al abrir una publicación para editarla, el texto quedaba cortado:
//         cargarParaEditar() rellena el contenido y mide ANTES de abrir el
//         panel, y con el panel oculto scrollHeight = 0, así que el marco se
//         quedaba en el mínimo (260px) con overflow:hidden hasta que el autor
//         escribía algo.
//  PRO-2  Entrar en la pestaña Problogs borraba el título y las etiquetas ya
//         escritos si el CONTENIDO estaba vacío (solo miraba el contenido).
//
// Uso: node scripts/verificar-problogs-editor.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9304;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-pb-'));
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

const MOCK = `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      // Publicación larga (30 líneas): con el bug el marco se quedaba en 260px.
      const texto = Array.from({ length: 30 }, (_, i) => 'Linea ' + (i + 1) + ' del proceso creativo de la obra.').join('\\n');
      const publicacion = {
          id: 30001, titulo: 'Proceso de la obra', etiquetas: 'arte, proceso',
          estado: 'publicado', created_at: new Date().toISOString(),
          bloques: [{ tipo: 'texto', contenido: texto }],
          imagenes: [null, null, null, null, null, null, null, null],
          miniaturas: [null, null, null, null, null, null, null, null],
          portada_slot: null, nombre_artista: 'T', foto_artista: '',
          likes_count: 0, comentarios_count: 0, reblogs_count: 0, liked: false, reblogged: false
      };
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.__texto = texto;
      window.fetch = async (input, init) => {
          const u = String(input);
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          if (u.includes('/problogs/30001')) return json(publicacion);
          if (u.includes('/api/artistas/mis-problogs') || u.includes('/api/artistas/mis-reblogs')) return json({ success: true, problogs: [publicacion], total: 1 });
          if (u.includes('/problogs')) return json({ success: true, problogs: [publicacion], total: 1, page: 1, limit: 10 });
          if (u.includes('heartbeat')) return json({ ok: true });
          if (u.includes('mis-reacciones')) return json({ reacciones: [] });
          if (u.includes('/obras')) return json([]);
          if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
          return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 1, nombre_artista: 'T', rol: 'artista', cavents: 0, problogs: 1, comcons: 0 } });
      };
  })();`;

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) console.log(`  PASS  ${nombre}`);
  else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}
async function cargar() {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await send('Page.navigate', { url: URL_BASE });
  for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
  await sleep(1200);
}

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });

// ============================================================
// PRO-2 — la pestaña Problogs NO debe borrar título ni etiquetas
// ============================================================
await cargar();
console.log('=== PRO-2: escribir título y etiquetas SIN contenido y cambiar de pestaña ===');
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1500);
const escrito = JSON.parse(await evalJs(`(() => {
    document.getElementById('tab-problogs')?.click();
    const t = document.getElementById('problog-titulo'); if (t) t.value = 'Titulo a preservar';
    const e = document.getElementById('problog-etiquetas'); if (e) e.value = 'arte, proceso';
    const c = document.getElementById('problog-contenido'); if (c) c.value = '';
    return JSON.stringify({ titulo: t.value, etiquetas: e.value, contenido: c.value });
})()`));
check('estado de partida: título y etiquetas escritos, contenido vacío',
  escrito.titulo === 'Titulo a preservar' && escrito.contenido === '', JSON.stringify(escrito));
// Ida y vuelta de pestañas (el bug se disparaba al volver a Problogs)
await evalJs(`document.getElementById('tab-cavents')?.click()`);
await sleep(400);
await evalJs(`document.getElementById('tab-problogs')?.click()`);
await sleep(500);
const tras = JSON.parse(await evalJs(`JSON.stringify({
    titulo: document.getElementById('problog-titulo').value,
    etiquetas: document.getElementById('problog-etiquetas').value,
    visibleEditor: !document.getElementById('crear-problogs-contenido').classList.contains('hidden')
})`));
check('el título sigue ahí al volver a la pestaña', tras.titulo === 'Titulo a preservar', JSON.stringify(tras));
check('las etiquetas siguen ahí al volver a la pestaña', tras.etiquetas === 'arte, proceso', JSON.stringify(tras));
check('el editor de Problogs está visible', tras.visibleEditor === true);

// ============================================================
// PRO-1 — el texto se ve completo al abrir una publicación para editarla
// ============================================================
await cargar();   // estado limpio: el panel arranca cerrado
console.log('\n=== PRO-1: abrir el feed, editar una publicación larga y medir el marco ===');
const clicEditar = await evalJs(`(() => {
    const cont = document.getElementById('problogs-feed');
    if (!cont) return 'sin contenedor';
    const b = document.createElement('button');
    b.setAttribute('data-problog-editar', '30001');
    cont.appendChild(b);
    b.click();
    return 'ok';
})()`);
check('se pudo lanzar la edición desde el feed', clicEditar === 'ok', clicEditar);
// Esperar a que el panel se abra (transición + animación) y se mida el marco
let medidas = null;
for (let i = 0; i < 20; i++) {
  await sleep(400);
  medidas = JSON.parse(await evalJs(`(() => {
      const c = document.getElementById('problog-contenido');
      const panel = document.getElementById('panel-artista');
      return JSON.stringify({
          panelVisible: panel && !panel.classList.contains('hidden'),
          editorVisible: !!c && c.offsetParent !== null,
          altoInline: c ? parseFloat(c.style.height || '0') : 0,
          scrollHeight: c ? c.scrollHeight : 0,
          largo: c ? c.value.length : 0,
          editando: !!document.getElementById('problog-contenido').value
      });
  })()`));
  if (medidas.editorVisible && medidas.altoInline > 260) break;
}
console.log('   ' + JSON.stringify(medidas));
check('el panel de edición quedó abierto', medidas.panelVisible === true);
check('el texto cargado es el largo de la publicación', medidas.largo > 800, `largo=${medidas.largo}`);
check('el marco creció más allá del mínimo de 260px', medidas.altoInline > 260, `alto=${medidas.altoInline}px`);
check('no hay texto cortado (scrollHeight cabe en el marco)',
  medidas.scrollHeight <= medidas.altoInline + 4, `scrollHeight=${medidas.scrollHeight} alto=${medidas.altoInline}`);
check('el botón de guardar dice "Guardar cambios" (modo edición)',
  (await evalJs(`document.getElementById('problog-nav-publicar').textContent.trim()`)).includes('Guardar cambios'));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
