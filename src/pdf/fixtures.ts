import type { ProgramPdfModel, PdfWeekCard, PdfDateRow, PdfCell } from './model';
import { groupIntoCards } from './buildPdfModel';

/**
 * Datos de prueba construidos a mano a partir de `scripts/seed-data.json`
 * (el programa histórico real de agosto 2026 de la hoja de referencia).
 * No se importa ese JSON en tiempo de ejecución ni se recorre
 * programáticamente: los valores están transcritos literalmente para que
 * este módulo siga siendo "a mano", como pide la especificación, y para no
 * acoplar `src/pdf/` a la forma de `scripts/`.
 *
 * Lo único que NO se transcribe a mano es el reparto de las fechas en tarjetas:
 * de eso manda `groupIntoCards`. Copiarlo aquí solo serviría para que los
 * fixtures pudieran quedarse desfasados respecto al documento real sin que
 * nadie se enterase; el reparto tiene sus propias pruebas en
 * `tests/pdf/buildPdfModel.test.ts`.
 */

const line = (...lines: string[]): PdfCell => ({ lines });
const empty: PdfCell = { lines: [] };

const COLUMNS: ProgramPdfModel['columns'] = [
  { typeKey: 'acomodador_entrada', label: 'ACOMODADOR DE ENTRADA', icon: 'person' },
  { typeKey: 'acomodador_auditorio', label: 'ACOMODADOR DE AUDITORIO', icon: 'person' },
  { typeKey: 'pasillo_izquierdo', label: 'PASILLO IZQUIERDO', icon: 'arrow-left' },
  { typeKey: 'pasillo_derecho', label: 'PASILLO DERECHO', icon: 'arrow-right' },
  { typeKey: 'aseo', label: 'ASEO', icon: 'broom' },
  { typeKey: 'hospitalidad', label: 'HOSPITALIDAD', icon: 'people' },
];

const MONTH_LABEL = 'DE AGOSTO';

const WEEKS: readonly PdfWeekCard[] = [
  {
    rows: [
      {
        date: '2026-08-03',
        dayName: 'LUNES',
        dayNumber: '03',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Hugo', 'Jiménez'),
          line('Miguel', 'Bandala'),
          line('Norberto', 'Cerecedo'),
          line('Ivan', 'Quero'),
          line('Grupos', '4 y 8'),
          empty,
        ],
      },
      {
        date: '2026-08-08',
        dayName: 'SÁBADO',
        dayNumber: '08',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Gustavo', 'Corpus'),
          line('Constantino', 'Castillo'),
          line('Armando', 'Martínez'),
          line('Edy', 'Hernández'),
          line('Grupos', '1 y 5'),
          line('Grupos', '2 y 6'),
        ],
      },
    ],
  },
  {
    rows: [
      {
        date: '2026-08-10',
        dayName: 'LUNES',
        dayNumber: '10',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Edgar', 'Ramos'),
          line('Natán', 'Gómez'),
          line('Adiel', 'Vargas'),
          line('Emmanuel', 'Priego'),
          line('Grupos', '2 y 6'),
          empty,
        ],
      },
      {
        date: '2026-08-15',
        dayName: 'SÁBADO',
        dayNumber: '15',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Ernesto', 'Llanos'),
          line('Carlos', 'González'),
          line('Arturo', 'Parra'),
          line('Jose M.', 'García'),
          line('Grupos', '3 y 7'),
          line('Grupos', '4 y 8'),
        ],
      },
    ],
  },
  {
    rows: [
      {
        date: '2026-08-17',
        dayName: 'LUNES',
        dayNumber: '17',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Miguel', 'Bandala'),
          line('Gaspar', 'Rosado'),
          line('Heber', 'Rosado'),
          line('Norberto', 'Cerecedo'),
          line('Grupos', '4 y 8'),
          empty,
        ],
      },
      {
        date: '2026-08-22',
        dayName: 'SÁBADO',
        dayNumber: '22',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Jose M.', 'García'),
          line('Constantino', 'Castillo'),
          line('Edy', 'Hernández'),
          line('Ivan', 'Quero'),
          line('Grupos', '1 y 5'),
          line('Grupos', '3 y 7'),
        ],
      },
    ],
  },
  {
    rows: [
      {
        date: '2026-08-24',
        dayName: 'LUNES',
        dayNumber: '24',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Natán', 'Gómez'),
          line('Luis M.', 'Priego'),
          line('Emmanuel', 'Priego'),
          line('Armando', 'Martínez'),
          line('Grupos', '2 y 6'),
          empty,
        ],
      },
      {
        date: '2026-08-29',
        dayName: 'SÁBADO',
        dayNumber: '29',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Arturo', 'Parra'),
          line('Adiel', 'Vargas'),
          line('Gustavo', 'Corpus'),
          line('Heber', 'Rosado'),
          line('Grupos', '3 y 7'),
          line('Grupos', '1 y 5'),
        ],
      },
    ],
  },
  {
    rows: [
      {
        date: '2026-08-31',
        dayName: 'LUNES',
        dayNumber: '31',
        monthLabel: MONTH_LABEL,
        cells: [
          line('Gaspar', 'Rosado'),
          line('Hugo', 'Jiménez'),
          line('Carlos', 'González'),
          line('Edgar', 'Ramos'),
          line('Grupos', '4 y 8'),
          empty,
        ],
      },
    ],
  },
];

