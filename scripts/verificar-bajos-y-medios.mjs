// Verifica el lote de Medios y Bajos:
//
//  XSS      El desplegable "Mis Cavents" pintaba el título sin escapar. Desde que
//           los textos se decodifican al recibirlos, un título guardado como
//           &lt;img onerror=...&gt; se ejecutaba al abrir la lista.
//  CAV-6    El cambio de ratio 4:5 <-> 1:1 recortaba la imagen YA recortada.
//  PRO-5    contarImagenes contaba etiquetas repetidas y bloqueaba el "+"; sin
//           validación de tipo/tamaño (un archivo enorme daba un 500 genérico).
//  INT-8    El hueco inferior se medía con el editor oculto (barras a 0).
//  BE-8     Un 401 en una escritura con fetch crudo no cerraba la sesión.
//  Varios   MAX_TEXTO sin usar, mensaje falso en el feed al fallar la carga,
//           progreso que ignoraba el paso de imágenes y mojibake en los textos.
//
// Uso: node scripts/verificar-bajos-y-medios.mjs [url]
// Requiere el servidor local: npx serve -l 8099 -s .
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9310;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const TITULO_CON_HTML = 'Retrato &lt;img src=x onerror="window.__xss=1"&gt;';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-bm-'));
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
      // Cuántos documentos se han cargado: sirve para comprobar que el 401 sacó al
      // usuario de la app (auth.html puede rebotar de vuelta porque este mock
      // vuelve a sembrar la sesión en cada documento).
      try { sessionStorage.setItem('test_docs', String((parseInt(sessionStorage.getItem('test_docs') || '0', 10) || 0) + 1)); } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#3366cc');
      // Título tal y como lo devuelve el backend (escapado) con HTML dentro
      const obra = { id: 1, titulo: ${JSON.stringify(TITULO_CON_HTML)}, artista: 'T', artista_user_id: 480001,
          imagen_url: img45, imagen_url_1: null, imagen_url_2: null, imagen_url_3: null, imagen_url_4: null,
          etiquetas: 'Oleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Oleo',
          descripcion_artistica: 'Desc', soporte: 'Lienzo', marcos: 'No', procedencia: '-', certificado: '-',
          firma: '-', conservacion: 'Buena', status: 'Activo (Visible en Galería)',
          estado_obra: 'Disponible (en venta)', precio: '100', foto_artista: '',
          likes_count: 0, views_count: 0, comments_count: 0 };
      window.__posts = [];
      // El modo del feed se guarda en localStorage para poder cambiarlo entre
      // recargas (el script inyectado se ejecuta antes que el de la página).
      window.__feedModo = (function () { try { return localStorage.getItem('test_feed_modo') || 'vacio'; } catch (e) { return 'vacio'; } })();
      window.__post401 = false;
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          if (u.includes('/problogs?') || u.endsWith('/problogs')) {
              if (window.__feedModo === 'error') return json({ success: false, error: 'boom' });
              return json({ success: true, problogs: [], total: 0, page: 1, limit: 10 });
          }
          // Solo se registran las ESCRITURAS de obras/problogs (el heartbeat
          // también es POST y no debe contar como guardado).
          const esEscritura = (method === 'POST' || method === 'PUT' || method === 'DELETE')
              && (u.includes('/obras') || u.includes('/problogs'));
          if (esEscritura) {
              const body = init && init.body;
              window.__posts.push({ method: method, url: u.replace('https://backend-fundacion-atpe.onrender.com', ''), titulo: body && body.get ? body.get('titulo') : null });
              // El contador se guarda en sessionStorage porque un 401 redirige y
              // la página (y con ella window.__posts) se pierde.
              try { sessionStorage.setItem('test_intentos', String((parseInt(sessionStorage.getItem('test_intentos') || '0', 10) || 0) + 1)); } catch (e) {}
              if (window.__post401) return { ok: false, status: 401, json: async () => ({ success: false, error: 'Token requerido' }) };
              return json({ success: true, id: 99 });
          }
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

// ============================================================
// XSS en el desplegable "Mis Cavents"
// ============================================================
console.log('=== XSS: título con HTML en la lista de Mis Cavents ===');
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1200);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1600);
await evalJs(`document.getElementById('cavents-trigger')?.click()`);
await sleep(1400);
const lista = JSON.parse(await evalJs(`(() => {
    const t = document.querySelector('.cavent-item-titulo');
    return JSON.stringify({
        xss: window.__xss === 1,
        imgInyectada: !!document.querySelector('.cavent-item-titulo img'),
        texto: t ? t.textContent.slice(0, 40) : '(sin lista)'
    });
})()`));
console.log('   ' + JSON.stringify(lista));
check('no se ejecuta el HTML del título (sin XSS)', lista.xss === false && lista.imgInyectada === false, JSON.stringify(lista));
check('el título se muestra como texto literal', lista.texto.includes('<img'), lista.texto);

