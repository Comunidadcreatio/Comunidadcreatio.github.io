// js/image-framing.js
// Encuadre MANUAL de la imagen dentro del marco 4:5 o 1:1:
//  - Pinch con DOS dedos: acercar/alejar (escala).
//  - Giro con DOS dedos: rotar la imagen (presión/rotación).
//  - Un dedo: mover (pan).
// La imagen SIEMPRE cubre el marco (la escala mínima se adapta al ángulo).
// Al aplicar, se renderiza la región visible a resolución completa (1080px).

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function cargarImagen(origen) {
    return new Promise((resolve, reject) => {
        const url = origen instanceof Blob ? URL.createObjectURL(origen) : origen;
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = url;
    });
}

// Dimensiones de la caja (bounding box) de la imagen rotada, en unidades de
// ancho/alto de la imagen original (sin escala).
function cajaRotada(iw, ih, r) {
    const cos = Math.abs(Math.cos(r));
    const sin = Math.abs(Math.sin(r));
    return { bw: iw * cos + ih * sin, bh: iw * sin + ih * cos };
}

/**
 * Abre el encuadre manual.
 * @param {object} imagen  { src, file } — imagen actual del carrusel.
 * @param {string} aspect  '4/5' | '1/1' — proporción del marco.
 * @param {Function} onAplicar(blob) — recibe la imagen encuadrada (JPEG).
 */
