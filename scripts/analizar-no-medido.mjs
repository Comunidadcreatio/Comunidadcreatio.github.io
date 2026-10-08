// CRUZA lo que la foto mide con lo que NO mide, por (vista, selector), usando el registro completo de las
// 32 lecturas (8 vistas x 2 temas x 2 anchos).
//
// Clasificacion:
//   MUERTO    -> no se ha medido NUNCA y ademas "no existe" en todas las lecturas de esa vista: sobra.
//   SIN PINTAR-> se ha medido SIEMPRE, pero con caja 0x0 en todas: se queda (sus estilos calculados salen de
//                la cascada igual, asi que un cambio de CSS SI se caza).
//   PARCIAL   -> se mide en algunas lecturas: se queda.
//   RARO      -> no encaja en lo anterior (revisar a mano).
//
// Uso: node scripts/analizar-no-medido.mjs scripts/f-n.sin-medir.json
import { readFileSync } from 'node:fs';

const ruta = process.argv[2] || 'scripts/f-n.sin-medir.json';
const registros = JSON.parse(readFileSync(ruta, 'utf8'));

// (vista, selector) -> contadores
const mapa = new Map();
for (const r of registros) {
    const marca = `${r.vista}\u0000${''}`;
    // Los selectores de la vista son: los medidos + los que no existen + los que no tienen caja.
    const todos = new Set([...r.medidos, ...r.noEstan, ...r.sinCaja]);
    for (const sel of todos) {
        const clave = `${r.vista}\u0000${sel}`;
        if (!mapa.has(clave)) mapa.set(clave, { vista: r.vista, sel, n: 0, medidos: 0, noExiste: 0, cero: 0 });
        const c = mapa.get(clave);
        c.n++;
        if (r.noEstan.includes(sel)) c.noExiste++;
        else if (r.sinCaja.includes(sel)) c.cero++;
        else if (r.medidos.includes(sel)) c.medidos++;
        else c.medidos++;   // medido (no esta en ninguna lista de "sin medir")
    }
}

const grupos = { MUERTO: [], 'SIN PINTAR': [], PARCIAL: [], 'MEDIDO Y PINTADO': [] };
for (const c of mapa.values()) {
    if (c.noExiste === c.n) grupos.MUERTO.push(c);                    // no existe nunca: sobra
    else if (c.cero === c.n) grupos['SIN PINTAR'].push(c);            // se mide, pero nunca se pinta: se queda
    else if (c.medidos > 0 && (c.noExiste > 0 || c.cero > 0)) grupos.PARCIAL.push(c);   // se mide en algunos estados
    else grupos['MEDIDO Y PINTADO'].push(c);                          // lo normal: se mide y se pinta
}

console.log(`lecturas cruzadas: ${registos(registros)}  ·  (vista, selector) distintos: ${mapa.size}`);
function registos(r) { return r.length; }
for (const [nombre, lista] of Object.entries(grupos)) {
    console.log(`\n== ${nombre}: ${lista.length}`);
    for (const c of lista.sort((a, b) => a.vista.localeCompare(b.vista) || a.sel.localeCompare(b.sel))) {
        console.log(`   ${c.vista.padEnd(16)} ${c.sel.padEnd(44)} de ${c.n} lecturas · medidas ${c.medidos} · no existe ${c.noExiste} · caja0 ${c.cero}`);
    }
}

// Y EL BALANCE POR SELECTOR, que es lo que de verdad importa: un elemento puede seguir contando como "sin
// pintar" en la vista donde NO vive aunque ya este cubierto en su vista hermana (es lo que pasa con `auth` y
// `auth (login)`, o con `grid` y `galeria (carrusel)`). Aqui se junta todo: en cuantas vistas se PINTA y en
// cuantas no. Los que no se pintan en NINGUNA son los unicos que siguen sin cobertura visual.
const porSelector = new Map();
for (const c of mapa.values()) {
    if (!porSelector.has(c.sel)) porSelector.set(c.sel, { sel: c.sel, vistas: 0, pintado: 0, sinPintar: 0 });
    const g = porSelector.get(c.sel);
    g.vistas++;
    if (c.medidos > 0) g.pintado++; else g.sinPintar++;
}
const nuncaPintados = [...porSelector.values()].filter((g) => g.pintado === 0).sort((a, b) => a.sel.localeCompare(b.sel));
const yaCubiertos = [...porSelector.values()].filter((g) => g.pintado > 0 && g.sinPintar > 0).length;
console.log(`\n== BALANCE POR SELECTOR: ${porSelector.size} selectores distintos`);
console.log(`   cubiertos en una vista y sin pintar en otra (contaban como SIN PINTAR): ${yaCubiertos}`);
console.log(`   NUNCA pintados en ninguna vista: ${nuncaPintados.length}${nuncaPintados.length ? ' ->' : '  (cobertura visual completa)'}`);
for (const g of nuncaPintados) console.log(`      ${g.sel.padEnd(46)} sin pintar en ${g.sinPintar} de ${g.vistas} vistas`);
