import { API_BASE_URL } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';

// ELEMENTOS DOM
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('obra-form');
const btnLogout = document.getElementById('btn-logout');
const btnPerfil = document.getElementById('btn-perfil');

async function init() {
    if (token && artistaActual) {
        await mostrarPanelArtista();
    } else {
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Detalles de obra:", id);
        });
    }
    setupEvents();
}

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

    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        const idEdicion = document.getElementById('input-id-edicion').value;
        const idPersonalizado = document.getElementById('input-id-personalizado').value;
        const imagenInput = document.getElementById('input-imagen');

        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado);
        if (imagenInput.files[0]) {
            formData.append('imagen_0', imagenInput.files[0]);
        }

        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            obraForm.reset();
            document.getElementById('input-id-edicion').value = '';
            document.getElementById('btn-cancelar').classList.add('hidden');
            await refrescarTabla();
        } else {
            alert("Error: " + result.error);
        }
    });

    document.getElementById('btn-cancelar').addEventListener('click', () => {
        obraForm.reset();
        document.getElementById('input-id-edicion').value = '';
        document.getElementById('btn-cancelar').classList.add('hidden');
    });

    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('hidden');
    });

    document.getElementById('btn-ir-login').addEventListener('click', () => {
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('hidden');
    });
}

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
    
    // ⚠️ AQUÍ SE PASAN LOS 4 ARGUMENTOS
    renderizarTabla(obras, tablaBody, 
        async (id) => { 
            // EDITAR
            try {
                const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const obra = await res.json();
                
                document.getElementById('input-id-edicion').value = obra.id;
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = obra.id_personalizado;
                
                document.getElementById('btn-cancelar').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error("Error al cargar datos de la obra:", error);
                alert("Error al cargar la obra para editar");
            }
        },
        async (id) => {
            // ELIMINAR
            const exito = await eliminarObra(token, id);
            if (exito) {
                await refrescarTabla();
            } else {
                alert("Error al eliminar la obra.");
            }
        },
        // 🟢 AQUÍ ESTÁ EL CUARTO ARGUMENTO (DUPLICAR)
        async (id) => {
            try {
                const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const obra = await res.json();
                
                document.getElementById('input-id-edicion').value = '';
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = '';
                document.getElementById('input-imagen').value = '';
                
                document.getElementById('btn-cancelar').classList.add('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();
                
                alert("Datos copiados. Escribe un nuevo ID personalizado y selecciona una imagen.");
            } catch (error) {
                console.error("Error al duplicar:", error);
                alert("Error al duplicar.");
            }
        }
    );
}

init();