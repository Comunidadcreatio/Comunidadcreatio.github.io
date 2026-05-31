// js/main.js
import { TOKEN_KEY, ARTISTA_KEY } from './config.js';
import { apiRequest } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('obra-form');
const btnPerfil = document.getElementById('btn-perfil');
const imagenesAEliminar = new Set();

// Variables para paginación y filtros
let currentPage = 1;
let currentLimit = 10;
let currentSearch = '';
let currentSortBy = 'id';
let currentOrder = 'DESC';
let totalObras = 0;

// Variables para los paneles flotantes
let desktopLogoutModal = null;
let desktopLogoutAllBtn = null;
let desktopLogoutSingleBtn = null;
let desktopMainMenu = null;
let mobileMainMenu = null;
let clickOutsideHandlerLogout = null;      // Para cerrar panel de logout al hacer clic fuera
let clickOutsideHandlerMainMenu = null;    // Para cerrar menú principal al hacer clic fuera

// Conteo de sesiones activas
let activeSessionsCount = 0;

// Ciudades para el registro
const ciudadesPorPais = {
    'Venezuela': {
        'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
    }
};

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function poblarCiudades(paisSeleccionado) {
    const ciudadSelect = document.getElementById('reg-ciudad');
    if (!ciudadSelect) return;
    ciudadSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Selecciona tu ciudad';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    ciudadSelect.appendChild(defaultOption);
    if (paisSeleccionado && ciudadesPorPais[paisSeleccionado]) {
        const data = ciudadesPorPais[paisSeleccionado];
        Object.keys(data).forEach(departamento => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = departamento;
            data[departamento].forEach(ciudad => {
                const option = document.createElement('option');
                option.value = ciudad;
                option.textContent = ciudad;
                optgroup.appendChild(option);
            });
            ciudadSelect.appendChild(optgroup);
        });
    }
}

function mostrarErrores(result) {
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const mensaje = result.errors.join('\n• ');
        alert('❌ Se encontraron los siguientes errores:\n\n• ' + mensaje);
    } else if (result.error) {
        alert('❌ Error: ' + result.error);
    } else {
        alert('❌ Ocurrió un error inesperado. Inténtalo de nuevo.');
    }
}

// ============================================
// MANEJO DE SESIONES (CERRAR TODAS)
// ============================================
async function fetchActiveSessionsCount() {
    if (!token) return;
    try {
        const res = await apiRequest('/api/artistas/sesiones-activas');
        if (res && res.success) {
            activeSessionsCount = res.count;
            updateCerrarTodasSesionesButtonState();
        } else if (res && res.error) {
            console.warn("No se pudo obtener conteo de sesiones:", res.error);
        }
    } catch (error) {
        console.error("Error al obtener número de sesiones:", error);
    }
}

function updateCerrarTodasSesionesButtonState() {
    const mobileAllBtn = document.getElementById('mobile-logout-all');
    const isEnabled = activeSessionsCount >= 2;

    if (mobileAllBtn) {
        if (isEnabled) {
            mobileAllBtn.classList.remove('disabled');
            mobileAllBtn.classList.add('enabled');
            mobileAllBtn.style.color = '#ffffff';
        } else {
            mobileAllBtn.classList.add('disabled');
            mobileAllBtn.classList.remove('enabled');
            mobileAllBtn.style.color = '#a0a0a0';
        }
    }
    if (desktopLogoutAllBtn) {
        if (isEnabled) {
            desktopLogoutAllBtn.classList.remove('disabled');
            desktopLogoutAllBtn.classList.add('enabled');
        } else {
            desktopLogoutAllBtn.classList.add('disabled');
            desktopLogoutAllBtn.classList.remove('enabled');
        }
    }
}

