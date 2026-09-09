// Diagnóstico: reproduce el ANIMACIÓN real del teclado (eventos de resize
// encadenados ~cada 16ms, altura 900->620 como en Android) y mide en cada
// frame si el borde inferior del cajón coincide con la línea del teclado o si
// se DESFASA dejando una banda de página visible (causa de los parpadeos).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'teclag-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9292',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9292/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9292/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9292/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
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
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(1400);

const patch = await evalJs(`(() => {
    try {
        const vv = window.visualViewport;
        let h = vv.height;
        Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
        window.__setVvH = (x) => { h = x; window.dispatchEvent(new Event('resize')); };
        return 'ok';
    } catch (e) { return 'FAIL ' + e.message; }
})()`);
console.log('patch:', patch);

// Leer sincronizado (tras el resize, el listener ya corrió; bottom puede estar
// en plena transición CSS -> leer getBoundingClientRect)
async function medir() {
    return evalJs(`(() => {
        const d = document.getElementById('comentarios-drawer');
        const r = d.getBoundingClientRect();
        return { bottom: Math.round(r.bottom) };
    })()`);
}

// --- ABIERTO: teclado subiendo 900->620 en pasos de ~24px cada 16ms ---
// INVARIANTE: el borde inferior del cajón NUNCA debe quedar por ENCIMA de la
// línea del teclado (drawerBottom < vvH): eso dejaría ver la página entre el
// cajón y el teclado. Si drawerBottom >= vvH el cajón cubre hasta el teclado
// (o se extiende por detrás de él, invisible): correcto.
const hueco = (vvH, bordeDrawer) => Math.max(0, vvH - bordeDrawer);
console.log('\n=== ABIERTO (streaming: 900->620, 12 pasos x 16ms) ===');
const alturas = [];
for (let h = 900; h >= 620; h -= 24) alturas.push(h);
let huecosAbiertos = [];
for (let i = 0; i < alturas.length; i++) {
    const h = alturas[i];
    await evalJs(`__setVvH(${h})`);
    await sleep(16);
    const m = await medir();
    const hc = hueco(h, m.bottom);
    huecosAbiertos.push(hc);
    if (hc > 3) console.log(`  t=${i} vvH=${h} drawerBottom=${m.bottom} -> HUECO ${hc}px (página visible sobre el teclado)`);
}
const maxHuecoAbierto = Math.max(...huecosAbiertos);
console.log(`  hueco máximo durante apertura: ${maxHuecoAbierto}px ${maxHuecoAbierto > 3 ? '✗ SE VE FONDO' : '✓ pegado'}`);

// esperar a que termine el último paso
await sleep(400);

// --- CERRADO: teclado bajando 620->900 en pasos ---
console.log('\n=== CERRADO (streaming: 620->900, 12 pasos x 16ms) ===');
const cerr = [];
for (let h = 620; h <= 900; h += 24) cerr.push(h);
let huecosCerrados = [];
for (let i = 0; i < cerr.length; i++) {
    const h = cerr[i];
    await evalJs(`__setVvH(${h})`);
    await sleep(16);
    const m = await medir();
    const hc = hueco(h, m.bottom);
    huecosCerrados.push(hc);
    if (hc > 3) console.log(`  t=${i} vvH=${h} drawerBottom=${m.bottom} -> HUECO ${hc}px`);
}
const maxHuecoCerrado = Math.max(...huecosCerrados);
console.log(`  hueco máximo durante cierre: ${maxHuecoCerrado}px ${maxHuecoCerrado > 3 ? '✗ SE VE FONDO' : '✓ pegado'}`);

console.log('EXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log((maxHuecoAbierto <= 3 && maxHuecoCerrado <= 3) ? '\nRESULTADO: OK (sin huecos)' : '\nRESULTADO: HAY HUECOS (parpadeos)');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit((maxHuecoAbierto <= 3 && maxHuecoCerrado <= 3) ? 0 : 1);
