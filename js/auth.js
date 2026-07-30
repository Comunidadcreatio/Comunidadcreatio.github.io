// js/auth.js
import { API_BASE_URL, ARTISTA_KEY, apiRequest } from './config.js';
import { debugLog } from './utils.js';

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
        const res = await fetch(`${API_BASE_URL}/api/artistas/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            token = true;
            artistaActual = data.artista;
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
            return { success: true, artista: data.artista };
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
    token = false;
    artistaActual = null;
    document.dispatchEvent(new Event('userLogout'));
}
