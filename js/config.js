// js/config.js
export const API_BASE_URL = 'https://backend-fundacion-atpe.onrender.com';
export const JWT_SECRET = 'your_super_secret_key';
export const ARTISTA_KEY = 'artistaData';
export const TOKEN_KEY = 'artistaToken';

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
    // 🛑 EXCEPCIÓN: SI ES EL ENDPOINT DE ELIMINAR CUENTA, NO REDIRIGIMOS
    if (res.status === 401 && !endpoint.includes('/eliminar-cuenta')) {
        console.warn("🚨 Sesión expirada o cerrada remotamente. Cerrando sesión local.");
        alert("Tu sesión ha sido cerrada remotamente. Serás redirigido a la galería.");
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ARTISTA_KEY);
        location.reload();
        return null;
    }

    return res;
}