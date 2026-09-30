// Comprobacion a nivel de BYTES (Node lee UTF-8 de verdad, la consola de PowerShell no).
// Uso: node scripts/dbg-codificacion.mjs [ficheros...]
import { readFileSync, readdirSync } from 'node:fs';

const pedidos = process.argv.slice(2);
const ficheros = pedidos.length ? pedidos : readdirSync('js').filter((f) => f.endsWith('.js'));
const MARCAS = /Ã|Â|â€/g;

let malos = 0;
const conMojibake = [];
for (const f of ficheros) {
    const s = readFileSync('js/' + f, 'utf8');
    const n = (s.match(MARCAS) || []).length;
    if (n) { conMojibake.push(`${f}: ${n} marcas`); malos++; }
}
if (conMojibake.length) {
    console.log('FICHEROS CON DOBLE CODIFICACION:');
    for (const l of conMojibake) console.log('  ' + l);
} else {
    console.log('OK: sin doble codificacion en los ' + ficheros.length + ' ficheros mirados.');
}

// Datos del chat: los pueblos tienen que estar en UTF-8 correcto, porque se comparan con
// lo que devuelve el backend.
const c = readFileSync('js/ciudades.js', 'utf8');
const bien = c.includes('San Cristóbal') && c.includes('Táchira') && c.includes('La Fría');
console.log('ciudades.js con los pueblos en UTF-8 correcto: ' + bien);
const linea = c.split('\n').find((l) => l.includes('San Crist')) || '';
console.log('linea de datos: ' + linea.trim().slice(0, 80));
process.exit(malos ? 1 : 0);
