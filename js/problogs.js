// js/problogs.js
// ============================================================
// PROBLOGS: publicaciones de blog del artista sobre su proceso creativo.
// ------------------------------------------------------------
// Cuatro partes:
//   1. EDITOR: el marco es un campo editable donde el autor escribe seguido y
//      las imágenes entran como etiquetas <image>nombre.jpg</image>.
//   2. FEED de publicaciones en la sección #problogs, con filtro Todas / Mías.
//   3. VISTA DE LECTURA de una publicación completa.
//   4. EDICIÓN y BORRADO de las propias.
//
// SEGURIDAD: todo el texto del usuario pasa por renderText() (escapa y
// normaliza entidades) y toda imagen por safeImgUrl()/cloudinaryUrl(), según la
// regla del README. El justificado es solo CSS.
//
// Hay DOS marcas de texto, y ninguna es HTML del usuario:
//   - <image>nombre.jpg</image>  ->  se parte en bloques antes de salir y, al
//     pintarse, se sustituye por la imagen de verdad.
//   - Un subconjunto de Markdown (negrita, cursiva, código, títulos, listas,
//     citas y enlaces): renderMarkdown() ESCAPA primero el texto y solo después
//     cambia las marcas por etiquetas nuestras. Por eso escribir <script> sale
//     como texto y un enlace con javascript: no se convierte en enlace.
//
// Las imágenes usan el MISMO esquema de slots que los Cavents (imagen_0..4), y
// el backend las devuelve como array POSICIONAL de 5: el índice ES el slot, así
// que cada bloque resuelve su imagen con imagenes[slot] sin ambigüedad. Por eso
// las imágenes ya guardadas conservan su slot aunque el autor las mueva de
// sitio en el texto: no hay que volver a subirlas.
//
// El filtro "Mías" no es un adorno: los borradores NO aparecen en el feed
// público, así que sin una lista propia una publicación guardada como borrador
// quedaría imposible de encontrar y de editar.
// ============================================================
import { API_BASE_URL, apiRequest, getAuthToken, cerrarSesionLocal } from './config.js?v=a76a9b6092';
import { renderText, escapeHtml, safeImgUrl, cloudinaryUrl, debugLog, decodeHTMLEntities, errorDeImagen } from './utils.js?v=8861448e13';
import { showSuccess, showError, showConfirm } from './notificaciones.js?v=d2867c8ca0';
import { abrirCrearDesdeIcono, volverDesdeIcono, toggleProblogs } from './galeria-ui.js?v=79a31a9b82';
// El cajón de comentarios es el MISMO que el de las obras: se le pasa 'problogs'
// para que construya las rutas de este recurso.
import { abrirComentarios } from './comentarios.js?v=f4aaf060b8';
import { registrarOverlay } from './overlays.js?v=6e3a9a3bd5';
// La vista previa se muestra a pantalla completa: se congela el fondo con el
// mismo mecanismo que el cajón de comentarios.
import { bloquearFondo, liberarFondo } from './bloqueo-fondo.js?v=dd51e51820';
// Solo para firmar la vista previa con el nombre del artista.
import { artistaActual } from './auth.js?v=eeb4430018';

const MAX_IMAGENES = 8;
const MAX_TEXTO = 20000;
const MIN_ALTO_CONTENIDO = 260;
// A partir de cuánto se considera que la ventana visible se encogió por el teclado.
const TECLADO_UMBRAL = 100;

let form, tituloEl, contenidoEl, archivoEl, etiquetasEl, addImagenBtn, guardarBtn, limpiarBtn, vistaPreviaBtn, portadasEl;
let feedEl, detalleEl, seccionEl, masBtn;

// Imágenes del contenido en curso, por el nombre que aparece en la etiqueta:
//   locales   -> { file, previewUrl }  (elegidas y todavía sin subir)
//   guardadas -> { slot, url, pie }    (ya en el servidor, al editar)
let imagenesLocales = new Map();
let imagenesGuardadas = new Map();
// Cuál de esas imágenes va de portada (por nombre; el slot se resuelve al guardar).
let portadaNombre = null;
// Firma de lo último pintado en los cuadros de portada (evita repintar en cada tecla).
let firmaPortadas = '';
let observandoSeccion = false;
let feedCargado = false;
let guardando = false;
// Estado con el que se guardará: 'publicado' al crear y el que tuviera la
// publicación al editar (así un borrador antiguo no se publica sin querer).
let estadoActual = 'publicado';

// Paginación del feed
const POR_PAGINA = 10;
let paginaFeed = 1;
let hayMasFeed = false;
let cargandoFeed = false;
let observadorFeed = null;

// Estado de edición
let editandoId = null;        // null = creando; si no, id de la publicación
let publicacionAbierta = null;

