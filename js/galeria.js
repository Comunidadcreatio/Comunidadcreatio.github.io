// js/galeria.js
import { API_BASE_URL, apiRequest } from './config.js';
import { artistaActual } from './auth.js';
import { escapeHtml, debugLog, cloudinaryUrl } from './utils.js';
import { abrirComentarios } from './comentarios.js';

export async function cargarGaleria(container) {
    container.setAttribute('aria-busy', 'true');
    
    try {
        const data = await apiRequest('/obras');
        if (data && data.success === false) {
            debugLog.error('Error al cargar galería:', data.error);
            container.innerHTML = '<p>Error al cargar las obras.</p>';
            container.setAttribute('aria-busy', 'false');
            return [];
        }
        container.setAttribute('aria-busy', 'false');
        const obras = Array.isArray(data) ? data : (data?.obras ?? data?.data ?? []);
        
        // Cargar likes del usuario para persistencia
        try {
            const likesData = await apiRequest('/api/artistas/mis-reacciones?tipo=like');
            if (likesData && likesData.reacciones) {
                const likedIds = new Set(likesData.reacciones.map(r => r.obra_id));
                window._likedObras = likedIds;
            }
        } catch (e) { /* silencioso */ }
        
        return obras;
    } catch (error) {
        debugLog.error("Error al cargar la galería:", error);
        container.innerHTML = '<p>Error al cargar las obras.</p>';
        container.setAttribute('aria-busy', 'false');
        return [];
    }
}

// SVG inline reutilizables
const ICON_OJO = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_CORAZON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
const ICON_COMENTARIO = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

/**
 * Crea el HTML del carrusel de imágenes para una obra.
 * Soporta hasta 5 imágenes (imagen_url, imagen_url_1..4).
 * Acepta avatarHTML para insertarlo dentro del carrusel (posición esquina).
 */
function crearCarruselHTML(obra, overlayHTML = '') {
    const urls = [
        cloudinaryUrl(obra.imagen_url || obra.imagen_thumbnail_url || ''),
        cloudinaryUrl(obra.imagen_url_1 || ''),
        cloudinaryUrl(obra.imagen_url_2 || ''),
        cloudinaryUrl(obra.imagen_url_3 || ''),
        cloudinaryUrl(obra.imagen_url_4 || '')
    ].filter(url => !!url);

    function crearDotsHTML(index, total) {
        return `<button class="obra-carousel-dot${index === 0 ? ' active' : ''}" data-index="${index}"></button>`;
    }

    const slides = urls.map((url, i) => `
        <div class="obra-carousel-slide">
            <img src="${url}" alt="Imagen ${i + 1} de obra" loading="eager">
        </div>
    `).join('');

    const dots = urls.map((_, i) => crearDotsHTML(i, urls.length)).join('');

    return `
        <div class="obra-carousel">
            <div class="obra-carousel-viewport">
                <div class="obra-carousel-track" style="transform: translateX(0%);">
                    ${slides}
                </div>
            </div>
            <div class="obra-carousel-dots">
                ${dots}
            </div>
            ${overlayHTML}
        </div>
    `;
}

/**
 * Inicializa el carrusel: dots click, swipe táctil y ratón.
 */
