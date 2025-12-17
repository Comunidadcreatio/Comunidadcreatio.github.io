// Ejemplo de interacción para el menú móvil
const menuBtn = document.querySelector('.mobile-menu-btn');
menuBtn.addEventListener('click', () => {
    alert('Menú móvil activado');
});

// Seleccionamos los elementos necesarios
const navLinks = document.querySelectorAll('.nav-menu a');
const cartContainer = document.getElementById('cart-container');

navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        // Opcional: e.preventDefault(); si no quieres que la página recargue aún
        
        // Obtenemos el texto del enlace (sin espacios y en minúsculas para comparar)
        const linkText = this.textContent.trim().toLowerCase();

        if (linkText === 'galería' || linkText === 'galeria') {
            // Mostramos el carrito si es Galería
            cartContainer.classList.remove('hidden');
        } else {
            // Ocultamos el carrito si es cualquier otro link
            cartContainer.classList.add('hidden');
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