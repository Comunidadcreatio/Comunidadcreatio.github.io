// REPARA EL MOJIBAKE DE SEGUNDA GENERACIÓN (familia "í³").
//
// QUÉ ES ESTE FICHERO Y POR QUÉ EXISTE
// ------------------------------------
// El repo ya tenía cuatro herramientas de codificación y NINGUNA vio el mojibake real
// de `js/etiquetas.js` (verificado: las cuatro daban verde con el bug delante). Este
// script existe para esa familia concreta y solo para ella.
//
// LA FAMILIA
// ----------
// Hay dos generaciones de corrupción, no una:
//
//   1ª generación (la que ya conocían las herramientas viejas):
//       'ó' U+00F3  →  bytes UTF-8 C3 B3  →  leídos como CP1252  →  'Ã³' (U+00C3 U+00B3)
//      Sus herramientas la detectan buscando las marcas literales /Ã|Â|â€/ o
//      reconstruyendo C3 B3 y comprobando que decodifica como UTF-8 válido.
//
//   2ª generación (la que se escapaba):
//      Sobre el texto de la 1ª, el 'Ã' (U+00C3) se volvió a corromper a 'í' (U+00ED):
//       'Ã³'  →  'í³'   (U+00ED U+00B3)
//      Ahora la secuencia reconstruida sería ED B3, que NO es UTF-8 válido, así que el
//      detector que reconstruye bytes la descarta SIN MIRAR (y las MARCAS literales no
//      aparecen). Por eso `verificar-codificacion.mjs` daba un falso verde.
//
// POR QUÉ UN MAPA EXPLÍCITO Y NO UNA HEURÍSTICA
// ---------------------------------------------
// Reparar texto corrupto adivinando es como se corrompe más texto. La regla que se usa
// aquí es MECÁNICA y comprobable: el carácter `í` delator (U+00ED, que en español
// legítimo NUNCA va seguido de estos signos) más un signo de la banda U+00A0-U+00BF o
// U+2014 → el carácter acentuado cuyo byte UTF-8 de continuación es ese signo.
//
//   U+00B3 (³ = byte B3) → ó     U+00AD (    = byte AD) → í
//   U+0161 (š = byte 9A) → Ú     U+008D (     = byte 8D) → Í
//   U+2014 (— = byte 97) → ×  (es el "×" de quitar filtro, no una letra)
//
// Los tres casos con letra se comprueban además contra el diccionario del propio
// fichero: "Seleccií³n" → "Selección", "MíšLTIPLE" → "MÚLTIPLE", "CRíTICO" → "CRÍTICO".
//
// Uso:
//   node scripts/arreglar-mojibake-2g.mjs            (informa y repara la raíz)
//   node scripts/arreglar-mojibake-2g.mjs --comprobar (no escribe; falla si hay algo)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const COMPROBAR = process.argv.includes('--comprobar');

// El delator: `í` (U+00ED). En español va seguido de vocal o de consonante normal
// (sí, día, país, mía, todavía...), nunca de un superíndice, de un control C1, de un
// guion blando, de una 'š' ni de una raya. Eso es lo que hace la regla segura.
const DELATOR = '\u00ED';

// EL MAPA SE DERIVA, NO SE ESCRIBE A MANO.
//
// La primera versión tenía la tabla escrita a mano y traía dos fallos reales (los cazó una
// revisión independiente): `0xBC` estaba mapeado a `¼` cuando es `ü` (C3 BC = ü; ¼ es C2 BC), y
// cuatro entradas (0x81 Á, 0x89 É, 0x93 Ó, 0x9C Ü) eran INALCANZABLES porque su equivalente
// imprimible en CP1252 no estaba en la tabla de signos. Resultado: la reparación convertía "ü" en
// "¼" y el detector seguía teniendo falso verde para Á/É/Ó/Ü — justo la clase de fallo que este
// fichero existe para cerrar.
//
// Ahora el mapa sale de las tablas: para cada carácter de Latin-1 (U+00A0-U+00FF) se codifica a
// UTF-8, se toma su byte de continuación (el lead es siempre C3) y se busca qué carácter CP1252
// tiene ESE byte. Como no se puede escribir mal una derivación, esta clase de error desaparece.
const CP1252 = {
    0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e', 0x85: '\u2026', 0x86: '\u2020',
    0x87: '\u2021', 0x88: '\u02c6', 0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152',
    0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c', 0x94: '\u201d', 0x95: '\u2022',
    0x96: '\u2013', 0x97: '\u2014', 0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a',
    0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178'
};
for (let b = 0xa0; b <= 0xff; b++) CP1252[b] = String.fromCharCode(b);

