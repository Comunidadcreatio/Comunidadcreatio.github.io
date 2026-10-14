// PRUEBA del comportamiento REAL de `scripts/bump-version.js`, sin tocar el repo.
//
// POR QUÉ ASÍ, Y NO REPLICANDO SU LÓGICA EN LA PRUEBA:
// la primera versión de esta prueba copiaba el regex, el reemplazo y el extractor, y acabó dando
// 7 FALLO(S) que eran todos de la PRUEBA (extraía la regex equivocada, el fixture tenía 3 grupos en
// vez de 4...). Una prueba que reimplementa lo que mide no mide nada: se estaba comprobando a sí
// misma. Ahora se ejecuta el script de verdad sobre una COPIA del repo (en el directorio temporal)
// con ficheros de caso límite, y se mira el RESULTADO. Es más lento (segundos) y no puede mentir.
//
// Se comprueban las tres protecciones del hito:
//  1) Los imports de EFECTO SECUNDARIO (`import './x.js?v=…'`, sin `from`) se reescriben, y SOLO los
//     de verdad: ni comentarios, ni `reimport`, ni cadenas, ni imports con `from`.
//  2) La rotación de la caché del service worker avisa y FALLA si el patrón de CACHE_NAME no casa.
//  3) El cascade de hashes converge dentro del tope y, si no lo hiciera, el comando fallaría.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let fallos = 0;
const comprobar = (nombre, ok, detalle) => {
    if (ok) console.log('  PASS  ' + nombre + (detalle ? ' → ' + detalle : ''));
    else { fallos++; console.log('  FALLO ' + nombre + (detalle ? ' → ' + detalle : '')); }
};

/** Copia el repo (lo que bump-version necesita) a un directorio temporal. */
function copiaDelRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'bump-prueba-'));
    for (const f of ['index.html', 'auth.html', 'reset-password.html', 'version.json',
                     'sw.js', 'capacitor.config.json', 'vercel.json', 'manifest.webmanifest']) {
        const origen = join(RAIZ, f);
        if (existsSync(origen)) cpSync(origen, join(dir, f));
    }
    for (const d of ['js', 'css', 'scripts']) cpSync(join(RAIZ, d), join(dir, d), { recursive: true });
    return dir;
}

/** Ejecuta bump-version.js en el directorio dado. Devuelve salida y código.
 *  Se usa `spawnSync` con `shell: false` a propósito: es lo único que da el código de salida REAL
 *  sin que lo toque ningún shell intermedio (con `execFileSync` a través de PowerShell llegaba -1). */
