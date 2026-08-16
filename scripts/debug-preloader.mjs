// Diagnóstico del preloader: abre la URL en Chrome headless vía CDP,
// captura errores de consola/excepciones y reporta el estado del preloader.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'https://comunidadcreatio.vercel.app/?v=cdptest1';
const WAIT_MS = parseInt(process.argv[3] || '25000', 10);

const profileDir = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=9223',
  `--user-data-dir=${profileDir}`,
  '--window-size=420,800',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function main() {
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await getJson('http://127.0.0.1:9223/json/version');
      break;
    } catch { await sleep(250); }
  }
  if (!version) { console.log('NO CDP ENDPOINT'); chrome.kill(); return; }

  const page = await getJson('http://127.0.0.1:9223/json/new?about:blank').catch(async () => {
    // older protocol: PUT
    const res = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' });
    return res.json();
  });
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let msgId = 0;
  const pending = new Map();
  const consoleEvents = [];
  const exceptions = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args || []).map(a => a.value !== undefined ? a.value : a.description || a.type).join(' ');
      consoleEvents.push(`[console.${msg.params.type}] ${args}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      exceptions.push(`[exception] ${d.text} ${d.exception?.description || ''} @${d.url}:${d.lineNumber}`);
    }
    if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') {
        consoleEvents.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
      }
    }
    if (msg.method === 'Network.loadingFailed') {
      consoleEvents.push(`[net.fail] ${msg.params.errorText} ${msg.params.requestId}`);
    }
  };

  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 800, deviceScaleFactor: 1, mobile: true });

  console.log(`NAVIGATING: ${URL}`);
  await send('Page.navigate', { url: URL });
  await sleep(WAIT_MS);

  const state = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      href: location.href,
      preloader: (() => { const el = document.getElementById('preloader'); return el ? el.className : 'NO-ELEMENT'; })(),
      appContainer: (() => { const el = document.querySelector('.app-container'); return el ? el.className : 'NO-ELEMENT'; })(),
      readyState: document.readyState,
      bodyTextSnippet: document.body.innerText.slice(0, 200)
    })`,
    returnByValue: true
  });
  console.log('PAGE STATE:', state.result?.result?.value);

  console.log('=== CONSOLE/ERROR EVENTS (' + consoleEvents.length + ') ===');
  consoleEvents.slice(0, 60).forEach(e => console.log(e));
  console.log('=== EXCEPTIONS (' + exceptions.length + ') ===');
  exceptions.slice(0, 20).forEach(e => console.log(e));

  ws.close();
  chrome.kill();
  rmSync(profileDir, { recursive: true, force: true });
}

main().catch(e => { console.log('SCRIPT ERROR:', e.message); chrome.kill(); });
