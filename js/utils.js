// js/utils.js
// Funciones auxiliares compartidas por todos los módulos

import { showError } from './notificaciones.js';

/**
 * Decodifica entidades HTML (ej: "&#x2F;" -> "/", "&amp;" -> "&").
 * El backend usa express-validator .escape() que codifica caracteres
 * especiales al guardar; esto los revierte para que el valor coincida
 * con las opciones de los <select> al editar o duplicar una obra.
 */
export function decodeHTMLEntities(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x2F;/g, '/')
        .replace(/&#39;/g, "'");
}

/**
 * Muestra errores de validación del backend en formato amigable.
 */
export function mostrarErrores(result) {
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const mensaje = result.errors.join('\n• ');
        showError('Se encontraron los siguientes errores:\n\n• ' + mensaje);
    } else if (result.error) {
        showError('Error: ' + result.error);
    } else {
        showError('Ocurrió un error inesperado. Inténtalo de nuevo.');
    }
}

/**
 * Debounce genérico para limitar frecuencia de llamadas.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Escapa HTML para prevenir XSS al insertar datos de usuario en el DOM.
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// LOGGING CONDICIONAL (solo en desarrollo)
// ============================================
const isDebug = () => {
    try { return localStorage.getItem('DEBUG') === 'true'; } catch (e) { return false; }
};

/** Reemplaza console.* — solo imprime si DEBUG=true en localStorage. */
export const debugLog = {
    log:   (...args) => { if (isDebug()) console.log(...args); },
    warn:  (...args) => { if (isDebug()) console.warn(...args); },
    error: (...args) => { if (isDebug()) console.error(...args); }
};

// ============================================
// URL DE CLOUDINARY CON TRANSFORMACIONES (1080p, WebP, calidad optimizada)
// ============================================
/**
 * Inserta parámetros de transformación en una URL de Cloudinary.
 * @param {string} url - URL original de Cloudinary
 * @param {number} width - Ancho deseado (default 1080)
 * @returns {string} URL transformada
 */
export function cloudinaryUrl(url, width = 1080) {
    if (!url) return '';
    const parts = url.split('/upload/');
    if (parts.length !== 2) return url;
    return `${parts[0]}/upload/w_${width},c_limit,f_auto,q_auto:good/${parts[1]}`;
}
