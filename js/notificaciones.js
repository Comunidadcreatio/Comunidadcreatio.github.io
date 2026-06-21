// js/notificaciones.js
// Sistema de notificaciones (toasts) y estados de carga.

// Crea el contenedor de notificaciones si aún no existe.
function initNotificationContainer() {
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    return container;
}

// Iconos SVG por tipo (evita problemas de codificación con emojis).
const NOTIF_ICONS = {
    success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

// Mostrar notificación.
function showNotification(message, type = 'info', duration = 5000) {
    const container = initNotificationContainer();

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.setAttribute('role', 'alert');

    const icon = NOTIF_ICONS[type] || NOTIF_ICONS.info;

    notification.innerHTML = `
        <span class="notification-icon">${icon}</span>
        <span class="notification-message"></span>
        <button class="notification-close" type="button" aria-label="Cerrar notificación">${CLOSE_ICON}</button>
    `;
    // Insertar el mensaje como texto para evitar inyección de HTML
    // y preservar saltos de línea.
    notification.querySelector('.notification-message').textContent = message;

    notification.querySelector('.notification-close').addEventListener('click', () => {
        closeNotification(notification);
    });

    container.appendChild(notification);

    if (duration > 0) {
        setTimeout(() => {
            closeNotification(notification);
        }, duration);
    }

    return notification;
}

// Cerrar (con animación de salida).
function closeNotification(notification) {
    if (!notification || !notification.parentElement) return;
    notification.classList.add('slide-out');
    setTimeout(() => {
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }, 300);
}

// Atajos por tipo.
export function showSuccess(message, duration = 4000) {
    return showNotification(message, 'success', duration);
}

export function showError(message, duration = 6000) {
    return showNotification(message, 'error', duration);
}

export function showWarning(message, duration = 5000) {
    return showNotification(message, 'warning', duration);
}

export function showInfo(message, duration = 5000) {
    return showNotification(message, 'info', duration);
}

// ============================================
// INDICADORES DE CARGA
// ============================================

// Overlay de carga a pantalla completa.
export function showLoadingOverlay(text = 'Cargando...') {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <div class="loading-spinner"></div>
                <div class="loading-text"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.querySelector('.loading-text').textContent = text;
    overlay.style.display = 'flex';
    return overlay;
}

export function hideLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Estado de carga en un botón (spinner + deshabilitado).
export function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.textContent;
        }
        button.classList.add('button-loading');
        button.disabled = true;
    } else {
        button.classList.remove('button-loading');
        button.disabled = false;
        if (button.dataset.originalText) {
            delete button.dataset.originalText;
        }
    }
}
