// js/perfil.js
// Gestión del perfil de usuario, estadísticas, foto de perfil,
// visualización de perfiles externos y resultados de búsqueda.

import { ARTISTA_KEY, API_BASE_URL, apiRequest } from './config.js';
import { token, artistaActual, lastActivityTime } from './auth.js';
import { showError, showSuccess, showInfo, setButtonLoading } from './notificaciones.js';
import { escapeHtml, debugLog, cloudinaryUrl, safeImgUrl } from './utils.js';
// Mismo tracking de vistas que la galería (mismo URL versionado → un solo
// módulo en memoria; el hash lo mantiene scripts/bump-version.js)
import { setupViewTracking } from './galeria.js?v=7a54ba97ce';

export const AVATAR_DEFAULT = 'iconos/avatar-default.svg';

// Referencia a funciones del módulo de navegación (se inyecta para evitar dependencia circular)
let _navegacion = null;
export function setNavegacionRef(ref) { _navegacion = ref; }

// ============================================
// FOTO DE PERFIL
// ============================================
function getFotoPerfilKey() {
    const id = (artistaActual && (artistaActual.email || artistaActual.correo || artistaActual.id)) || 'anon';
    return `fotoPerfil_${id}`;
}

export function getFotoPerfil() {
    if (artistaActual && artistaActual.foto_perfil) return artistaActual.foto_perfil;
    try {
        return localStorage.getItem(getFotoPerfilKey()) || '';
    } catch (e) {
        return '';
    }
}

export function guardarFotoPerfil(dataUrl) {
    // Crear thumbnail para no exceder la cuota de localStorage (~5-10 MB)
    const MAX_THUMB_W = 200;
    try {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ratio = Math.min(MAX_THUMB_W / img.naturalWidth, 1);
            canvas.width = img.naturalWidth * ratio;
            canvas.height = img.naturalHeight * ratio;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            try {
                localStorage.setItem(getFotoPerfilKey(), thumbDataUrl);
            } catch (e) {
                // Si aún excede cuota, eliminar clave vieja y reintentar
                try { localStorage.removeItem(getFotoPerfilKey()); } catch (_) {}
                try { localStorage.setItem(getFotoPerfilKey(), thumbDataUrl); } catch (_) {}
            }
        };
        img.src = dataUrl;
    } catch (e) {
        debugLog.error('No se pudo crear thumbnail de la foto:', e);
    }
    // Siempre actualizar artistaActual (prioridad: Cloudinary URL a tamaño completo)
    if (artistaActual) {
        artistaActual.foto_perfil = dataUrl;
        try {
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
        } catch (e) {
            debugLog.error('No se pudo actualizar el artista en localStorage:', e);
        }
    }
}

// ============================================
// ACTUALIZAR UI DEL PERFIL
// ============================================
export function actualizarPerfilUI(verificarActividadFn = null) {
    const onlineIndicator = document.getElementById('perfil-online-indicator');
    const perfilUsuario = document.getElementById('perfil-usuario');
    const viendoPerfilExterno = perfilUsuario && perfilUsuario.dataset.viewing === 'external';

    // Si estamos viendo un perfil externo, no sobrescribir sus datos con los del usuario logueado
    if (!viendoPerfilExterno) {
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
            el.textContent = ciudad ? escapeHtml(ciudad) : '';
        });
    }

    // Mostrar indicador de estado en línea solo para perfil propio
    if (onlineIndicator) {
        if (!viendoPerfilExterno && token && artistaActual) {
            const activo = verificarActividadFn ? verificarActividadFn() :
                (Date.now() - lastActivityTime) < (5 * 60 * 1000);
            if (activo) {
                onlineIndicator.classList.add('online');
                onlineIndicator.classList.remove('offline');
                onlineIndicator.style.display = 'block';
            } else {
                onlineIndicator.classList.remove('online');
                onlineIndicator.classList.add('offline');
                onlineIndicator.style.display = 'block';
            }
        } else if (!viendoPerfilExterno) {
            onlineIndicator.classList.remove('online');
            onlineIndicator.classList.add('offline');
            onlineIndicator.style.display = 'none';
        }
    }
}

