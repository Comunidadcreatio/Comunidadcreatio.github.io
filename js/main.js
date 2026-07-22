// js/main.js
// Orquestador principal de la aplicación Creatio.
// Coordina todos los módulos: autenticación, galería, panel, perfil,
// búsqueda, cuenta, tema, y gestiona eventos globales.

import { ARTISTA_KEY, apiRequest } from './config.js';
import { token, artistaActual, logout } from './auth.js';
import {
    showSuccess, showError, showWarning, showInfo, showConfirm
} from './notificaciones.js';

// --- Nuevos módulos extraídos ---
import { setupDarkModeToggle } from './theme.js';
import {
    actualizarPerfilUI, subirFotoPerfilServidor, guardarFotoPerfil,
    refrescarPerfilDesdeServidor, mostrarResultadosBusqueda,
    verPerfilUsuario, setupPerfilInteracciones
} from './perfil.js';
import {
    mostrarPaginaBlanca, actualizarEstadoNavButtons,
    toggleGaleria, togglePanel, toggleMiCuenta, togglePerfil, toggleExplorar
} from './galeria-ui.js';
import {
    currentPage, currentLimit, currentSearch, currentSortBy, currentOrder, totalObras,
    setupFormChangeTracking,
    refrescarTabla,
    setupImagePreviews, limpiarFormularioCompleto,
    setupObraFormSubmit, setupFormAccordions
} from './panel-ui.js';
import { setRefrescarTablaFn } from './galeria-ui.js';
// cuenta.js se carga lazy (13 KB) — solo cuando el usuario abre Mi Cuenta
// busqueda.js se carga lazy (6 KB) — solo cuando el usuario usa el buscador

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
export const galeriaContainer = document.getElementById('galeria-container');
const tablaBody = document.getElementById('tabla-obras-body');

