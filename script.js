// Seleccionamos los elementos
const menuBtn = document.querySelector('.mobile-menu-btn');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-menu a');
const cartContainer = document.getElementById('cart-container');


// Elementos nuevos del Admin Panel
const adminBtn = document.getElementById('admin-btn');
const loginPanel = document.getElementById('login-panel');

// Mostrar/Ocultar Panel Admin
adminBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginPanel.classList.toggle('hidden');
});

// Cerrar panel si haces clic fuera de la tarjeta blanca
loginPanel.addEventListener('click', (e) => {
    if (e.target === loginPanel) {
        loginPanel.classList.add('hidden');
    }
});


// Función para abrir/cerrar el menú
menuBtn.addEventListener('click', () => {
    navMenu.classList.toggle('active');
});

// Manejo de clicks en los enlaces (Cerrar menú y lógica de galería)
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        // 1. Cerramos el menú al hacer click en una opción
        navMenu.classList.remove('active');

        // 2. Gestionar clase active visual
        navLinks.forEach(el => el.classList.remove('active'));
        this.classList.add('active');

        // 3. Lógica del carrito (Tu función original de Galería)
        const linkText = this.textContent.trim().toLowerCase();
        if (linkText === 'galería' || linkText === 'galeria') {
            cartContainer.classList.add('hidden');
            cartContainer.classList.remove('show-anim');
            
            setTimeout(() => {
                cartContainer.classList.remove('hidden');
                cartContainer.classList.add('show-anim');
            }, 10);
        } else {
            cartContainer.classList.add('hidden');
            cartContainer.classList.remove('show-anim');
        }
    });
});


document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', function(e) {
        document.querySelectorAll('.nav-menu a').forEach(el => el.classList.remove('active'));
        this.classList.add('active');

        const cartContainer = document.getElementById('cart-container');
        const linkText = this.textContent.trim().toLowerCase();

        if (linkText === 'galería' || linkText === 'galeria') {
            // Reiniciamos la animación: quitamos y ponemos la clase
            cartContainer.classList.add('hidden');
            cartContainer.classList.remove('show-anim');
            
            // Un pequeño timeout para que el navegador procese el reinicio
            setTimeout(() => {
                cartContainer.classList.remove('hidden');
                cartContainer.classList.add('show-anim');
            }, 10);
        } else {
            cartContainer.classList.add('hidden');
            cartContainer.classList.remove('show-anim');
        }
    });
});