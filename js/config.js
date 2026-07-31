// js/config.js
import { debugLog } from './utils.js';

export const API_BASE_URL = 'https://backend-fundacion-atpe.onrender.com';
export const ARTISTA_KEY = 'artistaData';

// NOTA: El token JWT ya no se guarda en localStorage.
// Ahora el backend lo envía como cookie HttpOnly, Secure, SameSite=Strict.
// El navegador la adjunta automáticamente en cada request gracias a credentials: 'include'.

export async function apiRequest(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            credentials: 'include', // Envía la cookie HttpOnly automáticamente
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (res.status === 401 && !endpoint.endsWith('/eliminar-cuenta')) {
            debugLog.warn("🚨 Sesión expirada o cerrada remotamente. Cerrando sesión local.");
            localStorage.removeItem(ARTISTA_KEY);
            // Disparamos evento para que la app reaccione
            document.dispatchEvent(new Event('userLogout'));
            return { success: false, error: "Sesión expirada. Por favor inicia sesión nuevamente." };
        }

        let data;
        try {
            data = await res.json();
        } catch (e) {
            debugLog.error("Error parsing JSON response:", e);
            return { success: false, error: "Respuesta inválida del servidor." };
        }
        return data;
    } catch (error) {
        debugLog.error("Error en apiRequest:", error);
        return { success: false, error: "Error de conexión. Intenta más tarde." };
    }
}
