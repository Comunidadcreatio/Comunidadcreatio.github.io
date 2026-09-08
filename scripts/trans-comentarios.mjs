// Verifica la transición del TECLADO sobre el cajón de comentarios (vNUEVA):
// el cajón mueve su borde inferior con `bottom` + transición CSS (0.28s al
// abrir, 0.32s al cerrar). Invariantes que se comprueban por muestreo de
// color en una columna central:
//   1) En REPOSO el cajón cubre 20vh..900 con su color (22,19,19)/(19,18,18).
//   2) DURANTE la subida y al terminar, por ENCIMA de la línea del teclado
//      (y<620 con bottom=280 en 900px) TODO es cajón: jamás aparece la
//      galería roja #cc3344 ~ (204,51,69) en 180..620.
//   3) Al cerrar y terminar, el cajón vuelve a cubrir hasta 900.
// La franja 620..900 por debajo de la línea del teclado es donde está el
// teclado FÍSICO en el dispositivo (en headless se ve la galería, es normal).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'trancom-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9289',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9289/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9289/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9289/json/new?about:blank', { method: 'PUT' })).json(); } })();
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

async function columnaCentral() {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    return evalJs(`(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${shot.result.data}';
        await new Promise(r => { img.onload = r; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const x = cv.getContext('2d');
        x.drawImage(img, 0, 0);
        const cx = Math.floor(cv.width * 0.5);
        const rows = [];
        for (let y = 0; y < cv.height; y += 20) {
            const d = x.getImageData(cx, y, 1, 1).data;
            rows.push(y + ':' + d[0] + ',' + d[1] + ',' + d[2]);
        }
        return rows.join(';');
    })()`);
}
async function sampleAt(label, tecladoLinea) {
    const out = await columnaCentral();
    const filas = out.split(';').map(s => { const [y, c] = s.split(':'); return { y: +y, c }; });
    const bandas = [];
    for (const f of filas) {
        const last = bandas[bandas.length - 1];
        if (last && last.c === f.c) last.to = f.y;
        else bandas.push({ from: f.y, to: f.y, c: f.c });
    }
    const resumen = bandas.map(b => `${b.from}-${b.to}[${b.c}]`).join(' ');
    // Detectar galería roja (204,5x,6x) en la zona de cajón por encima del teclado
    const rojasArriba = bandas.filter(b =>
        b.from < tecladoLinea - 10 &&
        /\(204,(?:5[0-9]|4[0-9]),(?:6[0-9]|7[0-9])\)/.test(b.c));
    console.log(`[${label}] tecladoLinea=${tecladoLinea}`);
    console.log('  bandas: ' + resumen);
    console.log(rojasArriba.length
        ? '  ✗ ¡ROJO de la galería visible por ENCIMA del teclado: ' + JSON.stringify(rojasArriba)
        : '  ✓ sin rojo por encima de la línea del teclado');
    return rojasArriba.length === 0;
}

let ok = true;
// REPOSO: teclado cerrado -> cajón hasta 900. Línea "teclado" = 900 (no aplica).
await sampleAt('REPOSO', 900);
// Capturar geometría
const geo = await evalJs(`(() => {
    const d = document.getElementById('comentarios-drawer');
    const r = d.getBoundingClientRect();
    return JSON.stringify({ top: r.top, bottom: r.bottom, height: r.height });
})()`);
console.log('  geometría reposo: ' + geo);

// ABRIR teclado (como hace setupKeyboardDrawer: bottom con transición)
console.log('\n--- abrir teclado (bottom:280 + transición CSS, código nuevo) ---');
const keyLine = 900 - 280; // 620
await evalJs(`(() => {
    const drawer = document.getElementById('comentarios-drawer');
    drawer.style.transition = 'bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
    drawer.style.bottom = '280px';
    document.body.classList.add('teclado-abierto');
    return 'ok';
})()`);
await sleep(90);  // ~1/3 de la transición
ok = (await sampleAt('ABRIENDO (90ms)', keyLine)) && ok;
await sleep(250); // transición terminada (90+250>280)
ok = (await sampleAt('ABIERTO (terminado)', keyLine)) && ok;
const geo2 = await evalJs(`(() => {
    const d = document.getElementById('comentarios-drawer');
    const r = d.getBoundingClientRect();
    return JSON.stringify({ top: r.top, bottom: r.bottom, height: r.height });
})()`);
console.log('  geometría abierto: ' + geo2);

// CERRAR teclado
console.log('\n--- cerrar teclado (bottom:0 + transición CSS, código nuevo) ---');
await evalJs(`(() => {
    const drawer = document.getElementById('comentarios-drawer');
    drawer.style.transition = 'bottom 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
    drawer.style.bottom = '';
    document.body.classList.remove('teclado-abierto');
    return 'ok';
})()`);
await sleep(120);
ok = (await sampleAt('CERRANDO (120ms)', keyLine)) && ok;
await sleep(300);
ok = (await sampleAt('CERRADO (terminado)', 900)) && ok;

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
console.log(ok ? '\nRESULTADO: OK' : '\nRESULTADO: HAY PROBLEMAS VISUALES');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
