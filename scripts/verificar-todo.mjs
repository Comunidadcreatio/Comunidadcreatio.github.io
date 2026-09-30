// Corre TODOS los verificadores y saca un resumen en una tabla.
//
// POR QUE EXISTE: durante una sesion larga de cambios se corrian solo unos pocos (los de
// la zona tocada) y los otros ocho quedaron sin mirar. Al correrlos TODOS aparecieron dos
// avisos que llevaban ahi sin que nadie los viera. Con este comando no hay que acordarse
// de cuales hay.
//
// Uso:
//   node scripts/verificar-todo.mjs                       (contra el servidor local)
//   node scripts/verificar-todo.mjs http://127.0.0.1:8099/
//   node scripts/verificar-todo.mjs --sin-tipos           (no corre el chequeo de tipos)
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const SIN_TIPOS = args.includes('--sin-tipos');
// --solo <texto>: corre solo los verificadores cuyo nombre contenga ese texto (para probar
// uno sin esperar a los trece).
const iSolo = args.indexOf('--solo');
const SOLO = iSolo >= 0 ? (args[iSolo + 1] || '') : '';

let scripts = readdirSync('scripts')
    .filter((f) => f.startsWith('verificar-') && f.endsWith('.mjs'))
    .filter((f) => !SIN_TIPOS || f !== 'verificar-tipos.mjs')
    .filter((f) => !SOLO || f.includes(SOLO))
    .sort();

// El chequeo de tipos no necesita servidor y va primero (es el mas rapido).
const orden = ['verificar-tipos.mjs', ...scripts.filter((s) => s !== 'verificar-tipos.mjs')]
    .filter((s) => scripts.includes(s));

const resultados = [];
for (const s of orden) {
    const necesitaUrl = s !== 'verificar-tipos.mjs';
    // Estos dos escriben el resumen en un fichero (--salida), no en la salida normal.
    const conSalida = /contraste|aspecto/.test(s);
    const ficheroSalida = join('scripts', `.tmp-${s}.txt`);
    const extra = conSalida ? ['--salida', ficheroSalida] : [];
    const argv = [join('scripts', s), ...(necesitaUrl ? [URL] : []), ...extra];
    const r = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    r.stdout.on('data', (d) => { salida += d; });
    r.stderr.on('data', (d) => { salida += d; });
    const codigo = await new Promise((res) => r.on('exit', res));
    if (conSalida) {
        try { salida += readFileSync(ficheroSalida, 'utf8'); } catch (e) { /* sin fichero */ }
        try { rmSync(ficheroSalida, { force: true }); } catch (e) { /* nada */ }
    }
    const linea = (salida.split('\n').filter((l) => /RESULTADO/.test(l)).pop() || '').replace(/RESULTADO:\s*/, '').trim();
    resultados.push({ script: s, codigo, linea, salida });
    console.log(`${codigo === 0 ? 'OK   ' : 'FALLA'}  ${s.padEnd(38)} ${linea || '(sin RESULTADO)'}`);
}

const conFallo = resultados.filter((r) => r.codigo !== 0);
console.log(`\n${resultados.length - conFallo.length} de ${resultados.length} verificadores en verde.`);
if (conFallo.length) {
    console.log('\nDetalle de los que fallan:');
    for (const r of conFallo) {
        console.log(`\n--- ${r.script} ---`);
        for (const l of r.salida.split('\n').filter((x) => /FALLO/.test(x)).slice(0, 8)) console.log('  ' + l.trim());
    }
}
process.exit(conFallo.length ? 1 : 0);