function initCarrusel(card) {
    const track = card.querySelector('.obra-carousel-track');
    const dots = card.querySelectorAll('.obra-carousel-dot');
    if (!track || dots.length <= 1) return;

    let currentIndex = 0;
    let startX = 0;
    let isDragging = false;
    let dragOffset = 0;

    function goTo(index) {
        if (index < 0) index = 0;
        if (index >= dots.length) index = dots.length - 1;
        currentIndex = index;
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    }

    // Click en dots
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            goTo(parseInt(dot.dataset.index));
        });
    });

    // Soporte táctil (swipe)
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        track.style.transition = 'none';
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const diff = e.touches[0].clientX - startX;
        const containerWidth = track.parentElement.offsetWidth;
        dragOffset = (diff / containerWidth) * 100;
        const baseOffset = -currentIndex * 100;
        track.style.transform = `translateX(${baseOffset + dragOffset}%)`;
    }, { passive: true });

    track.addEventListener('touchend', () => {
        isDragging = false;
        track.style.transition = 'transform 0.35s ease';
        if (Math.abs(dragOffset) > 20) {
            if (dragOffset < 0 && currentIndex < dots.length - 1) {
                goTo(currentIndex + 1);
            } else if (dragOffset > 0 && currentIndex > 0) {
                goTo(currentIndex - 1);
            } else {
                goTo(currentIndex);
            }
        } else {
            goTo(currentIndex);
        }
        dragOffset = 0;
    }, { passive: true });

    // Soporte para ratón (arrastrar)
    const onMouseMove = (e) => {
        if (!isDragging) return;
        const diff = e.clientX - startX;
        const containerWidth = track.parentElement.offsetWidth;
        dragOffset = (diff / containerWidth) * 100;
        const baseOffset = -currentIndex * 100;
        track.style.transform = `translateX(${baseOffset + dragOffset}%)`;
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = 'transform 0.35s ease';
        track.style.cursor = '';
        if (Math.abs(dragOffset) > 20) {
            if (dragOffset < 0 && currentIndex < dots.length - 1) {
                goTo(currentIndex + 1);
            } else if (dragOffset > 0 && currentIndex > 0) {
                goTo(currentIndex - 1);
            } else {
                goTo(currentIndex);
            }
        } else {
            goTo(currentIndex);
        }
        dragOffset = 0;
        // Limpiar listeners al soltar
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };

    track.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        isDragging = true;
        track.style.transition = 'none';
        track.style.cursor = 'grabbing';
        e.preventDefault();
        // Adjuntar listeners solo durante el arrastre
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

function crearObraCard(obra) {
    const vistas = obra.likes_count !== undefined ? obra.likes_count : 0;
    // NOTA: likes_count es para "me gusta", views_count para vistas, comments_count para comentarios
    const likesCount = obra.likes_count || 0;
    const viewsCount = obra.views_count || 0;
    const commentsCount = obra.comments_count || 0;

    const card = document.createElement('article');
    card.className = 'obra-card';
    if (obra.id !== undefined && obra.id !== null) {
        card.dataset.obraId = obra.id;
    }

    const nombreArtista = escapeHtml(obra.artista || 'Artista');
    const inicial = nombreArtista.charAt(0).toUpperCase();
    const fotoArtista = obra.foto_artista || '';
    const tieneAvatar = !!fotoArtista;
    const titulo = escapeHtml(obra.titulo || 'Sin título');
    const precio = escapeHtml(obra.precio || 'N/A');

    const artistaUserId = obra.artista_user_id !== undefined && obra.artista_user_id !== null ? obra.artista_user_id : '';
    const avatarHTML = tieneAvatar 
        ? `<img src="${fotoArtista}" alt="${nombreArtista}" class="obra-avatar-round obra-avatar-clickable" data-artista-id="${artistaUserId}">`
        : `<div class="obra-avatar-placeholder obra-avatar-clickable" data-artista-id="${artistaUserId}">${inicial}</div>`;

    const gridOverlayHTML = `
        <div class="obra-grid-overlay" aria-hidden="true">
            <span class="obra-grid-titulo" title="${titulo}">${titulo}</span>
            <div class="obra-grid-bottom">
                <span class="obra-grid-vistas">${ICON_OJO} <span>0</span></span>
                <span class="obra-grid-precio">$${precio}</span>
            </div>
        </div>
    `;
    const carruselHTML = crearCarruselHTML(obra, gridOverlayHTML);

    card.innerHTML = `
        <div class="obra-card-inner">
            <!-- Header: avatar + nombre artista | título marquee | precio -->
            <div class="obra-artista-row">
                <div class="obra-artista-left">
                    ${avatarHTML}
                    <span class="obra-artista-nombre">${nombreArtista}</span>
                </div>
                <div class="obra-titulo-marquee">
                    <span class="marquee-text">${titulo}</span>
                </div>
                <span class="obra-precio-top">$${precio}</span>
            </div>

            <!-- Carrusel de imágenes (incluye overlay para modo grid) -->
            ${carruselHTML}

            <!-- Barra inferior sólida: métricas + botón ver detalles -->
            <div class="obra-metricas-bar">
                <button class="btn-ver-detalles btn-detalles-toggle" aria-label="Ver detalles" title="Ver detalles">
                    <svg class="icon-lupa" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <svg class="icon-volver" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div class="metrica-right">
                    <span class="metrica-item metrica-vistas">${ICON_OJO} <span>${viewsCount}</span></span>
                    <span class="metrica-item metrica-comentario">${ICON_COMENTARIO} <span>${commentsCount}</span></span>
                    <span class="metrica-item metrica-like">${ICON_CORAZON} <span>${likesCount}</span></span>
                </div>
            </div>
        </div>
    `;

    // Inicializar carrusel después de agregar al DOM
    requestAnimationFrame(() => initCarrusel(card));

    return card;
}

