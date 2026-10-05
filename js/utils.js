// @ts-check
// js/utils.js
// Funciones auxiliares compartidas por todos los módulos
//
// Este fichero está VIGILADO por el chequeo de tipos (`npm run check`). Es el más
// importado de todos (15 ficheros) y aquí viven las funciones de seguridad
// (escapeHtml, renderText, safeImgUrl), así que es donde más renta tener tipos.
// Para adoptar otro módulo: ponle `// @ts-check` en la primera línea y arregla lo que
// salga. Un fichero adoptado no se puede volver a romper sin que el chequeo avise.

import { showError } from './notificaciones.js?v=a2dfb905a6';

/**
 * Decodifica entidades HTML (ej: "&#x2F;" -> "/", "&amp;" -> "&").
 * El backend usa express-validator .escape() que codifica caracteres
 * especiales al guardar; esto los revierte para que el valor coincida
 * con las opciones de los <select> al editar o duplicar una obra.
 * @param {unknown} str
 * @returns {string}
 */
export function decodeHTMLEntities(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        // &amp; va PRIMERO a propósito: además de lo suyo, recompone los valores
        // que quedaron doblemente escapados ("&amp;#x2F;") por el bug que volvía
        // a guardar el título ya escapado, así se recuperan en una sola pasada.
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        // Entidades que produce express-validator .escape() (validator 13.x):
        .replace(/&#x2F;/gi, '/')
        .replace(/&#x5C;/gi, '\\')
        .replace(/&#x60;/gi, '`')
        .replace(/&#x27;/gi, "'")
        // Variantes de apóstrofo de otros orígenes (datos antiguos):
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

// Campos de texto de una obra que el backend guarda escapados (.escape()).
// Se decodifican al recibir la obra del API para que TODO lo que la pinte
// (tarjetas, franjas, modal, listas) muestre el texto real y no entidades como
// "&#x2F;" o "&#x27;".
const CAMPOS_TEXTO_OBRA = [
    'titulo', 'artista', 'descripcion_tecnica', 'descripcion_artistica', 'soporte',
    'procedencia', 'marcos', 'certificado', 'firma', 'conservacion', 'etiquetas'
];

export function decodificarObra(obra) {
    if (!obra || typeof obra !== 'object') return obra;
    CAMPOS_TEXTO_OBRA.forEach((campo) => {
        if (typeof obra[campo] === 'string') obra[campo] = decodeHTMLEntities(obra[campo]);
    });
    return obra;
}

// Límite de subida del backend (multer: fileSize 10 MB en obras y problogs).
export const MAX_IMAGEN_BYTES = 10 * 1024 * 1024;

/**
 * Valida un archivo elegido antes de usarlo como imagen.
 * Devuelve el mensaje de error, o null si el archivo sirve.
 * Sin esto, un archivo enorme llegaba al servidor y multer lo rechazaba con un
 * 500 genérico ("Error interno") que no dice nada al usuario.
 */
export function errorDeImagen(file) {
    if (!file) return 'No se eligió ningún archivo.';
    if (!/^image\//.test(file.type || '')) {
        return 'El archivo debe ser una imagen (JPG, PNG…).';
    }
    if (file.size > MAX_IMAGEN_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        return 'La imagen pesa ' + mb + ' MB y el máximo son 10 MB. Usa una más ligera.';
    }
    return null;
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
 * @param {unknown} str  Cualquier valor; se convierte a texto.
 * @returns {string}
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
 * @param {unknown} str
 * @returns {string}
 */
export function renderText(str) {
    return escapeHtml(decodeHTMLEntities(str));
}

/**
 * Normaliza texto para comparaciones: minúsculas y sin tildes/acentos.
 * Útil para etiquetas: 'Óleo' y 'oleo' deben coincidir.
 * @param {unknown} str
 * @returns {string}
 */
export function normalizarTexto(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/**
 * Sanea URLs para atributos src de imágenes.
 *  - Solo permite http(s), data:image/... o blob: (bloquea javascript:,
 *    data:text/html, etc.). `blob:` lo genera la propia página al elegir un
 *    archivo, así que no puede venir de fuera; hace falta para las vistas
 *    previas locales (las imágenes aún sin subir).
 *  - Neutraliza comillas dobles para no romper el atributo (no-op si el backend ya escapó).
 * @param {unknown} url
 * @returns {string}
 */
export function safeImgUrl(url) {
    if (!url) return '';
    const u = String(url).trim();
    if (!/^(https?:|data:image\/|blob:)/i.test(u)) return '';
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
// MOVIMIENTO Y ACCESIBILIDAD
// ============================================
/**
 * ¿El usuario ha pedido MENOS MOVIMIENTO? (ajuste del sistema operativo).
 *
 * El CSS ya lo respeta solo: en style.css hay un bloque con `prefers-reduced-motion: reduce`
 * que deja las animaciones y transiciones en 0,01ms. Pero eso NO alcanza a lo que se pide
 * desde JavaScript: `scrollIntoView({ behavior: 'smooth' })` es una orden explícita y se
 * anima igual. Por eso existe esta comprobación: para poder decidirlo en el código.
 * @returns {boolean}
 */
export function menosMovimiento() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;   // sin matchMedia se asume que no
    }
}

/**
 * Lleva la vista a un elemento respetando el ajuste de menos movimiento: con él, el salto
 * es instantáneo; sin él, suave como antes.
 * @param {Element | null | undefined} el
 * @param {ScrollIntoViewOptions} [opciones]  bloque, alineación... (el `behavior` lo pone él)
 * @returns {void}
 */
export function desplazarA(el, opciones = {}) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ ...opciones, behavior: menosMovimiento() ? 'auto' : 'smooth' });
}

// ============================================
// VIEW TRANSITIONS (transición entre vistas)
// ============================================
/**
 * ¿Se pueden usar View Transitions ahora mismo?
 * Hace falta que el navegador las traiga Y que el usuario no haya pedido menos
 * movimiento. Se usa para ELEGIR el camino: si esto es false, quien llama tiene que
 * seguir por el camino de siempre (nunca se pierde funcionalidad, solo el efecto).
 * @returns {boolean}
 */
export function hayViewTransitions() {
    const doc = /** @type {any} */ (document);
    if (typeof doc.startViewTransition !== 'function') return false;
    return !menosMovimiento();
}

/**
 * Ejecuta un cambio del DOM dentro de una View Transition, si el navegador la trae.
 * Si no la trae (o si el usuario pidió menos movimiento), hace el cambio igual: nunca
 * se pierde funcionalidad, solo el efecto.
 *
 * Se usa para el paso feed -> lectura de Problogs (y la vuelta) y para cambiar de
 * sección: el navegador fotografía el antes y el después y anima el paso entre las dos,
 * sin librerías.
 *
 * @param {() => void} cambio  Lo que cambia el DOM (tiene que ser SÍNCRONO).
 * @returns {Promise<void>}  Se resuelve cuando el cambio YA está aplicado en el DOM.
 *   Hay que esperarlo si después se va a escribir DENTRO de lo que se acaba de pintar:
 *   el navegador llama al cambio de forma ASÍNCRONA, así que sin esperar se puede
 *   escribir primero y que el cambio lo borre después (carrera).
 */
export function conTransicion(cambio) {
    const doc = /** @type {any} */ (document);
    if (!hayViewTransitions()) { cambio(); return Promise.resolve(); }
    const t = doc.startViewTransition(cambio);
    // Si la transición se salta (otra en curso, pestaña oculta...), las promesas se rechazan: hay que
    // recogerlas TODAS o salta un "unhandled rejection" en consola.
    // Faltaba `ready`: la spec rechaza ESA (con `AbortError: Transition was skipped. New ViewTransition
    // started`) cuando se lanza una transición mientras otra está en curso, así que el error salía en
    // consola al navegar rápido. Lo destapó un verificador al que se le quitaron los `sleep()`: al pulsar
    // más rápido, las transiciones se solapaban. Un usuario rápido hacía lo mismo.
    if (t && t.ready && typeof t.ready.catch === 'function') t.ready.catch(() => {});
    if (t && t.finished && typeof t.finished.catch === 'function') t.finished.catch(() => {});
    if (t && t.updateCallbackDone && typeof t.updateCallbackDone.catch === 'function') {
        return t.updateCallbackDone.catch(() => {});
    }
    return Promise.resolve();
}

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

/**
 * Arma el `srcset` de una imagen de Cloudinary con VARIOS anchos, para que el navegador
 * baje solo el que necesita.
 *
 * POR QUÉ HACE FALTA: `cloudinaryUrl` pide 1080px por defecto, y como casi ninguna llamada
 * pasaba ancho, TODO se pedía a 1080: la tarjeta de la galería (hueco de hasta 500px) y
 * hasta los avatares de 36px. Con `srcset` el navegador elige: en un móvil de pantalla
 * densa (3x) pide el grande, y en un escritorio normal el pequeño. La diferencia se nota
 * en datos y en tiempo, sobre todo en los avatares.
 *
 * @param {string} url  URL original (la de Cloudinary, sin transformar)
 * @param {number[]} anchos  los anchos a ofrecer, de menor a mayor
 * @returns {string} el valor del atributo `srcset` (vacío si la URL no es de Cloudinary)
 */
export function srcsetCloudinary(url, anchos) {
    if (!url || url.indexOf('/upload/') === -1) return '';
    return anchos.map((w) => `${cloudinaryUrl(url, w)} ${w}w`).join(', ');
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
