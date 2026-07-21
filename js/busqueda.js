// js/busqueda.js
// Búsqueda de usuarios en tiempo real con dropdown y debounce.

import { API_BASE_URL, apiRequest } from './config.js';
import { debounce, escapeHtml } from './utils.js';

/**
 * Configura el buscador de usuarios en tiempo real.
 * @param {Function} verPerfilUsuarioFn - función para navegar al perfil del usuario
 * @param {Function} mostrarResultadosBusquedaFn - función para mostrar resultados full
 */
export function setupBuscador(verPerfilUsuarioFn, mostrarResultadosBusquedaFn) {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchDropdown = document.getElementById('search-results-dropdown');

    if (!searchInput || !searchBtn || !searchDropdown) {
        console.warn('Buscador: elementos no encontrados');
        return;
    }

    // Cerrar el dropdown al hacer clic fuera
    const cerrarDropdown = () => {
        searchDropdown.classList.add('hidden');
        searchInput.classList.remove('input-available', 'input-unavailable');
    };

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            cerrarDropdown();
        }
    });

    // Reposicionar el dropdown según el wrapper del input
    const posicionarDropdown = () => {
        const inputWrapper = searchInput.closest('.search-input-wrapper');
        if (!inputWrapper) return;
        const wrapperRect = inputWrapper.getBoundingClientRect();
        searchDropdown.style.top = `${wrapperRect.top}px`;
        searchDropdown.style.left = `${wrapperRect.left}px`;
        searchDropdown.style.width = `${wrapperRect.width}px`;
    };

    // Mantener el dropdown alineado al cambiar tamaño de ventana o al hacer scroll
    const reposicionarSiVisible = () => {
        if (!searchDropdown.classList.contains('hidden')) {
            posicionarDropdown();
        }
    };
    window.addEventListener('resize', reposicionarSiVisible);
    window.addEventListener('scroll', reposicionarSiVisible, true);

    // Renderizar resultados en el dropdown
    const renderizarResultadosDropdown = (usuarios) => {
        searchDropdown.innerHTML = '';

        if (!usuarios || usuarios.length === 0) {
            searchDropdown.innerHTML = `<div class="search-no-results">No se encontraron usuarios</div>`;
            searchDropdown.classList.remove('hidden');
            return;
        }

        usuarios.forEach(usuario => {
            const item = document.createElement('div');
            item.className = 'search-result-item';

            let avatarHTML = '';
            if (usuario.foto_perfil) {
                avatarHTML = `<img src="${escapeHtml(usuario.foto_perfil)}" alt="${escapeHtml(usuario.nombre_artista)}" class="search-result-avatar">`;
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
                cerrarDropdown();
                if (verPerfilUsuarioFn) verPerfilUsuarioFn(usuario.id);
            });

            searchDropdown.appendChild(item);
        });

        posicionarDropdown();
        searchDropdown.classList.remove('hidden');
    };

    // Búsqueda en tiempo real
    const buscarUsuariosTiempoReal = async (query) => {
        if (query.length < 1) {
            searchDropdown.classList.add('hidden');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/artistas/buscar?q=${encodeURIComponent(query)}`, {
                credentials: 'include'
            });
            const data = await response.json();

            if (data && data.success && Array.isArray(data.usuarios)) {
                renderizarResultadosDropdown(data.usuarios);
            } else {
                renderizarResultadosDropdown([]);
            }
        } catch (error) {
            console.error('Error en búsqueda en tiempo real:', error);
            searchDropdown.classList.add('hidden');
        }
    };

    // Versión con debounce de 500ms
    const buscarConDebounce = debounce((query) => {
        buscarUsuariosTiempoReal(query);
    }, 500);

    // Evento input (tiempo real)
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length >= 1) {
            buscarConDebounce(query);
            searchInput.classList.add('input-available');
        } else {
            searchDropdown.classList.add('hidden');
            searchInput.classList.remove('input-available', 'input-unavailable');
        }
    });

    // Búsqueda tradicional con botón (resultados completos)
    const buscarUsuarioConBoton = async () => {
        const query = searchInput.value.trim();
        if (query.length < 2) {
            alert('El término de búsqueda debe tener al menos 2 caracteres');
            return;
        }

        try {
            const response = await apiRequest(`/api/artistas/buscar?q=${encodeURIComponent(query)}`);
            if (response && response.success && response.usuarios.length > 0) {
                if (mostrarResultadosBusquedaFn) mostrarResultadosBusquedaFn(response.usuarios);
            } else {
                alert('No se encontraron usuarios con ese nombre');
            }
        } catch (error) {
            console.error('Error al buscar usuarios:', error);
            alert('Error al buscar usuarios. Por favor intenta nuevamente.');
        }
    };

    searchBtn.addEventListener('click', buscarUsuarioConBoton);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            buscarUsuarioConBoton();
            cerrarDropdown();
        }
    });
}
