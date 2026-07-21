// scripts/minify.js
// Minificación simple de CSS y JS sin dependencias externas.
// Uso: node scripts/minify.js
// Genera archivos .min.css y .min.js en las mismas carpetas.
//
// Para usar en producción, cambia las referencias en los HTML de
//   <link href="css/style.css">  →  <link href="css/style.min.css">
//   <script src="js/main.js">    →  <script src="js/main.min.js">

const fs = require('fs');
const path = require('path');

function minifyCSS(content) {
    return content
        .replace(/\/\*[\s\S]*?\*\//g, '')     // eliminar comentarios
        .replace(/\s+/g, ' ')                  // colapsar espacios
        .replace(/\s*([{}:;,])\s*/g, '$1')     // quitar espacios alrededor de { } : ; ,
        .replace(/;\s*}/g, '}')                // quitar ; antes de }
        .replace(/\s*!important/g, '!important') // preservar !important
        .trim();
}

function minifyJS(content) {
    return content
        .replace(/\/\/.*$/gm, '')              // comentarios de línea
        .replace(/\/\*[\s\S]*?\*\//g, '')      // comentarios de bloque
        .replace(/^\s*\n/gm, '')               // líneas vacías
        .replace(/\s+/g, ' ')                  // colapsar espacios
        .replace(/\s*([{}();,:])\s*/g, '$1')   // quitar espacios alrededor de operadores
        .replace(/}\s*else\s*{/g, '}else{')    // compactar else
        .replace(/}\s*catch\s*\(/g, '}catch(') // compactar catch
        .trim();
}

function processDir(dir, ext, minifier) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(ext) && !f.includes('.min.'));
    let totalOriginal = 0;
    let totalMin = 0;
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const minified = minifier(content);
        const minPath = filePath.replace(ext, `.min${ext}`);
        fs.writeFileSync(minPath, minified);
        
        const originalSize = Buffer.byteLength(content);
        const minSize = Buffer.byteLength(minified);
        const pct = ((1 - minSize / originalSize) * 100).toFixed(1);
        
        console.log(`  ${file.padEnd(40)} ${(originalSize/1024).toFixed(1)} KB → ${(minSize/1024).toFixed(1)} KB (${pct}%)`);
        totalOriginal += originalSize;
        totalMin += minSize;
    });
    
    return { totalOriginal, totalMin };
}

console.log('\n🔧 Minificando CSS...');
const cssResult = processDir('css', '.css', minifyCSS);

console.log('\n🔧 Minificando JS...');
const jsResult = processDir('js', '.js', minifyJS);

const totalOriginal = cssResult.totalOriginal + jsResult.totalOriginal;
const totalMin = cssResult.totalMin + jsResult.totalMin;
const totalPct = ((1 - totalMin / totalOriginal) * 100).toFixed(1);

console.log(`\n✅ Total: ${(totalOriginal/1024).toFixed(0)} KB → ${(totalMin/1024).toFixed(0)} KB (${totalPct}% reducción)`);
console.log('   Para activar, actualiza las referencias en los HTML a los archivos .min.\n');
