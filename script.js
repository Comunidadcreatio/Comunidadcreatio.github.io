document.addEventListener('DOMContentLoaded', () => {
    // 1. SELECCIÓN DE ELEMENTOS PRINCIPALES
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    
    // Elementos de Admin y Paneles
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const adminDashboard = document.getElementById('admin-dashboard'); // El nuevo panel grande
    const loginForm = document.querySelector('.login-form');
    const btnLogout = document.getElementById('btn-logout'); // El botón de cerrar sesión dentro del dash
    const adminUsernameSpan = document.getElementById('admin-username'); // Para poner el nombre
    const adminIcon = adminBtn ? adminBtn.querySelector('i') : null;

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

    // Evento del botón del header (escudo)
    if(adminBtn) {
    adminBtn.addEventListener('click', (e) => {
        e.preventDefault();
        
        if (isLoggedIn) {
            // Si ya entró, mostramos el dashboard con su margen
            adminDashboard.classList.toggle('hidden');
            loginPanel.classList.add('hidden');
        } else {
            // Si no ha entrado, forzamos que vea el Login primero
            loginPanel.classList.remove('hidden');
            adminDashboard.classList.add('hidden');
        }
    });
    }   

    // Cerrar paneles al hacer clic fuera (en el overlay oscuro)
    [loginPanel, adminDashboard].forEach(panel => {
        if(panel) {
            panel.addEventListener('click', (e) => {
                if (e.target === panel) panel.classList.add('hidden');
            });
        }
    });

    // 3. LÓGICA DE LOGIN (CONEXIÓN AL SERVIDOR)
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnLogin = loginForm.querySelector('.btn-login');
            const originalText = btnLogin.innerHTML;
            
            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            // Selección segura de inputs
            const inputs = loginForm.querySelectorAll('input');
            const userValue = inputs[0]?.value.trim();
            const passValue = inputs[1]?.value.trim();

            if (!userValue || !passValue) {
                alert("Por favor, completa ambos campos.");
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
                return;
            }

            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: userValue, pass: passValue })
                });

                const result = await response.json();

                if (result.success) {
                    // --- ÉXITO ---
                    isLoggedIn = true;
                    if(adminUsernameSpan) adminUsernameSpan.textContent = userValue;
                    
                    // CORRECCIÓN: Definimos bien el elemento del icono antes de usarlo
                    const iconElement = adminBtn.querySelector('i'); 
                    if(iconElement) {
                        iconElement.className = "fa-solid fa-user-check";
                        iconElement.style.color = "#2ecc71"; // Verde esmeralda
                    }  

                    alert("¡Bienvenido al Panel de Gestión!");
                    
                    // Transición: Ocultar Login -> Mostrar Dashboard
                    togglePanels(true);
                    loginForm.reset();
                } else {
                    alert("Credenciales incorrectas.");
                }
            } catch (error) {
                console.error(error);
                alert("Error de conexión. Si es la primera vez, el servidor puede estar despertando. Reintenta en 20s.");
            } finally {
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
            }
        });

        // --- FUNCIÓN PARA REFRESCAR LA TABLA ---
async function cargarTablaObras() {
    const tbody = document.querySelector('.dash-table tbody');
    if (!tbody) return;

    try {
        const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras');
        const obras = await response.json();

        tbody.innerHTML = ''; // Limpiar tabla actual

        obras.forEach(obra => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${obra.id_personalizado || obra.id}</td>
                <td>${obra.titulo}</td>
                <td>${obra.etiqueta || 'N/A'}</td>
                <td>${obra.precio || '0'}$</td>
                <td><span class="badge-active">${obra.status || 'Activo'}</span></td>
                <td><img src="${obra.imagen_url}" style="width:30px; height:30px; border-radius:5px; object-fit:cover;"></td>
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
        console.error("Error cargando tabla:", error);
    }
}

// --- EVENTO GUARDAR OBRA ---
const artworkForm = document.getElementById('artwork-form');
if (artworkForm) {
    artworkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSave = document.querySelector('.btn-save-artwork');
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

        const datos = {
            titulo: document.getElementById('dash-titulo').value,
            artista: document.getElementById('dash-artista').value,
            ano: document.getElementById('dash-ano').value,
            descripcion_tecnica: document.getElementById('dash-tec-desc').value,
            descripcion_artistica: document.getElementById('dash-art-desc').value,
            estado_obra: document.getElementById('dash-estado-obra').value,
            procedencia: document.getElementById('dash-procedencia').value,
            certificado: document.getElementById('dash-certificado').value,
            marcos: document.getElementById('dash-marcos').value,
            precio: document.getElementById('dash-precio').value,
            etiqueta: document.getElementById('dash-etiqueta').value,
            id_obra: document.getElementById('dash-id').value,
            status: document.getElementById('dash-status').value,
            imagen_url: "https://via.placeholder.com/150" // Aquí luego integraremos la subida real
        };

        try {
            const response = await fetch('https://backend-fundacion-atpe.onrender.com/obras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });

            if (response.ok) {
                alert("Obra registrada con éxito");
                artworkForm.reset();
                cargarTablaObras(); // <--- REFRESCAR TABLA AUTOMÁTICAMENTE
            }
        } catch (error) {
            alert("Error al conectar con el servidor");
        } finally {
            btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Obra';
        }
    });
}

// Llamar a la tabla cuando se inicie el panel
// (Añade esto dentro de la lógica del éxito del login)
// if(result.success) { ... cargarTablaObras(); ... }



    }

    // 4. LÓGICA DE CERRAR SESIÓN
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            isLoggedIn = false;
            togglePanels(false); // Vuelve a mostrar el login la próxima vez
            adminDashboard.classList.add('hidden'); // Cierra el dash actual
            
            // Restaurar icono original
            if(iconElement) {
                iconElement.className = "fa-solid fa-user-shield";
                iconElement.style.color = ""; // Reset color
            }
            alert("Sesión cerrada correctamente.");
        });
    }

    // 5. LÓGICA DE MENÚ Y NAVEGACIÓN (EXISTENTE)
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            loginPanel.classList.add('hidden');
            adminDashboard.classList.add('hidden');
        });
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            loginPanel.classList.add('hidden');
            adminDashboard.classList.add('hidden');
            navMenu.classList.remove('active');
            navLinks.forEach(el => el.classList.remove('active'));
            this.classList.add('active');

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
});