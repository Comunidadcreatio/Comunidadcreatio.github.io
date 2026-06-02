// js/logout-panels.js
import { apiRequest } from './config.js';
import { logout } from './auth.js';
import { state } from './dom-globals.js';

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
  if (state.desktopLogoutModal) state.desktopLogoutModal.classList.add('hidden');
  if (state.clickOutsideHandlerLogout) {
    document.removeEventListener('click', state.clickOutsideHandlerLogout);
    state.clickOutsideHandlerLogout = null;
  }
}

export function cerrarDesktopMainMenu() {
  if (state.desktopMainMenu) state.desktopMainMenu.classList.add('hidden');
  if (state.clickOutsideHandlerMainMenu) {
    document.removeEventListener('click', state.clickOutsideHandlerMainMenu);
    state.clickOutsideHandlerMainMenu = null;
  }
}

export function cerrarMenuMovil() {
  if (state.mobileMainMenu) state.mobileMainMenu.classList.add('hidden');
  if (state.mobileOutsideClickListener) {
    document.removeEventListener('click', state.mobileOutsideClickListener);
    state.mobileOutsideClickListener = null;
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