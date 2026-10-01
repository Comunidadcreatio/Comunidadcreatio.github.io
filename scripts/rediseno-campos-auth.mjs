// REDISENO DE LA JERARQUIA DE LOS CAMPOS (parte 2): alinear y soltar `!important`.
//
// CONTEXTO: en `mover-base-campos.mjs` el aspecto BASE de los campos paso de `components` a
// `base`. Con eso, las reglas de auth.css que antes perdian por especificidad ahora ganan por
// capa... y ESO CAMBIA LO QUE SE VE: la regla de auth.css decia radio 6px, fuente 14px y fondo
// translucido, mientras lo que se veia (porque ganaba la regla base) era radio 8px, fuente
// 16px y fondo blanco. La foto lo midio: 28 diferencias, todas en los campos de `auth.html` a
// 1280px.
//
// QUE HACE ESTE SCRIPT:
//   1. Alinea la regla de auth.css con LO QUE SE VE HOY (radio 8px, fuente 16px, fondo blanco),
//      para que el rediseno NO cambie el aspecto: es un cambio de jerarquia, no un restyling.
//      La fuente se queda en 16px ademas por un motivo practico: por debajo de 16px iOS hace
//      zoom automatico al enfocar un campo.
//   2. Quita el `!important` de 3 bordes de estado de auth.css y nombra los formularios que son
//      suyos en el `:invalid` (igual que ya hacia la regla de `:valid`), para que le gane al
//      rojo de `[data-required="true"]:invalid...` por especificidad y no por importancia.
//   3. ACOTA el rojo del campo obligatorio (`[data-required="true"]:invalid:not(:placeholder-shown)`)
//      a `#panel-artista`, que es de quien es: los 16 campos con `data-required` de index.html
//      estan todos dentro del formulario de la obra. En las pantallas de auth ese rojo se
//      llevaba por delante el gris neutro (`:invalid` de auth.css vive en `@layer base`, y el
//      rojo en `components`: le gana POR CAPA, no por especificidad), y ademas en un `<select>`
//      la regla casa SIEMPRE, porque `:placeholder-shown` no se aplica a los selects: los
//      selects obligatorios salian rojos sin tocarlos. Se le deja el `!important`, que si
//      necesita en el panel (su competidora ahi es mas especifica), y se comprueba con la foto
//      que el panel NO cambia.
//
// LO QUE SE QUEDA CON `!important` (y por que): el tema OSCURO de `.form-group input/select` de
// auth.css. Su selector pierde por especificidad contra `#login-form input` (esa regla ahora
// gana) y el fondo de oscuro tiene que seguir ganando. Esa es la siguiente pareja.
//
// Uso:  node scripts/rediseno-campos-auth.mjs
import { readFileSync, writeFileSync } from 'node:fs';

let auth = readFileSync('css/auth.css', 'utf8');
let form = readFileSync('css/formularios.css', 'utf8');
const authOriginal = auth, formOriginal = form;
const fallos = [];
const cambio = (texto, buscar, reemplazar, veces, etiqueta, destino) => {
    const trozos = texto.split(buscar);
    const encontrados = trozos.length - 1;
    if (encontrados !== veces) { fallos.push(`${etiqueta} (${destino}): esperaba ${veces} y encontro ${encontrados}`); return texto; }
    console.log(`ok   ${etiqueta} (${encontrados})`);
    return trozos.join(reemplazar);
};

// ---- 1. La regla de los campos de auth.css dice lo que se ve hoy ----
const REGLA_CAMPOS = `.form-group input,
.form-group select,
.date-group select,
#login-form input,
#registro-form input {
    width: 100%;
    padding: 12px 14px;
    border: 1.5px solid rgba(0, 0, 0, 0.12);
    border-radius: var(--radius-md);
    font-size: 14px;
    background-color: rgba(255, 255, 255, 0.05);
    color: var(--color-text);
    transition: all 0.2s ease;
    font-family: inherit;
    line-height: 1.5;
    box-shadow: none;
}`;
const REGLA_CAMPOS_NUEVA = `/* OJO con los valores: son LOS QUE SE VEN (medidos con la foto de estilos el 2026-10-01).
   Esta regla gana por CAPA desde que el aspecto base de los campos esta en \`@layer base\`, y
   lo que gana tiene que decir lo mismo que decia el que ganaba antes (radio 8px, fuente 16px,
   fondo blanco). La fuente se queda en 16px ademas por un motivo practico: por debajo de 16px
   iOS hace zoom automatico al enfocar un campo. */
.form-group input,
.form-group select,
.date-group select,
#login-form input,
#registro-form input {
    width: 100%;
    padding: 12px 14px;
    border: 1.5px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    font-size: 16px;
    background-color: var(--color-white);
    color: var(--color-text);
    transition: all 0.2s ease;
    font-family: inherit;
    line-height: 1.5;
    box-shadow: none;
}`;
auth = cambio(auth, REGLA_CAMPOS, REGLA_CAMPOS_NUEVA, 1, 'regla de los campos de auth.css alineada', 'auth.css');

