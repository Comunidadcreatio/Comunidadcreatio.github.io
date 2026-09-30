# Creatio — Galería de Arte del Táchira

Red social + galería/e-commerce de arte para artistas del estado Táchira (Venezuela).
Los usuarios publican "cavents" (obras con carrusel de imágenes), chatean en tiempo
real, comentan, siguen a otros artistas y reciben notificaciones.

SPA 100% vanilla (HTML + CSS + JS con ES modules), sin frameworks ni bundlers.

## Arquitectura

    index.html / auth.html / reset-password.html   (3 páginas)
    js/   19 módulos ES (~8.000 líneas)  →  main.js es el orquestador
    css/  11 hojas (~10.000 líneas)
    iconos/  SVG, banderas, fondos (webp)
    www/   copia de trabajo para Capacitor (GENERADA por bump-version.js, no se edita a mano)
    android/  proyecto Capacitor 5 (WebView que carga la URL remota de Vercel)

El backend NO vive en este repo:
    https://backend-fundacion-atpe.onrender.com   (Node/Express en Render, free tier)
Imágenes servidas por Cloudinary (w_1080, f_auto, q_auto:good).

## Canales de distribución

| Canal | URL | Notas |
|---|---|---|
| GitHub Pages | https://Comunidadcreatio.github.io/ | Sirve desde la rama main |
| Vercel | https://comunidadcreatio.vercel.app/ | Producción principal (headers + rewrites en vercel.json) |
| APK Android | Release en GitHub (creatio.apk) | Capacitor 5; la WebView carga la URL de Vercel |

## Flujo de versión y deploy (IMPORTANTE)

Cada release sigue este flujo (automatizado en subir-a-git.bat):

1.  node scripts/bump-version.js
    - Recalcula hashes MD5 (?v=...) de CSS/JS en los 3 HTML y en @import de CSS.
    - Sincroniza imports ES (main.js/perfil.js) con los hashes de sus módulos.
    - Incrementa la versión en version.json (1.0.x) y actualiza:
        - currentVer en index.html (evita el bucle de recarga del WebView),
        - ?v= en capacitor.config.json,
        - versionName/versionCode en android/app/build.gradle (APK local).
    - Copia todo a www/ y android/app/src/main/assets/public/ y VERIFICA
      que las 3 copias quedan idénticas (hash a hash).
2.  git add . && git commit && git push origin main
    → Vercel y GitHub Pages despliegan solos; el APK se genera localmente
      (npx cap sync android + build) y se sube como Release.

SIEMPRE corre bump-version.js antes de commitear. El CI lo valida:
si el repo llega con hashes/versión desactualizados, falla con un mensaje claro.

## CSS: orden de capas (CASCADE LAYERS)

`css/style.css` declara UNA vez el orden de capas, y ese orden manda para toda la
app aunque las reglas vivan en otras hojas:

    @layer reset, base, components, utilities;

| Capa | Qué va aquí |
|---|---|
| reset | puesta a cero de elementos (aún sin usar) |
| base | estilos de ETIQUETA: tipografía, `input`, `select`, `textarea`, `button`... |
| components | piezas con nombre: `.problog-*`, `.chat-*`, `#panel-artista`... |
| utilities | lo último, gana a todo (aún sin usar) |

Dentro de una capa manda el ORDEN DE CAPAS, no la especificidad: un componente gana
a `base` sin necesidad de subirle especificidad añadiendo ids (que es lo que obligaba
a escribir selectores como `#problogs #problogs-detalle.con-barra-responder`).

**CÓMO MIGRAR (importante):** lo que NO está en ninguna capa GANA a lo que SÍ está.
Por eso se migra poco a poco y midiendo, nunca de golpe: mover una regla a una capa
puede hacerle perder contra otra que antes perdía por orden o por especificidad.
Reglas que van JUNTAS y no se pueden separar: `select` con `[data-theme="dark"] select`
(si la oscura se queda fuera, gana la clara y se pierde la flecha blanca).

Para migrar sin riesgo: foto de estilos antes → cambio → foto después → comparar.
Si la comparación sale sin diferencias, el cambio no movió ni un valor calculado.

