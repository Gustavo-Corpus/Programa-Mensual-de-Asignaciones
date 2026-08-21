import { describe, expect, it } from 'vitest';
import { computeLayout, fixedVerticalSpace, modelShape } from '@/pdf/layout';
import { CONTENT_HEIGHT, NAME_FONT, ROW_HEIGHT } from '@/pdf/theme';
import {
  programaPdfModel,
  programaPdfModelLargo,
  programaPdfModelMesCompleto,
} from '@/pdf/fixtures';
import type { ProgramPdfModel, PdfWeekCard, PdfDateRow, PdfCell } from '@/pdf/model';

const cell = (...lines: string[]): PdfCell => ({ lines });

/** Modelo sintético con el número de tarjetas y filas por tarjeta indicado. */
function modelWithCards(cardCount: number, rowsPerCard: number): ProgramPdfModel {
  const row = (i: number): PdfDateRow => ({
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    dayName: 'LUNES',
    dayNumber: String(i + 1).padStart(2, '0'),
    monthLabel: 'DE AGOSTO',
    cells: programaPdfModel.columns.map(() => cell('Constantino', 'Castillo')),
  });
  const weeks: PdfWeekCard[] = Array.from({ length: cardCount }, (_, c) => ({
    rows: Array.from({ length: rowsPerCard }, (_, r) => row(c * rowsPerCard + r)),
  }));
  return { ...programaPdfModel, weeks };
}

/** Alto total que ocuparía el contenido con la maquetación calculada. */
function totalContentHeight(model: ProgramPdfModel): number {
  const shape = modelShape(model);
  const layout = computeLayout(model);
  return fixedVerticalSpace(shape.cardCount) + shape.totalRows * layout.rowHeight;
}

describe('computeLayout — la hoja se adapta al mes', () => {
  // El corazón del asunto: la altura de fila no es una constante, se reparte.
  // Un mes de 8 fechas tiene que llenar la misma página carta que uno de 10.
  it.each([
    ['4 lunes + 4 sábados (8 fechas)', 4, 2],
    ['5 lunes + 5 sábados (10 fechas)', 5, 2],
    ['un mes con 12 fechas', 6, 2],
  ])('%s llena la página sin desbordarla', (_nombre, cards, rows) => {
    const model = modelWithCards(cards, rows);
    const alto = totalContentHeight(model);

    expect(alto).toBeLessThanOrEqual(CONTENT_HEIGHT);
    // "Aprovechar todo el espacio": no puede sobrar más de una fila entera.
    expect(alto).toBeGreaterThan(CONTENT_HEIGHT - computeLayout(model).rowHeight);
  });

  it('los fixtures reales caben en una página y la aprovechan', () => {
    for (const model of [programaPdfModel, programaPdfModelMesCompleto]) {
      const alto = totalContentHeight(model);
      expect(alto).toBeLessThanOrEqual(CONTENT_HEIGHT);
      expect(alto).toBeGreaterThan(CONTENT_HEIGHT - computeLayout(model).rowHeight);
      expect(computeLayout(model).overflowsOnePage).toBe(false);
    }
  });

  it('menos fechas dan filas más altas que más fechas', () => {
    const ocho = computeLayout(modelWithCards(4, 2)).rowHeight;
    const diez = computeLayout(modelWithCards(5, 2)).rowHeight;
    expect(ocho).toBeGreaterThan(diez);
    expect(diez).toBeGreaterThan(ROW_HEIGHT.min);
  });

  it('respeta los topes de alto de fila', () => {
    // Muchísimas fechas: se queda en el mínimo y avisa de que no cabe.
    const enorme = computeLayout(programaPdfModelLargo);
    expect(enorme.rowHeight).toBe(ROW_HEIGHT.min);
    expect(enorme.overflowsOnePage).toBe(true);

    // Una sola fecha: no se convierte en una franja de media página.
    const minusculo = computeLayout(modelWithCards(1, 1));
    expect(minusculo.rowHeight).toBe(ROW_HEIGHT.max);
  });
});

describe('computeLayout — cuerpo de los nombres', () => {
  it('los nombres van a un cuerpo grande y nunca por debajo del mínimo', () => {
    for (const model of [programaPdfModel, programaPdfModelMesCompleto]) {
      const { nameFontSize } = computeLayout(model);
      expect(nameFontSize).toBeGreaterThanOrEqual(NAME_FONT.min);
      expect(nameFontSize).toBeLessThanOrEqual(NAME_FONT.max);
      // Era 7.2pt antes de hacer la hoja adaptable; el encargo era agrandarlo.
      expect(nameFontSize).toBeGreaterThan(7.2);
    }
  });

  it('menos columnas dan casillas más anchas y por tanto letra más grande', () => {
    const conCuatro = { ...programaPdfModel, columns: programaPdfModel.columns.slice(0, 4) };
    const conSeis = programaPdfModel;
    expect(computeLayout(conCuatro).cellContentWidth).toBeGreaterThan(
      computeLayout(conSeis).cellContentWidth,
    );
    expect(computeLayout(conCuatro).nameFontSize).toBeGreaterThanOrEqual(
      computeLayout(conSeis).nameFontSize,
    );
  });

  it('la línea más larga esperable cabe en el ancho de la casilla', () => {
    const layout = computeLayout(programaPdfModel);
    const anchoEstimado =
      NAME_FONT.targetChars * NAME_FONT.avgCharWidthEm * layout.nameFontSize;
    expect(anchoEstimado).toBeLessThanOrEqual(layout.cellContentWidth + 0.01);
  });

  it('una casilla con varios ocupantes encoge la letra en vez de desbordarse', () => {
    const base = modelWithCards(5, 2);
    const conCuatroLineas: ProgramPdfModel = {
      ...base,
      weeks: base.weeks.map((card) => ({
        rows: card.rows.map((row) => ({
          ...row,
          cells: row.cells.map(() => cell('Uno', 'Dos', 'Tres', 'Cuatro')),
        })),
      })),
    };
    const layout = computeLayout(conCuatroLineas);
    const altoTexto = 4 * layout.nameLineHeight * layout.nameFontSize;
    expect(altoTexto).toBeLessThanOrEqual(layout.rowHeight);
  });
});

describe('modelShape', () => {
  it('cuenta filas, tarjetas, columnas y la casilla más poblada', () => {
    expect(modelShape(programaPdfModel)).toEqual({
      totalRows: 9,
      cardCount: 5,
      columnCount: 6,
      maxLinesPerCell: 2,
    });
  });

  it('un modelo sin semanas no revienta el reparto', () => {
    const vacio: ProgramPdfModel = { ...programaPdfModel, weeks: [] };
    expect(modelShape(vacio).totalRows).toBe(0);
    expect(computeLayout(vacio).rowHeight).toBe(ROW_HEIGHT.max);
  });
});
