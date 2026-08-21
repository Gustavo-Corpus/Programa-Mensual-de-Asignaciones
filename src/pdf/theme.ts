/**
 * Paleta y constantes de maquetación del PDF. Nada de literales de color o
 * medida sueltos por los componentes: todo lo que tiene significado visual
 * vive aquí, con nombre.
 *
 * Las alturas que dependen de cuántas fechas tiene el mes NO están aquí: se
 * calculan en `layout.ts` a partir de estas constantes. Aquí solo vive lo
 * que es fijo pase lo que pase.
 *
 * Los valores salen de medir la hoja de referencia y reescalarlos por ANCHO
 * (612 / 1024 ≈ 0.6). Se escala por ancho y no por alto a propósito: la hoja
 * de referencia tiene proporción 2:3 y una carta es 1:1.29, así que ninguna
 * conversión respeta las dos dimensiones a la vez. El ancho es el que manda
 * porque de él dependen el cuerpo de la letra y lo que cabe en una columna;
 * la diferencia de alto la absorbe el reparto de `layout.ts`.
 */

export const COLORS = {
  /** Papel blanco: el beige vive en las casillas, no en el fondo. */
  fondoPagina: '#FFFFFF',
  /**
   * Beige muy claro del cuerpo de la tarjeta — el color de "casilla".
   *
   * Es deliberadamente pálido: la zona de los nombres tiene que ser lo más
   * clara de la tarjeta para que el negro de los nombres destaque y para que
   * la columna de fechas se lea como columna aparte sin trazar una línea.
   */
  tarjeta: '#FDFBF6',
  bordeTarjeta: '#EDE2CB',
  /** Beige de la cabecera de columnas. */
  cabeceraBeige: '#F7F0E2',
  /**
   * La columna de fechas va en un beige MÁS marcado que el cuerpo de la
   * tarjeta. Es lo que la separa como columna sin necesidad de una línea.
   */
  columnaFecha: '#F3E9D6',
  dorado: '#B4914F',
  doradoClaro: '#C7AE85',
  textoTitulo: '#23201C',
  /** Casi negro: los nombres van en negrita y son lo que se lee de lejos. */
  textoNombre: '#332E26',
  textoEtiqueta: '#6E6355',
  /**
   * "SÁBADO" y "DE SEPTIEMBRE" van en gris oscuro, no en el tostado de la
   * paleta: sobre el beige de la columna de fechas un tostado claro se lava y
   * deja de leerse. Gris oscuro y no negro, para no competir con los nombres.
   */
  textoFecha: '#4A443B',
  /** Punteado de los separadores de la cabecera de columnas. */
  punteado: '#DDCFB2',
  /**
   * El punteado que separa las dos fechas de una tarjeta va MÁS oscuro que el
   * de la cabecera. Con el mismo tono se perdía sobre el beige pálido del
   * cuerpo y las dos fechas parecían una sola fila alta.
   */
  divisorFila: '#C6B18C',
  vacio: '#C6BCA9',
} as const;

/**
 * "Color doradoClaro oscurecido" (pedido para el subtítulo). En vez de
 * inventar un hex nuevo fuera de la paleta declarada, reutilizamos
 * `COLORS.dorado`, que ya es una versión más oscura y saturada de
 * `doradoClaro` dentro de la misma paleta.
 */
export const SUBTITLE_COLOR = COLORS.dorado;

/**
 * Página carta vertical y sus márgenes, en puntos (1pt = 1/72").
 *
 * Los márgenes laterales son estrechos (≈3.6% del ancho, como en la hoja de
 * referencia) porque cada punto que se le quita al margen es ancho de columna,
 * y el ancho de columna es lo que determina el cuerpo de los nombres.
 */
export const PAGE = {
  width: 612,
  height: 792,
  marginLeft: 22,
  marginRight: 22,
  marginTop: 24,
  marginBottom: 24,
} as const;

/** Ancho útil de contenido: 612 - 22 - 22. */
export const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

/** Alto útil de contenido: 792 - 24 - 24. */
export const CONTENT_HEIGHT = PAGE.height - PAGE.marginTop - PAGE.marginBottom;

/**
 * La cabecera tiene alto FIJO y declarado (no natural) a propósito: es el
 * primer sumando del presupuesto vertical que `layout.ts` reparte entre las
 * filas, y un alto que dependiera de las métricas de la fuente haría que ese
 * cálculo fuese una estimación en vez de una cuenta exacta.
 */
export const HEADER = {
  height: 82,
  titleFontSize: 40,
  titleLineHeight: 1.1,
  titleLetterSpacing: 13,
  ornamentLineWidth: 118,
  ornamentLineHeight: 0.7,
  ornamentGap: 10,
  ornamentDiamondSize: 6,
  ornamentMarginTop: 10,
  subtitleFontSize: 9.5,
  subtitleLineHeight: 1.2,
  subtitleLetterSpacing: 3.6,
  subtitleMarginTop: 9,
} as const;

