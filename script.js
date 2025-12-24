// Variable global para almacenar los datos de las obras y poder editarlas sin volver a pedir al servidor
window.obrasData = [];

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. VARIABLES Y SELECTORES ---
    window.isLoggedIn = false; // Estado de sesión
    let editingId = null;      // ID de la obra que se está editando actualmente

    // Elementos principales UI
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');

    // Paneles y Login
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const adminDashboard = document.getElementById('admin-dashboard'); 
    const loginForm = document.querySelector('.login-form');
    const btnLogout = document.getElementById('btn-logout'); 
    const adminUsernameSpan = document.getElementById('admin-username'); 

    // Formulario de Obras y Botones
    const artworkForm = document.getElementById('artwork-form');
    const btnSave = document.getElementById('btn-save');   // Botón verde
    const btnUpdate = document.getElementById('btn-update'); // Botón azul (nuevo)
    const btnClear = document.getElementById('btn-clear');   // Botón gris (nuevo)
    // Evento para el botón Limpiar
    if (btnClear) {
        btnClear.addEventListener('click', function(e) {
            e.preventDefault(); // <--- MUY IMPORTANTE
            window.resetFormulario();
        });
    }
    // Inputs de archivo
    const fileInput = document.getElementById('dash-input-file');
    const nameDisplay = document.getElementById('file-name-display');

    // --- 2. VALIDACIÓN: SOLO NÚMEROS (Año y Precio) ---
    const inputAno = document.getElementById('dash-ano');
    const inputPrecio = document.getElementById('dash-precio');

    // Función para bloquear letras
    function soloNumeros(e) {
        this.value = this.value.replace(/[^0-9]/g, '');
    }

    if(inputAno) inputAno.addEventListener('input', soloNumeros);
    if(inputPrecio) inputPrecio.addEventListener('input', soloNumeros);

    // --- 3. LOGICA DE ARCHIVOS ---
    if(fileInput) {
        fileInput.addEventListener('change', function() {
            if(this.files && this.files[0]) {
                nameDisplay.textContent = "Archivo listo: " + this.files[0].name;
                nameDisplay.style.color = "#2ecc71";
            }
        });
    }

    // --- 4. FUNCIÓN PARA VALIDAR CAMPOS VACÍOS ---
    function validarFormulario() {
        // Seleccionamos todos los inputs y selects del formulario
        const inputs = artworkForm.querySelectorAll('input:not([type="file"]), select, textarea');
        let hayVacios = false;

        inputs.forEach(input => {
            if (input.value.trim() === "") {
                hayVacios = true;
                input.style.border = "2px solid #e74c3c"; // Marcar en rojo
            } else {
                input.style.border = "none"; // Restaurar (o al estilo original)
            }
        });

        if (hayVacios) {
            alert("⚠️ Por favor, llena todos los campos vacíos antes de continuar.");
            return false;
        }
        return true;
    }

    // --- 6. NAVEGACIÓN Y MENÚ ---
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            // Manejo de clases activas
            navLinks.forEach(el => el.classList.remove('active'));
            this.classList.add('active');

            // Cerrar menú móvil al hacer click
            if(navMenu) navMenu.classList.remove('active');

            // Lógica específica para Galería
            const linkText = this.textContent.trim().toLowerCase();
            if (linkText === 'galería' || linkText === 'galeria') {
                if (cartContainer) {
                    cartContainer.classList.add('hidden');
                    cartContainer.classList.remove('show-anim');
                    setTimeout(() => {
                        cartContainer.classList.remove('hidden');
                        cartContainer.classList.add('show-anim');
                    }, 10);
                }
            } else if (cartContainer) {
                cartContainer.classList.add('hidden');
            }
        });
    });

    // 4. GESTIÓN DE PANELES (LOGIN / DASHBOARD)
    function togglePanels(showDashboard) {
        if (showDashboard && window.isLoggedIn) {
            loginPanel.classList.add('hidden');
            adminDashboard.classList.remove('hidden');
        } else {
            loginPanel.classList.remove('hidden');
            adminDashboard.classList.add('hidden');
        }
    }

    if(adminBtn) {
        adminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.isLoggedIn) {
                adminDashboard.classList.toggle('hidden');
                loginPanel.classList.add('hidden');
            } else {
                loginPanel.classList.remove('hidden');
                adminDashboard.classList.add('hidden');
            }
        });
    }

    // Cerrar click fuera
    [loginPanel, adminDashboard].forEach(panel => {
        if(panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) panel.classList.add('hidden');
            });
        }
    });

    // PROCESO LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnLogin = loginForm.querySelector('.btn-login');
            const originalText = btnLogin.innerHTML;
            
            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            const user = loginForm.querySelectorAll('input')[0].value.trim();
            const pass = loginForm.querySelectorAll('input')[1].value.trim();

            try {
                const res = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user, pass })
                });
                const result = await res.json();

                if (result.success) {
                    window.isLoggedIn = true;
                    if(adminUsernameSpan) adminUsernameSpan.textContent = user;
                    const icon = adminBtn.querySelector('i');
                    if(icon) { icon.className = "fa-solid fa-user-check"; icon.style.color = "#2ecc71"; }
                    
                    alert("¡Bienvenido!");
                    await cargarTablaObras();
                    togglePanels(true);
                    loginForm.reset();
                } else {
                    alert("Credenciales incorrectas.");
                }
            } catch (error) {
                alert("Error de conexión.");
            } finally {
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
            }
        });
    }

    // --- 8. GUARDAR NUEVA OBRA (POST) ---
    if (artworkForm) {
        artworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // 1. Validar vacíos
            if (!validarFormulario()) return;

            // 2. Preparar UI
            const originalText = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSave.disabled = true;

            // 3. Recopilar datos
            const formData = new FormData();
            // Agregar múltiples imágenes (hasta 5)
        for (let i = 0; i < 5; i++) {
            const inputArchivo = document.getElementById(`dash-imagen-${i}`);
            if (inputArchivo && inputArchivo.files[0]) {
                formData.append(`imagen_${i}`, inputArchivo.files[0]);
            }
        }

        // Agregar el resto de campos
        formData.append('titulo', document.getElementById('dash-titulo').value);
        formData.append('artista', document.getElementById('dash-artista').value);
        formData.append('ano', document.getElementById('dash-ano').value);
        formData.append('descripcion_tecnica', document.getElementById('dash-tec-desc').value);
        formData.append('descripcion_artistica', document.getElementById('dash-art-desc').value);
        formData.append('status', document.getElementById('dash-status').value);
        formData.append('estado_obra', document.getElementById('dash-estado-obra').value);
        formData.append('ancho', document.getElementById('dash-ancho').value);
        formData.append('alto', document.getElementById('dash-alto').value);
        formData.append('peso', document.getElementById('dash-peso').value);
        formData.append('marcos', document.getElementById('dash-marcos').value);
        formData.append('precio', document.getElementById('dash-precio').value);
        formData.append('certificado', document.getElementById('dash-certificado').value);
        formData.append('id_obra', document.getElementById('dash-id').value);
        formData.append('procedencia', document.getElementById('dash-procedencia').value);
        formData.append('firma', document.getElementById('dash-firma').value);
        formData.append('soporte', document.getElementById('dash-soporte').value);
        formData.append('conservacion', document.getElementById('dash-conservacion').value);
        formData.append('etiquetas', document.getElementById('dash-etiquetas').value);
        formData.append('localizacion', document.getElementById('dash-localizacion').value);

        try {
            const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras', {
                method: 'POST',
                body: formData 
            });
            const result = await response.json();

            if (response.ok && result.success) {
                alert("¡Obra registrada con éxito!");
                window.resetFormulario();
                cargarTablaObras(); 
            } else {
                alert("Error: " + (result.error || "No se pudo guardar"));
            }
        } catch (error) {
            alert("Error al conectar con el servidor.");
        } finally {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
        }
    });
}

    // --- 9. ACTUALIZAR OBRA (PUT) - BOTÓN REFRESCAR ---
