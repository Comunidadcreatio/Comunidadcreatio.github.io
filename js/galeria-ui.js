// js/galeria-ui.js
// Navegación entre secciones, transiciones, toggle de galería/panel/perfil/cuenta,
// y modo grid de la galería.

import { cargarGaleria, mostrarGaleria } from './galeria.js?v=20260725';
import { artistaActual, token } from './auth.js';
import { actualizarPerfilUI, verPerfilUsuario, actualizarEstadisticas, activarTabCavents } from './perfil.js';
import { confirmarDescartarCambios } from './panel-ui.js';

// Referencia para refrescarTabla (evita dependencia circular)
let _refrescarTablaFn = null;
export function setRefrescarTablaFn(fn) { _refrescarTablaFn = fn; }

// Variable de control para el modo de galería: 0=oculta, 1=vista normal, 2=vista grid
export let galeriaModo = 0;
let gridExiting = false;
let gridEntering = false;

export function resetGaleriaModo() {
    galeriaModo = 0;
    gridExiting = false;
    gridEntering = false;
    const gc = obtenerGaleriaContainer();
    if (gc) gc.classList.remove('modo-grid');
}

function obtenerGaleriaContainer() {
    return document.getElementById('galeria-container');
}

// ============================================
// SISTEMA DE TRANSICIONES ENTRE SECCIONES
// ============================================
let isTransitioning = false;
const SECCIONES = ['galeria-publica', 'panel-artista', 'mi-cuenta', 'perfil-usuario', 'resultados-busqueda', 'pagina-blanca'];

export function encontrarSeccionActual() {
    for (const id of SECCIONES) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) return el;
    }
    return document.getElementById('pagina-blanca');
}

function switchSection(sectionSaliente, sectionEntrante, callback) {
    if (isTransitioning) return;
    if (!sectionEntrante) return;
    if (sectionSaliente === sectionEntrante) return;

    isTransitioning = true;

    const safetyTimeout = setTimeout(() => {
        isTransitioning = false;
        for (const id of SECCIONES) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('section-entering', 'section-exiting');
                el.classList.add('hidden');
            }
        }
        if (sectionEntrante) {
            sectionEntrante.classList.remove('hidden');
            if (callback) callback();
        }
    }, 800);

    function finish() {
        clearTimeout(safetyTimeout);
        isTransitioning = false;
    }

    if (sectionSaliente) {
        sectionSaliente.classList.remove('section-entering');
        sectionSaliente.classList.add('section-exiting');
        sectionSaliente.addEventListener('animationend', function onExit() {
            sectionSaliente.removeEventListener('animationend', onExit);
            sectionSaliente.classList.remove('section-exiting');
            sectionSaliente.classList.add('hidden');
            finish();
            mostrarSeccion(sectionEntrante, callback);
        }, { once: true });
    } else {
        finish();
        mostrarSeccion(sectionEntrante, callback);
    }
}

function mostrarSeccion(section, callback) {
    if (!section) return;
    section.classList.remove('hidden', 'section-exiting');
    actualizarEstadoNavButtons();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            section.classList.add('section-entering');
            section.addEventListener('animationend', function onEnter() {
                section.removeEventListener('animationend', onEnter);
                section.classList.remove('section-entering');
                if (callback) callback();
            }, { once: true });
        });
    });
}

export function ocultarTodasLasSecciones() {
    SECCIONES.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('section-entering', 'section-exiting');
            el.classList.add('hidden');
        }
    });
}

export function mostrarPaginaBlanca() {
    ocultarTodasLasSecciones();
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (paginaBlanca) paginaBlanca.classList.remove('hidden');
    const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
    if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
}

// ============================================
// ACTUALIZAR ESTADO DE BOTONES DE NAVEGACIÓN
// ============================================
export function actualizarEstadoNavButtons() {
    const btnCaventsHub = document.getElementById('btn-cavents-hub');
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const galeriaContainer = obtenerGaleriaContainer();

    if (galeria && btnCaventsHub) {
        const galeriaVisible = !galeria.classList.contains('hidden');
        btnCaventsHub.classList.remove('nav-btn-active', 'nav-btn-grid');

        if (galeriaVisible) {
            if (galeriaModo === 2 && galeriaContainer && galeriaContainer.classList.contains('modo-grid')) {
                btnCaventsHub.classList.add('nav-btn-grid');
            } else {
                btnCaventsHub.classList.add('nav-btn-active');
            }
        }
    }
}

