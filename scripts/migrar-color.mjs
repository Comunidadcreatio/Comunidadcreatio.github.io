// MIGRAR UN COLOR A MANO A UN TOKEN DE LA PALETA, por LINEA y con el token escrito a mano en un mapa
// JSON. NO adivina: si la linea no tiene el valor esperado (o ya lleva un token), ABORTA y lo dice sin
// escribir nada. Es la leccion del incidente de `importantes-lote.mjs --linea`, que se cargo 36
// declaraciones por localizar mal la regla.
//
// Uso:
//   node scripts/contar-color-a-mano.mjs css/chat.css      (ver que hay, con linea y valor)
//   node scripts/migrar-color.mjs css/chat.css mapa.json   (mapa: {"145": {"valor": "#1a1a1a", "token": "--color-ink"}})
//
// Despues, SIEMPRE: foto antes/despues (debe dar SIN DIFERENCIAS) y la suite.
import { readFileSync, writeFileSync } from 'node:fs';

const hoja = process.argv[2];
// OJO: el `Set-Content -Encoding UTF8` de PowerShell escribe BOM, y `JSON.parse` revienta con el. Se
// quita, porque el mapa puede venir escrito a mano o generado por una herramienta de Windows.
const MAPA = JSON.parse(readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, ''));

const lineas = readFileSync(hoja, 'utf8').split('\n');
let cambios = 0, saltadas = [];
for (const [numStr, { valor, token }] of Object.entries(MAPA)) {
    const i = Number(numStr) - 1;
    const l = lineas[i];
    if (l === undefined) { saltadas.push(`${numStr}: la linea no existe`); continue; }
    if (!l.toLowerCase().includes(valor.toLowerCase())) { saltadas.push(`${numStr}: no contiene ${valor} -> ${l.trim().slice(0, 60)}`); continue; }
    // El guardian de "ya tenia un token" evita dobles migraciones... pero NO aplica cuando lo que se
    // cambia es un token MAL ELEGIDO por otro (el 2026-10-04 aparecio uno: `--color-gray-300` como color
    // de texto en una regla oscura, donde ese token es un gris OSCURO y el texto quedaba en 2.11:1).
    if (l.includes('var(--') && !valor.toLowerCase().startsWith('var(')) { saltadas.push(`${numStr}: ya tenia un token`); continue; }
    // Solo se sustituye el valor por el token; el resto de la declaracion (y el `;`) no se toca.
    lineas[i] = l.replace(new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `var(${token})`);
    cambios++;
}
if (saltadas.length) {
    console.error('ABORTADO: hay lineas que no cuadran:');
    for (const s of saltadas) console.error('  ' + s);
    process.exit(1);
}
writeFileSync(hoja, lineas.join('\n'), 'utf8');
console.log(`${hoja}: ${cambios} declaraciones migradas a tokens (nada mas se ha tocado)`);
