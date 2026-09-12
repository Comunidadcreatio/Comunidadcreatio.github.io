// Verifica el arreglo del grupo 6 (pérdida de datos y estado sucio):
//
//  CAV-5  El formulario de Cavents conservaba los datos y el id de la obra que se
//         estaba editando/duplicando: al volver a pulsar "+" y guardar se
//         ACTUALIZABA aquella obra en vez de crear una nueva.
//  INT-6  El "+" abría la última pestaña usada (a veces el editor de Problogs con
//         el borrador anterior) en vez de la del contexto.
//  INT-5  body.creando-problogs no se quitaba nunca: su padding-bottom:0 dejaba
//         todas las secciones sin el hueco del nav.
//  INT-7  Los contadores de Problogs/Comcons se ponían a "0" cuando una llamada
//         sin datos competía con la que sí los trae.
//  INT-9  Al volver de editar un problog desde el perfil se caía siempre en la
//         subpestaña "Mis cavents".
//
// Uso: node scripts/verificar-estado-panel.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9307;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-est-'));
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
      const obra = { id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 480001, imagen_url: img45,
          imagen_url_1: null, imagen_url_2: null, imagen_url_3: null, imagen_url_4: null, etiquetas: 'Oleo', ano: 2024,
          ancho: 80, alto: 100, descripcion_tecnica: 'Oleo', descripcion_artistica: 'Desc', soporte: 'Lienzo',
          marcos: 'No', procedencia: '-', certificado: '-', firma: '-', conservacion: 'Buena',
          status: 'Activo (Visible en Galería)', estado_obra: 'Disponible (en venta)', precio: '100',
          foto_artista: '', likes_count: 0, views_count: 0, comments_count: 0 };
      const publicacion = { id: 30001, titulo: 'Una publicacion', etiquetas: 'arte', estado: 'publicado',
          created_at: new Date().toISOString(), bloques: [{ tipo: 'texto', contenido: 'Texto de la publicacion.' }],
          imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
          portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0, comentarios_count: 0,
          reblogs_count: 0, liked: false, reblogged: false };
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          if (method === 'PUT' || method === 'POST') return json({ success: true, id: 99 });
          // Sin contadores a propósito: así el caso "llamada sin datos" se prueba
          // de verdad (si el perfil trajera problogs/comcons, escribirlos sería
          // correcto y no se vería la regresión).
          if (u.includes('/api/artistas/perfil')) return json({ success: true, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
          if (u.includes('/api/artistas/mis-obras')) return json({ success: true, obras: [obra], total: 1 });
          if (u.includes('/obras/1')) return json(obra);
          if (u.includes('/obras')) return json([obra]);
          if (u.includes('/problogs/30001')) return json(publicacion);
          if (u.includes('/problogs')) return json({ success: true, problogs: [publicacion], total: 1, page: 1, limit: 10 });
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
const panelVisible = () => evalJs(`!document.getElementById('panel-artista').classList.contains('hidden')`);
const tabActiva = () => evalJs(`(document.querySelector('#crear-tabs .crear-tab.activa') || {}).id || ''`);

// Clic en "+" resolviendo el aviso de "cambios sin guardar" si aparece.
async function clickPlus() {
  await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
  await sleep(500);
  const hayAviso = await evalJs(`!!document.querySelector('.confirm-overlay .confirm-btn-ok')`);
  let aviso = false;
  if (hayAviso) {
    aviso = true;
    await evalJs(`document.querySelector('.confirm-overlay .confirm-btn-ok')?.click()`);
    await sleep(400);
  }
  await sleep(1200);
  return aviso;
}

// ============================================================
// CAV-5 + INT-6
// ============================================================
console.log('=== CAV-5: el "+" no debe conservar la obra que se estaba editando ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1200);
await clickPlus();
check('el panel de creación está abierto', (await panelVisible()) === true);
// Editar la obra desde "Mis Cavents"
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(1200);
await evalJs(`document.querySelector('.cavent-item .btn-edit')?.click()`);
await sleep(1500);
const enEdicion = JSON.parse(await evalJs(`JSON.stringify({
    id: document.getElementById('input-id-edicion').value,
    titulo: document.getElementById('input-titulo').value,
    boton: document.getElementById('obra-step-crear').textContent.trim()
})`));
console.log('   ' + JSON.stringify(enEdicion));
check('queda en modo edición de la obra 1', enEdicion.id === '1' && enEdicion.boton === 'Actualizar Cavent', JSON.stringify(enEdicion));
// Volver con la flecha y entrar otra vez con "+"
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1500);
check('la flecha cierra el panel', (await panelVisible()) === false);
await clickPlus();
const trasPlus = JSON.parse(await evalJs(`JSON.stringify({
    id: document.getElementById('input-id-edicion').value,
    titulo: document.getElementById('input-titulo').value,
    boton: document.getElementById('obra-step-crear').textContent.trim()
})`));
console.log('   ' + JSON.stringify(trasPlus));
check('el id de edición quedó limpio (no sobrescribirá la obra 1)', trasPlus.id === '', JSON.stringify(trasPlus.id));
check('el título quedó vacío', trasPlus.titulo === '', JSON.stringify(trasPlus.titulo));
check('el botón vuelve a decir "Crear Cavent"', trasPlus.boton === 'Crear Cavent', trasPlus.boton);

console.log('\n=== INT-6: el "+" abre la pestaña del contexto ===');
// Se deja Problogs como última pestaña usada y se vuelve a pulsar "+" desde la galería
await evalJs(`document.getElementById('tab-problogs')?.click()`);
await sleep(500);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);   // flecha
await sleep(1500);
await clickPlus();
const tabTrasPlus = await tabActiva();
check('desde la galería abre Cavents (no Problogs)', tabTrasPlus === 'tab-cavents', tabTrasPlus);
// Y desde la sección Problogs debe abrir el editor de Problogs
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1500);
await evalJs(`document.getElementById('btn-problogs')?.click()`);
await sleep(1800);
await clickPlus();
const tabDesdeProblogs = await tabActiva();
check('desde la sección Problogs abre Problogs', tabDesdeProblogs === 'tab-problogs', tabDesdeProblogs);

