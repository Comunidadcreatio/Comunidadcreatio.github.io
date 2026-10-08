// FOTO DE ESTILOS CALCULADOS: red de seguridad para refactorizar el CSS sin miedo.
//
// Captura el estilo CALCULADO de una lista de elementos en DOS paginas (index y auth),
// en los DOS temas y en DOS anchos, y lo guarda en un JSON. Con `--comparar` se compara
// una foto nueva contra la de antes y se listan las diferencias: si no hay ninguna, el
// cambio de CSS no movio nada.
//
// Cosas que se hacen a proposito para que la medida sea FIABLE (cada una salio de un
// falso positivo real):
//   - El tema se fija Y SE COMPRUEBA. theme.js lo elige por la HORA del dia y lo guarda
//     en localStorage['theme']; si solo se cambiara el atributo, su inicializacion podia
//     revertirlo a mitad de la captura y se mediria el tema equivocado.
//   - Se APAGAN las transiciones (la app tiene `transition` de 300 ms): si no, los
//     valores cambian entre las dos lecturas y se descartan propiedades.
//   - Se espera a document.fonts.ready: si la fuente web (Nunito) carga despues de
//     medir, cambian los altos.
//   - Cada valor se lee DOS veces y se descartan los que bailan.
//   - Se guarda el tema REAL de cada medida, para que una captura con el tema
//     equivocado se note en vez de parecer un cambio.
//
// Uso:
//   node scripts/foto-estilos.mjs http://127.0.0.1:8099/ --salida scripts/foto-antes.json
//   node scripts/foto-estilos.mjs http://127.0.0.1:8099/ --salida scripts/foto-despues.json
//   node scripts/foto-estilos.mjs --comparar scripts/foto-antes.json scripts/foto-despues.json
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9722;
const args = process.argv.slice(2);

const PROPIEDADES = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex', 'width', 'height',
    'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundSize',
    'color', 'opacity', 'visibility', 'overflow', 'overflowX', 'overflowY', 'textOverflow',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor',
    'borderLeftWidth', 'borderLeftStyle',
    'borderRightWidth', 'borderRightStyle', 'borderRightColor',
    'borderBottomWidth', 'borderBottomStyle', 'borderBottomColor',
    'borderRadius', 'boxShadow', 'backdropFilter',
    'transform', 'boxSizing', 'appearance', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'lineHeight', 'letterSpacing', 'textAlign', 'textTransform', 'textDecorationLine', 'whiteSpace',
    'cursor', 'outlineWidth', 'outlineStyle', 'outlineColor', 'outlineOffset', 'pointerEvents',
    'flexDirection', 'flexWrap', 'alignItems', 'alignSelf', 'justifyContent', 'gap', 'rowGap',
    'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'aspectRatio', 'objectFit',
    'order', 'scrollbarWidth', 'msOverflowStyle'
];

