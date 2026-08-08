// js/comentarios.js
// Drawer de comentarios — se desliza desde la parte inferior.
import { apiRequest } from './config.js';
import { artistaActual } from './auth.js';

let obraIdActual = null;
let cardActual = null;
let drawer, lista, input, avatar, btnEnviar, btnCerrar;

function init() {
    if (drawer) return;
    drawer    = document.getElementById('comentarios-drawer');
    lista     = document.getElementById('comentarios-lista');
    input     = document.getElementById('comentarios-input');
    avatar    = document.getElementById('comentarios-avatar');
    btnEnviar = document.getElementById('comentarios-enviar');
    btnCerrar = document.getElementById('comentarios-close');
}

export function abrirComentarios(obraId, cardEl) {
    init();
    obraIdActual = obraId;
    cardActual   = cardEl;

    // Avatar del usuario actual
    const foto = artistaActual?.foto_perfil || '';
    if (foto) {
        avatar.src = foto;
        avatar.style.display = 'block';
    } else {
        avatar.style.display = 'none';
    }

    input.value = '';
    lista.innerHTML = '<div class="comentarios-loading">Cargando comentarios...</div>';
    drawer.classList.remove('hidden');
    // Forzar reflow antes de la animación
    drawer.offsetHeight;
    drawer.classList.add('visible');
    input.focus();

    cargarComentarios(obraId);
}

function cerrarComentarios() {
    if (!drawer) return;
    drawer.classList.remove('visible');
    drawer.addEventListener('transitionend', function ocultar() {
        drawer.removeEventListener('transitionend', ocultar);
        drawer.classList.add('hidden');
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
        const data = await apiRequest(`/api/obras/${obraId}/comentarios`);
        const comentarios = data.comentarios || data || [];
        if (!comentarios.length) {
            lista.innerHTML = '<div class="comentarios-vacio">No hay comentarios aún. ¡Sé el primero!</div>';
            return;
        }
        lista.innerHTML = comentarios.map(c => renderizarComentario(c)).join('');
    } catch (err) {
        lista.innerHTML = '<div class="comentarios-error">Error al cargar comentarios</div>';
    }
}

function renderizarComentario(c) {
    const inicial = (c.autor_nombre || '?')[0].toUpperCase();
    const avatarHTML = c.autor_foto
        ? `<img src="${c.autor_foto}" class="comentario-avatar" alt="">`
        : `<div class="comentario-avatar comentario-avatar-default">${inicial}</div>`;

    const fecha = timeAgoShort(c.created_at || c.fecha);

    return `
        <div class="comentario-item">
            ${avatarHTML}
            <div class="comentario-body">
                <div class="comentario-autor">${c.autor_nombre || 'Usuario'}</div>
                <div class="comentario-texto">${c.texto || c.comentario || ''}</div>
                <div class="comentario-fecha">${fecha}</div>
            </div>
        </div>`;
}

async function enviarComentario() {
    const texto = input.value.trim();
    if (!texto || !obraIdActual) return;
    btnEnviar.disabled = true;

    try {
        const data = await apiRequest(`/api/obras/${obraIdActual}/comentarios`, {
            method: 'POST',
            body: JSON.stringify({ texto })
        });
        input.value = '';
        // Recargar comentarios
        await cargarComentarios(obraIdActual);
        // Actualizar contador en la card
        actualizarContador(cardActual, 1);
    } catch (err) {
        alert('No se pudo enviar el comentario');
    } finally {
        btnEnviar.disabled = false;
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

btnEnviar?.addEventListener('click', enviarComentario);

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
