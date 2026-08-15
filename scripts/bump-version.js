/**
 * bump-version.js
 * Automatiza el cache-busting y versionado.
 *
 * Qué hace:
 * 1. Calcula un hash MD5 del contenido de cada CSS/JS referenciado en HTML
 * 2. Escanea @import en CSS y actualiza sus ?v= si el importado cambió
 * 3. Actualiza los ?v=... en index.html, auth.html, reset-password.html
 * 4. Incrementa la versión en version.json
 * 5. Solo modifica archivos si algo cambió realmente
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
    // Leer como Buffer: hash idéntico para texto UTF-8 y correcto para binarios (iconos)
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 10);
}

/**
 * Encuentra todas las referencias a CSS/JS con ?v=... en un HTML.
 * Retorna [{ fullMatch, filePath, oldVer }].
 */
function findAssets(html) {
    const regex = /(?:href|src)="((?:css\/|js\/)[^"']+)\?v=([^"']+)"/g;
    const assets = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        assets.push({
            fullMatch: match[0],
            filePath: match[1],
            oldVer: match[2],
        });
    }
    return assets;
}

/**
 * Encuentra @import de CSS con ?v=...
 */
function findCssImports(cssContent) {
    const regex = /@import\s+url\(['"]?((?:css\/)?([^'"\)]+\.css))\?v=([^'"\)]+)['"]?\)/g;
    const imports = [];
    let match;
    while ((match = regex.exec(cssContent)) !== null) {
        // Si el path no empieza con css/, se asume que es relativo al mismo dir
        const rawPath = match[1];
        const filePath = rawPath.startsWith('css/') ? rawPath : `css/${rawPath}`;
        imports.push({
            fullMatch: match[0],
            filePath: filePath,
            oldVer: match[3],
        });
    }
    return imports;
}

/**
 * Actualiza los ?v= de TODOS los imports de módulos ES en TODOS los js/*.js.
 * Antes solo se rastreaban unos pocos módulos (main.js/perfil.js → MOD_FILES) y
 * los módulos compartidos (config.js, utils.js, auth.js…) quedaban SIN ?v=: con
 * la caché immutable de Vercel (1 año) un cambio en config.js rompía la app
 * (SyntaxError: export no provisto). Este updater garantiza que cualquier
 * módulo importado lleve el hash de su contenido.
 * Se repite hasta converger: cambiar un import modifica el hash del importador,
 * y eso a su vez cambia los ?v= de quien lo importa.
 */
function updateAllModuleImports(projectRoot, setAnyChange) {
    const jsDir = path.join(projectRoot, 'js');
    const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.includes('.min.') && !f.includes('.check.'));
    for (let pass = 0; pass < 6; pass++) {
        let passChanged = false;
        for (const importer of files) {
            const filePath = path.join(jsDir, importer);
            let content = fs.readFileSync(filePath, 'utf-8');
            let changed = false;
            content = content.replace(/from\s+['\"]\.\/([A-Za-z0-9_-]+\.js)(\?v=[^'\"]*)?['\"]/g, (match, modFile) => {
                const modPath = path.join(jsDir, modFile);
                if (!fs.existsSync(modPath)) return match;
                const h = hashFile(modPath);
                const newMatch = `from './${modFile}?v=${h}'`;
                if (newMatch !== match) {
                    changed = true;
                    console.log(`✓ ${importer} import: ./${modFile} ?v=${h}`);
                }
                return newMatch;
            });
            if (changed) {
                fs.writeFileSync(filePath, content, 'utf-8');
                console.log(`✎ ${importer} imports actualizados.`);
                passChanged = true;
                if (setAnyChange) setAnyChange();
            }
        }
        if (!passChanged) break;
    }
}