async function closeAllSessions() {
    if (activeSessionsCount < 2) {
        alert("No hay otras sesiones activas. Solo tienes la sesión actual.");
        return;
    }
    if (confirm("⚠️ ¿Estás seguro de que quieres cerrar la sesión en todos los dispositivos? Esta acción cerrará tu sesión actual.")) {
        try {
            const res = await apiRequest('/api/artistas/cerrar-todas-sesiones', { method: 'POST' });
            if (res && res.success) {
                alert("✅ Todas las sesiones han sido cerradas correctamente.");
            } else {
                alert("❌ " + (res.error || "Error inesperado."));
            }
        } catch (error) {
            console.error("Error al cerrar todas las sesiones:", error);
            alert("❌ Error de conexión. Cerrando sesión local por seguridad.");
        } finally {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ARTISTA_KEY);
            window.location.href = '/';
        }
    }
}

// ============================================
// LOGOUT Y PANELES FLOTANTES
// ============================================
async function ejecutarLogout() {
    try {
        const res = await apiRequest('/api/artistas/logout', { method: 'POST' });
        if (res && !res.success) console.warn(res.error);
    } catch (error) {
        console.error("Error en logout backend:", error);
    } finally {
        logout();
        document.getElementById('toggle-panel').classList.add('hidden');
        document.getElementById('pagina-blanca').classList.add('hidden');
        document.getElementById('galeria-publica').classList.add('hidden');
        document.getElementById('panel-artista').classList.add('hidden');
        const modalLogin = document.getElementById('modal-login');
        modalLogin.classList.remove('hidden');
        modalLogin.classList.add('modal-fullscreen');
        document.getElementById('btn-perfil').classList.remove('hidden');
    }
}

function cerrarMobileLogoutModal() {
    const modal = document.getElementById('mobile-logout-options');
    if (modal) modal.classList.add('hidden');
}

function cerrarDesktopLogoutModal() {
    if (desktopLogoutModal) desktopLogoutModal.classList.add('hidden');
    if (clickOutsideHandlerLogout) {
        document.removeEventListener('click', clickOutsideHandlerLogout);
        clickOutsideHandlerLogout = null;
    }
}

function cerrarDesktopMainMenu() {
    if (desktopMainMenu) desktopMainMenu.classList.add('hidden');
    if (clickOutsideHandlerMainMenu) {
        document.removeEventListener('click', clickOutsideHandlerMainMenu);
        clickOutsideHandlerMainMenu = null;
    }
}

function positionDesktopPanel(triggerElement, panelElement, isMenu = false) {
    if (!panelElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.desktop-logout-panel');
    if (!panelDiv) return;
    const panelRect = panelDiv.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    let placement = 'right';
    if (left + panelRect.width > window.innerWidth) {
        left = rect.left - panelRect.width - 8;
        placement = 'left';
    }
    if (top + panelRect.height > window.innerHeight) {
        top = window.innerHeight - panelRect.height - 10;
    }
    if (top < 10) top = 10;
    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;
    panelDiv.setAttribute('data-placement', placement);
}

function positionMobilePanel(triggerElement, panelElement) {
    if (!panelElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.mobile-logout-panel');
    if (!panelDiv) return;
    const panelRect = panelDiv.getBoundingClientRect();
    // Posicionar arriba del botón (si cabe)
    let top = rect.top - panelRect.height - 8;
    let left = rect.left;
    // Si no cabe arriba, colocar debajo
    if (top < 10) {
        top = rect.bottom + 8;
    }
    // Ajustar horizontalmente para no salirse
    if (left + panelRect.width > window.innerWidth) {
        left = window.innerWidth - panelRect.width - 10;
    }
    if (left < 10) left = 10;
    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;
}

// ============================================
// MANEJO DE VISTAS (Galería, Panel, Página Blanca)
// ============================================
function mostrarPaginaBlanca() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (galeria) galeria.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    if (paginaBlanca) paginaBlanca.classList.remove('hidden');
}

function toggleGaleria() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (galeria.classList.contains('hidden')) {
        galeria.classList.remove('hidden');
        panel.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        cargarGaleria(galeriaContainer).then(obras => {
            mostrarGaleria(obras, galeriaContainer, (id) => {
                console.log("Ver detalles de obra con ID:", id);
            });
        });
    } else {
        galeria.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
    }
}

