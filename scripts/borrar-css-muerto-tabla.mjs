// BORRA el CSS MUERTO de la tabla de "Mis Cavents" (la que se elimino).
//
// EVIDENCIA (2026-10-01):
//   - `#tabla-obras-container` NO existe en el DOM: comprobado en el navegador con el panel
//     abierto (`dbg-cascada-real.mjs --panel --elemento "#tabla-obras-container"` dice
//     "Existe en el DOM? false").
//   - Ningun HTML ni JS crea esos elementos: `grep` de `#page-info`, `#tabla-obras-container`,
//     `.pagination-btn`, `.acciones-obra` y `.btn-accion` no da ni una creacion (el unico
//     `.btn-accion*` vivo es `.btn-accion-obra`, de galeria.js, y NO se toca).
//   - `js/panel-ui.js` lo dice en un comentario: la tabla se elimino y `#page-info` ya no existe.
//
// OJO: se borran REGLAS COMPLETAS (selector + bloque), no solo el `!important`: quitarle la
// importancia a codigo muerto no sirve de nada. El borrado se hace de atras hacia delante y se
// comprueba que las llaves siguen cuadrando.
//
// Uso:  node scripts/borrar-css-muerto-tabla.mjs            (solo lista)
//       node scripts/borrar-css-muerto-tabla.mjs --borrar
import { readFileSync, writeFileSync } from 'node:fs';

const BORRAR = process.argv.includes('--borrar');
const HOJAS = ['css/panel-artista.css', 'css/formularios.css', 'css/style.css', 'css/galeria-publica.css'];
// El `.btn-accion` del final lleva un lookahead para NO tocar `.btn-accion-obra`.
const MUERTO = /#page-info|#tabla-obras-container|\.pagination-btn|\.acciones-obra|\.btn-accion(?![\w-])/;
// Y una regla que MEZCLA muertos con VIVOS no se borra entera: sus selectores vivos (#btn-guardar,
// .btn-eliminar) tienen que seguir con su tipografia. Esos muertos se quitan aparte, uno a uno.
const NO_BORRAR = /#btn-guardar|\.btn-eliminar(?![\w-])/;

const reglasDe = (css) => {
    // Los comentarios se sustituyen por espacios de la MISMA longitud para no mover los indices.
    const limpio = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    const out = [];
    const pila = [];
    let inicioSel = 0;
    for (let i = 0; i < limpio.length; i++) {
        const c = limpio[i];
        if (c === '{') {
            // El selector empieza donde acabo lo anterior: se guarda SIN los espacios de delante.
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

let totalReglas = 0, totalImportantes = 0;
for (const hoja of HOJAS) {
    const css = readFileSync(hoja, 'utf8');
    const reglas = reglasDe(css).filter((r) => MUERTO.test(r.selector));
    const intocables = reglas.filter((r) => NO_BORRAR.test(r.selector));
    const borrables = reglas.filter((r) => !NO_BORRAR.test(r.selector));
    if (intocables.length) {
        for (const r of intocables) console.log(`   (NO se toca: mezcla vivos y muertos)  ${r.selector.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
    if (!borrables.length) continue;
    console.log(`\n=== ${hoja}: ${borrables.length} regla(s) muerta(s)`);
    for (const r of borrables) {
        const cuerpo = css.slice(r.inicio, r.fin);
        const n = (cuerpo.replace(/\/\*[\s\S]*?\*\//g, '').match(/!important/g) || []).length;
        totalReglas++; totalImportantes += n;
        console.log(`   (${String(n).padStart(2)} !important)  ${r.selector.replace(/\s+/g, ' ').slice(0, 96)}`);
    }
    if (!BORRAR) continue;
    // Se borra de atras hacia delante para que los indices no se muevan. Se borra DESDE EL
    // PRINCIPIO DEL SELECTOR (si no, el selector se queda huerfano y se come la regla siguiente).
    let t = css;
    for (const r of [...borrables].sort((a, b) => b.selInicio - a.selInicio)) {
        const hasta = r.fin + 1;
        t = t.slice(0, r.selInicio) + t.slice(hasta);
    }
    // Se limpian las lineas en blanco que quedan de mas (tres o mas seguidas -> dos).
    t = t.replace(/\n{3,}/g, '\n\n');
    const abre = (t.match(/{/g) || []).length, cierra = (t.match(/}/g) || []).length;
    if (abre !== cierra) { console.error(`   OJO: llaves descuadradas en ${hoja} (${abre}/${cierra}). NO se escribe.`); process.exit(1); }
    writeFileSync(hoja, t, 'utf8');
    console.log(`   -> borradas (llaves: ${abre} abren / ${cierra} cierran)`);
}
console.log(`\nTOTAL: ${totalReglas} regla(s), ${totalImportantes} !important ${BORRAR ? 'borrados' : 'a borrar (sin --borrar no se toca nada)'}`);
