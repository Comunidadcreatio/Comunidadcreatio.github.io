// js/auth-logic.js - Lógica de autenticación para la página separada

import { login, register } from './auth.js';
import { ARTISTA_KEY, apiRequest } from './config.js';
import { showSuccess, showError, showWarning, setButtonLoading } from './notificaciones.js';
import { mostrarErrores, debounce, debugLog } from './utils.js';
import { setupDarkModeToggle } from './theme.js'; // v67

// ============================================
// VARIABLES GLOBALES
// ============================================
let currentStep = 1;
const totalSteps = 5;

// Estado de disponibilidad de email y nombre de usuario
const disponibilidad = {
    email: null,   // true | false | null (sin verificar)
    nombre: null
};

// mostrarErrores y debounce importados de utils.js

// Ciudades para el registro
const ciudadesPorPais = {
    'Venezuela': {
        'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
    }
};

const ciudadBandera = {
    'San Cristóbal': 'san-cristobal.webp',
    'San Antonio del Táchira': 'bolivar.webp',
    'San Juan de Colón': 'ayacucho.webp',
    'Táriba': 'cardenas.webp',
    'Rubio': 'junin.webp',
    'La Fría': 'garcia-de-hevia.webp',
    'San Josecito': 'torbes.webp',
    'Palmira': 'guasimos.webp',
    'Capacho Nuevo': 'independencia.webp',
    'Capacho Viejo': 'libertad.webp',
    'La Grita': 'jauregui.webp',
    'Abejales': 'libertador.webp',
    'Lobatera': 'lobatera.webp',
    'Michelena': 'michelena.webp',
    'Ureña': 'pedro-maria-urena.webp',
    'Cordero': 'andres-bello.webp',
    'Las Mesas': 'antonio-romulo-costa.webp',
    'Santa Ana del Táchira': 'cordoba.webp',
    'San Rafael del Piñal': 'fernandez-feo.webp',
    'San José de Bolívar': 'francisco-de-miranda.webp',
    'El Cobre': 'jose-maria-vargas.webp',
    'Coloncito': 'panamericano.webp',
    'Delicias': 'rafael-urdaneta.webp',
    'La Tendida': 'samuel-dario-maldonado.webp',
    'San Judas Tadeo': 'san-judas-tadeo.webp',
    'Seboruco': 'seboruco.webp',
    'San Simón': 'simon-rodriguez.webp',
    'Queniquea': 'sucre.webp',
    'Pregonero': 'uribante.webp'
};

function poblarCiudades(paisSeleccionado) {
    const hiddenInput = document.getElementById('reg-ciudad');
    const trigger = document.getElementById('ciudad-trigger');
    const dropdown = document.getElementById('ciudad-dropdown');
    if (!hiddenInput || !trigger || !dropdown) return;

    dropdown.innerHTML = '';
    hiddenInput.value = '';
    trigger.textContent = 'Selecciona tu ciudad';

    if (paisSeleccionado && ciudadesPorPais[paisSeleccionado]) {
        const data = ciudadesPorPais[paisSeleccionado];
        Object.keys(data).forEach(departamento => {
            const groupLabel = document.createElement('div');
            groupLabel.className = 'custom-select-group';
            groupLabel.textContent = departamento;
            dropdown.appendChild(groupLabel);

            data[departamento].forEach(ciudad => {
                const item = document.createElement('div');
                item.className = 'custom-select-option';
                const bandera = ciudadBandera[ciudad] || '';
                item.innerHTML = (bandera
                    ? `<img src="iconos/banderas/${bandera}" alt="" class="custom-select-flag" />`
                    : '') + `<span>${ciudad}</span>`;
                item.addEventListener('click', () => {
                    hiddenInput.value = ciudad;
                    trigger.textContent = ciudad;
                    // Disparar evento change para validación
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                    dropdown.classList.remove('open');
                });
                dropdown.appendChild(item);
            });
        });
    }
}

function paisChangeHandler() {
    const paisSelect = document.getElementById('reg-pais');
    if (paisSelect) {
        poblarCiudades(paisSelect.value);
    }
}

