// js/config.js
import { logout } from './auth.js';

export const API_BASE_URL = 'https://backend-fundacion-atpe.onrender.com';
export const JWT_SECRET = 'your_super_secret_key';
export const ARTISTA_KEY = 'artistaData';
export const TOKEN_KEY = 'artistaToken';

// Interceptor global para manejar sesiones expiradas (401)
export async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
            ...options.headers
        }
    });

    // Si el backend devuelve 401 (Sesión expirada/cerrada), cerramos sesión local
    if (res.status === 401) {
        console.warn("🚨 Sesión expirada o cerrada remotamente. Cerrando sesión local.");
        logout();
        location.reload();
        return null; // Detiene la ejecución para evitar errores
    }

    return res;
}