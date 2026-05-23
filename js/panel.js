// js/panel.js
import { API_BASE_URL } from './config.js';

// Obtener las obras del artista logueado
export async function cargarMisObras(token) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/artistas/mis-obras`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return await res.json();
    } catch (error) {
        console.error("Error al cargar mis obras:", error);
        return [];
    }
}

// Renderizar la tabla de obras
export function renderizarTabla(obras, container, onEditar, onEliminar) {
    container.innerHTML = '';
    obras.forEach(obra => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${obra.id}</td>
            <td>${obra.titulo}</td>
            <td>${obra.artista}</td>
            <td>${obra.certificado || 'N/A'}</td>
            <td>${obra.precio || '0'}$</td>
            <td><span class="${obra.status === 'Inactivo' ? 'badge-inactive' : 'badge-active'}">${obra.status || 'Activo'}</span></td>
            <td><img src="${obra.imagen_url}" width="50" style="border-radius:5px; object-fit:cover;"></td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon-edit" data-id="${obra.id}">✏️</button>
                    <button class="btn-icon-delete" data-id="${obra.id}">🗑️</button>
                </div>
            </td>
        `;
        tr.querySelector('.btn-icon-edit').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            onEditar(id);
        });
        tr.querySelector('.btn-icon-delete').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (confirm('¿Estás seguro de eliminar esta obra?')) {
                onEliminar(id);
            }
        });
        container.appendChild(tr);
    });
}

// 🌟 NUEVA FUNCIÓN: Obtener una obra por ID y pasarla al callback
export async function editarObra(token, id, callback) {
    try {
        const res = await fetch(`${API_BASE_URL}/obras/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const obra = await res.json();
        if (obra) {
            callback(obra); // Pasa la obra al callback para llenar el formulario
        } else {
            alert("No se pudo cargar la obra.");
        }
    } catch (error) {
        console.error("Error al cargar la obra:", error);
        alert("Error de conexión al cargar la obra.");
    }
}

// Guardar una obra (Crear o Actualizar)
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

// Eliminar una obra
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