// ============================================
// SUBIR FOTO DE PERFIL (CLOUDINARY)
// ============================================
export async function subirFotoPerfilServidor(file) {
    const formData = new FormData();
    formData.append('foto', file);
    const res = await fetch(`${API_BASE_URL}/api/artistas/foto-perfil`, {
        method: 'POST',
        credentials: 'include',
        body: formData
    });
    return await res.json();
}

// ============================================
// REFRESCAR PERFIL DESDE EL SERVIDOR
// ============================================
export async function refrescarPerfilDesdeServidor() {
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
// ESTADÍSTICAS DEL PERFIL (Cavents, Problogs, Comcons)
// ============================================
export async function actualizarEstadisticas(userId = null, statsData = null) {
    const statsCavents = document.getElementById('stats-cavents');
    const statsProblogs = document.getElementById('stats-problogs');
    const statsComcons = document.getElementById('stats-comcons');

    if (!statsCavents) {
        debugLog.warn('Elemento #stats-cavents no encontrado (el perfil no está visible)');
        return;
    }

    const fallbackCavents = statsData && (statsData.cavents != null ? statsData.cavents : statsData.total_obras_activas) != null
        ? String(statsData.cavents != null ? statsData.cavents : statsData.total_obras_activas) : '0';
    const fallbackProblogs = (statsData && statsData.problogs != null) ? String(statsData.problogs) : '0';
    const fallbackComcons = (statsData && statsData.comcons != null) ? String(statsData.comcons) : '0';

    try {
        let res;
        if (userId) {
            res = await apiRequest('/obras?limit=100');
            if (Array.isArray(res)) {
                const obrasUsuario = res.filter(obra =>
                    String(obra.artista_user_id) === String(userId) ||
                    String(obra.user_id) === String(userId) ||
                    String(obra.artista_id) === String(userId)
                );
                const activas = obrasUsuario.filter(obra =>
                    obra.status && obra.status.trim() === 'Activo (Visible en Galería)'
                ).length;
                statsCavents.textContent = activas;
            } else {
                statsCavents.textContent = fallbackCavents;
            }
        } else {
            const endpoint = '/api/artistas/mis-obras?limit=100&search=&sortBy=id&order=DESC';
            res = await apiRequest(endpoint);

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
            statsCavents.textContent = activas;
        }
        if (statsProblogs) statsProblogs.textContent = fallbackProblogs;
        if (statsComcons) statsComcons.textContent = fallbackComcons;
    } catch (error) {
        debugLog.error('Error al cargar estadísticas:', error);
        statsCavents.textContent = fallbackCavents;
        if (statsProblogs) statsProblogs.textContent = fallbackProblogs;
        if (statsComcons) statsComcons.textContent = fallbackComcons;
    }
}

// EXPONER AL ÁMBITO GLOBAL (para módulos que lo necesiten)
window.actualizarEstadisticas = actualizarEstadisticas;

// ============================================
// MOSTRAR RESULTADOS DE BÚSQUEDA
// ============================================
export function mostrarResultadosBusqueda(usuarios, verPerfilUsuarioFn) {
    const galeria = document.getElementById('galeria-publica');
    const panel = document.getElementById('panel-artista');
    const paginaBlanca = document.getElementById('pagina-blanca');
    const miCuenta = document.getElementById('mi-cuenta');
    const perfilUsuario = document.getElementById('perfil-usuario');
    const resultadosBusqueda = document.getElementById('resultados-busqueda');

    if (galeria) galeria.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
    if (paginaBlanca) paginaBlanca.classList.add('hidden');
    if (miCuenta) miCuenta.classList.add('hidden');
    if (perfilUsuario) perfilUsuario.classList.add('hidden');

    if (resultadosBusqueda) resultadosBusqueda.classList.remove('hidden');

    const resultadosLista = document.getElementById('resultados-busqueda-lista');
    if (resultadosLista) {
        resultadosLista.innerHTML = usuarios.map(usuario => `
            <div class="resultado-item" data-user-id="${escapeHtml(String(usuario.id))}">
                <div class="resultado-avatar">
                    ${usuario.foto_perfil
                        ? `<img src="${safeImgUrl(usuario.foto_perfil)}" alt="${escapeHtml(usuario.nombre_artista)}">`
                        : `<div class="avatar-placeholder">${escapeHtml(usuario.nombre_artista.charAt(0).toUpperCase())}</div>`
                    }
                </div>
                <div class="resultado-info">
                    <div class="resultado-nombre">${escapeHtml(usuario.nombre_artista)}</div>
                    <div class="resultado-nombre-real">${escapeHtml(usuario.nombre_real || '')}</div>
                    ${usuario.ciudad ? `<div class="resultado-ciudad">${escapeHtml(usuario.ciudad)}</div>` : ''}
                </div>
            </div>
        `).join('');

        const resultadoItems = resultadosLista.querySelectorAll('.resultado-item');
        resultadoItems.forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.getAttribute('data-user-id');
                if (verPerfilUsuarioFn) verPerfilUsuarioFn(userId);
            });
        });
    }
}

