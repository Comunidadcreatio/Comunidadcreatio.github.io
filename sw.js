// Service Worker de Creatio (PWA) — estrategia CONSERVADORA.
//  - Solo gestiona assets versionados (?v=... o ?t=...) bajo /js/, /css/, /iconos/.
//  - NUNCA intercepta HTML, version.json ni la API: evita bucles de recarga
//    y servir datos viejos. El control de versiones sigue siendo bump-version.js.
//  - push/notificationclick son andamiaje: requieren VAPID en el backend.
//
// CAMBIOS (2026-10-14) — los tres vienen de la auditoría del pipeline:
//
//  1) ROTACIÓN DE CACHÉ. Antes `CACHE_NAME` era 'creatio-cache-v1' y NADA en el
//     pipeline lo cambiaba: cada despliegue añadía entradas nuevas (la clave es el
//     `?v=` del asset) y las viejas no se evacuaban nunca, así que la caché del
//     dispositivo crecía sin límite a lo largo de las versiones. Ahora
//     `bump-version.js` reescribe el número de la última línea de CACHE_NAME en cada
//     release (está en su lista de ficheros versionados), y el `activate` borra todas
//     las cachés con otro nombre.
//
//  2) RED PRIMERO, CON RESPALDO EN CACHÉ. Antes era cache-first: `cache.match` se
//     consultaba ANTES de la red, así que un asset ya cacheado no se volvía a pedir
//     JAMÁS. Combinado con un `?v=` que el actualizador no podía reescribir (el import
//     de efecto secundario `import './x.js?v=1'`, sin `from`, invisible para su regex),
//     eso servía un módulo viejo contra un importador nuevo de forma permanente
//     (`SyntaxError: export no provisto`). Ahora se pide a la red con un tope de 1,5 s:
//     si contesta, manda la red (frescura) y se refresca la caché; si no, se sirve lo
//     cacheado al instante (offline rápido) y una copia de FONDO deja la caché caliente
//     para la próxima visita, de modo que el retraso se paga UNA sola vez.
//     La respuesta no se guarda a ciegas: ver `respuestaGuardable` (200 no redirigido y
//     Content-Type coherente), porque si no un portal cautivo podía envenenar la caché.
//
//  3) TOPE DE ENTRADAS. Con la rotación esto ya no debería crecer, pero un tope
//     explícito evita que un dispositivo que se salte un `activate` acumule basura.
var CACHE_NAME = 'creatio-cache-v144';   // esta línea la reescribe bump-version.js en cada release
var CACHEABLE_PREFIXES = ['/js/', '/css/', '/iconos/'];
// Tope de entradas de caché y cuánto se espera a la red antes de tirar de caché.
var MAX_ENTRADAS = 80;
// El tope son 1,5 s: si la red no contesta en ese tiempo se sirve lo cacheado (rápido) y una copia
// de FONDO deja la caché caliente para la próxima visita, así que el retraso se paga UNA vez.
var MS_ESPERA_RED = 1500;

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

// Deja la caché por debajo del tope quitando las entradas MÁS VIEJAS.
// `cache.keys()` devuelve en orden de inserción, así que las primeras son las antiguas.
function recortarCache(cache) {
    return cache.keys().then(function (peticiones) {
        var sobran = peticiones.length - MAX_ENTRADAS;
        if (sobran <= 0) return;
        return Promise.all(peticiones.slice(0, sobran).map(function (p) { return cache.delete(p); }));
    });
}

// ¿Se puede guardar ESTA respuesta para ESTA petición?
//
// No basta con `res.ok`. Red-primero sobrescribe una copia buena con cualquier 200, y `fetch`
// sigue redirecciones por defecto: un portal cautivo de ISP (o un intersticial de hotel/aeropuerto)
// que responda 200 —o redirija— a `/js/main.js?v=…` pasaría el filtro, se guardaría HTML bajo la
// clave del módulo y el service worker lo serviría como JavaScript (SyntaxError) hasta que rotara
// CACHE_NAME. Con cache-first la copia buena ganaba; con red-primero hay que comprobarlo.
//
// Se comprueba el Content-Type SOLO si el servidor lo manda (si no, se acepta: no se puede
// distinguir "no lo manda" de "es el equivocado", y rechazar por eso dejaría sin caché offline).
function respuestaGuardable(req, res) {
    if (!res || !res.ok) return false;
    if (res.redirected) return false;                       // la URL final no es la pedida
    var tipo = (res.headers.get('Content-Type') || '').toLowerCase();
    if (!tipo) return true;                                 // sin cabecera: no se puede juzgar
    var destino = req.destination;                          // script | style | image | ...
    if (destino === 'script') return tipo.indexOf('javascript') !== -1;
    if (destino === 'style') return tipo.indexOf('text/css') !== -1;
    if (destino === 'image') return tipo.indexOf('image/') === 0;
    return true;
}

// Pide a la red con tope de tiempo. Resuelve con la respuesta, o con null si falla o tarda.
// Usa AbortController a propósito: al vencer el tope se ABORTA la petición en curso. Sin esto, la
// primera petición seguía viva y cualquier respaldo lanzaba una SEGUNDA descarga del mismo asset
// (doble tráfico justo en los assets lentos, que es donde más duele).
function traerConTope(req) {
    return new Promise(function (resolver) {
        var hecho = false;
        var control = typeof AbortController === 'function' ? new AbortController() : null;
        var temporizador = setTimeout(function () {
            if (hecho) return;
            hecho = true;
            if (control) { try { control.abort(); } catch (e) { /* ya terminó */ } }
            resolver(null);
        }, MS_ESPERA_RED);
        var opciones = control ? { signal: control.signal } : undefined;
        fetch(req, opciones).then(function (res) {
            if (hecho) return;
            hecho = true;
            clearTimeout(temporizador);
            resolver(res);
        }).catch(function () {
            if (hecho) return;
            hecho = true;
            clearTimeout(temporizador);
            resolver(null);
        });
    });
}

// Guarda una respuesta buena y recorta la caché. Se usa tanto en el camino rápido como en el
// refresco de fondo, para que la caché SIEMPRE acabe caliente.
function guardar(cache, req, res) {
    if (!respuestaGuardable(req, res)) return Promise.resolve();
    return cache.put(req, res.clone()).then(function () { return recortarCache(cache); });
}

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
            return traerConTope(req).then(function (res) {
                if (res && res.ok) {
                    // Se guarda la respuesta fresca y se recorta DESPUÉS de responder.
                    event.waitUntil(guardar(cache, req, res).catch(function () { /* cuota o caché cerrada: da igual */ }));
                    return res;
                }
                // La red falló O tardó más que el tope. Si tardó, la petición se abortó: se lanza
                // una copia de FONDO para dejar la caché caliente y que la próxima visita sea
                // instantánea (antes no se cacheaba nunca y cada visita volvía a pagar el tope).
                event.waitUntil(
                    fetch(req).then(function (lenta) { return guardar(cache, req, lenta); })
                        .catch(function () { /* de verdad no hay red */ })
                );
                // Y se responde YA con lo cacheado; si no hay nada, con el error de red real.
                return cache.match(req).then(function (hit) {
                    return hit || fetch(req);
                });
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
