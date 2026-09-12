// js/comentarios.js
// Drawer de comentarios â€” se desliza desde la parte inferior.
import { apiRequest } from './config.js?v=a76a9b6092';
import { renderText, safeImgUrl } from './utils.js?v=8861448e13';
// Bloqueo del scroll del fondo, COMPARTIDO con el modal de descripción: si los
// dos estan abiertos a la vez, cerrar uno no debe descongelar el fondo.
import { bloquearFondo, liberarFondo } from './bloqueo-fondo.js?v=dd51e51820';
import { registrarOverlay } from './overlays.js?v=6e3a9a3bd5';

let obraIdActual = null;
// Recurso cuyos comentarios se muestran: 'obras' o 'problogs'. El cajón es el
// MISMO para los dos; solo cambia la ruta de la API.
let tipoRecurso = 'obras';
let cardActual = null;
let drawer, lista, input, btnEnviar, nav, bloqueoEl;

function init() {
    if (drawer) return;
    drawer    = document.getElementById('comentarios-drawer');
    lista     = document.getElementById('comentarios-lista');
    input     = document.getElementById('comentarios-input');
    btnEnviar = document.getElementById('comentarios-enviar');
    nav       = document.getElementById('toggle-panel');
    bloqueoEl = document.getElementById('cajon-bloqueo');
    iniciarEscuchaTeclado();
}

// ============================================================
// GEOMETRIA DEL CAJON CON EL TECLADO
// ------------------------------------------------------------
// MODELO: el cajon se define con DOS bordes (top y bottom) calculados
// a partir del viewport visual. Nada mas. No se usan transforms, ni
// padding interpolado, ni bucles rAF, ni compensaciones del
// desplazamiento de la pagina.
//
//   top    = cabecera + pan
//   bottom = max(alto del nav, innerHeight - pan - altoVisible)
//
// Por que esta formula resuelve los dos comportamientos posibles del
// WebView sin necesidad de detectarlos:
//
//   - Si el layout NO se encoge (el teclado solo reduce el viewport
//     visual): innerHeight - altoVisible = alto del teclado, asi que
//     bottom lleva el cajon justo hasta el borde del teclado.
//   - Si el layout SI se encoge (adjustResize / resizes-content):
//     innerHeight ya viene reducido y altoVisible vale casi lo mismo,
//     asi que la resta da ~0 y bottom vuelve a ser el alto del nav.
//     Es correcto: el layout entero ya encogio y el cajon se apoya
//     sobre el nav, igual que sin teclado.
//
// El unico mecanismo es este. Al no haber dos cosas compensando el
// mismo movimiento, es imposible que se produzca un rebote.
//
// El `transform` del cajon se reserva EXCLUSIVAMENTE para la
// animacion de apertura/cierre y para el arrastre de cierre. Nunca
// para el teclado: esa mezcla era el origen del parpadeo.
// ============================================================
const TECLADO_UMBRAL = 24;          // px de teclado para considerarlo abierto
const NAV_ALTO_FALLBACK = 60;       // alto del nav si no se puede medir
const FRACCION_ALTO = 0.5;          // altura por defecto: la MITAD de la pantalla
const MIN_ALTO_CAJON = 220;         // alto minimo util cuando el teclado empuja
const GAP_CABECERA = 12;            // suelo: nunca sube por encima de la cabecera
const UMBRAL_CIERRE = 80;           // px arrastrando la LISTA para cerrar
const RESISTENCIA = 0.55;           // la hoja acompana al dedo algo menos que el
const EXCESO_ARRASTRE = 90;         // px que se puede pasar por debajo del limite

let alturaCabeceraMem = 0;
let alturaNavMem = 0;
let altoBase = 0;                   // alto real de la pantalla (el teclado no lo encoge)
let anchoBase = 0;                  // para detectar rotacion
let escuchandoTeclado = false;
// Gesto en curso: { tipo: 'mover' | 'cerrar' | 'esperar', startY, startTopPantalla }
let gesto = null;
let topAplicado = 0;                // top actual en px (coords de layout)
let posUsuario = null;              // altura elegida por el usuario (coords de PANTALLA)
let panActual = 0;                  // desplazamiento del viewport visual
let rangoTopMin = 0;                // limite superior (lo mas alto posible)
let rangoTopMax = 0;                // limite inferior (conservando el alto minimo)
let swipeDist = 0;

