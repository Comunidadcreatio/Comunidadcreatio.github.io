// js/auth.js
import { ARTISTA_KEY, AUTH_TOKEN_KEY, apiRequest } from './config.js';
import { debugLog } from './utils.js';

// Timestamp de última actividad del usuario (compartido con main.js y perfil.js)
export let lastActivityTime = Date.now();
export function updateLastActivity() {
    lastActivityTime = Date.now();
}

// El token JWT ahora es una cookie HttpOnly (el frontend NO puede leerlo).
// Usamos la presencia de artistaActual en localStorage como indicador de sesión.
export let token = !!localStorage.getItem(ARTISTA_KEY);
export let artistaActual = (() => {
    try {
        return JSON.parse(localStorage.getItem(ARTISTA_KEY));
    } catch (e) {
        localStorage.removeItem(ARTISTA_KEY);
        return null;
    }
})();

export async function login(email, password) {
    try {
        const data = await apiRequest('/api/artistas/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (data.success) {
            token = true;
            artistaActual = data.artista;
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
            // Token para navegador (fallback a la cookie): sessionStorage, se borra al cerrar la pestaña
            if (data.token) {
                try { sessionStorage.setItem(AUTH_TOKEN_KEY, data.token); } catch (e) { /* silencioso */ }
            }
            return { success: true, artista: data.artista, token: data.token };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        debugLog.error("Error en login:", error);
        return { success: false, error: "Error de conexión" };
    }
}

export async function register(nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero) {
    try {
        const data = await apiRequest('/api/artistas/registro', {
            method: 'POST',
            body: JSON.stringify({
                nombre_artista,
                nombre_real,
                email,
                password,
                telefono,
                pais,
                ciudad,
                fecha_nacimiento,
                genero
            })
        });
        return data;
    } catch (error) {
        debugLog.error("Error en registro:", error);
        return { success: false, error: "Error de conexión" };
    }
}

export function logout() {
    localStorage.removeItem(ARTISTA_KEY);
    localStorage.removeItem('DEBUG');
    try { sessionStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) { /* silencioso */ }
    token = false;
    artistaActual = null;
    document.dispatchEvent(new Event('userLogout'));
}
