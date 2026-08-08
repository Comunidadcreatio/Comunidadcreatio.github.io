// js/chat.js
// Chat global + privado de Creatio.
// Economía: sin websockets. El cliente hace polling condicional — solo
// mientras el chat está abierto y la pestaña visible — pidiendo
// GET /chat/mensajes?canal=...&afterId=último (respuestas de pocos KB).
import { apiRequest } from './config.js';
import { artistaActual } from './auth.js';
import { escapeHtml, debugLog } from './utils.js';
import { encontrarSeccionActual, actualizarEstadoNavButtons } from './galeria-ui.js';

const POLL_MS = 12000;      // 12s entre polls
const LIMITE_POLL = 50;

// ---- Estado del chat ----
let chatAbierto = false;
let canalActivo = null;     // 'global' | 'priv:a:b'
let lastId = 0;             // último id renderizado (cursor del poll)
let pollTimer = null;
let polling = false;        // evita polls superpuestos (ej. cold start de Render)

// ---- Utilidades de datos (js/ciudades.js expone window globals) ----
function pueblosTachira() {
    const p = window.CIUDADES_POR_PAIS;
    return (p && p['Venezuela'] && p['Venezuela']['Táchira']) || [];
}
function banderaDe(ciudad) {
    const b = window.BANDERA_POR_CIUDAD;
    return (b && b[ciudad]) || '';
}
function miId() {
    return (artistaActual && artistaActual.id) || 0;
}

// ---- Helpers de UI ----
function avatarHTML(foto, nombre) {
    const inicial = (nombre || '?').charAt(0).toUpperCase();
    return foto
        ? `<img class="chat-user-avatar" src="${foto}" alt="">`
        : `<span class="chat-user-avatar">${inicial}</span>`;
}
function formatHora(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}
function scrollMensajes() {
    const cont = document.getElementById('chat-mensajes');
    if (cont) cont.scrollTop = cont.scrollHeight;
}

// ============================================
// APERTURA / CIERRE DEL PANEL
// ============================================
export function setupChat() {
    const btn = document.getElementById('btn-chat-global');
    const seccion = document.getElementById('chat-global');
    if (!btn || !seccion) return;

    btn.addEventListener('click', () => {
        if (seccion.classList.contains('hidden')) abrirChat();
        else cerrarChat();
    });
    document.getElementById('chat-cerrar').addEventListener('click', cerrarChat);
    document.getElementById('chat-volver').addEventListener('click', volverDirectorio);
    document.getElementById('chat-sala-global').addEventListener('click', () => abrirSala('global', 'Chat Global'));
    document.getElementById('chat-form').addEventListener('submit', enviarMensaje);

    // Si otra navegación oculta la sección, apagar todo
    new MutationObserver(() => {
        if (seccion.classList.contains('hidden')) {
            chatAbierto = false;
            detenerPoll();
        }
    }).observe(seccion, { attributes: true, attributeFilter: ['class'] });

    // Pausar/reanudar el poll según la visibilidad de la pestaña
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) detenerPoll();
        else if (chatAbierto && canalActivo) iniciarPoll();
    });
}

function abrirChat() {
    if (!artistaActual) {
        window.location.href = 'auth.html';
        return;
    }
    const seccion = document.getElementById('chat-global');
    const actual = encontrarSeccionActual();
    if (actual && actual !== seccion) actual.classList.add('hidden');
    seccion.classList.remove('hidden');
    chatAbierto = true;
    cargarDirectorio();
    actualizarEstadoNavButtons();
}

function cerrarChat() {
    const seccion = document.getElementById('chat-global');
    if (seccion) seccion.classList.add('hidden');
    chatAbierto = false;
    detenerPoll();
    canalActivo = null;
    actualizarEstadoNavButtons();
}

function volverDirectorio() {
    detenerPoll();
    canalActivo = null;
    document.getElementById('chat-sala').classList.add('hidden');
    document.getElementById('chat-directorio').classList.remove('hidden');
    cargarDirectorio(); // refresca conversaciones recientes
}

