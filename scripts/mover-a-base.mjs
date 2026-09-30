// MOVER A `base` las reglas que son de ETIQUETA.
//
// Están en `components` pero son de etiqueta o reset (`*`, `main`, `picture`, `form`,
// `fieldset`, `legend`, `input:invalid`...). Su sitio es `base`: así pierden contra todo
// lo demás por ORDEN DE CAPAS y no hace falta subirles la especificidad para nada.
//
// Mueve la regla COMPLETA y, si está dentro de un `@media`, la saca conservando su
// condición: `@layer base { @media (...) { <la regla> } }`. Si el `@media` se queda
// vacío, se quita.
//
// NO mueve las de `:-webkit-autofill`: su trabajo es pisar el fondo que el navegador pone
// al autocompletar, así que en `base` perderían contra los fondos de los inputs de
// `components` y volvería a verse el amarillo. Se quedan donde están.
//
// Uso:
//   node scripts/mover-a-base.mjs --dry-run
//   node scripts/mover-a-base.mjs
import { readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry-run');
const EXCLUIDOS = /autofill/i;
const ETIQUETAS = new Set(('html body main section article aside header footer nav div span p a img picture source ' +
    'ul ol li button input select textarea label form table thead tbody tr td th h1 h2 h3 h4 h5 h6 small strong ' +
    'em b i hr br video iframe svg path caption figure figcaption blockquote pre code time address dl dt dd ' +
    'fieldset legend optgroup option progress meter canvas details summary dialog template slot')
    .split(' '));

function esEtiquetaSola(sel) {
    const limpio = sel.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').replace(/\[[^\]]*\]/g, '').trim();
    return limpio === '*' || ETIQUETAS.has(limpio.toLowerCase());
}
function todoEtiquetas(selector) {
    const partes = selector.split(',').map((s) => s.trim()).filter(Boolean);
    return partes.length > 0 && partes.every(esEtiquetaSola);
}

// Trocea CSS en trozos de primer nivel (respeta comentarios y comillas).
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
const cabeceraDe = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').trim().split('{')[0].trim();
const cuerpoDe = (t) => { const a = t.indexOf('{'); const b = t.lastIndexOf('}'); return a < 0 ? '' : t.slice(a + 1, b); };
const comentarioDe = (t) => (t.match(/^\s*(\/\*[\s\S]*?\*\/)/) || ['', ''])[1];

let totalMovidas = 0;
const informe = [];
for (const hoja of readdirSync('css').filter((f) => f.endsWith('.css') && !f.includes('antes-de-capar')).sort()) {
    const ruta = join('css', hoja);
    const original = readFileSync(ruta, 'utf8');
    const trozos = trocear(original);
    // Se localizan: preámbulo, bloques de capa que ya existen, y el bloque components.
    // OJO: hay que contemplar TODAS las capas (`utilities` incluida). Si una capa
    // desconocida cayera en el saco de "lo demás", se volvería a envolver dentro de
    // `components` y quedaría ANIDADA: pasó con `utilities`, y entonces `.hidden` dejó de
    // ganar a las reglas de `components` y el feed de Problogs se quedó a la vista.
    const preambulo = [], bases = [], componentes = [], otrasCapas = [];
    for (const t of trozos) {
        const cab = cabeceraDe(t);
        const capa = cab.match(/^@layer\s+([\w-]+)\s*$/);
        if (/^@import\b/.test(cab) || /^@layer\s+[\w,\s-]+;$/.test(t.replace(/\/\*[\s\S]*?\*\//g, ' ').trim())) preambulo.push(t);
        else if (capa && capa[1] === 'base') bases.push(t);
        else if (capa && capa[1] === 'components') componentes.push(t);
        else if (capa) otrasCapas.push(t);          // utilities, reset... tal cual, fuera
        else if (!cab) preambulo.push(t);          // comentarios sueltos
        else componentes.push(`@layer components {${t}}`);   // suelto (no debería quedar)
    }
    if (!componentes.length) continue;
    const movidas = [];   // { regla, media }
    const conservadas = [];
    for (const bloque of componentes) {
        const interior = cuerpoDe(bloque);
        for (const t of trocear(interior)) {
            const cab = cabeceraDe(t);
            if (!cab) { conservadas.push(t); continue; }
            const esMedia = /^@(media|supports)\b/.test(cab);
            if (esMedia) {
                const quedan = [], sacadas = [];
                for (const u of trocear(cuerpoDe(t))) {
                    const cabU = cabeceraDe(u);
                    if (cabU && !cabU.startsWith('@') && todoEtiquetas(cabU) && !EXCLUIDOS.test(cabU)) { sacadas.push(u); movidas.push({ regla: u, media: cab }); }
                    else quedan.push(u);
                }
                if (sacadas.length) {
                    const resto = quedan.join('');
                    if (resto.trim()) conservadas.push(`${cab}{${resto}}`);
                } else conservadas.push(t);
            } else if (todoEtiquetas(cab) && !EXCLUIDOS.test(cab)) {
                movidas.push({ regla: t, media: null });
            } else conservadas.push(t);
        }
    }
    if (!movidas.length) continue;
    // Se agrupan las que comparten `@media`, conservando el orden.
    const porMedia = new Map();
    const sueltas = [];
    for (const m of movidas) {
        if (!m.media) { sueltas.push(m.regla); continue; }
        if (!porMedia.has(m.media)) porMedia.set(m.media, []);
        porMedia.get(m.media).push(m.regla);
    }
    let bloqueBase = '\n@layer base {\n';
    for (const r of sueltas) bloqueBase += `${comentarioDe(r)}\n${r.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')}\n`;
    for (const [media, reglas] of porMedia) {
        bloqueBase += `\n    ${media}{\n`;
        for (const r of reglas) bloqueBase += `        ${r.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim()}\n`;
        bloqueBase += '    }\n';
    }
    bloqueBase += '}\n';
    const nuevo = `${preambulo.join('')}\n${bases.join('\n')}\n${bloqueBase}\n@layer components {\n${conservadas.join('')}\n}\n\n${otrasCapas.join('\n')}\n`;
    totalMovidas += movidas.length;
    informe.push({ hoja, movidas: movidas.length });
    if (!DRY) {
        copyFileSync(ruta, ruta + '.antes-de-mover');
        writeFileSync(ruta, nuevo, 'utf8');
    }
}
console.log(DRY ? 'SIMULACIÓN:' : 'HECHO:');
for (const f of informe) console.log(`  ${f.hoja.padEnd(24)} movidas a base: ${f.movidas}`);
console.log(`\nTotal de reglas movidas a base: ${totalMovidas}`);
