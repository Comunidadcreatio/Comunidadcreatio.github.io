# Traspaso: seguir adoptando tipos en Creatio (siguiente: `problogs.js`)

Documento para empezar en una conversación nueva. Está todo lo que hace falta: el estado, el
método que funciona, las trampas que ya nos han mordido y cómo se verifica.

---

## 1. Arranque rápido (los primeros 3 pasos)

```powershell
# 1. Comprobar que el servidor local está vivo (si no, LEVANTARLO: es la causa nº1 de
#    "fallos" que no lo son)
node scripts/serve-local.mjs          # dejar en segundo plano (http://127.0.0.1:8099)
Invoke-WebRequest 'http://127.0.0.1:8099/index.html' -UseBasicParsing | Select-Object StatusCode

# 2. Estado del chequeo de tipos
node scripts/verificar-tipos.mjs      # debe decir: SIN ERRORES (25 módulos vigilados)

# 3. Adoptar el siguiente fichero y medir
node scripts/adoptar-modulo.mjs js/problogs.js
node scripts/verificar-tipos.mjs      # y agrupar los avisos como se explica abajo
```

---

## 2. Estado actual (verificado, no de memoria)

| | |
|---|---|
| Versión desplegada | **1.0.654** |
| Commit | `96d82c5`, árbol limpio |
| Módulos con tipos | **25 de 27** — el chequeo está **VERDE** |
| Sin adoptar | `problogs.js` (2267 líneas) y `panel-ui.js` (1529, **diferido con 52 avisos**) |
| Verificadores | **19** en `scripts/`, todos en verde (el de la foto cubre 6 vistas) |

**Adoptados y limpios (25):** auth-logic, auth, biometric-login, bloqueo-fondo, busqueda,
capacitor-native-biometric, chat, ciudades, comentarios, config, cuenta, etiquetas,
galeria-ui, galeria, main, notificaciones, overlays, panel, password-strength, perfil, push,
pwa, theme, utils, version-check.

**Diferidos:** `panel-ui.js` (52 avisos, con su mapa en el README) y `problogs.js` (por medir).

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

---

## 5. Verificación (el orden que funciona)

```powershell
node --check js/<fichero>.js                 # SIEMPRE, tras cada tanda
node scripts/verificar-tipos.mjs             # debe bajar; al final, 0

# El verificador que cubre el fichero (para problogs.js):
node scripts/verificar-comentarios-problog.mjs http://127.0.0.1:8099/   # 92/92
node scripts/verificar-problogs-editor.mjs     http://127.0.0.1:8099/   # 10/10

# La foto de estilos (398 medidas, 6 vistas). Dos corridas y comparar: debe dar
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

## 6. `problogs.js` (el objetivo): lo que hay que saber

- **2267 líneas.** Es el último grande y el que más se usa (el feed y la lectura de Problogs).
- **Lo cubren dos verificadores propios**: `verificar-comentarios-problog.mjs` (**92/92**) y
  `verificar-problogs-editor.mjs` (**10/10**), y la foto lo mide en sus estados `problogs` y
  `editor`.
- **Ese fichero ya se tocó este ciclo** (View Transitions: `abrirLectura`/`cerrarLectura` usan
  `conTransicion` de `utils.js`, y ahí se descubrió que el callback de una View Transition es
  **asíncrono** y hay que **esperarlo** antes de escribir dentro de lo pintado; si no, se
  borra). **Respetar eso al tocarlo.**
- Empezar por lo de siempre: `node scripts/verificar-tipos.mjs` → agrupar avisos por
  **código de error** y por **dueño → propiedad** (el comando está al final del README), y
  atacar en el orden del punto 3.

Comandos útiles para agrupar:
```powershell
# por código de error
node scripts/verificar-tipos.mjs 2>&1 | Select-String 'error TS' | ForEach-Object { [regex]::Match($_.Line,'error (TS\d+)').Groups[1].Value } | Group-Object | Sort-Object Count -Descending
# por dueño -> propiedad
node scripts/verificar-tipos.mjs 2>&1 | Select-String 'does not exist on type' | ForEach-Object { $m=[regex]::Match($_.Line,"Property '([^']+)' does not exist on type '([^']+)'"); "$($m.Groups[2].Value) -> $($m.Groups[1].Value)" } | Group-Object | Sort-Object Count -Descending
# las líneas exactas que fallan
node scripts/verificar-tipos.mjs 2>&1 | Select-String '<fichero>.js\(' | ForEach-Object { ($_.Line -replace '.*<fichero>\.js','<fichero>.js') }
```

---

## 7. Lo que queda además de los tipos

1. **`panel-ui.js`**: 52 avisos (mapa en el README). Son variables de `forEach` o parámetros
   (no hay declaración que anotar: **castear en el sitio**) y los contextos 2D (`ctx`) del
   canvas.
2. **Los 165 `!important`** del CSS: **de uno en uno**, cada uno con la foto antes/después.
   Hay herramientas: `scripts/auditar-important.mjs --resumen` y
   `scripts/quitar-important.mjs --hoja X --selector Y`. **En bloque NO** (se intentó y salió
   con 81 diferencias).
3. **Container queries**: falta pasar el reparto de columnas de `.problogs-feed-perfil` a
   `@container` — necesita declarar el contenedor en su **padre** (la pestaña del perfil),
   porque **un contenedor no puede consultarse a sí mismo**.
4. **Idea pendiente de decidir con el usuario**: un `srcset`/`sizes` más fino en las
   imágenes del editor y en las de la lectura.

---

## 8. Reglas de la casa (no negociables)

- **Medir, no suponer**: cada cambio con la foto y/o un verificador. Si no se puede medir,
  decirlo.
- **Comprobar los verificadores**: si un verificador nuevo dice que todo está bien, hay que
  **provocar el fallo a propósito** y ver que lo caza (así se validó el del chat: se estropeó
  `ciudades.js` y falló con 12 fallos).
- **Dejar la puerta verde**: si un fichero queda a medias, se le quita el `@ts-check`, se
  apunta en el README **con el número exacto** y se sigue. Nunca dejar el chequeo en rojo.
- **Contar la verdad**: si algo no se terminó o salió mal, decirlo en el resumen, con el
  número.
