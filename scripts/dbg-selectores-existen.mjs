// EXISTENCIA DE SELECTORES EN EL NAVEGADOR (la prueba que de verdad vale para el CSS muerto).
//
// POR QUE EXISTE: el cribe de `auditar-css-muerto.mjs` es estatico (busca los tokens en el HTML y
// en los .js). Un token puede crearse en tiempo de ejecucion concatenando cadenas, y entonces el
// cribe lo da por muerto sin serlo. Esto le pregunta AL NAVEGADOR: `querySelectorAll(sel).length`
// para cada selector de una lista. Cero = no hay ningun elemento que case (en esa pagina y ese
// estado).
//
// Se comprueba en las dos paginas y con lo que se monta a peticion:
//   --pagina index   (con sesion de artista y el panel de crear abierto)
//   --pagina auth
//
// Uso:
//   node scripts/dbg-selectores-existen.mjs --archivo scripts/_selectores-candidatos.txt --pagina index
//   node scripts/dbg-selectores-existen.mjs --archivo ... --pagina auth
//   --salida <ruta>: escribe SOLO los selectores que NO casan con nada (los borrables).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9796;
const args = process.argv.slice(2);
const arg = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const ARCHIVO = arg('--archivo', '');
const PAGINA = arg('--pagina', 'index');
const SALIDA = arg('--salida', '');
if (!ARCHIVO) { console.error('Falta --archivo <lista de selectores>'); process.exit(2); }
const SELECTORES = readFileSync(ARCHIVO, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

const perfil = mkdtempSync(join(tmpdir(), 'existen-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=393,852', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null;
const salir = (c) => { try { ws?.close(); } catch {} try { chrome.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(c); };
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PUERTO}/json/version`); break; } catch { await sleep(250); } }
const pagina = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PUERTO}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        try {
            if (${PAGINA === 'auth' ? 'true' : 'false'}) {
                localStorage.removeItem('artistaData'); localStorage.removeItem('creatio_auth_token_persist');
            } else {
                localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
                localStorage.setItem('creatio_auth_token_persist', 'tok');
            }
        } catch (_) {}
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/obras')) return json([]);
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});
await send('Page.navigate', { url: URL_BASE + (PAGINA === 'auth' ? 'auth.html' : '') });
for (let i = 0; i < 60; i++) {
    const listo = await evalJs(PAGINA === 'auth' ? `!!document.getElementById('login-form')` : `!!document.getElementById('toggle-panel')`);
    if (listo === true) break;
    await sleep(300);
}
await sleep(1500);
if (PAGINA === 'auth') {
    await evalJs(`document.getElementById('btn-mostrar-login')?.click()`);
} else {
    // Se abre lo que se monta a peticion: el panel de crear (y sus dos pestanas).
    await evalJs(`document.getElementById('btn-crear-cavent')?.click()`);
    await sleep(1500);
    await evalJs(`document.getElementById('tab-problogs')?.click()`);
    await sleep(800);
    await evalJs(`document.getElementById('tab-cavents')?.click()`);
    await sleep(800);
}
await sleep(600);

const res = await evalJs(`(() => {
    const sels = ${JSON.stringify(SELECTORES)};
    const out = {};
    for (const s of sels) {
        let n = -1;
        try { n = document.querySelectorAll(s).length; } catch (e) { n = -2; }   // -2: selector invalido
        out[s] = n;
    }
    return JSON.stringify(out);
})()`);
if (typeof res !== 'string' || res.startsWith('EXC')) { console.error('Fallo al medir:', String(res).slice(0, 200)); salir(2); }
const datos = JSON.parse(res);
const cero = [], conAlgo = [], invalidos = [];
for (const [s, n] of Object.entries(datos)) {
    if (n === 0) cero.push(s); else if (n === -2) invalidos.push(s); else conAlgo.push([s, n]);
}
console.log(`pagina ${PAGINA}: ${SELECTORES.length} selectores -> ${cero.length} con CERO elementos, ${conAlgo.length} con alguno, ${invalidos.length} invalidos`);
if (conAlgo.length) {
    console.log('\nOJO: estos SI existen (NO se pueden borrar):');
    for (const [s, n] of conAlgo.slice(0, 40)) console.log(`   ${n}  ${s}`);
}
if (invalidos.length) {
    console.log('\nINVALIDOS (revisar a mano):');
    for (const s of invalidos) console.log('   ' + s);
}
if (SALIDA) { writeFileSync(SALIDA, cero.join('\n') + '\n', 'utf8'); console.log(`\nescritos ${cero.length} selectores sin elementos en ${SALIDA}`); }
salir(0);