export function abrirCuadroImagen(imagen, aspect, onAplicar) {
    if (!imagen) return;
    const ratio = aspect === '1/1' ? 1 : 4 / 5;

    const overlay = document.createElement('div');
    overlay.className = 'img-cuadro-overlay';
    overlay.innerHTML = `
        <style>
        .img-cuadro-overlay{position:fixed;inset:0;z-index:2147483601;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:'Nunito',sans-serif;}
        .img-cuadro-panel{background:var(--color-white,#fff);color:var(--color-ink,#1a1a1a);border-radius:16px;max-width:480px;width:100%;height:min(92vh,620px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,0.5);}
        .img-cuadro-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-gray-200,#e8e8e8);font-weight:700;}
        .img-cuadro-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-gray-500,#737373);padding:4px 8px;}
        .img-cuadro-hint{padding:6px 16px 0;font-size:11px;color:var(--color-gray-500,#737373);text-align:center;}
        .img-cuadro-viewport-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#141414;padding:14px;overflow:hidden;}
        .img-cuadro-viewport{position:relative;overflow:hidden;border-radius:10px;touch-action:none;box-shadow:0 0 0 1px rgba(255,255,255,0.15);}
        .img-cuadro-viewport img{position:absolute;top:0;left:0;transform-origin:center;user-select:none;-webkit-user-drag:none;pointer-events:none;max-width:none;max-height:none;}
        .img-cuadro-foot{display:flex;gap:10px;padding:10px 16px 14px;border-top:1px solid var(--color-gray-200,#e8e8e8);}
        .img-cuadro-btn{flex:1;padding:10px;border-radius:12px;border:1px solid var(--color-gray-300,#d4d4d4);background:transparent;color:var(--color-ink,#1a1a1a);font-weight:700;font-family:inherit;cursor:pointer;font-size:14px;}
        .img-cuadro-btn.primary{background:var(--color-ink,#1a1a1a);color:var(--color-white,#fff);border-color:var(--color-ink,#1a1a1a);}
        .img-cuadro-btn.primary:disabled{opacity:0.5;cursor:wait;}
        </style>
        <div class="img-cuadro-panel">
            <div class="img-cuadro-head">
                <span>Cuadrar imagen</span>
                <button type="button" class="img-cuadro-close" aria-label="Cerrar">✕</button>
            </div>
            <div class="img-cuadro-hint">Acerca/rota con dos dedos y desliza con uno para encuadrar (${aspect === '1/1' ? '1:1' : '4:5'})</div>
            <div class="img-cuadro-viewport-wrap">
                <div class="img-cuadro-viewport">
                    <img alt="" draggable="false">
                </div>
            </div>
            <div class="img-cuadro-foot">
                <button type="button" class="img-cuadro-btn" id="ic-reset">Centrar</button>
                <button type="button" class="img-cuadro-btn" id="ic-cancel">Cancelar</button>
                <button type="button" class="img-cuadro-btn primary" id="ic-apply">Aplicar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const viewport = overlay.querySelector('.img-cuadro-viewport');
    const imgEl = overlay.querySelector('img');
    const btnAplicar = overlay.querySelector('#ic-apply');

    // Marco con la proporción exacta (aspect-ratio) y ancho acotado al panel
    viewport.style.aspectRatio = String(ratio);
    viewport.style.width = 'min(90%, 400px)';
    viewport.style.maxHeight = '100%';
    viewport.style.flexShrink = '0';

    // Dimensiones reales del marco (píxeles CSS)
    let dims = { vw: viewport.offsetWidth, vh: viewport.offsetHeight };
    const releerDims = () => { dims = { vw: viewport.offsetWidth, vh: viewport.offsetHeight }; };
    window.addEventListener('resize', () => { releerDims(); aplicarTransformacion(true); });

    // Estado del encuadre: centro de la imagen (cx, cy) en el marco, escala s,
    // rotación r (radianes) alrededor del centro.
    let img = null;
    let iw = 0, ih = 0;
    let s = 1, cx = 0, cy = 0, r = 0;
    const MAX_ZOOM = 6;

    function setTransform() {
        imgEl.style.transform =
            'translate(' + (cx - iw / 2) + 'px, ' + (cy - ih / 2) + 'px) ' +
            'rotate(' + (r * 180 / Math.PI) + 'deg) scale(' + s + ')';
    }

    // Escala mínima para que la imagen (rotada) SIEMPRE cubra el marco
    function escalaMinima() {
        const caja = cajaRotada(iw, ih, r);
        return Math.max(dims.vw / caja.bw, dims.vh / caja.bh);
    }

    function clampPos() {
        const caja = cajaRotada(iw, ih, r);
        const maxX = (caja.bw * s) / 2;
        const maxY = (caja.bh * s) / 2;
        cx = clamp(cx, dims.vw - maxX, maxX);
        cy = clamp(cy, dims.vh - maxY, maxY);
    }
    function aplicarTransformacion(soloClamp) {
        if (!soloClamp) clampPos();
        setTransform();
    }

    function centrar() {
        r = 0;
        s = escalaMinima();
        cx = dims.vw / 2;
        cy = dims.vh / 2;
        setTransform();
    }

    // Gestos táctiles: 1 dedo = mover, 2 dedos = acercar/rotar
    const dedos = new Map();
    let pinchBase = null, panBase = null;

    viewport.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) dedos.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (dedos.size === 2) {
            const pts = [...dedos.values()];
            pinchBase = {
                dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
                ang: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
                s, r, cx, cy,
                midX: (pts[0].x + pts[1].x) / 2,
                midY: (pts[0].y + pts[1].y) / 2
            };
            panBase = null;
        } else if (dedos.size === 1) {
            const p = [...dedos.values()][0];
            panBase = { x: p.x, y: p.y, cx, cy };
            pinchBase = null;
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (dedos.has(t.identifier)) dedos.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        if (dedos.size === 2 && pinchBase) {
            const pts = [...dedos.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            const sMin = escalaMinima();
            s = clamp(pinchBase.s * (dist / pinchBase.dist), sMin, sMin * MAX_ZOOM);
            r = pinchBase.r + (ang - pinchBase.ang); // rotación con el giro
            cx = pinchBase.cx + (midX - pinchBase.midX);
            cy = pinchBase.cy + (midY - pinchBase.midY);
            aplicarTransformacion();
        } else if (dedos.size === 1 && panBase) {
            const p = [...dedos.values()][0];
            cx = panBase.cx + (p.x - panBase.x);
            cy = panBase.cy + (p.y - panBase.y);
            aplicarTransformacion();
        }
    }, { passive: false });

    const terminarToques = (e) => {
        for (const t of e.changedTouches) dedos.delete(t.identifier);
        if (dedos.size < 2) pinchBase = null;
        if (dedos.size < 1) panBase = null;
    };
    viewport.addEventListener('touchend', terminarToques);
    viewport.addEventListener('touchcancel', terminarToques);

    // Soporte ratón (escritorio): arrastrar para mover, rueda para zoom
    let mouseBase = null;
    viewport.addEventListener('mousedown', (e) => {
        mouseBase = { x: e.clientX, y: e.clientY, cx, cy };
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!mouseBase) return;
        cx = mouseBase.cx + (e.clientX - mouseBase.x);
        cy = mouseBase.cy + (e.clientY - mouseBase.y);
        aplicarTransformacion();
    });
    window.addEventListener('mouseup', () => { mouseBase = null; });
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const sMin = escalaMinima();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        s = clamp(s * factor, sMin, sMin * MAX_ZOOM);
        aplicarTransformacion();
    }, { passive: false });

    overlay.querySelector('#ic-reset').addEventListener('click', centrar);
    const cerrar = () => overlay.remove();
    overlay.querySelector('.img-cuadro-close').addEventListener('click', cerrar);
    overlay.querySelector('#ic-cancel').addEventListener('click', cerrar);

    // Cargar la imagen
    cargarImagen(imagen.file || imagen.src).then((im) => {
        img = im;
        iw = im.naturalWidth;
        ih = im.naturalHeight;
        imgEl.style.width = iw + 'px';
        imgEl.style.height = ih + 'px';
        imgEl.src = im.src;
        centrar();
    }).catch(() => {
        viewport.innerHTML = '<p style="color:#fff;text-align:center;padding:20px;">No se pudo cargar esta imagen para encuadrarla.</p>';
    });

    // Aplicar: renderizar la región visible a resolución completa (con rotación)
    btnAplicar.addEventListener('click', () => {
        if (!img || btnAplicar.disabled) return;
        btnAplicar.disabled = true;
        btnAplicar.textContent = 'Procesando…';
        setTimeout(() => {
            try {
                const outH = 1080;
                const outW = Math.round(outH * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = outW;
                canvas.height = outH;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, outW, outH);
                // Mapear la vista (marco) al lienzo de salida: la imagen rotada
                // y escalada se dibuja de modo que el centro de la imagen caiga
                // en su posición (cx, cy) dentro del marco.
                const k = outW / dims.vw;
                const m = new DOMMatrix()
                    .translate(cx * k, cy * k)
                    .rotate(r * 180 / Math.PI)
                    .scale(s * k, s * k)
                    .translate(-iw / 2, -ih / 2);
                ctx.setTransform(m);
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) onAplicar(blob);
                    cerrar();
                }, 'image/jpeg', 0.92);
            } catch (e) {
                btnAplicar.disabled = false;
                btnAplicar.textContent = 'Aplicar';
            }
        }, 30);
    });
}
