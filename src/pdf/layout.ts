/**
 * Cálculo de la maquetación vertical del PDF.
 *
 * El objetivo es que la hoja se ADAPTE al mes: un mes con 8 fechas y uno con
 * 10 tienen que llenar la misma página carta de arriba abajo, no dejar un
 * hueco blanco al final el primero y apretarse el segundo. Para eso el alto de
 * fila deja de ser una constante y pasa a ser el resultado de repartir el
 * espacio que sobra tras descontar todo lo que sí es fijo.
 *
 * Es una función pura sobre la FORMA del modelo (cuántas filas, cuántas
 * tarjetas, cuántas columnas, cuántas líneas por casilla): no toca
 * `@react-pdf/renderer` ni el dominio, y por eso se puede comprobar con
 * aritmética en los tests en vez de rasterizando el PDF.
 */
import {
  CONTENT_HEIGHT,
  CONTENT_WIDTH,
  COLUMNS_HEADER,
  DATE_COLUMN_FONT,
  HEADER,
  NAME_FONT,
  ROW_HEIGHT,
  WEEK_CARD,
} from './theme';
import type { ProgramPdfModel } from './model';

export interface PdfLayout {
  /** Alto de cada fila de fecha, ya repartido para llenar la página. */
  readonly rowHeight: number;
  /** Ancho útil de una casilla de asignación (sin el padding horizontal). */
  readonly cellContentWidth: number;
  readonly nameFontSize: number;
  readonly nameLineHeight: number;
  readonly emptyMarkFontSize: number;
  readonly dayNumberFontSize: number;
  readonly dayNameFontSize: number;
  readonly monthLabelFontSize: number;
  /** `true` cuando el contenido no cupo en una página ni al alto de fila mínimo. */
  readonly overflowsOnePage: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Forma del modelo que determina la maquetación. */
interface ModelShape {
  readonly totalRows: number;
  readonly cardCount: number;
  readonly columnCount: number;
  /** Máximo de líneas de texto que hay que meter en una casilla. */
  readonly maxLinesPerCell: number;
}

export function modelShape(model: ProgramPdfModel): ModelShape {
  let totalRows = 0;
  let maxLinesPerCell = 1;
  for (const card of model.weeks) {
    totalRows += card.rows.length;
    for (const row of card.rows) {
      for (const cell of row.cells) {
        if (cell.lines.length > maxLinesPerCell) maxLinesPerCell = cell.lines.length;
      }
    }
  }
  return {
    totalRows,
    cardCount: model.weeks.length,
    columnCount: model.columns.length,
    maxLinesPerCell,
  };
}

/**
 * Alto que ocupa todo lo que NO son filas de fechas.
 *
 * Cada tarjeta aporta su separación superior y sus dos bordes; la sombra
 * desplazada de la última asoma por debajo y también cuenta.
 */
export function fixedVerticalSpace(cardCount: number): number {
  const cabeceras = HEADER.height + COLUMNS_HEADER.marginTop + COLUMNS_HEADER.height;
  const tarjetas =
    cardCount * (WEEK_CARD.gapBetweenCards + 2 * WEEK_CARD.borderWidth) +
    (cardCount > 0 ? WEEK_CARD.shadowOffset : 0);
  return cabeceras + tarjetas;
}

export function computeLayout(model: ProgramPdfModel): PdfLayout {
  const shape = modelShape(model);

  const disponible = CONTENT_HEIGHT - fixedVerticalSpace(shape.cardCount);
  const ideal = shape.totalRows > 0 ? disponible / shape.totalRows : ROW_HEIGHT.max;
  const rowHeight = clamp(ideal, ROW_HEIGHT.min, ROW_HEIGHT.max);

  // Si hubo que recortar hasta el mínimo, el contenido no cabía: se dejará
  // pasar a la página siguiente en vez de apelotonarlo.
  const overflowsOnePage = shape.totalRows * rowHeight > disponible;

  // El ancho de casilla depende de cuántas columnas pidió el administrador:
  // con seis columnas es estrecha, con cuatro es cómoda.
  const zonaAsignaciones =
    CONTENT_WIDTH - WEEK_CARD.goldBarWidth - WEEK_CARD.dateColumnWidth;
  const anchoColumna =
    shape.columnCount > 0 ? zonaAsignaciones / shape.columnCount : zonaAsignaciones;
  const cellContentWidth = Math.max(
    anchoColumna - 2 * WEEK_CARD.cellPaddingHorizontal,
    1,
  );

  // El cuerpo de los nombres lo limita lo que llegue antes: el ancho de la
  // columna o el alto de la fila. En una hoja de seis columnas manda el ancho.
  const porAncho = cellContentWidth / (NAME_FONT.targetChars * NAME_FONT.avgCharWidthEm);
  const altoUtilCasilla = rowHeight - 2 * WEEK_CARD.cellPaddingVertical;
  const porAlto = altoUtilCasilla / (shape.maxLinesPerCell * NAME_FONT.lineHeight);
  const nameFontSize = clamp(Math.min(porAncho, porAlto), NAME_FONT.min, NAME_FONT.max);

  return {
    rowHeight,
    cellContentWidth,
    nameFontSize,
    nameLineHeight: NAME_FONT.lineHeight,
    emptyMarkFontSize: nameFontSize,
    dayNumberFontSize: clamp(
      rowHeight * DATE_COLUMN_FONT.dayNumberRatio,
      DATE_COLUMN_FONT.dayNumberMin,
      DATE_COLUMN_FONT.dayNumberMax,
    ),
    dayNameFontSize: clamp(
      rowHeight * DATE_COLUMN_FONT.dayNameRatio,
      DATE_COLUMN_FONT.dayNameMin,
      DATE_COLUMN_FONT.dayNameMax,
    ),
    monthLabelFontSize: clamp(
      rowHeight * DATE_COLUMN_FONT.monthLabelRatio,
      DATE_COLUMN_FONT.monthLabelMin,
      DATE_COLUMN_FONT.monthLabelMax,
    ),
    overflowsOnePage,
  };
}
