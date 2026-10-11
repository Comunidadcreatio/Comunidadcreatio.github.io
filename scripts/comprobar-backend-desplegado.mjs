// Verificacion READ-ONLY contra la API REAL desplegada, despues del despliegue del backend.
//
// 1) Que la lista de comentarios traiga ya los campos nuevos (usuario_id, editado, eliminado, liked).
// 2) Que las rutas nuevas EXISTAN, sin tocar nada: se llama SIN token y con un id de comentario que NO
//    EXISTE (999999999). Asi, si el middleware de sesion falta por lo que sea, el controlador no encuentra
//    el comentario y responde 404: nada real se modifica en ningun caso.
const base = 'https://backend-fundacion-atpe.onrender.com';
const idFantasma = 999999999;
let problemas = 0;

const obras = await (await fetch(base + '/obras')).json();
const conComentarios = obras.filter((o) => (o.comments_count || 0) > 0);
const obra = conComentarios[0] || obras[0];

console.log('=== 1) Campos nuevos en los comentarios de obra ===');
const r1 = await fetch(base + '/obras/' + obra.id + '/comentarios');
const d1 = await r1.json();
const lista = d1.comentarios || [];
console.log('  obra ' + obra.id + ' -> ' + r1.status + ' · ' + lista.length + ' comentario(s)');
if (lista.length) {
    const claves = Object.keys(lista[0]).sort();
    console.log('  CLAVES: ' + claves.join(', '));
    for (const campo of ['usuario_id', 'editado', 'eliminado']) {
        const tiene = claves.indexOf(campo) > -1;
        console.log('  ' + (tiene ? 'OK   ' : 'FALTA') + ' ' + campo);
        if (!tiene) problemas++;
    }
    console.log('  (liked: ' + (claves.indexOf('liked') > -1 ? 'presente sin sesion' : 'no viene sin sesion, es correcto') + ')');
    console.log('  ejemplo: ' + JSON.stringify({ id: lista[0].id, usuario_id: lista[0].usuario_id, editado: lista[0].editado, eliminado: lista[0].eliminado }));
} else {
    console.log('  (esa obra no tiene comentarios: no se pueden mirar las claves)');
}

console.log('\n=== 2) Rutas nuevas (sin token y con id inexistente: nada se toca) ===');
const pruebas = [
    { m: 'PUT', u: '/obras/' + obra.id + '/comentarios/' + idFantasma, cuerpo: { texto: 'prueba' } },
    { m: 'DELETE', u: '/obras/' + obra.id + '/comentarios/' + idFantasma },
    { m: 'PUT', u: '/problogs/60001/comentarios/' + idFantasma, cuerpo: { texto: 'prueba' } },
    { m: 'DELETE', u: '/problogs/60001/comentarios/' + idFantasma }
];
for (const p of pruebas) {
    try {
        const res = await fetch(base + p.u, {
            method: p.m,
            headers: { 'Content-Type': 'application/json' },
            body: p.cuerpo ? JSON.stringify(p.cuerpo) : undefined
        });
        const texto = (await res.text()).replace(/\s+/g, ' ').slice(0, 120);
        // 401 = la ruta EXISTE y el middleware de sesion la protege (lo esperado).
        // 404 = la ruta no existe (o el comentario no se encontro, con el id fantasma).
        const veredicto = res.status === 401 ? 'OK (ruta protegida)' : (res.status === 404 ? 'REVISAR (podria no existir la ruta)' : 'INESPERADO');
        console.log('  ' + p.m.padEnd(7) + p.u + '  ->  ' + res.status + '  ' + veredicto);
        console.log('      ' + texto);
        if (res.status !== 401 && res.status !== 404) problemas++;
    } catch (e) {
        console.log('  ' + p.m + ' ' + p.u + '  -> ERROR ' + e.message);
        problemas++;
    }
}

console.log('\n' + (problemas === 0 ? 'TODO CORRECTO' : 'HAY ' + problemas + ' COSA(S) QUE REVISAR'));
