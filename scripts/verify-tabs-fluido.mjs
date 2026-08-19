// Verifica la barra Cavents/Problogs del "+": baja, pestañas unidas y
// transición fluida (subrayado que crece/encoge + fade del contenido).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tabsv-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9248',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9248/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9248/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9248/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);

const geo = () => evalJs(`(() => {
    const bar = document.getElementById('crear-tabs');
    const tC = document.getElementById('tab-cavents');
    const tP = document.getElementById('tab-problogs');
    const stepBar = document.getElementById('obra-step-bar');
    const nav = document.getElementById('toggle-panel');
    const br = bar.getBoundingClientRect();
    const cr = tC.getBoundingClientRect();
    const pr = tP.getBoundingClientRect();
    const sr = stepBar.getBoundingClientRect();
    return JSON.stringify({
        barraH: Math.round(br.height),
        separacion: (pr.x - cr.right) + 'px',
        centrado: (Math.round((innerWidth - pr.right) - cr.x) === 0),
        bajoBarra: Math.round(cr.y) >= Math.round(sr.bottom),
        sobreNav: Math.round(br.bottom) <= Math.round(nav.getBoundingClientRect().y),
        bg: getComputedStyle(bar).backgroundColor,
        anchoCavents: Math.round(cr.width),
        anchoProblogs: Math.round(pr.width)
    });
})()`);
console.log('=== GEOMETRÍA ===');
console.log(await geo());

const subrayado = (sel) => evalJs(`(() => {
    const el = document.querySelector('${sel}');
    const after = getComputedStyle(el, '::after');
    return { op: after.opacity, scaleX: after.transform, transition: getComputedStyle(el).transition };
})()`);
console.log('\n=== SUBRAYADO (transición cruzada) ===');
console.log('antes — Cavents activa ::after:', JSON.stringify(await subrayado('#tab-cavents')));
console.log('antes — Problogs ::after:', JSON.stringify(await subrayado('#tab-problogs')));

await evalJs(`document.getElementById('tab-problogs').click()`);
await sleep(110); // mitad de la transición (0.25s)
console.log('t+110ms — Cavents ::after:', JSON.stringify(await subrayado('#tab-cavents')), '(debe estar encogiéndose)');
console.log('t+110ms — Problogs ::after:', JSON.stringify(await subrayado('#tab-problogs')), '(debe estar creciendo)');
console.log('t+110ms — placeholder animando:', await evalJs(`(() => {
    const p = document.getElementById('crear-problogs-contenido');
    const cs = getComputedStyle(p);
    return JSON.stringify({ animName: cs.animationName, display: cs.display, hidden: p.classList.contains('hidden') });
})()`));
await sleep(350);
console.log('t+460ms — Problogs ::after (final):', JSON.stringify(await subrayado('#tab-problogs')));

console.log('\n=== VOLVER A CAVENTS (fade del formulario) ===');
await evalJs(`document.getElementById('tab-cavents').click()`);
await sleep(110);
console.log('t+110ms — formulario animando:', await evalJs(`(() => {
    const f = document.getElementById('formulario-obra');
    return JSON.stringify({ animName: getComputedStyle(f).animationName, display: getComputedStyle(f).display, creandoProblogs: document.body.classList.contains('creando-problogs') });
})()`));
await sleep(350);
console.log('final:', await evalJs(`JSON.stringify({
    caventsActiva: document.getElementById('tab-cavents').classList.contains('activa'),
    problogsActiva: document.getElementById('tab-problogs').classList.contains('activa'),
    formVisible: getComputedStyle(document.getElementById('formulario-obra')).display !== 'none',
    stepBarVisible: getComputedStyle(document.getElementById('obra-step-bar')).display !== 'none'
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
