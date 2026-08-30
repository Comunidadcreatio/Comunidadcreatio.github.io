// Verifica los 3 cambios de detalles en carruseles:
// 1) Dots del carrusel en la parte INFERIOR IZQUIERDA dentro del contenedor.
// 2) El modal "ver detalles" ya NO muestra Etiquetas (ni Año ni Dimensiones).
// 3) La tarjeta muestra Año (arriba-derecha) y Dimensiones (arriba-izquierda),
//    justo encima del carrusel de imágenes.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'detalles-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9281',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9281/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9281/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9281/json/new?about:blank', { method: 'PUT' })).json(); } })();
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
          localStorage.setItem('creatio_auth_token_persist', 'tokentest');
      } catch (_) {}
      const mkImg = (w, h, color) => {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const x = cv.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
          return cv.toDataURL('image/jpeg', 0.8);
      };
      const img45 = mkImg(800, 1000, '#cc3344');
      const img11 = mkImg(800, 800, '#2255cc');
      const obrasMock = [
          { id: 1, titulo: 'Retrato al óleo', artista: 'T', artista_user_id: 1,
            imagen_url: img45, imagen_url_1: img11, etiquetas: 'Óleo, Retrato',
            ano: 2024, ancho: 80, alto: 100,
            descripcion_tecnica: 'Óleo', soporte: 'Lienzo (Algodón, lino, Mezcla)', marcos: 'Clásico (Dorado, Negro)',
            estado_obra: 'Disponible (en venta)', descripcion_artistica: 'Texto',
            procedencia: 'Colección privada (Madrid)', certificado: 'Certificado de autenticidad (Archivo)', firma: 'Manuscrita (Borde inferior)', conservacion: 'Excelente (Clima controlado)',
            likes_count: 2, views_count: 5, comments_count: 1, precio: '100',
            foto_artista: '' },
          { id: 2, titulo: 'Paisaje', artista: 'T', artista_user_id: 1,
            imagen_url: img11, etiquetas: 'Paisaje',
            ano: 2023, ancho: 50, alto: 50,
            descripcion_tecnica: 'Acuarela', soporte: 'Papel', marcos: 'No',
            estado_obra: 'No disponible temporalmente', descripcion_artistica: 'Texto2',
            procedencia: '—', certificado: '—', firma: '—', conservacion: 'Buena',
            likes_count: 0, views_count: 3, comments_count: 0, precio: 'N/A',
            foto_artista: '' }
      ];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (u.includes('backend-fundacion-atpe.onrender.com')) {
              const json = async (data) => ({ ok: true, status: 200, json: async () => data });
              if (u.includes('/api/artistas/heartbeat')) return json({ ok: true });
              if (u.includes('mis-reacciones')) return json({ reacciones: [] });
              if (u.includes('/obras/1')) return json({ obra: obrasMock[0] });
              if (u.includes('/obras')) return json(obrasMock);
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

console.log('=== Entrar a Cavents (carrusel) ===');
await evalJs(`document.getElementById('btn-cavents-hub').click()`);
await sleep(2500);

console.log('\n=== 1) Dots en la parte INFERIOR IZQUIERDA del carrusel ===');
console.log(await evalJs(`(() => {
    const dots = document.querySelector('.obra-carousel-dots');
    const cs = getComputedStyle(dots);
    const viewport = document.querySelector('.obra-carousel-viewport').getBoundingClientRect();
    const dr = dots.getBoundingClientRect();
    const carr = document.querySelector('.obra-carousel').getBoundingClientRect();
    return JSON.stringify({
        bottom: cs.bottom, top: cs.top, justifyContent: cs.justifyContent,
        geometria: {
            vp: { l: Math.round(viewport.left), r: Math.round(viewport.right), t: Math.round(viewport.top), b: Math.round(viewport.bottom) },
            d: { l: Math.round(dr.left), r: Math.round(dr.right), t: Math.round(dr.top), b: Math.round(dr.bottom) },
            c: { l: Math.round(carr.left), r: Math.round(carr.right), t: Math.round(carr.top), b: Math.round(carr.bottom) }
        },
        izquierda: dr.left - viewport.left < 15,
        abajo: (viewport.bottom - dr.bottom) < 15,
        dotsInternos: dr.left >= viewport.left && dr.right <= viewport.right && dr.bottom <= viewport.bottom && dr.top >= viewport.top
    });
})()`));

console.log('\n=== 3) Franja 1: técnica+año (izq) | soporte+dimensiones (der, intercambiados) ===');
console.log(await evalJs(`(() => {
    const card = document.querySelector('.obra-card');
    const bar = card.querySelector('.obra-meta-bar');
    const dim = card.querySelector('.obra-meta-dimensiones');
    const anio = card.querySelector('.obra-meta-ano');
    const tecnica = card.querySelector('.obra-meta-tecnica');
    const soporte = card.querySelector('.obra-meta-soporte');
    const dimR = dim.getBoundingClientRect();
    const anioR = anio.getBoundingClientRect();
    const tecR = tecnica.getBoundingClientRect();
    const sopR = soporte.getBoundingClientRect();
    const sepAnio = getComputedStyle(anio, '::before').content;
    const sepDim = getComputedStyle(dim, '::before').content;
    return JSON.stringify({
        existe: !!bar,
        tecnica: tecnica.textContent,
        anio: anio.textContent,
        soporte: soporte.textContent,
        soporteSinParentesis: !soporte.textContent.includes('('),
        dimensiones: dim.textContent,
        anioEnIzquierda: anioR.left < dimR.left,
        dimensionesEnDerecha: dimR.left > anioR.left,
        tecnicaIzq: tecR.left < anioR.left,
        ladoDerCompleto: sopR.left > anioR.right && dimR.left > sopR.right,
        separadorAnio: sepAnio !== 'none',
        separadorDim: sepDim !== 'none'
    });
})()`));

console.log('\n=== 3b) Franja 2: marcos • conservación (izq) | FIRMA (derecha) ===');
console.log(await evalJs(`(() => {
    const card = document.querySelector('.obra-card');
    const bar2 = card.querySelector('.obra-meta-bar-2');
    const marcos = card.querySelector('.obra-meta-marcos');
    const consItem = card.querySelector('.obra-meta-item');
    const firma = card.querySelector('.obra-meta-firma');
    // Texto del item sin el label del tooltip ni el icono
    const consTexto = (() => {
        if (!consItem) return null;
        const clon = consItem.cloneNode(true);
        const ico = clon.querySelector('.obra-meta-ico');
        if (ico) ico.remove();
        return clon.textContent.trim();
    })();
    const mR = marcos.getBoundingClientRect();
    const fR = firma.getBoundingClientRect();
    return JSON.stringify({
        existe: !!bar2,
        marcos: marcos.textContent,
        conservacion: consTexto,
        firma: firma.textContent,
        sinParentesis: consTexto && !consTexto.includes('(') && !firma.textContent.includes('('),
        firmaADerecha: fR.left > mR.right,
        separadores: getComputedStyle(consItem, '::before').content !== 'none'
    });
})()`));

console.log('\n=== 3c) Franja 3: estado SIN paréntesis + outline color + certificado/procedencia ===');
console.log(await evalJs(`(() => {
    const card = document.querySelector('.obra-card');
    const bar3 = card.querySelector('.obra-meta-bar-3');
    const badge = card.querySelector('.obra-estado-badge');
    const certItem = bar3.querySelector('.obra-meta-item');
    const proc = card.querySelector('.obra-meta-procedencia');
    const carr = card.querySelector('.obra-carousel').getBoundingClientRect();
    const bar3R = bar3.getBoundingClientRect();
    const metricas = card.querySelector('.obra-metricas-bar').getBoundingClientRect();
    const badgeR = badge.getBoundingClientRect();
    const procR = proc.getBoundingClientRect();
    const certTexto = (() => {
        if (!certItem) return null;
        const clon = certItem.cloneNode(true);
        const ico = clon.querySelector('.obra-meta-ico');
        if (ico) ico.remove();
        return clon.textContent.trim();
    })();
    const cs = getComputedStyle(badge);
    return JSON.stringify({
        existe: !!bar3,
        estado: badge.textContent,
        sinParentesisEnEstado: !badge.textContent.includes('('),
        colorTexto: cs.color,
        colorBorde: cs.borderColor,
        fondoTransparente: cs.backgroundColor === 'rgba(0, 0, 0, 0)',
        bordeCurvo: cs.borderRadius !== '0px',
        certificado: certTexto,
        procedencia: proc.textContent,
        sinParentesis: certTexto && !certTexto.includes('(') && !proc.textContent.includes('('),
        debajoDelCarrusel: bar3R.top >= carr.bottom - 2,
        encimaDeMetricas: bar3R.bottom <= metricas.top + 2,
        badgeDerecha: badgeR.left > procR.right,
        certProcIzquierda: procR.left < badgeR.left
    });
})()`));

console.log('\n=== 3d) Colores de estado DIFERENTES por opción ===');
console.log(await evalJs(`(() => {
    const badges = [...document.querySelectorAll('.obra-estado-badge')];
    const estados = badges.map(b => ({ texto: b.textContent, color: getComputedStyle(b).backgroundColor }));
    return JSON.stringify({ badges: estados, coloresDistintos: new Set(estados.map(e => e.color)).size > 1 });
})()`));

console.log('\n=== 3e) Animación del estado: deslizamiento derecha → izquierda ===');
console.log(await evalJs(`(() => {
    const badge = document.querySelector('.obra-card .obra-estado-badge');
    return JSON.stringify({
        animado: badge && badge.classList.contains('estado-anim'),
        animacion: badge ? getComputedStyle(badge).animationName : null,
        sinRebote: badge ? !getComputedStyle(badge).animationName.includes('Pop') : null
    });
})()`));

console.log('\n=== 3f) Iconos DIFERENTES, a la IZQUIERDA, etiqueta se despliega EN EL FLUJO empujando ===');
console.log(await evalJs(`(async () => {
    const card = document.querySelector('.obra-card');
    const icos = [...card.querySelectorAll('.obra-meta-ico')];
    const icoCert = icos.find(i => i.dataset.metaLabel === 'Certificado');
    const icoCons = icos.find(i => i.dataset.metaLabel === 'Conservación');
    const svgCert = icoCert.querySelector('svg');
    const svgCons = icoCons.querySelector('svg');
    const iconosDistintos = svgCert.innerHTML !== svgCons.innerHTML;
    const itemCert = icoCert.parentElement;
    const icoR = icoCert.getBoundingClientRect();
    const textoSpan = itemCert.querySelector('.obra-meta-texto');
    const textR = textoSpan.getBoundingClientRect();
    const tip = itemCert.querySelector('.obra-meta-tooltip');
    const maxWidthAntes = getComputedStyle(tip).maxWidth;
    const procAntes = (() => {
        const p = card.querySelector('.obra-meta-procedencia');
        return p ? p.getBoundingClientRect().left : null;
    })();
    icoCert.click();
    await new Promise(r => setTimeout(r, 450)); // esperar la transición 0.3s
    const maxWidthDurante = getComputedStyle(tip).maxWidth;
    const procDurante = (() => {
        const p = card.querySelector('.obra-meta-procedencia');
        return p ? p.getBoundingClientRect().left : null;
    })();
    const expande = maxWidthAntes === '0px' && maxWidthDurante !== '0px' && maxWidthDurante !== 'none';
    const empuja = procAntes !== null && procDurante !== null && procDurante > procAntes + 2;
    const modalAbierto = !document.getElementById('modal-detalles-cavent').classList.contains('hidden');
    return JSON.stringify({
        iconos: icos.map(i => i.dataset.metaLabel),
        iconosDistintos,
        certificadoEsMedalla: svgCert.innerHTML.includes('M15.48 12.83'),
        conservacionEsEscudo: svgCons.innerHTML.includes('M12 22s8-4 8-10'),
        iconoIzquierdaDelTexto: icoR.left < textR.left,
        maxWidthAntes, maxWidthDurante,
        expande,
        empuja,
        noAbreModal: !modalAbierto
    });
})()`));

console.log('\n=== 2) Modal: abarca el área de imagen, descripción centrada, SIN botón (ya no va en el modal) ===');
await evalJs(`document.querySelector('.btn-detalles-toggle').click()`);
await sleep(1500);
console.log(await evalJs(`(() => {
    const modal = document.getElementById('modal-detalles-cavent');
    const content = modal.querySelector('.modal-cavent-detalle');
    const desc = document.getElementById('detalle-descripcion');
    const cr = content.getBoundingClientRect();
    const carr = document.querySelector('.obra-card .obra-carousel').getBoundingClientRect();
    const dcs = getComputedStyle(desc);
    return JSON.stringify({
        modalVisible: !modal.classList.contains('hidden'),
        descripcion: desc.textContent,
        descCentrada: dcs.textAlign === 'justify',
        sinBotonEnModal: !modal.querySelector('.btn-comprar-obra'),
        abarcaSoloImagen: Math.abs(cr.top - carr.top) < 4 && Math.abs(cr.bottom - carr.bottom) < 4,
        fondoTranslucido: getComputedStyle(content).backgroundColor.includes('0.35')
    });
})()`));

console.log('\n=== 2b) Botón Comprar Obra: visible con "Disponible", NO con "No disponible" ===');
console.log(await evalJs(`(async () => {
    // Cerrar modal
    document.getElementById('modal-detalles-cavent').classList.add('hidden');
    const cards = document.querySelectorAll('.obra-card');
    const btn1 = cards[0].querySelector('.btn-comprar-obra');
    const btn2 = cards[1].querySelector('.btn-comprar-obra');
    const lupa = cards[0].querySelector('.btn-ver-detalles');
    const lupaR = lupa.getBoundingClientRect();
    const btn1R = btn1.getBoundingClientRect();
    const juntoALupa = btn1R.left >= lupaR.right - 4 && btn1R.left < lupaR.right + 80;
    const animado = btn1.classList.contains('comprar-anim');
    const animationName = getComputedStyle(btn1).animationName;
    const cs = getComputedStyle(btn1);
    const badge1 = cards[0].querySelector('.obra-estado-badge');
    const badge2 = cards[1].querySelector('.obra-estado-badge');
    return JSON.stringify({
        botonEnBarra: !!btn1 && !!btn1.closest('.obra-metricas-izq'),
        juntoALupa,
        texto: btn1.textContent.trim(),
        tieneIconoCarrito: !!btn1.querySelector('svg'),
        noEsVerde: cs.backgroundColor === 'rgba(0, 0, 0, 0)' && !cs.backgroundColor.includes('46, 125, 50'),
        bordeAmbar: cs.borderColor === 'rgb(245, 197, 66)',
        colorTextoAmbar: cs.color === 'rgb(245, 197, 66)', colorReal: cs.color, theme: document.documentElement.dataset.theme,
        animado,
        animationName,
        estadoTarjeta1: badge1 ? badge1.textContent : null,
        botonConDisponible: !!btn1,
        estadoTarjeta2: badge2 ? badge2.textContent : null,
        botonNoDisponibleNoExiste: !btn2
    });
})()`));

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
