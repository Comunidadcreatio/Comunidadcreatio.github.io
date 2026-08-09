// js/push.js
// Push notifications vía FCM (Capacitor). La app es una WebView que carga
// contenido remoto, así que se habla con el plugin NATIVO a través del puente
// `window.Capacitor.Plugins.PushNotifications` (sin bundler).
// En navegador web (sin Capacitor) esto simplemente no hace nada.
import { apiRequest } from './config.js';
import { debugLog } from './utils.js';

const TOKEN_KEY = 'fcm_token';

export function setupPush() {
    const Cap = window.Capacitor;
    const Push = (Cap && Cap.Plugins && Cap.Plugins.PushNotifications) || null;
    if (!Push) return; // web / navegador: sin push nativo

    // Al cerrar sesión, desvincular el token del dispositivo
    document.addEventListener('userLogout', () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return;
        localStorage.removeItem(TOKEN_KEY);
        apiRequest('/api/push/registrar-token', {
            method: 'DELETE',
            body: JSON.stringify({ token })
        }).catch(() => { /* silencioso */ });
    });

    Push.requestPermissions()
        .then((perm) => {
            if (!perm || !perm.receive) return;
            return Push.register();
        })
        .then(() => {
            // Canal de notificaciones (Android) para las locales en primer plano
            if (Push.createChannel) {
                Push.createChannel({
                    id: 'default',
                    name: 'Notificaciones',
                    importance: 4,
                    visibility: 1
                }).catch(() => { /* el canal 'default' suele existir ya */ });
            }
            Push.addListener('registration', (data) => {
                if (data && data.value) registrarToken(data.value);
            });
            Push.addListener('registrationError', (err) => {
                debugLog.error('FCM registro:', err);
            });
            // App en primer plano: el sistema NO muestra la notificación sola.
            // Para chat mostramos un banner personalizado (con avatar); para
            // like/comment programamos una notificación local para que suene.
            Push.addListener('pushNotificationReceived', (n) => {
                const d = (n && n.data) || {};
                if (d.tipo === 'chat') {
                    // Si ya estás viendo esa conversación, el polling la muestra:
                    // no hace falta banner. (En segundo plano el sistema notifica.)
                    if (d.canal && window._canalChatActivo === d.canal) return;
                    // En segundo plano/cerrada, el sistema muestra la notificación
                    // con la imagen grande (BigPicture). En primer plano, banner.
                    mostrarBannerChat(d, n.title || 'Nuevo mensaje', n.body || '');
                    return;
                }
                if (n && (n.title || n.body)) {
                    Push.schedule({
                        notifications: [{
                            id: Math.floor(Date.now() / 1000) % 2147483647,
                            title: n.title || 'Creatio',
                            body: n.body || '',
                            channelId: 'default',
                            data: n.data || {}
                        }]
                    }).catch(() => { /* si falla la local, seguimos */ });
                }
                manejarPush(d);
            });
            // El usuario tocó la notificación (app en segundo plano/cerrada)
            Push.addListener('pushNotificationActionPerformed', (n) => {
                manejarPush(n && n.notification && n.notification.data);
            });
        })
        .catch((e) => debugLog.error('push setup:', e));
}

async function registrarToken(token) {
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
    try {
        await apiRequest('/api/push/registrar-token', {
            method: 'POST',
            body: JSON.stringify({ token, plataforma: 'android' })
        });
    } catch (e) {
        debugLog.error('registrar token push:', e);
    }
}

function manejarPush(d) {
    if (!d || !d.tipo) return;
    if (d.tipo === 'chat') {
        // El usuario tocó la notificación: abrir el chat en esa conversación
        window.dispatchEvent(new CustomEvent('chat-abrir-canal', {
            detail: { canal: d.canal, titulo: d.otro_nombre || 'Conversación' }
        }));
    } else if (d.tipo === 'like' || d.tipo === 'comment') {
        // Refrescar el contador/badge de notificaciones in-app
        if (typeof window.refrescarNotificaciones === 'function') {
            window.refrescarNotificaciones();
        }
    }
}

// ============================================
// BANNER EN PRIMER PLANO (mensajes de chat)
// ============================================
let bannerTimer = null;
let bannerCanal = null;
let bannerTitulo = null;

function mostrarBannerChat(d, titulo, cuerpo) {
    bannerCanal = d.canal || null;
    bannerTitulo = d.otro_nombre || 'Conversación';

    let banner = document.getElementById('chat-push-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'chat-push-banner';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
            'display:flex', 'align-items:center', 'gap:10px',
            'padding:12px 14px', 'background:#1a1a1a', 'color:#fff',
            'box-shadow:0 4px 16px rgba(0,0,0,.4)', 'cursor:pointer',
            'font-family:inherit', 'font-size:14px', 'line-height:1.3',
            'box-sizing:border-box', 'transform:translateY(-100%)',
            'transition:transform .25s ease'
        ].join(';');
        banner.addEventListener('click', () => {
            ocultarBanner();
            if (bannerCanal) {
                window.dispatchEvent(new CustomEvent('chat-abrir-canal', {
                    detail: { canal: bannerCanal, titulo: bannerTitulo }
                }));
            }
        });
        document.body.appendChild(banner);
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

    requestAnimationFrame(() => { banner.style.transform = 'translateY(0)'; });
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(ocultarBanner, 5000);
}

function ocultarBanner() {
    const banner = document.getElementById('chat-push-banner');
    if (banner) banner.style.transform = 'translateY(-100%)';
}
