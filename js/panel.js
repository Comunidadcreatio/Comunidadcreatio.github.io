// js/panel.js
// js/panel.js
import { API_BASE_URL, apiRequest, getAuthToken, cerrarSesionLocal } from './config.js?v=a76a9b6092';
import { debugLog } from './utils.js?v=8861448e13';

// Las escrituras van con fetch crudo porque llevan FormData (apiRequest fija
// Content-Type: application/json). Eso obliga a replicar aquí el manejo del 401:
// si no, una sesión caducada dejaba la app "dentro" con un error de validación
// en pantalla en vez de cerrar sesión.
function sesionExpirada(res) {
    if (res.status !== 401) return false;
    cerrarSesionLocal();
    return true;
}

export async function cargarMisObras(page = 1, limit = 10, search = '', sortBy = 'id', order = 'DESC') {
    const params = new URLSearchParams({ page, limit, search, sortBy, order });
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
            return { success: false, error: "Sesión expirada. Por favor inicia sesión nuevamente." };
        }
        return await res.json();
    } catch (error) {
        debugLog.error("Error al guardar obra:", error);
        return { success: false, error: "Error de conexión" };
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
