// js/chat.js
// Chat global + privado de Creatio.
// Economía: sin websockets. El cliente hace polling condicional — solo
// mientras el chat está abierto y la pestaña visible — pidiendo
// GET /chat/mensajes?canal=...&afterId=último (respuestas de pocos KB).
import { apiRequest, API_BASE_URL, getAuthToken } from './config.js?v=25d77e47b8';
import { artistaActual } from './auth.js?v=056fec7bdd';
import { escapeHtml, debugLog, renderText, safeImgUrl } from './utils.js?v=f1ecb334f1';
import { encontrarSeccionActual, actualizarEstadoNavButtons, actualizarVisibilidadIconosHeader, actualizarModoFlecha } from './galeria-ui.js?v=ebf445b73d';

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

// "Activo hace X" → Xmin / Xh / Xd (redondeado, ejemplo: 1min, 5min, 1h, 2d)
function tiempoActivoHace(ultimaActividad) {
    if (!ultimaActividad) return '';
    const t = new Date(ultimaActividad).getTime();
    if (isNaN(t)) return '';
    const seg = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (seg < 60) return '1min';
    const min = Math.floor(seg / 60);
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
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
        b.innerHTML = `${it.icon ? `<span class="chat-menu-item-icon">${it.icon}</span>` : ''}<span class="chat-menu-item-txt">${it.txt}</span>`;
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
    if (cont.childNodes.length) div.appendChild(cont);
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

function abrirPickerReacciones(div, m, esPropio) {
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
        b.addEventListener('click', () => { cerrarMenusFlotantes(); toggleReaccion(m.id, e, div); });
        picker.appendChild(b);
    });
    // Más acciones (responder/editar/borrar) desde el propio picker
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'chat-picker-mas';
    mas.textContent = '⋯';
    mas.setAttribute('aria-label', 'Más opciones');
    mas.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const r = picker.getBoundingClientRect();
        cerrarMenusFlotantes();
        abrirMenuMensaje(div, m, esPropio, r.left, r.bottom + 4);
    });
    picker.appendChild(mas);
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
        timer = setTimeout(() => { activado = true; abrirPickerReacciones(div, m, esPropio); }, UMBRAL);
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
        { icon: ICONOS.corazon, txt: 'Reaccionar', fn: () => abrirPickerReacciones(div, m, esPropio) },
        { icon: ICONOS.responder, txt: 'Responder', fn: () => iniciarRespuesta(m) }
    ];
    if (esPropio && !m.eliminado && m.tipo_mensaje === 'texto') {
        items.push({ icon: ICONOS.editar, txt: 'Editar', fn: () => editarMensaje(div, m) });
    }
    if (esPropio && !m.eliminado) {
        items.push({ icon: ICONOS.borrar, txt: 'Borrar', fn: () => borrarMensaje(div, m) });
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
// VISTO / RECIBIDO (✓ enviado · ✓✓ entregado · ✓✓ azul visto)
// ============================================
function actualizarTicksLeidos(hasta, entregadoHasta) {
    leidoHastaLocal = hasta || 0;
    entregadoHastaLocal = entregadoHasta || 0;
    document.querySelectorAll('#chat-mensajes .chat-msg.own[data-id]').forEach(el => {
        const id = parseInt(el.dataset.id, 10);
        const t = el.querySelector('.chat-msg-leido');
        if (!t || id <= 0) return;
        if (id <= leidoHastaLocal) { t.className = 'chat-msg-leido visto'; t.textContent = '✓✓'; }
        else if (id <= entregadoHastaLocal) { t.className = 'chat-msg-leido entregado'; t.textContent = '✓✓'; }
        else { t.className = 'chat-msg-leido enviado'; t.textContent = '✓'; }
    });
}

// ============================================
// ENVIAR IMAGEN (con compresión en el teléfono)
// ============================================
// Redimensiona a máx 1200px y re-comprime a JPEG calidad 0.8: una foto de
// cámara (3-5 MB) pasa a ~200-400 KB, ~90% menos datos móviles.
function comprimirImagen(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const MAX = 1200;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (w > MAX || h > MAX) {
                const escala = Math.min(MAX / w, MAX / h);
                w = Math.round(w * escala);
                h = Math.round(h * escala);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => {
                if (blob && blob.size > 0) resolve(blob);
                else reject(new Error('no se pudo comprimir'));
            }, 'image/jpeg', 0.8);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen ilegible')); };
        img.src = url;
    });
}

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
            // Compresión en el teléfono; si falla, se sube el original
            let aEnviar = file;
            try {
                aEnviar = await comprimirImagen(file);
            } catch (e) { debugLog.warn('comprimir imagen:', e); }
            const fd = new FormData();
            fd.append('imagen', aEnviar, aEnviar === file ? file.name : 'imagen.jpg');
            const authToken = getAuthToken();
            const res = await fetch(`${API_BASE_URL_CHAT}/chat/imagen`, {
                method: 'POST',
                credentials: 'include',
                headers: authToken ? { Authorization: 'Bearer ' + authToken } : {},
                body: fd
            });
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
                    envio.mensaje.entregado = true; // entregado al servidor → ✓✓ instantáneo
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
            btn.innerHTML = ICONOS.imagen;
        }
    });
}

