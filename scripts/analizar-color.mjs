// QUE COLORES A MANO HAY EN UNA HOJA, con su linea, su propiedad y el contexto real (¿regla de modo
// oscuro o clara?), y si el valor COINCIDE EXACTAMENTE con algun token de la paleta.
//
// POR QUE EXISTE: la campana de colores se hace por tandas, y el primer paso de cada tanda es saber que
// hay. Migrar un valor que coincide exactamente con el token de su tema es cambio cero; el que no
// coincide necesita mirar el contraste y decidir.
//
// Uso: node scripts/analizar-color.mjs css/formularios.css
import { readFileSync } from 'node:fs';

const hoja = process.argv[2];
if (!hoja) { console.error('Uso: node scripts/analizar-color.mjs css/hoja.css'); process.exit(2); }
const style = readFileSync('css/style.css', 'utf8');

// Tokens de la paleta por tema (los bloques de :root y [data-theme="dark"]).
const tokens = { light: {}, dark: {} };
let tema = null;
for (const linea of style.split('\n')) {
    if (/^\s*:root\s*\{/.test(linea)) tema = 'light';
    if (/\[data-theme="dark"\]\s*\{/.test(linea)) tema = 'dark';
    const m = linea.match(/^\s*(--color-[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/);
    if (m && tema) tokens[tema][m[1]] = m[2].toLowerCase();
}
for (const t of ['light', 'dark']) {
    for (const [k, v] of Object.entries({ ...tokens[t] })) {
        const m = String(v).match(/^var\((--color-[\w-]+)\)$/);
        if (m && tokens[t][m[1]]) tokens[t][k] = tokens[t][m[1]];
    }
}

const lineas = readFileSync(hoja, 'utf8').split('\n');
const filas = [];
// El selector puede venir repartido en varias lineas y llevar `[data-theme="dark"]` delante: eso decide
// en que tema estamos, y es lo que hace segura (o no) la migracion.
const pila = [];
for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const abre = l.split('{').length - 1;
    const cierra = l.split('}').length - 1;
    if (abre > 0) {
        let j = i, sel = '';
        while (j >= 0) {
            sel = lineas[j].split('}').pop() + sel;
            if (lineas[j].includes('}') || j === 0) break;
            j--;
        }
        // OJO: se quitan los COMENTARIOS antes de recortar. Si no, un comentario largo se come los 60
        // caracteres, el selector (con su `[data-theme="dark"]`) queda fuera y una regla OSCURA pasa por
        // clara: eso ya provoco una conclusion falsa (creer que un gris oscuro se podia acercar a un paso
        // claro). Si hace falta el contexto exacto, `acercar-grises.mjs` lo saca caracter a caracter.
        pila.push(sel.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60));
    }
    const props = l.match(/^\s*([a-z-]+):\s*(.*?);/);
    if (props && !/^\s*(\/\*|\*)/.test(l) && !l.includes('data:image') && !/^\s*--color-/.test(l)) {
        const prop = props[1];
        const valor = props[2];
        if (prop !== 'box-shadow') {
            const selector = pila[pila.length - 1] || '(raiz)';
            const oscuro = selector.includes('data-theme="dark"');
            const sinVars = valor.replace(/var\([^)]*\)/g, '');
            const respaldo = [...valor.matchAll(/var\(--color-[\w-]+,\s*(#[0-9a-fA-F]{3,8})\)/g)].length;
            for (const h of sinVars.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
                const v = h.toLowerCase();
                const enClaro = Object.entries(tokens.light).filter(([, val]) => val === v).map(([k]) => k);
                const enOscuro = Object.entries(tokens.dark).filter(([, val]) => val === v).map(([k]) => k);
                filas.push({ linea: i + 1, prop, valor: v, selector, oscuro, respaldo, enClaro, enOscuro });
            }
        }
    }
    for (let k = 0; k < cierra; k++) pila.pop();
}

console.log(`=== ${hoja}: ${filas.length} hex SUELTOS (fuera de sombras y de respaldos)`);
console.log(`\n--- EN REGLAS DE MODO OSCURO (migrar a un token oscuro exacto = cambio cero):`);
for (const f of filas.filter((x) => x.oscuro)) {
    const exacto = f.enOscuro[0] ? `--color... (${f.enOscuro.slice(0, 3).join(', ')})` : '(sin token oscuro exacto)';
    console.log(`  ${String(f.linea).padStart(4)}  ${f.prop.padEnd(18)} ${f.valor.padEnd(9)} -> ${exacto.padEnd(46)} ${f.selector.slice(0, 34)}`);
}
console.log(`\n--- EN REGLAS CLARAS:`);
for (const f of filas.filter((x) => !x.oscuro)) {
    const exacto = f.enClaro[0] ? `exacto: ${f.enClaro.slice(0, 2).join(', ')}` : (f.enOscuro[0] ? `solo en OSCURO: ${f.enOscuro.slice(0, 2).join(', ')}` : 'sin token');
    console.log(`  ${String(f.linea).padStart(4)}  ${f.prop.padEnd(18)} ${f.valor.padEnd(9)} ${exacto.padEnd(46)} ${f.selector.slice(0, 34)}`);
}
const porValor = {};
for (const f of filas) porValor[f.valor] = (porValor[f.valor] || 0) + 1;
console.log(`\n--- por valor:`);
for (const [v, n] of Object.entries(porValor).sort((a, b) => b[1] - a[1])) console.log(`  ${v.padEnd(9)} x${n}`);
