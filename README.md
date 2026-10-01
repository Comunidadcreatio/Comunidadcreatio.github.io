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

### `!important`: por FAMILIAS y con DOS instrumentos (quedan 162)

`auditar-important.mjs` los lista con su selector, su propiedad y su capa. **Hoy quedan 162**:
por hoja, `formularios.css` 65, `auth.css` 39, `style.css` 30, `panel-artista.css` 12,
`galeria-publica.css` 10, `skeleton.css` 3, `notificaciones.css` 2 y `header.css` 1; por capa,
`components` 153 y `base` 9.

Con las capas, un `!important` solo hace falta si tiene que ganarle a OTRO `!important` (lo
importante va por encima de lo normal aunque la capa sea anterior); si solo peleaba contra
reglas normales, muchas veces basta con subir la regla a `utilities` o bajar la competidora a
`base`.

**Lo que NO hay que hacer** (medido y revertido): mover la competidora a `base` y quitar de
golpe los 36 `!important` de los botones de la barra inferior de `formularios.css`. La foto
dio **81 diferencias**: los `!important` ganaban a más reglas de las que parecía.

**El piloto que sí sirvió** (familia de estados del formulario de auth: `:invalid`, `:valid` y
sus gemelas de tema oscuro; 10 declaraciones):

1. Quitar el `!important` de **las 10** → **NO es inocuo**. La foto vio **2 diferencias** (el
   borde del campo vacío en claro) y el verificador de estados vio **4 más que la foto no puede
   ver** (el verde del campo relleno en oscuro y un select obligatorio que se ponía rojo). Se
   revirtió.
2. Quitarlo solo de **las 6 que no son el borde** (3 `box-shadow`, 1 `outline`, 2
   `background-color`) → foto **sin diferencias** y los **12 valores** medidos idénticos. Esas 6
   se quedaron fuera (`auth.css`: 45 → 39).
3. Las **4 de borde son portantes**. Se intentó el paso **en pareja** (subir la especificidad de
   las reglas de estado copiando lo que ya hacía la de `:valid`, que nombra `#login-form` y
   `#forgot-section`, y quitar 3 `!important`) → **15/16**: el select obligatorio vacío se ponía
   **rojo**. Revertido. La razón, con la cascada real delante (`dbg-cascada-real.mjs`), es que la
   pareja **no está en esta familia**, está repartida por otras dos hojas:

   | Quién compite | Dónde | Por qué gana |
   |---|---|---|
   | `#registro-form input[type=…], #login-form input[type=…], …, #panel-artista input { border: 1px solid var(--color-border) }` — **el estilo base de TODOS los campos de la app** | `formularios.css` (lo importa `style.css`) | Lleva ids: (1,1,1) le gana a `input:valid` (0,1,1) por especificidad |
   | `[data-theme="dark"] .form-group input/select { background-color, border-color, color !important }` | `auth.css` | Necesita el `!important` para ganarle al `background`/`border` de esa misma regla base en oscuro. Es lo que obliga a que el `:valid` oscuro también lo lleve |
   | `[data-required="true"]:invalid:not(:placeholder-shown) { border-color: var(--color-danger) !important }` | `formularios.css` | Pinta ROJO cualquier select obligatorio vacío (en un `<select>`, `:placeholder-shown` nunca casa). El `!important` de la familia era lo que lo tapaba |

   **Conclusión**: esta familia no se limpia con un paso en pareja, sino **rediseñando la
   jerarquía del estilo de los formularios** (lo natural es mover esa regla base a `@layer base`,
   que es su sitio: es el estilo de ETIQUETA). El radio de acción es **todos los formularios de
   la app** (el panel incluido), así que antes hay que **ampliar la foto a esos campos**: hoy
   cubre `auth.html` (ya con `#reg-rol`, `#forgot-email` y `#forgot-section`: **404 medidas**),
   pero no los del panel.

