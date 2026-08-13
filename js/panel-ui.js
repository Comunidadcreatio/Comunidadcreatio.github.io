// js/panel-ui.js
// Panel del artista: CRUD, formulario de obra, previsualización de imágenes,
// accordions del formulario y progress indicator.

import { ARTISTA_KEY, apiRequest } from './config.js';
import { token, artistaActual } from './auth.js';
import { cargarMisObras, guardarObra, eliminarObra } from './panel.js';
import { showSuccess, showError, showWarning, showInfo, showConfirm, setButtonLoading } from './notificaciones.js';
import { decodeHTMLEntities, mostrarErrores, debugLog, cloudinaryUrl } from './utils.js';

// Cache del dropdown Mis Cavents para tiempo real
let _caventsCache = { loaded: false, data: [] };
export function invalidateCaventsCache() {
    _caventsCache.loaded = false;
    _caventsCache.data = [];
}

// Sincroniza los triggers de los custom selects después de poblar valores
function syncAllCustomSelects() {
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
}

// ============================================
// VARIABLES DE ESTADO (PANEL)
// ============================================
export const imagenesAEliminar = new Set();

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
export async function refrescarTabla(tablaBody) {
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
    const obras = result.obras;
    totalObras = result.total;
    const totalPages = Math.ceil(totalObras / currentLimit);
    pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    if (btnNext) btnNext.disabled = currentPage >= totalPages;

    if (typeof renderizarTabla === 'function') {
        renderizarTabla(obras, tablaBody,
            // Editar obra ... (código legacy, los callbacks no se usan ya)
            async (id) => {},
            async (id) => {
                const exito = await eliminarObra(id);
                if (exito) {
                    showSuccess("Obra eliminada correctamente.");
                    invalidateCaventsCache();
                    if (typeof window.actualizarEstadisticas === 'function') window.actualizarEstadisticas();
                } else {
                    showError("Error al eliminar la obra.");
                }
            },
            async (id) => {}
        );
    }
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

    // Update track position
    if (imagenesData.length > 0) {
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
    }

    // Update dots
    dots.querySelectorAll('.carrusel-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
    });
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
    if (imagenesData.length >= MAX_IMAGENES) return;
    const inp = document.getElementById(`input-imagen-${index}`);
    if (inp) inp.click();
}

function agregarImagen(file, dataUrl) {
    if (imagenesData.length >= MAX_IMAGENES) return;
    const slot = getNextFreeSlot();
    imagenesData.push({ src: dataUrl, file: file, slot: slot });
    currentSlide = imagenesData.length - 1;
    actualizarCarrusel();
}

export function aplicarPreviewImagen(slot, url) {
    // Usado al editar/duplicar: agregar imagen desde URL con su slot original
    if (imagenesData.length >= MAX_IMAGENES) return;
    imagenesData.push({ src: url, file: null, slot: slot });
    if (imagenesData.length === 1) currentSlide = 0;
    actualizarCarrusel();
}