function altoCabecera() {
    if (alturaCabeceraMem) return alturaCabeceraMem;
    const h = document.getElementById('main-header');
    const v = h && h.offsetHeight ? Math.round(h.offsetHeight) : 0;
    if (v) alturaCabeceraMem = v;
    return v;
}

// El nav se mide cuando esta visible; si esta oculto (teclado abierto) se
// reutiliza la ultima medida buena, sin cachear nunca un cero.
function altoNav() {
    const medido = nav && nav.offsetHeight ? Math.round(nav.offsetHeight) : 0;
    if (medido) alturaNavMem = medido;
    return alturaNavMem || NAV_ALTO_FALLBACK;
}

// Alto de referencia de la pantalla. El teclado puede encoger el layout, asi que
// se guarda el MAYOR alto visto: la "mitad de la pantalla" no debe bailar al
// abrir el teclado. Un cambio de ancho delata una rotacion y se reinicia.
function actualizarAltoBase() {
    const h = window.innerHeight || 0;
    const w = window.innerWidth || 0;
    if (!h) return;
    if (Math.abs(w - anchoBase) > 40) { anchoBase = w; altoBase = h; return; }
    if (h > altoBase) altoBase = h;
}

// ============================================================
// FONDO INMOVIL MIENTRAS LA HOJA ESTA ABIERTA
// ------------------------------------------------------------
// El que scrollea de verdad es #galeria-container (position: fixed con
// overflow-y: auto), NO el documento: por eso bloquear `body` no serviria de
// nada. Se ataca con dos cosas, porque cada una cubre un hueco distinto:
//
//   1. `overflow: hidden` en el contenedor: corta el scroll Y la inercia que ya
//      estuviera en marcha. Conserva el scrollTop, asi que no salta al cerrar.
//   2. Una capa transparente encima del fondo: sin ella todavia se podria
//      arrastrar el CARRUSEL HORIZONTAL de la tarjeta que queda a la vista (es
//      un scroll propio, dentro del contenedor, y el overflow no lo alcanza).
//
// Ademas se compensa el desplazamiento del viewport visual: es lo unico que
// podia mover el fondo con la lista congelada y los toques bloqueados (lo hace
// el navegador al enfocar el input y desplegar el teclado).
// ============================================================
let transformFondoPrev = null;
let alturaGaleriaPin = 0;

// Fija el ALTO del contenedor de la galería en PÍXELES mientras la hoja está
// abierta. Hace falta porque la tarjeta mide `height: 100%` del contenedor: si
// el teclado encoge el layout, el contenedor se encoge, la tarjeta se encoge con
// él y con `object-fit: cover` el recorte de la imagen cambia â€” se vería
// distinta de como la subió el usuario. Con el alto fijado, no cambia nada.
//
// Solo se MIDE cuando el layout está completo (sin teclado); si ya lo está, la
// medida es idempotente. Tras una rotación, `actualizarAltoBase` reinicia la
// referencia y aquí se vuelve a medir sola.
function medirYFijarAltoGaleria(cont) {
    const layoutCompleto = (window.innerHeight || 0) >= altoBase - 40;
    if (layoutCompleto) {
        const h = Math.round(cont.getBoundingClientRect().height);
        if (h > 0) alturaGaleriaPin = h;
    }
    if (alturaGaleriaPin > 0) {
        const px = alturaGaleriaPin + 'px';
        if (cont.style.height !== px) {
            cont.style.height = px;
            cont.style.bottom = 'auto';
        }
    }
}

function congelarFondo(congelar) {
    if (bloqueoEl) bloqueoEl.classList.toggle('hidden', !congelar);
    const cont = document.getElementById('galeria-container');
    if (congelar) {
        // El overflow lo lleva el bloqueo COMPARTIDO (el modal de descripcion
        // tambien lo pide). El alto en px lo fija solo esta hoja, porque solo
        // ella abre el teclado y es lo unico que encoge el layout.
        bloquearFondo('comentarios');
        if (cont) medirYFijarAltoGaleria(cont);
    } else {
        liberarFondo('comentarios');
        if (cont) {
            cont.style.height = '';
            cont.style.bottom = '';
        }
        compensarFondo(0);
        transformFondoPrev = null;
    }
}

