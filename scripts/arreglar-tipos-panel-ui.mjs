// Anotaciones de tipos para js/panel-ui.js (ultimo modulo sin @ts-check).
//
// POR QUE UN SCRIPT: los ficheros del proyecto son UTF-8 sin BOM y no se pueden reescribir
// con operaciones de texto de PowerShell (ver README). Node lee y escribe UTF-8 de verdad.
//
// panel-ui.js usa LF (problogs.js era el raro, con CRLF): aqui NO hay que convertir nada.
//
// COMO FUNCIONA: cada cambio dice EXACTAMENTE el texto que busca y cuantas veces tiene que
// aparecer. Si un solo cambio no cuadra, no se escribe NADA. Son anotaciones JSDoc y guardas:
// en ejecucion no cambia el resultado (salvo que un TypeError latente deja de poder pasar).
//
// Uso:  node scripts/arreglar-tipos-panel-ui.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'js/panel-ui.js';
let t = readFileSync(RUTA, 'utf8');

const CAMBIOS = [
    // ---- 1. Tipos propios del fichero ----
    {
        que: 'typedefs (campo con valor y obra del panel) + cache tipada',
        buscar: `// Cache del dropdown Mis Cavents para tiempo real
let _caventsCache = { loaded: false, data: [] };`,
        reemplazar: `/**
 * Un campo del formulario que tiene \`.value\`: los \`[data-required="true"]\` del editor son
 * inputs (6), textareas (1) y selects (9), asi que el tipo es la union de los tres.
 * @typedef {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} CampoConValor
 */

/**
 * Una obra (Cavent) tal como la devuelve el backend. Solo los campos que usa este modulo;
 * el indice deja pasar los demas sin tener que listarlos.
 * @typedef {{ id?: number | string, titulo?: string, status?: string, precio?: number | string,
 *             id_personalizado?: number | string, localizacion?: string, peso?: number | string,
 *             [clave: string]: any }} ObraPanel
 */

// Cache del dropdown Mis Cavents para tiempo real. Se anota porque \`data: []\` se quedaba en
// \`never[]\` y entonces TODO lo que se leia de una obra (id, titulo, status, precio) daba error.
/** @type {{ loaded: boolean, data: ObraPanel[] }} */
let _caventsCache = { loaded: false, data: [] };`,
        veces: 1
    },
    {
        que: 'irAlPasoFn (empezaba en null: su tipo ERA null)',
        buscar: `let irAlPasoFn = null;   // lo rellena setupStepNavigation (showStep)`,
        reemplazar: `/** @type {((index: number) => void) | null} */
let irAlPasoFn = null;   // lo rellena setupStepNavigation (showStep)`,
        veces: 1
    },

    // ---- 2. Campos del formulario ----
    {
        que: 'camposObligatoriosVacios: la lista de campos',
        buscar: `    return Array.from(document.querySelectorAll('#obra-form [data-required="true"]'))`,
        reemplazar: `    return Array.from(/** @type {NodeListOf<CampoConValor>} */ (document.querySelectorAll('#obra-form [data-required="true"]')))`,
        veces: 1
    },
    {
        que: 'updateFormProgress y setupFormAccordions: los mismos campos',
        buscar: `    const requiredFields = obraForm.querySelectorAll('[data-required="true"]');`,
        reemplazar: `    const requiredFields = /** @type {NodeListOf<CampoConValor>} */ (obraForm.querySelectorAll('[data-required="true"]'));`,
        veces: 2
    },
    {
        que: 'idEdicion (getElementById || {} no da el tipo)',
        buscar: `    const idEdicion = (document.getElementById('input-id-edicion') || {}).value || '';`,
        reemplazar: `    const idEdicion = /** @type {HTMLInputElement | null} */ (document.getElementById('input-id-edicion'))?.value || '';`,
        veces: 1
    },

    // ---- 3. Canvas: el contexto 2D nunca es null cuando se pide '2d' ----
    {
        que: 'ctx de los dos canvas',
        buscar: `const ctx = canvas.getContext('2d');`,
        reemplazar: `const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));`,
        veces: 2
    },

    // ---- 4. Inputs de imagen y el `this` de sus manejadores ----
    {
        que: 'input del primer hueco libre',
        buscar: `                const inp = document.getElementById(\`input-imagen-\${i}\`);`,
        reemplazar: `                const inp = /** @type {HTMLInputElement | null} */ (document.getElementById(\`input-imagen-\${i}\`));`,
        veces: 1
    },
    {
        que: 'manejador de cambio de cada input de imagen (this -> input)',
        buscar: `        const input = document.getElementById(\`input-imagen-\${i}\`);
        if (input) {
            input.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        agregarImagen(file, e.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            });
        }`,
        reemplazar: `        const input = /** @type {HTMLInputElement | null} */ (document.getElementById(\`input-imagen-\${i}\`));
        if (input) {
            input.addEventListener('change', function() {
                // El manejador no usa \`this\`: se lee el propio input (que ya tiene tipo).
                const file = input.files?.[0];
                if (file) {
                    const reader = new FileReader();
                    // Tampoco hace falta \`e.target\` (que puede ser null): el FileReader es \`reader\`.
                    reader.onload = function() {
                        agregarImagen(file, reader.result);
                    };
                    reader.readAsDataURL(file);
                }
            });
        }`,
        veces: 1
    },

    // ---- 5. Botones de ratio: `this` y el viewport ----
    {
        que: 'botones de ratio (this -> btn)',
        buscar: `    document.querySelectorAll(".ratio-btn").forEach(btn => {
        btn.addEventListener("click", async function() {
            document.querySelectorAll(".ratio-btn").forEach(b => b.classList.remove("active"));
            this.classList.add("active");
            aspectRatio = this.dataset.ratio;
            document.getElementById("carrusel-viewport").style.aspectRatio = aspectRatio;`,
        reemplazar: `    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".ratio-btn")).forEach(btn => {
        btn.addEventListener("click", async () => {
            /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".ratio-btn")).forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            // Los dos botones traen data-ratio; si faltara, se queda el 4/5 de partida.
            aspectRatio = btn.dataset.ratio || '4/5';
            document.getElementById("carrusel-viewport")?.style.aspectRatio = aspectRatio;`,
        veces: 1
    },

    // ---- 6. Guardas de verdad en los clics delegados ----
    {
        que: 'clic fuera del select personalizado',
        buscar: `        if (!e.target.closest('.custom-select')) cerrar();`,
        reemplazar: `        if (!(e.target instanceof Element) || !e.target.closest('.custom-select')) cerrar();`,
        veces: 1
    },
    {
        que: 'clic fuera de la barra de cavents',
        buscar: `        if (!e.target.closest('#obra-cavents-bar')) {`,
        reemplazar: `        if (!(e.target instanceof Element) || !e.target.closest('#obra-cavents-bar')) {`,
        veces: 1
    },

    // ---- 7. Selects del formulario (selectedOptions es de HTMLSelectElement) ----
    {
        que: 'syncCustomSelects: los selects del formulario',
        buscar: `            document.querySelectorAll('#obra-form .form-group select').forEach(sel => {`,
        reemplazar: `            /** @type {NodeListOf<HTMLSelectElement>} */ (document.querySelectorAll('#obra-form .form-group select')).forEach(sel => {`,
        veces: 1
    },

    // ---- 8. El error capturado es `unknown` hasta que se dice que es un Error ----
    {
        que: 'catch de editarCavent',
        buscar: `        } catch (e) {
            debugLog.error('Error editando cavent:', e.message, e.stack);
            showError('Error al cargar la obra: ' + (e.message || ''));
        }`,
        reemplazar: `        } catch (e) {
            // Lo capturado es \`unknown\`: se declara que es un Error para poder leerlo.
            const err = /** @type {Error} */ (e);
            debugLog.error('Error editando cavent:', err.message, err.stack);
            showError('Error al cargar la obra: ' + (err.message || ''));
        }`,
        veces: 1
    },

    // ---- 9. La caja de contenido de cada paso puede no existir ----
    {
        que: 'showStep: guarda de la caja de contenido',
        buscar: `            const content = s.querySelector('.form-section-content');
            if (i === index) {
                s.classList.remove('hidden');
                content.classList.remove('hidden');
            } else {
                s.classList.add('hidden');
                content.classList.add('hidden');
            }`,
        reemplazar: `            const content = s.querySelector('.form-section-content');
            if (i === index) {
                s.classList.remove('hidden');
                if (content) content.classList.remove('hidden');
            } else {
                s.classList.add('hidden');
                if (content) content.classList.add('hidden');
            }`,
        veces: 1
    }
];

const fallos = [];
for (const c of CAMBIOS) {
    const trozos = t.split(c.buscar);
    const encontrados = trozos.length - 1;
    if (encontrados !== c.veces) {
        fallos.push(`${c.que}: esperaba ${c.veces} y encontro ${encontrados}`);
        continue;
    }
    t = trozos.join(c.reemplazar);
    console.log(`ok   ${c.que} (${encontrados})`);
}

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}
writeFileSync(RUTA, t, 'utf8');
console.log(`\n${CAMBIOS.length} cambios aplicados en ${RUTA}.`);