// Variables para paneles flotantes
let desktopLogoutModal = null;
let desktopLogoutAllBtn = null;
let desktopLogoutSingleBtn = null;
let clickOutsideHandlerLogout = null;
let headerConfigOutsideHandler = null;
let headerLogoutOutsideHandler = null;

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
    }, 30000);
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
    const mobileAllBtn = document.getElementById('mobile-logout-all');
    const isEnabled = activeSessionsCount >= 2;

    if (mobileAllBtn) {
        if (isEnabled) {
            mobileAllBtn.classList.remove('disabled');
            mobileAllBtn.classList.add('enabled');
        } else {
            mobileAllBtn.classList.add('disabled');
            mobileAllBtn.classList.remove('enabled');
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
    if (await showConfirm("⚠️ ¿Estás seguro de que quieres cerrar la sesión en todos los dispositivos?\n\nEsta acción cerrará tu sesión actual.")) {
        try {
            const res = await apiRequest('/api/artistas/cerrar-todas-sesiones', { method: 'POST' });
            if (res && res.success) {
                showSuccess("Todas las sesiones han sido cerradas correctamente.");
            } else {
                showError((res.error || "Error inesperado."));
            }
        } catch (error) {
            debugLog.error("Error al cerrar todas las sesiones:", error);
            showError("Error de conexión. Cerrando sesión local por seguridad.");
        } finally {
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
    if (panelElement.id === 'header-logout-menu' && headerLogoutOutsideHandler) {
        document.removeEventListener('click', headerLogoutOutsideHandler);
        headerLogoutOutsideHandler = null;
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
        const res = await apiRequest('/api/artistas/mis-obras?page=1&limit=1');
        return res !== null && res.success !== false;
    } catch (error) {
        return false;
    }
}

// ============================================
// CONFIGURACIÓN DE EVENTOS (ORQUESTADOR)
// ============================================
function setupEvents() {
    // ----- Resolver dependencia circular: galeria-ui -> panel-ui.refrescarTabla -----
    setRefrescarTablaFn(() => refrescarTabla(tablaBody));

    // ----- Botón de logout del header -----
    const logoutHeaderBtn = document.getElementById('btn-logout-header');
    if (logoutHeaderBtn) {
        const headerLogoutMenu = document.getElementById('header-logout-menu');
        const headerLogoutSingle = document.getElementById('header-logout-single');
        const headerLogoutAll = document.getElementById('header-logout-all');

        if (headerLogoutSingle) {
            headerLogoutSingle.addEventListener('click', async () => {
                cerrarHeaderPopover(headerLogoutMenu);
                await ejecutarLogout();
            });
        }
        if (headerLogoutAll) {
            headerLogoutAll.addEventListener('click', () => {
                closeAllSessions();
                cerrarHeaderPopover(headerLogoutMenu);
            });
        }

        logoutHeaderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!headerLogoutMenu) {
                ejecutarLogout();
                return;
            }
            if (headerLogoutMenu.classList.contains('hidden')) {
                cerrarTodosLosPaneles();
                cerrarHeaderPopover(document.getElementById('header-config-menu'));
                updateCerrarTodasSesionesButtonState();
                headerLogoutMenu.classList.remove('hidden');
                positionHeaderPopover(logoutHeaderBtn, headerLogoutMenu);
                if (headerLogoutOutsideHandler) {
                    document.removeEventListener('click', headerLogoutOutsideHandler);
                }
                headerLogoutOutsideHandler = (event) => {
                    if (!headerLogoutMenu.contains(event.target) && event.target !== logoutHeaderBtn && !logoutHeaderBtn.contains(event.target)) {
                        cerrarHeaderPopover(headerLogoutMenu);
                    }
                };
                setTimeout(() => document.addEventListener('click', headerLogoutOutsideHandler), 0);
            } else {
                cerrarHeaderPopover(headerLogoutMenu);
            }
        });
    }

    // ----- Buscador de usuarios en tiempo real (lazy: 6 KB) -----
    import('./busqueda.js').then(m => {
        m.setupBuscador(
            (userId) => verPerfilUsuario(userId, verificarActividadLocal, actualizarEstadoNavButtons),
            (usuarios) => mostrarResultadosBusqueda(usuarios, (userId) => verPerfilUsuario(userId, verificarActividadLocal, actualizarEstadoNavButtons))
        );
    });

    // ----- Botón de configuración (Mi Cuenta) -----
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
                cerrarHeaderPopover(document.getElementById('header-logout-menu'));
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
                                const target = e.target;
                                const isNavButton = target.closest('#btn-galeria-sidebar') ||
                                    target.closest('#btn-registro-sidebar') ||
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

    // ----- Botones de navegación de la barra inferior -----
    const btnCaventsHub = document.getElementById('btn-cavents-hub');
    const caventsPopover = document.getElementById('cavents-popover');

    if (btnCaventsHub && caventsPopover) {
        btnCaventsHub.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = caventsPopover.classList.contains('hidden');
            // Cerrar otros popovers
            document.querySelectorAll('.header-popover').forEach(p => p.classList.add('hidden'));
            if (isHidden) {
                posicionarCaventsPopover(btnCaventsHub, caventsPopover);
                caventsPopover.classList.remove('hidden');
            }
        });
    }

    function posicionarCaventsPopover(trigger, popover) {
        const panelDiv = popover.querySelector('.header-popover-panel');
        if (!panelDiv) return;
        // Mostrar temporalmente para medir
        popover.style.display = 'block';
        const triggerRect = trigger.getBoundingClientRect();
        const panelRect = panelDiv.getBoundingClientRect();
        popover.style.display = '';
        const margin = 8;
        const gap = 3;
        const iconCenterX = triggerRect.left + triggerRect.width / 2;
        // Posicionar arriba del botón
        let top = triggerRect.top - panelRect.height - gap;
        if (top < margin) top = margin;
        let left = iconCenterX - panelRect.width / 2;
        const maxLeft = window.innerWidth - panelRect.width - margin;
        if (left > maxLeft) left = maxLeft;
        if (left < margin) left = margin;
        popover.style.top = `${top}px`;
        popover.style.left = `${left}px`;
        // Cola apuntando al centro del botón
        const tailX = iconCenterX - left;
        panelDiv.style.setProperty('--tail-x', `${tailX}px`);
    }

    if (caventsPopover) {
        // Opciones del menú cavents
        document.getElementById('cavents-explorar')?.addEventListener('click', () => {
            caventsPopover.classList.add('hidden');
            toggleExplorar();
        });
        document.getElementById('cavents-galeria')?.addEventListener('click', () => {
            caventsPopover.classList.add('hidden');
            toggleGaleria(galeriaContainer);
        });
        document.getElementById('cavents-registro')?.addEventListener('click', () => {
            caventsPopover.classList.add('hidden');
            togglePanel();
        });
    }

    // Cerrar popovers al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (caventsPopover && !caventsPopover.classList.contains('hidden')) {
            if (!caventsPopover.contains(e.target) && e.target !== btnCaventsHub) {
                caventsPopover.classList.add('hidden');
            }
        }
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

    // ----- Filtros -----
    const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', () => {
            currentSearch = document.getElementById('search-input-panel').value;
            currentSortBy = document.getElementById('sort-select').value;
            currentOrder = document.getElementById('order-select').value;
            currentLimit = parseInt(document.getElementById('limit-select').value);
            currentPage = 1;
            refrescarTabla(tablaBody);
        });
    }

    // ----- Paginación -----
    const btnPrev = document.getElementById('btn-prev');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                refrescarTabla(tablaBody);
            }
        });
    }
    const btnNext = document.getElementById('btn-next');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const totalPages = Math.ceil(totalObras / currentLimit);
            if (currentPage < totalPages) {
                currentPage++;
                refrescarTabla(tablaBody);
            }
        });
    }

    // ----- Sección de perfil -----
    setupPerfilInteracciones(togglePerfil, cerrarTodosLosPaneles);

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

    // ----- Navegación entre modales (login/registro) -----
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
            cerrarHeaderPopover(document.getElementById('header-logout-menu'));
            const searchDropdown = document.getElementById('search-results-dropdown');
            if (searchDropdown) searchDropdown.classList.add('hidden');
        }
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================
async function init() {
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
        const remaining = MIN_DISPLAY_MS - performance.now();
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
