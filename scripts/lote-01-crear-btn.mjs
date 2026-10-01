// LOTE 1 de la campana de `!important`: la regla mas gorda que queda.
//
//   #obra-step-bar .crear-btn, #problog-nav-bar .crear-btn   (13 declaraciones)
//
// Es el boton "Crear" de la barra de pasos y su gemelo de Problogs. Los 13 `!important` estan
// para forzar el aspecto de pildora pequena (32px de alto, 22px de relleno, radio 16px, letra
// de 11px) sobre los estilos genericos de boton. Se quitan TODOS y la foto dira cuales hacian
// falta: los que no, se quedan fuera; a los que si, se les devuelve el `!important` (con
// `lote-01b`), uno por uno y con el nombre del que falla.
//
// Uso:  node scripts/lote-01-crear-btn.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'css/formularios.css';
const ORIGINAL = readFileSync(RUTA, 'utf8');

const ANTES = `#obra-step-bar .crear-btn,
#problog-nav-bar .crear-btn {
    height: 32px !important;
    min-height: 32px !important;
    max-height: 32px !important;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent !important;
    color: var(--color-ink) !important;
    border: 1.5px solid var(--color-gray-300) !important;
    width: auto !important;
    min-width: auto !important;
    border-radius: 16px !important;
    padding: 0 22px !important;
    margin: 0 !important;
    font-size: 11px !important;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Nunito', sans-serif;
    box-sizing: border-box !important;`;

const DESPUES = `#obra-step-bar .crear-btn,
#problog-nav-bar .crear-btn {
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--color-ink);
    border: 1.5px solid var(--color-gray-300);
    width: auto;
    min-width: auto;
    border-radius: 16px;
    padding: 0 22px;
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: 'Nunito', sans-serif;
    box-sizing: border-box;`;

const trozos = ORIGINAL.split(ANTES);
if (trozos.length - 1 !== 1) { console.error(`NO SE HA ESCRITO NADA: el bloque no aparece exactamente 1 vez (${trozos.length - 1}).`); process.exit(1); }
const t = trozos.join(DESPUES);

const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const cuenta = (s) => (sinComentarios(s).match(/!important/g) || []).length;
const quitados = cuenta(ORIGINAL) - cuenta(t);
if (quitados !== 13) { console.error(`OJO: se esperaban 13 !important menos y han salido ${quitados}. NO se escribe.`); process.exit(1); }
writeFileSync(RUTA, t, 'utf8');
console.log(`ok   lote 1: ${quitados} !important menos en el boton de crear de la barra de pasos`);
console.log(`     ${RUTA}: ${cuenta(ORIGINAL)} -> ${cuenta(t)}`);