// ============================================
// MODO GRID (AMARILLO)
// ============================================
function salirDeModoGrid(onComplete) {
    const galeriaContainerLocal = obtenerGaleriaContainer();
    gridExiting = true;

    if (!galeriaContainerLocal) {
        gridExiting = false;
        if (onComplete) onComplete();
        return;
    }

    const cards = galeriaContainerLocal.querySelectorAll('.obra-card');
    cards.forEach(c => c.classList.add('modo-grid-exit'));

    let animEndHandled = false;
    const lastCard = cards[cards.length - 1];
    const onAnimEnd = () => {
        if (animEndHandled) return;
        animEndHandled = true;
        gridExiting = false;
        galeriaContainerLocal.classList.remove('modo-grid');
        cards.forEach(c => c.classList.remove('modo-grid-exit'));
        if (onComplete) onComplete();
    };

    if (lastCard) {
        lastCard.addEventListener('animationend', onAnimEnd, { once: true });
        setTimeout(onAnimEnd, 600);
    } else {
        gridExiting = false;
        onAnimEnd();
    }
}

export function verPerfilArtistaDesdeGaleria(artistaId) {
    galeriaModo = 0;
    gridEntering = false;
    gridExiting = false;
    const galeriaContainerLocal = obtenerGaleriaContainer();
    if (galeriaContainerLocal) galeriaContainerLocal.classList.remove('modo-grid');

    const galeria = document.getElementById('galeria-publica');
    if (galeria) galeria.classList.add('hidden');
    mostrarPaginaBlanca();

    verPerfilUsuario(artistaId, null, actualizarEstadoNavButtons);
}

export function seleccionarObraDesdeGrid(obraId) {
    if (galeriaModo !== 2 || gridExiting || gridEntering) return;

    galeriaModo = 1;
    actualizarEstadoNavButtons();

    salirDeModoGrid(() => {
        const galeriaContainerLocal = obtenerGaleriaContainer();
        if (!galeriaContainerLocal) return;

        requestAnimationFrame(() => {
            const targetCard = galeriaContainerLocal.querySelector(`.obra-card[data-obra-id="${obraId}"]`);
            if (targetCard) {
                galeriaContainerLocal.scrollTop = targetCard.offsetTop;
            }

            const cards = galeriaContainerLocal.querySelectorAll('.obra-card');
            cards.forEach(c => c.classList.add('modo-flex-enter'));
        });
    });
}

// ============================================
// TOGGLE DE SECCIONES
// ============================================

export function isTransitioningNow() {
    return isTransitioning || gridEntering || gridExiting;
}

export async function toggleGaleria(galeriaContainer) {
    if (isTransitioning || gridEntering || gridExiting || !(await confirmarDescartarCambios())) return;

    const galeria = document.getElementById('galeria-publica');
    const galeriaContainerLocal = obtenerGaleriaContainer();
    if (!galeria) return;

    if (galeria.classList.contains('hidden')) {
        // Mostrar galería en modo normal (carousel)
        galeriaModo = 1;
        if (galeriaContainerLocal) {
            galeriaContainerLocal.classList.remove('modo-grid');
            galeriaContainerLocal.innerHTML = '';
            setupPullToRefresh(galeriaContainerLocal);
        }
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');

        switchSection(encontrarSeccionActual(), galeria, () => {
            cargarGaleria(galeriaContainer).then(obras => {
                mostrarGaleria(obras, galeriaContainer, (id) => {
                    seleccionarObraDesdeGrid(id);
                }, (artistaId) => {
                    verPerfilArtistaDesdeGaleria(artistaId);
                });
                ensurePTRInContainer(galeriaContainer);
                if (galeriaContainerLocal) {
                    galeriaContainerLocal.querySelectorAll('.obra-card').forEach((c) => {
                        c.classList.add('modo-flex-enter');
                    });
                }
            });
        });
    } else if (galeriaModo === 2) {
        // Cambiar de grid a carrusel
        galeriaModo = 1;
        salirDeModoGrid(() => {
            if (galeriaContainerLocal) {
                galeriaContainerLocal.querySelectorAll('.obra-card').forEach((c) => {
                    c.classList.add('modo-flex-enter');
                });
            }
            actualizarEstadoNavButtons();
        });
    } else {
        // Ocultar galería
        galeriaModo = 0;
        switchSection(galeria, document.getElementById('pagina-blanca'));
    }
}