// ============================================================
// UTILIDADES
// ============================================================
// Tiempo TRANSCURRIDO desde que se publicó («hace 5 minutos», «hace 2 días»).
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
    if (dias < 7) return 'hace ' + dias + (dias === 1 ? ' día' : ' días');
    if (dias < 30) {
        const semanas = Math.floor(dias / 7);
        return 'hace ' + semanas + (semanas === 1 ? ' semana' : ' semanas');
    }
    if (dias < 365) {
        const meses = Math.floor(dias / 30);
        return 'hace ' + meses + (meses === 1 ? ' mes' : ' meses');
    }
    const anios = Math.floor(dias / 365);
    return 'hace ' + anios + (anios === 1 ? ' año' : ' años');
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

// Acciones de una publicación propia, en iconos, para ponerlas junto al tiempo.
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
// añadir una imagen, se inserta su etiqueta <image>nombre.jpg</image> justo
// donde tenía el cursor. Al guardar, ese texto se parte en los bloques que
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

// El nombre es lo que identifica la etiqueta, así que no puede repetirse.
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
    // Se cuentan NOMBRES distintos: repetir la misma etiqueta <image> en el texto
    // no gasta un slot, pero antes contaba varias veces y bloqueaba el "+"
    // (creía estar en el máximo) con menos de 8 imágenes reales.
    const vistas = new Set();
    analizarContenido(contenidoEl ? contenidoEl.value : '')
        .forEach((t) => { if (t.tipo === 'imagen') vistas.add(t.nombre); });
    return vistas.size;
}

// El número de imágenes no se enseña (se quitó el contador), pero sigue
// haciendo falta para no pasar del máximo: el icono se desactiva al llegar.
// De paso se repintan los cuadros de portada, que dependen de las imágenes que
// haya en el texto.
function actualizarContador() {
    const n = contarImagenes();
    if (addImagenBtn) addImagenBtn.disabled = n >= MAX_IMAGENES;
    pintarPortadas();
}

// Imágenes que hay ahora mismo en el contenido, en el orden en que aparecen.
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

// Los cuadros de «Imagen de portada»: uno por cada imagen que se puede subir.
// Los que no tienen imagen salen vacíos (para que se vea el hueco que queda) y
// el elegido lleva la marca. Si la portada elegida desaparece del texto, se cae
// a la primera imagen.
function pintarPortadas() {
    if (!portadasEl) return;
    const lista = imagenesDelContenido();
    if (portadaNombre && !lista.some((i) => i.nombre === portadaNombre)) portadaNombre = null;
    if (!portadaNombre && lista.length > 0) portadaNombre = lista[0].nombre;

    // Esto se llama en CADA pulsación del contenido (actualizarContador), así que
    // repintar siempre son 8 botones + innerHTML por tecla. Se compara una firma
    // y solo se repinta cuando cambia lo que se muestra.
    const firma = lista.map((i) => i.nombre + '#' + i.url).join('|') + '@' + (portadaNombre || '');
    if (firma === firmaPortadas) return;
    firmaPortadas = firma;

    let html = '';
    for (let i = 0; i < MAX_IMAGENES; i++) {
        const img = lista[i];
        if (!img) {
            html += '<div class="problog-portada-cuadro vacio" aria-hidden="true"></div>';
            continue;
        }
        const elegida = img.nombre === portadaNombre;
        // La imagen ocupa el cuadro entero; la elegida se distingue por el borde
        // blanco más grueso, sin ninguna etiqueta encima.
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
    // quedaría en el mínimo (260px) con el texto cortado. Pasa al preparar una
    // edición, que rellena el contenido antes de abrir el panel; en cuanto el
    // panel es visible se vuelve a medir (ver el listener de animationend).
    if (contenidoEl.offsetParent === null) return;
    contenidoEl.style.height = 'auto';
    contenidoEl.style.height = Math.max(MIN_ALTO_CONTENIDO, contenidoEl.scrollHeight) + 'px';
}

// Reintenta medir el alto hasta que el editor tenga layout. Se usa cuando el
// contenido se rellena con el panel todavía oculto (edición): el panel se abre
// en transición y hasta que no se pinta no hay nada que medir. En cuanto se
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

// Hueco de abajo: lo que tapan las barras fijas (nav + pestañas + barra de crear)
// no es un valor fijo, así que se mide en vivo. Si no se ajusta, o el último
// campo (Etiquetas) queda detrás de las barras, o sobra un vacío grande.
//
// Con el teclado abierto las barras y el nav quedan POR DETRÁS del teclado, así
// que no hay que reservarles nada: ahí el hueco baja al mínimo y el contenido
// termina justo donde se escribe (que es lo que se ve al bajar). La clase
// `problog-teclado` en el body sirve para quitar también los otros rellenos
// inferiores (el del formulario y el del main) mientras el teclado está abierto.
function ajustarHuecoInferior() {
    const cont = document.getElementById('crear-problogs-contenido');
    if (!cont) return;
    // Con el editor OCULTO (el panel aún cerrado, o la pestaña Cavents puesta)
    // las barras miden 0: el hueco salía corto y luego daba un salto al abrirse.
    // Se recalcula cuando el editor se ve (listener de la pestaña y observer).
    if (cont.offsetParent === null) return;
    const alto = (el) => (el ? el.getBoundingClientRect().height : 0);
    const reserva = alto(document.getElementById('toggle-panel'))
        + alto(document.getElementById('crear-tabs'))
        + alto(document.getElementById('problog-nav-bar'));

    // La ventana visible se encoge con el teclado. Se comparan las dos medidas
    // (innerHeight y clientHeight) porque según el navegador encoge una u otra.
    const vv = window.visualViewport;
    const layout = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const visual = vv ? vv.height : layout;
    const teclado = (layout - visual) > TECLADO_UMBRAL;

    document.body.classList.toggle('problog-teclado', teclado);
    cont.style.paddingBottom = Math.round((teclado ? 0 : reserva) + (teclado ? 8 : 14)) + 'px';
}

// Escribe donde está el cursor y deja el foco dentro.
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
        showError('Máximo ' + MAX_IMAGENES + ' imágenes por publicación.');
        return;
    }
    archivoEl.value = '';   // permite volver a elegir el mismo archivo
    archivoEl.click();
}

