// Verifica el arreglo del grupo 3 (Altos de Cavents al crear/duplicar):
//
//  CAV-1  Doble envío del formulario. El estado de carga se ponía en
//         #btn-guardar (oculto), así que el botón visible (#obra-step-crear)
//         seguía activo y un segundo toque creaba una segunda obra.
//  CAV-3  "Duplicar": las imágenes se copian de forma asíncrona con
//         file:null hasta que terminan. Guardar a mitad creaba la obra sin
//         esas imágenes; además el fallo de copia se ignoraba en silencio.
//
// Uso: node scripts/verificar-cavents-crear.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9303;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-cav-'));
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
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#cc3344');
      const obra = { id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, imagen_url_1: null, imagen_url_2: null, imagen_url_3: null, imagen_url_4: null, etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Oleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '-', certificado: '-', firma: '-', conservacion: 'Buena', status: 'Activo (Visible en Galería)', precio: '100', foto_artista: '', likes_count: 0, views_count: 0, comments_count: 0 };
      window.__posts = [];
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          // Guardar obra: se registra QUÉ se envió y se responde con lentitud
          // (simula un móvil en red lenta: la ventana del doble envío).
          if (method === 'POST' && u.endsWith('/obras')) {
              const body = init && init.body;
              const keys = (body && body.keys) ? Array.from(body.keys()) : [];
              window.__posts.push({
                  method: method,
                  titulo: (body && body.get) ? body.get('titulo') : null,
                  imagenes: keys.filter(k => k.startsWith('imagen_')).map(k => { const f = body.get(k); return k + ':' + (f && f.name ? f.name : 'sin-nombre'); }),
                  eliminar: (body && body.get) ? body.get('imagenes_a_eliminar') : null
              });
              await new Promise(r => setTimeout(r, 1200));
              return json({ success: true, id: 99, message: 'ok' });
          }
          if (u.includes('/api/artistas/mis-obras')) return json({ success: true, obras: [obra], total: 1 });
          if (u.includes('/obras/1')) return json(obra);
          if (u.includes('/obras')) return json([obra]);
          if (u.includes('heartbeat')) return json({ ok: true });
          if (u.includes('mis-reacciones')) return json({ reacciones: [] });
          if (u.includes('/problogs')) return json({ success: true, publicaciones: [], total: 0 });
          if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
          return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 1, nombre_artista: 'T', rol: 'artista' } });
      };
      window.__imgData = img45;
  })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1200);

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) console.log(`  PASS  ${nombre}`);
  else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}
const posts = async () => JSON.parse(await evalJs(`JSON.stringify(window.__posts)`));

