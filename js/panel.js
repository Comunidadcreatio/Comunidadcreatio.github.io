// js/panel.js
// js/panel.js
import { API_BASE_URL, apiRequest } from './config.js';
import { escapeHtml, debugLog } from './utils.js';

export async function cargarMisObras(page = 1, limit = 10, search = '', sortBy = 'id', order = 'DESC') {
    try {
        const params = new URLSearchParams({ page, limit, search, sortBy, order });
        const data = await apiRequest(`/api/artistas/mis-obras?${params}`);
        return data;
    } catch (error) {
        debugLog.error("Error al cargar mis obras:", error);
        return { success: false, obras: [], total: 0 };
    }
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