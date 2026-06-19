// js/auth-logic.js - Lógica de autenticación para la página separada

import { login, register } from './auth.js';
import { showSuccess, showError, showWarning, showInfo } from './notificaciones.js';

// ============================================
// VARIABLES GLOBALES
// ============================================
let currentStep = 1;
const totalSteps = 5;

// Ciudades para el registro
const ciudadesPorPais = {
    'Venezuela': {
        'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
    }
};

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function poblarCiudades(paisSeleccionado) {
    const ciudadSelect = document.getElementById('reg-ciudad');
    if (!ciudadSelect) return;
    ciudadSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Selecciona tu ciudad';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    ciudadSelect.appendChild(defaultOption);
    if (paisSeleccionado && ciudadesPorPais[paisSeleccionado]) {
        const data = ciudadesPorPais[paisSeleccionado];
        Object.keys(data).forEach(departamento => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = departamento;
            data[departamento].forEach(ciudad => {
                const option = document.createElement('option');
                option.value = ciudad;
                option.textContent = ciudad;
                optgroup.appendChild(option);
            });
            ciudadSelect.appendChild(optgroup);
        });
    }
}

function mostrarErrores(result) {
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const mensaje = result.errors.join('\n• ');
        showError('Se encontraron los siguientes errores:\n\n• ' + mensaje);
    } else if (result.error) {
        showError('Error: ' + result.error);
    } else {
        showError('Ocurrió un error inesperado. Inténtalo de nuevo.');
    }
}

// ============================================
// VERIFICACIÓN EN TIEMPO REAL
// ============================================
function debounce(func, wait) {
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

async function verificarDisponibilidad(tipo, valor, inputElement) {
    if (!valor.trim()) {
        inputElement.classList.remove('input-available', 'input-unavailable');
        const msg = inputElement.parentElement.querySelector('.validation-message');
        if (msg) msg.remove();
        return;
    }

    try {
        const endpoint = tipo === 'email' 
            ? `/api/artistas/verificar-email/${encodeURIComponent(valor)}`
            : `/api/artistas/verificar-nombre/${encodeURIComponent(valor)}`;
        
        const res = await fetch(`https://backend-fundacion-atpe.onrender.com${endpoint}`);
        const data = await res.json();
        
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
        } else {
            inputElement.classList.remove('input-available');
            inputElement.classList.add('input-unavailable');
            msg.className = 'validation-message unavailable';
            msg.style.display = 'block';
            const mensajeError = tipo === 'email' 
                ? '❌ Este correo ya está registrado' 
                : '❌ Este nombre de usuario ya está en uso';
            msg.textContent = mensajeError;
        }
    } catch (error) {
        console.error('Error al verificar disponibilidad:', error);
    }
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
    const diaSelect = document.getElementById('reg-dia');
    if (diaSelect) {
        diaSelect.innerHTML = '<option value="" disabled selected>Día</option>';
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            diaSelect.appendChild(option);
        }
    }
    const mesSelect = document.getElementById('reg-mes');
    if (mesSelect) {
        mesSelect.innerHTML = '<option value="" disabled selected>Mes</option>';
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        meses.forEach((nombre, i) => {
            const option = document.createElement('option');
            option.value = i + 1;
            option.textContent = nombre;
            mesSelect.appendChild(option);
        });
    }
    const anoSelect = document.getElementById('reg-ano');
    if (anoSelect) {
        anoSelect.innerHTML = '<option value="" disabled selected>Año</option>';
        const maxYear = new Date().getFullYear() - 18;
        for (let i = maxYear; i >= 1900; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            anoSelect.appendChild(option);
        }
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

    // Limpiar errores al cambiar de paso
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    document.querySelectorAll('.error-message-field.visible').forEach(el => el.classList.remove('visible'));
    document.querySelectorAll('.input-available, .input-unavailable').forEach(el => {
        el.classList.remove('input-available', 'input-unavailable');
    });
    document.querySelectorAll('.validation-message').forEach(el => el.remove());

    // Cargar selectores de fecha al llegar al paso 2
    if (step === 2) {
        cargarSelectoresFecha();
    }

    // Poblar ciudades al llegar al paso 3
    if (step === 3) {
        const paisSelect = document.getElementById('reg-pais');
        const ciudadSelect = document.getElementById('reg-ciudad');

        if (paisSelect) {
            paisSelect.removeEventListener('change', paisChangeHandler);
            paisSelect.addEventListener('change', paisChangeHandler);
            if (paisSelect.value) {
                poblarCiudades(paisSelect.value);
            } else {
                if (ciudadSelect) {
                    ciudadSelect.innerHTML = '';
                    const defaultOption = document.createElement('option');
                    defaultOption.value = '';
                    defaultOption.textContent = 'Selecciona tu ciudad';
                    defaultOption.disabled = true;
                    defaultOption.selected = true;
                    ciudadSelect.appendChild(defaultOption);
                }
            }
        }
    }
}