export async function cargarUrlEnInput(index, url) {
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
        btn.addEventListener("click", function() {
            document.querySelectorAll(".ratio-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            aspectRatio = this.dataset.ratio;
            document.getElementById("carrusel-viewport").style.aspectRatio = aspectRatio;
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
    // Resetear todos los custom selects
    document.querySelectorAll('#obra-form .form-group select').forEach(sel => {
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    resetCambiosNoGuardados();
    document.getElementById('input-id-edicion').value = '';
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
        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        const idPersonalizado = '';
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

        const btnGuardar = document.getElementById('btn-guardar');
        setButtonLoading(btnGuardar, true);

        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado);
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
        const result = await guardarObra(formData, idEdicion || null);
        setButtonLoading(btnGuardar, false);
        if (result.success) {
            showSuccess("Obra guardada correctamente.");
            invalidateCaventsCache();
            document.getElementById('btn-guardar').textContent = 'Crear Cavent';
            imagenesAEliminar.clear();
            limpiarFormularioCompleto(true);
            await refrescarTabla(document.getElementById('tabla-obras-body'));
            if (typeof window.actualizarEstadisticas === 'function') window.actualizarEstadisticas();
        } else {
            mostrarErrores(result);
        }
    });
}

// ============================================
// ACCORDIONS DEL FORMULARIO Y PROGRESS
// ============================================

// Convierte un <select> en dropdown custom (estilo ciudad)
function initCustomSelect(selectEl, placeholder) {
    if (!selectEl || selectEl.dataset.customReady === '1') return;
    selectEl.dataset.customReady = '1';
    selectEl.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.textContent = placeholder || 'Seleccionar';
    // Si el select ya tiene un valor preseleccionado, mostrarlo
    if (selectEl.selectedOptions[0] && selectEl.selectedOptions[0].value) {
        trigger.textContent = selectEl.selectedOptions[0].textContent;
    }
    wrapper.appendChild(trigger);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    wrapper.appendChild(dropdown);

    function buildOptions() {
        dropdown.innerHTML = '';
        Array.from(selectEl.querySelectorAll('option')).forEach(opt => {
            if (opt.disabled && !opt.value) return;
            const item = document.createElement('div');
            item.className = 'custom-select-option';
            item.textContent = opt.textContent;
            item.dataset.value = opt.value;
            item.addEventListener('click', () => {
                selectEl.value = opt.value;
                trigger.textContent = opt.textContent;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                dropdown.classList.remove('open');
            });
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
        const isOpen = dropdown.classList.contains('open');
        if (!isOpen) {
            buildOptions();
            positionDropdown();
        }
        dropdown.classList.toggle('open');
    });

    window.addEventListener('scroll', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
            dropdown.classList.remove('open');
        }
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

    // Posicionar encima de la barra de pasos
    function positionBar() {
        const togglePanel = document.getElementById('toggle-panel');
        if (!togglePanel || !stepBar) return;
        const panelTop = togglePanel.getBoundingClientRect().top;
        const fromBottom = window.innerHeight - panelTop;
        const stepBarH = stepBar.offsetHeight || 48;
        caventsBar.style.bottom = (fromBottom + stepBarH) + 'px';
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
                _caventsCache.data = result.obras || [];
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
                    <div class="cavent-item-titulo">${obra.titulo || 'Sin título'}</div>
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
            
            item.querySelector('.cavent-item-info').addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            item.querySelector('.cavent-item-num').addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            item.querySelector('.btn-edit').addEventListener('click', (e) => { e.stopPropagation(); editarCavent(obra.id, obra.titulo); });
            item.querySelector('.btn-dup').addEventListener('click', (e) => { e.stopPropagation(); duplicarCavent(obra.id, obra.titulo); });
            item.querySelector('.btn-del').addEventListener('click', (e) => { e.stopPropagation(); eliminarCavent(obra.id); });
            
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
            document.getElementById('input-id-edicion').value = obra.id;
            document.getElementById('input-titulo').value = obra.titulo || '';
            document.getElementById('input-artista').value = (artistaActual && artistaActual.nombre_artista) || obra.artista || '';
            document.getElementById('input-ano').value = obra.ano || '';
            document.getElementById('input-precio').value = obra.precio || '';
            document.getElementById('input-ancho').value = obra.ancho || '';
            document.getElementById('input-alto').value = obra.alto || '';
            document.getElementById('input-descripcion-artistica').value = decodeHTMLEntities(obra.descripcion_artistica || '');
            document.getElementById('input-status').value = decodeHTMLEntities(obra.status || '');
            document.getElementById('input-estado-obra').value = decodeHTMLEntities(obra.estado_obra || '');
            document.getElementById('input-descripcion-tecnica').value = decodeHTMLEntities(obra.descripcion_tecnica || '');
            document.getElementById('input-soporte').value = decodeHTMLEntities(obra.soporte || '');
            document.getElementById('input-marcos').value = decodeHTMLEntities(obra.marcos || '');
            document.getElementById('input-procedencia').value = decodeHTMLEntities(obra.procedencia || '');
            document.getElementById('input-certificado').value = decodeHTMLEntities(obra.certificado || '');
            document.getElementById('input-firma').value = decodeHTMLEntities(obra.firma || '');
            document.getElementById('input-conservacion').value = decodeHTMLEntities(obra.conservacion || '');
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
            document.getElementById('input-id-edicion').value = '';
            document.getElementById('input-titulo').value = (obra.titulo || '') + ' (copia)';
            document.getElementById('input-artista').value = (artistaActual && artistaActual.nombre_artista) || obra.artista || '';
            document.getElementById('input-ano').value = obra.ano || '';
            document.getElementById('input-precio').value = obra.precio || '';
            document.getElementById('input-ancho').value = obra.ancho || '';
            document.getElementById('input-alto').value = obra.alto || '';
            document.getElementById('input-descripcion-artistica').value = decodeHTMLEntities(obra.descripcion_artistica || '');
            document.getElementById('input-status').value = decodeHTMLEntities(obra.status || '');
            document.getElementById('input-estado-obra').value = decodeHTMLEntities(obra.estado_obra || '');
            document.getElementById('input-descripcion-tecnica').value = decodeHTMLEntities(obra.descripcion_tecnica || '');
            document.getElementById('input-soporte').value = decodeHTMLEntities(obra.soporte || '');
            document.getElementById('input-marcos').value = decodeHTMLEntities(obra.marcos || '');
            document.getElementById('input-procedencia').value = decodeHTMLEntities(obra.procedencia || '');
            document.getElementById('input-certificado').value = decodeHTMLEntities(obra.certificado || '');
            document.getElementById('input-firma').value = decodeHTMLEntities(obra.firma || '');
            document.getElementById('input-conservacion').value = decodeHTMLEntities(obra.conservacion || '');
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
            for (const [index, url] of imagenesDup.entries()) {
                if (url) {
                    aplicarPreviewImagen(index, url);
                    await cargarUrlEnInput(index, url);
                }
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

    // Posicionar barra de pasos justo encima del nav (ABAJO)
    function positionStepBar() {
        const togglePanel = document.getElementById('toggle-panel');
        if (!togglePanel || !stepBar) return;
        const panelTop = togglePanel.getBoundingClientRect().top;
        const viewH = window.innerHeight;
        const fromBottom = viewH - panelTop;
        stepBar.style.bottom = fromBottom + 'px';
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

    function positionAll() {
        try {
            positionProgressBar();
            positionStepBar();
            positionCarrusel();
            positionFormulario();
        } catch(e) {
            debugLog.error('positionAll error:', e);
        }
    }

    positionAll();
    window.addEventListener('resize', positionAll);

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
        // evitamos restaurando la posición de scroll (igual que los demás inputs).
        const inputEtiquetas = document.getElementById('input-etiquetas');
        const formCont = document.getElementById('formulario-obra');
        if (inputEtiquetas && formCont && !inputEtiquetas.dataset.fixScroll) {
            inputEtiquetas.dataset.fixScroll = '1';
            let scrollPrevio = 0;
            inputEtiquetas.addEventListener('focus', () => {
                scrollPrevio = formCont.scrollTop;
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        formCont.scrollTop = scrollPrevio;
                    });
                });
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
        limpiarBtn.addEventListener('click', () => {
            currentStep = 0;
            showStep(0);
            limpiarFormularioCompleto(true);
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
    const totalFields = requiredFields.length;
    let completedFields = 0;

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
