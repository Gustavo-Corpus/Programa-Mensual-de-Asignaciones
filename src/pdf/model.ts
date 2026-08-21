/**
 * Modelo de vista del documento PDF.
 *
 * Este módulo (y el resto de `src/pdf/`) NO conoce el dominio ni Firestore.
 * Recibe los datos ya "masticados" en forma de texto y estructura listos
 * para maquetar. Nada aquí decide asignaciones ni sabe qué es "Aseo" o
 * "Hospitalidad": todo viene del modelo, incluido el icono de cada columna.
 */

/** Debe mantenerse en sincronía con `AssignmentType['icon']` en el dominio. */
export type IconName =
  | 'calendar'
  | 'person'
  | 'arrow-left'
  | 'arrow-right'
  | 'broom'
  | 'hands-heart'
  | 'people'
  | 'dot';

export interface PdfColumn {
  readonly typeKey: string;
  /** Etiqueta ya en mayúsculas, lista para mostrar. */
  readonly label: string;
  readonly icon: IconName;
}

export interface PdfCell {
  /** Líneas ya partidas por quien llama. Un array vacío pinta "—". */
  readonly lines: readonly string[];
}

export interface PdfDateRow {
  /** IsoDate, solo para depuración/keys; el documento no la reformatea. */
  readonly date: string;
  /** "LUNES", ya en mayúsculas. */
  readonly dayName: string;
  /** "03", con cero a la izquierda. */
  readonly dayNumber: string;
  /** "DE AGOSTO", ya en mayúsculas. */
  readonly monthLabel: string;
  /** Una celda por columna, en el mismo orden que `ProgramPdfModel.columns`. */
  readonly cells: readonly PdfCell[];
}

/** Una tarjeta por semana. Normalmente 2 filas (lunes y sábado), a veces 1. */
export interface PdfWeekCard {
  readonly rows: readonly PdfDateRow[];
}

export interface ProgramPdfModel {
  /** "AGOSTO", ya en mayúsculas. */
  readonly title: string;
  /** "ASIGNACIONES DE SERVICIO", ya en mayúsculas. */
  readonly subtitle: string;
  /** Número de columnas variable: el documento no asume una cantidad fija. */
  readonly columns: readonly PdfColumn[];
  readonly weeks: readonly PdfWeekCard[];
}
