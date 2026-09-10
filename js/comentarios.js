// js/comentarios.js
// Drawer de comentarios — se desliza desde la parte inferior.
import { apiRequest } from './config.js?v=2e0c2e7288';
import { renderText, safeImgUrl } from './utils.js?v=d86e42a5e7';

let obraIdActual = null;
let cardActual = null;
let drawer, lista, input, btnEnviar, btnCerrar, nav;

function init() {
    if (drawer) return;
    drawer    = document.getElementById('comentarios-drawer');
    lista     = document.getElementById('comentarios-lista');
    input     = document.getElementById('comentarios-input');
    btnEnviar = document.getElementById('comentarios-enviar');
    btnCerrar = document.getElementById('comentarios-close');
    nav       = document.getElementById('toggle-panel');
    // Altura de teclado recordada de la sesión anterior (para la pre-subida).
    try { altoTecladoMem = parseInt(localStorage.getItem(ALTO_TECLADO_KEY) || '0', 10) || 0; } catch (e) {}
    // Pre-subir el input al enfocar: evita que el navegador desplace el viewport.
    input?.addEventListener('focus', preLiftEnFoco);
    input?.addEventListener('blur', () => { preLiftHecho = false; });
    // Conectar el ajuste del cajón cuando el teclado se abre (una sola vez)
    setupKeyboardDrawer();
}

export function abrirComentarios(obraId, cardEl) {
    init();
    obraIdActual = obraId;
    cardActual   = cardEl;

    input.value = '';
    lista.innerHTML = '<div class="comentarios-loading">Cargando comentarios...</div>';
    // Limpiar cualquier transform inline residual de swipe
    drawer.style.transform = '';
    drawer.style.transition = '';
    drawer.classList.remove('hidden');
    // Forzar reflow antes de la animación
    drawer.offsetHeight;
    drawer.classList.add('visible');

    // Fijar la geometría del cajón (top y alto en píxeles, sobre la pantalla
    // completa) para que el navegador NO pueda reacomodarlo al abrir el teclado.
    pinCajonTeclado();

    // DIAGNÓSTICO TEMPORAL
    diagVisible(true);
    actualizarDiagTeclado(true);

    // Si el teclado sigue abierto al reabrir (cierre del cajón sin cerrar el
    // teclado), volver a levantar el cajón de inmediato.
    ajustarTecladoDrawer();

    cargarComentarios(obraId);
}

// ============================================
// TECLADO: el cajón NUNCA cambia de posición. Su fondo sigue llegando siempre
// al borde inferior de la pantalla (detrás del teclado), así que aunque el
// sistema anime el teclado a su velocidad y nuestros eventos lleguen a saltos,
// es IMPOSIBLE que se vea la página entre el cajón y el teclado.
//
// La lista de comentarios tampoco se reordena: lo ÚNICO que se desplaza es el
// ÁREA DEL INPUT, que sube con un transform (se anima en la GPU, fluido) justo
// por encima del teclado.
//
// La subida se calcula MIDIENDO la posición real del área y descontando los
// transforms de CSS (el suyo propio y el de apertura/cierre del cajón), así la
// medición vale incluso si el teclado se abre mientras el cajón se desliza y
// aunque el WebView ya haya reacomodado el cajón.
// Durante el gesto del teclado solo se avanza en su dirección (subir al abrir,
// bajar al cerrar): los valores transitorios del visualViewport provocaban un
// rebote (subía de más y volvía). Al asentarse se corrige con el valor exacto.
// ============================================
const TECLADO_UMBRAL = 12;     // px de teclado para considerarlo "abierto"
const LIFT_TRANSICION = 'transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)';
const GESTO_MS = 160;          // eventos más seguidos = mismo gesto del teclado
const ALTO_TECLADO_KEY = 'creatio_alto_teclado'; // altura recordada del teclado
let keyboardListenerConectado = false;
// Estado a nivel de módulo para poder resetearlo también desde cerrarComentarios
// (si se cierra el cajón con el teclado aún abierto, al reabrir se levanta otra vez).
let alturaLayoutBase = 0;      // mayor alto de layout visto (detectar resize-content)
let liftObjetivo = 0;          // px que debe subir el área del input
let ultimoEventoTeclado = 0;   // timestamp del último evento (detectar gesto)
let timerAsentado = null;      // corrección final al asentarse el teclado
let tecladoAbiertoAhora = false;
let scrollBloqueado = null;    // scroll de página fijado mientras el teclado está abierto
let altoTecladoMem = 0;        // altura del teclado recordada (para pre-subir al enfocar)
let preLiftHecho = false;      // ya se pre-subió el input en este foco

