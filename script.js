document.addEventListener('DOMContentLoaded', () => {
    // 1. SELECCIÓN DE ELEMENTOS PRINCIPALES
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');

    // Mostrar el nombre del archivo seleccionado
    const fileInput = document.getElementById('dash-input-file');
    const nameDisplay = document.getElementById('file-name-display');

    if(fileInput) {
        fileInput.addEventListener('change', function() {
            if(this.files && this.files[0]) {
                nameDisplay.textContent = "Archivo listo: " + this.files[0].name;
            }
        });
    }
    
    // Elementos de Admin y Paneles
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const adminDashboard = document.getElementById('admin-dashboard'); 
    const loginForm = document.querySelector('.login-form');
    const btnLogout = document.getElementById('btn-logout'); 
    const adminUsernameSpan = document.getElementById('admin-username'); 

    // Estado de sesión
    let isLoggedIn = false;

    // 2. FUNCIÓN PARA ABRIR/CERRAR PANELES
    function togglePanels(showDashboard) {
        if (showDashboard && isLoggedIn) {
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
            if (isLoggedIn) {
                adminDashboard.classList.toggle('hidden');
                loginPanel.classList.add('hidden');
            } else {
                loginPanel.classList.remove('hidden');
                adminDashboard.classList.add('hidden');
            }
        });
    }   

    [loginPanel, adminDashboard].forEach(panel => {
        if(panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) panel.classList.add('hidden');
            });
        }
    });

    // 3. LÓGICA DE LOGIN
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnLogin = loginForm.querySelector('.btn-login');
            const originalText = btnLogin.innerHTML;
            
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
                    isLoggedIn = true;
                    if(adminUsernameSpan) adminUsernameSpan.textContent = userValue;
                    
                    const iconElement = adminBtn.querySelector('i'); 
                    if(iconElement) {
                        iconElement.className = "fa-solid fa-user-check";
                        iconElement.style.color = "#2ecc71";
                    }  

                    alert("¡Bienvenido al Panel de Gestión!");
                    
                    await cargarTablaObras(); // Carga los datos antes de mostrar el panel
                    togglePanels(true);
                    loginForm.reset();
                } else {
                    alert("Credenciales incorrectas.");
                }
            } catch (error) {
                alert("Error de conexión. Reintenta en 20s.");
            } finally {
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
            }
        });
    }

    // --- EVENTO GUARDAR OBRA ---
    const artworkForm = document.getElementById('artwork-form');
    if (artworkForm) {
        artworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSave = document.querySelector('.btn-save-artwork');
            btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSave.disabled = true;

            const formData = new FormData();
            const fileInput = document.getElementById('dash-input-file');
            if (fileInput && fileInput.files[0]) {
                formData.append('imagen', fileInput.files[0]);
            }

            formData.append('titulo', document.getElementById('dash-titulo').value);
            formData.append('artista', document.getElementById('dash-artista').value);
            formData.append('ano', document.getElementById('dash-ano').value);
            formData.append('descripcion_tecnica', document.getElementById('dash-tec-desc').value);
            formData.append('descripcion_artistica', document.getElementById('dash-art-desc').value);
            formData.append('estado_obra', document.getElementById('dash-estado-obra').value);
            formData.append('procedencia', document.getElementById('dash-procedencia').value);
            formData.append('certificado', document.getElementById('dash-certificado').value);
            formData.append('marcos', document.getElementById('dash-marcos').value);
            formData.append('precio', document.getElementById('dash-precio').value);
            formData.append('etiqueta', document.getElementById('dash-etiqueta').value);
            formData.append('id_obra', document.getElementById('dash-id').value);
            formData.append('status', document.getElementById('dash-status').value);

            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras', {
                    method: 'POST',
                    body: formData 
                });

                if (response.ok) {
                    alert("¡Obra registrada con éxito!");
                    artworkForm.reset();
                    if(nameDisplay) nameDisplay.textContent = "";
                    cargarTablaObras(); 
                }
            } catch (error) {
                alert("Error al conectar con el servidor");
            } finally {
                btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Obra';
                btnSave.disabled = false;
            }
        });
    }

    // 4. LÓGICA DE CERRAR SESIÓN
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            isLoggedIn = false;
            togglePanels(false);
            const iconElement = adminBtn.querySelector('i');
            if(iconElement) {
                iconElement.className = "fa-solid fa-user-shield";
                iconElement.style.color = "";
            }
            alert("Sesión cerrada correctamente.");
        });
    }

    // 5. MENÚ MÓVIL
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
});

// --- FUNCIONES GLOBALES (FUERA DE DOMCONTENTLOADED PARA QUE EL HTML LAS VEA) ---

async function cargarTablaObras() {
    const tbody = document.getElementById('tabla-obras-body');
    if (!tbody) return;

    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        const obras = await response.json();
        tbody.innerHTML = ''; 

        if (obras.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No hay obras registradas.</td></tr>';
            return;
        }

        obras.forEach(obra => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${obra.id_personalizado || obra.id}</td>
                <td>${obra.titulo}</td>
                <td>${obra.etiqueta}</td>
                <td>${obra.precio}$</td>
                <td><span class="badge-active">${obra.status}</span></td>
                <td><img src="${obra.imagen_url}" style="width:35px; height:35px; border-radius:5px; object-fit:cover;" onerror="this.src='https://via.placeholder.com/35'"></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon-edit"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-icon-delete" onclick="eliminarObra(${obra.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(fila);
        });
    } catch (error) {
        console.error("Error al cargar tabla:", error);
    }
}

async function eliminarObra(id) {
    if (!confirm("¿Deseas eliminar esta obra?")) return;
    try {
        const response = await fetch(`https://backend-fundacion-atpe.onrender.com/obras/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            alert("Eliminado.");
            cargarTablaObras();
        }
    } catch (error) {
        alert("Error de conexión.");
    }
}