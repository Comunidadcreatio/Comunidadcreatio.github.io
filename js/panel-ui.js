// js/panel-ui.js
// Panel del artista: CRUD, formulario de obra, previsualización de imágenes,
// accordions del formulario y progress indicator.

import { ARTISTA_KEY, apiRequest } from './config.js?v=a76a9b6092';
import { token, artistaActual } from './auth.js?v=eeb4430018';
import { cargarMisObras, guardarObra, eliminarObra } from './panel.js?v=2416c18c96';
import { showSuccess, showError, showWarning, showInfo, showConfirm, setButtonLoading } from './notificaciones.js?v=d2867c8ca0';
import { decodeHTMLEntities, decodificarObra, errorDeImagen, escapeHtml, mostrarErrores, debugLog, cloudinaryUrl } from './utils.js?v=8861448e13';

// Cache del dropdown Mis Cavents para tiempo real
let _caventsCache = { loaded: false, data: [] };
export function invalidateCaventsCache() {
    _caventsCache.loaded = false;
    _caventsCache.data = [];
}

// (Aquí vivía syncAllCustomSelects, una copia del sincronizador de abajo que no
// se llamaba nunca: el que se usa de verdad es syncCustomSelects, dentro del
// desplegable de "Mis Cavents", que además repinta el texto del trigger.)

// ============================================
// VARIABLES DE ESTADO (PANEL)
// ============================================
export const imagenesAEliminar = new Set();

// Metadatos de la obra que el formulario NO muestra pero que el backend
// sobrescribe en cada guardado (`localizacion`, `peso`, `id_personalizado`).
// Al editar o duplicar se guardan aquí los valores que ya tenía la obra para
// reenviarlos tal cual: si no, el PUT los dejaba en ''/0 y se perdían.
export let metaObra = { idPersonalizado: '', localizacion: '', peso: '' };

function guardarMetaObra(obra) {
    metaObra = {
        idPersonalizado: obra.id_personalizado != null ? String(obra.id_personalizado) : '',
        localizacion: obra.localizacion != null ? String(obra.localizacion) : '',
        peso: obra.peso != null ? String(obra.peso) : ''
    };
}

function limpiarMetaObra() {
    metaObra = { idPersonalizado: '', localizacion: '', peso: '' };
}

// ============================================
// POSICIÓN DE LAS BARRAS INFERIORES
// ============================================
// Cuánto hay que dejar libre en la parte de abajo: el alto del nav cuando se ve.
// Con el teclado abierto chat.js le pone display:none al nav, su rect pasa a 0 y
// `innerHeight - 0` mandaba las barras a innerHeight: se iban ~840px fuera de la
// pantalla. Si el nav está oculto, las barras se pegan al borde inferior (quedan
// detrás del teclado, igual que el propio nav).
// A nivel de módulo porque lo usan la barra de pasos, las pestañas, el fondo y la
// barra del desplegable de "Mis Cavents".
function reservaInferior() {
    const nav = document.getElementById('toggle-panel');
    if (!nav) return 0;
    const rect = nav.getBoundingClientRect();
    if (rect.height === 0 || getComputedStyle(nav).display === 'none') return 0;
    return Math.max(0, window.innerHeight - rect.top);
}

// ============================================
// VALIDACIÓN DE OBLIGATORIOS
// ============================================
// El formulario es `novalidate` y el botón de guardar está en la barra de pasos
// (se puede pulsar desde cualquier paso), así que la validación nativa del
// navegador no protege nada: sin esto se podía guardar una obra sin título, sin
// año, sin precio ni descripción.
let irAlPasoFn = null;   // lo rellena setupStepNavigation (showStep)

function camposObligatoriosVacios() {
    return Array.from(document.querySelectorAll('#obra-form [data-required="true"]'))
        .filter((el) => !String(el.value || '').trim());
}

// Nombre legible del campo (su <label>), para decirle al usuario qué falta.
function nombreDelCampo(el) {
    const grupo = el.closest('.form-group') || el.closest('.form-section-content');
    const label = grupo ? grupo.querySelector('label') : null;
    const texto = label ? label.textContent.replace(/\*/g, '').trim() : '';
    return texto || el.id || 'campo';
}

// Lleva al paso (.form-section) que contiene el campo que falta.
function irAlPasoDe(el) {
    if (typeof irAlPasoFn !== 'function') return;
    const seccion = el.closest('.form-section');
    if (!seccion) return;
    const pasos = Array.from(document.querySelectorAll('#obra-form .form-section'));
    const indice = pasos.indexOf(seccion);
    if (indice >= 0) irAlPasoFn(indice);
}

// Limpia el formulario pidiendo confirmación si hay algo que perder: cambios sin
// guardar, o datos cargados de una obra que se está editando/duplicando.
export async function limpiarFormularioConConfirmacion() {
    const idEdicion = (document.getElementById('input-id-edicion') || {}).value || '';
    const boton = document.getElementById('obra-step-crear');
    const modoDuplicar = /Duplicar/i.test(boton ? boton.textContent : '');
    const aviso = hayCambiosNoGuardados
        ? '⚠️ Tienes cambios sin guardar en el formulario.\n\n¿Seguro que quieres vaciarlo?'
        : (idEdicion || modoDuplicar
            ? '¿Vaciar el formulario? Estás editando una obra: se perderán los datos cargados (la obra no cambia hasta que guardes).'
            : null);
    if (aviso) {
        const ok = await showConfirm(aviso);
        if (!ok) return false;
    }
    limpiarFormularioCompleto(true);
    return true;
}

// Rellena un <select> con el valor guardado. Si ese valor NO está entre las
// opciones (datos de una versión anterior, importaciones, otro cliente…), el
// select se quedaría vacío y al guardar se perdería en silencio: se añade como
// opción para conservarlo.
function setSelectValue(selectEl, valor) {
    if (!selectEl) return;
    selectEl.value = valor;
    if (valor && selectEl.value !== valor) {
        const opt = document.createElement('option');
        opt.value = valor;
        opt.textContent = valor;
        opt.dataset.temporal = '1';   // se quita al limpiar el formulario
        selectEl.appendChild(opt);
        selectEl.value = valor;
    }
}

// FORM CHANGE TRACKING
// ============================================
let hayCambiosNoGuardados = false;

export function setupFormChangeTracking() {
    const form = document.getElementById('obra-form');
    if (!form) return;

    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        const evento = input.tagName === 'SELECT' ? 'change' : 'input';
        input.addEventListener(evento, () => {
            hayCambiosNoGuardados = true;
        });
    });
}

export async function confirmarDescartarCambios() {
    if (hayCambiosNoGuardados) {
        return await showConfirm('⚠️ Tienes cambios sin guardar en el formulario.\n\n¿Estás seguro de que quieres descartarlos?');
    }
    return true;
}

function resetCambiosNoGuardados() {
    hayCambiosNoGuardados = false;
}

