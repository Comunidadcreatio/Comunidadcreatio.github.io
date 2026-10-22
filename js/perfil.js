// @ts-check
// js/perfil.js
// Gestión del perfil de usuario, estadísticas, foto de perfil,
// visualización de perfiles externos y resultados de búsqueda.

import { ARTISTA_KEY, API_BASE_URL, apiRequest, getAuthToken } from './config.js?v=9fb3a38a38';
import { token, artistaActual, lastActivityTime, fusionarArtistaActual, obtenerRolUsuario } from './auth.js?v=a90ece1c17';
import { showError, showSuccess, showInfo, setButtonLoading } from './notificaciones.js?v=a2dfb905a6';
import { escapeHtml, debugLog, cloudinaryUrl, safeImgUrl, srcsetCloudinary, cuandoLibre } from './utils.js?v=7e1398d254';
// Mismo tracking de vistas que la galería (mismo URL versionado → un solo
// módulo en memoria; el hash lo mantiene scripts/bump-version.js)
import { setupViewTracking } from './galeria.js?v=ff6a8d6f21';
import { cerrarOverlaysFlotantes } from './overlays.js?v=b94e8d4301';

export const AVATAR_DEFAULT = 'iconos/avatar-default.svg';

// Etiqueta visible del rol. Se muestra como «Artista de Tariba» debajo del nombre.
const NOMBRES_ROL = {
    artista: 'Artista',
    comprador: 'Comprador',
    coleccionista: 'Coleccionista',
    curador: 'Curador',
    galeria: 'Galería'
};

/**
 * @param {string | null | undefined} rol
 * @returns {string}
 */
function etiquetaRol(rol) {
    const clave = String(rol || 'artista').toLowerCase();
    return NOMBRES_ROL[clave] || 'Artista';
}
/**
 * Pinta la bandera del municipio en la cabecera del perfil (o la oculta si no hay).
 * El mapa municipio -> fichero lo pone ciudades.js en window.BANDERA_POR_CIUDAD, el mismo
 * que usan el registro y el directorio del chat.
 * @param {string | null | undefined} ciudad
 */
/**
 * Nombre del municipio a partir de la capital (el usuario elige la capital al registrarse).
 * El mapa lo pone ciudades.js en window.MUNICIPIO_POR_PUEBLO.
 * @param {string | null | undefined} ciudad
 * @returns {string}
 */
function municipioDe(ciudad) {
    const mapa = /** @type {Record<string, string> | undefined} */ (/** @type {any} */ (window).MUNICIPIO_POR_PUEBLO);
    return (mapa && ciudad && mapa[ciudad]) || ciudad || '';
}
/**
 * Pinta la biografía en la cabecera del perfil (o la oculta si está vacía).
 * @param {string | null | undefined} bio
 */
/** Trazos OFICIALES de cada red (Simple Icons), en monocromo: heredan el color del botón. */
const ICONOS_RED = {
    instagram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
    correo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>'
};

/** Nombre accesible de cada red. */
const ETIQUETAS_RED = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    x: 'X (Twitter)',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    correo: 'Correo',
    web: 'Sitio web'
};

/**
 * Convierte lo que escribió el usuario en un enlace seguro. Devuelve '' si no vale.
 * @param {string} clave
 * @param {any} valor
 * @returns {string}
 */
function enlaceDeRed(clave, valor) {
    const v = String(valor == null ? '' : valor).trim();
    if (!v) return '';
    if (clave === 'instagram') return 'https://instagram.com/' + encodeURIComponent(v.replace(/^@+/, ''));
    if (clave === 'x') return 'https://x.com/' + encodeURIComponent(v.replace(/^@+/, ''));
    if (clave === 'facebook') return 'https://facebook.com/' + encodeURIComponent(v.replace(/^@+/, ''));
    if (clave === 'telegram') return 'https://t.me/' + encodeURIComponent(v.replace(/^@+/, ''));
    if (clave === 'whatsapp') {
        const soloDigitos = v.replace(/[^0-9]/g, '');
        return soloDigitos ? 'https://wa.me/' + soloDigitos : '';
    }
    if (clave === 'correo') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'mailto:' + v : '';
    if (clave === 'web') return /^https?:\/\//i.test(v) ? v : 'https://' + v;
    return '';
}

/**
 * Pinta los iconos de las redes que el usuario haya rellenado, debajo de la biografía.
 * @param {any} redes  objeto o texto JSON con {instagram, x, whatsapp, correo, web}
 */
