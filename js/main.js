// js/main.js
// Orquestador principal de la aplicación Creatio.
// Coordina todos los módulos: autenticación, galería, panel, perfil,
// búsqueda, cuenta, tema, y gestiona eventos globales.
// v: ptr-fix-4 (ensurePTR explorar + snap instant + scrollSnapType none durante carga)
// test pill v1.0.259
// z-index toasts inline 2147483647
// comentarios drawer v1
// fix reply selector
// fix main send button event
// fix transitionend ghost close
// vistas con IntersectionObserver
// popover quien vio
// popover arriba del icono
// mejor manejo errores popover
// bump forzado v279

import { ARTISTA_KEY, API_BASE_URL, apiRequest, getAuthToken } from './config.js?v=3cac708192';
import { token, artistaActual, logout, updateLastActivity } from './auth.js?v=3517742095';
import { debugLog, renderText, safeImgUrl } from './utils.js?v=f1ecb334f1';
import {
    showSuccess, showError, showWarning, showInfo, showConfirm
} from './notificaciones.js?v=53cd86fdba';

// --- Nuevos módulos extraídos ---
import { setupDarkModeToggle } from './theme.js?v=4207440b17'; // v122
import {
    actualizarPerfilUI, subirFotoPerfilServidor, guardarFotoPerfil,
    refrescarPerfilDesdeServidor, mostrarResultadosBusqueda,
    verPerfilUsuario, setupPerfilInteracciones
} from './perfil.js?v=b032b9c546';
import {
    mostrarPaginaBlanca, actualizarEstadoNavButtons,
    toggleGaleria, togglePanel, toggleMiCuenta, togglePerfil, toggleExplorar,
    mostrarExplorar, showPanelSubView
} from './galeria-ui.js?v=c549dd53d2';
import {
    setupFormChangeTracking,
    setupImagePreviews, limpiarFormularioCompleto,
    setupObraFormSubmit, setupFormAccordions
} from './panel-ui.js?v=11fc4daeee';
import { cargarGaleria, mostrarGaleria } from './galeria.js?v=ef39746f70';
import { setupChat, refrescarChatNoLeidos } from './chat.js?v=181d28ac6d';
import { setupPush } from './push.js?v=e33b2583d5';
// cuenta.js se carga lazy (13 KB) — solo cuando el usuario abre Mi Cuenta
// busqueda.js se carga lazy (6 KB) — solo cuando el usuario usa el buscador

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
export function getGaleriaContainer() {
    return document.getElementById('galeria-container');
}
const tablaBody = document.getElementById('tabla-obras-body');

// Variables para paneles flotantes
let desktopLogoutModal = null;
let desktopLogoutAllBtn = null;
let desktopLogoutSingleBtn = null;
let clickOutsideHandlerLogout = null;
let headerConfigOutsideHandler = null;
let mobileClickOutsideHandler = null;

// Conteo de sesiones activas
let activeSessionsCount = 0;

// ============================================
// HEARTBEAT / ACTIVIDAD DEL USUARIO
// ============================================
let ultimaActividadUsuario = Date.now();
let usuarioLocalActivo = true;
let ultimoHeartbeatEnviado = 0;
const TIEMPO_INACTIVIDAD_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

function registrarActividadLocal() {
    ultimaActividadUsuario = Date.now();
    usuarioLocalActivo = true;
    updateLastActivity();
    enviarHeartbeatSiEsNecesario();
}

export function verificarActividadLocal() {
    usuarioLocalActivo = (Date.now() - ultimaActividadUsuario) < TIEMPO_INACTIVIDAD_MS;
    return usuarioLocalActivo;
}

async function enviarHeartbeatSiEsNecesario() {
    const ahora = Date.now();
    if (!token || (ahora - ultimoHeartbeatEnviado) < HEARTBEAT_INTERVAL_MS) return;
    ultimoHeartbeatEnviado = ahora;
    try {
        await apiRequest('/api/artistas/heartbeat', { method: 'POST' });
    } catch (error) {
        debugLog.error('Error enviando heartbeat:', error);
    }
}

function iniciarSeguimientoActividad() {
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    eventos.forEach(evento => {
        window.addEventListener(evento, registrarActividadLocal, { passive: true, capture: true });
    });

    setInterval(() => {
        verificarActividadLocal();
        if (usuarioLocalActivo) {
            enviarHeartbeatSiEsNecesario();
        }
        if (!document.getElementById('perfil-usuario')?.classList.contains('hidden')) {
            actualizarPerfilUI(verificarActividadLocal);
        }
        fetchActiveSessionsCount();
        fetchNotificacionesCount();
        refrescarChatNoLeidos(); // badges de chat (nav, círculos, sala global) también con el chat cerrado
        if (window.syncChatEntregas) window.syncChatEntregas(); // ✓✓ gris: marcar entregados en segundo plano
    }, 30000);
}

