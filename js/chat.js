// js/chat.js
// Chat global + privado de Creatio.
// Economía: sin websockets. El cliente hace polling condicional — solo
// mientras el chat está abierto y la pestaña visible — pidiendo
// GET /chat/mensajes?canal=...&afterId=último (respuestas de pocos KB).
import { apiRequest, API_BASE_URL } from './config.js';
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
// TOAST (aviso breve)
// ============================================
function mostrarToast(msg) {
    let t = document.getElementById('chat-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'chat-toast';
        t.className = 'chat-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), 2600);
}

// ============================================
// MENÚS FLOTANTES (mensajes, sala, filas del directorio)
// ============================================
function cerrarMenusFlotantes() {
    if (menuActual) {
        menuActual.menu.remove();
        menuActual.velo.remove();
        menuActual = null;
    }
    const v = document.querySelector('.chat-menu-velo');
    if (v) v.remove();
    const p = document.querySelector('.chat-picker');
    if (p) p.remove();
}

function abrirMenuOpciones(items, x, y) {
    cerrarMenusFlotantes();
    const menu = document.createElement('div');
    menu.className = 'chat-menu';
    items.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-menu-item';
        b.textContent = it.txt;
        b.addEventListener('click', () => { cerrarMenusFlotantes(); it.fn(); });
        menu.appendChild(b);
    });
    const velo = document.createElement('div');
    velo.className = 'chat-menu-velo';
    velo.addEventListener('click', cerrarMenusFlotantes);
    document.body.appendChild(velo);
    document.body.appendChild(menu);
    menuActual = { menu, velo };
    requestAnimationFrame(() => {
        menu.style.left = Math.min(window.innerWidth - menu.offsetWidth - 8, Math.max(8, x)) + 'px';
        menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, Math.max(8, y)) + 'px';
    });
}

// ============================================
// REACCIONES EMOJI
// ============================================
function renderReacciones(div, reacciones, mensajeId) {
    const antiguo = div.querySelector('.chat-msg-reacciones');
    if (antiguo) antiguo.remove();
    const cont = document.createElement('div');
    cont.className = 'chat-msg-reacciones';
    const reac = reacciones || {};
    EMOJIS_REACCION.forEach(e => {
        if (!reac[e]) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chat-reaccion-chip' + (reac[e].mio ? ' mio' : '');
        chip.innerHTML = `${e}<span>${reac[e].n}</span>`;
        chip.addEventListener('click', () => toggleReaccion(mensajeId, e, div));
        cont.appendChild(chip);
    });
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'chat-reaccion-mas';
    mas.textContent = '➕';
    mas.setAttribute('aria-label', 'Reaccionar');
    mas.addEventListener('click', (ev) => { ev.stopPropagation(); abrirPickerReacciones(div, mensajeId); });
    cont.appendChild(mas);
    div.appendChild(cont);
}

async function toggleReaccion(mensajeId, emoji, div) {
    try {
        const data = await apiRequest('/chat/reaccion', {
            method: 'POST',
            body: JSON.stringify({ mensaje_id: mensajeId, emoji })
        });
        if (data && data.success) {
            renderReacciones(div, data.reacciones || {}, mensajeId);
        }
    } catch (e) { debugLog.error('reaccion:', e); }
}

function abrirPickerReacciones(div, mensajeId) {
    cerrarMenusFlotantes();
    const velo = document.createElement('div');
    velo.className = 'chat-menu-velo';
    velo.addEventListener('click', cerrarMenusFlotantes);
    const picker = document.createElement('div');
    picker.className = 'chat-picker';
    EMOJIS_REACCION.forEach(e => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-picker-emoji';
        b.textContent = e;
        b.addEventListener('click', () => { cerrarMenusFlotantes(); toggleReaccion(mensajeId, e, div); });
        picker.appendChild(b);
    });
    document.body.appendChild(velo);
    document.body.appendChild(picker);
    const r = div.getBoundingClientRect();
    requestAnimationFrame(() => {
        picker.style.top = Math.max(8, r.top - picker.offsetHeight - 6) + 'px';
        picker.style.left = Math.min(window.innerWidth - picker.offsetWidth - 8, Math.max(8, r.left)) + 'px';
    });
}

