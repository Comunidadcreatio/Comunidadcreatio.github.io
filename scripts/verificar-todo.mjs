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

// Corre UN verificador y devuelve su codigo de salida, su linea RESULTADO y su salida.
async function correr(s) {
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
    return { codigo, linea, salida };
}

const resultados = [];
for (const s of orden) {
    const r = await correr(s);
    let codigo = r.codigo;
    let linea = r.linea;
    let reintentado = false;
    // SI FALLA, SE REPITE UNA VEZ Y SOLO. Motivo: cada verificador abre su propio Chrome y
    // las medidas se contaminan si queda algun Chrome vivo de una corrida anterior (paso
    // dos veces: fallos del nav y de aspecto que desaparecian al repetirlo). Un fallo de
    // verdad falla tambien a la segunda; uno por carga, no.
    if (codigo !== 0) {
        reintentado = true;
        console.log(`      (falla; se repite solo, por si es carga de la maquina...)`);
        await new Promise((res) => setTimeout(res, 4000));
        const r2 = await correr(s);
        codigo = r2.codigo;
        linea = r2.linea;
        r.salida = r2.salida;
    }
    resultados.push({ script: s, codigo, linea, salida: r.salida, reintentado });
    const nota = reintentado ? (codigo === 0 ? '  (OK a la segunda: era carga)' : '  (falla tambien repetido)') : '';
    console.log(`${codigo === 0 ? 'OK   ' : 'FALLA'}  ${s.padEnd(38)} ${linea || '(sin RESULTADO)'}${nota}`);
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