function togglePanel() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        galeria.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        refrescarTabla();
    } else {
        panel.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
    }
}

// ============================================
// RENDERIZADO DE TABLA (Panel del Artista)
// ============================================
async function refrescarTabla() {
    const result = await cargarMisObras(token, currentPage, currentLimit, currentSearch, currentSortBy, currentOrder);
    if (!result.success) {
        console.error("Error al cargar obras:", result.error);
        if (result.error && (result.error.includes("Sesión expirada") || result.error.includes("401"))) {
            alert("🔐 Tu sesión ha expirado. Serás redirigido a la página principal.");
            localStorage.removeItem(TOKEN_KEY);
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
        async (id) => {
            try {
                const data = await apiRequest(`/obras/${id}`);
                if (!data) return;
                if (data.success === false) {
                    console.error('Error al obtener obra:', data.error);
                    alert('Error al cargar la obra: ' + data.error);
                    return;
                }
                const obra = data;
                document.getElementById('input-id-edicion').value = obra.id;
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = obra.id_personalizado;
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = obra.descripcion_tecnica || '';
                document.getElementById('input-soporte').value = obra.soporte || '';
                document.getElementById('input-descripcion-artistica').value = obra.descripcion_artistica || '';
                document.getElementById('input-estado-obra').value = obra.estado_obra || '';
                document.getElementById('input-procedencia').value = obra.procedencia || '';
                document.getElementById('input-marcos').value = obra.marcos || '';
                document.getElementById('input-certificado').value = obra.certificado || '';
                document.getElementById('input-status').value = obra.status || '';
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = obra.firma || '';
                document.getElementById('input-conservacion').value = obra.conservacion || '';
                document.getElementById('input-etiquetas').value = obra.etiquetas || '';
                document.getElementById('btn-guardar').textContent = 'Actualizar Obra';
                const imagenes = [
                    obra.imagen_url,
                    obra.imagen_url_1,
                    obra.imagen_url_2,
                    obra.imagen_url_3,
                    obra.imagen_url_4
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
            } catch (error) {
                console.error("Error al cargar datos de la obra:", error);
                alert("Error al cargar la obra para editar");
            }
        },
        async (id) => {
            const exito = await eliminarObra(token, id);
            if (exito) {
                await refrescarTabla();
            } else {
                alert("❌ Error al eliminar la obra.");
            }
        },
        async (id) => {
            try {
                const res = await apiRequest(`/obras/${id}`);
                if (!res) return;
                const obra = res;
                document.getElementById('input-id-edicion').value = '';
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = '';
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = obra.descripcion_tecnica || '';
                document.getElementById('input-soporte').value = obra.soporte || '';
                document.getElementById('input-descripcion-artistica').value = obra.descripcion_artistica || '';
                document.getElementById('input-estado-obra').value = obra.estado_obra || '';
                document.getElementById('input-procedencia').value = obra.procedencia || '';
                document.getElementById('input-marcos').value = obra.marcos || '';
                document.getElementById('input-certificado').value = obra.certificado || '';
                document.getElementById('input-status').value = obra.status || '';
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = obra.firma || '';
                document.getElementById('input-conservacion').value = obra.conservacion || '';
                document.getElementById('input-etiquetas').value = obra.etiquetas || '';
                for (let i = 0; i < 5; i++) {
                    const preview = document.getElementById(`preview-${i}`);
                    const placeholder = document.getElementById(`placeholder-${i}`);
                    if (preview && placeholder) {
                        preview.src = '';
                        preview.style.display = 'none';
                        placeholder.style.display = 'block';
                    }
                    document.getElementById(`input-imagen-${i}`).value = '';
                }
                document.getElementById('btn-guardar').textContent = 'Guardar Obra';
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();
            } catch (error) {
                console.error("Error al duplicar:", error);
                alert("Error al duplicar.");
            }
        }
    );
}

async function mostrarPanelArtista() {
    document.getElementById('galeria-publica').classList.add('hidden');
    panelArtista.classList.remove('hidden');
    btnPerfil.textContent = '👤 Artista';
    if (artistaActual) {
        document.getElementById('input-artista').value = artistaActual.nombre_artista;
    }
    await refrescarTabla();
}

function mostrarGaleriaPublica() {
    document.getElementById('panel-artista').classList.add('hidden');
    document.getElementById('galeria-publica').classList.remove('hidden');
    cargarGaleria(galeriaContainer).then(obras => {
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    });
}

// ============================================
// PREVISUALIZACIÓN DE IMÁGENES
// ============================================
function setupImagePreviews() {
    const idEdicion = document.getElementById('input-id-edicion').value;
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
                                if (idEdicion) {
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
// SELECTORES DE FECHA PARA REGISTRO
// ============================================
function cargarSelectoresFecha() {
    const diaSelect = document.getElementById('reg-dia');
    if (diaSelect) {
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            diaSelect.appendChild(option);
        }
    }
    const mesSelect = document.getElementById('reg-mes');
    if (mesSelect) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        meses.forEach((nombre, i) => {
            const option = document.createElement('option');
            option.value = i + 1;
            option.textContent = nombre;
            mesSelect.appendChild(option);
        });
    }
    const anoSelect = document.getElementById('reg-ano');
    if (anoSelect) {
        const maxYear = new Date().getFullYear() - 18;
        for (let i = maxYear; i >= 1900; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            anoSelect.appendChild(option);
        }
    }
}

// ============================================
// VERIFICAR SESIÓN EN BACKEND
// ============================================
async function verificarSesionBackend() {
    if (!token) return false;
    try {
        const res = await apiRequest('/api/artistas/mis-obras?page=1&limit=1');
        return res !== null && res.success !== false;
    } catch (error) {
        return false;
    }
}

// ============================================
// CONFIGURACIÓN DE EVENTOS (setupEvents)
// ============================================
function setupEvents() {
    // ----- Panel de logout (escritorio y móvil) -----
    const logoutIcon = document.getElementById('btn-logout-sidebar');
    if (logoutIcon) {
        logoutIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const mobileModal = document.getElementById('mobile-logout-options');
                if (mobileModal) {
                    if (mobileModal.classList.contains('hidden')) {
                        mobileModal.classList.remove('hidden');
                        // Cerrar al hacer clic fuera (móvil)
                        setTimeout(() => {
                            document.addEventListener('click', function onClickOutsideMobile(e) {
                                if (!mobileModal.contains(e.target) && e.target !== logoutIcon) {
                                    mobileModal.classList.add('hidden');
                                    document.removeEventListener('click', onClickOutsideMobile);
                                }
                            });
                        }, 0);
                    } else {
                        mobileModal.classList.add('hidden');
                    }
                }
            } else {
                // Escritorio: toggle del panel flotante
                if (!desktopLogoutModal) {
                    desktopLogoutModal = document.getElementById('desktop-logout-options');
                    desktopLogoutAllBtn = document.getElementById('desktop-logout-all');
                    desktopLogoutSingleBtn = document.getElementById('desktop-logout-single');
                    if (desktopLogoutAllBtn) {
                        desktopLogoutAllBtn.addEventListener('click', () => {
                            closeAllSessions();
                            cerrarDesktopLogoutModal();
                        });
                    }
                    if (desktopLogoutSingleBtn) {
                        desktopLogoutSingleBtn.addEventListener('click', async () => {
                            cerrarDesktopLogoutModal();
                            await ejecutarLogout();
                        });
                    }
                }
                if (desktopLogoutModal.classList.contains('hidden')) {
                    updateCerrarTodasSesionesButtonState();
                    positionDesktopPanel(logoutIcon, desktopLogoutModal, false);
                    desktopLogoutModal.classList.remove('hidden');
                    if (clickOutsideHandlerLogout) {
                        document.removeEventListener('click', clickOutsideHandlerLogout);
                    }
                    clickOutsideHandlerLogout = function(event) {
                        if (desktopLogoutModal && !desktopLogoutModal.contains(event.target) && event.target !== logoutIcon) {
                            cerrarDesktopLogoutModal();
                        }
                    };
                    setTimeout(() => {
                        document.addEventListener('click', clickOutsideHandlerLogout);
                    }, 0);
                } else {
                    cerrarDesktopLogoutModal();
                }
            }
        });
    }

    // ----- Menú principal unificado (Galería + Panel) -----
    const menuBtn = document.getElementById('btn-menu-principal');
