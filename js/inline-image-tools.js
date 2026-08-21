// js/inline-image-tools.js
// Herramientas de imagen INLINE (sin pantalla aparte), directamente sobre la
// imagen del carrusel de creación de Cavents:
//
//  CUADRAR: al pulsar el botón, la imagen queda ajustable en su sitio
//  (pinch = acercar/alejar, giro de dos dedos = rotar, un dedo = mover).
//  Pulsar el botón de nuevo = GUARDAR el encuadre.
//
//  EDITAR: al pulsar el botón, aparece el nombre de la herramienta sobre la
//  imagen. Deslizar ARRIBA/ABAJO cambia de herramienta; deslizar IZQUIERDA/
//  DERECHA ajusta el valor. Pulsar el botón de nuevo = GUARDAR.

import { showWarning } from './notificaciones.js?v=d2867c8ca0';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const AJUSTES = [
    { id: 'brillo', label: 'Brillo' },
    { id: 'contraste', label: 'Contraste' },
    { id: 'saturacion', label: 'Saturación' },
    { id: 'ambiente', label: 'Ambiente' },
    { id: 'sombras', label: 'Sombras' },
    { id: 'calidez', label: 'Calidez' },
    { id: 'brillantes', label: 'Zonas brillantes' }
];

// Estado global: mientras hay un modo activo, el carrusel no cambia de slide.
let modoActivo = null;
export function hayModoActivo() { return !!modoActivo; }

// Carga una imagen. Para URLs remotas (Cloudinary) usa crossOrigin para
// poder dibujarla en canvas sin "contaminarla".
function cargarImagen(origen) {
    return new Promise((resolve, reject) => {
        const esUrl = typeof origen === 'string';
        const url = esUrl ? origen : URL.createObjectURL(origen);
        const img = new Image();
        if (esUrl) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = url;
    });
}

// ---------- Ajustes de píxeles (mismo motor que el editor) ----------
function aplicarAjustes(d, a) {
    const brillo = (a.brillo || 0) / 100 * 55;
    const contraste = 1 + (a.contraste || 0) / 100;
    const saturacion = 1 + (a.saturacion || 0) / 100;
    const gamma = 1 + (a.ambiente || 0) / 100;
    const gammaInv = 1 / Math.max(0.1, gamma);
    const calidez = (a.calidez || 0) / 100 * 45;
    const sombras = (a.sombras || 0) / 100;
    const brillantes = (a.brillantes || 0) / 100;
    for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        if (a.ambiente) {
            r = 255 * Math.pow(r / 255, gammaInv);
            g = 255 * Math.pow(g / 255, gammaInv);
            b = 255 * Math.pow(b / 255, gammaInv);
        }
        if (a.brillo) { r += brillo; g += brillo; b += brillo; }
        if (a.contraste) {
            r = (r - 128) * contraste + 128;
            g = (g - 128) * contraste + 128;
            b = (b - 128) * contraste + 128;
        }
        if (a.saturacion) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            r = lum + (r - lum) * saturacion;
            g = lum + (g - lum) * saturacion;
            b = lum + (b - lum) * saturacion;
        }
        if (a.calidez) { r += calidez; b -= calidez; }
        const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (a.sombras) { const k = (1 - t) * sombras * 50; r += k; g += k; b += k; }
        if (a.brillantes) { const k = t * brillantes * 50; r += k; g += k; b += k; }
        d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g, 0, 255); d[i + 2] = clamp(b, 0, 255);
    }
}

function renderizar(img, ajustes, maxSize) {
    const ratio = img.naturalWidth / img.naturalHeight;
    let w, h;
    if (ratio >= 1) { w = maxSize; h = Math.round(maxSize / ratio); }
    else { h = maxSize; w = Math.round(maxSize * ratio); }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    aplicarAjustes(data.data, ajustes);
    ctx.putImageData(data, 0, 0);
    return canvas;
}

// Etiqueta flotante sobre la imagen (herramienta + valor)
function crearEtiqueta(slide) {
    const lbl = document.createElement('div');
    lbl.className = 'inline-tool-label';
    lbl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'background:rgba(0,0,0,0.72);color:#fff;padding:8px 14px;border-radius:20px;' +
        'font:700 13px "Nunito",sans-serif;pointer-events:none;z-index:8;text-align:center;' +
        'transition:opacity .15s;white-space:nowrap;';
    slide.appendChild(lbl);
    return lbl;
}

function crearChipCancelar(slide, onCancelar) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'inline-cancel-chip';
    chip.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
        'background:rgba(26,26,26,0.85);color:#fff;border:none;border-radius:16px;' +
        'padding:5px 12px;font:600 11px "Nunito",sans-serif;cursor:pointer;z-index:9;' +
        'display:flex;align-items:center;gap:5px;';
    chip.innerHTML = '✕ Cancelar';
    chip.addEventListener('click', (e) => { e.stopPropagation(); onCancelar(); });
    slide.appendChild(chip);
    return chip;
}

