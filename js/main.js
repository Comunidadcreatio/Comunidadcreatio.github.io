// js/main.js
import { API_BASE_URL } from './config.js';
import { token, artistaActual, login, register, logout } from './auth.js';
import { cargarGaleria, mostrarGaleria } from './galeria.js';
import { cargarMisObras, renderizarTabla, guardarObra, eliminarObra } from './panel.js';

// ============================================
// ELEMENTOS DEL DOM (GLOBALES)
// ============================================
const galeriaContainer = document.getElementById('galeria-container');
const panelArtista = document.getElementById('panel-artista');
const tablaBody = document.getElementById('tabla-obras-body');
const obraForm = document.getElementById('obra-form');
const btnLogout = document.getElementById('btn-logout');
const btnPerfil = document.getElementById('btn-perfil');

// ============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================
async function init() {
    if (token && artistaActual) {
        // El usuario está logueado, mostramos la galería pública por defecto
        btnLogout.classList.remove('hidden');
        btnPerfil.textContent = '👤 Artista';
        
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    } else {
        // ... lógica para usuario no logueado
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    }
    setupEvents();
}

// ============================================
// CONFIGURACIÓN DE EVENTOS
// ============================================
function setupEvents() {
    // Perfil
    btnPerfil.addEventListener('click', () => {
        if (token) {
            mostrarPanelArtista();
        } else {
            document.getElementById('modal-login').classList.remove('hidden');
            document.getElementById('btn-volver-galeria').addEventListener('click', mostrarGaleriaPublica);

        }
    });

    // Logout
    btnLogout.addEventListener('click', () => {
        logout();
        document.getElementById('btn-volver-galeria').classList.add('hidden'); // 🆕 Ocultar botón
        ocultarPanelArtista();
        location.reload();
    });

    // Login
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

    // Registro
    document.getElementById('registro-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre_artista = document.getElementById('reg-nombre-artista').value;
    const nombre_real = document.getElementById('reg-nombre-real').value; // 🆕 CAPTURAR
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-pass').value;

    // 🆕 CAPTURAR NUEVOS CAMPOS
    const telefono = document.getElementById('reg-telefono').value;
    const pais = document.getElementById('reg-pais').value;
    const ciudad = document.getElementById('reg-ciudad').value;
    const instagram = document.getElementById('reg-instagram').value;
    const fecha_nacimiento = document.getElementById('reg-fecha-nacimiento').value;
    const genero = document.getElementById('reg-genero').value;

    // 🆕 PASARLOS A LA FUNCIÓN REGISTER
    const result = await register(
        nombre_artista, 
        nombre_real,
        email, 
        password, 
        telefono, 
        pais, 
        ciudad, 
        instagram, 
        fecha_nacimiento, 
        genero
    );

    if (result.success) {
        alert("¡Registro exitoso! Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada y SPAM.");
        document.getElementById('modal-registro').classList.add('hidden');
    } else {
        alert("Error: " + result.error);
    }
    });

    // En js/main.js - Reemplazar el evento submit del obraForm
    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();
    
        // 1. Recoger datos de los inputs
        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        const idPersonalizado = document.getElementById('input-id-personalizado').value;
        const idEdicion = document.getElementById('input-id-edicion').value;

        // Nuevos campos
        const ano = document.getElementById('input-ano').value;
        const descripcion_tecnica = document.getElementById('input-descripcion-tecnica').value;
        const soporte = document.getElementById('input-soporte').value;
        const descripcion_artistica = document.getElementById('input-descripcion-artistica').value;
        const estado_obra = document.getElementById('input-estado-obra').value;
        const procedencia = document.getElementById('input-procedencia').value;
        const marcos = document.getElementById('input-marcos').value;
        const certificado = document.getElementById('input-certificado').value;
        const status = document.getElementById('input-status').value;
        const ancho = document.getElementById('input-ancho').value;
        const alto = document.getElementById('input-alto').value;
        const firma = document.getElementById('input-firma').value;
        const conservacion = document.getElementById('input-conservacion').value;
        const etiquetas = document.getElementById('input-etiquetas').value;
        const localizacion = document.getElementById('input-localizacion').value;

        // 2. Construir FormData
        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado);
    
        // Agregar nuevos campos
        formData.append('ano', ano);
        formData.append('descripcion_tecnica', descripcion_tecnica);
        formData.append('soporte', soporte);
        formData.append('descripcion_artistica', descripcion_artistica);
        formData.append('estado_obra', estado_obra);
        formData.append('procedencia', procedencia);
        formData.append('marcos', marcos);
        formData.append('certificado', certificado);
        formData.append('status', status);
        formData.append('ancho', ancho);
        formData.append('alto', alto);
        formData.append('firma', firma);
        formData.append('conservacion', conservacion);
        formData.append('etiquetas', etiquetas);
        formData.append('localizacion', localizacion);

        // 3. Agregar imágenes al FormData (soporte para 5)
        const archivos = [
            document.getElementById('input-imagen-0'),
            document.getElementById('input-imagen-1'),
            document.getElementById('input-imagen-2'),
            document.getElementById('input-imagen-3'),
            document.getElementById('input-imagen-4')
        ];
    
        archivos.forEach((input, index) => {
            if (input.files.length > 0) {
                formData.append(`imagen_${index}`, input.files[0]);
            }
        });

        // 4. Enviar al backend
        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            obraForm.reset();
            document.getElementById('input-id-edicion').value = '';
            document.getElementById('btn-cancelar').classList.add('hidden');
            // Restaurar el nombre del artista en el formulario
            if (artistaActual) {
                document.getElementById('input-artista').value = artistaActual.nombre_artista;
            }
            await refrescarTabla();
        } else {
            alert("Error: " + result.error);
        }
    });

    // Botón Cancelar Edición (corregido)
    document.getElementById('btn-cancelar').addEventListener('click', () => {
        obraForm.reset();
        document.getElementById('input-id-edicion').value = '';
        document.getElementById('btn-cancelar').classList.add('hidden');
    
        // ✅ RESTAURAR EL VALOR POR DEFECTO DEL ARTISTA
        if (artistaActual) {
            document.getElementById('input-artista').value = artistaActual.nombre_artista;
        }
    });

    // Navegación entre modales
    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('hidden');
    });

    document.getElementById('btn-ir-login').addEventListener('click', () => {
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('hidden');
    });

    // Botones de cerrar modal (la X)
        document.querySelectorAll('.cerrar-modal').forEach(btn => {
            btn.addEventListener('click', function() {
                // Buscar el modal padre más cercano y ocultarlo
                const modal = this.closest('.modal');
                if (modal) {
            modal.classList.add('hidden');
                }
            });
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
    document.getElementById('btn-volver-galeria').classList.remove('hidden');
    // 🟢 ESTA ES LA NUEVA LÍNEA: Asigna el nombre del artista automáticamente
    if (artistaActual) {
        document.getElementById('input-artista').value = artistaActual.nombre_artista;
    }
    
    await refrescarTabla();
}

function ocultarPanelArtista() {
    document.getElementById('galeria-publica').classList.remove('hidden');
    panelArtista.classList.add('hidden');
    btnLogout.classList.add('hidden');
    btnPerfil.textContent = '👤';

    // 🆕 Ocultar el botón "Volver a la Galería"
    document.getElementById('btn-volver-galeria').classList.add('hidden');
}

// En js/main.js - Dentro de refrescarTabla
async function refrescarTabla() {
    const obras = await cargarMisObras(token);
    
    renderizarTabla(obras, tablaBody, 
        // EDITAR
        async (id) => {
            try {
                const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const obra = await res.json();
                
                // ID de edición
                document.getElementById('input-id-edicion').value = obra.id;
                
                // Campos básicos
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = obra.id_personalizado;
                
                // Nuevos campos
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = obra.descripcion_tecnica || '';
                document.getElementById('input-soporte').value = obra.soporte || '';
                document.getElementById('input-descripcion-artistica').value = obra.descripcion_artistica || '';
                document.getElementById('input-estado-obra').value = obra.estado_obra || '';
                document.getElementById('input-procedencia').value = obra.procedencia || '';
                document.getElementById('input-marcos').value = obra.marcos || '';
                document.getElementById('input-certificado').value = obra.certificado || '';
                document.getElementById('input-status').value = obra.status || '';
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = obra.firma || '';
                document.getElementById('input-conservacion').value = obra.conservacion || '';
                document.getElementById('input-etiquetas').value = obra.etiquetas || '';
                document.getElementById('input-localizacion').value = obra.localizacion || '';
                
                // (Los inputs de imagen se dejan vacíos al editar para subir nuevas si se desea)
                
                document.getElementById('btn-cancelar').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error("Error al cargar datos de la obra:", error);
                alert("Error al cargar la obra para editar");
            }
        },
        // ELIMINAR (sin cambios)
        async (id) => {
            const exito = await eliminarObra(token, id);
            if (exito) {
                await refrescarTabla();
            } else {
                alert("Error al eliminar la obra.");
            }
        },
        // DUPLICAR (Copiar datos excepto ID personalizado e imágenes)
        async (id) => {
            try {
                const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const obra = await res.json();
                
                // ID de edición vacío (es una nueva obra)
                document.getElementById('input-id-edicion').value = '';
                
                // Campos básicos (copiar)
                document.getElementById('input-titulo').value = obra.titulo;
                document.getElementById('input-artista').value = obra.artista;
                document.getElementById('input-precio').value = obra.precio;
                document.getElementById('input-id-personalizado').value = ''; // Vacío para nuevo ID
                
                // Nuevos campos (copiar todos)
                document.getElementById('input-ano').value = obra.ano || '';
                document.getElementById('input-descripcion-tecnica').value = obra.descripcion_tecnica || '';
                document.getElementById('input-soporte').value = obra.soporte || '';
                document.getElementById('input-descripcion-artistica').value = obra.descripcion_artistica || '';
                document.getElementById('input-estado-obra').value = obra.estado_obra || '';
                document.getElementById('input-procedencia').value = obra.procedencia || '';
                document.getElementById('input-marcos').value = obra.marcos || '';
                document.getElementById('input-certificado').value = obra.certificado || '';
                document.getElementById('input-status').value = obra.status || '';
                document.getElementById('input-ancho').value = obra.ancho || '';
                document.getElementById('input-alto').value = obra.alto || '';
                document.getElementById('input-firma').value = obra.firma || '';
                document.getElementById('input-conservacion').value = obra.conservacion || '';
                document.getElementById('input-etiquetas').value = obra.etiquetas || '';
                document.getElementById('input-localizacion').value = obra.localizacion || '';
                
                // Limpiar imágenes (es obligatorio subir nuevas)
                for (let i = 0; i < 5; i++) {
                    document.getElementById(`input-imagen-${i}`).value = '';
                }
                
                document.getElementById('btn-cancelar').classList.add('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();
                alert("Datos copiados. Escribe un nuevo ID personalizado y selecciona al menos una imagen.");
            } catch (error) {
                console.error("Error al duplicar:", error);
                alert("Error al duplicar.");
            }
        }
    );
}

function mostrarGaleriaPublica() {
    // Ocultar el panel del artista
    document.getElementById('panel-artista').classList.add('hidden');
    // Mostrar la galería pública
    document.getElementById('galeria-publica').classList.remove('hidden');
    // Ocultar el botón de "Volver a la Galería"
    document.getElementById('btn-volver-galeria').classList.add('hidden');
    
    // Recargar la galería para mostrar las obras actualizadas
    cargarGaleria(galeriaContainer).then(obras => {
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================
init();