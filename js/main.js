// js/main.js
import { API_BASE_URL } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
const mainContent = document.querySelector('main');
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('obra-form');
const btnLogout = document.getElementById('btn-logout');
const btnPerfil = document.getElementById('btn-perfil');

// ============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================

// Esta función se ejecutará al cargar la página
async function init() {
    // 1. Verificar sesión inicial
    if (token && artistaActual) {
        await mostrarPanelArtista();
    } else {
        // 2. Cargar galería pública
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            // Función para mostrar detalles (debes implementarla)
            console.log("Ver detalles de obra con ID:", id);
            // Llamar a una función para abrir el modal de detalles...
        });
    }

    // 3. Configurar eventos globales de UI (Login, Logout, etc.)
    setupEvents();
}

// 4. Eventos (Login, Logout, Cambio de secciones)
function setupEvents() {
    // Click en Perfil
    btnPerfil.addEventListener('click', () => {
        if (token) {
            mostrarPanelArtista();
        } else {
            document.getElementById('modal-login').classList.remove('hidden');
        }
    });

    // Logout
    btnLogout.addEventListener('click', () => {
        logout();
        ocultarPanelArtista();
        location.reload(); // Recargar para volver al estado inicial limpio
    });

    // Formularios de Login/Registro (usando los módulos)
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        const result = await login(email, password);
        if (result.success) {
            document.getElementById('modal-login').classList.add('hidden');
            await mostrarPanelArtista();
        } else {
            alert("Error: " + result.error);
        }
    });

    document.getElementById('registro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre_artista = document.getElementById('reg-nombre-artista').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-pass').value;
        const result = await register(nombre_artista, email, password);
        if (result.success) {
            alert("Registro exitoso. Inicia sesión.");
            document.getElementById('modal-registro').classList.add('hidden');
            document.getElementById('modal-login').classList.remove('hidden');
        } else {
            alert("Error: " + result.error);
        }
    });

    // Formulario de Obra (Guardar/Actualizar)
    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        const idEdicion = document.getElementById('input-id-edicion').value;
        const idPersonalizado = document.getElementById('input-id-personalizado').value; // <--- Agregar esto
        const imagenInput = document.getElementById('input-imagen');

        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado); // <--- Agregar esto (el backend espera 'id_obra')
        if (imagenInput.files[0]) {
            formData.append('imagen_0', imagenInput.files[0]);
        }

        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            obraForm.reset();
            document.getElementById('input-id-edicion').value = '';
            await refrescarTabla();
        } else {
            alert("Error: " + result.error);
        }
    });

    // --- NAVEGACIÓN ENTRE MODALES (Login ↔ Registro) ---
    // Ir de Login a Registro
    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('hidden');
    });

    // Ir de Registro a Login
    document.getElementById('btn-ir-login').addEventListener('click', () => {
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('hidden');
    });

    document.querySelectorAll('.cerrar-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        });
    });


}

// ============================================
// FUNCIONES DE NAVEGACIÓN Y RENDERIZADO
// ============================================

async function mostrarPanelArtista() {
    // Ocultar la galería y mostrar el panel
    document.getElementById('galeria-publica').classList.add('hidden');
    panelArtista.classList.remove('hidden');
    btnLogout.classList.remove('hidden');
    btnPerfil.textContent = '👤 Artista';
    await refrescarTabla();
}

function ocultarPanelArtista() {
    document.getElementById('galeria-publica').classList.remove('hidden');
    panelArtista.classList.add('hidden');
    btnLogout.classList.add('hidden');
    btnPerfil.textContent = '👤';
}

async function refrescarTabla() {
    const obras = await cargarMisObras(token);
    renderizarTabla(obras, tablaBody, (id) => {
        // --- Lógica para editar (Ahora con fetch real) ---
        try {
            const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const obra = await res.json();
            
            // Llenar el formulario con los datos de la obra
            document.getElementById('input-id-edicion').value = obra.id;
            document.getElementById('input-titulo').value = obra.titulo;
            document.getElementById('input-artista').value = obra.artista;
            document.getElementById('input-precio').value = obra.precio;
            document.getElementById('input-id-personalizado').value = obra.id_personalizado; // <--- Cargar el ID personalizado
            
            // El botón cancelar (opcional) se puede mostrar/ocultar aquí
            document.getElementById('btn-cancelar').classList.remove('hidden');
            
            // Hacer scroll al formulario
            document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error("Error al cargar datos de la obra:", error);
            alert("Error al cargar la obra para editar");
        }
    }, async (id) => {
        // (Lógica de eliminar, ya la tienes)
        const exito = await eliminarObra(token, id);
        if (exito) {
            await refrescarTabla();
        } else {
            alert("Error al eliminar la obra.");
        }
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================
init();