export async function toggleExplorar() {
    if (isTransitioning || gridEntering || gridExiting || !(await confirmarDescartarCambios())) return;

    const galeria = document.getElementById('galeria-publica');
    const galeriaContainerLocal = obtenerGaleriaContainer();
    if (!galeria) return;

    if (galeria.classList.contains('hidden')) {
        // Mostrar galería directamente en modo grid
        galeriaModo = 2;
        gridEntering = true;
        if (galeriaContainerLocal) {
            galeriaContainerLocal.innerHTML = '';
            galeriaContainerLocal.classList.add('modo-grid');
            setupPullToRefresh(galeriaContainerLocal);
        }
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');

        switchSection(encontrarSeccionActual(), galeria, () => {
            cargarGaleria(galeriaContainerLocal).then(obras => {
                mostrarGaleria(obras, galeriaContainerLocal, (id) => {
                    seleccionarObraDesdeGrid(id);
                }, (artistaId) => {
                    verPerfilArtistaDesdeGaleria(artistaId);
                });
                actualizarEstadoNavButtons();
                setTimeout(() => { gridEntering = false; }, 700);
            });
        });
    } else if (galeriaModo === 1) {
        // Cambiar de modo normal a grid
        galeriaModo = 2;
        gridEntering = true;
        if (galeriaContainerLocal) {
            galeriaContainerLocal.classList.add('modo-grid');
            setupPullToRefresh(galeriaContainerLocal);
        }
        actualizarEstadoNavButtons();
        setTimeout(() => { gridEntering = false; }, 700);
    } else {
        // Salir del modo grid (volver a normal o cerrar)
        galeriaModo = 0;
        salirDeModoGrid(() => switchSection(galeria, document.getElementById('pagina-blanca')));
    }
}

// ============================================================
// ============================================================
// PULL-TO-REFRESH (MODO EXPLORAR / GRID)
// ============================================================
let ptrIndicator = null;
let ptrStartY = 0;
let ptrPulling = false;
let ptrRefreshing = false;
let ptrPullDist = 0;
let ptrMaxPull = 0;
const PTR_THRESHOLD = 70;

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function createPTRIndicator(container) {
    if (ptrIndicator) {
        // Re-insertar si fue destruido por innerHTML
        if (!ptrIndicator.parentNode) {
            container.insertBefore(ptrIndicator, container.firstChild);
        }
        return;
    }
    ptrIndicator = document.createElement('div');
    ptrIndicator.className = 'pull-refresh-indicator';
    ptrIndicator.innerHTML = '<div class="ptr-circle"><div class="ptr-circle-fill"></div></div>';
    container.insertBefore(ptrIndicator, container.firstChild);
}

function ensurePTRInContainer(container) {
    if (ptrIndicator && !ptrIndicator.parentNode) {
        container.insertBefore(ptrIndicator, container.firstChild);
    }
}

