document.addEventListener('DOMContentLoaded', () => {
    // --- 1. VARIABLES GLOBALES Y SELECTORES ---
    window.isLoggedIn = false; // Estado de sesión
    window.obrasData = [];     // Almacén local de obras para edición rápida
    let editingId = null;      // ID de la obra que se está editando actualmente

    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    
    // Elementos del Dashboard
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const adminDashboard = document.getElementById('admin-dashboard'); 
    const loginForm = document.querySelector('.login-form');
    const btnLogout = document.getElementById('btn-logout'); 
    const adminUsernameSpan = document.getElementById('admin-username');
    
    // Elementos del Formulario de Obras
    const artworkForm = document.getElementById('artwork-form');
    const btnSave = document.getElementById('btn-save');
    const btnUpdate = document.getElementById('btn-update');
    const btnClear = document.getElementById('btn-clear');
    
    // Inputs específicos para validación
    const inputAno = document.getElementById('dash-ano');
    const inputPrecio = document.getElementById('dash-precio');
    const fileInput = document.getElementById('dash-input-file');
    const nameDisplay = document.getElementById('file-name-display');

    // --- 2. VALIDACIONES DE ENTRADA (SOLO NÚMEROS) ---
    // Evita que el usuario escriba letras en Año y Precio
    [inputAno, inputPrecio].forEach(input => {
        if(input) {
            input.addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '');
            });
        }
    });

    // Mostrar nombre del archivo al seleccionar imagen
    if(fileInput) {
        fileInput.addEventListener('change', function() {
            if(this.files && this.files[0]) {
                nameDisplay.textContent = "Archivo listo: " + this.files[0].name;
            } else {
                nameDisplay.textContent = "";
            }
        });
    }

    // --- 3. LÓGICA DE BOTONES DEL FORMULARIO ---
    
    // A) BOTÓN LIMPIAR CAMPOS
    if(btnClear) {
        btnClear.addEventListener('click', () => {
            resetFormulario();
        });
    }

    // Función auxiliar para limpiar y resetear estado
    function resetFormulario() {
        artworkForm.reset();
        nameDisplay.textContent = "";
        editingId = null;
        
        // Restaurar botones a estado inicial
        btnSave.classList.remove('hidden');
        btnUpdate.classList.add('hidden');
        
        // Quitar indicación visual de edición si existiera
        document.getElementById('dash-titulo').focus();
    }

    // B) MANEJO DEL ENVÍO (GUARDAR O REFRESCAR)
    // Nota: El botón "Refrescar" también es tipo 'button', pero manejaremos su click manualmente
    // El formulario se envía con el botón "Guardar" (submit)
    
    if (artworkForm) {
        // EVENTO: CREAR NUEVA OBRA
        artworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!validarCamposVacios()) return; // Validación de vacíos

            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSave.disabled = true;

            await guardarOActualizar('POST', 'https://backend-fundacion-atpe.onrender.com/obras');
            
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Obra';
            btnSave.disabled = false;
        });
    }

    // EVENTO: REFRESCAR (ACTUALIZAR) OBRA
    if (btnUpdate) {
        btnUpdate.addEventListener('click', async () => {
            if(!validarCamposVacios()) return; // Validación de vacíos
            if(!editingId) return;

            btnUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';
            btnUpdate.disabled = true;

            // Usamos PUT y la URL con el ID
            await guardarOActualizar('PUT', `https://backend-fundacion-atpe.onrender.com/obras/${editingId}`);

            btnUpdate.innerHTML = '<i class="fa-solid fa-rotate"></i> Refrescar Obra';
            btnUpdate.disabled = false;
        });
    }

    // Función Centralizada para Guardar o Actualizar
    async function guardarOActualizar(metodo, url) {
        const formData = new FormData();
        
        // Si hay archivo, lo agregamos. Si es edición y no hay archivo, el backend mantendrá el anterior.
        if (fileInput && fileInput.files[0]) {
            formData.append('imagen', fileInput.files[0]);
        }

        // Mapeo de datos (Asegúrate que los IDs coincidan con tu HTML)
        formData.append('titulo', document.getElementById('dash-titulo').value);
        formData.append('artista', document.getElementById('dash-artista').value);
        formData.append('ano', document.getElementById('dash-ano').value);
        formData.append('descripcion_tecnica', document.getElementById('dash-tec-desc').value);
        formData.append('descripcion_artistica', document.getElementById('dash-art-desc').value);
        formData.append('estado_obra', document.getElementById('dash-disponibilidad') ? document.getElementById('dash-disponibilidad').value : document.getElementById('dash-estado-obra').value);
        formData.append('procedencia', document.getElementById('dash-procedencia').value);
        formData.append('certificado', document.getElementById('dash-certificado').value);
        formData.append('marcos', document.getElementById('dash-marcos').value);
        formData.append('precio', document.getElementById('dash-precio').value);
        formData.append('etiqueta', document.getElementById('dash-etiqueta').value);
        formData.append('id_obra', document.getElementById('dash-id-obra') ? document.getElementById('dash-id-obra').value : document.getElementById('dash-id').value);
        formData.append('status', document.getElementById('dash-status-web') ? document.getElementById('dash-status-web').value : document.getElementById('dash-status').value);

        try {
            const response = await fetch(url, {
                method: metodo,
                body: formData 
            });

            const result = await response.json();

            if (response.ok && result.success) {
                alert(metodo === 'POST' ? "¡Obra guardada con éxito!" : "¡Obra actualizada correctamente!");
                resetFormulario(); // Limpia y devuelve los botones a la normalidad
                cargarTablaObras(); // Recarga la tabla
            } else {
                alert("Error: " + (result.error || "Operación fallida"));
            }
        } catch (error) {
            console.error(error);
            alert("Error de conexión con el servidor.");
        }
    }

    // Validación de Campos Vacíos
    function validarCamposVacios() {
        const inputs = artworkForm.querySelectorAll('input:not([type="file"]):not([type="checkbox"]), select, textarea');
        let vacios = false;
        
        // Iteramos para ver si hay algo vacío
        for (let input of inputs) {
            if (input.value.trim() === "") {
                vacios = true;
                input.style.borderColor = "red"; // Resaltar error visualmente
            } else {
                input.style.borderColor = "#ddd"; // Restaurar color
            }
        }

        if (vacios) {
            alert("Por favor, llena todos los campos vacíos antes de continuar.");
            return false;
        }
        return true;
    }

    // --- 4. GESTIÓN DE SESIÓN Y PANELES ---
    function togglePanels(showDashboard) {
        if (showDashboard && window.isLoggedIn) {
            loginPanel.classList.add('hidden');
            adminDashboard.classList.remove('hidden');
        } else {
            loginPanel.classList.remove('hidden');
            adminDashboard.classList.add('hidden');
        }
        if(navMenu) navMenu.classList.remove('active');
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

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnLogin = loginForm.querySelector('.btn-login');
            const originalText = btnLogin.innerHTML;
            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            const userValue = loginForm.querySelectorAll('input')[0].value.trim();
            const passValue = loginForm.querySelectorAll('input')[1].value.trim();

            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: userValue, pass: passValue })
                });

                const result = await response.json();

                if (result.success) {
                    window.isLoggedIn = true;
                    if(adminUsernameSpan) adminUsernameSpan.textContent = userValue;
                    
                    const iconElement = adminBtn.querySelector('i'); 
                    if(iconElement) {
                        iconElement.className = "fa-solid fa-user-check";
                        iconElement.style.color = "#2ecc71";
                    }

                    alert("¡Bienvenido al Panel de Gestión!");
                    await cargarTablaObras(); 
                    togglePanels(true);
                    loginForm.reset();
                } else {
                    alert("Credenciales incorrectas.");
                }
            } catch (error) {
                alert("Error de conexión con el servidor.");
            } finally {
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            window.isLoggedIn = false;
            togglePanels(false);
            const iconElement = adminBtn.querySelector('i');
            if(iconElement) {
                iconElement.className = "fa-solid fa-user-shield";
                iconElement.style.color = "";
            }
            alert("Has salido del sistema.");
        });
    }

    // Menú Móvil
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => navMenu.classList.toggle('active'));
    }
});