// ============================================
// MENÚ DE ACCIONES DE UN MENSAJE (pulsación larga / clic derecho)
// ============================================
function setupMsgMenu(div, m, esPropio) {
    let timer = null, sx = 0, sy = 0, activado = false;
    const UMBRAL = 450, MOVER = 10;
    function cancelar() { if (timer) { clearTimeout(timer); timer = null; } activado = false; }
    div.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        sx = e.clientX; sy = e.clientY; activado = false;
        timer = setTimeout(() => { activado = true; abrirMenuMensaje(div, m, esPropio, e.clientX, e.clientY); }, UMBRAL);
    });
    div.addEventListener('pointermove', (e) => {
        if (timer && (Math.abs(e.clientX - sx) > MOVER || Math.abs(e.clientY - sy) > MOVER)) cancelar();
    });
    div.addEventListener('pointerup', () => { if (timer && !activado) cancelar(); });
    div.addEventListener('pointerleave', () => { if (timer && !activado) cancelar(); });
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        cancelar();
        abrirMenuMensaje(div, m, esPropio, e.clientX, e.clientY);
    });
    // Evita que el clic posterior a una pulsación larga dispare algo
    div.addEventListener('click', (e) => {
        if (activado) { e.preventDefault(); e.stopPropagation(); activado = false; }
    });
}

function abrirMenuMensaje(div, m, esPropio, x, y) {
    const items = [
        { txt: '❤️ Reaccionar', fn: () => abrirPickerReacciones(div, m.id) },
        { txt: '↩️ Responder', fn: () => iniciarRespuesta(m) }
    ];
    if (esPropio && !m.eliminado && m.tipo_mensaje === 'texto') {
        items.push({ txt: '✏️ Editar', fn: () => editarMensaje(div, m) });
    }
    if (esPropio && !m.eliminado) {
        items.push({ txt: '🗑️ Borrar', fn: () => borrarMensaje(div, m) });
    }
    abrirMenuOpciones(items, x, y);
}

// ============================================
// RESPONDER A UN MENSAJE
// ============================================
function iniciarRespuesta(m) {
    replyTo = {
        id: m.id,
        autor: m.nombre_artista || 'Usuario',
        contenido: m.tipo_mensaje === 'imagen' ? '📷 Imagen' : (m.contenido || ''),
        tipo: m.tipo_mensaje
    };
    const bar = document.getElementById('chat-reply-bar');
    if (bar) {
        bar.classList.remove('hidden');
        const info = document.getElementById('chat-reply-info');
        if (info) info.textContent = `Respondiendo a ${replyTo.autor}: ${replyTo.contenido.slice(0, 60)}`;
    }
    const input = document.getElementById('chat-input');
    if (input) input.focus();
}

function cancelarRespuesta() {
    replyTo = null;
    const bar = document.getElementById('chat-reply-bar');
    if (bar) bar.classList.add('hidden');
}

// ============================================
// EDITAR / BORRAR MENSAJE
// ============================================
function editarMensaje(div, m) {
    const cuerpo = div.querySelector('.chat-msg-texto');
    if (!cuerpo) return;
    const textoActual = cuerpo.textContent;
    const ta = document.createElement('textarea');
    ta.className = 'chat-edit-input';
    ta.value = textoActual;
    ta.maxLength = 1000;
    const guardar = document.createElement('button');
    guardar.type = 'button';
    guardar.className = 'chat-edit-guardar';
    guardar.textContent = '✓';
    const cancelar = document.createElement('button');
    cancelar.type = 'button';
    cancelar.className = 'chat-edit-cancelar';
    cancelar.textContent = '✕';
    cuerpo.replaceWith(ta);
    ta.insertAdjacentElement('afterend', guardar);
    guardar.insertAdjacentElement('afterend', cancelar);
    const restaurar = () => {
        const txt = document.createElement('span');
        txt.className = 'chat-msg-texto';
        txt.textContent = textoActual;
        ta.replaceWith(txt);
        guardar.remove();
        cancelar.remove();
    };
    guardar.addEventListener('click', async () => {
        const nuevo = ta.value.trim();
        if (!nuevo || nuevo === textoActual) { restaurar(); return; }
        try {
            const data = await apiRequest(`/chat/mensajes/${m.id}`, {
                method: 'PUT',
                body: JSON.stringify({ contenido: nuevo })
            });
            if (data && data.success) {
                const txt = document.createElement('span');
                txt.className = 'chat-msg-texto';
                txt.textContent = nuevo;
                ta.replaceWith(txt);
                guardar.remove();
                cancelar.remove();
                if (!div.querySelector('.chat-msg-editado')) {
                    div.insertAdjacentHTML('beforeend', '<span class="chat-msg-editado">(editado)</span>');
                }
            } else {
                mostrarToast((data && data.error) || 'No se pudo editar');
            }
        } catch (e) { debugLog.error('editar:', e); mostrarToast('Error al editar'); }
    });
    cancelar.addEventListener('click', restaurar);
    ta.focus();
}