// ============================================
// CUADRAR INLINE (pinch/giro/pan sobre la imagen)
// ============================================
export function activarCuadroInline(scope, onGuardar, onCancelar) {
    const { slide, imgEl, imagen } = scope;
    const dims = { vw: slide.clientWidth, vh: slide.clientHeight };
    let img = null, iw = 0, ih = 0;
    let s = 1, cx = 0, cy = 0, r = 0;
    const MAX_ZOOM = 6;
    let activo = true;

    // La imagen pasa a tamaño natural transformable dentro del slide
    const prevStyle = {
        position: imgEl.style.position,
        left: imgEl.style.left,
        top: imgEl.style.top,
        width: imgEl.style.width,
        height: imgEl.style.height,
        objectFit: imgEl.style.objectFit,
        transform: imgEl.style.transform
    };
    imgEl.style.position = 'absolute';
    imgEl.style.left = '0';
    imgEl.style.top = '0';
    imgEl.style.objectFit = 'none';
    imgEl.style.transformOrigin = 'center';
    slide.classList.add('inline-modo');

    function cajaRotada() {
        const cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r));
        return { bw: iw * cos + ih * sin, bh: iw * sin + ih * cos };
    }
    function escalaMinima() {
        const c = cajaRotada();
        return Math.max(dims.vw / c.bw, dims.vh / c.bh);
    }
    function setTransform() {
        imgEl.style.transform =
            'translate(' + (cx - iw / 2) + 'px, ' + (cy - ih / 2) + 'px) ' +
            'rotate(' + (r * 180 / Math.PI) + 'deg) scale(' + s + ')';
    }
    function clampPos() {
        const c = cajaRotada();
        cx = clamp(cx, dims.vw - (c.bw * s) / 2, (c.bw * s) / 2);
        cy = clamp(cy, dims.vh - (c.bh * s) / 2, (c.bh * s) / 2);
    }
    function centrar() {
        r = 0;
        s = escalaMinima();
        cx = dims.vw / 2;
        cy = dims.vh / 2;
        setTransform();
    }

    // Gestos
    const dedos = new Map();
    let pinchBase = null, panBase = null;
    function onTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        for (const t of e.changedTouches) dedos.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (dedos.size === 2) {
            const pts = [...dedos.values()];
            pinchBase = {
                dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
                ang: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
                s, r, cx, cy,
                midX: (pts[0].x + pts[1].x) / 2, midY: (pts[0].y + pts[1].y) / 2
            };
            panBase = null;
        } else if (dedos.size === 1) {
            const p = [...dedos.values()][0];
            panBase = { x: p.x, y: p.y, cx, cy };
            pinchBase = null;
        }
    }
    function onTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        for (const t of e.changedTouches) {
            if (dedos.has(t.identifier)) dedos.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        if (dedos.size === 2 && pinchBase) {
            const pts = [...dedos.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
            const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
            const sMin = escalaMinima();
            s = clamp(pinchBase.s * (dist / pinchBase.dist), sMin, sMin * MAX_ZOOM);
            r = pinchBase.r + (ang - pinchBase.ang);
            cx = pinchBase.cx + (midX - pinchBase.midX);
            cy = pinchBase.cy + (midY - pinchBase.midY);
            clampPos();
            setTransform();
        } else if (dedos.size === 1 && panBase) {
            const p = [...dedos.values()][0];
            cx = panBase.cx + (p.x - panBase.x);
            cy = panBase.cy + (p.y - panBase.y);
            clampPos();
            setTransform();
        }
    }
    function onTouchEnd(e) {
        for (const t of e.changedTouches) dedos.delete(t.identifier);
        if (dedos.size < 2) pinchBase = null;
        if (dedos.size < 1) panBase = null;
    }

    imgEl.addEventListener('touchstart', onTouchStart, { passive: false });
    imgEl.addEventListener('touchmove', onTouchMove, { passive: false });
    imgEl.addEventListener('touchend', onTouchEnd);
    imgEl.addEventListener('touchcancel', onTouchEnd);

    // Cargar la imagen (si ya venía de URL, crossOrigin para el canvas)
    cargarImagen(imagen.file || imagen.src).then((im) => {
        img = im;
        iw = im.naturalWidth;
        ih = im.naturalHeight;
        imgEl.style.width = iw + 'px';
        imgEl.style.height = ih + 'px';
        imgEl.src = im.src;
        centrar();
    }).catch(() => {
        showWarning('No se pudo cargar esta imagen para encuadrarla.');
        limpiar();
    });

    // Etiqueta de ayuda
    const lbl = crearEtiqueta(slide);
    lbl.textContent = 'Dedos: acercar/rotar · Uno: mover';
    const chip = crearChipCancelar(slide, () => { limpiar(); if (onCancelar) onCancelar(); });

    function renderFinal() {
        if (!img) return null;
        const outH = 1080;
        const ratio = dims.vh / dims.vw; // misma proporción del slide
        const outW = Math.round(outH * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        const k = outW / dims.vw;
        const m = new DOMMatrix()
            .translate(cx * k, cy * k)
            .rotate(r * 180 / Math.PI)
            .scale(s * k, s * k)
            .translate(-iw / 2, -ih / 2);
        ctx.setTransform(m);
        ctx.drawImage(img, 0, 0);
        return canvas;
    }

    function guardar() {
        const canvas = renderFinal();
        if (!canvas) { limpiar(); return; }
        canvas.toBlob((blob) => {
            limpiar();
            if (blob) onGuardar(blob);
        }, 'image/jpeg', 0.92);
    }

    function limpiar() {
        if (!activo) return;
        activo = false;
        imgEl.removeEventListener('touchstart', onTouchStart);
        imgEl.removeEventListener('touchmove', onTouchMove);
        imgEl.removeEventListener('touchend', onTouchEnd);
        imgEl.removeEventListener('touchcancel', onTouchEnd);
        imgEl.style.position = prevStyle.position;
        imgEl.style.left = prevStyle.left;
        imgEl.style.top = prevStyle.top;
        imgEl.style.width = prevStyle.width;
        imgEl.style.height = prevStyle.height;
        imgEl.style.objectFit = prevStyle.objectFit;
        imgEl.style.transform = prevStyle.transform;
        slide.classList.remove('inline-modo');
        if (lbl.parentNode) lbl.remove();
        if (chip.parentNode) chip.remove();
        if (modoActivo === control) modoActivo = null;
    }

    const control = { guardar, cancelar: limpiar };
    modoActivo = control;
    return control;
}

// ============================================
// EDITAR INLINE (deslizamiento vertical/horizontal)
// ============================================
export function activarEdicionInline(scope, onGuardar, onCancelar) {
    const { slide, imgEl, imagen } = scope;
    let img = null;
    let activo = true;
    let toolIndex = 0;
    const valores = {};
    AJUSTES.forEach(a => { valores[a.id] = 0; });
    const PREVIEW_MAX = 420;
    let prevTimer = null;

    const lbl = crearEtiqueta(slide);
    const chip = crearChipCancelar(slide, () => { limpiar(); if (onCancelar) onCancelar(); });

    function actualizarEtiqueta() {
        const t = AJUSTES[toolIndex];
        lbl.textContent = t.label + ': ' + (valores[t.id] > 0 ? '+' : '') + valores[t.id];
    }
    function actualizarPreview() {
        if (!img) return;
        clearTimeout(prevTimer);
        prevTimer = setTimeout(() => {
            try {
                const c = renderizar(img, valores, PREVIEW_MAX);
                imgEl.src = c.toDataURL('image/jpeg', 0.85);
            } catch (e) { /* ignora */ }
        }, 40);
    }

    // Gestos: vertical = cambiar herramienta, horizontal = ajustar valor
    let gBase = null;
    function onTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        gBase = { x: t.clientX, y: t.clientY, toolIndex, valor: valores[AJUSTES[toolIndex].id], acum: 0 };
    }
    function onTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        if (!gBase) return;
        const dx = t.clientX - gBase.x;
        const dy = t.clientY - gBase.y;
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal: ajustar el valor de la herramienta actual
            const id = AJUSTES[toolIndex].id;
            valores[id] = clamp(Math.round(gBase.valor + dx * 0.8), -100, 100);
            actualizarEtiqueta();
            actualizarPreview();
        } else {
            // Vertical: acumular para cambiar de herramienta (cada 34px)
            gBase.acum += dy;
            const paso = Math.trunc(gBase.acum / 34);
            if (paso !== 0) {
                gBase.acum -= paso * 34;
                const nuevo = clamp(gBase.toolIndex - paso, 0, AJUSTES.length - 1);
                if (nuevo !== toolIndex) {
                    toolIndex = nuevo;
                    gBase.valor = valores[AJUSTES[toolIndex].id];
                    actualizarEtiqueta();
                }
            }
        }
    }
    function onTouchEnd() { gBase = null; }

    imgEl.addEventListener('touchstart', onTouchStart, { passive: false });
    imgEl.addEventListener('touchmove', onTouchMove, { passive: false });
    imgEl.addEventListener('touchend', onTouchEnd);
    imgEl.addEventListener('touchcancel', onTouchEnd);

    cargarImagen(imagen.file || imagen.src).then((im) => {
        img = im;
        actualizarEtiqueta();
    }).catch(() => {
        showWarning('No se pudo cargar esta imagen para editarla.');
        limpiar();
    });

    function guardar() {
        if (!img) { limpiar(); return; }
        const canvas = renderizar(img, valores, 1080);
        canvas.toBlob((blob) => {
            limpiar();
            if (blob) onGuardar(blob);
        }, 'image/jpeg', 0.92);
    }

    function limpiar() {
        if (!activo) return;
        activo = false;
        imgEl.removeEventListener('touchstart', onTouchStart);
        imgEl.removeEventListener('touchmove', onTouchMove);
        imgEl.removeEventListener('touchend', onTouchEnd);
        imgEl.removeEventListener('touchcancel', onTouchEnd);
        clearTimeout(prevTimer);
        if (lbl.parentNode) lbl.remove();
        if (chip.parentNode) chip.remove();
        if (modoActivo === control) modoActivo = null;
        // Restaurar la imagen original del carrusel
        imgEl.src = (imagen._objUrl || imagen.src);
    }

    const control = { guardar, cancelar: limpiar };
    modoActivo = control;
    return control;
}
