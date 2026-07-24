/**
 * bump-version.js
 * Automatiza el cache-busting y versionado.
 *
 * Qué hace:
 * 1. Calcula un hash MD5 del contenido de cada CSS/JS referenciado en HTML
 * 2. Actualiza los ?v=... en index.html, auth.html, reset-password.html
 * 3. Incrementa la versión en version.json
 * 4. Solo modifica archivos si algo cambió realmente
 *
 * Uso: node scripts/bump-version.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HTML_FILES = ['index.html', 'auth.html', 'reset-password.html'];
const VERSION_FILE = 'version.json';

/**
 * Calcula el hash MD5 de un archivo.
 */
function hashFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 10);
}

/**
 * Encuentra todas las referencias a CSS/JS con ?v=... en un HTML.
 * Retorna [{ fullMatch, filePath, oldVer }].
 */
function findAssets(html, htmlFile) {
    const regex = /(href|src)="((css\/|js\/)[^"']+)\?v=([^"']+)"/g;
    const assets = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        assets.push({
            fullMatch: match[0],
            filePath: match[2],
            oldVer: match[4],
            htmlFile,
        });
    }
    return assets;
}

function main() {
    const projectRoot = path.resolve(__dirname, '..');
    let anyChange = false;

    // 1. Procesar cada HTML
    for (const htmlFile of HTML_FILES) {
        const htmlPath = path.join(projectRoot, htmlFile);
        if (!fs.existsSync(htmlPath)) {
            console.log(`⚠  ${htmlFile} no encontrado, se omite.`);
            continue;
        }

        let html = fs.readFileSync(htmlPath, 'utf-8');
        const assets = findAssets(html, htmlFile);

        if (assets.length === 0) {
            console.log(`ℹ  ${htmlFile}: sin assets con ?v=, se omite.`);
            continue;
        }

        let modified = false;
        for (const asset of assets) {
            const assetPath = path.join(projectRoot, asset.filePath);
            if (!fs.existsSync(assetPath)) {
                console.log(`⚠  ${asset.filePath} no existe en disco, se conserva ?v=${asset.oldVer}`);
                continue;
            }

            const newHash = hashFile(assetPath);
            if (newHash !== asset.oldVer) {
                const oldFull = asset.fullMatch;
                const newFull = oldFull.replace(`?v=${asset.oldVer}`, `?v=${newHash}`);
                html = html.replace(oldFull, newFull);
                console.log(`✓ ${htmlFile}: ${asset.filePath} ?v=${asset.oldVer} → ?v=${newHash}`);
                modified = true;
                anyChange = true;
            } else {
                console.log(`· ${htmlFile}: ${asset.filePath} sin cambios (?v=${asset.oldVer})`);
            }
        }

        if (modified) {
            fs.writeFileSync(htmlPath, html, 'utf-8');
            console.log(`✎ ${htmlFile} actualizado.`);
        }
    }

    // 2. Actualizar version.json (solo si hubo cambios reales)
    if (anyChange) {
        const versionPath = path.join(projectRoot, VERSION_FILE);
        if (fs.existsSync(versionPath)) {
            const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
            const parts = versionData.version.split('.').map(Number);
            // Incrementa el PATCH (1.0.18 → 1.0.19)
            parts[2] = (parts[2] || 0) + 1;
            versionData.version = parts.join('.');
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            versionData.date = `${y}-${m}-${d}`;
            fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');
            console.log(`✎ ${VERSION_FILE} → versión ${versionData.version} (${versionData.date})`);
        }
    }

    if (!anyChange) {
        console.log('\n✅ Sin cambios detectados. Nada que actualizar.');
    } else {
        console.log('\n✅ Cache-busting actualizado. Listo para commit.');
    }
}

main();
