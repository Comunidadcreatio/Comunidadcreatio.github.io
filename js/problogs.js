// js/problogs.js
// ============================================================
// PROBLOGS: publicaciones de blog del artista sobre su proceso creativo.
// ------------------------------------------------------------
// Cuatro partes:
//   1. EDITOR: el marco es un campo editable donde el autor escribe seguido y
//      las imÃ¡genes entran como etiquetas <image>nombre.jpg</image>.
//   2. FEED de publicaciones en la secciÃ³n #problogs, con filtro Todas / MÃ­as.
//   3. VISTA DE LECTURA de una publicaciÃ³n completa.
//   4. EDICIÃ“N y BORRADO de las propias.
//
// SEGURIDAD: todo el texto del usuario pasa por renderText() (escapa y
// normaliza entidades) y toda imagen por safeImgUrl()/cloudinaryUrl(), segÃºn la
// regla del README. El justificado es solo CSS.
//
// Hay DOS marcas de texto, y ninguna es HTML del usuario:
//   - <image>nombre.jpg</image>  ->  se parte en bloques antes de salir y, al
//     pintarse, se sustituye por la imagen de verdad.
//   - Un subconjunto de Markdown (negrita, cursiva, cÃ³digo, tÃ­tulos, listas,
//     citas y enlaces): renderMarkdown() ESCAPA primero el texto y solo despuÃ©s
//     cambia las marcas por etiquetas nuestras. Por eso escribir <script> sale
//     como texto y un enlace con javascript: no se convierte en enlace.
//
// Las imÃ¡genes usan el MISMO esquema de slots que los Cavents (imagen_0..4), y
// el backend las devuelve como array POSICIONAL de 5: el Ã­ndice ES el slot, asÃ­
// que cada bloque resuelve su imagen con imagenes[slot] sin ambigÃ¼edad. Por eso
// las imÃ¡genes ya guardadas conservan su slot aunque el autor las mueva de
// sitio en el texto: no hay que volver a subirlas.
//
// El filtro "MÃ­as" no es un adorno: los borradores NO aparecen en el feed
// pÃºblico, asÃ­ que sin una lista propia una publicaciÃ³n guardada como borrador
// quedarÃ­a imposible de encontrar y de editar.
// ============================================================
import { API_BASE_URL, apiRequest, getAuthToken } from './config.js?v=ec4a7fca01';
import { renderText, escapeHtml, safeImgUrl, cloudinaryUrl, debugLog, decodeHTMLEntities } from './utils.js?v=819fea05c7';
import { showSuccess, showError, showConfirm } from './notificaciones.js?v=d2867c8ca0';
import { abrirCrearDesdeIcono, volverDesdeIcono, toggleProblogs } from './galeria-ui.js?v=639d930e95';
// El cajÃ³n de comentarios es el MISMO que el de las obras: se le pasa 'problogs'
// para que construya las rutas de este recurso.
import { abrirComentarios } from './comentarios.js?v=93773d457e';
import { registrarOverlay } from './overlays.js?v=6e3a9a3bd5';
// La vista previa se muestra a pantalla completa: se congela el fondo con el
// mismo mecanismo que el cajÃ³n de comentarios.
import { bloquearFondo, liberarFondo } from './bloqueo-fondo.js?v=dd51e51820';
// Solo para firmar la vista previa con el nombre del artista.
import { artistaActual } from './auth.js?v=000cc3408c';

const MAX_IMAGENES = 8;
const MAX_TEXTO = 20000;
const MIN_ALTO_CONTENIDO = 260;
// A partir de cuÃ¡nto se considera que la ventana visible se encogiÃ³ por el teclado.
const TECLADO_UMBRAL = 100;

let form, tituloEl, contenidoEl, archivoEl, etiquetasEl, addImagenBtn, guardarBtn, limpiarBtn, vistaPreviaBtn, portadasEl;
let feedEl, detalleEl, seccionEl, filtroTodasBtn, filtroMiasBtn, masBtn;

// ImÃ¡genes del contenido en curso, por el nombre que aparece en la etiqueta:
//   locales   -> { file, previewUrl }  (elegidas y todavÃ­a sin subir)
//   guardadas -> { slot, url, pie }    (ya en el servidor, al editar)
let imagenesLocales = new Map();
let imagenesGuardadas = new Map();
// CuÃ¡l de esas imÃ¡genes va de portada (por nombre; el slot se resuelve al guardar).
let portadaNombre = null;
let observandoSeccion = false;
let feedCargado = false;
let guardando = false;
// Estado con el que se guardarÃ¡: 'publicado' al crear y el que tuviera la
// publicaciÃ³n al editar (asÃ­ un borrador antiguo no se publica sin querer).
let estadoActual = 'publicado';

// PaginaciÃ³n del feed
const POR_PAGINA = 10;
let paginaFeed = 1;
let hayMasFeed = false;
let cargandoFeed = false;
let observadorFeed = null;

// Estado de ediciÃ³n
let editandoId = null;        // null = creando; si no, id de la publicaciÃ³n
let modoMias = false;         // false = feed pÃºblico; true = mis publicaciones
let publicacionAbierta = null;

// ============================================================
// UTILIDADES
// ============================================================
// Tiempo TRANSCURRIDO desde que se publicÃ³ (Â«hace 5 minutosÂ», Â«hace 2 dÃ­asÂ»).
function tiempoTranscurrido(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const segundos = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (segundos < 60) return 'ahora mismo';
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return 'hace ' + minutos + (minutos === 1 ? ' minuto' : ' minutos');
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return 'hace ' + horas + (horas === 1 ? ' hora' : ' horas');
    const dias = Math.floor(horas / 24);
    if (dias < 7) return 'hace ' + dias + (dias === 1 ? ' dÃ­a' : ' dÃ­as');
    if (dias < 30) {
        const semanas = Math.floor(dias / 7);
        return 'hace ' + semanas + (semanas === 1 ? ' semana' : ' semanas');
    }
    if (dias < 365) {
        const meses = Math.floor(dias / 30);
        return 'hace ' + meses + (meses === 1 ? ' mes' : ' meses');
    }
    const anios = Math.floor(dias / 365);
    return 'hace ' + anios + (anios === 1 ? ' aÃ±o' : ' aÃ±os');
}

// Avatar del autor: su foto o, si no tiene, su inicial. La clase se pasa para
// poder usar el mismo trozo en la tarjeta y en la vista de lectura.
function avatarHTML(p, clase) {
    const autor = decodeHTMLEntities((p && p.nombre_artista) || 'Artista');
    const inicial = autor.trim().charAt(0).toUpperCase() || '?';
    return (p && p.foto_artista)
        ? `<img class="${clase}" src="${safeImgUrl(p.foto_artista)}" alt="">`
        : `<span class="${clase} problog-card-avatar-def">${escapeHtml(inicial)}</span>`;
}

// Iconos de las acciones propias (editar y eliminar).
const ICONO_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICONO_BORRAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// Acciones de una publicaciÃ³n propia, en iconos, para ponerlas junto al tiempo.
function accionesIconosHTML(p) {
    return `<span class="problog-acciones-iconos">` +
        `<button type="button" class="problog-accion-icono" data-problog-editar="${p.id}" title="Editar" aria-label="Editar">${ICONO_EDITAR}</button>` +
        `<button type="button" class="problog-accion-icono problog-accion-icono-borrar" data-problog-eliminar="${p.id}" title="Eliminar" aria-label="Eliminar">${ICONO_BORRAR}</button>` +
        `</span>`;
}

// ============================================================
// CONTENIDO: TEXTO CON ETIQUETAS DE IMAGEN
// ------------------------------------------------------------
// El marco es un campo editable de verdad: el autor escribe seguido y, al
// aÃ±adir una imagen, se inserta su etiqueta <image>nombre.jpg</image> justo
// donde tenÃ­a el cursor. Al guardar, ese texto se parte en los bloques que
// entiende el servidor (texto / imagen); en la vista previa y en la lectura,
// cada etiqueta se ve como la imagen de verdad.
// ============================================================
const RE_IMAGEN = /<image>\s*([^<>\n]+?)\s*<\/image>/gi;

// Parte el texto en tramos: { tipo:'texto', contenido } | { tipo:'imagen', nombre }
function analizarContenido(texto) {
    const tramos = [];
    const t = String(texto || '');
    let ultimo = 0;
    RE_IMAGEN.lastIndex = 0;
    let m;
    while ((m = RE_IMAGEN.exec(t)) !== null) {
        const antes = t.slice(ultimo, m.index);
        if (antes.trim()) tramos.push({ tipo: 'texto', contenido: antes });
        tramos.push({ tipo: 'imagen', nombre: m[1] });
        ultimo = m.index + m[0].length;
    }
    const resto = t.slice(ultimo);
    if (resto.trim()) tramos.push({ tipo: 'texto', contenido: resto });
    return tramos;
}

// Nombre de archivo de una imagen ya guardada, sacado de su URL.
function nombreDeUrl(url) {
    const limpio = String(url || '').split('?')[0].split('#')[0];
    const partes = limpio.split('/');
    return partes[partes.length - 1] || 'imagen.jpg';
}

