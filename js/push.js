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
            Push.addListener('registration', (data) => {
                if (data && data.value) registrarToken(data.value);
            });
            Push.addListener('registrationError', (err) => {
                debugLog.error('FCM registro:', err);
            });
            // App en primer plano: el sistema no muestra la notificación,
            // así que la manejamos aquí (badge / abrir chat)
            Push.addListener('pushNotificationReceived', (n) => {
                manejarPush(n && n.data);
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
        // Abrir el chat en la conversación correspondiente
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