// Desplazamiento vertical que aporta el transform de CSS de un elemento
// (0 si no tiene). Se usa para medir la posición "natural" del input sin que
// interfieran las animaciones de transform.
function transformY(el) {
    if (!el || !el.style) return 0;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    try {
        if (typeof DOMMatrixReadOnly === 'function') return new DOMMatrixReadOnly(t).m42 || 0;
    } catch (e) { /* fallback abajo */ }
    const m = t.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!m) return 0;
    const v = m[1].split(',').map(Number);
    return v.length === 16 ? (v[13] || 0) : (v.length === 6 ? (v[5] || 0) : 0);
}
function areaInput() {
    return drawer ? drawer.querySelector('.comentarios-input-area') : null;
}
// ---------------------------------------------------------------------------
// DIAGNÓSTICO TEMPORAL (se elimina en la próxima versión): muestra en vivo los
// números reales del dispositivo dentro del cajón mientras se escribe.
// ---------------------------------------------------------------------------
let diagEl = null, diagUltimo = 0, diagHistLift = [], diagHistTop = [], diagVersion = '?';
function diagVisible(mostrar) {
    if (!diagEl) diagEl = document.getElementById('diag-teclado');
    if (!diagEl) return;
    diagEl.classList.toggle('hidden', !mostrar);
    if (mostrar && diagVersion === '?') {
        fetch('version.json', { cache: 'no-store' })
            .then(r => r.json())
            .then(v => { diagVersion = v.version || '?'; })
            .catch(() => { diagVersion = 'err'; });
    }
}
function actualizarDiagTeclado(forzar) {
    if (!diagEl) diagEl = document.getElementById('diag-teclado');
    if (!diagEl || diagEl.classList.contains('hidden')) return;
    const ahora = performance.now();
    if (!forzar && ahora - diagUltimo < 120) return;
    diagUltimo = ahora;
    const vv = window.visualViewport || {};
    const r = drawer ? drawer.getBoundingClientRect() : null;
    const lr = lista ? lista.getBoundingClientRect() : null;
    const nr = nav ? nav.getBoundingClientRect() : null;
    const ir = input ? input.getBoundingClientRect() : null;
    const kTop = Math.round((vv.height || 0) + (vv.offsetTop || 0));
    diagHistLift.push(Math.round(liftObjetivo));
    diagHistTop.push(kTop);
    if (diagHistLift.length > 10) { diagHistLift.shift(); diagHistTop.shift(); }
    diagEl.textContent =
        'v' + diagVersion + '  teclado-diag\n' +
        'ih=' + window.innerHeight + ' vv=' + Math.round(vv.height || 0) + ' off=' + Math.round(vv.offsetTop || 0) +
        ' sy=' + Math.round(window.scrollY || 0) + ' kTop=' + kTop + '\n' +
        'cajon=' + (r ? Math.round(r.top) + '..' + Math.round(r.bottom) : '?') +
        ' pantalla=' + (r ? Math.round(r.top - (vv.offsetTop || 0)) + '..' + Math.round(r.bottom - (vv.offsetTop || 0)) : '?') +
        ' pan=' + Math.round(transformY(drawer)) + '\n' +
        'lista=' + (lr ? Math.round(lr.top) + '..' + Math.round(lr.bottom) : '?') +
        ' input=' + (ir ? Math.round(ir.bottom) : '?') +
        ' inputPantalla=' + (ir ? Math.round(ir.bottom - (vv.offsetTop || 0)) : '?') +
        ' lift=' + Math.round(liftObjetivo) + '\n' +
        'nav disp=' + (nav ? getComputedStyle(nav).display : '?') +
        ' rect=' + (nr ? Math.round(nr.top) + '..' + Math.round(nr.bottom) : '?') + '\n' +
        'clase=' + (document.body.classList.contains('teclado-abierto') ? 'SI' : 'no') +
        ' abierto=' + (tecladoAbiertoAhora ? 'SI' : 'no') +
        ' altoTeclado=' + Math.round((window.innerHeight - (vv.height || 0))) + '\n' +
        'lift: ' + diagHistLift.join(',') + '\n' +
        'kTop: ' + diagHistTop.join(',');
}
// Fija la geometría del cajón en píxeles sobre la ALTURA COMPLETA de la
// pantalla (top = 20% y alto = 80% de esa altura). Así, aunque el WebView
// redimensione el layout al abrir el teclado (interactive-widget=resizes-content
// o WebViews que lo ignoran), el navegador YA NO puede reacomodar el cajón: su
// caja, su fondo y la lista de comentarios se quedan exactamente donde estaban.
function pinCajonTeclado() {
    if (!drawer) return;
    const alto = alturaLayoutBase || window.innerHeight || 0;
    if (!alto) return;
    const top = Math.round(alto * 0.2);
    const h = Math.round(alto * 0.8);
    if (drawer.style.top === top + 'px' && drawer.style.height === h + 'px' && drawer.style.bottom === 'auto') return;
    drawer.style.top = top + 'px';
    drawer.style.height = h + 'px';
    drawer.style.bottom = 'auto';
}
function despinCajonTeclado() {
    if (!drawer) return;
    drawer.style.top = '';
    drawer.style.height = '';
    drawer.style.bottom = '';
}
// Mientras el teclado está abierto el nav no debe verse (taparía la zona del
// input y el WebView puede reacomodarlo encima del teclado). Se oculta con
// estilo INLINE para que no lo pueda revivir ninguna regla CSS.
function ocultarNavTeclado(ocultar) {
    if (!nav) return;
    const valor = ocultar ? 'none' : '';
    if (nav.style.display !== valor) nav.style.display = valor;
}
function resetEstadoTeclado() {
    liftObjetivo = 0;
    tecladoAbiertoAhora = false;
    scrollBloqueado = null;
    preLiftHecho = false;
    if (timerAsentado) { clearTimeout(timerAsentado); timerAsentado = null; }
    const area = areaInput();
    if (area) { area.style.transition = ''; area.style.transform = ''; }
    compensarPanCajon(0, false);
    ocultarNavTeclado(false);
}
// Pre-subida al enfocar: NO se usa. Movía el input justo al recibir el foco y
// en algunos WebView eso interfiere con el propio foco (el teclado se abría y se
// cerraba al instante). El desplazamiento del viewport se compensa en el cajón,
// que no toca el foco. Se deja la función desactivada por si hiciera falta.
function preLiftEnFoco() { /* desactivado a propósito */ }
function aplicarLift(animar) {
    const area = areaInput();
    if (!area) return;
    area.style.transition = animar ? LIFT_TRANSICION : 'none';
    area.style.transform = liftObjetivo > 0.5 ? 'translateY(' + (-liftObjetivo) + 'px)' : '';
}
// Cuánto hay que subir el área del input para que quede por encima del teclado.
function liftNecesario() {
    const vv = window.visualViewport;
    const area = areaInput();
    if (!vv || !area || !drawer || !tecladoAbiertoAhora) return 0;
    // El borde del teclado EN PANTALLA es vv.height: el desplazamiento del
    // viewport visual (vv.offsetTop) lo compensamos moviendo el cajón (ver
    // compensarPanCajon), así que aquí no se tiene en cuenta.
    const keyboardTop = vv.height;
    // Posición natural (sin su propio lift ni los transforms del cajón).
    const natural = area.getBoundingClientRect().bottom - transformY(area) - transformY(drawer);
    return Math.max(0, Math.round(natural - keyboardTop));
}
// El navegador desplaza el viewport VISUAL (visualViewport.offsetTop) para
// "mostrar" el input enfocado. Ese desplazamiento mueve TODO en pantalla (de ahí
// que el cajón y los comentarios parecieran subir). Lo compensamos bajando el
// cajón lo mismo que el viewport se desplaza: en pantalla vuelve a su sitio y
// solo se mueve el área del input.
function compensarPanCajon(pan, activo) {
    if (!drawer) return;
    const objetivo = activo && pan > 1 ? 'translateY(' + Math.round(pan) + 'px)' : '';
    if (drawer.style.transform !== objetivo) {
        // Mientras se escribe, la compensación debe seguir al viewport de cerca.
        drawer.style.transition = activo ? 'transform 0.1s linear' : '';
        drawer.style.transform = objetivo;
    }
}
function ajustarTecladoDrawer() {
    if (!drawer || !lista) return;
    const vv = window.visualViewport;
    if (!vv || !vv.height) return;
    // Referencia de la altura COMPLETA de la pantalla (se refresca siempre que
    // el layout no esté reducido; así sigue valiendo tras una rotación).
    if (!alturaLayoutBase || window.innerHeight >= alturaLayoutBase - 40) {
        alturaLayoutBase = window.innerHeight || alturaLayoutBase;
    }

    const cajonVisible = drawer.classList.contains('visible');
    const pan = Math.max(0, vv.offsetTop || 0);
    // Altura real del teclado = lo que le falta al viewport visible para llegar
    // al fondo de la pantalla. NO depende del desplazamiento del viewport (si se
    // usara vv.height + offsetTop, con un desplazamiento grande la resta daría
    // casi cero y el teclado no se detectaría).
    const altoTeclado = Math.max(0, Math.round(window.innerHeight - vv.height));
    // Salvaguarda: si algún WebView SÍ redujera el layout al abrir el teclado
    // (interactive-widget=resizes-content), el navegador ya deja el cajón encima
    // del teclado y la medición de abajo dará 0. Con resizes-visual (lo que
    // usamos) el layout no se toca y el lift lo hacemos nosotros.
    const layoutReducido = alturaLayoutBase - window.innerHeight > 40;
    tecladoAbiertoAhora = cajonVisible && (altoTeclado > TECLADO_UMBRAL || layoutReducido);
    if (tecladoAbiertoAhora) {
        document.body.classList.add('teclado-abierto');
        // Recordar la altura del teclado para pre-subir el input al enfocar y
        // que el navegador no tenga que desplazar el viewport.
        if (altoTeclado > 120) {
            altoTecladoMem = altoTeclado;
            try { localStorage.setItem(ALTO_TECLADO_KEY, String(altoTeclado)); } catch (e) {}
        }
    }
    compensarPanCajon(pan, tecladoAbiertoAhora);

    // Nav fuera de la vista mientras se escribe (inline: a prueba de CSS) y
    // geometría del cajón reafirmada para que el navegador no lo reacomode.
    ocultarNavTeclado(tecladoAbiertoAhora);
    pinCajonTeclado();

    // Con el teclado abierto, impedir que el navegador desplace la página para
    // "mostrar" el input enfocado: el cajón está fijo y no necesita scroll, y
    // ese desplazamiento movería lo que hay detrás (cabecera, contenido).
    if (tecladoAbiertoAhora) {
        const sy = window.scrollY || window.pageYOffset || 0;
        if (scrollBloqueado === null) scrollBloqueado = sy;
        else if (Math.abs(sy - scrollBloqueado) > 1) window.scrollTo(0, scrollBloqueado);
    } else {
        scrollBloqueado = null;
    }

    const ahora = performance.now();
    const enGesto = (ahora - ultimoEventoTeclado) < GESTO_MS;
    ultimoEventoTeclado = ahora;

    let nuevo = liftNecesario();
    if (enGesto) {
        // Nunca invertir la dirección durante el gesto: al abrir solo sube, al
        // cerrar solo baja. Evita el rebote por valores transitorios.
        nuevo = tecladoAbiertoAhora ? Math.max(nuevo, liftObjetivo) : Math.min(nuevo, liftObjetivo);
    }
    if (Math.abs(nuevo - liftObjetivo) > 0.5) {
        liftObjetivo = nuevo;
        aplicarLift(true);
    }

    // Al asentarse el teclado: corregir con el valor exacto y, si ya está
    // cerrado y el input volvió a su sitio, devolver el nav.
    if (timerAsentado) clearTimeout(timerAsentado);
    timerAsentado = setTimeout(() => {
        timerAsentado = null;
        const exacto = liftNecesario();
        if (Math.abs(exacto - liftObjetivo) > 1) {
            liftObjetivo = exacto;
            aplicarLift(true);
        }
        if (!tecladoAbiertoAhora && liftObjetivo <= 0.5) {
            document.body.classList.remove('teclado-abierto');
        }
        actualizarDiagTeclado(true);   // DIAGNÓSTICO TEMPORAL
    }, GESTO_MS + 40);
    actualizarDiagTeclado(false);      // DIAGNÓSTICO TEMPORAL
}
function setupKeyboardDrawer() {
    if (!window.visualViewport || keyboardListenerConectado) return;
    keyboardListenerConectado = true;
    window.visualViewport.addEventListener('resize', ajustarTecladoDrawer);
    window.visualViewport.addEventListener('scroll', ajustarTecladoDrawer);
    window.addEventListener('resize', ajustarTecladoDrawer);
    ajustarTecladoDrawer();
}

