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

### `!important`: por FAMILIAS, con DOS instrumentos y con CAPAS (quedan 56)

`auditar-important.mjs` los lista con su selector, su propiedad y su capa. **Hoy quedan 56**:
por hoja, `formularios.css` 19, `auth.css` 14, `style.css` 13 y `galeria-publica.css` 10; por capa,
`components` 49 y `base` 7. **Tres hojas ya no tienen ninguno**: `panel-artista.css`,
`notificaciones.css` (**borradas sus reglas muertas**) y `skeleton.css` (que se ha **eliminado**
entero: solo hablaba de `.skeleton-card`/`.skeleton-galeria`, y nada crea esos elementos).

Con las capas, un `!important` solo hace falta si tiene que ganarle a OTRO `!important` (lo
importante va por encima de lo normal aunque la capa sea anterior) **o a una regla normal de
otra hoja con más especificidad**. Y en ese segundo caso la solución casi nunca es subir la
especificidad: es **mover la regla a su capa**, porque entre capas no manda la especificidad.
Eso es lo que pasó aquí (ver «el rediseño», abajo).

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

   **Conclusión**: esta familia no se limpiaba con un paso en pareja, sino **rediseñando la
   jerarquía del estilo de los formularios**.

**El rediseño que sí funcionó** (mismo día, con la foto ya ampliada: **476 medidas, 7 vistas** —
se añadió la vista `panel`, el formulario de la obra, que era el hueco de cobertura):

1. `mover-base-campos.mjs`: el **aspecto base de los campos** (ancho, relleno, borde, radio,
   fondo… de los inputs y selects de los formularios) pasa de `components` a **`@layer base`**,
   que es su sitio (es estilo de etiqueta). Al bajar de capa deja de ganarle por especificidad a
   las reglas de estado de `auth.css`.
2. `rediseno-campos-auth.mjs`:
   - La regla de los campos de `auth.css` pasa a decir **lo que se ve** (radio 8px, fuente 16px,
     fondo blanco). Antes decía otra cosa (6px, 14px, translúcido) porque perdía y no se notaba;
     desde que gana, tiene que decir la verdad. La fuente se queda en **16px** además por un
     motivo práctico: por debajo de 16px **iOS hace zoom automático** al enfocar un campo.
   - Se quitan **3 `!important`** (los bordes de `:invalid` claro/oscuro y el de `:valid` claro) y
     el `:invalid` pasa a nombrar los formularios que son suyos, como ya hacía el `:valid`.
   - El rojo de `[data-required="true"]:invalid:not(:placeholder-shown)` se **acota a
     `#panel-artista`**, que es de quien es (los 16 campos con `data-required` de `index.html`
     están todos en el formulario de la obra). En las pantallas de auth ese rojo se llevaba por
     delante el gris neutro **por capa** (`:invalid` vive en `base`, el rojo en `components`) y,
     como `:placeholder-shown` no se aplica a los `select`, pintaba rojos los selects
     obligatorios **sin tocarlos**.
3. Medido: **foto SIN DIFERENCIAS** contra la de antes del rediseño (476 medidas), estados
   **16/16** y suite completa en verde. Es decir: **el rediseño no cambia nada de lo que se ve**,
   solo quién manda. `auth.css`: 39 → 36 `!important` (el total del proyecto: 168 → 159).

**Y el tema OSCURO de los campos** (mismo día, 4 más): la regla `[data-theme="dark"] .form-group
input/select, .date-group select, #login-form input` llevaba 3 `!important` para ganarle a la
regla de los campos, que nombra `#login-form input` y `#registro-form input`. Se hizo al revés:
**se le dieron a la regla oscura los selectores con id que le faltaban** (el del **registro**,
que es el único que la otra nombra y esta no) y se le quitaron los 3. Con eso el `:valid` oscuro
(el borde verde) pudo soltar el suyo: **4 menos**, `auth.css` 36 → 32, foto **sin diferencias**
(484 medidas) y estados **16/16**.

