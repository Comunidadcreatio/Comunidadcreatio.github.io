// Adopta un modulo para el chequeo de tipos: le pone `// @ts-check` en la primera linea.
//
// POR QUE UN SCRIPT Y NO UN COMANDO DE POWERSHELL: esto se hizo una vez a mano con
// `Get-Content -Raw` + `WriteAllText` y la codificacion se estropeo: los ficheros UTF-8
// se leyeron con otra tabla de caracteres y al reescribirlos quedo DOBLE CODIFICACION
// ("San Cristóbal" -> "San CristÃ³bal"). En ciudades.js eso rompio el directorio del
// chat entero ("No hay pueblos disponibles"), porque los nombres de los pueblos se
// comparan con lo que devuelve el backend. Node lee y escribe UTF-8 de verdad, asi que
// aqui no puede pasar. NUNCA reescribir estos ficheros con operaciones de texto de
// PowerShell.
//
// Uso:
//   node scripts/adoptar-modulo.mjs js/ciudades.js js/config.js
//   node scripts/adoptar-modulo.mjs --quitar js/notificaciones.js
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const args = process.argv.slice(2);
const QUITAR = args.includes('--quitar');
const ficheros = args.filter((a) => !a.startsWith('--'));
if (!ficheros.length) { console.error('Falta el fichero. Uso: node scripts/adoptar-modulo.mjs js/config.js'); process.exit(2); }

const MARCA = '// @ts-check';
for (const ruta of ficheros) {
    const original = readFileSync(ruta, 'utf8');     // UTF-8 de verdad
    const lineas = original.split('\n');
    const tiene = /^\s*\/\/\s*@ts-check/.test(lineas[0] || '');
    if (QUITAR) {
        if (!tiene) { console.log(`${ruta}: ya estaba sin @ts-check`); continue; }
        lineas.shift();
        copyFileSync(ruta, ruta + '.antes-de-adoptar');
        writeFileSync(ruta, lineas.join('\n'), 'utf8');
        console.log(`${ruta}: @ts-check quitado`);
        continue;
    }
    if (tiene) { console.log(`${ruta}: ya estaba adoptado`); continue; }
    copyFileSync(ruta, ruta + '.antes-de-adoptar');
    writeFileSync(ruta, MARCA + '\n' + original, 'utf8');
    console.log(`${ruta}: adoptado (con @ts-check)`);
}

// Comprobacion de seguridad: ningun fichero tocado puede quedar con doble codificacion.
const MARCAS = /Ã|Â|â€/g;
let malos = 0;
for (const ruta of ficheros) {
    const s = readFileSync(ruta, 'utf8');
    if (MARCAS.test(s)) { console.error(`OJO: ${ruta} ha quedado con doble codificacion`); malos++; }
}
if (malos) process.exit(1);
console.log('Comprobado: los ficheros siguen en UTF-8 correcto.');