function cerrarComentarios() {
    if (!drawer) return;
    // Limpiar estilos inline del swipe y del ajuste del teclado (el input vuelve
    // a su sitio y, al reabrir con el teclado aún abierto, se vuelve a levantar
    // porque el estado queda reseteado).
    drawer.style.transform = '';
    drawer.style.transition = '';
    drawer.style.bottom = '';
    resetEstadoTeclado();
    diagVisible(false);   // DIAGNÓSTICO TEMPORAL
    document.body.classList.remove('teclado-abierto');
    drawer.classList.remove('visible');
    drawer.addEventListener('transitionend', function ocultar() {
        drawer.removeEventListener('transitionend', ocultar);
        // Solo ocultar si sigue sin estar visible (evita que un reopen dispare el hide)
        if (!drawer.classList.contains('visible')) {
            drawer.classList.add('hidden');
        }
    }, { once: true });
    // Fallback si el transitionend no dispara
    setTimeout(() => {
        if (!drawer.classList.contains('visible')) {
            drawer.classList.add('hidden');
        }
    }, 350);
    obraIdActual = null;
    cardActual = null;
}

async function cargarComentarios(obraId) {
    try {
        const data = await apiRequest(`/obras/${obraId}/comentarios`);
        const comentarios = data.comentarios || data || [];
        if (!comentarios.length) {
            lista.innerHTML = '<div class="comentarios-vacio">No hay comentarios aún. ¡Sé el primero!</div>';
            return;
        }
        // Agrupar: raíces y replies
        const raices = comentarios.filter(c => !c.comentario_padre_id);
        const replies = comentarios.filter(c => c.comentario_padre_id);
        lista.innerHTML = raices.map(c => renderizarComentario(c, replies)).join('');
    } catch (err) {
        lista.innerHTML = '<div class="comentarios-error">Error al cargar comentarios</div>';
    }
}

