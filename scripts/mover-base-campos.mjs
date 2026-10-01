// REDISENO: el estilo BASE de los campos de la app pasa a `@layer base`.
//
// QUE SE MUEVE: el bloque que le da a TODOS los campos de la app su aspecto (ancho, relleno,
// borde `1px solid var(--color-border)`, radio, fondo...) para los inputs de los formularios
// (`#registro-form`, `#login-form`, `#solicitar-restablecimiento-form`,
// `#confirmar-eliminacion-form`, `#panel-artista`) y para los selects del registro.
//
// POR QUE: eso es el estilo de ETIQUETA, o sea la capa `base`. Estaba en `components` (lo dejo
// ahi `capar-hojas.mjs`), y mientras estuvo ahi le GANABA por especificidad (lleva ids) a las
// reglas de estado de auth.css (`input:valid`, `input:invalid:not(.input-error)`), que se
// defendian con `!important`. Al bajarlo a `base` esas reglas ganan por CAPA y el `!important`
// deja de hacer falta: ese es el rediseno.
//
// LO QUE NO SE MUEVE (a proposito): la regla de `:focus` (es un estado, no el aspecto base) y
// el `textarea` de la obra (es un ajuste del panel). Menos es mas: un movimiento cada vez.
//
// Uso:  node scripts/mover-base-campos.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/formularios.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');
let t = ORIGINAL;

// El bloque que se mueve, tal cual esta (input + selects).
const BLOQUE = `#registro-form input[type="text"],
#registro-form input[type="email"],
#registro-form input[type="password"],
#login-form input[type="email"],
#login-form input[type="password"],
#solicitar-restablecimiento-form input[type="email"],
#confirmar-eliminacion-form input[type="password"],
#panel-artista input {
    width: 100%;
    max-width: 100%;
    padding: 12px 14px;
    margin-bottom: 16px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 16px;
    background: var(--color-white);
    color: var(--color-text);
    transition: border-color 0.2s, box-shadow 0.2s;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Selects: padding-right amplio para la flecha, heredan resto de estilos de inputs */
#registro-form select {
    width: 100%;
    max-width: 100%;
    padding: 12px 40px 12px 14px;
    margin-bottom: 16px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 16px;
    background: var(--color-white);
    color: var(--color-text);
    transition: border-color 0.2s, box-shadow 0.2s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%231a1a1a' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
}`;

// El bloque de `base` que ya existe, para colgar el nuevo justo detras.
const ANCLA_BASE = `@layer base {
    @media (max-width: 768px) {
        body, html {
            overflow-x: hidden;
        }
    }
}`;

const fallos = [];
if ((t.split(BLOQUE).length - 1) !== 1) fallos.push('el bloque de los campos no aparece exactamente 1 vez');
if ((t.split(ANCLA_BASE).length - 1) !== 1) fallos.push('el bloque @layer base de arriba no aparece exactamente 1 vez');
if (fallos.length) {
    console.error('NO SE HA ESCRITO NADA:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}

// Se quita de `components` (dejando el hueco con un comentario que apunta arriba).
const AVISO = `/* El aspecto BASE de los campos (inputs y selects de los formularios) se movio a
   \`@layer base\`, al principio del fichero: es estilo de ETIQUETA y ahi no le gana por
   especificidad a las reglas de estado. */
`;
t = t.split(BLOQUE).join(AVISO.trimEnd());

// Y se pone dentro de `base`, en un bloque nuevo (los bloques de la misma capa se suman).
const NUEVO = `${ANCLA_BASE}

/* Aspecto BASE de los campos de TODA la app (inputs de los formularios y selects del
   registro): ancho, relleno, borde, radio, fondo. Va en \`base\` a proposito: es el estilo de
   etiqueta, y en \`components\` le ganaba por especificidad (lleva ids) a las reglas de estado
   de auth.css, que se defendian con \`!important\`. Movido el 2026-10-01. */
@layer base {
${BLOQUE.split('\n').map((l) => (l.trim() ? '    ' + l : l)).join('\n')}
}`;
t = t.split(ANCLA_BASE).join(NUEVO);

if (t === ORIGINAL) { console.error('El fichero no ha cambiado. NO se escribe.'); process.exit(1); }
// Los dos bloques tienen que seguir cuadrando: se cuentan las llaves.
const abre = (t.match(/{/g) || []).length;
const cierra = (t.match(/}/g) || []).length;
if (abre !== cierra) { console.error(`OJO: llaves descuadradas (${abre} abren, ${cierra} cierran). NO se escribe.`); process.exit(1); }

writeFileSync(RUTA, t, 'utf8');
console.log('ok   el aspecto base de los campos (inputs + selects) pasa de `components` a `base`');
console.log(`     llaves: ${abre} abren / ${cierra} cierran (cuadran)`);
