// js/biometric-login.js
// Guardar el inicio de sesión en este dispositivo + reingreso con los métodos
// de seguridad del sistema Android (huella, patrón o PIN) vía WebAuthn.
//
// Cómo funciona:
//  - Al iniciar sesión, la app pregunta "¿Guardar tu sesión en este
//    dispositivo?"; con "Sí" se guardan las credenciales CIFRADAS (AES-GCM)
//    en localStorage (nunca en texto plano) junto con la identidad
//    (avatar + nombre) para mostrarla en la página de login.
//  - Se registra una credencial WebAuthn del autenticador de plataforma
//    (Android Keystore / huella / patrón / PIN).
//  - Para REINGRESAR tras cerrar sesión, la app muestra el avatar + nombre;
//    al pulsarlo pide la verificación del sistema (diálogo de huella/patrón/
//    PIN) y, al confirmar, descifra las credenciales y hace el login normal.
//  - WebAuthn funciona en el WebView de Capacitor (Android) y en Chrome
//    (Android/escritorio) sin necesidad de plugins nativos.

const CREDS_KEY = 'creatio_remembered_creds';   // { iv, data } AES-GCM cifrado
const BIO_KEY = 'creatio_bio_key';              // clave AES-GCM (base64)
const BIO_CRED_KEY = 'creatio_bio_cred';        // { rawId } credencial WebAuthn
const IDENTIDAD_KEY = 'creatio_remembered_user'; // { nombre, foto } avatar+nombre en el login
const OLVIDO_EXPLICITO_KEY = 'creatio_olvido_explicito'; // '1' si el usuario cerró sesión a propósito

import { login } from './auth.js?v=30e2869c22';
// Registra el plugin nativo de biometría en el runtime de Capacitor (APK)
import './capacitor-native-biometric.js?v=1';

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

// Plugin NATIVO de biometría (solo en el APK): el WebView de Capacitor NO
// expone WebAuthn en muchos dispositivos, así que en la app nativa usamos
// @capgo/capacitor-native-biometric a través del puente global (sin bundler).
function obtenerPluginBiometrico() {
    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform() &&
            window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric) {
            return window.Capacitor.Plugins.NativeBiometric;
        }
    } catch (e) {}
    return null;
}

// ¿Estamos en el APK (plataforma nativa)?
export function esPlataformaNativa() {
    return !!obtenerPluginBiometrico();
}

// ¿La biometría del sistema está disponible?
//  - APK: el plugin nativo (siempre que el dispositivo tenga desbloqueo por
//    huella, rostro, patrón o PIN).
//  - Web: WebAuthn (Chrome/WebView que lo soporte).
export function biometriaDisponible() {
    if (obtenerPluginBiometrico()) return true;
    return typeof window !== 'undefined' && !!window.PublicKeyCredential &&
        typeof navigator !== 'undefined' && !!navigator.credentials;
}

// ¿Hay una credencial biométrica registrada?
//  - APK: el plugin nativo pide la biometría directamente (siempre disponible).
//  - Web: hace falta una credencial WebAuthn registrada.
export function biometriaRegistrada() {
    if (obtenerPluginBiometrico()) return true;
    try { return !!localStorage.getItem(BIO_CRED_KEY); } catch (e) { return false; }
}

// ¿Hay una sesión guardada en este dispositivo?
export function haySesionGuardada() {
    try { return !!localStorage.getItem(CREDS_KEY); } catch (e) { return false; }
}

// Guarda la sesión en este dispositivo (tras responder "Sí"):
// credenciales cifradas + identidad (avatar+nombre) + biometría del sistema.
export async function guardarSesionEnDispositivo(email, password, nombre, foto) {
    try {
        const enc = await cifrar(JSON.stringify({ email, password }));
        localStorage.setItem(CREDS_KEY, JSON.stringify(enc));
        localStorage.setItem(IDENTIDAD_KEY, JSON.stringify({ nombre: nombre || email.split('@')[0], foto: foto || '' }));
    } catch (e) {
        try { localStorage.removeItem(CREDS_KEY); } catch (_) {}
        return { success: false, error: 'No se pudo guardar la sesión en este dispositivo.' };
    }
    // La biometría es la llave de reingreso:
    //  - APK: el plugin nativo la pide directamente (sin registración previa).
    //  - Web: se registra una credencial WebAuthn (pide verificación una vez).
    if (!obtenerPluginBiometrico()) {
        const reg = await registrarBiometria(nombre || email);
        if (!reg.success) {
            return { success: true, bioWarning: reg.error };
        }
    }
    return { success: true };
}

// Identidad (avatar + nombre) para mostrar en la página de login.
export function obtenerIdentidadUsuario() {
    try {
        const raw = localStorage.getItem(IDENTIDAD_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
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

// Borra la sesión guardada (credenciales + biometría + identidad).
export function borrarSesionGuardada() {
    try { localStorage.removeItem(CREDS_KEY); } catch (e) {}
    try { localStorage.removeItem(BIO_CRED_KEY); } catch (e) {}
    try { localStorage.removeItem(IDENTIDAD_KEY); } catch (e) {}
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
//  - APK: plugin nativo (diálogo del sistema).
//  - Web: WebAuthn (autenticador de plataforma).
export async function desbloquearConBiometria() {
    const plugin = obtenerPluginBiometrico();
    if (plugin) {
        try {
            // El plugin nativo RESUELVE si el usuario se autenticó y RECHAZA
            // si falló o canceló (devuelve void, no { verified }).
            // useFallback:true permite patrón/PIN/contraseña además de huella/rostro.
            await plugin.verifyIdentity({
                reason: 'Para iniciar sesión en Creatio',
                title: 'Verificación de identidad',
                subtitle: 'Usa tu huella, patrón o PIN',
                description: 'Confirma tu identidad para continuar',
                useFallback: true,
                maxAttempts: 3
            });
            return true;
        } catch (e) {
            return false;
        }
    }
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
    if (!haySesionGuardada()) return false;
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