function renderizarComentario(c, todosReplies) {
    const inicial = (c.autor_nombre || '?')[0].toUpperCase();
    const avatarHTML = c.autor_foto
        ? `<img src="${safeImgUrl(c.autor_foto)}" class="comentario-avatar" alt="">`
        : `<div class="comentario-avatar comentario-avatar-default">${inicial}</div>`;

    const fecha = timeAgoShort(c.created_at || c.fecha);
    const likes = c.likes_count || 0;

    // Buscar replies de este comentario
    const hijos = todosReplies ? todosReplies.filter(r => r.comentario_padre_id === c.id) : [];
    const repliesHTML = hijos.length
        ? `<div class="comentario-replies">${hijos.map(h => renderizarComentario(h, todosReplies)).join('')}</div>`
        : '';

    return `
        <div class="comentario-item" data-id="${c.id}">
            ${avatarHTML}
            <div class="comentario-body">
                <div class="comentario-autor">${renderText(c.autor_nombre) || 'Usuario'}</div>
                <div class="comentario-texto">${renderText(c.texto || c.comentario)}</div>
                <div class="comentario-meta">
                    <span class="comentario-fecha">${fecha}</span>
                    <button class="comentario-btn-responder" data-id="${c.id}">Responder</button>
                    <button class="comentario-btn-like" data-id="${c.id}">
                        ♥ <span class="comentario-likes-count">${likes}</span>
                    </button>
                </div>
                <div class="comentario-reply-input hidden" data-parent="${c.id}">
                    <input type="text" class="comentario-reply-field" placeholder="Escribe una respuesta..." autocomplete="off">
                    <button class="comentario-reply-send">➤</button>
                </div>
                ${repliesHTML}
            </div>
        </div>`;
}

