// js/version-check.js
// Detector de actualizaciones compartido entre index.html, auth.html y reset-password.html.
// Compara version.json contra la versión guardada en localStorage y muestra
// una pastilla de actualización si hay una nueva versión disponible.
// Además, si la app nativa (Capacitor) NO tiene el plugin de notificaciones
// (APK viejo), ofrece descargar la nueva app desde la píldora (URL en
// version.json → campo "apk").
(function() {
    var AUTO_RELOAD_DELAY = 60000;
    var APK_AVISO_KEY = 'apk_aviso_oculto';
    var APK_AVISO_MS = 24 * 3600000; // no repetir el aviso por 24h tras descargar/cerrar
    var isAuthPage = window.location.pathname.endsWith('auth.html');

    function esAppNativa() {
        try {
            if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
                return !!window.Capacitor.isNativePlatform();
            }
            // Fallback: si Capacitor está definido, es la app nativa (WebView)
            return !!window.Capacitor;
        } catch (e) {
            return false;
        }
    }

    // APK viejo = app nativa que NO expone el plugin de notificaciones (push)
    function apkSinPush() {
        if (!esAppNativa()) return false;
        return !(window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications);
    }

    function apkAvisoOcultoReciente() {
        var t = parseInt(localStorage.getItem(APK_AVISO_KEY) || '0', 10);
        return t && (Date.now() - t) < APK_AVISO_MS;
    }

    // En la WebView de Capacitor, '_system' abre el navegador del sistema,
    // donde el APK se descarga normalmente.
    function abrirEnlace(url) {
        try {
            window.open(url, '_system');
        } catch (e) {
            window.location.href = url;
        }
    }

    function estiloPill(posStyle) {
        return 'position:fixed;' + posStyle + ';left:50%;transform:translateX(-50%);z-index:2147483647;' +
            'background:rgba(26,26,26,0.95);color:#fff;padding:12px 18px;text-align:center;' +
            'font-family:"Nunito",sans-serif;font-size:13px;display:flex;align-items:center;gap:10px;' +
            'border-radius:50px;box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
            'max-width:calc(100vw - 32px);pointer-events:auto;flex-wrap:wrap;justify-content:center;';
    }

    function estiloBtn(verde) {
        var bg = verde ? '#2e7d32' : '#fff';
        var fg = verde ? '#fff' : '#000';
        return 'background:' + bg + ';color:' + fg + ';border:none;padding:8px 16px;border-radius:50px;' +
            'font-weight:700;cursor:pointer;font-family:inherit;font-size:12px;white-space:nowrap;';
    }

    function comprobarVersion() {
    fetch('/version.json?t=' + Date.now(), { cache: 'no-cache' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var localVer = localStorage.getItem('app_version');
            var apkUrl = (data && data.apk) || '';
            var esNativa = esAppNativa();
            // En apps nativas con APK disponible, la pastilla de versión nueva
            // SIEMPRE ofrece descargar la app (sin depender del aviso de 24h).
            var descargarDisponible = esNativa && !!apkUrl;
            // Aviso independiente solo para APKs viejos sin el plugin de push,
            // y si no se ocultó en las últimas 24h.
            var necesitaApkStandalone = apkSinPush() && !!apkUrl && !apkAvisoOcultoReciente();

            // Primera visita: guardar versión y salir (el aviso de APK sí aplica)
            if (!localVer) {
                localStorage.setItem('app_version', data.version);
                if (necesitaApkStandalone) mostrarPillApk(apkUrl);
                return;
            }

            if (data.version !== localVer) {
                mostrarPillActualizar(data.version, data.apk, descargarDisponible);
            } else if (necesitaApkStandalone) {
                mostrarPillApk(apkUrl);
            }
        })
        .catch(function() {});
    }

    // Al cargar y cada vez que la app vuelve al primer plano (WebView/APK)
    // se re-comprueba si hay una versión nueva publicada.
    comprobarVersion();
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') comprobarVersion();
    });
    window.addEventListener('pageshow', comprobarVersion);

    // Pastilla de actualización web (+ botón de APK si el usuario tiene APK viejo)
    var autoTimer = null;
    function mostrarPillActualizar(nuevaVersion, apkUrl, conApk) {
        // Dedupe: comprobarVersion puede dispararse varias veces seguidas
        // (llamada directa + pageshow en la carga inicial + visibilitychange
        // al volver al primer plano). Sin esto se creaban píldoras duplicadas
        // con el mismo id: la de arriba quedaba SIN onclick y el botón
        // "Actualizar ahora" no reaccionaba al tocarlo.
        var prev = document.getElementById('update-pill');
        if (prev) {
            if (prev.dataset.version === nuevaVersion) return; // ya mostrada
            prev.remove();
        }
        clearTimeout(autoTimer);

        var bar = document.createElement('div');
        bar.id = 'update-pill';
        bar.dataset.version = nuevaVersion;
        var posStyle = isAuthPage ? 'top:115px' : 'bottom:80px';
        bar.style.cssText = estiloPill(posStyle);
        var botones = '<button id="btn-refresh-app" style="' + estiloBtn(false) + '">Actualizar ahora</button>';
        if (conApk) {
            botones += '<button id="btn-download-apk" style="' + estiloBtn(true) + '">📲 Descargar app nueva</button>';
        }
        bar.innerHTML = '<span>v' + nuevaVersion + ' disponible</span> ' + botones;
        document.body.appendChild(bar);

        function recargar() {
            localStorage.setItem('app_version', nuevaVersion);
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }

        // Auto-recargar tras 60s si el usuario no actúa (aplica a todas las
        // páginas, incluida la app): garantiza que la WebView llegue a la
        // última versión publicada aunque nadie toque la pastilla.
        autoTimer = setTimeout(function() {
            var btn = document.getElementById('btn-refresh-app');
            if (btn) { btn.textContent = 'Recargando...'; btn.style.opacity = '0.6'; }
            recargar();
        }, AUTO_RELOAD_DELAY);
        document.getElementById('btn-refresh-app').onclick = function() {
            clearTimeout(autoTimer);
            recargar();
        };
        if (conApk) {
            document.getElementById('btn-download-apk').onclick = function() {
                localStorage.setItem(APK_AVISO_KEY, String(Date.now()));
                abrirEnlace(apkUrl);
            };
        }
    }

    // Pastilla independiente: nueva versión de la APP (APK) disponible
    function mostrarPillApk(apkUrl) {
        // Dedupe (mismo motivo que mostrarPillActualizar)
        var prev = document.getElementById('update-pill-apk');
        if (prev) prev.remove();

        var bar = document.createElement('div');
        bar.id = 'update-pill-apk';
        var posStyle = isAuthPage ? 'top:115px' : 'bottom:80px';
        bar.style.cssText = estiloPill(posStyle);
        bar.innerHTML = '<span>📲 Hay una nueva versión de la app</span>' +
            '<button id="btn-download-apk" style="' + estiloBtn(true) + '">Descargar</button>' +
            '<button id="btn-dismiss-apk" aria-label="Cerrar" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:16px;padding:2px;">✕</button>';
        document.body.appendChild(bar);
        document.getElementById('btn-download-apk').onclick = function() {
            localStorage.setItem(APK_AVISO_KEY, String(Date.now()));
            abrirEnlace(apkUrl);
        };
        document.getElementById('btn-dismiss-apk').onclick = function() {
            localStorage.setItem(APK_AVISO_KEY, String(Date.now()));
            bar.remove();
        };
    }
})();
