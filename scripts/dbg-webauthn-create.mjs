// Diagnóstico del create() WebAuthn: ¿falla por el RP id en localhost?
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profileDir = mkdtempSync(join(tmpdir(), 'webauthn-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9265',
  `--user-data-dir=${profileDir}`, '--window-size=420,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = async (u) => (await fetch(u)).json();
let v; for (let i = 0; i < 40; i++) { try { v = await getJson('http://127.0.0.1:9265/json/version'); break; } catch { await sleep(250); } }
const page = await (async () => { try { return await getJson('http://127.0.0.1:9265/json/new?about:blank'); } catch { return (await fetch('http://127.0.0.1:9265/json/new?about:blank', { method: 'PUT' })).json(); } })();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') logs.push('[EXC] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
await send('WebAuthn.enable');
await send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
});
await send('Page.navigate', { url: 'http://localhost:8099/auth.html' });
for (let i = 0; i < 60; i++) { if (await evalJs(`!!document.getElementById('btn-mostrar-login')`)) break; await sleep(300); }
await sleep(800);

console.log('=== create() con rp.id = location.hostname (' + await evalJs(`location.hostname`) + ') desde localhost ===');
const r1 = await evalJs(`(async () => {
    try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const cred = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { id: location.hostname, name: 'Creatio' },
                user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 't@t.com', displayName: 'Tester' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                timeout: 20000,
                attestation: 'none',
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }
            }
        });
        return cred ? 'OK rawId len ' + cred.rawId.byteLength : 'null';
    } catch (e) { return 'ERROR ' + e.name + ': ' + e.message; }
})()`);
console.log(r1);

console.log('\n=== create() con rp.id = "localhost" ===');
const r2 = await evalJs(`(async () => {
    try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const cred = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { id: 'localhost', name: 'Creatio' },
                user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 't@t.com', displayName: 'Tester' },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                timeout: 20000,
                attestation: 'none',
                authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }
            }
        });
        return cred ? 'OK rawId len ' + cred.rawId.byteLength : 'null';
    } catch (e) { return 'ERROR ' + e.name + ': ' + e.message; }
})()`);
console.log(r2);

console.log('\nEXCEPCIONES:', logs.length ? logs : 'ninguna');
ws.close(); chrome.kill(); try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
