// LOTE 1b: devuelve el `!important` a los 7 que SI hacian falta (y deja fuera los 6 que no).
//
// La foto del lote 1 (13 sin `!important`) dio 95 diferencias, y por PROPIEDAD se ve quien hacia
// falta:
//   SI hacian falta (7):  min-height, border, width, min-width, border-radius, padding, font-size
//   NO hacian falta (6):  height, max-height, background, color, margin, box-sizing
//     (esas seis siguen declaradas, solo pierden el `!important`: se comprobo que el valor
//      calculado no cambia en las 484 medidas de la foto, o sea en 2 anchos y 2 temas)
//
// Quien le gana al borde (y de paso al relleno, el radio y la letra) es el RESET del panel:
//   #btn-guardar, #btn-limpiar-campos, #panel-artista button[type="submit"], #panel-artista .btn-aplicar { border: none }
// Misma capa (`components`) y un selector de tipo mas: (1,1,1) contra (1,1,0) de esta regla. Para
// quitarle el `!important` a esos 7 habria que tocar ese reset (estrecharlo o bajarlo de capa),
// que es otro paso y con su propia medida.
//
// Uso:  node scripts/lote-01b-crear-btn.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/formularios.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');

const ANTES = `#obra-step-bar .crear-btn,
#problog-nav-bar .crear-btn {
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--color-ink);
    border: 1.5px solid var(--color-gray-300);
    width: auto;
    min-width: auto;
    border-radius: 16px;
    padding: 0 22px;
    margin: 0;
    font-size: 11px;`;

const DESPUES = `/* Los 7 \`!important\` que quedan son PORTANTES: el reset del panel
   (\`#panel-artista button[type="submit"] { border: none }\`) tiene (1,1,1) contra (1,1,0) de
   esta regla, asi que sin el \`!important\` se pierde el borde (y con el, el relleno, el radio y
   la letra). Los otros 6 se quedaron sin el tras medirlo: height, max-height, background, color,
   margin y box-sizing no cambian en ninguna de las 484 medidas de la foto. */
#obra-step-bar .crear-btn,
#problog-nav-bar .crear-btn {
    height: 32px;
    min-height: 32px !important;
    max-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--color-ink);
    border: 1.5px solid var(--color-gray-300) !important;
    width: auto !important;
    min-width: auto !important;
    border-radius: 16px !important;
    padding: 0 22px !important;
    margin: 0;
    font-size: 11px !important;`;

const trozos = ORIGINAL.split(ANTES);
if (trozos.length - 1 !== 1) { console.error(`NO SE HA ESCRITO NADA: el bloque no aparece exactamente 1 vez (${trozos.length - 1}).`); process.exit(1); }
const t = trozos.join(DESPUES);

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cuenta = (s) => (sinComentarios(s).match(/!important/g) || []).length;
const puestos = cuenta(t) - cuenta(ORIGINAL);
if (puestos !== 7) { console.error(`OJO: se esperaban 7 !important mas y han salido ${puestos}. NO se escribe.`); process.exit(1); }
writeFileSync(RUTA, t, 'utf8');
console.log(`ok   lote 1b: 7 devueltos, 6 fuera -> el lote 1 deja ${cuenta(ORIGINAL) - cuenta(t) + 7} ... `);
console.log(`     ${RUTA}: 51 -> ${cuenta(t)}`);
