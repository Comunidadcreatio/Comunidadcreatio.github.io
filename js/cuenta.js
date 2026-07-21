// js/cuenta.js
// Gestión de la sección "Mi Cuenta": cambiar email, cambiar contraseña,
// eliminar cuenta y accordion de seguridad.

import { TOKEN_KEY, ARTISTA_KEY, apiRequest } from './config.js';
import { token, artistaActual, logout } from './auth.js';
import { showSuccess, showError, showWarning, showInfo, setButtonLoading } from './notificaciones.js';

/**
 * Oculta (y resetea) un formulario de la sección Mi Cuenta.
 */
function ocultarFormularioCuenta(id) {
    const form = document.getElementById(id);
    if (!form) return;
    form.reset && form.reset();
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
            accordionSeguridad.setAttribute('aria-expanded', !isExpanded);
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
    // BOTONES "CANCELAR"
    // ============================================
    document.querySelectorAll('.btn-cuenta-cancelar[data-cancelar]').forEach(btn => {
        btn.addEventListener('click', () => ocultarFormularioCuenta(btn.dataset.cancelar));
    });

    // ============================================
    // CAMBIAR CORREO ELECTRÓNICO
    // ============================================
    const btnCambiarEmail = document.getElementById('btn-cambiar-email');
    const formCambiarEmail = document.getElementById('form-cambiar-email');
    const formConfirmarEmail = document.getElementById('form-confirmar-email');

    if (btnCambiarEmail && formCambiarEmail) {
        btnCambiarEmail.addEventListener('click', () => {
            ocultarFormularioCuenta('form-confirmar-email');
            formCambiarEmail.classList.toggle('hidden');
        });

        formCambiarEmail.addEventListener('submit', (e) => {
            e.preventDefault();
            const nuevoEmail = document.getElementById('nuevo-email').value.trim();
            const errorEl = document.getElementById('error-nuevo-email');
            errorEl.textContent = '';
            const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoEmail);
            if (!emailValido) {
                errorEl.textContent = 'Ingresa un correo electrónico válido.';
                return;
            }
            const emailActual = (document.getElementById('cuenta-email-actual').value || '').trim().toLowerCase();
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
            const password = document.getElementById('email-password').value;
            const errorEl = document.getElementById('error-email-password');
            errorEl.textContent = '';
            if (!password) {
                errorEl.textContent = 'Ingresa tu contraseña para confirmar.';
                return;
            }
            const nuevoEmail = document.getElementById('nuevo-email').value.trim();
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
                    const emailInput = document.getElementById('cuenta-email-actual');
                    if (emailInput) emailInput.value = nuevoEmail;
                    if (artistaActual) {
                        artistaActual.email = nuevoEmail;
                        try {
                            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
                        } catch (e) {
                            console.error('No se pudo actualizar el correo en localStorage:', e);
                        }
                    }
                    ocultarFormularioCuenta('form-confirmar-email');
                    ocultarFormularioCuenta('form-cambiar-email');
                } else if (res && (res.errors || res.error)) {
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
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }

    // ============================================
    // CAMBIAR CONTRASEÑA
    // ============================================
    const btnCambiarPassword = document.getElementById('btn-cambiar-password');
    const formCambiarPassword = document.getElementById('form-cambiar-password');

    if (btnCambiarPassword && formCambiarPassword) {
        btnCambiarPassword.addEventListener('click', () => {
            formCambiarPassword.classList.toggle('hidden');
        });

        const passNueva = document.getElementById('pass-nueva');
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
                let score = 0;
                if (val.length >= 8) score++;
                if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
                if (/\d/.test(val) && /[^A-Za-z0-9]/.test(val)) score++;
                const nivel = Math.max(1, score);
                strengthWidget.setAttribute('data-level', String(nivel));
                if (strengthText) {
                    strengthText.textContent = nivel === 1 ? 'Débil' : nivel === 2 ? 'Media' : 'Fuerte';
                }
            });
        }

        formCambiarPassword.addEventListener('submit', async (e) => {
            e.preventDefault();
            const actual = document.getElementById('pass-actual').value;
            const nueva = document.getElementById('pass-nueva').value;
            const confirmar = document.getElementById('pass-confirmar').value;
            const errorEl = document.getElementById('error-pass-confirmar');
            errorEl.textContent = '';
            if (!actual || !nueva || !confirmar) {
                errorEl.textContent = 'Completa todos los campos.';
                return;
            }
            if (nueva.length < 8) {
                errorEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
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
                } else if (res && (res.errors || res.error)) {
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
            const password = document.getElementById('eliminar-password').value;
            const errorEl = document.getElementById('error-eliminar-cuenta');
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
                } else if (res && (res.errors || res.error)) {
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
            } catch (error) {
                setButtonLoading(btnSubmit, false);
                errorEl.textContent = '❌ Error de conexión. Intenta más tarde.';
            }
        });
    }
}