async function enviarComentario(parentId = null) {
    const isReply = parentId !== null;
    const texto = isReply
        ? document.querySelector(`.comentario-reply-input[data-parent="${parentId}"] .comentario-reply-field`)?.value.trim()
        : input.value.trim();
    if (!texto || !obraIdActual) return;
    btnEnviar.disabled = true;

    try {
        const body = { texto };
        if (parentId) body.comentario_padre_id = parentId;
        await apiRequest(`/obras/${obraIdActual}/comentarios`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!isReply) input.value = '';
        await cargarComentarios(obraIdActual);
        actualizarContador(cardActual, 1);
    } catch (err) {
        alert('No se pudo enviar el comentario');
    } finally {
        btnEnviar.disabled = false;
    }
}

async function likeComentario(commentId) {
    try {
        const res = await apiRequest(`/obras/${obraIdActual}/comentarios/${commentId}/like`, { method: 'POST' });
        const btn = document.querySelector(`.comentario-btn-like[data-id="${commentId}"]`);
        const span = btn?.querySelector('.comentario-likes-count');
        if (btn) {
            if (res.liked) btn.classList.add('liked');
            else btn.classList.remove('liked');
        }
        if (span) span.textContent = res.likes_count;
    } catch (err) {
        // silencioso
    }
}