// ============================================
// POLLING DE NOTIFICACIONES (BADGE CAMPANA)
// ============================================
async function fetchNotificacionesCount() {
    try {
        const data = await apiRequest('/api/artistas/notificaciones/no-leidas');
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        const count = data.no_leidas || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
            if (count > parseInt(badge.dataset.last || '0')) {
                badge.classList.add('pulse');
                setTimeout(() => badge.classList.remove('pulse'), 400);
            }
            badge.dataset.last = count;
        } else {
            badge.classList.add('hidden');
            badge.dataset.last = '0';
        }
    } catch (e) {
        // Silencioso — el badge no es crítico
    }
}
// Expuesto para que js/push.js pueda refrescar el badge al recibir un push
window.refrescarNotificaciones = fetchNotificacionesCount;

async function cargarNotificaciones() {
    const list = document.getElementById('notif-list');
    const empty = document.getElementById('notif-empty');
    if (!list || !empty) return;
    try {
        const data = await apiRequest('/api/artistas/notificaciones');
        if (!data || !data.notificaciones || data.notificaciones.length === 0) {
            list.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        const iconos = { like: '❤️', comment: '💬', view: '👁', follow: '👤', mention: '📢' };
        list.innerHTML = data.notificaciones.map(n => {
            const avatarHTML = n.actor_foto
                ? `<div class="notif-avatar-wrap"><img src="${safeImgUrl(n.actor_foto)}" class="notif-avatar" alt="${renderText(n.actor_nombre)}"><span class="notif-avatar-badge">${iconos[n.tipo] || '🔔'}</span></div>`
                : `<div class="notif-avatar-wrap notif-avatar-default"><span class="notif-avatar-initial">${(n.actor_nombre || '?')[0].toUpperCase()}</span><span class="notif-avatar-badge">${iconos[n.tipo] || '🔔'}</span></div>`;
            return `<div class="notif-item${n.leida ? ' leida' : ''}" data-id="${n.id}" data-obra="${n.obra_id || ''}">
                ${avatarHTML}
                <div class="notif-body">
                    <div class="notif-mensaje">${renderText(n.mensaje)}</div>
                    <div class="notif-tiempo">${timeAgo(n.created_at)}</div>
                </div>
            </div>`;
        }).join('');

        // Click en notificación → redirige al cavent en la galería
        list.querySelectorAll('.notif-item').forEach(item => {
            item.addEventListener('click', async () => {
                const obraId = item.dataset.obra;
                if (obraId) {
                    document.getElementById('notif-dropdown').classList.add('hidden');
                    // Mostrar galería
                    const galeriaUI = await import('./galeria-ui.js');
                    const galeriaContainer = document.getElementById('galeria-container');
                    if (galeriaContainer) {
                        await galeriaUI.toggleGaleria(galeriaContainer);
                    }
                    // Esperar a que las cards se rendericen y hacer scroll
                    const intentarScroll = (intentos = 0) => {
                        const card = document.querySelector(`.obra-card[data-obra-id="${obraId}"]`);
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } else if (intentos < 10) {
                            setTimeout(() => intentarScroll(intentos + 1), 300);
                        }
                    };
                    setTimeout(() => intentarScroll(), 500);
                }
            });
        });
    } catch (e) {
        list.innerHTML = '';
        empty.textContent = 'Error al cargar notificaciones';
        empty.style.display = 'block';
    }
}

function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'Ahora';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    return `Hace ${Math.floor(diff / 86400)} d`;
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
            debugLog.warn("No se pudo obtener conteo de sesiones:", res.error);
        }
    } catch (error) {
        debugLog.error("Error al obtener número de sesiones:", error);
    }
}

function updateCerrarTodasSesionesButtonState() {
    const isEnabled = activeSessionsCount >= 2;

    // Actualizar todos los botones de "cerrar demás sesiones"
    const allButtons = [
        document.getElementById('mobile-logout-all'),
        document.getElementById('desktop-logout-all'),
        document.getElementById('btn-cerrar-todas-sesiones')
    ];

    allButtons.forEach(btn => {
        if (!btn) return;
        if (isEnabled) {
            btn.classList.remove('disabled');
            btn.classList.add('enabled');
        } else {
            btn.classList.add('disabled');
            btn.classList.remove('enabled');
        }
    });
}

