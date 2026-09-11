// js/problogs.js
// ============================================================
// PROBLOGS: publicaciones de blog del artista sobre su proceso creativo.
// ------------------------------------------------------------
// Tres partes:
//   1. EDITOR de bloques (párrafo / imagen) que el autor ordena.
//   2. FEED de publicaciones en la sección #problogs.
//   3. VISTA DE LECTURA de una publicación completa.
//
// SEGURIDAD: todo el texto del usuario pasa por renderText() (escapa y
// normaliza entidades) y toda imagen por safeImgUrl()/cloudinaryUrl(), según la
// regla del README. El texto es PLANO a propósito: el formato (negritas,
// enlaces) es lo que abriría la puerta a inyección de HTML. El justificado es
// solo CSS.
//
// Las imágenes usan el MISMO esquema de slots que los Cavents (imagen_0..4), y
// el backend las devuelve como array POSICIONAL de 5: el índice ES el slot, así
// que cada bloque resuelve su imagen con imagenes[slot] sin ambigüedad.
// ============================================================
import { API_BASE_URL, apiRequest, getAuthToken } from './config.js?v=2e0c2e7288';
import { renderText, escapeHtml, safeImgUrl, cloudinaryUrl, debugLog } from './utils.js?v=d86e42a5e7';
import { showSuccess, showError } from './notificaciones.js?v=d2867c8ca0';

const MAX_IMAGENES = 5;
const MAX_TEXTO = 20000;
const MAX_PIE = 300;

let form, tituloEl, bloquesEl, etiquetasEl, addTextoBtn, addImagenBtn, contadorEl, guardarBtn, limpiarBtn;
let feedEl, detalleEl, seccionEl;

// bloques: [{ tipo:'texto', contenido } | { tipo:'imagen', slot, pie, file?, previewUrl? }]
let bloques = [];
let observandoSeccion = false;
let feedCargado = false;
let guardando = false;

// ============================================================
// UTILIDADES
// ============================================================
function fechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Primer slot libre de 0 a MAX-1 que no esté ocupado por otro bloque de imagen.
function slotLibre() {
    const usados = new Set(bloques.filter((b) => b.tipo === 'imagen').map((b) => b.slot));
    for (let i = 0; i < MAX_IMAGENES; i++) {
        if (!usados.has(i)) return i;
    }
    return -1;
}

function contarImagenes() {
    return bloques.filter((b) => b.tipo === 'imagen').length;
}

function actualizarContador() {
    if (contadorEl) {
        contadorEl.textContent = contarImagenes() + ' / ' + MAX_IMAGENES + ' imágenes';
    }
    if (addImagenBtn) {
        addImagenBtn.disabled = contarImagenes() >= MAX_IMAGENES;
    }
}

// ============================================================
// EDITOR: pintar los bloques
// Se re-pinta la lista entera en cada cambio: con un máximo de 100 bloques es
// barato, y evita tener que sincronizar el DOM a mano bloque por bloque (que es
// de donde salen los estados inconsistentes). Los valores se recogen del DOM
// ANTES de repintar, para no perder lo que el usuario escribió.
// ============================================================
function recogerDelDom() {
    if (!bloquesEl) return;
    bloquesEl.querySelectorAll('.problog-bloque').forEach((el) => {
        const i = parseInt(el.dataset.indice, 10);
        if (isNaN(i) || !bloques[i]) return;
        if (bloques[i].tipo === 'texto') {
            const ta = el.querySelector('.problog-bloque-texto');
            if (ta) bloques[i].contenido = ta.value;
        } else {
            const pie = el.querySelector('.problog-bloque-pie');
            if (pie) bloques[i].pie = pie.value;
        }
    });
}

