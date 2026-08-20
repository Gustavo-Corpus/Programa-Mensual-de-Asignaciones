/**
 * Paleta y constantes de maquetación del PDF. Nada de literales de color o
 * medida sueltos por los componentes: todo lo que tiene significado visual
 * vive aquí, con nombre.
 */

export const COLORS = {
  fondoPagina: '#FBF8F3',
  ondaFondo: '#F3EADC',
  tarjetaBlanca: '#FFFFFF',
  bordeTarjeta: '#EFE8DA',
  cabeceraBeige: '#F4EDE1',
  columnaFecha: '#FAF5EC',
  dorado: '#B4914F',
  doradoClaro: '#C7AE85',
  textoTitulo: '#23201C',
  textoNombre: '#4B463F',
  textoEtiqueta: '#6E6355',
  textoDiaSemana: '#8C7A5E',
  textoMesPeque: '#9C8B72',
  punteado: '#DBD1C0',
  vacio: '#C6BCA9',
  /** Fondo del círculo del pie, tomado del original: un beige más claro que `cabeceraBeige`. */
  circuloPie: '#F0E7D6',
} as const;

/** Opacidad de la onda decorativa de fondo: muy tenue, casi imperceptible. */
export const ONDA_FONDO_OPACIDAD = 0.55;

/**
 * "Color doradoClaro oscurecido" (pedido para el subtítulo y el nombre en
 * negrita del pie). En vez de inventar un hex nuevo fuera de la paleta
 * declarada, reutilizamos `COLORS.dorado`, que ya es una versión más oscura
 * y saturada de `doradoClaro` dentro de la misma paleta.
 */
export const SUBTITLE_COLOR = COLORS.dorado;

/** Página carta vertical y sus márgenes, en puntos (1pt = 1/72"). */
export const PAGE = {
  width: 612,
  height: 792,
  marginLeft: 30,
  marginRight: 30,
  marginTop: 28,
  marginBottom: 26,
} as const;

/** Ancho útil de contenido: 612 - 30 - 30. */
export const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

/**
 * PRESUPUESTO VERTICAL — leer antes de tocar cualquier altura de aquí abajo.
 *
 * Alto útil = 792 − 28 − 26 = 738pt.
 *
 * El caso peor NO es la hoja de referencia (9 fechas), sino un mes de 31 días
 * que empieza en sábado: 5 sábados + 5 lunes = 10 fechas repartidas en 6
 * tarjetas por semana ISO. Agosto de 2026 es exactamente ese caso. Todo tiene
 * que caber en UNA página también entonces.
 *
 *   cabecera             88
 *   separación           13
 *   cabecera de columnas 42
 *   tarjetas             10×48 + 6×8 + bordes ≈ 535
 *   pie                  12 + 22 = 34
 *   ------------------------------
 *   total               ≈ 712  (26pt de holgura sobre 738)
 *
 * La hoja de referencia es más alta en proporción (2:3) que una carta (1:1.29),
 * así que el diseño original no se puede trasladar punto por punto: hay que
 * comprimirlo en vertical. Si subes una altura, baja otra y comprueba con el
 * test "cabe en una sola página" del caso de 10 fechas.
 */
export const HEADER = {
  height: 80,
  titleFontSize: 34,
  titleLetterSpacing: 10,
  ornamentLineWidth: 90,
  ornamentLineHeight: 0.7,
  ornamentGap: 8,
  ornamentDiamondSize: 5,
  subtitleFontSize: 6.5,
  subtitleLetterSpacing: 3,
  subtitleMarginTop: 7,
} as const;

export const COLUMNS_HEADER = {
  // Alto suficiente para el icono MÁS dos líneas de etiqueta: "ACOMODADOR DE
  // ENTRADA" no cabe en una sola. Con menos, `overflow: hidden` recorta el
  // texto por abajo y la cabecera queda ilegible sin que ningún test se queje.
  height: 58,
  borderRadius: 9,
  marginTop: 13,
  dateColumnWidth: 76,
  iconSize: 11,
  labelFontSize: 5.2,
  labelLetterSpacing: 0.5,
  paddingVertical: 6,
  separatorMarginVertical: 9,
} as const;

export const WEEK_CARD = {
  gapBetweenCards: 8,
  borderRadius: 10,
  borderWidth: 0.6,
  shadowOffset: 1.5,
  goldBarWidth: 5,
  dateColumnWidth: 76,
  rowHeight: 48,
  dayNameFontSize: 5.4,
  dayNameLetterSpacing: 1.2,
  dayNumberFontSize: 21,
  monthLabelFontSize: 5,
  assignmentFontSize: 7.2,
  assignmentLineHeight: 1.25,
  emptyMarkFontSize: 8,
  // Corto a propósito: centrado en la frontera entre las dos filas, cabe en el
  // hueco entre "DE AGOSTO" de arriba y "SÁBADO" de abajo. Más largo, lo cruza.
  connectorHeight: 8,
  connectorDotSize: 2,
} as const;

export const FOOTER = {
  marginTop: 12,
  circleDiameter: 22,
  circleIconSize: 11,
  textFontSize: 6.8,
} as const;
