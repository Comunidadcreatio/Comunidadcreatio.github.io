// Anotaciones de tipos para js/problogs.js: SEGUNDA tanda (los dos avisos que salieron
// al medir la primera). Mismo metodo: texto exacto, cuantas veces aparece, y si algo no
// cuadra no se escribe nada. NO cambia nada en ejecucion.
//
// Uso:  node scripts/arreglar-tipos-problogs-2.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'js/problogs.js';
let t = readFileSync(RUTA, 'utf8');

const CAMBIOS = [
    {
        // El tipo hay que decirlo en la EXPRESION: la anotacion sola no convierte un
        // HTMLElement en HTMLInputElement (eso lo hace el cast entre parentesis).
        que: 'campo: el cast va en la expresion',
        buscar: `    /** @type {HTMLInputElement | null} */ let campo = document.getElementById('problog-responder-comentario-id');`,
        reemplazar: `    let campo = /** @type {HTMLInputElement | null} */ (document.getElementById('problog-responder-comentario-id'));`,
        veces: 1
    },
    {
        // `closest` devuelve Element, y `dataset` es de HTMLElement: hay que decirlo.
        que: 'btn de los iconos de formato',
        buscar: `        const btn = e.target instanceof Element ? e.target.closest('[data-formato]') : null;`,
        reemplazar: `        const btn = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest('[data-formato]') : null);`,
        veces: 1
    }
];

const crlf = (s) => s.replace(/\n/g, '\r\n');

const fallos = [];
for (const c of CAMBIOS) {
    const trozos = t.split(crlf(c.buscar));
    const encontrados = trozos.length - 1;
    if (encontrados !== c.veces) {
        fallos.push(`${c.que}: esperaba ${c.veces} y encontro ${encontrados}`);
        continue;
    }
    t = trozos.join(crlf(c.reemplazar));
    console.log(`ok   ${c.que} (${encontrados})`);
}

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}
writeFileSync(RUTA, t, 'utf8');
console.log(`\n${CAMBIOS.length} cambios aplicados en ${RUTA}.`);