**Y un fallo latente que salió de aquí**: `.input-error` no le ganaba a
`#login-form input:valid` (misma especificidad, y en el empate ganaba la última), así que un
campo **válido** marcado con error se veía **verde**. Arreglado moviendo la regla del error
**después** de las de `:valid` y nombrándola también en oscuro: el error es la única regla que
no puede perder nunca. La foto: **sin diferencias** (hoy ningún flujo marca un campo válido, así
que se arregla la intención, no lo que se ve).

**La lección de método**: la foto sola **no basta**. Mide los campos **vacíos**, no los
rellenos ni los de error. Para esas familias hace falta además un verificador de estados
(`verificar-estados-inputs-auth.mjs`, **16** comprobaciones). Los dos instrumentos juntos son
los que dijeron la verdad — y ninguno de los dos la decía solo.

**Y para saber QUIÉN gana, `dbg-cascada-real.mjs`**: le pregunta al navegador por la cascada
real (`CSS.getMatchedStylesForNode`) y marca la candidata que gana. Hace falta porque
`dbg-cascada.mjs` es **orientativo** y tiene dos puntos ciegos que costaron una tarde: no
resuelve las **capas** (`@layer`) y no ve las reglas que declaran el **atajo** `border` cuando
se pregunta por `border-top-color` (devuelve vacío y la salta). El estilo base de los campos se
escondía justo por eso.

## Chequeo de tipos (npm run check)

El JS se revisa con TypeScript **sin compilar nada**: `tsc` solo mira y avisa. No cambia
una línea del código que se sirve ni del deploy.

    npm run check          # o: node scripts/verificar-tipos.mjs

**Se adopta fichero a fichero.** `checkJs` está apagado a propósito (con 27 módulos y
~13.600 líneas, encenderlo de golpe daría miles de avisos que nadie arreglaría). Para
vigilar un módulo: se le pone `// @ts-check` en la primera línea y se arregla lo que salga.
Ese fichero queda protegido para siempre.

Adoptados (**27 de 27**): no queda ninguno sin vigilar. `auth-logic.js`, `auth.js`,
`biometric-login.js`, `bloqueo-fondo.js`, `busqueda.js`, `capacitor-native-biometric.js`,
`chat.js`, `ciudades.js`, `comentarios.js`, `config.js`, `cuenta.js`, `etiquetas.js`,
`galeria-ui.js`, `galeria.js`, `main.js`, `notificaciones.js`, `overlays.js`, `panel.js`,
`panel-ui.js`, `password-strength.js`, `perfil.js`, `problogs.js`, `push.js`, `pwa.js`,
`theme.js`, `utils.js` y `version-check.js`.

**Los patrones que se repiten** (medidos en estos ficheros: sirven para entender cualquier
aviso nuevo que salga):

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
(b) metió un aviso nuevo. Se revirtió. **Estos ficheros se hacen a mano**, empezando por
las variables que se repiten (`msgEl` son 13 avisos de una sola anotación).

Los globales que necesitan (`_likedObras`, `_vistasRegistradas`, `volverAlBranding`) **ya
están declarados** en `js/tipos-globales.d.ts`, así que la pasada empieza con ventaja.

### Cómo se adoptó `panel-ui.js` (el último: 1530 líneas, en LF)

Tenía **172 avisos** la primera vez que se miró. En aquella pasada se quitó un bloque de código
muerto y se pusieron 104 anotaciones (59 declaraciones con el tipo del id + 41 llamadas en
línea), y quedó **diferido con 52**. En esta pasada se han arreglado esos 52 con **17 cambios
en dos tandas** (`scripts/arreglar-tipos-panel-ui.mjs` y `...-2.mjs`).

