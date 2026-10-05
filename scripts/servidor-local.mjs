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

const servidor = createServer(async (req, res) => {
    // Los errores de la PETICIÓN y de la RESPUESTA se recogen aquí. Un headless Chrome que se cierra a
    // mitad de carga corta la conexión, y escribir en un socket muerto emite un `error` en la respuesta:
    // sin este oyente, un `error` sin manejar tumba el proceso. (Medido: con 150 cortes brutales el
    // servidor aguanta —Node ya protege bastante—, pero esto quita la vía por la que SÍ podría morir.)
    req.on('error', () => {});
    res.on('error', () => {});
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
        try {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 ' + ruta);
        } catch { /* el cliente ya se fue: da igual */ }
    }
});

// Una petición mal formada (el cliente corta a mitad de las cabeceras) NO debe tumbar el servidor.
servidor.on('clientError', (err, socket) => {
    try { socket.destroy(); } catch {}
});

servidor.on('error', (err) => {
    // El caso que importa: el puerto ya está ocupado. Antes esto salía como una excepción sin contexto y
    // el trabajo en segundo plano moría sin decir por qué.
    if (err.code === 'EADDRINUSE') {
        console.error(`EL PUERTO ${PUERTO} YA ESTA OCUPADO: parece que ya hay un servidor levantado.`);
        console.error(`Comprueba con:  curl http://127.0.0.1:${PUERTO}/version.json`);
        console.error(`(Si responde, NO hace falta levantar otro: usa ese.)`);
    } else {
        console.error('el servidor local fallo:', err.message);
    }
    process.exit(1);
});

servidor.listen(PUERTO, () => console.log(`servidor local en http://127.0.0.1:${PUERTO}/ (raiz: ${RAIZ})`));
