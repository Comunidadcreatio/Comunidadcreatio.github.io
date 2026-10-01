// CAPAR HOJAS: mete TODO el CSS que está suelto en UNA sola capa (`components`).
//
// POR QUÉ UNA SOLA CAPA. Lo que NO está en ninguna capa gana a lo que SÍ está, así que
// ir capando hoja a hoja hace que, cada vez, las reglas que quedan sueltas en las demás
// le ganen a la recién capada: se destapan competidores uno detrás de otro (pasó con
// Problogs: 104 -> 56 -> 48 -> 36 diferencias y seguía habiendo).
//
// Metiendo TODO en la MISMA capa, dentro de ella siguen decidiendo la especificidad y el
// orden del código, exactamente como cuando estaba todo suelto. O sea: NO cambia nada.
// Lo que se gana es que a partir de ahí hay dos palancas limpias:
//   `base`    -> pierde contra todo lo demás (por orden de capas)
//   `utilities` -> gana a todo lo demás
// y mover una familia de una a otra ya no destapa a nadie.
//
// QUÉ HACE CON CADA TROZO DE PRIMER NIVEL:
//   - `@import ...;`            -> se queda arriba del todo (tiene que ir ahí)
//   - `@layer ...;` (sin llave) -> se queda arriba (declaración de orden)
//   - `@layer base { ... }`     -> se deja FUERA del envoltorio, tal cual
//   - todo lo demás             -> dentro de `@layer components { ... }`
// El orden relativo dentro de cada grupo se conserva SIEMPRE, así que la cascada no cambia.
//
// Uso:
//   node scripts/capar-hojas.mjs --dry-run     (solo informa)
//   node scripts/capar-hojas.mjs               (escribe)
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry-run');
const DIR = 'css';

// Orden real de carga: las 6 que importa style.css (en su orden), style.css, y luego los
// <link> de index.html; auth.css va después de style.css en auth.html/reset-password.html.
// Como todo va a la MISMA capa, este orden solo sirve para informar: dentro de la capa
// manda el orden real de carga, que no cambia.
const ORDEN = ['header.css', 'galeria-publica.css', 'chat.css', 'panel-artista.css', 'modales.css',
    'formularios.css', 'style.css', 'notificaciones.css', 'search-results.css',
    'problogs.css', 'auth.css'];
// (aqui estaba 'skeleton.css': se elimino el 2026-10-01 porque no quedaba ni un elemento que usara
//  sus clases .skeleton-card / .skeleton-galeria)

// Trocea el CSS en trozos de primer nivel, respetando comentarios y comillas para no
// confundir llaves de dentro.
function trocear(css) {
    const trozos = [];
    let i = 0, inicio = 0, prof = 0, comilla = null;
    while (i < css.length) {
        const c = css[i];
        if (comilla) { if (c === comilla && css[i - 1] !== '\\') comilla = null; i++; continue; }
        if (c === '"' || c === "'") { comilla = c; i++; continue; }
        if (c === '/' && css[i + 1] === '*') { const fin = css.indexOf('*/', i + 2); i = fin < 0 ? css.length : fin + 2; continue; }
        if (c === '{') { prof++; i++; continue; }
        if (c === '}') {
            prof--; i++;
            if (prof === 0) { trozos.push(css.slice(inicio, i)); inicio = i; }
            continue;
        }
        if (c === ';' && prof === 0) { i++; trozos.push(css.slice(inicio, i)); inicio = i; continue; }
        i++;
    }
    if (inicio < css.length) trozos.push(css.slice(inicio));
    return trozos;
}

function clasificar(trozo) {
    // Se mira el texto SIN comentarios de delante, para saber qué es de verdad.
    const limpio = trozo.replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
    if (!limpio) return 'vacio';
    if (/^@import\b/.test(limpio)) return 'preambulo';
    if (/^@layer\s+[\w,\s-]+;$/.test(limpio)) return 'preambulo';   // declaración de orden
    if (/^@layer\s+base\s*\{/.test(limpio)) return 'base';
    if (/^@layer\b/.test(limpio)) return 'otra-capa';
    return 'cuerpo';
}

let totalCuerpo = 0;
const informe = [];
for (const hoja of ORDEN) {
    const ruta = join(DIR, hoja);
    if (!existsSync(ruta)) { console.log(`  (no existe ${hoja}, se salta)`); continue; }
    const original = readFileSync(ruta, 'utf8');
    const trozos = trocear(original);
    const grupos = { preambulo: [], base: [], cuerpo: [], 'otra-capa': [], vacio: [] };
    for (const t of trozos) grupos[clasificar(t)].push(t);
    const partes = [];
    partes.push(grupos.preambulo.join(''));
    if (grupos.base.length) partes.push('\n' + grupos.base.join('\n'));
    if (grupos['otra-capa'].length) partes.push('\n' + grupos['otra-capa'].join('\n'));
    if (grupos.cuerpo.length) partes.push('\n@layer components {\n' + grupos.cuerpo.join('') + '\n}\n');
    partes.push(grupos.vacio.join(''));
    const nuevo = partes.join('').replace(/\n{3,}/g, '\n\n');
    informe.push({ hoja, trozos: trozos.length, base: grupos.base.length, cuerpo: grupos.cuerpo.length,
        otraCapa: grupos['otra-capa'].length, antes: original.length, despues: nuevo.length });
    totalCuerpo += grupos.cuerpo.length;
    if (!DRY) {
        copyFileSync(ruta, ruta + '.antes-de-capar');
        writeFileSync(ruta, nuevo, 'utf8');
    }
}
console.log(DRY ? 'SIMULACIÓN (no se escribió nada):' : 'HECHO (se guardó copia .antes-de-capar de cada hoja):');
for (const f of informe) {
    console.log(`  ${f.hoja.padEnd(24)} trozos ${String(f.trozos).padStart(3)} · a base ${f.base} · a components ${String(f.cuerpo).padStart(3)}` +
        (f.otraCapa ? ` · OJO otra capa ${f.otraCapa}` : '') + `   ${Math.round(f.antes / 1024)}KB -> ${Math.round(f.despues / 1024)}KB`);
}
console.log(`\nTrozos metidos en components: ${totalCuerpo}`);