// ============================================
// REFRESCAR TABLA (CRUD)
// ============================================
// NOTA: La tabla HTML de "Mis Cavents" fue eliminada. Esta función ahora
// solo invalida el cache del dropdown de cavents para forzar recarga.
export async function refrescarTabla() {
    // Si los elementos de paginación ya no existen, solo invalidar cache
    const pageInfo = document.getElementById('page-info');
    if (!pageInfo) {
        invalidateCaventsCache();
        return;
    }

    const result = await cargarMisObras(currentPage, currentLimit, currentSearch, currentSortBy, currentOrder);
    if (!result.success) {
        debugLog.error("Error al cargar obras:", result.error);
        if (result.error && (result.error.includes("Sesión expirada") || result.error.includes("401"))) {
            showWarning("Tu sesión ha expirado. Serás redirigido a la página principal.");
            localStorage.removeItem(ARTISTA_KEY);
            window.location.href = '/';
            return;
        }
        mostrarErrores(result);
        return;
    }
    totalObras = result.total;
    const totalPages = Math.ceil(totalObras / currentLimit);
    pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;

    // NOTA: aquí había un `if (typeof renderizarTabla === 'function')` que llamaba
    // a la tabla antigua de "Mis Cavents". Esa función ya no existe (la lista es
    // el desplegable), así que el bloque nunca se ejecutaba: se quitó. La lista se
    // refresca invalidando la caché (arriba) y volviéndola a pedir en loadCavents.
}

// ============================================
// PREVISUALIZACIÓN DE IMÁGENES (CARRUSEL)

// ============================================
// PREVISUALIZACIÓN DE IMÁGENES (CARRUSEL)
// ============================================
const MAX_IMAGENES = 5;
let imagenesData = []; // [{src, file, slot}] — datos de imágenes en el carrusel
let currentSlide = 0;
let aspectRatio = '4/5';
// Guardas del guardado:
//  - guardandoObra: hay un POST/PUT en vuelo (evita el doble envío).
//  - imagenesEnProceso: recortes/descargas de imagen sin terminar. Guardar con
//    alguna en proceso crearía la obra sin esas imágenes.
let guardandoObra = false;
let imagenesEnProceso = 0;

function actualizarCarrusel() {
    const track = document.getElementById('carrusel-track');
    const dots = document.getElementById('carrusel-dots');
    const count = document.getElementById('carrusel-count');
    if (!track || !dots || !count) return;

    track.innerHTML = '';
    dots.innerHTML = '';

    if (imagenesData.length === 0) {
        // Slide vacío
        const emptySlide = document.createElement('div');
        emptySlide.className = 'carrusel-slide carrusel-slide-empty';
        emptySlide.innerHTML = '<span class="empty-icon">+</span><span class="empty-text">Agregar imagen</span>';
        emptySlide.addEventListener('click', () => dispararInput(0));
        track.appendChild(emptySlide);
    } else {
        imagenesData.forEach((img, i) => {
            const slide = document.createElement('div');
            slide.className = 'carrusel-slide';
            const imgEl = document.createElement('img');
            imgEl.src = img.src;
            slide.appendChild(imgEl);

            // Botón eliminar
            const btnDel = document.createElement('button');
            btnDel.type = 'button';
            btnDel.className = 'btn-eliminar-slide';
            btnDel.textContent = '✕';
            btnDel.addEventListener('click', (e) => {
                e.stopPropagation();
                eliminarImagen(i);
            });
            slide.appendChild(btnDel);
            track.appendChild(slide);
        });

        // Dots
        imagenesData.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = 'carrusel-dot' + (i === currentSlide ? ' active' : '');
            dot.addEventListener('click', () => irASlide(i));
            dots.appendChild(dot);
        });
    }

    // Update count
    count.textContent = `${imagenesData.length} / ${MAX_IMAGENES}`;

    // Update track position. Al quedarse sin imágenes hay que DEVOLVER el
    // transform a 0: si no, el carrusel se quedaba desplazado y el hueco de
    // "Agregar imagen" no se veía (se veía el fondo vacío).
    if (imagenesData.length > 0) {
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
    } else {
        track.style.transform = '';
    }

    // Update dots
    dots.querySelectorAll('.carrusel-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
    });

    // El progreso cuenta también las imágenes: hay que recalcularlo cada vez que
    // cambian (antes se quedaba en el valor del último campo de texto tocado).
    updateFormProgress();
}

function irASlide(index) {
    if (imagenesData.length === 0) return;
    currentSlide = Math.max(0, Math.min(index, imagenesData.length - 1));
    actualizarCarrusel();
}

function getNextFreeSlot() {
    const used = new Set(imagenesData.map(img => img.slot));
    for (let i = 0; i < MAX_IMAGENES; i++) {
        if (!used.has(i)) return i;
    }
    return imagenesData.length; // fallback: no debería ocurrir por el guard de MAX_IMAGENES
}

function eliminarImagen(index) {
    // Guardar el slot ORIGINAL antes del splice (los índices visuales cambian)
    const slotEliminado = imagenesData[index].slot;
    imagenesData.splice(index, 1);
    const editId = document.getElementById('input-id-edicion').value;
    if (editId) imagenesAEliminar.add(slotEliminado);
    // Limpiar input file correspondiente
    const inp = document.getElementById(`input-imagen-${slotEliminado}`);
    if (inp) inp.value = '';
    if (currentSlide >= imagenesData.length) {
        currentSlide = Math.max(0, imagenesData.length - 1);
    }
    actualizarCarrusel();
}

function dispararInput(index) {
    if (imagenesData.length >= MAX_IMAGENES) {
        // Antes se salía en silencio y el "+" parecía roto.
        showWarning('Ya hay ' + MAX_IMAGENES + ' imágenes (el máximo). Elimina una para añadir otra.');
        return;
    }
    const inp = document.getElementById(`input-imagen-${index}`);
    if (inp) inp.click();
}

// Recorta una imagen (centrada) al ratio indicado ('4/5' o '1/1') con canvas.
// Devuelve { file, dataURL } con la imagen ya normalizada (JPEG, ancho 1080).
// Así el archivo que se guarda SIEMPRE queda en 4:5 (1080×1350) o 1:1
// (1080×1080) y el grid/carrusel solo muestran esos formatos.
function cropearImagen(file, aspect) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const target = aspect === '1/1' ? 1 : 4 / 5;
                const iw = img.naturalWidth, ih = img.naturalHeight;
                const imgAspect = iw / ih;
                let sw, sh, sx, sy;
                if (imgAspect > target) {
                    // Más ancha que el target → recortar lados
                    sh = ih; sw = Math.round(ih * target); sx = Math.round((iw - sw) / 2); sy = 0;
                } else {
                    // Más alta que el target → recortar arriba/abajo
                    sw = iw; sh = Math.round(iw / target); sx = 0; sy = Math.round((ih - sh) / 2);
                }
                const outW = 1080; // ancho fijo (Cloudinary limita ancho a 1080)
                const outH = Math.round(outW / target); // 4:5 → 1350, 1:1 → 1080
                const canvas = document.createElement('canvas');
                canvas.width = outW;
                canvas.height = outH;
                const ctx = canvas.getContext('2d');
                // Fondo blanco: evita fondo negro al exportar JPEG si la imagen tiene transparencia
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, outW, outH);
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) return reject(new Error('No se pudo recortar la imagen'));
                    const nombre = (file.name || 'imagen').replace(/\.[^.]+$/, '') + '.jpg';
                    const cropped = new File([blob], nombre, { type: 'image/jpeg' });
                    resolve({ file: cropped, dataURL: canvas.toDataURL('image/jpeg', 0.9) });
                }, 'image/jpeg', 0.9);
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
        img.src = url;
    });
}

