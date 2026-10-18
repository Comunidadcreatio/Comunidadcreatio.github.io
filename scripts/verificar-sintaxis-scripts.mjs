// COMPILA TODOS LOS SCRIPTS. Es el guardián de un error que se ha cometido SEIS veces en esta campaña:
// meter un BACKTICK dentro de una plantilla que se inyecta en la página (`evalJs(\`...\`)`). Eso rompe el
// fichero entero, y la sintaxis solo se nota al ejecutarlo. `node --check` lo caza en milisegundos: esto lo
// hace con TODOS los scripts, de una pasada, y el fallo deja de poder llegar a un commit.
//
// Además comprueba lo mismo en los ficheros de la app (`js/*.js`), que se sirven: un error de sintaxis ahí
// deja la app entera sin arrancar.
//
// AGUJERO QUE SE CERRÓ (2026-10-18). Este verificador daba PASS con `js/auth-logic.js` ROTO (un `import`
// dentro de otro `import`). La causa no era el bucle: era `node --check` sobre un `.js` dentro de un
// paquete CommonJS. Comprobado con una matriz de casos:
//
//     fichero                                   como .js    como .mjs
//     import { / roto                           ACEPTA      rechaza
//     import + let y = {;                        ACEPTA      rechaza
//     export const = 1;                          ACEPTA      rechaza
//     let y = {;  (sin import/export)            rechaza     rechaza
//
// Es decir: EN CUANTO EL FICHERO TIENE `import` O `export`, `node --check` deja de validarlo y devuelve 0.
// Y los 24 módulos de `js/` con imports eran justo los que nunca se compilaban de verdad.
//
// ARREGLO: se compila cada fichero con la extensión que le corresponde (.mjs si tiene import/export,
// .cjs si es un script clásico), en un fichero temporal. Y antes de fiarse del resultado se pasan unos
// CÁNARIOS: fragmentos rotos que TIENEN que ser rechazados. Si el compilador aceptara uno, el verificador
// falla con un mensaje explícito, en vez de dar un PASS que no significa nada. Un instrumento que no puede
// fallar no sirve de nada.
//
// Uso: node scripts/verificar-sintaxis-scripts.mjs
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const GRUPOS = [
    { dir: 'scripts', filtro: (n) => n.endsWith('.mjs') || n.endsWith('.js') || n.endsWith('.cjs') },
    { dir: 'js', filtro: (n) => n.endsWith('.js') && !n.includes('.min.') }
];

// Un fichero es ESM si tiene una sentencia `import`/`export` al principio de una línea.
// Los que no la tienen son scripts clásicos (`<script src>`): se compilan como CJS.
function esESM(src) {
    return /(?:^|\n)\s*(?:import|export)\b/.test(src);
}

const temporal = mkdtempSync(join(tmpdir(), 'sintaxis-'));

/**
 * Compila un texto como módulo ESM o como script CJS.
 * @param {string} src
 * @param {boolean} comoESM
 * @returns {{ ok: boolean, salida: string }}
 */
function compilar(src, comoESM) {
    const ruta = join(temporal, comoESM ? 'pieza.mjs' : 'pieza.cjs');
    writeFileSync(ruta, src, 'utf8');
    try {
        execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' });
        return { ok: true, salida: '' };
    } catch (e) {
        const salida = String(e.stderr || e.message)
            .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' | ');
        return { ok: false, salida };
    }
}

// ── CÁNARIOS ────────────────────────────────────────────────────────────────────────────────────────
// Un roto que DEBE ser rechazado y un válido que DEBE ser aceptado, en cada modo. Si esto no se cumple,
// el compilador no está mirando lo que creemos y el resto del informe no vale.
const CANARIOS = [
    { nombre: 'ESM: import dentro de import',   src: "import {\nimport { z } from 'q';\n a\n} from 'x';\n", esm: true,  debePasar: false },
    { nombre: 'ESM: llave sin cerrar',          src: "import { a } from 'x';\nlet y = {;\n",                esm: true,  debePasar: false },
    { nombre: 'ESM: export incompleto',         src: "export const = 1;\n",                              esm: true,  debePasar: false },
    { nombre: 'CJS: llave sin cerrar',          src: "const y = {;\n",                                  esm: false, debePasar: false },
    { nombre: 'ESM: valido (control)',          src: "import { a } from 'x';\nexport const z = 1;\n",  esm: true,  debePasar: true  },
    { nombre: 'CJS: valido (control)',          src: "const y = { a: 1 };\nmodule.exports = y;\n",      esm: false, debePasar: true  }
];

let canariosMal = 0;
for (const c of CANARIOS) {
    const r = compilar(c.src, c.esm);
    const bien = r.ok === c.debePasar;
    if (!bien) {
        canariosMal++;
        console.log(`  FALLO canario "${c.nombre}": se esperaba ${c.debePasar ? 'ACEPTAR' : 'RECHAZAR'} y hace lo contrario`);
    }
}
if (canariosMal) {
    rmSync(temporal, { recursive: true, force: true });
    console.log(`\nRESULTADO: el compilador no es fiable (${canariosMal}/${CANARIOS.length} canarios mal). ` +
        'NO te fíes de ningún PASS: revisa `node --check` y la extensión de los temporales.');
    process.exit(1);
}
console.log(`  PASS  canarios: ${CANARIOS.length}/${CANARIOS.length} (detecta los rotos que debe detectar)`);

let pruebas = 0, fallos = 0;
try {
    for (const { dir, filtro } of GRUPOS) {
        const ficheros = readdirSync(dir).filter(filtro);
        console.log(`\n=== ${dir}/: ${ficheros.length} ficheros`);
        let malos = 0, esm = 0, cjs = 0;
        for (const f of ficheros) {
            const ruta = `${dir}/${f}`;
            const src = readFileSync(ruta, 'utf8');
            const comoESM = f.endsWith('.mjs') ? true : f.endsWith('.cjs') ? false : esESM(src);
            if (comoESM) esm++; else cjs++;

            pruebas++;
            const r = compilar(src, comoESM);
            if (!r.ok) {
                malos++; fallos++;
                console.log(`  FALLO ${ruta} (como ${comoESM ? '.mjs' : '.cjs'}) → ${r.salida.slice(0, 200)}`);
            }
        }
        if (!malos) console.log(`  PASS  los ${ficheros.length} compilan (${esm} como ESM, ${cjs} como CJS)`);

        // Un fichero que se sirve VACÍO también es un fallo silencioso (pasa cuando una herramienta de texto
        // lo deja en blanco): se comprueba que ninguno esté a cero.
        for (const f of ficheros) {
            const ruta = `${dir}/${f}`;
            pruebas++;
            const contenido = readFileSync(ruta, 'utf8');
            if (contenido.trim().length === 0) { fallos++; console.log(`  FALLO ${ruta} esta VACIO`); }
        }
    }
} finally {
    rmSync(temporal, { recursive: true, force: true });
}

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
process.exit(fallos ? 1 : 0);