// El nombre es lo que identifica la etiqueta, asÃ­ que no puede repetirse.
function nombreUnico(nombre) {
    const base = String(nombre || '').trim().replace(/[<>/\\]/g, '') || 'imagen.jpg';
    const usado = (n) => imagenesLocales.has(n) || imagenesGuardadas.has(n);
    if (!usado(base)) return base;
    const punto = base.lastIndexOf('.');
    const raiz = punto > 0 ? base.slice(0, punto) : base;
    const ext = punto > 0 ? base.slice(punto) : '';
    let i = 2;
    while (usado(raiz + '-' + i + ext)) i++;
    return raiz + '-' + i + ext;
}

function contarImagenes() {
    return analizarContenido(contenidoEl ? contenidoEl.value : '')
        .filter((t) => t.tipo === 'imagen').length;
}

// El nÃºmero de imÃ¡genes no se enseÃ±a (se quitÃ³ el contador), pero sigue
// haciendo falta para no pasar del mÃ¡ximo: el icono se desactiva al llegar.
// De paso se repintan los cuadros de portada, que dependen de las imÃ¡genes que
// haya en el texto.
function actualizarContador() {
    const n = contarImagenes();
    if (addImagenBtn) addImagenBtn.disabled = n >= MAX_IMAGENES;
    pintarPortadas();
}

// ImÃ¡genes que hay ahora mismo en el contenido, en el orden en que aparecen.
function imagenesDelContenido() {
    const vistas = new Set();
    const lista = [];
    analizarContenido(contenidoEl ? contenidoEl.value : '').forEach((t) => {
        if (t.tipo !== 'imagen' || vistas.has(t.nombre)) return;
        vistas.add(t.nombre);
        const local = imagenesLocales.get(t.nombre);
        const guardada = imagenesGuardadas.get(t.nombre);
        const url = (local && local.previewUrl) || (guardada && guardada.url) || '';
        if (url) lista.push({ nombre: t.nombre, url: url });
    });
    return lista;
}

// Los cuadros de Â«Imagen de portadaÂ»: uno por cada imagen que se puede subir.
// Los que no tienen imagen salen vacÃ­os (para que se vea el hueco que queda) y
// el elegido lleva la marca. Si la portada elegida desaparece del texto, se cae
// a la primera imagen.
function pintarPortadas() {
    if (!portadasEl) return;
    const lista = imagenesDelContenido();
    if (portadaNombre && !lista.some((i) => i.nombre === portadaNombre)) portadaNombre = null;
    if (!portadaNombre && lista.length > 0) portadaNombre = lista[0].nombre;

    let html = '';
    for (let i = 0; i < MAX_IMAGENES; i++) {
        const img = lista[i];
        if (!img) {
            html += '<div class="problog-portada-cuadro vacio" aria-hidden="true"></div>';
            continue;
        }
        const elegida = img.nombre === portadaNombre;
        // La imagen ocupa el cuadro entero; la elegida se distingue por el borde
        // blanco mÃ¡s grueso, sin ninguna etiqueta encima.
        html += '<button type="button" class="problog-portada-cuadro' + (elegida ? ' elegida' : '') + '"' +
            ' data-portada="' + escapeHtml(img.nombre) + '"' +
            ' aria-pressed="' + (elegida ? 'true' : 'false') + '"' +
            ' title="' + (elegida ? 'Portada elegida' : 'Usar como portada') + '">' +
            '<img src="' + safeImgUrl(img.url) + '" alt="">' +
            '</button>';
    }
    portadasEl.innerHTML = html;
}

// El marco crece con lo que se escribe, sin scroll propio.
function ajustarAltoContenido() {
    if (!contenidoEl) return;
    // Con el panel OCULTO no se puede medir: scrollHeight vale 0 y el alto se
    // quedarÃ­a en el mÃ­nimo (260px) con el texto cortado. Pasa al preparar una
    // ediciÃ³n, que rellena el contenido antes de abrir el panel; en cuanto el
    // panel es visible se vuelve a medir (ver el listener de animationend).
    if (contenidoEl.offsetParent === null) return;
    contenidoEl.style.height = 'auto';
    contenidoEl.style.height = Math.max(MIN_ALTO_CONTENIDO, contenidoEl.scrollHeight) + 'px';
}

// Reintenta medir el alto hasta que el editor tenga layout. Se usa cuando el
// contenido se rellena con el panel todavÃ­a oculto (ediciÃ³n): el panel se abre
// en transiciÃ³n y hasta que no se pinta no hay nada que medir. En cuanto se
// puede medir se para; si nunca llega a verse, se rinde sin tocar nada.
function ajustarAltoContenidoCuandoSePueda(intentos = 25) {
    if (!contenidoEl) return;
    if (contenidoEl.offsetParent !== null) {
        ajustarAltoContenido();
        return;
    }
    if (intentos <= 0) return;
    setTimeout(() => ajustarAltoContenidoCuandoSePueda(intentos - 1), 100);
}

// Hueco de abajo: lo que tapan las barras fijas (nav + pestaÃ±as + barra de crear)
// no es un valor fijo, asÃ­ que se mide en vivo. Si no se ajusta, o el Ãºltimo
// campo (Etiquetas) queda detrÃ¡s de las barras, o sobra un vacÃ­o grande.
//
// Con el teclado abierto las barras y el nav quedan POR DETRÃS del teclado, asÃ­
// que no hay que reservarles nada: ahÃ­ el hueco baja al mÃ­nimo y el contenido
// termina justo donde se escribe (que es lo que se ve al bajar). La clase
// `problog-teclado` en el body sirve para quitar tambiÃ©n los otros rellenos
// inferiores (el del formulario y el del main) mientras el teclado estÃ¡ abierto.
function ajustarHuecoInferior() {
    const cont = document.getElementById('crear-problogs-contenido');
    if (!cont) return;
    const alto = (el) => (el ? el.getBoundingClientRect().height : 0);
    const reserva = alto(document.getElementById('toggle-panel'))
        + alto(document.getElementById('crear-tabs'))
        + alto(document.getElementById('problog-nav-bar'));

    // La ventana visible se encoge con el teclado. Se comparan las dos medidas
    // (innerHeight y clientHeight) porque segÃºn el navegador encoge una u otra.
    const vv = window.visualViewport;
    const layout = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const visual = vv ? vv.height : layout;
    const teclado = (layout - visual) > TECLADO_UMBRAL;

    document.body.classList.toggle('problog-teclado', teclado);
    cont.style.paddingBottom = Math.round((teclado ? 0 : reserva) + (teclado ? 8 : 14)) + 'px';
}

// Escribe donde estÃ¡ el cursor y deja el foco dentro.
function insertarEnContenido(texto) {
    if (!contenidoEl) return;
    const ini = typeof contenidoEl.selectionStart === 'number'
        ? contenidoEl.selectionStart : contenidoEl.value.length;
    const fin = typeof contenidoEl.selectionEnd === 'number' ? contenidoEl.selectionEnd : ini;
    contenidoEl.value = contenidoEl.value.slice(0, ini) + texto + contenidoEl.value.slice(fin);
    const pos = ini + texto.length;
    try { contenidoEl.setSelectionRange(pos, pos); } catch (e) { /* da igual */ }
    contenidoEl.focus();
    actualizarContador();
    ajustarAltoContenido();
}

// Icono de imagen: se elige el archivo y se inserta su etiqueta en el texto. El
// archivo se sube al publicar (o al guardar los cambios).
function anadirImagen() {
    if (!contenidoEl || !archivoEl) return;
    if (contarImagenes() >= MAX_IMAGENES) {
        showError('MÃ¡ximo ' + MAX_IMAGENES + ' imÃ¡genes por publicaciÃ³n.');
        return;
    }
    archivoEl.value = '';   // permite volver a elegir el mismo archivo
    archivoEl.click();
}

function alElegirImagen() {
    const file = archivoEl && archivoEl.files && archivoEl.files[0];
    if (!file) return;
    if (contarImagenes() >= MAX_IMAGENES) {
        showError('MÃ¡ximo ' + MAX_IMAGENES + ' imÃ¡genes por publicaciÃ³n.');
        return;
    }
    const nombre = nombreUnico(file.name);
    imagenesLocales.set(nombre, { file: file, previewUrl: URL.createObjectURL(file) });
    insertarEnContenido('<image>' + nombre + '</image>');
}

// ============================================================
// FORMATO LIGERO: LOS ICONOS DE MARKDOWN
// ------------------------------------------------------------
// Cada icono escribe sus marcas sobre lo que estÃ© seleccionado (o en el punto
// del cursor). Son las mismas marcas que luego interpreta renderMarkdown().
// ============================================================
const ENVUELTOS = {
    negrita: { antes: '**', despues: '**' },
    cursiva: { antes: '*', despues: '*' },
    enlace: { antes: '[', despues: '](url)' }
};
// Las alineaciones se quitan entre sÃ­: poner Â«centroÂ» donde habÃ­a Â«derechaÂ»
// cambia la marca, no la acumula.
const ALINEACIONES = [':izq: ', ':centro: ', ':der: ', ':just: '];
const PREFIJOS = {
    titulo: { marca: '# ', reemplaza: [] },
    lista: { marca: '- ', reemplaza: ['* ', '+ ', '1. '] },
    'lista-numerada': { marca: '1. ', reemplaza: ['- ', '* ', '+ '] },
    cita: { marca: '> ', reemplaza: [] },
    'alinear-izquierda': { marca: ':izq: ', reemplaza: ALINEACIONES },
    'alinear-centro': { marca: ':centro: ', reemplaza: ALINEACIONES },
    'alinear-derecha': { marca: ':der: ', reemplaza: ALINEACIONES },
    'alinear-justificar': { marca: ':just: ', reemplaza: ALINEACIONES }
};

