// CUANTOS COLORES A MANO QUEDAN, separando los que son RESPALDO de un token (`var(--x, #hex)`) de los
// que son valores SUELTOS. La campaña de colores va solo a por los segundos: un respaldo es una red de
// seguridad deliberada, no deuda.
//
// Uso: node scripts/contar-color-a-mano.mjs [css/hoja.css]   (sin argumento, recorre todas)
import { readFileSync, readdirSync } from 'node:fs';
const hojas = process.argv[2] ? [process.argv[2]] : readdirSync('css').filter((f) => f.endsWith('.css')).map((f) => 'css/' + f);
let totRespaldos = 0, totSueltos = 0;
for (const hoja of hojas) {
const lineas = readFileSync(hoja, 'utf8').split('\n');
let respaldo = 0, sueltos = 0;
const porValor = {};
for (const l of lineas) {
    if (/^\s*(\/\*|\*)/.test(l) || l.includes('data:image') || /^\s*--color-/.test(l)) continue;
    const props = l.match(/^\s*([a-z-]+):\s*(.*?);/);
    if (!props) continue;
    const valor = props[2];
    for (const m of valor.matchAll(/var\(--color-[\w-]+,\s*(#[0-9a-fA-F]{3,8})\)/g)) { respaldo++; }
    // Los hex que NO estan dentro de un var(...) de esta linea.
    const sinVars = valor.replace(/var\([^)]*\)/g, '');
    for (const h of sinVars.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
        if (props[1] === 'box-shadow') continue;
        sueltos++;
        porValor[h.toLowerCase()] = (porValor[h.toLowerCase()] || 0) + 1;
    }
}
totRespaldos += respaldo; totSueltos += sueltos;
console.log(`${hoja}: respaldos ${respaldo} | SUELTOS ${sueltos}`);
const detalle = process.argv[2];
if (detalle) {
    console.log('los sueltos, por valor:');
    for (const [v, n] of Object.entries(porValor).sort((a, b) => b[1] - a[1])) console.log(`  ${v.padEnd(9)} x${n}`);
}
}
console.log(`\nTOTAL: respaldos ${totRespaldos} | hex SUELTOS ${totSueltos}`);
