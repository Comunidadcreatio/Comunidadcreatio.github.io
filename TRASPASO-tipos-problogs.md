# Traspaso: los tipos de Creatio (COMPLETO: 27 de 27 módulos)

Documento para empezar en una conversación nueva. Está todo lo que hace falta: el estado, el
método que funciona, las trampas que ya nos han mordido y cómo se verifica.

> **ADOPCIÓN TERMINADA**: no queda ningún módulo sin `@ts-check`. `problogs.js` se hizo en una
> pasada (sección 6) y `panel-ui.js` en la siguiente (sección 7). Lo que queda del proyecto NO
> son tipos: son los `!important` del CSS, las container queries y el `srcset` (sección 8).
>
> **Y ojo con una trampa nueva del propio herramientas**: `verificar-todo.mjs` se incluía a sí
> mismo en la lista y **se llamaba en recursión** (los 18 verificadores pasaban y volvía a
> empezar, sin sacar nunca el resumen). Ya está arreglado, pero si algún día el comando no
> termina, mirar ahí primero.

---

## 1. Arranque rápido (los primeros 3 pasos)

```powershell
# 1. Comprobar que el servidor local está vivo (si no, LEVANTARLO: es la causa nº1 de
#    "fallos" que no lo son)
node scripts/serve-local.mjs          # dejar en segundo plano (http://127.0.0.1:8099)
Invoke-WebRequest 'http://127.0.0.1:8099/index.html' -UseBasicParsing | Select-Object StatusCode

# 2. Estado del chequeo de tipos
node scripts/verificar-tipos.mjs      # debe decir: SIN ERRORES (27 módulos vigilados)

# 3. Todos los verificadores de la app, en serie (tarda ~10 min)
node scripts/verificar-todo.mjs http://127.0.0.1:8099/
node scripts/verificar-todo.mjs --solo <texto>   # solo los que contengan ese texto
```

---

## 2. Estado actual (verificado, no de memoria)

| | |
|---|---|
| Versión desplegada | **1.0.656** |
| Commit | ver el último commit de `main` |
| Módulos con tipos | **27 de 27** — el chequeo está **VERDE** |
| Sin adoptar | **ninguno** |
| Verificadores | **17** de app en `scripts/` (más el de tipos): **18 de 18 en verde**; el de la foto cubre **7 vistas** (476 medidas) |

**Adoptados y limpios (27):** auth-logic, auth, biometric-login, bloqueo-fondo, busqueda,
capacitor-native-biometric, chat, ciudades, comentarios, config, cuenta, etiquetas,
galeria-ui, galeria, main, notificaciones, overlays, panel, panel-ui, password-strength,
perfil, problogs, push, pwa, theme, utils, version-check.

---

## 3. El MÉTODO que funciona (en este orden, de más rentable a menos)

Cada tanda se aplica con un **script de reemplazos exactos** (Node, nunca PowerShell para
tocar texto) y se revisa el diff. Las cantidades son lo que rindió en los ficheros ya hechos.

### a) Anotar las declaraciones (la regla que más rinde)
Una línea puede arreglar 13 avisos de la misma variable.

```js
// ANTES
const msgEl = document.getElementById('forgot-msg');
// DESPUÉS
const msgEl = /** @type {HTMLElement} */ (document.getElementById('forgot-msg'));
```

Regla general, con el tipo deducido del **id**:
```js
t = t.replace(/(const|let)(\s+)([A-Za-z_$][\w$]*)(\s*=\s*)document\.getElementById\('([^']+)'\);/g,
    (todo, decl, esp, nombre, igual, id) =>
        `${decl}${esp}${nombre}${igual}/** @type {${tipoDe(id, nombre)}} */ (document.getElementById('${id}'));`);
```
`tipoDe`: `select`→HTMLSelectElement · `textarea|descripcion|contenido`→HTMLTextAreaElement ·
`form`→HTMLFormElement · `img|avatar|foto|imagen`→HTMLImageElement · `input|titulo|buscar|
precio|etiqueta`→HTMLInputElement · `btn|boton`→HTMLButtonElement · resto→HTMLElement.

