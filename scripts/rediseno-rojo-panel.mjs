// EL ROJO DEL PANEL suelta su `!important` (el ultimo de esta familia).
//
// LA REGLA: `#panel-artista [data-required="true"]:invalid:not(:placeholder-shown) { border-color:
// var(--color-danger) !important }`. Pinta en rojo los campos obligatorios que el usuario ha
// tocado y dejado mal (y, en los `<select>`, siempre, porque `:placeholder-shown` no se aplica a
// los selects).
//
// POR QUE YA NO LO NECESITA: cuando se acoto a `#panel-artista` (paso anterior) su especificidad
// paso a (1,3,0). Su competidora en el panel es la regla del select personalizado
// (`#obra-form .form-group select`, que pone `border: none`), con (1,1,1): el rojo le gana por
// especificidad, sin `!important`. Antes de acotarlo era (0,3,0) y perdia: de ahi venia el
// `!important`.
//
// Uso:  node scripts/rediseno-rojo-panel.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/formularios.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');
let t = ORIGINAL;

const BUSCAR = `/* Solo el PANEL: en las pantallas de auth los campos obligatorios los pinta auth.css (gris
   neutro hasta que se tocan) y esta regla se los ponia ROJOS sin tocarlos, porque en un
   <select> casa siempre (:placeholder-shown no se aplica a los selects). Aqui si necesita el
   \`!important\`: su competidora en el panel es mas especifica. */
#panel-artista [data-required="true"]:invalid:not(:placeholder-shown) {
    border-color: var(--color-danger) !important;
}`;

const REEMPLAZAR = `/* Solo el PANEL: en las pantallas de auth los campos obligatorios los pinta auth.css (gris
   neutro hasta que se tocan) y esta regla se los ponia ROJOS sin tocarlos, porque en un
   <select> casa siempre (:placeholder-shown no se aplica a los selects).
   Sin \`!important\`: al nombrar \`#panel-artista\` su especificidad es (1,3,0) y le gana a la del
   select personalizado (\`#obra-form .form-group select\`, que pone \`border: none\`), que es
   (1,1,1). Antes, sin el id, era (0,3,0) y perdia: de ahi venia el \`!important\`. */
#panel-artista [data-required="true"]:invalid:not(:placeholder-shown) {
    border-color: var(--color-danger);
}`;

const trozos = t.split(BUSCAR);
if (trozos.length - 1 !== 1) {
    console.error(`NO SE HA ESCRITO NADA: la regla no aparece exactamente 1 vez (${trozos.length - 1}).`);
    process.exit(1);
}
t = trozos.join(REEMPLAZAR);

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cuenta = (s) => (sinComentarios(s).match(/!important/g) || []).length;
if (cuenta(ORIGINAL) - cuenta(t) !== 1) { console.error('OJO: se esperaba 1 !important menos. NO se escribe.'); process.exit(1); }
writeFileSync(RUTA, t, 'utf8');
console.log(`ok   el rojo del panel pierde su !important`);
console.log(`     ${RUTA}: ${cuenta(ORIGINAL)} -> ${cuenta(t)}`);
