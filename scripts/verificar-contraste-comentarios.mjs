// Audita el contraste de la sección de comentarios de Problogs (y de los
// marcadores) en los dos temas, con la fórmula de luminancia relativa de la
// WCAG 2.1.
//
// POR QUÉ EXISTE: los colores de esta zona no pueden ser un valor único. Un
// verde que se lee bien sobre blanco desaparece sobre el fondo oscuro, y al
// revés. Este script comprueba, par a par, que cada texto llega al mínimo de
// 4.5:1 (texto normal) o 3:1 (elementos no textuales, como bordes de control).
//
// Uso: node scripts/verificar-contraste-comentarios.mjs
//
// Mantenimiento: si cambias un color de los comentarios en css/problogs.css,
// actualiza aquí el par correspondiente. Si no, el script seguirá validando el
// color viejo y te dará un falso aprobado.

import { readFileSync, writeFileSync } from 'node:fs';

const CSS = 'css/problogs.css';
const MIN_TEXTO = 4.5;
const MIN_NO_TEXTO = 3;

// Salida: por consola siempre y, si se pasa `--salida <ruta>`, también a un
// archivo. El archivo hace falta en entornos donde no se puede leer el stdout
// del proceso (por ejemplo, un agente ejecutando Node sin consola).
const argSalida = process.argv.indexOf('--salida');
const rutaSalida = argSalida !== -1 ? process.argv[argSalida + 1] : null;
const lineas = [];
function log(texto = '') {
  lineas.push(texto);
  if (!rutaSalida) console.log(texto);
}

function volcar() {
  if (rutaSalida) {
    try { writeFileSync(rutaSalida, lineas.join('\n') + '\n', 'utf8'); } catch (e) { /* sin salida a archivo */ }
  }
}