// Convierte un <select> en dropdown custom (transparente, fixed, blur)
function initCustomSelect(selectEl, placeholder) {
    if (!selectEl || selectEl.dataset.customReady === '1') return;
    selectEl.dataset.customReady = '1';
    selectEl.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.textContent = placeholder || 'Seleccionar';
    wrapper.appendChild(trigger);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    wrapper.appendChild(dropdown);

    function buildOptions() {
        dropdown.innerHTML = '';
        Array.from(selectEl.querySelectorAll('option')).forEach(opt => {
            if (opt.disabled && !opt.value) return; // skip placeholder
            const item = document.createElement('div');
            item.className = 'custom-select-option';
            item.textContent = opt.textContent;
            item.dataset.value = opt.value;
            item.addEventListener('click', () => {
                selectEl.value = opt.value;
                trigger.textContent = opt.textContent;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                dropdown.classList.remove('open');
            });
            dropdown.appendChild(item);
        });
    }

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width - 24)) + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        if (!isOpen) {
            buildOptions();
            positionDropdown();
        }
        dropdown.classList.toggle('open');
    });

    window.addEventListener('scroll', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
            dropdown.classList.remove('open');
        }
    });

    // Sync trigger text if select changes programmatically
    selectEl.addEventListener('change', () => {
        const selected = selectEl.selectedOptions[0];
        if (selected) trigger.textContent = selected.textContent;
    });
}

function setupAllCustomSelects() {
    // País
    initCustomSelect(document.getElementById('reg-pais'), 'Selecciona tu país');
    // Fecha
    initCustomSelect(document.getElementById('reg-dia'), 'Día');
    initCustomSelect(document.getElementById('reg-mes'), 'Mes');
    initCustomSelect(document.getElementById('reg-ano'), 'Año');
    // Género
    initCustomSelect(document.getElementById('reg-genero'), 'Selecciona Género');
}

// Ejecutar al cargar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAllCustomSelects);
} else {
    setupAllCustomSelects();
}

// Dropdown toggle con posicionamiento fixed
document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.getElementById('ciudad-trigger');
    const dropdown = document.getElementById('ciudad-dropdown');
    if (!trigger || !dropdown) return;

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width - 24)) + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        if (!isOpen) positionDropdown();
        dropdown.classList.toggle('open');
    });

    window.addEventListener('scroll', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
            dropdown.classList.remove('open');
        }
    });
});

async function verificarDisponibilidad(tipo, valor, inputElement) {
    const clave = tipo === 'email' ? 'email' : 'nombre';

    if (!valor.trim()) {
        inputElement.classList.remove('input-available', 'input-unavailable');
        const msg = inputElement.parentElement.querySelector('.validation-message');
        if (msg) msg.remove();
        disponibilidad[clave] = null;
        return;
    }

    try {
        const endpoint = tipo === 'email'
            ? `/api/artistas/verificar-email/${encodeURIComponent(valor)}`
            : `/api/artistas/verificar-nombre/${encodeURIComponent(valor)}`;

        const data = await apiRequest(endpoint);

        let msg = inputElement.parentElement.querySelector('.validation-message');
        if (!msg) {
            msg = document.createElement('div');
            msg.className = 'validation-message';
            inputElement.parentElement.appendChild(msg);
        }

        if (data.available) {
            inputElement.classList.remove('input-unavailable');
            inputElement.classList.add('input-available');
            msg.classList.remove('unavailable');
            msg.style.display = 'none';
            disponibilidad[clave] = true;
        } else {
            inputElement.classList.remove('input-available');
            inputElement.classList.add('input-unavailable');
            msg.className = 'validation-message unavailable';
            msg.style.display = 'block';
            const mensajeError = tipo === 'email'
                ? '❌ Este correo ya está registrado'
                : '❌ Este nombre de usuario ya está en uso';
            msg.textContent = mensajeError;
            disponibilidad[clave] = false;
        }
    } catch (error) {
        debugLog.error('Error al verificar disponibilidad:', error);
        disponibilidad[clave] = null;
    }
}

