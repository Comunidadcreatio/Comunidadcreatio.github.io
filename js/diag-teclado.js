// js/diag-teclado.js
// ============================================================
// DIAGNOSTICO TEMPORAL DEL TECLADO — Android / WebView
// ------------------------------------------------------------
// Panel flotante que muestra los valores REALES del dispositivo
// mientras se abre el teclado, y guarda un registro temporal de
// los eventos y de cada frame. El registro es lo importante: el
// rebote es un fenomeno temporal y en una captura no se ve.
//
// Sirve para decidir, con datos y no por conjetura:
//   - si el lado nativo encoge el layout (adjustResize) o lo
//     desplaza (adjustPan),
//   - si el JS esta compensando de mas (doble compensacion).
//
// SOBRE COPIAR EL INFORME (importante en WebView):
//   navigator.clipboard.writeText() suele RECHAZARSE en la WebView
//   de Android, y document.execCommand('copy') devuelve false sin
//   copiar nada. Por eso el informe se muestra tambien en un
//   textarea SELECCIONABLE: el camino fiable es el menu nativo
//   (mantener pulsado -> Seleccionar todo -> Copiar).
//   Aqui NUNCA se dice "copiado" si no se pudo comprobar.
//
// ACTIVO solo en Android, o añadiendo ?diag=1 a la URL.
//
// PARA QUITARLO (cuando ya no haga falta):
//   1. borrar este archivo
//   2. quitar el import en comentarios.js
//   3. quitar las llamadas a diagTick(...) / diagFrame(...)
// ============================================================

export const DIAG_ON =
    /Android/i.test(navigator.userAgent) || /[?&]diag=1/.test(location.search);

const MAX_EVENTOS = 30;
const MAX_FRAMES = 240;
const LOG_VISIBLE = 9;
const Z = 2147483647;   // por encima de todo lo que usa la app

let panel = null;
let cuerpoEl = null;
let logEl = null;
let botonEl = null;
let overlay = null;
let notaEl = null;
let areaEl = null;
let eventos = [];
let frames = [];
const t0 = Date.now();

const CSS = [
    '#diag-teclado{position:fixed;left:0;right:0;top:0;z-index:' + (Z - 1) + ';',
    'background:rgba(0,0,0,.85);color:#b9ffb9;',
    'font:11px/1.32 ui-monospace,Menlo,Consolas,monospace;',
    'padding:5px 7px;pointer-events:none;overflow:hidden;border-bottom:1px solid #0f0}',
    '#diag-teclado .diag-cab{white-space:pre;color:#b9ffb9}',
    '#diag-teclado .diag-log{white-space:pre-wrap;word-break:break-all;color:#ffcf6b;margin-top:3px}',
    '#diag-teclado-btn{position:fixed;right:6px;top:4px;z-index:' + Z + ';',
    'font:12px ui-monospace,monospace;background:#053;color:#dfffe0;',
    'border:1px solid #0f0;border-radius:6px;padding:7px 12px}',
    '#diag-informe{position:fixed;inset:0;z-index:' + Z + ';background:rgba(0,0,0,.94);',
    'display:flex;flex-direction:column;padding:10px;gap:8px;box-sizing:border-box}',
    '#diag-informe .diag-nota{color:#b9ffb9;font:12px/1.4 ui-monospace,monospace;margin:0}',
    '#diag-informe textarea{flex:1;width:100%;box-sizing:border-box;',
    'font:11px/1.35 ui-monospace,monospace;background:#000;color:#b9ffb9;',
    'border:1px solid #0f0;border-radius:6px;padding:8px;resize:none;',
    '-webkit-user-select:text;user-select:text}',
    '#diag-informe .diag-acciones{display:flex;gap:8px}',
    '#diag-informe button{flex:1;font:13px ui-monospace,monospace;background:#053;',
    'color:#dfffe0;border:1px solid #0f0;border-radius:6px;padding:12px}'
].join('');

function n(v, def) {
    if (v === undefined || v === null || v === '') return def === undefined ? '?' : def;
    const num = Math.round(Number(v));
    return isNaN(num) ? String(v) : String(num);
}

function versionTxt() {
    const el = document.getElementById('comentarios-version');
    return el && el.textContent ? el.textContent : '?';
}

function webviewTxt() {
    const m = navigator.userAgent.match(/Chrome\/([\d.]+)/);
    return m ? m[1] : '?';
}

function crearPanel() {
    if (panel) return;
    const style = document.createElement('style');
    style.id = 'diag-teclado-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.id = 'diag-teclado';
    const cab = document.createElement('div');
    cab.className = 'diag-cab';
    logEl = document.createElement('div');
    logEl.className = 'diag-log';
    panel.appendChild(cab);
    panel.appendChild(logEl);
    document.body.appendChild(panel);
    cuerpoEl = cab;

    botonEl = document.createElement('button');
    botonEl.id = 'diag-teclado-btn';
    botonEl.type = 'button';
    botonEl.textContent = 'informe';
    botonEl.addEventListener('click', abrirInforme);
    document.body.appendChild(botonEl);
}

function lineaEvento(ev) {
    const s = ev.s;
    return n(ev.ms).padStart(6) + ' ' + String(ev.motivo).padEnd(8) +
        ' ih' + n(s.ih) + ' vv' + n(s.vh) + ' ot' + n(s.ot) +
        ' kb' + n(s.kb) + ' ' + (s.red ? 'RED' : '---') +
        ' ' + (s.ab ? 'ABT' : '---') + ' ' + n(s.pa) + '/' + n(s.po);
}

