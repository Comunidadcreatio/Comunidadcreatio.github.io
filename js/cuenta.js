// @ts-check
// js/cuenta.js
// Gestión de la sección "Mi Cuenta": cambiar email, cambiar contraseña,
// eliminar cuenta y accordion de seguridad.

import { ARTISTA_KEY, apiRequest } from './config.js?v=9fb3a38a38';
import { token, artistaActual, logout } from './auth.js?v=a90ece1c17';
import { showSuccess, showError, showWarning, showInfo, setButtonLoading } from './notificaciones.js?v=a2dfb905a6';
import { debugLog, esEmailValido, esDominioDesechable } from './utils.js?v=7e1398d254';
import { calcularFortalezaPassword, NIVEL_MIN_PASSWORD } from './password-strength.js?v=c634a73551';

/**
 * Muestra errores del backend en un elemento de error inline del formulario.
 * Centraliza la lógica repetida en cambiar-email, cambiar-password y eliminar-cuenta.
 */
function mostrarErrorBackend(res, errorEl) {
    if (res && (res.errors || res.error)) {
        if (Array.isArray(res.errors) && res.errors.length > 0) {
            errorEl.textContent = '❌ ' + res.errors.join('\n');
        } else if (res.error) {
            errorEl.textContent = '❌ ' + res.error;
        } else {
            errorEl.textContent = '❌ Error desconocido.';
        }
    } else {
        errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
    }
}

/**
 * Oculta (y resetea) un formulario de la sección Mi Cuenta.
 */
function ocultarFormularioCuenta(id) {
    // `getElementById` da HTMLElement, que no tiene .reset: aqui es un formulario.
    const form = /** @type {HTMLFormElement | null} */ (document.getElementById(id));
    if (!form) return;
    if (typeof form.reset === 'function') form.reset();
    form.classList.add('hidden');
    form.querySelectorAll('.cuenta-error').forEach(e => (e.textContent = ''));
    const strength = form.querySelector('#cuenta-password-strength');
    if (strength) strength.removeAttribute('data-level');
    const strengthText = form.querySelector('.strength-text');
    if (strengthText) strengthText.textContent = '';
}

/**
 * Configura todos los eventos de la sección "Mi Cuenta".
 */