// Elementos que se vigilan en cada pagina. Son SELECTORES: `querySelector` sirve igual
// para ids, clases y etiquetas, y asi una sola lista vale para todo.
const PAGINAS = [
    {
        nombre: 'index',
    // Guardian de estado: la vista `index` es la del banco de pruebas (`#fx-*`), asi que estos dos
    // existen si y solo si el banco se monto.
    exigidos: ['#fx-input', '#fx-button'],
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        // Muestra de etiquetas SIN clases, fuera de pantalla pero renderizada: aisla las
        // reglas de BASE (las que dependen solo de la etiqueta) del resto de la app.
        fixture: true,
        selectores: [
            '#fx-input', '#fx-email', '#fx-pass', '#fx-textarea', '#fx-select', '#fx-button',
            '#fx-submit', '#fx-p', '#fx-h2', '#fx-label', '#fx-a', '#fx-span', '#fx-div',
            '#fx-main', '#fx-picture', '#fx-img', '#fx-form', '#fx-fieldset', '#fx-legend',
            '#fx-invalid', '#fx-invalid-select',
            'html', 'body', '#main-header', '#toggle-panel',
            '#btn-notificaciones', '#desktop-logout-all', '#desktop-logout-single',
            '#mobile-logout-all', '#mobile-logout-single'
            // QUITADO (2026-10-05): `#problog-responder-barra` es la barra de respuesta de Problogs y se
            // PINTA en la vista `problogs`, que es donde tiene sentido (el cruce lo confirmo). Aqui medía
            // 0x0 y solo duplicaba.
        ]
    },
    {
        nombre: 'auth',
    // Guardian de estado: los que TIENEN que pintarse son los del REGISTRO, porque esta vista entra en el
    // registro (el `abrir` rellena el login y luego pulsa «ir al registro»). Los del formulario de login se
    // miden igual (existen y tienen estilos calculados), pero están OCULTOS: exigirlos aquí abortaba la foto
    // con razón, porque «existe» no es lo mismo que «se pinta».
    exigidos: ['.auth-container', '#reg-nombres'],
        ruta: 'auth.html',
        esperar: `(() => { const f = document.getElementById('login-form'); const p = document.getElementById('preloader'); const a = document.querySelector('.auth-container'); return !!f && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        abrir: async (ev, dormir) => {
            // Se montan los ESTADOS de los campos: sin esto la foto solo mide el REPOSO, y las reglas
            // de :valid / :invalid / .input-error / .input-available / :focus de auth.css (varias con
            // `!important`) se quedaban sin red. Los campos llevan `required data-required="true"`,
            // asi que vacios son :invalid y rellenos :valid.
            //
            // En DOS FASES a proposito: al poner un valor se disparan los eventos y la validacion de
            // la app RECALCULA y borra las clases que hubiera; si se anaden `.input-error` /
            // `.input-available` en la misma tacada, la app se las lleva por delante y esos selectores
            // acaban sin medir nada (paso en el primer intento: no aparecian en la foto).
            await ev(`(() => {
                const poner = (sel, valor) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return el;
                };
                // 1) El formulario de login se abre como lo abre el usuario.
                document.getElementById('btn-mostrar-login')?.click();
                // 2) Los valores: login relleno y registro relleno (asi pasan a :valid).
                poner('#login-email', 'persona@ejemplo.com');
                poner('#login-pass', 'ClaveDePrueba123');
                poner('#reg-nombres', 'Nombre de prueba');
                poner('#reg-email', 'persona@ejemplo.com');
                poner('#reg-pass', 'ClaveDePrueba123');
                document.getElementById('btn-ir-registro')?.click();
                return 'ok';
            })()`);
            await dormir(900);
            // 3) Ahora que la app ya ha validado, se ponen las CLASES de estado y el foco.
            await ev(`(() => {
                document.querySelector('#login-email')?.classList.add('input-available');
                document.querySelector('#login-pass')?.classList.add('input-error');
                const rol = document.getElementById('reg-rol');
                if (rol) { rol.focus(); }
                return JSON.stringify({
                    error: !!document.querySelector('.input-error'),
                    disponible: !!document.querySelector('.input-available'),
                    foco: document.activeElement ? document.activeElement.id : null
                });
            })()`);
            // Y se espera a que la GEOMETRIA se ASIENTE (dos lecturas seguidas iguales). La altura de
            // `#main-content` bailaba entre capturas y el comparador lo reportaba como "2 valores
            // inestables": era lo último que quedaba de inestabilidad en la foto, y no lo arregla el
            // guardián de estado (que comprueba que los elementos ESTÉN, no que la caja esté quieta).
            let cajaAnterior = '';
            for (let i = 0; i < 20; i++) {
                const caja = await ev(`(() => {
                    const m = document.getElementById('main-content');
                    if (!m) return '';
                    const r = m.getBoundingClientRect();
                    return Math.round(r.width) + 'x' + Math.round(r.height);
                })()`);
                if (typeof caja === 'string' && caja && caja === cajaAnterior) break;
                cajaAnterior = typeof caja === 'string' ? caja : '';
                await dormir(150);
            }
        },
        // El `:focus` de un campo obligatorio del registro, forzado por CDP.
        forzarPseudo: { '#reg-rol': ['focus'] },
        selectores: [
            'html', 'body', '#main-content', '#login-section', '#login-landing',
            '#login-form', '#login-email', '#login-pass', '.auth-container',
            'button[type="submit"]', '#auth-dark-mode-btn',
            // Los estados de estos campos los gobiernan las reglas de :invalid / :valid de
            // auth.css, y su competidora es el estilo base de los campos (formularios.css).
            // Sin ellos en la lista, ese trozo de cascada se quedaba sin red.
            '#forgot-section', '#forgot-email', '#reg-rol',
            // Campos del REGISTRO: el tema oscuro de los campos (auth.css) los pinta con
            // selectores con id, y sin medirlos un cambio de esa regla se hacia a ciegas.
            '#reg-nombres', '#reg-email', '#reg-pass', '#reg-pais',
            // Estados montados arriba y la familia de tema oscuro de auth.css (contenedor, seccion,
            // titulos, etiquetas), mas los botones secundarios y la navegacion por pasos.
            '.input-error', '.input-available', '.auth-section',
            '.auth-section p', '.secondary-btn', '.nav-btn',
            '.password-wrapper', '.password-wrapper input', '.step-navigation .nav-btn'
        ]
    },
    {
        // AUTH (LOGIN): la vista hermana de `auth`. Esa entra en el REGISTRO y por eso deja el formulario de
        // login OCULTO (18 selectores con caja 0x0: `#login-form`, `#login-email`, `.password-wrapper`...).
        // Sus estilos se median igual (calculados), pero no se veian. Esta vista se queda EN EL LOGIN para
        // que se pinten. Nace del cruce de las 32 lecturas (`scripts/analizar-no-medido.mjs`), que fue el que
        // dijo exactamente CUALES no se pintaban.
        nombre: 'auth (login)',
        // Los que tienen que pintarse son los del LOGIN (es lo que hace esta vista).
        exigidos: ['#login-form', '.auth-container'],
        ruta: 'auth.html',
        esperar: `(() => { const f = document.getElementById('login-form'); const p = document.getElementById('preloader'); const a = document.querySelector('.auth-container'); return !!f && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        abrir: async (ev, dormir) => {
            // Se abre el login y se montan los ESTADOS de los campos (las reglas de :valid / :invalid /
            // .input-error / .input-available de auth.css, varias con `!important`). En DOS FASES: la
            // validacion de la app reacciona a los eventos y borra las clases que hubiera.
            await ev(`(() => {
                const poner = (sel, valor) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const proto = HTMLInputElement.prototype;
                    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return el;
                };
                document.getElementById('btn-mostrar-login')?.click();
                poner('#login-email', 'persona@ejemplo.com');
                poner('#login-pass', 'ClaveDePrueba123');
                return 'ok';
            })()`);
            await dormir(900);
            await ev(`(() => {
                document.querySelector('#login-email')?.classList.add('input-available');
                document.querySelector('#login-pass')?.classList.add('input-error');
                return 'ok';
            })()`);
            // Y la geometria asentada, como en su vista hermana. Aqui se pide MAS: TRES lecturas iguales
            // seguidas y mas margen. Con dos lecturas y 3 s, la altura de `#main-content` en oscuro/1280
            // seguia capturandose a mitad (el comparador informe de "2 valores inestables").
            let anterior = '', iguales = 0;
            for (let i = 0; i < 40; i++) {
                const caja = await ev(`(() => {
                    const m = document.getElementById('main-content');
                    if (!m) return '';
                    const r = m.getBoundingClientRect();
                    return Math.round(r.width) + 'x' + Math.round(r.height);
                })()`);
                if (typeof caja === 'string' && caja && caja === anterior) { iguales++; if (iguales >= 3) break; }
                else iguales = 1;
                anterior = typeof caja === 'string' ? caja : '';
                await dormir(150);
            }
        },
        selectores: [
            // OJO: aquí NO se mide `#main-content`. Su ALTURA no se asienta en este estado (en oscuro/1280
            // cambia sin parar) y el comparador lo reportaba como "2 valores inestables", dejando el par de
            // fotos en rojo por algo que NO es una regresión. Ese contenedor se mide en las otras ocho
            // vistas, así que no se pierde nada.
            'html', 'body', '#login-section', '#login-landing',
            '#login-form', '#login-email', '#login-pass', '.auth-container',
            'button[type="submit"]', '#auth-dark-mode-btn',
            '.input-error', '.input-available', '.auth-section', '.auth-section p',
            '#forgot-section', '#forgot-email', '.password-wrapper', '.password-wrapper input', '.secondary-btn',
            '.nav-btn'
        ]
    },
    {
        // pagina. Sin esto, cualquier cambio en problogs.css se quedaria sin cubrir.
        nombre: 'problogs',
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        // Si falta alguno de estos, la vista no llego a su estado y la foto ABORTA (ver el comentario
        // del bloque `exigidos` en la captura). Esta vista era una de las tres inestables.
        exigidos: ['#problogs-detalle', '.problog-comentario', '#problog-responder-barra'],
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-problogs-nav')?.click()`);
            await dormir(1800);
            for (let intento = 0; intento < 6; intento++) {
                await ev(`document.querySelector('#problogs .problog-card')?.click()`);
                await dormir(1500);
                const abierta = await ev(`!!document.getElementById('problogs-detalle') && !document.getElementById('problogs-detalle').classList.contains('hidden')`);
                if (abierta === true) break;
                await ev(`document.getElementById('btn-problogs-nav')?.click()`);
                await dormir(1200);
            }
            await dormir(1000);
            // Y se pulsa «Responder» para que la barra de responder este de verdad en
            // pantalla (no oculta) y su sitio se pueda medir.
            const centro = await ev(`(() => {
                const b = document.querySelector('#problogs-detalle [data-comentario-responder]');
                if (!b) return null;
                b.scrollIntoView({ block: 'center', behavior: 'instant' });
                const r = b.getBoundingClientRect();
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (centro && typeof centro === 'string') {
                const c = JSON.parse(centro);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(1000);
        },
        selectores: [
            '#problogs', '#problogs .problogs-feed', '#problogs .problog-card',
            '#problogs-detalle',
 '[data-problog-comentarios]',
            '.problog-comentario', '.problog-comentario-avatar', '.problog-comentario-texto',
            '.problog-comentario-input', '.problog-comentario-enviar',
            '.problog-social-btn',
            '#problog-responder-barra', '#problog-responder-texto', '.problog-responder-icono'
        ]
    },
    {
        // El PANEL del artista: el formulario de la OBRA (Cavents) tal cual se ve. Faltaba
        // por completo, y es justo donde vive el estilo BASE de los campos
        // (`#panel-artista input` en formularios.css, que style.css importa) que compite con
        // las reglas de estado de auth.css. Sin esta vista, mover ese estilo de capa se hacia
        // a ciegas. Se abre el panel y se deja la pestaña de Cavents activa (la de por
        // defecto), para medir los campos VISIBLES.
        nombre: 'panel',
    // Guardian de estado: el formulario de obra PINTADO. (Ojo: sus CAMPOS están repartidos en los PASOS del
    // asistente —`#input-titulo` mide 0x0 porque pertenece a otro paso—, así que exigir un campo abortaba la
    // foto. Sus estilos se miden igual: el asistente pinta un paso y el resto se mide calculado.)
    exigidos: ['#obra-form'],
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-crear-cavent')?.click()`);
            await dormir(1600);
            await ev(`document.getElementById('tab-cavents')?.click()`);
            // La vista tiene que quedar en un estado DETERMINISTA. Si no, la medida del panel baila
            // entre corridas: se vio el 2026-10-01 (el radio del select del panel salia 10px o 0px
            // segun en que pestaña se hubiera quedado), y eso son diferencias que no existen.
            for (let i = 0; i < 20; i++) {
                const listo = await ev(`(() => {
                    const t = document.getElementById('tab-cavents');
                    const p = document.getElementById('crear-problogs-contenido');
                    const o = document.getElementById('obra-form');
                    return !!t && t.classList.contains('activa') && !!p && p.classList.contains('hidden') && !!o;
                })()`);
                if (listo === true) break;
                await dormir(300);
            }
            await dormir(800);
            // Y se ABRE el desplegable de "Mis Cavents" (la clase .open la pone el JS): su familia
            // de `!important` en style.css solo se puede medir con el abierto.
            await ev(`document.getElementById('cavents-trigger')?.click()`);
            for (let i = 0; i < 20; i++) {
                const abierto = await ev(`!!document.querySelector('.cavents-dropdown.open')`);
                if (abierto === true) break;
                await dormir(300);
            }
            await dormir(800);
            // Y se montan los ESTADOS de los campos del formulario de la obra, que es lo que miden
            // las reglas de :valid, :read-only y :focus de formularios.css (varias con `!important`).
            // En DOS FASES, como en la vista `auth`: la validacion de la app reacciona a los eventos
            // `input` y puede reescribir el estado, asi que primero los valores y luego el resto.
            await ev(`(() => {
                const poner = (sel, valor) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
                        : (el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype);
                    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return el;
                };
                poner('#input-titulo', 'Obra de prueba');
                poner('#input-precio', '1234');
                poner('#input-ancho', '40');
                poner('#input-alto', '50');
                poner('#input-descripcion-artistica', 'Una descripcion de prueba para medir el area.');
                return 'ok';
            })()`);
            await dormir(900);
            await ev(`(() => {
                // El nombre del artista lo rellena la app y no se toca: se marca read-only para medir
                // esa regla (si no lo estuviera ya).
                const artista = document.getElementById('input-artista');
                if (artista) artista.readOnly = true;
                return 'ok';
            })()`);
            await dormir(400);
            // El FOCO, con un CLIC DE VERDAD (eventos por CDP). Con `el.focus()` no aterrizaba y las
            // reglas de :focus de formularios.css se quedaban sin medir; con el clic si entra.
            const centroAno = await ev(`(() => {
                const el = document.getElementById('input-ano');
                if (!el) return null;
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return null;
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (centroAno && typeof centroAno === 'string' && centroAno.charAt(0) === '{') {
                const c = JSON.parse(centroAno);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(500);
            const dondeEstaElFoco = await ev(`document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null`);
            console.log('   [panel] foco en: ' + dondeEstaElFoco);
            // Y se espera a que la GEOMETRIA se ASIENTE. La clase puede estar ya puesta mientras el
            // panel sigue colocandose (la app lo posiciona por JS), y entonces la foto pilla un
            // fotograma a medias: paso el 2026-10-02, con 294 diferencias de puro ancho/alto entre dos
            // corridas del MISMO CSS. Se lee la caja hasta que dos lecturas seguidas coinciden.
            let cajaAnterior = '';
            for (let i = 0; i < 20; i++) {
                const caja = await ev(`(() => {
                    const o = document.getElementById('obra-form');
                    if (!o) return '';
                    const r = o.getBoundingClientRect();
                    return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top);
                })()`);
                if (caja && caja === cajaAnterior) break;
                cajaAnterior = caja;
                await dormir(300);
            }
        },
        // El `:focus` de un campo obligatorio VACIO (:invalid + :focus), forzado por CDP.
        forzarPseudo: { '#input-ano': ['focus'] },
        selectores: [
            '#obra-form', '#obra-form .form-section', '#obra-form .form-group',
            '#input-titulo', '#input-artista', '#input-ano', '#input-precio',
            '#input-ancho', '#input-alto', '#input-etiquetas', '#obra-etiquetas-bar',
            '#input-status', '#input-estado-obra', '#input-descripcion-tecnica',
            '.custom-select', '.custom-select-trigger', '#obra-step-bar',
            '#obra-form .form-section-content',
            // Los botones de ratio y el carrusel de imagenes del editor de la obra: tienen su
            // propia familia de `!important` en style.css/formularios.css.
            '.ratio-btn', '.ratio-btn.active', '#carrusel-viewport', '.imagen-carrusel',
            // El desplegable de Mis Cavents (abierto arriba) y la familia de la barra de pasos.
            '.cavents-dropdown', '.cavents-dropdown.open', '.cavents-trigger',
            '#obra-step-bar .crear-btn', '#obra-step-bar .limpiar-btn',
            '#obra-etiquetas-bar .input-etiquetas-subtle',
            '.form-block .form-group input',
            // Lo que miden las reglas de formularios.css de la obra (estados montados arriba y la
            // maquetacion por filas): sin estos elementos, esos `!important` no tenian red.
            '#formulario-obra', '.form-block .form-group label', '.form-row-tight',
            '.form-block .form-row-3', '#input-descripcion-artistica', '#obra-progress-bar',

            // La familia del carrusel y el boton de ratio inactivo (los `!important` de style.css),
            // y las etiquetas del encabezado, que se pintan u ocultan con `display`.
            '.carrusel-slide', '.carrusel-slide-empty', '.ratio-btn:not(.active)', '.toggle-label',
            // Las tarjetas del desplegable de Mis Cavents (con los botones y la pildora de estado).
            '.cavent-item', '.cavent-item-titulo', '.cavent-item-actions .btn-del',
            '.cavent-item-actions .btn-dup', '.status-badge',
            '.status-badge.status-activo', '.status-badge.status-inactivo'
        ]
    },
    {
        // El DIRECTORIO del chat. Hace falta porque el chat no tenia ninguna cobertura
        // visual (ni verificador hasta hace poco), y ahi vive una familia entera de
        // reglas de chat.css. Se ABRE el chat y se despliega el primer pueblo, para que la
        // fila de usuario tambien quede medida.
        nombre: 'chat',
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        // Una de las tres vistas inestables: a veces medía el pueblo sin desplegar (50 elementos en vez
        // de 80). Con esto, o esta desplegado con su fila de usuario, o la foto no se escribe.
        exigidos: ['.chat-pueblo-cuerpo', '.chat-user-row', '.chat-user-nombre'],
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-chat-global')?.click()`);
            // Se ESPERA a que el chat este abierto de verdad: con un `dormir` fijo, la mitad de las
            // corridas median otro estado y salian elementos que aparecian y desaparecian entre
            // fotos (paso el 2026-10-01: 614 medidas en una corrida y 644 en la siguiente).
            for (let i = 0; i < 25; i++) {
                const abierto = await ev(`(() => {
                    const c = document.getElementById('chat-global');
                    return !!c && !c.classList.contains('hidden');
                })()`);
                if (abierto === true) break;
                await dormir(300);
            }
            await dormir(700);
            await ev(`document.querySelector('#chat-accordion .chat-pueblo-header')?.click()`);
            // Y a que el pueblo este desplegado (con alto: si no, la fila de usuario no se mide).
            for (let i = 0; i < 20; i++) {
                const desplegado = await ev(`(() => {
                    const c = document.querySelector('.chat-pueblo-cuerpo');
                    return !!c && c.getBoundingClientRect().height > 0;
                })()`);
                if (desplegado === true) break;
                await dormir(300);
            }
            await dormir(700);
        },
        selectores: [
            '#chat-global', '#chat-directorio', '#chat-conversaciones',
            '#chat-accordion', '#chat-accordion .chat-pueblo',
            '.chat-pueblo-header', '.chat-pueblo-nombre', '.chat-pueblo-bandera',
            '.chat-pueblo-counts', '.chat-pueblo-count', '.chat-pueblo-count.act',
            '.chat-pueblo-count.tot', '.chat-pueblo-chevron',
            '.chat-pueblo-cuerpo', '.chat-pueblo-cuerpo-contenido', '.chat-pueblo-vacio',
            '.chat-user-row', '.chat-user-nombre', '.chat-user-estado',
            // Los PUNTOS de presencia y las INSIGNIAS rojas: son texto blanco sobre un color solido (o un
            // grafico de estado) y hasta el 2026-10-04 no los medía nadie, asi que migrarlos a un token
            // era invisible para la foto (se comprobaba solo con numeros).
            '.chat-user-dot', '.chat-user-dot.online',
            '.chat-nav-badge', '.chat-fab-badge',
 '.chat-sala-fab.cerrada',

            '#btn-chat-global-fab',
        ]
    },
    {
        // La GALERIA en modo EXPLORAR (rejilla). Hace falta una vista propia porque las reglas
        // `#galeria-container.modo-grid .obra-card` (galeria-publica.css, cinco `!important`) solo
        // aplican con la clase `modo-grid` puesta, y esa clase la pone el boton de Explorar.
        nombre: 'grid',
    // Guardian de estado: la rejilla de Explorar y una tarjeta dentro.
    exigidos: ['#galeria-container.modo-grid', '.obra-card'],
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        abrir: async (ev, dormir) => {
            // La obra se carga por el camino real (el mismo que usa el perfil), y luego se entra en
            // Explorar con su boton, que es quien pone la clase.
            await ev(`window.abrirObraDesdePerfil ? window.abrirObraDesdePerfil(55001) : null`);
            await dormir(2600);
            await ev(`document.getElementById('btn-buscar')?.click()`);
            // Estado determinista: la rejilla puesta, la tarjeta dentro y SIN la animacion de salida
            // (`.modo-grid-exit` es transitoria: si se mide mientras dura, el alto y el ancho bailan).
            for (let i = 0; i < 25; i++) {
                const listo = await ev(`(() => {
                    const gc = document.getElementById('galeria-container');
                    if (!gc || !gc.classList.contains('modo-grid')) return false;
                    if (document.querySelector('.obra-card.modo-grid-exit')) return false;
                    return !!gc.querySelector('.obra-card');
                })()`);
                if (listo === true) break;
                await dormir(300);
            }
            await dormir(900);
        },
        selectores: [
            '#galeria-container', '#galeria-container.modo-grid', '.obra-card',
 '.obra-avatar-clickable',
            '#galeria-publica'
        ]
    },
    {
        // El PERFIL de otro artista. Se llega por el CAMINO REAL (no llamando a una funcion):
        // la galeria es la seccion inicial, su tarjeta lleva el avatar del artista con
        // data-artista-id, y al tocarlo se abre su perfil. Antes no estaba cubierto y el
        // perfil tiene su propia familia de reglas en galeria-publica.css / style.css.
        nombre: 'perfil',
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        // Una de las tres vistas inestables: a veces medía el perfil sin sus secciones (58 elementos en
        // vez de 64). Si no estan, la foto no se escribe.
        exigidos: ['#perfil-usuario', '.perfil-nombre-artista-seccion'],
        abrir: async (ev, dormir) => {
            // Al arrancar, la app llama a mostrarPaginaBlanca() y la galeria solo aparece
            // al navegar. Se usa el mismo camino que la app: `abrirObraDesdePerfil` (que
            // main.js expone en window) muestra la galeria con la obra Y conecta el clic
            // del avatar con verPerfilArtistaDesdeGaleria.
            await ev(`window.abrirObraDesdePerfil ? window.abrirObraDesdePerfil(55001) : null`);
            await dormir(2600);   // que la galeria cargue su obra
            const antes = await ev(`(() => {
                const av = document.querySelector('.obra-avatar-clickable');
                const ids = ['galeria-publica','panel-artista','mi-cuenta','perfil-usuario','resultados-busqueda','pagina-blanca','problogs','chat-global'];
                const visibles = ids.filter((id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
                const gc = document.getElementById('galeria-container');
                return JSON.stringify({
                    visibles: visibles,
                    galeriaOculta: document.getElementById('galeria-publica').classList.contains('hidden'),
                    tarjetas: document.querySelectorAll('.obra-card').length,
                    avatares: document.querySelectorAll('.obra-avatar-clickable').length,
                    conDataId: document.querySelectorAll('.obra-avatar-clickable[data-artista-id]').length,
                    dataId: av ? (av.dataset ? av.dataset.artistaId : null) : null,
                    gcHijos: gc ? gc.children.length : -1,
                    gcTexto: gc ? gc.textContent.trim().slice(0, 70) : '(sin contenedor)'
                });
            })()`);
            console.log('   [perfil] antes del clic: ' + antes);
            const clic = await ev(`(() => {
                const a = document.querySelector('.obra-avatar-clickable[data-artista-id]')
                    || document.querySelector('.obra-avatar-clickable');
                if (!a) return null;
                a.scrollIntoView({ block: 'center', behavior: 'instant' });
                const r = a.getBoundingClientRect();
                if (!r.width || !r.height) return null;
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (clic && typeof clic === 'string' && clic.charAt(0) === '{') {
                const c = JSON.parse(clic);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(2600);
            // Y se ESPERA a que el perfil termine de montarse: sus secciones y sus estadisticas se
            // pintan cuando llega la respuesta, y sin esperarlas la vista medía 14 elementos unos veces
            // y 16 otras (el recuento bailaba entre 58 y 64 medidas y la comparacion acusaba elementos
            // que "aparecian y desaparecian").
            for (let i = 0; i < 25; i++) {
                const montado = await ev(`(() => {
                    const p = document.getElementById('perfil-usuario');
                    const e = document.getElementById('perfil-estadisticas');
                    return !!p && !p.classList.contains('hidden') && !!e && !!document.querySelector('.perfil-seccion');
                })()`);
                if (montado === true) break;
                await dormir(300);
            }
            await dormir(600);
            const despues = await ev(`JSON.stringify({
                perfilOculto: document.getElementById('perfil-usuario').classList.contains('hidden'),
                galeriaOculta: document.getElementById('galeria-publica').classList.contains('hidden')
            })`);
            console.log('   [perfil] despues del clic: ' + despues);
            // DIAGNOSTICO: que hay DENTRO del perfil. Hace falta porque dos selectores de esta vista
            // (`.perfil-tabs`, `.perfil-stats`) aparecen y desaparecen entre corridas, y eso movia el
            // recuento (58 elementos en vez de 64). Con esto se ve si es un estado a medias o si de
            // verdad son condicionales.
            console.log('   [perfil] dentro: ' + await ev(`(() => {
                const p = document.getElementById('perfil-usuario');
                if (!p) return 'sin perfil';
                const clases = new Set();
                for (const el of p.querySelectorAll('*')) {
                    if (typeof el.className === 'string') for (const c of el.className.split(' ')) if (c) clases.add(c);
                }
                const interesantes = [...clases].filter((c) => c.startsWith('perfil-')).sort();
                return JSON.stringify({ hijos: p.children.length, clasesPerfil: interesantes });
            })()`));
        },
        selectores: [
            '#perfil-usuario', '#perfil-avatar-seccion', '.perfil-nombre-artista-seccion',
            '.perfil-nombre-real-seccion', '.perfil-ciudad', '#perfil-avatar-btn',
            '#perfil-online-indicator', '.perfil-avatar-overlay',
            // OJO: aqui habia tres selectores MUERTOS (`#perfil-usuario .perfil-tabs`,
            // `#perfil-usuario .perfil-tab` y `#perfil-usuario .perfil-stats`): las clases de verdad son
            // `.perfil-tab-btn` y `.perfil-estadisticas`, y las secciones van sin el prefijo. No
            // encontraban nada nunca, asi que esas partes del perfil se median a ciegas.
            '.perfil-tab-btn', '#perfil-estadisticas', '.perfil-seccion',
            '.perfil-seccion-layout', '.perfil-seccion-info',
            // QUITADOS (2026-10-05): `#galeria-publica`, `#galeria-container`, `.obra-card`,
            // `.obra-avatar-clickable` y `.obra-avatar-placeholder` son de la GALERIA, y aqui miden 0x0
            // porque el perfil la oculta (el propio `abrir` de esta vista comprueba `galeriaOculta`). Se
            // miden en la vista `grid`, que es donde vive la galeria: el cruce de las 32 lecturas confirmo
            // que ahi estan (y ahi se pintan). Duplicarlas aqui solo daba 0x0.
        ]
    },
    {
        // El EDITOR de Problogs. Hace falta porque dentro de su modal hay reglas de
        // formularios.css (una móvil con mucha especificidad) que compiten con las de
        // problogs.css: sin abrirlo, un cambio de capas ahí pasaria inadvertido.
        nombre: 'editor',
        ruta: '',
        esperar: `(() => { const t = document.getElementById('toggle-panel'); const p = document.getElementById('preloader'); const a = document.querySelector('.app-container'); return !!t && !t.classList.contains('hidden') && (!p || p.classList.contains('hidden')) && (!a || a.classList.contains('visible')); })()`,
        fixture: false,
        // El EDITOR se pillaba a medio montar: en una corrida el contenedor salia con `opacity: 0` y
        // ancho 0 (la animacion de entrada a medias) y la comparacion daba 96 diferencias de maquetacion
        // que no eran del CSS. Con esto, o esta montado del todo, o la foto aborta.
        exigidos: ['#crear-problogs-contenido', '#problog-nav-bar', '.problog-anadir-btn'],
        abrir: async (ev, dormir) => {
            await ev(`document.getElementById('btn-crear-cavent')?.click()`);
            await dormir(1600);
            await ev(`document.getElementById('tab-problogs')?.click()`);
            // Se espera a que el editor este VISIBLE DE VERDAD (opacidad 1 y con caja), no a un tiempo fijo.
            for (let i = 0; i < 25; i++) {
                const listo = await ev(`(() => {
                    const el = document.getElementById('crear-problogs-contenido');
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    return parseFloat(getComputedStyle(el).opacity) > 0.99 && r.width > 0 && r.height > 0;
                })()`);
                if (listo === true) break;
                await dormir(300);
            }
            await dormir(600);
            // Se anade un parrafo para que aparezcan los botones de accion del bloque.
            const centro = await ev(`(() => {
                const b = document.querySelector('#crear-problogs-contenido .problog-anadir-btn')
                    || document.querySelector('.problog-anadir-btn');
                if (!b) return null;
                const r = b.getBoundingClientRect();
                return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
            })()`);
            if (centro && typeof centro === 'string') {
                const c = JSON.parse(centro);
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
            }
            await dormir(1400);
        },
        selectores: [
            '#crear-problogs-contenido', '#problog-form', '#problog-nav-bar',
            '.problog-anadir-btn',
            '#crear-problogs-contenido button', '.problog-anadir-btn:not(.hidden)',
            '#problog-nav-bar .nav-btn', '#problog-nav-bar .crear-btn',
            '#problog-nav-bar .limpiar-btn'
            // QUITADOS (2026-10-05): `#obra-step-bar`, sus dos botones y `#obra-etiquetas-bar` (con su
            // `.input-etiquetas-subtle`). Son del FORMULARIO DE OBRA, no del editor de Problogs, y ahi miden
            // 0x0: el cruce de las 32 lecturas lo dijo. La barra de pasos ya se pinta en la vista `panel` (y
            // se miden alli), asi que no se pierde nada; la de etiquetas sigue en la lista de `panel`.
        ]
    }
];