function pintar(s) {
    if (!cuerpoEl) return;
    cuerpoEl.textContent =
        'DIAG TECLADO ' + versionTxt() + ' webview ' + webviewTxt() +
        '  (f' + frames.length + ')\n' +
        'innerH ' + n(s.ih) + '  visualH ' + n(s.vh) + '  offsetTop ' + n(s.ot) +
        '  offsetL ' + n(s.ol) + '  scale ' + n(s.sc) + '\n' +
        'teclado ' + n(s.kb) + '  base ' + n(s.base) +
        '  layoutReducido ' + (s.red ? 'SI' : 'NO') + '  abierto ' + (s.ab ? 'SI' : 'NO') + '\n' +
        'pad ' + n(s.pa) + '/' + n(s.po) + '  cajon top=' + (s.dtop || '-') +
        ' h=' + (s.dh || '-') + '  rect ' + n(s.rt) + '..' + n(s.rb) + '\n' +
        'inputBottom ' + n(s.ib) + '  scrollY ' + n(s.sy);
    logEl.textContent = eventos.slice(-LOG_VISIBLE).map(lineaEvento).join('\n');
}

export function diagTick(motivo, s) {
    if (!DIAG_ON || !s) return;
    try {
        crearPanel();
        s.motivo = motivo;
        eventos.push({ ms: Date.now() - t0, motivo: motivo, s: s });
        if (eventos.length > MAX_EVENTOS) eventos.shift();
        pintar(s);
    } catch (e) {
        // El diagnostico NUNCA debe romper la app.
    }
}

export function diagFrame(s) {
    if (!DIAG_ON || !s) return;
    try {
        frames.push({ ms: Date.now() - t0, s: s });
        if (frames.length > MAX_FRAMES) frames.shift();
    } catch (e) {
        // idem
    }
}

function informe() {
    const l = [];
    l.push('=== DIAGNOSTICO TECLADO ===');
    l.push('fecha ' + new Date().toISOString());
    l.push('version ' + versionTxt() + '  webview ' + webviewTxt());
    l.push('ua ' + navigator.userAgent);
    l.push('screen ' + screen.width + 'x' + screen.height +
        '  dpr ' + (window.devicePixelRatio || 1) +
        '  standalone ' + (window.matchMedia('(display-mode: standalone)').matches ? 'si' : 'no'));
    l.push('');
    l.push('--- EVENTOS (' + eventos.length + ') ---');
    l.push('    ms motivo   innerH visH offTop kbd  reduc abierto padAct/padObj');
    for (const ev of eventos) l.push(lineaEvento(ev));
    l.push('');
    l.push('--- FRAMES (' + frames.length + ') ---');
    l.push('    ms innerH visH offTop offL scale kbd reduc abierto padAct/padObj');
    for (const f of frames) {
        const s = f.s;
        l.push(n(f.ms).padStart(6) + ' ' + n(s.ih) + ' ' + n(s.vh) + ' ' + n(s.ot) +
            ' ' + n(s.ol) + ' ' + n(s.sc) + ' ' + n(s.kb) +
            ' ' + (s.red ? 'RED' : '---') + ' ' + (s.ab ? 'ABT' : '---') +
            ' ' + n(s.pa) + '/' + n(s.po));
    }
    return l.join('\n');
}

// Intenta copiar por JavaScript. Devuelve true SOLO si consta que copio.
async function copiarJS(txt) {
    try {
        await navigator.clipboard.writeText(txt);
        return true;
    } catch (e) { /* la WebView de Android suele rechazarlo */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.setAttribute('inputmode', 'none');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, txt.length);
        const ok = document.execCommand('copy');
        ta.remove();
        return ok === true;   // no mentir: si devuelve false, NO copio
    } catch (e2) {
        return false;
    }
}

function notaManual() {
    return 'El portapapeles no responde en la WebView. ' +
        'Manten pulsado el texto de abajo y elige "Seleccionar todo" y luego "Copiar".';
}

async function accionCopiar() {
    if (!areaEl) return;
    const ok = await copiarJS(areaEl.value);
    if (notaEl) {
        notaEl.textContent = ok
            ? 'Copiado. Pega el texto aqui en el chat.'
            : notaManual();
    }
}

function cerrarInforme() {
    if (overlay) overlay.style.display = 'none';
}

function abrirInforme() {
    try {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'diag-informe';
            notaEl = document.createElement('p');
            notaEl.className = 'diag-nota';
            areaEl = document.createElement('textarea');
            areaEl.readOnly = true;
            areaEl.spellcheck = false;
            areaEl.setAttribute('inputmode', 'none');   // no abre el teclado al enfocar
            const acciones = document.createElement('div');
            acciones.className = 'diag-acciones';
            const bCopiar = document.createElement('button');
            bCopiar.type = 'button';
            bCopiar.textContent = 'Copiar';
            bCopiar.addEventListener('click', accionCopiar);
            const bCerrar = document.createElement('button');
            bCerrar.type = 'button';
            bCerrar.textContent = 'Cerrar';
            bCerrar.addEventListener('click', cerrarInforme);
            acciones.appendChild(bCopiar);
            acciones.appendChild(bCerrar);
            overlay.appendChild(notaEl);
            overlay.appendChild(areaEl);
            overlay.appendChild(acciones);
            document.body.appendChild(overlay);
        }
        areaEl.value = informe();
        overlay.style.display = 'flex';
        // Dejar el texto ya seleccionado: en Android suele aparecer la barra
        // nativa con "Copiar" directamente.
        try {
            areaEl.focus();
            areaEl.select();
        } catch (e) { /* no critico */ }
        accionCopiar();
    } catch (e) {
        // ultimo recurso: que al menos se vea algo
        if (notaEl) notaEl.textContent = 'Error mostrando el informe: ' + e.message;
        if (overlay) overlay.style.display = 'flex';
    }
}