function pintarRedesPerfil(redes) {
    const caja = /** @type {HTMLElement | null} */ (document.getElementById('perfil-redes'));
    if (!caja) return;
    let datos = redes;
    if (typeof datos === 'string') {
        try { datos = JSON.parse(datos); } catch (e) { datos = {}; }
    }
    if (!datos || typeof datos !== 'object') datos = {};
    caja.textContent = '';
    // Cada red puede tener varias cuentas: se acepta texto suelto (datos viejos) o lista.
    const normalizarCuentas = (v) => {
        if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim());
        if (typeof v === 'string' && v.trim()) return [v];
        return [];
    };
    for (const clave of Object.keys(ETIQUETAS_RED)) {
        const cuentas = normalizarCuentas(datos[clave]);
        for (const valor of cuentas) {
        const url = enlaceDeRed(clave, valor);
        if (!url) continue;
        const a = document.createElement('a');
        a.className = 'perfil-red';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', ETIQUETAS_RED[clave]);
        a.title = ETIQUETAS_RED[clave];
        a.innerHTML = ICONOS_RED[clave] || '';
        caja.appendChild(a);
        }
    }
}

// cuenta.js avisa cuando se guardan las redes desde Mi perfil, para repintar los iconos.
document.addEventListener('perfil:redes', (ev) => {
    pintarRedesPerfil(/** @type {CustomEvent} */ (ev).detail);
});

/**
 * Enseña u oculta los bloques del perfil según lo que el usuario haya decidido.
 * @param {any} valor  JSON {"foto":"1",...} o el objeto ya parseado
 */
