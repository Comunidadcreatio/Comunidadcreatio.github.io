// js/panel.js
// js/panel.js
import { API_BASE_URL, apiRequest } from './config.js';
import { debugLog } from './utils.js';

export async function cargarMisObras(page = 1, limit = 10, search = '', sortBy = 'id', order = 'DESC') {
    const params = new URLSearchParams({ page, limit, search, sortBy, order });
    const data = await apiRequest(`/api/artistas/mis-obras?${params}`);
    return data;
}


export async function guardarObra(formData, idEdicion = null) {
    const url = idEdicion ? `/obras/${idEdicion}` : '/obras';
    const method = idEdicion ? 'PUT' : 'POST';
    try {
        const res = await fetch(`${API_BASE_URL}${url}`, {
            method: method,
            credentials: 'include',
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
        const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        return res.ok;
    } catch (error) {
        debugLog.error("Error al eliminar obra:", error);
        return false;
    }
}