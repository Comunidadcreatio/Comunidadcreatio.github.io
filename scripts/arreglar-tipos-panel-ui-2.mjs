// Anotaciones de tipos para js/panel-ui.js: SEGUNDA tanda (lo que salio al medir la primera).
//
// Dos grupos:
//  - 6 avisos que estaban OCULTOS: el bucle de `_caventsCache.data` estaba tipado como `never`
//    y tapaba 5 `querySelector` sin comprobar (TypeError latente) y un `parseFloat` con numero.
//  - 1 que introduje yo: TypeScript no admite `?.` en el lado izquierdo de una asignacion.
//
// Uso:  node scripts/arreglar-tipos-panel-ui-2.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const RUTA = 'js/panel-ui.js';
let t = readFileSync(RUTA, 'utf8');

const CAMBIOS = [
    {
        que: 'precio: parseFloat quiere texto',
        buscar: `            const precio = obra.precio ? \`$\${parseFloat(obra.precio).toFixed(2)}\` : '—';`,
        reemplazar: `            const precio = obra.precio ? \`$\${parseFloat(String(obra.precio)).toFixed(2)}\` : '—';`,
        veces: 1
    },
    {
        que: 'los cinco manejadores de cada cavent (querySelector sin comprobar)',
        buscar: `            item.querySelector('.cavent-item-info').addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            item.querySelector('.cavent-item-num').addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            item.querySelector('.btn-edit').addEventListener('click', async (e) => { e.stopPropagation(); await editarCavent(obra.id, obra.titulo); });
            item.querySelector('.btn-dup').addEventListener('click', async (e) => { e.stopPropagation(); await duplicarCavent(obra.id, obra.titulo); });
            item.querySelector('.btn-del').addEventListener('click', async (e) => { e.stopPropagation(); await eliminarCavent(obra.id); });`,
        reemplazar: `            /** @type {HTMLElement} */ (item.querySelector('.cavent-item-info')).addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            /** @type {HTMLElement} */ (item.querySelector('.cavent-item-num')).addEventListener('click', () => editarCavent(obra.id, obra.titulo));
            /** @type {HTMLElement} */ (item.querySelector('.btn-edit')).addEventListener('click', async (e) => { e.stopPropagation(); await editarCavent(obra.id, obra.titulo); });
            /** @type {HTMLElement} */ (item.querySelector('.btn-dup')).addEventListener('click', async (e) => { e.stopPropagation(); await duplicarCavent(obra.id, obra.titulo); });
            /** @type {HTMLElement} */ (item.querySelector('.btn-del')).addEventListener('click', async (e) => { e.stopPropagation(); await eliminarCavent(obra.id); });`,
        veces: 1
    },
    {
        que: 'el viewport del carrusel: nada de ?. en una asignacion',
        buscar: `            document.getElementById("carrusel-viewport")?.style.aspectRatio = aspectRatio;`,
        reemplazar: `            const viewport = document.getElementById("carrusel-viewport");
            if (viewport) viewport.style.aspectRatio = aspectRatio;`,
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
    console.log(`ok   ${c.que} (${encontrados})`);
}

if (fallos.length) {
    console.error('\nNO SE HA ESCRITO NADA. Cambios que no cuadran:');
    for (const f of fallos) console.error('  - ' + f);
    process.exit(1);
}
writeFileSync(RUTA, t, 'utf8');
console.log(`\n${CAMBIOS.length} cambios aplicados en ${RUTA}.`);
