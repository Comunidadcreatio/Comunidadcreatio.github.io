document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');
    const loginForm = document.querySelector('.login-form');

    if(adminBtn && loginPanel) {
        adminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginPanel.classList.toggle('hidden');
            if(navMenu) navMenu.classList.remove('active');
        });
        loginPanel.addEventListener('click', (e) => {
            if (e.target === loginPanel) loginPanel.classList.add('hidden');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Seleccionamos los inputs correctamente
            const userValue = loginForm.querySelector('input[type="text"]').value;
            const passValue = loginForm.querySelector('input[type="password"]').value;

            try {
                // URL de tu servidor en Render
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: userValue, pass: passValue })
                });

                const result = await response.json();

                if (result.success) {
                    alert("¡Acceso concedido!");
                    loginPanel.classList.add('hidden');
                } else {
                    // Si el servidor responde pero el login falla
                    alert("Error: " + (result.message || "Usuario o contraseña incorrectos"));
                }
            } catch (error) {
                // Si el servidor de Render está "dormido" (tarda ~50s en despertar en plan free)
                console.error("Detalle del error:", error);
                alert("El servidor está despertando. Por favor, espera 30 segundos e intenta de nuevo.");
            }
        });
    }

    // --- Lógica de Menú y Navegación ---
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => navMenu.classList.toggle('active'));
    }

    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if(loginPanel) loginPanel.classList.add('hidden');
            if(navMenu) navMenu.classList.remove('active');
            navLinks.forEach(el => el.classList.remove('active'));
            this.classList.add('active');
        });
    });
});