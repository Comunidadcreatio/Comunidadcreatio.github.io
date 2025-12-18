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

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const originalText = btnLogin.innerHTML;
            btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            btnLogin.disabled = true;

            // SELECCIÓN INFALIBLE: Primer input es usuario, segundo es contraseña
            const inputs = loginForm.querySelectorAll('input');
            const userValue = inputs[0].value.trim(); 
            const passValue = inputs[1].value.trim();

            console.log("Intentando login con:", userValue); // Para que veas en consola si captura bien

            try {
                const response = await fetch('https://backend-fundacion-atpe.onrender.com/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        user: userValue, 
                        pass: passValue 
                    })
                });

                const result = await response.json();

                if (result.success) {
                    alert("¡Acceso concedido!");
                    loginPanel.classList.add('hidden');
                } else {
                    // Si llega aquí, es que el servidor respondió pero NO encontró al usuario
                    alert("Credenciales incorrectas en la base de datos.");
                }
            } catch (error) {
                alert("El servidor está despertando. Reintenta en 10 segundos.");
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