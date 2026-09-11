// js/comentarios.js
// Drawer de comentarios — se desliza desde la parte inferior.
import { apiRequest } from './config.js?v=2e0c2e7288';
import { renderText, safeImgUrl } from './utils.js?v=d86e42a5e7';

let obraIdActual = null;
let cardActual = null;
let drawer, lista, input, btnEnviar, nav;

function init() {
    if (drawer) return;
    drawer    = document.getElementById('comentarios-drawer');
    lista     = document.getElementById('comentarios-lista');
    input     = document.getElementById('comentarios-input');
    btnEnviar = document.getElementById('comentarios-enviar');
    nav       = document.getElementById('toggle-panel');
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
const FRACCION_ALTO = 0.5;          // la hoja arranca en la MITAD de la pantalla
const MIN_ALTO_CAJON = 220;         // alto minimo util cuando el teclado empuja
const GAP_CABECERA = 12;            // suelo: nunca sube por encima de la cabecera

let alturaCabeceraMem = 0;
let alturaNavMem = 0;
let altoBase = 0;                   // alto real de la pantalla (el teclado no lo encoge)
let anchoBase = 0;                   // para detectar rotacion
let escuchandoTeclado = false;
let swipeActivo = false;
let swipeStartY = 0;
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

    // Borde INFERIOR de la hoja: el teclado si esta abierto; si no, encima del nav.
    const bordeTeclado = Math.round(innerH - pan - visH);
    const bottom = Math.max(altoNav(), bordeTeclado);
    // Posicion REAL (en pantalla) de ese borde inferior. Se usa para el limite de
    // altura util: con el layout encogido el borde no esta en el teclado sino
    // sobre el nav, y medir sobre el teclado dejaria la hoja demasiado corta.
    const bordeInferiorPantalla = innerH - pan - bottom;

    // La hoja arranca en la MITAD de la pantalla. El tope inferior de esa mitad
    // es la cabecera (nunca por encima suya), y por arriba se sube solo lo justo
    // para conservar un alto utilizable cuando el teclado empuja.
    const suelo = altoCabecera() + GAP_CABECERA;
    const mitad = Math.round(altoBase * FRACCION_ALTO);
    const limiteTeclado = Math.round(bordeInferiorPantalla - MIN_ALTO_CAJON);
    const topPantalla = Math.max(0, Math.min(Math.max(mitad, suelo), Math.max(suelo, limiteTeclado)));

    const top = Math.round(topPantalla + pan);

    drawer.style.top = top + 'px';
    drawer.style.bottom = bottom + 'px';
    // El teclado tapa la franja donde vive el nav: se oculta para que no
    // aparezca en el hueco mientras el teclado se despliega. Clase PROPIA
    // (no se usa la del chat) para no interferir entre modulos, y solo se toca
    // si el cajon esta abierto.
    if (drawer.classList.contains('visible')) {
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

export function abrirComentarios(obraId, cardEl) {
    init();
    obraIdActual = obraId;
    cardActual   = cardEl;
    alturaCabeceraMem = 0;   // remedir: la cabecera cambia con la orientacion

    input.value = '';
    lista.innerHTML = '<div class="comentarios-loading">Cargando comentarios...</div>';

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

async function cargarComentarios(obraId) {
    try {
        const data = await apiRequest(`/obras/${obraId}/comentarios`);
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
                        ♥ <span class="comentario-likes-count">${likes}</span>
                    </button>
                </div>
                <div class="comentario-reply-input hidden" data-parent="${c.id}">
                    <input type="text" class="comentario-reply-field" placeholder="Escribe una respuesta..." autocomplete="off">
                    <button class="comentario-reply-send">➤</button>
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
        await apiRequest(`/obras/${obraIdActual}/comentarios`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!isReply) input.value = '';
        await cargarComentarios(obraIdActual);
        actualizarContador(cardActual, 1);
    } catch (err) {
        alert('No se pudo enviar el comentario');
    } finally {
        btnEnviar.disabled = false;
    }
}

async function likeComentario(commentId) {
    try {
        const res = await apiRequest(`/obras/${obraIdActual}/comentarios/${commentId}/like`, { method: 'POST' });
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

// Event listeners — se ejecutan al cargar el módulo (DOM ya está listo)
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

// Arrastrar hacia abajo para cerrar. Solo se inicia si la lista esta arriba del
// todo, para no robarle el scroll a los comentarios. El `transform` se usa
// unicamente para seguir el dedo.
drawer?.addEventListener('touchstart', (e) => {
    swipeActivo = lista.scrollTop <= 0;
    if (swipeActivo) {
        swipeStartY = e.touches[0].clientY;
        swipeDist = 0;
    }
}, { passive: true });

drawer?.addEventListener('touchmove', (e) => {
    if (!swipeActivo) return;
    const dist = e.touches[0].clientY - swipeStartY;
    if (dist > 6) {
        // Resistencia suave: el cajon acompana al dedo pero menos que el.
        swipeDist = Math.min(dist * 0.55, 140);
        drawer.style.transition = 'none';
        drawer.style.transform = 'translateY(' + Math.round(swipeDist) + 'px)';
    }
}, { passive: true });

drawer?.addEventListener('touchend', () => {
    if (!swipeActivo) return;
    swipeActivo = false;
    if (swipeDist > 80) {
        drawer.style.transition = '';
        swipeDist = 0;
        cerrarComentarios();
        return;
    }
    // No llego al umbral: vuelve a su sitio. Un toque simple no cierra nada.
    drawer.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
    drawer.style.transform = '';
    swipeDist = 0;
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
