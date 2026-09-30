// @ts-check
// js/bloqueo-fondo.js
// ============================================================
// BLOQUEO DEL SCROLL DEL FONDO (compartido)
// ============================================================
// Lo usan la hoja de comentarios y el modal de descripciÃ³n. Se lleva un
// CONTADOR DE MOTIVOS: si los dos piden el bloqueo a la vez, el fondo no se
// libera hasta que el Ãºltimo lo suelte. Sin esto, cerrar uno de los dos
// descongelarÃ­a el fondo mientras el otro sigue abierto.
//
// Hay DOS mecanismos, y hacen falta los dos:
//
// 1) CONGELAR CONTENEDORES (`overflow: hidden`). Se aplica a
//    #galeria-container â€”el scroller de la galerÃ­a, que es position: fixed con
//    overflow-y: autoâ€” y tambiÃ©n a <html> y <body>, porque el DOCUMENTO
//    asimismo scrollea: body tiene `min-height: 100vh` + `padding-bottom: 100px`.
//    Se guarda y se devuelve el valor previo de cada uno para no pisar a otros
//    mÃ³dulos (por ejemplo el pull-to-refresh).
//
// 2) BLOQUEAR EL GESTO (`touchmove` + preventDefault). Este es el importante y
//    el que costÃ³ dar con Ã©l: enumerar scrollers NO basta, porque el modal de
//    descripciÃ³n es `pointer-events: none` A PROPÃ“SITO (deja pasar los toques al
//    header, al nav y a la tarjeta de detrÃ¡s). El dedo puede caer entonces en
//    cualquier elemento de debajo y arrastrar, y como no hay un Ãºnico scroller
//    siempre queda uno sin enumerar. Cancelando el GESTO da igual quÃ© haya
//    debajo.
//
// El listener de touchmove se aÃ±ade y se quita junto con el bloqueo: un
// touchmove no-pasivo a nivel de documento desactiva el camino rÃ¡pido de scroll
// del navegador, asÃ­ que no debe quedarse puesto de forma permanente.
// ============================================================
const motivos = new Set();

// Los tipos se declaran a mano porque empiezan en `null` y luego reciben otra cosa: sin
// esto, TypeScript cree que su tipo ES null y no deja asignarles nada (lo avisó el chequeo).
/** @type {Map<HTMLElement, string> | null} */   // overflow previo de cada elemento
let previos = null;
/** @type {((e: TouchEvent) => void) | null} */  // listener de touchmove activo
let guardia = null;

/** @returns {HTMLElement[]} */
function objetivos() {
    return [
        document.getElementById('galeria-container'),
        document.documentElement,
        document.body
    ].filter((el) => el !== null);
}

// Â¿Hay que cancelar este gesto? SÃ­, salvo que empiece en un Ã¡rea que SÃ debe
// poder scrollear (el texto de la descripciÃ³n, si es largo).
/**
 * @param {EventTarget | null} target
 * @param {string} [selectorPermitido]
 * @returns {boolean}
 */
export function gestoBloqueado(target, selectorPermitido) {
    if (!selectorPermitido) return true;
    // Se comprueba que sea un Element (un EventTarget cualquiera no tiene `closest`).
    const el = target instanceof Element ? target : null;
    if (!el) return true;
    return !el.closest(selectorPermitido);
}

/** @param {string} [selectorPermitido] */
export function activarGuardiaGesto(selectorPermitido) {
    if (guardia) return;
    guardia = (e) => {
        if (!gestoBloqueado(e.target, selectorPermitido)) return;
        if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', guardia, { passive: false });
}

export function desactivarGuardiaGesto() {
    if (!guardia) return;
    document.removeEventListener('touchmove', guardia);
    guardia = null;
}

export function bloquearFondo(motivo) {
    motivos.add(motivo);
    if (previos) return;             // ya estaba bloqueado
    previos = new Map();
    for (const el of objetivos()) {
        previos.set(el, el.style.overflow || '');
        el.style.overflow = 'hidden';
    }
}

export function liberarFondo(motivo) {
    motivos.delete(motivo);
    if (motivos.size > 0) return;    // todavÃ­a hay alguien que lo bloquea
    if (previos) {
        for (const [el, valor] of previos) el.style.overflow = valor;
        previos = null;
    }
}

export function fondoBloqueado() {
    return motivos.size > 0;
}