function compensarFondo(pan) {
    const cont = document.getElementById('galeria-container');
    if (!cont) return;
    // Se guarda el transform que tuviera para devolverlo tal cual al cerrar.
    if (transformFondoPrev === null) transformFondoPrev = cont.style.transform || '';
    const objetivo = pan > 1
        ? (transformFondoPrev ? transformFondoPrev + ' ' : '') + 'translateY(' + Math.round(pan) + 'px)'
        : transformFondoPrev;
    if (cont.style.transform !== objetivo) cont.style.transform = objetivo;
}

function ajustarGeometria() {
    if (!drawer) return;
    const innerH = window.innerHeight || 0;
    if (!innerH) return;
    actualizarAltoBase();

    const vv = window.visualViewport;
    // El sistema desplaza el viewport visual para "mostrar" el input enfocado.
    // Se descuenta para que el cajon quede quieto en pantalla.
    const pan = vv ? Math.max(0, Math.round(vv.offsetTop || 0)) : 0;
    const visH = vv && vv.height ? vv.height : innerH;
    panActual = pan;

    // Borde INFERIOR de la hoja: el teclado si esta abierto; si no, encima del nav.
    const bordeTeclado = Math.round(innerH - pan - visH);
    const bottom = Math.max(altoNav(), bordeTeclado);
    // Posicion REAL (en pantalla) de ese borde inferior. Se usa para el limite de
    // altura util: con el layout encogido el borde no esta en el teclado sino
    // sobre el nav, y medir sobre el teclado dejaria la hoja demasiado corta.
    const bordeInferiorPantalla = innerH - pan - bottom;

    // Limites verticales entre los que el usuario puede colocar la hoja:
    //   arriba: no puede pasar por encima de la cabecera.
    //   abajo:  debe conservar el alto minimo utilizable.
    rangoTopMin = altoCabecera() + GAP_CABECERA;
    rangoTopMax = Math.max(rangoTopMin, Math.round(bordeInferiorPantalla - MIN_ALTO_CAJON));

    drawer.style.bottom = bottom + 'px';

    // Mientras el dedo esta moviendo la hoja, manda el dedo: no se recoloca.
    if (!(gesto && gesto.tipo === 'mover')) {
        const porDefecto = Math.round(altoBase * FRACCION_ALTO);
        const deseado = (posUsuario === null) ? porDefecto : posUsuario;
        const topPantalla = Math.min(Math.max(deseado, rangoTopMin), rangoTopMax);
        topAplicado = Math.round(topPantalla + pan);
        drawer.style.top = topAplicado + 'px';
    }
    // El fondo no debe moverse ni un pixel: se le compensa el mismo pan que a la
    // hoja. Solo mientras la hoja esta abierta.
    compensarFondo(drawer.classList.contains('visible') ? pan : 0);

    // El teclado tapa la franja donde vive el nav: se oculta para que no
    // aparezca en el hueco mientras el teclado se despliega. Clase PROPIA
    // (no se usa la del chat) para no interferir entre modulos, y solo se toca
    // si el cajon esta abierto.
    if (drawer.classList.contains('visible')) {
        // El fondo mantiene su tamano original aunque el teclado encoja el
        // layout: si no, la tarjeta se reescala y la imagen cambia de encuadre.
        const contGaleria = document.getElementById('galeria-container');
        if (contGaleria) medirYFijarAltoGaleria(contGaleria);
        document.body.classList.toggle('cajon-teclado', bordeTeclado > TECLADO_UMBRAL);
    } else {
        document.body.classList.remove('cajon-teclado');
    }
}

function iniciarEscuchaTeclado() {
    if (escuchandoTeclado) return;
    escuchandoTeclado = true;
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', ajustarGeometria);
        window.visualViewport.addEventListener('scroll', ajustarGeometria);
    }
    const remedir = () => { alturaCabeceraMem = 0; ajustarGeometria(); };
    window.addEventListener('resize', remedir);
    window.addEventListener('orientationchange', remedir);
    ajustarGeometria();
}

// Ruta de los comentarios del recurso abierto.
function baseComentarios() {
    return '/' + tipoRecurso + '/' + obraIdActual + '/comentarios';
}

