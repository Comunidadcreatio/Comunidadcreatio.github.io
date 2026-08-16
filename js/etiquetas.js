// js/etiquetas.js
// Carrusel de etiquetas de los cavents (campo "etiquetas" separado por comas).
// Se muestra entre el buscador y el grid: cada etiqueta en un chip con borde
// curvo y un contador de apariciones en todos los cavents. Al seleccionar una
// etiqueta se filtra el grid; la "x" quita el filtro.
import { getObrasGrid, filtrarGridPorEtiqueta } from './galeria.js?v=ef39746f70';
import { escapeHtml, normalizarTexto } from './utils.js?v=f1ecb334f1';

let etiquetaActiva = null;

export function getEtiquetaActiva() { return etiquetaActiva; }

// Limpia el filtro (se llama al refrescar el grid con la lupa/PTR)
export function resetEtiquetas() {
    etiquetaActiva = null;
}

export function renderEtiquetasCarrusel() {
    const contenedor = document.getElementById('tags-carrusel');
    if (!contenedor) return;

    const obras = getObrasGrid() || [];
    const conteo = new Map(); // key (minúsculas) -> { nombre, count }
    obras.forEach(o => {
        String(o.etiquetas || '').split(',').forEach(raw => {
            const nombre = String(raw || '').trim();
            if (!nombre) return;
            const key = normalizarTexto(nombre);
            if (!conteo.has(key)) conteo.set(key, { nombre, count: 0 });
            conteo.get(key).count++;
        });
    });

    const tags = [...conteo.values()].sort((a, b) => b.count - a.count);
    if (tags.length === 0) {
        contenedor.innerHTML = '';
        contenedor.classList.add('hidden');
        document.body.classList.remove('search-con-etiquetas');
        return;
    }
    contenedor.classList.remove('hidden');
    // El grid debe bajar para dejar espacio al carrusel
    document.body.classList.add('search-con-etiquetas');
    contenedor.innerHTML = tags.map(t => {
        const activa = etiquetaActiva === normalizarTexto(t.nombre);
        const x = activa
            ? '<span class="tag-x" data-tag="' + escapeHtml(t.nombre) + '" title="Quitar filtro">×</span>'
            : '';
        return '<button type="button" class="tag-chip' + (activa ? ' activa' : '') + '" data-tag="' + escapeHtml(t.nombre) + '">' +
            '<span class="tag-nombre">' + escapeHtml(t.nombre) + '</span>' +
            '<span class="tag-count">' + t.count + '</span>' + x + '</button>';
    }).join('');

    contenedor.querySelectorAll('.tag-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            if (e.target.closest('.tag-x')) {
                // Quitar filtro: volver a mostrar todos los cavents
                etiquetaActiva = null;
                filtrarGridPorEtiqueta(null);
                renderEtiquetasCarrusel();
                return;
            }
            const tag = chip.dataset.tag;
            etiquetaActiva = normalizarTexto(tag);
            filtrarGridPorEtiqueta(tag);
            renderEtiquetasCarrusel();
        });
    });
}
