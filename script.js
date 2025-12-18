document.addEventListener('DOMContentLoaded', () => {
    // 1. SELECCIÓN DE ELEMENTOS
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const loginForm = document.querySelector('.login-form');
    const btnLogin = loginForm ? loginForm.querySelector('.btn-login') : null;

    // 2. PANEL DE ADMINISTRACIÓN
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

    // 3. LÓGICA DE LOGIN CORREGIDA
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Efecto visual de carga
            const originalText = btnLogin.innerHTML;
            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            // CAPTURA DE DATOS: Usamos selectores genéricos porque tus inputs no tienen ID
            const userValue = loginForm.querySelector('input[type="text"]').value.trim();
            const passValue = loginForm.querySelector('input[type="password"]').value.trim();

            try {
                // Llamada a tu API en Render
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json' 
                    },
                    // ENVIAMOS: user y pass (exactamente como pide tu index.js línea 34)
                    body: JSON.stringify({ 
                        user: userValue, 
                        pass: passValue 
                    })
                });

                // Verificamos si la respuesta es correcta antes de convertir a JSON
                if (!response.ok) {
                    throw new Error('Error en la respuesta del servidor');
                }

                const result = await response.json();

                if (result.success) {
                    alert("¡Acceso concedido! Bienvenido Administrador.");
                    loginPanel.classList.add('hidden');
                    // Aquí podrías mostrar un botón de "Cerrar Sesión" o habilitar edición
                } else {
                    // El mensaje que viene de tu servidor
                    alert("Error: " + (result.message || "Usuario o contraseña incorrectos"));
                }
            } catch (error) {
                console.error("Error de conexión:", error);
                // Si el servidor está en "Sleep" (Plan Free), el fetch fallará por tiempo
                alert("El servidor gratuito de Render está despertando. Por favor, espera 30 segundos e intenta de nuevo.");
            } finally {
                btnLogin.innerHTML = originalText;
                btnLogin.disabled = false;
            }
        });
    }

    // 4. MENÚ MÓVIL
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if(loginPanel) loginPanel.classList.add('hidden');
        });
    }

    // 5. NAVEGACIÓN Y GALERÍA
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            if(loginPanel) loginPanel.classList.add('hidden');
            if(navMenu) navMenu.classList.remove('active');

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