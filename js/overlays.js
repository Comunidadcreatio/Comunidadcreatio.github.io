// js/overlays.js
// ============================================================
// Registro de CAPAS FLOTANTES que tapan la app y congelan el fondo
// (vista previa de Problogs, cajón de comentarios, modal de descripción…).
// ------------------------------------------------------------
// Cada capa se registra aquí con su función de cierre, y la NAVEGACIÓN las
// cierra TODAS antes de cambiar de sección.
//
// Por qué: antes cada capa solo se cerraba desde su propio botón ✕. Si el
// usuario navegaba con la capa abierta (flecha del header, iconos del nav
// inferior, `+` de crear, Chat…), la capa seguía colgada de <body> por encima
// de la sección nueva y su bloquearFondo() dejaba <html>, <body> y
// #galeria-container con overflow:hidden: la app parecía rota y solo se
// recuperaba pulsando el ✕ de una capa que ya no se veía.
//
// Módulo HOJA a propósito (no importa a nadie): así cualquier módulo puede
// registrar su capa sin crear ciclos de importación.
// ============================================================

const cerradores = new Map();

// nombre: para depurar. cerrar: debe ser IDEMPOTENTE (seguro aunque la capa no
// esté abierta) y síncrono.
export function registrarOverlay(nombre, cerrar) {
    if (typeof cerrar === 'function') cerradores.set(nombre, cerrar);
}

export function cerrarOverlaysFlotantes() {
    for (const [nombre, cerrar] of cerradores) {
        try {
            cerrar();
        } catch (err) {
            // Una capa que falla al cerrarse no debe impedir que se cierren las
            // demás ni romper la navegación.
            console.error(`[overlays] no se pudo cerrar "${nombre}":`, err);
        }
    }
}
