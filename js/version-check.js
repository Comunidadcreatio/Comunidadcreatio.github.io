// js/version-check.js
// Detector de actualizaciones compartido entre index.html, auth.html y reset-password.html.
// Compara version.json contra la versión guardada en localStorage y muestra
// una pastilla de actualización si hay una nueva versión disponible.
(function() {
    var AUTO_RELOAD_DELAY = 60000;
    var isAuthPage = window.location.pathname.endsWith('auth.html');

    fetch('/version.json?t=' + Date.now(), { cache: 'no-cache' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var localVer = localStorage.getItem('app_version');

            // Primera visita: guardar versión y salir
            if (!localVer) {
                localStorage.setItem('app_version', data.version);
                return;
            }

            if (data.version !== localVer) {
                var bar = document.createElement('div');
                bar.id = 'update-pill';
                // auth.html tiene header fijo → pastilla en top; resto en bottom
                var posStyle = isAuthPage ? 'top:115px' : 'bottom:80px';
                bar.style.cssText = 'position:fixed;' + posStyle + ';left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(26,26,26,0.95);color:#fff;padding:14px 24px;text-align:center;font-family:"Nunito",sans-serif;font-size:13px;display:flex;align-items:center;gap:16px;border-radius:50px;box-shadow:0 4px 20px rgba(0,0,0,0.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);max-width:calc(100vw - 32px);pointer-events:auto;';
                bar.innerHTML = 'v' + data.version + ' disponible <button id="btn-refresh-app" style="background:#fff;color:#000;border:none;padding:8px 18px;border-radius:50px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px;white-space:nowrap;">Actualizar ahora</button>';
                document.body.appendChild(bar);

                function recargar() {
                    localStorage.setItem('app_version', data.version);
                    window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
                }

                // En reset-password, auto-recargar tras 60s si el usuario no actúa
                var isResetPassword = window.location.pathname.indexOf('reset-password') !== -1;
                if (isResetPassword) {
                    var autoTimer = setTimeout(function() {
                        var btn = document.getElementById('btn-refresh-app');
                        if (btn) { btn.textContent = 'Recargando...'; btn.style.opacity = '0.6'; }
                        recargar();
                    }, AUTO_RELOAD_DELAY);
                    document.getElementById('btn-refresh-app').onclick = function() {
                        clearTimeout(autoTimer);
                        recargar();
                    };
                } else {
                    document.getElementById('btn-refresh-app').onclick = recargar;
                }
            }
        })
        .catch(function() {});
})();
