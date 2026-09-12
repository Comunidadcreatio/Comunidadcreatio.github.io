// Verifica el arreglo de los dos hallazgos del backend:
//
//  BE-4  El formulario no tiene campos para id_personalizado, localizacion ni
//        peso, pero el PUT del backend los escribe SIEMPRE: editar una obra los
//        dejaba en ''/0 (pérdida silenciosa). Ahora se guardan al cargar la obra
//        y se reenvían tal cual.
//  BE-5  "Cambiar contraseña" validaba "puntos < 3", pero el backend exige
//        nivel >= 3 (4 puntos): una contraseña de 3 puntos (nivel "Media") pasaba
//        el filtro del navegador y el servidor la rechazaba con 400.
//
// Uso: node scripts/verificar-meta-obra-y-password.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9308;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-meta-'));
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
      // Obra con metadatos que el formulario NO muestra
      const obra = { id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 480001, imagen_url: img45,
          imagen_url_1: null, imagen_url_2: null, imagen_url_3: null, imagen_url_4: null,
          etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Oleo',
          descripcion_artistica: 'Desc', soporte: 'Lienzo', marcos: 'No', procedencia: '-', certificado: '-',
          firma: '-', conservacion: 'Buena', status: 'Activo (Visible en Galería)',
          estado_obra: 'Disponible (en venta)', precio: '100', foto_artista: '',
          id_personalizado: 'CAT-007', localizacion: 'Sala 3, pared norte', peso: 2.5,
          likes_count: 0, views_count: 0, comments_count: 0 };
      window.__enviados = [];
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          if (method === 'PUT' || method === 'POST') {
              const body = init && init.body;
              const registro = { method: method, url: u.replace('https://backend-fundacion-atpe.onrender.com', '') };
              if (body && body.get) {
                  for (const k of Array.from(body.keys())) {
                      if (k.startsWith('imagen_')) { const f = body.get(k); registro[k] = f && f.name ? f.name : 'archivo'; }
                      else registro[k] = body.get(k);
                  }
              } else if (typeof body === 'string') {
                  try { Object.assign(registro, JSON.parse(body)); } catch (e) { registro.crudo = body.slice(0, 80); }
              }
              window.__enviados.push(registro);
              return json({ success: true, id: 99, message: 'ok' });
          }
          if (u.includes('/api/artistas/mis-obras')) return json({ success: true, obras: [obra], total: 1 });
          if (u.includes('/obras/1')) return json(obra);
          if (u.includes('/obras')) return json([obra]);
          if (u.includes('/problogs')) return json({ success: true, problogs: [], total: 0 });
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
// BE-4 — los metadatos no deben perderse al editar
// ============================================================
console.log('=== BE-4: editar una obra con id personalizado, localización y peso ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1000);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1500);
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(1200);
const hayEdit = await evalJs(`!!document.querySelector('.cavent-item .btn-edit')`);
check('la lista de Mis Cavents está disponible', hayEdit === true);
await evalJs(`document.querySelector('.cavent-item .btn-edit')?.click()`);
await sleep(1600);
check('la obra se cargó en modo edición', (await evalJs(`document.getElementById('input-id-edicion').value`)) === '1');
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(2500);
let todos = await enviados();
let put = todos.filter(e => e.method === 'PUT').pop();
console.log('   ' + JSON.stringify(put));
check('se envió la actualización (PUT)', !!put, JSON.stringify(todos.map(t => t.method)));
check('el id personalizado se reenvía tal cual', put && put.id_obra === 'CAT-007', JSON.stringify(put && put.id_obra));
check('la localización se reenvía tal cual', put && put.localizacion === 'Sala 3, pared norte', JSON.stringify(put && put.localizacion));
check('el peso se reenvía tal cual', put && put.peso === '2.5', JSON.stringify(put && put.peso));
// Bonus: los <select> no deben perder un valor guardado que no está entre sus
// opciones (el select se quedaba vacío y al guardar se enviaba '').
check('la técnica guardada (fuera de la lista de opciones) no se pierde',
  put && put.descripcion_tecnica === 'Oleo', JSON.stringify(put && put.descripcion_tecnica));
check('el soporte guardado (fuera de la lista) no se pierde',
  put && put.soporte === 'Lienzo', JSON.stringify(put && put.soporte));
check('los marcos guardados (fuera de la lista) no se pierden',
  put && put.marcos === 'No', JSON.stringify(put && put.marcos));
check('la conservación guardada (fuera de la lista) no se pierde',
  put && put.conservacion === 'Buena', JSON.stringify(put && put.conservacion));

console.log('\n=== BE-4b: duplicar tampoco debe perder localización y peso ===');
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);   // flecha
await sleep(1500);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);   // "+" (limpia el formulario)
await sleep(1500);
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(1200);
await evalJs(`document.querySelector('.cavent-item .btn-dup')?.click()`);
// Esperar a que termine la copia de la imagen (si no, el guardado se bloquea)
for (let i = 0; i < 20; i++) { await sleep(400); if (await evalJs(`document.querySelectorAll('#carrusel-track .carrusel-slide').length > 1`)) break; }
await sleep(800);
check('la copia quedó lista para guardar', (await evalJs(`/copia/.test(document.getElementById('input-titulo').value)`)) === true);
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(2500);
todos = await enviados();
const post = todos.filter(e => e.method === 'POST').pop();
console.log('   ' + JSON.stringify({ id_obra: post && post.id_obra, localizacion: post && post.localizacion, peso: post && post.peso }));
check('la copia conserva localización', post && post.localizacion === 'Sala 3, pared norte', JSON.stringify(post && post.localizacion));
check('la copia conserva el peso', post && post.peso === '2.5', JSON.stringify(post && post.peso));
check('la copia NO hereda el id personalizado (es una obra nueva)', post && post.id_obra === '', JSON.stringify(post && post.id_obra));