// ============================================
// SYNC DE ENTREGA EN SEGUNDO PLANO (✓✓ gris)
// ============================================
// La app abierta marca como ENTREGADOS los mensajes de todas sus
// conversaciones: el remitente ve ✓✓ gris aunque el otro aún no abra la sala.
async function syncChatEntregas() {
    try {
        await apiRequest('/chat/sync', { method: 'POST', body: '{}' });
    } catch (e) { /* silencioso: solo es un marcador */ }
}
window.syncChatEntregas = syncChatEntregas;

// ============================================
// BLOQUEAR / DESBLOQUEAR / DENUNCIAR USUARIO
// ============================================
async function cargarBloqueados() {
    try {
        const data = await apiRequest('/chat/bloqueos');
        bloqueadosSet = new Set((data && data.bloqueados) || []);
    } catch (e) { /* silencioso */ }
}

async function estaBloqueado(uid) {
    if (bloqueadosSet.size === 0) await cargarBloqueados();
    return bloqueadosSet.has(uid);
}

function setupSalaMenu() {
    const btn = document.getElementById('chat-sala-menu-btn');
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!canalEsPriv || !canalOtroId) return;
        const r = btn.getBoundingClientRect();
        const bloqueado = await estaBloqueado(canalOtroId);
        const items = [];
        if (bloqueado) {
            items.push({ icon: ICONOS.desbloquear, txt: 'Desbloquear usuario', fn: () => desbloquearUsuario(canalOtroId, canalOtroNombre) });
        } else {
            items.push({ icon: ICONOS.bloquear, txt: 'Bloquear usuario', fn: () => bloquearUsuario(canalOtroId, canalOtroNombre) });
        }
        items.push({ icon: ICONOS.denunciar, txt: 'Denunciar usuario', fn: () => denunciarUsuario(canalOtroId, canalOtroNombre) });
        abrirMenuOpciones(items, r.left, r.bottom + 4);
    });
}

async function bloquearUsuario(uid, nombre) {
    if (!window.confirm(`¿Bloquear a ${nombre}? No podrán enviarse mensajes en ninguna dirección.`)) return;
    try {
        const data = await apiRequest('/chat/bloquear', { method: 'POST', body: JSON.stringify({ usuario_id: uid }) });
        if (data && data.success) {
            bloqueadosSet.add(uid);
            mostrarToast('🚫 Usuario bloqueado');
        } else {
            mostrarToast((data && data.error) || 'Error al bloquear');
        }
    } catch (e) { mostrarToast('Error al bloquear'); }
}