if (btnUpdate) {
    btnUpdate.addEventListener('click', async (e) => {
        e.preventDefault();

        if (!validarFormulario()) return;
        if (!editingId) { 
            alert("Error: No se ha seleccionado ninguna obra."); 
            return; 
        }

        const originalText = btnUpdate.innerHTML;
        btnUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';
        btnUpdate.disabled = true;

        const formData = new FormData();
        
        // Agregar múltiples imágenes para actualización
        for (let i = 0; i < 5; i++) {
            const inputArchivo = document.getElementById(`dash-imagen-${i}`);
            if (inputArchivo && inputArchivo.files[0]) {
                formData.append(`imagen_${i}`, inputArchivo.files[0]);
            }
        }

        // 2. Mapeo de campos (Asegúrate de que los IDs coincidan con tu index.html)
        formData.append('titulo', document.getElementById('dash-titulo').value);
        formData.append('artista', document.getElementById('dash-artista').value);
        formData.append('ano', document.getElementById('dash-ano').value);
        formData.append('descripcion_tecnica', document.getElementById('dash-tec-desc').value);
        formData.append('descripcion_artistica', document.getElementById('dash-art-desc').value);
        formData.append('status', document.getElementById('dash-status').value);
        formData.append('estado_obra', document.getElementById('dash-estado-obra').value);
        
        // Campos de dimensiones corregidos (Sincronizados con la DB)
        formData.append('ancho', document.getElementById('dash-ancho').value);
        formData.append('alto', document.getElementById('dash-alto').value);
        formData.append('peso', document.getElementById('dash-peso').value);
        
        formData.append('marcos', document.getElementById('dash-marcos').value);
        formData.append('precio', document.getElementById('dash-precio').value);
        formData.append('certificado', document.getElementById('dash-certificado').value);
        
        // Importante: El backend espera 'id_obra' para mapearlo a 'id_personalizado'
        formData.append('id_obra', document.getElementById('dash-id').value);
        formData.append('procedencia', document.getElementById('dash-procedencia').value);
        formData.append('firma', document.getElementById('dash-firma').value);
        formData.append('soporte', document.getElementById('dash-soporte').value);
        formData.append('conservacion', document.getElementById('dash-conservacion').value);
        formData.append('etiquetas', document.getElementById('dash-etiquetas').value);
        formData.append('localizacion', document.getElementById('dash-localizacion').value);

        try {
            // Usamos la URL de tu backend en Render
            const response = await fetch(`https://backend-fundacion-atpe.onrender.com/obras/${editingId}`, {
                method: 'PUT',
                body: formData 
                // Nota: No se pone Header de Content-Type, el navegador lo pone solo al ver FormData
            });
            
            const result = await response.json();

            if (response.ok && result.success) {
                alert("¡Obra actualizada correctamente!");
                
                // 1. CAMBIO DE BOTONES: Mostrar Guardar, Ocultar Refrescar // <--- NUEVO
                const btnSave = document.getElementById('btn-save');
                if (btnSave) btnSave.classList.remove('hidden');
                btnUpdate.classList.add('hidden');
                
                // 2. Limpiamos el formulario y los slots de imagen
                if (typeof window.resetFormulario === 'function') {
                    window.resetFormulario();
                }
                
                // 3. Recargamos la tabla
                if (typeof cargarTablaObras === 'function') {
                    cargarTablaObras(); 
                } else {
                    location.reload();
                }
            } else {
                alert("Error al actualizar: " + (result.error || result.message || "Desconocido"));
            }
        } catch (error) {
            console.error("Error en la petición PUT:", error);
            alert("Error de conexión al actualizar.");
        } finally {
            btnUpdate.innerHTML = originalText;
            btnUpdate.disabled = false;
        }
    });
}

    // --- 10. PREPARAR EDICIÓN (Global para acceder desde editingId interno) ---
    // Esta función conecta el botón de la tabla con el formulario
    window.prepararEdicion = function(id) {
        const obra = window.obrasData.find(o => o.id === id);
        if (!obra) return;

        editingId = id; // Guardamos el ID que estamos editando

        // Subir scroll al formulario
        const dash = document.getElementById('admin-dashboard');
        if(dash) dash.scrollTo({ top: 0, behavior: 'smooth' });

        // Llenar campos (Usamos los IDs de tu HTML actual)
        document.getElementById('dash-titulo').value = obra.titulo || '';
        document.getElementById('dash-artista').value = obra.artista || '';
        document.getElementById('dash-ano').value = obra.ano || '';
        document.getElementById('dash-tec-desc').value = obra.descripcion_tecnica || '';
        document.getElementById('dash-art-desc').value = obra.descripcion_artistica || '';
        document.getElementById('dash-status').value = obra.status || '';
        document.getElementById('dash-estado-obra').value = obra.estado_obra || '';
        document.getElementById('dash-ancho').value = obra.ancho || '';
        document.getElementById('dash-alto').value = obra.alto || '';
        document.getElementById('dash-peso').value = obra.peso || '';
        document.getElementById('dash-marcos').value = obra.marcos || '';
        document.getElementById('dash-precio').value = obra.precio || '';
        document.getElementById('dash-certificado').value = obra.certificado || '';
        document.getElementById('dash-id').value = obra.id_personalizado || '';
        document.getElementById('dash-procedencia').value = obra.procedencia || '';
        document.getElementById('dash-firma').value = obra.firma || '';
        document.getElementById('dash-soporte').value = obra.soporte || ''; 
        document.getElementById('dash-conservacion').value = obra.conservacion || '';
        document.getElementById('dash-etiquetas').value = obra.etiquetas || '';
        document.getElementById('dash-localizacion').value = obra.localizacion || '';

        if (obra.todas_imagenes && Array.isArray(obra.todas_imagenes)) {
        obra.todas_imagenes.forEach((url, index) => {
            if (index < 5 && url) { // Máximo 5 imágenes
                const slot = document.getElementById(`slot-${index}`);
                const imgPreview = slot.querySelector('.preview-img');
                
                imgPreview.src = url;
                imgPreview.classList.remove('hidden');
                slot.classList.add('has-image');
            }
        });
    } else {
        // Para compatibilidad con obras antiguas que solo tienen imagen_url
        if (obra.imagen_url) {
            const slot0 = document.getElementById('slot-0');
            const imgPreview = slot0.querySelector('.preview-img');
            
            const baseUrl = 'https://backend-fundacion-atpe.onrender.com';
            imgPreview.src = obra.imagen_url.startsWith('http') 
                ? obra.imagen_url 
                : `${baseUrl}${obra.imagen_url}`;
            
            imgPreview.classList.remove('hidden');
            slot0.classList.add('has-image');
        }
    }


        // Feedback visual


        if (btnSave && btnUpdate) {
        btnSave.style.setProperty('display', 'none', 'important'); // Oculta Guardar
        btnUpdate.style.setProperty('display', 'block', 'important'); // Muestra Refrescar
        }
    
        // Opcional: Hacer scroll hacia arriba para ver el formulario lleno
        document.getElementById('admin-dashboard').scrollTo({ top: 0, behavior: 'smooth' });

    };

    // Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            window.isLoggedIn = false;
            togglePanels(false);
            const icon = adminBtn.querySelector('i');
            if(icon) { icon.className = "fa-solid fa-user-shield"; icon.style.color = ""; }
            alert("Has salido del sistema.");
        });
    }
});

