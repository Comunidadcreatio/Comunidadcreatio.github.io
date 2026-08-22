// js/galeria-ui.js
// Navegación entre secciones, transiciones, toggle de galería/panel/perfil/cuenta,
// y modo grid de la galería.

import { cargarGaleria, mostrarGaleria } from './galeria.js?v=23936cbe40';
import { renderEtiquetasCarrusel, resetEtiquetas } from './etiquetas.js?v=c25daf6387';
import { artistaActual, token } from './auth.js?v=30e2869c22';
import { actualizarPerfilUI, verPerfilUsuario, actualizarEstadisticas, activarTabCavents } from './perfil.js?v=a66168f1f2';
import { confirmarDescartarCambios } from './panel-ui.js?v=54a0002e59';

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
const SECCIONES = ['galeria-publica', 'panel-artista', 'mi-cuenta', 'perfil-usuario', 'resultados-busqueda', 'pagina-blanca', 'chat-global', 'problogs'];

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

    // Al salir de Explorar (grid + etiquetas) hacia OTRA sección, ocultar las
    // etiquetas INMEDIATAMENTE, igual que el grid: quitar search-abierto al
    // iniciar la transición. Antes se quitaba al terminar (en mostrarSeccion)
    // y las etiquetas (fixed bajo el header) quedaban visibles unos segundos,
    // bajándose y cortadas sobre la sección nueva.
    if (document.body.classList.contains('search-abierto') &&
        sectionSaliente && sectionSaliente.id === 'galeria-publica') {
        document.body.classList.remove('search-abierto', 'search-escribiendo');
        const tags = document.getElementById('tags-carrusel');
        if (tags) {
            tags.classList.add('hidden');
            tags.style.transform = ''; // limpiar un translateY residual del PTR
        }
    }

    isTransitioning = true;

    let safetyFired = false;
    const safetyTimeout = setTimeout(() => {
        safetyFired = true;
        isTransitioning = false;
        for (const id of SECCIONES) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('section-entering', 'section-exiting');
                el.classList.add('hidden');
            }
        }
        if (sectionEntrante && document.getElementById(sectionEntrante.id)) {
            sectionEntrante.classList.remove('hidden');
            actualizarVisibilidadIconosHeader(sectionEntrante);
            if (callback) callback();
        }
    }, 800);

    function finish() {
        if (safetyFired) return;
        clearTimeout(safetyTimeout);
        // isTransitioning se libera al terminar la animación de ENTRADA (en mostrarSeccion)
    }

    if (sectionSaliente) {
        sectionSaliente.classList.remove('section-entering');
        sectionSaliente.classList.add('section-exiting');
        sectionSaliente.addEventListener('animationend', function onExit(e) {
            // Solo la animación de salida (sectionExit) debe disparar el cambio:
            // un animationend de OTRA animación (p.ej. chatSlideUp al reabrir el
            // chat) no debe ocultar la sección entrante.
            if (e && e.animationName && e.animationName !== 'sectionExit') return;
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

// Iconos del header condicionales (mismo patrón):
//  - hamburguesa (#btn-configuracion): solo en perfil / Mi Cuenta
//  - crear "+" (#btn-crear-cavent): solo en la galería (Cavents)
// Aparecen con un pop elástico y se ocultan con un desvanecido (se añade
// .ocultando y se retrasa el display:none hasta terminar la animación).
// IMPORTANTE: al pasar de una sección con icono a otra con icono distinto
// (p.ej. perfil → Cavents) los efectos se SECUENCIAN: el icono nuevo espera
// a que el que se oculta termine, para que no choquen en el mismo espacio
// del header ni la campana haga un doble salto.
function visibilidadIconoHeader(btn, mostrar) {
    if (!btn) return;
    if (mostrar) {
        // Si el OTRO icono se está ocultando, diferir la aparición ~300ms
        const ocultandose = document.querySelector('#btn-configuracion.ocultando, #btn-crear-cavent.ocultando, #btn-problogs.ocultando, #btn-conversaciones.ocultando, #btn-lupa-explorar.ocultando, #btn-notificaciones.ocultando');
        if (ocultandose && ocultandose !== btn) {
            clearTimeout(btn._mostrarTimer);
            btn._mostrarTimer = setTimeout(() => {
                sincronizarIconosDerecha();
                btn.classList.remove('ocultando', 'hidden');
            }, 300);
            return;
        }
        clearTimeout(btn._mostrarTimer);
        clearTimeout(btn._ocultarTimer);
        btn.classList.remove('ocultando', 'hidden');
    } else {
        clearTimeout(btn._mostrarTimer); // cancelar una aparición pendiente
        if (btn.classList.contains('hidden') || btn.classList.contains('ocultando')) return;
        btn.classList.add('ocultando');
        btn._ocultarTimer = setTimeout(() => {
            btn.classList.remove('ocultando');
            btn.classList.add('hidden');
            sincronizarIconosDerecha();
        }, 280); // 0.26s de animación + margen
    }
}

// Calcula cuánto se desplaza la campana: iconos condicionales visibles
// (problogs, "+", hamburguesa) × (ancho del icono + gap del header).
function sincronizarIconosDerecha() {
    const header = document.getElementById('main-header');
    if (!header) return;
    const gap = parseFloat(getComputedStyle(header).gap) || 8;
    const count = ['btn-conversaciones', 'btn-problogs', 'btn-crear-cavent', 'btn-configuracion', 'btn-lupa-explorar']
        .filter(id => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden'); // visibles o en .ocultando
        }).length;
    header.style.setProperty('--iconos-derecha', (count * (40 + gap)) + 'px');
}

// El icono se convierte en flecha de volver cuando su sub-sección está activa
function actualizarModoFlecha(btn, esFlecha, labelNormal, labelFlecha) {
    if (!btn) return;
    btn.classList.toggle('modo-flecha', !!esFlecha);
    btn.setAttribute('aria-label', esFlecha ? labelFlecha : labelNormal);
}

function actualizarVisibilidadIconosHeader(section) {
    const ham = document.getElementById('btn-configuracion');
    const plus = document.getElementById('btn-crear-cavent');
    const problogs = document.getElementById('btn-problogs');
    const conversaciones = document.getElementById('btn-conversaciones');
    const lupaExplorar = document.getElementById('btn-lupa-explorar');
    const mostrarHam = !!section && (section.id === 'perfil-usuario' || section.id === 'mi-cuenta');
    // Icono de conversaciones: solo en la sección Chat (abre la lista de chats privados)
    const mostrarConversaciones = !!section && section.id === 'chat-global';
    // Lupa de Explorar: solo en el grid (galeriaModo === 2), abre el buscador
    const mostrarLupa = !!section && section.id === 'galeria-publica' && galeriaModo === 2;
    // El "+" en el carrusel de Cavents, el panel Crear y Problogs
    const enCarrusel = !!section && section.id === 'galeria-publica' && galeriaModo === 1;
    const enPanelCrear = !!section && section.id === 'panel-artista';
    const enProblogs = !!section && section.id === 'problogs';
    const mostrarPlus = enCarrusel || enPanelCrear || enProblogs;
    // El icono Problogs/Cavents solo en el carrusel (Cavents) y en Problogs
    const mostrarProblogs = enCarrusel || enProblogs;
    // Modo flecha: en Mi Cuenta (hamburguesa) y en el panel Crear (+)
    actualizarModoFlecha(ham, !!section && section.id === 'mi-cuenta', 'Menú', 'Volver');
    actualizarModoFlecha(plus, !!section && section.id === 'panel-artista', 'Crear Cavent', 'Volver');
    // El icono Problogs/Cavents muestra el icono de la sección activa
    if (problogs) {
        problogs.classList.toggle('modo-problogs', !!enProblogs);
        problogs.setAttribute('aria-label', enProblogs ? 'Problogs' : 'Cavents');
    }
    // Al salir de Explorar se cierra el buscador y se quitan sus clases:
    // - al cambiar a OTRA sección, o
    // - al pasar del grid (Explorar) al carrusel de Cavents (galeriaModo 1),
    //   para que las etiquetas NO aparezcan en Cavents.
    const esExplorar = !!section && section.id === 'galeria-publica' && galeriaModo === 2;
    if (!esExplorar) {
        document.body.classList.remove('search-abierto', 'search-escribiendo');
        const panelBusqueda = document.getElementById('search-panel');
        if (panelBusqueda) {
            panelBusqueda.classList.add('hidden');
            panelBusqueda.classList.remove('modo-busqueda');
        }
    }
    // La campana de notificaciones se oculta en Explorar (solo queda la lupa)
    const notif = document.getElementById('btn-notificaciones');
    // Pasada 1: ocultar lo que deba ocultarse (marca .ocultando)
    if (!mostrarHam) visibilidadIconoHeader(ham, false);
    if (!mostrarPlus) visibilidadIconoHeader(plus, false);
    if (!mostrarProblogs) visibilidadIconoHeader(problogs, false);
    if (!mostrarConversaciones) visibilidadIconoHeader(conversaciones, false);
    if (!mostrarLupa) visibilidadIconoHeader(lupaExplorar, false);
    if (esExplorar) visibilidadIconoHeader(notif, false);
    // Pasada 2: mostrar (ya con los ocultados marcados → se secuencian)
    if (mostrarHam) visibilidadIconoHeader(ham, true);
    if (mostrarPlus) visibilidadIconoHeader(plus, true);
    if (mostrarProblogs) visibilidadIconoHeader(problogs, true);
    if (mostrarConversaciones) visibilidadIconoHeader(conversaciones, true);
    if (mostrarLupa) visibilidadIconoHeader(lupaExplorar, true);
    if (!esExplorar) visibilidadIconoHeader(notif, true);
    sincronizarIconosDerecha();
}
// Exportado para chat.js (abre/cierra su sección sin pasar por mostrarSeccion)
export { actualizarVisibilidadIconosHeader, actualizarModoFlecha };

// ============================================
// FLECHA DE VOLVER: al activar un icono del header
// (hamburguesa → Mi Cuenta, "+" → Crear) se recuerda la
// sección anterior para que la flecha regrese a ella.
// ============================================
let iconoAnterior = null; // { seccion, modoGrid }

export function abrirMiCuentaDesdeIcono() {
    iconoAnterior = { seccion: 'perfil-usuario' };
    toggleMiCuenta();
}

export function abrirCrearDesdeIcono() {
    const actual = encontrarSeccionActual();
    iconoAnterior = { seccion: actual ? actual.id : 'galeria-publica', modoGrid: galeriaModo === 2 };
    togglePanel('crear');
}

export function volverDesdeIcono() {
    const prev = iconoAnterior;
    iconoAnterior = null;
    if (!prev) return;
    if (prev.seccion === 'perfil-usuario') {
        togglePerfil();
    } else if (prev.seccion === 'galeria-publica') {
        if (prev.modoGrid) toggleExplorar();
        else toggleGaleria(obtenerGaleriaContainer());
    } else if (prev.seccion === 'problogs') {
        toggleProblogs();
    }
}

function mostrarSeccion(section, callback) {
    if (!section) return;
    section.classList.remove('hidden', 'section-exiting');
    actualizarVisibilidadIconosHeader(section);
    actualizarEstadoNavButtons();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            section.classList.add('section-entering');
            section.addEventListener('animationend', function onEnter() {
                section.removeEventListener('animationend', onEnter);
                section.classList.remove('section-entering');
                isTransitioning = false;
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
    actualizarVisibilidadIconosHeader(null);
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
            // El modo grid (Explorar) ya no se vincula al botón cavents:
            // explorar sale de la lupa, así que no se marca en amarillo.
            const enGrid = galeriaModo === 2 && galeriaContainer && galeriaContainer.classList.contains('modo-grid');
            if (!enGrid) {
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
        ptrReparent(galeriaContainerLocal); // a carrusel: el indicador vuelve al contenedor
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
    actualizarVisibilidadIconosHeader(encontrarSeccionActual()); // vuelve el "+"
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
        ptrReparent(galeriaContainerLocal); // a carrusel: indicador en el contenedor
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
        actualizarVisibilidadIconosHeader(encontrarSeccionActual()); // vuelve el "+"
        salirDeModoGrid(() => {
            if (galeriaContainerLocal) {
                galeriaContainerLocal.querySelectorAll('.obra-card').forEach((c) => {
                    c.classList.add('modo-flex-enter');
                });
            }
            actualizarEstadoNavButtons();
        });
    } else {
        // Ya visible en carrusel: REFRESCAR el contenido (mismo patrón que la
        // lupa), nunca ocultar la sección al re-presionar el icono.
        await triggerRefreshGrid();
    }
}

// Activa el modo explorar (galería en grid). A diferencia de toggleExplorar,
// NO alterna: si la galería ya está en grid, no hace nada.
async function activarExplorar() {
    if (isTransitioning || gridEntering || gridExiting || !(await confirmarDescartarCambios())) return false;

    const galeria = document.getElementById('galeria-publica');
    const galeriaContainerLocal = obtenerGaleriaContainer();
    if (!galeria) return false;

    if (galeria.classList.contains('hidden')) {
        // Mostrar galería directamente en modo grid
        galeriaModo = 2;
        document.body.classList.add('search-abierto'); // Explorar: etiquetas + grid (sin buscador)
        gridEntering = true;
        if (galeriaContainerLocal) {
            galeriaContainerLocal.innerHTML = '';
            galeriaContainerLocal.classList.add('modo-grid');
            setupPullToRefresh(galeriaContainerLocal);
        }
        ptrReparent(galeriaContainerLocal); // a Explorar: indicador en la sección (encima de etiquetas)
        const btnPerfilSidebar = document.getElementById('btn-perfil-sidebar');
        if (btnPerfilSidebar) btnPerfilSidebar.setAttribute('aria-expanded', 'false');

        // Devolvemos una Promise que resuelve cuando el grid está listo,
        // para que el buscador y el grid aparezcan sincronizados.
        return new Promise((resolve) => {
            switchSection(encontrarSeccionActual(), galeria, () => {
                cargarGaleria(galeriaContainerLocal).then(obras => {
                    mostrarGaleria(obras, galeriaContainerLocal, (id) => {
                        seleccionarObraDesdeGrid(id);
                    }, (artistaId) => {
                        verPerfilArtistaDesdeGaleria(artistaId);
                    });
                    actualizarEstadoNavButtons();
                    ensurePTRInContainer(galeriaContainerLocal);
                    gridEntering = false;
                    renderEtiquetasCarrusel();
                    resolve(true);
                });
            });
        });
    } else if (galeriaModo === 1) {
        // Cambiar de modo normal a grid
        galeriaModo = 2;
        document.body.classList.add('search-abierto'); // Explorar: etiquetas + grid (sin buscador)
        actualizarVisibilidadIconosHeader(encontrarSeccionActual()); // se oculta el "+" y se muestra la lupa
        gridEntering = true;
        if (galeriaContainerLocal) {
            galeriaContainerLocal.classList.add('modo-grid');
            setupPullToRefresh(galeriaContainerLocal);
            ptrReparent(galeriaContainerLocal); // a Explorar: indicador en la sección
        }
        actualizarEstadoNavButtons();
        // Las etiquetas dependen de las obras YA cargadas (obrasGrid) y de que
        // search-abierto esté activo: renderizarlas SIEMPRE al entrar en
        // Explorar, también desde el carrusel (antes solo se hacía al mostrar
        // la galería desde otra sección y a veces quedaban ocultas).
        resetEtiquetas();
        renderEtiquetasCarrusel();
        // Esperar al siguiente frame para que el CSS de la transición se aplique
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { gridEntering = false; });
        });
        // Safety: si los RAF nunca se ejecutan (tab en background, etc.), liberar igual
        setTimeout(() => { gridEntering = false; }, 600);
    }
    return true;
}

// "Explorar" desde la lupa: muestra la galería en grid sin alternar.
// Devuelve la promesa de activarExplorar para sincronizar con el buscador.
export function mostrarExplorar() {
    return activarExplorar();
}

export async function toggleExplorar() {
    if (isTransitioning || gridEntering || gridExiting || !(await confirmarDescartarCambios())) return;

    const galeria = document.getElementById('galeria-publica');
    const galeriaContainerLocal = obtenerGaleriaContainer();
    if (!galeria) return;

    if (galeria.classList.contains('hidden') || galeriaModo === 1) {
        activarExplorar();
    } else {
        // Salir del modo grid (volver a normal o cerrar)
        galeriaModo = 0;
        salirDeModoGrid(() => switchSection(galeria, document.getElementById('pagina-blanca')));
    }
}

// ============================================
// PROBLOGS: toggle entre Problogs y Cavents.
// Al presionar el icono se abre Problogs (contenido por
// implementar); al presionarlo de nuevo se vuelve a Cavents.
// ============================================
export function toggleProblogs() {
    if (isTransitioning || gridEntering || gridExiting) return;

    const problogs = document.getElementById('problogs');
    if (!problogs) return;

    if (problogs.classList.contains('hidden')) {
        switchSection(encontrarSeccionActual(), problogs);
    } else {
        // Volver a Cavents (galería en carrusel)
        toggleGaleria(obtenerGaleriaContainer());
    }
}

// ============================================================
// ============================================================
// PULL-TO-REFRESH (MODO EXPLORAR / GRID)
// Círculo de refresco profesional: anillo SVG que se llena con
// el arrastre, gira como spinner mientras carga y hace un pop
// de confirmación al terminar. Comparte lógica táctil y ratón.
// ============================================================
let ptrIndicator = null;
let ptrStartY = 0;
let ptrPulling = false;
let ptrRefreshing = false;
let ptrPullDist = 0;
let ptrMaxPull = 0;
const PTR_THRESHOLD = 70;
const PTR_CIRC = 97.39; // 2π·15.5 — circunferencia del anillo SVG
let ptrCooldown = 0; // timestamp post-refresh para evitar doble disparo
let ptrDidDrag = false; // solo true si hubo arrastre real (dist > 5)
let ptrDoneTimer = null; // timer de la animación de confirmación
let ptrHideTimer = null; // timer del desvanecido al cancelar
let ptrTouchRaf = null; // rAF del gesto táctil
let ptrMouseRaf = null; // rAF del gesto con ratón
let ptrAssertRaf = null; // bucle que fija el grid arriba durante la carga

// Bloquea/restaura el scroll del grid durante el gesto PTR y la carga.
// Al bloquear overflow el navegador no inicia scroll nativo ni rubber-band
// (que dejaba un scroll residual ~30px al soltar, superponiendo el círculo
// a la primera fila). Se restaura al terminar.
function ptrBloquearScroll(container, bloquear) {
    if (bloquear) {
        container.style.overflow = 'hidden';
    } else {
        container.style.overflow = '';
    }
}

// Reafirma scrollTop = 0 cada frame mientras la carga está activa: el
// compositor puede conservar un scroll residual del gesto aunque overflow
// esté oculto; el main thread gana por frame y el grid queda fijo arriba.
function ptrAfirmarArriba(container) {
    if (ptrAssertRaf) cancelAnimationFrame(ptrAssertRaf);
    const loop = () => {
        if (!ptrRefreshing) return;
        if (container.scrollTop !== 0) container.scrollTop = 0;
        ptrAssertRaf = requestAnimationFrame(loop);
    };
    ptrAssertRaf = requestAnimationFrame(loop);
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---- Ayudantes del indicador ---------------------------------

// Progreso del arco (0..1). Se aplica directo al stroke-dashoffset
// para máxima compatibilidad (sin calc() ni gradientes por frame).
function setPtrProgress(progress) {
    if (!ptrIndicator) return;
    const arc = ptrIndicator.querySelector('.ptr-arc');
    if (!arc) return;
    const p = Math.min(Math.max(progress, 0), 1);
    arc.style.strokeDashoffset = String(PTR_CIRC * (1 - p));
}

// Fija el estado visual del indicador (visible/pulling/ready/loading/done/hiding)
function setPtrState(...classes) {
    if (!ptrIndicator) return;
    ptrIndicator.classList.remove('visible', 'pulling', 'ready', 'loading', 'done', 'hiding');
    if (classes.length) ptrIndicator.classList.add(...classes);
}

// Muestra el indicador al empezar el arrastre (con pop elástico)
function mostrarPtrPulling() {
    clearTimeout(ptrHideTimer);
    clearTimeout(ptrDoneTimer); // cancelar el desvanecido de confirmación pendiente
    if (ptrIndicator && !ptrIndicator.classList.contains('visible')) {
        setPtrState('visible', 'pulling');
        setPtrProgress(0);
    }
}

// Oculta el indicador con desvanecido (JS lo retira tras la transición)
function ocultarPtr(ms = 220) {
    if (!ptrIndicator || !ptrIndicator.classList.contains('visible')) return;
    ptrIndicator.classList.add('hiding');
    clearTimeout(ptrHideTimer);
    ptrHideTimer = setTimeout(() => {
        if (!ptrPulling && !ptrRefreshing) setPtrState();
    }, ms);
}

// Ejecuta el refresh del grid: recarga, reordena, re-renderiza y
// finaliza con la animación de confirmación. Reutilizable por el
// gesto PTR y por triggerRefreshGrid().
async function ejecutarRefreshGrid(container) {
    ptrRefreshing = true;
    setPtrState('visible', 'loading');
    setPtrProgress(0.75); // arco de 270° girando durante la carga
    ptrBloquearScroll(container, true); // sin scroll nativo ni rubber-band durante la carga
    ptrAfirmarArriba(container); // el grid queda fijo arriba mientras carga
    // En Explorar, el círculo queda ENCIMA de las etiquetas: etiquetas Y grid
    // se asientan juntos en 56px durante la carga (aunque el arrastre haya
    // llegado más lejos) y vuelven juntos en finalizarRefresh — como uno solo,
    // bajando suavemente, sin chocar entre sí. El refresco desde la lupa del
    // nav hace lo mismo.
    if (document.body.classList.contains('search-abierto')) {
        const tags = document.getElementById('tags-carrusel');
        if (tags) ptrSyncTags(56, true);
        if (container.style.paddingTop !== '56px') {
            container.style.transition = 'padding-top 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
            container.style.paddingTop = '56px';
        }
    }
    try {
        const obras = await cargarGaleria(container);
        const shuffled = shuffleArray(obras);
        mostrarGaleria(shuffled, container, (id) => {
            seleccionarObraDesdeGrid(id);
        }, (artistaId) => {
            verPerfilArtistaDesdeGaleria(artistaId);
        });
        ensurePTRInContainer(container);
        resetEtiquetas();
        renderEtiquetasCarrusel();
    } catch (err) {
        console.warn('Pull-to-refresh falló:', err);
    }
    ptrRefreshing = false;
    finalizarRefresh(container);
}

// Confirmación: anillo completo con pop y desvanecido, grid asentado
function finalizarRefresh(container) {
    container.style.transition = 'padding-top 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
    container.style.paddingTop = ''; // restaura el padding CSS (0 en flex, 6px en grid)
    container.style.userSelect = '';
    ptrResetTags(true); // las etiquetas vuelven a su sitio con la misma transición
    if (ptrAssertRaf) { cancelAnimationFrame(ptrAssertRaf); ptrAssertRaf = null; }
    ptrBloquearScroll(container, false); // el grid vuelve a ser scrolleable
    container.scrollTop = 0; // el grid siempre queda arriba tras refrescar
    setPtrState('done');
    setPtrProgress(1);
    clearTimeout(ptrDoneTimer);
    ptrDoneTimer = setTimeout(() => {
        if (!ptrPulling && !ptrRefreshing) {
            // Restaurar el scroll-snap y la transición CSS del grid (opacity
            // del filtrado por etiquetas) solo al ocultar el indicador: si se
            // restaurara antes, el snap (carrusel) anclaría a la posición de
            // la primera tarjeta desplazada por el indicador visible.
            container.style.scrollSnapType = '';
            container.style.transition = '';
            setPtrState();
        }
    }, 600);
    ptrCooldown = Date.now() + 400;
}

// Arrastre que superó el umbral: el grid vuelve a su posición normal y el
// círculo queda arriba — en el sitio del que salió — girando sin hueco encima.
// En Explorar, etiquetas Y grid se mantienen abajo (56px) mientras carga,
// para que el círculo (fijo arriba) no choque con ellas.
// El scroll-snap (carrusel) se mantiene desactivado durante la carga y se
// restaura en finalizarRefresh al ocultar el indicador.
async function dispararRefresh(container) {
    const enExplorar = document.body.classList.contains('search-abierto');
    container.style.transition = 'padding-top 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
    container.style.paddingTop = enExplorar ? '56px' : '';
    container.style.userSelect = '';
    setPtrProgress(1); // anillo completo antes de entrar en carga
    await ejecutarRefreshGrid(container);
}

// Arrastre que no superó el umbral (o cancelado): volver suave
function revertirPtr(container) {
    container.style.transition = 'padding-top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1.2)';
    container.style.paddingTop = '';
    container.style.scrollSnapType = '';
    container.style.userSelect = '';
    ptrResetTags(true); // las etiquetas vuelven a su sitio con transición suave
    ptrBloquearScroll(container, false);
    ocultarPtr(220);
    clearTimeout(container._ptrTransReset);
    container._ptrTransReset = setTimeout(() => { container.style.transition = ''; }, 400);
    ptrPullDist = 0;
    ptrMaxPull = 0;
}

// Cancelación del gesto (touchcancel/pointercancel/blur): restaura todo
function cancelarPtr(container) {
    if (ptrTouchRaf) { cancelAnimationFrame(ptrTouchRaf); ptrTouchRaf = null; }
    if (ptrMouseRaf) { cancelAnimationFrame(ptrMouseRaf); ptrMouseRaf = null; }
    if (!ptrPulling || ptrRefreshing) return;
    ptrPulling = false;
    ptrDidDrag = false;
    container.style.transition = 'padding-top 0.3s ease';
    container.style.paddingTop = '';
    container.style.scrollSnapType = '';
    container.style.userSelect = '';
    ptrResetTags(true);
    ptrBloquearScroll(container, false);
    ocultarPtr(220);
    clearTimeout(container._ptrTransReset);
    container._ptrTransReset = setTimeout(() => { container.style.transition = ''; }, 400);
    ptrPullDist = 0;
    ptrMaxPull = 0;
}

// Refresca el grid programáticamente (al pulsar la lupa con el buscador abierto)
export async function triggerRefreshGrid() {
    const container = obtenerGaleriaContainer();
    if (!container || ptrRefreshing) return;
    createPTRIndicator(container);
    container.style.transition = 'none';
    container.style.paddingTop = '';
    container.style.scrollSnapType = 'none';
    await ejecutarRefreshGrid(container); // bloquea scroll durante la carga y lo restaura
}

// El indicador vive donde corresponde según el modo:
// - Explorar (grid): en la SECCIÓN (#galeria-publica), fijo bajo el header,
//   POR ENCIMA de las etiquetas (CSS: #galeria-publica > .pull-refresh-indicator).
// - Carrusel: DENTRO del contenedor (sticky en su top), ocupando su espacio
//   para NO superponerse al cavent de abajo.
function ptrReparent(container) {
    if (!ptrIndicator) return;
    const enGrid = container.classList.contains('modo-grid');
    const seccion = document.getElementById('galeria-publica');
    const destino = enGrid ? seccion : container;
    if (ptrIndicator.parentNode !== destino) {
        destino.insertBefore(ptrIndicator, destino.firstChild);
    }
}

function createPTRIndicator(container) {
    if (ptrIndicator) {
        // Re-insertar si fue destruido por innerHTML (carrusel)
        if (!ptrIndicator.parentNode) ptrReparent(container);
        else ptrReparent(container); // asegurar el padre según el modo
        return;
    }
    ptrIndicator = document.createElement('div');
    ptrIndicator.className = 'pull-refresh-indicator';
    ptrIndicator.innerHTML =
        '<div class="ptr-circle">' +
            '<svg class="ptr-svg" viewBox="0 0 36 36" aria-hidden="true" focusable="false">' +
                '<circle class="ptr-track" cx="18" cy="18" r="15.5"></circle>' +
                '<circle class="ptr-arc" cx="18" cy="18" r="15.5"></circle>' +
            '</svg>' +
        '</div>';
    ptrReparent(container);
}

// Durante el arrastre PTR, las etiquetas de Explorar se deslizan hacia abajo
// junto al grid (mismo desplazamiento) para que el círculo quede encima.
// Con suave=true se anima el cambio (asentarse en 56px o volver al reposo).
function ptrSyncTags(px, suave) {
    const tags = document.getElementById('tags-carrusel');
    if (!tags) return;
    if (suave) {
        tags.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
        clearTimeout(tags._ptrTransTimer);
        tags._ptrTransTimer = setTimeout(() => { tags.style.transition = ''; }, 400);
    }
    tags.style.transform = 'translateY(' + px + 'px)';
}

// Restaura la posición de las etiquetas (opcional: con transición suave)
function ptrResetTags(suave) {
    const tags = document.getElementById('tags-carrusel');
    if (!tags || !tags.style.transform) return;
    if (suave) {
        tags.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        clearTimeout(tags._ptrTransTimer);
        tags._ptrTransTimer = setTimeout(() => { tags.style.transition = ''; }, 400);
    }
    tags.style.transform = '';
}

function ensurePTRInContainer(container) {
    if (ptrIndicator) ptrReparent(container);
}

export function setupPullToRefresh(container) {
    if (!container) return;
    // El indicador se recrea siempre (innerHTML lo destruye) y se ubica
    // según el modo (grid → sección, carrusel → contenedor)
    createPTRIndicator(container);
    ptrReparent(container);

    // Setup idempotente: limpiar listeners previos y volver a añadir
    if (container._ptrCleanup) container._ptrCleanup();

    // ---- Gestos compartidos (táctil y ratón) -------------------

    function onTouchStart(e) {
        if (ptrRefreshing) return;
        // Cooldown post-refresh: ignorar toques brevemente
        if (Date.now() < ptrCooldown) return;
        clearTimeout(ptrDoneTimer); // interrumpir la confirmación si se vuelve a tirar
        // Forzar scrollTop a 0 si está cerca (scroll-snap a veces lo deja en 1-5px)
        if (container.scrollTop > 0 && container.scrollTop <= 10) {
            container.scrollTop = 0;
        }
        if (container.scrollTop <= 0) {
            ptrStartY = e.touches[0].clientY;
            ptrPulling = true;
            ptrMaxPull = 0;
            ptrDidDrag = false;
            container.style.transition = 'none';
            container.style.paddingTop = '';
            container.style.scrollSnapType = 'none';
            container.style.userSelect = 'none';
            ptrBloquearScroll(container, true); // el gesto no debe iniciar scroll nativo
            setPtrProgress(0);
        } else {
            ptrPulling = false;
        }
    }

    function onTouchMove(e) {
        if (!ptrPulling || ptrRefreshing) return;
        const dist = e.touches[0].clientY - ptrStartY;
        ptrPullDist = dist;
        if (dist > ptrMaxPull) ptrMaxPull = dist;

        if (dist > 5 && container.scrollTop <= 0) {
            ptrDidDrag = true;
            e.preventDefault();
            if (ptrTouchRaf) cancelAnimationFrame(ptrTouchRaf);
            ptrTouchRaf = requestAnimationFrame(() => {
                const damped = Math.min(dist * 0.45, 90);
                container.style.paddingTop = damped + 'px';
                ptrSyncTags(damped); // las etiquetas bajan junto al grid
                mostrarPtrPulling();
                const progress = Math.min(dist / PTR_THRESHOLD, 1);
                setPtrProgress(progress);
                ptrIndicator.classList.toggle('ready', progress >= 1);
            });
        }
    }

    async function onTouchEnd() {
        if (ptrTouchRaf) { cancelAnimationFrame(ptrTouchRaf); ptrTouchRaf = null; }
        if (!ptrPulling || ptrRefreshing) { ptrPulling = false; return; }
        ptrPulling = false;
        if (ptrIndicator) ptrIndicator.classList.remove('pulling'); // activa transiciones del arco

        if (ptrDidDrag && ptrMaxPull >= PTR_THRESHOLD && container.scrollTop <= 0) {
            await dispararRefresh(container);
        } else {
            revertirPtr(container);
        }
        ptrPullDist = 0;
        ptrMaxPull = 0;
    }

    function onMouseDown(e) {
        if (ptrRefreshing) return;
        // Cooldown post-refresh: ignorar interacciones brevemente
        if (Date.now() < ptrCooldown) return;
        clearTimeout(ptrDoneTimer); // interrumpir la confirmación si se vuelve a tirar
        if (container.scrollTop <= 0) {
            ptrStartY = e.clientY;
            ptrPulling = true;
            ptrMaxPull = 0;
            ptrDidDrag = false;
            container.style.transition = 'none';
            container.style.paddingTop = '';
            container.style.scrollSnapType = 'none';
            container.style.userSelect = 'none';
            ptrBloquearScroll(container, true); // el gesto no debe iniciar scroll nativo
            setPtrProgress(0);
        } else {
            ptrPulling = false;
        }
    }

    function onMouseMove(e) {
        if (!ptrPulling || ptrRefreshing) return;
        const dist = e.clientY - ptrStartY;
        ptrPullDist = dist;
        if (dist > ptrMaxPull) ptrMaxPull = dist;

        if (dist > 5 && container.scrollTop <= 0) {
            ptrDidDrag = true;
            e.preventDefault();
            if (ptrMouseRaf) cancelAnimationFrame(ptrMouseRaf);
            ptrMouseRaf = requestAnimationFrame(() => {
                const damped = Math.min(dist * 0.45, 90);
                container.style.paddingTop = damped + 'px';
                ptrSyncTags(damped); // las etiquetas bajan junto al grid
                mostrarPtrPulling();
                const progress = Math.min(dist / PTR_THRESHOLD, 1);
                setPtrProgress(progress);
                ptrIndicator.classList.toggle('ready', progress >= 1);
            });
        }
    }

    async function onMouseUp() {
        if (ptrMouseRaf) { cancelAnimationFrame(ptrMouseRaf); ptrMouseRaf = null; }
        if (!ptrPulling || ptrRefreshing) { ptrPulling = false; return; }
        ptrPulling = false;
        if (ptrIndicator) ptrIndicator.classList.remove('pulling');

        if (ptrDidDrag && ptrMaxPull >= PTR_THRESHOLD && container.scrollTop <= 0) {
            await dispararRefresh(container);
        } else {
            revertirPtr(container);
        }
        ptrPullDist = 0;
        ptrMaxPull = 0;
    }

    // ---- Registro de listeners + cleanup idempotente ------------

    const onTouchCancel = () => cancelarPtr(container);
    const onPointerCancel = () => cancelarPtr(container);
    const onMouseLeave = () => cancelarPtr(container);
    const onWindowBlur = () => cancelarPtr(container);

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchCancel);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseLeave);
    // Si la ventana pierde el foco a mitad de un arrastre, cancelar
    window.addEventListener('blur', onWindowBlur);

    container._ptrCleanup = () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchCancel);
        container.removeEventListener('pointercancel', onPointerCancel);
        container.removeEventListener('mousedown', onMouseDown);
        container.removeEventListener('mousemove', onMouseMove);
        container.removeEventListener('mouseup', onMouseUp);
        container.removeEventListener('mouseleave', onMouseLeave);
        window.removeEventListener('blur', onWindowBlur);
    };
}


