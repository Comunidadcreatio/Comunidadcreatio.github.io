// @ts-check
// js/config.js
import { debugLog } from './utils.js?v=7e1398d254';

export const API_BASE_URL = 'https://backend-fundacion-atpe.onrender.com';
export const ARTISTA_KEY = 'artistaData';
export const AUTH_TOKEN_KEY = 'creatio_auth_token';
// Token persistente cuando el usuario marca "Recordarme": vive en localStorage
// (sobrevive al cierre de la pestaña/WebView) y se usa como respaldo al abrir
// la app de nuevo, mientras el JWT siga siendo válido en el backend.
export const AUTH_TOKEN_PERSIST_KEY = 'creatio_auth_token_persist';

// Token de sesión para navegador (fallback al cookie HttpOnly).
// Chrome bloquea la cookie de terceros (frontend en vercel.app/github.io →
// API en onrender.com es cross-site), así que en navegador enviamos
// Authorization: Bearer con el token en sessionStorage (se borra al cerrar
// la pestaña; el APK Android sigue usando la cookie).
// Con "Recordarme" también existe el token persistente en localStorage: si la
// sesión de la pestaña se perdió, se usa ese (y se migra a sessionStorage).
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
// Ahora el backend lo envía como cookie HttpOnly, Secure, SameSite=Strict.
// El navegador la adjunta automáticamente en cada request gracias a credentials: 'include'.

// Cierra la sesión local porque el backend ya no la reconoce (401).
// La usan apiRequest y también las escrituras con fetch crudo (obras y problogs
// con FormData), que no pasan por aquí: antes un 401 ahí dejaba al usuario con un
// error raro y la app como si siguiera dentro.
export function cerrarSesionLocal() {
    debugLog.warn('🚨 Sesión expirada o cerrada remotamente. Cerrando sesión local.');
    localStorage.removeItem(ARTISTA_KEY);
    try { sessionStorage.removeItem(AUTH_TOKEN_KEY); } catch (e) {}
    document.dispatchEvent(new Event('userLogout'));
}

/**
 * Error de TRANSPORTE: no hubo respuesta del servidor, la respuesta no era JSON, o la sesion
 * caduco. Se LANZA a proposito para que quien llama pueda distinguirlo de un «no» del servidor.
 *
 * Por que: antes `apiRequest` se tragaba todos los fallos y devolvia `{ success: false }`, igual
 * que un 400 legitimo. Eso hacia imposible distinguirlos, y el codigo de alrededor estaba escrito
 * como si lanzara: los `try/catch` no se ejecutaban nunca, los `.catch()` que revierten un like
 * optimista eran codigo muerto, y un fallo de red se trataba como exito (se vaciaba el input de un
 * comentario, se sumaba +1 al contador, se pintaba "undefined"...). (2026-10-18)
 */
export class ApiError extends Error {
    /** @param {string} mensaje @param {{ status?: number, esSesion?: boolean }} [opciones] */
    constructor(mensaje, opciones = {}) {
        super(mensaje);
        this.name = 'ApiError';
        this.esApiError = true;
        this.status = opciones.status || 0;
        this.esSesion = !!opciones.esSesion;
    }
}

export async function apiRequest(endpoint, options = {}) {
    let res;
    try {
        const authToken = getAuthToken();
        res = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            credentials: 'include', // Envía la cookie HttpOnly automáticamente (APK)
            headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
                ...options.headers
            }
        });
    } catch (error) {
        debugLog.error('Error en apiRequest (red):', error);
        throw new ApiError('Error de conexión. Intenta más tarde.');
    }

    // NOTA: un 401 en el LOGIN significa credenciales INCORRECTAS (el backend responde con su
    // propio mensaje), no una sesión expirada: ese caso se deja pasar para que se muestre el
    // error real. Igual en eliminar-cuenta, donde el 401 es «contraseña incorrecta».
    // Endpoints donde un 401 significa «contraseña incorrecta», NO sesión expirada: el backend
    // responde 401 con su propio mensaje y hay que mostrarlo sin cerrar la sesión. Faltaba
    // cambiar-password (y confirmar-email), así que al fallar la contraseña actual se cerraba la
    // sesión y el usuario veía «Sesión expirada» (2026-10-21).
    const ONCE_401_CON_MENSAJE = ['/api/artistas/login', '/eliminar-cuenta', '/cambiar-password', '/confirmar-email'];
    if (res.status === 401 && !ONCE_401_CON_MENSAJE.some((ruta) => endpoint.endsWith(ruta))) {
        cerrarSesionLocal();
        throw new ApiError('Sesión expirada. Por favor inicia sesión nuevamente.', { status: 401, esSesion: true });
    }

    try {
        return await res.json();
    } catch (e) {
        debugLog.error('Error parsing JSON response:', e);
        throw new ApiError('Respuesta inválida del servidor.', { status: res.status });
    }
}

// RED DE SEGURIDAD: si algun dia una llamada deja escapar un ApiError sin `catch`, que se vea en
// consola con contexto en vez de quedar como una promesa rechazada muda. No muestra nada al
// usuario: avisar es responsabilidad de quien llama (que es quien sabe que texto tiene sentido).
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (ev) => {
        const motivo = /** @type {any} */ (ev.reason);
        if (motivo && motivo.esApiError) {
            debugLog.error('apiRequest rechazo sin manejar (' + (motivo.status || 'red') + '):', motivo.message);
        }
    });
}

