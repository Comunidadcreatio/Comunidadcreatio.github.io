// js/main.js
import { TOKEN_KEY, ARTISTA_KEY, API_BASE_URL } from './config.js';
import { apiRequest } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';
import { showSuccess, showError, showWarning, showInfo, showLoadingOverlay, hideLoadingOverlay, setButtonLoading } from './notificaciones.js';

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('obra-form');
const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
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
let clickOutsideHandlerLogout = null;
let clickOutsideHandlerMainMenu = null;

// Control de estado del menú móvil
let mobileOutsideClickListener = null;

// Conteo de sesiones activas
let activeSessionsCount = 0;

// ============================================
// ESTADÍSTICAS DEL PERFIL (Cavents, Problogs, Comcons)
// ============================================
// Definimos la función y la exponemos globalmente para que sea accesible desde cualquier parte
async function actualizarEstadisticas() {
    const statsCavents = document.getElementById('stats-cavents');
    const statsProblogs = document.getElementById('stats-problogs');
    const statsComcons = document.getElementById('stats-comcons');

    if (!statsCavents) {
        console.warn('Elemento #stats-cavents no encontrado (el perfil no está visible)');
        return;
    }

    try {
        console.log('Actualizando estadísticas...');
        const res = await apiRequest('/api/artistas/mis-obras?limit=100&search=&sortBy=id&order=DESC');
        console.log('Respuesta de obras:', res);

        let activas = 0;
        if (res && res.success && Array.isArray(res.obras)) {
            activas = res.obras.filter(obra => 
                obra.status && obra.status.trim() === 'Activo (Visible en Galería)'
            ).length;
        } else if (Array.isArray(res)) {
            activas = res.filter(obra => 
                obra.status && obra.status.trim() === 'Activo (Visible en Galería)'
            ).length;
        }

        console.log(`Obras activas encontradas: ${activas}`);
        statsCavents.textContent = activas;
        if (statsProblogs) statsProblogs.textContent = '0';
        if (statsComcons) statsComcons.textContent = '0';
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
        statsCavents.textContent = '0';
    }
}
// EXPONER AL ÁMBITO GLOBAL (para módulos)
window.actualizarEstadisticas = actualizarEstadisticas;

// ============================================
// FUNCIONES AUXILIARES
// ============================================
// Decodifica entidades HTML (ej: "&#x2F;" -> "/", "&amp;" -> "&").
// El backend usa express-validator .escape() que codifica caracteres
// especiales al guardar; esto los revierte para que el valor coincida
// con las opciones de los <select> al editar o duplicar una obra.
function decodeHTMLEntities(str) {
    if (str === null || str === undefined) return '';
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(str);
    return textarea.value;
}

function mostrarErrores(result) {
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const mensaje = result.errors.join('\n• ');
        showError('Se encontraron los siguientes errores:\n\n• ' + mensaje);
    } else if (result.error) {
        showError('Error: ' + result.error);
    } else {
        showError('Ocurrió un error inesperado. Inténtalo de nuevo.');
    }
}

// ============================================
// PERFIL DE USUARIO (avatar + datos)
// ============================================
const AVATAR_DEFAULT = 'iconos/avatar-default.svg';

function getFotoPerfilKey() {
    const id = (artistaActual && (artistaActual.email || artistaActual.correo || artistaActual.id)) || 'anon';
    return `fotoPerfil_${id}`;
}

function getFotoPerfil() {
    if (artistaActual && artistaActual.foto_perfil) return artistaActual.foto_perfil;
    try {
        return localStorage.getItem(getFotoPerfilKey()) || '';
    } catch (e) {
        return '';
    }
}

function guardarFotoPerfil(dataUrl) {
    try {
        localStorage.setItem(getFotoPerfilKey(), dataUrl);
    } catch (e) {
        console.error('No se pudo guardar la foto de perfil:', e);
    }
    if (artistaActual) {
        artistaActual.foto_perfil = dataUrl;
        try {
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
        } catch (e) {
            console.error('No se pudo actualizar el artista en localStorage:', e);
        }
    }
}

