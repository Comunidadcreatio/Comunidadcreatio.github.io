// Diagnóstico visual completo del cajón de comentarios en 3 fases:
// A) reposo (abierto, sin teclado)  B) teclado abierto  C) tras cerrar teclado.
// Mide geometría de drawer/input/lista/nav/header + colores de fondo + overlap.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'diagcom-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9287',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9287/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9287/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9287/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(1300);

const MEDIR = `(() => {
    const drawer = document.getElementById('comentarios-drawer');
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
    const nav = document.getElementById('toggle-panel');
    const header = document.getElementById('main-header');
    const input = document.getElementById('comentarios-input');
    const lista = document.getElementById('comentarios-lista');
    const area = drawer.querySelector('.comentarios-input-area');
    const cab = drawer.querySelector('.comentarios-drawer-header');
    const dr = drawer.getBoundingClientRect();
    return {
        bodyTeclado: document.body.classList.contains('teclado-abierto'),
        drawerVisible: drawer.classList.contains('visible'),
        drawerStyle: { bottom: drawer.style.bottom, transform: drawer.style.transform, transition: drawer.style.transition },
        drawer: rect(drawer),
        nav: rect(nav), navDisplay: getComputedStyle(nav).display,
        header: rect(header),
        input: rect(input),
        area: rect(area), areaMB: getComputedStyle(area).marginBottom,
        lista: rect(lista), listaLargo: lista.scrollHeight,
        cab: rect(cab),
        drawerBg: getComputedStyle(drawer).backgroundColor,
        inputFondoPantalla: Math.round(window.innerHeight - input.getBoundingClientRect().bottom),
        areaFondoPantalla: Math.round(window.innerHeight - area.getBoundingClientRect().bottom),
        viewport: window.innerHeight
    };
})()`;

console.log('=== A) Cajón abierto en REPOSO (sin teclado) ===');
console.log(await evalJs(MEDIR));

console.log('\n=== B) Simular teclado ABIERTO (bottom=280 + clase) ===');
console.log(await evalJs(`(() => {
    document.body.classList.add('teclado-abierto');
    const drawer = document.getElementById('comentarios-drawer');
    drawer.style.bottom = '280px';
    return 'ok';
})()`));
await sleep(500);
console.log(await evalJs(MEDIR));

console.log('\n=== C) Simular CIERRE del teclado (bottom limpio) ===');
console.log(await evalJs(`(() => {
    const drawer = document.getElementById('comentarios-drawer');
    drawer.style.bottom = '';
    return 'ok';
})()`));
await sleep(450);
console.log(await evalJs(`(() => {
    document.body.classList.remove('teclado-abierto');
    const drawer = document.getElementById('comentarios-drawer');
    const out = ${MEDIR.split('//')[0]};
    // doble medición final
    return out;
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