function pintarBloques() {
    if (!bloquesEl) return;
    if (bloques.length === 0) {
        bloquesEl.innerHTML = '<p class="problog-vacio">Añade un párrafo o una imagen para empezar.</p>';
        actualizarContador();
        return;
    }

    bloquesEl.innerHTML = bloques.map((b, i) => {
        const acciones = `
            <div class="problog-bloque-acciones">
                <button type="button" class="problog-btn-icono" data-accion="subir" data-indice="${i}" title="Subir" aria-label="Subir"${i === 0 ? ' disabled' : ''}>▲</button>
                <button type="button" class="problog-btn-icono" data-accion="bajar" data-indice="${i}" title="Bajar" aria-label="Bajar"${i === bloques.length - 1 ? ' disabled' : ''}>▼</button>
                <button type="button" class="problog-btn-icono problog-btn-borrar" data-accion="borrar" data-indice="${i}" title="Borrar" aria-label="Borrar">✕</button>
            </div>`;

        if (b.tipo === 'texto') {
            return `
                <div class="problog-bloque" data-indice="${i}" data-tipo="texto">
                    <div class="problog-bloque-cab">
                        <span class="problog-bloque-tipo">Párrafo</span>
                        ${acciones}
                    </div>
                    <textarea class="problog-bloque-texto" maxlength="${MAX_TEXTO}" placeholder="Escribe aquí…">${escapeHtml(b.contenido || '')}</textarea>
                </div>`;
        }

        const slot = b.slot;
        const vista = b.previewUrl || b.url || '';
        const idFile = 'problog-file-' + slot;
        return `
            <div class="problog-bloque" data-indice="${i}" data-tipo="imagen" data-slot="${slot}">
                <div class="problog-bloque-cab">
                    <span class="problog-bloque-tipo">Imagen ${slot + 1}</span>
                    ${acciones}
                </div>
                <div class="problog-bloque-imagen">
                    ${vista
                        ? `<img class="problog-preview" src="${safeImgUrl(vista)}" alt="">`
                        : '<div class="problog-preview problog-preview-vacia">Sin imagen</div>'}
                    <input type="file" id="${idFile}" class="problog-file" accept="image/*" data-slot="${slot}">
                    <label for="${idFile}" class="problog-file-label">${vista ? 'Cambiar imagen' : 'Elegir imagen'}</label>
                </div>
                <input type="text" class="problog-bloque-pie" maxlength="${MAX_PIE}" placeholder="Pie de foto (opcional)" value="${escapeHtml(b.pie || '')}">
            </div>`;
    }).join('');

    actualizarContador();
}

function anadirTexto(contenido) {
    recogerDelDom();
    bloques.push({ tipo: 'texto', contenido: contenido || '' });
    pintarBloques();
    const areas = bloquesEl.querySelectorAll('.problog-bloque-texto');
    const ultima = areas[areas.length - 1];
    if (ultima) ultima.focus();
}

function anadirImagen() {
    recogerDelDom();
    const slot = slotLibre();
    if (slot === -1) return;
    bloques.push({ tipo: 'imagen', slot: slot, pie: '' });
    pintarBloques();
}

function moverBloque(i, delta) {
    recogerDelDom();
    const j = i + delta;
    if (j < 0 || j >= bloques.length) return;
    const tmp = bloques[i];
    bloques[i] = bloques[j];
    bloques[j] = tmp;
    pintarBloques();
}

function borrarBloque(i) {
    recogerDelDom();
    const b = bloques[i];
    if (b && b.previewUrl) URL.revokeObjectURL(b.previewUrl);
    bloques.splice(i, 1);
    pintarBloques();
}

function limpiarEditor() {
    bloques.forEach((b) => { if (b.previewUrl) URL.revokeObjectURL(b.previewUrl); });
    bloques = [];
    if (tituloEl) tituloEl.value = '';
    if (etiquetasEl) etiquetasEl.value = '';
    const publicado = document.querySelector('input[name="problog-estado"][value="publicado"]');
    if (publicado) publicado.checked = true;
    // Arranca con un párrafo vacío para poder escribir de inmediato.
    bloques.push({ tipo: 'texto', contenido: '' });
    pintarBloques();
}