// ============================================
// VER PERFIL DE USUARIO (EXTERNO)
// ============================================
export async function verPerfilUsuario(userId, verificarActividadFn, actualizarEstadoNavFn) {
    try {
        const response = await apiRequest(`/api/artistas/perfil/${userId}`);
        if (response && response.success) {
            const usuario = response.usuario;

            // Ocultar todas las secciones
            const galeria = document.getElementById('galeria-publica');
            const panel = document.getElementById('panel-artista');
            const paginaBlanca = document.getElementById('pagina-blanca');
            const miCuenta = document.getElementById('mi-cuenta');
            const perfilUsuario = document.getElementById('perfil-usuario');
            const resultadosBusqueda = document.getElementById('resultados-busqueda');

            if (galeria) galeria.classList.add('hidden');
            if (panel) panel.classList.add('hidden');
            if (paginaBlanca) paginaBlanca.classList.add('hidden');
            if (miCuenta) miCuenta.classList.add('hidden');
            if (resultadosBusqueda) resultadosBusqueda.classList.add('hidden');

            if (perfilUsuario) {
                perfilUsuario.classList.remove('hidden');
                perfilUsuario.dataset.viewing = 'external';
            }
            if (actualizarEstadoNavFn) actualizarEstadoNavFn();

            // Poblar datos del perfil
            const avatarImg = document.getElementById('perfil-avatar-seccion');
            const nombreReal = document.querySelector('.perfil-nombre-real-seccion');
            const nombreArtista = document.querySelector('.perfil-nombre-artista-seccion');
            const ciudad = document.querySelector('.perfil-ciudad');
            const avatarBtn = document.getElementById('perfil-avatar-btn');

            if (avatarImg) {
                avatarImg.src = usuario.foto_perfil || 'iconos/avatar-default.svg';
            }
            if (nombreReal) {
                nombreReal.textContent = usuario.nombre_real || '';
            }
            if (nombreArtista) {
                nombreArtista.textContent = usuario.nombre_artista || '';
            }
            if (ciudad) {
                ciudad.textContent = usuario.ciudad || '';
            }

            const avatarOverlay = document.querySelector('.perfil-avatar-overlay');
            if (avatarOverlay) {
                avatarOverlay.style.display = 'none';
            }
            if (avatarBtn) {
                avatarBtn.style.pointerEvents = 'none';
                avatarBtn.style.cursor = 'default';
            }

            await actualizarEstadisticas(userId, usuario);

            // Cargar obras del usuario externo en el grid
            cargarObrasExternas(userId);

            // Actualizar indicador de estado en línea para perfil externo
            const onlineIndicator = document.getElementById('perfil-online-indicator');
            if (onlineIndicator) {
                const esPropioUsuario = artistaActual && String(artistaActual.id) === String(usuario.id);

                if (esPropioUsuario && token) {
                    const activo = verificarActividadFn ? verificarActividadFn() : false;
                    if (activo) {
                        onlineIndicator.classList.add('online');
                        onlineIndicator.classList.remove('offline');
                        onlineIndicator.style.display = 'block';
                    } else {
                        onlineIndicator.classList.remove('online');
                        onlineIndicator.classList.add('offline');
                        onlineIndicator.style.display = 'none';
                    }
                } else {
                    let usuarioActivo = usuario.activo === true || usuario.online === true || usuario.en_linea === true;
                    const ULTIMA_ACTIVIDAD_MS = 5 * 60 * 1000;
                    if (!usuarioActivo && usuario.ultima_actividad) {
                        const ultimaActividad = new Date(usuario.ultima_actividad).getTime();
                        if (!isNaN(ultimaActividad) && (Date.now() - ultimaActividad) < ULTIMA_ACTIVIDAD_MS) {
                            usuarioActivo = true;
                        }
                    }
                    if (!usuarioActivo && usuario.last_activity) {
                        const lastActivity = new Date(usuario.last_activity).getTime();
                        if (!isNaN(lastActivity) && (Date.now() - lastActivity) < ULTIMA_ACTIVIDAD_MS) {
                            usuarioActivo = true;
                        }
                    }

                    if (usuarioActivo) {
                        onlineIndicator.classList.add('online');
                        onlineIndicator.classList.remove('offline');
                    } else {
                        onlineIndicator.classList.remove('online');
                        onlineIndicator.classList.add('offline');
                    }
                    onlineIndicator.style.display = 'block';
                }
            }
        } else {
            showError('No se pudo cargar el perfil del usuario. El usuario puede no existir o el servicio no está disponible.');
        }
    } catch (error) {
        debugLog.error('Error al cargar perfil:', error);
        if (error.response && error.response.status === 500) {
            showError('Error del servidor al cargar el perfil. Por favor, intenta nuevamente más tarde.');
        } else {
            showError('Error al cargar el perfil del usuario. Verifica tu conexión a internet.');
        }
    }
}

