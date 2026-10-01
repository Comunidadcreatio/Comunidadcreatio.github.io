// LOS 3 `!important` DEL TEMA OSCURO (auth.css) y el que dependia de ellos.
//
// LA REGLA: `[data-theme="dark"] .form-group input/select, .date-group select, #login-form input
// { background-color, border-color, color !important }`. Los 3 `!important` estaban ahi para
// ganarle a la regla que da el aspecto a los campos (`... #login-form input, #registro-form
// input`), que lleva IDS y por eso ganaba por especificidad. Y mientras esa regla llevara
// `!important`, el `:valid` oscuro (el borde VERDE) tambien tenia que llevarlo para ganarle a
// esta: era la "pareja" de la que hablaba el README.
//
// LO QUE HACE: le da a la regla oscura los selectores con id que le faltaban (el del REGISTRO,
// que es el unico que la regla de los campos nombra y esta no) y le quita los 3 `!important`:
// asi gana por especificidad, que es lo que toca. Y en cuanto eso pasa, el `:valid` oscuro
// puede soltar el suyo (1 mas), porque ya le gana por especificidad (un nivel mas por el id y
// otro por la pseudoclase).
//
// LO QUE NO SE TOCA: el `#registro-form input[data-required="true"]:valid` (el verde de los
// campos del registro) lleva `!important` y se queda: es el que pinta el verde de esos campos.
//
// Uso:  node scripts/rediseno-campos-oscuro.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/auth.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');
let t = ORIGINAL;
const fallos = [];
const cambio = (buscar, reemplazar, veces, etiqueta) => {
    const trozos = t.split(buscar);
    const encontrados = trozos.length - 1;
    if (encontrados !== veces) { fallos.push(`${etiqueta}: esperaba ${veces} y encontro ${encontrados}`); return; }
    t = trozos.join(reemplazar);
    console.log(`ok   ${etiqueta} (${encontrados})`);
};

// ---- 1. La regla del tema oscuro: gana por especificidad (y se le anade el registro) ----
cambio(`[data-theme="dark"] .form-group input,
[data-theme="dark"] .form-group select,
[data-theme="dark"] .date-group select,
[data-theme="dark"] #login-form input {
    background-color: rgba(0, 0, 0, 0.15) !important;
    border-color: rgba(255, 255, 255, 0.10) !important;
    color: var(--color-ink) !important;
}`, `/* Sin \`!important\`: gana por especificidad. Lleva los selectores con id porque la regla
   que da el aspecto a los campos nombra \`#login-form input\` y \`#registro-form input\`, y una
   regla con id gana a una sin el. El del REGISTRO faltaba: sin el, en oscuro esos campos se
   pondrian blancos (el fondo lo pone esta regla). */
[data-theme="dark"] .form-group input,
[data-theme="dark"] .form-group select,
[data-theme="dark"] .date-group select,
[data-theme="dark"] #login-form input,
[data-theme="dark"] #registro-form input {
    background-color: rgba(0, 0, 0, 0.15);
    border-color: rgba(255, 255, 255, 0.10);
    color: var(--color-ink);
}`, 1, 'tema oscuro de los campos: 3 !important menos + selector del registro');

// ---- 2. El :valid oscuro ya no necesita !important (le gana por especificidad) ----
cambio(`[data-theme="dark"] input:valid,
[data-theme="dark"] select:valid,
[data-theme="dark"] #login-form input:valid,
[data-theme="dark"] #forgot-section input:valid {
    border: 1.5px solid #22c55e !important;`, `[data-theme="dark"] input:valid,
[data-theme="dark"] select:valid,
[data-theme="dark"] #login-form input:valid,
[data-theme="dark"] #forgot-section input:valid {
    border: 1.5px solid #22c55e;`, 1, ':valid oscuro: sin !important (gana por especificidad)');

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cuenta = (s) => (sinComentarios(s).match(/!important/g) || []).length;
const quitados = cuenta(ORIGINAL) - cuenta(t);
if (quitados !== 4) { console.error(`OJO: se esperaban 4 !important menos y han salido ${quitados}. NO se escribe.`); process.exit(1); }
writeFileSync(RUTA, t, 'utf8');
console.log(`\nauth.css: ${cuenta(ORIGINAL)} -> ${cuenta(t)} !important (4 menos)`);