/** Las fechas de la hoja de referencia, en orden y sin agrupar. */
const ROWS: readonly PdfDateRow[] = WEEKS.flatMap((card) => card.rows);

export const programaPdfModel: ProgramPdfModel = {
  title: 'AGOSTO',
  subtitle: 'ASIGNACIONES DE SERVICIO',
  columns: COLUMNS,
  weeks: groupIntoCards(ROWS),
};

/**
 * Modelo largo (12 tarjetas) para probar el salto de página y la
 * repetición de la cabecera de columnas. Reutiliza las mismas semanas del
 * modelo real, repetidas hasta completar 12 tarjetas: el contenido no
 * necesita ser "real" para este propósito, solo estructuralmente correcto.
 */
function buildProgramaPdfModelLargo(): ProgramPdfModel {
  const weeksLargo: PdfWeekCard[] = [];
  const base = programaPdfModel.weeks;
  for (let i = 0; i < 12; i += 1) {
    const source = base[i % base.length];
    if (!source) continue;
    weeksLargo.push({
      rows: source.rows.map((row) => ({ ...row, date: `${row.date}#${i}` })),
    });
  }
  return { ...programaPdfModel, weeks: weeksLargo };
}

export const programaPdfModelLargo: ProgramPdfModel = buildProgramaPdfModelLargo();

/**
 * EL CASO PEOR REAL, y el que fija las alturas de `theme.ts`.
 *
 * La hoja de referencia tiene 9 fechas porque omite el sábado 1. Pero un mes de
 * 31 días que empieza en sábado tiene 5 sábados y 5 lunes = 10 fechas, que se
 * reparten en 6 tarjetas: cuatro completas más el sábado 1 y el lunes 31, que
 * caen en semanas de las que no hay ninguna otra fecha en el mes. Agosto de
 * 2026 es exactamente ese mes, y es el que más filas mete en una sola página.
 *
 * Este es el modelo que tiene que caber en una sola página. Si deja de caber,
 * el programa se parte en dos hojas y hay que reimprimir: no es un detalle
 * estético.
 */
function buildProgramaPdfModelMesCompleto(): ProgramPdfModel {
  const sabado1: PdfDateRow = {
    date: '2026-08-01',
    dayName: 'SÁBADO',
    dayNumber: '01',
    monthLabel: MONTH_LABEL,
    cells: [
      line('Ernesto', 'Llanos'),
      line('Luis M.', 'Priego'),
      line('Gaspar', 'Rosado'),
      line('Heber', 'Rosado'),
      line('Grupos', '3 y 7'),
      line('Grupos', '2 y 6'),
    ],
  };
  return { ...programaPdfModel, weeks: groupIntoCards([sabado1, ...ROWS]) };
}

export const programaPdfModelMesCompleto: ProgramPdfModel = buildProgramaPdfModelMesCompleto();
