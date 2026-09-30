// CHEQUEO DE TIPOS del JavaScript, sin compilar nada.
//
// Por qué no se puede llamar a `tsc` directamente sobre el repo: los imports llevan el
// hash de caché (`from './utils.js?v=abc123'`, que pone bump-version.js) y TypeScript no
// sabe resolver un módulo con `?v=` detrás. Da "Cannot find module".
//
// Solución: se hace una COPIA temporal de js/ con esos `?v=<hash>` quitados de los
// imports. El código es idéntico, solo cambia el nombre del módulo, así que los tipos que
// se comprueban son los de verdad. El repo no se toca.
//
// `tsc` se lanza con la salida heredada (para que la veas tal cual) y su código de salida
// es el de este script: si hay errores, falla.
//
// Uso:  node scripts/verificar-tipos.mjs        (o `npm run check`)
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAIZ = process.cwd();
const ORIGEN = join(RAIZ, 'js');
const DESTINO = mkdtempSync(join(tmpdir(), 'tipos-js-'));
mkdirSync(DESTINO, { recursive: true });

// Se copia js/ quitando el hash de los imports.
let copiados = 0, conHash = 0;
for (const f of readdirSync(ORIGEN)) {
    if (!f.endsWith('.js') && !f.endsWith('.d.ts')) continue;
    const original = readFileSync(join(ORIGEN, f), 'utf8');
    const limpiado = original.replace(/(\.js|\.d\.ts)\?v=[0-9a-f]+/g, (m, ext) => { conHash++; return ext; });
    writeFileSync(join(DESTINO, f), limpiado, 'utf8');
    copiados++;
}

// La configuración del repo, apuntando a la copia.
const config = JSON.parse(readFileSync(join(RAIZ, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
writeFileSync(join(DESTINO, 'tsconfig.json'),
    JSON.stringify({ ...config, include: ['*.js', '*.d.ts'], exclude: [] }, null, 2), 'utf8');

// Qué ficheros están vigilados (los que llevan el pragma).
const vigilados = readdirSync(DESTINO).filter((f) => f.endsWith('.js') &&
    /^\s*\/\/\s*@ts-check/m.test(readFileSync(join(DESTINO, f), 'utf8')));
console.log(`Chequeo de tipos: ${copiados} ficheros copiados (${conHash} imports con ?v= limpiados)`);
console.log(`Vigilados con @ts-check (${vigilados.length}): ${vigilados.join(', ') || 'ninguno todavía'}`);
if (!vigilados.length) {
    console.log('\nNo hay ningún fichero con `// @ts-check` arriba, así que no hay nada que comprobar.');
    console.log('Para adoptar uno: ponle `// @ts-check` en la primera línea y arregla lo que salga.');
    rmSync(DESTINO, { recursive: true, force: true });
    process.exit(0);
}
console.log('');

const tsc = join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc');
const hijo = spawn(process.execPath, [tsc, '-p', DESTINO, '--pretty', 'false'], { stdio: 'inherit' });
hijo.on('exit', (codigo) => {
    rmSync(DESTINO, { recursive: true, force: true });
    if (codigo === 0) console.log('\nSIN ERRORES DE TIPOS en los ficheros vigilados.');
    else console.log('\nHay errores de tipos (los ficheros vigilados tienen que quedar limpios).');
    process.exit(codigo ?? 1);
});