Y el selector añadido se comprobó **provocando el fallo**: quitándolo, los campos del registro
pierden el fondo oscuro (**16 diferencias**). Para poder verlo, la foto tuvo que medirlos: se
añadieron `#reg-nombres`, `#reg-email`, `#reg-pass` y `#reg-pais`.

**Y el rojo del panel** (el último de esta familia, 1 más): el mismo movimiento. Al acotarlo a
`#panel-artista` su especificidad pasó a **`(1,3,0)`**, y su competidora en el panel es la regla
del select personalizado (`#obra-form .form-group select`, que pone `border: none`), con
**`(1,1,1)`**: le gana sin `!important`. Antes, sin el id, era `(0,3,0)` y perdía — de ahí venía
el `!important`. El inspector (`dbg-cascada-real.mjs --panel`) fue el que lo dejó claro. Foto
**sin diferencias** (484 medidas) y estados **16/16**.

**Lo que sigue con `!important`**: el resto de las familias (`formularios.css` tiene 51, y las
otras hojas suman 90). El método ya está probado: medir con **dos instrumentos**, preguntar
**quién gana** con `dbg-cascada-real.mjs` y arreglar la **capa** (o la especificidad, si es solo
nombrar lo que la regla ya pinta) antes que la importancia.

## La campaña de los `!important`, lote a lote (168 → 59)

Con la jerarquía de los campos ya arreglada, lo que queda son **~50 reglas** repartidas por las
hojas. Se atacan **de regla en regla** (una regla = un lote), con esta herramienta:

    node scripts/importantes-lote.mjs --hoja css/formularios.css --selector "…" --quitar
    node scripts/importantes-lote.mjs --hoja css/formularios.css --selector "…" --devolver --props "border,color"

**El método de un lote** (cada paso medido, nada a ojo):

1. **Quitar** el `!important` de TODAS las declaraciones de la regla (la herramienta solo toca esa
   regla: ni reordena ni cambia valores).
2. **Foto** y, si hay diferencias, **agruparlas POR PROPIEDAD**. Eso dice exactamente qué
   declaraciones hacían falta: si `borderRadius` cambió, la de `border-radius` era portante.
3. **Devolver** el `!important` solo a esas (`--props`), dejar fuera las demás y **volver a pasar
   la foto**: tiene que dar **SIN DIFERENCIAS**.
4. Las que se quedan fuera siguen **declaradas** (solo pierden la importancia), así que el valor
   se sigue viendo en el CSS: lo que desaparece es el grito.

**Lo ya hecho en la campaña:**