const ANCHOS = [393, 1280];
const TEMAS = ['light', 'dark'];

const salir = (codigo) => { try { ws?.close(); } catch {} try { chrome?.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(codigo); };

// ---------- modo COMPARAR (no necesita navegador) ----------
if (args.includes('--comparar')) {
    const i = args.indexOf('--comparar');
    const antes = JSON.parse(readFileSync(args[i + 1], 'utf8'));
    const despues = JSON.parse(readFileSync(args[i + 2], 'utf8'));
    const claves = new Set([...Object.keys(antes.datos), ...Object.keys(despues.datos)]);
    const diferencias = [];
    const inestables = [];
    const parciales = [];
    for (const clave of claves) {
        const a = antes.datos[clave];
        const b = despues.datos[clave];
        // OJO, y esto importaba mucho: un elemento que solo aparece en UNA de las dos fotos NO es un
        // cambio de CSS. Es una corrida que midio un estado a medio montar (la foto no es determinista
        // en algunas vistas: dos corridas del MISMO CSS llegaron a dar 602 "diferencias" asi). Se
        // aparta, se dice en voz alta y NO se cuenta como diferencia; pero el comando termina en error,
        // porque una comparacion con elementos sueltos no es de fiar.
        if (!a || !b) { parciales.push({ clave, enA: !!a, enB: !!b }); continue; }
        const props = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const prop of props) {
            if (a[prop] === b[prop]) continue;
            // Una propiedad que falta en una de las dos fotos es una medida INESTABLE que se
            // descarto al capturar (transicion, animacion, fuente a medio cargar): no es un
            // cambio del CSS. Se informa aparte para no confundirlo con una regresion.
            if (!(prop in a) || !(prop in b)) { inestables.push({ clave, propiedad: prop }); continue; }
            diferencias.push({ clave, propiedad: prop, antes: a[prop], despues: b[prop] });
        }
    }
    console.log(`Foto A: ${antes.cuando}  ·  ${Object.keys(antes.datos).length} medidas`);
    console.log(`Foto B: ${despues.cuando}  ·  ${Object.keys(despues.datos).length} medidas`);
    if (parciales.length) {
        console.log(`\nAVISO GORDO: ${parciales.length} elementos estan SOLO en una de las dos fotos.`);
        console.log('Eso no es un cambio de CSS: es una corrida que midio un estado a medio montar.');
        console.log('Se excluyen de la comparacion, pero la foto NO es de fiar: repitela.');
        for (const d of parciales.slice(0, 8)) console.log(`  ${d.clave} (${d.enA ? 'solo en A' : 'solo en B'})`);
        if (parciales.length > 8) console.log(`  ... y ${parciales.length - 8} mas`);
        console.log('Truco: repite la foto hasta que cada vista diga el numero de elementos de siempre.');
    }
    if (inestables.length) {
        console.log(`\nAVISO: ${inestables.length} valores no se pudieron comparar (inestables al capturar):`);
        for (const d of inestables.slice(0, 10)) console.log(`  ${d.clave} · ${d.propiedad}`);
        if (inestables.length > 10) console.log(`  ... y ${inestables.length - 10} mas`);
    }
    if (!diferencias.length) {
        console.log(parciales.length
            ? '\nSIN DIFERENCIAS DE VALOR, pero con elementos sueltos: la foto NO es de fiar (ver el aviso gordo).'
            : '\nSIN DIFERENCIAS: el cambio de CSS no movio ni un valor calculado.');
        process.exit(parciales.length || inestables.length ? 1 : 0);
    }
    console.log(`\nDIFERENCIAS: ${diferencias.length}`);
    for (const d of diferencias.slice(0, 60)) console.log(`  ${d.clave} · ${d.propiedad}: "${d.antes}" -> "${d.despues}"`);
    if (diferencias.length > 60) console.log(`  ... y ${diferencias.length - 60} mas`);
    process.exit(1);
}

