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


export function renderizarTabla(obras, container, onEditar, onEliminar, onDuplicar) {
    container.innerHTML = '';
    obras.forEach(obra => {
        const tr = document.createElement('tr');
        const statusText = obra.status || 'Desconocido';
        let statusDisplay = statusText;
        let statusColor = '#6c757d';
        if (statusText.includes('Activo')) {
            statusColor = '#28a745';
            statusDisplay = '✅ Activo';
        } else if (statusText.includes('Inactivo')) {
            statusColor = '#dc3545';
            statusDisplay = '❌ Inactivo';
        }
        // ✅ Usar miniatura para la tabla
        const imgSrc = obra.imagen_thumbnail_url || obra.imagen_url || '';
        tr.innerHTML = `
            <td>${obra.id_personalizado || obra.id}</td>
            <td>${obra.titulo}</td>
            <td>${obra.precio}</td>
            <td><img src="${imgSrc}" width="50"></td>
            <td><span style="color: ${statusColor}; font-weight: bold; padding: 4px 8px; border-radius: 4px; border: 1px solid ${statusColor};">${statusDisplay}</span></td>
            <td>
                <button class="btn-editar" data-id="${obra.id}">Editar</button>
                <button class="btn-eliminar" data-id="${obra.id}">Eliminar</button>
                <button class="btn-duplicar" data-id="${obra.id}">Duplicar</button>
            </td>
        `;
        tr.querySelector('.btn-editar').addEventListener('click', (e) => onEditar(e.target.dataset.id));
        tr.querySelector('.btn-eliminar').addEventListener('click', (e) => {
            if (confirm('¿Estás seguro de eliminar esta obra?')) onEliminar(e.target.dataset.id);
        });
        tr.querySelector('.btn-duplicar').addEventListener('click', (e) => {
            if (typeof onDuplicar === 'function') onDuplicar(e.target.dataset.id);
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