// ============================================
// VALIDACIONES DE FORMATO
// ============================================

// Dominios de correo desechable / temporal conocidos (deduplicados)
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

// TLDs válidos más comunes (lista amplia pero razonable)
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

function esEmailValido(email) {
    const trimmed = email.trim().toLowerCase();
    // Formato básico
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!re.test(trimmed)) return false;
    // Verificar que el dominio tenga formato correcto
    const dominio = trimmed.split('@')[1];
    if (!dominio || dominio.length < 4) return false;
    // Verificar TLD
    const partes = dominio.split('.');
    if (partes.length < 2) return false;
    const tld = partes[partes.length - 1];
    if (tld.length < 2 || tld.length > 10) return false;
    return true;
}

function esDominioDesechable(email) {
    const dominio = email.trim().toLowerCase().split('@')[1] || '';
    return DOMINIOS_DESECHABLES.includes(dominio);
}

function esTLDSospechoso(email) {
    const dominio = email.trim().toLowerCase().split('@')[1] || '';
    const partes = dominio.split('.');
    const tld = partes[partes.length - 1];
    const dominioCompleto = partes.slice(-2).join('.');
    return !TLDS_VALIDOS.includes(tld) && !TLDS_VALIDOS.includes(dominioCompleto);
}

function esTelefonoValido(telefono) {
    // Acepta 7 a 15 dígitos, opcionalmente con + inicial
    const limpio = telefono.replace(/[\s-]/g, '');
    const re = /^\+?\d{7,15}$/;
    return re.test(limpio);
}

// Nivel mínimo aceptado para registrarse (3 = "Buena")
const NIVEL_MIN_PASSWORD = 3;

// Evalúa los requisitos de una contraseña
function evaluarRequisitosPassword(password) {
    return {
        length: password.length >= 8,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
}

// Calcula el nivel de fortaleza (0 a 4) y su etiqueta
function calcularFortalezaPassword(password) {
    if (!password) {
        return { nivel: 0, etiqueta: '', requisitos: evaluarRequisitosPassword('') };
    }

    const req = evaluarRequisitosPassword(password);
    let puntos = Object.values(req).filter(Boolean).length;

    // Bonus por longitud generosa
    if (password.length >= 12) puntos++;

    let nivel;
    if (puntos <= 2) nivel = 1;       // Débil
    else if (puntos === 3) nivel = 2; // Media
    else if (puntos === 4) nivel = 3; // Buena
    else nivel = 4;                   // Fuerte

    // Sin la longitud mínima nunca pasa de débil
    if (!req.length) nivel = 1;

    const etiquetas = { 1: 'Débil', 2: 'Media', 3: 'Buena', 4: 'Fuerte' };
    return { nivel, etiqueta: etiquetas[nivel], requisitos: req };
}

// Actualiza la UI del medidor en tiempo real
function actualizarMedidorPassword(password) {
    const strengthEl = document.getElementById('password-strength');
    const requirementsEl = document.getElementById('password-requirements');
    if (!strengthEl || !requirementsEl) return;

    const labelEl = strengthEl.querySelector('.strength-label');
    const { nivel, etiqueta, requisitos } = calcularFortalezaPassword(password);

    if (!password) {
        strengthEl.classList.remove('active');
        requirementsEl.classList.remove('active');
        strengthEl.removeAttribute('data-level');
        if (labelEl) labelEl.textContent = '';
    } else {
        strengthEl.classList.add('active');
        requirementsEl.classList.add('active');
        strengthEl.setAttribute('data-level', nivel);
        if (labelEl) labelEl.textContent = etiqueta;
    }

    // Marcar requisitos cumplidos
    requirementsEl.querySelectorAll('li').forEach(li => {
        const clave = li.dataset.req;
        li.classList.toggle('met', !!requisitos[clave]);
    });
}

// Marca un input con borde rojo y devuelve false
function marcarInputError(input) {
    if (input) input.classList.add('input-error');
    return false;
}

const verificarEmailDebounced = debounce((valor, input) => {
    verificarDisponibilidad('email', valor, input);
}, 800);

const verificarNombreDebounced = debounce((valor, input) => {
    verificarDisponibilidad('nombre', valor, input);
}, 800);

// ============================================
// SELECTORES DE FECHA PARA REGISTRO
// ============================================
function cargarSelectoresFecha() {
    // Guardar valores actuales antes de reconstruir (para no perderlos al volver atrás)
    const diaSelect = document.getElementById('reg-dia');
    const mesSelect = document.getElementById('reg-mes');
    const anoSelect = document.getElementById('reg-ano');
    const diaActual = diaSelect ? diaSelect.value : '';
    const mesActual = mesSelect ? mesSelect.value : '';
    const anoActual = anoSelect ? anoSelect.value : '';

    if (diaSelect) {
        diaSelect.innerHTML = '<option value="" disabled selected>Día</option>';
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            diaSelect.appendChild(option);
        }
        if (diaActual) diaSelect.value = diaActual;
    }
    if (mesSelect) {
        mesSelect.innerHTML = '<option value="" disabled selected>Mes</option>';
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        meses.forEach((nombre, i) => {
            const option = document.createElement('option');
            option.value = i + 1;
            option.textContent = nombre;
            mesSelect.appendChild(option);
        });
        if (mesActual) mesSelect.value = mesActual;
    }
    if (anoSelect) {
        anoSelect.innerHTML = '<option value="" disabled selected>Año</option>';
        const maxYear = new Date().getFullYear() - 18;
        for (let i = maxYear; i >= 1900; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            anoSelect.appendChild(option);
        }
        if (anoActual) anoSelect.value = anoActual;
    }
}

