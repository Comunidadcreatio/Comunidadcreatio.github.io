// MIDE UN COLOR CONTRA LAS SUPERFICIES REALES DE LA APP, para decidir con numeros si un valor a mano
// merece token (y con que papel: un texto necesita 4.5:1, un borde o una marca 3:1) o si hay que
// corregirlo. Es el paso 2 de cada tanda de la campana de colores, despues de `analizar-color.mjs`.
//
// Uso:
//   node scripts/medir-color.mjs                 (mide la lista de grises que la app usa a mano)
//   node scripts/medir-color.mjs #888 texto      (un color suelto, con su papel)
import { readFileSync } from 'node:fs';

const lum = (h0) => {
    // OJO: hay que expandir los hex de 3 digitos (#888 -> #888888) o la medida sale NaN.
    let h = String(h0).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const c = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const r = (a, b) => { const x = lum(a), y = lum(b); return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)); };

// Las superficies reales de la app (las mismas que usa el verificador de contraste).
const SUP = { 'blanco': '#ffffff', 'tarjeta clara': '#f5f5f5', 'tarjeta oscura': '#1f1f1f', 'fondo oscuro': '#0a0a0a', 'panel oscuro': '#121212' };
const MINIMO = (papel) => (papel === 'texto' ? 4.5 : 3);

const args = process.argv.slice(2);
const lista = args.length >= 1
    ? [[args[0], args[1] || 'texto']]
    : [
        ['#f0f0f0', 'superficie'], ['#e5e5e5', 'borde'], ['#aaa', 'texto'], ['#999', 'texto'],
        ['#8a8a8a', 'texto'], ['#888', 'texto'], ['#64748b', 'texto'], ['#666', 'texto'],
        ['#555', 'texto'], ['#444', 'borde'], ['#333', 'borde'], ['#262626', 'superficie'],
        ['#242424', 'superficie'], ['#222', 'superficie'], ['#121212', 'superficie']
    ];

for (const [color, papel] of lista) {
    const filas = Object.entries(SUP).map(([n, s]) => `${n} ${r(color, s).toFixed(2)}`);
    const deSuTema = filas.join('  |  ');
    console.log(`${color}  (${papel.padEnd(10)} necesita ${MINIMO(papel)})  ${deSuTema}`);
}

console.log('\n--- escala de la paleta (claro / oscuro). OJO: NO esta invertida, esta RE-BASADA por rol:');
console.log('    en los dos temas 50 es la superficie y 800 la tinta.');
const style = readFileSync('css/style.css', 'utf8');
let tema = null;
for (const linea of style.split('\n')) {
    if (/^\s*:root\s*\{/.test(linea)) tema = 'claro ';
    if (/\[data-theme="dark"\]\s*\{/.test(linea)) tema = 'oscuro';
    const m = linea.match(/^\s*(--color-gray-\d+):\s*(#[0-9a-fA-F]{3,8})\s*;/);
    if (m) console.log(`  ${tema}  ${m[1].padEnd(22)} ${m[2]}`);
}
