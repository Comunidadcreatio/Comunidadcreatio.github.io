// js/panel.js
import { API_BASE_URL, apiRequest } from './config.js';

export async function cargarMisObras(token, page = 1, limit = 10, search = '', sortBy = 'id', order = 'DESC') {
    try {
        const params = new URLSearchParams({ page, limit, search, sortBy, order });
        const data = await apiRequest(`/api/artistas/mis-obras?${params}`);
        return data;
    } catch (error) {
        console.error("Error al cargar mis obras:", error);
        return { success: false, obras: [], total: 0 };
    }
}


// Iconos SVG para las acciones de la tabla
const ICONS = {
    editar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
    duplicar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    eliminar: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>'
};

export function renderizarTabla(obras, container, onEditar, onEliminar, onDuplicar) {
    container.innerHTML = '';
    obras.forEach(obra => {
        const tr = document.createElement('tr');
        const statusText = obra.status || '';
        let statusClass = 'status-desconocido';
        let statusLabel = 'Desconocido';
        if (statusText.includes('Activo')) {
            statusClass = 'status-activo';
            statusLabel = 'Activo';
        } else if (statusText.includes('Inactivo')) {
            statusClass = 'status-inactivo';
            statusLabel = 'Inactivo';
        }
        // ✅ Usar miniatura para la tabla
        const imgSrc = obra.imagen_thumbnail_url || obra.imagen_url || '';
        tr.innerHTML = `
            <td>${obra.id_personalizado || obra.id}</td>
            <td>${obra.titulo}</td>
            <td>${obra.precio}</td>
            <td><img src="${imgSrc}" width="50"></td>
            <td><span class="status-text ${statusClass}">${statusLabel}</span></td>
            <td>
                <div class="acciones-obra">
                    <button class="btn-accion btn-editar" data-id="${obra.id}" title="Editar" aria-label="Editar obra">${ICONS.editar}</button>
                    <button class="btn-accion btn-duplicar" data-id="${obra.id}" title="Duplicar" aria-label="Duplicar obra">${ICONS.duplicar}</button>
                    <button class="btn-accion btn-eliminar" data-id="${obra.id}" title="Eliminar" aria-label="Eliminar obra">${ICONS.eliminar}</button>
                </div>
            </td>
        `;
        tr.querySelector('.btn-editar').addEventListener('click', (e) => onEditar(e.currentTarget.dataset.id));
        tr.querySelector('.btn-eliminar').addEventListener('click', (e) => onEliminar(e.currentTarget.dataset.id));
        tr.querySelector('.btn-duplicar').addEventListener('click', (e) => {
            if (typeof onDuplicar === 'function') onDuplicar(e.currentTarget.dataset.id);
        });
        container.appendChild(tr);
    });
}

export async function guardarObra(token, formData, idEdicion = null) {
    const url = idEdicion ? `/obras/${idEdicion}` : '/obras';
    const method = idEdicion ? 'PUT' : 'POST';
    try {
        const res = await fetch(`${API_BASE_URL}${url}`, {
            method: method,
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        return await res.json();
    } catch (error) {
        console.error("Error al guardar obra:", error);
        return { success: false, error: "Error de conexión" };
    }
}

export async function eliminarObra(token, id) {
    try {
        const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.ok;
    } catch (error) {
        console.error("Error al eliminar obra:", error);
        return false;
    }
}