// PILOTO de `!important`, SEGUNDA prueba (corte mas fino) sobre la misma familia de auth.css.
//
// La primera prueba quito el `!important` de las 10 declaraciones y NO era inocuo: el borde
// se movio en 6 comprobaciones (la foto vio 2 y el verificador de estados vio 4 mas). O sea
// que las 4 declaraciones de BORDE son portantes.
//
// Esta prueba quita el `!important` solo de las 6 que NO son el borde (3 `box-shadow`, 1
// `outline` y 2 `background-color`) y deja los 4 bordes como estaban. Es la granularidad que
// manda el README: una declaracion (o el trozo que se pueda demostrar) cada vez.
//
// Uso:  node scripts/arreglar-important-familia-auth-2.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/auth.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');
let t = ORIGINAL;

const CAMBIOS = [
    {
        que: ':invalid claro: sombra y outline (el borde NO se toca)',
        buscar: `input:invalid:not(.input-error),
select:invalid:not(.input-error) {
    border: 1.5px solid rgba(0, 0, 0, 0.12) !important;
    box-shadow: none !important;
    outline: none !important;
}`,
        reemplazar: `input:invalid:not(.input-error),
select:invalid:not(.input-error) {
    border: 1.5px solid rgba(0, 0, 0, 0.12) !important;
    box-shadow: none;
    outline: none;
}`,
        veces: 1
    },
    {
        que: ':valid claro: sombra y fondo (el borde NO se toca)',
        buscar: `input:valid,
select:valid,
#login-form input:valid,
#forgot-section input:valid {
    border: 1.5px solid var(--color-success) !important;
    box-shadow: none !important;
    background-color: rgba(255, 255, 255, 0.05) !important;
}`,
        reemplazar: `input:valid,
select:valid,
#login-form input:valid,
#forgot-section input:valid {
    border: 1.5px solid var(--color-success) !important;
    box-shadow: none;
    background-color: rgba(255, 255, 255, 0.05);
}`,
        veces: 1
    },
    {
        que: ':valid oscuro: sombra y fondo (el borde NO se toca)',
        buscar: `[data-theme="dark"] input:valid,
[data-theme="dark"] select:valid,
[data-theme="dark"] #login-form input:valid,
[data-theme="dark"] #forgot-section input:valid {
    border: 1.5px solid #22c55e !important;
    box-shadow: none !important;
    background-color: rgba(0, 0, 0, 0.15) !important;
}`,
        reemplazar: `[data-theme="dark"] input:valid,
[data-theme="dark"] select:valid,
[data-theme="dark"] #login-form input:valid,
[data-theme="dark"] #forgot-section input:valid {
    border: 1.5px solid #22c55e !important;
    box-shadow: none;
    background-color: rgba(0, 0, 0, 0.15);
}`,
        veces: 1
    }
];

const fallos = [];
for (const c of CAMBIOS) {
    const trozos = t.split(c.buscar);
    const encontrados = trozos.length - 1;
    if (encontrados !== c.veces) {
        fallos.push(`${c.que}: esperaba ${c.veces} y encontro ${encontrados}`);
        continue;
    }
    t = trozos.join(c.reemplazar);
    console.log(`ok   ${c.que} (${encontrados} bloque)`);
}

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}

const antes = (ORIGINAL.match(/!important/g) || []).length;
const despues = (t.match(/!important/g) || []).length;
if (antes - despues !== 6) {
    console.error(`\nOJO: se esperaban 6 !important menos y han salido ${antes - despues}. NO se escribe.`);
    process.exit(1);
}
writeFileSync(RUTA, t, 'utf8');
console.log(`\n${RUTA}: ${antes} -> ${despues} !important (6 menos, los 4 bordes siguen con !important).`);