| Lote | Regla | Declaraciones | Resultado |
|---|---|---|---|
| 1 | `#obra-step-bar .crear-btn, #problog-nav-bar .crear-btn` | 13 | **6 fuera**, 7 portantes: `min-height`, `border`, `width`, `min-width`, `border-radius`, `padding`, `font-size` |
| 2 | `#obra-step-bar .limpiar-btn, #problog-nav-bar .limpiar-btn` | 9 | **7 fuera**, 2 portantes: `border` y `color` (`outlineColor` cambiaba solo porque hereda de `color`) |
| 3 | `.ratio-btn.active` y `.ratio-btn:not(.active)` (+ sus gemelas de tema oscuro) | 6 | **4 fuera** (`background`, `border-color`); `color` es portante en oscuro |
| 4 | `#perfil-usuario .perfil-seccion` | 4 | **4 fuera** (`border`, `background`, `padding`, `box-shadow`) |
| 5 | `[data-theme="dark"] button[type="submit"], .nav-btn` | 3 | **0 fuera**: las 3 son portantes (en oscuro el botón blanco pierde fondo, color y borde) |
| 6 | `.imagen-carrusel` (solo escritorio) | 5 | **5 fuera** (`left`, `right`, `margin`, `width`, `max-width`) |
| 7 | `.cavents-dropdown` (dos reglas) y `.cavents-dropdown.open` | 7 | **6 fuera**; `border-top` es portante en oscuro |
| 8 | `.form-block .form-group input/select/textarea` y `.input-etiquetas-subtle` (+ su gemela oscura) | 8 | **4 fuera**; `border-bottom` y `margin-bottom` son portantes |
| 9 | **el reset del panel** (ver abajo) + la familia de la barra | 14 | **14 fuera** |
| 10 | `auth.css`: familia de tema oscuro (`.auth-container`, `.auth-section`, `h1`, `p`, `label`) | 5 | **5 fuera** |
| 11 | `auth.css`: `[data-theme="dark"] .secondary-btn` y sus `:hover` | 5 | **5 fuera** |
| 12 | `auth.css`: `[data-theme="dark"] button[type="submit"], .nav-btn` | 3 | **0 fuera** (portantes) + **selector partido** (ver abajo) |
| 13 | `auth.css`: estados de campo (`.input-available`, `.password-wrapper`, `.step-navigation`, `#registro-form` ×4) | 8 | **8 fuera** |
| 14 | `auth.css`: `.input-error` (dos reglas) | 2 | **0 fuera**: portantes (ver abajo) |
| 15-18 | `formularios.css`: la barra (`.limpiar-btn` y su `:hover`), la maquetación de filas, `#input-descripcion-artistica` y las etiquetas del oscuro | 13 | **8 fuera**, **6 devueltos** (ver abajo) |
| 19-21 | `style.css`: `.toggle-label`, el relleno del carrusel y el de la barra inferior, más tres re-pruebas | 8 | **3 fuera**, **5 devueltos** (ver abajo) |

#### `style.css`: casi todo lo que queda ahí es portante

Se probaron 8 declaraciones y **5 hubo que devolverlas**:

- `#obra-step-bar { background: transparent }` — sin el `!important`, en modo oscuro vuelve el fondo
  `rgba(10,10,10,0.35)` de la regla anterior (la barra dejaría de ser transparente).
- `.carrusel-viewport, .carrusel-slide, .carrusel-slide-empty { background: transparent }` — igual:
  vuelve `rgb(18,18,18)`.
- `.ratio-btn.active { color: #000 }` y `.ratio-btn:not(.active) { color: #fff }` — en oscuro el texto
  pasa de blanco puro a `rgb(245,245,245)` (contraste).
- `.cavents-trigger, .cavents-dropdown { border-top: none }` — vuelve la línea gris.

Se quedaron fuera **3**: el `display: none` de `.toggle-label` (las etiquetas «Chat», «cavents»,
«Buscar» del encabezado) y los dos `backdrop-filter: none` de la barra.

**Y una lección de la herramienta**: al tocar `style.css` a mano (el `.toggle-label`, que es de una
línea y el script no sabe partir) **se movieron los números de línea**, y dos devoluciones fallaron
con «La linea N no cae dentro de ninguna regla» — que es justo lo que tiene que hacer: **negarse en
vez de tocar la regla equivocada**. Se volvieron a buscar las líneas y se rehicieron.

**Instrumento**: la vista `chat` **no era determinista** (614 medidas en una corrida y 644 en la
siguiente: elementos que aparecían y desaparecían). Ahora espera a que el chat esté abierto **y** a
que el pueblo esté desplegado (con alto), y las dos corridas dan 644 sin diferencias.

#### La vista `panel` también monta estados (y esta familia resultó ser mostly portante)

Igual que en `auth`, la vista `panel` ahora **rellena** los campos del formulario de la obra
(`#input-titulo`, `#input-precio`, … → `:valid`), marca el nombre del artista como `read-only` y deja
el foco en un campo obligatorio vacío. Pasa de 29 a **35 elementos** medidos (628 medidas en total).