// GLIFO_POR_BYTE: los 256 bytes, SIN HUECOS. `Object.entries(CP1252)` se salta los bytes
// INDEFINIDOS de CP1252 en el tramo 0x80-0x9F (0x81, 0x8D, 0x8F, 0x90, 0x9D...), y esos son
// precisamente los que aparecen como carácter CRUDO (0x81 = U+0081, 0x8D = U+008D). Ese hueco era
// el que dejaba Á (0x81) e Í (0x8D) sin detectar: el byte 0x8D es el que tenía el fichero real.
const GLIFO_POR_BYTE = new Map();
for (let b = 0; b <= 0xff; b++) GLIFO_POR_BYTE.set(b, CP1252[b] || String.fromCharCode(b));

const SIGNO_POR_BYTE = new Map([...GLIFO_POR_BYTE].map(([b, ch]) => [b, ch]));

// byte -> las DOS formas en que puede aparecer en el texto:
//   - el carácter CRUDO del mismo código (String.fromCharCode(byte)): es lo que sale al leer el byte
//     0x8D como Latin-1 → U+008D (un control C1 invisible). Es la forma que tenía el fichero.
//   - el GLIFO que CP1252 le asigna (0x8D → '' U+008D, 0x9A → 'š' U+0161): lo que sale si el byte
//     se leyó como CP1252 y luego se volvió a escribir en UTF-8.
const BYTE_POR_SIGNO = new Map();
for (let b = 0; b <= 0xff; b++) {
    BYTE_POR_SIGNO.set(String.fromCharCode(b), b);
    BYTE_POR_SIGNO.set(GLIFO_POR_BYTE.get(b), b);
}

// byte de continuación -> carácter real. Sale de codificar U+00A0..U+00FF a UTF-8.
const POR_BYTE = new Map();
for (let cp = 0xa0; cp <= 0xff; cp++) {
    const bytes = Buffer.from(String.fromCharCode(cp), 'utf8');
    if (bytes.length === 2 && bytes[0] === 0xc3) POR_BYTE.set(bytes[1], String.fromCharCode(cp));
}
// El único que NO es Latin-1: el glifo de "quitar filtro" de las etiquetas. C3 97 = U+00D7 (×),
// y en CP1252 el byte 0x97 es la raya (—), que es exactamente como se vio el bug ('í—' por '×').
POR_BYTE.set(0x97, '\u00D7');

// Carácter corrupto -> byte CP1252 que representa. La tabla BYTE_POR_SIGNO cubre los controles
// C1 (U+0080-U+009F), que en CP1252 son IMPRIMIBLES (0x8D es 'Í', 0x9A es 'š', 0x9C es 'œ', 0x9F
// es 'Ÿ'), así que un 'í' seguido de cualquiera de ellos se reconoce. Esa era justo la laguna que
// dejaba Á/É/Ó/Ü sin detectar: su equivalente imprimible (0x81, 0x89, 0x93, 0x9C) no estaba.
function byteDe(car) {
    const b = BYTE_POR_SIGNO.get(car);
    if (b !== undefined) return b;
    return undefined;
}

/** Encuentra los tramos a reparar. Devuelve [{ linea, antes, despues }]. */
export function buscarMojibake2G(texto) {
    const hallazgos = [];
    texto.split('\n').forEach((linea, i) => {
        for (let j = 0; j < linea.length - 1; j++) {
            if (linea[j] !== DELATOR) continue;
            const siguiente = linea[j + 1];
            const b = byteDe(siguiente);
            if (b === undefined) continue;
            const real = POR_BYTE.get(b);
            if (!real) continue;
            hallazgos.push({ linea: i + 1, antes: DELATOR + siguiente, despues: real, contexto: linea.trim().slice(0, 90) });
            j++; // no solapar dos lecturas del mismo tramo
        }
    });
    return hallazgos;
}

