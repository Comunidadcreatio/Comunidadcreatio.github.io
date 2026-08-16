// Servidor estático mínimo para probar el fix localmente (puerto 8099).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = 8099;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = normalize(join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404); res.end('404'); return;
  }
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(filePath));
}).listen(PORT, () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));