export function setupMiCuenta() {
    // ============================================
    // ACCORDION DE SEGURIDAD
    // ============================================
    const accordionSeguridad = document.getElementById('accordion-seguridad');
    const seguridadContent = document.getElementById('seguridad-content');
    if (accordionSeguridad && seguridadContent) {
        accordionSeguridad.addEventListener('click', () => {
            const isExpanded = accordionSeguridad.getAttribute('aria-expanded') === 'true';
            accordionSeguridad.setAttribute('aria-expanded', String(!isExpanded));
            if (isExpanded) {
                seguridadContent.hidden = true;
                seguridadContent.style.maxHeight = '0';
                seguridadContent.style.padding = '0 0';
            } else {
                seguridadContent.hidden = false;
                setTimeout(() => {
                    seguridadContent.style.maxHeight = '2000px';
                    seguridadContent.style.padding = '20px 0';
                }, 10);
            }
        });
    }

    // ============================================
    // ACCORDION DE SESIÓN (cerrar sesión, cerrar todas)
    // ============================================
    // ============================================
    // ACCORDION DE MI PERFIL (ciudad, redes y cobro)
    // ============================================
    // Los datos se piden al abrir por primera vez: la seccion se abre desde la hamburguesa y
    // no conviene pedirlos si el usuario no entra.
    const accordionPerfil = document.getElementById('accordion-perfil');
    const perfilContent = document.getElementById('perfil-content');
    let perfilCargado = false;

    /** Lee un input por id y devuelve su texto limpio. */
    const valorDe = (id) => {
        const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
        return el ? el.value.trim() : '';
    };
    /** Escribe un input por id. */
    const poner = (id, v) => {
        const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
        if (el) el.value = v == null ? '' : String(v);
    };
    /** El backend guarda redes y cobro como JSON en TEXT. */
    const parsear = (txt) => {
        try { return txt ? JSON.parse(txt) : {}; } catch (e) { return {}; }
    };

    /** Máximo de CARACTERES de la biografía. */
    const MAX_CARACTERES_BIO = 200;

    /** Cuenta caracteres (todo lo escrito, incluidos espacios). */
    const contarCaracteres = (texto) => String(texto || '').length;

    /** Pinta «N / 200 caracteres» y marca en rojo si se pasa. */
    const actualizarContadorBio = () => {
        const contador = document.getElementById('perfil-bio-contador');
        const campo = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('perfil-bio-input'));
        if (!contador || !campo) return;
        const n = contarCaracteres(campo.value);
        contador.textContent = n + ' / ' + MAX_CARACTERES_BIO + ' caracteres';
        contador.classList.toggle('perfil-bio-contador-pasado', n > MAX_CARACTERES_BIO);
    };

    // ============================================
    // FOTO DE PERFIL (vista previa y quitarla)
    // ============================================
    const AVATAR_DEFECTO = 'iconos/avatar-default.svg';
    const previewAvatar = /** @type {HTMLImageElement | null} */ (document.getElementById('perfil-avatar-preview'));
    // Se pone a true al pulsar «Quitar foto» y se manda foto_perfil: '' al guardar.
    let quitarFoto = false;

    // ============================================
    // MUNICIPIO DE ORIGEN (select con banderas)
    // ============================================
    const muniTrigger = /** @type {HTMLButtonElement | null} */ (document.getElementById('perfil-ciudad-trigger'));
    const muniDropdown = /** @type {HTMLElement | null} */ (document.getElementById('perfil-ciudad-dropdown'));
    const muniHidden = /** @type {HTMLInputElement | null} */ (document.getElementById('perfil-ciudad-input'));
    const muniNota = document.getElementById('perfil-ciudad-nota');

    /**
     * El acordeón recorta su contenido (overflow: hidden) para poder animarse; eso corta los
     * desplegables. Al abrir uno se deja visible y al cerrarlo se vuelve a recortar.
     * @param {HTMLElement | null} el
     * @param {boolean} visible
     */
    const ajustarRecorteAcordeon = (el, visible) => {
        const caja = /** @type {HTMLElement | null} */ (el ? el.closest('.accordion-content') : null);
        if (!caja) return;
        if (visible) { caja.style.overflow = 'visible'; return; }
        // Varios desplegables comparten acordeón: solo se vuelve a recortar si no queda
        // ninguno abierto (si no, el cierre de uno deshacía la apertura de otro).
        const otroAbierto = caja.querySelector('.custom-select-dropdown.open');
        if (!otroAbierto) caja.style.overflow = '';
    };

    /** Capital (lo que se guarda) -> municipio (lo que se muestra). */
    const municipioDeCapital = (capital) => {
        const mapa = /** @type {Record<string, string> | undefined} */ (/** @type {any} */ (window).MUNICIPIO_POR_PUEBLO);
        return (mapa && capital && mapa[capital]) || capital || '';
    };

    const cerrarMunicipios = () => {
        ajustarRecorteAcordeon(muniDropdown, false);
        if (muniDropdown) muniDropdown.classList.remove('open');
        if (muniTrigger) muniTrigger.setAttribute('aria-expanded', 'false');
    };

    /**
     * Llena el desplegable con los 29 municipios y sus banderas y marca el actual.
     * @param {string} capitalActual
     * @param {boolean} bloqueado
     */
    const pintarMunicipios = (capitalActual, bloqueado) => {
        if (!muniDropdown || !muniHidden) return;
        const banderas = /** @type {Record<string, string> | undefined} */ (/** @type {any} */ (window).BANDERA_POR_CIUDAD) || {};
        const paises = /** @type {any} */ (window).CIUDADES_POR_PAIS || {};
        const lista = (paises.Venezuela && paises.Venezuela['Táchira']) || [];

        const opciones = lista
            .map((capital) => ({ capital, municipio: municipioDeCapital(capital) }))
            .sort((a, b) => a.municipio.localeCompare(b.municipio, 'es'));

        muniDropdown.textContent = '';
        opciones.forEach(({ capital, municipio }) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'custom-select-option';
            item.setAttribute('role', 'option');
            item.dataset.capital = capital;
            const bandera = banderas[capital] || '';
            item.innerHTML = (bandera ? '<img class="custom-select-flag" src="iconos/banderas/' + bandera + '" alt="">' : '') + '<span>' + municipio + '</span>';
            item.addEventListener('click', () => {
                if (bloqueado) return;
                muniHidden.value = capital;
                if (muniTrigger) {
                    const banderaNueva = banderas[capital] || '';
                    muniTrigger.innerHTML = (banderaNueva ? '<img class="custom-select-flag" src="iconos/banderas/' + banderaNueva + '" alt="">' : '') +
                        '<span>' + municipio + '</span>';
                }
                cerrarMunicipios();
            });
            muniDropdown.appendChild(item);
        });

        if (capitalActual) {
            muniHidden.value = capitalActual;
            if (muniTrigger) {
                const banderaActual = banderas[capitalActual] || '';
                muniTrigger.innerHTML = (banderaActual ? '<img class="custom-select-flag" src="iconos/banderas/' + banderaActual + '" alt="">' : '') +
                    '<span>' + municipioDeCapital(capitalActual) + '</span>';
            }
            muniDropdown.querySelectorAll('.custom-select-option').forEach((el) => {
                el.classList.toggle('selected', /** @type {HTMLElement} */ (el).dataset.capital === capitalActual);
            });
        }
    };

    if (muniTrigger && muniDropdown) {
        muniTrigger.addEventListener('click', () => {
            const abierto = muniDropdown.classList.toggle('open');
            ajustarRecorteAcordeon(muniDropdown, abierto);
            muniTrigger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
        document.addEventListener('click', (ev) => {
            const objetivo = /** @type {Node} */ (ev.target);
            if (!muniTrigger.contains(objetivo) && !muniDropdown.contains(objetivo)) cerrarMunicipios();
        });
    }

    // ============================================
    // VISIBILIDAD: qué bloques se enseñan en el perfil
    // ============================================
    const VISIBILIDAD_DEFECTO = { foto: true, usuario: true, rol: true, nombre: true, municipio: true, bio: true, redes: true };
    /** @type {Record<string, boolean>} */
    let visibilidad = Object.assign({}, VISIBILIDAD_DEFECTO);
    const switchesVisibilidad = [...document.querySelectorAll('.perfil-switch')];

    /** Acepta el JSON guardado ("1"/"0") o un objeto; lo que falte queda visible. */
    const normalizarVisibilidad = (valor) => {
        let datos = valor;
        if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { datos = null; } }
        const salida = Object.assign({}, VISIBILIDAD_DEFECTO);
        if (datos && typeof datos === 'object') {
            Object.keys(salida).forEach((clave) => {
                if (datos[clave] !== undefined) salida[clave] = String(datos[clave]) !== '0';
            });
        }
        return salida;
    };

    const pintarSwitches = () => {
        switchesVisibilidad.forEach((el) => {
            const clave = /** @type {HTMLElement} */ (el).dataset.visibilidad || '';
            el.setAttribute('aria-checked', visibilidad[clave] ? 'true' : 'false');
        });
    };

    /** Enseña u oculta cada bloque en la cabecera del perfil. */
    const aplicarVisibilidad = () => {
        const avatar = document.getElementById('perfil-avatar-btn');
        if (avatar) avatar.hidden = !visibilidad.foto;
        // El rol y el municipio se leen juntos pero se ocultan por separado: se esconden también
        // el «de» (si falta alguno) y la línea entera cuando no queda ninguno de los dos.
        document.querySelectorAll('.perfil-nombre-artista-seccion').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.usuario; });
        document.querySelectorAll('.perfil-rol').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.rol; });
        document.querySelectorAll('.perfil-ciudad').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.municipio; });
        document.querySelectorAll('.perfil-bandera').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.municipio; });
        document.querySelectorAll('.perfil-de').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.rol || !visibilidad.municipio; });
        document.querySelectorAll('.perfil-rol-linea').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.rol && !visibilidad.municipio; });
        document.querySelectorAll('.perfil-rol-linea').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.municipio; });
        document.querySelectorAll('.perfil-bio').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.bio; });
        document.querySelectorAll('.perfil-redes').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = !visibilidad.redes; });
    };

    switchesVisibilidad.forEach((el) => {
        el.addEventListener('click', () => {
            const clave = /** @type {HTMLElement} */ (el).dataset.visibilidad || '';
            visibilidad[clave] = !visibilidad[clave];
            pintarSwitches();
            aplicarVisibilidad();
            if (artistaActual) artistaActual.visibilidad = JSON.stringify(visibilidad);
        });
    });

    // ============================================
    // REDES: se añaden de una en una con el botón +
    // ============================================
