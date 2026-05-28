// js/main.js
import { API_BASE_URL } from './config.js';
import { token, artistaActual, login, register, logout, registerWithPhoneVerification } from './auth.js'; // 🔥 Importamos la nueva función
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
const imagenesAEliminar = new Set(); // Almacena índices de imágenes a eliminar (0, 1, 2, etc.)

const ciudadesPorPais = {
    'Venezuela': {
        'Táchira': ['San Cristóbal', 'San Antonio del Táchira', 'San Juan de Colón', 'Táriba', 'Rubio', 'La Fría', 'San Josecito', 'Palmira', 'Capacho Nuevo', 'Capacho Viejo', 'La Grita', 'Abejales', 'Lobatera', 'Michelena', 'Ureña', 'Cordero', 'Las Mesas', 'Santa Ana del Táchira', 'San Rafael del Piñal', 'San José de Bolívar', 'El Cobre', 'Coloncito', 'Delicias', 'La Tendida', 'San Judas Tadeo', 'Seboruco', 'San Simón', 'Queniquea', 'Pregonero']
    }
};

function poblarCiudades(paisSeleccionado) {
    const ciudadSelect = document.getElementById('reg-ciudad');
    if (!ciudadSelect) return;

    ciudadSelect.innerHTML = '';
    
    // Opción por defecto
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

// ============================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================
async function init() {
    if (token && artistaActual) {
        btnLogout.classList.remove('hidden');
        btnPerfil.textContent = '👤 Artista';
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    } else {
        const obras = await cargarGaleria(galeriaContainer);
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    }
    setupEvents();
    setupImagePreviews();
    cargarSelectoresFecha();
    poblarCiudades('');
}

// ============================================
// CONFIGURACIÓN DE EVENTOS
// ============================================
function setupEvents() {
    document.getElementById('btn-aplicar-filtros').addEventListener('click', () => {
        currentSearch = document.getElementById('search-input').value;
        currentSortBy = document.getElementById('sort-select').value;
        currentOrder = document.getElementById('order-select').value;
        currentLimit = parseInt(document.getElementById('limit-select').value);
        currentPage = 1;
        refrescarTabla();
    });

    document.getElementById('reg-pais').addEventListener('change', function() {
        const paisSeleccionado = this.value;
        poblarCiudades(paisSeleccionado);
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            refrescarTabla();
        }
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        const totalPages = Math.ceil(totalObras / currentLimit);
        if (currentPage < totalPages) {
            currentPage++;
            refrescarTabla();
        }
    });

    btnPerfil.addEventListener('click', () => {
        if (token) {
            mostrarPanelArtista();
        } else {
            document.getElementById('modal-login').classList.remove('hidden');
        }
    });

    btnLogout.addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/artistas/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) {
                console.warn("El backend no pudo cerrar la sesión:", data.error);
            }
        } catch (error) {
            console.error("Error al cerrar sesión en el backend:", error);
        } finally {
            logout();
            document.getElementById('btn-volver-galeria').classList.add('hidden');
            ocultarPanelArtista();
            location.reload();
        }
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

    document.getElementById('btn-eliminar-cuenta').addEventListener('click', () => {
    document.getElementById('modal-confirmar-eliminacion').classList.remove('hidden');
    });

    // Abrir modal de confirmación
    document.getElementById('btn-eliminar-cuenta').addEventListener('click', () => {
        document.getElementById('modal-confirmar-eliminacion').classList.remove('hidden');
    });

    // Enviar confirmación
    document.getElementById('confirmar-eliminacion-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('confirmar-password').value;
        const mensajeError = document.getElementById('mensaje-error');
        mensajeError.style.display = 'none';

        try {
            const res = await fetch(`${API_BASE_URL}/api/artistas/eliminar-cuenta`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            
            if (data.success) {
                alert("✅ Tu cuenta ha sido eliminada correctamente.");
                logout();
                location.reload();
            } else {
                mensajeError.textContent = '❌ ' + data.error;
                mensajeError.style.display = 'block';
            }
        } catch (error) {
            mensajeError.textContent = '❌ Error de conexión. Intenta más tarde.';
            mensajeError.style.display = 'block';
        }
    });

            // Cerrar todas las sesiones
    document.getElementById('btn-cerrar-todas-sesiones').addEventListener('click', async () => {
        if (confirm("⚠️ ¿Estás seguro de que quieres cerrar la sesión en todos los dispositivos? Esta acción cerrará tu sesión actual.")) {
            try {
                const res = await fetch(`${API_BASE_URL}/api/artistas/cerrar-todas-sesiones`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    alert("✅ Todas las sesiones han sido cerradas. Cerrando tu sesión actual...");
                    // 🛑 Cerrar sesión local y recargar la página
                    logout(); // Esto limpia localStorage y dispara el evento 'userLogout'
                    location.reload(); // Recarga la página para mostrar la galería pública
                } else {
                    alert("❌ Error: " + data.error);
                }
            } catch (error) {
                console.error("Error al cerrar todas las sesiones:", error);
                alert("❌ Error de conexión. Intenta más tarde.");
            }
        }
    });