function aplicarVisibilidadHeader(valor) {
    let datos = valor;
    if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { datos = null; } }
    const ver = (clave) => !datos || datos[clave] === undefined || String(datos[clave]) !== '0';
    const avatar = document.getElementById('perfil-avatar-btn');
    if (avatar) avatar.hidden = !ver('foto');
    document.querySelectorAll('.perfil-nombre-artista-seccion').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('usuario'); });
    document.querySelectorAll('.perfil-rol').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('rol'); });
    document.querySelectorAll('.perfil-ciudad').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('municipio'); });
    document.querySelectorAll('.perfil-bandera').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('municipio'); });
    document.querySelectorAll('.perfil-de').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('rol') || !ver('municipio'); });
    document.querySelectorAll('.perfil-rol-linea').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('rol') && !ver('municipio'); });
    document.querySelectorAll('.perfil-nombre-real').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('nombre'); });
    document.querySelectorAll('.perfil-bio').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('bio'); });
    document.querySelectorAll('.perfil-redes').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !ver('redes'); });
}
function pintarBioPerfil(bio) {
    const el = /** @type {HTMLElement | null} */ (document.getElementById('perfil-bio'));
    if (!el) return;
    el.textContent = String(bio || '').trim();
}
function pintarBanderaPerfil(ciudad) {
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-bandera-img'));
    const caja = img ? img.parentElement : null;
    if (!img || !caja) return;
    const mapa = /** @type {Record<string, string> | undefined} */ (/** @type {any} */ (window).BANDERA_POR_CIUDAD);
    const archivo = (mapa && ciudad) ? mapa[ciudad] : '';
    if (archivo) {
        img.src = 'iconos/banderas/' + archivo;
        img.alt = '';
        caja.hidden = false;
    } else {
        img.removeAttribute('src');
        img.alt = '';
        caja.hidden = true;
    }
}

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
    const MAX_THUMB_W = 400;   // 400 y no 200: el avatar del perfil mide 104 px CSS (208-312 reales)
                              // y con 200 px se veia pixelado cuando la foto viene del cache local.
                              // A 400 px un JPEG 0.7 ocupa ~30 KB, muy por debajo de la cuota.
    try {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ratio = Math.min(MAX_THUMB_W / img.naturalWidth, 1);
            canvas.width = img.naturalWidth * ratio;
            canvas.height = img.naturalHeight * ratio;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
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
// Refresca los datos de MI perfil desde el servidor: el nombre, la foto y los
// tres contadores (Cavents / Problogs / Comcons). Sin esto, la cabecera se
// quedaba con lo que hubiera en memoria y salían los valores por defecto
// («Artista» y la «A» del avatar), con los contadores a 0.
//
// Se piden a /api/artistas/perfil (que trae los contadores). Si esa respuesta
// viniera sin nombre o sin foto, se completa con el perfil público por id, que
// es el mismo que alimenta el feed y ya trae ambos.
async function refrescarDatosPropios() {
    /** @type {Artista | null} */
let datos = null;
    try {
        const data = await apiRequest('/api/artistas/perfil');
        if (data && data.success && data.artista) datos = data.artista;
    } catch (err) {
        debugLog.warn('No se pudo leer mi perfil:', err);
    }

    const faltaAlgo = !datos || !datos.nombre_artista || !datos.foto_perfil;
    const id = artistaActual && artistaActual.id;
    if (faltaAlgo && id) {
        try {
            const pub = await apiRequest('/api/artistas/perfil/' + encodeURIComponent(id));
            if (pub && pub.success && pub.usuario) {
                datos = Object.assign({}, datos || {}, pub.usuario);
            }
        } catch (err) {
            debugLog.warn('No se pudo leer el perfil público:', err);
        }
    }
    if (!datos) return;

    // Lo mismo que se pinta se guarda en memoria: el avatar del header y demás
    // pantallas se alimentan de ahí.
    fusionarArtistaActual(datos);

    const src = datos.foto_perfil || AVATAR_DEFAULT;
    // El avatar del nav (mini) y el grande del perfil NO se piden igual: el grande mide 104 px
    // CSS, asi que con `sizes="48px"` el navegador elegia la imagen de 96 px y la estiraba a
    // 208-312 px reales -> se veia pixelado. Cada uno con su `sizes` y sus anchos. (2026-10-18)
    const mini = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-mini'));
    if (mini) { mini.src = src; mini.sizes = '48px'; mini.srcset = srcsetCloudinary(src, [48, 96, 144]); }
    const grande = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-seccion'));
    if (grande) { grande.src = src; grande.sizes = '104px'; grande.srcset = srcsetCloudinary(src, [104, 208, 312]); }
    document.querySelectorAll('.perfil-avatar-img')
        .forEach((img) => { const el = /** @type {HTMLImageElement} */ (img); el.src = src; el.sizes = '48px'; el.srcset = srcsetCloudinary(src, [48, 96, 144]); });
    document.querySelectorAll('.perfil-avatar-img-seccion')
        .forEach((img) => { const el = /** @type {HTMLImageElement} */ (img); el.src = src; el.sizes = '104px'; el.srcset = srcsetCloudinary(src, [104, 208, 312]); });
    document.querySelectorAll('.perfil-nombre-artista-seccion')
        .forEach((el) => { el.textContent = datos.nombre_artista || 'Artista'; });
    // «Artista / Comprador / Coleccionista / Curador / Galería» debajo del nombre.
    document.querySelectorAll('.perfil-rol')
        .forEach((el) => { el.textContent = etiquetaRol(datos.rol || obtenerRolUsuario()); });
    pintarBanderaPerfil(datos.ciudad || '');
    pintarBioPerfil(datos.bio);
    pintarRedesPerfil(datos.redes);
    aplicarVisibilidadHeader(datos.visibilidad);
    if (datos.nombre_real) {
        document.querySelectorAll('.perfil-nombre-real')
            .forEach((el) => { el.textContent = datos.nombre_real || ''; });
    }
    if (datos.ciudad) {
        document.querySelectorAll('.perfil-ciudad')
            .forEach((el) => { el.textContent = municipioDe(datos.ciudad); });
    }
    const ponerCuenta = (elId, valor) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = String(valor == null ? 0 : valor);
    };
    ponerCuenta('stats-cavents', datos.cavents);
    ponerCuenta('stats-problogs', datos.problogs);
    ponerCuenta('stats-comcons', datos.comcons);
}