async function agregarImagen(file, dataUrl) {
    if (imagenesData.length >= MAX_IMAGENES) return;
    // Validar antes de nada: sin esto un archivo que no es imagen o que pasa de
    // los 10 MB de multer llegaba al servidor y devolvía un 500 genérico.
    const problema = errorDeImagen(file);
    if (problema) {
        showError(problema);
        return;
    }
    if (imagenesData.length >= MAX_IMAGENES) {
        showWarning('Ya hay ' + MAX_IMAGENES + ' imágenes (el máximo). Elimina una para añadir otra.');
        return;
    }
    // El archivo aún no está en imagenesData mientras se recorta: se cuenta como
    // "en proceso" para que el guardado no lo deje fuera.
    imagenesEnProceso++;
    // El slot se RESERVA antes de esperar al recorte: si se eligen dos archivos a
    // la vez, los dos esperaban al canvas y luego pedían "el primer hueco libre",
    // que era el mismo para ambos (una de las dos imágenes se perdía).
    const slot = getNextFreeSlot();
    imagenesData.push({ src: dataUrl, file: null, slot: slot, original: file, recortando: true });
    actualizarCarrusel();
    try {
        // Recortar al ratio seleccionado (4:5 o 1:1)
        const recortada = await cropearImagen(file, aspectRatio);
        const entrada = imagenesData.find((i) => i.slot === slot);
        if (!entrada) return;                     // se borró mientras se recortaba
        entrada.src = recortada.dataURL;
        entrada.file = recortada.file;
        entrada.original = file;                  // para re-recortar sin degradar
        delete entrada.recortando;
        currentSlide = imagenesData.length - 1;
        actualizarCarrusel();
    } catch (e) {
        debugLog.error('No se pudo recortar la imagen, se usa la original:', e);
        // Avisar al usuario: la imagen no se pudo normalizar (p.ej. HEIC de
        // iPhone, formato no soportado o archivo corrupto) y se adjuntará el
        // archivo original, que puede fallar al subir por su tamaño/formato.
        showWarning('Esta imagen no se pudo procesar (formato no compatible). Se usará el archivo original: se recomienda JPG o PNG para mejor calidad y menor peso.');
        const entrada = imagenesData.find((i) => i.slot === slot);
        if (entrada) {
            entrada.src = dataUrl;
            entrada.file = file;
            entrada.original = file;
            delete entrada.recortando;
        }
        currentSlide = imagenesData.length - 1;
        actualizarCarrusel();
    } finally {
        imagenesEnProceso--;
    }
}

export function aplicarPreviewImagen(slot, url) {
    // Usado al editar/duplicar: agregar imagen desde URL con su slot original
    if (imagenesData.length >= MAX_IMAGENES) return;
    imagenesData.push({ src: url, file: null, slot: slot });
    if (imagenesData.length === 1) currentSlide = 0;
    actualizarCarrusel();
}

export async function cargarUrlEnInput(index, url) {
    // Se descarga y re-codifica una imagen: mientras dura, esa entrada de
    // imagenesData todavía tiene file:null y no se subiría al guardar.
    imagenesEnProceso++;
    try {
        const blob = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas toBlob failed'));
                }, 'image/jpeg', 0.95);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
        const file = new File([blob], `duplicada-${index}.jpg`, { type: 'image/jpeg' });
        // Update the stored image with the downloaded file
        for (let i = imagenesData.length - 1; i >= 0; i--) {
            if (imagenesData[i].src === url && !imagenesData[i].file) {
                imagenesData[i].file = file;
                break;
            }
        }
        return true;
    } catch (err) {
        debugLog.error('No se pudo cargar la imagen para duplicar:', url, err);
        return false;
    } finally {
        imagenesEnProceso--;
    }
}

export function setupImagePreviews() {
    // Botón "+ Agregar"
    const btnAgregar = document.getElementById('btn-agregar-imagen');
    if (btnAgregar) {
        btnAgregar.addEventListener('click', () => {
            // Buscar el primer slot sin usar
            for (let i = 0; i < MAX_IMAGENES; i++) {
                const inp = document.getElementById(`input-imagen-${i}`);
                if (inp && !inp.files?.length) {
                    inp.click();
                    return;
                }
            }
            // Ningún hueco libre: antes el botón no hacía nada y parecía roto.
            showWarning('Ya hay ' + MAX_IMAGENES + ' imágenes (el máximo). Elimina una para añadir otra.');
        });
    }

    // File inputs
    for (let i = 0; i < MAX_IMAGENES; i++) {
        const input = document.getElementById(`input-imagen-${i}`);
        if (input) {
            input.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        agregarImagen(file, e.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }

    // Touch/swipe en el carrusel (arrastre en tiempo real)
    const viewport = document.getElementById('carrusel-viewport');
    const track = document.getElementById('carrusel-track');
    if (viewport && track) {
        let startX = 0;
        let isDragging = false;

        viewport.addEventListener('touchstart', (e) => {
            if (imagenesData.length <= 1) return;
            startX = e.touches[0].clientX;
            isDragging = true;
            track.style.transition = 'none';
        }, { passive: true });

        viewport.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const diff = e.touches[0].clientX - startX;
            const percent = (diff / viewport.offsetWidth) * 100;
            track.style.transform = `translateX(${-currentSlide * 100 + percent}%)`;
        }, { passive: true });

        viewport.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            track.style.transition = ''; // restaurar transición CSS
            if (imagenesData.length <= 1) return;
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
                if (diff > 0) irASlide(currentSlide + 1);
                else irASlide(currentSlide - 1);
            } else {
                track.style.transform = `translateX(-${currentSlide * 100}%)`;
            }
        });
    }

    actualizarCarrusel();

    // Ratio toggle
    document.querySelectorAll(".ratio-btn").forEach(btn => {
        btn.addEventListener("click", async function() {
            document.querySelectorAll(".ratio-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            aspectRatio = this.dataset.ratio;
            document.getElementById("carrusel-viewport").style.aspectRatio = aspectRatio;
            // Re-recortar las imágenes ya agregadas al nuevo ratio. SIEMPRE desde
            // el archivo ORIGINAL que eligió el usuario: antes se recortaba el
            // resultado anterior, así que cada cambio de ratio volvía a recortar
            // una imagen ya recortada (se perdían bordes y calidad). Las de
            // edición descargadas del servidor no tienen original: se usa su file.
            for (const img of imagenesData.filter(i => i.original || i.file)) {
                try {
                    const recortada = await cropearImagen(img.original || img.file, aspectRatio);
                    img.src = recortada.dataURL;
                    img.file = recortada.file;
                } catch (e) {
                    debugLog.error('No se pudo re-recortar la imagen al cambiar ratio:', e);
                }
            }
            actualizarCarrusel();
        });
    });
}

