// Inspecciona en vivo las dimensiones y estilos de #crear-tabs y .crear-tab.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tabsp-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9238',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9238/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9238/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9238/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
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
              if (u.includes('/obras') && !u.includes('reacciones')) return json({ obras: [] });
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(400); }
await sleep(800);
// Abrir el panel de creación (flujo correcto: Cavents → "+")
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);
console.log(await evalJs(`(() => {
    const bar = document.getElementById('crear-tabs');
    const tab = document.getElementById('tab-cavents');
    const tab2 = document.getElementById('tab-problogs');
    const stepBar = document.getElementById('obra-step-bar');
    const nav = document.getElementById('toggle-panel');
    const br = bar.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const tr2 = tab2.getBoundingClientRect();
    const sr = stepBar.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    const cs = getComputedStyle(tab);
    const csb = getComputedStyle(bar);
    return JSON.stringify({
        bar: { y: Math.round(br.y), h: Math.round(br.height), bottom: Math.round(br.bottom), display: csb.display, justify: csb.justifyContent, gap: csb.gap, bg: csb.backgroundColor },
        tabCavents: { x: Math.round(tr.x), w: Math.round(tr.width), right: Math.round(tr.right) },
        tabProblogs: { x: Math.round(tr2.x), w: Math.round(tr2.width), right: Math.round(tr2.right) },
        stepBar: { y: Math.round(sr.y), bottom: Math.round(sr.bottom) },
        navTop: Math.round(nr.y),
        tabPadding: cs.padding, tabFontSize: cs.fontSize, tabMinWidth: cs.minWidth, tabFlex: cs.flex,
        tabsDebajoDeBarra: Math.round(tr.y) >= Math.round(sr.bottom),
        tabsSobreNav: Math.round(br.bottom) <= Math.round(nr.y),
        unidas: (tr2.x - tr.right) + 'px de separación'
    });
})()`));
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