/** @param {null | (() => boolean)} [verificarActividadFn] */
export function actualizarPerfilUI(verificarActividadFn = null) {
    const onlineIndicator = document.getElementById('perfil-online-indicator');
    const perfilUsuario = document.getElementById('perfil-usuario');
    const viendoPerfilExterno = perfilUsuario && perfilUsuario.dataset.viewing === 'external';

    // Si estamos viendo un perfil externo, no sobrescribir sus datos con los del usuario logueado
    if (!viendoPerfilExterno) {
        const src = getFotoPerfil() || AVATAR_DEFAULT;
        // Mismo reparto que arriba: el mini a 48 y el grande (104 px CSS) con anchos mayores.
        const mini = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-mini'));
        if (mini) { mini.src = src; mini.sizes = '48px'; mini.srcset = srcsetCloudinary(src, [48, 96, 144]); }
        const grande = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-seccion'));
        if (grande) { grande.src = src; grande.sizes = '104px'; grande.srcset = srcsetCloudinary(src, [104, 208, 312]); }
        const preview = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-preview'));
        if (preview) preview.src = src;
        const nombreArtista = (artistaActual && artistaActual.nombre_artista) || 'Artista';
        const nombreReal = (artistaActual && artistaActual.nombre_real) || '';
        const ciudad = (artistaActual && artistaActual.ciudad) || '';

        document.querySelectorAll('.perfil-nombre-real').forEach(el => { el.textContent = nombreReal; });
        document.querySelectorAll('.perfil-nombre-artista-seccion').forEach(el => { el.textContent = nombreArtista; });
        document.querySelectorAll('.perfil-rol').forEach(el => { el.textContent = etiquetaRol(obtenerRolUsuario()); });
        document.querySelectorAll('.perfil-ciudad').forEach(el => {
            el.textContent = ciudad ? escapeHtml(municipioDe(ciudad)) : '';
        });
        pintarBanderaPerfil(ciudad);
        pintarBioPerfil(artistaActual && artistaActual.bio);
        pintarRedesPerfil(artistaActual && artistaActual.redes);
        aplicarVisibilidadHeader(artistaActual && artistaActual.visibilidad);

        // Y se piden los datos buenos al servidor (nombre, foto y contadores).
        refrescarDatosPropios();
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
    const authToken = getAuthToken();
    const res = await fetch(`${API_BASE_URL}/api/artistas/foto-perfil`, {
        method: 'POST',
        credentials: 'include',
        headers: authToken ? { Authorization: 'Bearer ' + authToken } : {},
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
/**
 * @param {number|string|null} [userId]
 * @param {Artista | null} [statsData]
 */
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
    // Problogs y Comcons NO se pueden recalcular en el cliente: si la llamada no
    // trae datos se deja el valor que ya está en pantalla (null = no escribir),
    // porque escribir '0' borraba el contador real cuando esta llamada sin datos
    // competía con la que sí los pide al abrir el perfil.
    const fallbackProblogs = (statsData && statsData.problogs != null)
        ? String(statsData.problogs)
        : (artistaActual && artistaActual.problogs != null ? String(artistaActual.problogs) : null);
    const fallbackComcons = (statsData && statsData.comcons != null)
        ? String(statsData.comcons)
        : (artistaActual && artistaActual.comcons != null ? String(artistaActual.comcons) : null);

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
                statsCavents.textContent = String(activas);
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
            statsCavents.textContent = String(activas);
        }
        // null = "no hay dato": se respeta lo que ya está pintado.
        if (statsProblogs && fallbackProblogs !== null) statsProblogs.textContent = fallbackProblogs;
        if (statsComcons && fallbackComcons !== null) statsComcons.textContent = fallbackComcons;
    } catch (error) {
        const err = /** @type {{ response?: { status?: number } }} */ (error);
        debugLog.error('Error al cargar estadísticas:', error);
        statsCavents.textContent = fallbackCavents;
        if (statsProblogs && fallbackProblogs !== null) statsProblogs.textContent = fallbackProblogs;
        if (statsComcons && fallbackComcons !== null) statsComcons.textContent = fallbackComcons;
    }
}

// EXPONER AL ÁMBITO GLOBAL (para módulos que lo necesiten)
window.actualizarEstadisticas = actualizarEstadisticas;

// ============================================
// MOSTRAR RESULTADOS DE BÚSQUEDA
// ============================================
export function mostrarResultadosBusqueda(usuarios, verPerfilUsuarioFn) {
    // Esta sección se muestra sin pasar por switchSection: hay que retirar aquí
    // las capas flotantes (vista previa, comentarios, modal de descripción).
    cerrarOverlaysFlotantes();
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
                        ? `<img src="${safeImgUrl(cloudinaryUrl(usuario.foto_perfil, 96))}"
                                srcset="${srcsetCloudinary(usuario.foto_perfil, [48, 96, 144])}"
                                sizes="44px" decoding="async" loading="lazy" alt="${escapeHtml(usuario.nombre_artista)}">`
                        : `<div class="avatar-placeholder" style="--avatar-color:${usuario.color_avatar || usuario.autor_color || ''}">${escapeHtml(usuario.nombre_artista.charAt(0).toUpperCase())}</div>`
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
            // (también se retiran las capas flotantes: este camino no pasa por
            // switchSection, y una vista previa o el cajón quedarían encima)
            cerrarOverlaysFlotantes();
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
                // Si el perfil es el mío, se marca como propio (y se piden los
                // datos buenos); si no, como visita ajena.
                marcarPerfilPropio(usuario);
            }
            if (actualizarEstadoNavFn) actualizarEstadoNavFn();

            // Poblar datos del perfil
            const avatarImg = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-seccion'));
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

            const avatarOverlay = /** @type {HTMLElement | null} */ (document.querySelector('.perfil-avatar-overlay'));
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
        const err = /** @type {{ response?: { status?: number } }} */ (error);
        debugLog.error('Error al cargar perfil:', error);
        if (err.response && err.response.status === 500) {
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

    // El grid de «Mi Cuenta» se pide ya, en cuanto el navegador está libre: así al abrir el
    // perfil aparece de golpe en vez del «Cargando obras…». (2026-10-18)
    precargarObrasPropias();

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

    // Los datos de MI perfil se refrescan en cuanto la sección se muestra, sin
    // depender de quién la abra: hay varios caminos (el icono lateral, la lupa,
    // el arranque) y en alguno el objeto guardado en el dispositivo viene
    // incompleto, que es lo que dejaba «Artista» y la «A» en el avatar.
    vigilarSeccionPerfil();

    // Inicializar tabs del perfil
    setupPerfilTabs();
}

// Monta (una sola vez) el observador de la sección del perfil.
let seccionPerfilVigilada = false;
function vigilarSeccionPerfil() {
    if (seccionPerfilVigilada) return;
    const seccionPerfil = document.getElementById('perfil-usuario');
    if (!seccionPerfil || typeof MutationObserver !== 'function') return;
    seccionPerfilVigilada = true;
    const refrescarSiEsMio = () => {
        if (seccionPerfil.classList.contains('hidden')) return;
        if (seccionPerfil.dataset.viewing === 'external') return;
        refrescarDatosPropios();
    };
    new MutationObserver(refrescarSiEsMio)
        .observe(seccionPerfil, { attributes: true, attributeFilter: ['class', 'data-viewing'] });
    refrescarSiEsMio();
}

// Cuando el perfil que se abre es el MÍO no es una visita ajena: se quita esa
// marca (que si no se quedaba pegada de una visita anterior y hacía que la
// cabecera no se actualizara) y se piden los datos propios.
function marcarPerfilPropio(usuario) {
    const perfilUsuario = document.getElementById('perfil-usuario');
    if (!perfilUsuario) return;
    const esPropio = artistaActual && usuario && String(artistaActual.id) === String(usuario.id);
    perfilUsuario.dataset.viewing = esPropio ? 'own' : 'external';
    if (esPropio) refrescarDatosPropios();
}

// ============================================
// TABS DEL PERFIL (cavents, problogs, comcons)
// ============================================
/** @type {string | null} */   // el data-tab de una pestaña puede faltar
let perfilTabActual = 'cavents';
let perfilExternoId = null; // ID del usuario externo que se está viendo

function setupPerfilTabs() {
    const tabs = document.querySelectorAll('.perfil-tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (perfilTabActual === /** @type {HTMLElement} */ (tab).dataset.tab) return;
            perfilTabActual = /** @type {HTMLElement} */ (tab).dataset.tab ?? null;
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

/** @type {any[] | null} */
let cacheObrasPropias = null;
let cacheObrasMomento = 0;

// Se piden las obras propias en cuanto el navegador está libre, para que al abrir «Mi Cuenta»
// el grid aparezca YA (y no el «Cargando obras…»). Mismo patrón que el chat y Problogs.
// (2026-10-18)
export function precargarObrasPropias() {
    if (!artistaActual) return;
    cuandoLibre(() => {
        apiRequest('/api/artistas/mis-obras?limit=50')
            .then((res) => {
                if (res && res.success && Array.isArray(res.obras)) {
                    cacheObrasPropias = res.obras;
                    cacheObrasMomento = Date.now();
                }
            })
            .catch(() => { /* silencioso: es una precarga */ });
    });
}

// Esqueleto del grid: la forma de las tarjetas que van a llegar, en vez del texto
// «Cargando obras...». (2026-10-18)
function esqueletoGridPerfil() {
    return '<div class="perfil-esqueleto" role="status">' +
        '<span class="visually-hidden">Cargando obras…</span>' +
        '<div class="perfil-esqueleto-celda"></div>'.repeat(6) +
        '</div>';
}

async function cargarContenidoTab(tab) {
    const content = document.getElementById('perfil-tab-content');
    if (!content) return;

    const viendoExterno = !!perfilExternoId;

    if (tab === 'cavents') {
        if (viendoExterno) {
            content.innerHTML = esqueletoGridPerfil();
            try {
                const res = await apiRequest('/obras?limit=100');
                if (res && Array.isArray(res)) {
                    const obrasUsuario = res.filter(obra => String(obra.artista_user_id) === String(perfilExternoId));
                    renderizarGridObras(obrasUsuario, content);
                } else {
                    content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">No se pudieron cargar las obras.</p>';
                }
            } catch (e) {
                content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">Error al cargar las obras.</p>';
            }
            return;
        }

        // Se copia a una constante para que TypeScript sepa que NO es null dentro del if (y
        // dentro del `then`, que es un closure).
        const cacheadas = cacheObrasPropias;
        if (cacheadas && Date.now() - cacheObrasMomento < 60000) {
            // Con caché: se pinta AL INSTANTE y se refresca por debajo (sin volver a enseñar
            // esqueleto ni borrar lo que ya se ve).
            renderizarGridObras(cacheadas.filter(obra => obra.status !== 'Inactivo (Oculto)'), content);
            apiRequest('/api/artistas/mis-obras?limit=50')
                .then((res) => {
                    if (!res || !res.success || !Array.isArray(res.obras)) return;
                    cacheObrasPropias = res.obras;
                    cacheObrasMomento = Date.now();
                    // Solo se repinta si el usuario sigue en esta pestaña.
                    if (perfilTabActual === 'cavents' && content.isConnected) {
                        renderizarGridObras(res.obras.filter(obra => obra.status !== 'Inactivo (Oculto)'), content);
                    }
                })
                .catch(() => { /* se queda lo que ya se ve */ });
            return;
        }

        content.innerHTML = esqueletoGridPerfil();
        try {
            const res = await apiRequest('/api/artistas/mis-obras?limit=50');
            if (res && res.success && res.obras) {
                cacheObrasPropias = res.obras;
                cacheObrasMomento = Date.now();
                const obrasActivas = res.obras.filter(obra => obra.status !== 'Inactivo (Oculto)');
                renderizarGridObras(obrasActivas, content);
            } else {
                content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">No se pudieron cargar las obras.</p>';
            }
        } catch (e) {
            content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:20px;">Error al cargar las obras.</p>';
        }
    } else if (tab === 'problogs') {
        // El pintado real vive en problogs.js (dueño del marcado y estilos del feed).
        // Se avisa por evento en vez de importar, para no crear un ciclo de módulos
        // (perfil.js -> problogs.js -> galeria-ui.js -> perfil.js).
        content.innerHTML = '<div class="problogs-esqueleto" role="status"><span class="visually-hidden">Cargando publicaciones…</span><div class="problogs-esqueleto-tarjeta"></div></div>';
        document.dispatchEvent(new CustomEvent('perfil:problogs', {
            detail: { contenedor: content, autorId: perfilExternoId || null }
        }));
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
            const img = /** @type {HTMLImageElement} */ (card.querySelector('.perfil-card-main-img'));
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
                    updateImage(parseInt(/** @type {HTMLElement} */ (dot).dataset.index ?? '0'));
                });
            });
        }

        card.addEventListener('click', (e) => {
            // No abrir si se hizo clic en un dot
            if (e.target instanceof Element && e.target.classList.contains('perfil-card-dot')) return;
            if (typeof window.abrirObraDesdePerfil === 'function') {
                window.abrirObraDesdePerfil(obra.id);
            }
        });

        // La tarjeta debe tener el MISMO aspecto que la imagen subida (4:5 o
        // 1:1 según cómo la recortó el usuario al crearla). El ratio no viaja
        // en el backend, así que se detecta de la primera imagen real.
        if (primeraImg) {
            const probe = new Image();
            probe.onload = () => {
                const w = probe.naturalWidth, h = probe.naturalHeight;
                if (w && h) card.style.aspectRatio = String(w / h);
            };
            probe.src = primeraImg;
            if (probe.complete && probe.naturalWidth) /** @type {() => void} */ (probe.onload)();
        }

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

// Red de seguridad: el observador se monta también al cargar el módulo, para que
// no dependa de que se llegue a llamar a setupPerfilInteracciones.
(function arrancarVigilanciaPerfil() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', vigilarSeccionPerfil);
    } else {
        vigilarSeccionPerfil();
    }
})();
