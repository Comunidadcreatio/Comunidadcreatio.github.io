// @ts-check
// js/overlays.js
// ============================================================
// Registro de CAPAS FLOTANTES que tapan la app y congelan el fondo
// (vista previa de Problogs, cajÃ³n de comentarios, modal de descripciÃ³nâ€¦).
// ------------------------------------------------------------
// Cada capa se registra aquÃ­ con su funciÃ³n de cierre, y la NAVEGACIÃ“N las
// cierra TODAS antes de cambiar de secciÃ³n.
//
// Por quÃ©: antes cada capa solo se cerraba desde su propio botÃ³n âœ•. Si el
// usuario navegaba con la capa abierta (flecha del header, iconos del nav
// inferior, `+` de crear, Chatâ€¦), la capa seguÃ­a colgada de <body> por encima
// de la secciÃ³n nueva y su bloquearFondo() dejaba <html>, <body> y
// #galeria-container con overflow:hidden: la app parecÃ­a rota y solo se
// recuperaba pulsando el âœ• de una capa que ya no se veÃ­a.
//
// MÃ³dulo HOJA a propÃ³sito (no importa a nadie): asÃ­ cualquier mÃ³dulo puede
// registrar su capa sin crear ciclos de importaciÃ³n.
// ============================================================

const cerradores = new Map();

// nombre: para depurar. cerrar: debe ser IDEMPOTENTE (seguro aunque la capa no
// estÃ© abierta) y sÃ­ncrono.
export function registrarOverlay(nombre, cerrar) {
    if (typeof cerrar === 'function') cerradores.set(nombre, cerrar);
}

export function cerrarOverlaysFlotantes() {
    for (const [nombre, cerrar] of cerradores) {
        try {
            cerrar();
        } catch (err) {
            // Una capa que falla al cerrarse no debe impedir que se cierren las
            // demÃ¡s ni romper la navegaciÃ³n.
            console.error(`[overlays] no se pudo cerrar "${nombre}":`, err);
        }
    }
}
