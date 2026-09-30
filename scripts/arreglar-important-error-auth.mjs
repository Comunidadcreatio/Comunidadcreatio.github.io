// PILOTO de `!important`, TERCERA parte: que `.input-error` gane SIEMPRE.
//
// LO QUE SE MIDIO (verificar-estados-inputs-auth.mjs): con un campo RELLENO y valido, la clase
// `.input-error` NO pinta el borde rojo; se queda verde. La causa es de especificidad:
//
//   `#login-form input:valid`          -> (1 id, 1 pseudoclase, 1 etiqueta) + !important
//   `.input-error` y `input.input-error` -> (0, 1, 0) y (0, 1, 1) + !important
//
// Gana la primera. Hoy no se ve porque el formulario de login solo marca con `.input-error`
// los campos que ADEMAS son :invalid (vacio o mal formado), y el registro tiene su propia
// regla con id (`#registro-form input.input-error`). Pero es un fallo latente: el dia que el
// login marque un campo valido ("estas credenciales no coinciden"), saldra en VERDE.
//
// EL ARREGLO: la regla del error pasa a ir DESPUES de las de `:valid` y con los selectores del
// formulario delante. Asi, en el empate de especificidad, gana la ULTIMA (que es la del error).
// El error tiene que verse siempre: es la unica regla que no puede perder.
//
// Uso:  node scripts/arreglar-important-error-auth.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/auth.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');
let t = ORIGINAL;

const QUITAR = `/* .input-error: rojo */
.input-error,
input.input-error,
select.input-error {
    border: 1.5px solid #e74c3c !important;
}

`;

const PONER = `/* .input-error: rojo. Va DESPUES de las reglas de :valid y con los selectores del formulario
   delante, a proposito: \`#login-form input:valid\` tiene la MISMA especificidad (un id, una
   clase, una etiqueta) que \`#login-form input.input-error\`, asi que en el empate gana la
   ULTIMA. Y el error tiene que verse siempre, aunque el campo este relleno y sea valido.
   Se descubrio midiendo: el campo con error y valido se quedaba verde. */
.input-error,
input.input-error,
select.input-error,
#login-form input.input-error,
#forgot-section input.input-error {
    border: 1.5px solid #e74c3c !important;
}
`;

const ANCLA = `[data-theme="dark"] input:valid,
[data-theme="dark"] select:valid,
[data-theme="dark"] #login-form input:valid,
[data-theme="dark"] #forgot-section input:valid {
    border: 1.5px solid #22c55e !important;
    box-shadow: none;
    background-color: rgba(0, 0, 0, 0.15);
}
`;

const fallos = [];
if ((t.split(QUITAR).length - 1) !== 1) fallos.push('el bloque viejo de .input-error no aparece exactamente 1 vez');
if ((t.split(ANCLA).length - 1) !== 1) fallos.push('el ancla (bloque :valid oscuro) no aparece exactamente 1 vez');
if (fallos.length) {
    console.error('NO SE HA ESCRITO NADA:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}

t = t.split(QUITAR).join('');                  // se quita de donde estaba
t = t.split(ANCLA).join(ANCLA + '\n' + PONER); // y se pone justo despues del :valid oscuro

if (t === ORIGINAL) { console.error('El fichero no ha cambiado. NO se escribe.'); process.exit(1); }
const antes = (ORIGINAL.match(/!important/g) || []).length;
const despues = (t.match(/!important/g) || []).length;
if (antes !== despues) { console.error(`OJO: cambia el numero de !important (${antes} -> ${despues}). NO se escribe.`); process.exit(1); }

writeFileSync(RUTA, t, 'utf8');
console.log('ok   la regla .input-error se ha movido despues de :valid y cubre #login-form y #forgot-section');
console.log(`     ${antes} !important (los mismos: solo cambia el orden y los selectores)`);
