// js/busqueda.js
// Búsqueda de artistas en una sección (panel) que se abre desde el icono de la
// lupa del header. Resultados en tiempo real con debounce.

import { apiRequest } from './config.js';
import { debounce, escapeHtml, debugLog } from './utils.js';
import { showWarning, showError } from './notificaciones.js';

/**
 * Configura el buscador de artistas.
 * @param {Function} verPerfilUsuarioFn - función para navegar al perfil del usuario
 * @param {Function} mostrarResultadosBusquedaFn - función para mostrar resultados full
 */
export function setupBuscador(verPerfilUsuarioFn, mostrarResultadosBusquedaFn) {
    const lupaBtn = document.getElementById('btn-buscar');
    const panel = document.getElementById('search-panel');
    const cerrarBtn = document.getElementById('search-close');
    const searchInput = document.getElementById('search-input');
    const resultados = document.getElementById('search-results-dropdown');

    if (!searchInput || !resultados) {
        debugLog.warn('Buscador: elementos no encontrados');
        return;
    }

    // Abrir la sección de búsqueda al tocar la lupa
    const abrirPanel = () => {
        if (panel) panel.classList.remove('hidden');
        setTimeout(() => searchInput.focus(), 60);
    };
    if (lupaBtn) lupaBtn.addEventListener('click', abrirPanel);

    // Cerrar la sección (botón ←)
    const cerrarPanel = () => {
        if (panel) panel.classList.add('hidden');
        searchInput.value = '';
        resultados.innerHTML = '';
    };
    if (cerrarBtn) cerrarBtn.addEventListener('click', cerrarPanel);

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
                avatarHTML = `<img src="${usuario.foto_perfil.replace(/"/g, '&quot;')}" alt="${escapeHtml(usuario.nombre_artista)}" class="search-result-avatar">`;
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
