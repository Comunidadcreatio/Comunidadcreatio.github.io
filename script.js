document.addEventListener('DOMContentLoaded', () => {
    // 1. SELECCIÓN DE ELEMENTOS PRINCIPALES
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');

    // Elementos de Admin y Paneles
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const adminDashboard = document.getElementById('admin-dashboard'); 
    const loginForm = document.querySelector('.login-form');
    const btnLogout = document.getElementById('btn-logout'); 
    const adminUsernameSpan = document.getElementById('admin-username'); 

    // Input de archivos y visualización de nombre
    const fileInput = document.getElementById('dash-input-file');
    const nameDisplay = document.getElementById('file-name-display');

    // Estado de sesión (Global para este bloque)
    window.isLoggedIn = false;

    // 2. LÓGICA DE ARCHIVOS (SUBIDA)
    if(fileInput) {
        fileInput.addEventListener('change', function() {
            if(this.files && this.files[0]) {
                nameDisplay.textContent = "Archivo listo: " + this.files[0].name;
            }
        });
    }

    // 3. NAVEGACIÓN Y MENÚ MÓVIL
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

    // Cerrar paneles al hacer click fuera del contenido
    [loginPanel, adminDashboard].forEach(panel => {
        if(panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) panel.classList.add('hidden');
            });
        }
    });

    // 5. PROCESO DE LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnLogin = loginForm.querySelector('.btn-login');
            const originalBtnText = btnLogin.innerHTML;

            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            const inputs = loginForm.querySelectorAll('input');
            const userValue = inputs[0]?.value.trim();
            const passValue = inputs[1]?.value.trim();

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
                    
                    await cargarTablaObras(); // Carga real de datos
                    togglePanels(true);
                    loginForm.reset();
                } else {
                    alert("Credenciales incorrectas.");
                }
            } catch (error) {
                alert("Error de conexión con el servidor.");
            } finally {
                btnLogin.innerHTML = originalBtnText;
                btnLogin.disabled = false;
            }
        });
    }

    // 6. GUARDAR NUEVA OBRA (FORMULARIO)
    const artworkForm = document.getElementById('artwork-form');
    if (artworkForm) {
        artworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSave = document.querySelector('.btn-save-artwork');
            const originalBtnText = btnSave.innerHTML;
            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSave.disabled = true;

            const formData = new FormData();
            if (fileInput && fileInput.files[0]) {
                formData.append('imagen', fileInput.files[0]);
            }

            // Mapeo de campos del formulario
            formData.append('titulo', document.getElementById('dash-titulo').value);
            formData.append('artista', document.getElementById('dash-artista').value);
            formData.append('ano', document.getElementById('dash-ano').value);
            formData.append('descripcion_tecnica', document.getElementById('dash-tec-desc').value);
            formData.append('descripcion_artistica', document.getElementById('dash-art-desc').value);
            formData.append('status', document.getElementById('dash-status').value);
            formData.append('procedencia', document.getElementById('dash-procedencia').value);
            formData.append('certificado', document.getElementById('dash-certificado').value);
            formData.append('marcos', document.getElementById('dash-marcos').value);
            formData.append('precio', document.getElementById('dash-precio').value);
            formData.append('etiqueta', document.getElementById('dash-etiqueta').value);
            formData.append('id_obra', document.getElementById('dash-id').value);
            formData.append('estado_obra', document.getElementById('dash-estado-obra').value);

            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras', {
                    method: 'POST',
                    body: formData 
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert("¡Obra registrada con éxito!");
                    artworkForm.reset();
                    if(nameDisplay) nameDisplay.textContent = "";
                    cargarTablaObras(); 
                } else {
                    alert("Error: " + (result.error || "No se pudo guardar"));
                }
            } catch (error) {
                alert("Error de red al intentar guardar.");
            } finally {
                btnSave.innerHTML = originalBtnText;
                btnSave.disabled = false;
            }

                const estadoSeleccionado = document.getElementById('dash-estado-obra').value;

            if (estadoSeleccionado === "") {
                alert("Por favor, selecciona un Estado para la obra.");
                btnSave.innerHTML = originalBtnText; // Restaurar botón
                btnSave.disabled = false;
            return; // Detiene el envío

            }
        });
    }


    // 7. CERRAR SESIÓN
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
});

// --- FUNCIONES GLOBALES (FUERA DEL DOMCONTENTLOADED) ---
// Es vital que estén aquí para que los botones generados dinámicamente las encuentren.

async function cargarTablaObras() {
    const tbody = document.getElementById('tabla-obras-body');
    if (!tbody) return;

    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        if (!response.ok) throw new Error("Error al obtener datos");
        
        const obras = await response.json();
        tbody.innerHTML = ''; 

        if (!obras || obras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">No hay obras registradas aún.</td></tr>';
            return;
        }

        obras.forEach(obra => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${obra.id_personalizado || obra.id}</td>
                <td>${obra.titulo}</td>
                <td>${obra.etiqueta || 'N/A'}</td>
                <td>${obra.precio || '0'}$</td>
                <td><span class="badge-active">${obra.status || 'Activo'}</span></td>
                <td><img src="${obra.imagen_url}" style="width:35px; height:35px; border-radius:5px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/35'"></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon-edit" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
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