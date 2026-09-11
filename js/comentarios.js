// js/comentarios.js
// Drawer de comentarios — se desliza desde la parte inferior.
import { apiRequest } from './config.js?v=2e0c2e7288';
import { renderText, safeImgUrl } from './utils.js?v=d86e42a5e7';
// === DIAGNOSTICO TEMPORAL (quitar junto con js/diag-teclado.js) ===
import { DIAG_ON, diagTick, diagFrame } from './diag-teclado.js?v=05d834301d';

let obraIdActual = null;
let cardActual = null;
let drawer, lista, input, btnEnviar, btnCerrar, nav, versionEl, fondoEl;

function init() {
    if (drawer) return;
    drawer    = document.getElementById('comentarios-drawer');
    lista     = document.getElementById('comentarios-lista');
    input     = document.getElementById('comentarios-input');
    btnEnviar = document.getElementById('comentarios-enviar');
    btnCerrar = document.getElementById('comentarios-close');
    nav       = document.getElementById('toggle-panel');
    versionEl = document.getElementById('comentarios-version');
    fondoEl   = document.getElementById('fondo-cajon');
    // Mostrar la versión en el cajón (para poder comprobar qué build se está
    // probando en el dispositivo).
    if (versionEl) {
        fetch('version.json', { cache: 'no-store' })
            .then(r => r.json())
            .then(v => { versionEl.textContent = 'v' + (v.version || '?'); })
            .catch(() => { versionEl.textContent = ''; });
    }
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
const GESTO_MS = 160;          // eventos más seguidos = mismo gesto del teclado
const SUAVIZADO_PAD = 0.45;    // interpolación por frame del espacio del teclado
let keyboardListenerConectado = false;
// Estado a nivel de módulo para poder resetearlo también desde cerrarComentarios
// (si se cierra el cajón con el teclado aún abierto, al reabrir se levanta otra vez).
let alturaLayoutBase = 0;      // mayor alto de layout visto (detectar resize-content)
let padObjetivo = 0;           // espacio (padding-bottom) que pide el teclado
let padActual = 0;             // espacio aplicado (animado)
let rafPad = null;             // rAF de la interpolación del espacio
let rafPan = null;             // rAF que sigue el desplazamiento del viewport
let ultimoPanAplicado = -1;
let ultimoEventoTeclado = 0;   // timestamp del último evento (detectar gesto)
let timerAsentado = null;      // corrección final al asentarse el teclado
let tecladoAbiertoAhora = false;
let scrollBloqueado = null;    // scroll de página fijado mientras el teclado está abierto
let swipePulling = false;      // arrastre para cerrar en curso (declarado aquí porque
                               // la compensación del viewport lo consulta)

// === DIAGNOSTICO TEMPORAL (quitar junto con js/diag-teclado.js) ===
// Retrato de los valores reales del dispositivo en este instante.
function diagSnapshot() {
    const vv = window.visualViewport;
    const area = areaInput();
    const r = drawer ? drawer.getBoundingClientRect() : null;
    const ra = area ? area.getBoundingClientRect() : null;
    const innerH = window.innerHeight || 0;
    const visH = vv && vv.height ? Math.round(vv.height) : innerH;
    return {
        ih: innerH,
        vh: visH,
        ot: vv && vv.offsetTop ? Math.round(vv.offsetTop) : 0,
        ol: vv && vv.offsetLeft ? Math.round(vv.offsetLeft) : 0,
        sc: vv && vv.scale ? Math.round(vv.scale * 100) / 100 : 1,
        kb: Math.max(0, Math.round(innerH - visH)),
        base: alturaLayoutBase,
        red: alturaLayoutBase - innerH > 40,
        ab: tecladoAbiertoAhora,
        po: Math.round(padObjetivo),
        pa: Math.round(padActual),
        dtop: drawer ? drawer.style.top : '',
        dh: drawer ? drawer.style.height : '',
        rt: r ? Math.round(r.top) : 0,
        rb: r ? Math.round(r.bottom) : 0,
        ib: ra ? Math.round(ra.bottom) : 0,
        sy: Math.round(window.scrollY || 0)
    };
}
// === FIN DIAGNOSTICO TEMPORAL ===

// Desplazamiento vertical que aporta el transform de CSS de un elemento
// (0 si no tiene).
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
// Altura de la cabecera de la app (el cajón empieza justo debajo).
let altoCabeceraMem = 0;
function altoCabecera() {
    if (!altoCabeceraMem) {
        const h = document.getElementById('main-header');
        altoCabeceraMem = h && h.offsetHeight ? Math.round(h.offsetHeight) : 0;
    }
    return altoCabeceraMem;
}
// Fija la geometría del cajón en píxeles: empieza JUSTO DEBAJO DE LA CABECERA y
// llega hasta el borde inferior de la pantalla. Su CAJA no cambia nunca, así que
// su fondo siempre cubre lo mismo y no hay destellos.
function pinCajonTeclado() {
    if (!drawer) return;
    const alto = alturaLayoutBase || window.innerHeight || 0;
    if (!alto) return;
    const cab = altoCabecera();
    // Salvaguardas: nunca menos de 0 ni más de la mitad de la pantalla.
    const top = Math.max(0, Math.min(cab || Math.round(alto * 0.2), Math.round(alto * 0.5)));
    const h = Math.max(120, alto - top);
    if (drawer.style.top === top + 'px' && drawer.style.height === h + 'px' && drawer.style.bottom === 'auto') return;
    drawer.style.top = top + 'px';
    drawer.style.height = h + 'px';
    drawer.style.bottom = 'auto';
    // El rectángulo de fondo debe llegar exactamente hasta el borde del cajón.
    document.documentElement.style.setProperty('--cajon-top', top + 'px');
}
function despinCajonTeclado() {
    if (!drawer) return;
    drawer.style.top = '';
    drawer.style.height = '';
    drawer.style.bottom = '';
}
// Mientras el teclado está abierto el nav no debe verse (taparía la zona del
// input). Se oculta con estilo INLINE para que no lo reviva ninguna regla CSS.
function ocultarNavTeclado(ocultar) {
    if (!nav) return;
    const valor = ocultar ? 'none' : '';
    if (nav.style.display !== valor) nav.style.display = valor;
}
// El navegador desplaza el viewport VISUAL (visualViewport.offsetTop) para
// "mostrar" el input enfocado. Ese desplazamiento mueve TODO en pantalla, y era
// lo que hacía que la sección de comentarios subiera y volviera. Lo compensamos
// con el MISMO valor y sin transición, y lo seguimos FRAME A FRAME (los eventos
// del viewport pueden llegar a saltos): así en pantalla no se mueve nada.
function compensarPanCajon(pan, activo) {
    if (!drawer || swipePulling) return;
    const objetivo = activo && pan > 1 ? 'translateY(' + Math.round(pan) + 'px)' : '';
    if (drawer.style.transform !== objetivo) {
        drawer.style.transition = 'none';
        drawer.style.transform = objetivo;
    }
}
let panCompensado = -1, panActivoCompensado = null;
const panOriginales = new Map();
function compensarPagina(pan, activo) {
    const redondeado = Math.round(pan);
    if (redondeado === panCompensado && activo === panActivoCompensado) return;
    panCompensado = redondeado;
    panActivoCompensado = activo;
    const els = [];
    document.querySelectorAll('.app-container > *').forEach(el => { if (el !== drawer) els.push(el); });
    document.querySelectorAll('body > *').forEach(el => {
        if (el === drawer || el.contains(drawer)) return;   // el cajón y sus contenedores
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') return;
        els.push(el);
    });
    const aplicar = activo && redondeado > 1;
    for (const el of els) {
        if (!panOriginales.has(el)) panOriginales.set(el, el.style.transform || '');
        const orig = panOriginales.get(el);
        const objetivo = aplicar ? (orig ? orig + ' ' : '') + 'translateY(' + redondeado + 'px)' : orig;
        if (el.style.transform !== objetivo) el.style.transform = objetivo;
    }
}
// Seguimiento continuo del desplazamiento del viewport mientras se escribe.
function buclePanTeclado() {
    if (!tecladoAbiertoAhora) { rafPan = null; return; }
    const vv = window.visualViewport;
    if (vv) {
        const pan = Math.max(0, Math.round(vv.offsetTop || 0));
        if (pan !== ultimoPanAplicado) {
            ultimoPanAplicado = pan;
            compensarPanCajon(pan, true);
            compensarPagina(pan, true);
        }
    }
    if (DIAG_ON) diagFrame(diagSnapshot());                  // DIAGNOSTICO TEMPORAL
    rafPan = requestAnimationFrame(buclePanTeclado);
}
function aplicarPad() {
    if (!drawer) return;
    drawer.style.paddingBottom = padActual > 0.5 ? padActual + 'px' : '';
}
// El espacio que ocupa el teclado se reserva con padding-bottom del CAJÓN: la
// lista se ENCOGE (no se superpone nada) y el input queda justo encima del
// teclado. La caja del cajón no cambia (su fondo sigue cubriendo igual), así que
// no hay destellos, y la lista queda totalmente visible y utilizable.
function animarPadTeclado() {
    const diff = padObjetivo - padActual;
    if (Math.abs(diff) < 0.5) {
        padActual = padObjetivo;
        aplicarPad();
        rafPad = null;
        if (!tecladoAbiertoAhora && padObjetivo <= 0.5) {
            document.body.classList.remove('teclado-abierto');
        }
        return;
    }
    padActual += diff * SUAVIZADO_PAD;
    aplicarPad();
    rafPad = requestAnimationFrame(animarPadTeclado);
}
// Cuánto espacio hay que reservar para que el input quede justo sobre el teclado.
function padNecesario() {
    const vv = window.visualViewport;
    const area = areaInput();
    if (!vv || !area || !drawer || !tecladoAbiertoAhora) return 0;
    // vv.height es el borde del teclado EN PANTALLA (el desplazamiento del
    // viewport ya está compensado moviendo el cajón).
    const natural = area.getBoundingClientRect().bottom - transformY(drawer) + padActual;
    return Math.max(0, Math.round(natural - vv.height));
}
function resetEstadoTeclado() {
    padObjetivo = 0;
    padActual = 0;
    tecladoAbiertoAhora = false;
    scrollBloqueado = null;
    ultimoPanAplicado = -1;
    if (timerAsentado) { clearTimeout(timerAsentado); timerAsentado = null; }
    if (rafPad !== null) { cancelAnimationFrame(rafPad); rafPad = null; }
    if (rafPan !== null) { cancelAnimationFrame(rafPan); rafPan = null; }
    if (drawer) drawer.style.paddingBottom = '';
    compensarPanCajon(0, false);
    compensarPagina(0, false);
    if (fondoEl) fondoEl.classList.add('hidden');
    ocultarNavTeclado(false);
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
    // al fondo de la pantalla. NO depende del desplazamiento del viewport.
    const altoTeclado = Math.max(0, Math.round(window.innerHeight - vv.height));
    const layoutReducido = alturaLayoutBase - window.innerHeight > 40;
    tecladoAbiertoAhora = cajonVisible && (altoTeclado > TECLADO_UMBRAL || layoutReducido);
    if (tecladoAbiertoAhora) {
        document.body.classList.add('teclado-abierto');
        if (rafPan === null) rafPan = requestAnimationFrame(buclePanTeclado);
    }

    // El desplazamiento del viewport se compensa en el cajón y en lo que queda
    // detrás (el cavent, la cabecera...): en pantalla no se mueve nada.
    ultimoPanAplicado = pan;
    compensarPanCajon(pan, tecladoAbiertoAhora);
    compensarPagina(pan, tecladoAbiertoAhora);
    // Rectángulo del mismo tono del cajón, detrás de él: absorbe cualquier
    // destello o desajuste momentáneo al desplegarse el teclado.
    if (fondoEl) {
        const mostrarFondo = tecladoAbiertoAhora && cajonVisible;
        if (fondoEl.classList.contains('hidden') === mostrarFondo) {
            fondoEl.classList.toggle('hidden', !mostrarFondo);
        }
    }

    // Nav fuera de la vista mientras se escribe y geometría del cajón reafirmada.
    ocultarNavTeclado(tecladoAbiertoAhora);
    pinCajonTeclado();

    // Evitar que el navegador desplace la PÁGINA para "mostrar" el input.
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

    let nuevo = padNecesario();
    if (enGesto) {
        // Durante el gesto del teclado solo se avanza en su dirección: evita el
        // rebote por valores transitorios del viewport.
        nuevo = tecladoAbiertoAhora ? Math.max(nuevo, padObjetivo) : Math.min(nuevo, padObjetivo);
    }
    if (Math.abs(nuevo - padObjetivo) > 0.5) {
        padObjetivo = nuevo;
        if (rafPad === null) rafPad = requestAnimationFrame(animarPadTeclado);
    }

    // Al asentarse el teclado: corregir con el valor exacto y devolver el nav si
    // ya se cerró y el espacio volvió a cero.
    if (timerAsentado) clearTimeout(timerAsentado);
    timerAsentado = setTimeout(() => {
        timerAsentado = null;
        const exacto = padNecesario();
        if (Math.abs(exacto - padObjetivo) > 1) {
            padObjetivo = exacto;
            if (rafPad === null) rafPad = requestAnimationFrame(animarPadTeclado);
        }
        if (!tecladoAbiertoAhora && padObjetivo <= 0.5) {
            document.body.classList.remove('teclado-abierto');
        }
        if (DIAG_ON) diagTick('asentado', diagSnapshot());   // DIAGNOSTICO TEMPORAL
    }, GESTO_MS + 40);

    if (DIAG_ON) diagTick('viewport', diagSnapshot());       // DIAGNOSTICO TEMPORAL
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

// === DIAGNOSTICO TEMPORAL: marcar el instante del foco y del blur ===
input?.addEventListener('focus', () => { if (DIAG_ON) diagTick('focus', diagSnapshot()); });
input?.addEventListener('blur',  () => { if (DIAG_ON) diagTick('blur',  diagSnapshot()); });
// === FIN DIAGNOSTICO TEMPORAL ===

// Cerrar al hacer clic en el fondo oscuro
drawer?.addEventListener('click', (e) => {
    if (e.target === drawer) cerrarComentarios();
});

// Swipe-down para cerrar
let swipeStartY = 0;
let swipeDist = 0;   // recorrido real del arrastre (NO se deduce del transform:
                     // el cajón también usa transform para compensar el viewport)
                     // (`swipePulling` se declara arriba)

drawer?.addEventListener('touchstart', (e) => {
    // Permitido TAMBIÉN con el teclado abierto: el usuario debe poder cerrar la
    // sección deslizando hacia abajo en cualquier momento. Solo se inicia si la
    // lista está arriba del todo, para no robar el scroll de los comentarios.
    if (lista.scrollTop <= 0) {
        swipeStartY = e.touches[0].clientY;
        swipePulling = true;
        swipeDist = 0;
    }
}, { passive: true });

drawer?.addEventListener('touchmove', (e) => {
    if (!swipePulling) return;
    const dist = e.touches[0].clientY - swipeStartY;
    if (dist > 5) {
        // Resistencia suave. Si el teclado está abierto, el desplazamiento se
        // suma a la compensación del viewport para que el cajón siga el dedo.
        swipeDist = Math.min(dist * 0.55, 150);
        const pan = tecladoAbiertoAhora ? Math.max(0, window.visualViewport?.offsetTop || 0) : 0;
        drawer.style.transition = 'none';
        drawer.style.transform = 'translateY(' + Math.round(pan + swipeDist) + 'px)';
    }
}, { passive: true });

drawer?.addEventListener('touchend', () => {
    if (!swipePulling) return;
    swipePulling = false;
    if (swipeDist > 80) {
        // Se cierra (también con el teclado abierto: se oculta todo).
        drawer.style.transform = '';
        drawer.style.transition = '';
        swipeDist = 0;
        cerrarComentarios();
        return;
    }
    // No llegó: vuelve suave a su sitio (conservando la compensación si el
    // teclado sigue abierto). En un toque simple no cierra nada.
    const pan = tecladoAbiertoAhora ? Math.max(0, window.visualViewport?.offsetTop || 0) : 0;
    drawer.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
    compensarPanCajon(pan, tecladoAbiertoAhora);
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
