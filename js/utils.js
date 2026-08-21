// js/utils.js
// Funciones auxiliares compartidas por todos los módulos

import { showError } from './notificaciones.js?v=d2867c8ca0';

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

/**
 * Renderiza texto de usuario de forma segura ante XSS.
 * El backend escapa con express-validator .escape() en algunos campos y en
 * otros no; esta función normaliza AMBOS casos a la misma salida segura:
 *   1) decodeHTMLEntities() revierte el escapado del backend (si existe).
 *   2) escapeHtml() vuelve a escapar para inserción en el DOM.
 * Resultado: el texto se muestra idéntico y nunca se interpreta como HTML.
 */
export function renderText(str) {
    return escapeHtml(decodeHTMLEntities(str));
}

/**
 * Normaliza texto para comparaciones: minúsculas y sin tildes/acentos.
 * Útil para etiquetas: 'Óleo' y 'oleo' deben coincidir.
 */
export function normalizarTexto(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/**
 * Sanea URLs para atributos src de imágenes.
 *  - Solo permite http(s) o data:image/... (bloquea javascript:, data:text/html, etc.)
 *  - Neutraliza comillas dobles para no romper el atributo (no-op si el backend ya escapó).
 */
export function safeImgUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (!/^(https?:|data:image\/)/i.test(u)) return '';
    return u.replace(/"/g, '&quot;');
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

// ============================================
// VALIDACIÓN DE EMAIL (compartida con registro y cambio de email)
// ============================================

/** Dominios de correo desechable / temporal conocidos */
const DOMINIOS_DESECHABLES = [...new Set([
    'mailinator.com', 'tempmail.com', 'guerrillamail.com', 'throwam.com',
    'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'guerrillamail.info',
    'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
    'spam4.me', 'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.at',
    'trashmail.io', 'trashmail.xyz', 'yopmail.com', 'yopmail.fr', 'cool.fr.nf',
    'jetable.fr.nf', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',
    'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
    'dispostable.com', 'mailnull.com', 'maildrop.cc', 'discard.email',
    'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
    'fakeinbox.com', 'tempr.email',
    'spamthisplease.com', 'binkmail.com', 'bobmail.info', 'chammy.info',
    'devnullmail.com', 'ditchymail.com', 'dontmailme.org', 'dump-email.info',
    'fudgerub.com', 'iheartspam.org', 'jetable.com', 'jetable.net', 'jetable.org',
    'klzlk.com', 'lol.ovpn.to', 'lookugly.com', 'lortemail.dk', 'mail.mezimages.net',
    'mailscrap.com', 'meltmail.com', 'migmail.net', 'migumail.com', 'mintemail.com',
    'mt2009.com', 'mx0.wwwnew.eu', 'mytrashmail.com', 'noclickemail.com',
    'nogmailspam.info', 'nospamfor.us', 'nowmymail.com', 'objectmail.com',
    'obobbo.com', 'onewaymail.com', 'pookmail.com', 'proxymail.eu', 'rcpt.at',
    'rfc822.org', 's0ny.net', 'safe-mail.net', 'shortmail.net', 'skeefmail.com',
    'slopsbox.com', 'smellfear.com', 'snkmail.com', 'sofimail.com', 'sogetthis.com',
    'soodonims.com', 'spam.la', 'spamavert.com', 'spambox.us', 'spamcannon.com',
    'spamcannon.net', 'spamcon.org', 'spamevader.net', 'spamfree24.org',
    'spamgob.com', 'spamherelots.com', 'spamhereplease.com', 'spamhole.com',
    'spamify.com', 'spaminator.de', 'spamkill.info', 'spaml.de', 'spammotel.com',
    'spamobox.com', 'spamoff.de', 'spamslicer.com', 'spamspot.com',
    'spamtrail.com', 'spamtrap.ro',
    'supergreatmail.com', 'supermailer.jp', 'suremail.info', 'tempe-mail.com',
    'tempinbox.co.uk', 'tempinbox.com', 'temporary-mail.net', 'temporaryemail.net',
    'temporaryemail.us', 'temporaryforwarding.com', 'temporaryinbox.com',
    'temporarymailaddress.com', 'thanksnospam.info', 'thisisnotmyrealemail.com',
    'throwaway.email', 'tilien.com', 'tittbit.in', 'tmailinator.com',
    'tosunkaya.com', 'tradermail.info', 'trash-mail.com', 'trash-mail.de',
    'trash-mail.ga', 'trash-mail.io', 'trash-mail.me', 'trash-mail.net',
    'trashdevil.com', 'trashdevil.de', 'trashemail.de', 'trashimail.com',
    'trashinbox.com', 'trashmail.de',
    'trashmail.org', 'trashmailer.com', 'trashtimail.com', 'trashtymail.com',
    'trbvm.com', 'turual.com', 'twinmail.de', 'tyldd.com', 'uggsrock.com',
    'uroid.com', 'us.af', 'venompen.com', 'veryrealemail.com', 'viditag.com',
    'viewcastmedia.com', 'viewcastmedia.net', 'viewcastmedia.org', 'webemail.me',
    'webm4il.info', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
    'wilemail.com', 'willselfdestruct.com', 'wuzupmail.net', 'xagloo.com',
    'xemaps.com', 'xents.com', 'xmaily.com', 'xoxy.net', 'xyzfree.net',
    'yep.it', 'yogamaven.com', 'yourdomain.com', 'ypmail.webarnak.fr.eu.org',
    'yuurok.com', 'z1p.biz', 'za.com', 'zehnminuten.de', 'zehnminutenmail.de',
    'zippymail.info', 'zoemail.net', 'zomg.info', 'temp-mail.org', 'temp-mail.io',
    'tempmail.net', 'tempmail.org', 'tempmail.de', 'tempmail.co', 'tempemail.net',
    'mohmal.com', 'mailnesia.com', 'crazymailing.com'
])];

/** TLDs válidos más comunes */
const TLDS_VALIDOS = [
    'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
    'co', 've', 'mx', 'ar', 'cl', 'pe', 'ec', 'bo', 'py', 'uy', 'cr', 'gt',
    'hn', 'sv', 'ni', 'pa', 'do', 'cu', 'pr', 'ht', 'jm', 'tt', 'bb', 'lc', 'vc',
    'gd', 'ag', 'dm', 'kn', 'us', 'ca', 'es', 'fr', 'de', 'it', 'pt', 'uk', 'io',
    'info', 'biz', 'app', 'dev', 'online', 'site', 'web', 'store', 'shop', 'tech',
    'media', 'news', 'blog', 'art', 'music', 'live', 'pro', 'plus', 'studio',
    'digital', 'solutions', 'services', 'global', 'world', 'network', 'group',
    'com.ve', 'net.ve', 'org.ve', 'co.ve', 'com.mx', 'com.ar', 'com.co',
    'com.pe', 'com.ec', 'com.bo', 'com.py', 'com.uy', 'com.gt', 'com.hn',
    'com.sv', 'com.ni', 'com.pa', 'com.do', 'com.cu', 'com.pr', 'co.uk',
    'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'edu.mx', 'gob.ve', 'gob.mx'
];

export function esEmailValido(email) {
    const trimmed = email.trim().toLowerCase();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(trimmed)) return false;
    const dominio = trimmed.split('@')[1];
    if (!dominio || dominio.length < 4) return false;
    const partes = dominio.split('.');
    if (partes.length < 2) return false;
    const tld = partes[partes.length - 1];
    if (tld.length < 2 || tld.length > 10) return false;
    return true;
}

export function esDominioDesechable(email) {
    const dominio = email.trim().toLowerCase().split('@')[1] || '';
    return DOMINIOS_DESECHABLES.includes(dominio);
}

export function esTLDSospechoso(email) {
    const dominio = email.trim().toLowerCase().split('@')[1] || '';
    const partes = dominio.split('.');
    const tld = partes[partes.length - 1];
    const dominioCompleto = partes.slice(-2).join('.');
    return !TLDS_VALIDOS.includes(tld) && !TLDS_VALIDOS.includes(dominioCompleto);
}