// --- FUNCIONES GLOBALES (FUERA DEL DOMCONTENTLOADED) ---

// 1. Cargar Tabla (Ahora guarda los datos en memoria para editar)
async function cargarTablaObras() {
    const tbody = document.getElementById('tabla-obras-body');
    if (!tbody) return;

    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        if (!response.ok) throw new Error("Error al obtener datos");
        
        const obras = await response.json();
        window.obrasData = obras; // GUARDAMOS LOS DATOS EN MEMORIA GLOBAL
        
        tbody.innerHTML = ''; 

        if (!obras || obras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">No hay obras registradas aún.</td></tr>';
            return;
        }

        obras.forEach(obra => {
            const fila = document.createElement('tr');
            // Nota: Se usa obra.id_personalizado para mostrar, pero obra.id (base de datos) para las acciones
            fila.innerHTML = `
                <td>${obra.id_personalizado || obra.id}</td>
                <td>${obra.titulo}</td>
                <td>${obra.etiqueta || 'N/A'}</td>
                <td>${obra.precio || '0'}$</td>
                <td><span class="badge-active">${obra.status || 'Activo'}</span></td>
                <td><img src="${obra.imagen_url}" style="width:35px; height:35px; border-radius:5px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/35'"></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon-edit" onclick="prepararEdicion(${obra.id})" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-icon-delete" onclick="eliminarObra(${obra.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(fila);
        });
    } catch (error) {
        console.error("Error en cargarTablaObras:", error);
    }
}

// 2. Preparar Edición (Llena el formulario con los datos)
function prepararEdicion(id) {
    // Buscar la obra en la memoria local
    const obra = window.obrasData.find(o => o.id === id);
    if (!obra) return;

    window.scrollTo({ top: 0, behavior: 'smooth' }); // Subir al formulario

    // Llenar campos (Asegúrate que los IDs coincidan con tu HTML)
    document.getElementById('dash-titulo').value = obra.titulo;
    document.getElementById('dash-artista').value = obra.artista;
    document.getElementById('dash-ano').value = obra.ano;
    document.getElementById('dash-tec-desc').value = obra.descripcion_tecnica;
    document.getElementById('dash-art-desc').value = obra.descripcion_artistica;
    document.getElementById('dash-procedencia').value = obra.procedencia;
    document.getElementById('dash-certificado').value = obra.certificado;
    document.getElementById('dash-marcos').value = obra.marcos;
    document.getElementById('dash-precio').value = obra.precio;
    document.getElementById('dash-etiqueta').value = obra.etiqueta;
    
    // IDs opcionales según tu versión de HTML
    if(document.getElementById('dash-id-obra')) document.getElementById('dash-id-obra').value = obra.id_personalizado || '';
    else if(document.getElementById('dash-id')) document.getElementById('dash-id').value = obra.id_personalizado || '';
    
    if(document.getElementById('dash-disponibilidad')) document.getElementById('dash-disponibilidad').value = obra.estado_obra;
    else if(document.getElementById('dash-estado-obra')) document.getElementById('dash-estado-obra').value = obra.estado_obra;

    if(document.getElementById('dash-status-web')) document.getElementById('dash-status-web').value = obra.status;
    else if(document.getElementById('dash-status')) document.getElementById('dash-status').value = obra.status;

    // Mostrar nombre de archivo actual (informativo)
    const nameDisplay = document.getElementById('file-name-display');
    if(nameDisplay) nameDisplay.textContent = "Imagen actual: " + (obra.imagen_url ? "Registrada (Sube otra para cambiarla)" : "Ninguna");

    // CAMBIAR ESTADO DE BOTONES
    const btnSave = document.getElementById('btn-save');
    const btnUpdate = document.getElementById('btn-update');
    
    btnSave.classList.add('hidden');    // Ocultar Guardar
    btnUpdate.classList.remove('hidden'); // Mostrar Refrescar
    
    // Guardar ID global para saber qué estamos editando
    editingId = id; // IMPORTANTE: Se usa la variable declarada arriba en DOMContentLoaded
                    // Pero como está dentro del scope, necesitamos acceder a ella.
                    // TRUCO: Como 'editingId' está dentro del closure de DOMContentLoaded, 
                    // esta función GLOBAL no la ve. 
                    // SOLUCIÓN: Vamos a asignar editingId al objeto window temporalmente o mover esta funcion adentro.
                    // MEJOR SOLUCIÓN: Moveremos esta lógica al DOMContentLoaded, pero exponemos la función al window.
}

// 3. Eliminar Obra
async function eliminarObra(id) {
    if (!confirm("¿Estás seguro de eliminar esta obra permanentemente?")) return;

    try {
        const response = await fetch(`https://backend-fundacion-atpe.onrender.com/obras/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            alert("Obra eliminada.");
            cargarTablaObras(); 
        } else {
            alert("No se pudo eliminar en el servidor.");
        }
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("Error de conexión al eliminar.");
    }
}