**Y el resultado de la campaña aquí es honesto y poco lucido**: de las 13 declaraciones que se
quitaron, **6 hubo que devolverlas** porque son portantes:

- `[data-required="true"]:valid` (el borde verde del campo relleno),
- `.form-block .form-group label` y `.form-row-tight` (el margen que las pone a cero),
- `#input-descripcion-artistica` (`min-height: 140px`, que si no se queda en 80),
- y `#obra-step-bar .limpiar-btn` (`border` y `color`, que en modo oscuro sí cambian).

Se quedaron fuera 8 (los `:hover` del `.limpiar-btn` —cubiertos por el verificador de hover—, el
`gap` de `.form-row-3`, el `flex-direction` móvil de `.form-row-tight`, el fondo del
`[data-theme="dark"] #obra-etiquetas-bar` y el `display: none` de `body.creando-problogs`).

**Una trampa de la herramienta, que ya no puede repetirse**: estos 6 se devolvieron con
`importantes-lote.mjs --devolver` **sin `--props`**, y eso pone `!important` en **todas** las
declaraciones de la regla, incluidas las que nunca lo tuvieron (se colaron `resize` y `line-height`
en el textarea). **La foto no lo ve**: un `!important` de más no cambia ni un valor calculado, así
que el «sin diferencias» pasaba igual. Se detectó **comparando las reglas con `git show HEAD:`** y
ahora el script **exige `--props`** para devolver.

**Y lo que cazó el verificador de hover** (que se escribió justamente para esto): de las 8 que se
dejaron fuera, los dos `:color`/`:border-color` del `.limpiar-btn:hover` **también eran portantes** —
al quitarlos, el color ya no cambiaba al pasar el ratón (`rgb(115,115,115)` en los dos estados). La
foto no podía verlo (mide el reposo) y el `verificar-hover-botones.mjs` **falló en cuanto se quitó**.
Se devolvieron los dos y volvió a **12/12**. El balance de la familia queda en **5 declaraciones
fuera de 13 probadas**: poco, pero es la verdad.

**Un hueco del instrumento que queda apuntado**: el `:focus` **no aterriza** en la foto (el estado
`[data-required="true"]:focus` y los `input:focus` de `formularios.css` no se están midiendo). Lo
cubre `verificar-foco-visible.mjs` para el anillo de foco, pero no estas reglas de borde.

#### La vista `auth` ahora MONTA los estados (y por qué hacía falta)

La foto medía el **reposo**, así que las reglas de `:valid`, `:invalid`, `.input-error`,
`.input-available` y `:focus` de `auth.css` no tenían red. La vista `auth` ahora **rellena** los
campos (llevan `required data-required="true"`, o sea que vacíos son `:invalid` y rellenos `:valid`),
abre el login y el registro como lo hace el usuario, pone `.input-error` y `.input-available` y deja
el foco en un campo obligatorio **vacío** (el `:focus` sin que lo tape el `:valid`). Pasa de 18 a
**25 elementos** medidos.

**Y hay un truco que costó un intento**: la validación de la app **borra** esas clases en cuanto se
dispara un evento `input`, así que hay que hacerlo en **dos fases** — primero los valores, esperar a
que la app valide, y **después** poner las clases. En el primer intento, `.input-error` y
`.input-available` no aparecían en la foto (no se estaban midiendo).

**Lo que apareció al medir**: los 2 `!important` de `.input-error` **son portantes**. Al quitarlos, un
campo con error **y** válido se ponía **verde** (`rgb(231,76,60) -> rgb(22,163,74)`, en 12 de los 36
valores que cambiaron). El propio CSS ya lo avisaba en un comentario: «el error tiene que verse
siempre, aunque el campo esté relleno y sea válido: se descubrió midiendo». Ahora esa razón está
**protegida por el instrumento** y no solo por el comentario.