// ============================================
// MANEJO DE PASOS DEL REGISTRO
// ============================================

function showStep(step) {
    document.querySelectorAll('.step').forEach(el => el.style.display = 'none');
    const target = document.querySelector(`.step[data-step="${step}"]`);
    if (target) target.style.display = 'block';
    currentStep = step;

    // Limpiar solo estilos de error al cambiar de paso (preservar mensajes de disponibilidad)
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.error-message-field.visible').forEach(el => el.classList.remove('visible'));
    // Solo limpiar clases de disponibilidad visual, no los mensajes
    document.querySelectorAll('.input-available, .input-unavailable').forEach(el => {
        el.classList.remove('input-available', 'input-unavailable');
    });

    // Cargar ciudades al llegar al paso 2
    if (step === 2) {
        const paisSelect = document.getElementById('reg-pais');
        if (paisSelect && !paisSelect.value) {
            // Primera visita: resetear país y cargar ciudades
            paisSelect.value = '';
            paisChangeHandler();
        } else if (paisSelect && paisSelect.value) {
            // Volviendo atrás: repoblar dropdown de ciudades pero conservar selección
            const ciudadActual = document.getElementById('reg-ciudad')?.value || '';
            poblarCiudades(paisSelect.value);
            // Restaurar ciudad si aún existe en el nuevo dropdown
            if (ciudadActual) {
                const hiddenInput = document.getElementById('reg-ciudad');
                const trigger = document.getElementById('ciudad-trigger');
                if (hiddenInput) hiddenInput.value = ciudadActual;
                if (trigger) trigger.textContent = ciudadActual;
            }
        }
    }
    // Cargar selectores de fecha al llegar al paso 3
    if (step === 3) {
        cargarSelectoresFecha();
    }
}

function mostrarPasoActual() {
    document.querySelectorAll('.step').forEach(el => el.style.display = 'none');
    const target = document.querySelector(`.step[data-step="${currentStep}"]`);
    if (target) target.style.display = 'block';
}

