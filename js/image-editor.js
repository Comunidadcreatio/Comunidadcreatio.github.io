// js/image-editor.js
// Editor de imágenes integrado en la creación de Cavents.
// Herramientas: brillo, contraste, saturación, ambiente (exposición), sombras,
// calidez y zonas brillantes. Previsualización en vivo (a baja resolución) y
// render final a resolución completa al pulsar "Aplicar".

// Ajustes disponibles (rango -100..100, 0 = sin cambio)
const AJUSTES = [
    { id: 'brillo',    label: 'Brillo' },
    { id: 'contraste', label: 'Contraste' },
    { id: 'saturacion', label: 'Saturación' },
    { id: 'ambiente',  label: 'Ambiente' },
    { id: 'sombras',   label: 'Sombras' },
    { id: 'calidez',   label: 'Calidez' },
    { id: 'brillantes', label: 'Zonas brillantes' }
];

const clamp = (v) => Math.max(0, Math.min(255, v));

// Aplica todos los ajustes a un ImageData (en el sitio).
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
        // Ambiente (exposición) — gamma
        if (a.ambiente) {
            r = 255 * Math.pow(r / 255, gammaInv);
            g = 255 * Math.pow(g / 255, gammaInv);
            b = 255 * Math.pow(b / 255, gammaInv);
        }
        // Brillo
        if (a.brillo) { r += brillo; g += brillo; b += brillo; }
        // Contraste (alrededor del punto medio)
        if (a.contraste) {
            r = (r - 128) * contraste + 128;
            g = (g - 128) * contraste + 128;
            b = (b - 128) * contraste + 128;
        }
        // Saturación
        if (a.saturacion) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            r = lum + (r - lum) * saturacion;
            g = lum + (g - lum) * saturacion;
            b = lum + (b - lum) * saturacion;
        }
        // Calidez (temperatura): más rojo/menos azul (+), inverso (-)
        if (a.calidez) { r += calidez; b -= calidez; }
        // Sombras y zonas brillantes según la luminosidad del píxel
        const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (a.sombras) { const k = (1 - t) * sombras * 50; r += k; g += k; b += k; }
        if (a.brillantes) { const k = t * brillantes * 50; r += k; g += k; b += k; }
        d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
    }
}

// Carga una imagen (File o src) y devuelve un HTMLImageElement decodificado.
function cargarImagen(origen) {
    return new Promise((resolve, reject) => {
        const url = origen instanceof Blob ? URL.createObjectURL(origen) : origen;
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = url;
    });
}

// Renderiza la imagen con los ajustes en un canvas de un tamaño máximo dado.
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

/**
 * Abre el editor de imagen. Recibe la imagen actual ({ src, file }) y un
 * callback onAplicar(blob) que recibe la imagen EDITADA (JPEG) al pulsar
 * "Aplicar".
 */