// ============================================================
// INT-5 — body.creando-problogs no debe filtrarse
// ============================================================
console.log('\n=== INT-5: la clase creando-problogs se retira al salir ===');
// Se abre el editor de Problogs explícitamente para que la comprobación no
// dependa de en qué pestaña la dejó la fase anterior.
await evalJs(`document.getElementById('tab-problogs')?.click()`);
await sleep(700);
const claseDentro = await evalJs(`document.body.classList.contains('creando-problogs')`);
check('mientras se edita un problog la clase está puesta', claseDentro === true);
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1800);
const trasSalir = JSON.parse(await evalJs(`JSON.stringify({
    clase: document.body.classList.contains('creando-problogs'),
    paddingBody: getComputedStyle(document.body).paddingBottom
})`));
console.log('   ' + JSON.stringify(trasSalir));
check('la clase se retira al salir del panel', trasSalir.clase === false);
check('el body recupera su hueco inferior (padding != 0)', trasSalir.paddingBody !== '0px', trasSalir.paddingBody);

// ============================================================
// INT-7 — contadores que no se ponen a 0
// ============================================================
console.log('\n=== INT-7: los contadores no se borran con una llamada sin datos ===');
await evalJs(`document.getElementById('stats-problogs').textContent = '5'`);
await evalJs(`document.getElementById('stats-comcons').textContent = '7'`);
await evalJs(`window.actualizarEstadisticas()`);
await sleep(1500);
const sinDatos = JSON.parse(await evalJs(`JSON.stringify({
    problogs: document.getElementById('stats-problogs').textContent,
    comcons: document.getElementById('stats-comcons').textContent
})`));
check('el contador de Problogs se mantiene (no se pone a 0)', sinDatos.problogs === '5', JSON.stringify(sinDatos));
check('el contador de Comcons se mantiene', sinDatos.comcons === '7', JSON.stringify(sinDatos));
await evalJs(`window.actualizarEstadisticas(null, { problogs: 3, comcons: 2 })`);
await sleep(1500);
const conDatos = JSON.parse(await evalJs(`JSON.stringify({
    problogs: document.getElementById('stats-problogs').textContent,
    comcons: document.getElementById('stats-comcons').textContent
})`));
check('cuando sí hay datos se pintan', conDatos.problogs === '3' && conDatos.comcons === '2', JSON.stringify(conDatos));

// ============================================================
// INT-9 — volver a la subpestaña del perfil
// ============================================================
console.log('\n=== INT-9: volver del editor a la subpestaña del perfil ===');
await evalJs(`document.getElementById('btn-perfil-sidebar')?.click()`);
await sleep(2000);
const perfilVisible = await evalJs(`!document.getElementById('perfil-usuario').classList.contains('hidden')`);
check('el perfil propio está abierto', perfilVisible === true);
await evalJs(`document.querySelector('.perfil-tab-btn[data-tab="problogs"]')?.click()`);
await sleep(1500);
const tabAntes = await evalJs(`(document.querySelector('.perfil-tab-btn.active') || {}).dataset?.tab || ''`);
check('la subpestaña Problogs está activa', tabAntes === 'problogs', tabAntes);
// Abrir el editor con "+" (el icono está oculto en el perfil: se pulsa por JS) y volver
await clickPlus();
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(2500);
const tabDespues = JSON.parse(await evalJs(`JSON.stringify({
    tab: (document.querySelector('.perfil-tab-btn.active') || {}).dataset?.tab || '',
    perfilVisible: !document.getElementById('perfil-usuario').classList.contains('hidden')
})`));
console.log('   ' + JSON.stringify(tabDespues));
check('se vuelve al perfil', tabDespues.perfilVisible === true);
check('y a la subpestaña Problogs (no a "Mis cavents")', tabDespues.tab === 'problogs', tabDespues.tab);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