function validateStep(step) {
    const stepContainer = document.querySelector(`.step[data-step="${step}"]`);
    if (!stepContainer) return true;

    // Limpiar errores previos del paso actual
    stepContainer.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

    // Validar campos requeridos del paso actual (usar data-required)
    const inputs = stepContainer.querySelectorAll('input, select');
    let isValid = true;

    for (let input of inputs) {
        if (input.hasAttribute('required') && !input.value.trim()) {
            input.classList.add('input-error');
            isValid = false;
        }
    }

    if (!isValid) {
            showWarning('Completa todos los campos requeridos.');
            return false;
        }

    // 2. Validaciones específicas por paso
    if (step === 2) {
        // País y ciudad - solo validación de campos requeridos (ya cubierta arriba)
    }

    if (step === 3) {
        // Fecha y género - solo validación de campos requeridos (ya cubierta arriba)
    }

    if (step === 4) {
        const emailInput = document.getElementById('reg-email');
        const telefonoInput = document.getElementById('reg-telefono');

        if (emailInput && !esEmailValido(emailInput.value)) {
            marcarInputError(emailInput);
            showWarning('Ingresa un correo electrónico válido.');
            return false;
        }
        if (emailInput && esDominioDesechable(emailInput.value)) {
            marcarInputError(emailInput);
            showWarning('No se permiten correos temporales o desechables. Usa tu correo personal.');
            return false;
        }
        if (emailInput && esTLDSospechoso(emailInput.value)) {
            showWarning('El dominio de tu correo parece inusual. Verifica que sea correcto antes de continuar.');
        }
        if (disponibilidad.email !== true) {
            marcarInputError(emailInput);
            showWarning(disponibilidad.email === false ? 'Este correo ya está registrado. Usa otro.' : 'Espera mientras verificamos el correo...');
            return false;
        }
        if (telefonoInput && !esTelefonoValido(telefonoInput.value)) {
            marcarInputError(telefonoInput);
            showWarning('Ingresa un número de celular válido (solo dígitos).');
            return false;
        }
    }

    if (step === 5) {
        const nombreInput = document.getElementById('reg-nombre-artista');
        const passInput = document.getElementById('reg-pass');

        if (disponibilidad.nombre !== true) {
            marcarInputError(nombreInput);
            showWarning(disponibilidad.nombre === false ? 'Este nombre de usuario ya está en uso. Elige otro.' : 'Espera mientras verificamos el nombre...');
            return false;
        }
        if (passInput) {
            if (passInput.value.length < 8) {
                marcarInputError(passInput);
                showWarning('La contraseña debe tener al menos 8 caracteres.');
                return false;
            }
            const { nivel } = calcularFortalezaPassword(passInput.value);
            if (nivel < NIVEL_MIN_PASSWORD) {
                marcarInputError(passInput);
                showWarning('Tu contraseña es muy débil. Combina mayúsculas, minúsculas, números y símbolos.');
                return false;
            }
        }
    }

    return true;
}

// ============================================
// MANEJO DE VISTAS (LOGIN/REGISTRO)
// ============================================
function showLoginSection() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('registro-section').classList.add('hidden');
    document.getElementById('forgot-section').classList.add('hidden');
    if (window.volverAlBranding) window.volverAlBranding();
}

function showRegistroSection() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('registro-section').classList.remove('hidden');
    document.getElementById('forgot-section').classList.add('hidden');
    showStep(1);
}

