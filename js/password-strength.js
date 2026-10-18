// @ts-check
// js/password-strength.js
// ============================================================
// Fortaleza de contraseña — UNA sola implementación en el frontend.
// ------------------------------------------------------------
// Es una copia EXACTA del middleware del backend
// (backend-fundacion/middleware/passwordStrength.js), que es la autoridad:
// el servidor rechaza con 400 cualquier contraseña de nivel < 3.
//
// Niveles: 1=Débil, 2=Media, 3=Buena, 4=Fuerte.
// Reglas: 8+ caracteres obligatorios y, además, contar mayúsculas, minúsculas,
// números, símbolos y un bonus por 12+ caracteres. Con 3 puntos el nivel es 2
// ("Media") y el backend LO RECHAZA: hacen falta 4 puntos para el nivel 3.
//
// ⚠ Si cambia el backend, hay que cambiar esto a la vez. Otras copias de esta
// fórmula viven en js/auth-logic.js y en reset-password.html (usan `nivel`).
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

const ETIQUETAS = { 1: 'Débil', 2: 'Media', 3: 'Buena', 4: 'Fuerte' };

// Devuelve { nivel, etiqueta, requisitos }: nivel 0..4 (0 = vacía).
export function calcularFortalezaPassword(password) {
    // El backend SANA con `.trim()` ANTES de medir la fortaleza (`body('password').trim()` en
    // authRoutes), asi que aqui hay que medir LO MISMO. Medir el valor crudo hacia que un espacio
    // al final contara como «simbolo»: el medidor decia «Buena» y el servidor respondia 400
    // «contraseña muy debil». (2026-10-18)
    const valor = String(password || '').trim();
    if (!valor) {
        return { nivel: 0, etiqueta: '', requisitos: evaluarRequisitosPassword('') };
    }

    const req = evaluarRequisitosPassword(valor);

    // Los CINCO requisitos son obligatorios para aprobar (el minimo es nivel 3): asi la lista que
    // ve el usuario es EXACTAMENTE lo que se exige. Con uno sin marcar no se pasa de «Media»,
    // que el backend rechaza. «Fuerte» es para los mismos cinco con 12+ caracteres. (2026-10-18)
    let nivel;
    if (!req.length) nivel = 1;
    else if (!(req.lower && req.upper && req.number && req.special)) nivel = 2;
    else nivel = valor.length >= 12 ? 4 : 3;

    return { nivel, etiqueta: ETIQUETAS[nivel] || '', requisitos: req };
}