function actualizarContador(cardEl, delta) {
    if (!cardEl) return;
    // El contador de comentarios es el segundo .metrica-item en .metrica-right
    const items = cardEl.querySelectorAll('.metrica-right .metrica-item');
    const commentItem = items[1]; // vistas, comentarios, likes
    if (commentItem) {
        const span = commentItem.querySelector('span');
        if (span) {
            const current = parseInt(span.textContent) || 0;
            span.textContent = Math.max(0, current + delta);
        }
    }
}

function timeAgoShort(dateStr) {
    if (!dateStr) return '';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `Hace ${days}d`;
    return new Date(dateStr).toLocaleDateString('es-VE');
}

// Event listeners — se ejecutan al cargar el módulo (DOM ya está listo)
init();

btnCerrar?.addEventListener('click', cerrarComentarios);

btnEnviar?.addEventListener('click', () => enviarComentario());

input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        enviarComentario();
    }
});

// Cerrar al hacer clic en el fondo oscuro
drawer?.addEventListener('click', (e) => {
    if (e.target === drawer) cerrarComentarios();
});

// Swipe-down para cerrar
let swipeStartY = 0;
let swipePulling = false;
let swipeDist = 0;   // recorrido real del arrastre (NO se deduce del transform:
                     // el cajón también usa transform para compensar el viewport)

drawer?.addEventListener('touchstart', (e) => {
    // Con el teclado abierto el transform del cajón lo usa la compensación del
    // viewport, así que no se permite el gesto de arrastre.
    if (tecladoAbiertoAhora) return;
    // Solo si la lista está arriba del todo
    if (lista.scrollTop <= 0) {
        swipeStartY = e.touches[0].clientY;
        swipePulling = true;
        swipeDist = 0;
    }
}, { passive: true });

drawer?.addEventListener('touchmove', (e) => {
    if (!swipePulling || tecladoAbiertoAhora) return;
    const dist = e.touches[0].clientY - swipeStartY;
    if (dist > 5) {
        // Resistencia suave
        swipeDist = Math.min(dist * 0.55, 150);
        drawer.style.transform = `translateY(${swipeDist}px)`;
        drawer.style.transition = 'none';
    }
}, { passive: true });

drawer?.addEventListener('touchend', () => {
    if (!swipePulling) return;
    swipePulling = false;
    if (tecladoAbiertoAhora) { compensarPanCajon(Math.max(0, (window.visualViewport?.offsetTop) || 0), true); return; }
    if (swipeDist > 80) {
        drawer.style.transform = '';
        cerrarComentarios();
    } else {
        // Volver suave a la posición original (toque simple: no cierra nada)
        drawer.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
        drawer.style.transform = '';
    }
    swipeDist = 0;
});

// Delegación de eventos para replies y likes
lista?.addEventListener('click', (e) => {
    // Botón "Responder"
    const btnResp = e.target.closest('.comentario-btn-responder');
    if (btnResp) {
        const parentId = btnResp.dataset.id;
        const replyInput = lista.querySelector(`.comentario-reply-input[data-parent="${parentId}"]`);
        if (replyInput) {
            const hidden = replyInput.classList.toggle('hidden');
            if (!hidden) replyInput.querySelector('input')?.focus();
        }
        return;
    }
    // Botón enviar reply
    const btnSend = e.target.closest('.comentario-reply-send');
    if (btnSend) {
        const parentId = btnSend.closest('.comentario-reply-input')?.dataset.parent;
        if (parentId) enviarComentario(parseInt(parentId));
        return;
    }
    // Botón like
    const btnLike = e.target.closest('.comentario-btn-like');
    if (btnLike) {
        likeComentario(parseInt(btnLike.dataset.id));
        return;
    }
});

// Enter en campo de reply
lista?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const field = e.target.closest('.comentario-reply-field');
        if (field) {
            e.preventDefault();
            const parentId = field.closest('.comentario-reply-input')?.dataset.parent;
            if (parentId) enviarComentario(parseInt(parentId));
        }
    }
});
