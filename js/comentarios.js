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
// TECLADO: cuando se escribe un comentario, el teclado "empuja" el cajón:
// su borde inferior sube con una transición SUAVE (y baja igual al cerrarse);
// el header queda fijo arriba y la lista se encoge progresivamente. La franja
// que el cajón libera al subir es EXACTAMENTE donde está el teclado físico,
// así que nunca se ve el fondo de la página. Si el evento llega cuando el
// teclado ya se cerró del todo, el cajón vuelve al instante (nada que revelar).
// ============================================
let keyboardListenerConectado = false;
// Estado del ajuste del teclado a nivel de módulo para poder resetearlo
// también desde cerrarComentarios (si se cierra el cajón con el teclado aún
// abierto, al reabrir debe volver a levantarlo).
let tecladoBottomActual = 0;   // último bottom aplicado (px); 0 = apoyado abajo
let tecladoTransTimer = null;  // limpia la transición inline al terminar el movimiento
function resetEstadoTeclado() {
    tecladoBottomActual = 0;
    if (tecladoTransTimer) { clearTimeout(tecladoTransTimer); tecladoTransTimer = null; }
}
function limpiarTransicionTeclado() {
    if (tecladoTransTimer) { clearTimeout(tecladoTransTimer); tecladoTransTimer = null; }
    if (drawer) drawer.style.transition = '';
}
function ajustarTecladoDrawer() {
    if (!drawer || !lista) return;
    const cajonVisible = drawer.classList.contains('visible');
    const vv = window.visualViewport;
    if (!vv || !vv.height) return;
    const keyboardOpen = cajonVisible && vv.height < window.innerHeight * 0.85;
    const teclado = Math.max(0, window.innerHeight - vv.height);

    if (keyboardOpen) {
        document.body.classList.add('teclado-abierto');
        if (Math.abs(teclado - tecladoBottomActual) < 2) return;
        tecladoBottomActual = teclado;
        // Subida suave: la transición de bottom hace que el cajón se encoja
        // progresivamente (el teclado tapa la franja que va liberando).
        drawer.style.transition = 'bottom 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
        drawer.style.bottom = teclado + 'px';
        if (tecladoTransTimer) clearTimeout(tecladoTransTimer);
        tecladoTransTimer = setTimeout(limpiarTransicionTeclado, 320);
    } else if (teclado <= 2 && tecladoBottomActual !== 0) {
        // Teclado CERRADO del todo: restaurar al instante. No transición:
        // si el evento llegó cuando el teclado ya se fue, una animación
        // lenta dejaría visible la página entre el borde y 900.
        resetEstadoTeclado();
        document.body.classList.remove('teclado-abierto');
        drawer.style.transition = '';
        drawer.style.bottom = '';
    } else if (tecladoBottomActual !== 0 && teclado < tecladoBottomActual) {
        // Teclado cerrándose a medias: seguir bajando con transición suave
        // (el teclado aún cubre la franja liberada).
        tecladoBottomActual = teclado;
        drawer.style.transition = 'bottom 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
        drawer.style.bottom = (teclado || '') + 'px';
        if (tecladoTransTimer) clearTimeout(tecladoTransTimer);
        tecladoTransTimer = setTimeout(() => {
            document.body.classList.remove('teclado-abierto');
            limpiarTransicionTeclado();
        }, 340);
    }
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
    // Limpiar estilos inline del swipe/teclado y resetear el estado del teclado
    // (si se cierra el cajón con el teclado aún abierto, al reabrir se levanta
    // de nuevo porque tecladoBottomActual vuelve a 0).
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
