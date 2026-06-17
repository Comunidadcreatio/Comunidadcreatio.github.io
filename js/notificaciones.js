// Sistema de notificaciones y toasts

// Crear contenedor de notificaciones si no existe
function initNotificationContainer() {
    if (!document.querySelector('.notification-container')) {
        const container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
}

// Mostrar notificación
function showNotification(message, type = 'info', duration = 5000) {
    initNotificationContainer();
    
    const container = document.querySelector('.notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Icono según tipo
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    
    notification.innerHTML = `
        <span class="notification-icon">${icon}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" aria-label="Cerrar notificación">×</button>
    `;
    
    // Evento de cerrar
    notification.querySelector('.notification-close').addEventListener('click', () => {
        closeNotification(notification);
    });
    
    container.appendChild(notification);
    
    // Auto cerrar después de duration
    if (duration > 0) {
        setTimeout(() => {
            closeNotification(notification);
        }, duration);
    }
    
    return notification;
}

// Cerrar notificación
function closeNotification(notification) {
    notification.classList.add('slide-out');
    notification.addEventListener('animationend', () => {
        notification.remove();
    });
}

// Mostrar notificación de éxito
function showSuccess(message, duration = 5000) {
    return showNotification(message, 'success', duration);
}

// Mostrar notificación de error
function showError(message, duration = 5000) {
    return showNotification(message, 'error', duration);
}

// Mostrar notificación de advertencia
function showWarning(message, duration = 5000) {
    return showNotification(message, 'warning', duration);
}

// Mostrar notificación de información
function showInfo(message, duration = 5000) {
    return showNotification(message, 'info', duration);
}

// Mostrar toast simple
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
        toast.style.transition = 'all 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
}

// Mostrar overlay de carga
function showLoadingOverlay(text = 'Cargando...') {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">${text}</div>
        `;
        document.body.appendChild(overlay);
    }
    return overlay;
}

// Ocultar overlay de carga
function hideLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Agregar estado de carga a un botón
function setButtonLoading(button, loading = true, originalText = '') {
    if (loading) {
        button.dataset.originalText = button.textContent;
        button.classList.add('button-loading');
        button.textContent = '';
        button.disabled = true;
    } else {
        button.classList.remove('button-loading');
        button.textContent = button.dataset.originalText || originalText;
        button.disabled = false;
        delete button.dataset.originalText;
    }
}

// Mostrar indicador de carga inline
function showInlineLoading(container, text = 'Cargando...') {
    const loading = document.createElement('div');
    loading.className = 'loading-inline';
    loading.innerHTML = `
        <div class="spinner-small"></div>
        <span>${text}</span>
    `;
    container.appendChild(loading);
    return loading;
}

// Agregar estado de validación a un input
function setInputValidation(input, valid = true) {
    input.classList.remove('input-valid', 'input-invalid');
    if (valid) {
        input.classList.add('input-valid');
    } else {
        input.classList.add('input-invalid');
    }
}

// Limpiar estado de validación de un input
function clearInputValidation(input) {
    input.classList.remove('input-valid', 'input-invalid');
}

// Reemplazar alert nativo con notificación
function alert(message) {
    showInfo(message, 5000);
}

// Reemplazar confirm nativo con diálogo personalizado (opcional)
function confirm(message) {
    return window.confirm(message); // Por ahora usar el nativo, se puede mejorar después
}

// Exportar funciones
export {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showToast,
    showLoadingOverlay,
    hideLoadingOverlay,
    setButtonLoading,
    showInlineLoading,
    setInputValidation,
    clearInputValidation
};