// ---- 2. Los estados: se nombran sus formularios y se sueltan 3 !important ----
auth = cambio(auth, `input:invalid:not(.input-error),
select:invalid:not(.input-error) {
    border: 1.5px solid rgba(0, 0, 0, 0.12) !important;
    box-shadow: none;
    outline: none;
}`, `input:invalid:not(.input-error),
select:invalid:not(.input-error),
#login-form input:invalid:not(.input-error),
#login-form select:invalid:not(.input-error),
#forgot-section input:invalid:not(.input-error),
#registro-form input:invalid:not(.input-error),
#registro-form select:invalid:not(.input-error) {
    border: 1.5px solid rgba(0, 0, 0, 0.12);
    box-shadow: none;
    outline: none;
}`, 1, ':invalid claro (5 selectores + sin !important)', 'auth.css');

auth = cambio(auth, `[data-theme="dark"] input:invalid:not(.input-error),
[data-theme="dark"] select:invalid:not(.input-error) {
    border: 1.5px solid rgba(255, 255, 255, 0.10) !important;
}`, `[data-theme="dark"] input:invalid:not(.input-error),
[data-theme="dark"] select:invalid:not(.input-error),
[data-theme="dark"] #login-form input:invalid:not(.input-error),
[data-theme="dark"] #login-form select:invalid:not(.input-error),
[data-theme="dark"] #forgot-section input:invalid:not(.input-error),
[data-theme="dark"] #registro-form input:invalid:not(.input-error),
[data-theme="dark"] #registro-form select:invalid:not(.input-error) {
    border: 1.5px solid rgba(255, 255, 255, 0.10);
}`, 1, ':invalid oscuro (5 selectores + sin !important)', 'auth.css');

auth = cambio(auth, `input:valid,
select:valid,
#login-form input:valid,
#forgot-section input:valid {
    border: 1.5px solid var(--color-success) !important;`, `input:valid,
select:valid,
#login-form input:valid,
#forgot-section input:valid {
    border: 1.5px solid var(--color-success);`, 1, ':valid claro (sin !important)', 'auth.css');

// ---- 3. El rojo del campo obligatorio se acota al PANEL (conserva su !important) ----
form = cambio(form, `[data-required="true"]:invalid:not(:placeholder-shown) {
    border-color: var(--color-danger) !important;
}`, `/* Solo el PANEL: en las pantallas de auth los campos obligatorios los pinta auth.css (gris
   neutro hasta que se tocan) y esta regla se los ponia ROJOS sin tocarlos, porque en un
   <select> casa siempre (:placeholder-shown no se aplica a los selects). Aqui si necesita el
   \`!important\`: su competidora en el panel es mas especifica. */
#panel-artista [data-required="true"]:invalid:not(:placeholder-shown) {
    border-color: var(--color-danger) !important;
}`, 1, 'rojo del obligatorio acotado a #panel-artista', 'formularios.css');

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}

// OJO: se cuentan SOLO las declaraciones. Si se cuenta el texto entero, los comentarios que
// explican el cambio (que dicen "!important") descuadran la cuenta.
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cuenta = (s) => (sinComentarios(s).match(/!important/g) || []).length;
console.log(`   auth.css: ${cuenta(authOriginal)} -> ${cuenta(auth)}`);
console.log(`   formularios.css: ${cuenta(formOriginal)} -> ${cuenta(form)}`);
const quitados = (cuenta(authOriginal) - cuenta(auth)) + (cuenta(formOriginal) - cuenta(form));
if (quitados !== 3) { console.error(`OJO: se esperaban 3 !important menos y han salido ${quitados}. NO se escribe.`); process.exit(1); }

writeFileSync('css/auth.css', auth, 'utf8');
writeFileSync('css/formularios.css', form, 'utf8');
console.log(`\nauth.css: ${cuenta(authOriginal)} -> ${cuenta(auth)} !important`);
console.log(`formularios.css: ${cuenta(formOriginal)} -> ${cuenta(form)} !important (el rojo conserva el suyo, pero acotado)`);
console.log('Total quitado: 3. Siguen con !important: el tema oscuro de los campos (su selector pierde por especificidad) y el rojo del panel.');
