// BORRA REGLAS DE CSS MUERTO (por tokens: ids o clases que no existen en ningun HTML/JS).
//
// El cribe lo hace `scripts/auditar-css-muerto.mjs`; esto borra lo que ya se ha comprobado. Una
// regla NO se borra solo porque el cribe la senale: hay que comprobarlo de las dos maneras que
// exige la casa:
//   1. En el navegador, con la vista abierta donde viviera:
//      `dbg-cascada-real.mjs --panel --elemento "<selector>"` -> "Existe en el DOM? false".
//   2. Foto ANTES (guardando los cambios con `git stash push -- css/`) contra DESPUES:
//      tiene que dar SIN DIFERENCIAS.
// OJO: la foto NO ve los elementos que estan ocultos (un modal escondido, por ejemplo), asi que la
// revision de QUE se borra es obligatoria: por eso este script imprime cada selector que toca.
//
// OJO 2 (esto YA mordio): una regla puede tener VARIOS selectores separados por comas y estar
// vivos solo algunos, como `.mobile-logout-modal, #mobile-main-menu { display: none }`. Aqui NO se
// borra la regla entera: se le quitan de la lista los selectores muertos y se queda con los vivos.
// Y los tokens que son PREFIJO de otros vivos no se tocan: `.btn-eliminar` no debe alcanzar a
// `.btn-eliminar-slide` ni a `#btn-eliminar-cuenta` (de ahi los limites de palabra).
//
// Uso:  node scripts/borrar-css-muerto.mjs --tokens "btn-eliminar,mobile-main-menu"           (lista)
//       node scripts/borrar-css-muerto.mjs --tokens "..." --borrar
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const args = process.argv.slice(2);
const BORRAR = args.includes('--borrar');
const iTok = args.indexOf('--tokens');
const iArc = args.indexOf('--tokens-archivo');
const iSel = args.indexOf('--selectores-archivo');
// Los tokens pueden venir en la linea de comandos o en un fichero (uno por linea), que es lo
// comodo cuando son muchos: `auditar-css-muerto.mjs` los deja en scripts/_tokens-muertos.txt.
const deArchivo = iArc >= 0 && args[iArc + 1] ? readFileSync(args[iArc + 1], 'utf8').split('\n') : [];
const TOKENS = [...new Set([
    ...(iTok >= 0 && args[iTok + 1] ? args[iTok + 1].split(',').map((s) => s.trim()) : []),
    ...deArchivo.map((s) => s.trim())
])].filter(Boolean);
// Modo SELECTORES: se borran exactamente las reglas cuyo selector (normalizado) este en la lista.
// Esa lista la produce `dbg-selectores-existen.mjs` tras comprobar EN EL NAVEGADOR que no casan
// con ningun elemento. Aqui no hace falta partir por comas: la lista solo lleva reglas cuyas
// PARTES son todas muertas (asi las escribe el cribador).
const SELECTORES = iSel >= 0 && args[iSel + 1]
    ? new Set(readFileSync(args[iSel + 1], 'utf8').split('\n').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean))
    : null;
if (!TOKENS.length && !SELECTORES) { console.error('Falta --tokens "a,b", --tokens-archivo <ruta> o --selectores-archivo <ruta>.'); process.exit(2); }
console.log(SELECTORES ? `selectores en la lista: ${SELECTORES.size}` : `tokens: ${TOKENS.length}`);

const HOJAS = readdirSync('css').filter((f) => f.endsWith('.css')).map((f) => 'css/' + f);
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Un SELECTOR suelto es muerto si nombra alguno de los tokens muertos (con limites de palabra).
const SEL_MUERTO = new RegExp(TOKENS.map((t) => `[#.]${escapar(t)}(?![\\w-])`).join('|'));
const partirSelectores = (sel) => sel.split(',').map((s) => s.trim()).filter(Boolean);

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

let totalBorradas = 0, totalLimpiadas = 0, totalImportantes = 0;
for (const hoja of HOJAS) {
    const css = readFileSync(hoja, 'utf8');
    const plan = [];   // { tipo: 'borrar' | 'limpiar', regla, vivos }
    for (const r of reglasDe(css)) {
        if (SELECTORES) {
            // Modo lista de selectores: se borra la regla entera si su selector esta en la lista.
            if (SELECTORES.has(r.selector.replace(/\s+/g, ' '))) plan.push({ tipo: 'borrar', regla: r, vivos: [], muertos: [r.selector.replace(/\s+/g, ' ')] });
            continue;
        }
        const partes = partirSelectores(r.selector);
        const muertos = partes.filter((s) => SEL_MUERTO.test(s));
        if (!muertos.length) continue;
        const vivos = partes.filter((s) => !SEL_MUERTO.test(s));
        plan.push({ tipo: vivos.length ? 'limpiar' : 'borrar', regla: r, vivos, muertos });
    }
    if (!plan.length) continue;
    console.log(`\n=== ${hoja}`);
    for (const p of plan) {
        const n = (css.slice(p.regla.inicio, p.regla.fin).replace(/\/\*[\s\S]*?\*\//g, '').match(/!important/g) || []).length;
        totalImportantes += p.tipo === 'borrar' ? n : 0;
        if (p.tipo === 'borrar') { totalBorradas++; console.log(`   BORRAR  (${String(n).padStart(2)} !important)  ${p.muertos.join(' , ').slice(0, 92)}`); }
        else { totalLimpiadas++; console.log(`   LIMPIAR (solo la lista)  quitar: ${p.muertos.join(' , ').slice(0, 60)}`); console.log(`                             dejar:  ${p.vivos.join(' , ').slice(0, 60)}`); }
    }
    if (!BORRAR) continue;
    let t = css;
    for (const p of [...plan].sort((a, b) => b.regla.selInicio - a.regla.selInicio)) {
        if (p.tipo === 'borrar') { t = t.slice(0, p.regla.selInicio) + t.slice(p.regla.fin + 1); continue; }
        // Se reconstruye la lista con los selectores vivos, conservando la sangria de la regla.
        const indent = (t.slice(0, p.regla.selInicio).match(/(?:^|\n)([ \t]*)$/) || ['', ''])[1] || '';
        const nueva = p.vivos.join(',\n' + indent) + ' ';
        t = t.slice(0, p.regla.selInicio) + nueva + t.slice(p.regla.inicio);
    }
    t = t.replace(/\n{3,}/g, '\n\n');
    const abre = (t.match(/{/g) || []).length, cierra = (t.match(/}/g) || []).length;
    if (abre !== cierra) { console.error(`   OJO: llaves descuadradas en ${hoja} (${abre}/${cierra}). NO se escribe.`); process.exit(1); }
    writeFileSync(hoja, t, 'utf8');
    console.log(`   -> hecho (llaves: ${abre} abren / ${cierra} cierran)`);
}
console.log(`\nTOTAL: ${totalBorradas} regla(s) borradas, ${totalLimpiadas} lista(s) limpiada(s), ${totalImportantes} !important ${BORRAR ? 'borrados' : 'a borrar (sin --borrar no se toca nada)'}`);