function processFile(projectRoot, filePath, findFn, labelFn) {
    const fullPath = path.join(projectRoot, filePath);
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠  ${filePath} no encontrado, se omite.`);
        return { modified: false, anyChange: false };
    }

    let content = fs.readFileSync(fullPath, 'utf-8');
    const assets = findFn(content);

    if (assets.length === 0) {
        return { modified: false, anyChange: false };
    }

    let modified = false;
    let anyChange = false;
    for (const asset of assets) {
        const assetPath = path.join(projectRoot, asset.filePath);
        if (!fs.existsSync(assetPath)) {
            console.log(`⚠  ${asset.filePath} no existe en disco, se conserva ?v=${asset.oldVer}`);
            continue;
        }

        const newHash = hashFile(assetPath);
        if (newHash !== asset.oldVer) {
            content = content.replace(asset.fullMatch, asset.fullMatch.replace(`?v=${asset.oldVer}`, `?v=${newHash}`));
            console.log(`✓ ${labelFn(asset.filePath)}: ${asset.filePath} ?v=${asset.oldVer} → ?v=${newHash}`);
            modified = true;
            anyChange = true;
        } else {
            console.log(`· ${asset.filePath} sin cambios (?v=${asset.oldVer})`);
        }
    }

    if (modified) {
        fs.writeFileSync(fullPath, content, 'utf-8');
        console.log(`✎ ${filePath} actualizado.`);
    }

    return { modified, anyChange };
}

function main() {
    const projectRoot = path.resolve(__dirname, '..');
    let anyChange = false;

    // 1. Procesar cada HTML (CSS/JS referenciados)
    for (const htmlFile of HTML_FILES) {
        const result = processFile(projectRoot, htmlFile, findAssets,
            (fp) => `${htmlFile}: ${fp}`);
        if (result.anyChange) anyChange = true;
    }

    // 2. Procesar @import en cada CSS referenciado en HTML
    for (const htmlFile of HTML_FILES) {
        const htmlPath = path.join(projectRoot, htmlFile);
        if (!fs.existsSync(htmlPath)) continue;
        const html = fs.readFileSync(htmlPath, 'utf-8');
        const cssAssets = findAssets(html).filter(a => a.filePath.endsWith('.css'));
        for (const cssAsset of cssAssets) {
            const cssPath = path.join(projectRoot, cssAsset.filePath);
            if (!fs.existsSync(cssPath)) continue;
            const result = processFile(projectRoot, cssAsset.filePath, findCssImports,
                (fp) => `${cssAsset.filePath} → ${fp}`);
            if (result.anyChange) anyChange = true;
        }
    }

    // 3. Si CSS cambió, reprocesar HTMLs (el hash del CSS padre pudo cambiar)
    if (anyChange) {
        for (const htmlFile of HTML_FILES) {
            const result = processFile(projectRoot, htmlFile, findAssets,
                (fp) => `${htmlFile} [2ª pasada]: ${fp}`);
            // No modificamos anyChange — ya es true
        }
    }

    // 4. Actualizar version.json (solo si hubo cambios reales)
    // 4a. Detectar cambios en imports de módulos ES (todos los js/*.js)
    updateAllModuleImports(projectRoot, () => { anyChange = true; });

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

            // 4b. Actualizar currentVer en el script auto-recarga de index.html
            const indexPath = path.join(projectRoot, 'index.html');
            if (fs.existsSync(indexPath)) {
                let html = fs.readFileSync(indexPath, 'utf-8');
                html = html.replace(/var currentVer = '[\d.]+'/, `var currentVer = '${versionData.version}'`);
                fs.writeFileSync(indexPath, html, 'utf-8');
            }

            // 4c. Actualizar ?v= en capacitor.config.json para forzar recarga en WebView mobile
            const capFiles = ['capacitor.config.json', 'www/capacitor.config.json', 'android/app/src/main/assets/capacitor.config.json', 'android/app/src/main/assets/public/capacitor.config.json'];
            capFiles.forEach(f => {
                const capPath = path.join(projectRoot, f);
                if (fs.existsSync(capPath)) {
                    let cap = fs.readFileSync(capPath, 'utf-8');
                    cap = cap.replace(/(\?v=)[\d]+/, `$1${versionData.version.replace(/\./g, '')}`);
                    fs.writeFileSync(capPath, cap, 'utf-8');
                }
            });

            // 4c2. Sincronizar versión del APK Android (android/app/build.gradle)
            // android/ está en .gitignore, pero mantiene el APK local alineado con la web
            const gradlePath = path.join(projectRoot, 'android/app/build.gradle');
            if (fs.existsSync(gradlePath)) {
                let gradle = fs.readFileSync(gradlePath, 'utf-8');
                const g1 = gradle.replace(/versionName\s+\x22[\d.]+\x22/, 'versionName \x22' + versionData.version + '\x22');
                const g2 = g1.replace(/versionCode\s+\d+/, (m) => {
                    const n = parseInt(m.replace(/\D/g, ''), 10) + 1;
                    return 'versionCode ' + n;
                });
                if (g2 !== gradle) {
                    fs.writeFileSync(gradlePath, g2, 'utf-8');
                    console.log('✎ android/app/build.gradle → versionName ' + versionData.version + ' (versionCode +1)');
                }
            }

            // 4d. Actualizar ?v= en imports de módulos ES (todos los js/*.js)
            updateAllModuleImports(projectRoot, null);
        }
    }

    // 4e. Reprocesar HTMLs: el hash de main.js/perfil.js pudo cambiar en 4a/4d,
    // así que los ?v= de los HTML deben reflejar el contenido final.
    for (const htmlFile of HTML_FILES) {
        processFile(projectRoot, htmlFile, findAssets,
            (fp) => `${htmlFile} [final]: ${fp}`);
    }

    if (!anyChange) {
        console.log('\n✅ Sin cambios detectados. Nada que actualizar.');
    } else {
        console.log('\n✅ Cache-busting actualizado. Listo para commit.');
    }

    // 5. Sincronizar a www/ y android/assets/ (para Capacitor)
    console.log('\n📦 Sincronizando activos a www/ y android/...');
    const dirs = [
        { src: '.', dest: 'www' },
        { src: 'www', dest: 'android/app/src/main/assets/public' }
    ];
    const filesToCopy = [
        'index.html', 'auth.html', 'reset-password.html', 'version.json',
        'capacitor.config.json', 'capacitor.plugins.json',
        'sw.js', 'manifest.webmanifest'
    ];
    const dirsToCopy = ['css', 'js', 'iconos'];

    for (const { src: srcDir, dest: destDir } of dirs) {
        if (!fs.existsSync(path.join(projectRoot, destDir))) {
            fs.mkdirSync(path.join(projectRoot, destDir), { recursive: true });
        }
        for (const file of filesToCopy) {
            const src = path.join(projectRoot, srcDir, file);
            const dest = path.join(projectRoot, destDir, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
            }
        }
        for (const dir of dirsToCopy) {
            const src = path.join(projectRoot, srcDir, dir);
            const dest = path.join(projectRoot, destDir, dir);
            if (fs.existsSync(src)) {
                fs.cpSync(src, dest, { recursive: true });
            }
        }
        console.log(`  ✓ ${srcDir}/ → ${destDir}/`);
    }

    // 5b. Sincronizar capacitor.config.json también al assets/ raíz de Android
    // (es el que realmente lee Capacitor en tiempo de ejecución)
    {
        const srcCap = path.join(projectRoot, 'capacitor.config.json');
        const destCap = path.join(projectRoot, 'android/app/src/main/assets/capacitor.config.json');
        if (fs.existsSync(srcCap)) {
            const destDir = path.dirname(destCap);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(srcCap, destCap);
            console.log('  ✓ capacitor.config.json → android/app/src/main/assets/');
        }
    }

    // 5c. Verificar que las copias (raíz / www / android) quedaron idénticas
    const verifyPairs = [];
    for (const file of filesToCopy) {
        verifyPairs.push(['.', 'www', file], ['www', 'android/app/src/main/assets/public', file]);
    }
    const walkFiles = (rootRel, rel) => {
        const abs = path.join(projectRoot, rootRel, rel);
        if (!fs.existsSync(abs)) return;
        if (fs.statSync(abs).isDirectory()) {
            for (const e of fs.readdirSync(abs)) walkFiles(rootRel, path.join(rel, e));
        } else {
            const fullRel = path.join(rootRel, rel);
            verifyPairs.push(['.', 'www', fullRel], ['www', 'android/app/src/main/assets/public', fullRel]);
        }
    };
    for (const dir of dirsToCopy) walkFiles(dir, '');
    let syncErrors = 0;
    for (const [srcDir, destDir, rel] of verifyPairs) {
        const s = path.join(projectRoot, srcDir, rel);
        const d = path.join(projectRoot, destDir, rel);
        if (!fs.existsSync(s)) continue; // origen no existe (ej: capacitor.plugins.json opcional)
        if (!fs.existsSync(d)) {
            console.log('  ⚠ FALTA en ' + destDir + '/: ' + rel);
            syncErrors++;
        } else if (hashFile(s) !== hashFile(d)) {
            console.log('  ⚠ DIFERENTE en ' + destDir + '/: ' + rel);
            syncErrors++;
        }
    }
    if (syncErrors > 0) {
        console.error('\n❌ Sync incompleto (' + syncErrors + ' archivo(s) no idénticos). Revisa los marcados.');
        process.exitCode = 1;
    } else {
        console.log('  ✓ Verificación de sync: raíz / www / android idénticos.\n');
    }
}

main();