function paisChangeHandler() {
    const paisSelect = document.getElementById('reg-pais');
    if (paisSelect) {
        poblarCiudades(paisSelect.value);
    }
}

function validateStep(step) {
    const stepContainer = document.querySelector(`.step[data-step="${step}"]`);
    if (!stepContainer) return true;
    
    // Limpiar errores previos del paso
    stepContainer.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    stepContainer.querySelectorAll('.error-message-field.visible').forEach(el => el.classList.remove('visible'));
    
    const inputs = stepContainer.querySelectorAll('input, select');
    let isValid = true;
    
    for (let input of inputs) {
        if (input.hasAttribute('required') && !input.value.trim()) {
            input.classList.add('input-error');
            
            let errorMsg = input.parentElement.querySelector('.error-message-field');
            if (!errorMsg) {
                errorMsg = document.createElement('div');
                errorMsg.className = 'error-message-field';
                errorMsg.textContent = 'Este campo no puede quedar vacío';
                input.parentElement.appendChild(errorMsg);
            }
            errorMsg.classList.add('visible');
            
            isValid = false;
        }
    }
    
    return isValid;
}

// ============================================
// MANEJO DE VISTAS (LOGIN/REGISTRO)
// ============================================
function showLoginSection() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('registro-section').classList.add('hidden');
}

function showRegistroSection() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('registro-section').classList.remove('hidden');
    showStep(1);
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Verificar si ya está logueado
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = 'index.html';
        return;
    }

    // Botón para ir a registro
    const btnIrRegistro = document.getElementById('btn-ir-registro');
    if (btnIrRegistro) {
        btnIrRegistro.addEventListener('click', showRegistroSection);
    }

    // Botón para volver al login
    const btnVolverLogin = document.getElementById('btn-volver-login');
    if (btnVolverLogin) {
        btnVolverLogin.addEventListener('click', showLoginSection);
    }

    // Navegación de pasos del registro
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
                const newStep = step - 1;
                showStep(newStep);
            } else {
                if (!validateStep(step)) return;
                const newStep = step + 1;
                if (newStep <= totalSteps) {
                    showStep(newStep);
                }
            }
        }
    });

    // Verificación en tiempo real de email y nombre de usuario
    const regEmail = document.getElementById('reg-email');
    if (regEmail) {
        regEmail.addEventListener('input', function() {
            verificarEmailDebounced(this.value, this);
        });
    }

    const regNombreArtista = document.getElementById('reg-nombre-artista');
    if (regNombreArtista) {
        regNombreArtista.addEventListener('input', function() {
            verificarNombreDebounced(this.value, this);
        });
    }

    // Formulario de login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-pass').value;
            
            const result = await login(email, password);
            if (result.success) {
                showSuccess('¡Inicio de sesión exitoso!');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                mostrarErrores(result);
            }
        });
    }

    // Formulario de registro
    const registroForm = document.getElementById('registro-form');
    if (registroForm) {
        registroForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            if (!validateStep(5)) return;
            
            const nombre_artista = document.getElementById('reg-nombre-artista').value;
            const nombres = document.getElementById('reg-nombres').value;
            const apellidos = document.getElementById('reg-apellidos').value;
            const nombre_real = `${nombres} ${apellidos}`.trim();
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-pass').value;
            const telefono = document.getElementById('reg-telefono').value;
            const pais = document.getElementById('reg-pais').value;
            const ciudad = document.getElementById('reg-ciudad').value;
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
            
            const result = await register(
                nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero
            );
            
            if (result.success) {
                showSuccess("¡Registro exitoso! Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada y SPAM.");
                registroForm.reset();
                showStep(1);
                showLoginSection();
            } else {
                mostrarErrores(result);
            }
        });
    }

    // Inicializar en paso 1
    showStep(1);
});