**ESTADO ACTUAL: TODO el CSS está capado.** Cada hoja tiene su contenido dentro de
`@layer components { ... }`, y las reglas que ya se migraron viven en `@layer base { ... }`
(galeria-publica.css, formularios.css, style.css y auth.css).

Dentro de una capa deciden la especificidad y el orden del código **igual que cuando todo
estaba suelto**, así que el capado NO cambió nada (verificado con la foto: cero
diferencias en 210 medidas). Lo que se gana son **dos palancas limpias**:

| Capa | Efecto |
|---|---|
| `base` | **pierde** contra todo lo demás (por orden de capas) |
| `components` | el cuerpo del CSS; aquí decide la especificidad |
| `utilities` | **gana** a todo lo demás |

Con eso, mover una familia de reglas de `components` a `base` (para que no pelee) o a
`utilities` (para que gane sin subir la especificidad) **ya no destapa competidores**: no
queda nada suelto que pueda sorprender.

Ejemplo ya hecho (Problogs): reservar el hueco de la barra de responder era
`#problogs #problogs-detalle.con-barra-responder` (un id de refuerzo para ganarle a
`#problogs .problogs-detalle`); ahora es `.problogs-detalle.con-barra-responder` en
`utilities`, sin ids.

**Cómo se hizo el capado inicial:** `node scripts/capar-hojas.mjs` (deja copia
`.antes-de-capar` de cada hoja). Mete en `components` todos los trozos de primer nivel,
deja los `@import` y la declaración de orden arriba, y respeta los `@layer base { }` que
ya existían.

**Para mover una familia, el método es:** `auditar-capas.mjs` → foto antes → mover a
`base`/`utilities` → foto después → comparar. Si sale sin diferencias, adelante.

### `!important`: quitar de uno en uno, no en bloque

`auditar-important.mjs` los lista con su selector, su propiedad y su capa. Con las capas,
un `!important` solo hace falta si tiene que ganarle a OTRO `!important` (lo importante va
por encima de lo normal aunque la capa sea anterior); si solo peleaba contra reglas
normales, muchas veces basta con subir la regla a `utilities` o bajar la competidora a
`base`.

**Lo que NO hay que hacer** (medido y revertido): mover la competidora a `base` y quitar de
golpe los 36 `!important` de los botones de la barra inferior de `formularios.css`. La foto
dio **81 diferencias**: los `!important` ganaban a más reglas de las que parecía. Se van
quitando **de uno en uno (o por reglas sueltas)**, con la foto después de cada uno.

## Chequeo de tipos (npm run check)

El JS se revisa con TypeScript **sin compilar nada**: `tsc` solo mira y avisa. No cambia
una línea del código que se sirve ni del deploy.

    npm run check          # o: node scripts/verificar-tipos.mjs

**Se adopta fichero a fichero.** `checkJs` está apagado a propósito (con 27 módulos y
~13.600 líneas, encenderlo de golpe daría miles de avisos que nadie arreglaría). Para
vigilar un módulo: se le pone `// @ts-check` en la primera línea y se arregla lo que salga.
Ese fichero queda protegido para siempre.

Adoptados (**20 de 27**): `utils.js`, `etiquetas.js`, `config.js`, `overlays.js`, `theme.js`,
`ciudades.js`, `bloqueo-fondo.js`, `auth.js`, `panel.js`, `password-strength.js`, `pwa.js`,
`busqueda.js`, `version-check.js`, `biometric-login.js`, `capacitor-native-biometric.js`,
`cuenta.js`, `push.js`, `notificaciones.js`, `comentarios.js` y `perfil.js`.

**Diferidos a propósito** (necesitan una pasada dedicada; se les quitó el `@ts-check` y
quedan apuntados): `galeria.js` (**37** avisos) y `auth-logic.js` (**130**). Sus patrones ya
se conocen y **están contados** (medidos al adoptarlos):