export function togglePanel(view) {
    if (isTransitioning) return;

    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    if (!panel || !paginaBlanca) return;

    resetGaleriaModo();

    // Si se especifica vista, siempre mostrar (no toggle)
    if (view) {
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
                showPanelSubView(view);
            });
        } else {
            showPanelSubView(view);
        }
        return;
    }

    // Comportamiento toggle original
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
            showPanelSubView('crear');
        });
    } else {
        switchSection(panel, paginaBlanca);
    }
}

// Panel sub-navegación: nav ↔ crear ↔ mis-cavents
export function showPanelSubView(view) {
    const panelCrear = document.getElementById('panel-crear');
    const panelNav = document.getElementById('panel-nav');

    if (view === 'crear') {
        if (panelCrear) panelCrear.classList.remove('hidden');
        if (panelNav) panelNav.classList.add('hidden');
    } else {
        // 'nav' o cualquier otra cosa
        if (panelCrear) panelCrear.classList.add('hidden');
        if (panelNav) panelNav.classList.remove('hidden');
    }
}

export function setupPanelNav() {
    // Botones principales
    document.querySelectorAll('.panel-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            showPanelSubView(target);
        });
    });

    // Botones volver
    document.querySelectorAll('.panel-back-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showPanelSubView('nav');
        });
    });
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
        // Ya visible el perfil propio: REFRESCAR los datos (mismo patrón que la
        // lupa), nunca ocultar la sección al re-presionar el icono.
        actualizarPerfilUI();
        if (window.actualizarEstadisticas) window.actualizarEstadisticas();
    }
}