function alElegirImagen() {
    const file = archivoEl && archivoEl.files && archivoEl.files[0];
    if (!file) return;
    if (contarImagenes() >= MAX_IMAGENES) {
        showError('Máximo ' + MAX_IMAGENES + ' imágenes por publicación.');
        return;
    }
    // Validar tipo y tamaño antes de nada: el backend corta en 10 MB (multer) y
    // responde un 500 genérico, sin decir que el problema era el archivo.
    const problema = errorDeImagen(file);
    if (problema) {
        showError(problema);
        archivoEl.value = '';
        return;
    }
    const nombre = nombreUnico(file.name);
    imagenesLocales.set(nombre, { file: file, previewUrl: URL.createObjectURL(file) });
    insertarEnContenido('<image>' + nombre + '</image>');
}

// ============================================================
// FORMATO LIGERO: LOS ICONOS DE MARKDOWN
// ------------------------------------------------------------
// Cada icono escribe sus marcas sobre lo que esté seleccionado (o en el punto
// del cursor). Son las mismas marcas que luego interpreta renderMarkdown().
// ============================================================
const ENVUELTOS = {
    negrita: { antes: '**', despues: '**' },
    cursiva: { antes: '*', despues: '*' },
    enlace: { antes: '[', despues: '](url)' }
};
// Las alineaciones se quitan entre sí: poner «centro» donde había «derecha»
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

// Pone las marcas alrededor de la selección y deja el cursor dentro.
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
            // En un enlace se selecciona la palabra «url» para escribirla encima.
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

