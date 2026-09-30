// AUDITORÍA DE `!important`: los lista con su selector, su propiedad y su valor.
//
// Sirve para decidir cuáles sobran. Con las capas, un `!important` solo hace falta si
// tiene que ganarle a OTRO `!important` (lo importante va por encima de lo normal aunque
// la capa sea anterior); si solo peleaba contra reglas normales, muchas veces basta con
// subir la regla a `utilities`, o quitárselo sin más.
//
// Uso:
//   node scripts/auditar-important.mjs [--hoja formularios.css] [--resumen]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SOLO_HOJA = arg('--hoja');
const RESUMEN = args.includes('--resumen');

function trocear(css) {
    const trozos = [];
    let i = 0, inicio = 0, prof = 0, comilla = null;
    while (i < css.length) {
        const c = css[i];
        if (comilla) { if (c === comilla && css[i - 1] !== '\\') comilla = null; i++; continue; }
        if (c === '"' || c === "'") { comilla = c; i++; continue; }
        if (c === '/' && css[i + 1] === '*') { const fin = css.indexOf('*/', i + 2); i = fin < 0 ? css.length : fin + 2; continue; }
        if (c === '{') { prof++; i++; continue; }
        if (c === '}') { prof--; i++; if (prof === 0) { trozos.push(css.slice(inicio, i)); inicio = i; } continue; }
        if (c === ';' && prof === 0) { i++; trozos.push(css.slice(inicio, i)); inicio = i; continue; }
        i++;
    }
    if (inicio < css.length) trozos.push(css.slice(inicio));
    return trozos;
}
const cabecera = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').trim().split('{')[0].trim();

// Recorre reglas (también dentro de @media y @layer) y devuelve las declaraciones con
// !important, indicando la capa en la que están.
function recorrer(css, hoja, salida, contexto = '', pila = []) {
    for (const t of trocear(css)) {
        const cab = cabecera(t);
        if (!cab) continue;
        if (cab.startsWith('@')) {
            const esCapa = /^@layer\s+(\w+)/.exec(cab);
            const dentro = t.slice(t.indexOf('{') + 1, t.lastIndexOf('}'));
            recorrer(dentro, hoja, salida, contexto + (esCapa ? '' : ' ' + cab), esCapa ? [...pila, esCapa[1]] : pila);
            continue;
        }
        const cuerpo = t.slice(t.indexOf('{') + 1, t.lastIndexOf('}'));
        const capa = pila.length ? pila[pila.length - 1] : '(sin capa)';
        for (const decl of cuerpo.split(';')) {
            if (!/!important/.test(decl)) continue;
            const m = decl.match(/^\s*([a-z-]+)\s*:\s*([\s\S]*?)\s*!important\s*$/i);
            if (!m) continue;
            salida.push({ hoja, capa, selector: cab.replace(/\s+/g, ' ').slice(0, 70), prop: m[1], valor: m[2].replace(/\s+/g, ' ').slice(0, 40), media: contexto.trim() });
        }
    }
}

const salida = [];
for (const hoja of readdirSync('css').filter((f) => f.endsWith('.css') && !f.includes('antes-de-')).sort()) {
    if (SOLO_HOJA && hoja !== SOLO_HOJA) continue;
    recorrer(readFileSync(join('css', hoja), 'utf8'), hoja, salida);
}
if (RESUMEN) {
    const porHoja = {}, porCapa = {}, porProp = {};
    for (const s of salida) {
        porHoja[s.hoja] = (porHoja[s.hoja] || 0) + 1;
        porCapa[s.capa] = (porCapa[s.capa] || 0) + 1;
        porProp[s.prop] = (porProp[s.prop] || 0) + 1;
    }
    console.log('Por hoja:', JSON.stringify(porHoja));
    console.log('Por capa:', JSON.stringify(porCapa));
    console.log('Propiedades más repetidas:', Object.entries(porProp).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([p, n]) => `${p}(${n})`).join(' '));
} else {
    for (const s of salida) console.log(`${s.hoja}: ${s.selector}  [${s.capa}${s.media ? ' ' + s.media : ''}]  ${s.prop}: ${s.valor} !important`);
}
console.log(`\nTOTAL: ${salida.length} declaraciones !important`);