export function mostrarGaleria(obras, container, onDetalle, onAvatarClick) {
    container.innerHTML = '';
    if (!obras || obras.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--color-gray-400); padding: 2rem;">No hay obras disponibles.</p>';
        return;
    }
    obras.forEach(obra => {
        const card = crearObraCard(obra);

        // Clic en el avatar del artista: abre su perfil
        if (onAvatarClick) {
            const avatarEl = card.querySelector('.obra-avatar-clickable');
            if (avatarEl) {
                avatarEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const artistaId = avatarEl.dataset.artistaId;
                    if (artistaId) onAvatarClick(artistaId);
                });
            }
        }

        // Clic en el botón lupa/volver → abre/cierra modal
        const btnToggle = card.querySelector('.btn-detalles-toggle');
        if (btnToggle) {
            btnToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const modal = document.getElementById('modal-detalles-cavent');
                const modalOpen = modal && !modal.classList.contains('hidden');
                if (modalOpen) {
                    modal.classList.add('hidden');
                    btnToggle.querySelector('.icon-lupa').style.display = '';
                    btnToggle.querySelector('.icon-volver').style.display = 'none';
                    btnToggle.setAttribute('aria-label', 'Ver detalles');
                    btnToggle.setAttribute('title', 'Ver detalles');
                } else {
                    abrirDetalleCavent(obra.id, card);
                    btnToggle.querySelector('.icon-lupa').style.display = 'none';
                    btnToggle.querySelector('.icon-volver').style.display = '';
                    btnToggle.setAttribute('aria-label', 'Volver');
                    btnToggle.setAttribute('title', 'Volver');
                }
            });
        }

        // Clic en reacciones (vistas/comentarios/me gusta)
        card.querySelectorAll('.metrica-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                manejarReaccion(item, obra.id, obra.artista_user_id);
            });
        });

        if (onDetalle) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.obra-carousel-dot')) return;
                if (e.target.closest('.btn-ver-detalles')) return;
                if (e.target.closest('.metrica-item')) return;
                onDetalle(obra.id);
            });
        }
        container.appendChild(card);

        // Aplicar estado "liked" si el usuario ya reaccionó
        if (window._likedObras && window._likedObras.has(obra.id)) {
            const likeItem = card.querySelector('.metrica-like');
            if (likeItem) likeItem.classList.add('liked');
        }
    });

    // IntersectionObserver: contar vistas automáticamente
    setupViewTracking(container, obras);
}

// ============================================
// CONTADOR DE VISTAS (IntersectionObserver)
// ============================================

// Set global para no repetir vistas en la misma sesión
if (!window._vistasRegistradas) window._vistasRegistradas = new Set();

const VIEW_TIMERS = new Map(); // obraId → timeout

function setupViewTracking(container, obras) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const obraId = parseInt(entry.target.dataset.obraId);
            if (!obraId) return;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                // Visible >50% → iniciar timer de 2.5s
                if (!VIEW_TIMERS.has(obraId) && !window._vistasRegistradas.has(obraId)) {
                    const timer = setTimeout(() => {
                        registrarVista(obraId, entry.target);
                        VIEW_TIMERS.delete(obraId);
                    }, 2500);
                    VIEW_TIMERS.set(obraId, timer);
                }
            } else {
                // Salió del viewport → cancelar timer
                if (VIEW_TIMERS.has(obraId)) {
                    clearTimeout(VIEW_TIMERS.get(obraId));
                    VIEW_TIMERS.delete(obraId);
                }
            }
        });
    }, { threshold: 0.5 });

    obras.forEach(obra => {
        const card = container.querySelector(`.obra-card[data-obra-id="${obra.id}"]`);
        if (card) observer.observe(card);
    });
}

