// Mide los fondos de los acordeones de Mi Cuenta (light y dark).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'acc-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9234',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9234/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9234/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9234/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
await evalJs(`document.getElementById('btn-configuracion').click()`);
await sleep(700);

const dump = () => evalJs(`(() => {
    const conFondo = [];
    const walk = (el, depth) => {
        if (!el || depth > 8) return;
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            conFondo.push((el.className || el.id || el.tagName) + ' → ' + bg);
        }
        for (const c of el.children) walk(c, depth + 1);
    };
    walk(document.getElementById('mi-cuenta'), 0);
    return JSON.stringify({
        theme: document.documentElement.getAttribute('data-theme'),
        conFondo
    });
})()`);

console.log('=== MODO CLARO ===');
await evalJs(`localStorage.setItem('theme','light'); location.reload()`);
await sleep(2500);
await evalJs(`document.getElementById('btn-configuracion').click()`);
await sleep(700);
console.log(await dump());
// Hover real sobre el primer accordion-header
const r1 = await evalJs(`(() => { const el = document.querySelector('.accordion-header'); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2) }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r1.x, y: r1.y });
await sleep(200);
console.log('hover claro:', await evalJs(`getComputedStyle(document.querySelector('.accordion-header')).backgroundColor`));

console.log('=== MODO OSCURO ===');
await evalJs(`localStorage.setItem('theme','dark'); location.reload()`);
await sleep(2500);
await evalJs(`document.getElementById('btn-configuracion').click()`);
await sleep(700);
console.log(await dump());
const r2 = await evalJs(`(() => { const el = document.querySelector('.accordion-header'); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2) }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r2.x, y: r2.y });
await sleep(200);
console.log('hover oscuro:', await evalJs(`getComputedStyle(document.querySelector('.accordion-header')).backgroundColor`));

ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