// ---------- modo CAPTURA ----------
const iSalida = args.indexOf('--salida');
if (iSalida < 0) { console.error('Falta --salida <ruta.json>'); process.exit(2); }
const rutaSalida = args[iSalida + 1];
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const BASE = URL_BASE.replace(/\/[^/]*$/, '/');
// --vistas a,b: mide SOLO esas vistas. Sirve para aislar una vista cuando da un resultado raro
// (por ejemplo, si sospechas que el problema es el estado que deja la vista anterior).
const iVistas = args.indexOf('--vistas');
const SOLO_VISTAS = iVistas >= 0 && args[iVistas + 1] ? args[iVistas + 1].split(',').map((s) => s.trim()) : null;

// PREFLIGHT: sin servidor local el navegador mide una PAGINA DE ERROR y la foto sale con medidas
// vacias o de elementos que no existen (paso el 2026-10-01: la vista `auth` midio 3 elementos en vez
// de 18 y parecia un fallo de la vista). Se comprueba ANTES de abrir Chrome.
try {
    const r = await fetch(URL_BASE);
    const html = await r.text();
    if (!r.ok || !html.includes('<link')) throw new Error('respuesta rara (HTTP ' + r.status + ')');
} catch (e) {
    console.error(`NO HAY SERVIDOR en ${URL_BASE} (${e.message}).`);
    console.error('Levantalo antes con:  node scripts/servidor-local.mjs 8099');
    process.exit(2);
}

