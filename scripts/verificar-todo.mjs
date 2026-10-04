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

// PREFLIGHT OBLIGATORIO: si el servidor local no responde, los verificadores miden una PAGINA DE
// ERROR y salen fallos que no son del CSS (paso el 2026-10-01 dos veces: la vista `auth` midio 3
// elementos y el verificador de container queries fallo con "display: block"). Antes de gastar
// minutos, se comprueba y se dice claramente.
try {
    const r = await fetch(URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    if (!html.includes('<link')) { console.error(`El servidor responde en ${URL} pero no parece la app (sin <link>).`); process.exit(2); }
    console.log(`Servidor local OK en ${URL}\n`);
} catch (e) {
    console.error(`NO HAY SERVIDOR en ${URL} (${e.message}).`);
    console.error('Levantalo antes con:  node scripts/servidor-local.mjs 8099');
    console.error('Sin el, los verificadores miden una pagina de error y los fallos son falsos.');
    process.exit(2);
}

let scripts = readdirSync('scripts')
    .filter((f) => f.startsWith('verificar-') && f.endsWith('.mjs'))
    // ESTE fichero NO: el filtro de arriba lo incluye, asi que se llamaba a si mismo y
    // entraba en RECURSION INFINITA (los 18 verificadores pasaban, y en vez de sacar el
    // resumen volvia a empezar). Se descubrio porque el comando no terminaba nunca.
    .filter((f) => f !== 'verificar-todo.mjs')
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
// CRONÓMETRO por verificador. La suite tarda minutos y conviene saber DÓNDE se va el tiempo: cada
// verificador abre su propio Chrome, navega la app y espera estados, así que el total es la suma de 23
// arranques. Se guarda el tiempo de cada uno para poder decir cuáles son los caros (y si merece la pena
// un subconjunto rápido para el día a día).
const tiempos = [];
for (const s of orden) {
    const t0 = Date.now();
    const r = await correr(s);
    const ms = Date.now() - t0;
    tiempos.push({ s, ms });
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
    // El tiempo de cada uno, en la misma línea: así se ve de un vistazo quién se lleva los minutos.
    console.log(`${codigo === 0 ? 'OK   ' : 'FALLA'}  ${s.padEnd(38)} ${linea || '(sin RESULTADO)'}${nota}  ${(ms / 1000).toFixed(1)}s`);
}

const total = tiempos.reduce((s, t) => s + t.ms, 0);
console.log(`\nTIEMPO TOTAL: ${(total / 1000 / 60).toFixed(1)} min en ${tiempos.length} verificadores ` +
    `(media ${(total / tiempos.length / 1000).toFixed(1)}s; mediana ${(tiempos.map((t) => t.ms).sort((a, b) => a - b)[Math.floor(tiempos.length / 2)] / 1000).toFixed(1)}s)`);
console.log('Los 5 mas lentos:');
for (const t of [...tiempos].sort((a, b) => b.ms - a.ms).slice(0, 5)) {
    console.log(`   ${(t.ms / 1000).toFixed(1)}s  ${t.s}`);
}
const lentos = [...tiempos].sort((a, b) => b.ms - a.ms);
const mitad = lentos.slice(0, Math.ceil(lentos.length / 3)).reduce((s, t) => s + t.ms, 0);
console.log(`   (el tercio mas lento se lleva ${(mitad / total * 100).toFixed(0)}% del tiempo)`);

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
