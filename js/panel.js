// js/panel.js
// js/panel.js
import { API_BASE_URL, apiRequest, getAuthToken } from './config.js?v=9d0b140cf8';
import { debugLog } from './utils.js?v=58a350cb86';

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
        return res.ok;
    } catch (error) {
        debugLog.error("Error al eliminar obra:", error);
        return false;
    }
}