// ============================================
// LIMPIAR FORMULARIO
// ============================================
export function limpiarFormularioCompleto(restaurarArtista = true) {
    const obraForm = document.getElementById('obra-form');
    if (!obraForm) return;
    obraForm.reset();
    // Las opciones que se añadieron para conservar un valor guardado que no
    // estaba en la lista no deben quedarse en el desplegable.
    obraForm.querySelectorAll('option[data-temporal]').forEach(opt => opt.remove());
    // Resetear todos los custom selects
    document.querySelectorAll('#obra-form .form-group select').forEach(sel => {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    resetCambiosNoGuardados();
    document.getElementById('input-id-edicion').value = '';
    limpiarMetaObra();
    document.getElementById('btn-guardar').textContent = 'Crear Cavent';
    const crearBtn = document.getElementById('obra-step-crear');
    if (crearBtn) crearBtn.textContent = 'Crear Cavent';
    const caventsTrigger = document.getElementById('cavents-trigger');
    if (caventsTrigger) caventsTrigger.innerHTML = 'Mis Cavents <span style="font-size:10px;">▴</span>';
    imagenesAEliminar.clear();
    // Limpiar carrusel
    imagenesData = [];
    currentSlide = 0;
    actualizarCarrusel();
    // Limpiar inputs file
    for (let i = 0; i < 5; i++) {
        const inputFile = document.getElementById(`input-imagen-${i}`);
        if (inputFile) inputFile.value = '';
    }
    if (restaurarArtista && artistaActual) {
        document.getElementById('input-artista').value = artistaActual.nombre_artista;
    }
    resetAccordionStatus();
}

// ============================================
// SETUP DEL FORMULARIO DE OBRA (submit handler)
// ============================================
export function setupObraFormSubmit() {
    const obraForm = document.getElementById('obra-form');
    if (!obraForm) return;

    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Doble envío: el estado de carga se ponía en #btn-guardar, que está
        // OCULTO, así que el botón visible (#obra-step-crear) seguía activo y un
        // segundo toque creaba una segunda obra. Esta guarda + el disabled del
        // botón visible cierran las dos vías (toque doble y Enter).
        if (guardandoObra) return;
        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        // Se reenvían los metadatos que el formulario no muestra (si no, el PUT
        // los borraría: localizacion='', peso=0, id_personalizado='').
        const idPersonalizado = metaObra.idPersonalizado;
        const idEdicion = document.getElementById('input-id-edicion').value;
        const ano = document.getElementById('input-ano').value;
        const descripcion_tecnica = document.getElementById('input-descripcion-tecnica').value;
        const soporte = document.getElementById('input-soporte').value;
        const descripcion_artistica = document.getElementById('input-descripcion-artistica').value;
        const estado_obra = document.getElementById('input-estado-obra').value;
        const procedencia = document.getElementById('input-procedencia').value;
        const marcos = document.getElementById('input-marcos').value;
        const certificado = document.getElementById('input-certificado').value;
        const status = document.getElementById('input-status').value;
        const ancho = document.getElementById('input-ancho').value;
        const alto = document.getElementById('input-alto').value;
        const firma = document.getElementById('input-firma').value;
        const conservacion = document.getElementById('input-conservacion').value;
        const etiquetas = document.getElementById('input-etiquetas').value
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
            .join(', ');
        // Validar: al menos una imagen
        if (imagenesData.length === 0) {
            showWarning("La obra debe tener al menos una imagen. No puedes guardar sin imágenes.");
            return;
        }
        // Obligatorios: se avisa de cuáles faltan y se lleva al paso del primero,
        // que es lo único que el usuario puede hacer al respecto.
        const faltantes = camposObligatoriosVacios();
        if (faltantes.length) {
            const nombres = faltantes.map(nombreDelCampo);
            showWarning('Faltan campos obligatorios: ' + nombres.join(', ') + '.');
            irAlPasoDe(faltantes[0]);
            return;
        }
        // Alguna imagen todavía se está recortando o copiando (p.ej. al duplicar
        // una obra): guardar ahora la crearía sin ella. En modo edición las
        // imágenes ya guardadas tienen file:null y eso es correcto, por eso se
        // comprueba lo que está EN PROCESO y no los file:null.
        if (imagenesEnProceso > 0) {
            showWarning('Las imágenes todavía se están preparando. Espera un momento y vuelve a guardar.');
            return;
        }

        // El estado de carga va en los DOS botones: el visible de la barra de
        // pasos (#obra-step-crear) y el oculto del formulario (#btn-guardar).
        const btnGuardar = document.getElementById('btn-guardar');
        const btnCrear = document.getElementById('obra-step-crear');
        guardandoObra = true;
        setButtonLoading(btnGuardar, true);
        setButtonLoading(btnCrear, true);

        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado);
        // El formulario no tiene campos para estos dos, pero el backend los
        // escribe siempre en el UPDATE: se reenvían los de la obra editada.
        formData.append('localizacion', metaObra.localizacion);
        formData.append('peso', metaObra.peso);
        formData.append('ano', ano);
        formData.append('descripcion_tecnica', descripcion_tecnica);
        formData.append('soporte', soporte);
        formData.append('descripcion_artistica', descripcion_artistica);
        formData.append('estado_obra', estado_obra);
        formData.append('procedencia', procedencia);
        formData.append('marcos', marcos);
        formData.append('certificado', certificado);
        formData.append('status', status);
        formData.append('ancho', ancho);
        formData.append('alto', alto);
        formData.append('firma', firma);
        formData.append('conservacion', conservacion);
        formData.append('etiquetas', etiquetas);
        if (imagenesAEliminar.size > 0) {
            formData.append('imagenes_a_eliminar', JSON.stringify([...imagenesAEliminar]));
        }
        // Adjuntar archivos desde imagenesData (usando el slot original)
        imagenesData.forEach((img) => {
            if (img.file) {
                formData.append(`imagen_${img.slot}`, img.file);
            }
        });
        try {
            const result = await guardarObra(formData, idEdicion || null);
            if (result.success) {
                showSuccess("Obra guardada correctamente.");
                invalidateCaventsCache();
                document.getElementById('btn-guardar').textContent = 'Crear Cavent';
                imagenesAEliminar.clear();
                limpiarFormularioCompleto(true);
                await refrescarTabla();
                if (typeof window.actualizarEstadisticas === 'function') window.actualizarEstadisticas();
            } else {
                mostrarErrores(result);
            }
        } finally {
            // Pase lo que pase (éxito, error del servidor o excepción) el
            // formulario vuelve a quedar operable: antes, cualquier fallo dejaba
            // los botones en estado de carga para siempre.
            guardandoObra = false;
            setButtonLoading(btnGuardar, false);
            setButtonLoading(btnCrear, false);
        }
    });
}

// ============================================
// ACCORDIONS DEL FORMULARIO Y PROGRESS
// ============================================

