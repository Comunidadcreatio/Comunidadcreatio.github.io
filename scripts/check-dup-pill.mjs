// Verificación de duplicados de la píldora: cuenta #update-pill y #btn-refresh-app
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'dup-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9227',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9227/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9227/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('app_version','1.0.441');` });
await send('Page.navigate', { url: process.argv[2] || 'https://comunidadcreatio.vercel.app/' });
await sleep(6000);
const res = await evalJs(`JSON.stringify({
    pills: document.querySelectorAll('#update-pill').length,
    botones: document.querySelectorAll('#btn-refresh-app').length,
    posicionesPills: [...document.querySelectorAll('#update-pill')].map((p,i) => 'pill'+(i+1)+' y=' + Math.round(p.getBoundingClientRect().y)),
    onclickDeCadaBoton: [...document.querySelectorAll('#btn-refresh-app')].map(b => typeof b.onclick)
})`);
console.log(res);
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