**Una cosa que queda apuntada** (no tocada, porque cambia el color): el rojo que se ve en los campos
con error es `#e74c3c`, un **hex a mano** en una regla vieja, y **no** el `var(--color-danger)` de la
paleta (`#dc2626`). Esa regla vieja gana por especificidad. Unificarlo es un cambio visible de una
línea: cuando se decida, se hace y se mide.

#### La trampa del `!important` que «armaba» a otra regla

El lote 12 dejó un caso que merece quedar escrito. En `auth.css` había dos reglas en modo oscuro:

```css
[data-theme="dark"] button[type="submit"], [data-theme="dark"] .nav-btn { background: …0.90 !important }
[data-theme="dark"] .secondary-btn, [data-theme="dark"] .nav-btn.prev-btn { background: …0.06 }  /* sin !important */
```

El botón **volver** (`.nav-btn.prev-btn`) casa con **las dos**. Mientras las dos llevaban `!important`
ganaba la de abajo (más específica). Al quitarle el `!important` a la de abajo, **la de arriba le ganó
y el botón de volver se puso blanco** (la foto lo cazó: `rgba(255,255,255,0.06) -> rgba(255,255,255,0.9)`).
Quitar un `!important` **cambia quién gana en otras reglas**, no solo en la suya.

La solución fue **partir el selector**: `.nav-btn` sale de la regla de arriba (donde el `!important`
solo hace falta para el botón de enviar, medido) y el de volver se queda con su regla de abajo.

#### Cuando el instrumento se cae (y parece un fallo del CSS)

La vista `auth` pasó a medir **3 elementos** de golpe. No era el CSS: **el servidor local se había
caído** (`ECONNREFUSED` en 8099) y el navegador estaba midiendo una **página de error**. Ahora el
servidor es `scripts/servidor-local.mjs` (se arranca como trabajo en segundo plano) y la foto tiene
`--vistas a,b` para medir **una sola vista** y aislar este tipo de cosas. Con el servidor en pie, la
vista `auth` mide **24 elementos** (18 + los que se añadieron para esta campaña).

#### El RESET del panel (el pendiente estructural del lote 1)

El lote 1 dejó 7 `!important` que no se podían quitar porque les ganaba **otra** regla:
`#panel-artista button[type="submit"]` —la de «Botones de acción del formulario»— con `(1,1,1)`
contra `(1,1,0)`, y esos botones **sí** son `submit` (llevan `form="obra-form"` / `form="problog-form"`).

Lo que parecía un simple «estrechar el selector» tenía una trampa: la regla del formulario también
aportaba la **tipografía** de esos botones (600 / 1.2 / 6px), y los `.crear-btn` que son `type="button"`
(«Vista previa») la tomaban de la regla del lote 1 (700 / 1) → o sea que **hoy la barra tiene los
botones con tipografía distinta**, según cuál gane. Estrechar el selector sin más movía la letra.

La solución fue **partir la regla en dos**:

- las **6 propiedades del «aspecto grande»** (`width`, `min-height`, `padding`, `border`,
  `border-radius`, `font-size`) llevan `:not(:where(.crear-btn))` y así dejan de pisar a la barra;
- **la tipografía y el resto siguen con la lista de siempre**, incluidos los botones de la barra, que
  es lo que se veía.

El `:where()` no es decorativo: **no suma especificidad**, así que la regla sigue siendo `(1,1,1)`
para los botones que sí coge (con un `:not(.crear-btn)` normal subiría a `(1,2,1)` y podría ganarle a
reglas que hoy ganan).

**Resultado**: 14 `!important` menos (los 7 del lote 1 y 7 más de la familia de la barra), con la foto
**SIN DIFERENCIAS** antes y después. Y apareció un `!important` que **sí es portante**, con su
verificador detrás: `#obra-step-bar .crear-btn:hover { background: transparent !important }` — sin él,
el botón **se rellena de gris al pasar el ratón**.