function seleccionActual() {
    const v = contenidoEl ? contenidoEl.value : '';
    const ini = (contenidoEl && typeof contenidoEl.selectionStart === 'number')
        ? contenidoEl.selectionStart : v.length;
    const fin = (contenidoEl && typeof contenidoEl.selectionEnd === 'number')
        ? contenidoEl.selectionEnd : ini;
    return { ini: Math.min(ini, fin), fin: Math.max(ini, fin) };
}

// Pone las marcas alrededor de la selecciÃ³n y deja el cursor dentro.
function envolverSeleccion(antes, despues) {
    if (!contenidoEl) return;
    const { ini, fin } = seleccionActual();
    const elegido = contenidoEl.value.slice(ini, fin);
    contenidoEl.value = contenidoEl.value.slice(0, ini) + antes + elegido + despues
        + contenidoEl.value.slice(fin);
    const dentro = ini + antes.length;
    contenidoEl.focus();
    try {
        if (despues === '](url)') {
            // En un enlace se selecciona la palabra Â«urlÂ» para escribirla encima.
            contenidoEl.setSelectionRange(dentro + elegido.length + 2, dentro + elegido.length + 5);
        } else if (elegido) {
            contenidoEl.setSelectionRange(dentro, dentro + elegido.length);
        } else {
            contenidoEl.setSelectionRange(dentro, dentro);
        }
    } catch (e) { /* da igual */ }
    actualizarContador();
    ajustarAltoContenido();
}

// Pone (o quita) un prefijo al principio de las lÃ­neas tocadas por la selecciÃ³n.
// `reemplaza` son los prefijos del mismo tipo que se quitan antes (pasar de una
// lista con viÃ±etas a una numerada cambia la marca, no la pone delante).
function prefijarLineas(prefijo, reemplaza) {
    if (!contenidoEl) return;
    const { ini, fin } = seleccionActual();
    const valor = contenidoEl.value;
    const desde = valor.lastIndexOf('\n', ini - 1) + 1;
    let hasta = valor.indexOf('\n', fin);
    if (hasta === -1) hasta = valor.length;

    const lineas = valor.slice(desde, hasta).split('\n');
    // Si todas ya lo llevan, el icono lo quita (asÃ­ se puede alternar).
    const todas = lineas.every((l) => l.startsWith(prefijo));
    const otras = reemplaza || [];
    const nuevas = lineas.map((l) => {
        if (todas) return l.slice(prefijo.length);
        let base = l;
        otras.forEach((p) => { if (base.startsWith(p)) base = base.slice(p.length); });
        return base.startsWith(prefijo) ? base : prefijo + base;
    });
    const bloque = nuevas.join('\n');

    contenidoEl.value = valor.slice(0, desde) + bloque + valor.slice(hasta);
    contenidoEl.focus();
    try { contenidoEl.setSelectionRange(desde, desde + bloque.length); } catch (e) { /* da igual */ }
    actualizarContador();
    ajustarAltoContenido();
}

// Marcas que van en su propia lÃ­nea (`---` y `:fila:`): se colocan con una lÃ­nea
// en blanco antes y despuÃ©s, y el cursor queda debajo listo para seguir (para
// Â«En filaÂ», ahÃ­ van las imÃ¡genes que van juntas).
function insertarMarcaBloque(marca) {
    if (!contenidoEl) return;
    const { ini, fin } = seleccionActual();
    const valor = contenidoEl.value;
    const antes = valor.slice(0, ini).replace(/\n+$/, '');
    const despues = valor.slice(fin).replace(/^\n+/, '');
    contenidoEl.value = (antes ? antes + '\n\n' : '') + marca + '\n\n' + despues;
    const pos = (antes ? antes.length + 2 : 0) + marca.length + 1;
    contenidoEl.focus();
    try { contenidoEl.setSelectionRange(pos, pos); } catch (e) { /* da igual */ }
    actualizarContador();
    ajustarAltoContenido();
}

function aplicarFormato(tipo) {
    if (!contenidoEl) return;
    if (tipo === 'regla') { insertarMarcaBloque('---'); return; }
    if (tipo === 'fila') { insertarMarcaBloque(':fila:'); return; }
    const pref = PREFIJOS[tipo];
    if (pref) { prefijarLineas(pref.marca, pref.reemplaza); return; }
    const env = ENVUELTOS[tipo];
    if (env) envolverSeleccion(env.antes, env.despues);
}

// Â¿El editor estÃ¡ completamente vacÃ­o? Solo entonces es seguro reiniciarlo:
// mirar Ãºnicamente el contenido borraba el tÃ­tulo y las etiquetas que el autor
// ya habÃ­a escrito pero cuyo texto todavÃ­a estaba vacÃ­o.
function editorVacio() {
    const titulo = (tituloEl && tituloEl.value || '').trim();
    const etiquetas = (etiquetasEl && etiquetasEl.value || '').trim();
    const contenido = (contenidoEl && contenidoEl.value || '').trim();
    return !titulo && !etiquetas && !contenido
        && imagenesLocales.size === 0 && imagenesGuardadas.size === 0;
}