// Cerrar modal con la X
document.querySelector('#modal-confirmar-eliminacion .cerrar-modal').addEventListener('click', () => {
    document.getElementById('modal-confirmar-eliminacion').classList.add('hidden');
});



    // ==========================================================
    // 🔥 REGISTRO CON VERIFICACIÓN DE TELÉFONO (FIREBASE)
    // ==========================================================
    document.getElementById('registro-form').addEventListener('submit', async (e) => {
        e.preventDefault();

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

        // 1. Validación de fecha y edad (la que ya tenías)
        if (!dia || !mes || !ano) {
            alert("❌ Todos los campos de fecha son obligatorios.");
            return;
        }
        const fechaNac = new Date(ano, mes - 1, dia);
        if (fechaNac.getFullYear() != ano || fechaNac.getMonth() != mes - 1 || fechaNac.getDate() != dia) {
            alert("❌ La fecha seleccionada no es válida.");
            return;
        }
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mesDiff = hoy.getMonth() - fechaNac.getMonth();
        if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < fechaNac.getDate())) {
            edad--;
        }
        if (edad < 18) {
            alert("⚠️ Debes tener al menos 18 años para registrarte.");
            return;
        }
        const fecha_nacimiento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

        // 2. Validación de teléfono (formato, opcional si quieres mantenerla)
        const regexVzla = /^(\+58|0)(\d{3})\d{7}$/;
        if (!regexVzla.test(telefono)) {
            alert("❌ El número de teléfono debe tener 11 dígitos y comenzar con 04 o +58.");
            return;
        }

        // 3. Llamar a la función de registro normal (sin Firebase)
        const result = await register(
            nombre_artista,
            nombre_real,
            email,
            password,
            telefono,
            pais,
            ciudad,
            fecha_nacimiento,
            genero
        );

        if (result.success) {
            alert("✅ ¡Registro exitoso! Revisa tu correo para confirmar tu cuenta.");
            document.getElementById('modal-registro').classList.add('hidden');
        } else {
            alert("❌ Error: " + result.error);
        }
    });
    // ==========================================================

    // Guardar Obra
    obraForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const titulo = document.getElementById('input-titulo').value;
        const artista = document.getElementById('input-artista').value;
        const precio = document.getElementById('input-precio').value;
        const idPersonalizado = document.getElementById('input-id-personalizado').value;
        const idEdicion = document.getElementById('input-id-edicion').value;

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

        const archivos = [
            document.getElementById('input-imagen-0'),
            document.getElementById('input-imagen-1'),
            document.getElementById('input-imagen-2'),
            document.getElementById('input-imagen-3'),
            document.getElementById('input-imagen-4')
        ];

        let imagenFinalVisible = false;
        const hayArchivosNuevos = archivos.some(input => input && input.files && input.files.length > 0);
        for (let i = 0; i < 5; i++) {
            const preview = document.getElementById(`preview-${i}`);
            if (preview && preview.style.display === 'block' && !imagenesAEliminar.has(i)) {
                imagenFinalVisible = true;
                break;
            }
        }
        if (!hayArchivosNuevos && !imagenFinalVisible) {
            alert("❌ La obra debe tener al menos una imagen. No puedes guardar sin imágenes.");
            return;
        }

        const formData = new FormData();
        formData.append('titulo', titulo);
        formData.append('artista', artista);
        formData.append('precio', precio);
        formData.append('id_obra', idPersonalizado);
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

        if (imagenesAEliminar.size > 0) {
            formData.append('imagenes_a_eliminar', JSON.stringify([...imagenesAEliminar]));
        }

        archivos.forEach((input, index) => {
            if (input && input.files && input.files.length > 0) {
                formData.append(`imagen_${index}`, input.files[0]);
            }
        });

        const result = await guardarObra(token, formData, idEdicion || null);
        if (result.success) {
            alert("Obra guardada correctamente.");
            document.getElementById('btn-guardar').textContent = 'Guardar Obra';
            imagenesAEliminar.clear();
            limpiarFormularioCompleto(true);
            await refrescarTabla();
        } else {
            alert("Error: " + result.error);
        }
    });

    // Función para limpiar el formulario completamente
    function limpiarFormularioCompleto(restaurarArtista = true) {
        obraForm.reset();
        document.getElementById('input-id-edicion').value = '';
        document.getElementById('btn-limpiar-campos').classList.add('hidden');
        document.getElementById('btn-guardar').textContent = 'Guardar Obra';
        imagenesAEliminar.clear();

        for (let i = 0; i < 5; i++) {
            const preview = document.getElementById(`preview-${i}`);
            const placeholder = document.getElementById(`placeholder-${i}`);
            const inputFile = document.getElementById(`input-imagen-${i}`);
            if (preview && placeholder) {
                preview.src = '';
                preview.style.display = 'none';
                placeholder.style.display = 'block';
            }
            if (inputFile) {
                inputFile.value = '';
            }
            const btnEliminar = document.querySelector(`.btn-eliminar-imagen[data-index="${i}"]`);
            if (btnEliminar) {
                btnEliminar.style.display = 'none';
            }
        }

        if (restaurarArtista && artistaActual) {
            document.getElementById('input-artista').value = artistaActual.nombre_artista;
        }
    }

    document.getElementById('btn-limpiar-campos').addEventListener('click', () => {
        limpiarFormularioCompleto(true);
    });

    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-registro').classList.remove('hidden');
    });

        // 🔹 Mostrar modal de restablecimiento
    document.getElementById('btn-olvide-contrasena').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('modal-login').classList.add('hidden');
        document.getElementById('modal-restablecimiento').classList.remove('hidden');
    });

    // 🔹 Enviar solicitud de restablecimiento
    document.getElementById('solicitar-restablecimiento-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const messageEl = document.getElementById('reset-message');
        messageEl.style.display = 'block';
        messageEl.textContent = '⏳ Enviando solicitud...';
        messageEl.style.color = '#555';

        try {
            const res = await fetch(`${API_BASE_URL}/api/artistas/solicitar-restablecimiento`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            messageEl.textContent = data.success ? '✅ Si el correo está registrado, recibirás un enlace en tu bandeja de entrada.' : '❌ Error: ' + data.error;
            messageEl.style.color = data.success ? '#28a745' : '#dc3545';
        } catch (error) {
            console.error('Error al solicitar restablecimiento:', error);
            messageEl.textContent = '❌ Error de conexión. Inténtalo más tarde.';
            messageEl.style.color = '#dc3545';
        }
    });

    // 🔹 Cerrar el modal de restablecimiento con la X
    document.querySelector('#modal-restablecimiento .cerrar-modal').addEventListener('click', () => {
        document.getElementById('modal-restablecimiento').classList.add('hidden');
    });

    document.getElementById('btn-ir-login').addEventListener('click', () => {
        document.getElementById('modal-registro').classList.add('hidden');
        document.getElementById('modal-login').classList.remove('hidden');
    });

    document.querySelectorAll('.cerrar-modal').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
            }
        });
    });

    document.getElementById('btn-volver-galeria').addEventListener('click', mostrarGaleriaPublica);
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
    document.getElementById('btn-volver-galeria').classList.add('hidden');
}