// ============================================
// DIRECTORIO: sala global + acordeón de pueblos
// ============================================
async function cargarDirectorio() {
    const cont = document.getElementById('chat-accordion');
    cont.innerHTML = '<div class="chat-cargando">Cargando usuarios…</div>';
    try {
        const [dirRes, convRes] = await Promise.all([
            apiRequest('/chat/directorio'),
            apiRequest('/chat/conversaciones')
        ]);
        renderAcordeon(dirRes && dirRes.success ? dirRes.pueblos : {});
        renderConversaciones(convRes && convRes.success ? convRes.conversaciones : []);
    } catch (e) {
        debugLog.error('directorio chat:', e);
        cont.innerHTML = '<div class="chat-sin-mensajes">No se pudo cargar el directorio.</div>';
    }
}

function renderAcordeon(pueblos) {
    const cont = document.getElementById('chat-accordion');
    cont.innerHTML = '';
    const lista = pueblosTachira();
    if (!lista.length) {
        cont.innerHTML = '<div class="chat-sin-mensajes">No hay pueblos disponibles.</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    lista.forEach(ciudad => {
        const users = (pueblos && pueblos[ciudad]) || [];
        const item = document.createElement('div');
        item.className = 'chat-pueblo';

        const bandera = banderaDe(ciudad);
        const banderaHTML = bandera
            ? `<img class="chat-pueblo-bandera" src="iconos/banderas/${bandera}" alt="">`
            : '<span class="chat-pueblo-bandera"></span>';

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'chat-pueblo-header';
        header.setAttribute('aria-expanded', 'false');
        header.innerHTML = `${banderaHTML}<span class="chat-pueblo-nombre">${escapeHtml(ciudad)}</span><span class="chat-pueblo-count">${users.length}</span><span class="chat-pueblo-chevron">▼</span>`;
        header.addEventListener('click', () => toggleAcordeon(item));

        const cuerpo = document.createElement('div');
        cuerpo.className = 'chat-pueblo-cuerpo';
        if (users.length) {
            users.forEach(u => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'chat-user-row';
                row.innerHTML = `${avatarHTML(u.foto_perfil, u.nombre_artista)}<span class="chat-user-nombre">${escapeHtml(u.nombre_artista)}</span><span class="chat-user-flecha">›</span>`;
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    abrirPrivado(u);
                });
                cuerpo.appendChild(row);
            });
        } else {
            cuerpo.innerHTML = '<div class="chat-pueblo-vacio">Sin usuarios registrados aún</div>';
        }

        item.appendChild(header);
        item.appendChild(cuerpo);
        frag.appendChild(item);
    });
    cont.appendChild(frag);
}

function toggleAcordeon(item) {
    const estabaAbierto = item.classList.contains('open');
    document.querySelectorAll('#chat-accordion .chat-pueblo.open').forEach(el => el.classList.remove('open'));
    if (!estabaAbierto) item.classList.add('open');
}

function renderConversaciones(convs) {
    const cont = document.getElementById('chat-conversaciones');
    cont.innerHTML = '';
    if (!convs || !convs.length) return;
    const titulo = document.createElement('div');
    titulo.className = 'chat-subtitulo';
    titulo.textContent = 'Conversaciones';
    cont.appendChild(titulo);
    convs.forEach(c => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chat-conv-item';
        const preview = c.ultimo
            ? `${c.ultimo.autor_id === miId() ? 'Tú: ' : ''}${escapeHtml(c.ultimo.contenido)}`
            : 'Sin mensajes';
        item.innerHTML = `${avatarHTML(c.otro_foto, c.otro_nombre)}<span class="chat-conv-txt"><strong>${escapeHtml(c.otro_nombre)}</strong><small>${preview}</small></span>`;
        item.addEventListener('click', () => abrirSala(c.canal, c.otro_nombre, c.otro_foto));
        cont.appendChild(item);
    });
}

