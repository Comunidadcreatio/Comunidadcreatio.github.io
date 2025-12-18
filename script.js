document.addEventListener('DOMContentLoaded', () => {
    // 1. SELECCIÓN DE ELEMENTOS DEL DOM
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const loginForm = document.querySelector('.login-form');
    const btnLogin = loginForm ? loginForm.querySelector('.btn-login') : null;

    // 2. LÓGICA DEL PANEL DE ADMINISTRACIÓN (ABRIR/CERRAR)
    if(adminBtn && loginPanel) {
        adminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginPanel.classList.toggle('hidden');
            if(navMenu) navMenu.classList.remove('active');
        });

        loginPanel.addEventListener('click', (e) => {
            if (e.target === loginPanel) {
                loginPanel.classList.add('hidden');
            }
        });
    }

    // 3. LÓGICA DE LOGIN (CONEXIÓN A RENDER Y TIDB CLOUD)
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Indicador visual de carga en el botón
            const originalText = btnLogin.innerHTML;
            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            // Captura de datos de los inputs
            const userValue = loginForm.querySelector('input[type="text"]').value.trim();
            const passValue = loginForm.querySelector('input[type="password"]').value.trim();

            try {
                // Petición POST a tu API en Render
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: userValue, pass: passValue })
                });

                const result = await response.json();

                if (result.success) {
                    alert("¡Acceso concedido! Bienvenido al Panel de Control.");
                    loginPanel.classList.add('hidden');
                    // Aquí puedes disparar la lógica para editar la galería
                } else {
                    // Manejo de credenciales incorrectas
                    alert("Error: Usuario o contraseña incorrectos.");
                }
            } catch (error) {
                // Manejo de servidor dormido (Plan Free de Render)
                console.error("Error de conexión:", error);
                alert("El servidor gratuito está despertando. Por favor, espera 30 segundos e intenta de nuevo.");
            } finally {
                // Restaurar estado del botón
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
            }
        });
    }

    // 4. LÓGICA DEL MENÚ MÓVIL
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if(loginPanel) loginPanel.classList.add('hidden');
        });
    }

    // 5. NAVEGACIÓN Y COMPORTAMIENTO DE LA GALERÍA
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Cerrar elementos abiertos al navegar
            if(loginPanel) loginPanel.classList.add('hidden');
            if(navMenu) navMenu.classList.remove('active');

            // Actualizar clase activa
            navLinks.forEach(el => el.classList.remove('active'));
            this.classList.add('active');

            // Lógica específica para la sección de Galería
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
            } else {
                if (cartContainer) {
                    cartContainer.classList.add('hidden');
                    cartContainer.classList.remove('show-anim');
                }
            }
        });
    });
});