// js/galeria.js
import { API_BASE_URL, apiRequest } from './config.js';
import { artistaActual } from './auth.js';

// Genera HTML de skeleton loader para la galería
function generarSkeletonGaleria(cantidad = 6) {
    let html = '<div class="skeleton-galeria">';
    for (let i = 0; i < cantidad; i++) {
        html += `
            <div class="skeleton-card">
                <div class="skeleton-card-img"></div>
                <div class="skeleton-card-body">
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line-sm"></div>
                </div>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

export async function cargarGaleria(container) {
    container.innerHTML = generarSkeletonGaleria();
    container.setAttribute('aria-busy', 'true');
    
    try {
        const data = await apiRequest('/obras');
        if (data && data.success === false) {
            console.error('Error al cargar galería:', data.error);
            container.innerHTML = '<p>Error al cargar las obras.</p>';
            container.setAttribute('aria-busy', 'false');
            return [];
        }
        container.setAttribute('aria-busy', 'false');
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Error al cargar la galería:", error);
        container.innerHTML = '<p>Error al cargar las obras.</p>';
        container.setAttribute('aria-busy', 'false');
        return [];
    }
}

// SVG inline reutilizables
const ICON_OJO = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_LIKE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
const ICON_COMENTARIO = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const ICON_LUPA = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

/**
 * Crea el HTML del carrusel de imágenes para una obra.
 * Soporta hasta 5 imágenes (imagen_url, imagen_url_1..4).
 * Acepta avatarHTML para insertarlo dentro del carrusel (posición esquina).
 */
function crearCarruselHTML(obra, avatarHTML) {
    const urls = [
        obra.imagen_url || obra.imagen_thumbnail_url || '',
        obra.imagen_url_1 || '',
        obra.imagen_url_2 || '',
        obra.imagen_url_3 || '',
        obra.imagen_url_4 || ''
    ].filter(url => !!url);

    function crearDotsHTML(index, total) {
        return `<button class="obra-carousel-dot${index === 0 ? ' active' : ''}" data-index="${index}"></button>`;
    }

    const slides = urls.map((url, i) => `
        <div class="obra-carousel-slide">
            <img src="${url}" alt="Imagen ${i + 1} de obra" loading="${i === 0 ? 'eager' : 'lazy'}">
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
            ${avatarHTML}
            <div class="obra-carousel-dots">
                ${dots}
            </div>
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

    // Soporte táctil (swipe) — deshabilitado cuando la lupa está activa
    const viewport = track.parentElement;

    track.addEventListener('touchstart', (e) => {
        if (viewport.classList.contains('lupa-activa')) return;
        startX = e.touches[0].clientX;
        isDragging = true;
        track.style.transition = 'none';
    }, { passive: true });

    track.addEventListener('touchmove', (e) => {
        if (!isDragging || viewport.classList.contains('lupa-activa')) return;
        const diff = e.touches[0].clientX - startX;
        const containerWidth = viewport.offsetWidth;
        dragOffset = (diff / containerWidth) * 100;
        const baseOffset = -currentIndex * 100;
        track.style.transform = `translateX(${baseOffset + dragOffset}%)`;
    }, { passive: true });

    track.addEventListener('touchend', () => {
        if (viewport.classList.contains('lupa-activa')) return;
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
    track.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        isDragging = true;
        track.style.transition = 'none';
        track.style.cursor = 'grabbing';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const diff = e.clientX - startX;
        const containerWidth = track.parentElement.offsetWidth;
        dragOffset = (diff / containerWidth) * 100;
        const baseOffset = -currentIndex * 100;
        track.style.transform = `translateX(${baseOffset + dragOffset}%)`;
    });

    window.addEventListener('mouseup', () => {
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
    });
}

function crearObraCard(obra) {
    const card = document.createElement('div');
    card.className = 'obra-card';

    const nombreArtista = obra.artista || 'Artista';
    const inicial = nombreArtista.charAt(0).toUpperCase();
    // Usar foto de perfil de la obra o del usuario logueado como fallback
    const fotoArtista = obra.foto_artista || (artistaActual && artistaActual.foto_perfil) || '';
    const tieneAvatar = !!fotoArtista;
    const titulo = obra.titulo || 'Sin título';
    const precio = obra.precio || 'N/A';

    const avatarHTML = tieneAvatar 
        ? `<img src="${fotoArtista}" alt="${nombreArtista}" class="obra-avatar-esquina">`
        : `<div class="obra-avatar-esquina-placeholder">${inicial}</div>`;

    const carruselHTML = crearCarruselHTML(obra, avatarHTML);

    card.innerHTML = `
        <!-- Header: nombre del artista -->
        <div class="obra-header">
            <span class="obra-header-nombre">${nombreArtista}</span>
        </div>

        <!-- Barra de métricas (izquierda, vertical) -->
        <div class="obra-metricas-bar">
            <span class="metrica-item">${ICON_OJO} <span>0</span></span>
            <span class="metrica-item">${ICON_COMENTARIO} <span>0</span></span>
            <span class="metrica-item">${ICON_LIKE} <span>0</span></span>
            <span class="metrica-item metrica-item--lupa">${ICON_LUPA}</span>
        </div>

        <!-- Carrusel de imágenes (incluye avatar y dots) -->
        ${carruselHTML}

        <!-- Barra inferior: título + precio -->
        <div class="obra-footer">
            <div class="obra-footer-info">
                <div class="obra-footer-titulo">
                    <span class="footer-titulo-texto">${titulo}</span>
                </div>
                <div class="obra-footer-precio">$${precio}</div>
            </div>
        </div>
    `;

    // Inicializar carrusel y lupa después de agregar al DOM
    requestAnimationFrame(() => {
        initCarrusel(card);
        initLupa(card);
    });

    return card;
}

/**
 * Inicializa la lupa: toggle desde el icono, lente circular que sigue mouse/touch
 * y muestra la imagen con zoom 6x.
 * 
 * En móvil usa tracking relativo: el primer toque (en cualquier parte) fija el
 * punto de referencia, y el lente se mueve proporcionalmente al arrastre.
 */
function initLupa(card) {
    const btnLupa = card.querySelector('.metrica-item--lupa');
    const viewport = card.querySelector('.obra-carousel-viewport');
    if (!btnLupa || !viewport) return;

    // Crear el lente de lupa
    const lens = document.createElement('div');
    lens.className = 'obra-lens';
    viewport.appendChild(lens);

    let lupaActiva = false;
    // Para tracking relativo en touch
    let touchOriginX = 0;
    let touchOriginY = 0;
    let lensStartX = 0;
    let lensStartY = 0;
    let inspectStartX = 0;
    let inspectStartY = 0;
    let touchActive = false;

    // --- HELPERS para obtener el slide activo y su imagen ---
    function getActiveSlideImg() {
        const activeDot = card.querySelector('.obra-carousel-dot.active');
        const track = card.querySelector('.obra-carousel-track');
        if (!track) return null;
        const slides = track.querySelectorAll('.obra-carousel-slide');
        if (slides.length === 0) return null;
        const index = activeDot ? parseInt(activeDot.dataset.index) : 0;
        const slide = slides[index] || slides[0];
        return slide ? slide.querySelector('img') : slides[0].querySelector('img');
    }

    function getScaleFactor() {
        return viewport.offsetWidth / viewport.getBoundingClientRect().width;
    }

    // Centrar el lente en la imagen (usado al activar)
    function centerLens() {
        const img = getActiveSlideImg();
        if (!img) return;
        lens.style.display = 'block';
        lens.style.backgroundImage = `url(${img.src})`;
        const lensW = lens.offsetWidth;
        const lensH = lens.offsetHeight;
        const cx = (viewport.offsetWidth - lensW) / 2;
        const cy = (viewport.offsetHeight - lensH) / 2;
        lens.style.left = (cx + lensW / 2) + 'px';
        lens.style.top = (cy + lensH / 2) + 'px';
        lens.style.backgroundPosition = '50% 50%';
        lens.classList.add('visible');
    }

    // --- Posicionar lente y actualizar background (mouse: absoluto; touch: relativo) ---
    function moveLens(e) {
        if (!lupaActiva) return;
        const img = getActiveSlideImg();
        if (!img) return;

        lens.style.display = 'block';
        lens.style.backgroundImage = `url(${img.src})`;

        const viewportRect = viewport.getBoundingClientRect();
        const lensW = lens.offsetWidth;
        const lensH = lens.offsetHeight;
        const sf = getScaleFactor();

        let clientX, clientY;
        const isTouch = !!e.touches;
        if (isTouch) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
            e.preventDefault();
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        let inspectX, inspectY;
        if (isTouch && touchActive) {
            // Tracking relativo: mover proporcionalmente al delta desde el origen
            const deltaX = (clientX - touchOriginX) * sf;
            const deltaY = (clientY - touchOriginY) * sf;
            inspectX = inspectStartX + deltaX;
            inspectY = inspectStartY + deltaY;
        } else {
            // Modo absoluto (mouse o primer toque)
            inspectX = (clientX - viewportRect.left) * sf;
            inspectY = (clientY - viewportRect.top) * sf;
        }

        // Clampear punto de inspección dentro del viewport
        inspectX = Math.max(0, Math.min(inspectX, viewport.offsetWidth));
        inspectY = Math.max(0, Math.min(inspectY, viewport.offsetHeight));

        // Offset para que el dedo no tape el lente (solo en touch)
        const offsetX = isTouch ? -55 : 0;
        const offsetY = isTouch ? -65 : 0;

        // Posición del lente
        let lensCX = inspectX + offsetX;
        let lensCY = inspectY + offsetY;
        const halfW = lensW / 2;
        const halfH = lensH / 2;
        lensCX = Math.max(halfW, Math.min(lensCX, viewport.offsetWidth - halfW));
        lensCY = Math.max(halfH, Math.min(lensCY, viewport.offsetHeight - halfH));

        lens.style.left = lensCX + 'px';
        lens.style.top = lensCY + 'px';
        lens.classList.add('visible');

        // Background-position desde el punto de inspección
        const bgX = (inspectX / viewport.offsetWidth) * 100;
        const bgY = (inspectY / viewport.offsetHeight) * 100;
        lens.style.backgroundPosition = `${bgX}% ${bgY}%`;
    }

    function hideLens() {
        lens.classList.remove('visible');
        lens.style.display = 'none';
    }

    // --- Touch: iniciar tracking relativo desde donde el usuario ponga el dedo ---
    function onTouchStart(e) {
        if (!lupaActiva) return;
        const touch = e.touches[0];
        touchOriginX = touch.clientX;
        touchOriginY = touch.clientY;
        const sf = getScaleFactor();
        const viewportRect = viewport.getBoundingClientRect();
        // Punto de inspección actual (donde está el lente ahora mapeado al viewport)
        const currentLeft = parseFloat(lens.style.left) || viewport.offsetWidth / 2;
        const currentTop = parseFloat(lens.style.top) || viewport.offsetHeight / 2;
        // El lente está desplazado por el offset, así que revertimos para obtener inspect
        inspectStartX = currentLeft + 55; // revertir offsetX
        inspectStartY = currentTop + 65;  // revertir offsetY
        lensStartX = currentLeft;
        lensStartY = currentTop;
        touchActive = true;
    }

    function onTouchEnd(e) {
        if (!lupaActiva) return;
        touchActive = false;
    }

    // --- Toggle al hacer clic en la lupa ---
    btnLupa.addEventListener('click', () => {
        lupaActiva = !lupaActiva;
        if (lupaActiva) {
            // Activar
            btnLupa.classList.remove('desactivando');
            btnLupa.classList.add('activo');
            viewport.classList.add('lupa-activa');
            // Mostrar lente en el centro de la imagen
            centerLens();
        } else {
            // Desactivar con animación
            btnLupa.classList.remove('activo');
            btnLupa.classList.add('desactivando');
            viewport.classList.remove('lupa-activa');
            hideLens();
            touchActive = false;
            // Limpiar la clase de animación al terminar
            setTimeout(() => {
                btnLupa.classList.remove('desactivando');
            }, 550);
        }
    });

    // --- Eventos de mouse (solo dentro del viewport) ---
    viewport.addEventListener('mousemove', moveLens);
    viewport.addEventListener('mouseleave', hideLens);

    // --- Eventos táctiles globales ---
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', (e) => {
        if (!lupaActiva) return;
        moveLens(e);
    }, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
}

export function mostrarGaleria(obras, container, onDetalle) {
    container.innerHTML = '';
    if (!obras || obras.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--color-gray-400); padding: 2rem;">No hay obras disponibles.</p>';
        return;
    }
    obras.forEach(obra => {
        const card = crearObraCard(obra);
        container.appendChild(card);
    });
}

// Función auxiliar para construir URL optimizada de Cloudinary
function cloudinaryUrl(originalUrl, width, height) {
    if (!originalUrl) return '';
    const parts = originalUrl.split('/upload/');
    if (parts.length !== 2) return originalUrl;
    return `${parts[0]}/upload/w_${width},h_${height},c_limit,q_auto:good/${parts[1]}`;
}