async function borrarMensaje(div, m) {
    if (!window.confirm('¿Borrar este mensaje?')) return;
    try {
        const data = await apiRequest(`/chat/mensajes/${m.id}`, { method: 'DELETE' });
        if (data && data.success) {
            div.classList.add('eliminado');
            div.querySelectorAll('.chat-msg-texto, .chat-msg-imagen, .chat-msg-reacciones, .chat-msg-editado, .chat-msg-reply').forEach(el => el.remove());
            div.insertAdjacentHTML('beforeend', '<span class="chat-msg-eliminado-texto">🗑️ Mensaje eliminado</span>');
        } else {
            mostrarToast((data && data.error) || 'No se pudo borrar');
        }
    } catch (e) { debugLog.error('borrar:', e); mostrarToast('Error al borrar'); }
}

// ============================================
// INDICADOR "ESCRIBIENDO…"
// ============================================
function setupTypingInput() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.addEventListener('input', () => {
        const ahora = Date.now();
        if (!input.value.trim()) return;
        if (ahora - ultimoTypingEnvio < 2500) return;
        ultimoTypingEnvio = ahora;
        apiRequest('/chat/typing', { method: 'POST', body: JSON.stringify({ canal: canalActivo }) }).catch(() => {});
    });
}

function mostrarTyping(ids) {
    const el = document.getElementById('chat-typing');
    if (!el) return;
    if (!ids || !ids.length || !canalActivo) { el.classList.add('hidden'); return; }
    let texto = null;
    if (!canalEsPriv) {
        texto = 'Alguien está escribiendo…';
    } else if (canalOtroId && ids.includes(canalOtroId)) {
        texto = `${canalOtroNombre || 'Alguien'} está escribiendo…`;
    }
    if (texto === null) { el.classList.add('hidden'); return; }
    el.textContent = texto;
    el.classList.remove('hidden');
}

// ============================================
// VISTO / RECIBIDO (✓✓)
// ============================================
function actualizarTicksLeidos(hasta) {
    leidoHastaLocal = hasta || 0;
    document.querySelectorAll('#chat-mensajes .chat-msg.own[data-id]').forEach(el => {
        const id = parseInt(el.dataset.id, 10);
        const t = el.querySelector('.chat-msg-leido');
        if (t && id > 0) t.textContent = id <= leidoHastaLocal ? '✓✓' : '✓';
    });
}

// ============================================
// ENVIAR IMAGEN
// ============================================
function setupImagenBtn() {
    const btn = document.getElementById('chat-imagen-btn');
    const fileInput = document.getElementById('chat-imagen-input');
    if (!btn || !fileInput) return;
    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file || !canalActivo) return;
        if (file.size > 8 * 1024 * 1024) {
            mostrarToast('La imagen es demasiado grande (máx. 8 MB)');
            return;
        }
        const caption = document.getElementById('chat-input').value.trim();
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
            const fd = new FormData();
            fd.append('imagen', file);
            const res = await fetch(`${API_BASE_URL_CHAT}/chat/imagen`, { method: 'POST', credentials: 'include', body: fd });
            let data = null;
            try { data = await res.json(); } catch (e) { /* no JSON */ }
            if (data && data.success && data.url) {
                document.getElementById('chat-input').value = '';
                const envio = await apiRequest('/chat/mensajes', {
                    method: 'POST',
                    body: JSON.stringify({
                        canal: canalActivo,
                        tipo_mensaje: 'imagen',
                        imagen_url: data.url,
                        contenido: caption,
                        responde_a: replyTo ? replyTo.id : null
                    })
                });
                if (envio && envio.success && envio.mensaje) {
                    appendMensaje(envio.mensaje, true);
                    scrollMensajes();
                    cancelarRespuesta();
                } else {
                    mostrarToast((envio && envio.error) || 'No se pudo enviar la imagen');
                }
            } else {
                mostrarToast((data && data.error) || 'Error al subir la imagen');
            }
        } catch (e) {
            debugLog.error('subir imagen:', e);
            mostrarToast('Error de conexión al subir la imagen');
        } finally {
            btn.disabled = false;
            btn.textContent = '🖼️';
        }
    });
}

