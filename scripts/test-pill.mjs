// Diagnóstico completo de la píldora "Actualizar ahora" en el escenario real:
// index.html con sesión falsa (app logueada), píldora abajo (bottom:80px).
// Prueba: clic programático, clic real de ratón y TOQUE táctil (móvil/APK).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'https://comunidadcreatio.vercel.app/';
const PORT = 9226;
const profileDir = mkdtempSync(join(tmpdir(), 'pill2-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--window-size=420,900', '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();

const STUB = `(() => {
    // Sesión falsa para que la app quede en index.html
    localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'Artista Test', email: 'test@test.com' }));
    // Versión local VIEJA → la píldora debe aparecer (version.json real = 1.0.443)
    localStorage.setItem('app_version', '1.0.441');
    // Stub del backend para que la app funcione sin red
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const u = String(input);
        if (u.includes('backend-fundacion-atpe.onrender.com')) {
            const json = async (data) => ({ ok: true, status: 200, json: async () => data });
            if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/obras')) return json({ obras: [] });
            return json({ success: true, no_leidas: 0, activas: 0, sin_leer: 0 });
        }
        return realFetch(input, init);
    };
})();`;

async function main() {
  let v;
  for (let i = 0; i < 40; i++) { try { v = await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
  if (!v) { console.log('NO CDP'); chrome.kill(); return; }
  const page = await (async () => { try { return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`); } catch { return (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } })();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[EXCEPTION] ${d.text} ${d.exception?.description || ''} @${d.url}:${d.lineNumber}`);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
      if (txt.startsWith('[PILL]')) logs.push(txt);
      else if (['error', 'warning'].includes(m.params.type)) logs.push(`[console.${m.params.type}] ${txt}`);
    }
  };
  const send = (method, params = {}) => new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });

  console.log(`CARGANDO ${URL}`);
  await send('Page.navigate', { url: URL });

  // Esperar a que la app quede en index.html (sesión válida) y aparezca la píldora
  for (let i = 0; i < 60; i++) {
    const state = await evalJs(`JSON.stringify({ href: location.href, pill: !!document.getElementById('update-pill') })`);
    const s = JSON.parse(state);
    if (s.href.includes('auth.html')) { console.log('Redirigió a auth.html — sesión no válida'); break; }
    if (s.pill) break;
    await sleep(400);
  }
  await sleep(800);

  const info = await evalJs(`(() => {
      const bar = document.getElementById('update-pill');
      if (!bar) return 'NO PILL';
      const btn = document.getElementById('btn-refresh-app');
      const r = btn.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      const top = document.elementFromPoint(cx, cy);
      // Probe: registrar cuándo dispara el onclick real
      const orig = btn.onclick;
      btn.onclick = function(e) {
          console.log('[PILL] onclick DISPARADO (target=' + (e.target?.tagName || '?') + ')');
          return orig.apply(this, arguments);
      };
      return JSON.stringify({
          href: location.href,
          pillText: bar.textContent.slice(0, 60),
          btnRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          center: { cx, cy },
          elementAtCenter: top ? top.tagName + '#' + top.id : null,
          isButtonAtCenter: top === btn,
          barZ: getComputedStyle(bar).zIndex,
          bodyOverflow: getComputedStyle(document.body).overflow
      });
  })()`);
  console.log('INFO:', info);

  const stateNow = () => evalJs(`JSON.stringify({ href: location.href, pill: !!document.getElementById('update-pill'), app_version: localStorage.getItem('app_version') })`);

  // --- 1) Clic programático (control: verifica que recargar() funciona) ---
  console.log('\n--- 1) Clic programático ---');
  await evalJs(`document.getElementById('btn-refresh-app').click(); 'ok'`);
  await sleep(2500);
  console.log('estado (2.5s):', await stateNow());

  // --- 2) Clic real de ratón SIN emulación táctil (escritorio puro) ---
  console.log('\n--- 2) Clic real de ratón (sin touch emulation) ---');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 60; i++) {
    const has = await evalJs(`!!document.getElementById('update-pill')`);
    if (has) break;
    await sleep(400);
  }
  await sleep(800);
  await evalJs(`(() => {
      document.addEventListener('click', (e) => console.log('[PILL] click BURBUJA target=' + (e.target?.tagName || '?') + '#' + (e.target?.id || '')), false);
      document.addEventListener('click', (e) => console.log('[PILL] click CAPTURA target=' + (e.target?.tagName || '?') + '#' + (e.target?.id || '')), true);
      return 'probes ok';
  })()`);
  const c2 = await evalJs(`(() => { const btn = document.getElementById('btn-refresh-app'); const r = btn.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  console.log('coords:', JSON.stringify(c2));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2.x, y: c2.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c2.x, y: c2.y, button: 'left', clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c2.x, y: c2.y, button: 'left', clickCount: 1 });
  await sleep(2500);
  console.log('estado (2.5s):', await stateNow());

  // --- 3) Toque táctil (móvil/APK) con touch emulation ---
  console.log('\n--- 3) Toque táctil (touch) ---');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 60; i++) {
    const has = await evalJs(`!!document.getElementById('update-pill')`);
    if (has) break;
    await sleep(400);
  }
  await sleep(800);
  await evalJs(`(() => {
      document.addEventListener('click', (e) => console.log('[PILL] click BURBUJA target=' + (e.target?.tagName || '?') + '#' + (e.target?.id || '')), false);
      document.addEventListener('click', (e) => console.log('[PILL] click CAPTURA target=' + (e.target?.tagName || '?') + '#' + (e.target?.id || '')), true);
      document.addEventListener('touchend', (e) => console.log('[PILL] touchend en document (defaultPrevented=' + e.defaultPrevented + ')'), true);
      return 'probes ok';
  })()`);
  const c3 = await evalJs(`(() => { const btn = document.getElementById('btn-refresh-app'); const r = btn.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  console.log('coords:', JSON.stringify(c3));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c3.x, y: c3.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
  await sleep(80);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(2500);
  console.log('estado (2.5s):', await stateNow());

  console.log('\n=== LOGS (' + logs.length + ') ===');
  logs.forEach(l => console.log(l));
  ws.close();
  chrome.kill();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
main().catch(e => { console.log('SCRIPT ERROR:', e.message); chrome.kill(); });
