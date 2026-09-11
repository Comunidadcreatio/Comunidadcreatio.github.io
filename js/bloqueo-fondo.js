// js/bloqueo-fondo.js
// ============================================================
// BLOQUEO DEL SCROLL DEL FONDO (compartido)
// ============================================================
// Lo usan la hoja de comentarios y el modal de descripción. Se lleva un
// CONTADOR DE MOTIVOS: si los dos piden el bloqueo a la vez, el fondo no se
// libera hasta que el último lo suelte. Sin esto, cerrar uno de los dos
// descongelaría el fondo mientras el otro sigue abierto.
//
// Hay DOS mecanismos, y hacen falta los dos:
//
// 1) CONGELAR CONTENEDORES (`overflow: hidden`). Se aplica a
//    #galeria-container —el scroller de la galería, que es position: fixed con
//    overflow-y: auto— y también a <html> y <body>, porque el DOCUMENTO
//    asimismo scrollea: body tiene `min-height: 100vh` + `padding-bottom: 100px`.
//    Se guarda y se devuelve el valor previo de cada uno para no pisar a otros
//    módulos (por ejemplo el pull-to-refresh).
//
// 2) BLOQUEAR EL GESTO (`touchmove` + preventDefault). Este es el importante y
//    el que costó dar con él: enumerar scrollers NO basta, porque el modal de
//    descripción es `pointer-events: none` A PROPÓSITO (deja pasar los toques al
//    header, al nav y a la tarjeta de detrás). El dedo puede caer entonces en
//    cualquier elemento de debajo y arrastrar, y como no hay un único scroller
//    siempre queda uno sin enumerar. Cancelando el GESTO da igual qué haya
//    debajo.
//
// El listener de touchmove se añade y se quita junto con el bloqueo: un
// touchmove no-pasivo a nivel de documento desactiva el camino rápido de scroll
// del navegador, así que no debe quedarse puesto de forma permanente.
// ============================================================
const motivos = new Set();
let previos = null;      // Map<elemento, overflow previo>
let guardia = null;      // listener de touchmove activo (o null)

function objetivos() {
    return [
        document.getElementById('galeria-container'),
        document.documentElement,
        document.body
    ].filter(Boolean);
}

// ¿Hay que cancelar este gesto? Sí, salvo que empiece en un área que SÍ debe
// poder scrollear (el texto de la descripción, si es largo).
export function gestoBloqueado(target, selectorPermitido) {
    if (!selectorPermitido) return true;
    if (!target || typeof target.closest !== 'function') return true;
    return !target.closest(selectorPermitido);
}

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
    if (motivos.size > 0) return;    // todavía hay alguien que lo bloquea
    if (previos) {
        for (const [el, valor] of previos) el.style.overflow = valor;
        previos = null;
    }
}

export function fondoBloqueado() {
    return motivos.size > 0;
}
