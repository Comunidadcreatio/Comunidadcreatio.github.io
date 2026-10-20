// @ts-check
// js/cuenta.js
// Gestión de la sección "Mi Cuenta": cambiar email, cambiar contraseña,
// eliminar cuenta y accordion de seguridad.

import { ARTISTA_KEY, apiRequest } from './config.js?v=7da631dcf6';
import { token, artistaActual, logout } from './auth.js?v=8dbd042376';
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

    /** Capital (lo que se guarda) -> municipio (lo que se muestra). */
    const municipioDeCapital = (capital) => {
        const mapa = /** @type {Record<string, string> | undefined} */ (/** @type {any} */ (window).MUNICIPIO_POR_PUEBLO);
        return (mapa && capital && mapa[capital]) || capital || '';
    };

    const cerrarMunicipios = () => {
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
                if (muniTrigger) muniTrigger.textContent = municipio;
                cerrarMunicipios();
            });
            muniDropdown.appendChild(item);
        });

        if (capitalActual) {
            muniHidden.value = capitalActual;
            if (muniTrigger) muniTrigger.textContent = municipioDeCapital(capitalActual);
            muniDropdown.querySelectorAll('.custom-select-option').forEach((el) => {
                el.classList.toggle('selected', /** @type {HTMLElement} */ (el).dataset.capital === capitalActual);
            });
        }
    };

    if (muniTrigger && muniDropdown) {
        muniTrigger.addEventListener('click', () => {
            const abierto = muniDropdown.classList.toggle('open');
            muniTrigger.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
        document.addEventListener('click', (ev) => {
            const objetivo = /** @type {Node} */ (ev.target);
            if (!muniTrigger.contains(objetivo) && !muniDropdown.contains(objetivo)) cerrarMunicipios();
        });
    }

    // ============================================
    // REDES: se añaden de una en una con el botón +
    // ============================================
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
    const menuRedes = document.getElementById('perfil-red-menu');
    const btnAgregarRed = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-agregar-red'));

    /** Añade una fila para esa red (si no estaba ya). */
    const agregarRed = (clave, valor) => {
        if (!listaRedes) return;
        const def = REDES_DISPONIBLES.find((r) => r.clave === clave);
        if (!def) return;
        if (listaRedes.querySelector('[data-red="' + clave + '"]')) return;
        const fila = document.createElement('div');
        fila.className = 'perfil-campo-red';
        fila.dataset.red = clave;
        fila.innerHTML = '<span>' + def.etiqueta + '</span>' +
            '<div class="perfil-campo-red-fila">' +
            '<input type="text" maxlength="300" placeholder="' + def.placeholder + '" aria-label="' + def.etiqueta + '">' +
            '<button type="button" class="perfil-red-quitar" aria-label="Quitar ' + def.etiqueta + '">×</button>' +
            '</div>';
        const input = fila.querySelector('input');
        if (input) input.value = valor == null ? '' : String(valor);
        const quitar = fila.querySelector('.perfil-red-quitar');
        if (quitar) quitar.addEventListener('click', () => fila.remove());
        listaRedes.appendChild(fila);
    };

    /** Pinta las que ya tenía guardadas. */
    const pintarRedesGuardadas = (redes) => {
        if (!listaRedes) return;
        listaRedes.textContent = '';
        REDES_DISPONIBLES.forEach(({ clave }) => {
            if (redes && redes[clave]) agregarRed(clave, redes[clave]);
        });
    };

    /** Lo que hay escrito ahora mismo. */
    const leerRedes = () => {
        /** @type {Record<string, string>} */
        const salida = {};
        if (!listaRedes) return salida;
        REDES_DISPONIBLES.forEach(({ clave }) => {
            const input = /** @type {HTMLInputElement | null} */ (listaRedes.querySelector('[data-red="' + clave + '"] input'));
            if (input && input.value.trim()) salida[clave] = input.value.trim();
        });
        return salida;
    };

    const cerrarMenuRedes = () => {
        if (menuRedes) menuRedes.hidden = true;
        if (btnAgregarRed) btnAgregarRed.setAttribute('aria-expanded', 'false');
    };

    /** Menú con las redes que aún no se han añadido. */
    const pintarMenuRedes = () => {
        if (!menuRedes || !listaRedes) return;
        menuRedes.textContent = '';
        REDES_DISPONIBLES.forEach(({ clave, etiqueta }) => {
            if (listaRedes.querySelector('[data-red="' + clave + '"]')) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'perfil-red-opcion';
            b.textContent = etiqueta;
            b.addEventListener('click', () => {
                agregarRed(clave, '');
                cerrarMenuRedes();
            });
            menuRedes.appendChild(b);
        });
        if (!menuRedes.childElementCount) {
            const p = document.createElement('span');
            p.className = 'cuenta-item-nota';
            p.textContent = 'Ya has añadido todas.';
            menuRedes.appendChild(p);
        }
    };

    if (btnAgregarRed && menuRedes) {
        btnAgregarRed.addEventListener('click', () => {
            const abrir = menuRedes.hidden;
            pintarMenuRedes();
            menuRedes.hidden = !abrir;
            btnAgregarRed.setAttribute('aria-expanded', abrir ? 'true' : 'false');
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
            const redes = parsear(u.redes);
            pintarRedesGuardadas(redes);
            const cobro = parsear(u.cobro);
            poner('perfil-cobro-pago-movil', cobro['pago-movil']);
            poner('perfil-cobro-zelle', cobro.zelle);
            poner('perfil-cobro-binance', cobro.binance);
            poner('perfil-cobro-otro', cobro.otro);
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
            const cobro = {
                'pago-movil': valorDe('perfil-cobro-pago-movil'),
                zelle: valorDe('perfil-cobro-zelle'),
                binance: valorDe('perfil-cobro-binance'),
                otro: valorDe('perfil-cobro-otro')
            };
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
                    body: JSON.stringify({ ciudad, redes, cobro, bio, foto_perfil: quitarFoto ? '' : undefined })
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
