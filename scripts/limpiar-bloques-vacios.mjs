// Limpia los bloques `@media` / `@supports` que han quedado VACIOS al borrar el CSS muerto.
//
// OJO: los `@layer` vacios NO se tocan. Un `@layer base { }` vacio no pinta nada, pero SI fija el
// ORDEN de capas (el orden de primera aparicion), asi que quitarlo podria cambiar la cascada.
// Un `@media` vacio, en cambio, no puede hacer nada.
//
// Uso:  node scripts/limpiar-bloques-vacios.mjs [--borrar]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const BORRAR = process.argv.includes('--borrar');
let total = 0;
for (const h of readdirSync('css').filter((f) => f.endsWith('.css'))) {
    const ruta = 'css/' + h;
    const css = readFileSync(ruta, 'utf8');
    // El bloque puede llevar espacios y comentarios dentro.
    const re = /@(media|supports)[^{]*\{\s*(?:\/\*[\s\S]*?\*\/\s*)*\}/g;
    const encontrados = [...css.matchAll(re)];
    if (!encontrados.length) continue;
    total += encontrados.length;
    console.log(`${h}: ${encontrados.length} bloque(s) vacio(s)`);
    if (!BORRAR) continue;
    const t = css.replace(re, '').replace(/\n{3,}/g, '\n\n');
    const abre = (t.match(/{/g) || []).length, cierra = (t.match(/}/g) || []).length;
    if (abre !== cierra) { console.error(`   OJO: llaves descuadradas en ${h}. NO se escribe.`); process.exit(1); }
    writeFileSync(ruta, t, 'utf8');
}
console.log(`\nTOTAL: ${total} bloque(s) ${BORRAR ? 'quitados' : 'a quitar (sin --borrar no se toca nada)'}`);
