// js/panel-ui.js
// Panel del artista: CRUD, formulario de obra, previsualización de imágenes,
// accordions del formulario y progress indicator.

import { ARTISTA_KEY, apiRequest } from './config.js';
import { token, artistaActual } from './auth.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';
import { showSuccess, showError, showWarning, showInfo, showConfirm, setButtonLoading } from './notificaciones.js';
import { decodeHTMLEntities, mostrarErrores, debugLog, cloudinaryUrl } from './utils.js';

// ============================================
// VARIABLES DE ESTADO (PANEL)
// ============================================
export const imagenesAEliminar = new Set();
export let currentPage = 1;
export let currentLimit = 10;
export let currentSearch = '';
export let currentSortBy = 'id';
export let currentOrder = 'DESC';
export let totalObras = 0;

export function aplicarFiltrosPanel(search, sortBy, order, limit) {
    currentSearch = search;
    currentSortBy = sortBy;
    currentOrder = order;
    currentLimit = limit;
    currentPage = 1;
}

export function paginaAnterior() {
    if (currentPage > 1) {
        currentPage--;
        return true;
    }
    return false;
}

export function paginaSiguiente() {
    const totalPages = Math.ceil(totalObras / currentLimit);
    if (currentPage < totalPages) {
        currentPage++;
        return true;
    }
    return false;
}

export function resetPagination() {
    currentPage = 1;
    currentSearch = '';
    currentSortBy = 'id';
    currentOrder = 'DESC';
}