// ============================================
// INTERACCIONES DEL PERFIL (sidebar)
// ============================================
export function setupPerfilInteracciones(togglePerfilFn, cerrarTodosLosPanelesFn) {
    const btn = document.getElementById('btn-perfil-sidebar');
    if (!btn) return;

    const abrirPerfil = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (cerrarTodosLosPanelesFn) cerrarTodosLosPanelesFn();
        if (togglePerfilFn) togglePerfilFn();
    };
    btn.addEventListener('click', abrirPerfil);

    // Clic en el avatar abre el selector de archivos
    document.getElementById('perfil-avatar-btn')?.addEventListener('click', () => {
        document.getElementById('input-foto-perfil')?.click();
    });

    // Inicializar tabs del perfil
    setupPerfilTabs();
}

// ============================================
// TABS DEL PERFIL (cavents, problogs, comcons)
// ============================================
let perfilTabActual = 'cavents';
let perfilExternoId = null; // ID del usuario externo que se está viendo

function setupPerfilTabs() {
    const tabs = document.querySelectorAll('.perfil-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (perfilTabActual === tab.dataset.tab) return;
            perfilTabActual = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            cargarContenidoTab(perfilTabActual);
        });
    });

    // Activar cavents por defecto al abrir perfil
    activarTabCavents();
}

