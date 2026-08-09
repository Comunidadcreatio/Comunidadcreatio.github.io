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
    const content = fs.readFileSync(filePath, 'utf-8');
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
 * Actualiza los ?v= de los imports de módulos ES (./mod?v=...) en un archivo JS.
 * Mantiene en sync main.js y perfil.js cuando cambia galeria.js u otro módulo.
 */
function updateModuleImports(projectRoot, jsFile, modFiles, setAnyChange) {
    const filePath = path.join(projectRoot, jsFile);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;
    modFiles.forEach(mod => {
        const modFullPath = path.join(projectRoot, 'js', mod);
        if (!fs.existsSync(modFullPath)) return;
        const modHash = hashFile(modFullPath);
        const escaped = mod.replace(/\./g, '\\.');
        const regex = new RegExp(`from\\s+['\"]\\.\\/${escaped}\\?v=([^'\"]*)['\"]`, 'g');
        const match = regex.exec(content);
        if (match && match[1] !== modHash) {
            content = content.replace(match[0], match[0].replace(match[1], modHash));
            console.log(`✓ ${jsFile} import: ./${mod} ?v=${match[1]} → ?v=${modHash}`);
            changed = true;
            if (setAnyChange) setAnyChange();
        }
    });
    if (changed) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✎ ${jsFile} imports actualizados.`);
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
    // 4a. Detectar cambios en módulos ES importados desde main.js / perfil.js
    const MOD_FILES = ['galeria.js', 'galeria-ui.js', 'comentarios.js', 'notificaciones.js', 'perfil.js', 'chat.js', 'push.js'];
    const JS_IMPORT_FILES = ['js/main.js', 'js/perfil.js'];
    JS_IMPORT_FILES.forEach(f => updateModuleImports(projectRoot, f, MOD_FILES, () => { anyChange = true; }));

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

            // 4d. Actualizar ?v= en imports de módulos ES (main.js / perfil.js)
            JS_IMPORT_FILES.forEach(f => updateModuleImports(projectRoot, f, MOD_FILES, null));
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
        'capacitor.config.json', 'capacitor.plugins.json'
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

    console.log('📦 Sincronización completada.\n');
}

main();