| Patrón | Cuántos | Qué hace falta |
|---|---|---|
| `HTMLElement`/`Element` → `.value`, `.style`, `.dataset` | ~32 | Decir el tipo del elemento (se deduce del id: `select`, `textarea`...) |
| «posiblemente `null`»: `msgEl` (13), `emailInput` (5), `dropdown`, `trigger`... | ~28 | **Una sola anotación por variable** arregla sus 13 usos: empezar por las que más se repiten |
| `e.target` / `EventTarget` → `.closest`, `.value` | ~20 | Guarda `e.target instanceof Element` antes de usarlo (son `TypeError` latentes) |
| Variables y parámetros que empiezan en `null` (`never`) | ~15 | Anotar con el tipo real |
| `this` en manejadores (`TS2683`), asignaciones (`TS2322`) | ~15 | Uno a uno |

**Se probó a hacerlo automático y NO sirve** (queda escrito para que nadie lo repita): un
script que deduce el tipo por el nombre de la propiedad bajó los avisos de 167 a 129, pero
(a) **destrozó la indentación** (reescribía la declaración sin conservar los espacios) y
(b) metió un aviso nuevo. Se revirtió. **Estos dos ficheros se hacen a mano**, empezando por
las variables que se repiten (`msgEl` son 13 avisos de una sola anotación).

Los globales que necesitan (`_likedObras`, `_vistasRegistradas`, `volverAlBranding`) **ya
están declarados** en `js/tipos-globales.d.ts`, así que la pasada empieza con ventaja.

Ya adoptados de los grandes: `main.js`, `galeria-ui.js` y `chat.js` (los tres limpios).

**Diferido**: `panel-ui.js` (quedan **52** avisos de 172). Lo que ya se hizo:

