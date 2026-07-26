// js/panel-ui.js
// Panel del artista: CRUD, formulario de obra, previsualización de imágenes,
// accordions del formulario y progress indicator.

import { ARTISTA_KEY, apiRequest } from './config.js';
import { token, artistaActual } from './auth.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';
import { showSuccess, showError, showWarning, showInfo, showConfirm, setButtonLoading } from './notificaciones.js';
import { decodeHTMLEntities, mostrarErrores, debugLog } from './utils.js';

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
                    obra.imagen_url, obra.imagen_url_1, obra.imagen_url_2,
                    obra.imagen_url_3, obra.imagen_url_4
                ];
                document.querySelectorAll('.btn-eliminar-imagen').forEach(btn => btn.remove());
                imagenes.forEach((url, index) => {
                    if (url) {
                        const preview = document.getElementById(`preview-${index}`);
                        const placeholder = document.getElementById(`placeholder-${index}`);
                        if (preview && placeholder) {
                            preview.src = url;
                            preview.style.display = 'block';
                            placeholder.style.display = 'none';
                            const recuadro = preview.closest('.recuadro-imagen') || preview.parentElement;
                            if (recuadro) {
                                const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
                                if (btnExistente) btnExistente.remove();
                                const btnEliminar = document.createElement('button');
                                btnEliminar.type = 'button';
                                btnEliminar.className = 'btn-eliminar-imagen';
                                btnEliminar.dataset.index = index;
                                btnEliminar.textContent = '✕';
                                btnEliminar.style.cssText = `
                                    position: absolute; top: 0; right: 0;
                                    background: #dc3545; color: white;
                                    border: none; border-radius: 50%;
                                    width: 24px; height: 24px;
                                    cursor: pointer; font-size: 14px;
                                    display: block; z-index: 10;
                                    line-height: 24px; text-align: center;
                                `;
                                recuadro.style.position = 'relative';
                                recuadro.appendChild(btnEliminar);
                                btnEliminar.addEventListener('click', function() {
                                    const idx = parseInt(this.dataset.index);
                                    const previewImg = document.getElementById(`preview-${idx}`);
                                    const placeholderSpan = document.getElementById(`placeholder-${idx}`);
                                    const inputFile = document.getElementById(`input-imagen-${idx}`);
                                    if (previewImg.src && previewImg.src !== '') {
                                        imagenesAEliminar.add(idx);
                                        previewImg.src = '';
                                        previewImg.style.display = 'none';
                                        placeholderSpan.style.display = 'block';
                                        inputFile.value = '';
                                        this.style.display = 'none';
                                    }
                                });
                            }
                        }
                    }
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
                document.querySelectorAll('.btn-eliminar-imagen').forEach(btn => btn.remove());
                for (let i = 0; i < 5; i++) {
                    const preview = document.getElementById(`preview-${i}`);
                    const placeholder = document.getElementById(`placeholder-${i}`);
                    if (preview && placeholder) {
                        preview.src = '';
                        preview.style.display = 'none';
                        placeholder.style.display = 'block';
                    }
                    const inputImg = document.getElementById(`input-imagen-${i}`);
                    if (inputImg) inputImg.value = '';
                }

                document.getElementById('btn-guardar').textContent = 'Guardar Obra';
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();

                const imagenesDuplicar = [
                    obra.imagen_url, obra.imagen_url_1, obra.imagen_url_2,
                    obra.imagen_url_3, obra.imagen_url_4
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
// PREVISUALIZACIÓN DE IMÁGENES
// ============================================
export function aplicarPreviewImagen(index, url) {
    const preview = document.getElementById(`preview-${index}`);
    const placeholder = document.getElementById(`placeholder-${index}`);
    if (!preview || !placeholder) return;
    preview.src = url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    const recuadro = preview.closest('.recuadro-imagen') || preview.parentElement;
    if (!recuadro) return;
    const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
    if (btnExistente) btnExistente.remove();
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn-eliminar-imagen';
    btnEliminar.dataset.index = index;
    btnEliminar.textContent = '✕';
    btnEliminar.style.display = 'block';
    recuadro.style.position = 'relative';
    recuadro.appendChild(btnEliminar);
    btnEliminar.addEventListener('click', function() {
        const idx = parseInt(this.dataset.index);
        const previewImg = document.getElementById(`preview-${idx}`);
        const placeholderSpan = document.getElementById(`placeholder-${idx}`);
        const inputFile = document.getElementById(`input-imagen-${idx}`);
        if (previewImg.src && previewImg.src !== '') {
            imagenesAEliminar.add(idx);
            previewImg.src = '';
            previewImg.style.display = 'none';
            placeholderSpan.style.display = 'block';
            if (inputFile) inputFile.value = '';
            this.style.display = 'none';
        }
    });
}

export async function cargarUrlEnInput(index, url) {
    try {
        // Usar Image + canvas para evitar problemas CORS con Cloudinary
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
        const input = document.getElementById(`input-imagen-${index}`);
        if (input) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        }
        return true;
    } catch (err) {
        debugLog.error('No se pudo cargar la imagen para duplicar:', url, err);
        return false;
    }
}

export function setupImagePreviews() {
    for (let i = 0; i < 5; i++) {
        const input = document.getElementById(`input-imagen-${i}`);
        const preview = document.getElementById(`preview-${i}`);
        const placeholder = document.getElementById(`placeholder-${i}`);
        if (input) {
            input.addEventListener('change', function(e) {
                const file = this.files[0];
                const recuadro = this.closest('.recuadro-imagen');
                if (!recuadro) return;
                const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
                if (btnExistente) btnExistente.remove();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        if (preview) {
                            preview.src = e.target.result;
                            preview.style.display = 'block';
                        }
                        if (placeholder) placeholder.style.display = 'none';
                        const btnEliminar = document.createElement('button');
                        btnEliminar.type = 'button';
                        btnEliminar.className = 'btn-eliminar-imagen';
                        btnEliminar.dataset.index = i;
                        btnEliminar.textContent = '✕';
                        btnEliminar.style.cssText = `
                            position: absolute; top: 0; right: 0;
                            background: #dc3545; color: white;
                            border: none; border-radius: 50%;
                            width: 24px; height: 24px;
                            cursor: pointer; font-size: 14px;
                            display: block; z-index: 10;
                            line-height: 24px; text-align: center;
                        `;
                        recuadro.style.position = 'relative';
                        recuadro.appendChild(btnEliminar);
                        btnEliminar.addEventListener('click', function() {
                            const idx = parseInt(this.dataset.index);
                            const previewImg = document.getElementById(`preview-${idx}`);
                            const placeholderSpan = document.getElementById(`placeholder-${idx}`);
                            const inputFile = document.getElementById(`input-imagen-${idx}`);
                            if (previewImg.src && previewImg.src !== '') {
                                previewImg.src = '';
                                previewImg.style.display = 'none';
                                placeholderSpan.style.display = 'block';
                                inputFile.value = '';
                                this.remove();
                                const editId = document.getElementById('input-id-edicion').value;
                                if (editId) {
                                    imagenesAEliminar.add(idx);
                                }
                            }
                        });
                    };
                    reader.readAsDataURL(file);
                } else {
                    if (preview) {
                        preview.src = '';
                        preview.style.display = 'none';
                    }
                    if (placeholder) placeholder.style.display = 'block';
                    const btnEliminar = recuadro.querySelector('.btn-eliminar-imagen');
                    if (btnEliminar) btnEliminar.remove();
                }
            });
        }
    }
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
    for (let i = 0; i < 5; i++) {
        const preview = document.getElementById(`preview-${i}`);
        const placeholder = document.getElementById(`placeholder-${i}`);
        const inputFile = document.getElementById(`input-imagen-${i}`);
        if (preview && placeholder) {
            preview.src = '';
            preview.style.display = 'none';
            placeholder.style.display = 'block';
        }
        if (inputFile) inputFile.value = '';
        const btnEliminar = document.querySelector(`.btn-eliminar-imagen[data-index="${i}"]`);
        if (btnEliminar) btnEliminar.style.display = 'none';
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
        const archivos = [
            document.getElementById('input-imagen-0'),
            document.getElementById('input-imagen-1'),
            document.getElementById('input-imagen-2'),
            document.getElementById('input-imagen-3'),
            document.getElementById('input-imagen-4')
        ];
        let imagenFinalVisible = false;
        const hayArchivosNuevos = archivos.some(input => input && input.files && input.files.length > 0);
        for (let i = 0; i < 5; i++) {
            const preview = document.getElementById(`preview-${i}`);
            if (preview && preview.style.display === 'block' && !imagenesAEliminar.has(i)) {
                imagenFinalVisible = true;
                break;
            }
        }
        if (!hayArchivosNuevos && !imagenFinalVisible) {
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
        archivos.forEach((input, index) => {
            if (input && input.files && input.files.length > 0) {
                formData.append(`imagen_${index}`, input.files[0]);
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
export function setupFormAccordions() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    const obraForm = document.getElementById('obra-form');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.form-accordion-section');
            const content = section.querySelector('.accordion-content');
            const isExpanded = header.getAttribute('aria-expanded') === 'true';

            header.setAttribute('aria-expanded', !isExpanded);
            content.classList.toggle('hidden');

            const icon = header.querySelector('.accordion-icon');
            icon.textContent = isExpanded ? '▶' : '▼';
        });
    });

    if (obraForm) {
        const requiredFields = obraForm.querySelectorAll('[data-required="true"]');
        requiredFields.forEach(field => {
            field.addEventListener('input', updateFormProgress);
            field.addEventListener('change', updateFormProgress);
        });
        updateFormProgress();
    }

    // === Navegación de pasos ===
    setupStepNavigation();
}

function setupStepNavigation() {
    const sections = document.querySelectorAll('.form-accordion-section');
    const prevBtn = document.getElementById('obra-step-prev');
    const nextBtn = document.getElementById('obra-step-next');
    const indicator = document.getElementById('obra-step-indicator');
    const guardarBtn = document.getElementById('btn-guardar');
    const totalSteps = sections.length;

    if (!prevBtn || !nextBtn || !indicator || totalSteps === 0) return;

    let currentStep = 0;

    function showStep(index) {
        sections.forEach((s, i) => {
            const content = s.querySelector('.accordion-content');
            const header = s.querySelector('.accordion-header');
            if (i === index) {
                content.classList.remove('hidden');
                header.setAttribute('aria-expanded', 'true');
                header.querySelector('.accordion-icon').textContent = '▼';
            } else {
                content.classList.add('hidden');
                header.setAttribute('aria-expanded', 'false');
                header.querySelector('.accordion-icon').textContent = '▶';
            }
        });

        indicator.textContent = `Paso ${index + 1} de ${totalSteps}`;
        prevBtn.disabled = index === 0;
        
        if (index === totalSteps - 1) {
            nextBtn.textContent = 'Finalizar';
            guardarBtn?.classList.remove('hidden');
        } else {
            nextBtn.textContent = 'Siguiente';
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
    const sections = document.querySelectorAll('.form-accordion-section');

    sections.forEach(section => {
        const content = section.querySelector('.accordion-content');
        const requiredFields = content.querySelectorAll('[data-required="true"]');
        const statusIcon = section.querySelector('.accordion-status');

        if (requiredFields.length === 0) return;

        let completedCount = 0;
        requiredFields.forEach(field => {
            if (field.value && field.value.trim() !== '') {
                completedCount++;
            }
        });

        const isComplete = completedCount === requiredFields.length;
        const isInProgress = completedCount > 0 && !isComplete;

        if (isComplete) {
            statusIcon.textContent = '✓';
            statusIcon.classList.add('completed');
            statusIcon.classList.remove('in-progress');
        } else if (isInProgress) {
            statusIcon.textContent = '◐';
            statusIcon.classList.add('in-progress');
            statusIcon.classList.remove('completed');
        } else {
            statusIcon.textContent = '○';
            statusIcon.classList.remove('completed', 'in-progress');
        }
    });
}

export function resetAccordionStatus() {
    const sections = document.querySelectorAll('.form-accordion-section');

    sections.forEach(section => {
        const statusIcon = section.querySelector('.accordion-status');
        statusIcon.textContent = '○';
        statusIcon.classList.remove('completed', 'in-progress');
    });

    const progressFill = document.getElementById('form-progress-fill');
    const progressText = document.getElementById('form-progress-percentage');

    if (progressFill) {
        progressFill.style.width = '0%';
    }
    if (progressText) {
        progressText.textContent = '0%';
    }
}
