// Verifica el encuadre manual INLINE tras los 3 fixes:
// 1) El chip "Cancelar" aparece al lado del botón Cuadrar (abajo, a la derecha).
// 2) Al activar la herramienta, el botón muestra el icono de GUARDAR (check).
// 3) Al guardar, la imagen resultante mantiene la razón RETRATO del marco
//    (h/w ≈ 1.25, p.ej. 866×1080) — no paisaje (bug de vh/vw invertida).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'cuadro2-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9276',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9276/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9276/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9276/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(900);
await evalJs(`document.getElementById('btn-crear-cavent').click()`);
await sleep(900);

console.log('=== 1) Agregar imagen (1200×900) ===');
await evalJs(`(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#cc3344'; x.fillRect(0,0,1200,900);
    x.fillStyle = '#ffee00'; x.fillRect(300,200,600,500);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    const inp = document.getElementById('input-imagen-0');
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
})()`);
await sleep(1800);
console.log(await evalJs(`JSON.stringify({
    editar: !!document.querySelector('.btn-editar-slide'),
    cuadrar: !!document.querySelector('.btn-cuadrar-slide')
})`));

console.log('\n=== 2) Pulsar Cuadrar → modo inline activo ===');
await evalJs(`document.querySelector('.btn-cuadrar-slide').click()`);
await sleep(1000);
console.log(await evalJs(`JSON.stringify({
    inlineModo: !!document.querySelector('.carrusel-slide.inline-modo'),
    chip: !!document.querySelector('.inline-cancel-chip'),
    label: document.querySelector('.inline-tool-label')?.textContent || '(sin label)',
    cuadrarActivo: document.querySelector('.btn-cuadrar-slide').classList.contains('modo-activo'),
    editarActivo: document.querySelector('.btn-editar-slide:not(.btn-cuadrar-slide)').classList.contains('modo-activo')
})`));

console.log('\n=== 3) FIX 2: icono del botón activo = check ===');
console.log(await evalJs(`(() => {
    const btn = document.querySelector('.btn-cuadrar-slide');
    const normal = getComputedStyle(btn.querySelector('.icon-normal')).display;
    const check = getComputedStyle(btn.querySelector('.icon-check')).display;
    const aria = btn.getAttribute('aria-label');
    return JSON.stringify({ iconNormalVisible: normal !== 'none', iconCheckVisible: check !== 'none', ariaLabel: aria });
})()`));

console.log('\n=== 4) FIX 1: chip Cancelar al lado del botón Cuadrar (abajo) ===');
console.log(await evalJs(`(() => {
    const chip = document.querySelector('.inline-cancel-chip').getBoundingClientRect();
    const btn = document.querySelector('.btn-cuadrar-slide').getBoundingClientRect();
    const slide = document.querySelector('.carrusel-slide.inline-modo').getBoundingClientRect();
    return JSON.stringify({
        chipLeft: Math.round(chip.left), chipBottom: Math.round(slide.bottom - chip.bottom),
        btnLeft: Math.round(btn.left), btnRight: Math.round(btn.right), btnBottom: Math.round(slide.bottom - btn.bottom),
        chipALaDerechaDelBoton: chip.left > btn.right,
        ambosAbajo: (slide.bottom - chip.bottom) < slide.height * 0.3 && (slide.bottom - btn.bottom) < slide.height * 0.3,
        chipNoCentrado: Math.abs(chip.left - (slide.left + slide.width/2)) > 60
    });
})()`));

console.log('\n=== 5) Pinch → escala aumenta ===');
const vp = await evalJs(`(() => { const r = document.querySelector('.carrusel-slide.inline-modo').getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
  { x: vp.x - 20, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: vp.x + 20, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(80);
await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
  { x: vp.x - 80, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 1 },
  { x: vp.x + 80, y: vp.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }
] });
await sleep(150);
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(200);
const trasPinch = await evalJs(`document.querySelector('.carrusel-slide.inline-modo img').style.transform`);
console.log('transform tras pinch:', trasPinch);

console.log('\n=== 6) FIX 3: guardar → imagen retrato con la razón del marco ===');
await evalJs(`document.querySelector('.btn-cuadrar-slide').click()`);
await sleep(1800);
console.log(await evalJs(`(async () => {
    const img = document.querySelector('#carrusel-track .carrusel-slide img');
    const src = img.src;
    const dim = await new Promise((res) => {
        const t = new Image();
        t.onload = () => res({ w: t.naturalWidth, h: t.naturalHeight });
        t.onerror = () => res({ error: true });
        t.src = src;
    });
    const chipGone = !document.querySelector('.inline-cancel-chip');
    const modoOff = !document.querySelector('.btn-cuadrar-slide').classList.contains('modo-activo');
    return JSON.stringify({ srcTipo: src.slice(0, 18), dim, ratioHW: dim.h ? +(dim.h/dim.w).toFixed(2) : null, retrato: dim.h > dim.w, chipGone, modoOff });
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