**Se encontró y quitó CÓDIGO MUERTO PELIGROSO**: `refrescarTabla()` tenía 19 líneas
inalcanzables (la función sale antes, porque `#page-info` ya no existe: la tabla de "Mis
Cavents" se eliminó). Ese bloque usaba **seis variables que no están declaradas en ningún
sitio** (`currentPage`, `currentLimit`, `currentSearch`, `currentSortBy`, `currentOrder`,
`totalObras`), así que **si alguien restaurase `#page-info`, el panel reventaba con un
`ReferenceError`**. Se borró el bloque (13 avisos menos).

| Causa de los 52 avisos | Cuántos | Qué se hizo |
|---|---|---|
| `_caventsCache.data` estaba tipado `never[]` (todo lo que se leía de una obra) | 20 | `@typedef ObraPanel` y la caché anotada: **una anotación arregló 20 avisos** |
| `querySelector`/`getElementById` usados sin comprobar que existan | 8 | Cast al tipo del elemento, o guarda de verdad (`if (content)`, `if (viewport)`) |
| `.value`, `.files`, `.selectedOptions` sobre `Element` | 6 | `@typedef CampoConValor` (los `[data-required="true"]` son 6 inputs, 1 textarea y 9 selects) y `NodeListOf<...>` |
| `e.target` → `.closest` (y `e.target.result`) | 5 | `e.target instanceof Element` antes de usarlo; en el `FileReader`, usar `reader.result` |
| `ctx` del canvas | 4 | Cast a `CanvasRenderingContext2D` (para `'2d'` no puede ser null) |
| `this` de los manejadores (`TS2683`) | 3 | Usar la variable que ya existe (`btn`, `input`), como manda la regla (e) |
| Variables en `null` (`irAlPasoFn`) y un parámetro cuyo tipo era `null` (`guardarObra`) | 3 | Se anotan con su tipo de verdad |
| `catch (e)`: lo capturado es `unknown` | 3 | `const err = /** @type {Error} */ (e)` |

Y dos más que no estaban en esa cuenta: **+1** que salió al tipar la caché (`parseFloat` con un
número, que quiere texto) y **+1** que introdujo la primera tanda (**TypeScript no admite `?.`
en el lado izquierdo de una asignación**, `TS2779`).

Este fichero es **LF** (el raro era `problogs.js`, con CRLF), así que los reemplazos de varias
líneas van con `\n` normal.

**⚠️ Y una trampa que casi cuesta cara**: un script que buscaba el cierre de la función con
"la primera línea que sea solo `}`" encontró el `}` del `return` temprano y **dejó el bloque
muerto huérfano fuera de la función** — en un módulo ES eso **se ejecuta al cargar** y habría
roto la app entera. Lo cazó `node --check` en el mismo paso. **Para borrar bloques: por
números de línea comprobados, nunca buscando llaves.**

### Cómo se adoptó `problogs.js` (2267 líneas)

Empezó con **53 avisos** y quedó limpio con **30 cambios en dos tandas**
(`scripts/arreglar-tipos-problogs.mjs` y `scripts/arreglar-tipos-problogs-2.mjs`). Son
anotaciones JSDoc y guardas: nada de lo que se ejecuta cambió de sentido (lo confirma la foto
de estilos, sin diferencias).

| Patrón | Avisos | Qué se hizo |
|---|---|---|
| `Element`/`HTMLElement` → `.value`, `.checked`, `.style`, `.dataset`, `.disabled` | 21 | Decir el tipo del elemento (se deduce del id o de la etiqueta: `problog-responder-texto` es un `textarea`) |
| «posiblemente `null`» y variables que empiezan en `null` (que TypeScript reduce a `never`) | 13 | **Una anotación por declaración** (`publicacionAbierta`, `observadorFeed`, `portadaNombre`, `lista`…), más un `@typedef Problog` para la publicación abierta |
| `e.target` → `.closest` (`TS18047` + `TS2339`) | 10 | Guarda de verdad: `e.target instanceof Element` antes de usarlo (son `TypeError` latentes) |
| `window.__vvPrueba`, `window.__ignorarAjusteTeclado`, `btn._mostrarTimer` | 5 | Se **declaran** en `js/tipos-globales.d.ts`, no se castean |
| Temporizador guardado como propiedad de la función (`recolocarBarraResponder._t`) | 2 | Pasa a variable del módulo (`number \| undefined`) |
| `textContent = total` con un `number` | 1 | `String(total)`: es la conversión que hacía el navegador solo |
| `e.detail` sobre un `Event` | 1 | Cast a `CustomEvent` |

**Dos cosas que hay que recordar de este fichero:**

1. **Usa CRLF** (los demás del proyecto, no). Un script de reemplazos que busque textos de
   varias líneas con `\n` **no encuentra nada**: hay que pasarlos a `\r\n` (y escribir con
   `\r\n` para no cambiar los finales de línea del fichero).
2. **El cast va en la EXPRESIÓN, no en la declaración.** Esto sigue dando `TS2322` (la
   anotación no convierte el `HTMLElement` que devuelve el DOM):
   `/** @type {HTMLInputElement | null} */ let campo = document.getElementById(...)`.
   Hace falta el paréntesis:
   `let campo = /** @type {HTMLInputElement | null} */ (document.getElementById(...))`.

**Quedó verde de verdad**: `verificar-comentarios-problog.mjs` **92/92**,
`verificar-problogs-editor.mjs` **10/10** y la foto de estilos **sin diferencias**.

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
| scripts/dbg-cascada-real.mjs | **Quién gana una propiedad, de verdad**: pregunta al navegador por la cascada real (`--pagina`, `--tema`, `--elemento`, `--propiedad`, `--valor`, `--input-error`). Es el que hay que usar cuando `dbg-cascada.mjs` no encuentra al culpable |
| scripts/quitar-important.mjs | Quita el `!important` de las reglas que casen con un `--selector`, sin reestructurar nada (solo cambia el cuerpo de esas reglas). Aborta si cambiarían las llaves |
| scripts/auditar-capas.mjs | Lista las reglas SIN capa que pueden ganarle a las capadas (etiquetas solas y familias). Detecta selectores repartidos en varias líneas |
| scripts/dbg-cascada.mjs | Inspector de cascada: dice qué regla gana de verdad una propiedad en un elemento, y la cadena de padres con su ancho. No ve los atajos (`padding`) |
| scripts/verificar-todo.mjs | **Corre TODOS los verificadores** (los que empiecen por `verificar-`, menos él mismo) y saca el resumen. Es el comando que hay que usar antes de publicar: ver abajo |
| scripts/verificar-*.mjs | Verificadores de comportamiento y contraste (Chrome headless vía CDP) |
| scripts/verificar-estados-inputs-auth.mjs | Los estados de los campos de auth (`:invalid`, `:valid`, `.input-error`) en los dos temas: lo que la foto de estilos **no** puede ver (solo mide los campos vacíos) |

### Antes de publicar: `node scripts/verificar-todo.mjs`

**Hay que correrlos TODOS**, no solo los de la zona que se ha tocado. En una sesión larga se
corrieron cinco durante horas y los otros ocho quedaron sin mirar: al correrlos aparecieron
dos avisos que llevaban ahí sin que nadie los viera (uno era un verificador que ya no
reflejaba el comportamiento correcto, y otro una prueba de integración contra datos reales).
`verificar-todo.mjs` los corre todos, **repite una vez el que falle** (por si es carga de la
máquina) y saca el resumen (**17 verificadores de app, más el de tipos: 18**).

**Y un fallo que tuvo el propio `verificar-todo.mjs`** (arreglado): su filtro incluía su propio
fichero, así que **se llamaba a sí mismo** y entraba en **recursión infinita** — los 18
verificadores pasaban y, en vez del resumen, volvía a empezar. Se veía como un comando que no
termina nunca. Si vuelve a pasar, mirar la lista de ficheros que corre: `--solo <texto>` lo
comprueba en segundos (`--solo todo` tiene que decir «0 de 0 verificadores»).

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