// Pone (o quita) un prefijo al principio de las líneas tocadas por la selección.
// `reemplaza` son los prefijos del mismo tipo que se quitan antes (pasar de una
// lista con viñetas a una numerada cambia la marca, no la pone delante).
function prefijarLineas(prefijo, reemplaza) {
    if (!contenidoEl) return;
    const { ini, fin } = seleccionActual();
    const valor = contenidoEl.value;
    const desde = valor.lastIndexOf('\n', ini - 1) + 1;
    let hasta = valor.indexOf('\n', fin);
    if (hasta === -1) hasta = valor.length;

    const lineas = valor.slice(desde, hasta).split('\n');
    // Si todas ya lo llevan, el icono lo quita (así se puede alternar).
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

// Marcas que van en su propia línea (`---` y `:fila:`): se colocan con una línea
// en blanco antes y después, y el cursor queda debajo listo para seguir (para
// «En fila», ahí van las imágenes que van juntas).
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

// ¿El editor está completamente vacío? Solo entonces es seguro reiniciarlo:
// mirar únicamente el contenido borraba el título y las etiquetas que el autor
// ya había escrito pero cuyo texto todavía estaba vacío.
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

// Del texto a los bloques que entiende el servidor, más los archivos a subir y
// los slots de imágenes guardadas que han dejado de usarse.
function construirDesdeTexto() {
    const tramos = analizarContenido(contenidoEl ? contenidoEl.value : '');
    const salida = [];
    const archivos = [];              // { slot, file }
    const urls = [];                  // slot -> url (local o guardada)
    const usados = new Set();
    const vistos = new Set();
    const usadosAlFinal = new Set();
    const slotPorNombre = new Map();   // nombre de la etiqueta -> slot resuelto

    // Primero se reservan los slots de las imágenes que ya estaban guardadas:
    // conservan el suyo, así no hay que volver a subirlas aunque el autor las
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

    // Imágenes guardadas que ya no están en el texto: el servidor las borra.
    const eliminar = [];
    imagenesGuardadas.forEach((g) => {
        if (!usadosAlFinal.has(g.slot)) eliminar.push(g.slot);
    });

    // La portada viaja como slot. Si la imagen elegida ya no está (o no hay
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
        showError('La publicación necesita un título.');
        if (tituloEl) tituloEl.focus();
        return;
    }
    // Tope de texto (MAX_TEXTO): evita enviar una publicación enorme que el
    // servidor rechazaría o tardaría una eternidad en procesar.
    if (contenidoEl && contenidoEl.value.length > MAX_TEXTO) {
        showError('La publicación es demasiado larga (' + contenidoEl.value.length +
            ' caracteres). El máximo son ' + MAX_TEXTO + '.');
        return;
    }

    // El texto del marco se convierte en los bloques que espera el servidor.
    const { bloques: limpios, archivos, eliminar, portadaSlot } = construirDesdeTexto();
    if (limpios.length === 0) {
        showError('Escribe algo o añade una imagen.');
        return;
    }

    const formData = new FormData();
    formData.append('titulo', titulo);
    formData.append('bloques', JSON.stringify(limpios));
    formData.append('etiquetas', (etiquetasEl && etiquetasEl.value || '').trim());
    // Estado: el selector se quitó de la interfaz, así que al EDITAR se conserva
    // el que ya tenía la publicación (antes se reenviaba siempre 'publicado' y
    // un borrador se publicaba solo con abrirlo y guardar). Al crear, publicado.
    const estadoSel = document.querySelector('input[name="problog-estado"]:checked');
    formData.append('estado', estadoSel ? estadoSel.value : estadoActual);
    // Cuál de las imágenes va de portada (el servidor cae a la primera si no
    // llega o si esa imagen ya no está).
    if (portadaSlot !== null) formData.append('portada_slot', String(portadaSlot));
    const esEdicion = !!editandoId;
    if (esEdicion) {
        // Slots cuyas imágenes guardadas ya no están en el texto: el servidor
        // las borra (si no, quedarían huérfanas en Cloudinary).
        formData.append('imagenes_a_eliminar', JSON.stringify(eliminar));
    }
    // Los archivos nuevos van por slot, igual que en un Cavent. Las imágenes que
    // ya estaban guardadas no se reenvían: conservan su slot.
    archivos.forEach((a) => formData.append('imagen_' + a.slot, a.file));

    const url = esEdicion ? API_BASE_URL + '/problogs/' + editandoId : API_BASE_URL + '/problogs';

    guardando = true;
    if (guardarBtn) { guardarBtn.disabled = true; guardarBtn.textContent = 'Guardando…'; }
    try {
        const token = getAuthToken();
        const res = await fetch(url, {
            method: esEdicion ? 'PUT' : 'POST',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            // Escritura con fetch crudo (FormData): hay que cerrar la sesión a
            // mano, como hace apiRequest, o la app se queda "dentro" con un error.
            cerrarSesionLocal();
            showError('Sesión expirada. Vuelve a iniciar sesión.');
        } else if (data && data.success) {
            showSuccess(data.message || (esEdicion ? 'Publicación actualizada.' : 'Publicación guardada.'));
            limpiarEditor();
            feedCargado = false;      // el feed se recargará al abrir la sección
            if (esEdicion) {
                // Al terminar de editar se vuelve a donde estaba (Problogs).
                volverDesdeIcono();
            }
        } else {
            showError((data && data.error) || 'No se pudo guardar la publicación.');
        }
    } catch (err) {
        debugLog.error('Error guardando problog:', err);
        showError('Error de conexión al guardar.');
    } finally {
        guardando = false;
        if (guardarBtn) {
            guardarBtn.disabled = false;
            guardarBtn.textContent = editandoId ? 'Guardar cambios' : 'Crear Problog';
        }
    }
}

// ============================================================
// CARGAR UNA PUBLICACIÓN EN EL EDITOR
// ============================================================
function cargarParaEditar(p) {
    if (!p || !p.id) return;
    // Se sueltan las imágenes locales de la edición anterior.
    imagenesLocales.forEach((img) => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
    imagenesLocales = new Map();
    imagenesGuardadas = new Map();
    editandoId = p.id;

    if (tituloEl) tituloEl.value = decodeHTMLEntities(p.titulo || '');
    if (etiquetasEl) etiquetasEl.value = decodeHTMLEntities(p.etiquetas || '');
    const valor = (p.estado === 'borrador') ? 'borrador' : 'publicado';
    // Sin selector de estado en la interfaz, el estado de la publicación se
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

    // Abre el panel de creación en la pestaña Problogs, dejando preparada la
    // flecha de volver para regresar a Problogs al terminar.
    abrirCrearDesdeIcono();
    document.getElementById('tab-problogs')?.click();
    // El panel tarda en verse (transición de sección): el alto del marco se mide
    // en cuanto el editor tenga layout, no aquí (scrollHeight aún vale 0 y el
    // texto quedaría cortado en el mínimo de 260px).
    ajustarAltoContenidoCuandoSePueda();
}

// ============================================================
// ELIMINAR
// ============================================================
async function eliminarProblog(id, titulo) {
    const ok = await showConfirm('¿Eliminar la publicación «' + (titulo || '') + '»? No se puede deshacer.');
    if (!ok) return;
    try {
        const token = getAuthToken();
        const res = await fetch(API_BASE_URL + '/problogs/' + id, {
            method: 'DELETE',
            credentials: 'include',
            headers: token ? { Authorization: 'Bearer ' + token } : {}
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            cerrarSesionLocal();
            showError('Sesión expirada. Vuelve a iniciar sesión.');
        } else if (data && data.success) {
            showSuccess('Publicación eliminada.');
            feedCargado = false;
            cerrarLectura();
            cargarFeed();
            refrescarVistaPreviaPerfil();
        } else {
            showError((data && data.error) || 'No se pudo eliminar.');
        }
    } catch (err) {
        debugLog.error('Error eliminando problog:', err);
        showError('Error de conexión al eliminar.');
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
    // El corazón va RELLENO si ya di like, igual que queda tras pulsarlo: si no,
    // el mismo estado se vería distinto antes y después de tocar sin motivo.
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

// El servidor decide el estado final (es un toggle) y aquí se refleja en TODOS
// los botones de esa publicación: la misma puede estar visible en la tarjeta y
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
        showError('Error de conexión.');
    }
}

// Rebloguear: mismo mecanismo que el like (el servidor decide el estado final y
// aquí se refleja en todos los botones de esa publicación).
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
        showError('Error de conexión.');
    }
}

// ============================================================
// FEED
// ============================================================
// `conAcciones` fuerza si la tarjeta se pinta como propia (estado + editar/borrar).
// Por defecto lo decide el filtro del feed; la pestaña Problogs del perfil lo pasa
// explícito, porque ahí las publicaciones son tuyas aunque el filtro sea el público.
function tarjetaProblog(p, conAcciones) {
    const propias = !!conAcciones;
    const imagenes = p.imagenes || [];
    // La portada que eligió el autor; si no hay (o su imagen desapareció), la
    // primera que tenga la publicación.
    const portada = (p.portada_slot != null && imagenes[Number(p.portada_slot)])
        ? imagenes[Number(p.portada_slot)]
        : (imagenes.find((u) => !!u) || '');
    const autor = p.nombre_artista || 'Artista';
    const avatar = avatarHTML(p, 'problog-card-avatar');

    // Extracto: el primer bloque de texto, sin las marcas de formato.
    let extracto = '';
    const primerTexto = (p.bloques || []).find((b) => b.tipo === 'texto');
    if (primerTexto) {
        const t = sinFormato(primerTexto.contenido);
        extracto = t.length > 160 ? t.slice(0, 160) + '…' : t;
    }

    // En "Mías" se marca el estado SOLO cuando es borrador: el "Publicado" no
    // aporta nada (todo lo que sale en el feed está publicado) y estorbaba al
    // lado del título.
    const esBorrador = p.estado === 'borrador';
    const estadoHTML = (propias && esBorrador)
        ? '<span class="problog-card-estado problog-card-estado-borrador">Borrador</span>'
        : '';
    // Iconos de editar/eliminar, que van junto al tiempo en la fila de autoría.
    const accionesHTML = propias ? accionesIconosHTML(p) : '';

    return `
        <article class="problog-card" data-id="${p.id}">
            <!-- Autoría en lo más alto, por ENCIMA de la portada: avatar, nombre
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
                    <h3 class="problog-card-titulo">${renderText(p.titulo)}</h3>
                    ${estadoHTML}
                </div>
                ${extracto ? `<p class="problog-card-extracto">${renderText(extracto)}</p>` : ''}
                ${socialHTML(p)}
            </div>
        </article>`;
}

// Carga una página del feed público. `reemplazar` = true para la primera y false
// para ir añadiendo al final (scroll infinito).
async function cargarPagina(pagina, reemplazar) {
    if (!feedEl || cargandoFeed) return;
    cargandoFeed = true;
    if (masBtn && !reemplazar) masBtn.textContent = 'Cargando…';
    try {
        const data = await apiRequest('/problogs?page=' + pagina + '&limit=' + POR_PAGINA);
        // apiRequest NO lanza: devuelve {success:false} cuando falla. Sin esta
        // comprobación la lista vacía se pintaba como "todavía no hay
        // publicaciones", que es un mensaje falso (sí las hay: falló la carga).
        if (!data || data.success === false) {
            if (reemplazar) {
                feedEl.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
            }
            hayMasFeed = false;
            return;
        }
        const lista = (data && data.problogs) || [];
        const total = (data && data.total) || 0;
        // OJO: no vale `lista.map(tarjetaProblog)`, porque map le pasa el ÍNDICE
        // como segundo argumento y acabaría decidiendo las acciones por el
        // número de tarjeta (la primera sin acciones y el resto como propias
        // aunque fueran de otros).
        const html = lista.map((p) => tarjetaProblog(p)).join('');

        if (reemplazar) {
            if (!lista.length) {
                feedEl.innerHTML = '<p class="problogs-vacio">Todavía no hay publicaciones. ¡Sé el primero en contar tu proceso!</p>';
            } else {
                feedEl.innerHTML = html;
            }
            paginaFeed = 1;
        } else if (html) {
            // Se AÑADE al final en vez de re-pintar: así no se pierde el scroll
            // ni se vuelven a cargar las imágenes ya visibles.
            feedEl.insertAdjacentHTML('beforeend', html);
            paginaFeed = pagina;
        }
        // El total lo da el servidor, así que se sabe si quedan más sin probar
        // pidiendo una página de más.
        hayMasFeed = pagina * POR_PAGINA < total;
        feedCargado = true;
    } catch (err) {
        debugLog.error('Error cargando problogs:', err);
        if (reemplazar) feedEl.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
        hayMasFeed = false;
    } finally {
        cargandoFeed = false;
        if (masBtn) masBtn.textContent = 'Cargar más';
        actualizarBotonMas();
    }
}

function cargarFeed() {
    if (!feedEl) return;
    feedEl.innerHTML = '<p class="problogs-cargando">Cargando publicaciones…</p>';
    actualizarBotonMas();
    return cargarPagina(1, true);
}

function actualizarBotonMas() {
    if (masBtn) masBtn.classList.toggle('hidden', !hayMasFeed);
}

// Al acercarse al botón se carga la siguiente página sola (scroll infinito).
// El botón sigue ahí como respaldo: si el navegador no trae IntersectionObserver,
// el usuario puede pulsarlo. Se observa con margen para que la carga empiece
// antes de que llegue a verse.
function conectarObservadorFeed() {
    if (!masBtn || observadorFeed) return;
    if (typeof IntersectionObserver !== 'function') return;   // queda el botón
    observadorFeed = new IntersectionObserver((entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        if (!hayMasFeed || cargandoFeed) return;
        if (detalleEl && !detalleEl.classList.contains('hidden')) return;  // leyendo
        cargarPagina(paginaFeed + 1, false);
    }, { rootMargin: '250px' });
    observadorFeed.observe(masBtn);
}

// Abre una publicación desde una notificación: deja la sección visible (si no lo
// estaba) y muestra su lectura.
export function abrirProblogDesdeNotificacion(id) {
    const num = parseInt(id, 10);
    if (!num) return;
    if (seccionEl && seccionEl.classList.contains('hidden')) toggleProblogs();
    abrirLectura(num);
}

// (cambiarFiltro() y modoMias se quitaron: dependían de los botones "Todas /
// Mías", que no existen en el HTML. El feed público es el único que se carga.)

// ============================================================
// FORMATO LIGERO: INTERPRETAR LAS MARCAS
// ------------------------------------------------------------
// Subconjunto pequeño y SEGURO: **negrita**, *cursiva*, `código`, títulos (#),
// listas (- y 1.), citas (>) y enlaces ([texto](https://…)).
//
// La clave de seguridad: el texto se escapa ANTES (renderText, igual que en el
// resto de la app) y solo después se cambian las marcas por etiquetas nuestras.
// Así lo único que puede llegar al DOM son estas etiquetas: si alguien escribe
// <script>, sale como texto.
// ============================================================
function renderLinea(html) {
    // El código se aparta para que sus asteriscos no se interpreten.
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

// Alineación por párrafo: :izq: / :centro: / :der: / :just: al principio de la
// línea. Sin marca, el texto va justificado (el estado normal del blog).
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
        if (!linea.trim()) { cerrarTodo(); return; }   // línea en blanco: separa bloques

        // Alineación del bloque.
        let propia = false;
        const al = linea.match(/^\s*:(izq|centro|der|just):\s?/i);
        if (al) {
            alineacion = ALINEADO_CLASE[al[1].toLowerCase()];
            linea = linea.slice(al[0].length);
            propia = linea.trim().length > 0;
            if (!propia) return;   // la marca sola vale para lo que venga después
        }

        // Regla horizontal: --- (o *** o ___) en su propia línea.
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
// MAQUETACIÓN DEL CUERPO
// ------------------------------------------------------------
// Los bloques se convierten en «unidades»: cada imagen es una unidad y cada
// párrafo de texto también. Se separan por línea en blanco, así que un párrafo
// de varias líneas sigue siendo una sola unidad.
//
// La marca `:fila:` pone las dos unidades siguientes una al lado de la otra, y
// vale para cualquier mezcla: dos párrafos, un párrafo y una imagen, una imagen
// y un párrafo… Si lo que viene detrás son todo imágenes, se siguen agrupando
// de dos en dos (como una galería).
// ============================================================
function unidadesDeCuerpo(bloques) {
    const unidades = [];
    bloques.forEach((b) => {
        if (b.tipo !== 'texto') { unidades.push({ tipo: 'imagen', bloque: b }); return; }
        String(b.contenido || '').split(/\n[ \t]*\n/).forEach((parrafo) => {
            let texto = parrafo.trim();
            if (!texto) return;
            // La marca puede venir sola en su párrafo o pegada al texto.
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
        // La fila se lleva las dos unidades siguientes; si son todo imágenes,
        // también las que sigan.
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
// depende del filtro del feed; la vista previa los pide fuera aunque estés
// editando una publicación tuya.
function pintarLectura(p, conAcciones) {
    const propias = !!conAcciones;
    const imagenes = p.imagenes || [];
    const autor = p.nombre_artista || 'Artista';
    const bloquesHTML = pintarCuerpo(p.bloques || [], imagenes);

    // En la vista de lectura también se puede editar/eliminar si es propia.
    // Iconos de editar/eliminar, junto al tiempo en la fila de autoría.
    const acciones = propias ? accionesIconosHTML(p) : '';

    return `
        <button type="button" class="problog-volver" id="problog-volver">← Volver</button>
        <header class="problog-lectura-cab">
            <!-- Autoría arriba y a la izquierda: avatar, nombre y tiempo. -->
            <div class="problog-lectura-autoria">
                ${avatarHTML(p, 'problog-lectura-avatar')}
                <span class="problog-lectura-autor">${renderText(autor)}</span>
                <span class="problog-lectura-fecha">${escapeHtml(tiempoTranscurrido(p.created_at))}</span>
                ${acciones}
            </div>
            <h2 class="problog-lectura-titulo">${renderText(p.titulo)}</h2>
        </header>
        ${socialHTML(p)}
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
        publicacionAbierta = data;
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
    publicacionAbierta = null;
}

// ============================================================
// VISTA PREVIA DEL EDITOR
// ============================================================
// Reúne lo que hay ahora mismo en el editor y lo pinta con el MISMO marcado de
// la vista de lectura: así se ve exactamente lo que se va a publicar, sin tener
// que guardar antes. Las imágenes se resuelven con su vista previa local
// mientras siguen sin subirse.
function abrirVistaPrevia() {
    // Mismo camino que al guardar: el texto se parte en bloques y cada etiqueta
    // <image>…</image> se convierte en la imagen de verdad (la local, mientras
    // sigue sin subirse).
    const { bloques: publicables, urls } = construirDesdeTexto();

    const titulo = (tituloEl && tituloEl.value || '').trim();
    const publicacion = {
        id: 'vista-previa',
        titulo: titulo || 'Sin título',
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
            <button type="button" class="problog-vista-previa-cerrar" data-cerrar-vista-previa aria-label="Cerrar vista previa">✕</button>
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
    // El bloqueo se libera SIEMPRE, aunque la capa ya no esté: si se retiró por
    // otra vía, dejar el motivo 'vista-previa' registrado congelaría el fondo
    // para siempre (liberarFondo de un motivo ausente no hace nada).
    liberarFondo('vista-previa');
}

// Al cambiar de sección (nav, flecha del header, `+`, Chat…) la vista previa
// debe irse con la sección: si no, queda encima de la nueva sin poder cerrarla.
registrarOverlay('vista-previa-problogs', cerrarVistaPrevia);

// ============================================================
// VISTA PREVIA EN EL PERFIL
// ============================================================
// Se recuerda el último contenedor pintado en el perfil para poder refrescarlo
// tras borrar una publicación desde ahí (si no, seguiría viéndose la tarjeta).
let contenedorPerfil = null;
let autorPerfil = null;

// Pinta la vista previa de las publicaciones dentro de la pestaña Problogs del
// perfil. Sin `autorId` es tu propio perfil (incluye borradores); con id es el
// perfil de otro artista (solo lo que ya está publicado y verificado).
// Lista del perfil: mis publicaciones o las que he reblogueado. `esBlog` = la
// pestaña «Blog» (publicaciones reblogueadas de cualquier autor).
async function cargarListaPerfil(destino, esBlog) {
    if (!destino) return;
    destino.innerHTML = '<p class="problogs-cargando">Cargando publicaciones…</p>';
    try {
        const data = await apiRequest(esBlog
            ? '/api/artistas/mis-reblogs?limit=50'
            : '/api/artistas/mis-problogs?limit=50');
        // Si el contenedor ya no está en pantalla (se cambió de pestaña mientras
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
                ? 'Todavía no has reblogueado ninguna publicación.'
                : 'Todavía no has publicado ningún problog.') + '</p>';
            return;
        }
        // En el blog los reblogueos NO son míos, así que van sin acciones.
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

    // Un solo listener por contenedor: la pestaña se puede reabrir muchas veces.
    if (!contenedor.dataset.problogsPerfilListo) {
        contenedor.dataset.problogsPerfilListo = '1';
        contenedor.addEventListener('click', (e) => manejarAcciones(e, true));
    }

    // En MI perfil hay dos pestañas: mis publicaciones y lo que he reblogueado.
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
    contenedor.innerHTML = '<p class="problogs-cargando">Cargando publicaciones…</p>';
    try {
        const data = await apiRequest('/problogs?artista=' + encodeURIComponent(autorPerfil) + '&limit=50');
        // Si el contenedor ya no es el que se está viendo (se cambió de pestaña
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
            contenedor.innerHTML = '<p class="problogs-vacio">Este artista todavía no ha publicado ningún problog.</p>';
            return;
        }
        contenedor.innerHTML = '<div class="problogs-feed problogs-feed-perfil">' +
            lista.map((p) => tarjetaProblog(p, false)).join('') + '</div>';
    } catch (err) {
        debugLog.error('Error cargando problogs del perfil:', err);
        contenedor.innerHTML = '<p class="problogs-vacio">No se pudieron cargar las publicaciones.</p>';
    }
}

// Se vuelve a pedir la lista si la vista previa del perfil está a la vista.
function refrescarVistaPreviaPerfil() {
    if (contenedorPerfil && contenedorPerfil.isConnected) {
        const tab = document.querySelector('.perfil-tab-btn[data-tab="problogs"]');
        if (tab && tab.classList.contains('active')) pintarProblogsEn(contenedorPerfil, autorPerfil);
    }
}

// Acciones de las tarjetas y de la vista de lectura (delegadas en un solo sitio).
// `desdePerfil` = el clic viene de la vista previa del perfil, donde la lectura
// vive en otra sección: hay que dejarla visible antes de abrirla o no se vería.
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
        // Se reutiliza el cajón de comentarios pasándole el tipo de recurso.
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
                else showError('No se pudo abrir la publicación para editarla.');
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
    // Clic en la tarjeta (y no en una acción) -> vista de lectura.
    const card = e.target.closest('.problog-card');
    if (!card) return;
    if (desdePerfil) abrirProblogDesdeNotificacion(card.dataset.id);
    else abrirLectura(card.dataset.id);
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
export function setupProblogs() {
    form = document.getElementById('problog-form');

    // La pestaña Problogs del perfil avisa por evento: perfil.js no puede
    // importarnos sin crear un ciclo de módulos. Se registra ANTES del corte de
    // abajo a propósito, porque la vista previa no depende del editor.
    document.addEventListener('perfil:problogs', (e) => {
        const d = (e && e.detail) || {};
        pintarProblogsEn(d.contenedor, d.autorId);
    });

    if (!form) return;   // la sección no está en esta página

    tituloEl = document.getElementById('problog-titulo');
    contenidoEl = document.getElementById('problog-contenido');
    archivoEl = document.getElementById('problog-file');
    etiquetasEl = document.getElementById('problog-etiquetas');
    addImagenBtn = document.getElementById('problog-add-imagen');
    portadasEl = document.getElementById('problog-portadas');
    // Guardar y limpiar viven en la barra inferior (antes los tenía el propio
    // formulario, junto al final).
    guardarBtn = document.getElementById('problog-nav-publicar');
    limpiarBtn = document.getElementById('problog-nav-limpiar');
    vistaPreviaBtn = document.getElementById('problog-vista-previa');
    feedEl = document.getElementById('problogs-feed');
    detalleEl = document.getElementById('problogs-detalle');
    seccionEl = document.getElementById('problogs');
    masBtn = document.getElementById('problogs-mas');

    addImagenBtn?.addEventListener('click', () => anadirImagen());
    limpiarBtn?.addEventListener('click', async () => {
        // Confirmación: antes vaciaba el editor de golpe y se perdía el título,
        // el texto y las etiquetas que ya estuvieran escritos.
        if (!editorVacio()) {
            const ok = await showConfirm('¿Vaciar la publicación? Se perderá lo que tengas escrito.');
            if (!ok) return;
        }
        limpiarEditor();
    });
    vistaPreviaBtn?.addEventListener('click', abrirVistaPrevia);
    form.addEventListener('submit', guardar);

    // (Aquí estaban los botones "Todas / Mías" y cambiarFiltro(): ese marcado no
    // existe en el HTML, así que modoMias nunca podía pasar a true. El feed es
    // siempre el público y las publicaciones propias se ven en el perfil.)

    // Respaldo del scroll infinito: pulsar "Cargar más" a mano.
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
    // El hueco se mide con el editor VISIBLE: mientras está oculto las barras
    // miden 0 y el resultado sería un salto al abrirse. Se observa la propia caja
    // del editor para recalcular en cuanto aparece (cambia su clase `hidden`).
    const editorContenedor = document.getElementById('crear-problogs-contenido');
    if (editorContenedor && typeof MutationObserver === 'function') {
        new MutationObserver(ajustarHuecoInferior)
            .observe(editorContenedor, { attributes: true, attributeFilter: ['class'] });
    }

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

    feedEl?.addEventListener('click', (e) => manejarAcciones(e, false));
    detalleEl?.addEventListener('click', (e) => manejarAcciones(e, false));

    // Al entrar en la pestaña Problogs, el editor arranca limpio — pero solo si
    // NO se está editando algo y el editor está VACÍO del todo: antes bastaba
    // con que el contenido estuviera vacío para borrar también el título y las
    // etiquetas ya escritos.
    document.getElementById('tab-problogs')?.addEventListener('click', () => {
        if (!editandoId && editorVacio()) limpiarEditor();
        // El editor acaba de hacerse visible: es el momento de medir su alto y el
        // hueco de abajo (con el editor oculto las barras miden 0).
        ajustarAltoContenido();
        ajustarHuecoInferior();
    });

    limpiarEditor();
}