async function desbloquearUsuario(uid, nombre) {
    if (!window.confirm(`¿Desbloquear a ${nombre}? Podrán volver a enviarse mensajes.`)) return;
    try {
        const data = await apiRequest('/chat/bloquear', { method: 'DELETE', body: JSON.stringify({ usuario_id: uid }) });
        if (data && data.success) {
            bloqueadosSet.delete(uid);
            mostrarToast('✅ Usuario desbloqueado');
        } else {
            mostrarToast((data && data.error) || 'Error al desbloquear');
        }
    } catch (e) { mostrarToast('Error al desbloquear'); }
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

// Menú de bloqueo/desbloqueo/denuncia en las filas del directorio (pulsación larga)
function setupUsuarioRowMenu(row, u) {
    let timer = null, sx = 0, sy = 0, activado = false;
    const UMBRAL = 450, MOVER = 10;
    function cancelar() { if (timer) { clearTimeout(timer); timer = null; } activado = false; }
    row.addEventListener('pointerdown', (e) => {
        sx = e.clientX; sy = e.clientY; activado = false;
        timer = setTimeout(async () => {
            activado = true;
            const bloqueado = await estaBloqueado(u.id);
            const items = [
                { icon: ICONOS.chat, txt: 'Abrir chat', fn: () => abrirPrivado(u) }
            ];
            if (bloqueado) {
                items.push({ icon: ICONOS.desbloquear, txt: 'Desbloquear', fn: () => desbloquearUsuario(u.id, u.nombre_artista) });
            } else {
                items.push({ icon: ICONOS.bloquear, txt: 'Bloquear', fn: () => bloquearUsuario(u.id, u.nombre_artista) });
            }
            items.push({ icon: ICONOS.denunciar, txt: 'Denunciar', fn: () => denunciarUsuario(u.id, u.nombre_artista) });
            abrirMenuOpciones(items, e.clientX, e.clientY);
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
// TECLADO: fija el header y ajusta la altura del chat al abrirse el teclado.
// (El viewport meta interactive-widget no siempre lo resuelve en WebViews
//  antiguas; visualViewport sí mide la altura visible real.)
// ============================================
function setupKeyboardHandling() {
    if (!window.visualViewport) return;
    const chat = document.getElementById('chat-global');
    const header = document.getElementById('main-header');
    let ultimaAltura = -1;
    const ajustar = () => {
        const vv = window.visualViewport;
        if (!vv || !vv.height) return;
        const keyboardOpen = vv.height < window.innerHeight * 0.85;
        document.body.classList.toggle('teclado-abierto', keyboardOpen);
        if (chat) {
            if (keyboardOpen) {
                const headerH = header ? header.offsetHeight : (50 + 24);
                const nueva = Math.max(200, vv.height - headerH);
                if (Math.abs(nueva - ultimaAltura) > 6) {
                    if (ultimaAltura === -1) {
                        // Primera vez: la altura salta al instante (sin hueco) pero
                        // el formulario se desliza hacia arriba a la misma velocidad
                        // del teclado usando transform (no afecta el layout).
                        const form = document.querySelector('.chat-form');
                        const vieja = chat.offsetHeight;
                        const gap = Math.max(0, vieja - nueva);
                        chat.style.height = nueva + 'px';
                        if (form && gap > 0) {
                            form.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
                            form.style.transform = `translateY(${gap}px)`;
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => { form.style.transform = 'translateY(0)'; });
                            });
                        }
                    } else {
                        chat.style.height = nueva + 'px';
                    }
                    ultimaAltura = nueva;
                }
            } else {
                chat.style.height = '';
                ultimaAltura = -1;
                const form = document.querySelector('.chat-form');
                if (form) { form.style.transform = ''; form.style.transition = ''; }
            }
        }
    };
    window.visualViewport.addEventListener('resize', ajustar);
    window.visualViewport.addEventListener('scroll', ajustar);
    ajustar();
}

// ============================================
// APERTURA / CIERRE DEL PANEL
// ============================================
export function setupChat() {
    const btn = document.getElementById('btn-chat-global');
    const seccion = document.getElementById('chat-global');
    if (!btn || !seccion) return;

    btn.addEventListener('click', () => {
        // Siempre abre/refresca el chat (directorio), como hace la lupa con
        // Explorar: nunca oculta la sección al re-presionar el icono.
        abrirChat();
    });
    // FAB: acceso directo a la sala "Chat Global" (abre el panel si está cerrado)
    const fab = document.getElementById('btn-chat-global-fab');
    if (fab) fab.addEventListener('click', abrirChatGlobal);
    const cerrarBtn = document.getElementById('chat-cerrar');
    if (cerrarBtn) cerrarBtn.addEventListener('click', cerrarChat);
    document.getElementById('chat-form').addEventListener('submit', enviarMensaje);
    setupDragEliminar();
    setupImagenBtn();
    setupTypingInput();
    setupSalaMenu();
    const replyCancel = document.getElementById('chat-reply-cancel');
    if (replyCancel) replyCancel.addEventListener('click', cancelarRespuesta);
    setupKeyboardHandling();

    // Icono de conversaciones del header: abre la lista, o "vuelve atrás" si ya
    // estamos en la lista o en una sala (el icono se convierte en flecha).
    const convBtn = document.getElementById('btn-conversaciones');
    if (convBtn) convBtn.addEventListener('click', () => {
        const salaVisible = !document.getElementById('chat-sala').classList.contains('hidden');
        const listaVisible = !document.getElementById('chat-conversaciones').classList.contains('hidden');
        if (!salaVisible && !listaVisible) {
            abrirConversaciones();
            return;
        }
        if (salaVisible) {
            if (vistaAnterior === 'conversaciones') volverALaLista();
            else volverDirectorio();
        } else {
            volverDeConversaciones();
        }
    });
    // Salas con candado (Jurado 1 / Jurado 2): cerradas por ahora
    document.querySelectorAll('.chat-sala-fab.cerrada').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.chat-sala-wrap');
            const sala = wrap ? wrap.dataset.sala : '';
            mostrarToast(sala === 'jurado1'
                ? 'Sala de Jurado 1: próximamente'
                : 'Sala de Jurado 2: próximamente');
        });
    });

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
    actualizarVisibilidadIconosHeader(seccion); // el chat no pasa por mostrarSeccion
    // Siempre arranca en el directorio (sala y conversaciones cerradas)
    document.getElementById('chat-sala').classList.add('hidden');
    document.getElementById('chat-conversaciones').classList.add('hidden');
    document.getElementById('chat-directorio').classList.remove('hidden');
    actualizarFlechaConversaciones(false); // en el directorio el icono es el original
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
    actualizarVisibilidadIconosHeader(null); // sin sección visible → iconos ocultos
    chatAbierto = false;
    detenerPoll();
    canalActivo = null;
    window._canalChatActivo = null;
    actualizarFlechaConversaciones(false);
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
    document.getElementById('chat-conversaciones').classList.add('hidden');
    document.getElementById('chat-directorio').classList.remove('hidden');
    actualizarFlechaConversaciones(false);
    setFabVisible(true); // de vuelta al directorio
    cargarDirectorio(); // refresca conversaciones recientes
}