function showForgotSection() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('registro-section').classList.add('hidden');
    document.getElementById('forgot-section').classList.remove('hidden');
    const msgEl = document.getElementById('forgot-msg');
    if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; }
    const emailInput = document.getElementById('forgot-email');
    if (emailInput) emailInput.value = '';
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Verificar si ya está logueado (usando artistaData en vez del token)
    const artistaData = localStorage.getItem(ARTISTA_KEY);
    if (artistaData) {
        // Prevenir bucle de redirección
        const redirectFlag = sessionStorage.getItem('auth_redirect_flag');
        const now = Date.now();
        if (redirectFlag && (now - parseInt(redirectFlag)) < 5000) {
            debugLog.warn('Bucle de redirección detectado. Limpiando sesión.');
            localStorage.removeItem(ARTISTA_KEY);
            sessionStorage.removeItem('auth_redirect_flag');
            return;
        }
        sessionStorage.setItem('auth_redirect_flag', now.toString());
        window.location.href = 'index.html';
        return;
    }
    sessionStorage.removeItem('auth_redirect_flag');

    // Botón para ir a registro
    const btnIrRegistro = document.getElementById('btn-ir-registro');
    if (btnIrRegistro) {
        btnIrRegistro.addEventListener('click', showRegistroSection);
    }

    // Enlace ¿Olvidaste tu contraseña? → mostrar sección de solicitud
    const btnOlvide = document.getElementById('btn-olvide-contrasena');
    if (btnOlvide) {
        btnOlvide.addEventListener('click', function(e) {
            e.preventDefault();
            showForgotSection();
        });
    }

    // Botón volver en la sección de olvidé contraseña
    const btnVolverForgot = document.getElementById('btn-volver-login-from-forgot');
    if (btnVolverForgot) {
        btnVolverForgot.addEventListener('click', showLoginSection);
    }

    // Formulario de solicitud de restablecimiento
    const forgotForm = document.getElementById('solicitar-restablecimiento-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const emailInput = document.getElementById('forgot-email');
            const msgEl = document.getElementById('forgot-msg');
            const btn = document.getElementById('btn-enviar-reset');
            const email = emailInput.value.trim();

            if (!esEmailValido(email)) {
                marcarInputError(emailInput);
                msgEl.textContent = 'Ingresa un correo electrónico válido.';
                msgEl.style.color = 'var(--color-danger)';
                msgEl.style.display = 'block';
                return;
            }

            setButtonLoading(btn, true);
            msgEl.style.display = 'none';

            try {
                const data = await apiRequest('/api/artistas/solicitar-restablecimiento', {
                    method: 'POST',
                    body: JSON.stringify({ email })
                });
                setButtonLoading(btn, false);
                if (data.success) {
                    emailInput.value = '';
                    emailInput.classList.remove('input-error');
                    msgEl.textContent = 'Si el correo está registrado, recibirás un enlace en tu bandeja de entrada.';
                    msgEl.style.color = 'var(--color-success)';
                    msgEl.style.display = 'block';
                } else {
                    msgEl.textContent = data.error || 'No se pudo procesar la solicitud. Inténtalo más tarde.';
                    msgEl.style.color = 'var(--color-danger)';
                    msgEl.style.display = 'block';
                }
            } catch (error) {
                setButtonLoading(btn, false);
                msgEl.textContent = 'Error de conexión. Inténtalo más tarde.';
                msgEl.style.color = 'var(--color-danger)';
                msgEl.style.display = 'block';
            }
        });
    }

    // Navegación de pasos del registro (sin transición cinematográfica)
    document.addEventListener('click', function(e) {
        if (e.target.closest('.nav-btn')) {
            const btn = e.target.closest('.nav-btn');
            const step = parseInt(btn.dataset.step);
            const isPrev = btn.classList.contains('prev-btn');
            
            if (isPrev) {
                if (step === 1) {
                    showLoginSection();
                    return;
                }
                showStep(step - 1);
            } else {
                if (!validateStep(step)) return;
                if (step + 1 <= totalSteps) showStep(step + 1);
            }
        }
    });

    // Cargar ciudades al cambiar de país
    const regPais = document.getElementById('reg-pais');
    if (regPais) {
        regPais.addEventListener('change', paisChangeHandler);
    }

    // Verificación en tiempo real de email y nombre de usuario
    const regEmail = document.getElementById('reg-email');
    if (regEmail) {
        regEmail.addEventListener('input', function() {
            const val = this.value.trim().toLowerCase();
            // Advertencia inmediata de dominio desechable
            let msgDesechable = this.parentElement.querySelector('.msg-desechable');
            if (esEmailValido(val) && esDominioDesechable(val)) {
                if (!msgDesechable) {
                    msgDesechable = document.createElement('div');
                    msgDesechable.className = 'validation-message unavailable msg-desechable';
                    this.parentElement.appendChild(msgDesechable);
                }
                msgDesechable.textContent = '❌ Correos temporales no permitidos';
                msgDesechable.style.display = 'block';
                this.classList.add('input-unavailable');
            } else {
                if (msgDesechable) msgDesechable.remove();
                this.classList.remove('input-unavailable');
            }
            verificarEmailDebounced(this.value, this);
        });
    }

    const regNombreArtista = document.getElementById('reg-nombre-artista');
    if (regNombreArtista) {
        regNombreArtista.addEventListener('input', function() {
            verificarNombreDebounced(this.value, this);
        });
    }

    // Medidor de fortaleza de contraseña en tiempo real
    const regPass = document.getElementById('reg-pass');
    if (regPass) {
        regPass.addEventListener('input', function() {
            actualizarMedidorPassword(this.value);
        });
    }

    // Limpiar borde rojo al escribir/cambiar en cualquier input o select
    document.querySelectorAll('#login-form input, #registro-form input, #registro-form select').forEach(el => {
        const evento = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evento, function() {
            this.classList.remove('input-error');
        });
    });

    // Mostrar/ocultar contraseña
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetId = this.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            this.classList.toggle('visible', isPassword);
            this.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
        });
    });

    // Formulario de login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const emailInput = document.getElementById('login-email');
            const passInput = document.getElementById('login-pass');
            const email = emailInput.value;
            const password = passInput.value;

            // Validación de formato antes de enviar
            emailInput.classList.remove('input-error');
            passInput.classList.remove('input-error');
            if (!esEmailValido(email)) {
                marcarInputError(emailInput);
                showWarning('Ingresa un correo electrónico válido.');
                return;
            }
            if (!password) {
                marcarInputError(passInput);
                showWarning('Ingresa tu contraseña.');
                return;
            }

            const submitBtn = loginForm.querySelector('button[type="submit"]');
            setButtonLoading(submitBtn, true);
            try {
                const result = await login(email, password);
                if (result.success) {
                    setButtonLoading(submitBtn, false);
                    showSuccess('¡Inicio de sesión exitoso!');
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 1000);
                } else {
                    setButtonLoading(submitBtn, false);
                    mostrarErrores(result);
                }
            } catch (error) {
                setButtonLoading(submitBtn, false);
                showError('Error de conexión. Inténtalo más tarde.');
            }
        });
    }

    // Formulario de registro
    const registroForm = document.getElementById('registro-form');
    if (registroForm) {
        registroForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Re-validar todos los pasos al enviar (sin showStep para no limpiar errores)
            if (!validateStep(1)) { currentStep = 1; mostrarPasoActual(); return; }
            if (!validateStep(2)) { currentStep = 2; mostrarPasoActual(); return; }
            if (!validateStep(3)) { currentStep = 3; mostrarPasoActual(); return; }
            if (!validateStep(4)) { currentStep = 4; mostrarPasoActual(); return; }
            if (!validateStep(5)) { currentStep = 5; mostrarPasoActual(); return; }

            // Validaciones adicionales que validateStep no cubre
            const emailInput = document.getElementById('reg-email');
            if (emailInput && disponibilidad.email !== true) {
                showWarning('El correo electrónico ya está registrado o no se ha verificado aún. Usa otro.');
                currentStep = 4; mostrarPasoActual(); return;
            }
            const nombreInput = document.getElementById('reg-nombre-artista');
            if (nombreInput && disponibilidad.nombre !== true) {
                showWarning('El nombre de artista ya está en uso o no se ha verificado aún. Elige otro.');
                currentStep = 5; mostrarPasoActual(); return;
            }
            
            const nombre_artista = document.getElementById('reg-nombre-artista').value;
            const nombres = document.getElementById('reg-nombres').value;
            const apellidos = document.getElementById('reg-apellidos').value;
            const nombre_real = `${nombres} ${apellidos}`.trim();
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-pass').value;
            const telefono = document.getElementById('reg-telefono').value;
            const genero = document.getElementById('reg-genero').value;
            const dia = document.getElementById('reg-dia').value;
            const mes = document.getElementById('reg-mes').value;
            const ano = document.getElementById('reg-ano').value;
            
            if (!dia || !mes || !ano) {
                showWarning("Todos los campos de fecha son obligatorios.");
                return;
            }
            const fechaNac = new Date(ano, mes - 1, dia);
            if (fechaNac.getFullYear() != ano || fechaNac.getMonth() != mes - 1 || fechaNac.getDate() != dia) {
                showWarning("La fecha seleccionada no es válida.");
                return;
            }
            const hoy = new Date();
            let edad = hoy.getFullYear() - fechaNac.getFullYear();
            const mesDiff = hoy.getMonth() - fechaNac.getMonth();
            if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < fechaNac.getDate())) edad--;
            if (edad < 18) {
                showWarning("Debes tener al menos 18 años para registrarte.");
                return;
            }
            const fecha_nacimiento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

            const pais = document.getElementById('reg-pais').value;
            const ciudad = document.getElementById('reg-ciudad').value;

            const submitBtn = document.getElementById('btn-registrarse-final');
            setButtonLoading(submitBtn, true);
            try {
                const result = await register(
                    nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero
                );

                if (result.success) {
                    showSuccess("¡Registro exitoso! Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada y SPAM.");
                    registroForm.reset();
                    disponibilidad.email = null;
                    disponibilidad.nombre = null;
                    actualizarMedidorPassword('');
                    showStep(1);
                    showLoginSection();
                    setButtonLoading(submitBtn, false);
                } else {
                    setButtonLoading(submitBtn, false);
                    mostrarErrores(result);
                }
            } catch (error) {
                setButtonLoading(submitBtn, false);
                showError('Error de conexión. Inténtalo más tarde.');
            }
        });
    }

    // Inicializar en paso 1
    showStep(1);

    // ============================================
    // MODO OSCURO — delegado a theme.js (compatible con index.html y auth.html)
    setupDarkModeToggle();

    // ============================================
    // SLIDESHOW DE FONDO — cambia cada 15 segundos
    // ============================================
    const slides = document.querySelectorAll('.auth-bg-slide');
    const label = document.querySelector('.auth-slide-label');
    const labelName = label?.querySelector('.auth-slide-name');
    const labelMuni = label?.querySelector('.auth-slide-municipio');
    const labelBandera = label?.querySelector('.auth-slide-bandera');
    const counterNav = document.querySelector('.auth-slide-counter-nav');
    const labelCounter = counterNav?.querySelector('.auth-slide-counter');
    const totalSlides = slides.length;

    if (slides.length > 1) {
        let currentSlide = 0;
        let slideInterval = null;
        let labelTimeout = null;

        function updateLabel(index) {
            if (!label) return;
            const name = slides[index].dataset.name || '';
            const muni = slides[index].dataset.municipio || '';
            const bandera = slides[index].dataset.bandera || '';
            if (labelName) labelName.textContent = name;
            if (labelMuni) labelMuni.textContent = muni;
            if (labelCounter) labelCounter.textContent = (index + 1) + '/' + totalSlides;
            if (labelBandera) {
                labelBandera.src = bandera ? 'iconos/banderas/' + bandera : '';
                labelBandera.alt = muni || name;
            }
            label.classList.add('visible');
            clearTimeout(labelTimeout);
            labelTimeout = setTimeout(() => label.classList.remove('visible'), 5500);
        }

        function showSlide(index) {
            slides.forEach(s => s.classList.remove('active'));
            slides[index].classList.add('active');
            updateLabel(index);
        }

        function resetInterval() {
            clearInterval(slideInterval);
            slideInterval = setInterval(() => {
                currentSlide = (currentSlide + 1) % slides.length;
                showSlide(currentSlide);
            }, 8000);
        }

        function goTo(index) {
            currentSlide = index;
            showSlide(currentSlide);
            resetInterval();
        }

        // Mostrar la primera
        showSlide(0);
        resetInterval();

        // Navegación manual
        const prevBtn = document.querySelector('.auth-slide-prev');
        const nextBtn = document.querySelector('.auth-slide-next');
        if (prevBtn) prevBtn.addEventListener('click', () => {
            const idx = (currentSlide - 1 + slides.length) % slides.length;
            goTo(idx);
        });
        if (nextBtn) nextBtn.addEventListener('click', () => {
            const idx = (currentSlide + 1) % slides.length;
            goTo(idx);
        });
    }
});