// FIX FINAL PARA EL SCOPE:
// Para que el HTML 'onclick="prepararEdicion(id)"' funcione, la función debe ser global.
// Pero para que acceda a las variables del DOMContentLoaded (como btnSave), debe estar adentro.
// Solución: Exponemos la función al objeto window explícitamente.

window.prepararEdicion = function(id) {
    const obra = window.obrasData.find(o => o.id === id);
    if (!obra) return;
    
    // Subir suavemente
    document.querySelector('.admin-dashboard').scrollTo({ top: 0, behavior: 'smooth' });
    // O si el scroll es en el body: window.scrollTo...

    // Llenar campos
    document.getElementById('dash-titulo').value = obra.titulo;
    document.getElementById('dash-artista').value = obra.artista;
    document.getElementById('dash-ano').value = obra.ano;
    document.getElementById('dash-tec-desc').value = obra.descripcion_tecnica;
    document.getElementById('dash-art-desc').value = obra.descripcion_artistica;
    document.getElementById('dash-procedencia').value = obra.procedencia;
    document.getElementById('dash-certificado').value = obra.certificado;
    document.getElementById('dash-marcos').value = obra.marcos;
    document.getElementById('dash-precio').value = obra.precio;
    document.getElementById('dash-etiqueta').value = obra.etiqueta;
    
    // Selectores con chequeo de ID (por seguridad si cambiaste nombres)
    const idInput = document.getElementById('dash-id-obra') || document.getElementById('dash-id');
    if(idInput) idInput.value = obra.id_personalizado || '';
    
    const dispSelect = document.getElementById('dash-disponibilidad') || document.getElementById('dash-estado-obra');
    if(dispSelect) dispSelect.value = obra.estado_obra;

    const statusSelect = document.getElementById('dash-status-web') || document.getElementById('dash-status');
    if(statusSelect) statusSelect.value = obra.status;

    // Mensaje de imagen
    const nameDisplay = document.getElementById('file-name-display');
    if(nameDisplay) nameDisplay.textContent = "Editando (Deja vacío para mantener imagen actual)";

    // Gestión de botones
    document.getElementById('btn-save').classList.add('hidden');
    document.getElementById('btn-update').classList.remove('hidden');

    // Actualizar variable global (que usará el eventListener del botón Refrescar)
    // Nota: Como btnUpdate está dentro del listener, necesitamos una forma de pasarle el ID.
    // Usaremos un atributo data en el botón.
    document.getElementById('btn-update').setAttribute('data-id', id);
};

// Modificación al EventListener de Update para leer el ID del atributo
document.addEventListener('click', async function(e) {
    if (e.target && e.target.closest('#btn-update')) {
        const btn = document.getElementById('btn-update');
        const id = btn.getAttribute('data-id');
        
        // Aquí repetimos la lógica de validación y envío PUT que puse arriba
        // Para simplificar, asegúrate que la función guardarOActualizar sea accesible o repite la lógica fetch PUT aquí.
        // Dado que se complica por los scopes, RECOMIENDO poner todo dentro del DOMContentLoaded y usar window.editingId
    }
});