#### `verificar-hover-botones.mjs`: el punto ciego del hover

La foto mide el estado de **reposo**, así que un `!important` dentro de un `:hover` se podía quitar
sin que nada lo notara. Este verificador (12 comprobaciones) mueve el ratón **de verdad** (eventos
CDP, y así se comprueba también que el navegador activa `:hover`) y en los dos temas comprueba:
el **borde** y el **color** cambian al pasar por encima, el **fondo sigue transparente** (el
`!important` portante de arriba) y al salir **vuelve todo al estado de reposo**.

Está validado por **provocación**: quitando ese `!important`, el fondo pasa a `rgb(245,245,245)`
(claro) y `rgb(31,31,31)` (oscuro) y el verificador **falla**. Dos detalles que costaron un rato y
están en el código: hay que leer **hasta que el valor se estabilice** (el botón tiene
`transition: all 0.2s ease` y a tiempo fijo se pillaba el borde a medio camino, `rgb(211)` en vez de
`rgb(212)`) y por eso los botones se miden después de quitarles la clase `hidden`.

**Y un fallo de la herramienta que hay que contar** (porque se vio en su propio recuento): para los
lotes 6-8 hacía falta tocar reglas cuyo selector a secas es ambiguo (hay tres `.cavents-dropdown`),
así que se añadió `--linea N`. La primera versión **estaba mal**: buscaba hacia atrás la primera llave
sin cerrar, y en un CSS con `@layer components { … }` esa llave es la del **`@layer`**, no la de la
regla → el "bloque" era el `@layer` entero y de golpe le quitó **los 36 `!important` a
`formularios.css`** (el recuento que imprime el script lo cantó: `36 -> 0`). Se restauró el fichero
(`git checkout -- css/formularios.css`), se rehízo el lote y la herramienta ahora **localiza la regla
con el parser de reglas** (la que contiene esa línea) y **dice qué regla toca y en qué línea**, para
que un fallo así se vea en la salida y no en el navegador.

**Y otro fallo, este del INSTRUMENTO, que también hay que contar**: la vista `auth` de la foto llevaba
**sesión** puesta (el mismo `localStorage` que las demás vistas), así que la app **redirigía** y esa
vista acababa midiendo elementos del **índice** (el botón de auth daba exactamente los mismos cambios
que el del panel). Ahora la sesión **depende de la página**: en `auth.html` y `reset-password.html` se
borra, y la vista pasó de medir 4 elementos en móvil a **18 en todos los anchos**.

**Un aviso del instrumento que costó un rato** (y que ahora está arreglado): con los lotes 3-5
puestos, la foto acusó cambios en los campos del **fixture** (`#fx-input` de 155px a 150px) y de
**1/64 de píxel** en `.perfil-ciudad`. Antes de tocar nada se repitió la foto **con el mismo CSS**:
dio **40 diferencias**, las mismas. Era **ruido**: el ancho intrínseco de un `<input>` sin clase
depende de la fuente, y si Nunito no había llegado del todo se medía con la de reserva. Arreglado
esperando a `document.fonts.check('16px Nunito')` (no basta con `fonts.ready`).

**La regla que sale de ahí**: antes de creerse una diferencia, **repetir la foto con el mismo CSS**.
Si también sale, es del instrumento, no del cambio (igual que la norma de no fiarse de un verificador
que falla en algo que no se ha tocado).

### Y un hallazgo que ahorró trabajo: CSS MUERTO (31 reglas y 9 `!important`, y 11 más después)

Tres de los lotes que venían (`#panel-artista .acciones-obra .btn-accion`, `.pagination-btn`,
`.acciones-obra`, `.btn-accion`) resultaron ser **CSS de la tabla de "Mis Cavents", que se eliminó**.
A código muerto no se le quita la importancia (no sirve de nada): **se borran las reglas**, con
`scripts/borrar-css-muerto-tabla.mjs` (**31 reglas y 9 `!important` menos**).