### b) Anotar las llamadas en línea
```js
// document.getElementById('x').value  →  /** @type {HTMLInputElement} */ (document.getElementById('x')).value
t = t.replace(/document\.getElementById\('([^']+)'\)\.(value|classList|style|textContent|innerHTML|dataset|disabled|files|reset|selectedOptions)/g,
    (todo, id, prop) => `/** @type {${tipoDe(id, '')}} */ (document.getElementById('${id}')).${prop}`);
```

### c) Las variables que empiezan en `null`
TypeScript cree que su tipo **ES** `null`; después de un `if (!x) return` lo reduce a `never`
y **todos** sus campos dan error. Se anotan con el tipo que llevan de verdad:
```js
/** @type {HTMLElement | null} */ let ptrIndicator = null;
/** @type {Artista | null} */ let datos = null;          // la interfaz Artista ya existe
/** @type {number | undefined} */ let timer;             // temporizadores (ver trampa nº2)
```

### d) Guardas de verdad (quitan `TypeError` latentes, no solo avisos)
El target de un clic puede ser `window` o `document`:
```js
const objetivo = e.target instanceof Element ? e.target : null;
if (!objetivo) return;
if (objetivo.closest('.lo-que-sea')) return;      // y luego usar `objetivo`, no `e.target`
// y para contains():  if (e.target instanceof Node && !panel.contains(e.target)) ...
```

### e) El `this` de los manejadores
En vez de anotarlo, **usar la variable que ya existe** (`forEach(el => …)` o el propio
elemento). Se lee mejor y no necesita nada.

### f) Propiedades propias y globales → se DECLARAN, no se castean
```ts
// js/tipos-globales.d.ts
interface HTMLElement { _filtroTimer?: number; _ptrTransTimer?: number; }
interface Window { syncChatEntregas?: () => any; refrescarChatNoLeidos?: () => any; }
```
Ahí ya están también `Artista`, `CapacitorGlobal`, `CIUDADES_POR_PAIS`, `abrirObraDesdePerfil`,
`actualizarEstadisticas`…

### g) Conversiones que el navegador ya hacía solo
`String(i)` en los `value` de un `<option>`, `Number(ano)` en las fechas, `?? '0'` en un
`parseInt` (evita un NaN), `.getTime()` al restar dos `Date`, `|| ''` cuando el campo puede
faltar (si no, se escribe la cadena **"undefined"** en pantalla).

---

## 4. LAS TRAMPAS (todas nos han costado tiempo de verdad)

**1. Reemplazar solo la EXPRESIÓN, nunca la línea entera.** Si el reemplazo empieza en
`const` o en la llamada, los espacios de delante quedan fuera de la coincidencia y la
**indentación se conserva sola**. Un intento que reescribía la declaración entera dejó el
fichero sin indentar y hubo que revertirlo.

**2. Los temporizadores: `number | undefined` y asignar `undefined`, NO `| null`.**
```js
/** @type {number | undefined} */ let timer;
timer = setTimeout(...);
timer = undefined;          // ← NO `= null`: clearTimeout quiere number | undefined
```
Con `| null`, cada `clearTimeout(timer)` falla **una a una**. (Si las llamadas van dentro de
un `if (timer)`, el guardia ya descarta el null y `| null` también vale… pero no compliques.)

**3. Un error de SINTAXIS en un fichero enmascara los avisos de TODOS los demás.** Pasó: el
informe pasó de 67 avisos a 1 y parecía que se habían arreglado solos. **Ante una bajada
brusca del número de avisos, buscar primero un `TS1xxx` (sintaxis).**

**4. NUNCA buscar el cierre de una función con "la primera línea que sea solo `}`".**
Encontró el `}` de un `return` temprano y dejó el bloque huérfano **fuera** de la función: en
un módulo ES eso **se ejecuta al cargar** y habría roto la app entera. **Para borrar bloques:
por números de línea comprobados antes de borrar.**

**5. `node --check` SIEMPRE antes de dar algo por bueno.** Es lo único que caza a tiempo el
punto 4 y los backticks.

**6. Nada de backticks dentro de un comentario que va dentro de una plantilla.** Los scripts
construyen el código que evalúan en la página con plantillas; un comentario como
`` // usa `box-shadow` `` **cierra la plantilla** y rompe el fichero. Y los `\` de las
expresiones regulares van **dobles** (`\\(`) dentro de esas plantillas. Ha pasado **cinco
veces**.

