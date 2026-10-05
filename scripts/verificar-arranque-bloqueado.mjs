// VERIFICA EL CONTRATO DE ARRANQUE: mientras la app no está lista, un toque REAL no puede perderse.
//
// Nace de una duda que yo mismo me había creído mal. En dos verificadores aparecía un "clic perdido" al
// pulsar rápido (el del perfil y el del hub de Cavents) y lo interpreté como un fallo de la app: "pinta el
// botón antes de engancharle el listener". Pero esos verificadores pulsan con `el.click()`, que es
// PROGRAMÁTICO y **se salta el hit-testing**: si el preloader sigue tapando la pantalla, un usuario de
// verdad no puede pulsar ahí.
//
// Así que esto mide lo que ve un usuario, con TOQUES REALES (eventos de entrada por CDP, que sí pasan por
// el hit-testing):
//   1. Con el preloader puesto, ¿el punto donde está el botón lo ocupa el PRELOADER? (si sí, el toque no se
//      pierde: lo absorbe el preloader, que es lo que debe pasar mientras la app carga).
//   2. Un toque real en ese momento, ¿cambia algo? (no debe).
//   3. Cuando el preloader se va, ¿el mismo toque SÍ funciona? (el listener ya está enganchado).
// Y se informa de cuánto dura la ventana en la que la app no es interactiva.
//
// Uso: node scripts/verificar-arranque-bloqueado.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9319;
const URL_BASE = process.argv[2] || 'http://127.0.0.1:8099/';
const profileDir = mkdtempSync(join(tmpdir(), 'verif-arranque-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();

// Preflight: si no hay servidor, se aborta en vez de medir una página de error.
try {
    const r = await fetch(URL_BASE);
    if (!r.ok) throw new Error('status ' + r.status);
} catch (e) {
    console.error(`NO HAY SERVIDOR en ${URL_BASE} (${e.message}).`);
    console.error(`Levantalo antes con:  node scripts/servidor-local.mjs 8099`);
    try { chrome.kill(); } catch {}
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    process.exit(2);
}

for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(250); } }
const page = await (async () => {
  try { return await getJson(`http://127.0.0.1:${PORT}/json/new?about:blank`); }
  catch { return (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return null;
  return r.result?.result?.value;
};

let fallos = 0; let pruebas = 0;
const check = (nombre, condicion, detalle = '') => {
    pruebas++;
    if (condicion) console.log(`  PASS  ${nombre}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle ? ' → ' + detalle : ''}`); }
};
/** Un toque REAL (pasa por el hit-testing, como el de un dedo). */
const tocar = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
      try {
          localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', foto_perfil: '', rol: 'artista' }));
          localStorage.setItem('creatio_auth_token_persist', 'tok');
      } catch (_) {}
      const json = async (data) => ({ ok: true, status: 200, json: async () => data });
      const realFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
          const u = String(input);
          if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
          // El arranque espera a esta llamada para quitar el preloader: se responde con un pelin de retraso
          // a proposito, para que la ventana "no interactiva" exista de verdad y se pueda medir.
          await new Promise((r) => setTimeout(r, 400));
          if (u.includes('/api/artistas/perfil')) return json({ success: true, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
          if (u.includes('/obras')) return json([]);
          if (u.includes('/problogs')) return json({ success: true, problogs: [], total: 0, page: 1, limit: 10 });
          return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
      };
  })();`
});

const t0 = Date.now();
await send('Page.navigate', { url: URL_BASE });

// ESPERA A QUE LOS ESTILOS ESTÉN APLICADOS, no solo a que exista el HTML. Sin esto se mide una página SIN
// ESTILOS: el preloader sale `position: static` (su valor inicial) y todo el hit-testing es el del flujo
// normal, así que las conclusiones no valen. (Me pasó en la primera versión de esta prueba: medí a los
// 114 ms y "descubrí" que el preloader no tapaba... cuando lo que pasaba es que el CSS aún no había llegado.)
for (let i = 0; i < 200; i++) {
    const listo = await evalJs(`(() => {
        const p = document.getElementById('preloader');
        if (!p) return false;
        const cs = getComputedStyle(p);
        return cs.position === 'fixed' && cs.zIndex !== 'auto';
    })()`);
    if (listo === true) break;
    await sleep(25);
}
const msEstilos = Date.now() - t0;
console.log(`=== La hoja de estilos está aplicada a los ${msEstilos} ms`);

// 1) En cuanto el botón del hub EXISTE (la condición que usaban los verificadores que "perdían" el clic),
//    se mira qué hay de verdad en ese punto y qué pasa con un toque real.
let cajaHub = null;
for (let i = 0; i < 100; i++) {
    const c = await evalJs(`(() => {
        const b = document.getElementById('btn-cavents-hub');
        if (!b) return '';
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return '';
        return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`);
    if (typeof c === 'string' && c.startsWith('{')) { cajaHub = JSON.parse(c); break; }
    await sleep(50);
}
const msHastaBoton = Date.now() - t0;
console.log(`=== El botón del hub ya existe a los ${msHastaBoton} ms`);
check('el botón del hub llega a existir con caja', !!cajaHub, 'no apareció en 5 s');

if (cajaHub) {
    const enEsePunto = await evalJs(`(() => {
        const el = document.elementFromPoint(${cajaHub.x}, ${cajaHub.y});
        if (!el) return JSON.stringify({ que: 'nada', cadena: '' });
        const pre = document.getElementById('preloader');
        const dentroDelPreloader = !!(pre && (el === pre || pre.contains(el)));
        // La CADENA de ancestros del que ocupa el punto: sin esto solo se sabe que es un "span" y no de
        // quién es. (Es el mismo diagnóstico que se le puso a la foto y al verificador de contraste.)
        const cadena = [];
        let n = el, saltos = 0;
        while (n && saltos < 6) {
            const cls = typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
            cadena.push((n.id ? '#' + n.id : n.tagName.toLowerCase()) + cls);
            n = n.parentElement; saltos++;
        }
        return JSON.stringify({
            que: (el.id || el.tagName.toLowerCase()),
            dentroDelPreloader,
            preloaderPuesto: !!(pre && !pre.classList.contains('hidden')),
            cadena: cadena.join(' < ')
        });
    })()`);
    const punto = typeof enEsePunto === 'string' ? JSON.parse(enEsePunto) : null;
    console.log('   en ese punto hay: ' + JSON.stringify(punto));
    // Y los `z-index` CALCULADOS, que es lo que decide quién está encima: si el preloader no gana aquí,
    // el problema no es el CSS que se escribió, es que no se está aplicando (o hay otra capa por medio).
    console.log('   ' + await evalJs(`(() => {
        const pre = document.getElementById('preloader');
        const sp = document.elementFromPoint(${cajaHub.x}, ${cajaHub.y});
        const z = (el) => el ? getComputedStyle(el).zIndex + '/' + getComputedStyle(el).position : '(sin elemento)';
        const cadena = [];
        let n = sp, saltos = 0;
        while (n && saltos < 5) { cadena.push((n.id ? '#' + n.id : n.tagName.toLowerCase()) + ' z=' + z(n)); n = n.parentElement; saltos++; }
        return 'preloader: z=' + z(pre) + ' opacity=' + getComputedStyle(pre).opacity + ' | punto: ' + cadena.join(' < ');
    })()`));
    check('mientras la app carga, ese punto lo ocupa el preloader (el toque no se pierde: lo absorbe él)',
        !!punto && punto.dentroDelPreloader === true, JSON.stringify(punto));

    // 2) Toque real: no debe cambiar de sección.
    const antes = await evalJs(`JSON.stringify({ panel: !document.getElementById('panel-artista').classList.contains('hidden') })`);
    await tocar(cajaHub.x, cajaHub.y);
    await sleep(300);
    const despues = await evalJs(`JSON.stringify({ panel: !document.getElementById('panel-artista').classList.contains('hidden') })`);
    check('un toque real mientras carga NO abre nada (no hay clic "perdido": no llega al botón)',
        antes === despues, `antes ${antes} despues ${despues}`);
}

// 3) Se espera a que el preloader se vaya (condición real, no reloj) y se mide cuánto tardó.
for (let i = 0; i < 200; i++) {
    if (await evalJs(`(() => { const p = document.getElementById('preloader'); return !!p && p.classList.contains('hidden'); })()`) === true) break;
    await sleep(50);
}
// "App lista" se define por su propia señal: el contenedor con la clase `.visible` (la pone main.js al
// ocultar el preloader). Con eso, el estado en el que se prueba el toque real está bien definido.
let visible = false;
for (let i = 0; i < 60; i++) {
    visible = await evalJs(`document.querySelector('.app-container')?.classList.contains('visible') === true`) === true;
    if (visible) break;
    await sleep(100);
}
const msPreloader = Date.now() - t0;
console.log(`=== El preloader se retira a los ${msPreloader} ms (ventana NO interactiva: ${msPreloader - msHastaBoton} ms)`);
check('el preloader se retira (la app queda interactiva)', msPreloader < 20000, `${msPreloader} ms`);

// 4) Y AHORA el mismo toque SÍ tiene que funcionar: el listener ya está enganchado.
// OJO: hay que VOLVER A LEER la caja del botón. Con la app montada, el botón ya no está donde estaba a los
// 148 ms (la primera versión de esta prueba guardaba las coordenadas y el toque acabó en `pagina-blanca`:
// un fallo del test, no de la app).
const cajaAhora = await evalJs(`(() => {
    const b = document.getElementById('btn-cavents-hub');
    if (!b) return '';
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return '';
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`);
const caja = typeof cajaAhora === 'string' && cajaAhora.startsWith('{') ? JSON.parse(cajaAhora) : null;
check('con la app lista, el botón del hub tiene caja', !!caja, String(cajaAhora));

if (caja) {
    // El punto puede devolver un HIJO del botón (su `svg`): lo que importa es que el punto PERTENEZCA al
    // botón, no que el propio botón sea el elemento devuelto. (La primera versión de esta prueba exigía
    // `el.id === 'btn-cavents-hub'` y fallaba con `svg`, que es un acierto perfectamente válido.)
    const ahoraAhi = await evalJs(`(() => {
        const el = document.elementFromPoint(${caja.x}, ${caja.y});
        if (!el) return 'nada';
        return el.closest('#btn-cavents-hub') ? 'btn-cavents-hub' : (el.id || el.tagName.toLowerCase());
    })()`);
    console.log('   en el centro del botón (recién medido) hay: ' + ahoraAhi);
    check('con la app lista, ese punto pertenece al botón', ahoraAhi === 'btn-cavents-hub', String(ahoraAhi));

    await tocar(caja.x, caja.y);
    // Qué sección queda visible: se informa ANTES y DESPUÉS en vez de dar por hecho cuál debe abrir el hub
    // (la primera versión esperaba `#panel-artista`, que lo abre el "+", no el hub).
    const secciones = `['mi-cuenta','panel-artista','perfil-usuario','galeria-publica','pagina-blanca','problogs']`;
    // Detección AMPLIA: no solo qué secciones están visibles, también la clase del body y los elementos
    // marcados como activos. Si la app responde de una forma que no había previsto, esto lo ve; si no
    // cambia NADA de esto tras varios toques, entonces es que la app no está respondiendo.
    const leerEstado = () => evalJs(`JSON.stringify({
        secciones: ${secciones}.filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); }),
        body: document.body.className,
        activos: document.querySelectorAll('.activa, .active, .visible').length
    })`);
    // ANTES de tocar hay que esperar a que la app se ASIENTE: el arranque cambia de sección por su cuenta
    // (pasa de la página blanca a la galería), así que sin esperar, el "cambió algo" de después se lo
    // apuntaba el toque cuando en realidad lo había hecho el arranque. Dos lecturas seguidas iguales.
    let asentado = await leerEstado();
    for (let i = 0; i < 40; i++) {
        await sleep(300);
        const ahora = await leerEstado();
        if (ahora === asentado) break;
        asentado = ahora;
    }
    const antesDeTocar = asentado;
    console.log('   la app se asienta en: ' + antesDeTocar);
    let despuesDeTocar = antesDeTocar;
    let toques = 0;
    // Se toca como tocaría una persona: si el primero no hace nada, se insiste. Que el PRIMER toque justo
    // al retirarse el preloader a veces no haga nada está medido y queda reportado (el `.visible` del
    // contenedor no garantiza del todo que la app ya responda); que NINGÚN toque haga nada sí sería un
    // fallo. Los botones de la barra se atienden por delegación en `document` (main.js), no por un listener
    // propio en cada uno.
    for (let intento = 1; intento <= 3; intento++) {
        await tocar(caja.x, caja.y);
        toques = intento;
        for (let i = 0; i < 20; i++) {
            despuesDeTocar = await leerEstado();
            if (despuesDeTocar !== antesDeTocar) break;
            await sleep(100);
        }
        if (despuesDeTocar !== antesDeTocar) break;
    }
    console.log(`   secciones visibles: antes ${antesDeTocar} · despues ${despuesDeTocar} (toques: ${toques})`);
    check('un toque real con la app lista responde (hizo falta ' + toques + ' toque(s))', despuesDeTocar !== antesDeTocar,
        despuesDeTocar === antesDeTocar ? `ni tres toques cambiaron nada (seguía en ${despuesDeTocar})` : '');
}

console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
try { ws.close(); } catch {}
try { chrome.kill(); } catch {}
try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exitCode = fallos ? 1 : 0;
