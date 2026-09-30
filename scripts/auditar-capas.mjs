// AUDITORÍA DE CAPAS: busca las reglas que pueden dar sorpresas al migrar a capas.
//
// El problema que persigue: lo que NO está en ninguna capa GANA a lo que SÍ está. Así que
// una regla suelta que seleccione lo mismo que una regla ya capada (por ejemplo un `form`
// a secas, o un `#panel-artista form`) pasa a ganarle en cuanto la otra entra en una capa.
//
// Avisa de:
//   1. Reglas SIN capa cuyo selector incluye una ETIQUETA SOLA (`form`, `input`...).
//      Se detectan aunque el selector esté repartido en VARIAS LÍNEAS (que es como se
//      escapó el `form` de formularios.css:1009 y costó una vuelta entera).
//   2. Reglas SIN capa con selectores de id/clase que contienen ciertos prefijos de
//      familia (por defecto `problog`, `problogs`), que son las que compiten con las
//      hojas ya capadas.
//
// Uso: node scripts/auditar-capas.mjs [--familia problog] [--solo-etiquetas]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const iFam = args.indexOf('--familia');
const FAMILIAS = (iFam >= 0 ? args[iFam + 1] : 'problog,problogs').split(',').map((s) => s.trim().toLowerCase());
const SOLO_ETIQUETAS = args.includes('--solo-etiquetas');

const ETIQUETAS = new Set(('html body main section article aside header footer nav div span p a img picture source ' +
    'ul ol li button input select textarea label form table thead tbody tr td th h1 h2 h3 h4 h5 h6 small strong ' +
    'em b i hr br video iframe svg path caption figure figcaption blockquote pre code time address dl dt dd ' +
    'fieldset legend optgroup option progress meter canvas details summary dialog template slot')
    .split(' '));

// Devuelve true si el selector (ya recortado) es una etiqueta sola, con pseudoclases,
// pseudoelementos o atributos, pero SIN clase ni id ni descendencia.
function esEtiquetaSola(sel) {
    const limpio = sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').replace(/\[[^\]]*\]/g, '').trim();
    return ETIQUETAS.has(limpio.toLowerCase());
}

// Recorre el CSS manteniendo una PILA de bloques abiertos. Cuando aparece la llave de una
// regla, la pila dice en qué contexto está (un @media, un @layer...) y si está dentro de
// una capa. El selector se toma COMPLETO aunque esté repartido en varias líneas: eso es
// justo lo que se escapaba antes.
function analizar(css) {
    const limpio = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const reglas = [];
    const pila = [];
    let buf = '', linea = 1;
    for (let i = 0; i < limpio.length; i++) {
        const c = limpio[i];
        if (c === '\n') linea++;
        if (c === '{') {
            const cabecera = buf.trim();
            const esAt = cabecera.startsWith('@');
            if (!esAt) {
                reglas.push({
                    linea,
                    selector: cabecera,
                    capa: pila.some((p) => p.esCapa),
                    media: pila.filter((p) => p.esMedia).map((p) => p.cabecera).join(' | ')
                });
            }
            pila.push({
                cabecera,
                esAt,
                esCapa: pila.some((p) => p.esCapa) || /@layer\s+(base|components|utilities|reset)/.test(cabecera),
                esMedia: cabecera.startsWith('@media')
            });
            buf = '';
        } else if (c === '}') {
            pila.pop();
            buf = '';
        } else if (pila.every((p) => p.esAt)) {
            buf += c;   // solo se acumula texto fuera de los bloques de declaraciones
        }
    }
    return reglas;
}

const hojaDir = 'css';
let totalEtiquetas = 0, totalFamilia = 0;
for (const hoja of readdirSync(hojaDir).filter((f) => f.endsWith('.css')).sort()) {
    const reglas = analizar(readFileSync(join(hojaDir, hoja), 'utf8'));
    const avisos = [];
    for (const r of reglas) {
        if (r.capa) continue;                       // ya está en una capa: no es el problema
        const partes = r.selector.split(',').map((s) => s.trim()).filter(Boolean);
        for (const parte of partes) {
            if (esEtiquetaSola(parte)) { avisos.push(`  ${r.linea}: ETIQUETA SOLA  ${parte}`); totalEtiquetas++; }
            else if (!SOLO_ETIQUETAS && FAMILIAS.some((f) => parte.toLowerCase().includes(f))) {
                avisos.push(`  ${r.linea}: familia ${FAMILIAS.join('/')}  ${parte.slice(0, 90)}`); totalFamilia++;
            }
        }
    }
    if (avisos.length) console.log(`--- ${hoja} (${avisos.length}) ---\n${avisos.join('\n')}`);
}
console.log(`\nRESUMEN: ${totalEtiquetas} reglas sin capa con etiqueta sola, ${totalFamilia} con la familia ${FAMILIAS.join('/')}`);
