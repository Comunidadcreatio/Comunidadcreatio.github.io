// Test de integración del círculo de refresco (pull-to-refresh del grid).
// Lanza Chrome headless, inyecta sesión falsa + stub del backend, abre el grid
// de Explorar y simula gestos táctiles reales vía CDP. Reporta estados del
// indicador (visible/ready/loading/done) y cualquier excepción de consola.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'http://127.0.0.1:8099/';
const PORT = 9224;

const profileDir = mkdtempSync(join(tmpdir(), 'ptr-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--window-size=420,900', '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();

// Stub que se inyecta ANTES de cargar la página: sesión local + backend falso.
const STUB = `(() => {
    localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'Artista Test', email: 'test@test.com', pais: 'Venezuela' }));
    const SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#888"/></svg>');
    const obras = Array.from({ length: 9 }, (_, i) => ({
        id: i + 1,
        titulo: 'Obra de prueba ' + (i + 1),
        artista: 'Artista ' + (i + 1),
        precio: (i + 1) * 10,
        views_count: 100 + i,
        likes_count: i,
        comments_count: 0,
        imagen_url: SVG,
        etiquetas: i % 2 ? 'paisaje,abstracto' : 'retrato',
        artista_user_id: 1
    }));
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const u = String(input);
        if (u.includes('backend-fundacion-atpe.onrender.com')) {
            const json = async (data) => ({ ok: true, status: 200, json: async () => data });
            if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            if (u.includes('/obras') && !u.includes('reacciones')) {
                await new Promise(r => setTimeout(r, 1200)); // ventana visible de carga
                return json({ obras });
            }
            return json({ success: true, no_leidas: 0 });
        }
        return realFetch(input, init);
    };
})();`;

async function main() {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await getJson(`http://127.0.0.1:${PORT}/json/version`); break; }
    catch { await sleep(250); }
  }
  if (!version) { console.log('NO CDP'); chrome.kill(); return; }

  const page = await (async () => {
    try {
      return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`);
    } catch {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      return res.json();
    }
  })();
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
      if (txt.startsWith('[clamp]') || txt.startsWith('EVT ')) logs.push(txt);
      else if (['error', 'warning'].includes(m.params.type)) logs.push(`[console.${m.params.type}] ${txt}`);
    }
  };
  const send = (method, params = {}) => new Promise(res => {
    const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
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

  // Esperar a que la sesión "válida" pase el preloader y el panel inferior aparezca
  for (let i = 0; i < 60; i++) {
    const ok = await evalJs(`!!document.getElementById('toggle-panel') && !document.getElementById('toggle-panel').classList.contains('hidden')`);
    if (ok) break;
    await sleep(500);
  }
  await sleep(1200);

  // Abrir Explorar (GRID) — se abre desde la lupa (btn-cavents-hub abre carrusel)
  await evalJs(`document.getElementById('btn-buscar').click()`);
  let cards = 0;
  for (let i = 0; i < 40; i++) {
    const st = await evalJs(`JSON.stringify({ c: document.querySelectorAll('#galeria-container .obra-card').length, grid: document.getElementById('galeria-container').classList.contains('modo-grid') })`);
    const s = JSON.parse(st);
    cards = s.c;
    if (s.grid && cards >= 9) break;
    await sleep(400);
  }
  console.log(`GRID ABIERTO con ${cards} tarjetas`);
  console.log('elementFromPoint(200,150):', await evalJs(`(() => { const el = document.elementFromPoint(200, 150); return el ? el.tagName + '#' + el.id + '.' + el.className : 'null'; })()`));
  console.log('search-panel rect:', await evalJs(`(() => { const p = document.getElementById('search-panel'); if (!p) return 'no panel'; const r = p.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), hidden: p.classList.contains('hidden') }); })()`));

  const indicatorState = () => evalJs(`(() => {
      const el = document.querySelector('.pull-refresh-indicator');
      const arc = el?.querySelector('.ptr-arc');
      const c = document.getElementById('galeria-container');
      const r = el ? el.getBoundingClientRect() : null;
      const cr = el ? el.querySelector('.ptr-circle').getBoundingClientRect() : null;
      const card = c.querySelector('.obra-card');
      const cardR = card ? card.getBoundingClientRect() : null;
      return JSON.stringify({
          classes: el ? el.className : 'NO-INDICATOR',
          dashoffset: arc ? arc.style.strokeDashoffset : null,
          paddingTop: c.style.paddingTop,
          scrollTop: c.scrollTop,
          scrollHeight: c.scrollHeight,
          clientHeight: c.clientHeight,
          clientWidth: c.clientWidth,
          modoGrid: c.classList.contains('modo-grid'),
          snapComputed: getComputedStyle(c).scrollSnapType,
          cardW: cardR ? Math.round(cardR.width) : null,
          cardH: cardR ? Math.round(cardR.height) : null,
          overflowInline: c.style.overflow,
          overflowComputed: getComputedStyle(c).overflow,
          indicadorY: r ? Math.round(r.y) : null,
          circuloY: cr ? Math.round(cr.y) : null,
          primeraCardY: cardR ? Math.round(cardR.y) : null,
          cards: document.querySelectorAll('#galeria-container .obra-card').length
      });
  })()`);

  // ---- TEST A: pull completo (dist 110 ≥ umbral 70) ----
  console.log('\n=== TEST A: pull-to-refresh completo ===');
  const shot = async (name) => {
    // Desactivado temporalmente para aislar si captureScreenshot causa scroll
    return;
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result?.data) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(process.cwd(), `scripts/ptr-shot-${name}.png`), Buffer.from(r.result.data, 'base64'));
      console.log(`📸 scripts/ptr-shot-${name}.png`);
    }
  };
  await sleep(400); // asentar la apertura del grid antes del primer gesto
  const touch = async (type, x, y) => {
    const params = { type, touchPoints: [{ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] };
    if (type === 'touchStart' || type === 'touchMove') params.touchPoints[0].id = 1;
    if (type === 'touchEnd') params.touchPoints = [];
    await send('Input.dispatchTouchEvent', params);
    if (type === 'touchStart') await sleep(60); // dejar asentar el toque
  };
  await touch('touchStart', 200, 400);
  await touch('touchMove', 200, 420); await sleep(30);
  await touch('touchMove', 200, 450); await sleep(30);
  await touch('touchMove', 200, 480); await sleep(30);
  console.log('A1 (a mitad de arrastre, dist≈80):', await indicatorState());
  await touch('touchMove', 200, 510); await sleep(30);
  console.log('A2 (arrastre completo, dist=110):', await indicatorState());
  await touch('touchEnd', 200, 510); await sleep(80);
  console.log('A3 (justo tras soltar — debe estar loading):', await indicatorState());
  await sleep(550);
  console.log('A3b (estado loading asentado, sin transición):', await indicatorState());
  const estilo = await evalJs(`(() => {
      const el = document.querySelector('.pull-refresh-indicator');
      if (!el) return 'NO-IND';
      const cs = getComputedStyle(el);
      const circ = el.querySelector('.ptr-circle');
      const cc = getComputedStyle(circ);
      return JSON.stringify({
          indHeight: cs.height,
          indAlignItems: cs.alignItems,
          indPos: cs.position,
          indTop: cs.top,
          circTransform: cc.transform,
          circOpacity: cc.opacity
      });
  })()`);
  console.log('A3b-estilos:', estilo);
  await sleep(1200);
  console.log('A4 (tras refrescar — debe estar oculto y con tarjetas):', await indicatorState());
  await sleep(800);

  // ---- TEST B: pull corto (cancelación, dist 30 < umbral) ----
  console.log('\n=== TEST B: pull corto (no refresca) ===');
  await touch('touchStart', 200, 400);
  await touch('touchMove', 200, 420); await sleep(30);
  await touch('touchMove', 200, 430); await sleep(30);
  console.log('B1 (arrastre corto):', await indicatorState());
  await touch('touchEnd', 200, 430); await sleep(700);
  console.log('B2 (tras soltar — debe ocultarse sin refrescar):', await indicatorState());

  // ---- TEST C: refresh programático (lupa/buscador) ----
  console.log('\n=== TEST C: triggerRefreshGrid (programático) ===');
  const trig = await evalJs(`(async () => {
      const url = performance.getEntriesByType('resource').map(r => r.name).find(n => n.includes('galeria-ui.js'));
      const m = await import(url);
      m.triggerRefreshGrid();
      await new Promise(r => setTimeout(r, 120));
      const el = document.querySelector('.pull-refresh-indicator');
      return el ? el.className : 'NO-INDICATOR';
  })()`);
  console.log('C1 (120ms tras disparar — debe estar loading):', trig);
  const visual = await evalJs(`(() => {
      const arc = document.querySelector('.ptr-arc');
      const svg = document.querySelector('.ptr-svg');
      const circle = document.querySelector('.ptr-circle');
      const track = document.querySelector('.ptr-track');
      if (!arc || !svg || !circle || !track) return 'MISSING';
      const anims = svg.getAnimations().map(a => a.animationName);
      return JSON.stringify({
          stroke: getComputedStyle(arc).stroke,
          dashoffsetComputed: getComputedStyle(arc).strokeDashoffset,
          dasharrayComputed: getComputedStyle(arc).strokeDasharray,
          circleOpacity: getComputedStyle(circle).opacity,
          svgAnimations: anims,
          trackOpacity: getComputedStyle(track).opacity
      });
  })()`);
  console.log('C1-visual (spinner activo):', visual);
  await sleep(1800);
  console.log('C2 (tras terminar — debe estar oculto):', await indicatorState());

  // ---- TEST D: touchcancel deja todo restaurado ----
  console.log('\n=== TEST D: touchcancel (robustez) ===');
  await touch('touchStart', 200, 400);
  await touch('touchMove', 200, 450); await sleep(30);
  console.log('D1 (arrastrando):', await indicatorState());
  await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await sleep(600);
  console.log('D2 (tras cancel — restaurado):', await indicatorState());

  console.log('\n=== EXCEPCIONES / ERRORES (' + logs.length + ') ===');
  logs.forEach(l => console.log(l));
  ws.close();
  chrome.kill();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}

main().catch(e => { console.log('SCRIPT ERROR:', e.message); chrome.kill(); });
