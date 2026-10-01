// SERVIDOR LOCAL para medir (la foto de estilos, los verificadores y las pruebas de cascada).
//
// POR QUE EXISTE: todas las herramientas miden contra http://127.0.0.1:8099/. Si ese servidor no
// esta levantado, el navegador carga una PAGINA DE ERROR y las medidas salen vacias o absurdas sin
// avisar (paso el 2026-10-01: la vista `auth` midio 3 elementos en vez de 18, y parecia un fallo de
// la propia vista). Mejor tenerlo como script y arrancarlo como trabajo en segundo plano.
//
// Uso:  node scripts/servidor-local.mjs [puerto]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const PUERTO = Number(process.argv[2] || 8099);
const RAIZ = process.cwd();
const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

createServer(async (req, res) => {
    let ruta = decodeURIComponent((req.url || '/').split('?')[0]);
    if (ruta === '/') ruta = '/index.html';
    // Sin salirse de la raiz.
    const fichero = join(RAIZ, normalize(ruta).replace(/^([/\\])+/, ''));
    if (!fichero.startsWith(RAIZ)) { res.writeHead(403); res.end('403'); return; }
    try {
        const datos = await readFile(fichero);
        res.writeHead(200, {
            'Content-Type': TIPOS[extname(fichero).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(datos);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 ' + ruta);
    }
}).listen(PUERTO, () => console.log(`servidor local en http://127.0.0.1:${PUERTO}/ (raiz: ${RAIZ})`));