const perfil = mkdtempSync(join(tmpdir(), 'foto-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, '--window-size=393,852', '--force-device-scale-factor=1', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null;
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PUERTO}/json/version`); break; } catch { await sleep(250); } }
const pagina = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PUERTO}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable');
// DOM + CSS: hacen falta para FORZAR pseudo-estados (`CSS.forcePseudoState`), que es la unica forma
// fiable de medir `:focus`: con `el.focus()` no aterriza (y con un clic, menos: en el panel el
// desplegable abierto tapa el formulario y el clic se lo come el).
await send('DOM.enable'); await send('CSS.enable');

// Respuestas falsas del backend + sesion, para que las dos paginas monten sin servidor.
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        // SIN SERVICE WORKER: la app es una PWA y, en cuanto su SW se activa, las navegaciones entre
        // sus dos paginas dejan de ser de fiar (el indice se servia al pedir auth.html y la medida
        // acababa en la pagina equivocada). Paso el 2026-10-02.
        try {
            if (navigator.serviceWorker) { navigator.serviceWorker.register = () => Promise.reject(new Error('SW desactivado en las pruebas')); }
        } catch (_) {}
        try {
            // La SESION depende de la pagina: en auth.html/reset-password.html NO puede haber
            // sesion, o la app redirige y la vista "auth" acaba midiendo elementos del INDICE
            // (pasaba: el boton de auth daba los mismos cambios que el del panel de crear).
            const enAuth = /(auth|reset-password)\\.html$/.test(location.pathname);
            if (enAuth) {
                localStorage.removeItem('artistaData');
                localStorage.removeItem('creatio_auth_token_persist');
            } else {
                localStorage.setItem('artistaData', JSON.stringify({ id: 480001, nombre_artista: 'T', email: 't@t.com', rol: 'artista' }));
                localStorage.setItem('creatio_auth_token_persist', 'tok');
            }
        } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        // Datos falsos: una publicacion larga con un comentario, para poder abrir la
        // vista de Problogs de verdad.
        const ahora = Date.now();
        const bloques = [];
        for (let i = 1; i <= 25; i++) bloques.push({ tipo: 'texto', contenido: 'Parrafo ' + i + ' de la publicacion de prueba.' });
        const pub = { id: 70001, titulo: 'Publicacion de prueba', etiquetas: '', estado: 'publicado',
            created_at: new Date(ahora - 3600000).toISOString(), bloques,
            imagenes: [null,null,null,null,null,null,null,null], miniaturas: [null,null,null,null,null,null,null,null],
            portada_slot: null, nombre_artista: 'T', foto_artista: '', likes_count: 0,
            comentarios_count: 1, reblogs_count: 0, liked: false, reblogged: false };
        const comentarios = [{ id: 1, problog_id: 70001, usuario_id: 10, texto: 'Un comentario de prueba',
            comentario_padre_id: null, created_at: new Date(ahora - 1800000).toISOString(),
            autor_nombre: 'Ana', autor_foto: '', likes_count: 0, liked: false }];
        // Una obra en la galeria. Hace falta para poder ABRIR EL PERFIL por su camino real:
        // la tarjeta pone el avatar del artista (sin foto -> un div con data-artista-id) y
        // al tocarlo se abre su perfil.
        const obra = { id: 55001, titulo: 'Obra de prueba', precio: '100', artista: 'Ana',
            artista_user_id: 480002, foto_artista: '', estado_obra: 'publicada',
            vistas: 0, imagen: '', imagenes: [], categoria: '', tecnica: '',
            created_at: new Date(ahora - 86400000).toISOString() };
        // El perfil de OTRO artista (id distinto del mio, para ver la variante de visita).
        const usuarioAjeno = { id: 480002, nombre_real: 'Ana Pérez', nombre_artista: 'Ana',
            foto_perfil: '', ciudad: 'San Cristóbal', rol: 'artista', activo: false,
            ultima_actividad: new Date(ahora - 7200000).toISOString(),
            cavents: 1, problogs: 1, comcons: 0, seguidores: 0, siguiendo: 0 };
        window.fetch = async (input, init) => {
            const u = String(input);
            const method = ((init && init.method) || 'GET').toUpperCase();
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('/comentarios')) return json({ success: true, comentarios });
            if (method !== 'GET') return json({ success: true, id: 9 });
            if (u.includes('heartbeat')) return json({ ok: true });
            if (u.includes('mis-reacciones')) return json({ reacciones: [] });
            // Las OBRAS del artista: son las que pintan las tarjetas del desplegable "Mis Cavents"
            // (ahi viven los botones de duplicar y borrar). OJO: 'mis-obras' NO contiene '/obras',
            // asi que necesita su propia rama.
            if (u.includes('mis-obras')) return json({
                success: true,
                obras: [
                    { id: 9001, titulo: 'Cavent de prueba', precio: '100', status: 'Activo' },
                    { id: 9002, titulo: 'Otro Cavent', precio: '200', status: 'Inactivo' }
                ]
            });
            // Directorio del chat: sin esto la seccion sale vacia ("No hay pueblos") y se
            // fotografia el estado equivocado. Un pueblo con un artista (para los
            // contadores y la fila) y el resto vacios, que es el caso normal.
            if (u.includes('/chat/directorio')) return json({ success: true, pueblos: {
                'San Cristóbal': [{ id: 99, nombre_artista: 'Ana', foto_perfil: '',
                    ultima_actividad: new Date(ahora).toISOString() }],
                'San Antonio del Táchira': []
            } });
            if (u.includes('/chat/conversaciones')) return json({ success: true, conversaciones: [] });
            if (u.includes('/chat/bloqueados')) return json({ success: true, bloqueados: [] });
            // NO LEIDOS de verdad (3): es lo que hace APARECER las insignias del chat (chat-nav-badge,
            // chat-fab-badge), que hasta ahora se medían con caja 0x0 porque el mock decía 0.
            if (u.includes('/chat/no-leidos')) return json({ success: true, no_leidos: 3 });
            if (u.includes('mis-problogs') || u.includes('mis-reblogs')) return json({ success: true, problogs: [pub], total: 1 });
            if (u.includes('/problogs/70001')) return json(pub);
            if (u.includes('/problogs')) return json({ success: true, problogs: [pub], total: 1 });
            if (u.includes('/obras')) return json([obra]);
            // El perfil de un artista concreto (para el estado perfil, de mas abajo).
            if (u.includes('artistas/perfil/480002')) return json({ success: true, usuario: usuarioAjeno });
            if (u.includes('usuarios') || u.includes('artistas/buscar')) return json({ usuarios: [] });
            // Sesion VALIDA: si esto devuelve success:false la app cree que no hay sesion y
            // se queda en la pagina en blanco, asi que la galeria no se pinta nunca (y sin
            // galeria no se puede abrir el perfil por su camino real).
            if (u.includes('verificar') || u.includes('sesion')) {
                return json({ success: true, valido: true, activo: true,
                    usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
            }
            return json({ success: true, no_leidas: 0, count: 0, usuario: { id: 480001, nombre_artista: 'T', rol: 'artista' } });
        };
    })();`
});

