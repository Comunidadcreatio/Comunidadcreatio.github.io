// Verifica la PESTAÑA PROBLOGS DEL PERFIL de otro artista contra el backend real:
// debe mostrar SOLO las publicaciones de ese artista (el filtro ?artista= del
// servidor) y no el feed global.
//
// Contexto: el informe de auditoría lo marcó como bug (ALTO) porque una sonda
// con un autor no numérico devolvía el feed completo. El controlador solo
// aplica el filtro si el id es un entero > 0 (problogController.js getPublicProblogs),
// así que la sonda no era concluyente. Esta prueba usa ids numéricos reales.
//
// Uso: node scripts/verificar-filtro-problogs-perfil.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9302;
const URL_BASE = process.argv[2] || 'https://comunidadcreatio.vercel.app/';
const AUTOR_CON_POSTS = 480001;   // autor de la publicación de prueba en producción
const AUTOR_SIN_POSTS = 480002;   // otro id numérico válido, sin publicaciones
const profileDir = mkdtempSync(join(tmpdir(), 'verif-pf-'));
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
// Sesión simulada. Se mockean SOLO los endpoints de sesión/ruido: sin el
// heartbeat la app recibe 401 y redirige a auth.html antes de llamar a
// setupProblogs() (que es quien registra el listener 'perfil:problogs').
// OJO: todo lo que lleve '/problog' PASA AL BACKEND REAL (es lo que se prueba).
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mockeado = ['heartbeat', 'sesiones-activas', 'artistas/perfil', 'notificaciones', 'chat', 'mis-reacciones', 'usuarios', '/obras'];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com') && !u.includes('/problog') && mockeado.some(s => u.includes(s))) {
              return { ok: true, status: 200, json: async () => ({
                  success: true, count: 0, no_leidas: 0, reacciones: [], usuarios: [],
                  notificaciones: [], sesiones: [], seguidores: [], siguiendo: [],
                  usuario: { id: 1, nombre_artista: 'T', rol: 'artista', cavents: 0, problogs: 0, comcons: 0 },
                  ...(u.includes('/obras') ? {} : {})
              }) };
          }
          if (u.includes('backend-fundacion-atpe.onrender.com') && u.includes('/obras')) {
              return { ok: true, status: 200, json: async () => [] };
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: URL_BASE });
for (let i = 0; i < 80; i++) { if (await evalJs(`!!document.getElementById('toggle-panel')`)) break; await sleep(300); }
await sleep(2000);
console.log('   diagnóstico: ' + await evalJs(`JSON.stringify({
    href: location.pathname,
    formularioProblog: !!document.getElementById('problog-form'),
    seccionPerfil: !!document.getElementById('perfil-usuario')
})`));

let fallos = 0; let pruebas = 0;
function check(nombre, condicion, detalle) {
  pruebas++;
  if (condicion) console.log(`  PASS  ${nombre}`);
  else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}

// Pinta la pestaña Problogs del perfil para un autor concreto, tal como lo hace
// perfil.js: un contenedor conectado + el evento 'perfil:problogs'.
// Reintenta el evento hasta que el listener esté registrado (setupProblogs()
// corre al final de init(); si se dispara antes, el evento se pierde).
async function pintarPerfil(autorId) {
  for (let intento = 0; intento < 8; intento++) {
    await evalJs(`(() => {
        const viejo = document.getElementById('contenedor-prueba-perfil');
        if (viejo) viejo.remove();
        const c = document.createElement('div');
        c.id = 'contenedor-prueba-perfil';
        document.body.appendChild(c);
        document.dispatchEvent(new CustomEvent('perfil:problogs', {
            detail: { contenedor: c, autorId: ${autorId} }
        }));
    })()`);
    for (let i = 0; i < 8; i++) {
      await sleep(600);
      const pintado = await evalJs(`(() => { const c = document.getElementById('contenedor-prueba-perfil'); return !!c && c.innerHTML.trim().length > 0; })()`);
      if (pintado) {
        // margen para que termine el fetch si aún muestra "Cargando…"
        await sleep(2500);
        const estado = await evalJs(`(() => { const c = document.getElementById('contenedor-prueba-perfil'); return c ? c.textContent : ''; })()`);
        if (!/Cargando/.test(estado || '')) return leer(autorId);
      }
    }
  }
  return leer(autorId);
}

const leer = async () => JSON.parse(await evalJs(`(() => {
      const c = document.getElementById('contenedor-prueba-perfil');
      const tarjetas = c ? c.querySelectorAll('.problog-card') : [];
      return JSON.stringify({
          tarjetas: tarjetas.length,
          ids: Array.from(tarjetas).map(t => t.dataset.id),
          vacio: c ? c.textContent.includes('todavía no ha publicado') : false,
          error: c ? c.textContent.includes('No se pudieron cargar') : false,
          texto: c ? c.textContent.trim().slice(0, 120) : ''
      });
  })()`));

console.log(`=== Autor CON publicaciones (id ${AUTOR_CON_POSTS}) ===`);
const conPosts = await pintarPerfil(AUTOR_CON_POSTS);
console.log('   ' + JSON.stringify(conPosts));
check('muestra la publicación de ese autor', conPosts.tarjetas >= 1 && !conPosts.error, JSON.stringify(conPosts));

console.log(`\n=== Autor SIN publicaciones (id ${AUTOR_SIN_POSTS}) ===`);
const sinPosts = await pintarPerfil(AUTOR_SIN_POSTS);
console.log('   ' + JSON.stringify(sinPosts));
check('no muestra ninguna publicación ajena (el filtro del servidor se aplica)',
  sinPosts.tarjetas === 0, JSON.stringify(sinPosts));
check('muestra el aviso de "todavía no ha publicado"', sinPosts.vacio === true, JSON.stringify(sinPosts));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
if (logs.length) fallos++;
process.exitCode = fallos ? 1 : 0;
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
