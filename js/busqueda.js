// js/busqueda.js
// Búsqueda de artistas en una sección (panel) que se abre desde el icono de la
// lupa del header. Resultados en tiempo real con debounce.

import { apiRequest } from './config.js?v=3cac708192';
import { debounce, escapeHtml, debugLog, safeImgUrl } from './utils.js?v=f1ecb334f1';
import { showWarning, showError } from './notificaciones.js?v=53cd86fdba';
import { triggerRefreshGrid } from './galeria-ui.js?v=57fd905bf7';

/**
 * Configura el buscador de artistas.
 * @param {Function} verPerfilUsuarioFn - función para navegar al perfil del usuario
 * @param {Function} mostrarResultadosBusquedaFn - función para mostrar resultados full
 * @param {Function} abrirExplorarFn - función para mostrar la sección Explorar junto al buscador
 */
export function setupBuscador(verPerfilUsuarioFn, mostrarResultadosBusquedaFn, abrirExplorarFn) {
    const lupaBtn = document.getElementById('btn-buscar');
    const panel = document.getElementById('search-panel');
    const cerrarBtn = document.getElementById('search-close');
    const searchInput = document.getElementById('search-input');
    const resultados = document.getElementById('search-results-dropdown');

    if (!searchInput || !resultados) {
        debugLog.warn('Buscador: elementos no encontrados');
        return;
    }

    // Cerrar la sección por completo (toque fuera, resultado, lupa de nuevo)
    const cerrarPanel = () => {
        if (panel) panel.classList.add('hidden');
        if (panel) panel.classList.remove('modo-busqueda');
        document.body.classList.remove('search-abierto');
        document.body.classList.remove('search-escribiendo');
        searchInput.value = '';
        if (actualizarBordeNeon) actualizarBordeNeon();
        resultados.innerHTML = '';
    };

    // Abrir la sección desde la lupa (estado A): sin flecha <, grid visible.
    // Si el buscador YA está abierto, la lupa activa el círculo de refresco
    // del grid (pull-to-refresh) en lugar de cerrar.
    const abrirPanel = async () => {
        if (panel && !panel.classList.contains('hidden')) {
            try { await triggerRefreshGrid(); } catch (e) { debugLog.warn('Refresh desde lupa:', e); }
            return;
        }
        // Buscador y grid sincronizados: se prepara el grid y cuando está
        // listo aparecen ambos juntos (sin 'primero uno y luego el otro').
        let ok = true;
        if (abrirExplorarFn) ok = await abrirExplorarFn();
        if (ok === false) return; // (p.ej. confirmarDescartarCambios canceló)
        if (panel) panel.classList.remove('hidden');
        document.body.classList.add('search-abierto');
        if (panel) panel.classList.remove('modo-busqueda');
        document.body.classList.remove('search-escribiendo');
        // Sin autofocus: el teclado NO se despliega automáticamente al abrir
    };
    if (lupaBtn) lupaBtn.addEventListener('click', abrirPanel);

    // Al tocar el input se entra al "modo búsqueda" (estado B):
    // el grid queda semitransparente, aparecen los resultados
    // y se muestra la flecha < para volver al grid.
    let timeoutResultados = null;
    const entrarModoBusqueda = () => {
        if (panel) panel.classList.add('modo-busqueda');
        document.body.classList.add('search-escribiendo');
        // Si se vuelve a entrar antes de que termine el fade-out, cancelarlo
        clearTimeout(timeoutResultados);
        resultados.classList.remove('resultados-saliendo');
    };
    searchInput.addEventListener('focus', entrarModoBusqueda);

    // La flecha < vuelve al grid (NO cierra la sección): salida suave
    const volverAlGrid = () => {
        if (panel) panel.classList.remove('modo-busqueda');
        document.body.classList.remove('search-escribiendo');
        resultados.classList.add('resultados-saliendo');   // fade-out
        clearTimeout(timeoutResultados);
        timeoutResultados = setTimeout(() => {
            resultados.classList.remove('resultados-saliendo');
            resultados.innerHTML = '';
        }, 200);
    };
    if (cerrarBtn) cerrarBtn.addEventListener('click', volverAlGrid);

    // Auto-cerrar al tocar fuera del panel (otro botón del nav, una obra, etc.)
    // EXCEPCIÓN: los botones que cambian el modo claro/oscuro NO cierran el
    // buscador (el carrusel de etiquetas debe seguir visible al cambiar el tema).
    const botonesModo = ['btn-dark-mode', 'config-dark-mode', 'auth-dark-mode-btn'];
    document.addEventListener('click', (e) => {
        if (!panel || panel.classList.contains('hidden')) return;
        if (panel.contains(e.target)) return;
        if (lupaBtn && lupaBtn.contains(e.target)) return;
        for (const id of botonesModo) {
            const el = document.getElementById(id);
            if (el && el.contains(e.target)) return;
        }
        cerrarPanel();
    });

    // Renderizar resultados dentro del panel
    const renderizarResultados = (usuarios) => {
        resultados.innerHTML = '';
        if (!usuarios || usuarios.length === 0) {
            resultados.innerHTML = '<div class="search-no-results">No se encontraron artistas</div>';
            return;
        }
        usuarios.forEach(usuario => {
            const item = document.createElement('div');
            item.className = 'search-result-item';

            let avatarHTML = '';
            if (usuario.foto_perfil) {
                avatarHTML = `<img src="${safeImgUrl(usuario.foto_perfil)}" alt="${escapeHtml(usuario.nombre_artista)}" class="search-result-avatar">`;
            } else {
                const inicial = (usuario.nombre_artista || '?').charAt(0).toUpperCase();
                avatarHTML = `<div class="search-result-avatar-placeholder">${escapeHtml(inicial)}</div>`;
            }
            const nombreReal = usuario.nombre_real ? `<div class="search-result-real-name">${escapeHtml(usuario.nombre_real)}</div>` : '';

            item.innerHTML = `
                ${avatarHTML}
                <div class="search-result-info">
                    <div class="search-result-name">${escapeHtml(usuario.nombre_artista)}</div>
                    ${nombreReal}
                </div>
            `;
            item.addEventListener('click', () => {
                cerrarPanel();
                if (verPerfilUsuarioFn) verPerfilUsuarioFn(usuario.id);
            });
            resultados.appendChild(item);
        });
    };

    // Búsqueda en tiempo real
    const buscarUsuariosTiempoReal = async (query) => {
        if (query.length < 1) {
            resultados.innerHTML = '';
            return;
        }
        try {
            const data = await apiRequest(`/api/artistas/buscar?q=${encodeURIComponent(query)}`);
            renderizarResultados((data && data.success && Array.isArray(data.usuarios)) ? data.usuarios : []);
        } catch (error) {
            debugLog.error('Error en búsqueda en tiempo real:', error);
            resultados.innerHTML = '';
        }
    };

    const buscarConDebounce = debounce((query) => {
        buscarUsuariosTiempoReal(query);
    }, 400);

    searchInput.addEventListener('input', (e) => {
        buscarConDebounce(e.target.value.trim());
    });

    // Borde neon mientras haya texto escrito en el buscador
    const inputWrapper = searchInput.closest('.search-input-wrapper') || searchInput.parentElement;
    const actualizarBordeNeon = () => {
        if (inputWrapper) inputWrapper.classList.toggle('escribiendo', searchInput.value.trim().length > 0);
    };
    searchInput.addEventListener('input', actualizarBordeNeon);

    // Enter: abrir la sección de resultados completos
    searchInput.addEventListener('keypress', (e) => {
        if (e.key !== 'Enter') return;
        const query = searchInput.value.trim();
        if (query.length < 2) {
            showWarning('El término de búsqueda debe tener al menos 2 caracteres');
            return;
        }
        apiRequest(`/api/artistas/buscar?q=${encodeURIComponent(query)}`)
            .then(response => {
                if (response && response.success && Array.isArray(response.usuarios) && response.usuarios.length > 0) {
                    cerrarPanel();
                    if (mostrarResultadosBusquedaFn) mostrarResultadosBusquedaFn(response.usuarios);
                } else {
                    showWarning('No se encontraron usuarios con ese nombre');
                }
            })
            .catch(error => {
                debugLog.error('Error al buscar usuarios:', error);
                showError('Error al buscar usuarios. Por favor intenta nuevamente.');
            });
    });
}
