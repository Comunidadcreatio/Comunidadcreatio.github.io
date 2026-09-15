// Lectura de píxeles de una captura PNG. Sin dependencias: se usa zlib de Node.
//
// POR QUÉ HACE FALTA: en esta app el fondo de la página NO es un color CSS —
// `body` y `html` son transparentes a propósito y detrás va un slideshow de
// imágenes (`.auth-bg-slide`). Cualquier comprobación de contraste basada en
// `background-color` mide "transparente" y da resultados falsos. La única forma
// honesta es mirar el píxel que se ve de verdad en la pantalla.

import { inflateSync } from 'node:zlib';

/**
 * Decodifica un PNG (8 bits, color type 2 RGB o 6 RGBA, sin interlace) a
 * { ancho, alto, pixeles: Uint8Array } con 4 bytes por píxel.
 */
export function decodificarPNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('no es un PNG');
  let pos = 8;
  let ancho = 0, alto = 0, profundidad = 0, tipoColor = 0;
  const idats = [];
  while (pos < buffer.length) {
    const largo = buffer.readUInt32BE(pos);
    const tipo = buffer.toString('ascii', pos + 4, pos + 8);
    const datos = buffer.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      profundidad = datos[8];
      tipoColor = datos[9];
      if (datos[12] !== 0) throw new Error('PNG entrelazado: no soportado');
    } else if (tipo === 'IDAT') {
      idats.push(datos);
    } else if (tipo === 'IEND') {
      break;
    }
    pos += 12 + largo;
  }
  if (profundidad !== 8) throw new Error('solo PNG de 8 bits por canal');
  if (tipoColor !== 2 && tipoColor !== 6) throw new Error('solo PNG RGB o RGBA');
  const canales = tipoColor === 6 ? 4 : 3;
  const crudo = inflateSync(Buffer.concat(idats));
  const pixeles = new Uint8Array(ancho * alto * 4);
  const anchoFila = ancho * canales;
  let anterior = new Uint8Array(anchoFila);
  let actual = new Uint8Array(anchoFila);
  let p = 0;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[p++];
    for (let x = 0; x < anchoFila; x++) {
      const bruto = crudo[p + x];
      const izq = x >= canales ? actual[x - canales] : 0;
      const arriba = anterior[x];
      const arribaIzq = x >= canales ? anterior[x - canales] : 0;
      let valor;
      switch (filtro) {
        case 0: valor = bruto; break;
        case 1: valor = bruto + izq; break;
        case 2: valor = bruto + arriba; break;
        case 3: valor = bruto + ((izq + arriba) >> 1); break;
        case 4: {
          const pp = izq + arriba - arribaIzq;
          const dp = Math.abs(pp - izq), da = Math.abs(pp - arriba), di = Math.abs(pp - arribaIzq);
          valor = bruto + (dp <= da && dp <= di ? izq : (da <= di ? arriba : arribaIzq));
          break;
        }
        default: throw new Error('filtro PNG desconocido: ' + filtro);
      }
      actual[x] = valor & 0xff;
    }
    p += anchoFila;
    for (let x = 0; x < ancho && canales === 4; x++) {
      for (let c = 0; c < 4; c++) pixeles[(y * ancho + x) * 4 + c] = actual[x * 4 + c];
    }
    if (canales === 3) {
      for (let x = 0; x < ancho; x++) {
        pixeles[(y * ancho + x) * 4] = actual[x * 3];
        pixeles[(y * ancho + x) * 4 + 1] = actual[x * 3 + 1];
        pixeles[(y * ancho + x) * 4 + 2] = actual[x * 3 + 2];
        pixeles[(y * ancho + x) * 4 + 3] = 255;
      }
    }
    const tmp = anterior; anterior = actual; actual = tmp;
  }
  return { ancho, alto, pixeles };
}

/** Color de un píxel como 'rgb(r, g, b)'. */
export function colorEn(imagen, x, y) {
  const cx = Math.max(0, Math.min(imagen.ancho - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(imagen.alto - 1, Math.round(y)));
  const i = (cy * imagen.ancho + cx) * 4;
  return `rgb(${imagen.pixeles[i]}, ${imagen.pixeles[i + 1]}, ${imagen.pixeles[i + 2]})`;
}

/**
 * Color MÁS FRECUENTE dentro de un rectángulo (en píxeles de la imagen).
 * Es la forma robusta de saber el fondo de una zona: el texto y las líneas son
 * una minoría de los píxeles, así que el color dominante es el fondo. Evita
 * tener que acertar un punto concreto que no caiga sobre una letra.
 */
export function colorDominante(imagen, x0, y0, x1, y1) {
  const ax = Math.max(0, Math.round(Math.min(x0, x1)));
  const ay = Math.max(0, Math.round(Math.min(y0, y1)));
  const bx = Math.min(imagen.ancho - 1, Math.round(Math.max(x0, x1)));
  const by = Math.min(imagen.alto - 1, Math.round(Math.max(y0, y1)));
  // Si el rectángulo cae fuera de la captura (elemento fuera de la ventana), no
  // se inventa un color: se devuelve null para que quien mida sepa que no vale.
  if (bx < ax || by < ay) return null;
  const cuenta = new Map();
  for (let y = ay; y <= by; y++) {
    for (let x = ax; x <= bx; x++) {
      const i = (y * imagen.ancho + x) * 4;
      // Se cuantiza a múltiplos de 4 para agrupar el ruido del degradado/foto.
      const clave = ((imagen.pixeles[i] >> 2) << 12) | ((imagen.pixeles[i + 1] >> 2) << 6) | (imagen.pixeles[i + 2] >> 2);
      const c = cuenta.get(clave) || { n: 0, r: 0, g: 0, b: 0 };
      c.n++;
      c.r += imagen.pixeles[i];
      c.g += imagen.pixeles[i + 1];
      c.b += imagen.pixeles[i + 2];
      cuenta.set(clave, c);
    }
  }
  let mejor = null;
  for (const c of cuenta.values()) if (!mejor || c.n > mejor.n) mejor = c;
  if (!mejor) return null;
  return `rgb(${Math.round(mejor.r / mejor.n)}, ${Math.round(mejor.g / mejor.n)}, ${Math.round(mejor.b / mejor.n)})`;
}

/** Convierte 'rgb(...)' o '#rrggbb' a [r, g, b]. */
export function aRGB(color) {  const t = String(color).trim();
  if (t.startsWith('#')) {
    const h = t.slice(1);
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  const i = t.indexOf('(');
  const j = t.indexOf(')');
  if (i === -1) return null;
  const p = t.slice(i + 1, j).split(',').slice(0, 3).map((x) => parseFloat(x));
  return p.some((x) => isNaN(x)) ? null : p;
}

/** Contraste WCAG 2.1 entre dos colores. */
export function contraste(a, b) {
  const lum = (color) => {
    const p = aRGB(color);
    if (!p) return null;
    const v = p.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