// ============================================================
// CAV-6: cambio de ratio sin degradar la imagen
// ============================================================
console.log('\n=== CAV-6: re-recorte al cambiar de ratio ===');
await evalJs(`(async () => {
    const blob = await new Promise((res) => {
        const cv = document.createElement('canvas'); cv.width = 800; cv.height = 1000;
        const x = cv.getContext('2d'); x.fillStyle = '#cc3344'; x.fillRect(0, 0, 800, 1000);
        x.fillStyle = '#fff'; x.fillRect(10, 10, 120, 120);
        cv.toBlob(res, 'image/jpeg', 0.9);
    });
    const file = new File([blob], 'ratio.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(file);
    const inp = document.getElementById('input-imagen-0');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
for (let i = 0; i < 25; i++) { await sleep(300); if (await evalJs(`document.querySelectorAll('#carrusel-track .carrusel-slide').length > 1`)) break; }
const src45 = await evalJs(`document.querySelector('#carrusel-track img')?.src || ''`);
await evalJs(`document.querySelector('.ratio-btn[data-ratio="1/1"]')?.click()`);
await sleep(1500);
const src11 = await evalJs(`document.querySelector('#carrusel-track img')?.src || ''`);
await evalJs(`document.querySelector('.ratio-btn[data-ratio="4/5"]')?.click()`);
await sleep(1500);
const srcVuelta = await evalJs(`document.querySelector('#carrusel-track img')?.src || ''`);
check('el cambio a 1:1 sí re-recorta', src11 !== src45 && src11.length > 100);
check('volver a 4:5 da EXACTAMENTE la imagen original (no recorta la recortada)',
  srcVuelta === src45, `iguales=${srcVuelta === src45} largo45=${src45.length} largoVuelta=${srcVuelta.length}`);

// ============================================================
// Progreso: el paso de imágenes cuenta
// ============================================================
console.log('\n=== Progreso con una imagen y sin campos ===');
const progreso = await evalJs(`document.getElementById('form-progress-percentage')?.textContent || ''`);
check('el progreso no es 0% teniendo ya una imagen', progreso !== '0%' && progreso !== '', progreso);

// ============================================================
// PRO-5: duplicados, tipo y tamaño
// ============================================================
console.log('\n=== PRO-5: etiquetas repetidas y validación de archivos ===');
await evalJs(`document.getElementById('tab-problogs')?.click()`);
await sleep(700);
const repetidas = await evalJs(`(() => {
    const c = document.getElementById('problog-contenido');
    c.value = Array.from({ length: 9 }, () => '<image>repetida.jpg</image>').join(' ');
    c.dispatchEvent(new Event('input', { bubbles: true }));
    const b = document.getElementById('problog-add-imagen');
    return JSON.stringify({ deshabilitado: b.disabled, avisoError: document.body.innerText.includes('Máximo') });
})()`);
console.log('   ' + repetidas);
check('9 etiquetas de la MISMA imagen no bloquean el "+"', JSON.parse(repetidas).deshabilitado === false, repetidas);

const noImagen = await evalJs(`(() => {
    const f = new File(['hola'], 'notas.txt', { type: 'text/plain' });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById('problog-file');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return document.body.innerText.includes('debe ser una imagen');
})()`);
check('un archivo que no es imagen se rechaza con aviso', noImagen === true);

const grande = await evalJs(`(() => {
    const f = new File([new Uint8Array(11 * 1024 * 1024)], 'enorme.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById('problog-file');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return document.body.innerText.includes('10 MB');
})()`);
check('una imagen de más de 10 MB se rechaza con aviso', grande === true);

// MAX_TEXTO
const larga = await evalJs(`(() => {
    document.getElementById('problog-titulo').value = 'Prueba larga';
    const c = document.getElementById('problog-contenido');
    c.value = 'a'.repeat(20001);
    document.getElementById('form-cambiar-password');   // no-op
    document.getElementById('problog-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return document.body.innerText.includes('demasiado larga');
})()`);
await sleep(800);
const postsTrasLarga = await evalJs(`window.__posts.length`);
check('una publicación de más de 20.000 caracteres se bloquea', larga === true, String(larga));
check('y no se envió al servidor', postsTrasLarga === 0, `posts=${postsTrasLarga}`);

// ============================================================
// INT-8: el hueco inferior se mide con el editor visible
// ============================================================
console.log('\n=== INT-8: hueco inferior del editor ===');
await evalJs(`document.getElementById('tab-cavents')?.click()`);
await sleep(600);
const paddingOculto = await evalJs(`document.getElementById('crear-problogs-contenido').style.paddingBottom || ''`);
await evalJs(`document.getElementById('tab-problogs')?.click()`);
await sleep(150);
const paddingVisible = await evalJs(`document.getElementById('crear-problogs-contenido').style.paddingBottom || ''`);
console.log('   oculto=' + JSON.stringify(paddingOculto) + ' visible=' + JSON.stringify(paddingVisible));
check('al mostrar el editor el hueco se calcula al momento (no espera 350ms)',
  parseFloat(paddingVisible) >= 150, `padding=${paddingVisible}`);

// ============================================================
// Feed: mensaje correcto al fallar la carga + mojibake
// ============================================================
console.log('\n=== Feed: error de carga y textos con acentos ===');
await evalJs(`window.__feedModo = 'vacio'`);
await evalJs(`document.getElementById('btn-problogs')?.click()`);
await sleep(2500);
const feedVacio = await evalJs(`document.getElementById('problogs-feed').innerText.trim()`);
check('el feed vacío se anuncia en buen español', feedVacio.includes('Todavía no hay publicaciones'), JSON.stringify(feedVacio.slice(0, 60)));
check('no queda mojibake en los textos', !/Ã|Â/.test(feedVacio), JSON.stringify(feedVacio.slice(0, 60)));
// La carga con error necesita una recarga: el feed solo se pide si no estaba
// cargado, así que se cambia el modo en localStorage y se recarga la página.
await evalJs(`localStorage.setItem('test_feed_modo', 'error')`);
await send('Page.reload', { ignoreCache: false });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(1500);
await evalJs(`document.getElementById('btn-problogs')?.click()`);
await sleep(2500);
const feedError = await evalJs(`document.getElementById('problogs-feed').innerText.trim()`);
check('si la carga falla se dice que falló (no "no hay publicaciones")',
  feedError.includes('No se pudieron cargar'), JSON.stringify(feedError.slice(0, 60)));

// ============================================================
// BE-8: un 401 cierra la sesión (última prueba: redirige a auth.html)
// ============================================================
console.log('\n=== BE-8: 401 en el guardado de una obra ===');
// El cierre de sesión REDIRIGE (a auth.html, que puede rebotar), así que la
// evidencia se guarda en sessionStorage y se lee desde el documento nuevo.
await evalJs(`window.__logout = 0; sessionStorage.removeItem('test_logout'); sessionStorage.setItem('test_docs_base', sessionStorage.getItem('test_docs') || '1');
    document.addEventListener('userLogout', () => { window.__logout++; try { sessionStorage.setItem('test_logout', '1'); } catch (e) {} });`);
await evalJs(`window.__post401 = true`);
await evalJs(`document.getElementById('btn-cavents-hub')?.click()`);
await sleep(1200);
await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
await sleep(1500);
// Hace falta una imagen: el formulario no se puede guardar sin ella.
await evalJs(`(async () => {
    const blob = await new Promise((res) => {
        const cv = document.createElement('canvas'); cv.width = 800; cv.height = 1000;
        const x = cv.getContext('2d'); x.fillStyle = '#22aa66'; x.fillRect(0, 0, 800, 1000);
        cv.toBlob(res, 'image/jpeg', 0.85);
    });
    const file = new File([blob], 'sesion.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(file);
    const inp = document.getElementById('input-imagen-0');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
for (let i = 0; i < 25; i++) { await sleep(300); if (await evalJs(`document.querySelectorAll('#carrusel-track .carrusel-slide').length > 1`)) break; }
// Rellenar TODO lo obligatorio y guardar (el 401 llega en la respuesta)
await evalJs(`(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('input-titulo', 'Obra con sesion caducada'); set('input-ano', '2024'); set('input-precio', '10');
    set('input-ancho', '10'); set('input-alto', '10'); set('input-descripcion-artistica', 'x'); set('input-etiquetas', 'x');
    ['input-status','input-estado-obra','input-descripcion-tecnica','input-soporte','input-marcos','input-procedencia','input-certificado','input-firma','input-conservacion'].forEach((id) => {
        const sel = document.getElementById(id); const opt = Array.from(sel.options).find(o => o.value); if (opt) sel.value = opt.value;
    });
})()`);
await evalJs(`document.getElementById('obra-form').requestSubmit()`);
await sleep(2000);
const sesion = JSON.parse(await evalJs(`JSON.stringify({
    logout: sessionStorage.getItem('test_logout'),
    docs: parseInt(sessionStorage.getItem('test_docs') || '0', 10) || 0,
    docsBase: parseInt(sessionStorage.getItem('test_docs_base') || '1', 10) || 1,
    intentos: parseInt(sessionStorage.getItem('test_intentos') || '0', 10) || 0
})`));
console.log('   ' + JSON.stringify(sesion));
check('el guardado se intentó y recibió 401', sesion.intentos >= 1, JSON.stringify(sesion));
check('el 401 dispara el cierre de sesión', sesion.logout === '1', JSON.stringify(sesion));
check('y se saca al usuario de la app (auth.html)', sesion.docs > sesion.docsBase, JSON.stringify(sesion));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