// ============================================
// BLOQUEAR / DENUNCIAR USUARIO
// ============================================
function setupSalaMenu() {
    const btn = document.getElementById('chat-sala-menu-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canalEsPriv || !canalOtroId) return;
        const r = btn.getBoundingClientRect();
        abrirMenuOpciones([
            { txt: '🚫 Bloquear usuario', fn: () => bloquearUsuario(canalOtroId, canalOtroNombre) },
            { txt: '⚠️ Denunciar usuario', fn: () => denunciarUsuario(canalOtroId, canalOtroNombre) }
        ], r.left, r.bottom + 4);
    });
}

async function bloquearUsuario(uid, nombre) {
    if (!window.confirm(`¿Bloquear a ${nombre}? No podrán enviarse mensajes en ninguna dirección.`)) return;
    try {
        const data = await apiRequest('/chat/bloquear', { method: 'POST', body: JSON.stringify({ usuario_id: uid }) });
        mostrarToast(data && data.success ? '🚫 Usuario bloqueado' : ((data && data.error) || 'Error al bloquear'));
    } catch (e) { mostrarToast('Error al bloquear'); }
}

async function denunciarUsuario(uid, nombre) {
    const motivo = window.prompt(`Motivo de la denuncia a ${nombre}:`, '');
    if (motivo === null) return;
    const texto = motivo.trim();
    if (!texto) { mostrarToast('Motivo requerido'); return; }
    try {
        const data = await apiRequest('/chat/denunciar', {
            method: 'POST',
            body: JSON.stringify({ usuario_id: uid, motivo: texto.slice(0, 300) })
        });
        mostrarToast(data && data.success ? '⚠️ Denuncia enviada. ¡Gracias!' : ((data && data.error) || 'Error al denunciar'));
    } catch (e) { mostrarToast('Error al denunciar'); }
}

// Menú de bloqueo/denuncia en las filas del directorio (pulsación larga)
function setupUsuarioRowMenu(row, u) {
    let timer = null, sx = 0, sy = 0, activado = false;
    const UMBRAL = 450, MOVER = 10;
    function cancelar() { if (timer) { clearTimeout(timer); timer = null; } activado = false; }
    row.addEventListener('pointerdown', (e) => {
        sx = e.clientX; sy = e.clientY; activado = false;
        timer = setTimeout(() => {
            activado = true;
            abrirMenuOpciones([
                { txt: '💬 Abrir chat', fn: () => abrirPrivado(u) },
                { txt: '🚫 Bloquear', fn: () => bloquearUsuario(u.id, u.nombre_artista) },
                { txt: '⚠️ Denunciar', fn: () => denunciarUsuario(u.id, u.nombre_artista) }
            ], e.clientX, e.clientY);
        }, UMBRAL);
    });
    row.addEventListener('pointermove', (e) => {
        if (timer && (Math.abs(e.clientX - sx) > MOVER || Math.abs(e.clientY - sy) > MOVER)) cancelar();
    });
    row.addEventListener('pointerup', () => { if (timer && !activado) cancelar(); });
    row.addEventListener('pointerleave', () => { if (timer && !activado) cancelar(); });
    row.addEventListener('click', (e) => {
        if (activado) { e.stopImmediatePropagation(); e.preventDefault(); activado = false; }
    }, true); // capture: corre antes que el clic de abrir el chat
}

