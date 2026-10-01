// HERRAMIENTA DE LOTES para la campana de `!important`.
//
// Quita (o devuelve) el `!important` de las declaraciones de UNA regla, la que se le diga por su
// hoja y su selector exacto tal como esta escrito en el CSS. Nada mas: no reordena, no cambia
// valores, no toca otras reglas.
//
// POR QUE ASI: la campana tiene 76 reglas. Un script a mano por regla es un lote de trabajo
// entero; esto lo deja en un comando y, sobre todo, permite DEVOLVER el `!important` solo a las
// propiedades que la foto demuestre que hacian falta (que es el metodo: quitar, medir por
// propiedad, devolver lo portante).
//
// Uso:
//   node scripts/importantes-lote.mjs --hoja css/formularios.css --selector "#obra-step-bar .limpiar-btn,
//   #problog-nav-bar .limpiar-btn" --quitar
//   node scripts/importantes-lote.mjs --hoja css/formularios.css --selector "..." --devolver --props "width,padding"
//   (sin --props, quita/devuelve TODAS las de la regla)
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const HOJA = arg('--hoja', '');
const SELECTOR = arg('--selector', '');
const QUITAR = args.includes('--quitar');
const DEVOLVER = args.includes('--devolver');
const PROPS = arg('--props', '').split(',').map((s) => s.trim()).filter(Boolean);

if (!HOJA || !SELECTOR || (QUITAR === DEVOLVER)) {
    console.error('Uso: node scripts/importantes-lote.mjs --hoja css/x.css --selector "..." --quitar|--devolver [--props "a,b"]');
    process.exit(2);
}

const original = readFileSync(HOJA, 'utf8');
const iSel = original.indexOf(SELECTOR);
if (iSel < 0) { console.error('NO SE ENCUENTRA el selector en ' + HOJA); process.exit(2); }
if (original.indexOf(SELECTOR, iSel + 1) >= 0) console.log('AVISO: el selector aparece mas de una vez; se toca el primero.');

const iLlave = original.indexOf('{', iSel);
const iFin = original.indexOf('}', iLlave);
if (iLlave < 0 || iFin < 0) { console.error('No se pudo delimitar el bloque de la regla.'); process.exit(2); }
const bloque = original.slice(iLlave + 1, iFin);

const tocadas = [];
const nuevoBloque = bloque.replace(/^(\s*)([a-zA-Z-]+):([^;\n]*?)(\s*!important)?;/gm, (todo, sangria, prop, valor, imp) => {
    if (PROPS.length && !PROPS.includes(prop)) return todo;
    if (QUITAR) {
        if (!imp) return todo;
        tocadas.push(`${prop} (quitado)`);
        return `${sangria}${prop}:${valor};`;
    }
    if (imp) return todo;
    tocadas.push(`${prop} (devuelto)`);
    return `${sangria}${prop}:${valor} !important;`;
});

if (!tocadas.length) { console.error('No habia nada que cambiar con esos criterios.'); process.exit(2); }
const t = original.slice(0, iLlave + 1) + nuevoBloque + original.slice(iFin);

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cuenta = (s) => (sinComentarios(s).match(/!important/g) || []).length;
writeFileSync(HOJA, t, 'utf8');
console.log(`${QUITAR ? 'quitado' : 'devuelto'} el !important en ${tocadas.length} declaracion(es):`);
for (const x of tocadas) console.log('   ' + x);
console.log(`${HOJA}: ${cuenta(original)} -> ${cuenta(t)} !important`);