export function setupPullToRefresh(container) {
    if (!container) return;
    // El indicador se recrea siempre (innerHTML lo destruye)
    createPTRIndicator(container);
    // Listeners solo una vez por container
    if (container.dataset.ptrReady === '1') return;
    container.dataset.ptrReady = '1';

    container.addEventListener('touchstart', (e) => {
        if (ptrRefreshing) return;
        // Forzar scrollTop a 0 si está cerca (scroll-snap a veces lo deja en 1-5px)
        if (container.scrollTop > 0 && container.scrollTop <= 10) {
            container.scrollTop = 0;
        }
        if (container.scrollTop <= 0) {
            ptrStartY = e.touches[0].clientY;
            ptrPulling = true;
            container.style.transition = 'none';
            container.style.paddingTop = '';
            container.style.transform = '';
            container.style.scrollSnapType = 'none';
            container.style.userSelect = 'none';
        } else {
            ptrPulling = false;
        }
    }, { passive: true });

    let touchRaf = null;

    container.addEventListener('touchmove', (e) => {
        if (!ptrPulling || ptrRefreshing) return;
        const dist = e.touches[0].clientY - ptrStartY;
        ptrPullDist = dist;
        if (dist > ptrMaxPull) ptrMaxPull = dist;

        if (dist > 5 && container.scrollTop <= 0) {
            e.preventDefault();
            if (touchRaf) cancelAnimationFrame(touchRaf);
            touchRaf = requestAnimationFrame(() => {
                const damped = Math.min(dist * 0.45, 90);
                container.style.paddingTop = damped + 'px';
                ptrIndicator.classList.add('visible');
                const progress = Math.min(dist / PTR_THRESHOLD, 1);
                const circle = ptrIndicator.querySelector('.ptr-circle-fill');
                if (circle) {
                    const deg = Math.round(progress * 360);
                    const fill = document.documentElement.getAttribute('data-theme') === 'dark' ? '#f5f5f5' : '#1a1a1a';
                    circle.style.background = `conic-gradient(${fill} 0deg, ${fill} ${deg}deg, transparent ${deg}deg)`;
                }
            });
        }
    }, { passive: false });

    container.addEventListener('touchend', async () => {
        if (touchRaf) { cancelAnimationFrame(touchRaf); touchRaf = null; }
        if (!ptrPulling || ptrRefreshing) { ptrPulling = false; return; }
        ptrPulling = false;
        container.style.transition = 'padding-top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1.2)';
        container.style.paddingTop = '0';
        container.style.transform = '';
        container.style.scrollSnapType = '';
        container.style.userSelect = '';

        // Reset círculo — limpiar estilo inline
        const circle = ptrIndicator.querySelector('.ptr-circle-fill');
        if (circle) {
            circle.style.background = '';
        }

        if (ptrMaxPull >= PTR_THRESHOLD && container.scrollTop <= 0) {
            ptrRefreshing = true;
            ptrIndicator.classList.add('loading');

            try {
                const obras = await cargarGaleria(container);
                const shuffled = shuffleArray(obras);
                mostrarGaleria(shuffled, container, (id) => {
                    seleccionarObraDesdeGrid(id);
                }, (artistaId) => {
                    verPerfilArtistaDesdeGaleria(artistaId);
                });
                ensurePTRInContainer(container);
            } catch (err) {
                console.warn('Pull-to-refresh falló:', err);
            }

            ptrRefreshing = false;
            ptrIndicator.classList.remove('visible', 'loading');
        } else {
            ptrIndicator.classList.remove('visible');
        }
        ptrPullDist = 0;
    });

    // Soporte mouse drag (desktop)
    let rafId = null;

    container.addEventListener('mousedown', (e) => {
        if (ptrRefreshing) return;
        if (container.scrollTop <= 0) {
            e.preventDefault();
            ptrStartY = e.clientY;
            ptrPulling = true;
            ptrMaxPull = 0;
            container.style.transition = 'none';
            container.style.paddingTop = '';
            container.style.transform = '';
            container.style.scrollSnapType = 'none';
            container.style.userSelect = 'none';
        } else {
            ptrPulling = false;
        }
    });

    function onMouseMove(e) {
        if (!ptrPulling || ptrRefreshing) return;
        const dist = e.clientY - ptrStartY;
        ptrPullDist = dist;
        if (dist > ptrMaxPull) ptrMaxPull = dist;

        if (dist > 5 && container.scrollTop <= 0) {
            e.preventDefault();
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const damped = Math.min(dist * 0.45, 90);
                container.style.paddingTop = damped + 'px';
                ptrIndicator.classList.add('visible');
                const progress = Math.min(dist / PTR_THRESHOLD, 1);
                const circle = ptrIndicator.querySelector('.ptr-circle-fill');
                if (circle) {
                    const deg = Math.round(progress * 360);
                    const fill = document.documentElement.getAttribute('data-theme') === 'dark' ? '#f5f5f5' : '#1a1a1a';
                    circle.style.background = `conic-gradient(${fill} 0deg, ${fill} ${deg}deg, transparent ${deg}deg)`;
                }
            });
        }
    }

    async function onMouseUp() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (!ptrPulling || ptrRefreshing) { ptrPulling = false; return; }
        ptrPulling = false;
        container.style.transition = 'padding-top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1.2)';
        container.style.paddingTop = '0';
        container.style.scrollSnapType = '';
        container.style.userSelect = '';

        const circle = ptrIndicator.querySelector('.ptr-circle-fill');
        if (circle) circle.style.background = '';

        if (ptrMaxPull >= PTR_THRESHOLD && container.scrollTop <= 0) {
            ptrRefreshing = true;
            ptrIndicator.classList.add('loading');

            try {
                const obras = await cargarGaleria(container);
                const shuffled = shuffleArray(obras);
                mostrarGaleria(shuffled, container, (id) => {
                    seleccionarObraDesdeGrid(id);
                }, (artistaId) => {
                    verPerfilArtistaDesdeGaleria(artistaId);
                });
                ensurePTRInContainer(container);
            } catch (err) {
                console.warn('Pull-to-refresh (mouse) falló:', err);
            }

            ptrRefreshing = false;
            ptrIndicator.classList.remove('visible', 'loading');
        } else {
            ptrIndicator.classList.remove('visible');
        }
        ptrPullDist = 0;
        ptrMaxPull = 0;
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}


