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
const LINEA = Number(arg('--linea', '0')) || 0;
const QUITAR = args.includes('--quitar');
const DEVOLVER = args.includes('--devolver');
const PROPS = arg('--props', '').split(',').map((s) => s.trim()).filter(Boolean);

if (!HOJA || (!SELECTOR && !LINEA) || (QUITAR === DEVOLVER)) {
    console.error('Uso: node scripts/importantes-lote.mjs --hoja css/x.css (--selector "..." | --linea N) --quitar|--devolver [--props "a,b"]');
    console.error('  --linea N sirve cuando el selector a secas es ambiguo (hay varias reglas que empiezan igual).');
    process.exit(2);
}
// OJO: `--devolver` SIN `--props` pone `!important` en TODAS las declaraciones de la regla, incluidas
// las que nunca lo tuvieron. Paso el 2026-10-01: en el textarea de la descripcion se colaron dos
// (`resize` y `line-height`) y la foto NO lo vio, porque un `!important` de mas no cambia nada. Para
// devolver hay que decir QUE propiedades: asi solo se toca lo que se habia quitado.
if (DEVOLVER && !PROPS.length) {
    console.error('Para --devolver hace falta --props "a,b": sin eso se le pondria `!important` a TODA la regla.');
    process.exit(2);
}

const original = readFileSync(HOJA, 'utf8');

// Localizacion de la regla: por SELECTOR (el texto tal cual esta escrito) o por LINEA (cualquier
// linea de la regla: el selector o una declaracion). Con --linea se usan las REGLAS que saca el
// parser (selector + bloque que cuadra) y se elige la que CONTIENE esa linea.
//
// OJO: antes esto se hacia buscando hacia atras la primera llave sin cerrar, y estaba MAL: en un
// CSS con `@layer components { ... }` esa busqueda acaba en la llave del @layer, no en la de la
// regla, y el "bloque" era el @layer ENTERO. Paso el 2026-10-01: le quito los 36 `!important` a
// formularios.css de una vez (se restauro el fichero desde git y se rehizo).
const reglasDe = (css) => {
    const limpio = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    const out = [];
    const pila = [];
    let inicioSel = 0;
    for (let i = 0; i < limpio.length; i++) {
        const c = limpio[i];
        if (c === '{') {
            let s = inicioSel;
            while (s < i && /\s/.test(css[s])) s++;
            pila.push({ sel: limpio.slice(inicioSel, i).trim(), selInicio: s, inicio: i });
            inicioSel = i + 1;
        } else if (c === '}') {
            const ctx = pila.pop();
            if (ctx && !ctx.sel.startsWith('@')) out.push({ selector: ctx.sel, selInicio: ctx.selInicio, inicio: ctx.inicio, fin: i });
            inicioSel = i + 1;
        }
    }
    return out;
};

let iLlave, iFin, iInicioRegla;
if (LINEA) {
    const pos = original.split('\n').slice(0, LINEA).join('\n').length;
    // La regla mas interna que contiene esa linea (el selector empieza en selInicio y el bloque
    // acaba en fin, asi que una linea de declaracion tambien cae dentro).
    const candidatas = reglasDe(original).filter((r) => pos >= r.selInicio && pos <= r.fin);
    if (!candidatas.length) { console.error(`La linea ${LINEA} no cae dentro de ninguna regla con declaraciones.`); process.exit(2); }
    const r = candidatas.sort((a, b) => (a.fin - a.selInicio) - (b.fin - b.selInicio))[0];
    iLlave = r.inicio; iFin = r.fin; iInicioRegla = r.selInicio;
} else {
    const iSel = original.indexOf(SELECTOR);
    if (iSel < 0) { console.error('NO SE ENCUENTRA el selector en ' + HOJA); process.exit(2); }
    if (original.indexOf(SELECTOR, iSel + 1) >= 0) console.log('AVISO: el selector aparece mas de una vez; se toca el primero (o usa --linea).');
    iLlave = original.indexOf('{', iSel);
    iFin = original.indexOf('}', iLlave);
    if (iLlave < 0 || iFin < 0) { console.error('No se pudo delimitar el bloque de la regla.'); process.exit(2); }
    iInicioRegla = iSel;
}
const bloque = original.slice(iLlave + 1, iFin);
const cabecera = original.slice(iInicioRegla, iLlave).replace(/\s+/g, ' ').trim();
console.log(`regla: ${cabecera || '(sin selector)'}   [linea ${original.slice(0, iInicioRegla).split('\n').length}]`);

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
