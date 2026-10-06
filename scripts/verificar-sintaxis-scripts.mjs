// COMPILA TODOS LOS SCRIPTS. Es el guardián de un error que se ha cometido SEIS veces en esta campaña:
// meter un BACKTICK dentro de una plantilla que se inyecta en la página (`evalJs(\`...\`)`). Eso rompe el
// fichero entero, y la sintaxis solo se nota al ejecutarlo. `node --check` lo caza en milisegundos: esto lo
// hace con TODOS los scripts, de una pasada, y el fallo deja de poder llegar a un commit.
//
// Además comprueba lo mismo en los ficheros de la app (`js/*.js`), que se sirven: un error de sintaxis ahí
// deja la app entera sin arrancar.
//
// Uso: node scripts/verificar-sintaxis-scripts.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GRUPOS = [
    { dir: 'scripts', filtro: (n) => n.endsWith('.mjs') || n.endsWith('.js') || n.endsWith('.cjs') },
    { dir: 'js', filtro: (n) => n.endsWith('.js') && !n.includes('.min.') }
];

let pruebas = 0, fallos = 0;
for (const { dir, filtro } of GRUPOS) {
    const ficheros = readdirSync(dir).filter(filtro);
    console.log(`\n=== ${dir}/: ${ficheros.length} ficheros`);
    let malos = 0;
    for (const f of ficheros) {
        const ruta = `${dir}/${f}`;
        pruebas++;
        try {
            execFileSync(process.execPath, ['--check', ruta], { stdio: 'pipe' });
        } catch (e) {
            malos++;
            fallos++;
            const salida = String(e.stderr || e.message).split('\n').filter((l) => l.trim()).slice(0, 3).join(' | ');
            console.log(`  FALLO ${ruta} → ${salida.slice(0, 200)}`);
        }
    }
    if (!malos) console.log(`  PASS  los ${ficheros.length} compilan`);
    // Un fichero que se sirve VACÍO también es un fallo silencioso (pasa cuando una herramienta de texto
    // lo deja en blanco): se comprueba que ninguno esté a cero.
    for (const f of ficheros) {
        const ruta = `${dir}/${f}`;
        pruebas++;
        const contenido = readFileSync(ruta, 'utf8');
        if (contenido.trim().length === 0) { fallos++; console.log(`  FALLO ${ruta} esta VACIO`); }
    }
}

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
process.exit(fallos ? 1 : 0);
