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

    // Si el backend devuelve 401 y NO es la ruta de eliminar cuenta, cerramos sesión
    if (res.status === 401 && !endpoint.includes('/api/artistas/eliminar-cuenta')) {
        // ... resto de la lógica para manejar el 401 en otras rutas ...
    }

    return res;
}