// Sonda: carga la app y reporta errores de script con su URL y línea.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'err-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9298',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9298/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9298/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9298/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        console.log('EXCEPCION:', d.text, '| url:', d.url, '| linea:', d.lineNumber, d.columnNumber);
        console.log('   ', (d.exception?.description || '').split('\n').slice(0, 4).join(' / '));
    }
    if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error') console.log('LOG ERROR:', e.text, '| url:', e.url, e.lineNumber);
    }
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { try { localStorage.setItem('artistaData', JSON.stringify({ id: 1, nombre_artista: 'T', email: 't@t.com', foto_perfil: '' })); localStorage.setItem('creatio_auth_token_persist', 'tok'); } catch (_) {} })();`
});
await send('Page.navigate', { url: 'http://127.0.0.1:8099/' });
await sleep(4000);
console.log('--- estado ---');
console.log(await evalJs(`JSON.stringify({
  cards: document.querySelectorAll('.obra-card, .cavent-card, article').length,
  metrica: !!document.querySelector('.metrica-comentario'),
  drawer: !!document.getElementById('comentarios-drawer'),
  main: !!document.getElementById('main-content'),
  appVisible: !!document.querySelector('.app-container.visible')
})`));
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