// ============================================
// BUSCADOR DE ARTISTAS EN EL DIRECTORIO
// ============================================
function setupBuscador() {
    const cont = document.getElementById('chat-accordion');
    if (!cont) return;
    if (cont.querySelector('.chat-buscador')) return;
    const box = document.createElement('div');
    box.className = 'chat-buscador';
    box.innerHTML = '<input type="search" id="chat-buscar" class="chat-buscar" placeholder="🔍 Buscar artista…" autocomplete="off" aria-label="Buscar artista">';
    cont.insertBefore(box, cont.firstChild);
    const input = box.querySelector('input');
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        const carrusel = cont.querySelector('.chat-pueblos-carrusel');
        const info = cont.querySelector('.chat-pueblo-info');
        const panel = document.getElementById('chat-pueblo-panel');
        if (q.length < 2) {
            if (carrusel) carrusel.style.display = '';
            if (info) info.style.display = '';
            if (panel) {
                if (ultimoPuebloSeleccionado && ultimosPueblos[ultimoPuebloSeleccionado]) renderUsuariosPueblo(ultimoPuebloSeleccionado);
                else panel.innerHTML = '<div class="chat-pueblo-vacio">Desliza para elegir un municipio</div>';
            }
            return;
        }
        if (carrusel) carrusel.style.display = 'none';
        if (info) info.style.display = 'none';
        const resultados = [];
        Object.entries(ultimosPueblos).forEach(([ciudad, users]) => {
            (users || []).forEach(u => {
                const nom = (u.nombre_artista || '').toLowerCase();
                if (nom.includes(q)) resultados.push(Object.assign({}, u, { ciudad }));
            });
        });
        if (!panel) return;
        panel.innerHTML = `<div class="chat-buscar-titulo">Resultados (${resultados.length})</div>`;
        const lista = document.createElement('div');
        lista.className = 'chat-pueblo-usuarios';
        if (resultados.length) {
            resultados.slice(0, 30).forEach(u => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'chat-user-row';
                row.innerHTML = estadoUsuarioHTML(u);
                row.addEventListener('click', () => abrirPrivado(u));
                setupUsuarioRowMenu(row, u);
                lista.appendChild(row);
            });
        } else {
            lista.innerHTML = '<div class="chat-pueblo-vacio">Sin resultados</div>';
        }
        panel.appendChild(lista);
    });
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
    setupImagenBtn();
    setupTypingInput();
    setupSalaMenu();
    const replyCancel = document.getElementById('chat-reply-cancel');
    if (replyCancel) replyCancel.addEventListener('click', cancelarRespuesta);

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
    cancelarRespuesta();
    const typ = document.getElementById('chat-typing');
    if (typ) typ.classList.add('hidden');
    cerrarMenusFlotantes();
    document.getElementById('chat-sala').classList.add('hidden');
    document.getElementById('chat-directorio').classList.remove('hidden');
    setFabVisible(true); // de vuelta al directorio
    cargarDirectorio(); // refresca conversaciones recientes
}

let noLeidos = {}; // canal -> nº de mensajes sin leer (viene de GET /chat/no-leidos)
let ultimosPueblos = {}; // último directorio recibido (para volver al grid desde un pueblo)

// ---- Estado de las funciones nuevas ----
let replyTo = null;           // mensaje que se está respondiendo {id, autor, contenido, tipo}
let leidoHastaLocal = 0;      // hasta qué id leyó el otro participante (priv) → ✓✓
let canalEsPriv = false;
let canalOtroId = null;
let canalOtroNombre = '';
let ultimoTypingEnvio = 0;    // throttle del POST /chat/typing
let menuActual = null;        // {menu, velo} del menú flotante abierto
let toastTimer = null;

