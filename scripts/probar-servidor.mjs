// MARTILLO: corta peticiones a lo bruto contra el servidor local, que es lo que hace un headless Chrome al
// cerrarse a mitad de carga. Sirve para DOS cosas:
//   1) comprobar si el servidor actual MUERE con un cliente que corta (si muere, ahi esta la causa de que
//      se cayera tantas veces);
//   2) comprobar, despues de arreglarlo, que aguanta.
// Uso: node scripts/_martillo.mjs [veces]
import net from 'node:net';

const PUERTO = 8099;
const VECES = Number(process.argv[2] || 150);
const peticiones = [
    'GET /index.html HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',                    // normal, pero se corta al recibir
    'GET /css/style.css HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',                 // fichero grande a medias
    'GET /js/main.js HTTP/1.1\r\nHost: 127.0.0.1\r\n',                        // cabecera INCOMPLETA
    'GARBAGE /%%% HTTP/9.9\r\nHost: x\r\n\r\n',                               // basura
    'GET /../../etc/passwd HTTP/1.1\r\nHost: x\r\n\r\n',                      // intento de salirse
    'GET /no-existe-12345 HTTP/1.1\r\nHost: x\r\n\r\n'                        // 404
];

let cortadas = 0;
for (let i = 0; i < VECES; i++) {
    const texto = peticiones[i % peticiones.length];
    await new Promise((res) => {
        const s = net.connect(PUERTO, '127.0.0.1', () => {
            s.write(texto);
            // Se corta en cuanto llega algo (o enseguida), como un Chrome que se va.
            setTimeout(() => { try { s.destroy(); } catch {} res(); }, i % 3 === 0 ? 0 : 5);
        });
        s.on('data', () => { try { s.destroy(); } catch {} });
        s.on('error', () => res());
        setTimeout(() => { try { s.destroy(); } catch {} res(); }, 400);
    });
    cortadas++;
}
console.log(`cortadas ${cortadas} peticiones a lo bruto`);

// Y ahora: ¿el servidor sigue vivo y sirviendo bien?
try {
    const r = await fetch(`http://127.0.0.1:${PUERTO}/version.json`);
    const j = await r.json();
    console.log(`DESPUES DEL MARTILLO: el servidor responde (status ${r.status}, version ${j.version})`);
    process.exit(0);
} catch (e) {
    console.log(`DESPUES DEL MARTILLO: EL SERVIDOR NO RESPONDE → ${e.message}`);
    process.exit(1);
}
