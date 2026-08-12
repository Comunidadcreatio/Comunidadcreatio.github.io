// js/push.js
// Push notifications vía FCM (Capacitor). La app es una WebView que carga
// contenido remoto, así que se habla con el plugin NATIVO a través del puente
// `window.Capacitor.Plugins.PushNotifications` (sin bundler).
// En navegador web (sin Capacitor) esto simplemente no hace nada.
import { apiRequest } from './config.js';
import { debugLog } from './utils.js';

const TOKEN_KEY = 'fcm_token';

// ============================================
// DIAGNÓSTICO EN CONSOLA (ring buffer 100 eventos)
// ============================================
const _diag = [];
const MAX_DIAG = 100;

function diag(evento, detalle) {
    const entry = {
        ts: new Date().toISOString(),
        ev: evento,
        dt: typeof detalle === 'string' ? detalle : JSON.stringify(detalle, null, 0)
    };
    _diag.push(entry);
    if (_diag.length > MAX_DIAG) _diag.shift();
    console.log('[PUSH:' + evento + ']', detalle);
}

// Exponer diagnóstico global: en consola escribir __diagnosticoPush()
window.__diagnosticoPush = function () {
    console.group('📋 Diagnóstico Push (' + _diag.length + ' eventos)');
    const ct = _diag.length;
    for (let i = 0; i < ct; i++) {
        const e = _diag[i];
        console.log(e.ts + ' [' + e.ev + ']', e.dt);
    }
    console.groupEnd();
    // Resumen rápido
    const token = localStorage.getItem(TOKEN_KEY);
    const cap = !!window.Capacitor;
    const push = cap && !!(window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications);
    console.log('📊 RESUMEN:', {
        capacitor: cap,
        pushPlugin: push,
        tokenGuardado: token ? (token.slice(0, 10) + '…' + token.slice(-8)) : null,
        canalActivo: window._canalChatActivo || null,
        eventos: ct
    });
    return { capacitor: cap, pushPlugin: push, token: token || null, eventos: ct, detalle: _diag };
};

