// js/galeria.js
import { API_BASE_URL, apiRequest } from './config.js';

export async function cargarGaleria(container) {
    container.innerHTML = '<p>Cargando obras...</p>';
    try {
        const res = await apiRequest('/obras');
        if (!res) return [];
        return await res.json();
    } catch (error) {
        console.error("Error al cargar la galería:", error);
        container.innerHTML = '<p>Error al cargar las obras.</p>';
        return [];
    }
}

export function mostrarGaleria(obras, container, onDetalle) {
    container.innerHTML = '';
    obras.forEach(obra => {
        const card = document.createElement('div');
        card.className = 'obra-card';
        card.innerHTML = `
            <img src="${obra.imagen_url}" alt="${obra.titulo}">
            <h3>${obra.titulo}</h3>
            <p>${obra.artista}</p>
            <p>Precio: $${obra.precio || 'N/A'}</p>
            <button data-id="${obra.id}">Ver Detalles</button>
        `;
        card.querySelector('button').addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            onDetalle(id);
        });
        container.appendChild(card);
    });
}