// Convierte un <select> en dropdown custom (estilo ciudad).
// ACCESIBILIDAD: el <select> original se oculta, así que el control tiene que
// llevar los roles de un combobox y responder al teclado (flechas, Inicio/Fin,
// Enter/Espacio y Escape). Antes solo funcionaba con toque/ratón: con teclado o
// lector de pantalla esos 9 campos del formulario eran inalcanzables.
function initCustomSelect(selectEl, placeholder) {
    if (!selectEl || selectEl.dataset.customReady === '1') return;
    selectEl.dataset.customReady = '1';
    selectEl.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const idBase = selectEl.id || 'custom-select';
    const dropdownId = idBase + '-lista';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.textContent = placeholder || 'Seleccionar';
    // El nombre accesible sale del <label> del campo (los del formulario lo tienen).
    const label = document.querySelector('label[for="' + idBase + '"]');
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', dropdownId);
    trigger.setAttribute('aria-label', label ? label.textContent.replace(/\*/g, '').trim() : (placeholder || 'Seleccionar'));
    // Si el select ya tiene un valor preseleccionado, mostrarlo
    if (selectEl.selectedOptions[0] && selectEl.selectedOptions[0].value) {
        trigger.textContent = selectEl.selectedOptions[0].textContent;
    }
    wrapper.appendChild(trigger);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    dropdown.id = dropdownId;
    dropdown.setAttribute('role', 'listbox');
    wrapper.appendChild(dropdown);

    let resaltado = -1;   // índice de la opción marcada con el teclado

    function opciones() {
        return Array.from(dropdown.querySelectorAll('.custom-select-option'));
    }

    function resaltar(indice) {
        const lista = opciones();
        if (!lista.length) return;
        resaltado = (indice + lista.length) % lista.length;
        lista.forEach((el, i) => el.classList.toggle('resaltada', i === resaltado));
        trigger.setAttribute('aria-activedescendant', lista[resaltado].id);
        lista[resaltado].scrollIntoView({ block: 'nearest' });
    }

    function abrir() {
        buildOptions();
        positionDropdown();
        dropdown.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        const marcada = opciones().findIndex((el) => el.getAttribute('aria-selected') === 'true');
        resaltar(marcada >= 0 ? marcada : 0);
    }

    function cerrar() {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
    }

    function elegir(indice) {
        const lista = opciones();
        const item = lista[indice];
        if (!item) return;
        const opt = Array.from(selectEl.options).find((o) => o.value === item.dataset.value);
        selectEl.value = item.dataset.value;
        trigger.textContent = opt ? opt.textContent : item.textContent;
        lista.forEach((el) => el.setAttribute('aria-selected', String(el === item)));
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        cerrar();
        trigger.focus();
    }

    function buildOptions() {
        dropdown.innerHTML = '';
        Array.from(selectEl.querySelectorAll('option')).forEach((opt, i) => {
            if (opt.disabled && !opt.value) return;
            const item = document.createElement('div');
            item.className = 'custom-select-option';
            item.textContent = opt.textContent;
            item.dataset.value = opt.value;
            item.id = idBase + '-opcion-' + i;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(selectEl.value === opt.value));
            item.addEventListener('click', () => elegir(opciones().indexOf(item)));
            dropdown.appendChild(item);
        });
    }

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = Math.min(rect.left, window.innerWidth - rect.width - 24) + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropdown.classList.contains('open')) cerrar();
        else abrir();
    });

    trigger.addEventListener('keydown', (e) => {
        const abierto = dropdown.classList.contains('open');
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                e.preventDefault();
                if (!abierto) abrir();
                else resaltar(resaltado + (e.key === 'ArrowDown' ? 1 : -1));
                break;
            case 'Home':
                if (abierto) { e.preventDefault(); resaltar(0); }
                break;
            case 'End':
                if (abierto) { e.preventDefault(); resaltar(opciones().length - 1); }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (!abierto) abrir();
                else if (resaltado >= 0) elegir(resaltado);
                break;
            case 'Escape':
                if (abierto) { e.preventDefault(); e.stopPropagation(); cerrar(); }
                break;
            case 'Tab':
                if (abierto) cerrar();
                break;
            default: {
                // Búsqueda por letra (como un <select> nativo)
                if (!abierto || e.key.length !== 1) break;
                const letra = e.key.toLowerCase();
                const lista = opciones();
                const desde = resaltado + 1;
                for (let i = 0; i < lista.length; i++) {
                    const idx = (desde + i) % lista.length;
                    if (lista[idx].textContent.toLowerCase().startsWith(letra)) {
                        e.preventDefault();
                        resaltar(idx);
                        break;
                    }
                }
            }
        }
    });

    window.addEventListener('scroll', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) cerrar();
    });

    selectEl.addEventListener('change', () => {
        const selected = selectEl.selectedOptions[0];
        if (selected) trigger.textContent = selected.textContent;
    });
}

function setupCustomSelects() {
    const formSelectors = [
        { id: 'input-status', placeholder: 'Selecciona Status' },
        { id: 'input-estado-obra', placeholder: 'Selecciona Estado' },
        { id: 'input-descripcion-tecnica', placeholder: 'Selecciona Técnica' },
        { id: 'input-soporte', placeholder: 'Selecciona Soporte' },
        { id: 'input-marcos', placeholder: 'Selecciona Marcos' },
        { id: 'input-procedencia', placeholder: 'Selecciona Procedencia' },
        { id: 'input-certificado', placeholder: 'Selecciona Certificado' },
        { id: 'input-firma', placeholder: 'Selecciona Firma' },
        { id: 'input-conservacion', placeholder: 'Selecciona Conservación' }
    ];
    formSelectors.forEach(s => initCustomSelect(document.getElementById(s.id), s.placeholder));
}

// ============================================
// ETIQUETAS DE TIPO DE CREACIÓN (Cavents / Problogs)
// "Cavents" muestra el formulario actual; "Problogs" aún vacío
// (contenido por implementar).
// ============================================
function setupCrearTabs() {
    const tabCavents = document.getElementById('tab-cavents');
    const tabProblogs = document.getElementById('tab-problogs');
    const proContenido = document.getElementById('crear-problogs-contenido');
    if (!tabCavents || !tabProblogs) return;

    function seleccionarTipo(tipo) {
        const esProblogs = tipo === 'problogs';
        tabCavents.classList.toggle('activa', !esProblogs);
        tabProblogs.classList.toggle('activa', esProblogs);
        document.body.classList.toggle('creando-problogs', esProblogs);
        if (proContenido) proContenido.classList.toggle('hidden', !esProblogs);
    }

    tabCavents.addEventListener('click', () => seleccionarTipo('cavents'));
    tabProblogs.addEventListener('click', () => seleccionarTipo('problogs'));
    seleccionarTipo('cavents'); // estado inicial: Cavents seleccionada
}

