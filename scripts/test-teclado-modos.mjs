// Verifica el ajuste del teclado del cajón con el nuevo modelo:
//   - el CAJÓN nunca cambia de posición (su fondo llega siempre al borde
//     inferior de la pantalla)  ->  es imposible ver la página detrás.
//   - el CONTENIDO se sube con padding-bottom, medido sobre el borde inferior
//     del área del input, solo lo justo para dejarlo encima del teclado.
// Se simulan los distintos comportamientos de WebView.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'tecm-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9294',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9294/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9294/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9294/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) { console.log('EXC:', (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 300)); return null; }
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
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(1500);

const setup = await evalJs(`(() => {
    const vv = window.visualViewport;
    let h = vv.height, off = vv.offsetTop || 0;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => h });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => off });
    window.__setVv = (nh, no) => { h = nh; off = no || 0; window.dispatchEvent(new Event('resize')); };
    const d = document.getElementById('comentarios-drawer');
    const area = d.querySelector('.comentarios-input-area');
    // El JS mide con offsetTop/offsetHeight (independientes del transform):
    //   natural = drawer.offsetTop + area.offsetTop + area.offsetHeight + pad
    // Simulamos cada modo variando el offsetTop del cajón (que equivale a cómo
    // lo deja el WebView) y dejando que el área se encoja con el padding.
    window.__drawerOffTop = 180;
    Object.defineProperty(d, 'offsetTop', { configurable: true, get: () => window.__drawerOffTop });
    window.__AREA_TOPBASE = 594;   // area.offsetTop con padding 0 (medido real)
    window.__AREA_H = 66;
    Object.defineProperty(area, 'offsetTop', {
        configurable: true,
        get: () => window.__AREA_TOPBASE - (parseFloat(d.style.paddingBottom) || 0)
    });
    Object.defineProperty(area, 'offsetHeight', { configurable: true, get: () => window.__AREA_H });
    window.__estado = () => {
        const r = d.getBoundingClientRect();
        const pad = parseFloat(d.style.paddingBottom) || 0;
        const natural = window.__drawerOffTop + (window.__AREA_TOPBASE - pad) + window.__AREA_H + pad;
        return JSON.stringify({
            padding: pad,
            natural,
            drawerBottom: Math.round(r.bottom),
            inputBottom: Math.round(natural - pad),
            clase: document.body.classList.contains('teclado-abierto')
        });
    };
    return 'ok';
})()`);
console.log('setup:', setup);

async function correr(nombre, { vvH, offsetTop, drawerOffTop, innerH }, esperado) {
    await evalJs(`__drawerOffTop = ${drawerOffTop}`);
    if (innerH) await evalJs(`Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => ${innerH} })`);
    await evalJs(`__setVv(${vvH}, ${offsetTop})`);
    await sleep(320); // deja converger la interpolación por rAF
    const o = JSON.parse(await evalJs(`__estado()`));
    const keyboardTop = vvH + offsetTop;
    const sinPagina = o.drawerBottom >= keyboardTop; // el fondo del cajón cubre hasta el teclado
    const inputArriba = o.inputBottom <= keyboardTop + 1;
    const ok = o.padding === esperado.padding && o.clase === esperado.clase && sinPagina && inputArriba;
    console.log(`  ${ok ? '✓' : '✗'} ${nombre}: padding=${o.padding} inputBottom=${o.inputBottom} (teclado en ${keyboardTop}) navOculto=${o.clase} fondoCubre=${sinPagina}`);
    if (!ok) console.log(`      esperado padding=${esperado.padding} navOculto=${esperado.clase}`);
    return ok;
}

console.log('\n=== modos de WebView ===');
let ok = true;
// A) overlay simple: natural 840, teclado en 620 -> padding 220
ok = (await correr('A overlay simple', { vvH: 620, offsetTop: 0, drawerOffTop: 180 }, { padding: 220, clase: true })) && ok;
// B) auto-lift: el WebView ya dejó el cajón subido (natural 560) -> padding 0
ok = (await correr('B auto-lift (navegador ya sube)', { vvH: 620, offsetTop: 0, drawerOffTop: -100 }, { padding: 0, clase: true })) && ok;
// C) overlay + offsetTop: teclado en 720 -> padding 120 (no 220)
ok = (await correr('C overlay con offsetTop=100', { vvH: 620, offsetTop: 100, drawerOffTop: 180 }, { padding: 120, clase: true })) && ok;
// D) resizes-content: layout reducido (natural 560), teclado 620 -> 0
ok = (await correr('D resizes-content', { vvH: 620, offsetTop: 0, drawerOffTop: -100, innerH: 620 }, { padding: 0, clase: true })) && ok;
// E) teclado más bajo que el espacio del nav: natural 840, teclado 860 -> 0
ok = (await correr('E teclado bajo (40px)', { vvH: 860, offsetTop: 0, drawerOffTop: 180 }, { padding: 0, clase: true })) && ok;

// Cerrar teclado
await evalJs(`Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 900 })`);
await evalJs(`__setVv(900, 0)`);
await sleep(320);
const o = JSON.parse(await evalJs(`__estado()`));
const okCierre = o.padding === 0 && o.clase === false;
console.log(`  ${okCierre ? '✓' : '✗'} F teclado cerrado: padding=${o.padding} navOculto=${o.clase}`);
ok = ok && okCierre;

await evalJs(`__drawerOffTop = 180`);
console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: FALLOS');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
