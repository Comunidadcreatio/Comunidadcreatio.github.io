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

// El cluster flotante (sala global + círculos de conversaciones) solo es
// visible dentro del directorio del chat.
function setFabVisible(visible) {
    const cluster = document.getElementById('chat-cluster');
    if (cluster) cluster.classList.toggle('hidden', !visible);
}

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

// ---- Presencia (igual que getPublicProfile: activo si hay sesión < 5 min) ----
const ONLINE_MS = 5 * 60 * 1000;

function esOnline(u) {
    if (!u.ultima_actividad) return false;
    const t = new Date(u.ultima_actividad).getTime();
    return !isNaN(t) && (Date.now() - t) < ONLINE_MS;
}

function formatFechaCorta(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

function estadoUsuarioHTML(u) {
    const online = esOnline(u);
    const dot = `<span class="chat-user-dot ${online ? 'online' : ''}"></span>`;
    let estado;
    if (online) {
        estado = '<span class="chat-user-estado"><span class="online-text">Activo ahora</span></span>';
    } else if (u.ultima_actividad) {
        estado = `<span class="chat-user-estado">Última conexión ${formatFechaCorta(u.ultima_actividad)}</span>`;
    } else {
        estado = '<span class="chat-user-estado">Sin conexiones recientes</span>';
    }
    return `<span class="chat-user-avatar-wrap">${avatarHTML(u.foto_perfil, u.nombre_artista)}${dot}</span>` +
        `<span class="chat-user-info"><span class="chat-user-nombre">${escapeHtml(u.nombre_artista)}</span>${estado}</span>` +
        '<span class="chat-user-flecha">›</span>';
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
    // FAB: acceso directo a la sala "Chat Global" (abre el panel si está cerrado)
    const fab = document.getElementById('btn-chat-global-fab');
    if (fab) fab.addEventListener('click', abrirChatGlobal);
    const cerrarBtn = document.getElementById('chat-cerrar');
    if (cerrarBtn) cerrarBtn.addEventListener('click', cerrarChat);
    document.getElementById('chat-volver').addEventListener('click', volverDirectorio);
    document.getElementById('chat-form').addEventListener('submit', enviarMensaje);
    setupDragEliminar();

    // Abrir una conversación desde una notificación push (evento de js/push.js)
    window.addEventListener('chat-abrir-canal', (e) => {
        const detail = (e && e.detail) || {};
        if (!detail.canal) return;
        abrirChat();
        abrirSala(detail.canal, detail.titulo || 'Conversación', null);
    });

    // Si otra navegación oculta la sección, apagar todo y ocultar el FAB
    new MutationObserver(() => {
        if (seccion.classList.contains('hidden')) {
            chatAbierto = false;
            detenerPoll();
            setFabVisible(false);
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
    refrescarChatNoLeidos(); // badges al abrir el chat
    setFabVisible(true); // en el directorio, el FAB de la sala global sí se muestra
    actualizarEstadoNavButtons();
}

// Acceso directo a la sala global desde el botón flotante (FAB)
function abrirChatGlobal() {
    if (!artistaActual) {
        window.location.href = 'auth.html';
        return;
    }
    const seccion = document.getElementById('chat-global');
    if (seccion.classList.contains('hidden')) abrirChat();
    abrirSala('global', 'Chat Global');
}

function cerrarChat() {
    const seccion = document.getElementById('chat-global');
    if (seccion) seccion.classList.add('hidden');
    chatAbierto = false;
    detenerPoll();
    canalActivo = null;
    window._canalChatActivo = null;
    setFabVisible(false);
    actualizarEstadoNavButtons();
}

function volverDirectorio() {
    detenerPoll();
    canalActivo = null;
    window._canalChatActivo = null;
    document.getElementById('chat-sala').classList.add('hidden');
    document.getElementById('chat-directorio').classList.remove('hidden');
    setFabVisible(true); // de vuelta al directorio
    cargarDirectorio(); // refresca conversaciones recientes
}

let noLeidos = {}; // canal -> nº de mensajes sin leer (viene de GET /chat/no-leidos)
let ultimosPueblos = {}; // último directorio recibido (para volver al grid desde un pueblo)

// Aplica los badges de no leídos: punto en el icono del nav, número en el FAB
// de la sala global y en cada círculo de conversación.
function aplicarNoLeidos() {
    const total = Object.values(noLeidos).reduce((s, n) => s + n, 0);
    const nav = document.getElementById('chat-nav-badge');
    if (nav) nav.classList.toggle('hidden', total === 0);

    const fabBadge = document.getElementById('chat-fab-badge');
    if (fabBadge) {
        const n = noLeidos['global'] || 0;
        fabBadge.textContent = n > 99 ? '99+' : String(n);
        fabBadge.classList.toggle('hidden', n === 0);
    }

    document.querySelectorAll('.chat-conv-circle').forEach(circle => {
        const badge = circle.querySelector('.chat-circle-badge');
        if (!badge) return;
        const n = noLeidos[circle.dataset.canal] || 0;
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.classList.toggle('hidden', n === 0);
    });
}

// GET /chat/no-leidos — refresca los contadores de no leídos (nav, FAB, círculos).
export async function refrescarChatNoLeidos() {
    try {
        const data = await apiRequest('/chat/no-leidos');
        if (!data || !data.success) return;
        noLeidos = {};
        (data.canales || []).forEach(c => { noLeidos[c.canal] = c.n; });
        aplicarNoLeidos();
    } catch (e) { /* silencioso: el siguiente ciclo reintenta */ }
}
window.refrescarChatNoLeidos = refrescarChatNoLeidos;

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
        renderCarruselPueblos(dirRes && dirRes.success ? dirRes.pueblos : {});
        renderConversaciones(convRes && convRes.success ? convRes.conversaciones : []);
    } catch (e) {
        debugLog.error('directorio chat:', e);
        cont.innerHTML = '<div class="chat-sin-mensajes">No se pudo cargar el directorio.</div>';
    }
}

// CARRUSEL DE BANDERAS: se deslizan horizontalmente; la bandera que queda en
// el centro es la seleccionada (la más grande) y debajo se cargan sus usuarios.
let ultimoPuebloSeleccionado = null;

function renderCarruselPueblos(pueblos) {
    ultimosPueblos = pueblos || {};
    const cont = document.getElementById('chat-accordion');
    cont.innerHTML = '';
    const lista = pueblosTachira();
    if (!lista.length) {
        cont.innerHTML = '<div class="chat-sin-mensajes">No hay pueblos disponibles.</div>';
        return;
    }

    const carrusel = document.createElement('div');
    carrusel.className = 'chat-pueblos-carrusel';
    carrusel.setAttribute('aria-label', 'Selecciona un municipio del Táchira');
    lista.forEach(ciudad => {
        const users = ultimosPueblos[ciudad] || [];
        const slide = document.createElement('button');
        slide.type = 'button';
        slide.className = 'chat-pueblo-slide';
        slide.dataset.pueblo = ciudad;
        slide.setAttribute('aria-label', `${ciudad}: ${users.length} usuarios`);
        const bandera = banderaDe(ciudad);
        slide.innerHTML = bandera
            ? `<img class="chat-pueblo-slide-bandera" src="iconos/banderas/${bandera}" alt="" loading="lazy" draggable="false">`
            : '<span class="chat-pueblo-slide-bandera chat-pueblo-slide-bandera-vacia"></span>';
        slide.addEventListener('click', () => {
            // Al tocar una bandera se centra (snap) y el scroll carga sus usuarios
            slide.scrollIntoView({ behavior: 'smooth', inline: 'center' });
        });
        carrusel.appendChild(slide);
    });
    // Barra de información: nombre del municipio (izq.) + contadores (der.)
    const info = document.createElement('div');
    info.id = 'chat-pueblo-info';
    info.className = 'chat-pueblo-info';
    info.innerHTML = '<span class="chat-pueblo-info-titulo">Desliza para elegir un municipio</span>';
    cont.appendChild(info);

    cont.appendChild(carrusel);

    const panel = document.createElement('div');
    panel.id = 'chat-pueblo-panel';
    panel.className = 'chat-pueblo-panel';
    panel.innerHTML = '<div class="chat-pueblo-vacio">Desliza para elegir un municipio</div>';
    cont.appendChild(panel);

    // Escala las banderas según su distancia al centro y detecta la central
    function actualizarCarrusel() {
        const centro = carrusel.scrollLeft + carrusel.clientWidth / 2;
        let mejor = null;
        let mejorD = Infinity;
        carrusel.querySelectorAll('.chat-pueblo-slide').forEach(s => {
            const sc = s.offsetLeft + s.offsetWidth / 2;
            const d = Math.abs(sc - centro);
            const k = d / carrusel.clientWidth;
            s.style.transform = `scale(${Math.max(0.55, 1 - k * 0.8)})`;
            s.style.opacity = String(0.35 + (1 - Math.min(1, k * 1.5)) * 0.65);
            if (d < mejorD) { mejorD = d; mejor = s; }
        });
        const pueblo = mejor ? mejor.dataset.pueblo : null;
        if (pueblo && pueblo !== ultimoPuebloSeleccionado) {
            ultimoPuebloSeleccionado = pueblo;
            renderUsuariosPueblo(pueblo);
        }
    }
    let raf = null;
    carrusel.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = null; actualizarCarrusel(); });
    });

    // Centrar la primera bandera y cargar sus usuarios
    requestAnimationFrame(() => {
        const s0 = carrusel.querySelector('.chat-pueblo-slide');
        if (s0) {
            carrusel.scrollLeft = s0.offsetLeft - (carrusel.clientWidth - s0.offsetWidth) / 2;
        }
        actualizarCarrusel();
    });
}

