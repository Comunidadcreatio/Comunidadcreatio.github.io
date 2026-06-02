// js/init-helpers.js
import { token } from './auth.js';
import { apiRequest } from './config.js';

export function cargarSelectoresFecha() {
    const diaSelect = document.getElementById('reg-dia');
    if (diaSelect) {
        for (let i = 1; i <= 31; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            diaSelect.appendChild(option);
        }
    }
    const mesSelect = document.getElementById('reg-mes');
    if (mesSelect) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        meses.forEach((nombre, i) => {
            const option = document.createElement('option');
            option.value = i + 1;
            option.textContent = nombre;
            mesSelect.appendChild(option);
        });
    }
    const anoSelect = document.getElementById('reg-ano');
    if (anoSelect) {
        const maxYear = new Date().getFullYear() - 18;
        for (let i = maxYear; i >= 1900; i--) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            anoSelect.appendChild(option);
        }
    }
}

export async function verificarSesionBackend() {
    if (!token) return false;
    try {
        const res = await apiRequest('/api/artistas/mis-obras?page=1&limit=1');
        return res !== null && res.success !== false;
    } catch (error) {
        return false;
    }
}