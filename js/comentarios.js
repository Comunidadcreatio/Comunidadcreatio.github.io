// js/comentarios.js
// Drawer de comentarios — se desliza desde la parte inferior.
import { apiRequest } from './config.js?v=2e0c2e7288';
import { renderText, safeImgUrl } from './utils.js?v=d86e42a5e7';

let obraIdActual = null;
let cardActual = null;
let drawer, lista, input, btnEnviar, btnCerrar;

function init() {
    if (drawer) return;
    drawer    = document.getElementById('comentarios-drawer');
    lista     = document.getElementById('comentarios-lista');
    input     = document.getElementById('comentarios-input');
    btnEnviar = document.getElementById('comentarios-enviar');
    btnCerrar = document.getElementById('comentarios-close');
    // Conectar el ajuste del cajón cuando el teclado se abre (una sola vez)
    setupKeyboardDrawer();
}

export function abrirComentarios(obraId, cardEl) {
    init();
    obraIdActual = obraId;
    cardActual   = cardEl;

    input.value = '';
    lista.innerHTML = '<div class="comentarios-loading">Cargando comentarios...</div>';
    // Limpiar cualquier transform inline residual de swipe
    drawer.style.transform = '';
    drawer.style.transition = '';
    drawer.classList.remove('hidden');
    // Forzar reflow antes de la animación
    drawer.offsetHeight;
    drawer.classList.add('visible');

    // Si el teclado sigue abierto al reabrir (cierre del cajón sin cerrar el
    // teclado), volver a levantar el cajón de inmediato.
    ajustarTecladoDrawer();

    cargarComentarios(obraId);
}

// ============================================
// TECLADO: el cajón NUNCA cambia de posición. Su fondo sigue llegando siempre
// al borde inferior de la pantalla (detrás del teclado), así que aunque el
// sistema anime el teclado a su velocidad y nuestros eventos lleguen a saltos,
// es IMPOSIBLE que se vea la página entre el cajón y el teclado.
//
// La lista de comentarios tampoco se reordena: lo ÚNICO que se desplaza es el
// ÁREA DEL INPUT, que sube con un transform (se anima en la GPU, fluido) justo
// por encima del teclado.
//
// La subida se calcula MIDIENDO la posición real del área y descontando los
// transforms de CSS (el suyo propio y el de apertura/cierre del cajón), así la
// medición vale incluso si el teclado se abre mientras el cajón se desliza y
// aunque el WebView ya haya reacomodado el cajón.
// Durante el gesto del teclado solo se avanza en su dirección (subir al abrir,
// bajar al cerrar): los valores transitorios del visualViewport provocaban un
// rebote (subía de más y volvía). Al asentarse se corrige con el valor exacto.
// ============================================
const TECLADO_UMBRAL = 12;     // px de teclado para considerarlo "abierto"
const LIFT_TRANSICION = 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)';
const GESTO_MS = 160;          // eventos más seguidos = mismo gesto del teclado
let keyboardListenerConectado = false;
// Estado a nivel de módulo para poder resetearlo también desde cerrarComentarios
// (si se cierra el cajón con el teclado aún abierto, al reabrir se levanta otra vez).
let alturaLayoutBase = 0;      // mayor alto de layout visto (detectar resize-content)
let liftObjetivo = 0;          // px que debe subir el área del input
let ultimoEventoTeclado = 0;   // timestamp del último evento (detectar gesto)
let timerAsentado = null;      // corrección final al asentarse el teclado
let tecladoAbiertoAhora = false;
let scrollBloqueado = null;    // scroll de página fijado mientras el teclado está abierto

