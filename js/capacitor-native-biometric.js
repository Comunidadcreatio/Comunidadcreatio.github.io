// js/capacitor-native-biometric.js
// Proxy del plugin @capgo/capacitor-native-biometric, vendored para la app
// estática (sin bundler). Registra "NativeBiometric" en el runtime de
// Capacitor para que `window.Capacitor.Plugins.NativeBiometric` exista en el
// APK (el WebView de Capacitor NO expone WebAuthn en muchos dispositivos).
//
// Fuera de Capacitor (navegador web) no hace nada: no hay window.Capacitor.
try {
    if (window.Capacitor && typeof window.Capacitor.registerPlugin === 'function') {
        window.Capacitor.registerPlugin('NativeBiometric', {
            // Implementación web vacía: el código de la app solo usa el plugin
            // en plataforma nativa (isNativePlatform), donde Capacitor enruta
            // las llamadas al puente nativo (huella/patrón/PIN del sistema).
            web: () => Promise.resolve({ NativeBiometricWeb: class NativeBiometricWeb {} })
        });
    }
} catch (e) { /* silencioso: fuera de Capacitor no aplica */ }