let currentPage = 1;
let currentLimit = 10;
let currentSearch = '';
let currentSortBy = 'id';
let currentOrder = 'DESC';
let totalObras = 0;

async function refrescarTabla() {
    const result = await cargarMisObras(token, currentPage, currentLimit, currentSearch, currentSortBy, currentOrder);
    
    if (!result.success) {
        console.error("Error al cargar obras:", result.error);
        return;
    }

    const obras = result.obras;
    totalObras = result.total;
    const totalPages = Math.ceil(totalObras / currentLimit);

    document.getElementById('page-info').textContent = `Página ${currentPage} de ${totalPages || 1}`;
    document.getElementById('btn-prev').disabled = currentPage <= 1;
    document.getElementById('btn-next').disabled = currentPage >= totalPages;

    renderizarTabla(obras, tablaBody, 
        // EDITAR
        async (id) => {
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
                
                document.getElementById('btn-guardar').textContent = 'Actualizar Obra';
                
                const imagenes = [
                    obra.imagen_url,
                    obra.imagen_url_1,
                    obra.imagen_url_2,
                    obra.imagen_url_3,
                    obra.imagen_url_4
                ];
                
                document.querySelectorAll('.btn-eliminar-imagen').forEach(btn => btn.remove());
                
                imagenes.forEach((url, index) => {
                    if (url) {
                        const preview = document.getElementById(`preview-${index}`);
                        const placeholder = document.getElementById(`placeholder-${index}`);
                        if (preview && placeholder) {
                            preview.src = url;
                            preview.style.display = 'block';
                            placeholder.style.display = 'none';

                            const recuadro = preview.closest('.recuadro-imagen') || preview.parentElement;
                            if (recuadro) {
                                const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
                                if (btnExistente) {
                                    btnExistente.remove();
                                }

                                const btnEliminar = document.createElement('button');
                                btnEliminar.type = 'button';
                                btnEliminar.className = 'btn-eliminar-imagen';
                                btnEliminar.dataset.index = index;
                                btnEliminar.textContent = '✕';
                                btnEliminar.style.cssText = `
                                    position: absolute; top: 0; right: 0;
                                    background: #dc3545; color: white;
                                    border: none; border-radius: 50%;
                                    width: 24px; height: 24px;
                                    cursor: pointer; font-size: 14px;
                                    display: block; z-index: 10;
                                    line-height: 24px; text-align: center;
                                `;
                                recuadro.style.position = 'relative';
                                recuadro.appendChild(btnEliminar);

                                btnEliminar.addEventListener('click', function() {
                                    const idx = parseInt(this.dataset.index);
                                    const previewImg = document.getElementById(`preview-${idx}`);
                                    const placeholderSpan = document.getElementById(`placeholder-${idx}`);
                                    const inputFile = document.getElementById(`input-imagen-${idx}`);

                                    if (previewImg.src && previewImg.src !== '') {
                                        imagenesAEliminar.add(idx);
                                        previewImg.src = '';
                                        previewImg.style.display = 'none';
                                        placeholderSpan.style.display = 'block';
                                        inputFile.value = '';
                                        this.style.display = 'none';
                                        console.log(`Imagen ${idx} marcada para eliminar.`);
                                    }
                                });
                            }
                        }
                    }
                });
                
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
            } catch (error) {
                console.error("Error al cargar datos de la obra:", error);
                alert("Error al cargar la obra para editar");
            }
        },
        // ELIMINAR
        async (id) => {
            const exito = await eliminarObra(token, id);
            if (exito) {
                await refrescarTabla();
            } else {
                alert("Error al eliminar la obra.");
            }
        },
        // DUPLICAR
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
                
                for (let i = 0; i < 5; i++) {
                    const preview = document.getElementById(`preview-${i}`);
                    const placeholder = document.getElementById(`placeholder-${i}`);
                    if (preview && placeholder) {
                        preview.src = '';
                        preview.style.display = 'none';
                        placeholder.style.display = 'block';
                    }
                    document.getElementById(`input-imagen-${i}`).value = '';
                }
                
                document.getElementById('btn-guardar').textContent = 'Guardar Obra';
                document.getElementById('btn-limpiar-campos').classList.remove('hidden');
                document.getElementById('formulario-obra').scrollIntoView({ behavior: 'smooth' });
                document.getElementById('input-id-personalizado').focus();
            } catch (error) {
                console.error("Error al duplicar:", error);
                alert("Error al duplicar.");
            }
        }
    );
}