**7. Buscar la variable en la línea del error, no en el diff.** Un reemplazo global de
`e.target.closest(` → `objetivo.closest(` alcanzó también una línea de **otro** manejador que
no tenía esa variable. **Revisar el diff de los reemplazos globales.**

**8. El servidor local se cae.** Si un verificador falla en bloque diciendo que no existen ni
los botones del nav, **mirar el servidor primero**, no el código.

**9. No correr dos verificadores a la vez.** Cada uno abre su Chrome y las medidas se
contaminan: salen fallos que no existen. `verificar-todo.mjs` los corre en serie y **repite
una vez** el que falle.

**10. La consola de PowerShell ENGAÑA con la codificación** (muestra bien lo que está mal).
Para comprobar texto, **Node**. Y los ficheros del proyecto son **UTF-8 sin BOM**: no se
pueden leer y reescribir con `Get-Content`/`WriteAllText` (eso causó el fallo del chat:
`'Táchira'` → `'TÃ¡chira'` y "No hay pueblos disponibles"). Herramientas seguras:
`scripts/adoptar-modulo.mjs`, `scripts/arreglar-codificacion.mjs`, `scripts/dbg-codificacion.mjs`.

**11. `problogs.js` usa CRLF** (los demás ficheros del proyecto, no). Un script de reemplazos
que busque textos de varias líneas escritos con `\n` **no encuentra nada**, y si escribe `\n`
le cambia los finales de línea al fichero entero. Hay que pasar los textos a `\r\n` (el script
`scripts/arreglar-tipos-problogs.mjs` tiene el helper `crlf()` que lo hace).

**12. El cast va en la EXPRESIÓN, no en la declaración.** Esto **sigue dando `TS2322`**,
porque la anotación no convierte el `HTMLElement` que devuelve el DOM:

```js
// MAL: error de tipos (el inicializador sigue siendo HTMLElement | null)
/** @type {HTMLInputElement | null} */ let campo = document.getElementById('x');
// BIEN: el cast abraza la expresión
let campo = /** @type {HTMLInputElement | null} */ (document.getElementById('x'));
```
(Salió al adoptar `problogs.js`: dos avisos nuevos que cazó la medida, no la vista.)

---

## 5. Verificación (el orden que funciona)

```powershell
node --check js/<fichero>.js                 # SIEMPRE, tras cada tanda
node scripts/verificar-tipos.mjs             # debe bajar; al final, 0

# Los verificadores que cubren el fichero. Estos son los de problogs.js (sus numeros
# finales, ya con el fichero adoptado):
node scripts/verificar-comentarios-problog.mjs http://127.0.0.1:8099/   # 92/92
node scripts/verificar-problogs-editor.mjs     http://127.0.0.1:8099/   # 10/10
# Para panel-ui.js el que toca es scripts/verificar-estado-panel.mjs.

# La foto de estilos (476 medidas, 7 vistas). Dos corridas y comparar: debe dar
# SIN DIFERENCIAS (las anotaciones no cambian nada en ejecución).
node scripts/foto-estilos.mjs http://127.0.0.1:8099/ --salida scripts/f1.json
node scripts/foto-estilos.mjs http://127.0.0.1:8099/ --salida scripts/f2.json
node scripts/foto-estilos.mjs --comparar scripts/f1.json scripts/f2.json
```

**Antes de publicar (NO olvidar el bump: pasó y los `?v=` se quedaron viejos, o sea que
quien tuviera caché no recibía el arreglo):**
```powershell
node scripts/bump-version.js                 # sube la versión y los ?v=
git add -A; git commit -F .commit-msg.txt; git push origin main
# Git necesita safe.directory: escribir un .git-safeconfig con "[safe] directory = *" y
# [user], poner $env:GIT_CONFIG_GLOBAL, y borrarlo después.
# Mensajes: a un fichero con [System.IO.File]::WriteAllText(..., UTF8Encoding($false)).
```
Y comprobar el despliegue: `https://comunidadcreatio.vercel.app/version.json` (tarda un
poco) y comparar el fichero servido con el local **por contenido** (con `?v=` aleatorio para
evitar la caché).

---

## 6. `problogs.js`: HECHO (53 avisos → 0)

Se adoptó en la pasada anterior. Lo que se midió:

