document.addEventListener('DOMContentLoaded', () => {
    // Seleccionamos los elementos de tu archivo
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const loginForm = document.querySelector('.login-form'); // Seleccionado de tu HTML

    // --- Lógica del Panel Admin ---
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

    // --- CONEXIÓN CON EL BACKEND EN RENDER ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Obtenemos los valores de los inputs definidos en tu HTML
            const userValue = loginForm.querySelector('input[type="text"]').value;
            const passValue = loginForm.querySelector('input[type="password"]').value;

            try {
                // Hacemos la petición a tu URL de Render
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: userValue, pass: passValue })
                });

                const result = await response.json();

                if (result.success) {
                    alert("¡Acceso concedido! Bienvenido Administrador.");
                    loginPanel.classList.add('hidden');
                } else {
                    // Si el servidor responde pero el login es incorrecto
                    alert("Error: " + (result.message || "Usuario o contraseña incorrectos"));
                }
            } catch (error) {
                // Si el servidor de Render está "dormido" (tarda unos 50s en despertar en el plan free)
                console.error("Detalle del error:", error);
                alert("El servidor está arrancando. Por favor, espera 30 segundos e intenta de nuevo.");
            }
        });
    }

    // --- Resto de tu lógica original (Menú Móvil y Navegación) ---
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if(loginPanel) loginPanel.classList.add('hidden');
        });
    }

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