// ============================================================
// GUARDAR
// ============================================================
async function guardar(e) {
    if (e) e.preventDefault();
    if (guardando) return;
    recogerDelDom();

    const titulo = (tituloEl && tituloEl.value || '').trim();
    if (!titulo) {
        showError('La publicación necesita un título.');
        if (tituloEl) tituloEl.focus();
        return;
    }

    // Solo se envían bloques con contenido real: los párrafos vacíos y las
    // imágenes sin archivo se descartan antes de salir. Se hace así a propósito
    // (y no bloqueando el guardado) para que sea coherente: un bloque vacío es
    // visible en el editor y simplemente no se publica.
    const limpios = [];
    for (const b of bloques) {
        if (b.tipo === 'texto') {
            if ((b.contenido || '').trim()) limpios.push({ tipo: 'texto', contenido: b.contenido });
        } else if (b.tipo === 'imagen' && b.file) {
            limpios.push({ tipo: 'imagen', slot: b.slot, pie: (b.pie || '').trim() });
        }
    }
    if (limpios.length === 0) {
        showError('Añade al menos un párrafo o una imagen.');
        return;
    }

    const formData = new FormData();
    formData.append('titulo', titulo);
    formData.append('bloques', JSON.stringify(limpios));
    formData.append('etiquetas', (etiquetasEl && etiquetasEl.value || '').trim());
    const estadoSel = document.querySelector('input[name="problog-estado"]:checked');
    formData.append('estado', estadoSel ? estadoSel.value : 'publicado');
    // Los archivos van por slot, igual que en un Cavent.
    limpios.forEach((b) => {
        if (b.tipo !== 'imagen') return;
        const original = bloques.find((x) => x.tipo === 'imagen' && x.slot === b.slot);
        if (original && original.file) formData.append('imagen_' + b.slot, original.file);
    });

    guardando = true;
    if (guardarBtn) { guardarBtn.disabled = true; guardarBtn.textContent = 'Guardando…'; }
    try {
        const token = getAuthToken();
        const res = await fetch(API_BASE_URL + '/problogs', {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.success) {
            showSuccess(data.message || 'Publicación guardada.');
            limpiarEditor();
            feedCargado = false;      // el feed se recargará al abrir la sección
        } else {
            showError((data && data.error) || 'No se pudo guardar la publicación.');
        }
    } catch (err) {
        debugLog.error('Error guardando problog:', err);
        showError('Error de conexión al guardar.');
    } finally {
        guardando = false;
        if (guardarBtn) { guardarBtn.disabled = false; guardarBtn.textContent = 'Publicar'; }
    }
}

// ============================================================
// FEED
// ============================================================
function tarjetaProblog(p) {
    const imagenes = p.imagenes || [];
    const portada = imagenes.find((u) => !!u) || '';
    const autor = p.nombre_artista || 'Artista';
    const inicial = (autor || '?').trim().charAt(0).toUpperCase() || '?';
    const avatar = p.foto_artista
        ? `<img class="problog-card-avatar" src="${safeImgUrl(p.foto_artista)}" alt="">`
        : `<span class="problog-card-avatar problog-card-avatar-def">${escapeHtml(inicial)}</span>`;

    // Extracto: el primer bloque de texto.
    let extracto = '';
    const primerTexto = (p.bloques || []).find((b) => b.tipo === 'texto');
    if (primerTexto) {
        const t = String(primerTexto.contenido || '').replace(/\s+/g, ' ').trim();
        extracto = t.length > 160 ? t.slice(0, 160) + '…' : t;
    }

    return `
        <article class="problog-card" data-id="${p.id}">
            ${portada ? `<div class="problog-card-portada"><img src="${safeImgUrl(cloudinaryUrl(portada, 600))}" alt="" loading="lazy"></div>` : ''}
            <div class="problog-card-cuerpo">
                <h3 class="problog-card-titulo">${renderText(p.titulo)}</h3>
                ${extracto ? `<p class="problog-card-extracto">${renderText(extracto)}</p>` : ''}
                <div class="problog-card-pie">
                    ${avatar}
                    <span class="problog-card-autor">${renderText(autor)}</span>
                    <span class="problog-card-fecha">${escapeHtml(fechaCorta(p.created_at))}</span>
                </div>
            </div>
        </article>`;
}

async function cargarFeed() {
    if (!feedEl) return;
    feedEl.innerHTML = '<p class="problogs-cargando">Cargando publicaciones…</p>';
    try {
        const data = await apiRequest('/problogs?limit=20');
        const lista = (data && data.problogs) || [];
        if (!lista.length) {
            feedEl.innerHTML = '<p class="problogs-vacio">Todavía no hay publicaciones. ¡Sé el primero en contar tu proceso!</p>';
        } else {
            feedEl.innerHTML = lista.map(tarjetaProblog).join('');
        }
        feedCargado = true;
    } catch (err) {
        debugLog.error('Error cargando problogs:', err);
        feedEl.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
    }
}

// ============================================================
// VISTA DE LECTURA
// ============================================================
function pintarLectura(p) {
    const imagenes = p.imagenes || [];
    const autor = p.nombre_artista || 'Artista';
    const bloquesHTML = (p.bloques || []).map((b) => {
        if (b.tipo === 'texto') {
            // pre-wrap + justificado: respeta los párrafos tal como los escribió
            // el autor, sin interpretar nada como HTML.
            return `<p class="problog-lectura-texto">${renderText(b.contenido)}</p>`;
        }
        const url = imagenes[b.slot];
        if (!url) return '';   // el backend ya filtra estos, pero por si acaso
        return `
            <figure class="problog-lectura-figura">
                <img src="${safeImgUrl(cloudinaryUrl(url, 1080))}" alt="" loading="lazy">
                ${b.pie ? `<figcaption>${renderText(b.pie)}</figcaption>` : ''}
            </figure>`;
    }).join('');

    return `
        <button type="button" class="problog-volver" id="problog-volver">← Volver</button>
        <header class="problog-lectura-cab">
            <h2 class="problog-lectura-titulo">${renderText(p.titulo)}</h2>
            <p class="problog-lectura-meta">${renderText(autor)} · ${escapeHtml(fechaCorta(p.created_at))}</p>
        </header>
        <div class="problog-lectura-cuerpo">${bloquesHTML}</div>`;
}

async function abrirLectura(id) {
    if (!detalleEl || !feedEl) return;
    detalleEl.innerHTML = '<p class="problogs-cargando">Cargando…</p>';
    detalleEl.classList.remove('hidden');
    feedEl.classList.add('hidden');
    try {
        const data = await apiRequest('/problogs/' + id);
        if (!data || data.success === false || !data.id) {
            detalleEl.innerHTML = '<p class="problogs-vacio">No se pudo abrir la publicación.</p>';
            return;
        }
        detalleEl.innerHTML = pintarLectura(data);
    } catch (err) {
        debugLog.error('Error abriendo problog:', err);
        detalleEl.innerHTML = '<p class="problogs-vacio">No se pudo abrir la publicación.</p>';
    }
}

function cerrarLectura() {
    if (!detalleEl || !feedEl) return;
    detalleEl.classList.add('hidden');
    detalleEl.innerHTML = '';
    feedEl.classList.remove('hidden');
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
export function setupProblogs() {
    form = document.getElementById('problog-form');
    if (!form) return;   // la sección no está en esta página

    tituloEl = document.getElementById('problog-titulo');
    bloquesEl = document.getElementById('problog-bloques');
    etiquetasEl = document.getElementById('problog-etiquetas');
    addTextoBtn = document.getElementById('problog-add-texto');
    addImagenBtn = document.getElementById('problog-add-imagen');
    contadorEl = document.getElementById('problog-contador-imagenes');
    guardarBtn = document.getElementById('problog-guardar');
    limpiarBtn = document.getElementById('problog-limpiar');
    feedEl = document.getElementById('problogs-feed');
    detalleEl = document.getElementById('problogs-detalle');
    seccionEl = document.getElementById('problogs');

    addTextoBtn?.addEventListener('click', () => anadirTexto());
    addImagenBtn?.addEventListener('click', () => anadirImagen());
    limpiarBtn?.addEventListener('click', limpiarEditor);
    form.addEventListener('submit', guardar);

    // Delegación: un solo listener para todos los botones de los bloques.
    bloquesEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        const i = parseInt(btn.dataset.indice, 10);
        if (isNaN(i)) return;
        if (btn.dataset.accion === 'subir') moverBloque(i, -1);
        else if (btn.dataset.accion === 'bajar') moverBloque(i, 1);
        else if (btn.dataset.accion === 'borrar') borrarBloque(i);
    });

    // Al elegir un archivo se guarda el File en su bloque y se muestra la vista
    // previa local (sin subirlo todavía: se sube al publicar).
    bloquesEl?.addEventListener('change', (e) => {
        const input = e.target.closest('.problog-file');
        if (!input || !input.files || !input.files[0]) return;
        const slot = parseInt(input.dataset.slot, 10);
        const b = bloques.find((x) => x.tipo === 'imagen' && x.slot === slot);
        if (!b) return;
        if (b.previewUrl) URL.revokeObjectURL(b.previewUrl);
        b.file = input.files[0];
        b.previewUrl = URL.createObjectURL(b.file);
        pintarBloques();
    });

    // El feed se abre con el icono del header. Se OBSERVA la clase de la sección
    // en vez de engancharse a ese botón: así funciona sin depender de quién la
    // muestre (galeria-ui la toca desde varios sitios).
    if (seccionEl && !observandoSeccion) {
        observandoSeccion = true;
        const aplicar = () => {
            const visible = !seccionEl.classList.contains('hidden');
            if (visible && !feedCargado) cargarFeed();
        };
        new MutationObserver(aplicar).observe(seccionEl, { attributes: true, attributeFilter: ['class'] });
        aplicar();
    }

    // Clic en una tarjeta -> vista de lectura. Delegado en el feed.
    feedEl?.addEventListener('click', (e) => {
        const card = e.target.closest('.problog-card');
        if (card) abrirLectura(card.dataset.id);
    });
    detalleEl?.addEventListener('click', (e) => {
        if (e.target.closest('#problog-volver')) cerrarLectura();
    });

    // Al entrar en la pestaña Problogs, el editor arranca con un párrafo listo.
    document.getElementById('tab-problogs')?.addEventListener('click', () => {
        if (bloques.length === 0) limpiarEditor();
    });

    limpiarEditor();
}