// Abrir el panel de creación y meter una imagen real en el slot 0
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1500);
const conImagen = await evalJs(`(async () => {
    const t = document.getElementById('input-titulo'); if (t) t.value = 'Prueba doble envio';
    // El archivo se genera con canvas (fetch de data: lo bloquea el CSP).
    const blob = await new Promise((res) => {
        const cv = document.createElement('canvas'); cv.width = 800; cv.height = 1000;
        const x = cv.getContext('2d'); x.fillStyle = '#cc3344'; x.fillRect(0, 0, 800, 1000);
        cv.toBlob(res, 'image/jpeg', 0.85);
    });
    const file = new File([blob], 'prueba.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(file);
    const inp = document.getElementById('input-imagen-0');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
})()`);
check('se pudo preparar el formulario con una imagen', conImagen === true);
// El formulario ya exige los campos obligatorios (CAV-4): se rellenan para que
// el guardado llegue al backend, que es lo que se está probando aquí.
await evalJs(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('input-ano', '2024'); set('input-precio', '120'); set('input-ancho', '80'); set('input-alto', '100');
    set('input-descripcion-artistica', 'Descripcion de prueba.'); set('input-etiquetas', 'arte');
    ['input-status', 'input-estado-obra', 'input-descripcion-tecnica', 'input-soporte', 'input-marcos',
     'input-procedencia', 'input-certificado', 'input-firma', 'input-conservacion'].forEach((id) => {
        const sel = document.getElementById(id);
        const opt = Array.from(sel.options).find(o => o.value);
        if (opt) sel.value = opt.value;
    });
})()`);
for (let i = 0; i < 20; i++) {
  const listo = await evalJs(`document.querySelectorAll('#carrusel-track .carrusel-slide').length > 1`);
  if (listo) break;
  await sleep(300);
}

// ---------- CAV-1: doble envío ----------
console.log('\n=== CAV-1: dos toques seguidos en "Crear" ===');
await evalJs(`(() => {
    const b = document.getElementById('obra-step-crear');
    b.click();                       // primer toque
})()`);
await sleep(120);
const estadoBoton = JSON.parse(await evalJs(`JSON.stringify({
    deshabilitado: document.getElementById('obra-step-crear').disabled,
    tituloVisible: document.getElementById('obra-step-crear').textContent.trim()
})`));
check('el botón VISIBLE queda deshabilitado durante el guardado', estadoBoton.deshabilitado === true, JSON.stringify(estadoBoton));
// Segundo intento: toque + submit programático (Enter), lo que antes duplicaba
await evalJs(`(() => {
    document.getElementById('obra-step-crear').click();
    document.getElementById('obra-form').requestSubmit();
})()`);
await sleep(2600);
const trasDoble = await posts();
check('solo se envió UNA obra', trasDoble.length === 1, `POSTs=${trasDoble.length}`);
check('la obra enviada lleva su imagen', (trasDoble[0]?.imagenes || []).some(i => i.startsWith('imagen_0:')), JSON.stringify(trasDoble[0]));
const restaurado = await evalJs(`document.getElementById('obra-step-crear').disabled === false`);
check('el botón vuelve a quedar activo tras guardar', restaurado === true);

// ---------- CAV-3: guardar a mitad de la copia al duplicar ----------
console.log('\n=== CAV-3: "Duplicar" y guardar mientras se copian las imágenes ===');
await evalJs(`(() => {
    // Retardar el toBlob del canvas: hace determinista la ventana en la que las
    // imágenes copiadas todavía tienen file:null (simula un móvil lento).
    const orig = HTMLCanvasElement.prototype.toBlob;
    window.__restaurarToBlob = () => { HTMLCanvasElement.prototype.toBlob = orig; };
    HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) {
        setTimeout(() => orig.call(this, cb, ...rest), 1200);
    };
})()`);
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(1200);
const hayLista = await evalJs(`!!document.querySelector('.cavent-item .btn-dup')`);
check('la lista "Mis Cavents" tiene el botón Duplicar', hayLista === true);
await evalJs(`document.querySelector('.cavent-item .btn-dup')?.click()`);
await sleep(300);
const enCopia = JSON.parse(await evalJs(`JSON.stringify({
    titulo: document.getElementById('input-titulo').value,
    idEdicion: document.getElementById('input-id-edicion').value,
    slides: document.querySelectorAll('#carrusel-track .carrusel-slide').length
})`));
check('la copia está en marcha (título "(copia)", sin id de edición)', /copia/.test(enCopia.titulo) && enCopia.idEdicion === '', JSON.stringify(enCopia));
// Guardar justo ahora: la imagen copiada aún tiene file:null
const postsAntes = (await posts()).length;
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(400);
const trasIntento = await posts();
const aviso = await evalJs(`document.body.innerText.includes('se están preparando')`);
check('el guardado se bloquea mientras las imágenes se copian', trasIntento.length === postsAntes, `POSTs=${trasIntento.length} (antes ${postsAntes})`);
check('se avisa al usuario de que espere', aviso === true);
// Ahora sí: copia terminada -> el guardado incluye la imagen copiada
for (let i = 0; i < 20; i++) { await sleep(300); if (await evalJs(`document.querySelectorAll('#carrusel-track .carrusel-slide').length > 1`)) break; }
await sleep(600);
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(2600);
const trasCopia = await posts();
const ultimo = trasCopia[trasCopia.length - 1];
check('al terminar la copia, la obra se guarda', trasCopia.length === postsAntes + 1, `POSTs=${trasCopia.length}`);
check('la copia incluye la imagen duplicada', (ultimo?.imagenes || []).some(i => i.includes('duplicada-0')), JSON.stringify(ultimo));
check('la copia se crea como obra nueva (POST), sin lista de borrado', ultimo?.method === 'POST' && !ultimo?.eliminar, JSON.stringify(ultimo));

await evalJs(`window.__restaurarToBlob && window.__restaurarToBlob()`);
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