// Abre la lista de conversaciones privadas (icono del header, sección Chat).
function abrirConversaciones() {
    if (!artistaActual) {
        window.location.href = 'auth.html';
        return;
    }
    const seccion = document.getElementById('chat-global');
    if (seccion && seccion.classList.contains('hidden')) abrirChat();
    detenerPoll();
    canalActivo = null;
    window._canalChatActivo = null;
    cancelarRespuesta();
    cerrarMenusFlotantes();
    const typ = document.getElementById('chat-typing');
    if (typ) typ.classList.add('hidden');
    document.getElementById('chat-sala').classList.add('hidden');
    document.getElementById('chat-directorio').classList.add('hidden');
    document.getElementById('chat-conversaciones').classList.remove('hidden');
    actualizarFlechaConversaciones(true); // el icono pasa a flecha de volver
    refrescarConversaciones(); // lista fresca de chats privados
    setFabVisible(false); // las salas (Global/Jurado) solo se muestran en el directorio
}

// Vuelve a la lista de conversaciones (desde una sala abierta desde ahí).
function volverALaLista() {
    detenerPoll();
    canalActivo = null;
    window._canalChatActivo = null;
    cancelarRespuesta();
    cerrarMenusFlotantes();
    const typ = document.getElementById('chat-typing');
    if (typ) typ.classList.add('hidden');
    document.getElementById('chat-sala').classList.add('hidden');
    document.getElementById('chat-directorio').classList.add('hidden');
    document.getElementById('chat-conversaciones').classList.remove('hidden');
    actualizarFlechaConversaciones(true); // seguimos en la lista → flecha
    setFabVisible(false); // las salas solo se muestran en el directorio
}

// Vuelve del listado de conversaciones al directorio.
function volverDeConversaciones() {
    detenerPoll();
    canalActivo = null;
    window._canalChatActivo = null;
    document.getElementById('chat-conversaciones').classList.add('hidden');
    document.getElementById('chat-directorio').classList.remove('hidden');
    actualizarFlechaConversaciones(false);
    setFabVisible(true); // las salas vuelven a mostrarse en el directorio
    cargarDirectorio();
}

