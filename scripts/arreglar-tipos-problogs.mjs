// Anotaciones de tipos para js/problogs.js (pasada de adopcion del @ts-check).
//
// POR QUE UN SCRIPT: el fichero esta en UTF-8 sin BOM y no se puede reescribir con
// operaciones de texto de PowerShell (ver README). Node lee y escribe UTF-8 de verdad.
//
// COMO FUNCIONA: cada cambio dice EXACTAMENTE el texto que busca y cuantas veces tiene
// que aparecer. Si un solo cambio no cuadra, no se escribe NADA (asi no queda el fichero
// a medias). Las anotaciones son JSDoc: NO cambian nada en ejecucion.
//
// Uso:  node scripts/arreglar-tipos-problogs.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'js/problogs.js';
let t = readFileSync(RUTA, 'utf8');

const CAMBIOS = [
    // ---- 1. El tipo que devuelve el backend (para `publicacionAbierta`) ----
    {
        que: 'typedef Problog',
        buscar: `const MAX_IMAGENES = 8;`,
        reemplazar: `/**
 * Una publicacion de Problogs tal como la devuelve el backend: solo los campos que usa
 * este modulo. El indice deja pasar los demas sin tener que listarlos todos.
 * @typedef {{ id?: number | string, titulo?: string, comentarios_count?: number, [clave: string]: any }} Problog
 */
const MAX_IMAGENES = 8;`,
        veces: 1
    },

    // ---- 2. Variables que empiezan en null (su tipo ES null hasta que se anotan) ----
    {
        que: 'portadaNombre',
        buscar: `let portadaNombre = null;`,
        reemplazar: `/** @type {string | null} */ let portadaNombre = null;`,
        veces: 1
    },
    {
        que: 'nombrePortada (local de cargarParaEditar)',
        buscar: `    let nombrePortada = null;`,
        reemplazar: `    /** @type {string | null} */ let nombrePortada = null;`,
        veces: 1
    },
    {
        que: 'observadorFeed',
        buscar: `let observadorFeed = null;`,
        reemplazar: `/** @type {IntersectionObserver | null} */ let observadorFeed = null;`,
        veces: 1
    },
    {
        que: 'lista (ul/ol de renderMarkdown)',
        buscar: `    let lista = null;         // 'ul' | 'ol'`,
        reemplazar: `    /** @type {'ul' | 'ol' | null} */ let lista = null;   // 'ul' | 'ol'`,
        veces: 1
    },
    {
        que: 'publicacionAbierta',
        buscar: `let publicacionAbierta = null;`,
        reemplazar: `/** @type {Problog | null} */ let publicacionAbierta = null;`,
        veces: 1
    },
    {
        que: 'contenedorPerfil y autorPerfil',
        buscar: `let contenedorPerfil = null;
let autorPerfil = null;`,
        reemplazar: `/** @type {HTMLElement | null} */ let contenedorPerfil = null;
/** @type {string | number | null} */ let autorPerfil = null;`,
        veces: 1
    },
    {
        que: 'temporizadorAnchoComentarios',
        buscar: `let temporizadorAnchoComentarios = null;`,
        reemplazar: `/** @type {number | undefined} */
let temporizadorAnchoComentarios;`,
        veces: 1
    },

    // ---- 3. Elementos del DOM: el tipo se deduce del id ----
    {
        que: 'publicado (radio de estado)',
        buscar: `document.querySelector('input[name="problog-estado"][value="publicado"]')`,
        reemplazar: `/** @type {HTMLInputElement | null} */ (document.querySelector('input[name="problog-estado"][value="publicado"]'))`,
        veces: 1
    },
    {
        que: 'estadoSel',
        buscar: `document.querySelector('input[name="problog-estado"]:checked')`,
        reemplazar: `/** @type {HTMLInputElement | null} */ (document.querySelector('input[name="problog-estado"]:checked'))`,
        veces: 1
    },
    {
        que: 'radio (estado al editar)',
        buscar: `document.querySelector('input[name="problog-estado"][value="' + valor + '"]')`,
        reemplazar: `/** @type {HTMLInputElement | null} */ (document.querySelector('input[name="problog-estado"][value="' + valor + '"]'))`,
        veces: 1
    },
    {
        que: 'campo (id del comentario padre)',
        buscar: `    let campo = document.getElementById('problog-responder-comentario-id');`,
        reemplazar: `    /** @type {HTMLInputElement | null} */ let campo = document.getElementById('problog-responder-comentario-id');`,
        veces: 1
    },
    {
        que: 'campoPadre',
        buscar: `    const campoPadre = document.getElementById('problog-responder-comentario-id');`,
        reemplazar: `    const campoPadre = /** @type {HTMLInputElement | null} */ (document.getElementById('problog-responder-comentario-id'));`,
        veces: 1
    },
    {
        que: 'seccion de la barra de responder (envia respuestas)',
        buscar: `    const seccion = document.querySelector('[data-problog-comentarios]');
    if (!seccion) return;
    const texto = document.getElementById('problog-responder-texto');`,
        reemplazar: `    const seccion = /** @type {HTMLElement | null} */ (document.querySelector('[data-problog-comentarios]'));
    if (!seccion) return;
    const texto = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('problog-responder-texto'));`,
        veces: 1
    },
    {
        que: 'texto de la barra de responder (quedan 2)',
        buscar: `const texto = document.getElementById('problog-responder-texto');`,
        reemplazar: `const texto = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('problog-responder-texto'));`,
        veces: 2
    },
    {
        que: 'cajon de comentarios de la barra',
        buscar: `    const cajon = seccion.querySelector('[data-comentario-texto]');`,
        reemplazar: `    const cajon = /** @type {HTMLTextAreaElement | null} */ (seccion.querySelector('[data-comentario-texto]'));`,
        veces: 1
    },
    {
        que: 'input de comentario (2 sitios)',
        buscar: `    const input = seccion.querySelector('[data-comentario-texto]');`,
        reemplazar: `    const input = /** @type {HTMLTextAreaElement | null} */ (seccion.querySelector('[data-comentario-texto]'));`,
        veces: 2
    },
    {
        que: 'boton de enviar de la barra',
        buscar: `    const enviar = barra.querySelector('.problog-responder-icono[type="submit"]');`,
        reemplazar: `    const enviar = /** @type {HTMLButtonElement | null} */ (barra.querySelector('.problog-responder-icono[type="submit"]'));`,
        veces: 1
    },
    {
        que: 'cajas de comentarios (sangrado)',
        buscar: `    const cajas = seccion.querySelectorAll('.problog-comentario-form, .problog-comentario');`,
        reemplazar: `    const cajas = /** @type {NodeListOf<HTMLElement>} */ (seccion.querySelectorAll('.problog-comentario-form, .problog-comentario'));`,
        veces: 1
    },
    {
        que: 'cajon de comentarios (sangrado)',
        buscar: `    const cajon = seccion.querySelector('.problog-comentario-form');`,
        reemplazar: `    const cajon = /** @type {HTMLElement | null} */ (seccion.querySelector('.problog-comentario-form'));`,
        veces: 1
    },

    // ---- 4. Conversiones que el navegador ya hacia solo ----
    {
        que: 'textContent del contador de comentarios',
        buscar: `.forEach((n) => { n.textContent = total; });`,
        reemplazar: `.forEach((n) => { n.textContent = String(total); });`,
        veces: 1
    },
    {
        que: 'evento perfil:problogs (CustomEvent)',
        buscar: `        const d = (e && e.detail) || {};`,
        reemplazar: `        const d = (/** @type {CustomEvent} */ (e)).detail || {};`,
        veces: 1
    },

    // ---- 5. Guardas de verdad: el destino de un evento puede no ser un elemento ----
    {
        que: 'guarda en el input delegado (sangrado)',
        buscar: `document.addEventListener('input', (e) => {
    if (!e.target.closest || !e.target.closest('[data-comentario-texto]')) return;
    setTimeout(ajustarAnchoCajasComentarios, 40);
});`,
        reemplazar: `document.addEventListener('input', (e) => {
    // El destino de un evento input puede no ser un elemento (document, window): sin
    // esta comprobacion, .closest lanzaria un TypeError.
    const objetivo = e.target instanceof Element ? e.target : null;
    if (!objetivo || !objetivo.closest('[data-comentario-texto]')) return;
    setTimeout(ajustarAnchoCajasComentarios, 40);
});`,
        veces: 1
    },
    {
        que: 'guarda en el clic de la vista previa',
        buscar: `        if (e.target.closest('[data-cerrar-vista-previa]')) {`,
        reemplazar: `        if (e.target instanceof Element && e.target.closest('[data-cerrar-vista-previa]')) {`,
        veces: 1
    },
    {
        que: 'guarda en los iconos de formato del editor',
        buscar: `        const btn = e.target.closest('[data-formato]');`,
        reemplazar: `        const btn = e.target instanceof Element ? e.target.closest('[data-formato]') : null;`,
        veces: 1
    },
    {
        que: 'guarda en el clic de cancelar de la barra',
        buscar: `        if (e.target.closest('[data-responder-cancelar]')) dejarDeResponder();`,
        reemplazar: `        if (e.target instanceof Element && e.target.closest('[data-responder-cancelar]')) dejarDeResponder();`,
        veces: 1
    },

    // ---- 6. El temporizador era una propiedad de la funcion ----
    {
        que: 'declaracion del temporizador de recolocar',
        buscar: `// Después de abrir o cerrar la barra hay que recolocarla.
function recolocarBarraResponder() {`,
        reemplazar: `// Segundo recolocado de la barra (el teclado no aparece de golpe). Es una variable del
// modulo y no una propiedad de la funcion: asi el chequeo de tipos ve que existe.
/** @type {number | undefined} */
let timerRecolocarBarra;

// Después de abrir o cerrar la barra hay que recolocarla.
function recolocarBarraResponder() {`,
        veces: 1
    },
    {
        que: 'usos del temporizador de recolocar',
        buscar: `    clearTimeout(recolocarBarraResponder._t);
    recolocarBarraResponder._t = setTimeout(ajustarBarraResponderAlTeclado, 350);`,
        reemplazar: `    clearTimeout(timerRecolocarBarra);
    timerRecolocarBarra = setTimeout(ajustarBarraResponderAlTeclado, 350);`,
        veces: 1
    }
];

// js/problogs.js usa CRLF: los textos de arriba van con \n por legibilidad y aqui se
// pasan a CRLF, que es lo que hay de verdad en el fichero.
const crlf = (s) => s.replace(/\n/g, '\r\n');

const fallos = [];
for (const c of CAMBIOS) {
    const buscar = crlf(c.buscar);
    const trozos = t.split(buscar);
    const encontrados = trozos.length - 1;
    if (encontrados !== c.veces) {
        fallos.push(`${c.que}: esperaba ${c.veces} y encontro ${encontrados}`);
        continue;
    }
    t = trozos.join(crlf(c.reemplazar));
    console.log(`ok   ${c.que} (${encontrados})`);
}

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}
writeFileSync(RUTA, t, 'utf8');
console.log(`\n${CAMBIOS.length} cambios aplicados en ${RUTA}.`);