function mostrarGaleriaPublica() {
    document.getElementById('panel-artista').classList.add('hidden');
    document.getElementById('galeria-publica').classList.remove('hidden');
    document.getElementById('btn-volver-galeria').classList.add('hidden');
    cargarGaleria(galeriaContainer).then(obras => {
        mostrarGaleria(obras, galeriaContainer, (id) => {
            console.log("Ver detalles de obra con ID:", id);
        });
    });
}

function setupImagePreviews() {
    const idEdicion = document.getElementById('input-id-edicion').value;

    for (let i = 0; i < 5; i++) {
        const input = document.getElementById(`input-imagen-${i}`);
        const preview = document.getElementById(`preview-${i}`);
        const placeholder = document.getElementById(`placeholder-${i}`);

        if (input) {
            input.addEventListener('change', function(e) {
                const file = this.files[0];
                const recuadro = this.closest('.recuadro-imagen');
                if (!recuadro) return;

                const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
                if (btnExistente) {
                    btnExistente.remove();
                }

                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        if (preview) {
                            preview.src = e.target.result;
                            preview.style.display = 'block';
                        }
                        if (placeholder) placeholder.style.display = 'none';

                        const btnEliminar = document.createElement('button');
                        btnEliminar.type = 'button';
                        btnEliminar.className = 'btn-eliminar-imagen';
                        btnEliminar.dataset.index = i;
                        btnEliminar.textContent = '✕';
                        btnEliminar.style.cssText = `
                            position: absolute; top: 0; right: 0;
                            background: #dc3545; color: white;
                            border: none; border-radius: 50%;
                            width: 24px; height: 24px;
                            cursor: pointer; font-size: 14px;
                            display: block; z-index: 10;
                            line-height: 24px; text-align: center;
                        `;
                        recuadro.style.position = 'relative';
                        recuadro.appendChild(btnEliminar);

                        btnEliminar.addEventListener('click', function() {
                            const idx = parseInt(this.dataset.index);
                            const previewImg = document.getElementById(`preview-${idx}`);
                            const placeholderSpan = document.getElementById(`placeholder-${idx}`);
                            const inputFile = document.getElementById(`input-imagen-${idx}`);

                            if (previewImg.src && previewImg.src !== '') {
                                previewImg.src = '';
                                previewImg.style.display = 'none';
                                placeholderSpan.style.display = 'block';
                                inputFile.value = '';
                                this.remove();

                                const idEdicion = document.getElementById('input-id-edicion').value;
                                if (idEdicion) {
                                    imagenesAEliminar.add(idx);
                                    console.log(`📌 [Edición] Imagen ${idx} marcada para eliminar.`);
                                } else {
                                    console.log(`🆕 [Nueva obra] Imagen ${idx} eliminada visualmente.`);
                                }
                            }
                        });
                    };
                    reader.readAsDataURL(file);
                } else {
                    if (preview) {
                        preview.src = '';
                        preview.style.display = 'none';
                    }
                    if (placeholder) placeholder.style.display = 'block';
                    const btnEliminar = recuadro.querySelector('.btn-eliminar-imagen');
                    if (btnEliminar) {
                        btnEliminar.remove();
                    }
                }
            });
        }
    }
}

function cargarSelectoresFecha() {
    const diaSelect = document.getElementById('reg-dia');
    if (diaSelect) {
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            diaSelect.appendChild(option);
        }
    }

    const mesSelect = document.getElementById('reg-mes');
    if (mesSelect) {
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
        const maxYear = new Date().getFullYear() - 18;
        for (let i = maxYear; i >= 1900; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            anoSelect.appendChild(option);
        }
    }
}

init();