// Municipio al que pertenece el pueblo (para el encabezado del panel)
function municipioDe(ciudad) {
    try {
        return (window.MUNICIPIO_POR_PUEBLO && window.MUNICIPIO_POR_PUEBLO[ciudad]) || '';
    } catch (e) { return ''; }
}

// Lista de usuarios del municipio seleccionado en el carrusel
function renderUsuariosPueblo(ciudad) {
    const panel = document.getElementById('chat-pueblo-panel');
    const info = document.getElementById('chat-pueblo-info');
    const users = ultimosPueblos[ciudad] || [];
    const activos = users.filter(esOnline).length;
    // Barra superior: nombre a la izquierda, contadores a la derecha
    if (info) {
        const municipio = municipioDe(ciudad);
        // El municipio se muestra siempre, justo después del pueblo
        const titulo = municipio
            ? `${escapeHtml(ciudad)} <span class="chat-pueblo-info-municipio">· ${escapeHtml(municipio)}</span>`
            : escapeHtml(ciudad);
        info.innerHTML =
            `<span class="chat-pueblo-info-titulo">${titulo}</span>` +
            `<span class="chat-pueblo-info-contadores">` +
            `<span class="chat-pueblo-info-contador on">${activos} <em>En línea</em></span>` +
            `<span class="chat-pueblo-info-contador tot">${users.length} <em>Artistas</em></span>` +
            `</span>`;
    }
    if (!panel) return;
    panel.innerHTML = '';
    const lista = document.createElement('div');
    lista.className = 'chat-pueblo-usuarios';
    if (users.length) {
        users.forEach(u => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'chat-user-row';
            row.innerHTML = estadoUsuarioHTML(u);
            row.addEventListener('click', () => abrirPrivado(u));
            lista.appendChild(row);
        });
    } else {
        lista.innerHTML = '<div class="chat-pueblo-vacio">Sin usuarios registrados aún</div>';
    }
    panel.appendChild(lista);
}