// ============================================
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
export async function refrescarTabla(tablaBody) {
    const result = await cargarMisObras(token, currentPage, currentLimit, currentSearch, currentSortBy, currentOrder);
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
    document.getElementById('page-info').textContent = `Página ${currentPage} de ${totalPages || 1}`;
    document.getElementById('btn-prev').disabled = currentPage <= 1;
    document.getElementById('btn-next').disabled = currentPage >= totalPages;

    renderizarTabla(obras, tablaBody,
        // Editar obra
        async (id) => {
            try {
                const data = await apiRequest(`/obras/${id}`);
                if (!data) return;
                if (data.success === false) {
                    debugLog.error('Error al obtener obra:', data.error);
                    showError('Error al cargar la obra: ' + data.error);
                    return;
                }
                const obra = data;
                document.getElementById('input-id-edicion').value = obra.id;
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = (artistaActual && artistaActual.nombre_artista) || obra.artista || '';
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = obra.id_personalizado;
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = decodeHTMLEntities(obra.descripcion_tecnica);
                document.getElementById('input-soporte').value = decodeHTMLEntities(obra.soporte);
                document.getElementById('input-descripcion-artistica').value = decodeHTMLEntities(obra.descripcion_artistica);
                document.getElementById('input-estado-obra').value = decodeHTMLEntities(obra.estado_obra);
                document.getElementById('input-procedencia').value = decodeHTMLEntities(obra.procedencia);
                document.getElementById('input-marcos').value = decodeHTMLEntities(obra.marcos);
                document.getElementById('input-certificado').value = decodeHTMLEntities(obra.certificado);
                document.getElementById('input-status').value = decodeHTMLEntities(obra.status);
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = decodeHTMLEntities(obra.firma);
                document.getElementById('input-conservacion').value = decodeHTMLEntities(obra.conservacion);
                document.getElementById('input-etiquetas').value = decodeHTMLEntities(obra.etiquetas);
                document.getElementById('btn-guardar').textContent = 'Actualizar Obra';
                const imagenes = [
                    cloudinaryUrl(obra.imagen_url), cloudinaryUrl(obra.imagen_url_1), cloudinaryUrl(obra.imagen_url_2),
                    cloudinaryUrl(obra.imagen_url_3), cloudinaryUrl(obra.imagen_url_4)
                ];
                imagenesAEliminar.clear();
                imagenesData = [];
                currentSlide = 0;
                // Cargar imágenes existentes
                imagenes.forEach((url, index) => {
                    if (url) aplicarPreviewImagen(index, url);
                });
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                updateFormProgress();
            } catch (error) {
                debugLog.error("Error al cargar datos de la obra:", error);
                showError("Error al cargar la obra para editar");
            }
        },
        // Eliminar obra
        async (id) => {
            if (!(await showConfirm('¿Estás seguro de eliminar esta obra?'))) return;
            const btnEliminar = document.querySelector(`.btn-eliminar[data-id="${id}"]`);
            if (btnEliminar) setButtonLoading(btnEliminar, true);

            const exito = await eliminarObra(token, id);
            if (btnEliminar) setButtonLoading(btnEliminar, false);

            if (exito) {
                showSuccess("Obra eliminada correctamente.");
                await refrescarTabla(tablaBody);
                window.actualizarEstadisticas();
            } else {
                showError("Error al eliminar la obra.");
            }
        },
        // Duplicar obra
        async (id) => {
            try {
                const btnDuplicar = document.querySelector(`.btn-duplicar[data-id="${id}"]`);
                if (btnDuplicar) setButtonLoading(btnDuplicar, true);

                const res = await apiRequest(`/obras/${id}`);
                if (!res) return;
                const obra = res;

                if (btnDuplicar) setButtonLoading(btnDuplicar, false);

                document.getElementById('input-id-edicion').value = '';
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = (artistaActual && artistaActual.nombre_artista) || obra.artista || '';
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = decodeHTMLEntities(obra.id_personalizado);
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = decodeHTMLEntities(obra.descripcion_tecnica);
                document.getElementById('input-soporte').value = decodeHTMLEntities(obra.soporte);
                document.getElementById('input-descripcion-artistica').value = decodeHTMLEntities(obra.descripcion_artistica);
                document.getElementById('input-estado-obra').value = decodeHTMLEntities(obra.estado_obra);
                document.getElementById('input-procedencia').value = decodeHTMLEntities(obra.procedencia);
                document.getElementById('input-marcos').value = decodeHTMLEntities(obra.marcos);
                document.getElementById('input-certificado').value = decodeHTMLEntities(obra.certificado);
                document.getElementById('input-status').value = decodeHTMLEntities(obra.status);
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = decodeHTMLEntities(obra.firma);
                document.getElementById('input-conservacion').value = decodeHTMLEntities(obra.conservacion);
                document.getElementById('input-etiquetas').value = decodeHTMLEntities(obra.etiquetas);

                imagenesAEliminar.clear();
                imagenesData = [];
                currentSlide = 0;

                document.getElementById('btn-guardar').textContent = 'Guardar Obra';
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();

                const imagenesDuplicar = [
                    cloudinaryUrl(obra.imagen_url), cloudinaryUrl(obra.imagen_url_1), cloudinaryUrl(obra.imagen_url_2),
                    cloudinaryUrl(obra.imagen_url_3), cloudinaryUrl(obra.imagen_url_4)
                ];
                imagenesDuplicar.forEach((url, index) => {
                    if (url) aplicarPreviewImagen(index, url);
                });
                let algunaCargada = false;
                for (let index = 0; index < imagenesDuplicar.length; index++) {
                    const url = imagenesDuplicar[index];
                    if (url) {
                        const ok = await cargarUrlEnInput(index, url);
                        if (ok) algunaCargada = true;
                    }
                }
                if (!algunaCargada && imagenesDuplicar.some(Boolean)) {
                    showWarning("No se pudieron cargar automáticamente las imágenes. Vuelve a subirlas antes de guardar la obra duplicada.");
                }
                updateFormProgress();
            } catch (error) {
                debugLog.error("Error al duplicar:", error);
                const btnDuplicar = document.querySelector(`.btn-duplicar[data-id="${id}"]`);
                if (btnDuplicar) setButtonLoading(btnDuplicar, false);
                showError("Error al duplicar la obra.");
            }
        }
    );
}

// ============================================
// PREVISUALIZACIÓN DE IMÁGENES (CARRUSEL)

// ============================================
// PREVISUALIZACIÓN DE IMÁGENES (CARRUSEL)
// ============================================
const MAX_IMAGENES = 5;
let imagenesData = []; // [{src, file}] — datos de imágenes en el carrusel
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

function eliminarImagen(index) {
    imagenesData.splice(index, 1);
    const editId = document.getElementById('input-id-edicion').value;
    if (editId) imagenesAEliminar.add(index);
    // Limpiar input file correspondiente
    const inp = document.getElementById(`input-imagen-${index}`);
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
    imagenesData.push({ src: dataUrl, file: file });
    currentSlide = imagenesData.length - 1;
    actualizarCarrusel();
}

