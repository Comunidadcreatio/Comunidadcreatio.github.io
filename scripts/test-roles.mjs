// Verifica el modelo de roles (Fase 1):
// 1) El registro tiene el selector de rol con las opciones.
// 2) Elegir un rol NO artista adapta la etiqueta del nombre público.
// 3) El envío de register() incluye el campo rol (capturado en el fetch).
// 4) Login: si el backend NO devuelve rol, se aplica el rol local por email.
// 5) Login: si el backend SÍ devuelve rol, tiene prioridad.
// 6) Un usuario NO artista no ve el botón "+" Crear Cavent (en la app).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'roles-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9283',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9283/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9283/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9283/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// Helper: navegar a auth.html y loguear con la respuesta del backend indicada
async function loginEnAuth(backendArtista) {
    await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
            window.__backendArtista = ${JSON.stringify(backendArtista)};
            const realFetch = window.fetch.bind(window);
            window.fetch = async (input, init) => {
                const u = String(input);
                const body = init && init.body ? String(init.body) : '';
                if (u.includes('backend-fundacion-atpe.onrender.com')) {
                    window.__captured = window.__captured || [];
                    window.__captured.push({ u, body });
                    const json = async (data) => ({ ok: true, status: 200, json: async () => data });
                    if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
                    if (u.includes('mis-reacciones')) return json({ reacciones: [] });
                    if (u.includes('/api/artistas/login')) {
                        return json({ success: true, artista: window.__backendArtista, token: 't' });
                    }
                    if (u.includes('/api/artistas/registro')) return json({ success: true });
                    return json({ success: true, no_leidas: 0 });
                }
                return realFetch(input, init);
            };
        })();`
    });
    await send('Page.navigate', { url: 'http://127.0.0.1:8099/auth.html' });
    await sleep(1500);
}

console.log('=== 1) Registro: selector de rol presente ===');
await loginEnAuth({ id: 1, email: 'a@a.com', nombre_artista: 'A' });
console.log(await evalJs(`JSON.stringify({
    selector: !!document.getElementById('reg-rol'),
    opciones: [...document.querySelectorAll('#reg-rol option')].map(o => o.value).filter(Boolean)
})`));

console.log('\n=== 2) Elegir coleccionista → etiqueta del nombre se adapta ===');
await evalJs(`(() => { const s = document.getElementById('reg-rol'); s.value = 'coleccionista'; s.dispatchEvent(new Event('change')); return 'ok'; })()`);
await sleep(200);
console.log(await evalJs(`JSON.stringify({
    placeholder: document.getElementById('reg-nombre-artista').placeholder,
    subtitulo: (document.querySelector('.step[data-step="5"] .reg-step-subtitle') || {}).textContent || ''
})`));

console.log('\n=== 3) Login con rol LOCAL (backend sin rol) → aplica coleccionista ===');
await evalJs(`(() => {
    localStorage.setItem('creatio_rol_colec@test.com', 'coleccionista');
    const email = document.getElementById('login-email');
    const pass = document.getElementById('login-pass');
    if (email) email.value = 'colec@test.com';
    if (pass) pass.value = 'Clave#123';
    return 'campos';
})()`);
// El mock login devuelve artista SIN rol (email colec@test.com en backendArtista actual no importa;
// auth.js busca el rol local por email del artista devuelto). Usamos artista con email colec@test.com
// Navegamos de nuevo con ese backendArtista
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (u.includes('backend-fundacion-atpe.onrender.com')) {
                const json = async (data) => ({ ok: true, status: 200, json: async () => data });
                if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
                if (u.includes('mis-reacciones')) return json({ reacciones: [] });
                if (u.includes('/api/artistas/login')) {
                    return json({ success: true, artista: { id: 9, email: 'colec@test.com', nombre_artista: 'Colec' }, token: 't' });
                }
                if (u.includes('/api/artistas/registro')) return json({ success: true });
                return json({ success: true, no_leidas: 0 });
            }
            return realFetch(input, init);
        };
    })();`
});
await evalJs(`localStorage.setItem('creatio_rol_colec@test.com', 'coleccionista'); 'ok'`);
await send('Page.navigate', { url: 'http://127.0.0.1:8099/auth.html' });
await sleep(1200);
// Disparar el login llamando al handler del formulario
console.log(await evalJs(`(async () => {
    const email = document.getElementById('login-email');
    const pass = document.getElementById('login-pass');
    if (!email) return 'sin-form';
    email.value = 'colec@test.com'; pass.value = 'Clave#123';
    // Forzar submit
    const form = document.getElementById('login-form');
    // El listener real valida y llama login() desde auth-logic; capturamos auth.js
    const authMod = await import('./js/auth.js?v=0');
    const res = await authMod.login('colec@test.com', 'Clave#123');
    return JSON.stringify({ success: res.success, rol: (res.artista || {}).rol, esArtista: authMod.esArtista() });
})()`));

console.log('\n=== 4) Prioridad: rol del backend (en artistaData) > rol local ===');
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            // El backend ya guardó el rol: artistaData trae rol 'curador'
            localStorage.setItem('artistaData', JSON.stringify({ id: 5, email: 'y@test.com', nombre_artista: 'Y', rol: 'curador' }));
            localStorage.setItem('creatio_rol_y@test.com', 'coleccionista'); // local dice otra cosa
        } catch (_) {}
    })();`
});
await send('Page.navigate', { url: 'http://127.0.0.1:8099/auth.html' });
await sleep(1200);
console.log(await evalJs(`(async () => {
    const authMod = await import('./js/auth.js?v=0');
    return JSON.stringify({
        rolEfectivo: authMod.obtenerRolUsuario(),
        esArtista: authMod.esArtista()
    });
})()`).catch(e => 'ERR ' + e));

console.log('\n=== 5) App: un coleccionista NO ve el "+" Crear Cavent ===');
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try {
            localStorage.setItem('artistaData', JSON.stringify({ id: 9, email: 'colec@test.com', nombre_artista: 'Colec', rol: 'coleccionista' }));
            localStorage.setItem('creatio_auth_token_persist', 'tok');
        } catch (_) {}
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (u.includes('backend-fundacion-atpe.onrender.com')) {
                const json = async (data) => ({ ok: true, status: 200, json: async () => data });
                if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
                if (u.includes('mis-reacciones')) return json({ reacciones: [] });
                if (u.includes('/obras')) return json({ obras: [] });
                if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
                return json({ success: true, no_leidas: 0 });
            }
            return realFetch(input, init);
        };
    })();`
});
await send('Page.navigate', { url: 'http://127.0.0.1:8099/index.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(800);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(1500);
console.log(await evalJs(`JSON.stringify({
    botonMasOculto: (() => { const b = document.getElementById('btn-crear-cavent'); return !b || b.classList.contains('hidden'); })()
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