Se comprobó **por partida doble**, y las dos cosas hacen falta:

1. **Estático y en el navegador**: ni el HTML ni ningún `.js` crean esos elementos
   (`#page-info`, `#tabla-obras-container`, `.pagination-btn`, `.acciones-obra`, `.btn-accion`); y
   `dbg-cascada-real.mjs --panel --elemento "#tabla-obras-container"` responde «Existe en el DOM?
   false». (El único `.btn-accion*` vivo es `.btn-accion-obra`, de `galeria.js`: **no se toca**.)
2. **La foto del estado ANTERIOR contra el actual**: se guardaron los cambios con
   `git stash push -- <hojas>`, se midió, se restauró con `git stash pop` y se comparó →
   **SIN DIFERENCIAS** en 512 medidas. Eso es a la vez la prueba de que el borrado es inocuo y de
   que el CSS estaba muerto de verdad.

**Ojo con las reglas MIXTAS**: una de `style.css` tenía selectores muertos
(`.filter-controls …`, `.pagination-btn`) **y vivos** (`#btn-guardar`) en la misma lista. Ahí se
quitaron solo los muertos de la lista, no la regla (el script se niega a borrarla: `NO_BORRAR`).

#### El cribador, y una trampa que mordió

Para no ir familia por familia, `scripts/auditar-css-muerto.mjs` **criba todo el CSS**: busca reglas
cuyos selectores nombran ids o clases que no existen en ningún HTML ni `.js`. Da **210 candidatas**
(con los límites de palabra bien puestos: `.btn-eliminar` no cuenta porque exista
`#btn-eliminar-cuenta`). De ahí salieron 4 familias más, con `!important`:
`.btn-eliminar`, `#mobile-main-menu`, `.imagen-carrusel-wrapper` y `.input-valid`/`.input-invalid`
(**11 reglas, 9 `!important`**), borradas con `scripts/borrar-css-muerto.mjs --tokens "…"` (el
genérico).

**Y aquí mordió una trampa de verdad**: una regla era `.mobile-logout-modal, #mobile-main-menu {
display: none }`. El cribador vio el token muerto, el script borró la regla **entera**… y se llevó
por delante los estilos de `.mobile-logout-modal`, que **sí existe** (`#mobile-logout-options` lo
lleva). Lo cazó la **revisión de qué se borra**, no la foto: ese modal está oculto, así que la foto
**no lo mide**. Se restauró el selector vivo y el script se arregló para **partir la lista por comas
y conservar los selectores vivos** (`LIMPIAR (solo la lista)`), que es lo que ahora informa.

**La regla que sale de ahí**: la foto es la red, pero **no ve lo oculto**; cuando se borra algo, hay
que **leer la lista de lo que se borra**. Y los tokens que son prefijo de otros vivos se buscan con
límites (si no, `.btn-eliminar` se lleva `#btn-eliminar-cuenta`).

#### La dieta grande: 202 reglas y **1.386 líneas** de CSS muerto

Con el cribador afinado (una regla solo es candidata si **todas** sus partes por comas llevan tokens
y **todos** están muertos; un selector sin tokens —`input`, `[type="text"]`— cuenta como vivo, que si
no una regla `.muerto, input { … }` se llevaría los estilos de `input`) salieron **202 candidatas**.

Antes de borrarlas se pasó la prueba **empírica**, que es la que de verdad vale:
`scripts/dbg-selectores-existen.mjs` pregunta **al navegador** (`querySelectorAll(sel).length`) por
cada candidata, en las dos páginas y con el panel abierto. Resultado: **164 selectores únicos, todos
con CERO elementos** (y 0 inválidos). Entonces sí: `borrar-css-muerto.mjs --selectores-archivo …`
borró las 202 reglas, y la foto (antes/después) dio **SIN DIFERENCIAS** en 512 medidas.

