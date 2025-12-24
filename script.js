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
    link.addEventListener('click', function(e) {
        e.preventDefault();
        
        const linkText = this.textContent.trim().toLowerCase();
        
        // Manejo de la galería
        if (linkText === 'galería' || linkText === 'galeria') {
            // Mostrar galería, ocultar main
            document.querySelector('.main-content').classList.add('hidden');
            document.getElementById('galeria').classList.remove('hidden');
            
            // Cargar galería si es necesario
            cargarGaleria();
            
            // Mostrar carrito si está oculto
            if (cartContainer) {
                cartContainer.classList.remove('hidden');
                cartContainer.classList.add('show-anim');
            }
        } else if (linkText === 'inicio') {
            // Mostrar main, ocultar galería
            document.querySelector('.main-content').classList.remove('hidden');
            document.getElementById('galeria').classList.add('hidden');
            
            // Ocultar carrito en inicio
            if (cartContainer) {
                cartContainer.classList.add('hidden');
            }
        }
        
        // Manejo de clases activas
        navLinks.forEach(el => el.classList.remove('active'));
        this.classList.add('active');
        
        // Cerrar menú móvil
        if(navMenu) navMenu.classList.remove('active');
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

// --- GALERÍA DE OBRAS ---

// Función para cargar la galería desde el backend
async function cargarGaleria() {
    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        const obras = await response.json();
        
        // Filtrar solo obras activas
        const obrasActivas = obras.filter(obra => 
            obra.status === 'Activo' && obra.imagen_url
        );
        
        mostrarGaleria(obrasActivas);
    } catch (error) {
        console.error("Error cargando galería:", error);
        document.getElementById('galeria-container').innerHTML = 
            '<div class="error">Error al cargar la galería. Intenta nuevamente.</div>';
    }
}

// Función para mostrar las obras en la galería
function mostrarGaleria(obras) {
    const container = document.getElementById('galeria-container');
    const sinResultados = document.querySelector('.sin-resultados');
    
    if (!obras || obras.length === 0) {
        container.innerHTML = '';
        sinResultados.classList.remove('hidden');
        return;
    }
    
    sinResultados.classList.add('hidden');
    
    container.innerHTML = obras.map(obra => {
        // Formatear dimensiones
        const dimensiones = `${obra.ancho || 'S/N'} × ${obra.alto || 'S/N'}`;
        
        // Formatear técnica
        const tecnica = obra.descripcion_tecnica || 'Técnica no especificada';
        
        // Formatear precio
        const precio = obra.precio ? `$${parseInt(obra.precio).toLocaleString()}` : 'Consultar';
        
        return `
            <div class="obra-card" data-id="${obra.id}" data-precio="${obra.precio || 0}" data-tecnica="${obra.descripcion_tecnica || ''}">
                <div class="obra-imagen">
                    <img src="${obra.imagen_url}" 
                         alt="${obra.titulo}" 
                         onerror="this.onerror=null; this.src='https://placehold.co/400x250?text=Imagen+no+disponible'">
                    <span class="obra-badge">${obra.certificado === 'Si' ? 'Certificada ✓' : 'Original'}</span>
                </div>
                <div class="obra-info">
                    <h3 class="obra-titulo">${obra.titulo}</h3>
                    <p class="obra-artista">${obra.artista}</p>
                    
                    <div class="obra-detalles">
                        <div class="detalle-item">
                            <span class="detalle-label">Dimensiones:</span>
                            <span class="detalle-valor">${dimensiones}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Peso:</span>
                            <span class="detalle-valor">${obra.peso || 'S/N'}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Año:</span>
                            <span class="detalle-valor">${obra.ano || 'N/A'}</span>
                        </div>
                        <div class="detalle-item">
                            <span class="detalle-label">Técnica:</span>
                            <span class="detalle-valor">${tecnica}</span>
                        </div>
                    </div>
                    
                    <div class="obra-precio">
                        <div class="precio-monto">${precio}</div>
                        <div class="precio-etiqueta">${obra.estado_obra === 'Disponible' ? 'Disponible para venta' : obra.estado_obra || 'Consultar'}</div>
                    </div>
                    
                    <button class="btn-ver-detalle" onclick="verDetalleObra(${obra.id})">
                        <i class="fa-solid fa-eye"></i> Ver detalles
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Función para ver detalles de una obra (modal)
async function verDetalleObra(id) {
    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        const obras = await response.json();
        const obra = obras.find(o => o.id === id);
        
        if (!obra) return;
        
        const modal = document.getElementById('obra-modal');
        const modalBody = document.querySelector('.modal-body');
        
        // Formatear todos los detalles
        const dimensiones = `${obra.ancho || 'S/N'} × ${obra.alto || 'S/N'}`;
        const tecnica = obra.descripcion_tecnica || 'No especificada';
        const descripcion = obra.descripcion_artistica || 'Sin descripción disponible.';
        const precio = obra.precio ? `$${parseInt(obra.precio).toLocaleString()}` : 'Consultar';
        
        modalBody.innerHTML = `
            <div class="modal-imagen">
                <img src="${obra.imagen_url}" 
                     alt="${obra.titulo}"
                     onerror="this.onerror=null; this.src='https://placehold.co/600x400?text=Imagen+no+disponible'">
            </div>
            <div class="modal-info">
                <h2 class="modal-titulo">${obra.titulo}</h2>
                <p class="modal-artista">${obra.artista}</p>
                
                <div class="modal-descripcion">
                    <p>${descripcion}</p>
                </div>
                
                <div class="modal-detalles">
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Dimensiones</div>
                        <div class="modal-detalle-valor">${dimensiones}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Peso</div>
                        <div class="modal-detalle-valor">${obra.peso || 'S/N'}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Año</div>
                        <div class="modal-detalle-valor">${obra.ano || 'N/A'}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Técnica</div>
                        <div class="modal-detalle-valor">${tecnica}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Estado</div>
                        <div class="modal-detalle-valor">${obra.estado_obra || 'N/A'}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Certificado</div>
                        <div class="modal-detalle-valor">${obra.certificado === 'Si' ? 'Sí ✓' : 'No'}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Procedencia</div>
                        <div class="modal-detalle-valor">${obra.procedencia || 'No especificada'}</div>
                    </div>
                    <div class="modal-detalle">
                        <div class="modal-detalle-label">Estado Conservación</div>
                        <div class="modal-detalle-valor">${obra.conservacion || 'No especificado'}</div>
                    </div>
                </div>
                
                <div class="modal-precio" style="background: linear-gradient(135deg, var(--accent-gold), #e5cf7d); padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 700; color: var(--bg-dark);">${precio}</div>
                    <div style="font-size: 0.9rem; opacity: 0.9;">${obra.estado_obra === 'Disponible' ? 'Disponible para compra' : obra.estado_obra || 'Consultar disponibilidad'}</div>
                </div>
                
                ${obra.estado_obra === 'Disponible' ? 
                    `<button class="btn-ver-detalle" style="background: #2ecc71; margin-top: 20px;" onclick="agregarAlCarrito(${id})">
                        <i class="fa-solid fa-cart-plus"></i> Agregar al carrito
                    </button>` : 
                    ''
                }
            </div>
        `;
        
        modal.classList.remove('hidden');
    } catch (error) {
        console.error("Error cargando detalles:", error);
        alert("Error al cargar los detalles de la obra.");
    }
}

// Función para agregar al carrito (puedes expandir esto después)
function agregarAlCarrito(id) {
    const cartBadge = document.querySelector('.cart-badge');
    let count = parseInt(cartBadge.textContent) || 0;
    cartBadge.textContent = count + 1;
    
    // Aquí puedes agregar lógica para guardar en localStorage o enviar al backend
    alert("Obra agregada al carrito");
}

// Función para filtrar obras
function filtrarGaleria() {
    const tecnica = document.getElementById('filtro-tecnica').value;
    const precioFiltro = document.getElementById('filtro-precio').value;
    const obras = document.querySelectorAll('.obra-card');
    
    obras.forEach(obra => {
        const obraTecnica = obra.dataset.tecnica;
        const obraPrecio = parseInt(obra.dataset.precio) || 0;
        
        let mostrar = true;
        
        // Filtrar por técnica
        if (tecnica && !obraTecnica.includes(tecnica)) {
            mostrar = false;
        }
        
        // Filtrar por precio
        if (precioFiltro) {
            switch(precioFiltro) {
                case '0-500':
                    if (obraPrecio > 500) mostrar = false;
                    break;
                case '501-1000':
                    if (obraPrecio < 501 || obraPrecio > 1000) mostrar = false;
                    break;
                case '1001-2000':
                    if (obraPrecio < 1001 || obraPrecio > 2000) mostrar = false;
                    break;
                case '2001+':
                    if (obraPrecio < 2001) mostrar = false;
                    break;
            }
        }
        
        obra.style.display = mostrar ? 'block' : 'none';
    });
    
    // Mostrar mensaje si no hay resultados
    const obrasVisibles = [...obras].filter(o => o.style.display !== 'none');
    const sinResultados = document.querySelector('.sin-resultados');
    
    if (obrasVisibles.length === 0) {
        sinResultados.classList.remove('hidden');
    } else {
        sinResultados.classList.add('hidden');
    }
}

// Inicializar galería cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    // ... tu código existente ...
    
    // Agregar evento al botón de galería en el menú
    const btnGaleria = document.getElementById('btn-galeria');
    if (btnGaleria) {
        btnGaleria.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Mostrar galería y ocultar main content
            document.querySelector('.main-content').classList.add('hidden');
            document.getElementById('galeria').classList.remove('hidden');
            
            // Cargar galería si no está cargada
            const container = document.getElementById('galeria-container');
            if (container.innerHTML.includes('loading')) {
                cargarGaleria();
            }
            
            // Scroll suave a la galería
            window.scrollTo({ top: 110, behavior: 'smooth' });
        });
    }
    
    // Eventos para filtros
    document.getElementById('filtro-tecnica')?.addEventListener('change', filtrarGaleria);
    document.getElementById('filtro-precio')?.addEventListener('change', filtrarGaleria);
    
    // Evento para cerrar modal
    document.querySelector('.close-modal')?.addEventListener('click', () => {
        document.getElementById('obra-modal').classList.add('hidden');
    });
    
    // Cerrar modal al hacer clic fuera
    document.getElementById('obra-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('obra-modal')) {
            document.getElementById('obra-modal').classList.add('hidden');
        }
    });
});