async function closeAllSessions() {
    if (activeSessionsCount < 2) {
        showInfo("No hay otras sesiones activas. Solo tienes la sesión actual.");
        return;
    }
    if (await showConfirm("⚠️ ¿Estás seguro de que quieres cerrar la sesión en todos los dispositivos?\n\nEsta acción cerrará tu sesión actual.")) {
        let redirect = false;
        try {
            const res = await apiRequest('/api/artistas/cerrar-todas-sesiones', { method: 'POST' });
            if (res && res.success) {
                showSuccess("Todas las sesiones han sido cerradas correctamente.");
                redirect = true;
            } else {
                showError((res.error || "Error inesperado."));
            }
        } catch (error) {
            debugLog.error("Error al cerrar todas las sesiones:", error);
            showError("Error de conexión. Cerrando sesión local por seguridad.");
            redirect = true;
        }
        if (redirect) {
            localStorage.removeItem(ARTISTA_KEY);
            window.location.href = '/';
        }
    }
}
// Exponer para cuenta.js (lazy-loaded, no puede importar)
window.closeAllSessions = closeAllSessions;

// ============================================
// LOGOUT Y PANELES FLOTANTES
// ============================================
async function ejecutarLogout() {
    try {
        const res = await apiRequest('/api/artistas/logout', { method: 'POST' });
        if (res && !res.success) debugLog.warn(res.error);
    } catch (error) {
        debugLog.error("Error en logout backend:", error);
    } finally {
        logout();
        window.location.href = 'auth.html';
    }
}

function cerrarMobileLogoutModal() {
    const modal = document.getElementById('mobile-logout-options');
    if (modal) modal.classList.add('hidden');
    if (mobileClickOutsideHandler) {
        document.removeEventListener('click', mobileClickOutsideHandler);
        mobileClickOutsideHandler = null;
    }
}

function cerrarDesktopLogoutModal() {
    if (desktopLogoutModal) desktopLogoutModal.classList.add('hidden');
    if (clickOutsideHandlerLogout) {
        document.removeEventListener('click', clickOutsideHandlerLogout);
        clickOutsideHandlerLogout = null;
    }
}

function cerrarHeaderPopover(panelElement) {
    if (!panelElement) return;
    panelElement.classList.add('hidden');
    if (panelElement.id === 'header-config-menu' && headerConfigOutsideHandler) {
        document.removeEventListener('click', headerConfigOutsideHandler);
        headerConfigOutsideHandler = null;
    }
}

function cerrarTodosLosPaneles() {
    if (desktopLogoutModal && !desktopLogoutModal.classList.contains('hidden')) {
        cerrarDesktopLogoutModal();
    }
    const mobileLogoutModal = document.getElementById('mobile-logout-options');
    if (mobileLogoutModal && !mobileLogoutModal.classList.contains('hidden')) {
        cerrarMobileLogoutModal();
    }
}