| | |
|---|---|
| Avisos de partida | **53** (40 `TS2339`, 6 `TS18047`, 6 `TS2322`, 1 `TS2345`) |
| Cambios aplicados | **30**, en dos tandas (`scripts/arreglar-tipos-problogs.mjs` y `...-2.mjs`) |
| Verificadores | comentarios **92/92** · editor **10/10** · foto de estilos **SIN DIFERENCIAS** (476 medidas, 7 vistas) |

**Las dos cosas propias de este fichero** (están también en el README, sección de tipos):

1. **Usa CRLF** (los demás del proyecto, no). Un script de reemplazos que busque textos de
   varias líneas con `\n` **no encuentra nada**: hay que pasarlos a `\r\n`.
2. **El cast va en la EXPRESIÓN, no en la declaración.** Esto sigue dando `TS2322`:
   `/** @type {HTMLInputElement | null} */ let campo = document.getElementById(...)`.
   Hace falta el paréntesis: `let campo = /** @type {HTMLInputElement | null} */ (document.getElementById(...))`.

Y sigue en pie lo de antes: **ese fichero ya se había tocado este ciclo** (View Transitions:
`abrirLectura`/`cerrarLectura` usan `conTransicion` de `utils.js`, y ahí se descubrió que el
callback de una View Transition es **asíncrono** y hay que **esperarlo** antes de escribir
dentro de lo pintado; si no, se borra). **Respetar eso al tocarlo.**

---

## 7. `panel-ui.js`: HECHO (52 avisos → 0)

Es el último que quedaba y el que más avisos tenía por delante (172 en total cuando se miró por
primera vez). Lo que se midió:

| | |
|---|---|
| Avisos de partida | **52** (29 `TS2339`, 9 `TS18047`, 6 `TS2531`, 3 `TS18046`, 2 `TS2683`, y 1 de `TS2322`/`TS2349`/`TS2345`) |
| Cambios aplicados | **17**, en dos tandas (`scripts/arreglar-tipos-panel-ui.mjs` y `...-2.mjs`) |
| Verificadores | **18 de 18 en verde** en `verificar-todo.mjs` (17 de app + el de tipos), incluidos estado-panel 18/18, barras-y-validacion 21/21, cavents-crear 12/12, imagenes 14/14 y meta-obra 19/19 · foto de estilos **SIN DIFERENCIAS** (antes/después) |

**Lo que más rindió, y lo que hay que recordar:**

1. **La caché del dropdown** (`_caventsCache.data`) estaba tipada `never[]` porque se declaró
   con `data: []`: **20 avisos** de una sola anotación (`@typedef ObraPanel` + la caché tipada).
   Es el mismo patrón que `let x = null` en `problogs.js`: **el tipo que deduce TypeScript a
   partir del valor inicial vacío es una trampa, y una anotación quita veinte avisos**.
2. **Al tiparla salió 1 aviso nuevo** (`parseFloat` con un número pide texto: `String(...)`).
   Eso es normal y es bueno: antes el `never` lo tapaba.
3. **El `this` de los manejadores** (regla (e)): aquí se quitó de 3 sitios usando la variable
   que ya existía (`input.files?.[0]` en vez de `this.files[0]`, `btn` en vez de `this`).
4. **`?.` NO vale en el lado izquierdo de una asignación** (`TS2779`): lo introdujo la primera
   tanda y lo cazó la medida. Se escribe la guarda (`const v = ...; if (v) v.style... = ...`).
5. **Este fichero es LF** (el raro era `problogs.js`, con CRLF): los reemplazos de varias
   líneas van con `\n` normal.

Y el mapa por causa está en el README (sección de tipos), con los 52 avisos agrupados.

Comandos útiles para agrupar (siguen valiendo para cualquier fichero nuevo):
```powershell
# por código de error
node scripts/verificar-tipos.mjs 2>&1 | Select-String 'error TS' | ForEach-Object { [regex]::Match($_.Line,'error (TS\d+)').Groups[1].Value } | Group-Object | Sort-Object Count -Descending
# por dueño -> propiedad
node scripts/verificar-tipos.mjs 2>&1 | Select-String 'does not exist on type' | ForEach-Object { $m=[regex]::Match($_.Line,"Property '([^']+)' does not exist on type '([^']+)'"); "$($m.Groups[2].Value) -> $($m.Groups[1].Value)" } | Group-Object | Sort-Object Count -Descending
# las líneas exactas que fallan
node scripts/verificar-tipos.mjs 2>&1 | Select-String '<fichero>.js\(' | ForEach-Object { ($_.Line -replace '.*<fichero>\.js','<fichero>.js') }
```

