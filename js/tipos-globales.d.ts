// Tipos de las GLOBALES que expone el JavaScript clásico (los <script> que no son
// módulos). No se compilan: sirven para que el chequeo de tipos (`npm run check`) sepa
// qué hay en `window` cuando un módulo las lee.
//
// Hoy las declara `js/ciudades.js` (script clásico que las cuelga de `window` y leen
// auth-logic.js para el registro y chat.js para el directorio). Al estar aquí declaradas,
// esos módulos las tendrán tipadas en cuanto se les ponga `// @ts-check`.

/** El puente que inyecta Capacitor en el WebView de la app nativa (no existe en el navegador). */
interface CapacitorGlobal {    /** ¿Estamos dentro de la app nativa? (en el navegador no existe o devuelve false). */
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
    /** Versión con prefijo del AudioContext (Safari viejo y WebView antiguos). */
    webkitAudioContext?: typeof AudioContext;
    /** Cierra TODAS las sesiones abiertas (lo expone main.js en window). */
    closeAllSessions?: () => any;
    /** Refresca el contador de notificaciones (lo expone main.js en window). */
    refrescarNotificaciones?: () => any;
    /** Canal de chat abierto ahora mismo (lo lleva push.js para no notificar de ese chat). */
    _canalChatActivo?: string | number | null;
    /** Diagnóstico de push para depurar desde la consola. */
    __diagnosticoPush?: any;
    /** Estadísticas de un artista (lo expone perfil.js en window para otros módulos). */
    actualizarEstadisticas?: (userId?: number | string | null, statsData?: Artista | null) => Promise<void>;
    /** Abre la galería y se coloca en una obra (lo expone main.js en window). */
    abrirObraDesdePerfil?: (obraId: number | string) => void;
    /** Obras a las que el usuario ha dado like (las lleva galeria.js en window). */
    _likedObras?: Set<number | string>;
    /** Obras a las que ya se les contó la visita, para no repetir (galeria.js). La pone
     *  galeria.js al cargar el módulo, así que a partir de ahí siempre está. */
    _vistasRegistradas: Set<number | string>;
    /** Vuelve a la pantalla de marca (lo expone auth-logic.js). */
    volverAlBranding?: () => void;
    /** Marca los mensajes del chat como entregados (lo expone chat.js). */
    syncChatEntregas?: () => any;
    /** Refresca el contador de mensajes sin leer del chat (lo expone chat.js). */
    refrescarChatNoLeidos?: () => any;
}

/**
 * Propiedades PROPIAS que la app le añade a un elemento del DOM. Declararlas aquí es mejor
 * que ir poniendo casts por el código: así el chequeo sabe que existen y no hay que
 * ensuciar cada uso.
 */
interface HTMLElement {
    /** Temporizador del filtro del grid (lo pone galeria.js en el contenedor). */
    _filtroTimer?: number;
}

/**
 * Los datos de un artista que manda el backend. Casi todo es opcional porque cada pantalla
 * pide unos campos distintos (el perfil público, el mío, el directorio del chat...). La
 * firma de índice deja pasar los campos que hoy no se usan aquí sin tener que listarlos
 * todos, pero los que SÍ se usan están declarados: así el chequeo avisa si alguien escribe
 * `usuario.nombre_artisa` (con una letra de menos) en vez de callarse.
 */
interface Artista {
    id?: number | string;
    nombre_artista?: string;
    nombre_real?: string;
    foto_perfil?: string;
    ciudad?: string;
    rol?: string;
    cavents?: number;
    problogs?: number;
    comcons?: number;
    total_obras_activas?: number;
    seguidores?: number;
    siguiendo?: number;
    activo?: boolean;
    online?: boolean;
    en_linea?: boolean;
    ultima_actividad?: string;
    [clave: string]: any;
}
