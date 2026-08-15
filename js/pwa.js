// js/pwa.js — Registro del Service Worker (PWA).
// Solo en contexto seguro (https o localhost). Falla silencioso si no aplica.
(function () {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () { /* silencioso */ });
    });
})();