// --- FUNCIONES GLOBALES (FUERA DE DOMCONTENTLOADED) ---

// Cargar Tabla
// --- NUEVA LÓGICA: RENDERIZADO Y BUSCADOR ---

// 1. Función reutilizable para pintar la tabla (sirve para cargar y para buscar)
function renderizarTabla(listaObras) {
    const tbody = document.getElementById('tabla-obras-body');
    if (!tbody) return;

    tbody.innerHTML = ''; // Limpiar tabla

    if (!listaObras || listaObras.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">No se encontraron coincidencias.</td></tr>';
        return;
    }

    listaObras.forEach(obra => {
        // Lógica de URL de imagen
        let urlFinal = '';
        const valorImagen = obra.imagen_url;
        const dominio = 'https://backend-fundacion-atpe.onrender.com';

        if (!valorImagen) {
            urlFinal = 'https://placehold.co/35';
        } else if (valorImagen.startsWith('http')) {
            urlFinal = valorImagen;
        } else {
            urlFinal = valorImagen.startsWith('/') ? `${dominio}${valorImagen}` : `${dominio}/${valorImagen}`;
        }

        // Estado (Badge)
        const statusClass = (obra.status === 'Inactivo') ? 'badge-inactive' : 'badge-active';

        // Crear Fila
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${obra.id_personalizado || obra.id}</td>
            <td>${obra.titulo}</td>
            <td>${obra.artista}</td>
            <td>${obra.certificado || 'N/A'}</td>
            <td>${obra.precio || '0'}$</td>
            <td><span class="${statusClass}">${obra.status || 'Activo'}</span></td>
            <td>
                <img src="${urlFinal}" 
                     style="width:35px; height:35px; border-radius:5px; object-fit:cover;" 
                     onerror="this.onerror=null; this.src='https://placehold.co/35'">
            </td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon-edit" onclick="window.prepararEdicion(${obra.id})" title="Editar">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-icon-delete" onclick="eliminarObra(${obra.id})" title="Eliminar">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(fila);
    });
}

