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
const imagenesAEliminar = new Set(); // Almacena índices de imágenes a eliminar (0, 1, 2, etc.)

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
}

// ============================================
// CONFIGURACIÓN DE EVENTOS
// ============================================
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
        document.getElementById('btn-volver-galeria').classList.add('hidden');
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
        const nombre_real = document.getElementById('reg-nombre-real').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-pass').value;
        const telefono = document.getElementById('reg-telefono').value;
        const pais = document.getElementById('reg-pais').value;
        const ciudad = document.getElementById('reg-ciudad').value;
        const instagram = document.getElementById('reg-instagram').value;
        const fecha_nacimiento = document.getElementById('reg-fecha-nacimiento').value;
        const genero = document.getElementById('reg-genero').value;
        const dia = document.getElementById('reg-dia').value;
        const mes = document.getElementById('reg-mes').value;
        const ano = document.getElementById('reg-ano').value;

        // 🛑 1. VALIDACIÓN EXPLÍCITA: ¿Todos los campos están seleccionados?
        if (!dia || !mes || !ano) {
            alert("❌ Todos los campos de fecha son obligatorios.");
            return;
        }

        // 🛑 2. VALIDACIÓN DE FECHA REAL (ej: 31 de febrero no es válido)
        const fechaNac = new Date(ano, mes - 1, dia);
        if (fechaNac.getFullYear() != ano || fechaNac.getMonth() != mes - 1 || fechaNac.getDate() != dia) {
            alert("❌ La fecha seleccionada no es válida.");
            return;
        }

        // 🛑 3. VALIDACIÓN DE EDAD: ¿Tiene al menos 18 años?
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
        // 🛑 4. Construir la fecha en formato YYYY-MM-DD para enviar al backend
        const fecha_nacimiento = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;sad
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
        const localizacion = document.getElementById('input-localizacion').value;

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
        formData.append('localizacion', localizacion);

        // 🆕 Agregar imágenes a eliminar al FormData
        if (imagenesAEliminar.size > 0) {
            formData.append('imagenes_a_eliminar', JSON.stringify([...imagenesAEliminar]));
        }

        const archivos = [
            document.getElementById('input-imagen-0'),
            document.getElementById('input-imagen-1'),
            document.getElementById('input-imagen-2'),
            document.getElementById('input-imagen-3'),
            document.getElementById('input-imagen-4')
        ];

        if (!idEdicion) {
            const imagenSeleccionada = archivos.some(input => input.files.length > 0);
            if (!imagenSeleccionada) {
                alert("Para una obra nueva, debes seleccionar al menos una imagen.");
                return;
            }
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
            imagenesAEliminar.clear(); // 🆕 Limpiar el Set
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
        imagenesAEliminar.clear(); // 🆕 Limpiar el Set

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
            // 🆕 Ocultar botones de eliminar al limpiar
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
                document.getElementById('input-localizacion').value = obra.localizacion || '';
                
                document.getElementById('btn-guardar').textContent = 'Actualizar Obra';
                
                const imagenes = [
                    obra.imagen_url,
                    obra.imagen_url_1,
                    obra.imagen_url_2,
                    obra.imagen_url_3,
                    obra.imagen_url_4
                ];
                
                // 🆕 Limpiar botones de eliminar previos
                document.querySelectorAll('.btn-eliminar-imagen').forEach(btn => btn.remove());
                
                imagenes.forEach((url, index) => {
                    if (url) {
                        const preview = document.getElementById(`preview-${index}`);
                        const placeholder = document.getElementById(`placeholder-${index}`);
                        if (preview && placeholder) {
                            preview.src = url;
                            preview.style.display = 'block';
                            placeholder.style.display = 'none';

                            // 🆕 OBTENER EL RECUADRO PADRE
                            const recuadro = preview.closest('.recuadro-imagen') || preview.parentElement;
                            if (recuadro) {
                                // ✅ ELIMINAR BOTÓN "X" PREVIO (SI EXISTE) PARA EVITAR DUPLICADOS
                                const btnExistente = recuadro.querySelector('.btn-eliminar-imagen');
                                if (btnExistente) {
                                    btnExistente.remove();
                                }

                                // 🆕 CREAR BOTÓN "X" PARA ESTA IMAGEN
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

                                // ✅ LISTENER PARA ELIMINAR LA IMAGEN
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
                                        this.style.display = 'none'; // Ocultar botón
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
                document.getElementById('input-localizacion').value = obra.localizacion || '';
                
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
    for (let i = 0; i < 5; i++) {
        const input = document.getElementById(`input-imagen-${i}`);
        const preview = document.getElementById(`preview-${i}`);
        const placeholder = document.getElementById(`placeholder-${i}`);

        if (input) {
            input.addEventListener('change', function(e) {
                const file = this.files[0];
                const recuadro = this.closest('.recuadro-imagen');
                if (!recuadro) return;

                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        if (preview) {
                            preview.src = e.target.result;
                            preview.style.display = 'block';
                        }
                        if (placeholder) placeholder.style.display = 'none';

                        // 🟢 CREAR O MOSTRAR EL BOTÓN "X"
                        let btnEliminar = recuadro.querySelector('.btn-eliminar-imagen');
                        if (!btnEliminar) {
                            btnEliminar = document.createElement('button');
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

                            // Listener para eliminar esta imagen (nueva o existente)
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
                        } else {
                            // Si el botón ya existe, asegurarse de que esté visible
                            btnEliminar.style.display = 'block';
                        }
                    };
                    reader.readAsDataURL(file);
                } else {
                    // Si se cancela la selección, volver al estado inicial
                    if (preview) {
                        preview.src = '';
                        preview.style.display = 'none';
                    }
                    if (placeholder) placeholder.style.display = 'block';
                    const btnEliminar = recuadro.querySelector('.btn-eliminar-imagen');
                    if (btnEliminar) btnEliminar.style.display = 'none';
                }
            });
        }
    }
}

function cargarSelectoresFecha() {
    // Llenar selector de días (1 al 31)
    const diaSelect = document.getElementById('reg-dia');
    if (diaSelect) {
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            diaSelect.appendChild(option);
        }
    }

    // Llenar selector de meses (Enero a Diciembre)
    const mesSelect = document.getElementById('reg-mes');
    if (mesSelect) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        meses.forEach((nombre, i) => {
            const option = document.createElement('option');
            option.value = i + 1; // 1-12
            option.textContent = nombre;
            mesSelect.appendChild(option);
        });
    }

    // Llenar selector de años (desde 1900 hasta el año actual menos 18)
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