function actualizarPerfilUI() {
    const src = getFotoPerfil() || AVATAR_DEFAULT;
    ['perfil-avatar-mini', 'perfil-avatar-seccion'].forEach(id => {
        const img = document.getElementById(id);
        if (img) img.src = src;
    });
    const nombreArtista = (artistaActual && artistaActual.nombre_artista) || 'Artista';
    const nombreReal = (artistaActual && artistaActual.nombre_real) || '';
    const ciudad = (artistaActual && artistaActual.ciudad) || '';
    
    document.querySelectorAll('.perfil-nombre-real').forEach(el => { el.textContent = nombreReal; });
    document.querySelectorAll('.perfil-nombre-artista-seccion').forEach(el => { el.textContent = nombreArtista; });
    document.querySelectorAll('.perfil-ciudad').forEach(el => {
        el.textContent = ciudad ? ciudad : '';
    });
}

// Sube la foto de perfil al servidor (Cloudinary vía backend) y devuelve la URL.
async function subirFotoPerfilServidor(file) {
    const formData = new FormData();
    formData.append('foto', file);
    const authToken = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE_URL}/api/artistas/foto-perfil`, {
        method: 'POST',
        headers: { 'Authorization': authToken ? `Bearer ${authToken}` : '' },
        body: formData
    });
    return await res.json();
}

// Refresca la foto de perfil desde el servidor (para sesiones ya iniciadas
// que aún no tienen la URL guardada en localStorage).
async function refrescarPerfilDesdeServidor() {
    try {
        const res = await apiRequest('/api/artistas/perfil');
        if (res && res.success && res.artista) {
            if (artistaActual) {
                artistaActual.foto_perfil = res.artista.foto_perfil || artistaActual.foto_perfil || '';
                if (res.artista.nombre_real) artistaActual.nombre_real = res.artista.nombre_real;
                try {
                    localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
                } catch (e) { /* noop */ }
            }
            actualizarPerfilUI();
        }
    } catch (e) {
        // Si falla, se mantiene la foto local/por defecto.
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
        showInfo("No hay otras sesiones activas. Solo tienes la sesión actual.");
        return;
    }
    if (confirm("⚠️ ¿Estás seguro de que quieres cerrar la sesión en todos los dispositivos? Esta acción cerrará tu sesión actual.")) {
        try {
            const res = await apiRequest('/api/artistas/cerrar-todas-sesiones', { method: 'POST' });
            if (res && res.success) {
                showSuccess("Todas las sesiones han sido cerradas correctamente.");
            } else {
                showError((res.error || "Error inesperado."));
            }
        } catch (error) {
            console.error("Error al cerrar todas las sesiones:", error);
            showError("Error de conexión. Cerrando sesión local por seguridad.");
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
        window.location.href = 'auth.html';
    }
}

function cerrarMobileLogoutModal() {
    const modal = document.getElementById('mobile-logout-options');
    if (modal) modal.classList.add('hidden');
}

function cerrarMenuMovil() {
    if (mobileMainMenu) {
        mobileMainMenu.classList.add('hidden');
    }
    if (mobileOutsideClickListener) {
        document.removeEventListener('click', mobileOutsideClickListener);
        mobileOutsideClickListener = null;
    }
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

function cerrarTodosLosPaneles() {
    // Cerrar paneles de escritorio
    const desktopLogoutModal = document.getElementById('desktop-logout-options');
    if (desktopLogoutModal && !desktopLogoutModal.classList.contains('hidden')) {
        cerrarDesktopLogoutModal();
    }

    const desktopMainMenu = document.getElementById('desktop-main-menu');
    if (desktopMainMenu && !desktopMainMenu.classList.contains('hidden')) {
        cerrarDesktopMainMenu();
    }

    // Cerrar paneles móviles
    const mobileLogoutModal = document.getElementById('mobile-logout-options');
    if (mobileLogoutModal && !mobileLogoutModal.classList.contains('hidden')) {
        cerrarMobileLogoutModal();
    }

    const mobileMainMenu = document.getElementById('mobile-main-menu');
    if (mobileMainMenu && !mobileMainMenu.classList.contains('hidden')) {
        cerrarMenuMovil();
    }
}

function positionDesktopPanel(triggerElement, panelElement) {
    if (!panelElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.desktop-logout-panel');
    if (!panelDiv) return;

    const panelRect = panelDiv.getBoundingClientRect();
    const margin = 16; // Aumentado para más aire con el borde

    // Posicionar el panel arriba del botón (barra inferior)
    const iconCenterX = rect.left + rect.width / 2;
    let top = rect.top - panelRect.height - 12;
    if (top < margin) top = margin;

    // Centrar horizontalmente sobre el botón, pero mantener aire con el borde
    let left = iconCenterX - panelRect.width / 2;
    const maxLeft = window.innerWidth - panelRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;

    // Point the tail exactly under the icon, regardless of the bubble offset
    const tailX = iconCenterX - left;
    panelDiv.style.setProperty('--tail-x', `${tailX}px`);
}

function positionMobilePanel(triggerElement, panelElement) {
    if (!panelElement) return;
    const panelDiv = panelElement.querySelector('.mobile-logout-panel');
    if (!panelDiv) return;

    const iconRect = triggerElement.getBoundingClientRect();
    const panelRect = panelDiv.getBoundingClientRect();
    const iconCenterX = iconRect.left + iconRect.width / 2;
    const margin = 8;

    // Position the panel directly with fixed positioning
    let top = iconRect.top - panelRect.height - 12;
    if (top < margin) top = margin;

    let left = iconCenterX - panelRect.width / 2;
    const maxLeft = window.innerWidth - panelRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    panelDiv.style.top = `${top}px`;
    panelDiv.style.left = `${left}px`;

    // Point the tail exactly under the icon
    const tailX = iconCenterX - left;
    panelDiv.style.setProperty('--tail-x', `${tailX}px`);
}

// ============================================
// MANEJO DE VISTAS (Galería, Panel, Página Blanca)
// ============================================
function mostrarPaginaBlanca() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    const miCuenta = document.getElementById('mi-cuenta');
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (galeria) galeria.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    if (miCuenta) miCuenta.classList.add('hidden');
    if (perfilUsuario) perfilUsuario.classList.add('hidden');
    if (paginaBlanca) paginaBlanca.classList.remove('hidden');
    if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
}

function toggleGaleria() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    const miCuenta = document.getElementById('mi-cuenta');
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (!galeria || !panel || !paginaBlanca) return;
    if (galeria.classList.contains('hidden')) {
        galeria.classList.remove('hidden');
        panel.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        if (miCuenta) miCuenta.classList.add('hidden');
        if (perfilUsuario) perfilUsuario.classList.add('hidden');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
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
    const miCuenta = document.getElementById('mi-cuenta');
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (!galeria || !panel || !paginaBlanca) return;
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        galeria.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        if (miCuenta) miCuenta.classList.add('hidden');
        if (perfilUsuario) perfilUsuario.classList.add('hidden');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
        // Establecer el nombre del artista por defecto al abrir el panel
        if (artistaActual && artistaActual.nombre_artista) {
            const inputArtista = document.getElementById('input-artista');
            if (inputArtista && !inputArtista.value) {
                inputArtista.value = artistaActual.nombre_artista;
            }
        }
        refrescarTabla();
    } else {
        panel.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
    }
}

function toggleMiCuenta() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    const miCuenta = document.getElementById('mi-cuenta');
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (!galeria || !panel || !paginaBlanca || !miCuenta) return;
    if (miCuenta.classList.contains('hidden')) {
        miCuenta.classList.remove('hidden');
        galeria.classList.add('hidden');
        panel.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        if (perfilUsuario) perfilUsuario.classList.add('hidden');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
        const emailInput = document.getElementById('cuenta-email-actual');
        if (emailInput && artistaActual) {
            emailInput.value = artistaActual.email || artistaActual.correo || '';
        }
    } else {
        miCuenta.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
    }
}

function togglePerfil() {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    const miCuenta = document.getElementById('mi-cuenta');
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (!galeria || !panel || !paginaBlanca || !perfilUsuario) return;

    actualizarPerfilUI();

    if (perfilUsuario.classList.contains('hidden')) {
        perfilUsuario.classList.remove('hidden');
        galeria.classList.add('hidden');
        panel.classList.add('hidden');
        paginaBlanca.classList.add('hidden');
        if (miCuenta) miCuenta.classList.add('hidden');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'true');

        // LLAMADA A LA FUNCIÓN EXPUESTA GLOBALMENTE
        window.actualizarEstadisticas(); 
    } else {
        perfilUsuario.classList.add('hidden');
        paginaBlanca.classList.remove('hidden');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
    }
}

function setupPerfilInteracciones() {
    const btn = document.getElementById('btn-perfil-sidebar');
    if (!btn) return;

    const abrirPerfil = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cerrarTodosLosPaneles();
        togglePerfil();
    };
    btn.addEventListener('click', abrirPerfil);

    // Nuevo: clic en el avatar abre el selector de archivos
    document.getElementById('perfil-avatar-btn')?.addEventListener('click', () => {
        document.getElementById('input-foto-perfil')?.click();
    });
}

// ============================================
// HELPERS DE PREVISUALIZACIÓN DE IMÁGENES
// ============================================
function aplicarPreviewImagen(index, url) {
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

// Descarga una imagen existente (por URL) y la coloca como archivo en el input,
// para que al duplicar una obra esas imágenes se guarden en la nueva obra.
async function cargarUrlEnInput(index, url) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
        const file = new File([blob], `duplicada-${index}.${ext}`, { type: blob.type || 'image/jpeg' });
        const input = document.getElementById(`input-imagen-${index}`);
        if (input) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        }
        return true;
    } catch (err) {
        console.error('No se pudo cargar la imagen para duplicar:', url, err);
        return false;
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
            showWarning("Tu sesión ha expirado. Serás redirigido a la página principal.");
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
                showError("Error al cargar la obra para editar");
            }
        },
        async (id) => {
            if (!confirm('¿Estás seguro de eliminar esta obra?')) return;
            const btnEliminar = document.querySelector(`.btn-eliminar[data-id="${id}"]`);
            if (btnEliminar) setButtonLoading(btnEliminar, true);
            
            const exito = await eliminarObra(token, id);
            if (btnEliminar) setButtonLoading(btnEliminar, false);
            
            if (exito) {
                showSuccess("Obra eliminada correctamente.");
                await refrescarTabla();

                // 🔥 ACTUALIZAR ESTADÍSTICAS SIEMPRE (sin condición)
                window.actualizarEstadisticas();
            } else {
                showError("Error al eliminar la obra.");
            }
        },
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

                // Reiniciar imágenes y marcas de eliminación
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

                // Mostrar las imágenes de la obra original y cargarlas como archivos
                // para que la obra duplicada se guarde con las mismas imágenes.
                const imagenesDuplicar = [
                    obra.imagen_url,
                    obra.imagen_url_1,
                    obra.imagen_url_2,
                    obra.imagen_url_3,
                    obra.imagen_url_4
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
            } catch (error) {
                console.error("Error al duplicar:", error);
                const btnDuplicar = document.querySelector(`.btn-duplicar[data-id="${id}"]`);
                if (btnDuplicar) setButtonLoading(btnDuplicar, false);
                showError("Error al duplicar la obra.");
            }
        }
    );
}

async function mostrarPanelArtista() {
    document.getElementById('galeria-publica').classList.add('hidden');
    document.getElementById('perfil-usuario')?.classList.add('hidden');
    panelArtista.classList.remove('hidden');
    if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
    if (artistaActual) {
        document.getElementById('input-artista').value = artistaActual.nombre_artista;
    }
    await refrescarTabla();
}

function mostrarGaleriaPublica() {
    document.getElementById('panel-artista').classList.add('hidden');
    document.getElementById('perfil-usuario')?.classList.add('hidden');
    document.getElementById('galeria-publica').classList.remove('hidden');
    if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
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
                        cerrarTodosLosPaneles();
                        mobileModal.classList.remove('hidden');
                        positionMobilePanel(logoutIcon, mobileModal);
                        setTimeout(() => {
                            document.addEventListener('click', function onClickOutsideMobile(e) {
                                // No cerrar si el clic es en otros botones de la barra de navegación
                                const target = e.target;
                                const isNavButton = target.closest('#btn-menu-principal') ||
                                                  target.closest('#btn-perfil-sidebar');
                                
                                if (!mobileModal.contains(e.target) && e.target !== logoutIcon && !isNavButton) {
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
                    cerrarTodosLosPaneles();
                    updateCerrarTodasSesionesButtonState();
                    desktopLogoutModal.classList.remove('hidden');
                    positionDesktopPanel(logoutIcon, desktopLogoutModal);
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

    // ----- Menú principal unificado -----
    const menuBtn = document.getElementById('btn-menu-principal');
    if (menuBtn) {
        // Agregar listeners para cerrar el panel móvil al hacer clic en otros botones
        const logoutBtn = document.getElementById('btn-logout-sidebar');
        const perfilBtn = document.getElementById('btn-perfil-sidebar');
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (mobileMainMenu && !mobileMainMenu.classList.contains('hidden')) {
                    cerrarMenuMovil();
                }
            });
        }
        
        if (perfilBtn) {
            perfilBtn.addEventListener('click', () => {
                if (mobileMainMenu && !mobileMainMenu.classList.contains('hidden')) {
                    cerrarMenuMovil();
                }
            });
        }

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                if (!mobileMainMenu) {
                    mobileMainMenu = document.getElementById('mobile-main-menu');
                    if (!mobileMainMenu) return;

                    document.getElementById('mobile-menu-galeria')?.addEventListener('click', () => {
                        cerrarMenuMovil();
                        toggleGaleria();
                    });
                    document.getElementById('mobile-menu-panel')?.addEventListener('click', () => {
                        cerrarMenuMovil();
                        togglePanel();
                    });
                    document.getElementById('mobile-menu-mi-cuenta')?.addEventListener('click', () => {
                        cerrarMenuMovil();
                        toggleMiCuenta();
                    });

                    mobileMainMenu.addEventListener('click', (evento) => {
                        if (evento.target === mobileMainMenu) cerrarMenuMovil();
                    });
                }

                if (mobileMainMenu.classList.contains('hidden')) {
                    cerrarTodosLosPaneles();
                    mobileMainMenu.classList.remove('hidden');
                    positionMobilePanel(menuBtn, mobileMainMenu);
                    if (mobileOutsideClickListener) {
                        document.removeEventListener('click', mobileOutsideClickListener);
                    }
                    mobileOutsideClickListener = (event) => {
                        if (!mobileMainMenu.contains(event.target) && !menuBtn.contains(event.target)) {
                            cerrarMenuMovil();
                        }
                    };
                    setTimeout(() => document.addEventListener('click', mobileOutsideClickListener), 10);
                } else {
                    cerrarMenuMovil();
                }
            } else {
                if (!desktopMainMenu) {
                    desktopMainMenu = document.getElementById('desktop-main-menu');
                    if (!desktopMainMenu) return;
                    document.getElementById('menu-galeria')?.addEventListener('click', () => {
                        cerrarDesktopMainMenu();
                        toggleGaleria();
                    });
                    document.getElementById('menu-panel')?.addEventListener('click', () => {
                        cerrarDesktopMainMenu();
                        togglePanel();
                    });
                    document.getElementById('menu-mi-cuenta')?.addEventListener('click', () => {
                        cerrarDesktopMainMenu();
                        toggleMiCuenta();
                    });
                }

                if (desktopMainMenu.classList.contains('hidden')) {
                    cerrarTodosLosPaneles();
                    desktopMainMenu.classList.remove('hidden');
                    positionDesktopPanel(menuBtn, desktopMainMenu);
                    if (clickOutsideHandlerMainMenu) document.removeEventListener('click', clickOutsideHandlerMainMenu);
                    clickOutsideHandlerMainMenu = (event) => {
                        if (desktopMainMenu && !desktopMainMenu.contains(event.target) && !menuBtn.contains(event.target)) {
                            cerrarDesktopMainMenu();
                        }
                    };
                    setTimeout(() => document.addEventListener('click', clickOutsideHandlerMainMenu), 10);
                } else {
                    cerrarDesktopMainMenu();
                }
            }
        });
    }

    // ----- Botones del panel móvil de logout -----
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
                showInfo("No hay otras sesiones activas. Solo tienes la sesión actual.");
            }
        });
    }
    const mobileModalLogout = document.getElementById('mobile-logout-options');
    if (mobileModalLogout) {
        mobileModalLogout.addEventListener('click', (e) => {
            if (e.target === mobileModalLogout) cerrarMobileLogoutModal();
        });
    }

    // ========== LISTENERS CON VERIFICACIÓN DE EXISTENCIA ==========

    // ✅ Filtros (solo si el usuario está logueado y los elementos existen)
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', () => {
            currentSearch = document.getElementById('search-input').value;
            currentSortBy = document.getElementById('sort-select').value;
            currentOrder = document.getElementById('order-select').value;
            currentLimit = parseInt(document.getElementById('limit-select').value);
            currentPage = 1;
            refrescarTabla();
        });
    }

    // ✅ Paginación (solo si existen)
    const btnPrev = document.getElementById('btn-prev');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                refrescarTabla();
            }
        });
    }
    const btnNext = document.getElementById('btn-next');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const totalPages = Math.ceil(totalObras / currentLimit);
            if (currentPage < totalPages) {
                currentPage++;
                refrescarTabla();
            }
        });
    }

    // ----- Sección de perfil (avatar circular en la barra) -----
    setupPerfilInteracciones();

    // ----- Cambiar foto de perfil -----
    const inputFotoPerfil = document.getElementById('input-foto-perfil');
    if (inputFotoPerfil) {
        inputFotoPerfil.addEventListener('change', function() {
            const file = this.files[0];
            this.value = '';
            if (!file) return;

            // 1) Vista previa local inmediata
            const reader = new FileReader();
            reader.onload = (e) => {
                ['perfil-avatar-mini', 'perfil-avatar-seccion'].forEach(id => {
                    const img = document.getElementById(id);
                    if (img) img.src = e.target.result;
                });
            };
            reader.readAsDataURL(file);

            // 2) Subida al servidor (Cloudinary)
            showInfo('Subiendo foto de perfil...');
            subirFotoPerfilServidor(file).then((res) => {
                if (res && res.success && res.foto_perfil) {
                    guardarFotoPerfil(res.foto_perfil);
                    actualizarPerfilUI();
                    showSuccess('Foto de perfil actualizada.');
                } else {
                    const msg = (res && res.error) ? res.error : 'No se pudo guardar la foto en el servidor.';
                    showError(msg);
                    actualizarPerfilUI();
                }
            }).catch(() => {
                showError('Error de conexión al subir la foto de perfil.');
                actualizarPerfilUI();
            });
        });
    }

    // ✅ Guardar obra (solo si existe el formulario)
    if (obraForm) {
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
                await refrescarTabla();

                // 🔥 ACTUALIZAR ESTADÍSTICAS SIEMPRE (sin condición)
                window.actualizarEstadisticas();
            } else {
                mostrarErrores(result);
            }
        });
    }

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

    // ✅ Limpiar campos (solo si existe)
    const btnLimpiar = document.getElementById('btn-limpiar-campos');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => limpiarFormularioCompleto(true));
    }

    // ✅ Navegación entre modales (siempre existen)
    const btnIrRegistro = document.getElementById('btn-ir-registro');
    if (btnIrRegistro) {
        btnIrRegistro.addEventListener('click', () => {
            document.getElementById('modal-login').classList.add('hidden');
            document.getElementById('modal-login').classList.remove('modal-fullscreen');
            document.getElementById('modal-registro').classList.remove('hidden');
            document.getElementById('modal-registro').classList.add('modal-fullscreen');
        });
    }
    const btnIrLogin = document.getElementById('btn-ir-login');
    if (btnIrLogin) {
        btnIrLogin.addEventListener('click', () => {
            document.getElementById('modal-registro').classList.add('hidden');
            document.getElementById('modal-registro').classList.remove('modal-fullscreen');
            document.getElementById('modal-login').classList.remove('hidden');
            document.getElementById('modal-login').classList.add('modal-fullscreen');
        });
    }

    // ✅ Eliminar cuenta (solo si existe el botón)
    const btnEliminarCuenta = document.getElementById('btn-eliminar-cuenta');
    if (btnEliminarCuenta) {
        btnEliminarCuenta.addEventListener('click', () => {
            document.getElementById('modal-confirmar-eliminacion').classList.remove('hidden');
        });
    }

    // ✅ Confirmar eliminación (solo si existe el formulario)
    const confirmarEliminacionForm = document.getElementById('confirmar-eliminacion-form');
    if (confirmarEliminacionForm) {
        confirmarEliminacionForm.addEventListener('submit', async (e) => {
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
                    showSuccess("Tu cuenta ha sido eliminada correctamente.");
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
    }

    // ============================================
    // MI CUENTA > SEGURIDAD (UI - pendiente de backend)
    // ============================================
    // Accordion para sección Seguridad
    const accordionSeguridad = document.getElementById('accordion-seguridad');
    const seguridadContent = document.getElementById('seguridad-content');
    if (accordionSeguridad && seguridadContent) {
        accordionSeguridad.addEventListener('click', () => {
            const isExpanded = accordionSeguridad.getAttribute('aria-expanded') === 'true';
            accordionSeguridad.setAttribute('aria-expanded', !isExpanded);
            if (isExpanded) {
                seguridadContent.hidden = true;
                seguridadContent.style.maxHeight = '0';
                seguridadContent.style.padding = '0 0';
            } else {
                seguridadContent.hidden = false;
                // Pequeño delay para permitir que la transición funcione
                setTimeout(() => {
                    seguridadContent.style.maxHeight = '2000px';
                    seguridadContent.style.padding = '20px 0';
                }, 10);
            }
        });
    }

    const ocultarFormularioCuenta = (id) => {
        const form = document.getElementById(id);
        if (!form) return;
        form.reset && form.reset();
        form.classList.add('hidden');
        form.querySelectorAll('.cuenta-error').forEach(e => (e.textContent = ''));
        const strength = form.querySelector('#cuenta-password-strength');
        if (strength) strength.removeAttribute('data-level');
        const strengthText = form.querySelector('.strength-text');
        if (strengthText) strengthText.textContent = '';
    };

    // Botones "Cancelar" de cualquier formulario de cuenta
    document.querySelectorAll('.btn-cuenta-cancelar[data-cancelar]').forEach(btn => {
        btn.addEventListener('click', () => ocultarFormularioCuenta(btn.dataset.cancelar));
    });

    // --- Cambiar correo electrónico ---
    const btnCambiarEmail = document.getElementById('btn-cambiar-email');
    const formCambiarEmail = document.getElementById('form-cambiar-email');
    const formConfirmarEmail = document.getElementById('form-confirmar-email');
    if (btnCambiarEmail && formCambiarEmail) {
        btnCambiarEmail.addEventListener('click', () => {
            ocultarFormularioCuenta('form-confirmar-email');
            formCambiarEmail.classList.toggle('hidden');
        });

        // Paso 1 -> Paso 2 (confirmar contraseña)
        formCambiarEmail.addEventListener('submit', (e) => {
            e.preventDefault();
            const nuevoEmail = document.getElementById('nuevo-email').value.trim();
            const errorEl = document.getElementById('error-nuevo-email');
            errorEl.textContent = '';
            const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoEmail);
            if (!emailValido) {
                errorEl.textContent = 'Ingresa un correo electrónico válido.';
                return;
            }
            const emailActual = (document.getElementById('cuenta-email-actual').value || '').trim().toLowerCase();
            if (nuevoEmail.toLowerCase() === emailActual) {
                errorEl.textContent = 'El nuevo correo debe ser diferente al actual.';
                return;
            }
            formCambiarEmail.classList.add('hidden');
            formConfirmarEmail.classList.remove('hidden');
        });
    }

    if (formConfirmarEmail) {
        // Paso 2: confirmar con contraseña (conectado al backend)
        formConfirmarEmail.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('email-password').value;
            const errorEl = document.getElementById('error-email-password');
            errorEl.textContent = '';
            if (!password) {
                errorEl.textContent = 'Ingresa tu contraseña para confirmar.';
                return;
            }
            const nuevoEmail = document.getElementById('nuevo-email').value.trim();
            const btnSubmit = formConfirmarEmail.querySelector('button[type="submit"]');
            setButtonLoading(btnSubmit, true);
            
            try {
                const res = await apiRequest('/api/artistas/cambiar-email', {
                    method: 'POST',
                    body: JSON.stringify({ nuevo_email: nuevoEmail, password })
                });
                
                setButtonLoading(btnSubmit, false);
                
                if (res && res.success) {
                    showSuccess(res.message);
                    // Reflejar el nuevo correo en el input no editable y persistirlo.
                    const emailInput = document.getElementById('cuenta-email-actual');
                    if (emailInput) emailInput.value = nuevoEmail;
                    if (artistaActual) {
                        artistaActual.email = nuevoEmail;
                        try {
                            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
                        } catch (e) {
                            console.error('No se pudo actualizar el correo en localStorage:', e);
                        }
                    }
                    ocultarFormularioCuenta('form-confirmar-email');
                    ocultarFormularioCuenta('form-cambiar-email');
                } else if (res && (res.errors || res.error)) {
                    if (Array.isArray(res.errors) && res.errors.length > 0) {
                        errorEl.textContent = '❌ ' + res.errors.join('\n');
                    } else if (res.error) {
                        errorEl.textContent = '❌ ' + res.error;
                    } else {
                        errorEl.textContent = '❌ Error desconocido.';
                    }
                } else {
                    errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
                }
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }

    // --- Cambiar contraseña ---
    const btnCambiarPassword = document.getElementById('btn-cambiar-password');
    const formCambiarPassword = document.getElementById('form-cambiar-password');
    if (btnCambiarPassword && formCambiarPassword) {
        btnCambiarPassword.addEventListener('click', () => {
            formCambiarPassword.classList.toggle('hidden');
        });

        // Medidor de fuerza de la nueva contraseña
        const passNueva = document.getElementById('pass-nueva');
        const strengthWidget = document.getElementById('cuenta-password-strength');
        const strengthText = strengthWidget ? strengthWidget.querySelector('.strength-text') : null;
        if (passNueva && strengthWidget) {
            passNueva.addEventListener('input', () => {
                const val = passNueva.value;
                if (!val) {
                    strengthWidget.removeAttribute('data-level');
                    if (strengthText) strengthText.textContent = '';
                    return;
                }
                let score = 0;
                if (val.length >= 8) score++;
                if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
                if (/\d/.test(val) && /[^A-Za-z0-9]/.test(val)) score++;
                const nivel = Math.max(1, score);
                strengthWidget.setAttribute('data-level', String(nivel));
                if (strengthText) {
                    strengthText.textContent = nivel === 1 ? 'Débil' : nivel === 2 ? 'Media' : 'Fuerte';
                }
            });
        }

        formCambiarPassword.addEventListener('submit', async (e) => {
            e.preventDefault();
            const actual = document.getElementById('pass-actual').value;
            const nueva = document.getElementById('pass-nueva').value;
            const confirmar = document.getElementById('pass-confirmar').value;
            const errorEl = document.getElementById('error-pass-confirmar');
            errorEl.textContent = '';
            if (!actual || !nueva || !confirmar) {
                errorEl.textContent = 'Completa todos los campos.';
                return;
            }
            if (nueva.length < 8) {
                errorEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
                return;
            }
            if (nueva === actual) {
                errorEl.textContent = 'La nueva contraseña debe ser diferente a la actual.';
                return;
            }
            if (nueva !== confirmar) {
                errorEl.textContent = 'Las contraseñas no coinciden.';
                return;
            }
            const btnSubmit = formCambiarPassword.querySelector('button[type="submit"]');
            setButtonLoading(btnSubmit, true);
            
            try {
                const res = await apiRequest('/api/artistas/cambiar-password', {
                    method: 'POST',
                    body: JSON.stringify({ password_actual: actual, password_nueva: nueva })
                });
                
                setButtonLoading(btnSubmit, false);
                
                if (res && res.success) {
                    showSuccess(res.message);
                    ocultarFormularioCuenta('form-cambiar-password');
                } else if (res && (res.errors || res.error)) {
                    if (Array.isArray(res.errors) && res.errors.length > 0) {
                        errorEl.textContent = '❌ ' + res.errors.join('\n');
                    } else if (res.error) {
                        errorEl.textContent = '❌ ' + res.error;
                    } else {
                        errorEl.textContent = '❌ Error desconocido.';
                    }
                } else {
                    errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
                }
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }

    // ✅ Cerrar modales (siempre existen)
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
    if (!sesionValida) {
        window.location.href = 'auth.html';
        return;
    }
    
    document.getElementById('toggle-panel').classList.remove('hidden');
    actualizarPerfilUI();
    mostrarPaginaBlanca();
    setupEvents();
    setupImagePreviews();
    await fetchActiveSessionsCount();
    refrescarPerfilDesdeServidor();
}

init();