// 2. Función Cargar Tabla (Actualizada)
async function cargarTablaObras() {
    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        const obras = await response.json();
        
        // Guardamos en variable global para el buscador
        window.obrasData = obras; 

        // Pintamos usando la nueva función
        renderizarTabla(obras);
    } catch (error) {
        console.error("Error cargando tabla:", error);
        const tbody = document.getElementById('tabla-obras-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="7">Error de conexión.</td></tr>';
    }
}

// 3. Activación del Buscador (Se ejecuta al iniciar)
document.addEventListener('DOMContentLoaded', () => {
    const inputBuscador = document.getElementById('buscador-obras');
    if (inputBuscador) {
        inputBuscador.addEventListener('input', (e) => {
            const texto = e.target.value.toLowerCase().trim();
            
            // Si no hay datos cargados aún, salir
            if (!window.obrasData) return;

            const filtrados = window.obrasData.filter(obra => {
                const titulo = (obra.titulo || '').toLowerCase();
                const artista = (obra.artista || '').toLowerCase();
                const idP = (obra.id_personalizado || '').toString().toLowerCase();
                
                // Busca coincidencias en Título, Artista o ID
                return titulo.includes(texto) || artista.includes(texto) || idP.includes(texto);
            });

            renderizarTabla(filtrados);
        });
    }
});

