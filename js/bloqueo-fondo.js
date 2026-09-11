// js/bloqueo-fondo.js
// ============================================================
// BLOQUEO DEL SCROLL DEL FONDO (compartido)
// ------------------------------------------------------------
// Lo usan la hoja de comentarios y el modal de descripción. Se lleva un
// CONTADOR DE MOTIVOS: si los dos piden el bloqueo a la vez, el fondo no se
// libera hasta que el último lo suelte. Sin esto, cerrar uno de los dos
// descongelaría el fondo mientras el otro sigue abierto.
//
// HAY QUE BLOQUEAR TRES COSAS, y cada una tapa un caso distinto:
//
//   1. #galeria-container — es el scroller de la galería (position: fixed con
//      overflow-y: auto). NO es el documento.
//   2. <html> y <body> — el DOCUMENTO también scrollea: body tiene
//      `min-height: 100vh` + `padding-bottom: 100px`, así que es más alto que la
//      pantalla. Y este es el caso que se escapa: cuando el modal está abierto
//      cubre la pantalla pero NO es scrolleable, así que el navegador ENCADENA
//      el gesto hacia arriba y acaba moviendo el documento. Bloquear solo la
//      galería dejaba ese scroll vivo.
//
// Se guarda y se devuelve el valor PREVIO de cada uno, para no pisar a otros
// módulos (por ejemplo el pull-to-refresh).
// ============================================================
const motivos = new Set();
let previos = null;      // Map<elemento, overflow previo>

function objetivos() {
    return [
        document.getElementById('galeria-container'),
        document.documentElement,
        document.body
    ].filter(Boolean);
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
