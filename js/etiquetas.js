// js/etiquetas.js
// Carrusel de etiquetas de los cavents (campo "etiquetas" separado por comas).
// Se muestra entre el buscador y el grid: cada etiqueta en un chip de color
// con un contador de apariciones. Selección MÚLTIPLE (AND): cada etiqueta
// activa muestra una "x"; el grid se filtra en vivo con las seleccionadas.
import { getObrasGrid, filtrarGridPorEtiqueta } from './galeria.js?v=ee65b6c1a3';
import { escapeHtml, normalizarTexto } from './utils.js?v=f1ecb334f1';

// Paleta de colores para los chips (cada etiqueta un color distinto)
const PALETA = [
    '#c0392b', '#d35400', '#e67e22', '#16a085', '#27ae60',
    '#2980b9', '#8e44ad', '#e84393', '#d63031', '#00b894',
    '#0984e3', '#6c5ce7', '#e17055', '#00cec9', '#2c3e50'
];

let etiquetasActivas = new Set();

export function getEtiquetasActivas() { return etiquetasActivas; }

// Limpia el filtro (se llama al refrescar el grid con la lupa/PTR)
export function resetEtiquetas() {
    etiquetasActivas.clear();
}

export function renderEtiquetasCarrusel() {
    const contenedor = document.getElementById('tags-carrusel');
    if (!contenedor) return;

    const obras = getObrasGrid() || [];
    const conteo = new Map(); // key (normalizada) -> { nombre, count }
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
    contenedor.innerHTML = tags.map((t, i) => {
        const key = normalizarTexto(t.nombre);
        const activa = etiquetasActivas.has(key);
        const color = PALETA[i % PALETA.length];
        const x = activa
            ? '<span class="tag-x" data-tag="' + escapeHtml(t.nombre) + '" title="Quitar filtro">×</span>'
            : '';
        return '<button type="button" class="tag-chip' + (activa ? ' activa' : '') + '" data-tag="' + escapeHtml(t.nombre) + '" style="background:' + color + '">' +
            '<span class="tag-nombre">' + escapeHtml(t.nombre) + '</span>' +
            '<span class="tag-count">' + t.count + '</span>' + x + '</button>';
    }).join('');

    contenedor.querySelectorAll('.tag-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            // CRÍTICO: evitar que el clic burbujee al outside-click de busqueda.js.
            // Al re-renderizar el carrusel, el chip se destruye y panel.contains()
            // da false, lo que cerraba el buscador como si se tocara fuera.
            e.stopPropagation();
            // Garantizar modo A al filtrar: buscador y carrusel SIEMPRE visibles
            const panel = document.getElementById('search-panel');
            if (panel) panel.classList.remove('modo-busqueda');
            document.body.classList.remove('search-escribiendo');
            const tag = chip.dataset.tag;
            const key = normalizarTexto(tag);
            if (e.target.closest('.tag-x')) {
                // La "x" desactiva SOLO esa etiqueta (el resto sigue filtrado)
                etiquetasActivas.delete(key);
            } else {
                // Toggle: seleccionar/deseleccionar esta etiqueta
                if (etiquetasActivas.has(key)) etiquetasActivas.delete(key);
                else etiquetasActivas.add(key);
            }
            filtrarGridPorEtiqueta([...etiquetasActivas]);
            renderEtiquetasCarrusel();
        });
    });
}