export function setupPush() {
    diag('init', 'setupPush() llamado');

    const Cap = window.Capacitor;
    diag('capacitor', {
        existe: !!Cap,
        isNative: !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform()),
        pluginsDisponibles: Cap && Cap.Plugins ? Object.keys(Cap.Plugins) : []
    });

    const Push = (Cap && Cap.Plugins && Cap.Plugins.PushNotifications) || null;
    if (!Push) {
        diag('abort', 'PushNotifications NO disponible — ¿navegador? ¿plugin no instalado?');
        return;
    }
    diag('plugin', 'PushNotifications plugin encontrado ✓');

    // Al cerrar sesión, desvincular el token del dispositivo
    document.addEventListener('userLogout', () => {
        const token = localStorage.getItem(TOKEN_KEY);
        diag('logout', 'Eliminando token: ' + (token ? token.slice(0, 10) + '…' : 'sin token'));
        if (!token) return;
        localStorage.removeItem(TOKEN_KEY);
        apiRequest('/api/push/registrar-token', {
            method: 'DELETE',
            body: JSON.stringify({ token })
        }).catch(() => { /* silencioso */ });
    });

    // ⚠️ Adjuntar TODOS los listeners ANTES de register(): si el evento
    // 'registration' dispara antes de adjuntarlo, el token NUNCA se registra
    // y el push falla en silencio (el backend no encuentra tokens).
    Push.addListener('registration', (data) => {
        const tokenPreview = data && data.value
            ? data.value.slice(0, 10) + '…' + data.value.slice(-8)
            : 'sin valor';
        diag('registration', 'Token FCM generado: ' + tokenPreview);
        if (data && data.value) registrarToken(data.value);
        else diag('registrationError', 'data.value vacío o nulo');
    });
    Push.addListener('registrationError', (err) => {
        diag('registrationError', 'Error al registrar con FCM: ' + JSON.stringify(err));
        debugLog.error('FCM registro:', err);
    });

    // App en primer plano: el sistema NO muestra la notificación sola.
    // Para chat mostramos un banner personalizado (con avatar); para
    // like/comment programamos una notificación local para que suene.
    Push.addListener('pushNotificationReceived', (n) => {
        diag('received', {
            title: (n && n.title) || '(sin título)',
            body: (n && n.body) ? (n.body).slice(0, 80) : '(sin cuerpo)',
            tipo: (n && n.data && n.data.tipo) || '(sin tipo)',
            canal: (n && n.data && n.data.canal) || undefined,
            canalActivo: window._canalChatActivo || null,
            dataKeys: n && n.data ? Object.keys(n.data) : []
        });

        const d = (n && n.data) || {};
        if (d.tipo === 'chat') {
            // Si ya estás viendo esa conversación, el polling la muestra:
            // no hace falta banner. (En segundo plano el sistema notifica.)
            if (d.canal && window._canalChatActivo === d.canal) {
                diag('suppressed', 'Chat activo — banner suprimido (canal=' + d.canal + ')');
                return;
            }
            diag('banner', 'Mostrando banner chat: ' + (d.otro_nombre || '?') + ' — ' + (n.body || '').slice(0, 60));
            // En segundo plano/cerrada, el sistema muestra la notificación
            // con la imagen grande (BigPicture). En primer plano, banner.
            mostrarBannerChat(d, n.title || 'Nuevo mensaje', n.body || '');
            return;
        }
        if (n && (n.title || n.body)) {
            diag('localNotif', 'Programando notificación local para sonido');
            Push.schedule({
                notifications: [{
                    id: Math.floor(Date.now() / 1000) % 2147483647,
                    title: n.title || 'Creatio',
                    body: n.body || '',
                    channelId: 'default',
                    data: n.data || {}
                }]
            }).catch((e) => diag('localNotifError', e.message || String(e)));
        }
        diag('manejar', 'Llamando manejarPush con tipo=' + (d.tipo || 'sin tipo'));
        manejarPush(d);
    });

    // El usuario tocó la notificación (app en segundo plano/cerrada)
    Push.addListener('pushNotificationActionPerformed', (n) => {
        const data = n && n.notification && n.notification.data;
        diag('actionPerformed', {
            actionId: (n && n.actionId) || '?',
            tieneNotification: !!(n && n.notification),
            tieneData: !!data,
            tipo: (data && data.tipo) || '(sin tipo)',
            canal: (data && data.canal) || undefined
        });
        if (!data) {
            diag('actionPerformed', '⚠️ n.notification.data es undefined — posible pérdida de datos');
            // Intentar n.data como fallback (algunas versiones lo ponen ahí)
            if (n && n.data) {
                diag('actionPerformed', 'Intentando fallback n.data: ' + JSON.stringify(n.data));
                manejarPush(n.data);
                return;
            }
        }
        manejarPush(data);
    });

    // Pedir permiso y registrar (los listeners ya están arriba, sin carrera)
    diag('permRequest', 'Solicitando permisos de notificación…');
    Push.requestPermissions()
        .then((perm) => {
            diag('permResult', {
                receive: !!(perm && perm.receive),
                permisoCompleto: JSON.stringify(perm)
            });
            if (!perm || !perm.receive) {
                diag('permDenied', '⚠️ Permiso de notificaciones DENEGADO — no se registrará para push');
                return;
            }
            // Canal de notificaciones (Android) para las locales en primer plano
            if (Push.createChannel) {
                diag('channel', 'Creando canal "default"…');
                Push.createChannel({
                    id: 'default',
                    name: 'Notificaciones',
                    importance: 4,
                    visibility: 1
                }).then(() => diag('channel', 'Canal creado OK'))
                  .catch((e) => diag('channelError', e.message || String(e)));
            }
            diag('register', 'Llamando Push.register()…');
            return Push.register();
        })
        .then(() => {
            diag('register', 'Push.register() completado — esperando evento registration…');
        })
        .catch((e) => {
            diag('setupError', 'Error en setup: ' + (e && (e.message || String(e))));
            debugLog.error('push setup:', e);
        });
}

async function registrarToken(token) {
    if (!token) {
        diag('tokenSave', 'ERROR: token vacío, no se registra');
        return;
    }
    const preview = token.slice(0, 10) + '…' + token.slice(-8);
    diag('tokenSave', 'Guardando token en backend: ' + preview);
    localStorage.setItem(TOKEN_KEY, token);
    try {
        const resp = await apiRequest('/api/push/registrar-token', {
            method: 'POST',
            body: JSON.stringify({ token, plataforma: 'android' })
        });
        diag('tokenSave', 'Backend respondió OK: ' + JSON.stringify(resp));
    } catch (e) {
        diag('tokenSaveError', 'Error al registrar token en backend: ' + (e && (e.message || String(e))));
        debugLog.error('registrar token push:', e);
    }
}

