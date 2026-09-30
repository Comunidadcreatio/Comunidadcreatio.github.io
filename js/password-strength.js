// @ts-check
// js/password-strength.js
// ============================================================
// Fortaleza de contraseÃ±a â€” UNA sola implementaciÃ³n en el frontend.
// ------------------------------------------------------------
// Es una copia EXACTA del middleware del backend
// (backend-fundacion/middleware/passwordStrength.js), que es la autoridad:
// el servidor rechaza con 400 cualquier contraseÃ±a de nivel < 3.
//
// Niveles: 1=DÃ©bil, 2=Media, 3=Buena, 4=Fuerte.
// Reglas: 8+ caracteres obligatorios y, ademÃ¡s, contar mayÃºsculas, minÃºsculas,
// nÃºmeros, sÃ­mbolos y un bonus por 12+ caracteres. Con 3 puntos el nivel es 2
// ("Media") y el backend LO RECHAZA: hacen falta 4 puntos para el nivel 3.
//
// âš  Si cambia el backend, hay que cambiar esto a la vez. Otras copias de esta
// fÃ³rmula viven en js/auth-logic.js y en reset-password.html (usan `nivel`).
// ============================================================

export const NIVEL_MIN_PASSWORD = 3;

export function evaluarRequisitosPassword(password) {
    return {
        length: password.length >= 8,
        lower: /[a-z]/.test(password),
        upper: /[A-Z]/.test(password),
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    };
}

const ETIQUETAS = { 1: 'DÃ©bil', 2: 'Media', 3: 'Buena', 4: 'Fuerte' };

// Devuelve { nivel, etiqueta, requisitos }: nivel 0..4 (0 = vacÃ­a).
export function calcularFortalezaPassword(password) {
    if (!password) {
        return { nivel: 0, etiqueta: '', requisitos: evaluarRequisitosPassword('') };
    }

    const req = evaluarRequisitosPassword(password);
    let puntos = Object.values(req).filter(Boolean).length;
    if (password.length >= 12) puntos++;      // bonus por longitud generosa

    let nivel;
    if (puntos <= 2) nivel = 1;
    else if (puntos === 3) nivel = 2;
    else if (puntos === 4) nivel = 3;
    else nivel = 4;

    // Sin la longitud mÃ­nima nunca pasa de dÃ©bil
    if (!req.length) nivel = 1;

    return { nivel, etiqueta: ETIQUETAS[nivel] || '', requisitos: req };
}
