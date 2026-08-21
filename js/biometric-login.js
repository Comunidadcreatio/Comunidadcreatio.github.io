// js/biometric-login.js
// "Recordarme en este dispositivo" + inicio de sesión con los métodos de
// seguridad del sistema Android (huella, patrón o PIN) vía WebAuthn.
//
// Cómo funciona:
//  - Al iniciar sesión con "recordarme", las credenciales se guardan
//    CIFRADAS (AES-GCM) en localStorage (nunca en texto plano).
//  - Si el usuario activa la biometría, se registra una credencial WebAuthn
//    del autenticador de plataforma (Android Keystore / huella / patrón / PIN).
//  - Para iniciar sesión, la app pide la verificación del sistema (el SO
//    muestra el diálogo de huella/patrón/PIN); al confirmar, se descifran las
//    credenciales guardadas y se hace el login normal contra el backend.
//  - WebAuthn funciona en el WebView de Capacitor (Android) y en Chrome
//    (Android/escritorio) sin necesidad de plugins nativos.

const CREDS_KEY = 'creatio_remembered_creds';   // { iv, data } AES-GCM cifrado
const BIO_KEY = 'creatio_bio_key';              // clave AES-GCM (base64)
const BIO_CRED_KEY = 'creatio_bio_cred';        // { rawId } credencial WebAuthn
const OLVIDO_EXPLICITO_KEY = 'creatio_olvido_explicito'; // '1' si el usuario cerró sesión a propósito

import { login } from './auth.js?v=056fec7bdd';

// ---------- Utilidades base64 ----------
function b64url(bytes) {
    let s = '';
    bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - b64.length % 4) : '';
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function b64ToBytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function bytesToB64(bytes) {
    let s = '';
    bytes.forEach(b => s += String.fromCharCode(b));
    return btoa(s);
}

// ---------- Cifrado AES-GCM ----------
async function obtenerClave() {
    let raw = localStorage.getItem(BIO_KEY);
    if (!raw) {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const rawKey = await crypto.subtle.exportKey('raw', key);
        raw = bytesToB64(new Uint8Array(rawKey));
        localStorage.setItem(BIO_KEY, raw);
    }
    return crypto.subtle.importKey('raw', b64ToBytes(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function cifrar(texto) {
    const key = await obtenerClave();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(texto);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(cipher)) };
}

async function descifrar(enc) {
    try {
        const key = await obtenerClave();
        const iv = b64ToBytes(enc.iv);
        const data = b64ToBytes(enc.data);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(plain);
    } catch (e) {
        return null;
    }
}

// ---------- API pública ----------

// ¿El navegador/WebView soporta WebAuthn?
export function biometriaDisponible() {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential &&
        typeof navigator !== 'undefined' && !!navigator.credentials;
}

// ¿Hay una credencial biométrica registrada?
export function biometriaRegistrada() {
    try { return !!localStorage.getItem(BIO_CRED_KEY); } catch (e) { return false; }
}

// ¿Hay credenciales recordadas en este dispositivo?
export function hayCredencialesRecordadas() {
    try { return !!localStorage.getItem(CREDS_KEY); } catch (e) { return false; }
}

// Guarda (o borra) las credenciales recordadas. Si activarBio es true y
// WebAuthn está disponible, registra la biometría del sistema.
export async function guardarCredencialesRecordadas(email, password, activarBio) {
    try {
        const enc = await cifrar(JSON.stringify({ email, password }));
        localStorage.setItem(CREDS_KEY, JSON.stringify(enc));
    } catch (e) {
        try { localStorage.removeItem(CREDS_KEY); } catch (_) {}
        return { success: false, error: 'No se pudo guardar las credenciales en este dispositivo.' };
    }
    if (activarBio) {
        const reg = await registrarBiometria(email);
        if (!reg.success) return reg;
    }
    return { success: true };
}

export async function obtenerCredencialesRecordadas() {
    try {
        const raw = localStorage.getItem(CREDS_KEY);
        if (!raw) return null;
        const plain = await descifrar(JSON.parse(raw));
        if (!plain) return null;
        const obj = JSON.parse(plain);
        return (obj && obj.email && obj.password) ? obj : null;
    } catch (e) {
        return null;
    }
}

export function borrarCredencialesRecordadas() {
    try { localStorage.removeItem(CREDS_KEY); } catch (e) {}
    try { localStorage.removeItem(BIO_CRED_KEY); } catch (e) {}
}

// Registra la biometría del sistema (pide verificación una vez: huella/patrón/PIN).
export async function registrarBiometria(userName) {
    if (!biometriaDisponible()) return { success: false, error: 'La biometría no está disponible en este dispositivo.' };
    try {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const userId = crypto.getRandomValues(new Uint8Array(16));
        const cred = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { id: location.hostname, name: 'Creatio' },
                user: { id: userId, name: userName, displayName: userName },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                timeout: 60000,
                attestation: 'none',
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred'
                }
            }
        });
        if (!cred || !cred.rawId) return { success: false, error: 'No se pudo registrar la biometría.' };
        localStorage.setItem(BIO_CRED_KEY, JSON.stringify({ rawId: b64url(new Uint8Array(cred.rawId)) }));
        return { success: true };
    } catch (e) {
        return { success: false, error: e && (e.name === 'NotAllowedError' || e.name === 'NotSupportedError')
            ? 'Verificación cancelada o biometría no disponible en este dispositivo.'
            : 'No se pudo registrar la biometría.' };
    }
}

// Pide la verificación del sistema (huella/patrón/PIN). Resuelve true si el
// usuario se autenticó con el método de seguridad del dispositivo.
export async function desbloquearConBiometria() {
    if (!biometriaDisponible()) return false;
    try {
        const stored = JSON.parse(localStorage.getItem(BIO_CRED_KEY) || 'null');
        if (!stored || !stored.rawId) return false;
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const cred = await navigator.credentials.get({
            publicKey: {
                challenge,
                timeout: 60000,
                allowCredentials: [{ type: 'public-key', id: b64urlToBytes(stored.rawId), transports: ['internal'] }],
                userVerification: 'required'
            }
        });
        return !!cred;
    } catch (e) {
        return false;
    }
}

// Elimina SOLO la biometría registrada (mantiene las credenciales recordadas).
export function borrarBiometria() {
    try { localStorage.removeItem(BIO_CRED_KEY); } catch (e) {}
}

// ---------- Reanudación de sesión al reabrir la app ----------

// ¿El usuario cerró sesión explícitamente? (no reanudar automáticamente)
export function huboOlvidoExplicito() {
    try { return localStorage.getItem(OLVIDO_EXPLICITO_KEY) === '1'; } catch (e) { return false; }
}

export function limpiarOlvidoExplicito() {
    try { localStorage.removeItem(OLVIDO_EXPLICITO_KEY); } catch (e) {}
}

// Intenta reanudar la sesión de forma silenciosa con las credenciales
// recordadas (la sesión del backend caducó al reabrir la app). Devuelve true
// si el usuario quedó autenticado. NO se usa si hubo un cierre de sesión
// explícito (respetar la decisión del usuario).
export async function intentarReanudarSesionRecordada() {
    if (huboOlvidoExplicito()) return false;
    if (!hayCredencialesRecordadas()) return false;
    try {
        const creds = await obtenerCredencialesRecordadas();
        if (!creds) return false;
        const result = await login(creds.email, creds.password);
        if (result.success) {
            if (result.token) {
                try { localStorage.setItem('creatio_auth_token_persist', result.token); } catch (e) {}
            }
            limpiarOlvidoExplicito();
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}