---

## 8. Lo que queda además de los tipos

1. **Los `!important`** del CSS: **quedan 111** (eran 168). Herramientas: `scripts/auditar-important.mjs
   --resumen` (los lista con selector, propiedad y capa) y, para atacar, **`scripts/importantes-lote.mjs`**
   (`--hoja`, `--selector`, `--quitar` / `--devolver --props "a,b"`): quita el `!important` de las
   declaraciones de UNA regla, o lo devuelve solo a las que la foto demuestre que hacían falta.
   **En bloque NO** (se intentó y salió con 81 diferencias).
   **El método de un lote** (está en el README): quitar todas las de una regla → foto → **agrupar las
   diferencias por PROPIEDAD** (eso dice cuáles eran portantes) → devolver el `!important` solo a esas
   → foto otra vez (**sin diferencias**) → siguiente regla.
   **Antes de nada, comprobar que el elemento EXISTE**: gran parte de lo que queda es **CSS MUERTO**
   (la tabla de "Mis Cavents" y otras pantallas se eliminaron y sus reglas se quedaron). El cribador
   es `scripts/auditar-css-muerto.mjs` y hay **dos** comprobaciones antes de borrar:
   `scripts/dbg-selectores-existen.mjs` (pregunta AL NAVEGADOR por cada selector candidato, en las dos
   páginas y con el panel abierto) y la foto antes/después con `git stash push -- css/`.
   **Hecho**: 42 reglas muertas al principio, **202 más en la dieta grande** (1.386 líneas) y las
   **reglas parciales** (5 borradas + 15 listas limpiadas). Y **`skeleton.css` eliminado entero**
   (nada crea `.skeleton-card`/`.skeleton-galeria`). `panel-artista.css`, `notificaciones.css` y
   `skeleton.css` ya no tienen ningún `!important`.
   **Trampa que mordió (2026-10-01)**: una regla era `.mobile-logout-modal, #mobile-main-menu {
   display: none }`; al borrarla entera se perdieron los estilos de `.mobile-logout-modal`, que SÍ
   existe. **La foto no lo vio** (ese modal está oculto). Ahora el script **parte la lista por comas y
   conserva los selectores vivos**; y la norma es **leer siempre la lista de lo que se borra**.
   **Sutileza a respetar**: un token muerto dentro de `:not(...)` NO hace inmirable la parte
   (`.vivo:not(.muerto)` casa); los de `:is()`/`:where()`/`:has()` sí la hacen inmirable.
   **Hecho**: la familia de estados del formulario de auth completa → **27 menos**; los **lotes 1 a 5**
   → **21 más**; y el CSS muerto → **18 más**. **168 → 115**, foto sin diferencias y suite **19/19** en
   cada paso.
   **Se quedan por diseño**: los 7 de `base` (accesibilidad) y los 8 `-webkit-autofill` de `auth.css`.
   **Pendiente**: los 7 portantes del lote 1 dependen del reset del panel
   (`#panel-artista button[type="submit"] { border: none }`); y quedan ~60 reglas (1 regla = 1 lote),
   varias de las cuales son también candidatas a muertas.
2. **Container queries**: falta pasar el reparto de columnas de `.problogs-feed-perfil` a
   `@container` — necesita declarar el contenedor en su **padre** (la pestaña del perfil),
   porque **un contenedor no puede consultarse a sí mismo**.
3. **Idea pendiente de decidir con el usuario**: un `srcset`/`sizes` más fino en las
   imágenes del editor y en las de la lectura.

---

## 9. Reglas de la casa (no negociables)

- **Medir, no suponer**: cada cambio con la foto y/o un verificador. Si no se puede medir,
  decirlo.
- **Comprobar los verificadores**: si un verificador nuevo dice que todo está bien, hay que
  **provocar el fallo a propósito** y ver que lo caza (así se validó el del chat: se estropeó
  `ciudades.js` y falló con 12 fallos).
- **Dejar la puerta verde**: si un fichero queda a medias, se le quita el `@ts-check`, se
  apunta en el README **con el número exacto** y se sigue. Nunca dejar el chequeo en rojo.
- **Contar la verdad**: si algo no se terminó o salió mal, decirlo en el resumen, con el
  número.