- **Se encontró y quitó CÓDIGO MUERTO PELIGROSO**: `refrescarTabla()` tenía 19 líneas
  inalcanzables (la función sale antes, porque `#page-info` ya no existe: la tabla de "Mis
  Cavents" se eliminó). Ese bloque usaba **seis variables que no están declaradas en ningún
  sitio** (`currentPage`, `currentLimit`, `currentSearch`, `currentSortBy`, `currentOrder`,
  `totalObras`), así que **si alguien restaurase `#page-info`, el panel reventaba con un
  `ReferenceError`**. Se borró el bloque (13 avisos menos).
- 104 anotaciones puestas (59 declaraciones con el tipo del id + 41 llamadas en línea). Son
  anotaciones y casts: **no cambian nada en ejecución**.

Lo que queda son sobre todo variables que vienen de un `forEach` o son parámetros (ahí no hay
declaración que anotar: hay que castear en el sitio) y los contextos 2D del canvas.

**⚠️ Y una trampa que casi cuesta cara**: un script que buscaba el cierre de la función con
"la primera línea que sea solo `}`" encontró el `}` del `return` temprano y **dejó el bloque
muerto huérfano fuera de la función** — en un módulo ES eso **se ejecuta al cargar** y habría
roto la app entera. Lo cazó `node --check` en el mismo paso. **Para borrar bloques: por
números de línea comprobados, nunca buscando llaves.**

Queda el grande: `problogs.js` (2267 líneas).

### Dos trampas que han costado tiempo

0. **NUNCA poner backticks dentro de un comentario que va dentro de un template literal.**
   Los verificadores construyen el código que evalúan en la página con plantillas
   (`` evalJs(`...`) ``), y un comentario como `// usa `box-shadow`` **cierra la plantilla**
   y rompe el fichero con un `SyntaxError: Unexpected identifier`. Ha pasado **cuatro
   veces**. Dentro de esas plantillas: nada de backticks en comentarios, y los `\\` de las
   expresiones regulares van **dobles** (`\\(`), porque si no el regex que se evalúa en la
   página queda roto y las medidas salen mal sin avisar.

1. **Un error de sintaxis en UN fichero enmascara los avisos de TODOS los demás.** Pasó al
   romper un paréntesis en `biometric-login.js`: el chequeo pasó de 67 avisos (en
   `cuenta.js` y `push.js`) a 1 solo, y parecía que se habían arreglado solos. Ante un
   número de avisos que baja de golpe, mirar primero si hay un `TS1xxx` (sintaxis).
2. **`cuenta.js` y `push.js` siguen vigilados aunque se les quite el `@ts-check`** del
   listado: el script los vuelve a copiar y el error reaparece si no se quita bien la
   primera línea.

Lo que ha ido encontrando (y se ha arreglado): `dataset`/`closest` sobre tipos que no los
tienen, `e.target` posiblemente `null`, `JSON.parse` con un `string | null`,
`URLSearchParams` con números, variables que empiezan en `null` y luego reciben otra cosa
(TypeScript cree entonces que su tipo ES `null`), `.value` sobre un `HTMLElement` (que no lo
tiene), `EventTarget` pasado donde se espera un `Node` (`.contains` lanzaría `TypeError`), y
elementos leídos de `getElementById` sin comprobar que existan antes de tocarles `.onclick`.
Ninguno era visible a simple vista.

**Por qué no se llama a `tsc` directamente:** los imports llevan el hash de caché
(`from './utils.js?v=abc123'`, que pone bump-version.js) y TypeScript no sabe resolver un
módulo con `?v=`. El script hace una **copia temporal** de `js/` con esos `?v=` quitados:
el código es idéntico, solo cambia el nombre del módulo. El repo no se toca.

### ⚠️ NUNCA reescribir estos ficheros con operaciones de texto de PowerShell

Los ficheros del proyecto están en **UTF-8 sin BOM**. Si se leen y se reescriben con
comandos de PowerShell (`Get-Content -Raw` + `WriteAllText`, `.replace`, etc.), la
codificación se puede estropear y el texto queda **doblemente codificado**: `ó` pasa a
`Ã³`. Eso ya ha pasado una vez y **rompió el chat entero**: `ciudades.js` guarda los
pueblos con tilde (`'Táchira'`, `'San Cristóbal'`) y el chat busca exactamente
`window.CIUDADES_POR_PAIS['Venezuela']['Táchira']`; con la clave estropeada la búsqueda no
encontraba nada y la pantalla decía **«No hay pueblos disponibles»**.

Para tocar estos ficheros, usar **Node** o la herramienta de edición (leen y escriben
UTF-8 de verdad):

| Script | Para qué |
|---|---|
| `scripts/adoptar-modulo.mjs js/x.js` | Pone `// @ts-check` en la primera línea sin tocar la codificación (`--quitar` para lo contrario) |
| `scripts/arreglar-codificacion.mjs --comprobar` | Busca la doble codificación en todo `js/`. Con ficheros, la arregla (y comprueba la búsqueda del chat al terminar) |
| `scripts/dbg-codificacion.mjs` | Comprobación a nivel de bytes (la consola de PowerShell engaña: muestra bien lo que está mal) |

## Efectos medidos y DESCARTADOS (para no volver a intentarlo a ciegas)

Dos mejoras nativas que prometen mucho y que, **medidas en esta app, no cumplen**:

| Se probó | Qué dijo la medida | Decisión |
|---|---|---|
| `content-visibility: auto` + `contain-intrinsic-size` en las tarjetas del feed | La propiedad se aplica (el estilo calculado lo confirma) pero **el navegador no se salta nada**: los hijos de una tarjeta que queda a 6.000px siguen maquetados, con su alto real. Se probó también quitando la animación por si era ella la que lo impedía: tampoco | **Fuera.** No se puede demostrar que ahorre algo y añade contención de pintura (puede recortar lo que se salga de la tarjeta) |
| `animation-timeline: view()` para que las tarjetas entren al scrollear | La animación **sí queda atada a una `ViewTimeline`**, pero **no sigue el scroll**: una tarjeta que está 4.385px por debajo ya aparece al **100%** (debería estar al 0%) | **Fuera.** El efecto no se ve, así que no se pone |

Las dos pruebas están en `scripts/dbg-feed-rendimiento.mjs` (con un feed de 30
publicaciones). Si algún día se retoman, **hay que medir el efecto de verdad** antes de
darlas por buenas: las dos son propiedades que "suenan" a mejora pero que aquí no hacen
nada.

Lo que SÍ se quedó (y está medido): las **View Transitions** del feed a la lectura
(`scripts/dbg-viewtransition.mjs` cuenta las llamadas y las animaciones reales).

### ⚠️ Los verificadores NO se corren en paralelo

Cada verificador abre su propio Chrome. Si se lanzan dos a la vez (o uno mientras otro
sigue vivo), las medidas se contaminan y salen **fallos que no existen**: pasó con
`verificar-aspecto-comentarios`, que dio dos fallos del nav que desaparecieron al repetirlo
con la máquina tranquila. `verificar-todo.mjs` los corre **en serie** a propósito. Si algún
día un verificador falla en algo que no se ha tocado, **repetirlo solo** antes de creerse el
resultado.

## Scripts

| Script | Qué hace |
|---|---|
| scripts/bump-version.js | Cache-busting + versión + sync www/android (correr SIEMPRE antes de commit) |
| scripts/verificar-tipos.mjs | Chequeo de tipos del JS (`npm run check`): copia temporal con los `?v=` quitados y `tsc --noEmit`. Solo vigila los ficheros con `// @ts-check` |
| scripts/foto-estilos.mjs | Foto de estilos calculados y comparación antes/después para refactorizar CSS con red. Cubre **6 vistas** (index, auth, Problogs, **el directorio del chat**, **el perfil de otro artista** y el editor de Problogs) x 2 temas x 2 anchos = **398 medidas** |
| scripts/capar-hojas.mjs | Mete TODO el CSS suelto en `@layer components` de una vez (capado inicial). Deja copia `.antes-de-capar` |
| scripts/mover-a-base.mjs | Mueve a `base` las reglas que son de ETIQUETA (estén sueltas o dentro de un `@media`, conservando su condición). No mueve las de `:-webkit-autofill` (en `base` perderían y volvería el amarillo del autocompletado). Deja copia `.antes-de-mover` |
| scripts/auditar-important.mjs | Lista los `!important` con su selector, su propiedad y su capa (`--hoja`, `--resumen`) |
| scripts/quitar-important.mjs | Quita el `!important` de las reglas que casen con un `--selector`, sin reestructurar nada (solo cambia el cuerpo de esas reglas). Aborta si cambiarían las llaves |
| scripts/auditar-capas.mjs | Lista las reglas SIN capa que pueden ganarle a las capadas (etiquetas solas y familias). Detecta selectores repartidos en varias líneas |
| scripts/dbg-cascada.mjs | Inspector de cascada: dice qué regla gana de verdad una propiedad en un elemento, y la cadena de padres con su ancho. No ve los atajos (`padding`) |
| scripts/verificar-todo.mjs | **Corre TODOS los verificadores** (los que empiecen por `verificar-`) y saca el resumen. Es el comando que hay que usar antes de publicar: ver abajo |
| scripts/verificar-*.mjs | Verificadores de comportamiento y contraste (Chrome headless vía CDP) |

### Antes de publicar: `node scripts/verificar-todo.mjs`

**Hay que correrlos TODOS**, no solo los de la zona que se ha tocado. En una sesión larga se
corrieron cinco durante horas y los otros ocho quedaron sin mirar: al correrlos aparecieron
dos avisos que llevaban ahí sin que nadie los viera (uno era un verificador que ya no
reflejaba el comportamiento correcto, y otro una prueba de integración contra datos reales).
`verificar-todo.mjs` los corre todos, **repite una vez el que falle** (por si es carga de la
máquina) y saca el resumen.

**Un aviso para interpretar el resultado:** `verificar-filtro-problogs-perfil.mjs` era la
única prueba **de integración contra el backend real** (su mock dejaba pasar a propósito
las URLs `/problog`) y dependía de que en producción existiera una publicación concreta, así
que **se ponía roja cuando cambiaban los datos reales**, no cuando el código estaba mal.
**Ya está rehecha con datos simulados** (el mock filtra por `?artista=` como haría el
servidor), así que ahora es determinista.

### El chat tenía un hueco, y se notó

El chat **no tenía ningún verificador**, y un fallo de codificación en `ciudades.js` (los
nombres con tilde quedaron doblemente codificados) dejó la pantalla del chat en **«No hay
pueblos disponibles»** sin que ninguna prueba lo viera. Ahora existe
`scripts/verificar-chat-directorio.mjs`, que comprueba:

- la búsqueda **literal** que hace `chat.js` (`window.CIUDADES_POR_PAIS['Venezuela']['Táchira']`);
- que se pinten los **29** pueblos, con los nombres **sin doble codificación**;
- que la **bandera cargue de verdad** (`naturalWidth > 0`, no solo que tenga `src`);
- los contadores de activos/artistas y el acordeón (abre uno, cierra el anterior).

Comprobado que **habría cazado el fallo**: estropeando `ciudades.js` a propósito, la prueba
falla con 12 fallos y reproduce el síntoma exacto (`["TÃ¡chira"]`, 0 pueblos).
| scripts/minify.js | Genera .min.css/.min.js (enmascara strings, valida con node --check; falla en voz alta si algo no es minificable, ej. perfil.js con templates anidados → usar Terser) |
| scripts/add_banderas.py / fix_banderas.py | Utilidades de banderas (una vez) |

## PWA

- manifest.webmanifest: instalable desde navegador.
- sw.js: Service Worker CONSERVADOR — solo cachea assets versionados
  (?v=...) bajo /js/, /css/, /iconos/. NUNCA intercepta HTML ni version.json
  (el control de versiones sigue siendo bump-version.js). Incluye handlers
  push/notificationclick como andamiaje: para push web se necesitan claves
  VAPID en el backend (hoy el push real es nativo vía Capacitor/FCM).
- En Vercel, sw.js se sirve con no-cache (regla propia en vercel.json).

## Seguridad

- Auth: JWT en cookie HttpOnly + SameSite=Strict (el frontend no guarda el token).
  LocalStorage solo guarda el perfil del artista (artistaData).
- CSP estricta en index.html; headers de seguridad en vercel.json.
- Escapado: utils.js exporta escapeHtml, renderText (escape + decode de
  entidades del backend) y safeImgUrl (solo http(s)/data:image). Úsalos en
  TODO dato de usuario insertado con innerHTML/templates.
- MODELO ACTUAL (importante): el backend escapa con express-validator
  .escape() en parte de los campos; renderText normaliza ambos casos
  (escapado o no) a la misma salida segura sin doble-escape visible.
- innerHTML: hay ~86 usos; los puntos con datos de usuario ya usan los
  helpers. Si agregas uno nuevo, escapa SIEMPRE.

## Notas operativas

- Render free tier duerme tras ~15 min sin tráfico: el primer request tras
  dormir tarda hasta ~1 min (arranque en frío). El heartbeat cada 30 s lo
  mantiene despierto mientras haya usuarios activos.
- KEEP-ALIVE AUTOMÁTICO: el workflow .github/workflows/keepalive-backend.yml
  (repo público, Actions ilimitado) hace ping a /health cada 10 min. También
  puedes usar UptimeRobot/cron-job.org apuntando a
  https://backend-fundacion-atpe.onrender.com/health.
- Dependencias del backend: npm audit da 0 vulnerabilidades tras actualizar
  cloudinary@2 y bcrypt@6 (APIs compatibles verificadas). Tras tocar subidas
  de imágenes, probar un upload en producción.
- APK: es una WebView que carga la URL de Vercel — NO se reconstruye por
  cambios web (los usuarios reciben las actualizaciones al abrir). Reconstruir
  solo al cambiar la capa nativa (plugins, permisos, iconos, versionName).
- Rama master: quedó alineada con main (histórico). No usarla; borrarla en
  el remoto es seguro (git push origin --delete master).
- reasonix.toml y .reasonix/ son memoria local del agente: están en
  .gitignore y fuera del repo (evita ruido en commits y bloat en Pages).
- minify.js NO se usa en producción (los HTML referencian archivos sin
  minificar). Para producción real con minificación completa usar Terser.

## Stack

Node 20+ (scripts), Capacitor 5 (@capacitor/android, push-notifications,
status-bar), Cloudinary, Vercel + GitHub Pages, backend Express en Render.
