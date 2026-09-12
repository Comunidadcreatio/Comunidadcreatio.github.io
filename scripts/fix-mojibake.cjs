/**
 * fix-mojibake.cjs — repara texto UTF-8 que se guardó mal (leído como CP1252 y
 * vuelto a guardar como UTF-8). Es el típico "MÃ¡ximo" en vez de "Máximo".
 *
 * Cómo funciona: coge cada tramo de caracteres entre U+0080 y U+00FF, reconstruye
 * los bytes originales con la tabla inversa de CP1252 y los decodifica como UTF-8.
 * Si el tramo no era mojibake (la decodificación da caracteres inválidos) se deja
 * tal cual, así que es seguro pasarlo por encima de texto correcto.
 *
 * Uso: node scripts/fix-mojibake.cjs archivo1 [archivo2 ...]
 *      node scripts/fix-mojibake.cjs --check archivo1 ...   (solo informa)
 */
const fs = require('fs');

// Inversa de CP1252: codePoint -> byte (solo los que NO son identidad)
const ESPECIALES = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
    0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
    0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};

function byteDeCodePoint(cp) {
    if (ESPECIALES[cp] !== undefined) return ESPECIALES[cp];
    if (cp >= 0xA0 && cp <= 0xFF) return cp;      // identidad en CP1252
    if (cp >= 0x80 && cp <= 0x9F) return cp;      // controles C1 sin mapeo: .NET los deja igual
    return undefined;
}

function reparar(texto) {
    let cambios = 0;
    // El tramo incluye TODO el rango donde caen los caracteres de CP1252 (los
    // "especiales" como “ … € están en U+2018..U+20AC, fuera de Latin-1: si se
    // agrupara solo U+0080..U+00FF, 'Ã“' (la Ó mayúscula mal codificada) se
    // partiría y no se podría reconstruir).
    const salida = texto.replace(/[\u0080-\u2FFF]+/g, (tramo) => {
        const bytes = [];
        for (const ch of tramo) {
            const b = byteDeCodePoint(ch.codePointAt(0));
            if (b === undefined) return tramo;
            bytes.push(b);
        }
        // Solo se acepta si TODO el tramo decodifica a UTF-8 válido y aporta
        // caracteres reales (si no, era texto legítimo, no mojibake).
        const decodificado = Buffer.from(bytes).toString('utf8');
        if (decodificado.includes('\uFFFD')) return tramo;
        if (decodificado === tramo) return tramo;
        cambios++;
        return decodificado;
    });
    return { salida, cambios };
}

const args = process.argv.slice(2);
const check = args[0] === '--check';
const archivos = check ? args.slice(1) : args;
if (!archivos.length) {
    console.log('Uso: node scripts/fix-mojibake.cjs [--check] archivo...');
    process.exit(1);
}

for (const f of archivos) {
    const original = fs.readFileSync(f, 'utf8');
    const { salida, cambios } = reparar(original);
    const antes = (original.match(/[ÃÂ]/g) || []).length;
    const despues = (salida.match(/[ÃÂ]/g) || []).length;
    if (check) {
        console.log(`${f}: tramos reparables ${cambios} (Ã/Â antes ${antes}, después ${despues})`);
        continue;
    }
    if (salida === original) {
        console.log(`${f}: sin cambios.`);
        continue;
    }
    fs.writeFileSync(f, salida, 'utf8');
    console.log(`${f}: reparado (tramos ${cambios}, Ã/Â ${antes} -> ${despues}).`);
}
