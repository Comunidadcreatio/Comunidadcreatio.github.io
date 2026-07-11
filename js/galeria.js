// js/galeria.js
import { API_BASE_URL, apiRequest } from './config.js';
import { artistaActual } from './auth.js';

export async function cargarGaleria(container) {
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
const ICON_CORAZON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
const ICON_COMENTARIO = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

/**
 * Crea el HTML del carrusel de imágenes para una obra.
 * Soporta hasta 5 imágenes (imagen_url, imagen_url_1..4).
 * Acepta avatarHTML para insertarlo dentro del carrusel (posición esquina).
 */
function crearCarruselHTML(obra) {
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
    const fotoArtista = obra.foto_artista || '';
    const tieneAvatar = !!fotoArtista;
    const titulo = obra.titulo || 'Sin título';
    const precio = obra.precio || 'N/A';

    const avatarHTML = tieneAvatar 
        ? `<img src="${fotoArtista}" alt="${nombreArtista}" class="obra-avatar-round">`
        : `<div class="obra-avatar-placeholder">${inicial}</div>`;

    const carruselHTML = crearCarruselHTML(obra);

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

            <!-- Carrusel de imágenes -->
            ${carruselHTML}

            <!-- Barra inferior sólida: métricas + botón ver detalles -->
            <div class="obra-metricas-bar">
                <div class="metrica-left">
                    <span class="metrica-item">${ICON_OJO} <span>0</span></span>
                    <span class="metrica-item">${ICON_COMENTARIO} <span>0</span></span>
                    <span class="metrica-item">${ICON_CORAZON} <span>0</span></span>
                </div>
                <button class="btn-ver-detalles">Ver detalles</button>
            </div>
        </div>
    `;

    // Inicializar carrusel después de agregar al DOM
    requestAnimationFrame(() => initCarrusel(card));

    return card;
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