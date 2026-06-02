// js/session-manager.js
import { token } from './auth.js';
import { TOKEN_KEY, ARTISTA_KEY, apiRequest } from './config.js';
import { state } from './dom-globals.js';

export async function fetchActiveSessionsCount() {
  if (!token) return;
  try {
    const res = await apiRequest('/api/artistas/sesiones-activas');
    if (res && res.success) {
      state.activeSessionsCount = res.count;
      updateCerrarTodasSesionesButtonState();
    } else if (res && res.error) {
      console.warn("No se pudo obtener conteo de sesiones:", res.error);
    }
  } catch (error) {
    console.error("Error al obtener número de sesiones:", error);
  }
}

export function updateCerrarTodasSesionesButtonState() {
  const mobileAllBtn = document.getElementById('mobile-logout-all');
  const isEnabled = state.activeSessionsCount >= 2;

  if (mobileAllBtn) {
    if (isEnabled) {
      mobileAllBtn.classList.remove('disabled');
      mobileAllBtn.classList.add('enabled');
      mobileAllBtn.style.color = '#ffffff';
    } else {
      mobileAllBtn.classList.add('disabled');
      mobileAllBtn.classList.remove('enabled');
      mobileAllBtn.style.color = '#a0a0a0';
    }
  }
  if (state.desktopLogoutAllBtn) {
    if (isEnabled) {
      state.desktopLogoutAllBtn.classList.remove('disabled');
      state.desktopLogoutAllBtn.classList.add('enabled');
    } else {
      state.desktopLogoutAllBtn.classList.add('disabled');
      state.desktopLogoutAllBtn.classList.remove('enabled');
    }
  }
}

export async function closeAllSessions() {
  if (state.activeSessionsCount < 2) {
    alert("No hay otras sesiones activas. Solo tienes la sesión actual.");
    return;
  }
  if (confirm("⚠️ ¿Estás seguro de que quieres cerrar la sesión en todos los dispositivos? Esta acción cerrará tu sesión actual.")) {
    try {
      const res = await apiRequest('/api/artistas/cerrar-todas-sesiones', { method: 'POST' });
      if (res && res.success) {
        alert("✅ Todas las sesiones han sido cerradas correctamente.");
      } else {
        alert("❌ " + (res.error || "Error inesperado."));
      }
    } catch (error) {
      console.error("Error al cerrar todas las sesiones:", error);
      alert("❌ Error de conexión. Cerrando sesión local por seguridad.");
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ARTISTA_KEY);
      window.location.href = '/';
    }
  }
}