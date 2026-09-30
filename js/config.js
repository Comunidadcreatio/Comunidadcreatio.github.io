// @ts-check
// js/config.js
import { debugLog } from './utils.js?v=d1d5bb9603';

export const API_BASE_URL = 'https://backend-fundacion-atpe.onrender.com';
export const ARTISTA_KEY = 'artistaData';
export const AUTH_TOKEN_KEY = 'creatio_auth_token';
// Token persistente cuando el usuario marca "Recordarme": vive en localStorage
// (sobrevive al cierre de la pestaÃ±a/WebView) y se usa como respaldo al abrir
// la app de nuevo, mientras el JWT siga siendo vÃ¡lido en el backend.
export const AUTH_TOKEN_PERSIST_KEY = 'creatio_auth_token_persist';

// Token de sesiÃ³n para navegador (fallback al cookie HttpOnly).
// Chrome bloquea la cookie de terceros (frontend en vercel.app/github.io â†’
// API en onrender.com es cross-site), asÃ­ que en navegador enviamos
// Authorization: Bearer con el token en sessionStorage (se borra al cerrar
// la pestaÃ±a; el APK Android sigue usando la cookie).
// Con "Recordarme" tambiÃ©n existe el token persistente en localStorage: si la
// sesiÃ³n de la pestaÃ±a se perdiÃ³, se usa ese (y se migra a sessionStorage).
export function getAuthToken() {
    try {
        const ses = sessionStorage.getItem(AUTH_TOKEN_KEY);
        if (ses) return ses;
        const persist = localStorage.getItem(AUTH_TOKEN_PERSIST_KEY);
        if (persist) {
            try { sessionStorage.setItem(AUTH_TOKEN_KEY, persist); } catch (e) {}
            return persist;
        }
        return '';
    } catch (e) { return ''; }
}

// NOTA: El token JWT ya no se guarda en localStorage.
// Ahora el backend lo envÃ­a como cookie HttpOnly, Secure, SameSite=Strict.
// El navegador la adjunta automÃ¡ticamente en cada request gracias a credentials: 'include'.

// Cierra la sesiÃ³n local porque el backend ya no la reconoce (401).
// La usan apiRequest y tambiÃ©n las escrituras con fetch crudo (obras y problogs
// con FormData), que no pasan por aquÃ­: antes un 401 ahÃ­ dejaba al usuario con un
// error raro y la app como si siguiera dentro.
export function cerrarSesionLocal() {
    debugLog.warn('ðŸš¨ SesiÃ³n expirada o cerrada remotamente. Cerrando sesiÃ³n local.');
    localStorage.removeItem(ARTISTA_KEY);
    try { sessionStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) {}
    document.dispatchEvent(new Event('userLogout'));
}

export async function apiRequest(endpoint, options = {}) {
    try {
        const authToken = getAuthToken();
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            credentials: 'include', // EnvÃ­a la cookie HttpOnly automÃ¡ticamente (APK)
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
                ...options.headers
            }
        });

        // NOTA: un 401 en el LOGIN significa credenciales INCORRECTAS (el
        // backend responde con su propio mensaje), no una sesiÃ³n expirada:
        // ese caso se deja pasar para que se muestre el error real.
        if (res.status === 401 && !endpoint.endsWith('/eliminar-cuenta') && !endpoint.endsWith('/api/artistas/login')) {
            cerrarSesionLocal();
            return { success: false, error: "SesiÃ³n expirada. Por favor inicia sesiÃ³n nuevamente." };
        }

        let data;
        try {
            data = await res.json();
        } catch (e) {
            debugLog.error("Error parsing JSON response:", e);
            return { success: false, error: "Respuesta invÃ¡lida del servidor." };
        }
        return data;
    } catch (error) {
        debugLog.error("Error en apiRequest:", error);
        return { success: false, error: "Error de conexiÃ³n. Intenta mÃ¡s tarde." };
    }
}
