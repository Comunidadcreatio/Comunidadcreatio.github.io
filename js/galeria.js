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
const ICON_INSTAGRAM = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
const ICON_WHATSAPP = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const ICON_FACEBOOK = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>';
const ICON_TELEGRAM = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
const ICON_X = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733-16z"/><path d="M4 20l6.768-6.768m2.46-2.46L20 4"/></svg>';
const ICON_TRIANGULO_ABAJO = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>';
const ICON_TRIANGULO_ARRIBA = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>';
const ICON_TRIANGULO_IZQ = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M15 7l-5 5 5 5V7z"/></svg>';
const ICON_TRIANGULO_DER = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M10 7l5 5-5 5V7z"/></svg>';
const ICON_AVION = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
const ICON_PERSONA = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const ICON_ME_GUSTA_MINI = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>';
const ICON_COMENTARIO_MINI = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

// Comentarios de ejemplo (Lorem ipsum)
const COMENTARIOS_EJEMPLO = [
    { nombre: 'Anónimo', texto: 'Hermosa obra, los colores y la composición transmiten una energía increíble. ¡Felicitaciones al artista!', likes: 0, respuestas: 0 },
    { nombre: 'Andrés', texto: 'Me encanta el contraste entre las luces y sombras. Definitivamente una pieza que destaca.', likes: 0, respuestas: 0 },
    { nombre: 'María', texto: 'La técnica utilizada es impresionante. Se nota el dominio del artista en cada detalle.', likes: 0, respuestas: 0 },
];

function generarComentariosHTML() {
    return COMENTARIOS_EJEMPLO.map(c => `
        <div class="comentario-item">
            <div class="comentario-header">
                <div class="comentario-avatar">${ICON_PERSONA}</div>
                <span class="comentario-nombre">${c.nombre}</span>
            </div>
            <div class="comentario-texto">${c.texto}</div>
            <div class="comentario-acciones">
                <button class="mini-accion">${ICON_ME_GUSTA_MINI} ${c.likes}</button>
                <button class="mini-accion">${ICON_COMENTARIO_MINI} ${c.respuestas}</button>
            </div>
        </div>
    `).join('');
}

function crearObraCard(obra) {
    const card = document.createElement('div');
    card.className = 'obra-card';

    const imgSrc = obra.imagen_thumbnail_url || obra.imagen_url || '';
    const nombreArtista = obra.artista || 'Artista';
    const inicial = nombreArtista.charAt(0).toUpperCase();
    const tieneAvatar = !!(obra.foto_artista);
    const titulo = obra.titulo || 'Sin título';
    const precio = obra.precio || 'N/A';

    card.innerHTML = `
        <!-- Header: nombre + métricas (avatar está dentro de la imagen) -->
        <div class="obra-header">
            <div class="obra-header-info">
                <span class="obra-header-nombre">${nombreArtista}</span>
                <div class="obra-header-metricas">
                    <span class="metrica-item">${ICON_OJO} <span>0</span></span>
                    <span class="metrica-item">${ICON_LIKE} <span>0</span></span>
                </div>
            </div>
        </div>

        <!-- Panel redes sociales (izquierda) -->
        <div class="obra-redes-sociales collapsed">
            <div class="obra-redes-bar">
                <div class="redes-icons">
                    <a href="#" title="Instagram">${ICON_INSTAGRAM}</a>
                    <a href="#" title="WhatsApp">${ICON_WHATSAPP}</a>
                    <a href="#" title="Facebook">${ICON_FACEBOOK}</a>
                    <a href="#" title="Telegram">${ICON_TELEGRAM}</a>
                    <a href="#" title="X">${ICON_X}</a>
                </div>
                <button class="obra-redes-toggle" title="Expandir redes sociales">${ICON_TRIANGULO_ARRIBA}</button>
            </div>
        </div>

        <!-- Imagen principal + avatar anclado a la esquina -->
        <div class="obra-imagen-container">
            ${tieneAvatar 
                ? `<img src="${obra.foto_artista}" alt="${nombreArtista}" class="obra-avatar-esquina">`
                : `<div class="obra-avatar-esquina-placeholder">${inicial}</div>`
            }
            <img src="${imgSrc}" alt="${titulo}" class="obra-imagen" loading="lazy">
        </div>

        <!-- Panel comentarios (derecha) -->
        <div class="obra-comentarios collapsed">
            <div class="obra-comentarios-panel">
                <div class="obra-comentarios-header">
                    <button class="obra-comentarios-toggle" title="Expandir comentarios">${ICON_TRIANGULO_IZQ}</button>
                </div>
                <div class="obra-comentarios-lista">
                    ${generarComentariosHTML()}
                </div>
                <div class="obra-comentarios-input">
                    <input type="text" placeholder="¿Qué te parece esta obra?">
                    <button title="Enviar comentario">${ICON_AVION}</button>
                </div>
            </div>
        </div>

        <!-- Barra inferior: título + precio -->
        <div class="obra-footer">
            <div class="obra-footer-info">
                <div class="obra-footer-titulo">
                    <span class="footer-toggle-icon">${ICON_TRIANGULO_IZQ}</span>
                    <span class="footer-titulo-texto">${titulo}</span>
                </div>
                <div class="obra-footer-precio">$${precio}</div>
            </div>
        </div>
    `;

    // --- Event listeners para colapsar/expandir paneles ---

    // Redes sociales
    const redesToggle = card.querySelector('.obra-redes-toggle');
    const redesPanel = card.querySelector('.obra-redes-sociales');
    if (redesToggle && redesPanel) {
        redesToggle.addEventListener('click', () => {
            redesPanel.classList.toggle('collapsed');
            // Actualizar ícono
            redesToggle.innerHTML = redesPanel.classList.contains('collapsed') 
                ? ICON_TRIANGULO_ARRIBA 
                : ICON_TRIANGULO_ABAJO;
        });
    }

    // Comentarios
    const comentToggle = card.querySelector('.obra-comentarios-toggle');
    const comentPanel = card.querySelector('.obra-comentarios');
    if (comentToggle && comentPanel) {
        comentToggle.addEventListener('click', () => {
            comentPanel.classList.toggle('collapsed');
            comentToggle.innerHTML = comentPanel.classList.contains('collapsed') 
                ? ICON_TRIANGULO_IZQ 
                : ICON_TRIANGULO_DER;
        });
    }

    // Barra inferior (título)
    const footerDiv = card.querySelector('.obra-footer');
    const footerToggle = card.querySelector('.obra-footer-titulo');
    if (footerToggle && footerDiv) {
        footerToggle.addEventListener('click', () => {
            footerDiv.classList.toggle('collapsed');
        });
    }

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