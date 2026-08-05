// js/theme.js
// Gestión del modo oscuro/claro (basado en hora del día o preferencia guardada)
// Compatible con index.html (IDs: btn-dark-mode, config-dark-mode)
// y auth.html (IDs: auth-dark-mode-icon, auth-dark-mode-btn)

const ICON_SUN = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
const ICON_MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';

/**
 * Encuentra el botón de modo oscuro (busca en index, menú config, y auth).
 */
function findDarkModeBtn() {
    return document.getElementById('btn-dark-mode')
        || document.getElementById('config-dark-mode')
        || document.getElementById('auth-dark-mode-btn');
}

/**
 * Determina el tema basado en la hora del día.
 * 6 AM (6) a 6 PM (18): modo claro
 * 6 PM (18) a 6 AM (6): modo oscuro
 */
export function getThemeByTime() {
    const hour = new Date().getHours();
    return (hour >= 6 && hour < 18) ? 'light' : 'dark';
}

/**
 * Actualiza el icono/label del botón de modo oscuro.
 */
export function updateDarkModeIcon(theme) {
    // Ícono SVG (modo legacy, auth.html)
    const icon = document.getElementById('dark-mode-icon') || document.getElementById('auth-dark-mode-icon');
    if (icon) {
        icon.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    }
    // Ícono SVG + label en el menú de configuración (index.html)
    const configIcon = document.getElementById('config-dark-icon');
    if (configIcon) {
        configIcon.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    }
    const label = document.getElementById('config-dark-label');
    if (label) {
        label.textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
    }
}

/**
 * Aplica un tema (light/dark) al documento y lo persiste.
 */
export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateDarkModeIcon(theme);
}

/**
 * Inicializa el tema al cargar la página:
 * primero verifica preferencia guardada, si no hay, usa modo oscuro.
 */
export function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    applyTheme(savedTheme || getThemeByTime());
}

/**
 * Configura el botón de modo oscuro (compatible con index.html y auth.html).
 */
export function setupDarkModeToggle() {
    const darkModeBtn = findDarkModeBtn();
    if (!darkModeBtn) return;

    initializeTheme();

    darkModeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });
}
