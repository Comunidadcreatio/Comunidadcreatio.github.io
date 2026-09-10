// Sonda: valores de layout (offsetTop/offsetHeight: NO afectados por transform)
// frente a los de getBoundingClientRect (SÍ afectados) para el cajón y su área
// de input, en reposo y durante el deslizamiento de apertura.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'probe-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9295',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9295/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9295/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9295/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 200)); return null; }
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, c) => { const cv = document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d'); x.fillStyle=c; x.fillRect(0,0,w,h); return cv.toDataURL('image/jpeg',0.8); };
      const img45 = mkImg(800,1000,'#cc3344');
      const obrasMock = [{ id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Óleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Óleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' }];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras/1/comentarios')) return json({ comentarios: [] });
              if (u.includes('/obras')) return json(obrasMock);
              if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
              return json({ success: true, no_leidas: 0 });
          }
          return realFetch(input, init);
      };
  })();`
});
await send('Page.navigate', { url: process.argv[2] || 'http://127.0.0.1:8099/' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`)) break; await sleep(300); }
await sleep(800);
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(2000);

const medir = `(() => {
    const d = document.getElementById('comentarios-drawer');
    const a = d.querySelector('.comentarios-input-area');
    const dr = d.getBoundingClientRect(), ar = a.getBoundingClientRect();
    return JSON.stringify({
        d_offTop: d.offsetTop, d_offH: d.offsetHeight,
        d_rectTop: Math.round(dr.top), d_rectBottom: Math.round(dr.bottom),
        a_offTop: a.offsetTop, a_offH: a.offsetHeight,
        a_rectBottom: Math.round(ar.bottom),
        pad: parseFloat(d.style.paddingBottom) || 0,
        offsetParentD: d.offsetParent ? (d.offsetParent.tagName || 'null') : 'null',
        offsetParentA: a.offsetParent ? (a.offsetParent.id || a.offsetParent.tagName) : 'null'
    });
})()`;

console.log('=== durante la apertura del cajón (transform animando) ===');
await evalJs(`document.querySelector('.metrica-comentario').click()`);
for (let i = 0; i < 6; i++) {
    console.log(' ', await evalJs(medir));
    await sleep(70);
}
await sleep(500);
console.log('=== en reposo (transform 0) ===');
console.log(' ', await evalJs(medir));
// comprobar fórmula propuesta: natural = a_rectBottom - (d_rectTop - d_offTop) + pad
console.log('=== fórmula vs real ===');
console.log(await evalJs(`(() => {
    const d = document.getElementById('comentarios-drawer');
    const a = d.querySelector('.comentarios-input-area');
    const dr = d.getBoundingClientRect(), ar = a.getBoundingClientRect();
    const pad = parseFloat(d.style.paddingBottom) || 0;
    const desplaz = dr.top - d.offsetTop;
    const natural = ar.bottom - desplaz + pad;
    // referencia: aplicando un padding conocido y volviendo a medir
    return JSON.stringify({ desplazTransform: Math.round(desplaz), naturalForm: Math.round(natural), areaBottomReal: Math.round(ar.bottom), pad });
})()`));
console.log('EXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
