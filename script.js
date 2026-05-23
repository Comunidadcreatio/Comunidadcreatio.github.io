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

        // 2. Preparar UI (Guardando...)
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

        // 🔥 RECOPILACIÓN ORIGINAL CAMPO POR CAMPO (Sin cambios en tu lógica)
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
            console.error("Error al guardar obra:", error);
            alert("Error de conexión. Verifica que tu imagen no sea demasiado grande.");
        } finally {
            // 🔥 ESTO SIEMPRE SE EJECUTA: Restaura el botón a su estado original
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
                    <button class="btn-icon-duplicate" onclick="window.duplicarObra(${obra.id})" title="Duplicar">
                        <i class="fa-solid fa-copy"></i>
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

window.duplicarObra = function(id) {
    const obra = window.obrasData.find(o => o.id === id);
    if (!obra) return;

    // 1. Limpiar el formulario primero (para resetear estados)
    window.resetFormulario();

    // 2. Rellenar los campos con los datos de la obra original
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
    // Dejamos el ID vacío para que la base de datos genere uno nuevo
    document.getElementById('dash-id').value = '';
    document.getElementById('dash-procedencia').value = obra.procedencia || '';
    document.getElementById('dash-firma').value = obra.firma || '';
    document.getElementById('dash-soporte').value = obra.soporte || '';
    document.getElementById('dash-conservacion').value = obra.conservacion || '';
    document.getElementById('dash-etiquetas').value = obra.etiquetas || '';
    document.getElementById('dash-localizacion').value = obra.localizacion || '';

    // 3. Cambiar el estado de los botones a "Guardar"
    const btnSave = document.getElementById('btn-save');
    const btnUpdate = document.getElementById('btn-update');
    if (btnSave && btnUpdate) {
        btnSave.style.display = 'block';
        btnSave.classList.remove('hidden');
        btnUpdate.style.display = 'none';
        btnUpdate.classList.add('hidden');
    }

    // 4. Limpiar las imágenes precargadas (para que el usuario suba las suyas)
    for (let i = 0; i < 5; i++) {
        const slot = document.getElementById(`slot-${i}`);
        const input = document.getElementById(`dash-imagen-${i}`);
        if (input) input.value = "";
        if (slot) {
            slot.classList.remove('has-image');
            const img = slot.querySelector('.preview-img');
            if (img) {
                img.src = "";
                img.classList.add('hidden');
            }
        }
    }

    // 5. Scroll hacia arriba para ver el formulario
    const dash = document.getElementById('admin-dashboard');
    if (dash) dash.scrollTo({ top: 0, behavior: 'smooth' });
};

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

window.resetFormulario = function() {
    console.log("Iniciando limpieza del formulario...");
    
    // 1. Limpiar campos de texto y selección
    const form = document.getElementById('artwork-form');
    if(form) form.reset();
    
    // 2. Resetear el ID de edición
    window.editingId = null; 

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

    // 5. 🔥 RESTAURACIÓN COMPLETA DEL BOTÓN
    if (window.btnSave) {
        window.btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Obra';
        window.btnSave.disabled = false;
        window.btnSave.style.display = 'block'; 
        window.btnSave.classList.remove('hidden');
    }
    if (window.btnUpdate) {
        window.btnUpdate.style.display = 'none';
        window.btnUpdate.classList.add('hidden');
    }

    // 6. Quitar bordes rojos de validación
    if(form) {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(i => i.style.border = "none");
    }

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

window.resetFormulario = function() {
    console.log("Iniciando limpieza del formulario...");
    
    // 1. Limpiar campos de texto y selección
    const form = document.getElementById('artwork-form');
    if(form) form.reset();
    
    // 2. Resetear el ID de edición
    window.editingId = null; 

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

    // 5. RESTAURAR BOTONES A SU ESTADO NORMAL
    if (window.btnSave) {
        window.btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Obra';
        window.btnSave.disabled = false;
        window.btnSave.style.display = 'block'; 
        window.btnSave.classList.remove('hidden');
    }
    if (window.btnUpdate) {
        window.btnUpdate.style.display = 'none';
        window.btnUpdate.classList.add('hidden');
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

// Función para mostrar las obras en la galería (Versión Columnas Independientes)
function mostrarGaleria(obras) {
    const container = document.getElementById('galeria-container');
    const sinResultados = document.querySelector('.sin-resultados');
    
    if (!obras || obras.length === 0) {
        container.innerHTML = '';
        sinResultados.classList.remove('hidden');
        return;
    }
    
    sinResultados.classList.add('hidden');
    
    // 1. Agrupar las obras en 4 columnas
    const cols = [[], [], [], []];
    obras.forEach((obra, index) => {
        cols[index % 4].push(obra);
    });

    // 2. Generar el HTML de cada columna
    let html = '';
    for (let i = 0; i < 4; i++) {
        html += `<div class="galeria-col">`;
        for (const obra of cols[i]) {
            // --- Generar la tarjeta de la obra ---
            let imagenes = [];
            if (obra.todas_imagenes && Array.isArray(obra.todas_imagenes)) {
                imagenes = obra.todas_imagenes.filter(img => img && img.trim() !== '');
            }
            if (imagenes.length === 0 && obra.imagen_url) {
                imagenes = [obra.imagen_url];
            }
            if (imagenes.length === 0) {
                imagenes = ['https://placehold.co/400x400?text=Sin+Imagen'];
            }
            const imagenesCompletas = imagenes.map(imgUrl => 
                imgUrl.startsWith('http') ? imgUrl : `https://backend-fundacion-atpe.onrender.com${imgUrl}`
            );
            const mostrarControles = imagenesCompletas.length > 1;
            const indicadoresHTML = imagenesCompletas.map((_, i) => 
                `<span class="mini-indicator ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
            ).join('');
            const dimensiones = `${obra.ancho || 'S/N'} × ${obra.alto || 'S/N'}`;
            const tecnica = obra.descripcion_tecnica || 'Técnica no especificada';
            const precio = obra.precio ? `$${parseInt(obra.precio).toLocaleString()}` : 'Consultar';

            html += `
                <div class="obra-card" data-id="${obra.id}" data-precio="${obra.precio || 0}" data-tecnica="${obra.descripcion_tecnica || ''}">
                    <div class="obra-imagen">
                        <div class="mini-carousel">
                            <div class="mini-carousel-track" data-id="${obra.id}">
                                ${imagenesCompletas.map((url, i) => `
                                    <div class="mini-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
                                        <img src="${url}" alt="${obra.titulo}" 
                                             onerror="this.onerror=null; this.src='https://placehold.co/400x400?text=Error'">
                                    </div>
                                `).join('')}
                            </div>
                            ${mostrarControles ? `
                                <button class="mini-carousel-btn prev" onclick="cambiarImagenGaleria(this, -1)" aria-label="Anterior">
                                    <i class="fa-solid fa-chevron-left"></i>
                                </button>
                                <button class="mini-carousel-btn next" onclick="cambiarImagenGaleria(this, 1)" aria-label="Siguiente">
                                    <i class="fa-solid fa-chevron-right"></i>
                                </button>
                            ` : ''}
                            <div class="mini-indicators">
                                ${indicadoresHTML}
                            </div>
                            <span class="obra-badge">
                                ${obra.certificado === 'Si' ? 'Certificada ✓' : 'Original'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="obra-info">
                        <h3 class="obra-titulo">${obra.titulo}</h3>
                        <p class="obra-artista">${obra.artista}</p>
                        <div class="obra-detalles">
                            <div class="detalle-item"><span class="detalle-label">Dimensiones:</span><span class="detalle-valor">${dimensiones}</span></div>
                            <div class="detalle-item"><span class="detalle-label">Técnica:</span><span class="detalle-valor">${tecnica}</span></div>
                        </div>
                        <div class="obra-precio">
                            <div class="precio-monto">${precio}</div>
                            <div class="precio-etiqueta">${obra.estado_obra === 'Disponible' ? 'Disponible para venta' : obra.estado_obra || 'Consultar'}</div>
                        </div>
                        <button class="btn-ver-detalle" onclick="verDetalleObra(${obra.id})">
                                <span><i class="fa-solid fa-eye"></i> Ver detalles</span>
                        </button>
                    </div>
                </div>
            `;
        }
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

async function verDetalleObra(id) {
    if (!window.obrasData || window.obrasData.length === 0) {
        try {
            const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
            window.obrasData = await response.json();
        } catch (error) {
            alert("Error al cargar los detalles.");
            return;
        }
    }

    const obra = window.obrasData.find(o => o.id === id);
    if (!obra) return;

    const modal = document.getElementById('obra-modal');
    const modalBody = document.querySelector('.modal-body');

    // --- 1. Preparar todas las imágenes ---
    let imagenes = [];
    if (obra.todas_imagenes && Array.isArray(obra.todas_imagenes)) {
        imagenes = obra.todas_imagenes.filter(img => img && img.trim() !== '');
    }
    if (imagenes.length === 0 && obra.imagen_url) {
        imagenes = [obra.imagen_url];
    }
    if (imagenes.length === 0) {
        imagenes = ['https://placehold.co/600x400?text=Sin+Imagen'];
    }

    // --- 2. Generar HTML del Carrusel (sin miniaturas dentro) ---
    let carouselHTML = `
        <div class="image-carousel">
            <div class="carousel-container" id="carousel-container">
    `;
    
    imagenes.forEach((imgUrl) => {
        const urlFinal = imgUrl.startsWith('http') ? imgUrl : `https://backend-fundacion-atpe.onrender.com${imgUrl}`;
        carouselHTML += `
            <div class="carousel-slide">
                <img src="${urlFinal}" alt="Imagen de ${obra.titulo}" 
                     onerror="this.onerror=null; this.src='https://placehold.co/600x400?text=Imagen+no+disponible'">
            </div>
        `;
    });
    
    carouselHTML += `
            </div>
            <button class="carousel-btn prev" onclick="moverCarrusel(-1)"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="carousel-btn next" onclick="moverCarrusel(1)"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;

    // --- 3. HTML de las miniaturas (FUERA del carrusel) ---
    let thumbnailsHTML = `
        <div class="carousel-thumbnails" id="carousel-thumbnails">
            ${imagenes.map((imgUrl, i) => {
                const urlFinal = imgUrl.startsWith('http') ? imgUrl : `https://backend-fundacion-atpe.onrender.com${imgUrl}`;
                return `<img src="${urlFinal}" class="thumbnail-img ${i === 0 ? 'active' : ''}" onclick="irAImagen(${i})" onerror="this.src='https://placehold.co/80x80'">`;
            }).join('')}
        </div>
    `;

    // --- 4. Generar HTML de la información (ACTUALIZADO) ---
    const dimensiones = `${obra.ancho || 'S/N'} × ${obra.alto || 'S/N'}`;
    
    // --- Lógica para la localización con bandera ---
    let localizacionTexto = obra.localizacion || 'No especificada';
    let localizacionHTML = '';
    if (localizacionTexto.length === 2 && localizacionTexto !== 'No especificada') {
        const codigoPais = localizacionTexto.toLowerCase();
        localizacionHTML = `
            <div style="display: flex; align-items: center; gap: 5px; justify-content: flex-start;">
                <img src="https://flagcdn.com/16x12/${codigoPais}.png" alt="Bandera ${localizacionTexto}" style="border-radius: 2px; display: inline-block;">
                <span>${localizacionTexto.toUpperCase()}</span>
            </div>
        `;
    } else {
        localizacionHTML = localizacionTexto;
    }

    const infoHTML = `
        <h2 class="modal-titulo">${obra.titulo}</h2>
        <p class="modal-artista">${obra.artista} (${obra.ano || 'N/A'})</p>
        
        <div class="modal-descripcion">${obra.descripcion_artistica || 'Sin descripción disponible.'}</div>
        
        <div class="modal-detalles">
            <div class="modal-detalle"><span class="modal-detalle-label">Dimensiones</span><span class="modal-detalle-valor">${dimensiones}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Peso</span><span class="modal-detalle-valor">${obra.peso || 'S/N'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Técnica</span><span class="modal-detalle-valor">${obra.descripcion_tecnica || 'No especificada'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Soporte</span><span class="modal-detalle-valor">${obra.soporte || 'No especificado'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Enmarcado</span><span class="modal-detalle-valor">${obra.marcos || 'No especificado'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Firma</span><span class="modal-detalle-valor">${obra.firma || 'No especificada'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Estado</span><span class="modal-detalle-valor">${obra.estado_obra || 'N/A'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Certificado</span><span class="modal-detalle-valor">${obra.certificado === 'Si' ? 'Sí ✓' : 'No'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Procedencia</span><span class="modal-detalle-valor">${obra.procedencia || 'No especificada'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Conservación</span><span class="modal-detalle-valor">${obra.conservacion || 'No especificado'}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Localización</span><span class="modal-detalle-valor">${localizacionHTML}</span></div>
            <div class="modal-detalle"><span class="modal-detalle-label">Etiquetas</span><span class="modal-detalle-valor">${obra.etiquetas || 'Sin etiquetas'}</span></div>
        </div>
        
        <!-- NUEVO BLOQUE DE COMPRA -->
        <div class="modal-compra">
            <div class="modal-precio">
                <span class="precio-monto-modal">${obra.precio ? `$${parseInt(obra.precio).toLocaleString()}` : 'Consultar'}</span>
                <span class="precio-estado-modal">${obra.estado_obra === 'Disponible' ? 'Disponible' : obra.estado_obra || 'N/A'}</span>
            </div>
            ${obra.estado_obra === 'Disponible' ? 
                `<button class="btn-comprar" onclick="agregarAlCarrito(${id})"><i class="fa-solid fa-cart-plus"></i> Agregar al carrito</button>` : 
                `<button class="btn-comprar" style="background: #888; cursor: not-allowed;" disabled>No disponible</button>`
            }
        </div>
    `;

    // --- 5. Ensamblar todo en el modal ---
    modalBody.innerHTML = `
        <div class="modal-left-column">
            ${carouselHTML}
            ${thumbnailsHTML}
        </div>
        <div class="modal-info">
            ${infoHTML}
        </div>
    `;

    // Resetear carrusel
    window.currentSlide = 0;
    const container = document.getElementById('carousel-container');
    if (container) container.style.transform = 'translateX(0)';
    
    modal.classList.remove('hidden');
}

// --- ACTUALIZAR FUNCIONES DEL CARRUSEL ---
window.currentSlide = 0;

function moverCarrusel(direction) {
    const container = document.getElementById('carousel-container');
    if (!container) return;
    const slides = container.children;
    const totalSlides = slides.length;
    
    window.currentSlide = (window.currentSlide + direction + totalSlides) % totalSlides;
    container.style.transform = `translateX(-${window.currentSlide * 100}%)`;
    actualizarMiniaturas();
}

function irAImagen(index) {
    const container = document.getElementById('carousel-container');
    if (!container) return;
    
    window.currentSlide = index;
    container.style.transform = `translateX(-${index * 100}%)`;
    actualizarMiniaturas();
}

function actualizarMiniaturas() {
    const thumbnails = document.querySelectorAll('.thumbnail-img');
    thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === window.currentSlide);
    });
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



// Lista completa de países (código ISO 3166-1 alfa-2 y nombre en español)
const paises = [
    { code: 'AF', name: 'Afganistán' },
    { code: 'AL', name: 'Albania' },
    { code: 'DE', name: 'Alemania' },
    { code: 'AD', name: 'Andorra' },
    { code: 'AO', name: 'Angola' },
    { code: 'AG', name: 'Antigua y Barbuda' },
    { code: 'SA', name: 'Arabia Saudita' },
    { code: 'DZ', name: 'Argelia' },
    { code: 'AR', name: 'Argentina' },
    { code: 'AM', name: 'Armenia' },
    { code: 'AU', name: 'Australia' },
    { code: 'AT', name: 'Austria' },
    { code: 'AZ', name: 'Azerbaiyán' },
    { code: 'BS', name: 'Bahamas' },
    { code: 'BD', name: 'Bangladés' },
    { code: 'BB', name: 'Barbados' },
    { code: 'BH', name: 'Baréin' },
    { code: 'BE', name: 'Bélgica' },
    { code: 'BZ', name: 'Belice' },
    { code: 'BJ', name: 'Benín' },
    { code: 'BY', name: 'Bielorrusia' },
    { code: 'BO', name: 'Bolivia' },
    { code: 'BA', name: 'Bosnia y Herzegovina' },
    { code: 'BW', name: 'Botsuana' },
    { code: 'BR', name: 'Brasil' },
    { code: 'BN', name: 'Brunéi' },
    { code: 'BG', name: 'Bulgaria' },
    { code: 'BF', name: 'Burkina Faso' },
    { code: 'BI', name: 'Burundi' },
    { code: 'BT', name: 'Bután' },
    { code: 'CV', name: 'Cabo Verde' },
    { code: 'KH', name: 'Camboya' },
    { code: 'CM', name: 'Camerún' },
    { code: 'CA', name: 'Canadá' },
    { code: 'QA', name: 'Catar' },
    { code: 'TD', name: 'Chad' },
    { code: 'CL', name: 'Chile' },
    { code: 'CN', name: 'China' },
    { code: 'CY', name: 'Chipre' },
    { code: 'CO', name: 'Colombia' },
    { code: 'KM', name: 'Comoras' },
    { code: 'KP', name: 'Corea del Norte' },
    { code: 'KR', name: 'Corea del Sur' },
    { code: 'CI', name: 'Costa de Marfil' },
    { code: 'CR', name: 'Costa Rica' },
    { code: 'HR', name: 'Croacia' },
    { code: 'CU', name: 'Cuba' },
    { code: 'DK', name: 'Dinamarca' },
    { code: 'DM', name: 'Dominica' },
    { code: 'EC', name: 'Ecuador' },
    { code: 'EG', name: 'Egipto' },
    { code: 'SV', name: 'El Salvador' },
    { code: 'AE', name: 'Emiratos Árabes Unidos' },
    { code: 'ER', name: 'Eritrea' },
    { code: 'SK', name: 'Eslovaquia' },
    { code: 'SI', name: 'Eslovenia' },
    { code: 'ES', name: 'España' },
    { code: 'US', name: 'Estados Unidos' },
    { code: 'EE', name: 'Estonia' },
    { code: 'ET', name: 'Etiopía' },
    { code: 'PH', name: 'Filipinas' },
    { code: 'FI', name: 'Finlandia' },
    { code: 'FJ', name: 'Fiyi' },
    { code: 'FR', name: 'Francia' },
    { code: 'GA', name: 'Gabón' },
    { code: 'GM', name: 'Gambia' },
    { code: 'GE', name: 'Georgia' },
    { code: 'GH', name: 'Ghana' },
    { code: 'GD', name: 'Granada' },
    { code: 'GR', name: 'Grecia' },
    { code: 'GT', name: 'Guatemala' },
    { code: 'GN', name: 'Guinea' },
    { code: 'GQ', name: 'Guinea Ecuatorial' },
    { code: 'GW', name: 'Guinea-Bisáu' },
    { code: 'GY', name: 'Guyana' },
    { code: 'HT', name: 'Haití' },
    { code: 'HN', name: 'Honduras' },
    { code: 'HU', name: 'Hungría' },
    { code: 'IN', name: 'India' },
    { code: 'ID', name: 'Indonesia' },
    { code: 'IQ', name: 'Irak' },
    { code: 'IR', name: 'Irán' },
    { code: 'IE', name: 'Irlanda' },
    { code: 'IS', name: 'Islandia' },
    { code: 'IL', name: 'Israel' },
    { code: 'IT', name: 'Italia' },
    { code: 'JM', name: 'Jamaica' },
    { code: 'JP', name: 'Japón' },
    { code: 'JO', name: 'Jordania' },
    { code: 'KZ', name: 'Kazajistán' },
    { code: 'KE', name: 'Kenia' },
    { code: 'KG', name: 'Kirguistán' },
    { code: 'KI', name: 'Kiribati' },
    { code: 'KW', name: 'Kuwait' },
    { code: 'LA', name: 'Laos' },
    { code: 'LS', name: 'Lesoto' },
    { code: 'LV', name: 'Letonia' },
    { code: 'LB', name: 'Líbano' },
    { code: 'LR', name: 'Liberia' },
    { code: 'LY', name: 'Libia' },
    { code: 'LI', name: 'Liechtenstein' },
    { code: 'LT', name: 'Lituania' },
    { code: 'LU', name: 'Luxemburgo' },
    { code: 'MK', name: 'Macedonia del Norte' },
    { code: 'MG', name: 'Madagascar' },
    { code: 'MY', name: 'Malasia' },
    { code: 'MW', name: 'Malaui' },
    { code: 'MV', name: 'Maldivas' },
    { code: 'ML', name: 'Malí' },
    { code: 'MT', name: 'Malta' },
    { code: 'MA', name: 'Marruecos' },
    { code: 'MU', name: 'Mauricio' },
    { code: 'MR', name: 'Mauritania' },
    { code: 'MX', name: 'México' },
    { code: 'FM', name: 'Micronesia' },
    { code: 'MD', name: 'Moldavia' },
    { code: 'MC', name: 'Mónaco' },
    { code: 'MN', name: 'Mongolia' },
    { code: 'ME', name: 'Montenegro' },
    { code: 'MZ', name: 'Mozambique' },
    { code: 'MM', name: 'Birmania (Myanmar)' },
    { code: 'NA', name: 'Namibia' },
    { code: 'NR', name: 'Nauru' },
    { code: 'NP', name: 'Nepal' },
    { code: 'NI', name: 'Nicaragua' },
    { code: 'NE', name: 'Níger' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'NO', name: 'Noruega' },
    { code: 'NZ', name: 'Nueva Zelanda' },
    { code: 'OM', name: 'Omán' },
    { code: 'NL', name: 'Países Bajos' },
    { code: 'PK', name: 'Pakistán' },
    { code: 'PW', name: 'Palaos' },
    { code: 'PA', name: 'Panamá' },
    { code: 'PG', name: 'Papúa Nueva Guinea' },
    { code: 'PY', name: 'Paraguay' },
    { code: 'PE', name: 'Perú' },
    { code: 'PL', name: 'Polonia' },
    { code: 'PT', name: 'Portugal' },
    { code: 'GB', name: 'Reino Unido' },
    { code: 'CF', name: 'República Centroafricana' },
    { code: 'CZ', name: 'República Checa' },
    { code: 'CG', name: 'República del Congo' },
    { code: 'CD', name: 'República Democrática del Congo' },
    { code: 'DO', name: 'República Dominicana' },
    { code: 'RW', name: 'Ruanda' },
    { code: 'RO', name: 'Rumania' },
    { code: 'RU', name: 'Rusia' },
    { code: 'WS', name: 'Samoa' },
    { code: 'LC', name: 'Santa Lucía' },
    { code: 'VC', name: 'San Vicente y las Granadinas' },
    { code: 'KN', name: 'San Cristóbal y Nieves' },
    { code: 'SM', name: 'San Marino' },
    { code: 'ST', name: 'Santo Tomé y Príncipe' },
    { code: 'SN', name: 'Senegal' },
    { code: 'RS', name: 'Serbia' },
    { code: 'SC', name: 'Seychelles' },
    { code: 'SL', name: 'Sierra Leona' },
    { code: 'SG', name: 'Singapur' },
    { code: 'SY', name: 'Siria' },
    { code: 'SO', name: 'Somalia' },
    { code: 'LK', name: 'Sri Lanka' },
    { code: 'SZ', name: 'Suazilandia (Eswatini)' },
    { code: 'ZA', name: 'Sudáfrica' },
    { code: 'SD', name: 'Sudán' },
    { code: 'SS', name: 'Sudán del Sur' },
    { code: 'SE', name: 'Suecia' },
    { code: 'CH', name: 'Suiza' },
    { code: 'SR', name: 'Surinam' },
    { code: 'TH', name: 'Tailandia' },
    { code: 'TZ', name: 'Tanzania' },
    { code: 'TJ', name: 'Tayikistán' },
    { code: 'TL', name: 'Timor Oriental' },
    { code: 'TG', name: 'Togo' },
    { code: 'TO', name: 'Tonga' },
    { code: 'TT', name: 'Trinidad y Tobago' },
    { code: 'TN', name: 'Túnez' },
    { code: 'TM', name: 'Turkmenistán' },
    { code: 'TR', name: 'Turquía' },
    { code: 'TV', name: 'Tuvalu' },
    { code: 'UA', name: 'Ucrania' },
    { code: 'UG', name: 'Uganda' },
    { code: 'UY', name: 'Uruguay' },
    { code: 'UZ', name: 'Uzbekistán' },
    { code: 'VU', name: 'Vanuatu' },
    { code: 'VE', name: 'Venezuela' },
    { code: 'VN', name: 'Vietnam' },
    { code: 'YE', name: 'Yemen' },
    { code: 'DJ', name: 'Yibuti' },
    { code: 'ZM', name: 'Zambia' },
    { code: 'ZW', name: 'Zimbabue' }
];

// Función que llena el select con los países
function llenarListaPaises() {
    const select = document.getElementById('dash-localizacion');
    if (!select) return;

    // Limpiar opciones previas (excepto la primera "Selecciona un País")
    while (select.options.length > 1) {
        select.remove(1);
    }

    // Agregar cada país
    paises.forEach(pais => {
        const option = document.createElement('option');
        option.value = pais.code;      // código de país, tal cual estaba en tu HTML original
        option.textContent = pais.name;
        select.appendChild(option);
    });
}

// Ejecutar cuando el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', llenarListaPaises);

// Función para navegar entre imágenes dentro de la galería
function cambiarImagenGaleria(btn, direction) {
    // Encontrar el contenedor del carrusel padre
    const carousel = btn.closest('.mini-carousel');
    if (!carousel) return;
    
    // Encontrar el track (la pista de imágenes)
    const track = carousel.querySelector('.mini-carousel-track');
    if (!track) return;
    
    // Encontrar todos los slides
    const slides = track.querySelectorAll('.mini-slide');
    if (slides.length <= 1) return;
    
    // Encontrar el slide actualmente activo
    let currentIndex = 0;
    slides.forEach((slide, index) => {
        if (slide.classList.contains('active')) {
            currentIndex = index;
        }
    });
    
    // Calcular el nuevo índice
    let newIndex = (currentIndex + direction + slides.length) % slides.length;
    
    // Actualizar clases de los slides
    slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === newIndex);
    });
    
    // Actualizar los indicadores (puntos)
    const indicators = carousel.querySelectorAll('.mini-indicator');
    indicators.forEach((ind, index) => {
        ind.classList.toggle('active', index === newIndex);
    });
}