// Service Worker de Creatio (PWA) — estrategia CONSERVADORA.
//  - Solo cachea assets versionados (?v=... o ?t=...) bajo /js/, /css/, /iconos/.
//  - NUNCA intercepta HTML, version.json ni la API: evita bucles de recarga
//    y servir datos viejos. El control de versiones sigue siendo bump-version.js.
//  - push/notificationclick son andamiaje: requieren VAPID en el backend.
var CACHE_NAME = 'creatio-cache-v1';
var CACHEABLE_PREFIXES = ['/js/', '/css/', '/iconos/'];

self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    var hasVer = url.search.indexOf('v=') !== -1 || url.search.indexOf('t=') !== -1;
    if (!url.search || !hasVer) return; // solo assets con cache-busting
    var cacheable = CACHEABLE_PREFIXES.some(function (p) { return url.pathname.indexOf(p) === 0; });
    if (!cacheable) return;
    event.respondWith(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.match(req).then(function (hit) {
                if (hit) return hit;
                return fetch(req).then(function (res) {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(function () { return cache.match(req); });
            });
        })
    );
});

self.addEventListener('push', function (event) {
    var data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { /* silencioso */ }
    var title = data.title || 'Creatio';
    var options = {
        body: data.body || 'Tienes una nueva notificación en Creatio.',
        icon: data.icon || 'iconos/Logo-temporal.svg',
        badge: data.badge || 'iconos/Logo-temporal.svg',
        data: { url: data.url || './' }
    };
    if (data.tag) options.tag = data.tag; // agrupa notificaciones del mismo chat/cavent
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var url = (event.notification.data && event.notification.data.url) || './';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if ('focus' in client) {
                    client.navigate(url);
                    return client.focus();
                }
            }
            return self.clients.openWindow(url);
        })
    );
});