// ============================================================
// BE-5 — la contraseña debe validarse como lo hace el backend
// ============================================================
console.log('\n=== BE-5: contraseña de 3 puntos (nivel "Media") ===');
const nivelMedidor = await evalJs(`(() => {
    const p = document.getElementById('pass-nueva');
    p.value = 'abcdefg1';
    p.dispatchEvent(new Event('input', { bubbles: true }));
    const w = document.getElementById('cuenta-password-strength');
    return w ? w.getAttribute('data-level') : null;
})()`);
check('el medidor la clasifica como nivel 2 ("Media")', nivelMedidor === '2', String(nivelMedidor));
const antesDebil = (await enviados()).length;
const resultadoDebil = await evalJs(`(() => {
    document.getElementById('pass-actual').value = 'OtraActual1!';
    document.getElementById('pass-nueva').value = 'abcdefg1';
    document.getElementById('pass-confirmar').value = 'abcdefg1';
    document.getElementById('form-cambiar-password').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return document.getElementById('error-pass-confirmar').textContent.trim();
})()`);
await sleep(1200);
const trasDebil = await enviados();
console.log('   error mostrado: ' + JSON.stringify(resultadoDebil));
check('el navegador avisa de que es débil (no la envía al servidor)', /débil/i.test(resultadoDebil || ''), JSON.stringify(resultadoDebil));
check('no se envió la petición al backend', trasDebil.length === antesDebil, `enviados=${trasDebil.length} (antes ${antesDebil})`);

console.log('\n=== BE-5b: contraseña fuerte (4+ puntos) sí se envía ===');
const resultadoFuerte = await evalJs(`(() => {
    document.getElementById('pass-actual').value = 'OtraActual1!';
    document.getElementById('pass-nueva').value = 'Abcdefg1!x';
    document.getElementById('pass-confirmar').value = 'Abcdefg1!x';
    document.getElementById('error-pass-confirmar').textContent = '';
    document.getElementById('form-cambiar-password').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return document.getElementById('error-pass-confirmar').textContent.trim();
})()`);
await sleep(1800);
const trasFuerte = await enviados();
const cambio = trasFuerte.filter(e => (e.url || '').includes('cambiar-password')).pop();
console.log('   ' + JSON.stringify(cambio || null));
check('una contraseña fuerte no da error de fortaleza', !/débil/i.test(resultadoFuerte || ''), JSON.stringify(resultadoFuerte));
check('la petición de cambio de contraseña llega al backend', !!cambio, JSON.stringify(trasFuerte.map(t => t.url)));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
