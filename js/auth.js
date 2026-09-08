// js/auth.js
import { ARTISTA_KEY, AUTH_TOKEN_KEY, AUTH_TOKEN_PERSIST_KEY, apiRequest } from './config.js?v=2e0c2e7288';
import { debugLog } from './utils.js?v=d86e42a5e7';

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

// ============================================
// ROL DEL USUARIO (artista | comprador | coleccionista | curador | galeria)
// El backend aún no guarda el rol: se elige en el registro y se recuerda por
// email en el dispositivo (creatio_rol_<email>). Si el backend algún día
// devuelve data.artista.rol, ese valor tiene prioridad. Por defecto todos son
// tratados como 'artista' (comportamiento actual: no rompe a nadie).
// ============================================
export const ROLES = {
    artista: 'artista',
    comprador: 'comprador',
    coleccionista: 'coleccionista',
    curador: 'curador',
    galeria: 'galeria'
};

export function rolKey(email) {
    return 'creatio_rol_' + String(email || '').trim().toLowerCase();
}

function rolGuardadoLocal(email) {
    try {
        return localStorage.getItem(rolKey(email)) || null;
    } catch (e) {
        return null;
    }
}

// Devuelve el rol efectivo del usuario actual: prioridad al rol del backend
// (artistaActual.rol), luego al guardado local por email, luego 'artista'.
export function obtenerRolUsuario() {
    if (artistaActual) {
        if (artistaActual.rol && artistaActual.rol !== 'artista') return artistaActual.rol;
        const local = rolGuardadoLocal(artistaActual.email);
        if (local && local !== 'artista') return local;
    }
    return 'artista';
}

export function esArtista() {
    return obtenerRolUsuario() === 'artista';
}

function guardarRolEnSesionLocal() {
    try {
        const rol = obtenerRolUsuario();
        if (artistaActual && artistaActual.rol !== rol) {
            artistaActual = { ...artistaActual, rol };
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
        }
    } catch (e) { /* silencioso */ }
}

export async function login(email, password) {
    try {
        const data = await apiRequest('/api/artistas/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (data.success) {
            token = true;
            artistaActual = data.artista;
            // Si el backend no devuelve rol, usar el rol local recordado por email
            if (!artistaActual.rol) {
                const local = rolGuardadoLocal(artistaActual.email);
                if (local) artistaActual = { ...artistaActual, rol: local };
            }
            localStorage.setItem(ARTISTA_KEY, JSON.stringify(artistaActual));
            guardarRolEnSesionLocal();
            // Token para navegador (fallback a la cookie): sessionStorage, se borra al cerrar la pestaña
            if (data.token) {
                try { sessionStorage.setItem(AUTH_TOKEN_KEY, data.token); } catch (e) { /* silencioso */ }
            }
            return { success: true, artista: artistaActual, token: data.token };
        } else {
            return { success: false, error: data.error };
        }
    } catch (error) {
        debugLog.error("Error en login:", error);
        return { success: false, error: "Error de conexión" };
    }
}

export async function register(nombre_artista, nombre_real, email, password, telefono, pais, ciudad, fecha_nacimiento, genero, rol = 'artista') {
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
                genero,
                rol
            })
        });
        if (data && data.success) {
            // Recordar el rol elegido por email (el backend puede ignorarlo hoy)
            try { localStorage.setItem(rolKey(email), rol); } catch (e) { /* silencioso */ }
        }
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
    // Cerrar sesión EXPLÍCITAMENTE: se olvida la sesión persistente y se marca
    // que NO debe reanudarse automáticamente al reabrir (las credenciales
    // recordadas + biometría se conservan para que el usuario pueda entrar
    // de nuevo con huella/patrón/PIN o contraseña desde la página de login).
    try {
        localStorage.removeItem(AUTH_TOKEN_PERSIST_KEY);
        localStorage.setItem('creatio_olvido_explicito', '1');
    } catch (e) { /* silencioso */ }
    token = false;
    artistaActual = null;
    document.dispatchEvent(new Event('userLogout'));
}
