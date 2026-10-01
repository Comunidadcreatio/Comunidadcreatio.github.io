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
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const RUTA_TOKENS = 'scripts/_tokens-muertos.txt';

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
const tokensMuertos = new Set();
// Un SELECTOR (una parte de la lista por comas) solo se puede dar por muerto si TIENE tokens y
// TODOS estan muertos. Un selector sin tokens (solo etiqueta o atributo, como `input` o
// `[type="text"]`) NO se puede juzgar: cuenta como vivo. Si no se hace asi, una regla
// `.muerto, input { ... }` se borraria entera y se llevaria los estilos de `input`.
const analizarParte = (parte) => {
    const tokens = [...new Set([...parte.matchAll(/[#.]([A-Za-z][\w-]*)/g)].map((m) => m[1]))];
    const faltan = tokens.filter((t) => !existeToken(t));
    return { tokens, faltan, muerta: tokens.length > 0 && faltan.length === tokens.length };
};
for (const hoja of HOJAS) {
    const css = readFileSync(hoja, 'utf8');
    for (const r of reglasDe(css)) {
        const partes = r.selector.split(',').map((s) => s.trim()).filter(Boolean);
        if (!partes.length) continue;
        const infos = partes.map(analizarParte);
        if (!infos.some((i) => i.faltan.length)) continue;   // ninguna parte nombra tokens que falten
        const importantes = (css.slice(r.inicio, r.fin).replace(/\/\*[\s\S]*?\*\//g, '').match(/!important/g) || []).length;
        total++; totalImportantes += importantes;
        const faltan = [...new Set(infos.flatMap((i) => i.faltan))];
        for (const t of faltan) tokensMuertos.add(t);
        if (infos.every((i) => i.muerta)) candidatas.push({ hoja, selector: r.selector.replace(/\s+/g, ' '), faltan, importantes });
        else parciales.push({
            hoja, selector: r.selector.replace(/\s+/g, ' '), faltan, importantes,
            vivas: partes.filter((_, k) => !infos[k].muerta)
        });
    }
}
console.log(`reglas con algun token que no existe: ${total} (${totalImportantes} !important en ellas)`);
console.log(`\n=== CANDIDATAS A MUERTAS: TODAS las partes de la regla son de tokens que no existen (${candidatas.length}) ===`);
for (const c of candidatas.sort((a, b) => b.importantes - a.importantes)) {
    console.log(`  ${c.importantes ? `(${c.importantes} !important) ` : ''}${c.hoja}: ${c.selector.slice(0, 90)}`);
}
console.log(`\n=== PARCIALES: mezclan partes vivas y muertas (${parciales.length}) — se hacen a mano ===`);
for (const p of parciales) {
    console.log(`  ${p.importantes ? `(${p.importantes} !important) ` : ''}${p.hoja}: ${p.selector.slice(0, 84)}`);
    console.log(`        sin tocar: ${p.vivas.join(' | ').slice(0, 70)}`);
}
writeFileSync(RUTA_TOKENS, [...tokensMuertos].sort().join('\n') + '\n', 'utf8');
writeFileSync('scripts/_selectores-candidatos.txt', candidatas.map((c) => c.selector).join('\n') + '\n', 'utf8');
console.log(`\ntokens muertos escritos en ${RUTA_TOKENS} (${tokensMuertos.size})`);
console.log(`selectores candidatos escritos en scripts/_selectores-candidatos.txt (${candidatas.length})`);