// ============================================
// DROPDOWN MIS CAVENTS (sobre barra de pasos)
// ============================================
function setupCaventsDropdown() {
    const caventsBar = document.getElementById('obra-cavents-bar');
    const trigger = document.getElementById('cavents-trigger');
    const dropdown = document.getElementById('cavents-dropdown');
    const stepBar = document.getElementById('obra-step-bar');
    if (!caventsBar || !trigger || !dropdown || !stepBar) return;

    const ICONS_CAVENT = {
        editar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
        duplicar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        eliminar: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
    };

    // Posicionar encima de la barra de pasos y de las etiquetas
    function positionBar() {
        const togglePanel = document.getElementById('toggle-panel');
        if (!togglePanel || !stepBar) return;
        const fromBottom = reservaInferior();
        const stepBarH = stepBar.offsetHeight || 48;
        const tabsBar = document.getElementById('crear-tabs');
        const tabsH = tabsBar ? (tabsBar.offsetHeight || 40) : 0;
        caventsBar.style.bottom = (fromBottom + stepBarH + tabsH) + 'px';
    }
    // Esperar a que el DOM esté listo y la step bar posicionada
    setTimeout(positionBar, 100);
    window.addEventListener('resize', positionBar);

    function syncCustomSelects() {
        try {
            document.querySelectorAll('#obra-form .form-group select').forEach(sel => {
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                const wrapper = sel.closest('.custom-select');
                if (wrapper) {
                    const trigger = wrapper.querySelector('.custom-select-trigger');
                    const selected = sel.selectedOptions[0];
                    if (trigger && selected && selected.value) {
                        trigger.textContent = selected.textContent;
                    }
                }
            });
        } catch(e) {
            debugLog.error('syncCustomSelects error:', e);
        }
    }

    function setFormMode(mode, caventName) {
        const crearBtn = document.getElementById('obra-step-crear');
        const guardarBtn = document.getElementById('btn-guardar');
        if (mode === 'edit') {
            if (crearBtn) crearBtn.textContent = 'Actualizar Cavent';
            if (guardarBtn) guardarBtn.textContent = 'Actualizar Cavent';
        } else if (mode === 'duplicate') {
            if (crearBtn) crearBtn.textContent = 'Duplicar Cavent';
            if (guardarBtn) guardarBtn.textContent = 'Duplicar Cavent';
        } else {
            if (crearBtn) crearBtn.textContent = 'Crear Cavent';
            if (guardarBtn) guardarBtn.textContent = 'Crear Cavent';
        }
        if (caventName) {
            // Solo el titulo del cavent, izquierda, mismo tamaño que "Mis Cavents"
            trigger.textContent = caventName;
        } else {
            trigger.innerHTML = 'Mis Cavents <span style="font-size:10px;">▴</span>';
        }
    }

    async function loadCavents() {
        if (_caventsCache.loaded) return;
        try {
            if (!token) { debugLog.error('Token no disponible para cargar cavents'); return; }
            const result = await cargarMisObras(1, 50);
            if (result.success) {
                // Los títulos de la lista se pintan con innerHTML: se decodifican
                // aquí para que no aparezcan entidades ("&#x27;") en el desplegable.
                _caventsCache.data = (result.obras || []).map(decodificarObra);
                _caventsCache.loaded = true;
            } else {
                debugLog.error('Error API cavents:', result);
            }
        } catch (e) {
            debugLog.error('Error cargando cavents:', e);
        }
    }

    function buildDropdown() {
        dropdown.innerHTML = '';
        if (_caventsCache.data.length === 0) {
            dropdown.innerHTML = '<div class="cavent-item" style="color:#888;justify-content:center;">No tienes cavents aún</div>';
            return;
        }
        _caventsCache.data.forEach((obra, index) => {
            const statusText = obra.status && obra.status.includes('Activo') ? 'Activo' : 
                              obra.status && obra.status.includes('Inactivo') ? 'Inactivo' : '—';
            const statusClass = statusText === 'Activo' ? 'status-activo' : 
                               statusText === 'Inactivo' ? 'status-inactivo' : 'status-desconocido';
            const precio = obra.precio ? `$${parseFloat(obra.precio).toFixed(2)}` : '—';
            
            const item = document.createElement('div');
            item.className = 'cavent-item';
            item.innerHTML = `
                <span class="cavent-item-num">#${index + 1}</span>
                <div class="cavent-item-info">
                    <div class="cavent-item-titulo">${escapeHtml(obra.titulo || 'Sin título')}</div>
                    <div class="cavent-item-meta">
                        <span>${precio}</span>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                </div>
                <div class="cavent-item-actions">
                    <button class="btn-edit" data-id="${obra.id}" title="Editar">${ICONS_CAVENT.editar}</button>
                    <button class="btn-dup" data-id="${obra.id}" title="Duplicar">${ICONS_CAVENT.duplicar}</button>
                    <button class="btn-del" data-id="${obra.id}" title="Eliminar">${ICONS_CAVENT.eliminar}</button>
                </div>
            `;
            
            // Se ESPERAN (await): duplicar/editar cargan las imágenes de forma
            // asíncrona y sin esperar el usuario podía guardar a mitad de la
            // copia (la obra se creaba sin las imágenes que faltaban).
            item.querySelector('.cavent-item-info').addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            item.querySelector('.cavent-item-num').addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            item.querySelector('.btn-edit').addEventListener('click', async (e) => { e.stopPropagation(); await editarCavent(obra.id, obra.titulo); });
            item.querySelector('.btn-dup').addEventListener('click', async (e) => { e.stopPropagation(); await duplicarCavent(obra.id, obra.titulo); });
            item.querySelector('.btn-del').addEventListener('click', async (e) => { e.stopPropagation(); await eliminarCavent(obra.id); });
            
            dropdown.appendChild(item);
        });
    }

    async function editarCavent(id, nombre) {
        dropdown.classList.remove('open');
        setFormMode('edit', nombre);
        try {
            const data = await apiRequest('/obras/' + id);
            if (!data || data.success === false) { showError('No se pudo cargar la obra'); return; }
            const obra = data;
            // id personalizado / localización / peso no tienen campo en el
            // formulario: se recuerdan para reenviarlos al guardar.
            guardarMetaObra(obra);
            document.getElementById('input-id-edicion').value = obra.id;
            // El título también se decodifica: era el ÚNICO campo sin hacerlo y,
            // al volver a guardar, el "&" de la entidad se re-escapaba en el
            // servidor ("Retrato &#x2F; Estudio" → "Retrato &amp;#x2F; Estudio"),
            // de modo que el título se corrompía un poco más en cada edición.
            document.getElementById('input-titulo').value = decodeHTMLEntities(obra.titulo || '');
            document.getElementById('input-artista').value = (artistaActual && artistaActual.nombre_artista) || obra.artista || '';
            document.getElementById('input-ano').value = obra.ano || '';
            document.getElementById('input-precio').value = obra.precio || '';
            document.getElementById('input-ancho').value = obra.ancho || '';
            document.getElementById('input-alto').value = obra.alto || '';
            document.getElementById('input-descripcion-artistica').value = decodeHTMLEntities(obra.descripcion_artistica || '');
            setSelectValue(document.getElementById('input-status'), decodeHTMLEntities(obra.status || ''));
            setSelectValue(document.getElementById('input-estado-obra'), decodeHTMLEntities(obra.estado_obra || ''));
            setSelectValue(document.getElementById('input-descripcion-tecnica'), decodeHTMLEntities(obra.descripcion_tecnica || ''));
            setSelectValue(document.getElementById('input-soporte'), decodeHTMLEntities(obra.soporte || ''));
            setSelectValue(document.getElementById('input-marcos'), decodeHTMLEntities(obra.marcos || ''));
            setSelectValue(document.getElementById('input-procedencia'), decodeHTMLEntities(obra.procedencia || ''));
            setSelectValue(document.getElementById('input-certificado'), decodeHTMLEntities(obra.certificado || ''));
            setSelectValue(document.getElementById('input-firma'), decodeHTMLEntities(obra.firma || ''));
            setSelectValue(document.getElementById('input-conservacion'), decodeHTMLEntities(obra.conservacion || ''));
            document.getElementById('input-etiquetas').value = decodeHTMLEntities(obra.etiquetas || '');
            // Cargar imágenes
            const imagenes = [
                cloudinaryUrl(obra.imagen_url), cloudinaryUrl(obra.imagen_url_1), cloudinaryUrl(obra.imagen_url_2),
                cloudinaryUrl(obra.imagen_url_3), cloudinaryUrl(obra.imagen_url_4)
            ];
            imagenesAEliminar.clear();
            imagenesData = [];
            currentSlide = 0;
            imagenes.forEach((url, index) => {
                if (url) aplicarPreviewImagen(index, url);
            });
            syncCustomSelects();
            resetCambiosNoGuardados();
            updateFormProgress();
        } catch (e) {
            debugLog.error('Error editando cavent:', e.message, e.stack);
            showError('Error al cargar la obra: ' + (e.message || ''));
        }
    }

    async function duplicarCavent(id, nombre) {
        dropdown.classList.remove('open');
        setFormMode('duplicate', nombre + ' (copia)');
        try {
            const data = await apiRequest('/obras/' + id);
            if (!data || data.success === false) { showError('No se pudo cargar la obra'); return; }
            const obra = data;
            // La copia conserva los metadatos de la obra original (localización y
            // peso), pero NO el id personalizado: una copia es una obra nueva y
            // reutilizar el código de inventario sería confuso.
            guardarMetaObra(obra);
            metaObra.idPersonalizado = '';
            document.getElementById('input-id-edicion').value = '';
            // Igual que al editar: el título llega escapado y debe verse (y
            // volver a guardarse) con el texto real.
            document.getElementById('input-titulo').value = decodeHTMLEntities(obra.titulo || '') + ' (copia)';
            document.getElementById('input-artista').value = (artistaActual && artistaActual.nombre_artista) || obra.artista || '';
            document.getElementById('input-ano').value = obra.ano || '';
            document.getElementById('input-precio').value = obra.precio || '';
            document.getElementById('input-ancho').value = obra.ancho || '';
            document.getElementById('input-alto').value = obra.alto || '';
            document.getElementById('input-descripcion-artistica').value = decodeHTMLEntities(obra.descripcion_artistica || '');
            setSelectValue(document.getElementById('input-status'), decodeHTMLEntities(obra.status || ''));
            setSelectValue(document.getElementById('input-estado-obra'), decodeHTMLEntities(obra.estado_obra || ''));
            setSelectValue(document.getElementById('input-descripcion-tecnica'), decodeHTMLEntities(obra.descripcion_tecnica || ''));
            setSelectValue(document.getElementById('input-soporte'), decodeHTMLEntities(obra.soporte || ''));
            setSelectValue(document.getElementById('input-marcos'), decodeHTMLEntities(obra.marcos || ''));
            setSelectValue(document.getElementById('input-procedencia'), decodeHTMLEntities(obra.procedencia || ''));
            setSelectValue(document.getElementById('input-certificado'), decodeHTMLEntities(obra.certificado || ''));
            setSelectValue(document.getElementById('input-firma'), decodeHTMLEntities(obra.firma || ''));
            setSelectValue(document.getElementById('input-conservacion'), decodeHTMLEntities(obra.conservacion || ''));
            document.getElementById('input-etiquetas').value = decodeHTMLEntities(obra.etiquetas || '');
            syncCustomSelects();
            resetCambiosNoGuardados();
            // Cargar imágenes para duplicar
            const imagenesDup = [
                cloudinaryUrl(obra.imagen_url), cloudinaryUrl(obra.imagen_url_1), cloudinaryUrl(obra.imagen_url_2),
                cloudinaryUrl(obra.imagen_url_3), cloudinaryUrl(obra.imagen_url_4)
            ];
            imagenesAEliminar.clear();
            imagenesData = [];
            currentSlide = 0;
            let falloAlguna = false;
            for (const [index, url] of imagenesDup.entries()) {
                if (url) {
                    aplicarPreviewImagen(index, url);
                    const copiada = await cargarUrlEnInput(index, url);
                    if (!copiada) {
                        // Si una imagen no se pudo copiar hay que sacarla del
                        // carrusel: dejarla con file:null daría por buena una
                        // imagen que no se va a subir (la obra saldría sin ella).
                        const i = imagenesData.findIndex(im => im.src === url && !im.file);
                        if (i >= 0) imagenesData.splice(i, 1);
                        falloAlguna = true;
                    }
                }
            }
            if (falloAlguna) {
                actualizarCarrusel();
                showWarning('No se pudieron copiar todas las imágenes. Revisa el carrusel antes de guardar la copia.');
            }
            updateFormProgress();
        } catch (e) {
            debugLog.error('Error duplicando cavent:', e);
            showError('Error al cargar la obra');
        }
    }

    async function eliminarCavent(id) {
        dropdown.classList.remove('open');
        const confirmado = await showConfirm('¿Eliminar este cavent? Esta acción no se puede deshacer.');
        if (!confirmado) return;
        try {
            const resp = await eliminarObra(id);
            if (resp) {
                showSuccess('Cavent eliminado');
                // Eliminar de la lista local inmediatamente
                _caventsCache.data = _caventsCache.data.filter(o => o.id !== id);
                _caventsCache.loaded = true;
            } else {
                showError('Error al eliminar');
            }
        } catch (e) {
            debugLog.error('Error eliminando cavent:', e);
            showError('Error al eliminar');
        }
    }

    trigger.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        if (!isOpen) {
            await loadCavents();
            buildDropdown();
            positionBar();
            // Posicionar dropdown arriba del trigger
            const triggerBottom = trigger.getBoundingClientRect().bottom;
            const triggerTop = trigger.getBoundingClientRect().top;
            dropdown.style.bottom = (window.innerHeight - triggerTop) + 'px';
        }
        dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#obra-cavents-bar')) {
            dropdown.classList.remove('open');
        }
    });

    // Prevenir que clicks en el dropdown se propaguen al document (cerraría el dropdown)
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