export function abrirEditorImagen(imagen, onAplicar) {
    if (!imagen) return;
    const overlay = document.createElement('div');
    overlay.className = 'img-editor-overlay';
    overlay.innerHTML = `
        <style>
        .img-editor-overlay{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:'Nunito',sans-serif;}
        .img-editor-panel{background:var(--color-white,#fff);color:var(--color-ink,#1a1a1a);border-radius:16px;max-width:520px;width:100%;max-height:94vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,0.5);}
        .img-editor-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--color-gray-200,#e8e8e8);font-weight:700;}
        .img-editor-close{background:none;border:none;font-size:20px;cursor:pointer;color:var(--color-gray-500,#737373);padding:4px 8px;}
        .img-editor-preview{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#141414;padding:10px;overflow:hidden;}
        .img-editor-preview canvas{max-width:100%;max-height:100%;border-radius:8px;display:block;}
        .img-editor-controls{overflow-y:auto;padding:10px 16px 6px;display:flex;flex-direction:column;gap:4px;}
        .img-editor-row{display:flex;align-items:center;gap:10px;}
        .img-editor-row label{flex:0 0 120px;font-size:12px;font-weight:600;color:var(--color-gray-600,#525252);}
        .img-editor-row input[type=range]{flex:1;accent-color:var(--color-ink,#1a1a1a);}
        .img-editor-val{flex:0 0 34px;text-align:right;font-size:11px;color:var(--color-gray-500,#737373);}
        .img-editor-foot{display:flex;gap:10px;padding:10px 16px 14px;border-top:1px solid var(--color-gray-200,#e8e8e8);}
        .img-editor-btn{flex:1;padding:10px;border-radius:12px;border:1px solid var(--color-gray-300,#d4d4d4);background:transparent;color:var(--color-ink,#1a1a1a);font-weight:700;font-family:inherit;cursor:pointer;font-size:14px;}
        .img-editor-btn.primary{background:var(--color-ink,#1a1a1a);color:var(--color-white,#fff);border-color:var(--color-ink,#1a1a1a);}
        .img-editor-btn.primary:disabled{opacity:0.5;cursor:wait;}
        </style>
        <div class="img-editor-panel">
            <div class="img-editor-head">
                <span>Editar imagen</span>
                <button type="button" class="img-editor-close" aria-label="Cerrar">✕</button>
            </div>
            <div class="img-editor-preview"><canvas></canvas></div>
            <div class="img-editor-controls">
                ${AJUSTES.map(a => `
                    <div class="img-editor-row">
                        <label for="ie-${a.id}">${a.label}</label>
                        <input type="range" id="ie-${a.id}" min="-100" max="100" step="1" value="0">
                        <span class="img-editor-val" id="ie-val-${a.id}">0</span>
                    </div>`).join('')}
            </div>
            <div class="img-editor-foot">
                <button type="button" class="img-editor-btn" id="ie-reset">Restablecer</button>
                <button type="button" class="img-editor-btn" id="ie-cancel">Cancelar</button>
                <button type="button" class="img-editor-btn primary" id="ie-apply">Aplicar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const inputs = {};
    const vals = {};
    AJUSTES.forEach(a => {
        inputs[a.id] = overlay.querySelector('#ie-' + a.id);
        vals[a.id] = overlay.querySelector('#ie-val-' + a.id);
    });
    const leerAjustes = () => {
        const o = {};
        AJUSTES.forEach(a => { o[a.id] = parseInt(inputs[a.id].value, 10) || 0; });
        return o;
    };

    let img = null;
    let prevTimer = null;
    const PREVIEW_MAX = 360;

    // Cargar la imagen original (file recortado si existe; si no, el src)
    cargarImagen(imagen.file || imagen.src).then((im) => {
        img = im;
        // Dibujar el preview a baja resolución con los ajustes actuales
        const actualizar = () => {
            if (!img) return;
            const c = renderizar(img, leerAjustes(), PREVIEW_MAX);
            canvas.width = c.width;
            canvas.height = c.height;
            ctx.drawImage(c, 0, 0);
        };
        const debounced = () => {
            clearTimeout(prevTimer);
            prevTimer = setTimeout(actualizar, 50);
        };
        AJUSTES.forEach(a => {
            inputs[a.id].addEventListener('input', () => {
                vals[a.id].textContent = inputs[a.id].value;
                debounced();
            });
        });
        overlay.querySelector('#ie-reset').addEventListener('click', () => {
            AJUSTES.forEach(a => { inputs[a.id].value = 0; vals[a.id].textContent = '0'; });
            actualizar();
        });
        actualizar();
    }).catch(() => {
        // No se pudo cargar (formato no soportado)
        canvas.remove();
        overlay.querySelector('.img-editor-preview').innerHTML = '<p style="color:#fff;text-align:center;padding:20px;">No se pudo cargar esta imagen para editarla.</p>';
    });

    // Cerrar
    const cerrar = () => {
        overlay.remove();
    };
    overlay.querySelector('.img-editor-close').addEventListener('click', cerrar);
    overlay.querySelector('#ie-cancel').addEventListener('click', cerrar);

    // Aplicar: render a resolución completa y devolver el blob editado
    const btnAplicar = overlay.querySelector('#ie-apply');
    btnAplicar.addEventListener('click', () => {
        if (!img || btnAplicar.disabled) return;
        btnAplicar.disabled = true;
        btnAplicar.textContent = 'Procesando…';
        // Posponer al siguiente frame para que el "Procesando…" se pinte
        setTimeout(() => {
            try {
                const FULL = 1080; // misma altura que el recorte 4:5/1:1
                const c = renderizar(img, leerAjustes(), FULL);
                c.toBlob((blob) => {
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

// Reutilizable desde panel-ui: sustituye la imagen del carrusel por la editada
export function prepararArchivoEditado(blob) {
    return new File([blob], 'imagen-editada.jpg', { type: 'image/jpeg' });
}
