// scripts/minify.js
// Minificación de CSS y JS sin dependencias externas.
// Uso: node scripts/minify.js
// Genera archivos .min.css y .min.js en las mismas carpetas.
//
// Para usar en producción, cambia las referencias en los HTML de
//   <link href="css/style.css">  →  <link href="css/style.min.css">
//   <script src="js/main.js">    →  <script src="js/main.min.js">
//
// SEGURIDAD (v2):
//  - Strings, template literals y data URIs se enmascaran ANTES de borrar
//    comentarios, así '//' u '/*' dentro de strings no rompen el código.
//  - Cada .min.js se valida con 'node --check' tras minificar: si el resultado
//    no es sintácticamente válido, el script FALLA en voz alta (borra el
//    .min.js corrupto y sale con error) en lugar de corromper silenciosamente.
//  - Sigue siendo un minificador básico: para producción real se recomienda
//    Terser (minificación AST completa).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const STR_MASK_PREFIX = '__STR_';
// El patrón usa \x60 para la comilla invertida (template literals) sin backticks literales.
const STR_MASK_RE = /(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\x60(?:\\.|[^\x60\\])*\x60)/g;

function maskStrings(content) {
    const strings = [];
    const masked = content.replace(STR_MASK_RE, (m) => {
        strings.push(m);
        return STR_MASK_PREFIX + (strings.length - 1) + '__';
    });
    return { masked, strings };
}

function unmaskStrings(masked, strings) {
    return masked.replace(/__STR_(\d+)__/g, (_, i) => strings[Number(i)]);
}

function minifyCSS(content) {
    const { masked, strings } = maskStrings(content);
    const out = masked
        .replace(/\/\*[\s\S]*?\*\//g, '')        // comentarios de bloque
        .replace(/\s+/g, ' ')                     // colapsar espacios
        .replace(/\s*([{}:;,])\s*/g, '$1')        // espacios alrededor de { } : ; ,
        .replace(/;\s*}/g, '}')                   // quitar ; antes de }
        .replace(/\s*!important/g, '!important')  // preservar !important
        .trim();
    return unmaskStrings(out, strings);
}

function minifyJS(content) {
    const { masked, strings } = maskStrings(content);
    const out = masked
        .replace(/\/\*[\s\S]*?\*\//g, '')         // comentarios de bloque
        .replace(/\/\/[^\n]*/g, '')               // comentarios de línea
        .replace(/^\s*\n/gm, '')                  // líneas vacías
        .replace(/\s+/g, ' ')                     // colapsar espacios
        .replace(/\s*([{}();,:])\s*/g, '$1')      // espacios alrededor de operadores
        .replace(/}\s*else\s*{/g, '}else{')       // compactar else
        .replace(/}\s*catch\s*\(/g, '}catch(')    // compactar catch
        .trim();
    return unmaskStrings(out, strings);
}

// Valida un .min.js con node --check (copia temporal .mjs = siempre ESM).
function validateJS(minPath) {
    const tmp = minPath.replace(/\.min\.js$/, '.min.check.mjs');
    try {
        fs.copyFileSync(minPath, tmp);
        const res = spawnSync(process.execPath, ['--check', tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
        return res.status === 0;
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* noop */ }
    }
}

function processDir(dir, ext, minifier, validate) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext) && !f.includes('.min.') && !f.includes('.check.'));
    let totalOriginal = 0;
    let totalMin = 0;
    let failed = false;

    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const minified = minifier(content);
        const minPath = filePath.replace(ext, '.min' + ext);
        fs.writeFileSync(minPath, minified);

        if (validate && !validate(minPath)) {
            console.log('  ❌ ' + file + ' → minificado INVÁLIDO (sintaxis rota). Se elimina ' + path.basename(minPath) + ' y se aborta.');
            console.log('     Causa probable: template literals anidados u otros casos que un minificador por regex no puede manejar.');
            console.log('     Para minificar este archivo usa Terser (minificador AST):  npm i -D terser  y  npx terser js/' + file + ' -o js/' + file.replace(/.js$/, '.min.js') + '');
            try { fs.unlinkSync(minPath); } catch (e) {}
            failed = true;
            return;
        }

        const originalSize = Buffer.byteLength(content);
        const minSize = Buffer.byteLength(minified);
        const pct = ((1 - minSize / originalSize) * 100).toFixed(1);
        console.log('  ' + file.padEnd(40) + ' ' + (originalSize / 1024).toFixed(1) + ' KB → ' + (minSize / 1024).toFixed(1) + ' KB (' + pct + '%)');
        totalOriginal += originalSize;
        totalMin += minSize;
    });

    return { totalOriginal, totalMin, failed };
}

console.log('\n🔧 Minificando CSS...');
const cssResult = processDir('css', '.css', minifyCSS, null);

console.log('\n🔧 Minificando JS (validando con node --check)...');
const jsResult = processDir('js', '.js', minifyJS, validateJS);

const totalOriginal = cssResult.totalOriginal + jsResult.totalOriginal;
const totalMin = cssResult.totalMin + jsResult.totalMin;
const totalPct = totalOriginal ? ((1 - totalMin / totalOriginal) * 100).toFixed(1) : '0.0';

console.log('\n✅ Total: ' + (totalOriginal / 1024).toFixed(0) + ' KB → ' + (totalMin / 1024).toFixed(0) + ' KB (' + totalPct + '% reducción)');
console.log('   Para activar, actualiza las referencias en los HTML a los archivos .min.\n');

if (cssResult.failed || jsResult.failed) {
    console.error('❌ Minificación abortada: hay archivos .min corruptos. No se usarán en producción.');
    process.exit(1);
}
