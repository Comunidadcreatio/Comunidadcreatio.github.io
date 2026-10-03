// CONTRASTE DE SUPERFICIES: mide el contraste real de los textos de la interfaz, en los dos temas.
//
// POR QUE EXISTE: hasta ahora solo habia contraste medido en los COMENTARIOS (`verificar-contraste-
// comentarios.mjs`, 48 comprobaciones). El resto de la interfaz (etiquetas del panel, tarjetas,
// pildoras de estado, botones, campos y la pantalla de auth) estaba sin red: nadie sabia si el texto
// se lee. Y es justo la clase de cosa que se rompe sin querer al cambiar un color de la paleta.
//
// COMO MIDE: para cada par (elemento, etiqueta) lee el COLOR del texto y su tamano y peso, y busca
// el PRIMER FONDO NO TRANSPARENTE subiendo por los padres (el fondo efectivo, que casi nunca es el
// del propio elemento). Calcula el contraste con la formula de WCAG y exige:
//   - 4.5:1 para texto normal
//   - 3:1 para texto grande (>=24px, o >=18.66px en negrita), que es lo que pide AA
// Los elementos que no existen en esa vista NO cuentan como fallo: se informan aparte.
//
// Uso: node scripts/verificar-contraste-superficies.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9802;
const args = process.argv.slice(2);
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const perfil = mkdtempSync(join(tmpdir(), 'contraste-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=1280,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null; const logs = [];
const salir = (c) => { try { ws?.close(); } catch {} try { chrome.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(c); };
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PUERTO}/json/version`); break; } catch { await sleep(250); } }
const pagina = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PUERTO}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPCION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 140));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};
const MOCK = `(() => {
    // SIN SERVICE WORKER: la app es una PWA y, en cuanto su SW se activa, las navegaciones entre sus
    // dos paginas dejan de ser de fiar (servia el indice al pedir auth.html y la medicion acababa en
    // la pagina equivocada, sin avisar). Paso el 2026-10-02.
    try {
        if (navigator.serviceWorker) { navigator.serviceWorker.register = () => Promise.reject(new Error('SW desactivado en las pruebas')); }
    } catch (_) {}
    try {
        const enAuth = /(auth|reset-password)\\.html$/.test(location.pathname);
        if (enAuth) { localStorage.removeItem('artistaData'); localStorage.removeItem('creatio_auth_token_persist'); }
        else { localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', role: 'artista', rol: 'artista' })); localStorage.setItem('creatio_auth_token_persist', 'tok'); }
    } catch (_) {}
    const json = async (d) => ({ ok: true, status: 200, json: async () => d });
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const u = String(input);
        const method = ((init && init.method) || 'GET').toUpperCase();
        if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
        if (method !== 'GET') return json({ success: true, id: 9 });
        if (u.includes('heartbeat')) return json({ ok: true });
        if (u.includes('mis-reacciones')) return json({ reacciones: [] });
        if (u.includes('mis-obras')) return json({ success: true, obras: [
            { id: 9001, titulo: 'Cavent de prueba', precio: '100', status: 'Activo' },
            { id: 9002, titulo: 'Otro Cavent', precio: '200', status: 'Inactivo' }] });
        // Directorio del chat CON una usuaria: sin ella la lista de usuarios sale vacia y sus pares no
        // existen (el pueblo se despliega, pero no hay filas que medir).
        if (u.includes('/chat/directorio')) return json({ success: true, pueblos: {
            'San Cristóbal': [{ id: 99, nombre_artista: 'Ana', foto_perfil: '', ultima_actividad: new Date().toISOString() }],
            'San Antonio del Tachira': []
        } });
        if (u.includes('/chat/conversaciones')) return json({ success: true, conversaciones: [] });
        if (u.includes('/chat/bloqueados')) return json({ success: true, bloqueados: [] });
        if (u.includes('/chat/no-leidos')) return json({ success: true, no_leidos: 0 });
        // La OBRA de ejemplo: sin ella la galeria sale vacia y la vista de Explorar no mide nada.
        if (u.includes('/obras')) return json([{ id: 55001, titulo: 'Obra de prueba', precio: '100', artista: 'Ana',
            artista_user_id: 480002, foto_artista: '', estado_obra: 'publicada', vistas: 0, imagen: '', imagenes: [],
            categoria: '', tecnica: '', created_at: new Date().toISOString() }]);
        if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
        return json({ success: true, no_leidas: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
    };
})();`;

// La medida se hace EN LA PAGINA: el navegador es el unico que sabe el fondo efectivo.
const MEDIR = (sel) => `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return null;
    const cs = getComputedStyle(el);
    const aRgb = (t) => {
        const m = t.match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        const p = m[1].split(',').map((x) => parseFloat(x));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    let fondo = null, nodo = el, imagen = false;
    while (nodo && nodo !== document.documentElement.parentNode) {
        const csNodo = getComputedStyle(nodo);
        const c = aRgb(csNodo.backgroundColor);
        if (c && c.a > 0.05) { fondo = c; break; }
        if (csNodo.backgroundImage && csNodo.backgroundImage !== 'none') imagen = true;
        nodo = nodo.parentElement;
    }
    // SI NO HAY FONDO PINTADO, NO SE INVENTA UNO. Esta app no pinta un color de fondo: detras hay un
    // SLIDESHOW de imagenes (body transparente a proposito). Suponer blanco daba un "blanco sobre
    // blanco" que no existe (paso el 2026-10-02 con el chat en modo oscuro). Si hay imagen, el
    // contraste NO es medible por este metodo y se dice.
    const sinFondo = !fondo;
    if (!fondo) fondo = { r: 255, g: 255, b: 255, a: 1 };
    const texto = aRgb(cs.color);
    return JSON.stringify({
        color: cs.color, fondo: 'rgb(' + fondo.r + ', ' + fondo.g + ', ' + fondo.b + ')',
        sinFondo, fondoImagen: sinFondo && imagen,
        tamano: parseFloat(cs.fontSize), peso: parseInt(cs.fontWeight, 10) || 400,
        visible: !!(el.getBoundingClientRect().width && el.getBoundingClientRect().height)
    });
})()`;

const lum = ([r, g, b]) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const aRgb = (t) => { const m = String(t).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2]]; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let pruebas = 0, fallos = 0;
const check = (nombre, ok, detalle) => {
    pruebas++;
    // El detalle se imprime SIEMPRE (tambien cuando pasa): el numero es la prueba, y sin el una linea
    // "PASS" no dice si va sobrada o al filo del minimo.
    if (ok) console.log(`  PASS  ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`);
    else { fallos++; console.log(`  FALLO ${nombre}${detalle !== undefined ? ' → ' + detalle : ''}`); }
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });

// Cada vista: su ruta, como llegar al estado que se quiere medir, y los pares (elemento, etiqueta).
// `preparar` recibe los ayudantes (ev, esperar) para poder esperar a estados DETERMINISTAS: sin eso,
// la mitad de las corridas miden una pantalla a medio montar.
const VISTAS = [
    {
        nombre: 'auth.html',
        ruta: 'auth.html',
        esperar: `!!document.getElementById('login-form')`,
        preparar: async (ev, esperar) => {
            await ev(`document.getElementById('btn-mostrar-login')?.click()`);
            await esperar(`(() => { const f = document.getElementById('login-form'); return !!f && f.getBoundingClientRect().height > 0; })()`);
        },
        pares: [
            ['.auth-section h1', 'titulo de la pantalla de auth'],
            ['.auth-section p', 'parrafo de la pantalla de auth'],
            ['.form-group label', 'etiqueta de campo (auth)'],
            ['#login-email', 'texto del campo de email'],
            ['button[type="submit"]', 'texto del boton principal'],
            ['.secondary-btn', 'texto del boton secundario']
        ]
    },
    {
        nombre: 'index (panel)',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        preparar: async (ev, esperar) => {
            await ev(`document.getElementById('btn-crear-cavent')?.click()`);
            await esperar(`(() => {
                const t = document.getElementById('tab-cavents');
                const p = document.getElementById('crear-problogs-contenido');
                const o = document.getElementById('obra-form');
                return !!t && t.classList.contains('activa') && !!p && p.classList.contains('hidden') && !!o
                    && o.getBoundingClientRect().height > 0;
            })()`);
            await ev(`document.getElementById('cavents-trigger')?.click()`);
            await esperar(`(() => { const it = document.querySelector('.cavent-item'); return !!it && it.getBoundingClientRect().height > 0; })()`);
        },
        pares: [
            ['.form-block .form-group label', 'etiqueta de campo (panel)'],
            ['#input-titulo', 'texto de un campo del panel'],
            ['.cavent-item-titulo', 'titulo de la tarjeta de Cavent'],
            ['.cavent-item-meta span', 'meta de la tarjeta (precio)'],
            ['.status-badge.status-activo', 'pildora de estado activo'],
            ['.status-badge.status-inactivo', 'pildora de estado inactivo'],
            ['.ratio-btn.active', 'texto del boton de ratio'],
            ['.ratio-btn:not(.active)', 'texto del boton de ratio inactivo'],
            ['#obra-etiquetas-bar .input-etiquetas-subtle', 'texto del campo de etiquetas']
        ]
    },
    {
        nombre: 'chat (directorio)',
        ruta: '',
        esperar: `!!document.getElementById('toggle-panel')`,
        preparar: async (ev, esperar) => {
            await ev(`document.getElementById('btn-chat-global')?.click()`);
            await esperar(`(() => { const c = document.getElementById('chat-global'); return !!c && !c.classList.contains('hidden') && c.getBoundingClientRect().height > 0; })()`);
            await ev(`document.querySelector('#chat-accordion .chat-pueblo-header')?.click()`);
            await esperar(`(() => { const c = document.querySelector('.chat-pueblo-cuerpo'); return !!c && c.getBoundingClientRect().height > 0; })()`);
        },
        pares: [
            ['.chat-pueblo-nombre', 'nombre del pueblo (chat)'],
            ['.chat-pueblo-count.act', 'contador de activos (chat)'],
            ['.chat-pueblo-count.tot', 'contador total (chat)'],
            ['.chat-user-nombre', 'nombre de usuario (chat)'],
            ['.chat-user-estado', 'estado de usuario (chat)']
        ]
    }
];

// PENDIENTE: la vista de la GALERIA (Explorar) y la del PERFIL. Las dos se han intentado y quitado
// (2026-10-02) porque no se consigue un estado en el que sus textos se pinten. Lo que dijo el
// diagnostico de ancestros, para el siguiente intento:
//   - GALERIA: con `#galeria-container.modo-grid` visible (1280x739) y la tarjeta con caja (209x262),
//     la FILA DE TEXTOS de la tarjeta (`.obra-artista-row`, con el titulo, el artista y el precio) mide
//     0x0: en rejilla la cabecera se colapsa, y la tarjeta arrastra la clase `modo-flex-enter`. Habria
//     que medir otra cosa (la imagen, o abrir antes el boton de detalles) o esperar a que la tarjeta
//     salga de ese estado.
//   - PERFIL: sus elementos existen pero ocultos.
// La regla de "una vista que no mide nada es un fallo" impide que entren aqui dando un verde vacio.

for (const vista of VISTAS) {
    await send('Page.navigate', { url: URL_BASE + vista.ruta });
    // OJO: esperar a `#login-form` NO basta para la vista de auth, porque index.html tambien tiene un
    // `#login-form` oculto (del modal viejo): la espera se daba por buena antes de que la navegacion
    // terminara y esa mitad de las comprobaciones medía index.html sin avisar. Primero la RUTA.
    const esperada = vista.ruta || 'index.html';
    for (let i = 0; i < 60; i++) {
        const ruta = String(await evalJs(`location.pathname`));
        if (ruta.endsWith(esperada) || ruta.endsWith('/')) break;
        await sleep(300);
    }
    for (let i = 0; i < 60; i++) { if (await evalJs(vista.esperar) === true) break; await sleep(300); }
    await sleep(1500);
    // Ayudantes: `ev` evalua, `esperar` insiste hasta que la condicion se cumple (o se agota).
    const prepararConEspera = async () => {
        const esperar = async (expr, intentos = 25) => {
            for (let i = 0; i < intentos; i++) { if (await evalJs(expr) === true) return true; await sleep(300); }
            return false;
        };
        await vista.preparar(evalJs, esperar);
        await sleep(500);
    };
    if (vista.preparar) await prepararConEspera();
    const medidasDeLaVista = { light: 0, dark: 0 };
    for (const tema of ['light', 'dark']) {
        await evalJs(`(() => { try { localStorage.setItem('theme', '${tema}'); } catch (_) {} document.documentElement.setAttribute('data-theme', '${tema}'); })()`);
        await sleep(400);
        console.log(`\n--- ${vista.nombre} · tema ${tema}`);
        for (const [sel, etiqueta] of vista.pares) {
            const crudo = await evalJs(MEDIR(sel));
            if (!crudo || typeof crudo !== 'string' || crudo[0] !== '{') { console.log(`  --    ${etiqueta}: no esta en esta vista`); continue; }
            const m = JSON.parse(crudo);
            // Un elemento con tamaño CERO no se pinta: su "fondo efectivo" seria el de un padre que
            // tampoco se ve, y el contraste calculado no significa nada. Se informa y NO cuenta.
            if (!m.visible) { console.log(`  --    ${etiqueta}: el elemento esta oculto (no se mide)`); continue; }
            // Fondo con IMAGEN (el slideshow de la app) o sin fondo pintado: el contraste no se puede
            // calcular, y suponer un color seria inventarse un fallo. Se informa y NO cuenta.
            if (m.fondoImagen) { console.log(`  --    ${etiqueta}: el fondo es una imagen (no se puede medir el contraste)`); continue; }
            if (m.sinFondo) { console.log(`  --    ${etiqueta}: no hay fondo pintado detras (no se puede medir)`); continue; }
            const c = aRgb(m.color), f = aRgb(m.fondo);
            const ratio = contraste(c, f);
            const grande = m.tamano >= 24 || (m.peso >= 700 && m.tamano >= 18.66);
            const minimo = grande ? 3 : 4.5;
            medidasDeLaVista[tema]++;
            check(`${etiqueta} [${tema}]`, ratio >= minimo,
                `${ratio.toFixed(2)}:1 (minimo ${minimo}, texto ${m.tamano}px/${m.peso}) ${m.color} sobre ${m.fondo}`);
        }
    }
    // UNA VISTA QUE NO MIDE NADA ES UN FALLO, no un verde vacio. Si el estado no se alcanza (una clase
    // que no existe, un clic que no abre nada), antes esto pasaba desapercibido: la vista entera se
    // quedaba en "--" y el resumen daba por bueno lo que no habia medido. Paso con la vista de perfil,
    // que se quito por eso mismo. Cuando pasa, se imprime TAMBIEN el estado de cada par: asi se ve si el
    // elemento no existe o si esta oculto, sin tener que instrumentar nada a mano.
    const vacia = medidasDeLaVista.light === 0 || medidasDeLaVista.dark === 0;
    if (vacia) {
        for (const [sel, etiqueta] of vista.pares) {
            console.log('   [vacia] ' + etiqueta + ': ' + await evalJs(`(() => {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return 'no existe';
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return 'existe, caja ' + Math.round(r.width) + 'x' + Math.round(r.height) + ', display ' + cs.display
                    + ', visibility ' + cs.visibility + ', color ' + cs.color;
            })()`));
        }
        // Y la CADENA DE ANCESTROS del primer par: si el elemento tiene caja 0x0, el culpable es alguno
        // de sus padres, y esto dice cual (con su tamano y su display) sin instrumentar nada a mano.
        console.log('   [cadena] ' + await evalJs(`(() => {
            const el = document.querySelector(${JSON.stringify(vista.pares[0][0])});
            if (!el) return 'el primer par no existe';
            const out = [];
            let n = el;
            while (n && n.tagName !== 'HTML') {
                const r = n.getBoundingClientRect();
                out.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '')
                    + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ').slice(0, 2).join('.') : '')
                    + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)
                    + (n.classList.contains('hidden') ? ' HIDDEN' : ''));
                n = n.parentElement;
            }
            return out.join('  <-  ');
        })()`));
    }
    check(`la vista "${vista.nombre}" mide algo (no se queda vacia)`,
        !vacia, `medidas: claro ${medidasDeLaVista.light}, oscuro ${medidasDeLaVista.dark}`);
}

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
if (logs.length) fallos++;
console.log(`\nRESULTADO: ${pruebas - fallos}/${pruebas} comprobaciones OK${fallos ? ` — ${fallos} FALLO(S)` : ' — sin fallos'}`);
salir(fallos ? 1 : 0);