function limpiarEditor() {
    imagenesLocales.forEach((img) => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
    imagenesLocales = new Map();
    imagenesGuardadas = new Map();
    portadaNombre = null;
    editandoId = null;
    estadoActual = 'publicado';   // al crear se publica
    if (contenidoEl) contenidoEl.value = '';
    if (tituloEl) tituloEl.value = '';
    if (etiquetasEl) etiquetasEl.value = '';
    const publicado = document.querySelector('input[name="problog-estado"][value="publicado"]');
    if (publicado) publicado.checked = true;
    if (guardarBtn) guardarBtn.textContent = 'Crear Problog';
    actualizarContador();
    ajustarAltoContenido();
}

// Del texto a los bloques que entiende el servidor, mÃ¡s los archivos a subir y
// los slots de imÃ¡genes guardadas que han dejado de usarse.
function construirDesdeTexto() {
    const tramos = analizarContenido(contenidoEl ? contenidoEl.value : '');
    const salida = [];
    const archivos = [];              // { slot, file }
    const urls = [];                  // slot -> url (local o guardada)
    const usados = new Set();
    const vistos = new Set();
    const usadosAlFinal = new Set();
    const slotPorNombre = new Map();   // nombre de la etiqueta -> slot resuelto

    // Primero se reservan los slots de las imÃ¡genes que ya estaban guardadas:
    // conservan el suyo, asÃ­ no hay que volver a subirlas aunque el autor las
    // mueva de sitio en el texto.
    tramos.forEach((t) => {
        if (t.tipo !== 'imagen') return;
        const g = imagenesGuardadas.get(t.nombre);
        if (g) usados.add(g.slot);
    });

    let cursor = 0;
    const siguienteLibre = () => {
        while (cursor < MAX_IMAGENES && usados.has(cursor)) cursor++;
        if (cursor >= MAX_IMAGENES) return -1;
        usados.add(cursor);
        return cursor;
    };

    tramos.forEach((t) => {
        if (t.tipo === 'texto') {
            salida.push({ tipo: 'texto', contenido: t.contenido });
            return;
        }
        // Una etiqueta repetida es una sola imagen.
        if (vistos.has(t.nombre)) return;
        vistos.add(t.nombre);
        const guardada = imagenesGuardadas.get(t.nombre);
        if (guardada) {
            usadosAlFinal.add(guardada.slot);
            slotPorNombre.set(t.nombre, guardada.slot);
            salida.push({ tipo: 'imagen', slot: guardada.slot, pie: guardada.pie || '' });
            urls[guardada.slot] = guardada.url;
            return;
        }
        const local = imagenesLocales.get(t.nombre);
        if (!local) return;   // etiqueta sin archivo: se ignora
        const slot = siguienteLibre();
        if (slot === -1) return;   // ya no quedan slots libres
        usadosAlFinal.add(slot);
        slotPorNombre.set(t.nombre, slot);
        salida.push({ tipo: 'imagen', slot: slot, pie: '' });
        archivos.push({ slot: slot, file: local.file });
        urls[slot] = local.previewUrl;
    });

    // ImÃ¡genes guardadas que ya no estÃ¡n en el texto: el servidor las borra.
    const eliminar = [];
    imagenesGuardadas.forEach((g) => {
        if (!usadosAlFinal.has(g.slot)) eliminar.push(g.slot);
    });

    // La portada viaja como slot. Si la imagen elegida ya no estÃ¡ (o no hay
    // ninguna), se manda null y el servidor cae a la primera que haya.
    const portadaSlot = (portadaNombre && slotPorNombre.has(portadaNombre))
        ? slotPorNombre.get(portadaNombre) : null;

    return { bloques: salida, archivos: archivos, eliminar: eliminar, urls: urls, portadaSlot: portadaSlot };
}


// ============================================================
// GUARDAR (crear o actualizar)
// ============================================================
async function guardar(e) {
    if (e) e.preventDefault();
    if (guardando) return;

    const titulo = (tituloEl && tituloEl.value || '').trim();
    if (!titulo) {
        showError('La publicaciÃ³n necesita un tÃ­tulo.');
        if (tituloEl) tituloEl.focus();
        return;
    }

    // El texto del marco se convierte en los bloques que espera el servidor.
    const { bloques: limpios, archivos, eliminar, portadaSlot } = construirDesdeTexto();
    if (limpios.length === 0) {
        showError('Escribe algo o aÃ±ade una imagen.');
        return;
    }

    const formData = new FormData();
    formData.append('titulo', titulo);
    formData.append('bloques', JSON.stringify(limpios));
    formData.append('etiquetas', (etiquetasEl && etiquetasEl.value || '').trim());
    // Estado: el selector se quitÃ³ de la interfaz, asÃ­ que al EDITAR se conserva
    // el que ya tenÃ­a la publicaciÃ³n (antes se reenviaba siempre 'publicado' y
    // un borrador se publicaba solo con abrirlo y guardar). Al crear, publicado.
    const estadoSel = document.querySelector('input[name="problog-estado"]:checked');
    formData.append('estado', estadoSel ? estadoSel.value : estadoActual);
    // CuÃ¡l de las imÃ¡genes va de portada (el servidor cae a la primera si no
    // llega o si esa imagen ya no estÃ¡).
    if (portadaSlot !== null) formData.append('portada_slot', String(portadaSlot));
    const esEdicion = !!editandoId;
    if (esEdicion) {
        // Slots cuyas imÃ¡genes guardadas ya no estÃ¡n en el texto: el servidor
        // las borra (si no, quedarÃ­an huÃ©rfanas en Cloudinary).
        formData.append('imagenes_a_eliminar', JSON.stringify(eliminar));
    }
    // Los archivos nuevos van por slot, igual que en un Cavent. Las imÃ¡genes que
    // ya estaban guardadas no se reenvÃ­an: conservan su slot.
    archivos.forEach((a) => formData.append('imagen_' + a.slot, a.file));

    const url = esEdicion ? API_BASE_URL + '/problogs/' + editandoId : API_BASE_URL + '/problogs';

    guardando = true;
    if (guardarBtn) { guardarBtn.disabled = true; guardarBtn.textContent = 'Guardandoâ€¦'; }
    try {
        const token = getAuthToken();
        const res = await fetch(url, {
            method: esEdicion ? 'PUT' : 'POST',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.success) {
            showSuccess(data.message || (esEdicion ? 'PublicaciÃ³n actualizada.' : 'PublicaciÃ³n guardada.'));
            limpiarEditor();
            feedCargado = false;      // el feed se recargarÃ¡ al abrir la secciÃ³n
            if (esEdicion) {
                // Al terminar de editar se vuelve a donde estaba (Problogs).
                volverDesdeIcono();
            }
        } else {
            showError((data && data.error) || 'No se pudo guardar la publicaciÃ³n.');
        }
    } catch (err) {
        debugLog.error('Error guardando problog:', err);
        showError('Error de conexiÃ³n al guardar.');
    } finally {
        guardando = false;
        if (guardarBtn) {
            guardarBtn.disabled = false;
            guardarBtn.textContent = editandoId ? 'Guardar cambios' : 'Crear Problog';
        }
    }
}

// ============================================================
// CARGAR UNA PUBLICACIÃ“N EN EL EDITOR
// ============================================================
function cargarParaEditar(p) {
    if (!p || !p.id) return;
    // Se sueltan las imÃ¡genes locales de la ediciÃ³n anterior.
    imagenesLocales.forEach((img) => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
    imagenesLocales = new Map();
    imagenesGuardadas = new Map();
    editandoId = p.id;

    if (tituloEl) tituloEl.value = decodeHTMLEntities(p.titulo || '');
    if (etiquetasEl) etiquetasEl.value = decodeHTMLEntities(p.etiquetas || '');
    const valor = (p.estado === 'borrador') ? 'borrador' : 'publicado';
    // Sin selector de estado en la interfaz, el estado de la publicaciÃ³n se
    // recuerda para reenviarlo igual al guardar los cambios.
    estadoActual = valor;
    const radio = document.querySelector('input[name="problog-estado"][value="' + valor + '"]');
    if (radio) radio.checked = true;

    // Los bloques vuelven al editor como texto: cada imagen, con su etiqueta y
    // el nombre de archivo sacado de su URL, para que al guardar conserve su slot.
    const imagenes = p.imagenes || [];
    const partes = [];
    let nombrePortada = null;
    (p.bloques || []).forEach((b) => {
        if (b.tipo === 'texto') {
            if ((b.contenido || '').trim()) partes.push(b.contenido);
            return;
        }
        const url = imagenes[b.slot] || '';
        if (!url) return;
        const nombre = nombreUnico(nombreDeUrl(url));
        imagenesGuardadas.set(nombre, { slot: b.slot, url: url, pie: b.pie || '' });
        if (p.portada_slot != null && Number(p.portada_slot) === b.slot) nombrePortada = nombre;
        partes.push('<image>' + nombre + '</image>');
    });
    if (contenidoEl) contenidoEl.value = partes.join('\n\n');
    // La portada guardada se recupera por su slot; si no hay, los cuadros eligen
    // la primera por defecto.
    portadaNombre = nombrePortada;

    if (guardarBtn) guardarBtn.textContent = 'Guardar cambios';
    actualizarContador();
    ajustarAltoContenido();

    // Abre el panel de creaciÃ³n en la pestaÃ±a Problogs, dejando preparada la
    // flecha de volver para regresar a Problogs al terminar.
    abrirCrearDesdeIcono();
    document.getElementById('tab-problogs')?.click();
    // El panel tarda en verse (transiciÃ³n de secciÃ³n): el alto del marco se mide
    // en cuanto el editor tenga layout, no aquÃ­ (scrollHeight aÃºn vale 0 y el
    // texto quedarÃ­a cortado en el mÃ­nimo de 260px).
    ajustarAltoContenidoCuandoSePueda();
}

// ============================================================
// ELIMINAR
// ============================================================
async function eliminarProblog(id, titulo) {
    const ok = await showConfirm('Â¿Eliminar la publicaciÃ³n Â«' + (titulo || '') + 'Â»? No se puede deshacer.');
    if (!ok) return;
    try {
        const token = getAuthToken();
        const res = await fetch(API_BASE_URL + '/problogs/' + id, {
            method: 'DELETE',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token } : {}
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.success) {
            showSuccess('PublicaciÃ³n eliminada.');
            feedCargado = false;
            cerrarLectura();
            cargarFeed();
            refrescarVistaPreviaPerfil();
        } else {
            showError((data && data.error) || 'No se pudo eliminar.');
        }
    } catch (err) {
        debugLog.error('Error eliminando problog:', err);
        showError('Error de conexiÃ³n al eliminar.');
    }
}

// ============================================================
// LIKES Y COMENTARIOS
// ============================================================
const ICONO_CORAZON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const ICONO_COMENTARIO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/></svg>';
// Rebloguear: las dos flechas en bucle.
const ICONO_REBLOG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';

// Fila de likes, comentarios y reblogueos. La misma en la tarjeta y en la vista
// de lectura.
function socialHTML(p) {
    const liked = !!p.liked;
    const reblogueado = !!p.reblogged;
    // El corazÃ³n va RELLENO si ya di like, igual que queda tras pulsarlo: si no,
    // el mismo estado se verÃ­a distinto antes y despuÃ©s de tocar sin motivo.
    const corazon = ICONO_CORAZON.replace('fill="none"', 'fill="' + (liked ? 'currentColor' : 'none') + '"');
    return `
        <div class="problog-social">
            <button type="button" class="problog-social-btn${liked ? ' liked' : ''}" data-problog-like="${p.id}" aria-pressed="${liked ? 'true' : 'false'}" title="Me gusta">
                <span class="problog-social-icono">${corazon}</span><span class="problog-social-num">${p.likes_count || 0}</span>
            </button>
            <button type="button" class="problog-social-btn" data-problog-comentar="${p.id}" title="Comentarios">
                <span class="problog-social-icono">${ICONO_COMENTARIO}</span><span class="problog-social-num">${p.comentarios_count || 0}</span>
            </button>
            <button type="button" class="problog-social-btn${reblogueado ? ' reblogueado' : ''}" data-problog-reblog="${p.id}" aria-pressed="${reblogueado ? 'true' : 'false'}" title="Rebloguear">
                <span class="problog-social-icono">${ICONO_REBLOG}</span><span class="problog-social-num">${p.reblogs_count || 0}</span>
            </button>
        </div>`;
}

// El servidor decide el estado final (es un toggle) y aquÃ­ se refleja en TODOS
// los botones de esa publicaciÃ³n: la misma puede estar visible en la tarjeta y
// en la vista de lectura a la vez, y no deben quedar descuadrados.
async function alternarLike(id) {
    try {
        const res = await apiRequest('/problogs/' + id + '/like', { method: 'POST' });
        if (!res || res.success === false) {
            showError((res && res.error) || 'No se pudo dar me gusta.');
            return;
        }
        document.querySelectorAll('[data-problog-like="' + id + '"]').forEach((b) => {
            b.classList.toggle('liked', !!res.liked);
            b.setAttribute('aria-pressed', res.liked ? 'true' : 'false');
            const num = b.querySelector('.problog-social-num');
            if (num) num.textContent = res.likes_count;
            const svg = b.querySelector('svg');
            if (svg) svg.setAttribute('fill', res.liked ? 'currentColor' : 'none');
        });
    } catch (err) {
        debugLog.error('Error dando like a problog:', err);
        showError('Error de conexiÃ³n.');
    }
}

// Rebloguear: mismo mecanismo que el like (el servidor decide el estado final y
// aquÃ­ se refleja en todos los botones de esa publicaciÃ³n).
async function alternarReblog(id) {
    try {
        const res = await apiRequest('/problogs/' + id + '/reblog', { method: 'POST' });
        if (!res || res.success === false) {
            showError((res && res.error) || 'No se pudo rebloguear.');
            return;
        }
        document.querySelectorAll('[data-problog-reblog="' + id + '"]').forEach((b) => {
            b.classList.toggle('reblogueado', !!res.reblogged);
            b.setAttribute('aria-pressed', res.reblogged ? 'true' : 'false');
            const num = b.querySelector('.problog-social-num');
            if (num) num.textContent = res.reblogs_count;
        });
    } catch (err) {
        debugLog.error('Error reblogueando problog:', err);
        showError('Error de conexiÃ³n.');
    }
}

// ============================================================
// FEED
// ============================================================
// `conAcciones` fuerza si la tarjeta se pinta como propia (estado + editar/borrar).
// Por defecto lo decide el filtro del feed; la pestaÃ±a Problogs del perfil lo pasa
// explÃ­cito, porque ahÃ­ las publicaciones son tuyas aunque el filtro sea el pÃºblico.
function tarjetaProblog(p, conAcciones) {
    const propias = (conAcciones === undefined) ? modoMias : !!conAcciones;
    const imagenes = p.imagenes || [];
    // La portada que eligiÃ³ el autor; si no hay (o su imagen desapareciÃ³), la
    // primera que tenga la publicaciÃ³n.
    const portada = (p.portada_slot != null && imagenes[Number(p.portada_slot)])
        ? imagenes[Number(p.portada_slot)]
        : (imagenes.find((u) => !!u) || '');
    const autor = decodeHTMLEntities(p.nombre_artista || 'Artista');
    const avatar = avatarHTML(p, 'problog-card-avatar');

    // Extracto: el primer bloque de texto, sin las marcas de formato.
    let extracto = '';
    const primerTexto = (p.bloques || []).find((b) => b.tipo === 'texto');
    if (primerTexto) {
        const t = sinFormato(primerTexto.contenido);
        extracto = t.length > 160 ? t.slice(0, 160) + 'â€¦' : t;
    }

    // En "MÃ­as" se marca el estado SOLO cuando es borrador: el "Publicado" no
    // aporta nada (todo lo que sale en el feed estÃ¡ publicado) y estorbaba al
    // lado del tÃ­tulo.
    const esBorrador = p.estado === 'borrador';
    const estadoHTML = (propias && esBorrador)
        ? '<span class="problog-card-estado problog-card-estado-borrador">Borrador</span>'
        : '';
    // Iconos de editar/eliminar, que van junto al tiempo en la fila de autorÃ­a.
    const accionesHTML = propias ? accionesIconosHTML(p) : '';

    return `
        <article class="problog-card" data-id="${p.id}">
            <!-- AutorÃ­a en lo mÃ¡s alto, por ENCIMA de la portada: avatar, nombre
                 y el tiempo que lleva publicada. -->
            <div class="problog-card-autoria${portada ? ' con-portada' : ''}">
                ${avatar}
                <span class="problog-card-autor">${renderText(autor)}</span>
                <span class="problog-card-fecha">${escapeHtml(tiempoTranscurrido(p.created_at))}</span>
                ${accionesHTML}
            </div>
            ${portada ? `<div class="problog-card-portada"><img src="${safeImgUrl(cloudinaryUrl(portada, 600))}" alt="" loading="lazy"></div>` : ''}
            <div class="problog-card-cuerpo">
                <div class="problog-card-cabecera">
                    <h3 class="problog-card-titulo">${renderText(decodeHTMLEntities(p.titulo))}</h3>
                    ${estadoHTML}
                </div>
                ${extracto ? `<p class="problog-card-extracto">${renderText(extracto)}</p>` : ''}
                ${socialHTML(p)}
            </div>
        </article>`;
}

// Carga una pÃ¡gina del feed. `reemplazar` = true para la primera (o al cambiar
// de filtro) y false para ir aÃ±adiendo al final.
async function cargarPagina(pagina, reemplazar) {
    if (!feedEl || cargandoFeed) return;
    cargandoFeed = true;
    if (masBtn && !reemplazar) masBtn.textContent = 'Cargandoâ€¦';
    try {
        const base = modoMias ? '/api/artistas/mis-problogs' : '/problogs';
        const data = await apiRequest(base + '?page=' + pagina + '&limit=' + POR_PAGINA);
        const lista = (data && data.problogs) || [];
        const total = (data && data.total) || 0;
        // OJO: no vale `lista.map(tarjetaProblog)`, porque map le pasa el ÃNDICE
        // como segundo argumento y acabarÃ­a decidiendo las acciones por el
        // nÃºmero de tarjeta (la primera sin acciones y el resto como propias
        // aunque fueran de otros).
        const html = lista.map((p) => tarjetaProblog(p)).join('');

        if (reemplazar) {
            if (!lista.length) {
                feedEl.innerHTML = modoMias
                    ? '<p class="problogs-vacio">TodavÃ­a no has publicado nada.</p>'
                    : '<p class="problogs-vacio">TodavÃ­a no hay publicaciones. Â¡SÃ© el primero en contar tu proceso!</p>';
            } else {
                feedEl.innerHTML = html;
            }
            paginaFeed = 1;
        } else if (html) {
            // Se AÃ‘ADE al final en vez de re-pintar: asÃ­ no se pierde el scroll
            // ni se vuelven a cargar las imÃ¡genes ya visibles.
            feedEl.insertAdjacentHTML('beforeend', html);
            paginaFeed = pagina;
        }
        // El total lo da el servidor, asÃ­ que se sabe si quedan mÃ¡s sin probar
        // pidiendo una pÃ¡gina de mÃ¡s.
        hayMasFeed = pagina * POR_PAGINA < total;
        feedCargado = true;
    } catch (err) {
        debugLog.error('Error cargando problogs:', err);
        if (reemplazar) feedEl.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
        hayMasFeed = false;
    } finally {
        cargandoFeed = false;
        if (masBtn) masBtn.textContent = 'Cargar mÃ¡s';
        actualizarBotonMas();
    }
}

function cargarFeed() {
    if (!feedEl) return;
    feedEl.innerHTML = '<p class="problogs-cargando">Cargando publicacionesâ€¦</p>';
    actualizarBotonMas();
    return cargarPagina(1, true);
}

function actualizarBotonMas() {
    if (masBtn) masBtn.classList.toggle('hidden', !hayMasFeed);
}

// Al acercarse al botÃ³n se carga la siguiente pÃ¡gina sola (scroll infinito).
// El botÃ³n sigue ahÃ­ como respaldo: si el navegador no trae IntersectionObserver,
// el usuario puede pulsarlo. Se observa con margen para que la carga empiece
// antes de que llegue a verse.
function conectarObservadorFeed() {
    if (!masBtn || observadorFeed) return;
    if (typeof IntersectionObserver !== 'function') return;   // queda el botÃ³n
    observadorFeed = new IntersectionObserver((entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        if (!hayMasFeed || cargandoFeed) return;
        if (detalleEl && !detalleEl.classList.contains('hidden')) return;  // leyendo
        cargarPagina(paginaFeed + 1, false);
    }, { rootMargin: '250px' });
    observadorFeed.observe(masBtn);
}

// Abre una publicaciÃ³n desde una notificaciÃ³n: deja la secciÃ³n visible (si no lo
// estaba) y muestra su lectura.
export function abrirProblogDesdeNotificacion(id) {
    const num = parseInt(id, 10);
    if (!num) return;
    if (seccionEl && seccionEl.classList.contains('hidden')) toggleProblogs();
    abrirLectura(num);
}

function cambiarFiltro(mias) {
    if (modoMias === mias) return;
    modoMias = mias;
    if (filtroTodasBtn) filtroTodasBtn.classList.toggle('activo', !mias);
    if (filtroMiasBtn) filtroMiasBtn.classList.toggle('activo', mias);
    cerrarLectura();
    cargarFeed();
}

// ============================================================
// FORMATO LIGERO: INTERPRETAR LAS MARCAS
// ------------------------------------------------------------
// Subconjunto pequeÃ±o y SEGURO: **negrita**, *cursiva*, `cÃ³digo`, tÃ­tulos (#),
// listas (- y 1.), citas (>) y enlaces ([texto](https://â€¦)).
//
// La clave de seguridad: el texto se escapa ANTES (renderText, igual que en el
// resto de la app) y solo despuÃ©s se cambian las marcas por etiquetas nuestras.
// AsÃ­ lo Ãºnico que puede llegar al DOM son estas etiquetas: si alguien escribe
// <script>, sale como texto.
// ============================================================
function renderLinea(html) {
    // El cÃ³digo se aparta para que sus asteriscos no se interpreten.
    const codigos = [];
    let t = html.replace(/`([^`]+)`/g, (m, c) => {
        codigos.push(c);
        return '\u0000' + (codigos.length - 1) + '\u0000';
    });

    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    // Enlaces: solo http(s). Cualquier otro esquema se deja como texto.
    t = t.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (m, texto, url) => {
        if (!/^https?:\/\//i.test(url.replace(/&amp;/g, '&'))) return m;
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + texto + '</a>';
    });

    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + codigos[Number(i)] + '</code>');
}

// AlineaciÃ³n por pÃ¡rrafo: :izq: / :centro: / :der: / :just: al principio de la
// lÃ­nea. Sin marca, el texto va justificado (el estado normal del blog).
const ALINEADO_CLASE = {
    izq: 'problog-alineado-izquierda',
    centro: 'problog-alineado-centro',
    der: 'problog-alineado-derecha',
    just: 'problog-alineado-justificado'
};

function renderMarkdown(texto) {
    const lineas = renderText(texto).split('\n');
    const salida = [];
    let parrafo = [];
    let parrafoClase = null;
    let lista = null;         // 'ul' | 'ol'
    let cita = false;
    let alineacion = null;    // clase pendiente de aplicar al bloque

    const conClase = (tag, clase) => '<' + tag + (clase ? ' class="' + clase + '"' : '') + '>';

    const cerrarParrafo = () => {
        if (parrafo.length) {
            salida.push(conClase('p', parrafoClase) + parrafo.join('<br>') + '</p>');
            parrafo = [];
        }
        parrafoClase = null;
    };
    const cerrarLista = () => { if (lista) { salida.push('</' + lista + '>'); lista = null; } };
    const cerrarCita = () => { if (cita) { salida.push('</blockquote>'); cita = false; } };
    const cerrarTodo = () => { cerrarParrafo(); cerrarLista(); cerrarCita(); alineacion = null; };

    lineas.forEach((lineaOriginal) => {
        let linea = lineaOriginal;
        if (!linea.trim()) { cerrarTodo(); return; }   // lÃ­nea en blanco: separa bloques

        // AlineaciÃ³n del bloque.
        let propia = false;
        const al = linea.match(/^\s*:(izq|centro|der|just):\s?/i);
        if (al) {
            alineacion = ALINEADO_CLASE[al[1].toLowerCase()];
            linea = linea.slice(al[0].length);
            propia = linea.trim().length > 0;
            if (!propia) return;   // la marca sola vale para lo que venga despuÃ©s
        }

        // Regla horizontal: --- (o *** o ___) en su propia lÃ­nea.
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(linea)) {
            cerrarTodo();
            salida.push('<hr>');
            return;
        }

        const titulo = linea.match(/^\s{0,3}(#{1,3})\s+(.*)$/);
        if (titulo) {
            const clase = alineacion;
            cerrarTodo();
            const nivel = titulo[1].length + 2;   // # -> h3, ## -> h4, ### -> h5
            salida.push(conClase('h' + nivel, clase) + renderLinea(titulo[2].trim()) + '</h' + nivel + '>');
            return;
        }

        const vineta = linea.match(/^\s*[-*+]\s+(.*)$/);
        if (vineta) {
            const clase = alineacion;
            cerrarParrafo(); cerrarCita();
            if (lista !== 'ul') { cerrarLista(); salida.push('<ul>'); lista = 'ul'; }
            salida.push(conClase('li', clase) + renderLinea(vineta[1]) + '</li>');
            if (propia) alineacion = null;
            return;
        }

        const numerada = linea.match(/^\s*\d+[.)]\s+(.*)$/);
        if (numerada) {
            const clase = alineacion;
            cerrarParrafo(); cerrarCita();
            if (lista !== 'ol') { cerrarLista(); salida.push('<ol>'); lista = 'ol'; }
            salida.push(conClase('li', clase) + renderLinea(numerada[1]) + '</li>');
            if (propia) alineacion = null;
            return;
        }

        const citaLinea = linea.match(/^\s*(?:&gt;|>)\s?(.*)$/);
        if (citaLinea) {
            const clase = alineacion;
            cerrarParrafo(); cerrarLista();
            if (!cita) { salida.push('<blockquote>'); cita = true; }
            salida.push(conClase('p', clase) + renderLinea(citaLinea[1]) + '</p>');
            if (propia) alineacion = null;
            return;
        }

        cerrarLista(); cerrarCita();
        if (!parrafo.length) parrafoClase = alineacion;
        parrafo.push(renderLinea(linea));
        if (propia) alineacion = null;
    });

    cerrarTodo();
    return salida.join('');
}

// El mismo texto, pero sin marcas: para el extracto de la tarjeta del feed.
function sinFormato(texto) {
    return String(texto || '')
        .replace(/<image>[\s\S]*?<\/image>/gi, ' ')
        .replace(/^\s*(#{1,4}|[-*+]|\d+[.)]|>)\s+/gm, '')
        .replace(/:(?:izq|centro|der|just|fila|lado):/gi, ' ')
        .replace(/^\s*-{3,}\s*$/gm, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ============================================================
// MAQUETACIÃ“N DEL CUERPO
// ------------------------------------------------------------
// Los bloques se convierten en Â«unidadesÂ»: cada imagen es una unidad y cada
// pÃ¡rrafo de texto tambiÃ©n. Se separan por lÃ­nea en blanco, asÃ­ que un pÃ¡rrafo
// de varias lÃ­neas sigue siendo una sola unidad.
//
// La marca `:fila:` pone las dos unidades siguientes una al lado de la otra, y
// vale para cualquier mezcla: dos pÃ¡rrafos, un pÃ¡rrafo y una imagen, una imagen
// y un pÃ¡rrafoâ€¦ Si lo que viene detrÃ¡s son todo imÃ¡genes, se siguen agrupando
// de dos en dos (como una galerÃ­a).
// ============================================================
function unidadesDeCuerpo(bloques) {
    const unidades = [];
    bloques.forEach((b) => {
        if (b.tipo !== 'texto') { unidades.push({ tipo: 'imagen', bloque: b }); return; }
        String(b.contenido || '').split(/\n[ \t]*\n/).forEach((parrafo) => {
            let texto = parrafo.trim();
            if (!texto) return;
            // La marca puede venir sola en su pÃ¡rrafo o pegada al texto.
            const marca = texto.match(/^:(fila|lado):\s*/i);
            if (marca) {
                if (marca[1].toLowerCase() === 'fila') unidades.push({ tipo: 'marca-fila' });
                texto = texto.slice(marca[0].length);
                if (!texto) return;
            }
            unidades.push({ tipo: 'texto', contenido: texto });
        });
    });
    return unidades;
}

function pintarCuerpo(bloques, imagenes) {
    const figura = (b) => {
        const url = imagenes[b.slot];
        if (!url) return '';   // el backend ya filtra estos, pero por si acaso
        return `
            <figure class="problog-lectura-figura">
                <img src="${safeImgUrl(cloudinaryUrl(url, 1080))}" alt="" loading="lazy">
                ${b.pie ? `<figcaption>${renderText(b.pie)}</figcaption>` : ''}
            </figure>`;
    };
    const dibujar = (u) => (u.tipo === 'imagen'
        ? figura(u.bloque)
        : `<div class="problog-lectura-texto">${renderMarkdown(u.contenido)}</div>`);

    const unidades = unidadesDeCuerpo(bloques);
    const html = [];
    let i = 0;
    while (i < unidades.length) {
        const u = unidades[i];
        if (u.tipo !== 'marca-fila') {
            html.push(dibujar(u));
            i++;
            continue;
        }
        // La fila se lleva las dos unidades siguientes; si son todo imÃ¡genes,
        // tambiÃ©n las que sigan.
        const grupo = [];
        let soloImagenes = true;
        let j = i + 1;
        while (j < unidades.length && grupo.length < 2) {
            const s = unidades[j];
            if (s.tipo === 'marca-fila') break;
            if (s.tipo === 'texto') soloImagenes = false;
            grupo.push(s);
            j++;
        }
        if (soloImagenes) {
            while (j < unidades.length && unidades[j].tipo === 'imagen') { grupo.push(unidades[j]); j++; }
        }
        const dibujadas = grupo.map(dibujar).filter(Boolean);
        // Con una sola unidad no hay fila que hacer: se pinta normal.
        if (dibujadas.length > 1) html.push('<div class="problog-fila">' + dibujadas.join('') + '</div>');
        else if (dibujadas.length === 1) html.push(dibujadas[0]);
        i = j;
    }
    return html.join('');
}

// ============================================================
// VISTA DE LECTURA
// ============================================================
// `conAcciones` decide si se pintan los botones de editar/eliminar. Por defecto
// depende del filtro del feed; la vista previa los pide fuera aunque estÃ©s
// editando una publicaciÃ³n tuya.
function pintarLectura(p, conAcciones) {
    const propias = (conAcciones === undefined) ? modoMias : !!conAcciones;
    const imagenes = p.imagenes || [];
    const autor = decodeHTMLEntities(p.nombre_artista || 'Artista');
    const bloquesHTML = pintarCuerpo(p.bloques || [], imagenes);

    // En la vista de lectura tambiÃ©n se puede editar/eliminar si es propia.
    // Iconos de editar/eliminar, junto al tiempo en la fila de autorÃ­a.
    const acciones = propias ? accionesIconosHTML(p) : '';

    return `
        <button type="button" class="problog-volver" id="problog-volver">â† Volver</button>
        <header class="problog-lectura-cab">
            <!-- AutorÃ­a arriba y a la izquierda: avatar, nombre y tiempo. -->
            <div class="problog-lectura-autoria">
                ${avatarHTML(p, 'problog-lectura-avatar')}
                <span class="problog-lectura-autor">${renderText(autor)}</span>
                <span class="problog-lectura-fecha">${escapeHtml(tiempoTranscurrido(p.created_at))}</span>
                ${acciones}
            </div>
            <h2 class="problog-lectura-titulo">${renderText(decodeHTMLEntities(p.titulo))}</h2>
        </header>
        ${socialHTML(p)}
        <div class="problog-lectura-cuerpo">${bloquesHTML}</div>`;
}

async function abrirLectura(id) {
    if (!detalleEl || !feedEl) return;
    detalleEl.innerHTML = '<p class="problogs-cargando">Cargandoâ€¦</p>';
    detalleEl.classList.remove('hidden');
    feedEl.classList.add('hidden');
    try {
        const data = await apiRequest('/problogs/' + id);
        if (!data || data.success === false || !data.id) {
            detalleEl.innerHTML = '<p class="problogs-vacio">No se pudo abrir la publicaciÃ³n.</p>';
            return;
        }
        publicacionAbierta = data;
        detalleEl.innerHTML = pintarLectura(data);
    } catch (err) {
        debugLog.error('Error abriendo problog:', err);
        detalleEl.innerHTML = '<p class="problogs-vacio">No se pudo abrir la publicaciÃ³n.</p>';
    }
}

function cerrarLectura() {
    if (!detalleEl || !feedEl) return;
    detalleEl.classList.add('hidden');
    detalleEl.innerHTML = '';
    feedEl.classList.remove('hidden');
    publicacionAbierta = null;
}

// ============================================================
// VISTA PREVIA DEL EDITOR
// ============================================================
// ReÃºne lo que hay ahora mismo en el editor y lo pinta con el MISMO marcado de
// la vista de lectura: asÃ­ se ve exactamente lo que se va a publicar, sin tener
// que guardar antes. Las imÃ¡genes se resuelven con su vista previa local
// mientras siguen sin subirse.
function abrirVistaPrevia() {
    // Mismo camino que al guardar: el texto se parte en bloques y cada etiqueta
    // <image>â€¦</image> se convierte en la imagen de verdad (la local, mientras
    // sigue sin subirse).
    const { bloques: publicables, urls } = construirDesdeTexto();

    const titulo = (tituloEl && tituloEl.value || '').trim();
    const publicacion = {
        id: 'vista-previa',
        titulo: titulo || 'Sin tÃ­tulo',
        bloques: publicables,
        imagenes: urls,
        nombre_artista: (artistaActual && artistaActual.nombre_artista) || 'Artista',
        foto_artista: (artistaActual && (artistaActual.foto_artista || artistaActual.foto_perfil)) || null,
        created_at: new Date().toISOString(),
        likes_count: 0,
        comentarios_count: 0,
        reblogs_count: 0,
        liked: false,
        reblogged: false
    };

    cerrarVistaPrevia();
    bloquearFondo('vista-previa');

    const capa = document.createElement('div');
    capa.id = 'problog-vista-previa-capa';

    // La vista previa se queda ENTRE el header y el nav: no los tapa.
    const cabecera = document.getElementById('main-header');
    const nav = document.getElementById('toggle-panel');
    if (cabecera) capa.style.top = Math.round(cabecera.getBoundingClientRect().bottom) + 'px';
    if (nav) capa.style.bottom = Math.round(window.innerHeight - nav.getBoundingClientRect().top) + 'px';

    capa.innerHTML = `
        <div class="problog-vista-previa-barra">
            <span class="problog-vista-previa-etiqueta">Vista previa</span>
            <button type="button" class="problog-vista-previa-cerrar" data-cerrar-vista-previa aria-label="Cerrar vista previa">âœ•</button>
        </div>
        <div class="problog-vista-previa-cuerpo">${pintarLectura(publicacion, false)}</div>`;

    capa.addEventListener('click', (e) => {
        if (e.target.closest('[data-cerrar-vista-previa]') || e.target.closest('#problog-volver')) {
            cerrarVistaPrevia();
        }
    });

    document.body.appendChild(capa);
}

function cerrarVistaPrevia() {
    const capa = document.getElementById('problog-vista-previa-capa');
    if (capa) capa.remove();
    // El bloqueo se libera SIEMPRE, aunque la capa ya no estÃ©: si se retirÃ³ por
    // otra vÃ­a, dejar el motivo 'vista-previa' registrado congelarÃ­a el fondo
    // para siempre (liberarFondo de un motivo ausente no hace nada).
    liberarFondo('vista-previa');
}

// Al cambiar de secciÃ³n (nav, flecha del header, `+`, Chatâ€¦) la vista previa
// debe irse con la secciÃ³n: si no, queda encima de la nueva sin poder cerrarla.
registrarOverlay('vista-previa-problogs', cerrarVistaPrevia);

// ============================================================
// VISTA PREVIA EN EL PERFIL
// ============================================================
// Se recuerda el Ãºltimo contenedor pintado en el perfil para poder refrescarlo
// tras borrar una publicaciÃ³n desde ahÃ­ (si no, seguirÃ­a viÃ©ndose la tarjeta).
let contenedorPerfil = null;
let autorPerfil = null;

// Pinta la vista previa de las publicaciones dentro de la pestaÃ±a Problogs del
// perfil. Sin `autorId` es tu propio perfil (incluye borradores); con id es el
// perfil de otro artista (solo lo que ya estÃ¡ publicado y verificado).
// Lista del perfil: mis publicaciones o las que he reblogueado. `esBlog` = la
// pestaÃ±a Â«BlogÂ» (publicaciones reblogueadas de cualquier autor).
async function cargarListaPerfil(destino, esBlog) {
    if (!destino) return;
    destino.innerHTML = '<p class="problogs-cargando">Cargando publicacionesâ€¦</p>';
    try {
        const data = await apiRequest(esBlog
            ? '/api/artistas/mis-reblogs?limit=50'
            : '/api/artistas/mis-problogs?limit=50');
        // Si el contenedor ya no estÃ¡ en pantalla (se cambiÃ³ de pestaÃ±a mientras
        // cargaba), no se pisa nada.
        if (!destino.isConnected) return;
        // apiRequest no lanza: devuelve {success:false} si algo falla, y eso no
        // es lo mismo que "no hay publicaciones".
        if (!data || data.success === false) {
            destino.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
            return;
        }
        const lista = data.problogs || [];
        if (!lista.length) {
            destino.innerHTML = '<p class="problogs-vacio">' + (esBlog
                ? 'TodavÃ­a no has reblogueado ninguna publicaciÃ³n.'
                : 'TodavÃ­a no has publicado ningÃºn problog.') + '</p>';
            return;
        }
        // En el blog los reblogueos NO son mÃ­os, asÃ­ que van sin acciones.
        destino.innerHTML = '<div class="problogs-feed problogs-feed-perfil">' +
            lista.map((p) => tarjetaProblog(p, !esBlog)).join('') + '</div>';
    } catch (err) {
        debugLog.error('Error cargando problogs del perfil:', err);
        destino.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
    }
}

export async function pintarProblogsEn(contenedor, autorId) {
    if (!contenedor) return;
    contenedorPerfil = contenedor;
    autorPerfil = autorId || null;

    // Un solo listener por contenedor: la pestaÃ±a se puede reabrir muchas veces.
    if (!contenedor.dataset.problogsPerfilListo) {
        contenedor.dataset.problogsPerfilListo = '1';
        contenedor.addEventListener('click', (e) => manejarAcciones(e, true));
    }

    // En MI perfil hay dos pestaÃ±as: mis publicaciones y lo que he reblogueado.
    if (!autorPerfil) {
        contenedor.innerHTML = `
            <div class="problogs-subtabs">
                <button type="button" class="problogs-subtab activo" data-perfil-problogs="publicaciones">Publicaciones</button>
                <button type="button" class="problogs-subtab" data-perfil-problogs="blog">Blog</button>
            </div>
            <div class="problogs-perfil-lista" data-perfil-lista></div>`;
        const destino = contenedor.querySelector('[data-perfil-lista]');
        contenedor.querySelectorAll('[data-perfil-problogs]').forEach((b) => {
            b.addEventListener('click', () => {
                contenedor.querySelectorAll('[data-perfil-problogs]')
                    .forEach((x) => x.classList.toggle('activo', x === b));
                cargarListaPerfil(destino, b.dataset.perfilProblogs === 'blog');
            });
        });
        await cargarListaPerfil(destino, false);
        return;
    }

    // Perfil de OTRO artista: solo sus publicaciones.
    contenedor.innerHTML = '<p class="problogs-cargando">Cargando publicacionesâ€¦</p>';
    try {
        const data = await apiRequest('/problogs?artista=' + encodeURIComponent(autorPerfil) + '&limit=50');
        // Si el contenedor ya no es el que se estÃ¡ viendo (se cambiÃ³ de pestaÃ±a
        // mientras cargaba), no se pisa el contenido nuevo.
        if (contenedor !== contenedorPerfil || !contenedor.isConnected) return;
        // apiRequest no lanza: devuelve {success:false} si algo falla, y eso no
        // es lo mismo que "no hay publicaciones".
        if (!data || data.success === false) {
            contenedor.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
            return;
        }
        const lista = data.problogs || [];
        if (!lista.length) {
            contenedor.innerHTML = '<p class="problogs-vacio">Este artista todavÃ­a no ha publicado ningÃºn problog.</p>';
            return;
        }
        contenedor.innerHTML = '<div class="problogs-feed problogs-feed-perfil">' +
            lista.map((p) => tarjetaProblog(p, false)).join('') + '</div>';
    } catch (err) {
        debugLog.error('Error cargando problogs del perfil:', err);
        contenedor.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
    }
}

// Se vuelve a pedir la lista si la vista previa del perfil estÃ¡ a la vista.
function refrescarVistaPreviaPerfil() {
    if (contenedorPerfil && contenedorPerfil.isConnected) {
        const tab = document.querySelector('.perfil-tab-btn[data-tab="problogs"]');
        if (tab && tab.classList.contains('active')) pintarProblogsEn(contenedorPerfil, autorPerfil);
    }
}

// Acciones de las tarjetas y de la vista de lectura (delegadas en un solo sitio).
// `desdePerfil` = el clic viene de la vista previa del perfil, donde la lectura
// vive en otra secciÃ³n: hay que dejarla visible antes de abrirla o no se verÃ­a.
function manejarAcciones(e, desdePerfil) {
    const like = e.target.closest('[data-problog-like]');
    if (like) {
        e.stopPropagation();
        alternarLike(parseInt(like.dataset.problogLike, 10));
        return;
    }
    const reblog = e.target.closest('[data-problog-reblog]');
    if (reblog) {
        e.stopPropagation();
        alternarReblog(parseInt(reblog.dataset.problogReblog, 10));
        return;
    }
    const comentar = e.target.closest('[data-problog-comentar]');
    if (comentar) {
        e.stopPropagation();
        // Se reutiliza el cajÃ³n de comentarios pasÃ¡ndole el tipo de recurso.
        abrirComentarios(parseInt(comentar.dataset.problogComentar, 10),
            comentar.closest('.problog-card'), 'problogs');
        return;
    }
    const editar = e.target.closest('[data-problog-editar]');
    if (editar) {
        e.stopPropagation();
        const id = parseInt(editar.dataset.problogEditar, 10);
        if (publicacionAbierta && publicacionAbierta.id === id) {
            cargarParaEditar(publicacionAbierta);
        } else {
            // La tarjeta del feed no trae los bloques completos: se piden.
            apiRequest('/problogs/' + id).then((data) => {
                if (data && data.id) cargarParaEditar(data);
                else showError('No se pudo abrir la publicaciÃ³n para editarla.');
            });
        }
        return;
    }
    const eliminar = e.target.closest('[data-problog-eliminar]');
    if (eliminar) {
        e.stopPropagation();
        const id = parseInt(eliminar.dataset.problogEliminar, 10);
        const card = eliminar.closest('.problog-card');
        const nodoTitulo = card ? card.querySelector('.problog-card-titulo') : null;
        const titulo = (publicacionAbierta && publicacionAbierta.id === id)
            ? publicacionAbierta.titulo
            : (nodoTitulo ? nodoTitulo.textContent : '');
        eliminarProblog(id, titulo);
        return;
    }
    if (e.target.closest('#problog-volver')) {
        cerrarLectura();
        return;
    }
    // Clic en la tarjeta (y no en una acciÃ³n) -> vista de lectura.
    const card = e.target.closest('.problog-card');
    if (!card) return;
    if (desdePerfil) abrirProblogDesdeNotificacion(card.dataset.id);
    else abrirLectura(card.dataset.id);
}

// ============================================================
// INICIALIZACIÃ“N
// ============================================================
export function setupProblogs() {
    form = document.getElementById('problog-form');

    // La pestaÃ±a Problogs del perfil avisa por evento: perfil.js no puede
    // importarnos sin crear un ciclo de mÃ³dulos. Se registra ANTES del corte de
    // abajo a propÃ³sito, porque la vista previa no depende del editor.
    document.addEventListener('perfil:problogs', (e) => {
        const d = (e && e.detail) || {};
        pintarProblogsEn(d.contenedor, d.autorId);
    });

    if (!form) return;   // la secciÃ³n no estÃ¡ en esta pÃ¡gina

    tituloEl = document.getElementById('problog-titulo');
    contenidoEl = document.getElementById('problog-contenido');
    archivoEl = document.getElementById('problog-file');
    etiquetasEl = document.getElementById('problog-etiquetas');
    addImagenBtn = document.getElementById('problog-add-imagen');
    portadasEl = document.getElementById('problog-portadas');
    // Guardar y limpiar viven en la barra inferior (antes los tenÃ­a el propio
    // formulario, junto al final).
    guardarBtn = document.getElementById('problog-nav-publicar');
    limpiarBtn = document.getElementById('problog-nav-limpiar');
    vistaPreviaBtn = document.getElementById('problog-vista-previa');
    feedEl = document.getElementById('problogs-feed');
    detalleEl = document.getElementById('problogs-detalle');
    seccionEl = document.getElementById('problogs');
    filtroTodasBtn = document.getElementById('problogs-filtro-todas');
    filtroMiasBtn = document.getElementById('problogs-filtro-mias');
    masBtn = document.getElementById('problogs-mas');

    addImagenBtn?.addEventListener('click', () => anadirImagen());
    limpiarBtn?.addEventListener('click', limpiarEditor);
    vistaPreviaBtn?.addEventListener('click', abrirVistaPrevia);
    form.addEventListener('submit', guardar);

    filtroTodasBtn?.addEventListener('click', () => cambiarFiltro(false));
    filtroMiasBtn?.addEventListener('click', () => cambiarFiltro(true));

    // Respaldo del scroll infinito: pulsar "Cargar mÃ¡s" a mano.
    masBtn?.addEventListener('click', () => {
        if (hayMasFeed && !cargandoFeed) cargarPagina(paginaFeed + 1, false);
    });
    conectarObservadorFeed();

    // El marco es un campo editable: al escribir se refrescan el contador y el
    // alto, y el archivo elegido con el icono de imagen se inserta como etiqueta.
    contenidoEl?.addEventListener('input', () => {
        actualizarContador();
        ajustarAltoContenido();
    });
    archivoEl?.addEventListener('change', alElegirImagen);

    // Los iconos de formato: un solo listener delegado para todos.
    document.getElementById('problog-anadir')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-formato]');
        if (btn) aplicarFormato(btn.dataset.formato);
    });

    // Elegir la portada: un solo listener para los cuadros.
    portadasEl?.addEventListener('click', (e) => {
        const cuadro = e.target.closest('[data-portada]');
        if (!cuadro) return;
        portadaNombre = cuadro.dataset.portada;
        pintarPortadas();
    });

    // Hueco de abajo: se recalcula al cambiar lo que tapa (ventana, teclado) y al
    // abrirse el panel, que arranca oculto y entonces las barras miden 0.
    ajustarHuecoInferior();
    window.addEventListener('resize', ajustarHuecoInferior);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', ajustarHuecoInferior);
        window.visualViewport.addEventListener('scroll', ajustarHuecoInferior);
    }
    // El teclado no aparece de golpe: se vuelve a mirar cuando termina de abrir.
    contenidoEl?.addEventListener('focus', () => setTimeout(ajustarHuecoInferior, 350));
    contenidoEl?.addEventListener('blur', () => setTimeout(ajustarHuecoInferior, 350));
    const panelArtista = document.getElementById('panel-artista');
    if (panelArtista && typeof MutationObserver === 'function') {
        new MutationObserver(ajustarHuecoInferior)
            .observe(panelArtista, { attributes: true, attributeFilter: ['class'] });
    }

    // El feed se abre con el icono del header. Se OBSERVA la clase de la secciÃ³n
    // en vez de engancharse a ese botÃ³n: asÃ­ funciona sin depender de quiÃ©n la
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

    feedEl?.addEventListener('click', (e) => manejarAcciones(e, false));
    detalleEl?.addEventListener('click', (e) => manejarAcciones(e, false));

    // Al entrar en la pestaÃ±a Problogs, el editor arranca limpio â€” pero solo si
    // NO se estÃ¡ editando algo y el editor estÃ¡ VACÃO del todo: antes bastaba
    // con que el contenido estuviera vacÃ­o para borrar tambiÃ©n el tÃ­tulo y las
    // etiquetas ya escritos.
    document.getElementById('tab-problogs')?.addEventListener('click', () => {
        if (!editandoId && editorVacio()) limpiarEditor();
        // El editor acaba de hacerse visible: es el momento de medir su alto.
        ajustarAltoContenido();
    });

    limpiarEditor();
}
