// js/bloqueo-fondo.js
// ============================================================
// BLOQUEO DEL SCROLL DEL FONDO (compartido)
// ------------------------------------------------------------
// Lo usan la hoja de comentarios y el modal de descripción. Se lleva un
// CONTADOR DE MOTIVOS: si los dos piden el bloqueo a la vez, el fondo no se
// libera hasta que el último lo suelte. Sin esto, cerrar uno de los dos
// descongelaría el fondo mientras el otro sigue abierto.
//
// El que scrollea de verdad es #galeria-container (position: fixed con
// overflow-y: auto), NO el documento: por eso se ataca a ese contenedor y no a
// `body` (bloquear body no haría nada).
//
// El ALTO en píxeles lo fija aparte la hoja de comentarios: solo ella abre el
// teclado, y es lo único que puede encoger el layout.
// ============================================================
const motivos = new Set();
let overflowPrevio = null;

function contenedor() {
    return document.getElementById('galeria-container');
}

export function bloquearFondo(motivo) {
    motivos.add(motivo);
    const c = contenedor();
    if (!c) return;
    if (overflowPrevio === null) overflowPrevio = c.style.overflow || '';
    c.style.overflow = 'hidden';
}

export function liberarFondo(motivo) {
    motivos.delete(motivo);
    if (motivos.size > 0) return;        // todavía hay alguien que lo bloquea
    const c = contenedor();
    if (c && overflowPrevio !== null) {
        c.style.overflow = overflowPrevio;
    }
    overflowPrevio = null;
}

export function fondoBloqueado() {
    return motivos.size > 0;
}
