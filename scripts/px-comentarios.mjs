// Análisis VISUAL por píxeles del cajón de comentarios en reposo y con teclado:
// captura la pantalla y muestrea una columna vertical para reconstruir las
// bandas (header / cajón / nav / teclado) y detectar franjas anómalas.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'pxcom-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9288',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9288/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9288/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9288/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
      const img11 = mkImg(800,800,'#2255cc');
      const obrasMock = [
        { id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1, imagen_url: img45, etiquetas: 'Óleo', ano: 2024, ancho: 80, alto: 100, descripcion_tecnica: 'Óleo', soporte: 'Lienzo', marcos: 'No', estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Desc', procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena', likes_count: 2, views_count: 5, comments_count: 1, precio: '100', foto_artista: '' },
        { id: 2, titulo: 'Paisaje', artista: 'T', artista_user_id: 1, imagen_url: img11, etiquetas: 'Paisaje', ano: 2023, ancho: 50, alto: 50, descripcion_tecnica: 'A', soporte: 'Papel', marcos: 'No', estado_obra: 'Vendido', descripcion_artistica: 'D2', procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena', likes_count: 0, views_count: 3, comments_count: 0, precio: 'N/A', foto_artista: '' }
      ];
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

// Muestrear colores de la pantalla (2 columnas) para reconstruir bandas
const PROBE = `(async () => {
    const shot = await window.__shot();
    return 'noop';
})()`;

async function sampleScreen(label) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const b64 = shot.result.data;
    // Llevar la imagen al canvas y muestrear
    const sampled = await evalJs(`(async () => {
        const img = new Image();
        img.src = 'data:image/png;base64,${b64}';
        await new Promise(r => { img.onload = r; img.onerror = r; });
        const cv = document.createElement('canvas');
        const scale = 1;
        cv.width = Math.floor(img.width / scale);
        cv.height = Math.floor(img.height / scale);
        const x = cv.getContext('2d');
        x.drawImage(img, 0, 0, cv.width, cv.height);
        const out = [];
        const cols = [Math.floor(cv.width*0.5), Math.floor(cv.width*0.08)];
        for (let y = 0; y < cv.height; y += 4) {
            const row = cols.map(cx => {
                const d = x.getImageData(cx, y, 1, 1).data;
                return d[0] + ',' + d[1] + ',' + d[2];
            });
            out.push(y + ':' + row.join('|'));
        }
        return out.join(';');
    })()`);
    // Resumir: detectar cambios de color (bandas)
    const res = sampled.split(';').map(s => {
        const [y, colors] = s.split(':');
        return { y: +y, c: colors };
    });
    // Compactar bandas consecutivas iguales
    const bandas = [];
    for (const r of res) {
        const last = bandas[bandas.length - 1];
        if (last && last.c === r.c) last.to = r.y;
        else bandas.push({ from: r.y, to: r.y, c: r.c });
    }
    console.log(`\n[${label}] bandas de color (y: color, muestra mitad-derecha e izquierda):`);
    console.log(JSON.stringify(bandas.map(b => ({ y: b.from + '-' + b.to, c: b.c }))));
}
await sampleScreen('REPOSO sin teclado');

console.log('\n=== simular teclado abierto ===');
await evalJs(`(() => {
    document.body.classList.add('teclado-abierto');
    const drawer = document.getElementById('comentarios-drawer');
    drawer.style.bottom = '280px';
    return 'ok';
})()`);
await sleep(450);
await sampleScreen('TECLADO ABIERTO (280px)');

console.log('\n=== cerrar teclado ===');
await evalJs(`(() => {
    const drawer = document.getElementById('comentarios-drawer');
    drawer.style.bottom = '';
    document.body.classList.remove('teclado-abierto');
    return 'ok';
})()`);
await sleep(450);
await sampleScreen('TEclado cerrado - reposo');

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
