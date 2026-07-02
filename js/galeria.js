// js/galeria.js
import { API_BASE_URL, apiRequest } from './config.js';

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
    // Mostrar skeleton loader inmediatamente
    container.innerHTML = generarSkeletonGaleria();
    container.setAttribute('aria-busy', 'true');
    
    try {
        const data = await apiRequest('/obras');
        // Si apiRequest devolvió un error (success: false)
        if (data && data.success === false) {
            console.error('Error al cargar galería:', data.error);
            container.innerHTML = '<p>Error al cargar las obras.</p>';
            container.setAttribute('aria-busy', 'false');
            return [];
        }
        // Si es un array de obras, devolverlo
        container.setAttribute('aria-busy', 'false');
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Error al cargar la galería:", error);
        container.innerHTML = '<p>Error al cargar las obras.</p>';
        container.setAttribute('aria-busy', 'false');
        return [];
    }
}

export function mostrarGaleria(obras, container, onDetalle) {
    container.innerHTML = '';
    obras.forEach(obra => {
        const card = document.createElement('div');
        card.className = 'obra-card';
        // ✅ Usar la miniatura predefinida (imagen_thumbnail_url) si existe
        const imgSrc = obra.imagen_thumbnail_url || obra.imagen_url || '';
        card.innerHTML = `
            <img src="${imgSrc}" alt="${obra.titulo}">
            <h3>${obra.titulo}</h3>
            <p>${obra.artista}</p>
            <p>Precio: $${obra.precio || 'N/A'}</p>
            <button data-id="${obra.id}">Ver Detalles</button>
        `;
        card.querySelector('button').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            onDetalle(id);
        });
        container.appendChild(card);
    });
}

// Función auxiliar para construir URL optimizada
function cloudinaryUrl(originalUrl, width, height) {
    if (!originalUrl) return '';
    // Ejemplo: https://res.cloudinary.com/.../image/upload/v123/obra.jpg
    // Cambiar a: https://res.cloudinary.com/.../image/upload/w_300,h_300,c_limit,q_auto:good/v123/obra.jpg
    const parts = originalUrl.split('/upload/');
    if (parts.length !== 2) return originalUrl;
    return `${parts[0]}/upload/w_${width},h_${height},c_limit,q_auto:good/${parts[1]}`;
}