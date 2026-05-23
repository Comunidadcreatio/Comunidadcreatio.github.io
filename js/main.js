// js/main.js
import { API_BASE_URL } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra, editarObra } from './panel.js';

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
const mainContent = document.querySelector('main');
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('artista-artwork-form');
const btnLogout = document.getElementById('btn-logout');
const btnPerfil = document.getElementById('btn-perfil');
const btnSave = document.getElementById('btn-artista-save');
const btnUpdate = document.getElementById('btn-artista-update');
const btnClear = document.getElementById('btn-artista-clear');

// ============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================

async function init() {
    if (token && artistaActual) {
        await mostrarPanelArtista();
    } else {
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    }
    setupEvents();
}

// 4. Eventos (Login, Logout, Cambio de secciones)
function setupEvents() {
    btnPerfil.addEventListener('click', () => {
        if (token) {
            mostrarPanelArtista();
        } else {
            document.getElementById('modal-login').classList.remove('hidden');
        }
    });

    btnLogout.addEventListener('click', () => {
        logout();
        ocultarPanelArtista();
        location.reload();
    });

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

    // --- EVENTOS DEL FORMULARIO DE OBRA ---
    
    // Guardar Obra
    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(obraForm);
        const idEdicion = document.getElementById('input-id-edicion').value;
        
        // Agregar imágenes si las hay
        for (let i = 0; i < 5; i++) {
            const inputFile = document.getElementById(`artista-imagen-${i}`);
            if (inputFile && inputFile.files[0]) {
                formData.append(`imagen_${i}`, inputFile.files[0]);
            }
        }

        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            resetFormularioArtista();
            await refrescarTabla();
        } else {
            alert("Error: " + result.error);
        }
    });

    // Botón Refrescar (Actualizar)
    btnUpdate.addEventListener('click', async (e) => {
        e.preventDefault();
        const idEdicion = document.getElementById('input-id-edicion').value;
        if (!idEdicion) return;

        const formData = new FormData(obraForm);
        for (let i = 0; i < 5; i++) {
            const inputFile = document.getElementById(`artista-imagen-${i}`);
            if (inputFile && inputFile.files[0]) {
                formData.append(`imagen_${i}`, inputFile.files[0]);
            }
        }

        const result = await guardarObra(token, formData, idEdicion);
        if (result.success) {
            alert("Obra actualizada correctamente.");
            resetFormularioArtista();
            await refrescarTabla();
        } else {
            alert("Error al actualizar: " + result.error);
        }
    });

    // Botón Limpiar
    btnClear.addEventListener('click', (e) => {
        e.preventDefault();
        resetFormularioArtista();
    });
}

// ============================================
// FUNCIONES DE NAVEGACIÓN Y RENDERIZADO
// ============================================

async function mostrarPanelArtista() {
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
        // Lógica para cargar datos al formulario cuando se edita una obra
        editarObra(token, id, (obra) => {
            // Llenar el formulario con los datos de la obra
            llenarFormulario(obra);
            // Cambiar botones
            btnSave.style.display = 'none';
            btnUpdate.style.display = 'block';
            document.getElementById('input-id-edicion').value = obra.id;
        });
    }, async (id) => {
        const exito = await eliminarObra(token, id);
        if (exito) {
            await refrescarTabla();
        } else {
            alert("Error al eliminar la obra.");
        }
    });
}

function llenarFormulario(obra) {
    if (!obra) return;

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.value = value || '';
        } else {
            console.warn(`Elemento con ID '${id}' no encontrado.`);
        }
    }

    setValue('artista-titulo', obra.titulo);
    setValue('artista-artista', obra.artista);
    setValue('artista-ano', obra.ano);
    setValue('artista-tec-desc', obra.descripcion_tecnica);
    setValue('artista-art-desc', obra.descripcion_artistica);
    setValue('artista-status', obra.status);
    setValue('artista-estado-obra', obra.estado_obra);
    setValue('artista-ancho', obra.ancho);
    setValue('artista-alto', obra.alto);
    setValue('artista-peso', obra.peso);
    setValue('artista-marcos', obra.marcos);
    setValue('artista-precio', obra.precio);
    setValue('artista-certificado', obra.certificado);
    setValue('artista-id', obra.id_personalizado);
    setValue('artista-procedencia', obra.procedencia);
    setValue('artista-firma', obra.firma);
    setValue('artista-soporte', obra.soporte);
    setValue('artista-conservacion', obra.conservacion);
    setValue('artista-etiquetas', obra.etiquetas);
    setValue('artista-localizacion', obra.localizacion);

    // Cargar imágenes
    const imagenes = obra.todas_imagenes || [];
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`artista-slot-${i}`);
        const imgPreview = slot ? slot.querySelector('.preview-img') : null;
        if (imagenes[i] && imgPreview) {
            imgPreview.src = imagenes[i];
            imgPreview.classList.remove('hidden');
            slot.classList.add('has-image');
        } else if (imgPreview) {
            imgPreview.src = '';
            imgPreview.classList.add('hidden');
            if (slot) slot.classList.remove('has-image');
        }
    }
}

function resetFormularioArtista() {
    const form = document.getElementById('artista-artwork-form');
    if (form) form.reset();
    document.getElementById('input-id-edicion').value = '';
    btnSave.style.display = 'block';
    btnUpdate.style.display = 'none';
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`artista-slot-${i}`);
        const img = slot.querySelector('.preview-img');
        if (img) {
            img.src = '';
            img.classList.add('hidden');
        }
        slot.classList.remove('has-image');
    }
    document.getElementById('artista-file-names-display').textContent = '';
}

// ============================================
// INICIALIZACIÓN
// ============================================
init();