const FIXTURE = `(() => {
    const f = document.createElement('div');
    f.id = 'fixture-foto';
    f.style.cssText = 'position:absolute;left:-9000px;top:0;width:320px;height:auto;';
    const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    // OJO con el ANCHO de los campos de texto: sin el, el navegador les da su ancho INTRINSECO, que
    // depende de la FUENTE, y entre dos corridas baila 5px (155 <-> 150) aunque el CSS sea el mismo.
    // Eso llenaba la comparacion de diferencias que no existen. Se fija con un ancho en linea: lo que
    // se mide aqui es el ESTILO calculado de una etiqueta desnuda, no su ancho intrinseco.
    const ANCHO = ' style="width:150px"';
    f.innerHTML = [
        '<input id="fx-input" type="text" value="texto"' + ANCHO + '>',
        '<input id="fx-email" type="email" value="a@b.c"' + ANCHO + '>',
        '<input id="fx-pass" type="password" value="secreta"' + ANCHO + '>',
        '<textarea id="fx-textarea"' + ANCHO + '>texto</textarea>',
        '<select id="fx-select"' + ANCHO + '><option>uno</option><option>dos</option></select>',
        '<button id="fx-button">boton</button>',
        '<button id="fx-submit" type="submit">enviar</button>',
        '<p id="fx-p">parrafo</p>',
        '<h2 id="fx-h2">titulo</h2>',
        '<label id="fx-label">etiqueta</label>',
        '<a id="fx-a" href="#">enlace</a>',
        '<span id="fx-span">span</span>',
        '<div id="fx-div">div</div>',
        // Elementos que faltaban por cubrir: hay reglas de etiqueta sobre ellos, y sin
        // tenerlos aquí no se podía comprobar si moverlos de capa cambia algo.
        '<main id="fx-main">principal</main>',
        '<picture id="fx-picture"><source srcset="' + gif + '"><img id="fx-img" src="' + gif + '" alt=""></picture>',
        // Pseudo-clase :invalid de verdad: un email mal formado y un select requerido vacio.
        '<form id="fx-form"><fieldset id="fx-fieldset"><legend id="fx-legend">leyenda</legend>' +
            '<input id="fx-invalid" type="email" value="no-es-email" required>' +
            '<select id="fx-invalid-select" required><option value="">elige</option></select>' +
        '</fieldset></form>'
    ].join('');
    document.body.appendChild(f);
    // LOS BOTONES DE LOGOUT, PINTADOS. Viven en dos contenedores ocultos
    // (#desktop-logout-options y #mobile-logout-options) que la app abre al pulsar su icono. Aqui se
    // quita la clase hidden para que se PINTEN: hasta ahora se median con caja 0x0 (el cruce de las 32
    // lecturas lo dijo), o sea que estaban en la foto pero no se veian. Se hace en el banco de pruebas
    // porque este script corre en la pagina DESPUES de navegar, que es donde el estado tiene sentido.
    for (const id of ['desktop-logout-options', 'mobile-logout-options']) {
        document.getElementById(id)?.classList.remove('hidden');
    }
    return 'ok';
})()`;