export function setupFormAccordions() {
    const obraForm = document.getElementById('obra-form');

    if (obraForm) {
        const requiredFields = obraForm.querySelectorAll('[data-required="true"]');
        requiredFields.forEach(field => {
            field.addEventListener('input', updateFormProgress);
            field.addEventListener('change', updateFormProgress);
        });
        updateFormProgress();
    }

    // === Custom selects ===
    setupCustomSelects();

    // === Etiquetas de tipo de creación (Cavents / Problogs) ===
    setupCrearTabs();

    // === Dropdown Mis Cavents ===
    setupCaventsDropdown();

    // === Navegación de pasos ===
    setupStepNavigation();
}

function setupStepNavigation() {
    const sections = document.querySelectorAll('.form-section');
    const prevBtn = document.getElementById('obra-step-prev');
    const nextBtn = document.getElementById('obra-step-next');
    const indicator = document.getElementById('obra-step-indicator');
    const guardarBtn = document.getElementById('btn-guardar');
    const stepBar = document.getElementById('obra-step-bar');
    const totalSteps = sections.length;

    if (!prevBtn || !nextBtn || !indicator || totalSteps === 0) return;

    // Posicionar barra de progreso justo debajo del header (ARRIBA)
    function positionProgressBar() {
        const mainHeader = document.getElementById('main-header');
        const progressBar = document.getElementById('obra-progress-bar');
        if (!mainHeader || !progressBar) return;
        const headerBottom = mainHeader.getBoundingClientRect().bottom;
        progressBar.style.top = headerBottom + 'px';
    }

    // Posicionar barra de pasos justo encima del nav, DEBAJO de las etiquetas:
    // orden desde el borde inferior: [nav][etiquetas][barra de pasos]
    function positionStepBar() {
        const togglePanel = document.getElementById('toggle-panel');
        const tabsBar = document.getElementById('crear-tabs');
        if (!togglePanel || !stepBar) return;
        const fromBottom = reservaInferior();
        const tabsH = tabsBar ? (tabsBar.offsetHeight || 40) : 0;
        stepBar.style.bottom = (fromBottom + tabsH) + 'px';
        // La barra de Problogs ocupa ese mismo hueco: nunca se ven las dos a la
        // vez (una u otra según la pestaña activa).
        const problogBar = document.getElementById('problog-nav-bar');
        if (problogBar) problogBar.style.bottom = (fromBottom + tabsH) + 'px';
    }

    // Posicionar las etiquetas Cavents/Problogs en el borde inferior, debajo
    // de la barra de pasos (justo encima del nav)
    function positionTabs() {
        const togglePanel = document.getElementById('toggle-panel');
        const tabsBar = document.getElementById('crear-tabs');
        if (!togglePanel || !tabsBar) return;
        tabsBar.style.bottom = reservaInferior() + 'px';
    }

    // Posicionar el carrusel fijo debajo de la barra de progreso
    function positionCarrusel() {
        const progressBar = document.getElementById('obra-progress-bar');
        const carrusel = document.querySelector('.imagen-carrusel');
        if (!progressBar || !carrusel) return;
        const progressBottom = progressBar.getBoundingClientRect().bottom;
        carrusel.style.position = 'fixed';
        carrusel.style.top = (progressBottom - 1) + 'px';
        carrusel.style.left = '0';
        carrusel.style.width = '100%';
        carrusel.style.zIndex = '1';
    }

    // Posicionar el formulario fijo debajo de la barra de progreso (pasos 2-5)
    function positionFormulario() {
        const progressBar = document.getElementById('obra-progress-bar');
        const formulario = document.getElementById('formulario-obra');
        if (!progressBar || !formulario) return;
        const progressBottom = progressBar.getBoundingClientRect().bottom;
        formulario.style.top = progressBottom + 'px';
    }

    // El fondo ÚNICO de las barras de abajo: va desde la barra de crear hasta el
    // borde inferior de las pestañas. Se mide en vivo (si se calcula con las
    // pestañas ocultas, el alto sale 0 y queda un hueco a la vista).
    function positionFondo() {
        const fondo = document.getElementById('crear-fondo');
        const togglePanel = document.getElementById('toggle-panel');
        const tabsBar = document.getElementById('crear-tabs');
        const problogBar = document.getElementById('problog-nav-bar');
        if (!fondo || !togglePanel) return;
        const fromBottom = reservaInferior();
        const altoTabs = tabsBar ? tabsBar.getBoundingClientRect().height : 0;
        const altoBarra = Math.max(
            stepBar ? stepBar.getBoundingClientRect().height : 0,
            problogBar ? problogBar.getBoundingClientRect().height : 0
        ) || 48;
        fondo.style.bottom = fromBottom + 'px';
        fondo.style.height = Math.round(altoTabs + altoBarra) + 'px';
    }

    function positionAll() {
        try {
            positionProgressBar();
            positionStepBar();
            positionTabs();
            positionCarrusel();
            positionFormulario();
            positionFondo();
        } catch(e) {
            debugLog.error('positionAll error:', e);
        }
    }

    positionAll();
    window.addEventListener('resize', positionAll);

    // Las barras se colocan en vivo, pero el panel arranca oculto: entonces las
    // pestañas miden 0 y se usaba el alto de reserva, así que quedaba un hueco
    // entre la barra de crear y las pestañas (se veían como dos fondos
    // separados). Al mostrarse el panel se vuelven a colocar.
    const panelArtista = document.getElementById('panel-artista');
    if (panelArtista && typeof MutationObserver === 'function') {
        new MutationObserver(() => positionAll())
            .observe(panelArtista, { attributes: true, attributeFilter: ['class'] });
    }

    let currentStep = 0;

    // Nombres de cada paso (en orden: índice 0 = Paso 1, etc.)
    const stepNames = [
        'Imágenes',
        'Información Básica',
        'Estado y Visibilidad',
        'Detalles Técnicos',
        'Proveniencia y Autenticidad'
    ];
    const stepNameEl = document.getElementById('obra-step-name');

    // Se expone para que la validación del guardado pueda llevar al usuario al
    // paso del primer campo obligatorio que falte.
    irAlPasoFn = showStep;

    function showStep(index) {
        sections.forEach((s, i) => {
            const content = s.querySelector('.form-section-content');
            if (i === index) {
                s.classList.remove('hidden');
                content.classList.remove('hidden');
            } else {
                s.classList.add('hidden');
                content.classList.add('hidden');
            }
        });

        indicator.textContent = `Paso ${index + 1} de ${totalSteps}`;
        if (stepNameEl && stepNames[index]) {
            stepNameEl.textContent = stepNames[index];
        }
        prevBtn.disabled = index === 0;
        
        // Etiquetas visibles en Paso 2 (Información Básica)
        const etiquetasBar = document.getElementById('obra-etiquetas-bar');
        if (etiquetasBar) {
            etiquetasBar.classList.toggle('hidden', index !== 1);
        }

        // El input de etiquetas está al fondo del paso 2: el navegador tiende a
        // desplazar todo el formulario al enfocarlo y abrir el teclado. Lo
        // evitamos enfocando con preventScroll (igual que los demás inputs).
        const inputEtiquetas = document.getElementById('input-etiquetas');
        if (inputEtiquetas && !inputEtiquetas.dataset.fixScroll) {
            inputEtiquetas.dataset.fixScroll = '1';
            inputEtiquetas.addEventListener('pointerdown', (e) => {
                e.preventDefault(); // cancela el focus auto-scroll del navegador
                inputEtiquetas.focus({ preventScroll: true });
            });
        }

        if (index === totalSteps - 1) {
            nextBtn.disabled = true;
        } else {
            nextBtn.disabled = false;
        }
        // Crear/Actualizar/Duplicar siempre visible
        document.getElementById('obra-step-crear')?.classList.remove('hidden');
    }

    prevBtn.addEventListener('click', () => {
        if (currentStep > 0) {
            currentStep--;
            showStep(currentStep);
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentStep < totalSteps - 1) {
            currentStep++;
            showStep(currentStep);
        }
    });

    // Botón limpiar campos
    const limpiarBtn = document.getElementById('obra-step-limpiar');
    if (limpiarBtn) {
        limpiarBtn.addEventListener('click', async () => {
            // Confirmación antes de vaciar: si no, un toque accidental se llevaba
            // por delante lo escrito (o los datos de la obra que se editaba).
            const vaciado = await limpiarFormularioConConfirmacion();
            if (!vaciado) return;
            currentStep = 0;
            showStep(0);
            // Reset trigger
            const ct = document.getElementById('cavents-trigger');
            if (ct) ct.innerHTML = 'Mis Cavents <span style="font-size:10px;">▴</span>';
        });
    }

    // Iniciar en paso 1
    showStep(0);

    // Re-sincronizar paso y posición cuando el panel se hace visible
    const panelCrear = document.getElementById('panel-crear');
    if (panelCrear) {
        const observer = new MutationObserver(() => {
            if (!panelCrear.classList.contains('hidden')) {
                positionProgressBar();
                positionStepBar();
                positionCarrusel();
                positionFormulario();
                showStep(currentStep);
            }
        });
        observer.observe(panelCrear, { attributes: true, attributeFilter: ['class'] });
    }
}