function positionHeaderPopover(triggerElement, panelElement) {
    if (!panelElement || !triggerElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.header-popover-panel');
    if (!panelDiv) return;

    const panelRect = panelDiv.getBoundingClientRect();
    const margin = 8;
    const iconCenterX = rect.left + rect.width / 2;

    const top = rect.bottom + 12;

    let left = iconCenterX - panelRect.width / 2;
    const maxLeft = window.innerWidth - panelRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;

    const tailX = iconCenterX - left;
    panelDiv.style.setProperty('--tail-x', `${tailX}px`);
}

function positionDesktopPanel(triggerElement, panelElement) {
    if (!panelElement || !triggerElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.desktop-logout-panel');
    if (!panelDiv) return;

    const panelRect = panelDiv.getBoundingClientRect();
    const margin = 16;
    const iconCenterX = rect.left + rect.width / 2;
    let top = rect.top - panelRect.height - 12;
    if (top < margin) top = margin;

    let left = iconCenterX - panelRect.width / 2;
    const maxLeft = window.innerWidth - panelRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;

    const tailX = iconCenterX - left;
    panelDiv.style.setProperty('--tail-x', `${tailX}px`);
}

function positionMobilePanel(triggerElement, panelElement) {
    if (!panelElement || !triggerElement) return;
    const panelDiv = panelElement.querySelector('.mobile-logout-panel');
    if (!panelDiv) return;

    const iconRect = triggerElement.getBoundingClientRect();
    const panelRect = panelDiv.getBoundingClientRect();
    const iconCenterX = iconRect.left + iconRect.width / 2;
    const margin = 8;

    let top = iconRect.top - panelRect.height - 12;
    if (top < margin) top = margin;

    let left = iconCenterX - panelRect.width / 2;
    const maxLeft = window.innerWidth - panelRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < margin) left = margin;

    panelDiv.style.top = `${top}px`;
    panelDiv.style.left = `${left}px`;

    const tailX = iconCenterX - left;
    panelDiv.style.setProperty('--tail-x', `${tailX}px`);
}

// ============================================
// VERIFICAR SESIÓN EN BACKEND
// ============================================
async function verificarSesionBackend() {
    if (!token) return false;
    try {
        // Usamos heartbeat (endpoint ligero) con fetch directo para evitar
        // el 401 handler de apiRequest que dispara efectos secundarios.
        // Un error de red NO debe confundirse con sesión expirada.
        const authToken = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/api/artistas/heartbeat`, {
            method: 'POST',
            credentials: 'include',
            headers: authToken ? { Authorization: 'Bearer ' + authToken } : {}
        });
        // Solo 401/403 indica sesión realmente expirada
        if (res.status === 401 || res.status === 403) return false;
        return res.ok;
    } catch (error) {
        // Error de red: asumimos sesión válida (no redirigir por un transient network error)
        debugLog.warn('verificarSesionBackend: no se pudo contactar el backend, asumiendo sesión válida');
        return true;
    }
}

// ============================================
// CONFIGURACIÓN DE EVENTOS (ORQUESTADOR)
// ============================================
function setupEvents() {


    // ----- Buscador de usuarios en tiempo real (lazy: 6 KB) -----
    // La lupa (nav) abre el buscador debajo del header y muestra Explorar.
    import('./busqueda.js').then(m => {
        m.setupBuscador(
            (userId) => verPerfilUsuario(userId, verificarActividadLocal, actualizarEstadoNavButtons),
            (usuarios) => mostrarResultadosBusqueda(usuarios, (userId) => verPerfilUsuario(userId, verificarActividadLocal, actualizarEstadoNavButtons)),
            () => mostrarExplorar()
        );
    });

    // ----- Botón de configuración (Mi Cuenta, Modo Oscuro, Logout) -----
    const configBtn = document.getElementById('btn-configuracion');
    if (configBtn) {
        const configMenu = document.getElementById('header-config-menu');
        const configMiCuenta = document.getElementById('config-mi-cuenta');

        if (configMiCuenta) {
            configMiCuenta.addEventListener('click', () => {
                cerrarHeaderPopover(configMenu);
                toggleMiCuenta();
            });
        }

        configBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!configMenu) return;
            if (configMenu.classList.contains('hidden')) {
                cerrarTodosLosPaneles();
                updateCerrarTodasSesionesButtonState();
                configMenu.classList.remove('hidden');
                positionHeaderPopover(configBtn, configMenu);
                if (headerConfigOutsideHandler) {
                    document.removeEventListener('click', headerConfigOutsideHandler);
                }
                headerConfigOutsideHandler = (event) => {
                    if (!configMenu.contains(event.target) && event.target !== configBtn && !configBtn.contains(event.target)) {
                        cerrarHeaderPopover(configMenu);
                    }
                };
                setTimeout(() => document.addEventListener('click', headerConfigOutsideHandler), 0);
            } else {
                cerrarHeaderPopover(configMenu);
            }
        });
    }

    // ----- Modo oscuro -----
    setupDarkModeToggle();

    // ----- Notificaciones: click en campana abre/cierra panel -----
    const notifBtn = document.getElementById('btn-notificaciones');
    const notifDropdown = document.getElementById('notif-dropdown');
    if (notifBtn && notifDropdown) {
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notifDropdown.classList.contains('hidden')) {
                notifDropdown.classList.remove('hidden');
                cargarNotificaciones();
                // Marcar como leídas
                apiRequest('/api/artistas/notificaciones/leidas', { method: 'PUT', body: JSON.stringify({}) }).catch(()=>{});
                // Ocultar badge
                const badge = document.getElementById('notif-badge');
                if (badge) { badge.classList.add('hidden'); badge.dataset.last = '0'; }
            } else {
                notifDropdown.classList.add('hidden');
            }
        });
        document.addEventListener('click', (e) => {
            if (!notifDropdown.contains(e.target) && e.target !== notifBtn && !notifBtn.contains(e.target)) {
                notifDropdown.classList.add('hidden');
            }
        });
        // Botón cerrar dentro del panel
        const notifClose = document.getElementById('notif-close');
        if (notifClose) {
            notifClose.addEventListener('click', () => notifDropdown.classList.add('hidden'));
        }
    }

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
                            mobileClickOutsideHandler = function(e) {
                                const target = e.target;
                                const isNavButton = target.closest('#btn-galeria-sidebar') ||
                                    target.closest('#btn-registro-sidebar') ||
                                    target.closest('#btn-perfil-sidebar');
                                if (!mobileModal.contains(e.target) && e.target !== logoutIcon && !isNavButton) {
                                    cerrarMobileLogoutModal();
                                }
                            };
                            document.addEventListener('click', mobileClickOutsideHandler);
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

    // ----- Botones de navegación de la barra inferior -----
    // Cavents abre directamente la galería (Global Cavents); ya no hay popover.
    const btnCaventsHub = document.getElementById('btn-cavents-hub');
    if (btnCaventsHub) {
        btnCaventsHub.addEventListener('click', () => {
            toggleGaleria(getGaleriaContainer());
        });
    }

    // ----- Botón "+" de la barra inferior: abre Crear Cavent -----
    document.getElementById('btn-crear-cavent')?.addEventListener('click', () => {
        togglePanel('crear');
    });

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

    // ----- Abrir obra desde perfil (global) -----
    window.abrirObraDesdePerfil = (obraId) => {
        const galeria = document.getElementById('galeria-publica');
        const gc = document.getElementById('galeria-container');
        if (!galeria || !gc) return;

        // Si la galería ya está visible, solo recargar y hacer scroll
        if (!galeria.classList.contains('hidden')) {
            gc.classList.remove('modo-grid');
            cargarGaleria(gc).then(obras => {
                mostrarGaleria(obras, gc, null, (artistaId) => {
                    import('./galeria-ui.js').then(m => m.verPerfilArtistaDesdeGaleria(artistaId));
                });
                setTimeout(() => {
                    const target = gc.querySelector(`.obra-card[data-obra-id="${obraId}"]`);
                    if (target) gc.scrollTop = target.offsetTop;
                }, 400);
            });
            actualizarEstadoNavButtons();
            return;
        }

        // Ocultar perfil y mostrar galería con transición
        const perfilUsuario = document.getElementById('perfil-usuario');
        if (perfilUsuario) perfilUsuario.classList.add('hidden');
        mostrarPaginaBlanca();
        toggleGaleria(gc);
        // Esperar a que la galería cargue y hacer scroll a la obra
        const checkInterval = setInterval(() => {
            const target = gc.querySelector(`.obra-card[data-obra-id="${obraId}"]`);
            if (target) {
                clearInterval(checkInterval);
                gc.scrollTop = target.offsetTop;
            }
        }, 100);
        // Safety: dejar de buscar después de 5 segundos
        setTimeout(() => clearInterval(checkInterval), 5000);
    };

    // ----- Sección de perfil -----
    setupPerfilInteracciones(togglePerfil, cerrarTodosLosPaneles);
    setupChat();
    setupPush();

    // ----- Cambiar foto de perfil -----
    const inputFotoPerfil = document.getElementById('input-foto-perfil');
    if (inputFotoPerfil) {
        inputFotoPerfil.addEventListener('change', function() {
            const file = this.files[0];
            this.value = '';
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                ['perfil-avatar-mini', 'perfil-avatar-seccion'].forEach(id => {
                    const img = document.getElementById(id);
                    if (img) img.src = e.target.result;
                });
            };
            reader.readAsDataURL(file);

            showInfo('Subiendo foto de perfil...');
            subirFotoPerfilServidor(file).then((res) => {
                if (res && res.success && res.foto_perfil) {
                    guardarFotoPerfil(res.foto_perfil);
                    actualizarPerfilUI(verificarActividadLocal);
                    showSuccess('Foto de perfil actualizada.');
                } else {
                    const msg = (res && res.error) ? res.error : 'No se pudo guardar la foto en el servidor.';
                    showError(msg);
                    actualizarPerfilUI(verificarActividadLocal);
                }
            }).catch(() => {
                showError('Error de conexión al subir la foto de perfil.');
                actualizarPerfilUI(verificarActividadLocal);
            });
        });
    }

    // ----- Formulario de obra (submit) -----
    setupObraFormSubmit();

    // ----- Limpiar campos -----
    const btnLimpiar = document.getElementById('btn-limpiar-campos');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => limpiarFormularioCompleto(true));
    }

    // ----- Mi Cuenta (lazy: 13 KB) -----
    import('./cuenta.js').then(m => m.setupMiCuenta());

    // ----- Cerrar modales -----
    document.querySelectorAll('.cerrar-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) modal.classList.add('hidden');
        });
    });

    // ----- Tecla Escape -----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });
            cerrarTodosLosPaneles();
            cerrarHeaderPopover(document.getElementById('header-config-menu'));
            cerrarHeaderPopover(document.getElementById('header-config-menu'));
            const searchDropdown = document.getElementById('search-results-dropdown');
            if (searchDropdown) searchDropdown.classList.add('hidden');
        }
    });
}

// ============================================
// EVENTO GLOBAL: SESIÓN EXPIRADA (detectada por apiRequest en config.js)
// ============================================
document.addEventListener('userLogout', () => {
    // Limpiar localStorage y redirigir a login
    localStorage.removeItem(ARTISTA_KEY);
    localStorage.removeItem('app_version');
    window.location.href = 'auth.html';
});

// ============================================
// INICIALIZACIÓN
// ============================================
async function init() {
    const t0 = performance.now();

    const preloader = document.getElementById('preloader');
    let preloaderOcultado = false;
    const ocultarPreloader = () => {
        if (!preloaderOcultado && preloader) {
            preloaderOcultado = true;
            preloader.classList.add('hidden');
            const appContainer = document.querySelector('.app-container');
            if (appContainer) {
                appContainer.classList.add('visible');
            }
        }
    };

    const MAX_TIMEOUT = 15000;
    let timeoutId = setTimeout(ocultarPreloader, MAX_TIMEOUT);

    const MIN_DISPLAY_MS = 800;
    let minDisplayPassed = false;
    setTimeout(() => { minDisplayPassed = true; }, MIN_DISPLAY_MS);

    const sesionValida = await verificarSesionBackend();
    if (minDisplayPassed) {
        ocultarPreloader();
        clearTimeout(timeoutId);
    } else {
        const elapsed = performance.now() - t0;
        const remaining = MIN_DISPLAY_MS - elapsed;
        setTimeout(() => {
            ocultarPreloader();
            clearTimeout(timeoutId);
        }, Math.max(0, remaining));
    }

    if (!sesionValida) {
        localStorage.removeItem(ARTISTA_KEY);
        window.location.href = 'auth.html';
        return;
    }

    document.getElementById('toggle-panel').classList.remove('hidden');
    actualizarPerfilUI(verificarActividadLocal);
    mostrarPaginaBlanca();
    setupEvents();
    setupImagePreviews();
    setupFormChangeTracking();
    await fetchActiveSessionsCount();
    refrescarPerfilDesdeServidor();

    iniciarSeguimientoActividad();
    setupFormAccordions();
}

init();

// ============================================
// DEEP LINK desde notificación web push: ?obra=ID
// Abre la galería y hace scroll al cavent indicado.
// ============================================
(function manejarDeepLinkObra() {
    const params = new URLSearchParams(window.location.search);
    const obraDeep = params.get('obra');
    if (!obraDeep) return;
    const abrir = async () => {
        try {
            const galeriaUI = await import('./galeria-ui.js');
            const galeriaContainer = document.getElementById('galeria-container');
            if (galeriaContainer) await galeriaUI.toggleGaleria(galeriaContainer);
            const intentarScroll = (intentos = 0) => {
                const card = document.querySelector('.obra-card[data-obra-id="' + obraDeep + '"]');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                else if (intentos < 10) setTimeout(() => intentarScroll(intentos + 1), 300);
            };
            setTimeout(() => intentarScroll(), 500);
        } catch (e) { /* silencioso */ }
    };
    // Esperar a que la app termine de cargar (las cards se pintan tras init)
    setTimeout(abrir, 800);
})();

// ============================================
// SLIDESHOW DE FONDO — cambia cada 8s (como auth.html)
// ============================================
(function rotarFondo() {
    const slides = document.querySelectorAll('.auth-bg-slide');
    if (slides.length < 2) return;
    let actual = 0;
    slides[0].classList.add('active');
    setInterval(() => {
        actual = (actual + 1) % slides.length;
        slides.forEach(s => s.classList.remove('active'));
        slides[actual].classList.add('active');
    }, 8000);
})();