export function aplicarPreviewImagen(index, url) {
    // Usado al editar/duplicar: agregar imagen desde URL
    if (imagenesData.length >= MAX_IMAGENES) return;
    imagenesData.push({ src: url, file: null });
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
                if (inp && !inp.files?.length && !tieneImagenEnSlot(i)) {
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

function tieneImagenEnSlot(index) {
    // Verificar si este slot ya tiene datos (para evitar reusar input)
    // Como los inputs se mapean 1:1 con imagenesData por orden, esto es menos relevante
    return false;
}

// ============================================
// LIMPIAR FORMULARIO
// ============================================
export function limpiarFormularioCompleto(restaurarArtista = true) {
    const obraForm = document.getElementById('obra-form');
    if (!obraForm) return;
    obraForm.reset();
    resetCambiosNoGuardados();
    document.getElementById('input-id-edicion').value = '';
    document.getElementById('btn-limpiar-campos').classList.add('hidden');
    document.getElementById('btn-guardar').textContent = 'Guardar Obra';
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
        const idPersonalizado = document.getElementById('input-id-personalizado').value;
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
        // Adjuntar archivos desde imagenesData
        imagenesData.forEach((img, index) => {
            if (img.file) {
                formData.append(`imagen_${index}`, img.file);
            }
        });
        const result = await guardarObra(token, formData, idEdicion || null);
        setButtonLoading(btnGuardar, false);
        if (result.success) {
            showSuccess("Obra guardada correctamente.");
            document.getElementById('btn-guardar').textContent = 'Guardar Obra';
            imagenesAEliminar.clear();
            limpiarFormularioCompleto(true);
            await refrescarTabla(document.getElementById('tabla-obras-body'));
            window.actualizarEstadisticas();
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

    // Posicionar la barra de pasos justo debajo del header (calculado en vivo)
    function positionStepBar() {
        const mainHeader = document.getElementById('main-header');
        if (!mainHeader || !stepBar) return;
        const headerBottom = mainHeader.getBoundingClientRect().bottom;
        stepBar.style.top = headerBottom + 'px';
    }

    // Posicionar barras inferiores justo encima de la barra principal
    function positionBottomBars() {
        const togglePanel = document.getElementById('toggle-panel');
        const progressBar = document.getElementById('obra-progress-bar');
        const etiquetasBar = document.getElementById('obra-etiquetas-bar');
        if (!togglePanel) return;
        const panelTop = togglePanel.getBoundingClientRect().top;
        const viewH = window.innerHeight;
        const fromBottom = viewH - panelTop; // px desde el bottom del viewport
        if (progressBar) {
            progressBar.style.bottom = fromBottom + 'px';
        }
        if (etiquetasBar) {
            etiquetasBar.style.bottom = (fromBottom + 25) + 'px';
        }
    }

    // Posicionar el carrusel fijo debajo de la barra de pasos
    function positionCarrusel() {
        const stepBar = document.getElementById('obra-step-bar');
        const carrusel = document.querySelector('.imagen-carrusel');
        if (!stepBar || !carrusel) return;
        const stepBarBottom = stepBar.getBoundingClientRect().bottom;
        carrusel.style.position = 'fixed';
        carrusel.style.top = (stepBarBottom - 1) + 'px';
        carrusel.style.left = '0';
        carrusel.style.width = '100%';
        carrusel.style.zIndex = '1';
    }

    // Posicionar el formulario fijo debajo de la barra de pasos (pasos 2-5)
    function positionFormulario() {
        const stepBar = document.getElementById('obra-step-bar');
        const formulario = document.getElementById('formulario-obra');
        if (!stepBar || !formulario) return;
        const stepBarBottom = stepBar.getBoundingClientRect().bottom;
        formulario.style.top = stepBarBottom + 'px';
    }

    positionStepBar();
    positionBottomBars();
    positionCarrusel();
    positionFormulario();
    window.addEventListener('resize', () => {
        positionStepBar();
        positionBottomBars();
        positionCarrusel();
        positionFormulario();
    });

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
        
        // Etiquetas solo visibles en Paso 1 (Imágenes)
        const etiquetasBar = document.getElementById('obra-etiquetas-bar');
        if (etiquetasBar) {
            etiquetasBar.classList.toggle('hidden', index !== 0);
            positionBottomBars(); // recalcular: progress bar baja si etiquetas se oculta
        }

        if (index === totalSteps - 1) {
            nextBtn.textContent = '✓';
            guardarBtn?.classList.remove('hidden');
        } else {
            nextBtn.textContent = '>';
            guardarBtn?.classList.add('hidden');
        }
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

    // Iniciar en paso 1
    showStep(0);

    // Re-sincronizar paso y posición cuando el panel se hace visible
    const panelCrear = document.getElementById('panel-crear');
    if (panelCrear) {
        const observer = new MutationObserver(() => {
            if (!panelCrear.classList.contains('hidden')) {
                positionStepBar();
                positionBottomBars();
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