// `tipo` permite reutilizar el cajón para Problogs: 'obras' (por defecto, para no
// romper la llamada que ya hace la galería) o 'problogs'.
export function abrirComentarios(obraId, cardEl, tipo = 'obras') {
    init();
    obraIdActual = obraId;
    cardActual   = cardEl;
    tipoRecurso  = (tipo === 'problogs') ? 'problogs' : 'obras';
    alturaCabeceraMem = 0;   // remedir: la cabecera cambia con la orientacion

    input.value = '';
    lista.innerHTML = '<div class="comentarios-loading">Cargando comentarios...</div>';

    // El fondo queda inmovil desde el primer momento.
    congelarFondo(true);

    // Limpiar restos del arrastre de cierre.
    drawer.style.transform = '';
    drawer.style.transition = '';

    drawer.classList.remove('hidden');
    // 1) Geometria con el cajon aun NO visible: arranca ya en su sitio, asi no
    //    se ve ningun salto de posicion.
    ajustarGeometria();
    // 2) REFLOW OBLIGATORIO. El cajon venia de display:none, asi que su estado
    //    inicial (transform: translateY(100%), opacity: 0) solo existe a partir
    //    de este momento. Si no se fuerza AQUI el recalculo, el navegador aplica
    //    el estado inicial y el final en el mismo frame: no hay nada que
    //    interpolar y la hoja aparece DE GOLPE, sin animacion.
    drawer.offsetHeight;
    // 3) Ahora si: arranca la transicion de entrada.
    drawer.classList.add('visible');

    cargarComentarios(obraId);
}

function cerrarComentarios() {
    if (!drawer) return;
    document.body.classList.remove('cajon-teclado');
    // La altura elegida a mano no se arrastra a la proxima apertura: cada vez
    // que se abre, la hoja vuelve a su sitio por defecto.
    posUsuario = null;
    gesto = null;
    // Se libera el fondo: vuelve a scrollear y se devuelve su transform original.
    congelarFondo(false);
    // Bajar el teclado: sin esto el cajon se cierra pero el teclado se queda,
    // y al reabrir aparece en un estado intermedio.
    if (input && document.activeElement === input) input.blur();

    drawer.style.transform = '';
    drawer.style.transition = '';
    drawer.classList.remove('visible');

    // Un unico temporizador, mas largo que la transicion mas lenta (transform
    // 0.42s). NO se usa transitionend: con dos propiedades animandose dispara
    // con la primera que acaba (la opacidad, a los 0.3s) y ocultaria el cajon
    // cortando el deslizamiento por la mitad.
    setTimeout(() => {
        if (!drawer.classList.contains('visible')) {
            drawer.classList.add('hidden');
        }
    }, 500);

    obraIdActual = null;
    cardActual = null;
}

// El cajón tapa la app y congela el fondo: la navegación debe poder cerrarlo.
registrarOverlay('cajon-comentarios', cerrarComentarios);

async function cargarComentarios(obraId) {
    try {
        const data = await apiRequest(baseComentarios());
        const comentarios = data.comentarios || data || [];
        if (!comentarios.length) {
            lista.innerHTML = '<div class="comentarios-vacio">No hay comentarios aún. ¡Sé el primero!</div>';
            return;
        }
        // Agrupar: raíces y replies
        const raices = comentarios.filter(c => !c.comentario_padre_id);
        const replies = comentarios.filter(c => c.comentario_padre_id);
        lista.innerHTML = raices.map(c => renderizarComentario(c, replies)).join('');
    } catch (err) {
        lista.innerHTML = '<div class="comentarios-error">Error al cargar comentarios</div>';
    }
}

function renderizarComentario(c, todosReplies) {
    const inicial = (c.autor_nombre || '?')[0].toUpperCase();
    const avatarHTML = c.autor_foto
        ? `<img src="${safeImgUrl(c.autor_foto)}" class="comentario-avatar" alt="">`
        : `<div class="comentario-avatar comentario-avatar-default">${inicial}</div>`;

    const fecha = timeAgoShort(c.created_at || c.fecha);
    const likes = c.likes_count || 0;

    // Buscar replies de este comentario
    const hijos = todosReplies ? todosReplies.filter(r => r.comentario_padre_id === c.id) : [];
    const repliesHTML = hijos.length
        ? `<div class="comentario-replies">${hijos.map(h => renderizarComentario(h, todosReplies)).join('')}</div>`
        : '';

    return `
        <div class="comentario-item" data-id="${c.id}">
            ${avatarHTML}
            <div class="comentario-body">
                <div class="comentario-autor">${renderText(c.autor_nombre) || 'Usuario'}</div>
                <div class="comentario-texto">${renderText(c.texto || c.comentario)}</div>
                <div class="comentario-meta">
                    <span class="comentario-fecha">${fecha}</span>
                    <button class="comentario-btn-responder" data-id="${c.id}">Responder</button>
                    <button class="comentario-btn-like" data-id="${c.id}">
                        â™¥ <span class="comentario-likes-count">${likes}</span>
                    </button>
                </div>
                <div class="comentario-reply-input hidden" data-parent="${c.id}">
                    <input type="text" class="comentario-reply-field" placeholder="Escribe una respuesta..." autocomplete="off">
                    <button class="comentario-reply-send">âž¤</button>
                </div>
                ${repliesHTML}
            </div>
        </div>`;
}

