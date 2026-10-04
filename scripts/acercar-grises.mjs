// Para cada gris a mano que queda, dice a que PASO de la escala se acerca (opcion b: la escala se queda
// en 9 pasos) y CUANTO se mueve. El paso se elige en el TEMA de la regla, porque la escala esta
// re-basada por rol: el mismo token vale una cosa en claro y otra en oscuro.
//
// El contexto (claro/oscurio) se saca con un escaner caracter a caracter, porque los selectores se
// reparten en varias lineas y una deteccion por lineas hacia pasar reglas oscuras por claras (y eso,
// con este cambio, seria catastrofico: acercar el negro del lienzo a un gris claro).
import { readFileSync, readdirSync } from 'node:fs';

const style = readFileSync('css/style.css', 'utf8');
const pasos = { light: {}, dark: {} };
let tema = null;
for (const linea of style.split('\n')) {
    if (/^\s*:root\s*\{/.test(linea)) tema = 'light';
    if (/\[data-theme="dark"\]\s*\{/.test(linea)) tema = 'dark';
    const m = linea.match(/^\s*(--color-gray-(\d+)):\s*(#[0-9a-fA-F]{3,8})\s*;/);
    if (m) pasos[tema]['gray-' + m[2]] = m[3].toLowerCase();
}
const aRgb = (h) => { let s = h.replace('#', ''); if (s.length === 3) s = s.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(s.substr(i, 2), 16)); };
const dist = (a, b) => { const [r1, g1, b1] = aRgb(a), [r2, g2, b2] = aRgb(b); return Math.round(Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)); };
const esGris = (h) => { const [r, g, b] = aRgb(h); return Math.max(r, g, b) - Math.min(r, g, b) <= 8; };

for (const hoja of readdirSync('css').filter((f) => f.endsWith('.css'))) {
    const texto = readFileSync('css/' + hoja, 'utf8');
    const lineas = texto.split('\n');

    // Escaner caracter a caracter: el texto acumulado desde el ultimo `{` o `}` es el SELECTOR de la
    // regla abierta. `contexto[i]` = la regla en la que cae la linea i.
    const contexto = new Array(lineas.length).fill('');
    {
        const pila = [];
        let buffer = '', linea = 0;
        for (const ch of texto) {
            if (ch === '\n') { linea++; contexto[linea] = contexto[linea] || (pila[pila.length - 1] || ''); continue; }
            if (ch === '{') {
                // Se quitan los COMENTARIOS antes de recortar: si no, un comentario largo se come los 70
                // caracteres y el selector (con su `[data-theme="dark"]`) queda fuera, que es lo que
                // hacia que reglas oscuras parecieran claras.
                pila.push(buffer.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70));
                buffer = '';
            }
            else if (ch === '}') { pila.pop(); buffer = ''; }
            else { buffer += ch; }
            if (linea < contexto.length) contexto[linea] = pila[pila.length - 1] || '';
        }
    }

    const filas = [];
    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        const props = l.match(/^\s*([a-z-]+):\s*(.*?);/);
        if (!props || /^\s*(\/\*|\*)/.test(l) || l.includes('data:image') || /^\s*--color-/.test(l) || props[1] === 'box-shadow') continue;
        const oscuro = contexto[i].includes('data-theme="dark"');
        const sinVars = props[2].replace(/var\([^)]*\)/g, '');
        for (const h of sinVars.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
            const v = h.toLowerCase();
            if (v === '#fff' || v === '#ffffff' || v === '#000' || v === '#000000') continue;
            if (!esGris(v)) continue;
            const escala = pasos[oscuro ? 'dark' : 'light'];
            let mejor = null;
            for (const [paso, valorPaso] of Object.entries(escala)) {
                const d = dist(v, valorPaso);
                if (!mejor || d < mejor.d) mejor = { paso, valorPaso, d };
            }
            filas.push({ linea: i + 1, prop: props[1], hex: v, oscuro, ...mejor, selector: contexto[i] });
        }
    }
    for (const f of filas.sort((a, b) => a.d - b.d)) {
        console.log(`${hoja.padEnd(20)} ${String(f.linea).padStart(4)} ${f.oscuro ? 'OSCURO' : 'claro '} ${f.prop.padEnd(16)} ${f.hex.padEnd(8)} -> ${f.paso.padEnd(9)} (${f.valorPaso})  delta ${String(f.d).padStart(3)}   ${f.selector.slice(0, 44)}`);
    }
}