if (menuBtn) {
    let mobileClickListener = null;
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            if (!mobileMainMenu) mobileMainMenu = document.getElementById('mobile-main-menu');
            // Si está oculto, lo mostramos
            if (mobileMainMenu.classList.contains('hidden')) {
                // Asignar eventos a los botones solo una vez
                if (!mobileMainMenu.hasAttribute('data-events-set')) {
                    const mobileGaleria = document.getElementById('mobile-menu-galeria');
                    const mobilePanel = document.getElementById('mobile-menu-panel');
                    if (mobileGaleria) {
                        mobileGaleria.addEventListener('click', () => {
                            mobileMainMenu.classList.add('hidden');
                            toggleGaleria();
                        });
                    }
                    if (mobilePanel) {
                        mobilePanel.addEventListener('click', () => {
                            mobileMainMenu.classList.add('hidden');
                            togglePanel();
                        });
                    }
                    mobileMainMenu.setAttribute('data-events-set', 'true');
                }
                // Posicionar y mostrar
                positionMobilePanel(menuBtn, mobileMainMenu);
                mobileMainMenu.classList.remove('hidden');
                // Cerrar al hacer clic fuera (solo una vez)
                if (mobileClickListener) {
                    document.removeEventListener('click', mobileClickListener);
                }
                mobileClickListener = function(event) {
                    if (!mobileMainMenu.contains(event.target) && event.target !== menuBtn) {
                        mobileMainMenu.classList.add('hidden');
                        document.removeEventListener('click', mobileClickListener);
                        mobileClickListener = null;
                    }
                };
                setTimeout(() => {
                    document.addEventListener('click', mobileClickListener);
                }, 0);
                } else {
                // Ocultar si ya está visible
                mobileMainMenu.classList.add('hidden');
                if (mobileClickListener) {
                    document.removeEventListener('click', mobileClickListener);
                    mobileClickListener = null;
                }
            }
        } else {
            // ... código escritorio existente ...
        }
    });
}

    // ----- Botones del menú móvil (Galería y Panel) -----
    const mobileGaleria = document.getElementById('mobile-menu-galeria');
    const mobilePanel = document.getElementById('mobile-menu-panel');
    if (mobileGaleria) {
        mobileGaleria.addEventListener('click', () => {
            const menu = document.getElementById('mobile-main-menu');
            if (menu) menu.classList.add('hidden');
            toggleGaleria();
        });
    }
    if (mobilePanel) {
        mobilePanel.addEventListener('click', () => {
            const menu = document.getElementById('mobile-main-menu');
            if (menu) menu.classList.add('hidden');
            togglePanel();
        });
    }

    // ----- Botones del panel móvil de logout (ya existentes) -----
    const mobileSingle = document.getElementById('mobile-logout-single');
    if (mobileSingle) {
        mobileSingle.addEventListener('click', async () => {
            cerrarMobileLogoutModal();
            await ejecutarLogout();
        });
    }
    const mobileAll = document.getElementById('mobile-logout-all');
    if (mobileAll) {
        mobileAll.addEventListener('click', async () => {
            cerrarMobileLogoutModal();
            if (activeSessionsCount >= 2) {
                await closeAllSessions();
            } else {
                alert("No hay otras sesiones activas. Solo tienes la sesión actual.");
            }
        });
    }
    const mobileModalLogout = document.getElementById('mobile-logout-options');
    if (mobileModalLogout) {
        mobileModalLogout.addEventListener('click', (e) => {
            if (e.target === mobileModalLogout) cerrarMobileLogoutModal();
        });
    }

    // ========== RESTO DE EVENTOS (filtros, login, registro, etc.) ==========
    document.getElementById('btn-olvide-contrasena').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-restablecimiento').classList.remove('hidden');
    });

    document.getElementById('btn-aplicar-filtros').addEventListener('click', () => {
        currentSearch = document.getElementById('search-input').value;
        currentSortBy = document.getElementById('sort-select').value;
        currentOrder = document.getElementById('order-select').value;
        currentLimit = parseInt(document.getElementById('limit-select').value);
        currentPage = 1;
        refrescarTabla();
    });

    document.getElementById('reg-pais').addEventListener('change', function() {
        poblarCiudades(this.value);
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            refrescarTabla();
        }
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        const totalPages = Math.ceil(totalObras / currentLimit);
        if (currentPage < totalPages) {
            currentPage++;
            refrescarTabla();
        }
    });

    btnPerfil.addEventListener('click', () => {
        if (token) mostrarPanelArtista();
        else document.getElementById('modal-login').classList.remove('hidden');
    });

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        const result = await login(email, password);
        if (result.success) {
            const modalLogin = document.getElementById('modal-login');
            modalLogin.classList.add('hidden');
            modalLogin.classList.remove('modal-fullscreen');
            document.getElementById('modal-registro').classList.add('hidden');
            document.getElementById('modal-registro').classList.remove('modal-fullscreen');
            document.getElementById('toggle-panel').classList.remove('hidden');
            mostrarPaginaBlanca();
            await fetchActiveSessionsCount();
        } else {
            mostrarErrores(result);
        }
    });

    // Registro
    document.getElementById('registro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre_artista = document.getElementById('reg-nombre-artista').value;
        const nombres = document.getElementById('reg-nombres').value;
        const apellidos = document.getElementById('reg-apellidos').value;
        const nombre_real = `${nombres} ${apellidos}`.trim();
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-pass').value;
        const telefono = document.getElementById('reg-telefono').value;
        const pais = document.getElementById('reg-pais').value;
        const ciudad = document.getElementById('reg-ciudad').value;
        const genero = document.getElementById('reg-genero').value;
        const dia = document.getElementById('reg-dia').value;
        const mes = document.getElementById('reg-mes').value;
        const ano = document.getElementById('reg-ano').value;
        if (!dia || !mes || !ano) {
            alert("❌ Todos los campos de fecha son obligatorios.");
            return;
        }
        const fechaNac = new Date(ano, mes - 1, dia);
        if (fechaNac.getFullYear() != ano || fechaNac.getMonth() != mes - 1 || fechaNac.getDate() != dia) {
            alert("❌ La fecha seleccionada no es válida.");
            return;
        }
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mesDiff = hoy.getMonth() - fechaNac.getMonth();
        if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < fechaNac.getDate())) edad--;
        if (edad < 18) {
            alert("⚠️ Debes tener al menos 18 años para registrarte.");
            return;
        }
        const fecha_nacimiento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const result = await register(
            nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero
        );
        if (result.success) {
            alert("¡Registro exitoso! Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada y SPAM.");
            const modalRegistro = document.getElementById('modal-registro');
            modalRegistro.classList.add('hidden');
            modalRegistro.classList.remove('modal-fullscreen');
            const modalLogin = document.getElementById('modal-login');
            modalLogin.classList.remove('hidden');
            modalLogin.classList.add('modal-fullscreen');
            document.getElementById('registro-form').reset();
        } else {
            mostrarErrores(result);
        }
    });

    // Guardar obra
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
        const etiquetas = document.getElementById('input-etiquetas').value;
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
            alert("❌ La obra debe tener al menos una imagen. No puedes guardar sin imágenes.");
            return;
        }
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
        if (result.success) {
            alert("Obra guardada correctamente.");
            document.getElementById('btn-guardar').textContent = 'Guardar Obra';
            imagenesAEliminar.clear();
            limpiarFormularioCompleto(true);
            await refrescarTabla();
        } else {
            mostrarErrores(result);
        }
    });

    function limpiarFormularioCompleto(restaurarArtista = true) {
        obraForm.reset();
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
    }

    document.getElementById('btn-limpiar-campos').addEventListener('click', () => limpiarFormularioCompleto(true));
    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('modal-fullscreen');
        document.getElementById('modal-registro').classList.remove('hidden');
        document.getElementById('modal-registro').classList.add('modal-fullscreen');
    });
    document.getElementById('btn-ir-login').addEventListener('click', () => {
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('modal-fullscreen');
        document.getElementById('modal-login').classList.remove('hidden');
        document.getElementById('modal-login').classList.add('modal-fullscreen');
    });
    document.getElementById('btn-eliminar-cuenta').addEventListener('click', () => {
        document.getElementById('modal-confirmar-eliminacion').classList.remove('hidden');
    });
    document.getElementById('solicitar-restablecimiento-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const messageEl = document.getElementById('reset-message');
        messageEl.style.display = 'block';
        messageEl.textContent = '⏳ Enviando solicitud...';
        messageEl.style.color = '#555';
        try {
            const res = await apiRequest('/api/artistas/solicitar-restablecimiento', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            if (res && res.success) {
                messageEl.textContent = '✅ Si el correo está registrado, recibirás un enlace en tu bandeja de entrada.';
                messageEl.style.color = '#28a745';
            } else if (res && res.error) {
                messageEl.textContent = '❌ Error: ' + res.error;
                messageEl.style.color = '#dc3545';
            } else {
                messageEl.textContent = '❌ Error de conexión. Inténtalo más tarde.';
                messageEl.style.color = '#dc3545';
            }
        } catch (error) {
            console.error('Error al solicitar restablecimiento:', error);
            messageEl.textContent = '❌ Error de conexión. Inténtalo más tarde.';
            messageEl.style.color = '#dc3545';
        }
    });
    document.getElementById('confirmar-eliminacion-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('confirmar-password').value;
        const mensajeError = document.getElementById('mensaje-error');
        mensajeError.style.display = 'none';
        try {
            const res = await apiRequest('/api/artistas/eliminar-cuenta', {
                method: 'POST',
                body: JSON.stringify({ password })
            });
            if (res && res.success) {
                alert("✅ Tu cuenta ha sido eliminada correctamente.");
                logout();
                location.reload();
            } else if (res && (res.errors || res.error)) {
                if (Array.isArray(res.errors) && res.errors.length > 0) {
                    mensajeError.textContent = '❌ ' + res.errors.join('\n');
                } else if (res.error) {
                    mensajeError.textContent = '❌ ' + res.error;
                } else {
                    mensajeError.textContent = '❌ Error desconocido.';
                }
                mensajeError.style.display = 'block';
            } else {
                mensajeError.textContent = '❌ Error de conexión. Intenta más tarde.';
                mensajeError.style.display = 'block';
            }
        } catch (error) {
            mensajeError.textContent = '❌ Error de conexión. Intenta más tarde.';
            mensajeError.style.display = 'block';
        }
    });
    document.querySelectorAll('.cerrar-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.classList.add('hidden');
        });
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================
async function init() {
    const sesionValida = await verificarSesionBackend();
    if (sesionValida) {
        btnPerfil.classList.add('hidden');
        document.getElementById('toggle-panel').classList.remove('hidden');
        mostrarPaginaBlanca();
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('modal-fullscreen');
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('modal-fullscreen');
        setupEvents();
        setupImagePreviews();
        cargarSelectoresFecha();
        poblarCiudades('');
        await fetchActiveSessionsCount();
    } else {
        document.getElementById('panel-artista').classList.add('hidden');
        document.getElementById('galeria-publica').classList.add('hidden');
        document.getElementById('toggle-panel').classList.add('hidden');
        btnPerfil.classList.add('hidden');
        const modalLogin = document.getElementById('modal-login');
        modalLogin.classList.remove('hidden');
        modalLogin.classList.add('modal-fullscreen');
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('modal-fullscreen');
        setupEvents();
        setupImagePreviews();
        cargarSelectoresFecha();
        poblarCiudades('');
    }
}

init();