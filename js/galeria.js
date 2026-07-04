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
 * y muestra la imagen con zoom 3x.
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

    // --- HELPERS para obtener el slide activo y su imagen ---
    function getActiveSlideImg() {
        const track = card.querySelector('.obra-carousel-track');
        if (!track) return null;
        const computedTransform = getComputedStyle(track).transform;
        // Por defecto usamos el primer slide
        const slides = track.querySelectorAll('.obra-carousel-slide');
        if (slides.length === 0) return null;
        // Intentamos deducir el índice desde la matriz de transformación
        // pero es más seguro usar la clase active del dot
        const activeDot = card.querySelector('.obra-carousel-dot.active');
        const index = activeDot ? parseInt(activeDot.dataset.index) : 0;
        const slide = slides[index];
        return slide ? slide.querySelector('img') : slides[0].querySelector('img');
    }

    // --- Posicionar lente y actualizar background ---
    function moveLens(e) {
        if (!lupaActiva) return;
        const img = getActiveSlideImg();
        if (!img) return;

        lens.style.display = 'block';
        lens.style.backgroundImage = `url(${img.src})`;

        const viewportRect = viewport.getBoundingClientRect();
        const lensW = lens.offsetWidth;
        const lensH = lens.offsetHeight;

        // Obtener coordenadas (mouse o touch)
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
            e.preventDefault();
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Factor de escala: viewport.offsetWidth es el tamaño de layout (410px),
        // viewportRect.width es el tamaño visual (afectado por scale() en responsive)
        const scaleFactor = viewport.offsetWidth / viewportRect.width;

        // Posición del lente centrado en el cursor, mapeada al espacio de layout
        let lensX = (clientX - viewportRect.left) * scaleFactor - lensW / 2;
        let lensY = (clientY - viewportRect.top) * scaleFactor - lensH / 2;

        // Clampear dentro del viewport (usando tamaño de layout)
        lensX = Math.max(0, Math.min(lensX, viewport.offsetWidth - lensW));
        lensY = Math.max(0, Math.min(lensY, viewport.offsetHeight - lensH));

        lens.style.left = (lensX + lensW / 2) + 'px';
        lens.style.top = (lensY + lensH / 2) + 'px';
        lens.classList.add('visible');

        // Calcular background-position para el zoom (en espacio de layout)
        const cursorRelX = ((clientX - viewportRect.left) * scaleFactor) / viewport.offsetWidth;
        const cursorRelY = ((clientY - viewportRect.top) * scaleFactor) / viewport.offsetHeight;

        const bgX = cursorRelX * 100;
        const bgY = cursorRelY * 100;

        lens.style.backgroundPosition = `${bgX}% ${bgY}%`;
    }

    function hideLens() {
        lens.classList.remove('visible');
        lens.style.display = 'none';
    }

    // --- Toggle al hacer clic en la lupa ---
    btnLupa.addEventListener('click', () => {
        lupaActiva = !lupaActiva;
        if (lupaActiva) {
            // Activar
            btnLupa.classList.remove('desactivando');
            btnLupa.classList.add('activo');
            viewport.classList.add('lupa-activa');
        } else {
            // Desactivar con animación
            btnLupa.classList.remove('activo');
            btnLupa.classList.add('desactivando');
            viewport.classList.remove('lupa-activa');
            hideLens();
            // Limpiar la clase de animación al terminar
            setTimeout(() => {
                btnLupa.classList.remove('desactivando');
            }, 550);
        }
    });

    // --- Eventos de mouse ---
    viewport.addEventListener('mousemove', moveLens);
    viewport.addEventListener('mouseleave', hideLens);

    // --- Eventos táctiles ---
    viewport.addEventListener('touchmove', moveLens, { passive: false });
    viewport.addEventListener('touchend', hideLens);
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