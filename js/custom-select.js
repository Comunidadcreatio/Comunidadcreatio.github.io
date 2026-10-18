// @ts-check
// js/custom-select.js
// Desplegable accesible: sustituye un <select> nativo por un boton que se comporta como un
// COMBOBOX de verdad (role=combobox + listbox, aria-expanded, aria-controls,
// aria-activedescendant, aria-selected) y responde al teclado igual que el nativo:
// flechas, Home/End, Enter/Espacio, Escape, Tab y busqueda por letra.
//
// POR QUE EXISTE: el asistente de registro tenia su propia copia del conversor, vieja y SOLO de
// raton: los 6 desplegables (rol, pais, dia, mes, ano, genero) no se podian abrir con teclado ni
// anunciaban nada a un lector de pantalla, porque el <select> real queda en `display: none`.
// El panel ya tenia la version buena; esto la extrae para que no vuelva a haber dos.
// (2026-10-18)
//
// El nombre accesible del control sale del <label for="id"> del campo. Si no lo hay, se usa el
// placeholder: por eso las paginas que lo usan deben poner su <label> (aunque sea visually-hidden).

/**
 * @param {HTMLSelectElement | null} selectEl
 * @param {string} [placeholder]
 */
export function initCustomSelect(selectEl, placeholder) {
    if (!selectEl || selectEl.dataset.customReady === '1') return;
    selectEl.dataset.customReady = '1';
    // Alias no-nulo: dentro de los closures TS no conserva el estrechamiento del parametro.
    const sel = selectEl;
    sel.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    const padre = /** @type {HTMLElement} */ (sel.parentNode);
    padre.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);

    const idBase = sel.id || 'custom-select';
    const dropdownId = idBase + '-lista';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.textContent = placeholder || 'Seleccionar';
    // El nombre accesible sale del <label> del campo (los del formulario lo tienen).
    const label = document.querySelector('label[for="' + idBase + '"]');
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', dropdownId);
    trigger.setAttribute('aria-label', label ? label.textContent.replace(/\*/g, '').trim() : (placeholder || 'Seleccionar'));
    // Si el select ya tiene un valor preseleccionado, mostrarlo
    if (sel.selectedOptions[0] && sel.selectedOptions[0].value) {
        trigger.textContent = sel.selectedOptions[0].textContent;
    }
    wrapper.appendChild(trigger);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';
    dropdown.id = dropdownId;
    dropdown.setAttribute('role', 'listbox');
    wrapper.appendChild(dropdown);

    /** @type {number} indice de la opcion marcada con el teclado */
    let resaltado = -1;

    function opciones() {
        return Array.from(dropdown.querySelectorAll('.custom-select-option'));
    }

    /** @param {number} indice */
    function resaltar(indice) {
        const lista = opciones();
        if (!lista.length) return;
        resaltado = (indice + lista.length) % lista.length;
        lista.forEach((el, i) => el.classList.toggle('resaltada', i === resaltado));
        trigger.setAttribute('aria-activedescendant', lista[resaltado].id);
        lista[resaltado].scrollIntoView({ block: 'nearest' });
    }

    function abrir() {
        buildOptions();
        positionDropdown();
        dropdown.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        const marcada = opciones().findIndex((el) => el.getAttribute('aria-selected') === 'true');
        resaltar(marcada >= 0 ? marcada : 0);
    }

    function cerrar() {
        dropdown.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
    }

    /** @param {number} indice */
    function elegir(indice) {
        const lista = opciones();
        const item = /** @type {HTMLElement} */ (lista[indice]);
        if (!item) return;
        const opt = Array.from(sel.options).find((o) => o.value === item.dataset.value);
        sel.value = /** @type {string} */ (item.dataset.value);
        trigger.textContent = opt ? opt.textContent : item.textContent;
        lista.forEach((el) => el.setAttribute('aria-selected', String(el === item)));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        cerrar();
        trigger.focus();
    }

    function buildOptions() {
        dropdown.innerHTML = '';
        Array.from(sel.querySelectorAll('option')).forEach((opt, i) => {
            if (opt.disabled && !opt.value) return;   // el placeholder no es una opcion
            const item = document.createElement('div');
            item.className = 'custom-select-option';
            item.textContent = opt.textContent;
            item.dataset.value = opt.value;
            item.id = idBase + '-opcion-' + i;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(sel.value === opt.value));
            item.addEventListener('click', () => elegir(opciones().indexOf(item)));
            dropdown.appendChild(item);
        });
    }

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = Math.min(rect.left, window.innerWidth - rect.width - 24) + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dropdown.classList.contains('open')) cerrar();
        else abrir();
    });

    trigger.addEventListener('keydown', (e) => {
        const abierto = dropdown.classList.contains('open');
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                e.preventDefault();
                if (!abierto) abrir();
                else resaltar(resaltado + (e.key === 'ArrowDown' ? 1 : -1));
                break;
            case 'Home':
                if (abierto) { e.preventDefault(); resaltar(0); }
                break;
            case 'End':
                if (abierto) { e.preventDefault(); resaltar(opciones().length - 1); }
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (!abierto) abrir();
                else if (resaltado >= 0) elegir(resaltado);
                break;
            case 'Escape':
                if (abierto) { e.preventDefault(); e.stopPropagation(); cerrar(); }
                break;
            case 'Tab':
                if (abierto) cerrar();
                break;
            default: {
                // Busqueda por letra (como un <select> nativo)
                if (!abierto || e.key.length !== 1) break;
                const letra = e.key.toLowerCase();
                const lista = opciones();
                const desde = resaltado + 1;
                for (let i = 0; i < lista.length; i++) {
                    const idx = (desde + i) % lista.length;
                    if (lista[idx].textContent.toLowerCase().startsWith(letra)) {
                        e.preventDefault();
                        resaltar(idx);
                        break;
                    }
                }
            }
        }
    });

    window.addEventListener('scroll', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
    }, { passive: true });

    document.addEventListener('click', (e) => {
        if (!(e.target instanceof Element) || !e.target.closest('.custom-select')) cerrar();
    });

    sel.addEventListener('change', () => {
        const selected = sel.selectedOptions[0];
        if (selected) trigger.textContent = selected.textContent;
    });
}
