// Tipos de las GLOBALES que expone el JavaScript clásico (los <script> que no son
// módulos). No se compilan: sirven para que el chequeo de tipos (`npm run check`) sepa
// qué hay en `window` cuando un módulo las lee.
//
// Hoy las declara `js/ciudades.js` (script clásico que las cuelga de `window` y leen
// auth-logic.js para el registro y chat.js para el directorio). Al estar aquí declaradas,
// esos módulos las tendrán tipadas en cuanto se les ponga `// @ts-check`.

/** El puente que inyecta Capacitor en el WebView de la app nativa (no existe en el navegador). */
interface CapacitorGlobal {
    /** ¿Estamos dentro de la app nativa? (en el navegador no existe o devuelve false). */
    isNativePlatform?: () => boolean;
    /** 'ios' | 'android' | 'web'. */
    getPlatform?: () => string;
    /** Los plugins nativos registrados (NativeBiometric, App, etc.). Se accede por nombre. */
    Plugins?: Record<string, any>;
    /** Versión del runtime nativo. */
    [clave: string]: any;
}

interface Window {
    /** país -> estado -> lista de ciudades. */
    CIUDADES_POR_PAIS: Record<string, Record<string, string[]>>;
    /** ciudad -> nombre del fichero de bandera (en iconos/banderas). */
    BANDERA_POR_CIUDAD: Record<string, string>;
    /** pueblo -> municipio (cuando el municipio se llama distinto que el pueblo). */
    MUNICIPIO_POR_PUEBLO: Record<string, string>;
    /** Puente de Capacitor: solo está en la app nativa (APK), no en el navegador. */
    Capacitor?: CapacitorGlobal;
}