/** Lo que NO cambia de una tarjeta de semana según el número de fechas. */
export const WEEK_CARD = {
  gapBetweenCards: 10,
  borderRadius: 12,
  borderWidth: 0.6,
  shadowOffset: 1.5,
  goldBarWidth: 6,
  dateColumnWidth: 80,
  dayNameLetterSpacing: 1.4,
  /** Aire mínimo arriba y abajo del texto de una casilla. */
  cellPaddingVertical: 6,
  cellPaddingHorizontal: 4,
} as const;

export const COLUMNS_HEADER = {
  // Alto suficiente para el icono MÁS tres líneas de etiqueta. Dos no bastan:
  // con el cuerpo de letra de la hoja de referencia, "ACOMODADOR DE ENTRADA"
  // puede caer en tres. Con menos alto, `overflow: hidden` recorta el texto por
  // abajo y la cabecera queda ilegible sin que ningún test se queje.
  height: 64,
  borderRadius: 11,
  marginTop: 20,
  /**
   * La celda de FECHA cubre la barra dorada MÁS la columna de fechas de las
   * tarjetas. Así las columnas de la cabecera caen exactamente encima de las
   * casillas que rotulan; con solo `dateColumnWidth` iban desplazadas el ancho
   * de la barra.
   */
  dateColumnWidth: WEEK_CARD.goldBarWidth + WEEK_CARD.dateColumnWidth,
  iconSize: 15,
  labelFontSize: 7,
  labelLetterSpacing: 0.45,
  labelLineHeight: 1.25,
  labelMarginTop: 5,
  paddingVertical: 9,
  separatorMarginVertical: 12,
  /** Aire a los lados de la etiqueta, para que no roce el punteado separador. */
  labelPaddingHorizontal: 4,
} as const;

/**
 * PRESUPUESTO VERTICAL — el alto de fila no es una constante.
 *
 * La hoja se estira o se comprime para llenar la página: `layout.ts` resta del
 * alto útil todo lo fijo (cabecera, cabecera de columnas, separaciones y
 * bordes de las tarjetas) y reparte lo que queda entre las filas de fechas.
 * Un mes con 8 fechas da filas altas; uno con 10, filas algo más bajas; en
 * ambos casos la última tarjeta termina cerca del margen inferior.
 *
 * Los topes existen para que el resultado siga siendo una tabla y no una
 * caricatura: por debajo del mínimo el documento pasa a dos páginas (correcto
 * y legible) en vez de apelotonarse, y por encima del máximo una hoja con muy
 * pocas fechas no se convierte en cuatro franjas gigantes.
 */
export const ROW_HEIGHT = {
  min: 38,
  max: 86,
} as const;

/**
 * Cuerpo de los nombres. Es lo que se lee de lejos y lo que pidió agrandarse,
 * así que el mínimo es deliberadamente alto: antes que encoger la letra por
 * debajo de esto, el documento prefiere pasar a dos páginas.
 */
export const NAME_FONT = {
  min: 8,
  max: 12,
  lineHeight: 1.25,
  /**
   * Ancho medio de un carácter en Montserrat SemiBold, en fracción de em, y
   * cuántos caracteres tiene que aceptar una línea sin desbordar. Con la
   * partición en dos líneas de `buildPdfModel`, la línea más larga de un
   * nombre real ronda los 11 caracteres ("Constantino"); se pide holgura para
   * medio carácter más porque el guionado está desactivado y una línea que no
   * cabe no se parte: se sale de la casilla.
   */
  avgCharWidthEm: 0.62,
  targetChars: 11.5,
} as const;

/**
 * Tamaños de la columna de fechas, en fracción del alto de fila.
 *
 * El número de día va en Montserrat, NO en Cormorant Garamond, y no es una
 * preferencia estética: Cormorant lleva cifras de estilo antiguo. Su "1" no
 * tiene bandera y sale como una I con serifas, y su "0" es de altura de x, así
 * que "10" se lee "IO", "12" se lee "I2" y "21" se lee "2I". En una hoja de
 * fechas eso no es un matiz tipográfico, es un número mal leído.
 * `@react-pdf/renderer` no expone las características OpenType, así que no hay
 * forma de pedirle a Cormorant cifras de caja alta: la salida es cambiar de
 * familia solo para el número.
 *
 * El cambio de familia obliga a rebajar el tamaño: las cifras de Montserrat
 * ocupan casi toda la altura de caja alta, mientras que las de Cormorant se
 * quedan a media altura. El mismo cuerpo en puntos se ve bastante más grande.
 */
export const DATE_COLUMN_FONT = {
  dayNumberRatio: 0.4,
  dayNumberMin: 16,
  dayNumberMax: 30,
  dayNameRatio: 0.115,
  dayNameMin: 5.4,
  dayNameMax: 7.5,
  monthLabelRatio: 0.105,
  monthLabelMin: 5,
  monthLabelMax: 7.2,
} as const;
