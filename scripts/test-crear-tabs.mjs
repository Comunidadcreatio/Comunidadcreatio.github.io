// Test de las etiquetas Cavents/Problogs dentro del "+" (panel de creación).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tabs-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9247',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9247/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9247/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9247/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com' }));
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('sesiones-activas')) return json({ success: true, count: 1 });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras')) return json({ obras: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);

// Abrir el panel Crear desde Cavents
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);

const estado = () => evalJs(`(() => {
    const tC = document.getElementById('tab-cavents');
    const tP = document.getElementById('tab-problogs');
    const pro = document.getElementById('crear-problogs-contenido');
    const form = document.getElementById('formulario-obra');
    const stepBar = document.getElementById('obra-step-bar');
    const tabs = document.getElementById('crear-tabs');
    const tr = tabs.getBoundingClientRect();
    const sr = stepBar.getBoundingClientRect();
    return JSON.stringify({
        tabCaventsActiva: tC.classList.contains('activa'),
        tabProblogsActiva: tP.classList.contains('activa'),
        creandoProblogs: document.body.classList.contains('creando-problogs'),
        formVisible: !form.classList.contains('hidden') && getComputedStyle(form).display !== 'none',
        proContenidoVisible: !pro.classList.contains('hidden'),
        stepBarVisible: getComputedStyle(stepBar).display !== 'none',
        tabsY: Math.round(tr.y), tabsBottom: Math.round(tr.bottom),
        stepBarY: Math.round(sr.y)
    });
})()`);

console.log('=== 1) Estado inicial (Cavents activa) ===');
console.log(await estado());

console.log('\n=== 2) Seleccionar Problogs → vacío ===');
await evalJs(`document.getElementById('tab-problogs').click()`);
await sleep(300);
console.log(await estado());

console.log('\n=== 3) Volver a Cavents → formulario ===');
await evalJs(`document.getElementById('tab-cavents').click()`);
await sleep(300);
console.log(await estado());

console.log('\n=== 4) Posición: etiquetas DEBAJO de la barra de pasos + sin relleno ===');
const pos = await evalJs(`(() => {
    const tabs = document.getElementById('crear-tabs');
    const stepBar = document.getElementById('obra-step-bar');
    const tr = tabs.getBoundingClientRect();
    const sr = stepBar.getBoundingClientRect();
    const nav = document.getElementById('toggle-panel').getBoundingClientRect();
    return JSON.stringify({
        tabsY: Math.round(tr.y), tabsBottom: Math.round(tr.bottom),
        stepBarY: Math.round(sr.y), stepBarBottom: Math.round(sr.bottom),
        navTop: Math.round(nav.top),
        tabsDebajoDeBarra: tr.y > sr.y,
        tabsBackground: getComputedStyle(tabs).backgroundColor
    });
})()`);
console.log(pos);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