// --- Fórmula WCAG 2.1 ---
function luminancia(hex) {
  const h = hex.replace('#', '');
  const canales = [0, 1, 2].map((i) => {
    const c = parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Colores de cada tema (los de los tokens de css/style.css) ---
const TEMAS = {
  claro: {
    fondo: '#ffffff',
    ink: '#1a1a1a',            // --color-ink (texto principal)
    inkLight: '#3d3d3d',       // --color-ink-light (texto de cada comentario)
    gray500: '#737373',        // --color-gray-500 (ya no se usa en comentarios)
    gray600: '#525252',        // --color-gray-600 (fechas, acciones, contador)
    placeholder: '#737373',
    control: '#8a8a8a',        // --comentario-control en claro
    rojo: '#b3261e',
    verde: '#15803d',
  },
  oscuro: {
    fondo: '#0a0a0a',
    ink: '#f5f5f5',
    inkLight: '#e5e5e5',       // --color-ink-light en oscuro
    gray500: '#d4d4d4',
    gray600: '#e5e5e5',        // --color-gray-600 en oscuro
    placeholder: '#d4d4d4',
    // rgba(255,255,255,0.36) ya aplanado sobre el fondo oscuro.
    control: '#626262',
    rojo: '#f87171',
    verde: '#4ade80',
  },
};

// [descripción, colorTexto, colorFondo, mínimo]
// Con los cajones SIN fondo, todo se apoya en el fondo de la página: ese es el
// color de referencia en los dos temas.
const PARES = {
  claro: [
    ['título «Comentarios»', 'ink', 'fondo', MIN_TEXTO],
    ['contador del título', 'gray600', 'fondo', MIN_TEXTO],
    ['texto que se escribe', 'ink', 'fondo', MIN_TEXTO],
    ['placeholder del cajón', 'placeholder', 'fondo', MIN_TEXTO],
    // Este era el fallo: el botón iba con texto --color-white sobre relleno
    // --color-ink, y en oscuro los dos acababan en blanco.
    ['botón «Comentar» (texto)', 'ink', 'fondo', MIN_TEXTO],
    ['borde del botón «Comentar»', 'control', 'fondo', MIN_NO_TEXTO],
    ['chip «respondiendo a…»', 'gray600', 'fondo', MIN_TEXTO],
    ['borde del chip «respondiendo»', 'control', 'fondo', MIN_NO_TEXTO],
    ['nombre del autor', 'ink', 'fondo', MIN_TEXTO],
    ['fecha del comentario', 'gray600', 'fondo', MIN_TEXTO],
    ['texto del comentario', 'inkLight', 'fondo', MIN_TEXTO],
    ['acción «Responder»', 'gray600', 'fondo', MIN_TEXTO],
    ['like de comentario activo', 'rojo', 'fondo', MIN_TEXTO],
    ['reblog activo (marcadores)', 'verde', 'fondo', MIN_TEXTO],
    ['like activo (marcadores)', 'rojo', 'fondo', MIN_TEXTO],
    ['borde de la caja de escribir', 'control', 'fondo', MIN_NO_TEXTO],
  ],
  oscuro: [
    ['título «Comentarios»', 'ink', 'fondo', MIN_TEXTO],
    ['contador del título', 'gray600', 'fondo', MIN_TEXTO],
    ['texto que se escribe', 'ink', 'fondo', MIN_TEXTO],
    ['placeholder del cajón', 'placeholder', 'fondo', MIN_TEXTO],
    ['botón «Comentar» (texto)', 'ink', 'fondo', MIN_TEXTO],
    ['borde del botón «Comentar»', 'control', 'fondo', MIN_NO_TEXTO],
    ['chip «respondiendo a…»', 'gray600', 'fondo', MIN_TEXTO],
    ['borde del chip «respondiendo»', 'control', 'fondo', MIN_NO_TEXTO],
    ['nombre del autor', 'ink', 'fondo', MIN_TEXTO],
    ['fecha del comentario', 'gray600', 'fondo', MIN_TEXTO],
    ['texto del comentario', 'inkLight', 'fondo', MIN_TEXTO],
    ['acción «Responder»', 'gray600', 'fondo', MIN_TEXTO],
    ['like de comentario activo', 'rojo', 'fondo', MIN_TEXTO],
    ['reblog activo (marcadores)', 'verde', 'fondo', MIN_TEXTO],
    ['like activo (marcadores)', 'rojo', 'fondo', MIN_TEXTO],
    ['borde de la caja de escribir', 'control', 'fondo', MIN_NO_TEXTO],
  ],
};

// --- Que los colores del tema sigan siendo los que dice el CSS ---
// Evita el falso aprobado si alguien cambia el CSS y no este script.
const ESPERADOS_EN_CSS = [
  ['--comentario-rojo: #b3261e', 'valor claro del rojo'],
  ['--comentario-rojo: #f87171', 'valor oscuro del rojo'],
  ['--comentario-verde: #15803d', 'valor claro del verde'],
  ['--comentario-verde: #4ade80', 'valor oscuro del verde'],
  ['--comentario-control: #8a8a8a', 'borde de control en claro'],
  ['--comentario-control: rgba(255, 255, 255, 0.36)', 'borde de control en oscuro'],
  ['.problog-social-btn.liked', 'regla del like'],
  ['[data-theme="dark"] .problog-comentario-input:focus', 'foco en oscuro'],
];

// Reglas que NO pueden volver: el botón de enviar tiene que ir sin relleno (con
// el relleno invertido de los tokens, en oscuro quedaba letra blanca sobre
// fondo blanco). Se comprueba sobre el texto de la regla, no sobre el archivo
// entero, para que no salte por un `color: var(--color-white)` de otra zona.
const PROHIBIDOS_EN_CSS = [
  [/\.problog-comentario-enviar\s*\{[^}]*background:\s*var\(--color-ink\)/,
    'el botón «Comentar» no debe llevar relleno --color-ink'],
  [/\.problog-comentario-enviar\s*\{[^}]*color:\s*var\(--color-white\)/,
    'el botón «Comentar» no debe pintar su texto con --color-white'],
  [/\.problog-comentario-input\s*\{[^}]*background:\s*var\(--color-white\)/,
    'la caja de escribir debe ir sin fondo'],
  [/\.problog-comentario-form\s*\{[^}]*background:\s*var\(--comentario-tinte\)/,
    'el cajón debe ir sin fondo'],
];

let fallos = 0;
let pruebas = 0;
function check(nombre, ok, detalle) {
  pruebas++;
  if (ok) log(`  PASS  ${nombre}`);
  else { fallos++; log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
}

log('=== Los colores del CSS son los que audita este script ===');
let css;
try {
  css = readFileSync(CSS, 'utf8');
} catch (e) {
  log(`  FALLO no se pudo leer ${CSS}: ${e.message}`);
  volcar();
  process.exitCode = 1;
  process.exit();
}
for (const [aguja, que] of ESPERADOS_EN_CSS) {
  check(`${que} («${aguja}»)`, css.includes(aguja));
}
for (const [patron, que] of PROHIBIDOS_EN_CSS) {
  check(`no vuelve: ${que}`, !patron.test(css));
}

for (const [tema, pares] of Object.entries(PARES)) {
  log(`\n=== Contraste en tema ${tema.toUpperCase()} ===`);
  const c = TEMAS[tema];
  for (const [nombre, claveTexto, claveFondo, minimo] of pares) {
    const ratio = contraste(c[claveTexto], c[claveFondo]);
    const redondo = Math.round(ratio * 100) / 100;
    check(`${nombre}: ${redondo}:1 (mín ${minimo})`, ratio >= minimo,
      `${c[claveTexto]} sobre ${c[claveFondo]}`);
  }
}

log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
volcar();
process.exitCode = fallos ? 1 : 0;
