// QUITAR `!important` de las reglas que casen con un selector.
//
// A propósito NO reestructura nada: recorre los bloques y solo cambia el CUERPO de las
// reglas que casan (les quita ` !important`). Los trozos que no casan se reescriben tal
// cual, así que no puede mover reglas de sitio ni anidar capas por accidente (que es el
// error que cometieron los otros dos transformadores en su primera versión).
//
// Uso:
//   node scripts/quitar-important.mjs --hoja formularios.css --selector ".crear-btn"
//   node scripts/quitar-important.mjs --hoja formularios.css --selector ".crear-btn" --dry-run
//   (se puede repetir --selector varias veces)
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const HOJA = val('--hoja') || 'formularios.css';
const SECOS = { ruta: val('--selector') };
const PATRONES = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--selector') PATRONES.push(args[i + 1]);
const DRY = args.includes('--dry-run');
if (!PATRONES.length) { console.error('Falta --selector "<trozo de selector>"'); process.exit(2); }

// Trocea en trozos de primer nivel (con comentarios y comillas respetados).
function trocear(css) {
    const trozos = [];
    let i = 0, inicio = 0, prof = 0, comilla = null;
    while (i < css.length) {
        const c = css[i];
        if (comilla) { if (c === comilla && css[i - 1] !== '\\') comilla = null; i++; continue; }
        if (c === '"' || c === "'") { comilla = c; i++; continue; }
        if (c === '/' && css[i + 1] === '*') { const fin = css.indexOf('*/', i + 2); i = fin < 0 ? css.length : fin + 2; continue; }
        if (c === '{') { prof++; i++; continue; }
        if (c === '}') { prof--; i++; if (prof === 0) { trozos.push(css.slice(inicio, i)); inicio = i; } continue; }
        if (c === ';' && prof === 0) { i++; trozos.push(css.slice(inicio, i)); inicio = i; continue; }
        i++;
    }
    if (inicio < css.length) trozos.push(css.slice(inicio));
    return trozos;
}
const cabecera = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').trim().split('{')[0].trim();
const cuerpo = (t) => t.slice(t.indexOf('{') + 1, t.lastIndexOf('}'));
const casa = (sel) => PATRONES.some((p) => sel.includes(p));

let quitados = 0;
const reglasTocadas = [];
function procesar(css, nivel = 0) {
    return trocear(css).map((t) => {
        const cab = cabecera(t);
        if (!cab) return t;
        if (cab.startsWith('@')) {
            // Bloque de @media / @layer / @supports: se procesa por dentro y se rearma igual.
            const dentro = cuerpo(t);
            const nuevoDentro = procesar(dentro, nivel + 1);
            return t.slice(0, t.indexOf('{') + 1) + nuevoDentro + t.slice(t.lastIndexOf('}'));
        }
        if (!casa(cab)) return t;
        const antes = cuerpo(t);
        const despues = antes.replace(/\s*!important/g, () => { quitados++; return ''; });
        if (despues === antes) return t;
        reglasTocadas.push(cab.replace(/\s+/g, ' ').slice(0, 70));
        return t.slice(0, t.indexOf('{') + 1) + despues + t.slice(t.lastIndexOf('}'));
    }).join('');
}

const ruta = join('css', HOJA);
const original = readFileSync(ruta, 'utf8');
const nuevo = procesar(original);
const llaves = (s) => [(s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length];
const [a1, c1] = llaves(original), [a2, c2] = llaves(nuevo);
if (a1 !== a2 || c1 !== c2) { console.error(`ABORTADO: cambiarían las llaves (${a1}/${c1} -> ${a2}/${c2})`); process.exit(1); }
console.log(`${DRY ? 'SIMULACIÓN' : 'HECHO'} en ${HOJA}: ${quitados} \`!important\` quitados en ${reglasTocadas.length} reglas`);
for (const r of reglasTocadas) console.log(`  ${r}`);
if (!DRY) { copyFileSync(ruta, ruta + '.antes-de-quitar'); writeFileSync(ruta, nuevo, 'utf8'); }
void SECOS;