// Desplazamiento vertical que aporta el transform de CSS de un elemento
// (0 si no tiene). Se usa para medir la posición "natural" del input sin que
// interfieran las animaciones de transform.
function transformY(el) {
    if (!el || !el.style) return 0;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    try {
        if (typeof DOMMatrixReadOnly === 'function') return new DOMMatrixReadOnly(t).m42 || 0;
    } catch (e) { /* fallback abajo */ }
    const m = t.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!m) return 0;
    const v = m[1].split(',').map(Number);
    return v.length === 16 ? (v[13] || 0) : (v.length === 6 ? (v[5] || 0) : 0);
}
function areaInput() {
    return drawer ? drawer.querySelector('.comentarios-input-area') : null;
}
function resetEstadoTeclado() {
    liftObjetivo = 0;
    tecladoAbiertoAhora = false;
    scrollBloqueado = null;
    if (timerAsentado) { clearTimeout(timerAsentado); timerAsentado = null; }
    const area = areaInput();
    if (area) { area.style.transition = ''; area.style.transform = ''; }
}
function aplicarLift(animar) {
    const area = areaInput();
    if (!area) return;
    area.style.transition = animar ? LIFT_TRANSICION : 'none';
    area.style.transform = liftObjetivo > 0.5 ? 'translateY(' + (-liftObjetivo) + 'px)' : '';
}
// Cuánto hay que subir el área del input para que quede por encima del teclado.
function liftNecesario() {
    const vv = window.visualViewport;
    const area = areaInput();
    if (!vv || !area || !drawer || !tecladoAbiertoAhora) return 0;
    const keyboardTop = vv.height + (vv.offsetTop || 0);
    // Posición natural (sin su propio lift ni el transform del cajón).
    const natural = area.getBoundingClientRect().bottom - transformY(area) - transformY(drawer);
    return Math.max(0, Math.round(natural - keyboardTop));
}
function ajustarTecladoDrawer() {
    if (!drawer || !lista) return;
    const vv = window.visualViewport;
    if (!vv || !vv.height) return;
    if (window.innerHeight > alturaLayoutBase) alturaLayoutBase = window.innerHeight;

    const cajonVisible = drawer.classList.contains('visible');
    // Borde superior del teclado en coordenadas del layout (offsetTop cubre el
    // desplazamiento del viewport que algunos WebView hacen al enfocar).
    const keyboardTop = vv.height + (vv.offsetTop || 0);
    const teclado = Math.max(0, window.innerHeight - keyboardTop);
    // Salvaguarda: si algún WebView SÍ redujera el layout al abrir el teclado
    // (interactive-widget=resizes-content), el navegador ya deja el cajón encima
    // del teclado y la medición de abajo dará 0. Con resizes-visual (lo que
    // usamos) el layout no se toca y el lift lo hacemos nosotros.
    const layoutReducido = alturaLayoutBase - window.innerHeight > 40;
    tecladoAbiertoAhora = cajonVisible && (teclado > TECLADO_UMBRAL || layoutReducido);
    if (tecladoAbiertoAhora) document.body.classList.add('teclado-abierto');

    // Con el teclado abierto, impedir que el navegador desplace la página para
    // "mostrar" el input enfocado: el cajón está fijo y no necesita scroll, y
    // ese desplazamiento movería lo que hay detrás (cabecera, contenido).
    if (tecladoAbiertoAhora && layoutReducido === false) {
        const sy = window.scrollY || window.pageYOffset || 0;
        if (scrollBloqueado === null) scrollBloqueado = sy;
        else if (Math.abs(sy - scrollBloqueado) > 1) window.scrollTo(0, scrollBloqueado);
    } else {
        scrollBloqueado = null;
    }

    const ahora = performance.now();
    const enGesto = (ahora - ultimoEventoTeclado) < GESTO_MS;
    ultimoEventoTeclado = ahora;

    let nuevo = liftNecesario();
    if (enGesto) {
        // Nunca invertir la dirección durante el gesto: al abrir solo sube, al
        // cerrar solo baja. Evita el rebote por valores transitorios.
        nuevo = tecladoAbiertoAhora ? Math.max(nuevo, liftObjetivo) : Math.min(nuevo, liftObjetivo);
    }
    if (Math.abs(nuevo - liftObjetivo) > 0.5) {
        liftObjetivo = nuevo;
        aplicarLift(true);
    }

    // Al asentarse el teclado: corregir con el valor exacto y, si ya está
    // cerrado y el input volvió a su sitio, devolver el nav.
    if (timerAsentado) clearTimeout(timerAsentado);
    timerAsentado = setTimeout(() => {
        timerAsentado = null;
        const exacto = liftNecesario();
        if (Math.abs(exacto - liftObjetivo) > 1) {
            liftObjetivo = exacto;
            aplicarLift(true);
        }
        if (!tecladoAbiertoAhora && liftObjetivo <= 0.5) {
            document.body.classList.remove('teclado-abierto');
        }
    }, GESTO_MS + 40);
}
function setupKeyboardDrawer() {
    if (!window.visualViewport || keyboardListenerConectado) return;
    keyboardListenerConectado = true;
    window.visualViewport.addEventListener('resize', ajustarTecladoDrawer);
    window.visualViewport.addEventListener('scroll', ajustarTecladoDrawer);
    window.addEventListener('resize', ajustarTecladoDrawer);
    ajustarTecladoDrawer();
}

function cerrarComentarios() {
    if (!drawer) return;
    // Limpiar estilos inline del swipe y del ajuste del teclado (el input vuelve
    // a su sitio y, al reabrir con el teclado aún abierto, se vuelve a levantar
    // porque el estado queda reseteado).
    drawer.style.transform = '';
    drawer.style.transition = '';
    drawer.style.bottom = '';
    resetEstadoTeclado();
    document.body.classList.remove('teclado-abierto');
    drawer.classList.remove('visible');
    drawer.addEventListener('transitionend', function ocultar() {
        drawer.removeEventListener('transitionend', ocultar);
        // Solo ocultar si sigue sin estar visible (evita que un reopen dispare el hide)
        if (!drawer.classList.contains('visible')) {
            drawer.classList.add('hidden');
        }
    }, { once: true });
    // Fallback si el transitionend no dispara
    setTimeout(() => {
        if (!drawer.classList.contains('visible')) {
            drawer.classList.add('hidden');
        }
    }, 350);
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

btnCerrar?.addEventListener('click', cerrarComentarios);

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

// Swipe-down para cerrar
let swipeStartY = 0;
let swipePulling = false;

drawer?.addEventListener('touchstart', (e) => {
    // Solo si la lista está arriba del todo
    if (lista.scrollTop <= 0) {
        swipeStartY = e.touches[0].clientY;
        swipePulling = true;
    }
}, { passive: true });

drawer?.addEventListener('touchmove', (e) => {
    if (!swipePulling) return;
    const dist = e.touches[0].clientY - swipeStartY;
    if (dist > 5) {
        // Resistencia suave
        const damped = Math.min(dist * 0.55, 150);
        drawer.style.transform = `translateY(${damped}px)`;
        drawer.style.transition = 'none';
    }
}, { passive: true });

drawer?.addEventListener('touchend', () => {
    if (!swipePulling) return;
    swipePulling = false;
    const match = drawer.style.transform.match(/translateY\((\d+(?:\.\d+)?)px\)/);
    const dist = match ? parseFloat(match[1]) : 0;
    if (dist > 80) {
        drawer.style.transform = '';
        cerrarComentarios();
    } else {
        // Volver suave a la posición original
        drawer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
        drawer.style.transform = '';
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