async function registrarVista(obraId, cardEl) {
    window._vistasRegistradas.add(obraId);
    try {
        const res = await apiRequest(`/obras/${obraId}/reaccion`, {
            method: 'POST',
            body: JSON.stringify({ tipo: 'view' })
        });
        // Actualizar contador visual en la card
        const items = cardEl.querySelectorAll('.metrica-right .metrica-item');
        const viewItem = items[0]; // vistas es el primero
        if (viewItem && res.totales && res.totales.views !== undefined) {
            const span = viewItem.querySelector('span');
            if (span) span.textContent = res.totales.views;
        }
    } catch (e) {
        // Silencioso: si falla, se intentará en otra sesión
    }
}
export async function abrirDetalleCavent(obraId, cardElement) {
    const modal = document.getElementById('modal-detalles-cavent');
    if (!modal) return;

    // Resetear todos los botones toggle a estado "lupa"
    document.querySelectorAll('.btn-detalles-toggle').forEach(btn => {
        btn.querySelector('.icon-lupa').style.display = '';
        btn.querySelector('.icon-volver').style.display = 'none';
        btn.setAttribute('aria-label', 'Ver detalles');
        btn.setAttribute('title', 'Ver detalles');
    });

    // Alinear bordes del modal con la card: top = debajo de la fila artista/título/precio
    const modalContent = modal.querySelector('.modal-cavent-detalle');
    if (cardElement && modalContent) {
        const artistaRow = cardElement.querySelector('.obra-artista-row');
        const metricsBar = cardElement.querySelector('.obra-metricas-bar');
        if (artistaRow) {
            const topRect = artistaRow.getBoundingClientRect();
            const marginBottom = parseFloat(getComputedStyle(artistaRow).marginBottom) || 0;
            modalContent.style.top = (topRect.bottom + marginBottom) + 'px';
        } else {
            modalContent.style.top = '';
        }
        if (metricsBar) {
            const rect = metricsBar.getBoundingClientRect();
            modalContent.style.bottom = (window.innerHeight - rect.top) + 'px';
        } else {
            modalContent.style.bottom = '';
        }
    }

    modal.classList.remove('hidden');
    // Limpiar campos mientras carga
    document.getElementById('detalle-ano').textContent = 'Cargando...';

    try {
        const data = await apiRequest(`/obras/${obraId}`);
        const o = data && (data.obra || data.id) ? (data.obra || data) : null;
        if (!o || !o.id) {
            document.getElementById('detalle-ano').textContent = 'Error al cargar.';
            return;
        }

        // Poblar campos
        document.getElementById('detalle-tecnica').textContent = o.descripcion_tecnica || o.tecnica || '—';
        document.getElementById('detalle-soporte').textContent = o.soporte || '—';
        document.getElementById('detalle-marcos').textContent = o.marcos || '—';
        document.getElementById('detalle-dimensiones').textContent = (o.ancho && o.alto) ? `${o.ancho} × ${o.alto} cm` : '—';
        document.getElementById('detalle-ano').textContent = o.ano || '—';
        document.getElementById('detalle-estado').textContent = o.estado_obra || o.estado || '—';
        document.getElementById('detalle-descripcion').textContent = o.descripcion_artistica || o.descripcion || '—';
        document.getElementById('detalle-procedencia').textContent = o.procedencia || '—';
        document.getElementById('detalle-certificado').textContent = o.certificado || '—';
        document.getElementById('detalle-firma').textContent = o.firma || '—';
        document.getElementById('detalle-conservacion').textContent = o.conservacion || '—';
        document.getElementById('detalle-etiquetas').textContent = o.etiquetas || '—';

    } catch (error) {
        debugLog.error('Error al cargar detalle de obra:', error);
        document.getElementById('detalle-ano').textContent = 'Error de conexión.';
    }
}