// Las conversaciones se muestran como círculos (avatares) junto al círculo
// de la sala global. El orden se invierte: la más reciente queda pegada al
// círculo de la sala global (la última en agregarse).
function renderConversaciones(convs) {
    const cont = document.getElementById('chat-cluster-convs');
    if (!cont) return;
    // Conservar el FAB de la sala global: solo se eliminan los círculos de conversación
    cont.querySelectorAll('.chat-conv-circle').forEach(c => c.remove());
    if (!convs || !convs.length) return;
    const ordenadas = [...convs].reverse(); // newest queda a la derecha, junto al FAB
    const fab = cont.querySelector('.chat-fab');
    ordenadas.forEach(c => {
        const circle = document.createElement('button');
        circle.type = 'button';
        circle.className = 'chat-conv-circle';
        circle.setAttribute('aria-label', `Chat con ${c.otro_nombre}`);
        circle.dataset.canal = c.canal;
        const inicial = (c.otro_nombre || '?').charAt(0).toUpperCase();
        circle.innerHTML = c.otro_foto
            ? `<img src="${c.otro_foto}" alt="">`
            : inicial;
        const badge = document.createElement('span');
        badge.className = 'chat-circle-badge hidden';
        circle.appendChild(badge);
        circle.addEventListener('click', () => abrirSala(c.canal, c.otro_nombre, c.otro_foto));
        // Insertar antes del FAB para que la sala global quede en el extremo derecho
        if (fab) cont.insertBefore(circle, fab);
        else cont.appendChild(circle);
    });
    // Iniciar el scroll al final: se ven el FAB y las conversaciones más recientes
    requestAnimationFrame(() => { cont.scrollLeft = cont.scrollWidth; });
    aplicarNoLeidos(); // badges sobre los círculos recién renderizados
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
    window._canalChatActivo = canal; // lo usa push.js para no mostrar banner si ya estás leyendo aquí
    lastId = 0;
    setFabVisible(false); // al entrar a una sala (global o privada) se oculta

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
        // La sala está visible: resetea el contador de no leídos de este canal
        marcarLeido(canal);
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
                // Hay mensajes nuevos y la sala está visible: marcar como leído
                marcarLeido(canalActivo);
            }
            refrescarChatNoLeidos(); // mantiene los badges al día mientras el chat está abierto
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