function abrirPrivado(u) {
    const me = miId();
    if (!me || u.id === me) return;
    const canal = me < u.id ? `priv:${me}:${u.id}` : `priv:${u.id}:${me}`;
    abrirSala(canal, u.nombre_artista, u.foto_perfil);
}

// ============================================
// SALA: cargar mensajes + poll condicional
// ============================================
async function abrirSala(canal, titulo, fotoOtro) {
    detenerPoll();
    canalActivo = canal;
    lastId = 0;

    document.getElementById('chat-directorio').classList.add('hidden');
    document.getElementById('chat-sala').classList.remove('hidden');

    const tituloEl = document.getElementById('chat-sala-titulo');
    tituloEl.innerHTML = fotoOtro
        ? `${avatarHTML(fotoOtro, titulo)}<span>${escapeHtml(titulo)}</span>`
        : `<span>${escapeHtml(titulo)}</span>`;

    const cont = document.getElementById('chat-mensajes');
    cont.innerHTML = '<div class="chat-cargando">Cargando mensajes…</div>';
    try {
        const data = await apiRequest(`/chat/mensajes?canal=${encodeURIComponent(canal)}`);
        cont.innerHTML = '';
        if (data && data.success && data.mensajes && data.mensajes.length) {
            data.mensajes.forEach(m => appendMensaje(m, m.autor_id === miId()));
            scrollMensajes();
        } else {
            cont.innerHTML = '<div class="chat-sin-mensajes">Sin mensajes todavía. ¡Escribe el primero!</div>';
        }
        iniciarPoll();
    } catch (e) {
        debugLog.error('cargar mensajes:', e);
        cont.innerHTML = '<div class="chat-sin-mensajes">Error de conexión.</div>';
    }
}

function appendMensaje(m, esPropio) {
    const cont = document.getElementById('chat-mensajes');
    const vacio = cont.querySelector('.chat-sin-mensajes');
    if (vacio) vacio.remove();

    const div = document.createElement('div');
    div.className = 'chat-msg ' + (esPropio ? 'own' : 'other');
    const autor = esPropio ? '' : `<div class="chat-msg-autor">${escapeHtml(m.nombre_artista || 'Usuario')}</div>`;
    div.innerHTML = autor + escapeHtml(m.contenido) + `<span class="chat-msg-tiempo">${formatHora(m.created_at)}</span>`;
    cont.appendChild(div);
    lastId = Math.max(lastId, m.id);
}

function iniciarPoll() {
    detenerPoll();
    pollTimer = setInterval(async () => {
        if (!chatAbierto || !canalActivo || document.hidden) return;
        if (polling) return;
        polling = true;
        try {
            const data = await apiRequest(`/chat/mensajes?canal=${encodeURIComponent(canalActivo)}&afterId=${lastId}`);
            if (data && data.success && data.mensajes && data.mensajes.length) {
                data.mensajes.forEach(m => {
                    if (m.id > lastId) appendMensaje(m, m.autor_id === miId());
                });
                scrollMensajes();
            }
        } catch (e) {
            // silencioso: el siguiente poll reintenta
        } finally {
            polling = false;
        }
    }, POLL_MS);
}

function detenerPoll() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

// ============================================
// ENVÍO
// ============================================
async function enviarMensaje(e) {
    e.preventDefault();
    if (!canalActivo) return;
    const input = document.getElementById('chat-input');
    const texto = input.value.trim();
    if (!texto) return;
    input.value = '';
    try {
        const data = await apiRequest('/chat/mensajes', {
            method: 'POST',
            body: JSON.stringify({ canal: canalActivo, contenido: texto })
        });
        if (data && data.success && data.mensaje) {
            appendMensaje(data.mensaje, true);
            scrollMensajes();
        } else {
            input.value = texto;
            debugLog.error('enviar mensaje:', data && data.error);
        }
    } catch (err) {
        input.value = texto;
        debugLog.error('enviar mensaje:', err);
    }
}
