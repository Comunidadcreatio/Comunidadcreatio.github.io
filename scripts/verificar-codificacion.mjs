// ¿HAY MOJIBAKE EN LOS FICHEROS QUE SE SIRVEN?
//
// Un texto UTF-8 releido como Windows-1252 deja huellas como "â™¥" (que era un corazon "♥") o "âž¤" (que era
// una flecha "➤"). El usuario lo ve como simbolos raros y no lo caza ninguna prueba de comportamiento: el
// HTML es valido, el CSS esta bien y el JS no falla. Solo se ve MIRANDO los bytes del fichero.
//
// POR QUE UN DETECTOR NUEVO: el que habia (`arreglar-codificacion.mjs`, con su re`/Ã|Â|â€/`) busca huellas
// CONCRETAS y por eso se le escapaban justo estas dos. Este reconstruye los BYTES de cada posible secuencia y
// comprueba si forman UTF-8 valido, que es la definicion del asunto. Y dice cual era el caracter original.
//
// Se comprueban los ficheros de la RAIZ (fuente). Las copias de `www/` y `android/` las sincroniza el bump y
// el propio bump verifica que queden identicas.
//
// Uso: node scripts/verificar-codificacion.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// --- detector ---------------------------------------------------------------------------------------
// cp1252: los unicos bytes que NO coinciden con Latin-1 son 0x80-0x9F (el byte 0x99 es "™", no un control).
const CP1252 = { 0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a', 0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178' };
const A_BYTE = new Map();
for (const [b, ch] of Object.entries(CP1252)) A_BYTE.set(ch, Number(b));
for (let b = 0xa0; b <= 0xff; b++) A_BYTE.set(String.fromCharCode(b), b);

export function buscarMojibake(texto) {
    const out = [];
    texto.split('\n').forEach((l, n) => {
        for (let i = 0; i < l.length; i++) {
            for (const largo of [4, 3, 2]) {
                if (i + largo > l.length) continue;
                const bytes = [];
                let vale = true;
                for (let k = 0; k < largo; k++) {
                    const b = A_BYTE.get(l[i + k]);
                    if (b === undefined) { vale = false; break; }
                    bytes.push(b);
                }
                if (!vale) continue;
                const b0 = bytes[0];
                const arranque = (largo === 2 && b0 >= 0xc2 && b0 <= 0xdf)
                    || (largo === 3 && b0 >= 0xe0 && b0 <= 0xef)
                    || (largo === 4 && b0 >= 0xf0 && b0 <= 0xf4);
                if (!arranque) continue;
                const buf = Buffer.from(bytes);
                const dec = buf.toString('utf8');
                // UTF-8 valido: decodifica sin caracter de reemplazo Y vuelve a dar los mismos bytes.
                if (dec.includes('\ufffd') || !Buffer.from(dec, 'utf8').equals(buf)) continue;
                if (dec.codePointAt(0) < 0xa0) continue;
                out.push({ linea: n + 1, secuencia: l.slice(i, i + largo), recuperado: dec, contexto: l.trim().slice(0, 90) });
                i += largo - 1;
                break;
            }
        }
    });
    return out;
}

// --- ficheros que se sirven (los de la raiz; sus copias las sincroniza el bump) -----------------------
export function ficherosServidos() {
    const lista = [];
    for (const f of readdirSync('.')) {
        if (f.endsWith('.html') && statSync(f).isFile()) lista.push(f);
    }
    for (const d of ['js', 'css']) {
        for (const f of readdirSync(d)) {
            if (/\.(js|css)$/.test(f) && !f.includes('.min.')) lista.push(join(d, f));
        }
    }
    return lista;
}

// --- comprobacion -----------------------------------------------------------------------------------
let pruebas = 0, fallos = 0;
function check(nombre, ok, detalle) {
    pruebas++;
    if (ok) console.log(`  PASS  ${nombre}${detalle ? ' → ' + detalle : ''}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}

console.log('=== Codificacion de los ficheros servidos ===');
const ficheros = ficherosServidos();
let total = 0;
const porFichero = [];
for (const f of ficheros) {
    const hallazgos = buscarMojibake(readFileSync(f, 'utf8'));
    if (hallazgos.length) { porFichero.push([f, hallazgos]); total += hallazgos.length; }
}

check(`ninguno de los ${ficheros.length} ficheros servidos tiene mojibake`, total === 0,
    total === 0 ? `${ficheros.length} ficheros limpios` : `${total} secuencia(s) en ${porFichero.length} fichero(s)`);

for (const [f, hallazgos] of porFichero) {
    for (const h of hallazgos) {
        console.log(`      ${f}:${h.linea}  "${h.secuencia}" deberia ser "${h.recuperado}"   | ${h.contexto}`);
    }
}

// Y una comprobacion de que el detector DETECTA (si no, un verde no valdria nada): se le da una secuencia
// conocida y tiene que encontrarla.
check('el detector reconoce una secuencia de mojibake conocida', buscarMojibake('x \u00e2\u2122\u00a5 y').length === 1);
check('el detector NO marca texto correcto', buscarMojibake('Corazon \u2665 y acentos: \u00f1 \u00e9 \u00e1').length === 0);

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
process.exit(fallos ? 1 : 0);
