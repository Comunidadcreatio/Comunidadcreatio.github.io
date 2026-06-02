// js/logout-panels.js
import { apiRequest } from './config.js';
import { logout } from './auth.js';
import { desktopLogoutModal, clickOutsideHandlerLogout, desktopMainMenu, clickOutsideHandlerMainMenu, mobileMainMenu, mobileOutsideClickListener } from './dom-globals.js';

export async function ejecutarLogout() {
    try {
        const res = await apiRequest('/api/artistas/logout', { method: 'POST' });
        if (res && !res.success) console.warn(res.error);
    } catch (error) {
        console.error("Error en logout backend:", error);
    } finally {
        logout();
        document.getElementById('toggle-panel').classList.add('hidden');
        document.getElementById('pagina-blanca').classList.add('hidden');
        document.getElementById('galeria-publica').classList.add('hidden');
        document.getElementById('panel-artista').classList.add('hidden');
        const modalLogin = document.getElementById('modal-login');
        modalLogin.classList.remove('hidden');
        modalLogin.classList.add('modal-fullscreen');
        document.getElementById('btn-perfil').classList.remove('hidden');
    }
}

export function cerrarMobileLogoutModal() {
    const modal = document.getElementById('mobile-logout-options');
    if (modal) modal.classList.add('hidden');
}

export function cerrarDesktopLogoutModal() {
    if (desktopLogoutModal) desktopLogoutModal.classList.add('hidden');
    if (clickOutsideHandlerLogout) {
        document.removeEventListener('click', clickOutsideHandlerLogout);
        // clickOutsideHandlerLogout = null; // se actualiza desde el importador
    }
}

export function cerrarDesktopMainMenu() {
    if (desktopMainMenu) desktopMainMenu.classList.add('hidden');
    if (clickOutsideHandlerMainMenu) {
        document.removeEventListener('click', clickOutsideHandlerMainMenu);
        // clickOutsideHandlerMainMenu = null;
    }
}

export function cerrarMenuMovil() {
    if (mobileMainMenu) mobileMainMenu.classList.add('hidden');
    if (mobileOutsideClickListener) {
        document.removeEventListener('click', mobileOutsideClickListener);
        // mobileOutsideClickListener = null;
    }
}

export function positionDesktopPanel(triggerElement, panelElement) {
    if (!panelElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.desktop-logout-panel');
    if (!panelDiv) return;
    const panelRect = panelDiv.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top;
    let placement = 'right';
    if (left + panelRect.width > window.innerWidth) {
        left = rect.left - panelRect.width - 8;
        placement = 'left';
    }
    if (top + panelRect.height > window.innerHeight) {
        top = window.innerHeight - panelRect.height - 10;
    }
    if (top < 10) top = 10;
    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;
    panelDiv.setAttribute('data-placement', placement);
}

export function positionMobilePanel(triggerElement, panelElement) {
    if (!panelElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const panelDiv = panelElement.querySelector('.mobile-logout-panel');
    if (!panelDiv) return;
    
    panelDiv.style.margin = '0';
    panelElement.style.bottom = 'auto';
    panelElement.style.right = 'auto';
    
    const panelRect = panelDiv.getBoundingClientRect();
    let top = rect.top - panelRect.height - 8;
    let left = rect.left;
    if (top < 10) {
        top = rect.bottom + 8;
    }
    if (left + panelRect.width > window.innerWidth) {
        left = window.innerWidth - panelRect.width - 10;
    }
    if (left < 10) left = 10;
    
    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;
}