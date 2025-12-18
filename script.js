document.addEventListener('DOMContentLoaded', () => {
    // Seleccionamos los elementos existentes
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');

    // --- NUEVA LÓGICA: Selección del formulario de login ---
    const loginForm = document.querySelector('.login-form');

    // --- Lógica del Panel Admin (Apertura/Cierre) ---
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

    // --- NUEVA LÓGICA: Envío de datos al Servidor en Render ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Extraemos los valores de los inputs definidos en index.html
            const userValue = loginForm.querySelector('input[type="text"]').value;
            const passValue = loginForm.querySelector('input[type="password"]').value;

            try {
                // Hacemos la petición a tu URL de Render
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user: userValue,
                        pass: passValue
                    })
                });

                const result = await response.json();

                if (result.success) {
                    alert("¡Acceso concedido! Bienvenido al sistema.");
                    // Ocultamos el panel tras el éxito
                    loginPanel.classList.add('hidden');
                    
                    // Aquí podrías redirigir al usuario o mostrar opciones de edición
                    console.log("Sesión iniciada correctamente");
                } else {
                    alert("Error: " + result.message);
                }
            } catch (error) {
                console.error("Error en la conexión:", error);
                alert("No se pudo conectar con el servidor. Verifica tu conexión.");
            }
        });
    }

    // --- Lógica del Menú Móvil ---
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            if(loginPanel) loginPanel.classList.add('hidden');
        });
    }

    // --- Lógica de Navegación Unificada ---
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
            } else {
                if (cartContainer) {
                    cartContainer.classList.add('hidden');
                    cartContainer.classList.remove('show-anim');
                }
            }
        });
    });
});