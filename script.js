document.addEventListener('DOMContentLoaded', () => {
    // Seleccionamos los elementos
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navMenu = document.querySelector('.nav-menu');
    const navLinks = document.querySelectorAll('.nav-menu a');
    const cartContainer = document.getElementById('cart-container');
    const adminBtn = document.getElementById('admin-btn');
    const loginPanel = document.getElementById('login-panel');

    // --- Lógica del Panel Admin ---
    if(adminBtn && loginPanel) {
        adminBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Alternar visibilidad del panel de login
            loginPanel.classList.toggle('hidden');
            // Si el menú móvil está abierto, cerrarlo
            navMenu.classList.remove('active');
        });

        // Cerrar panel al hacer clic fuera de la tarjeta (overlay)
        loginPanel.addEventListener('click', (e) => {
            if (e.target === loginPanel) {
                loginPanel.classList.add('hidden');
            }
        });
    }

    // --- Lógica del Menú Móvil ---
    if(menuBtn && navMenu) {
        menuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            // Si abrimos el menú, nos aseguramos que el login esté cerrado
            loginPanel.classList.add('hidden');
        });
    }

    // --- Lógica de Navegación Unificada ---
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // 1. Cerrar el Panel Admin si está abierto
            if(loginPanel) loginPanel.classList.add('hidden');

            // 2. Cerrar menú móvil
            if(navMenu) navMenu.classList.remove('active');

            // 3. Gestionar clase 'active' visual en los enlaces
            navLinks.forEach(el => el.classList.remove('active'));
            this.classList.add('active');

            // 4. Lógica de la Galería / Carrito
            const linkText = this.textContent.trim().toLowerCase();
            
            if (linkText === 'galería' || linkText === 'galeria') {
                // Reinicio de animación del carrito (Reflow Hack)
                cartContainer.classList.add('hidden');
                cartContainer.classList.remove('show-anim');
                
                // Pequeño timeout para permitir que el navegador procese el cambio de clase
                setTimeout(() => {
                    cartContainer.classList.remove('hidden');
                    cartContainer.classList.add('show-anim');
                }, 10);
            } else {
                // En cualquier otra opción, ocultamos el carrito
                cartContainer.classList.add('hidden');
                cartContainer.classList.remove('show-anim');
            }
        });
    });
});