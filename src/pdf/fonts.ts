import { Font } from '@react-pdf/renderer';
import {
  CORMORANTGARAMOND_REGULAR,
  CORMORANTGARAMOND_SEMIBOLD,
  MONTSERRAT_REGULAR,
  MONTSERRAT_SEMIBOLD,
} from './assets/fonts/embedded';

/**
 * Registro de fuentes del PDF.
 *
 * Se comprobó con `npm pack --dry-run` que `@fontsource/cormorant-garamond`
 * y `@fontsource/montserrat` NO publican archivos `.ttf`, solo `.woff` y
 * `.woff2`. `@react-pdf/renderer` 4.1.6 (vía `@react-pdf/font`, que usa
 * `fontkit`) declara soporte nativo de WOFF/WOFF2, pero en la práctica
 * registrar los `.woff2` directamente hace fallar `renderToBuffer` con
 * `RangeError: Offset is outside the bounds of the DataView` dentro de
 * `fontkit/dist/src/subset/TTFSubset.js` al hacer el subsetting de glifos:
 * es un bug de esa combinación de versiones, no un límite documentado.
 *
 * Salida elegida: los `.woff2` del subconjunto "latin" (cubre los acentos y
 * la ñ del español) se descomprimieron una sola vez a `.ttf` real con el
 * paquete `wawoff2` (WOFF2 es, en esencia, SFNT comprimido; al descomprimir
 * se obtiene el mismo TTF que si la fuente se hubiera publicado así). Los
 * `.ttf` resultantes son los que viven en `src/pdf/assets/fonts/` y se
 * registran aquí; `wawoff2` fue solo la herramienta de conversión puntual y
 * no quedó como dependencia del proyecto. No son las fuentes integradas de
 * PDF (`Times-Roman` / `Helvetica`): son Cormorant Garamond y Montserrat
 * reales.
 *
 * Los archivos están en el repositorio; no se leen de `node_modules` en
 * tiempo de ejecución ni se descargan de ninguna URL, así que el PDF se
 * genera sin red.
 *
 * Cambiar de familia tipográfica en el futuro implica tocar solo este
 * archivo.
 */

export const FONT_SERIF = 'Cormorant Garamond';
export const FONT_SANS = 'Montserrat';

export const WEIGHT_REGULAR = 400;
export const WEIGHT_SEMIBOLD = 600;

let registered = false;

/**
 * Registra las familias tipográficas en el `Font` store global de
 * `@react-pdf/renderer`. Idempotente: llamarla varias veces (p. ej. una vez
 * por test) no vuelve a registrar nada.
 *
 * Funciona igual en Node (tests, `npm run pdf:preview`) y en el navegador
 * (descarga desde la aplicación) porque los `.ttf` van incrustados como data
 * URI en `./assets/fonts/embedded.ts`. Se descartó resolver rutas de archivo:
 * `fileURLToPath` no existe en el navegador y la sintaxis `?url` de Vite no la
 * entiende Node, así que cualquiera de las dos habría obligado a mantener dos
 * caminos distintos para la misma función. Sigue sin haber ninguna petición de
 * red: el PDF se genera sin conexión.
 */
export function registerFonts(): void {
  if (registered) return;

  Font.register({
    family: FONT_SERIF,
    fonts: [
      { src: CORMORANTGARAMOND_REGULAR, fontWeight: WEIGHT_REGULAR },
      { src: CORMORANTGARAMOND_SEMIBOLD, fontWeight: WEIGHT_SEMIBOLD },
    ],
  });

  Font.register({
    family: FONT_SANS,
    fonts: [
      { src: MONTSERRAT_REGULAR, fontWeight: WEIGHT_REGULAR },
      { src: MONTSERRAT_SEMIBOLD, fontWeight: WEIGHT_SEMIBOLD },
    ],
  });

  // @react-pdf/renderer parte palabras usando su propio motor de guionado;
  // para nombres propios en español preferimos no partir salvo que no
  // quede más remedio.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