export function togglePanel() {
    if (isTransitioning) return;

    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (!panel || !paginaBlanca) return;

    resetGaleriaModo();

    if (panel.classList.contains('hidden')) {
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
        if (artistaActual && artistaActual.nombre_artista) {
            const inputArtista = document.getElementById('input-artista');
            if (inputArtista && !inputArtista.value) {
                inputArtista.value = artistaActual.nombre_artista;
            }
        }
        switchSection(encontrarSeccionActual(), panel, () => {
            if (_refrescarTablaFn) _refrescarTablaFn();
        });
    } else {
        switchSection(panel, paginaBlanca);
    }
}

export function toggleMiCuenta() {
    if (isTransitioning) return;

    const miCuenta = document.getElementById('mi-cuenta');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (!miCuenta || !paginaBlanca) return;

    if (miCuenta.classList.contains('hidden')) {
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
        const emailInput = document.getElementById('cuenta-email-actual');
        if (emailInput && artistaActual) {
            emailInput.value = artistaActual.email || artistaActual.correo || '';
        }
        const avatarBtn = document.getElementById('perfil-avatar-btn');
        const avatarOverlay = document.querySelector('.perfil-avatar-overlay');
        if (avatarBtn) { avatarBtn.style.pointerEvents = 'auto'; avatarBtn.style.cursor = 'pointer'; }
        if (avatarOverlay) { avatarOverlay.style.display = 'flex'; }
        switchSection(encontrarSeccionActual(), miCuenta);
    } else {
        switchSection(miCuenta, paginaBlanca);
    }
}

export function togglePerfil() {
    if (isTransitioning) return;

    const perfilUsuario = document.getElementById('perfil-usuario');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (!perfilUsuario || !paginaBlanca) return;

    const viendoPerfilExterno = perfilUsuario.dataset.viewing === 'external';

    if (perfilUsuario.classList.contains('hidden') || viendoPerfilExterno) {
        perfilUsuario.dataset.viewing = 'own';
        actualizarPerfilUI();
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'true');
        const avatarBtn = document.getElementById('perfil-avatar-btn');
        const avatarOverlay = document.querySelector('.perfil-avatar-overlay');
        if (avatarBtn) { avatarBtn.style.pointerEvents = 'auto'; avatarBtn.style.cursor = 'pointer'; }
        if (avatarOverlay) { avatarOverlay.style.display = 'flex'; }
        window.actualizarEstadisticas();
        activarTabCavents();
        switchSection(encontrarSeccionActual(), perfilUsuario);
    } else {
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');
        switchSection(perfilUsuario, paginaBlanca);
    }
}