async function enviarComentario(parentId = null) {
    const isReply = parentId !== null;
    const texto = isReply
        ? document.querySelector(`.comentario-reply-input[data-parent="${parentId}"] .comentario-reply-field`)?.value.trim()
        : input.value.trim();
    if (!texto || !obraIdActual) return;
    btnEnviar.disabled = true;

    try {
        const body = { texto };
        if (parentId) body.comentario_padre_id = parentId;
        await apiRequest(baseComentarios(), {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!isReply) input.value = '';
        await cargarComentarios(obraIdActual);
        // El contador de la tarjeta solo existe en las de obra.
        if (tipoRecurso === 'obras') actualizarContador(cardActual, 1);
    } catch (err) {
        alert('No se pudo enviar el comentario');
    } finally {
        btnEnviar.disabled = false;
    }
}

async function likeComentario(commentId) {
    try {
        const res = await apiRequest(baseComentarios() + '/' + commentId + '/like', { method: 'POST' });
        const btn = document.querySelector(`.comentario-btn-like[data-id="${commentId}"]`);
        const span = btn?.querySelector('.comentario-likes-count');
        if (btn) {
            if (res.liked) btn.classList.add('liked');
            else btn.classList.remove('liked');
        }
        if (span) span.textContent = res.likes_count;
    } catch (err) {
        // silencioso
    }
}

function actualizarContador(cardEl, delta) {
    if (!cardEl) return;
    // El contador de comentarios es el segundo .metrica-item en .metrica-right
    const items = cardEl.querySelectorAll('.metrica-right .metrica-item');
    const commentItem = items[1]; // vistas, comentarios, likes
    if (commentItem) {
        const span = commentItem.querySelector('span');
        if (span) {
            const current = parseInt(span.textContent) || 0;
            span.textContent = Math.max(0, current + delta);
        }
    }
}

function timeAgoShort(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days}d`;
    return new Date(dateStr).toLocaleDateString('es-VE');
}

// Event listeners â€” se ejecutan al cargar el módulo (DOM ya está listo)
init();

btnEnviar?.addEventListener('click', () => enviarComentario());

input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarComentario();
    }
});

// Cerrar al hacer clic en el fondo oscuro
drawer?.addEventListener('click', (e) => {
    if (e.target === drawer) cerrarComentarios();
});

// ============================================================
// GESTOS VERTICALES
// ------------------------------------------------------------
// Hay DOS gestos y se decide por DONDE empieza el toque:
//
//   - En la CABECERA (la barrita de arriba): MUEVE la hoja y la deja a la
//     altura que el usuario quiera. Si se arrastra mas abajo del limite, se
//     cierra. Esto funciona SIEMPRE, sin importar el scroll de la lista.
//
//   - En la LISTA: si la lista esta arriba del todo, la hoja sigue al dedo y se
//     cierra al pasar el umbral. Si la lista esta a medio scrollear, el gesto es
//     para la lista... PERO si dentro del MISMO gesto la lista llega arriba, la
//     hoja toma el relevo sin tener que levantar el dedo (traspaso). Antes habia
//     que soltar, volver a subir y arrastrar otra vez.
// ============================================================
function esCabecera(nodo) {
    return !!(nodo && nodo.closest && nodo.closest('.comentarios-drawer-header'));
}

drawer?.addEventListener('touchstart', (e) => {
    if (!drawer.classList.contains('visible')) return;
    const y = e.touches[0].clientY;

    if (esCabecera(e.target)) {
        // Referencia en coords de PANTALLA: el pan del viewport no interviene.
        gesto = { tipo: 'mover', startY: y, startTopPantalla: topAplicado - panActual };
        drawer.style.transition = 'none';
        return;
    }

    swipeDist = 0;
    if (lista.scrollTop <= 0) {
        gesto = { tipo: 'cerrar', startY: y };
    } else {
        // La lista scrollea. Se queda a la espera de si llega arriba.
        gesto = { tipo: 'esperar', startY: y };
    }
}, { passive: true });

drawer?.addEventListener('touchmove', (e) => {
    if (!gesto) return;
    const y = e.touches[0].clientY;

    if (gesto.tipo === 'esperar') {
        if ((y - gesto.startY) > 0 && lista.scrollTop <= 0) {
            // La lista ya esta arriba y el dedo sigue bajando: la hoja toma el
            // relevo DESDE AQUI. Se reinicia la referencia de Y para que la hoja
            // no de un salto con todo el recorrido acumulado del scroll.
            gesto = { tipo: 'cerrar', startY: y };
            swipeDist = 0;
        } else {
            return;
        }
    }

    if (gesto.tipo === 'mover') {
        const dy = y - gesto.startY;
        // Se permite pasarse un poco por abajo: ese exceso es la intencion de
        // cerrar, y se resuelve al soltar.
        const topPantalla = Math.min(
            Math.max(gesto.startTopPantalla + dy, rangoTopMin),
            rangoTopMax + EXCESO_ARRASTRE
        );
        topAplicado = Math.round(topPantalla + panActual);
        drawer.style.top = topAplicado + 'px';
        return;
    }

    // tipo 'cerrar'
    const dy = y - gesto.startY;
    if (dy > 6) {
        // Resistencia suave: la hoja acompana al dedo pero menos que el.
        swipeDist = Math.min(dy * RESISTENCIA, 160);
        drawer.style.transition = 'none';
        drawer.style.transform = 'translateY(' + Math.round(swipeDist) + 'px)';
    }
}, { passive: true });

drawer?.addEventListener('touchend', () => {
    if (!gesto) return;
    const tipo = gesto.tipo;
    gesto = null;

    if (tipo === 'mover') {
        drawer.style.transition = '';
        if ((topAplicado - panActual) > rangoTopMax + EXCESO_ARRASTRE / 2) {
            cerrarComentarios();          // se arrastro claramente hacia abajo
            return;
        }
        // Se guarda la eleccion en coords de PANTALLA, para que sobreviva a los
        // cambios de viewport (teclado, pan) y se reaplique al cerrarlo.
        posUsuario = Math.min(Math.max(topAplicado - panActual, rangoTopMin), rangoTopMax);
        ajustarGeometria();
        return;
    }

    if (tipo === 'cerrar') {
        if (swipeDist > UMBRAL_CIERRE) {
            drawer.style.transition = '';
            swipeDist = 0;
            cerrarComentarios();
            return;
        }
        // No llego al umbral: vuelve a su sitio. Un toque simple no cierra nada.
        drawer.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
        drawer.style.transform = '';
        swipeDist = 0;
    }
});

// Delegación de eventos para replies y likes
lista?.addEventListener('click', (e) => {
    // Botón "Responder"
    const btnResp = e.target.closest('.comentario-btn-responder');
    if (btnResp) {
        const parentId = btnResp.dataset.id;
        const replyInput = lista.querySelector(`.comentario-reply-input[data-parent="${parentId}"]`);
        if (replyInput) {
            const hidden = replyInput.classList.toggle('hidden');
            if (!hidden) replyInput.querySelector('input')?.focus();
        }
        return;
    }
    // Botón enviar reply
    const btnSend = e.target.closest('.comentario-reply-send');
    if (btnSend) {
        const parentId = btnSend.closest('.comentario-reply-input')?.dataset.parent;
        if (parentId) enviarComentario(parseInt(parentId));
        return;
    }
    // Botón like
    const btnLike = e.target.closest('.comentario-btn-like');
    if (btnLike) {
        likeComentario(parseInt(btnLike.dataset.id));
        return;
    }
});

// Enter en campo de reply
lista?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const field = e.target.closest('.comentario-reply-field');
        if (field) {
            e.preventDefault();
            const parentId = field.closest('.comentario-reply-input')?.dataset.parent;
            if (parentId) enviarComentario(parseInt(parentId));
        }
    }
});
