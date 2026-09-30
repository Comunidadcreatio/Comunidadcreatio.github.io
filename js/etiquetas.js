// @ts-check
// js/etiquetas.js
// Carrusel de etiquetas de los cavents (campo "etiquetas" separado por comas).
// Se muestra entre el buscador y el grid: cada etiqueta en un chip de color
// con un contador de apariciones. SelecciÃ³n MÃšLTIPLE (AND): cada etiqueta
// activa muestra una "x"; el grid se filtra en vivo con las seleccionadas.
import { getObrasGrid, filtrarGridPorEtiqueta } from './galeria.js?v=2ce565a0f3';
import { escapeHtml, normalizarTexto } from './utils.js?v=972ca7ff30';

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
            ? '<span class="tag-x" data-tag="' + escapeHtml(t.nombre) + '" title="Quitar filtro">Ã—</span>'
            : '';
        return '<button type="button" class="tag-chip' + (activa ? ' activa' : '') + '" data-tag="' + escapeHtml(t.nombre) + '" style="background:' + color + '">' +
            '<span class="tag-nombre">' + escapeHtml(t.nombre) + '</span>' +
            '<span class="tag-count">' + t.count + '</span>' + x + '</button>';
    }).join('');

    // `querySelectorAll` devuelve `Element`, que no tiene `dataset`: los chips son
    // botones, asi que se pide la lista como `HTMLElement` (lo aviso el chequeo de tipos).
    /** @type {NodeListOf<HTMLElement>} */
    const chips = contenedor.querySelectorAll('.tag-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            // CRÃTICO: evitar que el clic burbujee al outside-click de busqueda.js.
            e.stopPropagation();
            // Garantizar modo A al filtrar: buscador y carrusel SIEMPRE visibles
            const panel = document.getElementById('search-panel');
            if (panel) panel.classList.remove('modo-busqueda');
            document.body.classList.remove('search-escribiendo');
            const tag = chip.dataset.tag;
            const key = normalizarTexto(tag);
            // `e.target` puede ser null y un EventTarget no tiene `closest`: se comprueba
            // antes. Lo avisó el chequeo de tipos, y sin esta comprobación un clic raro
            // (por ejemplo sobre un nodo de texto) lanzaba TypeError.
            const objetivo = e.target instanceof Element ? e.target : null;
            if (objetivo && objetivo.closest('.tag-x')) {
                // La "x" desactiva SOLO esa etiqueta (el resto sigue filtrado)
                etiquetasActivas.delete(key);
            } else {
                // Toggle: seleccionar/deseleccionar esta etiqueta
                if (etiquetasActivas.has(key)) etiquetasActivas.delete(key);
                else etiquetasActivas.add(key);
            }
            // Actualizar SOLO este chip en el sitio (sin re-render de todo el
            // carrusel): la activaciÃ³n se anima con transiciÃ³n CSS + "pop".
            actualizarChipEnSitio(chip, key);
            // Si el chip quedÃ³ fuera de la pantalla, centrarlo con scroll suave
            centrarChipSiNecesario(chip);
            filtrarGridPorEtiqueta([...etiquetasActivas]);
        });
    });
}

// Activa/desactiva UN chip en el sitio: clase .activa + "Ã—" de quitar filtro.
// (Antes se re-renderizaba todo el carrusel, lo que rompÃ­a la transiciÃ³n fluida.)
function actualizarChipEnSitio(chip, key) {
    const activa = etiquetasActivas.has(key);
    chip.classList.toggle('activa', activa);
    let x = chip.querySelector('.tag-x');
    if (activa && !x) {
        x = document.createElement('span');
        x.className = 'tag-x';
        x.dataset.tag = chip.dataset.tag;
        x.title = 'Quitar filtro';
        x.textContent = 'Ã—';
        chip.appendChild(x);
    } else if (!activa && x) {
        x.remove();
    }
    // "Pop" sutil de confirmaciÃ³n (se reinicia aunque se toque repetido)
    chip.classList.remove('tag-pop');
    void chip.offsetWidth;
    chip.classList.add('tag-pop');
}

// Si el chip tocado estÃ¡ parcialmente fuera de la pantalla, lo centra con
// scroll suave (con scroll-snap queda alineado).
function centrarChipSiNecesario(chip) {
    const contenedor = document.getElementById('tags-carrusel');
    if (!contenedor) return;
    const cr = contenedor.getBoundingClientRect();
    const r = chip.getBoundingClientRect();
    if (r.left < cr.left || r.right > cr.right) {
        chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
}