// GET /chat/conversaciones → renderiza la lista (el cluster ya no se toca).
async function refrescarConversaciones() {
    const cont = document.getElementById('chat-conversaciones-lista');
    if (!cont) return;
    try {
        const convRes = await apiRequest('/chat/conversaciones');
        renderConversaciones(convRes && convRes.success ? convRes.conversaciones : []);
    } catch (e) {
        debugLog.error('conversaciones:', e);
        cont.innerHTML = '<div class="chat-conv-vacio">No se pudieron cargar las conversaciones.</div>';
    }
}

let noLeidos = {}; // canal -> nº de mensajes sin leer (viene de GET /chat/no-leidos)
let vistaAnterior = 'directorio'; // vista previa a una sala: 'directorio' | 'conversaciones'

// La flecha del icono de conversaciones: original (bocadillos) en el directorio,
// flecha de volver en la lista de conversaciones y en las salas.
function actualizarFlechaConversaciones(esFlecha) {
    actualizarModoFlecha(document.getElementById('btn-conversaciones'), !!esFlecha, 'Conversaciones', 'Volver');
}
let ultimosPueblos = {}; // último directorio recibido (para volver al grid desde un pueblo)

// ---- Estado de las funciones nuevas ----
let replyTo = null;           // mensaje que se está respondiendo {id, autor, contenido, tipo}
let leidoHastaLocal = 0;      // hasta qué id leyó el otro participante (priv) → ✓✓ visto
let entregadoHastaLocal = 0;  // hasta qué id recibió el otro (priv) → ✓✓ entregado
let canalEsPriv = false;
let canalOtroId = null;
let canalOtroNombre = '';
let canalOtroActividad = null; // ultima_actividad del otro (para presencia en el header)
let bloqueadosSet = new Set(); // IDs de usuarios bloqueados por el usuario actual
let ultimoTypingEnvio = 0;    // throttle del POST /chat/typing
let menuActual = null;        // {menu, velo} del menú flotante abierto
let toastTimer = null;

const EMOJIS_REACCION = ['❤️', '👍', '😂', '😮', '🎉', '😢', '🔥'];
const API_BASE_URL_CHAT = API_BASE_URL || '';

// Iconos minimalistas (SVG feather, 18px)
const ICONOS = {
    imagen: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    corazon: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
    responder: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>',
    editar: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>',
    borrar: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
    bloquear: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>',
    desbloquear: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>',
    denunciar: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    chat: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>'
};

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

    document.querySelectorAll('.chat-conv-item').forEach(item => {
        const badge = item.querySelector('.chat-conv-item-badge');
        if (!badge) return;
        const n = noLeidos[item.dataset.canal] || 0;
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
        cargarBloqueados(); // en paralelo, no bloquea
        renderAcordeon(dirRes && dirRes.success ? dirRes.pueblos : {});
        renderConversaciones(convRes && convRes.success ? convRes.conversaciones : []);
    } catch (e) {
        debugLog.error('directorio chat:', e);
        cont.innerHTML = '<div class="chat-sin-mensajes">No se pudo cargar el directorio.</div>';
    }
}

// ACORDEÓN DE PUEBLOS: lista vertical de municipios con bandera; al tocar uno
// se despliega (tipo acordeón) la lista de sus usuarios.
function renderAcordeon(pueblos) {
    ultimosPueblos = pueblos || {};
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
        const activos = users.filter(esOnline).length;
        header.innerHTML = `${banderaHTML}<span class="chat-pueblo-nombre">${escapeHtml(ciudad)}</span>` +
            `<span class="chat-pueblo-counts">` +
            `<span class="chat-pueblo-count act${activos >= 1 ? ' ok' : ''}">${activos} Activos</span>` +
            `<span class="chat-pueblo-count tot${users.length >= 1 ? ' ok' : ''}">${users.length} Artistas</span>` +
            `</span><span class="chat-pueblo-chevron">▼</span>`;
        header.addEventListener('click', () => toggleAcordeon(item));

        const cuerpo = document.createElement('div');
        cuerpo.className = 'chat-pueblo-cuerpo';
        const contenido = document.createElement('div');
        contenido.className = 'chat-pueblo-cuerpo-contenido';
        if (users.length) {
            users.forEach(u => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'chat-user-row';
                row.innerHTML = estadoUsuarioHTML(u);
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    abrirPrivado(u);
                });
                contenido.appendChild(row);
            });
        } else {
            contenido.innerHTML = '<div class="chat-pueblo-vacio">Sin usuarios registrados aún</div>';
        }
        cuerpo.appendChild(contenido);

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

