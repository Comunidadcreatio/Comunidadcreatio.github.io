// js/config.js
export const API_BASE_URL = 'https://backend-fundacion-atpe.onrender.com';
export const JWT_SECRET = 'your_super_secret_key';
export const ARTISTA_KEY = 'artistaData';
export const TOKEN_KEY = 'artistaToken';

export async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : '',
                ...options.headers
            }
        });

        if (res.status === 401 && !endpoint.includes('/eliminar-cuenta')) {
            console.warn("🚨 Sesión expirada o cerrada remotamente. Cerrando sesión local.");
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(ARTISTA_KEY);
            // No redirigir automáticamente, devolver objeto de error
            return { success: false, error: "Sesión expirada. Por favor inicia sesión nuevamente." };
        }

        const data = await res.json();
        return data;
    } catch (error) {
        console.error("Error en apiRequest:", error);
        return { success: false, error: "Error de conexión. Intenta más tarde." };
    }
}