export function activarTabCavents() {
    perfilTabActual = 'cavents';
    perfilExternoId = null;
    // Restaurar el header del perfil propio (nombre, avatar, ciudad)
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (perfilUsuario) {
        perfilUsuario.dataset.viewing = 'own';
    }
    actualizarPerfilUI();
    const tabs = document.querySelectorAll('.perfil-tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    const caventsTab = document.querySelector('.perfil-tab-btn[data-tab="cavents"]');
    if (caventsTab) caventsTab.classList.add('active');
    cargarContenidoTab('cavents');
}

async function cargarContenidoTab(tab) {
    const content = document.getElementById('perfil-tab-content');
    if (!content) return;

    const viendoExterno = !!perfilExternoId;

    if (tab === 'cavents') {
        content.innerHTML = '<div class="perfil-grid-loading">Cargando obras...</div>';
        try {
            if (viendoExterno) {
                const res = await apiRequest('/obras?limit=100');
                if (res && Array.isArray(res)) {
                    const obrasUsuario = res.filter(obra => String(obra.artista_user_id) === String(perfilExternoId));
                    renderizarGridObras(obrasUsuario, content);
                } else {
                    content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">No se pudieron cargar las obras.</p>';
                }
            } else {
                const res = await apiRequest('/api/artistas/mis-obras?limit=50');
                if (res && res.success && res.obras) {
                    const obrasActivas = res.obras.filter(obra => obra.status !== 'Inactivo (Oculto)');
                    renderizarGridObras(obrasActivas, content);
                } else {
                    content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">No se pudieron cargar las obras.</p>';
                }
            }
        } catch (e) {
            content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">Error al cargar las obras.</p>';
        }
    } else if (tab === 'problogs') {
        content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">Problogs — próximamente</p>';
    } else if (tab === 'comcons') {
        content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">Comcons — próximamente</p>';
    }
}

async function cargarObrasExternas(userId) {
    perfilExternoId = userId;
    perfilTabActual = 'cavents';
    const tabs = document.querySelectorAll('.perfil-tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    const caventsTab = document.querySelector('.perfil-tab-btn[data-tab="cavents"]');
    if (caventsTab) caventsTab.classList.add('active');
    cargarContenidoTab('cavents');
}

function renderizarGridObras(obras, container) {
    if (!obras || obras.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">No tienes obras registradas aún.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'perfil-grid-obras';

    const ICON_OJO = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

    obras.forEach(obra => {
        const card = document.createElement('div');
        card.className = 'perfil-obra-card';
        card.dataset.obraId = obra.id;

        // Construir array de imágenes
        const imagenes = [];
        if (obra.imagen_url) imagenes.push(cloudinaryUrl(obra.imagen_url));
        if (obra.imagen_url_1) imagenes.push(cloudinaryUrl(obra.imagen_url_1));
        if (obra.imagen_url_2) imagenes.push(cloudinaryUrl(obra.imagen_url_2));
        if (obra.imagen_url_3) imagenes.push(cloudinaryUrl(obra.imagen_url_3));
        if (obra.imagen_url_4) imagenes.push(cloudinaryUrl(obra.imagen_url_4));

        const totalImagenes = imagenes.length || 0;
        const primeraImg = imagenes[0] || '';

        card.innerHTML = `
            <div class="perfil-obra-card-img">
                ${primeraImg ? `<img src="${primeraImg}" alt="" loading="lazy" class="perfil-card-main-img">` : '<div class="perfil-obra-card-placeholder">🖼️</div>'}
                ${totalImagenes > 1 ? `<div class="perfil-card-dots">${imagenes.map((_, i) => `<span class="perfil-card-dot${i === 0 ? ' active' : ''}" data-index="${i}"></span>`).join('')}</div>` : ''}
                <div class="perfil-card-bottom">
                    <span class="perfil-card-vistas">${ICON_OJO} <span class="perfil-card-vistas-num">${obra.views_count || 0}</span></span>
                </div>
            </div>
        `;

        // Swipe para múltiples imágenes
        if (totalImagenes > 1) {
            let currentImgIndex = 0;
            let touchStartX = 0;
            const img = card.querySelector('.perfil-card-main-img');
            const dots = card.querySelectorAll('.perfil-card-dot');

            function updateImage(index) {
                currentImgIndex = index;
                if (img) {
                    img.style.opacity = '0';
                    setTimeout(() => {
                        img.src = imagenes[index];
                        img.style.opacity = '1';
                    }, 150);
                }
                dots.forEach((d, i) => d.classList.toggle('active', i === index));
            }

            card.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
            }, { passive: true });

            card.addEventListener('touchend', (e) => {
                const diff = touchStartX - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 40) {
                    e.preventDefault();
                    if (diff > 0 && currentImgIndex < totalImagenes - 1) {
                        updateImage(currentImgIndex + 1);
                    } else if (diff < 0 && currentImgIndex > 0) {
                        updateImage(currentImgIndex - 1);
                    }
                }
            });

            // También permitir clic en dots
            dots.forEach(dot => {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    updateImage(parseInt(dot.dataset.index));
                });
            });
        }

        card.addEventListener('click', (e) => {
            // No abrir si se hizo clic en un dot
            if (e.target.classList.contains('perfil-card-dot')) return;
            if (typeof window.abrirObraDesdePerfil === 'function') {
                window.abrirObraDesdePerfil(obra.id);
            }
        });

        grid.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(grid);

    // Contar vistas en tiempo real también desde el perfil (mismo dedup global)
    try {
        setupViewTracking(grid, obras);
    } catch (e) {
        debugLog.error('setupViewTracking en perfil:', e);
    }
}