// Las conversaciones ya NO se muestran como círculos en el cluster: se listan
// en la vista "Conversaciones" (se abre desde el icono del header, visible solo
// en la sección Chat). La más reciente queda arriba.
function renderConversaciones(convs) {
    const cont = document.getElementById('chat-conversaciones-lista');
    if (!cont) return;
    cont.innerHTML = '';
    if (!convs || !convs.length) {
        cont.innerHTML = '<div class="chat-conv-vacio">Aún no tienes conversaciones. Inicia un chat desde el directorio.</div>';
        aplicarNoLeidos();
        return;
    }
    const ordenadas = [...convs].sort((a, b) =>
        new Date((b.ultimo && b.ultimo.created_at) || 0) - new Date((a.ultimo && a.ultimo.created_at) || 0)
    ); // la más reciente arriba
    const frag = document.createDocumentFragment();
    ordenadas.forEach(c => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'chat-conv-item';
        item.dataset.canal = c.canal;
        item.setAttribute('aria-label', `Chat con ${c.otro_nombre}`);
        const inicial = (c.otro_nombre || '?').charAt(0).toUpperCase();
        const online = esOnline(c);
        const avatar = c.otro_foto
            ? `<img src="${safeImgUrl(c.otro_foto)}" alt="">`
            : `<span class="chat-conv-item-inicial">${inicial}</span>`;
        const preview = c.ultimo && c.ultimo.contenido
            ? escapeHtml(c.ultimo.contenido)
            : 'Sin mensajes todavía';
        const hora = c.ultimo && c.ultimo.created_at ? formatHora(c.ultimo.created_at) : '';
        item.innerHTML =
            `<span class="chat-conv-item-avatar">${avatar}<span class="chat-conv-dot${online ? ' online' : ''}"></span></span>` +
            `<span class="chat-conv-item-info">` +
            `<span class="chat-conv-item-nombre">${escapeHtml(c.otro_nombre || 'Conversación')}</span>` +
            `<span class="chat-conv-item-preview">${preview}</span>` +
            `</span>` +
            `<span class="chat-conv-item-meta">` +
            `<span class="chat-conv-item-hora">${hora}</span>` +
            `<span class="chat-conv-item-badge hidden"></span>` +
            `</span>`;
        item.addEventListener('click', () => abrirSala(c.canal, c.otro_nombre, c.otro_foto, c.ultima_actividad));
        frag.appendChild(item);
    });
    cont.appendChild(frag);
    aplicarNoLeidos(); // badges sobre la lista recién renderizada
}

function abrirPrivado(u) {
    const me = miId();
    if (!me || u.id === me) return;
    const canal = me < u.id ? `priv:${me}:${u.id}` : `priv:${u.id}:${me}`;
    abrirSala(canal, u.nombre_artista, u.foto_perfil, u.ultima_actividad);
}

