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
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
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

    fetch('/version.json?t=' + Date.now(), { cache: 'no-cache' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var localVer = localStorage.getItem('app_version');
            var apkUrl = (data && data.apk) || '';
            // Solo se ofrece el APK a apps nativas sin el plugin de push,
            // y si no se ocultó el aviso en las últimas 24h
            var necesitaApk = apkSinPush() && !!apkUrl && !apkAvisoOcultoReciente();

            // Primera visita: guardar versión y salir (el aviso de APK sí aplica)
            if (!localVer) {
                localStorage.setItem('app_version', data.version);
                if (necesitaApk) mostrarPillApk(apkUrl);
                return;
            }

            if (data.version !== localVer) {
                mostrarPillActualizar(data.version, data.apk, necesitaApk);
            } else if (necesitaApk) {
                mostrarPillApk(apkUrl);
            }
        })
        .catch(function() {});

    // Pastilla de actualización web (+ botón de APK si el usuario tiene APK viejo)
    function mostrarPillActualizar(nuevaVersion, apkUrl, conApk) {
        var bar = document.createElement('div');
        bar.id = 'update-pill';
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
        var autoTimer = setTimeout(function() {
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
