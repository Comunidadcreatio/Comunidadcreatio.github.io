// Arregla la DOBLE CODIFICACION de un fichero (el texto se leyo con otra tabla de
// caracteres y se volvio a escribir, asi que "ó" quedo como "Ã³").
//
// Se aplica al reves con la tabla de siempre. Es seguro porque estas secuencias no
// aparecen en texto normal: si un fichero tuviera un "Ã" legitimo, el script lo dice y no
// lo toca. Ademas, al final comprueba que no quede ninguna marca.
//
// Uso:
//   node scripts/arreglar-codificacion.mjs js/etiquetas.js js/comentarios.js
//   node scripts/arreglar-codificacion.mjs --comprobar
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';

const args = process.argv.slice(2);
const COMPROBAR = args.includes('--comprobar');
const ficheros = args.filter((a) => !a.startsWith('--'));

// Tabla de doble codificacion (la habitual en UTF-8 leido como Latin-1).
const TABLA = [
    ['Ã¡', 'á'], ['Ã©', 'é'], ['Ã', 'í'], ['Ã³', 'ó'], ['Ãº', 'ú'], ['Ã±', 'ñ'],
    ['Ã¼', 'ü'], ['Ã¨', 'è'], ['Ã§', 'ç'],
    ['ÃÁ', 'Á'], ['Ã‰', 'É'], ['Ã', 'Í'], ['Ã“', 'Ó'], ['Ãš', 'Ú'], ['Ã‘', 'Ñ'],
    ['Ã—', '×'], ['Ã·', '÷'], ['â€”', '—'], ['â€“', '–'], ['â€œ', '“'], ['â€\u009d', '”'],
    ['â€™', '’'], ['â€¦', '…'], ['Â¿', '¿'], ['Â¡', '¡'], ['Âº', 'º'], ['Âª', 'ª'],
    ['Â', ''],   // "Â" sobrante (p. ej. delante de un espacio duro)
];
const MARCAS = /Ã|Â|â€/g;

if (COMPROBAR || !ficheros.length) {
    const lista = ficheros.length ? ficheros : readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
    let malos = 0;
    for (const ruta of lista) {
        const n = (readFileSync(ruta, 'utf8').match(MARCAS) || []).length;
        if (n) { console.log(`${ruta}: ${n} marcas de doble codificacion`); malos++; }
    }
    console.log(malos ? '' : 'OK: sin doble codificacion.');
    process.exit(0);
}

for (const ruta of ficheros) {
    const original = readFileSync(ruta, 'utf8');
    let nuevo = original;
    for (const [mal, bien] of TABLA) nuevo = nuevo.split(mal).join(bien);
    const quedan = (nuevo.match(MARCAS) || []).length;
    if (nuevo === original) { console.log(`${ruta}: no habia nada que arreglar`); continue; }
    copyFileSync(ruta, ruta + '.antes-de-codificar');
    writeFileSync(ruta, nuevo, 'utf8');
    console.log(`${ruta}: arreglado (quedan ${quedan} marcas sin reconocer)`);
    if (quedan) {
        console.log('  OJO: mira estas lineas a mano, hay secuencias que no son de la tabla:');
        nuevo.split('\n').forEach((l, i) => { if (MARCAS.test(l)) console.log(`  ${i + 1}: ${l.trim().slice(0, 100)}`); });
    }
}

// Lo que de verdad importa: que la busqueda del chat vuelva a encontrar los pueblos.
// Se carga el script con un `window` de mentira y se hace LA MISMA busqueda que chat.js.
const src = readFileSync('js/ciudades.js', 'utf8');
const falso = {};
new Function('window', src)(falso);
const tachira = falso.CIUDADES_POR_PAIS && falso.CIUDADES_POR_PAIS['Venezuela'] && falso.CIUDADES_POR_PAIS['Venezuela']['Táchira'];
console.log(`\nBusqueda del chat: window.CIUDADES_POR_PAIS['Venezuela']['Táchira'] -> ${tachira ? tachira.length + ' pueblos' : 'NO ENCONTRADO'}`);
console.log(`Bandera de San Cristóbal: ${(falso.BANDERA_POR_CIUDAD || {})['San Cristóbal'] || 'NO ENCONTRADA'}`);
process.exit(tachira && tachira.length ? 0 : 1);