const ICONOS_RED_PANEL = {
    instagram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
    correo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>'
};

    const REDES_DISPONIBLES = [
        { clave: 'instagram', etiqueta: 'Instagram', placeholder: '@usuario' },
        { clave: 'facebook', etiqueta: 'Facebook', placeholder: 'usuario o enlace' },
        { clave: 'x', etiqueta: 'X (Twitter)', placeholder: '@usuario' },
        { clave: 'whatsapp', etiqueta: 'WhatsApp', placeholder: '+58 412 000 0000' },
        { clave: 'telegram', etiqueta: 'Telegram', placeholder: '@usuario' },
        { clave: 'correo', etiqueta: 'Correo', placeholder: 'hola@correo.com' },
        { clave: 'web', etiqueta: 'Sitio web', placeholder: 'https://' }
    ];
    const listaRedes = document.getElementById('perfil-redes-lista');
    const redesSelectTrigger = /** @type {HTMLButtonElement | null} */ (document.getElementById('redes-select-trigger'));
    const redesSelectDropdown = /** @type {HTMLElement | null} */ (document.getElementById('redes-select-dropdown'));

    /** Añade una fila para esa red (se permiten varias de la misma). */
    const agregarRed = (clave, valor) => {
        if (!listaRedes) return;
        const def = REDES_DISPONIBLES.find((r) => r.clave === clave);
        if (!def) return;
        const fila = document.createElement('div');
        fila.className = 'perfil-campo-red';
        fila.dataset.red = clave;
        // Misma tarjeta que los métodos de cobro: icono en círculo, nombre, dato y la ×.
        fila.innerHTML = '<div class="perfil-red-card">' +
            '<span class="perfil-red-card-icono">' + (ICONOS_RED_PANEL[clave] || '') + '</span>' +
            '<div class="perfil-red-card-datos">' +
            '<span class="perfil-red-card-nombre">' + def.etiqueta + '</span>' +
            '<input type="text" maxlength="300" placeholder="' + def.placeholder + '" aria-label="' + def.etiqueta + '">' +
            '</div>' +
            '<button type="button" class="perfil-red-quitar" aria-label="Quitar ' + def.etiqueta + '">×</button>' +
            '</div>';
        const input = fila.querySelector('input');
        if (input) input.value = valor == null ? '' : String(valor);
        const quitar = fila.querySelector('.perfil-red-quitar');
        if (quitar) quitar.addEventListener('click', () => fila.remove());
        listaRedes.appendChild(fila);
    };

    /** Cuentas de una red: acepta texto suelto (datos viejos) o lista. */
    const cuentasDe = (v) => {
        if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim());
        if (typeof v === 'string' && v.trim()) return [v];
        return [];
    };

    /** Pinta las que ya tenía guardadas. */
    const pintarRedesGuardadas = (redes) => {
        if (!listaRedes) return;
        listaRedes.textContent = '';
        REDES_DISPONIBLES.forEach(({ clave }) => {
            cuentasDe(redes && redes[clave]).forEach((valor) => agregarRed(clave, valor));
        });
    };

    /** Lo que hay escrito ahora mismo. */
    const leerRedes = () => {
        /** @type {Record<string, string[]>} */
        const salida = {};
        if (!listaRedes) return salida;
        listaRedes.querySelectorAll('.perfil-campo-red').forEach((fila) => {
            const clave = /** @type {HTMLElement} */ (fila).dataset.red || '';
            const input = /** @type {HTMLInputElement | null} */ (fila.querySelector('input'));
            const valor = input ? input.value.trim() : '';
            if (!clave || !valor) return;
            if (!salida[clave]) salida[clave] = [];
            salida[clave].push(valor);
        });
        return salida;
    };

    /** Cierra el desplegable de redes. */
    const cerrarSelectRedes = () => {
        ajustarRecorteAcordeon(redesSelectDropdown, false);
        if (redesSelectDropdown) redesSelectDropdown.classList.remove('open');
        if (redesSelectTrigger) redesSelectTrigger.setAttribute('aria-expanded', 'false');
    };

    /** Llena el desplegable con todas las redes (icono + nombre). */
    const pintarSelectRedes = () => {
        if (!redesSelectDropdown) return;
        redesSelectDropdown.textContent = '';
        REDES_DISPONIBLES.forEach(({ clave, etiqueta }) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'custom-select-option';
            b.setAttribute('role', 'option');
            const icono = document.createElement('span');
            icono.className = 'opcion-icono-red';
            icono.innerHTML = ICONOS_RED_PANEL[clave] || '';
            const nombre = document.createElement('span');
            nombre.className = 'opcion-nombre';
            nombre.textContent = etiqueta;
            b.appendChild(icono);
            b.appendChild(nombre);
            b.addEventListener('click', () => {
                agregarRed(clave, '');
                cerrarSelectRedes();
                const ultimo = listaRedes ? listaRedes.querySelector('.perfil-campo-red:last-child input') : null;
                if (ultimo) /** @type {HTMLInputElement} */ (ultimo).focus();
            });
            redesSelectDropdown.appendChild(b);
        });
    };

    if (redesSelectTrigger && redesSelectDropdown) {
        redesSelectTrigger.addEventListener('click', () => {
            const abierto = redesSelectDropdown.classList.toggle('open');
            ajustarRecorteAcordeon(redesSelectDropdown, abierto);
            redesSelectTrigger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
        document.addEventListener('click', (ev) => {
            const objetivo = /** @type {Node} */ (ev.target);
            if (!redesSelectTrigger.contains(objetivo) && !redesSelectDropdown.contains(objetivo)) cerrarSelectRedes();
        });
    }

    // ============================================
    // MÉTODOS DE PAGO (Monetización)
    // ============================================
    /** Bancos venezolanos: código, nombre, siglas y color de marca. */
    const BANCOS_VE = [
        { id: '0102', nombre: 'Banco de Venezuela', corto: 'BDV', color: '#cf142b' },
        { id: '0134', nombre: 'Banesco', corto: 'BAN', color: '#004a99' },
        { id: '0105', nombre: 'Mercantil', corto: 'MER', color: '#002d62' },
        { id: '0108', nombre: 'BBVA Provincial', corto: 'PRO', color: '#004481' },
        { id: '0191', nombre: 'Banco Nacional de Crédito', corto: 'BNC', color: '#00a651' },
        { id: '0175', nombre: 'Banco Bicentenario', corto: 'BIC', color: '#f58220' },
        { id: '0172', nombre: 'Bancamiga', corto: 'AMI', color: '#e4002b' },
        { id: '0174', nombre: 'Banplus', corto: 'PLU', color: '#0033a0' },
        { id: '0163', nombre: 'Banco del Tesoro', corto: 'TES', color: '#c99700' },
        { id: '0137', nombre: 'Sofitasa', corto: 'SOF', color: '#0057a8' },
        { id: '0151', nombre: 'BFC Banco Fondo Común', corto: 'BFC', color: '#e30613' },
        { id: '0115', nombre: 'Banco Exterior', corto: 'EXT', color: '#00457c' },
        { id: '0114', nombre: 'Bancaribe', corto: 'CRI', color: '#d71920' },
        { id: '0171', nombre: 'Banco Activo', corto: 'ACT', color: '#00693e' },
        { id: '0169', nombre: 'Mi Banco', corto: 'MIB', color: '#005baa' }
    ];

    /** Métodos que no son bancos. */
    const PAGOS_SIMPLES = [
        { id: 'binance', nombre: 'Binance', corto: 'BNB', color: '#b58c00' },
        { id: 'zelle', nombre: 'Zelle', corto: 'ZEL', color: '#6d1ed4' },
        { id: 'zinli', nombre: 'Zinli', corto: 'ZIN', color: '#7b2ff7' },
        { id: 'paypal', nombre: 'PayPal', corto: 'PP', color: '#003087' },
        { id: 'usdt', nombre: 'USDT', corto: 'USDT', color: '#26a17b' },
        { id: 'efectivo', nombre: 'Efectivo', corto: 'EFE', color: '#2e7d32' }
    ];

    /** Campos de cada formulario. */
    const CAMPOS_PAGO = {
        'pago-movil': [
            { clave: 'telefono', etiqueta: 'Teléfono', placeholder: '0412 123 4567' },
            { clave: 'cedula', etiqueta: 'Cédula', placeholder: 'V-12345678' },
            { clave: 'titular', etiqueta: 'Titular (opcional)', placeholder: 'Nombre y apellido' }
        ],
        'transferencia': [
            { clave: 'cuenta', etiqueta: 'Número de cuenta', placeholder: '0102 0000 0000 0000 0000' },
            { clave: 'titular', etiqueta: 'Titular', placeholder: 'Nombre y apellido' },
            { clave: 'cedula', etiqueta: 'Cédula (opcional)', placeholder: 'V-12345678' }
        ],
        binance: [{ clave: 'correo', etiqueta: 'Correo o ID', placeholder: 'correo@ejemplo.com' }],
        zelle: [
            { clave: 'correo', etiqueta: 'Correo o teléfono', placeholder: 'correo@ejemplo.com' },
            { clave: 'titular', etiqueta: 'Titular', placeholder: 'Nombre y apellido' }
        ],
        zinli: [{ clave: 'correo', etiqueta: 'Correo o teléfono', placeholder: 'correo@ejemplo.com' }],
        paypal: [{ clave: 'correo', etiqueta: 'Correo', placeholder: 'correo@ejemplo.com' }],
        usdt: [
            { clave: 'red', etiqueta: 'Red', placeholder: 'TRC20 / BEP20' },
            { clave: 'wallet', etiqueta: 'Wallet', placeholder: 'Dirección' }
        ],
        efectivo: [{ clave: 'nota', etiqueta: 'Nota', placeholder: 'Ciudad y forma de entrega' }]
    };

    /** @type {any[]} */
    let metodosPago = [];
    const pagoSelectTrigger = /** @type {HTMLButtonElement | null} */ (document.getElementById('pago-select-trigger'));
    const pagoSelectDropdown = /** @type {HTMLElement | null} */ (document.getElementById('pago-select-dropdown'));
    const pagoPanel = document.getElementById('pago-panel');
    const pagoLista = document.getElementById('pago-lista');

    const tipoDe = (m) => (m && m.familia === 'banco' ? 'banco' : 'simple');
    const metodosTodos = () => [
        ...BANCOS_VE.map((b) => ({ ...b, familia: 'banco' })),
        ...PAGOS_SIMPLES.map((p) => ({ ...p, familia: 'simple' }))
    ];
    const buscarMetodo = (id) => metodosTodos().find((m) => m.id === id);

    /** Normaliza lo guardado: lista nueva u objeto viejo. */
    const normalizarCobro = (cobro) => {
        let datos = cobro;
        if (typeof datos === 'string') { try { datos = JSON.parse(datos); } catch (e) { datos = []; } }
        if (Array.isArray(datos)) return datos.filter((m) => m && typeof m === 'object');
        if (datos && typeof datos === 'object') {
            return Object.entries(datos)
                .filter(([, v]) => typeof v === 'string' && v.trim())
                .map(([k, v]) => ({ metodo: k, valor: String(v) }));
        }
        return [];
    };

    /** Texto corto con lo que se haya rellenado. */
    // Solo los datos: el banco y el tipo ya van en el título de la fila.
    const resumenMetodo = (m) => {
        const partes = [];
        if (m.valor) partes.push(m.valor);
        for (const clave of ['telefono', 'cuenta', 'correo', 'wallet', 'red', 'cedula', 'titular', 'nota']) {
            if (m[clave]) partes.push(String(m[clave]));
        }
        return partes.join(' · ');
    };

    const tituloMetodo = (m) => {
        if (m.banco) {
            const b = buscarMetodo(m.banco);
            const banco = b ? b.nombre : m.banco;
            if (m.tipo === 'pago-movil') return banco + ' · Pago Móvil';
            if (m.tipo === 'transferencia') return banco + ' · Transferencia';
            return banco;
        }
        const p = buscarMetodo(m.metodo);
        return p ? p.nombre : (m.metodo || 'Método');
    };

    /**
     * Pinta en la caja el logo de iconos/pagos/<id>.svg; si no existe, deja las siglas.
     * Así, cuando se añada el logo de un banco con ese nombre, aparece solo.
     */
    const pintarLogoPago = (caja, m) => {
        caja.textContent = m.corto;
        const intentar = (ext) => {
            const img = document.createElement('img');
            img.className = 'pago-logo';
            img.alt = '';
            img.addEventListener('load', () => {
                caja.textContent = '';
                // Con logo, el círculo se queda sin anillo ni color de marca.
                caja.classList.add('con-logo');
                caja.appendChild(img);
            });
            img.addEventListener('error', () => {
                // Si no hay SVG, se prueba PNG; si tampoco, quedan las siglas.
                if (ext === 'svg') intentar('png');
                else {
                    caja.classList.remove('con-logo');
                    caja.textContent = m.corto;
                }
            });
            img.src = 'iconos/pagos/' + m.id + '.' + ext;
        };
        intentar('svg');
    };

    /** Repinta la lista de métodos añadidos. */
    const pintarListaPagos = () => {
        if (!pagoLista) return;
        pagoLista.textContent = '';
        metodosPago.forEach((m, indice) => {
            const def = buscarMetodo(m.banco || m.metodo);
            const item = document.createElement('div');
            item.className = 'pago-item';
            item.innerHTML = '<span class="pago-badge" style="--pago-color:' + ((def && def.color) || '#777') + '"><span class="pago-siglas">' + ((def && def.corto) || '?') + '</span></span>' +
                '<div class="pago-item-datos"><strong>' + tituloMetodo(m) + '</strong><span>' + resumenMetodo(m) + '</span></div>' +
                '<button type="button" class="pago-quitar" aria-label="Quitar método">×</button>';
            const cajaIcono = item.querySelector('.pago-badge');
            if (cajaIcono && def) pintarLogoPago(cajaIcono, def);
            const quitar = item.querySelector('.pago-quitar');
            if (quitar) quitar.addEventListener('click', () => { metodosPago.splice(indice, 1); pintarListaPagos(); });
            pagoLista.appendChild(item);
        });
    };

    /** Cierra el panel de formulario. */
    const cerrarPanelPago = () => {
        if (!pagoPanel) return;
        pagoPanel.hidden = true;
        pagoPanel.textContent = '';
    };

    /** Pinta el formulario de un método. */
    const abrirFormularioPago = (metodo, tipo) => {
        if (!pagoPanel) return;
        const def = buscarMetodo(metodo);
        const nombre = def ? def.nombre : metodo;
        const titulo = tipo === 'pago-movil' ? nombre + ' · Pago Móvil'
            : tipo === 'transferencia' ? nombre + ' · Transferencia bancaria'
            : nombre;
        const campos = CAMPOS_PAGO[tipo || metodo] || [];

        pagoPanel.hidden = false;
        pagoPanel.innerHTML = '<p class="pago-pregunta">' + titulo + '</p>' +
            '<form class="pago-formulario">' +
            campos.map((c) => '<label>' + c.etiqueta + '<input type="text" data-campo="' + c.clave + '" placeholder="' + c.placeholder + '" maxlength="300"></label>').join('') +
            '</form>' +
            '<div class="pago-acciones"><button type="button" class="pago-add">Añadir</button><button type="button" class="pago-cancelar">Cancelar</button></div>';

        const cancelar = pagoPanel.querySelector('.pago-cancelar');
        if (cancelar) cancelar.addEventListener('click', cerrarPanelPago);
        const agregar = pagoPanel.querySelector('.pago-add');
        if (agregar) {
            agregar.addEventListener('click', () => {
                /** @type {Record<string, string>} */
                const datos = {};
                pagoPanel.querySelectorAll('input[data-campo]').forEach((el) => {
                    const input = /** @type {HTMLInputElement} */ (el);
                    const valor = input.value.trim();
                    if (valor) datos[input.dataset.campo || ''] = valor;
                });
                const entrada = Object.assign({ metodo: tipo ? metodo : metodo }, datos);
                if (def && def.familia === 'banco') { entrada.banco = metodo; entrada.metodo = 'banco'; }
                if (tipo) entrada.tipo = tipo;
                metodosPago.push(entrada);
                pintarListaPagos();
                cerrarPanelPago();
            });
        }
    };

    /** Pregunta Pago Móvil o Transferencia cuando se elige un banco. */
    const preguntarTipoBanco = (banco) => {
        if (!pagoPanel) return;
        pagoPanel.hidden = false;
        pagoPanel.innerHTML = '<p class="pago-pregunta">¿Cómo quieres cobrar por <strong>' + banco.nombre + '</strong>?</p>' +
            '<div class="pago-opciones">' +
            '<button type="button" class="pago-opcion" data-tipo="pago-movil">Pago Móvil</button>' +
            '<button type="button" class="pago-opcion" data-tipo="transferencia">Transferencia bancaria</button>' +
            '<button type="button" class="pago-cancelar">Cancelar</button>' +
            '</div>';
        pagoPanel.querySelectorAll('.pago-opcion').forEach((b) => {
            b.addEventListener('click', () => abrirFormularioPago(banco.id, /** @type {HTMLElement} */ (b).dataset.tipo || ''));
        });
        const cancelar = pagoPanel.querySelector('.pago-cancelar');
        if (cancelar) cancelar.addEventListener('click', cerrarPanelPago);
    };

    /** Cierra el desplegable de pagos. */
    const cerrarSelectPago = () => {
        ajustarRecorteAcordeon(pagoSelectDropdown, false);
        if (pagoSelectDropdown) pagoSelectDropdown.classList.remove('open');
        if (pagoSelectTrigger) pagoSelectTrigger.setAttribute('aria-expanded', 'false');
    };

    /** Llena el desplegable con todos los métodos (icono + nombre). */
    const pintarSelectPago = () => {
        if (!pagoSelectDropdown) return;
        pagoSelectDropdown.textContent = '';
        metodosTodos().forEach((m) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'custom-select-option';
            b.setAttribute('role', 'option');
            const icono = document.createElement('span');
            icono.className = 'pago-badge opcion-badge';
            icono.style.setProperty('--pago-color', m.color);
            pintarLogoPago(icono, m);
            const nombre = document.createElement('span');
            nombre.className = 'opcion-nombre';
            nombre.textContent = m.nombre;
            b.appendChild(icono);
            b.appendChild(nombre);
            b.addEventListener('click', () => {
                cerrarSelectPago();
                if (m.familia === 'banco') preguntarTipoBanco(m);
                else abrirFormularioPago(m.id, '');
            });
            pagoSelectDropdown.appendChild(b);
        });
    };

    if (pagoSelectTrigger && pagoSelectDropdown) {
        pagoSelectTrigger.addEventListener('click', () => {
            const abierto = pagoSelectDropdown.classList.toggle('open');
            ajustarRecorteAcordeon(pagoSelectDropdown, abierto);
            pagoSelectTrigger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
        document.addEventListener('click', (ev) => {
            const objetivo = /** @type {Node} */ (ev.target);
            if (!pagoSelectTrigger.contains(objetivo) && !pagoSelectDropdown.contains(objetivo)) cerrarSelectPago();
        });
    }

    /** Carga lo guardado. */
    const cargarMetodosPago = (cobro) => {
        metodosPago = normalizarCobro(cobro);
        pintarListaPagos();
    };

    // ============================================
    // ROL: desplegable propio, se abre pero no cambia
    // ============================================
    const ROLES_TEXTO = { artista: 'Artista', comprador: 'Comprador', coleccionista: 'Coleccionista', curador: 'Curador', galeria: 'Galería' };
    const rolTrigger = /** @type {HTMLButtonElement | null} */ (document.getElementById('perfil-rol-trigger'));
    const rolDropdown = /** @type {HTMLElement | null} */ (document.getElementById('perfil-rol-dropdown'));

    const cerrarRol = () => {
        if (rolDropdown) rolDropdown.classList.remove('open');
        if (rolTrigger) rolTrigger.setAttribute('aria-expanded', 'false');
    };

    /** Pinta el rol actual y las opciones (que se ven pero no se pueden elegir). */
    const pintarRol = (rol) => {
        const clave = ROLES_TEXTO[rol] ? rol : 'artista';
        if (rolTrigger) rolTrigger.textContent = ROLES_TEXTO[clave];
        if (!rolDropdown) return;
        rolDropdown.textContent = '';
        Object.entries(ROLES_TEXTO).forEach(([valor, texto]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'custom-select-option' + (valor === clave ? ' selected' : '');
            b.setAttribute('role', 'option');
            b.setAttribute('aria-selected', valor === clave ? 'true' : 'false');
            b.textContent = texto;
            b.addEventListener('click', () => cerrarRol());
            rolDropdown.appendChild(b);
        });
    };

    if (rolTrigger && rolDropdown) {
        rolTrigger.addEventListener('click', () => {
            const abierto = rolDropdown.classList.toggle('open');
            rolTrigger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
        document.addEventListener('click', (ev) => {
            const objetivo = /** @type {Node} */ (ev.target);
            if (!rolTrigger.contains(objetivo) && !rolDropdown.contains(objetivo)) cerrarRol();
        });
    }

    const cargarPerfil = async () => {
        if (perfilCargado) return;
        perfilCargado = true;
        try {
            const res = await apiRequest('/api/artistas/perfil');
            const u = (res && res.artista) || {};
            // Foto actual en la vista previa.
            if (previewAvatar) {
                previewAvatar.src = u.foto_perfil || AVATAR_DEFECTO;
                quitarFoto = false;
            }
            // Municipio: se bloquea si lo cambió hace menos de 30 días.
            const cambióMs = u.ciudad_actualizada_en ? new Date(u.ciudad_actualizada_en).getTime() : 0;
            const faltaMs = cambióMs ? (cambióMs + 30 * 86400000) - Date.now() : 0;
            const bloqueado = faltaMs > 0;
            pintarMunicipios(u.ciudad || '', bloqueado);
            if (muniTrigger) {
                muniTrigger.disabled = bloqueado;
                muniTrigger.setAttribute('aria-disabled', bloqueado ? 'true' : 'false');
            }
            if (muniNota) {
                if (bloqueado) {
                    const dias = Math.ceil(faltaMs / 86400000);
                    muniNota.textContent = 'Podrás cambiarlo en ' + dias + (dias === 1 ? ' día.' : ' días.');
                    muniNota.classList.add('bloqueado');
                } else {
                    muniNota.textContent = 'Puedes cambiarlo una vez cada 30 días.';
                    muniNota.classList.remove('bloqueado');
                }
            }
            poner('perfil-bio-input', u.bio);
            actualizarContadorBio();
            poner('perfil-username-input', u.nombre_artista);
            poner('perfil-nombre-real-input', u.nombre_real);
            const rolSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('perfil-rol-select'));
            pintarRol(u.rol || 'artista');
            visibilidad = normalizarVisibilidad(u.visibilidad);
            pintarSwitches();
            aplicarVisibilidad();
            const redes = parsear(u.redes);
            pintarRedesGuardadas(redes);
            cargarMetodosPago(u.cobro);
        } catch (e) {
            debugLog.warn('No se pudieron cargar los datos del perfil:', e);
        }
    };

    if (accordionPerfil && perfilContent) {
        accordionPerfil.addEventListener('click', () => {
            const isExpanded = accordionPerfil.getAttribute('aria-expanded') === 'true';
            accordionPerfil.setAttribute('aria-expanded', String(!isExpanded));
            if (isExpanded) {
                perfilContent.hidden = true;
                perfilContent.style.maxHeight = '0';
                perfilContent.style.padding = '0 0';
            } else {
                perfilContent.hidden = false;
                setTimeout(() => {
                    perfilContent.style.maxHeight = '3000px';
                    perfilContent.style.padding = '20px 0';
                }, 10);
                cargarPerfil();
            }
        });
    }

    // Contador de palabras de la biografía en vivo.
    const campoBio = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('perfil-bio-input'));
    if (campoBio) {
        campoBio.addEventListener('input', actualizarContadorBio);
        actualizarContadorBio();
    }

    // ============================================
    // ACCORDION DE MONETIZACIÓN (opciones para cobrar)
    // ============================================
    const accordionMone = document.getElementById('accordion-monetizacion');
    const moneContent = document.getElementById('monetizacion-content');
    if (accordionMone && moneContent) {
        accordionMone.addEventListener('click', () => {
            const isExpanded = accordionMone.getAttribute('aria-expanded') === 'true';
            accordionMone.setAttribute('aria-expanded', String(!isExpanded));
            if (isExpanded) {
                moneContent.hidden = true;
                moneContent.style.maxHeight = '0';
                moneContent.style.padding = '0 0';
            } else {
                moneContent.hidden = false;
                setTimeout(() => {
                    moneContent.style.maxHeight = '3000px';
                    moneContent.style.padding = '20px 0';
                }, 10);
                // Los datos del perfil (incluido el cobro) se piden al abrir por primera vez.
                cargarPerfil();
            }
        });
    }

    // El botón de Monetización guarda lo mismo que el de Mi perfil.
    const btnGuardarMone = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-guardar-monetizacion'));
    if (btnGuardarMone) {
        btnGuardarMone.addEventListener('click', () => {
            const principal = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-guardar-perfil'));
            if (principal) principal.click();
        });
    }

    // «Quitar foto»: se deja sin foto y se guarda al momento (foto_perfil: '').
    const btnQuitarFoto = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-quitar-avatar-perfil'));
    if (btnQuitarFoto) {
        btnQuitarFoto.addEventListener('click', () => {
            quitarFoto = true;
            if (previewAvatar) previewAvatar.src = AVATAR_DEFECTO;
            const principal = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-guardar-perfil'));
            if (principal) principal.click();
        });
    }

    // Los dos desplegables se llenan al arrancar.
    pintarSelectPago();
    pintarSelectRedes();

    const btnGuardarPerfil = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-guardar-perfil'));
    if (btnGuardarPerfil) {
        btnGuardarPerfil.addEventListener('click', async () => {
            // El aviso se pinta en Mi perfil y en Monetización (se guardan juntos).
            const estados = ['perfil-estado', 'monetizacion-estado']
                .map((id) => document.getElementById(id))
                .filter((el) => !!el);
            const decir = (texto) => { estados.forEach((el) => { el.textContent = texto; }); };
            const ciudad = valorDe('perfil-ciudad-input');
            const bio = valorDe('perfil-bio-input');
            // Las redes salen de las filas que haya añadidas.
            const redes = leerRedes();
            const cobro = metodosPago;
            decir('');
            // Tope de 200 CARACTERES: si se pasa, no se guarda y se avisa.
            if (contarCaracteres(bio) > MAX_CARACTERES_BIO) {
                decir('❌ La biografía pasa de ' + MAX_CARACTERES_BIO + ' caracteres.');
                showWarning('La biografía no puede pasar de ' + MAX_CARACTERES_BIO + ' caracteres.');
                return;
            }
            const textoOriginal = btnGuardarPerfil.textContent;
            btnGuardarPerfil.disabled = true;
            btnGuardarPerfil.textContent = 'Guardando...';
            try {
                const res = await apiRequest('/api/artistas/perfil-datos', {
                    method: 'PUT',
                    body: JSON.stringify({ ciudad, redes, cobro, bio, visibilidad, foto_perfil: quitarFoto ? '' : undefined })
                });
                if (res && res.success) {
                    if (artistaActual) artistaActual.ciudad = ciudad;
                    // La cabecera muestra el MUNICIPIO, no la capital.
                    const mapaMuni = /** @type {Record<string, string> | undefined} */ (/** @type {any} */ (window).MUNICIPIO_POR_PUEBLO);
                    const municipio = (mapaMuni && ciudad) ? (mapaMuni[ciudad] || ciudad) : ciudad;
                    document.querySelectorAll('.perfil-ciudad').forEach((el) => { el.textContent = municipio; });
                    document.querySelectorAll('.perfil-bio').forEach((el) => { el.textContent = bio; });
                    // Iconos de redes: se repintan con lo que se acaba de guardar (perfil.js escucha).
                    document.dispatchEvent(new CustomEvent('perfil:redes', {
                        detail: { instagram: redes.instagram, facebook: redes.facebook, x: redes.x, telegram: redes.telegram, whatsapp: redes.whatsapp, correo: redes.correo, web: redes.web }
                    }));
                    if (artistaActual) artistaActual.redes = JSON.stringify(redes);
                    if (artistaActual) artistaActual.bio = bio;
                    // Si se quitó la foto, se cambia también el avatar grande y el del nav.
                    if (quitarFoto) {
                        if (artistaActual) artistaActual.foto_perfil = '';
                        document.querySelectorAll('.perfil-avatar-img-seccion').forEach((el) => { /** @type {HTMLImageElement} */ (el).src = AVATAR_DEFECTO; });
                        const avatarNav = document.querySelector('#btn-perfil-sidebar img');
                        if (avatarNav) /** @type {HTMLImageElement} */ (avatarNav).src = AVATAR_DEFECTO;
                        quitarFoto = false;
                    }
                    decir('✅ Guardado.');
                    showSuccess('Perfil actualizado');
                } else {
                    decir('❌ ' + ((res && res.error) || 'No se pudo guardar.'));
                }
            } catch (e) {
                decir('❌ Error de conexión. Intenta más tarde.');
            } finally {
                btnGuardarPerfil.disabled = false;
                btnGuardarPerfil.textContent = textoOriginal;
            }
        });
    }

    const btnAvatarPerfil = document.getElementById('btn-cambiar-avatar-perfil');
    if (btnAvatarPerfil) {
        btnAvatarPerfil.addEventListener('click', () => {
            const input = /** @type {HTMLInputElement | null} */ (document.getElementById('input-foto-perfil'));
            if (input) input.click();
        });
    }

    const accordionSesion = document.getElementById('accordion-sesion');
    const sesionContent = document.getElementById('sesion-content');
    if (accordionSesion && sesionContent) {
        accordionSesion.addEventListener('click', () => {
            const isExpanded = accordionSesion.getAttribute('aria-expanded') === 'true';
            accordionSesion.setAttribute('aria-expanded', String(!isExpanded));
            if (isExpanded) {
                sesionContent.hidden = true;
                sesionContent.style.maxHeight = '0';
                sesionContent.style.padding = '0 0';
            } else {
                sesionContent.hidden = false;
                setTimeout(() => {
                    sesionContent.style.maxHeight = '2000px';
                    sesionContent.style.padding = '20px 0';
                }, 10);
            }
        });
    }

    // ============================================
    // ACCORDION DE MODO (claro/oscuro)
    // ============================================
    const accordionModo = document.getElementById('accordion-modo');
    const modoContent = document.getElementById('modo-content');
    if (accordionModo && modoContent) {
        accordionModo.addEventListener('click', () => {
            const isExpanded = accordionModo.getAttribute('aria-expanded') === 'true';
            accordionModo.setAttribute('aria-expanded', String(!isExpanded));
            if (isExpanded) {
                modoContent.hidden = true;
                modoContent.style.maxHeight = '0';
                modoContent.style.padding = '0 0';
            } else {
                modoContent.hidden = false;
                setTimeout(() => {
                    modoContent.style.maxHeight = '2000px';
                    modoContent.style.padding = '20px 0';
                }, 10);
            }
        });
    }

    // Botón: Cerrar Sesión
    const btnCerrarSesion = /** @type {HTMLButtonElement} */ (document.getElementById('btn-cerrar-sesion'));
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            btnCerrarSesion.disabled = true;
            btnCerrarSesion.textContent = 'Cerrando...';
            try {
                await apiRequest('/api/artistas/logout', { method: 'POST' });
            } catch (e) {
                debugLog.error('Error en logout backend:', e);
            }
            logout();
        });
    }

    // Botón: Cerrar demás sesiones (se actualiza desde main.js vía updateCerrarTodasSesionesButtonState)
    const btnCerrarTodas = document.getElementById('btn-cerrar-todas-sesiones');
    if (btnCerrarTodas) {
        btnCerrarTodas.addEventListener('click', () => {
            // closeAllSessions se define en main.js y es accesible globalmente
            if (typeof window.closeAllSessions === 'function') {
                window.closeAllSessions();
            }
        });
    }

    // ============================================
    // BOTONES "CANCELAR"
    // ============================================
    document.querySelectorAll('.btn-cuenta-cancelar[data-cancelar]').forEach(btn => {
        // querySelectorAll devuelve Element (sin .dataset): se dice que es un HTMLElement.
        const el = /** @type {HTMLElement} */ (btn);
        el.addEventListener('click', () => ocultarFormularioCuenta(String(el.dataset.cancelar)));
    });

    // ============================================
    // CAMBIAR CORREO ELECTRÓNICO
    // ============================================
    const btnCambiarEmail = /** @type {HTMLButtonElement} */ (document.getElementById('btn-cambiar-email'));
    const formCambiarEmail = /** @type {HTMLFormElement} */ (document.getElementById('form-cambiar-email'));
    const formConfirmarEmail = /** @type {HTMLFormElement} */ (document.getElementById('form-confirmar-email'));

    if (btnCambiarEmail && formCambiarEmail) {
        btnCambiarEmail.addEventListener('click', () => {
            ocultarFormularioCuenta('form-confirmar-email');
            formCambiarEmail.classList.toggle('hidden');
        });

        formCambiarEmail.addEventListener('submit', (e) => {
            e.preventDefault();
            const nuevoEmail = /** @type {HTMLInputElement} */ (document.getElementById('nuevo-email')).value.trim();
            const errorEl = /** @type {HTMLElement} */ (document.getElementById('error-nuevo-email'));
            errorEl.textContent = '';
            const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoEmail);
            if (!emailValido || !esEmailValido(nuevoEmail)) {
                errorEl.textContent = 'Ingresa un correo electrónico válido.';
                return;
            }
            if (esDominioDesechable(nuevoEmail)) {
                errorEl.textContent = 'No se permiten correos temporales o desechables. Usa tu correo personal.';
                return;
            }
            const emailActual = (/** @type {HTMLInputElement} */ (document.getElementById('cuenta-email-actual')).value || '').trim().toLowerCase();
            if (nuevoEmail.toLowerCase() === emailActual) {
                errorEl.textContent = 'El nuevo correo debe ser diferente al actual.';
                return;
            }
            formCambiarEmail.classList.add('hidden');
            formConfirmarEmail.classList.remove('hidden');
        });
    }

    if (formConfirmarEmail) {
        formConfirmarEmail.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = /** @type {HTMLInputElement} */ (document.getElementById('email-password')).value;
            const errorEl = /** @type {HTMLElement} */ (document.getElementById('error-email-password'));
            errorEl.textContent = '';
            if (!password) {
                errorEl.textContent = 'Ingresa tu contraseña para confirmar.';
                return;
            }
            const nuevoEmail = /** @type {HTMLInputElement} */ (document.getElementById('nuevo-email')).value.trim();
            const btnSubmit = formConfirmarEmail.querySelector('button[type="submit"]');
            setButtonLoading(btnSubmit, true);

            try {
                const res = await apiRequest('/api/artistas/cambiar-email', {
                    method: 'POST',
                    body: JSON.stringify({ nuevo_email: nuevoEmail, password })
                });

                setButtonLoading(btnSubmit, false);

                if (res && res.success) {
                    showSuccess(res.message);
                    const emailInput = /** @type {HTMLInputElement} */ (document.getElementById('cuenta-email-actual'));
                    if (emailInput) emailInput.value = nuevoEmail;
                    if (artistaActual) {
                        artistaActual.email = nuevoEmail;
                        try {
                            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
                        } catch (e) {
                            debugLog.error('No se pudo actualizar el correo en localStorage:', e);
                        }
                    }
                    ocultarFormularioCuenta('form-confirmar-email');
                    ocultarFormularioCuenta('form-cambiar-email');
                } else {
                    mostrarErrorBackend(res, errorEl);
                }
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }

    // ============================================
    // CAMBIAR CONTRASEÑA
    // ============================================
    const btnCambiarPassword = /** @type {HTMLButtonElement} */ (document.getElementById('btn-cambiar-password'));
    const formCambiarPassword = /** @type {HTMLFormElement} */ (document.getElementById('form-cambiar-password'));

    if (btnCambiarPassword && formCambiarPassword) {
        btnCambiarPassword.addEventListener('click', () => {
            formCambiarPassword.classList.toggle('hidden');
        });

        const passNueva = /** @type {HTMLInputElement} */ (document.getElementById('pass-nueva'));
        const strengthWidget = document.getElementById('cuenta-password-strength');
        const strengthText = strengthWidget ? strengthWidget.querySelector('.strength-text') : null;
        if (passNueva && strengthWidget) {
            passNueva.addEventListener('input', () => {
                const val = passNueva.value;
                if (!val) {
                    strengthWidget.removeAttribute('data-level');
                    if (strengthText) strengthText.textContent = '';
                    return;
                }
                // Mismo algoritmo que el backend (js/password-strength.js)
                const { nivel, etiqueta } = calcularFortalezaPassword(val);
                strengthWidget.setAttribute('data-level', String(nivel));
                if (strengthText) strengthText.textContent = etiqueta;
            });
        }

        formCambiarPassword.addEventListener('submit', async (e) => {
            e.preventDefault();
            const actual = /** @type {HTMLInputElement} */ (document.getElementById('pass-actual')).value;
            const nueva = /** @type {HTMLInputElement} */ (document.getElementById('pass-nueva')).value;
            const confirmar = /** @type {HTMLInputElement} */ (document.getElementById('pass-confirmar')).value;
            const errorEl = /** @type {HTMLElement} */ (document.getElementById('error-pass-confirmar'));
            errorEl.textContent = '';
            if (!actual || !nueva || !confirmar) {
                errorEl.textContent = 'Completa todos los campos.';
                return;
            }
            if (nueva.length < 8) {
                errorEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
                return;
            }
            // Verificar fortaleza mínima: MISMO criterio que el backend, que
            // exige nivel >= 3 (nivel 3 = 4 puntos). Antes se validaba "puntos < 3",
            // así que una contraseña de 3 puntos (nivel "Media", p. ej. abcdefg1)
            // pasaba aquí y el servidor la rechazaba con 400.
            const { nivel } = calcularFortalezaPassword(nueva);
            if (nivel < NIVEL_MIN_PASSWORD) {
                errorEl.textContent = 'La contraseña es muy débil. Usa mayúsculas, minúsculas, números y símbolos.';
                return;
            }
            if (nueva === actual) {
                errorEl.textContent = 'La nueva contraseña debe ser diferente a la actual.';
                return;
            }
            if (nueva !== confirmar) {
                errorEl.textContent = 'Las contraseñas no coinciden.';
                return;
            }
            const btnSubmit = formCambiarPassword.querySelector('button[type="submit"]');
            setButtonLoading(btnSubmit, true);

            try {
                const res = await apiRequest('/api/artistas/cambiar-password', {
                    method: 'POST',
                    body: JSON.stringify({ password_actual: actual, password_nueva: nueva })
                });

                setButtonLoading(btnSubmit, false);

                if (res && res.success) {
                    showSuccess(res.message);
                    ocultarFormularioCuenta('form-cambiar-password');
                } else {
                    mostrarErrorBackend(res, errorEl);
                }
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }

    // ============================================
    // ELIMINAR CUENTA
    // ============================================
    const btnEliminarCuenta = document.getElementById('btn-eliminar-cuenta');
    const formEliminarCuenta = document.getElementById('form-eliminar-cuenta');
    if (btnEliminarCuenta && formEliminarCuenta) {
        btnEliminarCuenta.addEventListener('click', () => {
            formEliminarCuenta.classList.toggle('hidden');
        });

        formEliminarCuenta.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = /** @type {HTMLInputElement} */ (document.getElementById('eliminar-password')).value;
            const errorEl = /** @type {HTMLElement} */ (document.getElementById('error-eliminar-cuenta'));
            errorEl.textContent = '';
            if (!password) {
                errorEl.textContent = 'Ingresa tu contraseña para confirmar.';
                return;
            }
            const btnSubmit = formEliminarCuenta.querySelector('button[type="submit"]');
            setButtonLoading(btnSubmit, true);
            try {
                const res = await apiRequest('/api/artistas/eliminar-cuenta', {
                    method: 'POST',
                    body: JSON.stringify({ password })
                });
                setButtonLoading(btnSubmit, false);
                if (res && res.success) {
                    showSuccess("Tu cuenta ha sido eliminada correctamente.");
                    logout();
                    location.reload();
                } else {
                    mostrarErrorBackend(res, errorEl);
                }
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }
}

// ============================================
// LOS ERRORES DE LOS FORMULARIOS SALEN COMO AVISO
// ============================================
/** Convierte los mensajes que se escriben en los .cuenta-error en avisos (toast). */
const vigilarErroresDeFormulario = () => {
    document.querySelectorAll('#mi-cuenta .cuenta-error').forEach((el) => {
        const nodo = /** @type {HTMLElement} */ (el);
        if (nodo.dataset.vigilado === '1') return;
        nodo.dataset.vigilado = '1';
        new MutationObserver(() => {
            const texto = (nodo.textContent || '').trim();
            if (!texto) return;
            nodo.textContent = '';
            showError(texto.replace(/^❌\s*/, ''));
        }).observe(nodo, { childList: true, characterData: true, subtree: true });
    });
};

// ============================================
// SIN BURBUJA NATIVA: "Completa este campo" sale como aviso
// ============================================
/** Quita la validación del navegador y avisa con un toast si falta algún campo. */
const vigilarCamposVacios = () => {
    document.querySelectorAll('#mi-cuenta form.cuenta-form').forEach((form) => {
        const f = /** @type {HTMLFormElement} */ (form);
        if (f.dataset.sinBurbuja === '1') return;
        f.dataset.sinBurbuja = '1';
        f.setAttribute('novalidate', '');
        f.addEventListener('submit', (ev) => {
            const campos = /** @type {HTMLInputElement[]} */ ([...f.querySelectorAll('input[required]')]);
            const vacio = campos.find((i) => !i.value.trim());
            if (!vacio) return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            showError('Completa todos los campos.');
            vacio.focus();
        }, true);
    });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { vigilarErroresDeFormulario(); vigilarCamposVacios(); });
else { vigilarErroresDeFormulario(); vigilarCamposVacios(); }
