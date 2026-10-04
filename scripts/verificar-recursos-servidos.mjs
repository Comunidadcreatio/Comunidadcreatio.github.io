// VERIFICA LOS RECURSOS QUE SE SIRVEN EN CADA PÁGINA. Nace de dos huecos reales encontrados el
// 2026-10-04, los dos de la misma familia ("una página o un recurso nuevo se queda fuera y nadie se
// entera"):
//
//   1) `auth.html` y `reset-password.html` cargaban `js/version-check.js` **sin `?v=`**, mientras
//      `index.html` sí lo llevaba. El actualizador no lo veía (su patrón EXIGÍA el `?v=`) y esas páginas
//      se servían de caché para siempre. Ya está arreglado en la herramienta, y esto lo vigila.
//   2) El `bump-version.js` trabaja con una **lista escrita a mano** de páginas (`HTML_FILES`) y otra de
//      ficheros a copiar a `www/` y a `android/`. Una página nueva **no se versiona ni se copia** al APK.
//
// Comprueba, para CADA página HTML de la raíz (descubierta, no listada a mano):
//   - que cada `css/...` y `js/...` que carga EXISTA en disco;
//   - que lleve `?v=` y que ese hash COINCIDA con el MD5 real del fichero (si no, falta el bump);
//   - que la página esté en las dos listas del actualizador (si no, se queda fuera del APK).
//
// Uso: node scripts/verificar-recursos-servidos.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';

const RAIZ = '.';
const PAGINAS = readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
const BUMP = readFileSync('scripts/bump-version.js', 'utf8');

const hashFile = (p) => crypto.createHash('md5').update(readFileSync(p)).digest('hex').slice(0, 10);

let pruebas = 0, fallos = 0;
const check = (nombre, ok, detalle = '') => {
    pruebas++;
    if (ok) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
};

// Las dos listas del actualizador, leídas de su código (si cambian de forma, se avisa).
const listaDe = (nombre) => {
    const m = BUMP.match(new RegExp(`const ${nombre} = \\[([^\\]]+)\\]`));
    return m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean) : null;
};
const HTML_FILES = listaDe('HTML_FILES');
const COPIAR = listaDe('filesToCopy');

console.log(`=== Páginas en la raíz: ${PAGINAS.length} (${PAGINAS.join(', ')})`);
if (!HTML_FILES || !COPIAR) {
    console.log('  AVISO: no se pudieron leer las listas del actualizador; se omite esa comprobación');
} else {
    for (const p of PAGINAS) {
        check(`${p} está en HTML_FILES (el actualizador la procesa)`, HTML_FILES.includes(p),
            HTML_FILES.includes(p) ? '' : `no está: ${HTML_FILES.join(', ')}`);
        check(`${p} está en la lista de copia (llega al APK)`, COPIAR.includes(p),
            COPIAR.includes(p) ? '' : `no está: ${COPIAR.join(', ')}`);
    }
}

for (const pagina of PAGINAS) {
    const html = readFileSync(pagina, 'utf8');
    console.log(`\n=== ${pagina}`);
    const refs = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"'?]+)(?:\?v=([^"']+))?"/g)];
    check(`${pagina}: carga algún recurso local`, refs.length > 0, `${refs.length} referencias`);
    if (!refs.length) continue;
    for (const m of refs) {
        const ruta = m[1];
        const ver = m[2] || null;
        if (!existsSync(ruta)) { check(`${pagina} → ${ruta} existe`, false, 'el fichero no está en disco'); continue; }
        if (ver === null) { check(`${pagina} → ${ruta} lleva ?v=`, false, 'se sirve SIN hash: la caché puede devolver una copia vieja'); continue; }
        const real = hashFile(ruta);
        check(`${pagina} → ${ruta} ?v=${ver}`, ver === real,
            ver === real ? '' : `el fichero es ${real}: falta \`node scripts/bump-version.js\``);
    }
}

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK — ${fallos ? fallos + ' FALLO(S)' : 'sin fallos'}`);
process.exit(fallos ? 1 : 0);
