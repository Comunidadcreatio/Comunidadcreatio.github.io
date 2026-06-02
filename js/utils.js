// js/utils.js
import { ciudadesPorPais, imagenesAEliminar } from './dom-globals.js';
import { artistaActual } from './auth.js';

export function poblarCiudades(paisSeleccionado) {
    const ciudadSelect = document.getElementById('reg-ciudad');
    if (!ciudadSelect) return;
    ciudadSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Selecciona tu ciudad';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    ciudadSelect.appendChild(defaultOption);
    if (paisSeleccionado && ciudadesPorPais[paisSeleccionado]) {
        const data = ciudadesPorPais[paisSeleccionado];
        Object.keys(data).forEach(departamento => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = departamento;
            data[departamento].forEach(ciudad => {
                const option = document.createElement('option');
                option.value = ciudad;
                option.textContent = ciudad;
                optgroup.appendChild(option);
            });
            ciudadSelect.appendChild(optgroup);
        });
    }
}

export function mostrarErrores(result) {
    if (Array.isArray(result.errors) && result.errors.length > 0) {
        const mensaje = result.errors.join('\n• ');
        alert('❌ Se encontraron los siguientes errores:\n\n• ' + mensaje);
    } else if (result.error) {
        alert('❌ Error: ' + result.error);
    } else {
        alert('❌ Ocurrió un error inesperado. Inténtalo de nuevo.');
    }
}

export function limpiarFormularioCompleto(restaurarArtista = true) {
    const obraForm = document.getElementById('obra-form');
    if (!obraForm) return;
    obraForm.reset();
    document.getElementById('input-id-edicion').value = '';
    document.getElementById('btn-limpiar-campos').classList.add('hidden');
    document.getElementById('btn-guardar').textContent = 'Guardar Obra';
    imagenesAEliminar.clear();
    for (let i = 0; i < 5; i++) {
        const preview = document.getElementById(`preview-${i}`);
        const placeholder = document.getElementById(`placeholder-${i}`);
        const inputFile = document.getElementById(`input-imagen-${i}`);
        if (preview && placeholder) {
            preview.src = '';
            preview.style.display = 'none';
            placeholder.style.display = 'block';
        }
        if (inputFile) inputFile.value = '';
        const btnEliminar = document.querySelector(`.btn-eliminar-imagen[data-index="${i}"]`);
        if (btnEliminar) btnEliminar.style.display = 'none';
    }
    if (restaurarArtista && artistaActual) {
        document.getElementById('input-artista').value = artistaActual.nombre_artista;
    }
}