// Eliminar Obra
async function eliminarObra(id) {
    if (!confirm("¿Estás seguro de eliminar esta obra permanentemente?")) return;

    try {
        const response = await fetch(`https://backend-fundacion-atpe.onrender.com/obras/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("Obra eliminada.");
            cargarTablaObras(); // Refrescar tabla
            // Si estábamos editando esa obra, limpiamos el form
            if (typeof window.resetFormulario === 'function') window.resetFormulario();
        } else {
            alert("No se pudo eliminar.");
        }
    } catch (error) {
        alert("Error de conexión.");
    }
}

// Función para mostrar la vista previa en el slot correspondiente
function previewImage(event, index) {
    const reader = new FileReader();
    const file = event.target.files[0];
    const slot = document.getElementById(`slot-${index}`);
    const imgPreview = slot.querySelector('.preview-img');

    reader.onload = function() {
        imgPreview.src = reader.result;
        imgPreview.classList.remove('hidden');
        slot.classList.add('has-image'); // Oculta el icono de "+"
    }

    if (file) {
        reader.readAsDataURL(file);
    }
}

// Modifica tu función resetFormulario para limpiar también las imágenes
window.resetFormulario = function() {
    console.log("Iniciando limpieza del formulario...");
    
    // 1. Limpiar campos de texto y selección
    const form = document.getElementById('artwork-form');
    if(form) form.reset();
    
    // 2. Resetear el ID de edición
    editingId = null; 

    const fileInputReal = document.getElementById('dash-imagen');
    if(fileInputReal) fileInputReal.value = "";
    // 3. LIMPIEZA DE IMAGEN (Forzada)
    const slots = document.querySelectorAll('.image-slot');
    slots.forEach(slot => {
        // Quitamos la clase que oculta el icono "+"
        slot.classList.remove('has-image');
        
        // Buscamos la imagen y forzamos su ocultación y vaciado
        const img = slot.querySelector('img.preview-img');
        if(img) {
            img.src = ""; 
            img.classList.add('hidden'); // Oculta la imagen
        }

        // Aseguramos que el icono "+" vuelva a ser visible
        const icon = slot.querySelector('i');
        if(icon) icon.style.display = 'block';
        
    });

    // 4. Limpiar el texto de feedback de archivo
    const nameDisplay = document.getElementById('file-name-display');
    if(nameDisplay) nameDisplay.textContent = "";

    // 5. Volver botones a la normalidad (Estado "Guardar")
    const btnSave = document.getElementById('btn-save');
    const btnUpdate = document.getElementById('btn-update');
    
    if(btnSave) {
        btnSave.style.display = 'block'; 
        btnSave.classList.remove('hidden');
    }
    if(btnUpdate) {
        btnUpdate.style.display = 'none';
        btnUpdate.classList.add('hidden');
    }

    // 6. Quitar bordes rojos de validación si existen
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(i => i.style.border = "none");

    console.log("Limpieza completada con éxito.");
};

// Función para activar el input file correspondiente
function activarInput(slotIndex) {
    document.getElementById(`dash-imagen-${slotIndex}`).click();
}

// Función para mostrar vista previa en el slot correspondiente
function previewImage(event, slotIndex) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    const slot = document.getElementById(`slot-${slotIndex}`);
    const imgPreview = slot.querySelector('.preview-img');
    
    reader.onload = function(e) {
        imgPreview.src = e.target.result;
        imgPreview.classList.remove('hidden');
        slot.classList.add('has-image');
        
        // Mostrar nombres de archivos seleccionados
        actualizarNombresArchivos();
    };
    
    reader.readAsDataURL(file);
}

// Función para actualizar la lista de nombres de archivos
function actualizarNombresArchivos() {
    const display = document.getElementById('file-names-display');
    let archivos = [];
    
    for (let i = 0; i < 5; i++) {
        const input = document.getElementById(`dash-imagen-${i}`);
        if (input.files[0]) {
            archivos.push(input.files[0].name);
        }
    }
    
    if (archivos.length > 0) {
        display.textContent = `Archivos (${archivos.length}/5): ${archivos.join(', ')}`;
        display.style.color = "#2ecc71";
    } else {
        display.textContent = '';
    }
}

// Modificar la función resetFormulario para limpiar todos los slots
window.resetFormulario = function() {
    console.log("Iniciando limpieza del formulario...");
    
    // 1. Limpiar campos de texto y selección
    const form = document.getElementById('artwork-form');
    if(form) form.reset();
    
    // 2. Resetear el ID de edición
    editingId = null; 

    // 3. Limpiar todos los inputs de archivo y slots
    for (let i = 0; i < 5; i++) {
        const input = document.getElementById(`dash-imagen-${i}`);
        if (input) input.value = "";
        
        const slot = document.getElementById(`slot-${i}`);
        if (slot) {
            slot.classList.remove('has-image');
            const img = slot.querySelector('.preview-img');
            if (img) {
                img.src = "";
                img.classList.add('hidden');
            }
        }
    }

    // 4. Limpiar el texto de feedback de archivo
    const nameDisplay = document.getElementById('file-names-display');
    if(nameDisplay) nameDisplay.textContent = "";

    // 5. Volver botones a la normalidad
    const btnSave = document.getElementById('btn-save');
    const btnUpdate = document.getElementById('btn-update');
    
    if(btnSave) {
        btnSave.style.display = 'block'; 
        btnSave.classList.remove('hidden');
    }
    if(btnUpdate) {
        btnUpdate.style.display = 'none';
        btnUpdate.classList.add('hidden');
    }

    // 6. Quitar bordes rojos de validación
    if(form) {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(i => i.style.border = "none");
    }

    console.log("Limpieza completada con éxito.");
};