// ============================================
// POPOVER DE VISTAS (solo dueño)
// ============================================
let vistasPopover = null;

async function mostrarVistas(obraId, anchorEl) {
    // Remover popover anterior
    if (vistasPopover) vistasPopover.remove();

    const popover = document.createElement('div');
    popover.className = 'vistas-popover';
    popover.innerHTML = '<div class="vistas-popover-loading">Cargando...</div>';
    document.body.appendChild(popover);
    vistasPopover = popover;

    // Posicionar arriba del ícono
    const rect = anchorEl.getBoundingClientRect();
    popover.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    popover.style.right = (window.innerWidth - rect.right) + 'px';

    // Cerrar al tocar fuera
    const closeHandler = (e) => {
        if (!popover.contains(e.target) && e.target !== anchorEl) {
            popover.remove();
            vistasPopover = null;
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);

    try {
        const data = await apiRequest(`/obras/${obraId}/vistas`);
        if (!data || data.error) {
            popover.innerHTML = '<div class="vistas-popover-empty">' + (data?.error || 'Error de conexión') + '</div>';
            return;
        }
        const vistas = data.vistas || [];
        if (!vistas.length) {
            popover.innerHTML = '<div class="vistas-popover-empty">Nadie ha visto tu cavent aún</div>';
            return;
        }
        popover.innerHTML = `
            <div class="vistas-popover-title">Visto por</div>
            ${vistas.map(v => {
                const inicial = (v.nombre_artista || '?')[0].toUpperCase();
                const avatarHTML = v.foto_perfil
                    ? `<img src="${v.foto_perfil}" class="vistas-avatar">`
                    : `<div class="vistas-avatar vistas-avatar-default">${inicial}</div>`;
                return `<div class="vistas-item">
                    ${avatarHTML}
                    <span class="vistas-nombre">${v.nombre_artista || 'Usuario'}</span>
                    <span class="vistas-fecha">${timeAgoShort(v.created_at)}</span>
                </div>`;
            }).join('')}
        `;
    } catch (err) {
        popover.innerHTML = '<div class="vistas-popover-empty">Error: ' + (err.message || 'desconocido') + '</div>';
    }
}

// ============================================
// REACCIONES (VISTOS / COMENTARIOS / ME GUSTA)
// ============================================
function manejarReaccion(itemEl, obraId, artistaOwnerId) {
    // Comentarios: abrir drawer
    if (itemEl.classList.contains('metrica-comentario')) {
        abrirComentarios(obraId, itemEl.closest('.obra-card'));
        return;
    }

    // Vistas: mostrar quién vio (solo dueño)
    if (itemEl.classList.contains('metrica-vistas')) {
        if (artistaActual && artistaActual.id === artistaOwnerId) {
            mostrarVistas(obraId, itemEl);
        }
        return;
    }

    // Solo permitir "me gusta"
    const esLike = itemEl.classList.contains('metrica-like');
    if (!esLike) return;

    const counterSpan = itemEl.querySelector('span');
    if (!counterSpan) return;

    const isLiked = itemEl.classList.contains('liked');
    const current = parseInt(counterSpan.textContent) || 0;

    if (isLiked) {
        // Quitar like
        itemEl.classList.remove('liked');
        counterSpan.textContent = Math.max(0, current - 1);
        if (window._likedObras) window._likedObras.delete(obraId);
    } else {
        // Dar like
        itemEl.classList.add('liked');
        counterSpan.textContent = current + 1;
        if (!window._likedObras) window._likedObras = new Set();
        window._likedObras.add(obraId);
    }

    // Enviar al backend (toggle: añade o quita)
    apiRequest(`/obras/${obraId}/reaccion`, {
        method: 'POST',
        body: JSON.stringify({ tipo: 'like' })
    }).catch(err => {
        // Revertir en caso de error
        if (isLiked) {
            itemEl.classList.add('liked');
            counterSpan.textContent = current;
        } else {
            itemEl.classList.remove('liked');
            counterSpan.textContent = current;
        }
        debugLog.error('Error al enviar reacción:', err);
    });
}