export function updateFormProgress() {
    const obraForm = document.getElementById('obra-form');
    if (!obraForm) return;

    const requiredFields = obraForm.querySelectorAll('[data-required="true"]');
    // Se cuenta también el paso de imágenes: la obra no se puede guardar sin al
    // menos una, así que ignorarlo dejaba el progreso mintiendo (100% sin ninguna
    // imagen y un 0% engañoso con la imagen ya puesta).
    const totalFields = requiredFields.length + 1;
    let completedFields = imagenesData.length > 0 ? 1 : 0;

    requiredFields.forEach(field => {
        if (field.value && field.value.trim() !== '') {
            completedFields++;
        }
    });

    const percentage = Math.round((completedFields / totalFields) * 100);

    const progressFill = document.getElementById('form-progress-fill');
    const progressText = document.getElementById('form-progress-percentage');

    if (progressFill) {
        progressFill.style.width = percentage + '%';
    }
    if (progressText) {
        progressText.textContent = percentage + '%';
    }

    updateSectionStatus();
}

function updateSectionStatus() {
    // Sin acordeones — la barra de progreso global es suficiente
}

export function resetAccordionStatus() {
    const progressFill = document.getElementById('form-progress-fill');
    const progressText = document.getElementById('form-progress-percentage');

    if (progressFill) {
        progressFill.style.width = '0%';
    }
    if (progressText) {
        progressText.textContent = '0%';
    }
}
