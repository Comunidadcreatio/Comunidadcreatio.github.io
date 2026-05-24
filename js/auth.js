// js/auth.js
import { API_BASE_URL, TOKEN_KEY, ARTISTA_KEY } from './config.js';

export let token = localStorage.getItem(TOKEN_KEY);
export let artistaActual = JSON.parse(localStorage.getItem(ARTISTA_KEY));

export async function login(email, password) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/artistas/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
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

export async function register(nombre_artista, nombre_real, email, password, telefono, pais, ciudad, instagram, fecha_nacimiento, genero) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/artistas/registro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                nombre_artista,
                nombre_real, 
                email, 
                password,
                telefono,
                pais,
                ciudad,
                instagram,
                fecha_nacimiento,
                genero
            })
        });
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
    // Disparar un evento personalizado para que el main.js se entere
    document.dispatchEvent(new Event('userLogout'));
}