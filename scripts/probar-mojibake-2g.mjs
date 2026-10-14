// PRUEBA del detector/reparador de mojibake de 2ª generación.
//
// Qué se comprueba, y por qué así:
//  1) QUE CAZA las secuencias REALES que tenía `js/etiquetas.js` (las que se le escapaban a las
//     cuatro herramientas de codificación del repo).
//  2) QUE REPARA BIEN **TODOS** los caracteres de Latin-1, uno por uno. Esta es la prueba que
//     faltaba: la primera versión del mapa estaba escrita a mano y tenía `0xBC -> ¼` (es `ü`) y
//     cuatro entradas inalcanzables (Á/É/Ó/Ü). Un recorrido exhaustivo no se puede "olvidar" de
//     ningún caso, y es lo que convierte el mapa derivado en algo verificable.
//  3) QUE NO MARCA español correcto (falsos positivos).
//  4) DÓNDE ESTÁ EL LÍMITE: hay secuencias legítimas que la regla sí toca (`í—`, `í¡`). Se declaran
//     aquí en vez de esconderlas: la herramienta es de REPARACIÓN y se revisa su salida antes de
//     escribir. Documentarlas evita que alguien las descubra por sorpresa en un diff.
import { buscarMojibake2G, repararMojibake2G } from './arreglar-mojibake-2g.mjs';

let fallos = 0;
const comprobar = (nombre, ok, detalle) => {
    if (ok) console.log('  PASS  ' + nombre + (detalle ? ' → ' + detalle : ''));
    else { fallos++; console.log('  FALLO ' + nombre + (detalle ? ' → ' + detalle : '')); }
};

const DELATOR = '\u00ED';

// --- 1) las secuencias reales del bug ------------------------------------------------------------
// 5 secuencias corruptas repartidas en 4 tramos (un tramo por cada par delator+signo contiguo).
const corrupto = 'Selecci\u00ED\u00B3n M\u00ED\u0161LTIPLE; CR\u00ED\u008DTICO; x.textContent = \'\u00ED\u2014\';';
const hallazgos = buscarMojibake2G(corrupto);
comprobar('caza los 4 tramos del texto real corrupto', hallazgos.length === 4, hallazgos.length + ' tramos');
comprobar('y son exactamente ó, Ú, Í y ×',
    hallazgos.map((h) => h.despues).join('') === 'óÚÍ×',
    hallazgos.map((h) => '"' + h.antes + '"->"' + h.despues + '"').join(' '));
comprobar('repara "Selección"', repararMojibake2G('Selecci\u00ED\u00B3n') === 'Selección');
comprobar('repara "MÚLTIPLE"', repararMojibake2G('M\u00ED\u0161LTIPLE') === 'MÚLTIPLE');
comprobar('repara "CRÍTICO"', repararMojibake2G('CR\u00ED\u008DTICO') === 'CRÍTICO');
comprobar('repara el glifo "×" de quitar filtro', repararMojibake2G('\u00ED\u2014') === '\u00D7');

// --- 2) EXHAUSTIVO: los 96 caracteres de Latin-1 (U+00A0 a U+00FF) --------------------------------
// Para cada uno se construye su corrupción de 2ª generación tal como se produce de verdad:
//   'ó' -> UTF-8 C3 B3 -> leído como CP1252 'Ã³' -> el 'Ã' corrompido otra vez a 'í' -> 'í' + '³'
// El segundo carácter es el que CP1252 asigna al byte de continuación.
const CP1252 = {
    0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026', 0x86: '\u2020',
    0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152',
    0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022',
    0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a',
    0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178'
};
for (let b = 0xa0; b <= 0xff; b++) CP1252[b] = String.fromCharCode(b);

let probados = 0;
const malos = [];
for (let cp = 0xa0; cp <= 0xff; cp++) {
    const real = String.fromCharCode(cp);
    const bytes = Buffer.from(real, 'utf8');
    if (bytes.length !== 2 || bytes[0] !== 0xc3) continue;   // Latin-1 siempre es C3 xx
    // El byte de continuación puede aparecer de dos formas: como carácter crudo del mismo código
    // (lectura Latin-1) o como el glifo que CP1252 le asigna. Se prueban LAS DOS.
    const formas = [String.fromCharCode(bytes[1])];
    if (CP1252[bytes[1]] && CP1252[bytes[1]] !== formas[0]) formas.push(CP1252[bytes[1]]);
    for (const signo of formas) {
        const corruptoCar = DELATOR + signo;
        probados++;
        const detectado = buscarMojibake2G('x' + corruptoCar + 'y').length === 1;
        const reparado = repararMojibake2G('x' + corruptoCar + 'y') === 'x' + real + 'y';
        if (!detectado || !reparado) {
            malos.push(`U+${cp.toString(16).toUpperCase()} con U+${signo.codePointAt(0).toString(16).toUpperCase()}: ` +
                `"${corruptoCar}" -> "${repararMojibake2G(corruptoCar)}" (detectado=${detectado})`);
        }
    }
}
comprobar(`detecta y repara los caracteres de Latin-1 en sus DOS formas de aparición`, malos.length === 0,
    malos.length ? malos.length + ' mal: ' + malos.slice(0, 5).join(' | ') : `${probados} combinaciones`);

// --- 3) sin falsos positivos ---------------------------------------------------------------------
comprobar('no marca el texto YA correcto',
    buscarMojibake2G('Selección MÚLTIPLE; CRÍTICO; x.textContent = \'\u00D7\';').length === 0);
comprobar('no marca español normal (sí, día, país, mía, rompía, todavía, pingüino, vergüenza)',
    buscarMojibake2G('sí, día, país, mía, rompía, todavía, pingüino, vergüenza').length === 0);
comprobar('no marca la raya suelta ni el signo × suelto',
    buscarMojibake2G('texto — con raya y × suelto').length === 0);
comprobar('no marca el español con controles C1 ya correctos (no hay ninguno)',
    buscarMojibake2G('acentos: Á É Í Ó Ú Ü Ñ á é í ó ú ü ñ').length === 0);

// --- 4) el límite conocido, declarado a propósito -------------------------------------------------
// La regla no puede distinguir "í legítima + signo CP1252" de "C3 xx corrompido". Estas son las
// secuencias donde eso se nota. NO se ocultan: si algún día aparecen en un diff, es esto.
const limite = [
    ['así—sin espacios', 'el guion largo de CP1252 (byte 0x97)'],
    ['así¡Vamos', 'el signo de apertura (byte 0xA1)'],
    ['así±2', 'el más-menos (byte 0xB1)']
];
const tocadas = limite.filter(([t]) => buscarMojibake2G(t).length > 0).length;
comprobar('el límite conocido sigue siendo el documentado (3 secuencias legítimas que la regla toca)',
    tocadas === 3, `${tocadas} de ${limite.length} — la herramienta es de reparación: revisar el diff antes de escribir`);

console.log('');
console.log('RESULTADO: ' + (fallos ? fallos + ' FALLO(S)' : 'sin fallos') +
    ` (${probados} caracteres Latin-1 probados exhaustivamente)`);
process.exit(fallos ? 1 : 0);