const EMOJIS_REACCION = ['❤️', '👍', '😂', '😮', '🎉', '😢', '🔥'];
const API_BASE_URL_CHAT = API_BASE_URL || '';

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

    // Buscador de artistas (encima del carrusel)
    setupBuscador();

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
            setupUsuarioRowMenu(row, u);
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

    // Estado del canal privado (para ✓✓, typing y el menú ⋯)
    canalEsPriv = canal !== 'global';
    canalOtroId = canalEsPriv ? otroDeCanal(canal) : null;
    canalOtroNombre = canalEsPriv ? titulo : '';
    leidoHastaLocal = 0;
    cancelarRespuesta();
    const menuBtn = document.getElementById('chat-sala-menu-btn');
    if (menuBtn) menuBtn.style.display = canalEsPriv ? '' : 'none';

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
        if (data && data.leido_hasta != null) leidoHastaLocal = data.leido_hasta;
        if (data && data.escribiendo) mostrarTyping(data.escribiendo);
        iniciarPoll();
        // La sala está visible: resetea el contador de no leídos de este canal
        marcarLeido(canal);
    } catch (e) {
        debugLog.error('cargar mensajes:', e);
        cont.innerHTML = '<div class="chat-sin-mensajes">Error de conexión.</div>';
    }
}

// Id del otro participante en un canal privado
function otroDeCanal(canal) {
    if (!canal || canal === 'global') return null;
    const nums = canal.replace('priv:', '').split(':').map(Number);
    const me = miId();
    return nums.find(n => n !== me) || null;
}

function appendMensaje(m, esPropio) {
    const cont = document.getElementById('chat-mensajes');
    if (!cont) return;
    const vacio = cont.querySelector('.chat-sin-mensajes');
    if (vacio) vacio.remove();

    const div = document.createElement('div');
    div.className = 'chat-msg ' + (esPropio ? 'own' : 'other') + (m.eliminado ? ' eliminado' : '');
    div.dataset.id = m.id;
    if (esPropio) div.dataset.own = '1';

    let html = '';
    if (!esPropio) {
        html += `<div class="chat-msg-autor">${escapeHtml(m.nombre_artista || 'Usuario')}</div>`;
    }
    // Cita de respuesta
    if (m.responde) {
        const textoResp = m.responde.tipo === 'imagen' ? '📷 Imagen' : (m.responde.contenido || '');
        html += `<div class="chat-msg-reply"><span class="chat-msg-reply-autor">${escapeHtml(m.responde.autor)}</span><span class="chat-msg-reply-texto">${escapeHtml(textoResp)}</span></div>`;
    }
    // Cuerpo
    if (m.eliminado) {
        html += '<span class="chat-msg-eliminado-texto">🗑️ Mensaje eliminado</span>';
    } else if (m.tipo_mensaje === 'imagen' && m.imagen_url) {
        html += `<img class="chat-msg-imagen" src="${m.imagen_url}" alt="Imagen" loading="lazy">`;
        if (m.contenido) html += `<div class="chat-msg-texto">${escapeHtml(m.contenido)}</div>`;
    } else {
        html += `<span class="chat-msg-texto">${escapeHtml(m.contenido || '')}</span>`;
    }
    if (m.editado && !m.eliminado) html += '<span class="chat-msg-editado">(editado)</span>';
    // Pie: hora + visto
    let pie = `<span class="chat-msg-tiempo">${formatHora(m.created_at)}</span>`;
    if (esPropio && canalEsPriv) {
        const leido = (m.leido !== null && m.leido !== undefined) ? m.leido : false;
        pie += `<span class="chat-msg-leido">${leido ? '✓✓' : '✓'}</span>`;
    }
    html += `<span class="chat-msg-pie">${pie}</span>`;
    div.innerHTML = html;
    cont.appendChild(div);

    renderReacciones(div, m.reacciones || {}, m.id);
    setupMsgMenu(div, m, esPropio);
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
            if (data && data.success) {
                if (data.mensajes && data.mensajes.length) {
                    data.mensajes.forEach(m => {
                        if (m.id > lastId) appendMensaje(m, m.autor_id === miId());
                    });
                    scrollMensajes();
                    // Hay mensajes nuevos y la sala está visible: marcar como leído
                    marcarLeido(canalActivo);
                }
                // "Escribiendo…" y ticks de leído en tiempo real
                if (data.escribiendo) mostrarTyping(data.escribiendo);
                if (data.leido_hasta != null) actualizarTicksLeidos(data.leido_hasta);
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
            body: JSON.stringify({ canal: canalActivo, contenido: texto, responde_a: replyTo ? replyTo.id : null })
        });
        if (data && data.success && data.mensaje) {
            appendMensaje(data.mensaje, true);
            scrollMensajes();
            cancelarRespuesta();
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