const datos = {};
// Lo que NO se ha medido, en crudo: { vista, tema, ancho, noEstan, sinCaja, medidos }. Se escribe junto a la
// foto para poder CRUZARLO (`scripts/analizar-no-medido.mjs`): saber si un selector no mide en NINGUNA vista,
// tema o ancho (entonces sobra) o solo en algunos estados (entonces se queda).
const sinMedir = [];
console.log(`Foto de estilos: ${BASE}`);

for (const pag of PAGINAS) {
    if (SOLO_VISTAS && !SOLO_VISTAS.includes(pag.nombre)) continue;
    for (const ancho of ANCHOS) {
        await send('Emulation.setDeviceMetricsOverride', { width: ancho, height: ancho < 500 ? 852 : 900, deviceScaleFactor: 1, mobile: ancho < 500 });
        await send('Page.navigate', { url: BASE + pag.ruta });
        for (let i = 0; i < 60; i++) { if (await evalJs(pag.esperar) === true) break; await sleep(300); }
        await sleep(1500);
        // Se apagan las transiciones (si no, los valores cambian entre las dos lecturas).
        await evalJs(`(() => {
            if (document.getElementById('foto-sin-transiciones')) return;
            const st = document.createElement('style');
            st.id = 'foto-sin-transiciones';
            st.textContent = '*, *::before, *::after { transition: none !important; }';
            document.head.appendChild(st);
        })()`);
        // Y se espera a la fuente web (Nunito): cambia altos y anchos si llega tarde.
        await evalJs(`document.fonts ? document.fonts.ready.then(() => 'ok') : 'ok'`);
        // ADEMAS se COMPRUEBA que la fuente esta de verdad disponible. `fonts.ready` no basta:
        // si Nunito no ha llegado, los campos del fixture (que son etiquetas SIN clase) miden su
        // ancho intrinseco con la fuente de reserva y el ancho baila 5px entre corridas: la
        // comparacion acusaba un cambio que no existia (paso el 2026-10-01 con #fx-input).
        for (let i = 0; i < 12; i++) {
            const cargada = await evalJs(`document.fonts && document.fonts.check ? document.fonts.check('16px Nunito') : true`);
            if (cargada === true) break;
            await sleep(300);
        }
        await sleep(400);
        if (pag.fixture) {
            const ok = await evalJs(FIXTURE);
            if (ok !== 'ok') { console.error(`No se pudo montar la muestra en ${pag.nombre}:`, ok); salir(2); }
        }
        // Algunas vistas hay que ABRIRLAS (Problogs: feed + publicacion + barra).
        if (pag.abrir) await pag.abrir(evalJs, sleep);
        // Y si la vista declara selectores EXIGIDOS, se comprueba que el estado llego de verdad. Es la
        // otra mitad del arreglo de la inestabilidad: la lectura salta en silencio los selectores que no
        // encuentra, asi que una vista a medio montar producia una foto COJA que parecia buena (paso el
        // 2026-10-03: chat con 50 elementos en vez de 80, perfil 58 en vez de 64, problogs 40 en vez de
        // 56, y 602 "diferencias" entre dos corridas del mismo CSS). Se reintenta la apertura y, si
        // sigue faltando algo, la foto ABORTA en vez de escribir un JSON enganoso.
        if (pag.exigidos) {
            let faltan = [];
            for (let intento = 0; intento < 3; intento++) {
                faltan = [];
                for (const sel of pag.exigidos) {
                    // TIENE QUE ESTAR *Y PINTARSE* (caja > 0), no solo existir: comprobar solo que existe
                    // dejaba pasar estados a medias (la vista `auth` tiene 18 selectores cuyo elemento mide
                    // 0x0, los del formulario de login, que está oculto porque esa vista entra en el
                    // REGISTRO). Los de `exigidos` son los que TIENEN que verse.
                    const pintado = await evalJs(`(() => {
                        const e = document.querySelector(${JSON.stringify(sel)});
                        if (!e) return false;
                        const r = e.getBoundingClientRect();
                        return r.width > 0 && r.height > 0;
                    })()`);
                    if (pintado !== true) faltan.push(sel);
                }
                if (!faltan.length) break;
                console.log(`   ${pag.nombre}: faltan (o no se pintan) ${faltan.join(', ')} — se reintenta la apertura (${intento + 1}/3)`);
                if (pag.abrir) await pag.abrir(evalJs, sleep);
            }
            if (faltan.length) {
                console.error(`La vista ${pag.nombre} no llego a su estado: faltan ${faltan.join(', ')}`);
                console.error('No se escribe la foto (una foto coja parece buena y arruina la comparacion).');
                salir(2);
            }
        }
        // Y los pseudo-estados que la vista pida (normalmente `:focus`): se fuerzan por CDP sobre el
        // nodo, que es lo unico que funciona de verdad (ver el comentario de DOM.enable arriba).
        if (pag.forzarPseudo) {
            const docPseudo = await send('DOM.getDocument', { depth: -1 });
            for (const [sel, pseudos] of Object.entries(pag.forzarPseudo)) {
                const nodo = await send('DOM.querySelector', { nodeId: docPseudo.result.root.nodeId, selector: sel });
                if (nodo.result?.nodeId) {
                    const r = await send('CSS.forcePseudoState', { nodeId: nodo.result.nodeId, forcedPseudoClasses: pseudos });
                    if (r.error) console.error(`   no se pudo forzar ${pseudos.join(',')} en ${sel}: ${JSON.stringify(r.error)}`);
                } else {
                    console.error(`   no se encontro ${sel} para forzar ${pseudos.join(',')}`);
                }
            }
            await sleep(400);
        }
        for (const tema of TEMAS) {
            // El tema se fija Y SE COMPRUEBA (theme.js lo elige por la hora del dia).
            for (let intento = 0; intento < 4; intento++) {
                await evalJs(`(() => {
                    try { localStorage.setItem('theme', '${tema}'); } catch (_) {}
                    document.documentElement.setAttribute('data-theme', '${tema}');
                })()`);
                await sleep(400);
                if (await evalJs(`document.documentElement.getAttribute('data-theme')`) === tema) break;
            }
            const temaReal = await evalJs(`document.documentElement.getAttribute('data-theme')`);
            if (temaReal !== tema) { console.error(`No se pudo fijar el tema ${tema} en ${pag.nombre} (quedo ${temaReal})`); salir(2); }
            await sleep(300);
            const lectura = `(() => {
                const props = ${JSON.stringify(PROPIEDADES)};
                const selectores = ${JSON.stringify(pag.selectores)};
                const salida = {};
                for (const sel of selectores) {
                    const el = document.querySelector(sel);
                    if (!el) continue;
                    const cs = getComputedStyle(el);
                    const o = {};
                    for (const p of props) { const v = cs[p]; o[p] = (v === undefined || v === null) ? null : String(v); }
                    const r = el.getBoundingClientRect();
                    o.__ancho = String(Math.round(r.width)); o.__alto = String(Math.round(r.height));
                    o.__tema = document.documentElement.getAttribute('data-theme');
                    salida[sel] = o;
                }
                return JSON.stringify(salida);
            })()`;
            const a = await evalJs(lectura);
            await sleep(400);
            const b = await evalJs(lectura);
            if (typeof a !== 'string' || a.startsWith('EXC')) { console.error('Fallo al leer:', String(a).slice(0, 200)); salir(2); }
            const uno = JSON.parse(a), dos = JSON.parse(b);
            let inestables = 0;
            for (const [sel, props] of Object.entries(uno)) {
                const clave = `${pag.nombre} · ${tema} · ${ancho}px · ${sel}`;
                const filtrado = {};
                for (const [prop, valor] of Object.entries(props)) {
                    if (dos[sel] && dos[sel][prop] !== valor) { inestables++; continue; }
                    filtrado[prop] = valor;
                }
                datos[clave] = filtrado;
            }
            console.log(`   ${pag.nombre} · ${tema} · ${ancho}px: ${Object.keys(uno).length} elementos, ${inestables} valores inestables`);
            // QUÉ NO SE HA MEDIDO, dicho en voz alta. Hasta ahora, un selector de la lista que no existía (o
            // que existía con caja 0x0) se saltaba EN SILENCIO: la vista parecía medida y ese trozo no lo
            // estaba. Se descubrió porque la vista `grid` mide `.obra-card-titulo` desde siempre y ese
            // elemento NO EXISTE en el estado de rejilla. No es un fallo (hay selectores que solo aplican en
            // algunos estados), pero tiene que verse.
            const noEstan = pag.selectores.filter((s) => !(s in uno));
            const sinCaja = pag.selectores.filter((s) => uno[s] && (uno[s].__ancho === '0' && uno[s].__alto === '0'));
            // Y se GUARDA, en crudo y SIN truncar, para poder cruzarlo despues. La linea de consola solo
            // enseña cuatro ejemplos; para decidir si un selector sobra hay que saber si mide en ALGUNA vista,
            // tema o ancho, y eso pide la lista entera (lo lee `scripts/analizar-no-medido.mjs`).
            sinMedir.push({ vista: pag.nombre, tema, ancho, noEstan, sinCaja, medidos: Object.keys(uno) });
            if (noEstan.length || sinCaja.length) {
                console.log(`      sin medir: ${noEstan.length ? noEstan.length + ' no existen (' + noEstan.slice(0, 4).join(', ') + (noEstan.length > 4 ? ', …' : '') + ')' : ''}${noEstan.length && sinCaja.length ? ' · ' : ''}${sinCaja.length ? sinCaja.length + ' con caja 0x0 (' + sinCaja.slice(0, 4).join(', ') + (sinCaja.length > 4 ? ', …' : '') + ')' : ''}`);
            }
        }
    }
}

writeFileSync(rutaSalida, JSON.stringify({ cuando: new Date().toISOString(), url: BASE, medidas: Object.keys(datos).length, datos }, null, 1), 'utf8');
console.log(`\nFoto guardada en ${rutaSalida}: ${Object.keys(datos).length} medidas`);
// Y el registro de lo NO medido, junto a la foto (mismo nombre + `.sin-medir.json`).
writeFileSync(rutaSalida.replace(/\.json$/, '') + '.sin-medir.json', JSON.stringify(sinMedir, null, 1), 'utf8');
console.log(`Registro de lo no medido: ${rutaSalida.replace(/\.json$/, '')}.sin-medir.json (${sinMedir.length} lecturas)`);
salir(0);
