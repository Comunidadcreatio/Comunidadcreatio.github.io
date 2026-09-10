// Verifica que el área de escribir comentarios quede visible JUSTO ENCIMA del
// nav principal (#toggle-panel) y no tapada por él.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'coment-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9285',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9285/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9285/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9285/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
          localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const mkImg = (w, h, color) => {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
          return cv.toDataURL('image/jpeg', 0.8);
      };
      const img45 = mkImg(800, 1000, '#cc3344');
      const obrasMock = [
          { id: 1, titulo: 'Retrato', artista: 'T', artista_user_id: 1,
            imagen_url: img45, etiquetas: 'Óleo', ano: 2024, ancho: 80, alto: 100,
            descripcion_tecnica: 'Óleo', soporte: 'Lienzo', marcos: 'No',
            estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Descripción',
            procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena',
            likes_count: 2, views_count: 5, comments_count: 1, precio: '100',
            foto_artista: '' }
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
await sleep(2200);

console.log('=== Abrir comentarios (icono) ===');
await evalJs(`document.querySelector('.metrica-comentario').click()`);
await sleep(1200);
console.log(await evalJs(`(() => {
    const drawer = document.getElementById('comentarios-drawer');
    const inputArea = drawer.querySelector('.comentarios-input-area');
    const nav = document.getElementById('toggle-panel');
    const dr = drawer.getBoundingClientRect();
    const ia = inputArea.getBoundingClientRect();
    const nv = nav.getBoundingClientRect();
    return JSON.stringify({
        visible: drawer.classList.contains('visible'),
        drawerBottom: Math.round(dr.bottom),
        navTop: Math.round(nv.top),
        inputAreaBottom: Math.round(ia.bottom),
        // El área de input debe terminar justo donde empieza el nav (encima)
        inputVisibleSobreNav: ia.bottom <= nv.top + 2 && ia.top < nv.top,
        drawerNoTapaNav: dr.bottom <= nv.top + 2,
        inputRect: { top: Math.round(ia.top), bottom: Math.round(ia.bottom) },
        navRect: { top: Math.round(nv.top), bottom: Math.round(nv.bottom) }
    });
})()`));

console.log('\n=== Geometría continuidad (sin hueco) ===');
console.log(await evalJs(`(() => {
    const drawer = document.getElementById('comentarios-drawer');
    const input = document.getElementById('comentarios-input');
    const nav = document.getElementById('toggle-panel');
    const dr = drawer.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    const nv = nav.getBoundingClientRect();
    return JSON.stringify({
        sinAvatar: !document.getElementById('comentarios-avatar'),
        drawerBottomEnPantalla: Math.abs(dr.bottom - window.innerHeight) < 2,
        inputBottomSobreNav: ir.bottom <= nv.top + 2 && ir.bottom > nv.top - 60,
        huecoEntreInputYNav: Math.round(nv.top - ir.bottom),
        drawer: { top: Math.round(dr.top), bottom: Math.round(dr.bottom) },
        input: { top: Math.round(ir.top), bottom: Math.round(ir.bottom) },
        nav: { top: Math.round(nv.top), bottom: Math.round(nv.bottom) }
    });
})()`));

console.log('\n=== Simular teclado abierto: cajón y lista inmóviles, input arriba ===');
console.log(await evalJs(`(() => {
    // Nuevo modelo: el cajón NO se mueve (su fondo llega siempre al borde
    // inferior de la pantalla) y la lista tampoco: solo sube el ÁREA del input
    // con un transform.
    document.body.classList.add('teclado-abierto');
    const drawer = document.getElementById('comentarios-drawer');
    const area = document.querySelector('.comentarios-input-area');
    const lista = document.getElementById('comentarios-lista');
    const listaAntes = lista.getBoundingClientRect();
    const cajonAntes = drawer.getBoundingClientRect();
    const teclado = 280;
    area.style.transform = 'translateY(-220px)'; // 280 - 60 del espacio del nav
    const input = document.getElementById('comentarios-input');
    const nav = document.getElementById('toggle-panel');
    const ir = input.getBoundingClientRect();
    const dr = drawer.getBoundingClientRect();
    const nv = nav.getBoundingClientRect();
    const listaDespues = lista.getBoundingClientRect();
    const navOculto = nv.height === 0 || getComputedStyle(nav).display === 'none';
    const marginBottom = getComputedStyle(area).marginBottom;
    const fondo = window.innerHeight;
    return JSON.stringify({
        navOculto,
        marginBottomNav: marginBottom,           // conserva su espacio para el nav
        fondoDelCajonCubre: dr.bottom >= (fondo - teclado),
        cajonInmovil: Math.abs(dr.top - cajonAntes.top) < 1,
        listaInmovil: Math.abs(listaDespues.top - listaAntes.top) < 1
                      && Math.abs(listaDespues.bottom - listaAntes.bottom) < 1,
        inputSobreElTeclado: ir.bottom <= (fondo - teclado) + 1,
        inputConAire: (fondo - teclado) - ir.bottom >= 8 && (fondo - teclado) - ir.bottom <= 20,
        transformAplicado: area.style.transform
    });
})()`));
await evalJs(`(() => {
    const area = document.querySelector('.comentarios-input-area');
    area.style.transform = '';
    document.body.classList.remove('teclado-abierto');
})()`);

console.log('\n=== Cerrar comentarios (limpia teclado-abierto) ===');
await evalJs(`document.getElementById('comentarios-close').click()`);
await sleep(800);
console.log(await evalJs(`JSON.stringify({
    oculto: document.getElementById('comentarios-drawer').classList.contains('hidden'),
    tecladoLimpio: !document.body.classList.contains('teclado-abierto')
})`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
