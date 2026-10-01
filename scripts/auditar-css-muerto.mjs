// CRIBADOR DE CSS MUERTO: busca reglas cuyos selectores nombran ids o clases que NO existen en
// ningun HTML ni en ningun .js del proyecto.
//
// COMO SE USA: esto solo da CANDIDATAS. Una regla candidata NO se borra sin comprobarlo antes de
// las dos maneras que exige la casa:
//   1. En el navegador: `dbg-cascada-real.mjs --panel --elemento "<selector>"` -> "Existe en el
//      DOM? false" (y con la vista abierta donde viviera).
//   2. Foto ANTES (guardando los cambios con `git stash push -- <hojas>`) contra DESPUES:
//      tiene que dar SIN DIFERENCIAS.
// Un token puede crearse en tiempo de ejecucion concatenando cadenas, asi que el cribe es una
// pista, nunca una prueba.
//
// Uso: node scripts/auditar-css-muerto.mjs [--hojas css/a.css,css/b.css]
import { readFileSync, readdirSync } from 'node:fs';

const args = process.argv.slice(2);
const iHojas = args.indexOf('--hojas');
const HOJAS = iHojas >= 0 && args[iHojas + 1]
    ? args[iHojas + 1].split(',')
    : readdirSync('css').filter((f) => f.endsWith('.css')).map((f) => 'css/' + f);

// El corpus donde buscar: todos los HTML y todos los .js (los .mjs de scripts NO cuentan: no se
// sirven; si un token solo sale ahi, es que el CSS no lo usa nadie de verdad).
const corpus = [];
for (const f of readdirSync('.').filter((x) => x.endsWith('.html'))) corpus.push(readFileSync(f, 'utf8'));
for (const f of readdirSync('js').filter((x) => x.endsWith('.js'))) corpus.push(readFileSync('js/' + f, 'utf8'));
const TEXTO = corpus.join('\n');

const existeToken = (t) => new RegExp(`(^|[^\\w-])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(TEXTO);

const reglasDe = (css) => {
    const limpio = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    const out = [];
    const pila = [];
    let inicioSel = 0;
    for (let i = 0; i < limpio.length; i++) {
        const c = limpio[i];
        if (c === '{') { pila.push({ sel: limpio.slice(inicioSel, i).trim(), inicio: i }); inicioSel = i + 1; }
        else if (c === '}') {
            const ctx = pila.pop();
            if (ctx && !ctx.sel.startsWith('@')) out.push({ selector: ctx.sel, inicio: ctx.inicio, fin: i });
            inicioSel = i + 1;
        }
    }
    return out;
};

const candidatas = [], parciales = [];
let total = 0, totalImportantes = 0;
for (const hoja of HOJAS) {
    const css = readFileSync(hoja, 'utf8');
    for (const r of reglasDe(css)) {
        const tokens = [...new Set([...r.selector.matchAll(/[#.]([A-Za-z][\w-]*)/g)].map((m) => m[1]))];
        if (!tokens.length) continue;
        const faltan = tokens.filter((t) => !existeToken(t));
        const importantes = (css.slice(r.inicio, r.fin).replace(/\/\*[\s\S]*?\*\//g, '').match(/!important/g) || []).length;
        total++; totalImportantes += importantes;
        if (faltan.length === tokens.length) candidatas.push({ hoja, selector: r.selector.replace(/\s+/g, ' '), faltan, importantes });
        else if (faltan.length) parciales.push({ hoja, selector: r.selector.replace(/\s+/g, ' '), faltan, existen: tokens.filter((t) => !faltan.includes(t)), importantes });
    }
}
console.log(`reglas analizadas: ${total} (${totalImportantes} !important en ellas)`);
console.log(`\n=== CANDIDATAS A MUERTAS: NINGUN token del selector existe (${candidatas.length}) ===`);
for (const c of candidatas.sort((a, b) => b.importantes - a.importantes)) {
    console.log(`  ${c.importantes ? `(${c.importantes} !important) ` : ''}${c.hoja}: ${c.selector.slice(0, 90)}`);
    console.log(`        tokens que no existen: ${c.faltan.join(', ')}`);
}
console.log(`\n=== PARCIALES: algunos tokens no existen (${parciales.length}) — revisar ===`);
for (const p of parciales) {
    console.log(`  ${p.importantes ? `(${p.importantes} !important) ` : ''}${p.hoja}: ${p.selector.slice(0, 84)}`);
    console.log(`        NO existen: ${p.faltan.join(', ')}   |   SI existen: ${p.existen.join(', ')}`);
}