// ============================================
// SALA: cargar mensajes + poll condicional
// ============================================
async function abrirSala(canal, titulo, fotoOtro, actividadOtro) {
    detenerPoll();
    canalActivo = canal;
    window._canalChatActivo = canal; // lo usa push.js para no mostrar banner si ya estás leyendo aquí
    lastId = 0;
    setFabVisible(false); // al entrar a una sala (global o privada) se oculta
    // Recordar de dónde se abrió la sala para que la flecha del header vuelva atrás
    vistaAnterior = document.getElementById('chat-conversaciones').classList.contains('hidden') ? 'directorio' : 'conversaciones';
    actualizarFlechaConversaciones(true); // el icono del header pasa a flecha

    // Estado del canal privado (para ✓✓, typing y el menú ⋯)
    canalEsPriv = canal !== 'global';
    canalOtroId = canalEsPriv ? otroDeCanal(canal) : null;
    canalOtroNombre = canalEsPriv ? titulo : '';
    canalOtroActividad = canalEsPriv ? (actividadOtro || null) : null;
    leidoHastaLocal = 0;
    entregadoHastaLocal = 0;
    cancelarRespuesta();
    const menuBtn = document.getElementById('chat-sala-menu-btn');
    if (menuBtn) menuBtn.style.display = canalEsPriv ? '' : 'none';

    document.getElementById('chat-directorio').classList.add('hidden');
    document.getElementById('chat-conversaciones').classList.add('hidden');
    document.getElementById('chat-sala').classList.remove('hidden');

    // Avatar del otro usuario (después de la flecha de volver), con punto de presencia
    const avatarEl = document.getElementById('chat-sala-avatar');
    if (avatarEl) {
        if (canalEsPriv) {
            const online = esOnline({ ultima_actividad: canalOtroActividad });
            avatarEl.innerHTML = `<span class="chat-sala-avatar-wrap">${avatarHTML(fotoOtro, titulo)}<span class="chat-user-dot ${online ? 'online' : ''}"></span></span>`;
        } else {
            avatarEl.innerHTML = avatarHTML(fotoOtro, titulo);
        }
    }
    const tituloEl = document.getElementById('chat-sala-titulo');
    if (canalEsPriv && canalOtroActividad) {
        const online = esOnline({ ultima_actividad: canalOtroActividad });
        const pres = online ? 'Activo ahora' : `Activo hace ${tiempoActivoHace(canalOtroActividad)}`;
        tituloEl.innerHTML = `<span class="chat-sala-nombre">${escapeHtml(titulo)}</span><span class="chat-sala-presencia ${online ? 'on' : ''}">${pres}</span>`;
    } else {
        tituloEl.innerHTML = `<span>${escapeHtml(titulo)}</span>`;
    }

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
        if (data && data.entregado_hasta != null) entregadoHastaLocal = data.entregado_hasta;
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
    // En chats privados se omite el nombre del otro (ya se sabe con quién se habla)
    if (!esPropio && !canalEsPriv) {
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
        html += `<img class="chat-msg-imagen" src="${safeImgUrl(m.imagen_url)}" alt="Imagen" loading="lazy">`;
        if (m.contenido) html += `<div class="chat-msg-texto">${escapeHtml(m.contenido)}</div>`;
    } else {
        html += `<span class="chat-msg-texto">${escapeHtml(m.contenido || '')}</span>`;
    }
    if (m.editado && !m.eliminado) html += '<span class="chat-msg-editado">(editado)</span>';
    // Pie: hora + visto (3 estados: enviado ✓ / entregado ✓✓ / visto ✓✓ azul)
    let pie = `<span class="chat-msg-tiempo">${formatHora(m.created_at)}</span>`;
    if (esPropio && canalEsPriv) {
        const leido = (m.leido !== null && m.leido !== undefined) ? m.leido : false;
        const entregado = (m.entregado !== null && m.entregado !== undefined) ? m.entregado : false;
        const estado = leido ? 'visto' : (entregado ? 'entregado' : 'enviado');
        pie += `<span class="chat-msg-leido ${estado}">${(leido || entregado) ? '✓✓' : '✓'}</span>`;
    }
    html += `<span class="chat-msg-pie">${pie}</span>`;
    div.innerHTML = html;
    cont.appendChild(div);

    renderReacciones(div, m.reacciones || {}, m.id);
    setupMsgMenu(div, m, esPropio);
    // Click en imagen para ver a tamaño completo
    if (!m.eliminado && m.tipo_mensaje === 'imagen' && m.imagen_url) {
        const img = div.querySelector('.chat-msg-imagen');
        if (img) {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => abrirVisorImagen(m.imagen_url));
        }
    }
    lastId = Math.max(lastId, m.id);
}

// Visor de imagen a pantalla completa
function abrirVisorImagen(url) {
    // Eliminar visor previo si existe
    const prev = document.getElementById('chat-visor-img');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = 'chat-visor-img';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:pointer;';
    overlay.addEventListener('click', () => overlay.remove());

    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain;border-radius:4px;';
    img.addEventListener('click', (e) => e.stopPropagation()); // no cerrar al clickear la imagen
    overlay.appendChild(img);
    document.body.appendChild(overlay);
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
                if (data.leido_hasta != null) actualizarTicksLeidos(data.leido_hasta, data.entregado_hasta);
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
            data.mensaje.entregado = true; // entregado al servidor → ✓✓ instantáneo
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
