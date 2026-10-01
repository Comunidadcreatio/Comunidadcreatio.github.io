// CASCADA REAL: quien gana una propiedad en un elemento, segun EL NAVEGADOR.
//
// POR QUE EXISTE: `dbg-cascada.mjs` recorre las hojas a mano y ordena por especificidad, pero
// avisa de que es ORIENTATIVO: no conoce las capas (@layer) y se le escapan las reglas
// anidadas (CSS nesting). En el piloto de `!important` de auth.css eso no bastaba: sabiamos
// QUE valor cambiaba (#d4d4d4) pero no QUE regla lo ponia.
//
// Este pregunta por el protocolo del navegador (CSS.getMatchedStylesForNode), que devuelve las
// reglas que casan CON EL ELEMENTO en el ORDEN REAL DE LA CASCADA (capas, especificidad y
// orden, todo resuelto). La ULTIMA que declara la propiedad es la que gana.
//
// Uso:
//   node scripts/dbg-cascada-real.mjs --pagina auth.html --tema light --ancho 1280 \
//        --elemento "#login-email" --propiedad border-top-color
//   node scripts/dbg-cascada-real.mjs --pagina auth.html --tema dark --elemento "#login-email" \
//        --propiedad border-top-color --valor "a@b.com" --input-error
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 9734;
const args = process.argv.slice(2);
const arg = (n, def) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const URL_BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8099/';
const PAGINA = arg('--pagina', '');
const TEMA = arg('--tema', 'light');
const ANCHO = Number(arg('--ancho', '1280'));
const ELEMENTO = arg('--elemento', '#login-email');
const PROPIEDAD = arg('--propiedad', 'border-top-color');
const VALOR = arg('--valor', null);
const CON_ERROR = args.includes('--input-error');

const perfil = mkdtempSync(join(tmpdir(), 'casc-real-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`, `--window-size=${ANCHO},900`, 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let ws = null;
const salir = (c) => { try { ws?.close(); } catch {} try { chrome.kill(); } catch {} try { rmSync(perfil, { recursive: true, force: true }); } catch {} process.exit(c); };
for (let i = 0; i < 40; i++) { try { await getJson(`http://127.0.0.1:${PUERTO}/json/version`); break; } catch { await sleep(250); } }
const pagina = await (async () => {
    try { return await getJson(`http://127.0.0.1:${PUERTO}/json/new?about:blank`); }
    catch { return (await fetch(`http://127.0.0.1:${PUERTO}/json/new?about:blank`, { method: 'PUT' })).json(); }
})();
ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.result?.value;
};
await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await send('CSS.enable');
await send('Emulation.setDeviceMetricsOverride', { width: ANCHO, height: 900, deviceScaleFactor: 1, mobile: ANCHO < 500 });
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
        try { localStorage.removeItem('artistaData'); localStorage.removeItem('creatio_auth_token_persist'); } catch (_) {}
        const json = async (d) => ({ ok: true, status: 200, json: async () => d });
        const realFetch = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const u = String(input);
            if (!u.includes('backend-fundacion-atpe.onrender.com')) return realFetch(input, init);
            if (u.includes('heartbeat')) return json({ ok: true });
            return json({ success: true, no_leidas: 0, count: 0, usuario: null });
        };
    })();`
});
await send('Page.navigate', { url: URL_BASE + PAGINA });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('login-form')`) === true) break; await sleep(300); }
await sleep(900);
await evalJs(`document.getElementById('btn-mostrar-login')?.click()`);
if (TEMA) await evalJs(`(() => { try { localStorage.setItem('theme', '${TEMA}'); } catch (_) {} document.documentElement.setAttribute('data-theme', '${TEMA}'); })()`);
if (VALOR !== null) await evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(ELEMENTO)});
    if (!el) return 'no-existe';
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(VALOR)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
})()`);
if (CON_ERROR) await evalJs(`document.querySelector(${JSON.stringify(ELEMENTO)})?.classList.add('input-error')`);
await sleep(700);

const doc = await send('DOM.getDocument', { depth: -1 });
if (doc.error) console.error('DOM.getDocument:', JSON.stringify(doc.error));
let nodo = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: ELEMENTO });
let estilos = await send('CSS.getMatchedStylesForNode', { nodeId: nodo.result?.nodeId || 0 });
if (estilos.error) {
    // El nodeId puede quedarse viejo si la pagina se ha vuelto a pintar: se pide otra vez.
    await sleep(600);
    const doc2 = await send('DOM.getDocument', { depth: -1 });
    nodo = await send('DOM.querySelector', { nodeId: doc2.result.root.nodeId, selector: ELEMENTO });
    estilos = await send('CSS.getMatchedStylesForNode', { nodeId: nodo.result?.nodeId || 0 });
}
if (!nodo.result?.nodeId || estilos.error) {
    console.error(`No se pudo analizar ${ELEMENTO} (nodo: ${JSON.stringify(nodo.result || nodo.error)}; estilos: ${JSON.stringify(estilos.error || null)})`);
    console.error(`Existe en el DOM? ${await evalJs(`!!document.querySelector(${JSON.stringify(ELEMENTO)})`)}`);
    salir(2);
}

const computado = await evalJs(`getComputedStyle(document.querySelector(${JSON.stringify(ELEMENTO)})).getPropertyValue(${JSON.stringify(PROPIEDAD)})`);
console.log(`Elemento ${ELEMENTO}  (${PAGINA || 'index'}, tema ${TEMA}, ${ANCHO}px${VALOR !== null ? ', valor "' + VALOR + '"' : ''}${CON_ERROR ? ', .input-error' : ''})`);
console.log(`Computado ${PROPIEDAD}: ${computado}\n`);

const candidatas = [];
for (const m of estilos.result.matchedCSSRules || []) {
    const props = (m.rule.style?.cssProperties || []).filter((p) => p.name === PROPIEDAD || (PROPIEDAD.startsWith('border-top') && p.name === 'border') || (PROPIEDAD === 'border-color' && p.name === 'border'));
    if (!props.length) continue;
    candidatas.push({ selector: m.rule.selectorList?.text || '', props, origen: m.rule.origin || 'regular' });
}
console.log(`Reglas que casan y declaran ${PROPIEDAD} (orden en que las devuelve el navegador):`);
// OJO: el orden que devuelve el navegador NO es el de la cascada (una regla con !important
// puede salir ANTES que una normal). Lo que decide es lo importante primero y, entre las
// importantes, la capa/especificidad/orden. Como eso no lo resuelve esta lista, se marca la
// candidata IMPORTANTE que gana (la ultima de ellas) y, si no hay ninguna, la ultima normal.
// La verdad final es el valor COMPUTADO de arriba: si la marcada no coincide con el, es que
// hay una capa de por medio y hay que mirar las importantes a mano.
const importantes = candidatas.filter((c) => c.props.some((p) => p.important));
const ganadora = importantes.length ? importantes[importantes.length - 1] : candidatas[candidatas.length - 1];
candidatas.forEach((c, i) => {
    const vals = c.props.map((p) => `${p.name}: ${p.value}${p.important ? ' !important' : ''}`).join(' | ');
    const marca = c === ganadora ? (importantes.length ? '  <-- probable GANADORA (la ultima !important)' : '  <-- probable GANADORA (la ultima)') : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${vals}${marca}`);
    console.log(`      ${c.selector.slice(0, 120)}`);
});
if (!candidatas.length) console.log('  (ninguna: el valor sale del estilo del usuario o del navegador)');
else console.log(`\nComprueba la marca contra el Computado: manda el valor computado, no la lista.`);
salir(0);