/** Aplica el mapa completo a un texto y devuelve el texto reparado. */
export function repararMojibake2G(texto) {
    let salida = '';
    for (let i = 0; i < texto.length; i++) {
        const car = texto[i];
        if (car === DELATOR && i + 1 < texto.length) {
            const b = byteDe(texto[i + 1]);
            const real = b !== undefined ? POR_BYTE.get(b) : undefined;
            if (real) { salida += real; i++; continue; }
        }
        salida += car;
    }
    return salida;
}

// Ficheros servidos de la RAÍZ DEL PROYECTO (mismo criterio que verificar-codificacion.mjs).
//
// OJO: la raíz se calcula desde la UBICACIÓN DE ESTE SCRIPT, no desde `process.cwd()`. Con
// `readdirSync('.')` (lo que hacía la primera versión, y sigue haciendo verificar-codificacion.mjs)
// ejecutarlo desde el directorio padre reventaba con ENOENT, y —peor— ejecutarlo desde otro
// proyecto que tuviera `js/` y `css/` REPARABA LOS FICHEROS DE ESE OTRO PROYECTO. Una herramienta
// que escribe ficheros no puede depender del directorio desde el que la llames.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function ficherosServidos() {
    const lista = [];
    for (const f of readdirSync(RAIZ)) if (f.endsWith('.html')) lista.push(join(RAIZ, f));
    for (const d of ['js', 'css']) {
        for (const f of readdirSync(join(RAIZ, d))) {
            if (/\.(js|css)$/.test(f) && !f.includes('.min.')) lista.push(join(RAIZ, d, f));
        }
    }
    return lista;
}

/**
 * Corre la comprobación/reparación sobre los ficheros servidos.
 * @param {boolean} comprobar  true = no escribe, solo informa (y devuelve si hay algo)
 * @returns {number}  tramos encontrados
 */
function ejecutar(comprobar) {
    let total = 0;
    for (const rutaAbs of ficherosServidos()) {
        const f = relative(RAIZ, rutaAbs).split('\\').join('/');   // para los mensajes
        const original = readFileSync(rutaAbs, 'utf8');
        const hallazgos = buscarMojibake2G(original);
        if (!hallazgos.length) continue;
        total += hallazgos.length;
        console.log(`\n=== ${f}: ${hallazgos.length} tramo(s)`);
        for (const h of hallazgos) {
            const codes = [...h.antes].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
            console.log(`  ${f}:${h.linea}  ${codes}  "${h.antes}" -> "${h.despues}"   | ${h.contexto}`);
        }
        if (!comprobar) {
            writeFileSync(rutaAbs, repararMojibake2G(original), 'utf8');
            console.log(`  ✎ reparado`);
        }
    }
    return total;
}

// ESTE BLOQUE SOLO SE EJECUTA SI EL FICHERO ES EL PROGRAMA PRINCIPAL.
// `verificar-codificacion.mjs` importa `buscarMojibake2G` de aquí: sin esta guarda, el
// simple `import` ejecutaría el cuerpo entero del módulo y llamaría a `process.exit`,
// matando al importador antes de que hiciera sus propias comprobaciones. (Eso fue
// exactamente lo que pasó en la primera versión: el verificador imprimía el veredicto
// de ESTE script y salía con su código, así que sus 5 comprobaciones no corrían nunca.)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log('');
    const total = ejecutar(COMPROBAR);
    if (!total) {
        console.log('RESULTADO: sin mojibake de 2ª generación — limpio.');
        process.exit(0);
    }
    if (COMPROBAR) {
        console.log(`RESULTADO: ${total} tramo(s) de mojibake de 2ª generación SIN reparar.`);
        console.log('Corre: node scripts/arreglar-mojibake-2g.mjs');
        process.exit(1);
    }
    console.log(`RESULTADO: ${total} tramo(s) reparados.`);
}
