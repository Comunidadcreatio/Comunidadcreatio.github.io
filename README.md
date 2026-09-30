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

**ANTES DE CAPAR UNA HOJA ENTERA, OJO:** lo que NO está en ninguna capa GANA a lo que
SÍ está, así que capar una hoja hace que las reglas que seleccionen lo mismo desde otra
hoja SIN capar le ganen, aunque sean menos específicas.

Caso real (Problogs): capar `problogs.css` se lleva por delante, como mínimo, a
`.crear-problogs-contenido` y el `form` de `formularios.css`, a la caja de
`#panel-artista` (panel-artista.css, que problogs reescribe para el editor) y a las
reglas de Problogs de style.css y header.css. Cada una que se mueve destapa la
siguiente.

**Método que funciona, en este orden:**

1. `node scripts/auditar-capas.mjs` — lista las reglas SIN capa que pueden dar la
   sorpresa (etiquetas solas como `form`, y selectores de la familia que se va a capar).
   Detecta selectores repartidos en varias líneas, que es donde se escapan.
2. `node scripts/foto-estilos.mjs` antes y después, y comparar. Dice exactamente qué
   valores cambiaron.
3. `node scripts/dbg-cascada.mjs` — cuando la foto dice QUÉ cambió pero no POR QUÉ: dice
   qué regla gana de verdad una propiedad en un elemento (y la cadena de padres con su
   ancho). Ojo: no ve los atajos (`padding` no aparece como `padding-left`).
4. Repetir 1-3 hasta que la comparación dé CERO diferencias.

## Scripts

| Script | Qué hace |
|---|---|
| scripts/bump-version.js | Cache-busting + versión + sync www/android (correr SIEMPRE antes de commit) |
| scripts/foto-estilos.mjs | Foto de estilos calculados y comparación antes/después para refactorizar CSS con red. Cubre 4 vistas (index, auth, Problogs y el editor de Problogs) x 2 temas x 2 anchos = 210 medidas |
| scripts/auditar-capas.mjs | Lista las reglas SIN capa que pueden ganarle a las capadas (etiquetas solas y familias). Detecta selectores repartidos en varias líneas |
| scripts/dbg-cascada.mjs | Inspector de cascada: dice qué regla gana de verdad una propiedad en un elemento, y la cadena de padres con su ancho. No ve los atajos (`padding`) |
| scripts/verificar-*.mjs | Verificadores de comportamiento y contraste (Chrome headless vía CDP) |
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