// POST /chat/leido — resetea el contador de no leídos del canal (lo usa el
// backend para agrupar mensajes en una sola notificación y omitir el push si
// el usuario está viendo la conversación).
async function marcarLeido(canal) {
    if (!canal) return;
    try {
        await apiRequest('/chat/leido', {
            method: 'POST',
            body: JSON.stringify({ canal })
        });
        // Limpia el badge de ese canal al instante (sin esperar el próximo poll)
        if (noLeidos[canal]) {
            noLeidos[canal] = 0;
            aplicarNoLeidos();
        }
    } catch (e) { /* silencioso: solo es un contador */ }
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

// ============================================
// ELIMINAR CONVERSACIÓN: mantener pulsado un círculo
// y arrastrarlo hacia arriba hasta la papelera
// ============================================
function setupDragEliminar() {
    const trash = document.getElementById('chat-trash');
    const veil = document.getElementById('chat-trash-veil');
    const cont = document.getElementById('chat-cluster-convs');
    if (!trash || !veil || !cont) return;

    const UMBRAL = 450;   // ms de pulsación para activar el arrastre
    const MOVER_ANTES = 10; // px de movimiento que cancela la pulsación (es scroll)

    const cluster = cont.closest('.chat-cluster');

    let timer = null;
    let circle = null;     // círculo en modo arrastre
    let activo = false;    // arrastre en curso
    let startX = 0, startY = 0;

    function ocultarTrash() {
        trash.classList.remove('activo', 'hover');
        veil.classList.remove('activo');
    }

    // Termina el arrastre y restaura el círculo a su lugar
    function finArrastre() {
        cont.style.overflow = ''; // restaurar recorte del contenedor
        if (cluster) cluster.style.zIndex = ''; // restaurar nivel de apilado
        if (circle) {
            circle.classList.remove('dragging');
            circle.style.transform = '';
        }
        activo = false;
        circle = null;
        ocultarTrash();
    }

    function cancelar() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (activo) finArrastre();
    }

    function iniciarArrastre(el, x, y) {
        timer = null;
        activo = true;
        circle = el;
        startX = x;
        startY = y;
        el.classList.add('dragging');
        // El círculo NO sale del contenedor (si no, los touchmove dejan de
        // burbujear hasta aquí y el arrastre se congela). En su lugar se
        // habilita el overflow visible para que suba sin recortarse, y se eleva
        // el cluster para que el círculo quede por encima del velo y la papelera.
        cont.style.overflow = 'visible';
        if (cluster) cluster.style.zIndex = '1004';
        trash.classList.add('activo');
        veil.classList.add('activo');
    }

    function mover(x, y) {
        if (!activo || !circle) return;
        circle.style.transform = `translate(${x - startX}px, ${y - startY}px)`;
        const r = trash.getBoundingClientRect();
        const cr = circle.getBoundingClientRect();
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;
        trash.classList.toggle('hover',
            cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom);
    }

    function soltar() {
        if (!activo || !circle) { cancelar(); return; }
        const hover = trash.classList.contains('hover');
        const canal = circle.dataset.canal;
        const el = circle;
        suprimirProximoClick(); // evita que el click posterior abra la sala
        if (hover && canal) {
            el.remove(); // se eliminó la conversación
            finArrastre();
            eliminarConversacion(canal);
        } else {
            finArrastre(); // vuelve a su lugar
        }
    }

    // --- Touch (móvil) ---
    cont.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        const el = e.target.closest('.chat-conv-circle');
        if (!el) return;
        startX = t.clientX;
        startY = t.clientY;
        timer = setTimeout(() => iniciarArrastre(el, startX, startY), UMBRAL);
    }, { passive: true });

    cont.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (activo) {
            e.preventDefault();
            mover(t.clientX, t.clientY);
        } else if (timer &&
            (Math.abs(t.clientX - startX) > MOVER_ANTES || Math.abs(t.clientY - startY) > MOVER_ANTES)) {
            clearTimeout(timer);
            timer = null; // es deslizamiento/scroll, no pulsación
        }
    }, { passive: false });

    cont.addEventListener('touchend', () => {
        if (activo) soltar();
        else if (timer) { clearTimeout(timer); timer = null; }
    }, { passive: true });
    cont.addEventListener('touchcancel', cancelar, { passive: true });

    // --- Mouse (escritorio) ---
    cont.addEventListener('mousedown', (e) => {
        const el = e.target.closest('.chat-conv-circle');
        if (!el) return;
        startX = e.clientX;
        startY = e.clientY;
        timer = setTimeout(() => iniciarArrastre(el, startX, startY), UMBRAL);
    });
    document.addEventListener('mousemove', (e) => {
        if (activo) mover(e.clientX, e.clientY);
        else if (timer &&
            (Math.abs(e.clientX - startX) > MOVER_ANTES || Math.abs(e.clientY - startY) > MOVER_ANTES)) {
            clearTimeout(timer);
            timer = null;
        }
    });
    document.addEventListener('mouseup', () => {
        if (activo) soltar();
        else if (timer) { clearTimeout(timer); timer = null; }
    });
}

// Evita el click que se dispara justo después de un arrastre con soltado
function suprimirProximoClick() {
    const cap = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        document.removeEventListener('click', cap, true);
    };
    document.addEventListener('click', cap, true);
}

async function eliminarConversacion(canal) {
    try {
        const data = await apiRequest('/chat/conversaciones', {
            method: 'DELETE',
            body: JSON.stringify({ canal })
        });
        if (data && data.success) {
            cargarDirectorio(); // refresca los círculos de conversaciones
        } else {
            debugLog.error('eliminar conversación:', data && data.error);
        }
    } catch (e) {
        debugLog.error('eliminar conversación:', e);
    }
}
