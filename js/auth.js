// js/auth.js
import { API_BASE_URL, TOKEN_KEY, ARTISTA_KEY, apiRequest } from './config.js';

export let token = localStorage.getItem(TOKEN_KEY);
export let artistaActual = JSON.parse(localStorage.getItem(ARTISTA_KEY));

export async function login(email, password) {
    try {
        const res = await apiRequest('/api/artistas/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (!res) return { success: false, error: "Sesión cerrada remotamente" };
        const data = await res.json();
        if (data.success) {
            token = data.token;
            artistaActual = data.artista;
            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
            return { success: true, artista: data.artista };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        console.error("Error en login:", error);
        return { success: false, error: "Error de conexión" };
    }
}

export async function register(nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero) {
    try {
        const res = await apiRequest('/api/artistas/registro', {
            method: 'POST',
            body: JSON.stringify({ nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero })
        });
        if (!res) return { success: false, error: "Sesión cerrada remotamente" };
        return await res.json();
    } catch (error) {
        console.error("Error en registro:", error);
        return { success: false, error: "Error de conexión" };
    }
}

export function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ARTISTA_KEY);
    token = null;
    artistaActual = null;
    document.dispatchEvent(new Event('userLogout'));
}