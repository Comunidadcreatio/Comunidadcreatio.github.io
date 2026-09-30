// @ts-check
// js/panel.js
// js/panel.js
import { API_BASE_URL, apiRequest, getAuthToken, cerrarSesionLocal } from './config.js?v=8ca6f6755e';
import { debugLog } from './utils.js?v=20b06d3d70';

// Las escrituras van con fetch crudo porque llevan FormData (apiRequest fija
// Content-Type: application/json). Eso obliga a replicar aquÃ­ el manejo del 401:
// si no, una sesiÃ³n caducada dejaba la app "dentro" con un error de validaciÃ³n
// en pantalla en vez de cerrar sesiÃ³n.
function sesionExpirada(res) {
    if (res.status !== 401) return false;
    cerrarSesionLocal();
    return true;
}

export async function cargarMisObras(page = 1, limit = 10, search = '', sortBy = 'id', order = 'DESC') {
    // URLSearchParams quiere texto: se convierten los números (antes los convertía él solo).
    const params = new URLSearchParams({ page: String(page), limit: String(limit), search, sortBy, order });
    const data = await apiRequest(`/api/artistas/mis-obras?${params}`);
    return data;
}


export async function guardarObra(formData, idEdicion = null) {
    const url = idEdicion ? `/obras/${idEdicion}` : '/obras';
    const method = idEdicion ? 'PUT' : 'POST';
    try {
        const authToken = getAuthToken();
        const res = await fetch(`${API_BASE_URL}${url}`, {
            method: method,
            credentials: 'include',
            headers: authToken ? { Authorization: 'Bearer ' + authToken } : {},
            body: formData
        });
        if (sesionExpirada(res)) {
            return { success: false, error: "SesiÃ³n expirada. Por favor inicia sesiÃ³n nuevamente." };
        }
        return await res.json();
    } catch (error) {
        debugLog.error("Error al guardar obra:", error);
        return { success: false, error: "Error de conexiÃ³n" };
    }
}

export async function eliminarObra(id) {
    try {
        const authToken = getAuthToken();
        const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: authToken ? { Authorization: 'Bearer ' + authToken } : {}
        });
        if (sesionExpirada(res)) return false;
        return res.ok;
    } catch (error) {
        debugLog.error("Error al eliminar obra:", error);
        return false;
    }
}