**Lo que se ha ido**: 1.386 líneas (modales 235, panel-artista 218, search-results 178, skeleton 116,
header 115, auth 103, chat 90, style 66, formularios y notificaciones el resto). Los `!important` no
bajaron de 115 porque estas reglas ya no tenían ninguno: es grasa, no deuda.

**Dos remates del mismo paso:**

- `scripts/limpiar-bloques-vacios.mjs`: los `@media` que quedaron **vacíos** se quitan. Los `@layer`
  vacíos **no**: un `@layer base { }` no pinta nada, pero **fija el orden de capas**, y quitarlo
  cambiaría la cascada.
- La vista `panel` de la foto ahora **espera un estado determinista** (pestaña de Cavents activa y la
  caja de Problogs oculta) antes de medir: sin eso, los valores del panel bailaban entre corridas
  (el radio del select salía 10px o 0px) y salían diferencias que no existían.

#### Las reglas PARCIALES (mezclan selectores vivos y muertos)

Quedaban 72 reglas con la lista de selectores mezclada. `borrar-css-muerto.mjs` las trata **parte por
parte**: quita de la lista los selectores muertos y **deja los vivos** (`LIMPIAR (solo la lista)`).
Resultado: **5 reglas borradas, 15 listas limpiadas y 1 `!important`** menos, con la foto
**sin diferencias**.

**La sutileza que hay que respetar** (y que está en el código): un token muerto **dentro de
`:not(...)`** NO hace inmirable la parte —`.vivo:not(.muerto)` casa con todos los `.vivo` que no
lleven `.muerto`—, así que solo se quitan los argumentos de `:not()`. Los de `:is()`, `:where()` y
`:has()` **sí** se dejan: `.vivo:is(.muerto)` o `.vivo:has(.muerto)` exigen que exista `.muerto`, o
sea que no pueden casar nunca. Y `.vivo .muerto` (descendiente) también es muerta.

**Y de ahí salió un archivo entero**: `skeleton.css` solo hablaba de `.skeleton-card` y
`.skeleton-galeria`, y **nada en el HTML ni en el JS crea esos elementos** → se ha **eliminado el
fichero** (y su `<link>` en `index.html`): −3 `!important` y una petición menos.

**Quién obliga a los 7 del lote 1** (esto es lo que hay que arreglar para poder quitarlos algún
día): el reset del panel

```css
#btn-guardar, #btn-limpiar-campos, #panel-artista button[type="submit"], #panel-artista .btn-aplicar { border: none }
```

Misma capa (`components`) y **un selector de tipo más**: `(1,1,1)` contra `(1,1,0)`. Quitarle el
`!important` a esos 7 exige estrechar ese reset (o bajarlo de capa), y eso es otro paso con su
propia medida.

**Y hay 7 que se quedan POR DISEÑO** (los de la capa `base`): los **anillos de foco** (3) y los 4
de **`@media (prefers-reduced-motion: reduce)`**. Son overrides de accesibilidad: ahí el
`!important` es la herramienta correcta (tienen verificador propio: `verificar-foco-visible.mjs` y
`verificar-menos-movimiento.mjs`), y el que estén en `base` es justo lo que les da la fuerza.

**Instrumento mejorado para esta campaña**: la foto ahora mide también `min/max-width/height`, los
**cuatro** bordes (antes solo arriba e izquierda), `outlineColor`/`offset`, `gap`, rejillas,
`backgroundPosition/Size`, `textOverflow`, `objectFit`… Sin eso, media docena de lotes se habrían
hecho a ciegas (un `max-height` portante no se veía).

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
| scripts/foto-estilos.mjs | Foto de estilos calculados y comparación antes/después para refactorizar CSS con red. Cubre **7 vistas** (index, auth, **el formulario del panel**, Problogs, **el directorio del chat**, **el perfil de otro artista** y el editor de Problogs) x 2 temas x 2 anchos = **476 medidas** |
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