function manejarPush(d) {
    if (!d || !d.tipo) {
        diag('manejar', 'manejarPush ignorado: sin datos o sin tipo (d=' + JSON.stringify(d) + ')');
        return;
    }
    diag('manejar', 'Procesando push tipo=' + d.tipo + ' canal=' + (d.canal || 'N/A'));
    if (d.tipo === 'chat') {
        // El usuario tocó la notificación: abrir el chat en esa conversación
        window.dispatchEvent(new CustomEvent('chat-abrir-canal', {
            detail: { canal: d.canal, titulo: d.otro_nombre || 'Conversación' }
        }));
        diag('manejar', 'Evento chat-abrir-canal despachado');
    } else if (d.tipo === 'like' || d.tipo === 'comment') {
        // Refrescar el contador/badge de notificaciones in-app
        if (typeof window.refrescarNotificaciones === 'function') {
            window.refrescarNotificaciones();
            diag('manejar', 'Badge de notificaciones refrescado');
        }
    }
}

// ============================================
// BANNER EN PRIMER PLANO (mensajes de chat)
// ============================================
let bannerTimer = null;
let bannerCanal = null;
let bannerTitulo = null;
let bannerVisible = false;

function mostrarBannerChat(d, titulo, cuerpo) {
    bannerCanal = d.canal || null;
    bannerTitulo = d.otro_nombre || 'Conversación';

    let banner = document.getElementById('chat-push-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'chat-push-banner';
        banner.style.cssText = [
            'position:fixed', 'left:0', 'right:0', 'z-index:99999',
            'display:flex', 'align-items:center', 'gap:10px',
            'padding:12px 14px', 'background:#1a1a1a', 'color:#fff',
            'box-shadow:0 4px 16px rgba(0,0,0,.4)', 'cursor:pointer',
            'font-family:inherit', 'font-size:14px', 'line-height:1.3',
            'box-sizing:border-box', 'transform:translateY(-100%)',
            'transition:transform .25s ease'
        ].join(';');
        banner.addEventListener('click', () => {
            diag('bannerClick', 'Banner clickeado — abriendo chat canal=' + bannerCanal);
            ocultarBanner();
            if (bannerCanal) {
                window.dispatchEvent(new CustomEvent('chat-abrir-canal', {
                    detail: { canal: bannerCanal, titulo: bannerTitulo }
                }));
            }
        });
        document.body.appendChild(banner);
        posicionarBanner(); // debajo del header, respetando la barra de estado
    }

    // Contenido: avatar circular + título + cuerpo
    banner.innerHTML = '';
    const img = document.createElement('img');
    img.alt = '';
    img.style.cssText = 'width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#333;';
    if (d.foto) img.src = d.foto;
    const txt = document.createElement('div');
    txt.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;';
    const t = document.createElement('strong');
    t.style.cssText = 'font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    t.textContent = titulo;
    const b = document.createElement('div');
    b.style.cssText = 'font-size:13px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    b.textContent = cuerpo;
    txt.appendChild(t);
    txt.appendChild(b);
    banner.appendChild(img);
    banner.appendChild(txt);

    requestAnimationFrame(() => {
        bannerVisible = true;
        banner.style.transform = 'translateY(0)';
    });
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(ocultarBanner, 5000);
}

function ocultarBanner() {
    const banner = document.getElementById('chat-push-banner');
    if (!banner) return;
    bannerVisible = false;
    const top = parseFloat(banner.style.top) || 0;
    banner.style.transform = `translateY(calc(-100% - ${top}px))`;
}

// Posiciona el banner justo debajo del header de la app (respeta la barra de
// estado de Android y los distintos tamaños de header por breakpoint).
function posicionarBanner() {
    const banner = document.getElementById('chat-push-banner');
    if (!banner) return;
    const header = document.getElementById('main-header');
    const top = header ? header.getBoundingClientRect().bottom + 6 : 6;
    banner.style.top = Math.round(top) + 'px';
    if (!bannerVisible) {
        banner.style.transform = `translateY(calc(-100% - ${banner.style.top}))`;
    }
}
window.addEventListener('resize', posicionarBanner);
