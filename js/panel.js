// js/panel.js
import { API_BASE_URL } from './config.js';

export async function cargarMisObras(token, page = 1, limit = 10, search = '', sortBy = 'id', order = 'DESC') {
    try {
        const params = new URLSearchParams({ page, limit, search, sortBy, order });
        const res = await fetch(`${API_BASE_URL}/api/artistas/mis-obras?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return await res.json();
    } catch (error) {
        console.error("Error al cargar mis obras:", error);
        return { success: false, obras: [], total: 0 };
    }
}

export function renderizarTabla(obras, container, onEditar, onEliminar, onDuplicar) { // <--- Agregar onDuplicar aquí
    container.innerHTML = '';
    obras.forEach(obra => {
        const tr = document.createElement('tr');

        // Determinar estilo y texto para el status
        const statusText = obra.status || 'Desconocido';
        // Simplificamos el texto para mostrar solo "Activo" o "Inactivo" si es muy largo
        let statusDisplay = statusText;
        let statusColor = '#6c757d'; // Gris por defecto

        if (statusText.includes('Activo')) {
            statusColor = '#28a745'; // Verde
            statusDisplay = '✅ Activo';
        } else if (statusText.includes('Inactivo')) {
            statusColor = '#dc3545'; // Rojo
            statusDisplay = '❌ Inactivo';
        }

        tr.innerHTML = `
            <td>${obra.id_personalizado || obra.id}</td>
            <td>${obra.titulo}</td>
            <td>${obra.precio}</td>
            <td><img src="${obra.imagen_url}" width="50"></td>
            <td>
                <span style="color: ${statusColor}; font-weight: bold; padding: 4px 8px; border-radius: 4px; border: 1px solid ${statusColor};">
                    ${statusDisplay}
                </span>
            </td>
            <td>
                <button class="btn-editar" data-id="${obra.id}">Editar</button>
                <button class="btn-eliminar" data-id="${obra.id}">Eliminar</button>
                <button class="btn-duplicar" data-id="${obra.id}">Duplicar</button> <!-- <--- Agregar esto -->
            </td>
        `;
        tr.querySelector('.btn-editar').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            onEditar(id);
        });
        tr.querySelector('.btn-eliminar').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (confirm('¿Estás seguro de eliminar esta obra?')) {
                onEliminar(id);
            }
        });
        // js/panel.js - Línea donde está el listener del botón duplicar
        tr.querySelector('.btn-duplicar').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            // ✅ ESTA ES LA SOLUCIÓN: Verificar que sea una función antes de ejecutarla
            if (typeof onDuplicar === 'function') {
                onDuplicar(id);
            } else {
                console.warn('El botón duplicar no está configurado. Revisa tu main.js');
                // Opcional: alert('Función duplicar no disponible');
            }
});
        container.appendChild(tr);
    });
}

export async function guardarObra(token, formData, idEdicion = null) {
    const url = idEdicion ? `${API_BASE_URL}/obras/${idEdicion}` : `${API_BASE_URL}/obras`;
    const method = idEdicion ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
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