function correrBump(dir) {
    const r = spawnSync(process.execPath, [join(dir, 'scripts', 'bump-version.js')],
        { cwd: dir, encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    return { codigo: r.status === null ? 1 : r.status, salida: (r.stdout || '') + (r.stderr || '') };
}

// ---------------------------------------------------------------------------------------------------
// 1) IMPORTS DE EFECTO SECUNDARIO: casos límite en un módulo NUEVO, que nadie importa.
//
//    OJO — esto no es un detalle: la primera versión de esta prueba metía los casos límite al final
//    de `js/utils.js`, y como uno de ellos era `import './config.js'` y `config.js` importa
//    `utils.js`, la prueba CREABA UN CICLO (utils → config → utils) cuyos hashes cambian en cada
//    pasada y no convergen nunca. El propio guardián `NO CONVERGE` que añadimos en este hito lo
//    detectó y el bump falló. Es decir: el guardián funciona, y la prueba estaba mal escrita.
//    (El repo real NO tiene ciclos: `utils.js` es hoja, no importa a nadie del grafo de la app.)
//    Un módulo nuevo y sin dependientes mide lo mismo sin poder crear ciclos.
// ---------------------------------------------------------------------------------------------------
const dir1 = copiaDelRepo();
const moduloPrueba = join(dir1, 'js', 'prueba-imports.js');
writeFileSync(moduloPrueba, [
    "// Módulo de prueba: lo crea scripts/probar-bump-version.mjs. No lo importa nadie.",
    "import './config.js?v=VIEJO';",                 // 1. debe reescribirse
    'import "./auth.js?v=VIEJO";',                   // 2. comilla doble: se conserva
    '\t import "./ciudades.js";',                    // 3. con sangría y sin ?v=: se añade
    "// import './theme.js?v=VIEJO'",                // 4. comentario de línea: NO se toca
    "/* import './pwa.js?v=VIEJO' */",               // 5. comentario de bloque: NO se toca
    "reimport './etiquetas.js?v=VIEJO'",             // 6. dentro de otra palabra: NO se toca
    "const cadena = 'import \"./panel.js?v=VIEJO\"';", // 7. dentro de una cadena: NO se toca
    "import { debugLog } from './utils.js';",        // 8. import con `from`: lo lleva el OTRO regex
    ''
].join('\n'), 'utf8');
// Alguien tiene que "tocar" el repo para que el bump entre en faena y suba la versión.
const utils = join(dir1, 'js', 'utils.js');
writeFileSync(utils, readFileSync(utils, 'utf8') + '\n// tocado a proposito por la prueba\n', 'utf8');

const r1 = correrBump(dir1);
const lineas = readFileSync(moduloPrueba, 'utf8').split('\n').map((l) => l.trim());
const L = {
    simple: lineas[1],
    doble: lineas[2],
    sangria: lineas[3],
    comentarioLinea: lineas[4],
    comentarioBloque: lineas[5],
    reimport: lineas[6],
    cadena: lineas[7],
    conFrom: lineas[8]
};

comprobar('la prueba se ejecutó sin fallar', r1.codigo === 0, 'exit ' + r1.codigo);
if (r1.codigo !== 0) {
    console.log('      --- último tramo de la salida del bump (para diagnosticar el exit) ---');
    for (const l of r1.salida.split('\n').slice(-14)) console.log('      | ' + l);
}
comprobar('reescribe el import de efecto con comilla simple',
    /^import '\.\/config\.js\?v=[0-9a-f]{10}';$/.test(L.simple), L.simple);
comprobar('reescribe el de comilla doble CONSERVANDO la comilla',
    /^import "\.\/auth\.js\?v=[0-9a-f]{10}";$/.test(L.doble), L.doble);
comprobar('añade el hash si no lo llevaba y conserva la sangría',
    /^import "\.\/ciudades\.js\?v=[0-9a-f]{10}";$/.test(L.sangria), L.sangria);
comprobar('NO toca un comentario de línea', L.comentarioLinea === "// import './theme.js?v=VIEJO'", L.comentarioLinea);
comprobar('NO toca un comentario de bloque', L.comentarioBloque === "/* import './pwa.js?v=VIEJO' */", L.comentarioBloque);
comprobar('NO toca `reimport` (ni ninguna palabra que acabe en import)',
    L.reimport === "reimport './etiquetas.js?v=VIEJO'", L.reimport);
comprobar('NO toca el import que hay dentro de una cadena (no deja comillas desbalanceadas)',
    L.cadena === "const cadena = 'import \"./panel.js?v=VIEJO\"';", L.cadena);
comprobar('el import con `from` del mismo fichero también queda con hash correcto',
    /^import \{ debugLog \} from '\.\/utils\.js\?v=[0-9a-f]{10}';$/.test(L.conFrom), L.conFrom);

// El hash que se le puso a config.js tiene que ser el MD5 real del fichero (no un valor cualquiera).
const { createHash } = await import('node:crypto');
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex').slice(0, 10);
const esperadoConfig = md5(join(dir1, 'js', 'config.js'));
comprobar('el hash que se puso es el MD5 real del módulo importado',
    L.simple.includes('?v=' + esperadoConfig), L.simple + ' (esperado ' + esperadoConfig + ')');
rmSync(dir1, { recursive: true, force: true });

// ---------------------------------------------------------------------------------------------------
// 2) LA CACHÉ DEL SERVICE WORKER
// ---------------------------------------------------------------------------------------------------
const dirA = copiaDelRepo();
writeFileSync(join(dirA, 'js', 'utils.js'), readFileSync(join(dirA, 'js', 'utils.js'), 'utf8') + '\n// ensuciado\n', 'utf8');
const rA = correrBump(dirA);
const swA = readFileSync(join(dirA, 'sw.js'), 'utf8');
comprobar('con el formato real, rota el número de la caché del service worker',
    /creatio-cache-v3/.test(swA), (swA.match(/CACHE_NAME = '[^']+'/) || [''])[0]);
comprobar('y no falla', rA.codigo === 0, 'exit ' + rA.codigo);
// La copia a www/ y android/ tiene que salir ya con la caché rotada (si no, la verificación de sync
// del propio bump fallaría, y esa verificación es la que garantiza que el APK y la web coinciden).
const swWww = readFileSync(join(dirA, 'www', 'sw.js'), 'utf8');
comprobar('la copia de www/ queda con la MISMA caché rotada', swWww === swA);
comprobar('la sincronización no reporta diferencias',
    /Verificación de sync: raíz \/ www \/ android idénticos/.test(rA.salida));
rmSync(dirA, { recursive: true, force: true });

const dirB = copiaDelRepo();
writeFileSync(join(dirB, 'sw.js'), 'const CACHE = "creatio-cache-v9";\n', 'utf8');
writeFileSync(join(dirB, 'js', 'utils.js'), readFileSync(join(dirB, 'js', 'utils.js'), 'utf8') + '\n// ensuciado\n', 'utf8');
const rB = correrBump(dirB);
comprobar('si el patrón de CACHE_NAME no casa, el comando FALLA (antes se quedaba callado)',
    rB.codigo !== 0 && /NO se reconoce su línea de CACHE_NAME/.test(rB.salida),
    'exit ' + rB.codigo);
comprobar('y explica qué hacer',
    /Sin rotación, la caché del service worker crece sin límite/.test(rB.salida));
rmSync(dirB, { recursive: true, force: true });

// ---------------------------------------------------------------------------------------------------
// 3) IDEMPOTENCIA (es lo que valida el CI con `git diff --quiet`) y tope de pasadas.
// ---------------------------------------------------------------------------------------------------
const dirC = copiaDelRepo();
const rC1 = correrBump(dirC);
const rC2 = correrBump(dirC);
comprobar('sobre el árbol ya actualizado, la primera pasada no cambia nada',
    /Sin cambios detectados/.test(rC1.salida));
comprobar('y la segunda tampoco (idempotente: el `git diff --quiet` del CI pasaría)',
    /Sin cambios detectados/.test(rC2.salida));
rmSync(dirC, { recursive: true, force: true });

const srcBump = readFileSync(join(RAIZ, 'scripts', 'bump-version.js'), 'utf8');
const tope = Number((srcBump.match(/const MAX_PASADAS = (\d+);/) || [])[1]);
comprobar('el tope de pasadas tiene margen sobre el peor caso medido (5)', tope >= 10, 'MAX_PASADAS = ' + tope);
comprobar('y si no converge, el comando FALLA en vez de dejarlo pasar',
    /NO CONVERGE/.test(srcBump) && /process\.exitCode = 1/.test(srcBump));

console.log('');
console.log('RESULTADO: ' + (fallos ? fallos + ' FALLO(S)' : 'sin fallos'));
process.exit(fallos ? 1 : 0);
