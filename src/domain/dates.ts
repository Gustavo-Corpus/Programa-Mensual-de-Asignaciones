import { getISOWeek, getISOWeekYear } from 'date-fns';

export interface PlainDate {
  readonly y: number;
  readonly m: number; // 1-12, NOT 0-11
  readonly d: number;
}

export type IsoDate = string; // "2026-08-03"

/**
 * Convert PlainDate to ISO string format.
 * @example
 * toIso({y: 2026, m: 8, d: 3}) === "2026-08-03"
 */
export function toIso(date: PlainDate): IsoDate {
  const year = String(date.y).padStart(4, '0');
  const month = String(date.m).padStart(2, '0');
  const day = String(date.d).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert ISO string to PlainDate.
 * @example
 * fromIso("2026-08-03") equals {y: 2026, m: 8, d: 3}
 */
export function fromIso(iso: IsoDate): PlainDate {
  const [yearStr, monthStr, dayStr] = iso.split('-');
  return {
    y: parseInt(yearStr ?? '', 10),
    m: parseInt(monthStr ?? '', 10),
    d: parseInt(dayStr ?? '', 10),
  };
}

/**
 * Get day of week using Date.getDay() convention.
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
export function dayOfWeek(date: PlainDate): number {
  // Use local Date constructor with m-1 (Date uses 0-11)
  const d = new Date(date.y, date.m - 1, date.d);
  return d.getDay();
}

/**
 * Count complete civil days between two dates (b - a).
 * @example
 * daysBetween("2026-08-03", "2026-08-08") === 5
 */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const dateA = fromIso(a);
  const dateB = fromIso(b);

  // Use local Date to avoid timezone issues
  const d1 = new Date(dateA.y, dateA.m - 1, dateA.d);
  const d2 = new Date(dateB.y, dateB.m - 1, dateB.d);

  // Get time at midnight (discard time component)
  const timeA = d1.getTime();
  const timeB = d2.getTime();

  return Math.round((timeB - timeA) / (1000 * 60 * 60 * 24));
}

/**
 * Get dates of a month whose dayOfWeek is in daysOfWeek, in ascending order.
 * @example
 * datesOfMonthMatching(2026, 8, [1, 6]) returns the 10 Mondays and Saturdays
 */
export function datesOfMonthMatching(
  year: number,
  month: number,
  daysOfWeek: readonly number[]
): PlainDate[] {
  const result: PlainDate[] = [];

  if (daysOfWeek.length === 0) {
    return result;
  }

  // Create a set for O(1) lookup
  const targetDays = new Set(daysOfWeek);

  // Get the last day of the month
  const lastDay = new Date(year, month, 0).getDate();

  for (let d = 1; d <= lastDay; d++) {
    const date: PlainDate = { y: year, m: month, d };
    const dow = dayOfWeek(date);
    if (targetDays.has(dow)) {
      result.push(date);
    }
  }

  return result;
}

/**
 * Get ISO 8601 week key in format "YYYY-Www".
 * Week 1 is the week with the first Thursday of the year.
 * @example
 * isoWeekKey({y: 2026, m: 8, d: 3}) === "2026-W32"
 */
export function isoWeekKey(date: PlainDate): string {
  const d = new Date(date.y, date.m - 1, date.d);
  const isoYear = getISOWeekYear(d);
  const isoWeek = getISOWeek(d);
  const weekStr = String(isoWeek).padStart(2, '0');
  return `${isoYear}-W${weekStr}`;
}

/**
 * Get month key in format "YYYY-MM".
 * Lexicographic order matches chronological order.
 * @example
 * monthKey(2026, 8) === "2026-08"
 */
export function monthKey(year: number, month: number): string {
  const monthStr = String(month).padStart(2, '0');
  return `${year}-${monthStr}`;
}

/**
 * Add delta months to a given year/month.
 * Handles wrapping across year boundaries.
 * @example
 * addMonths(2026, 12, 1) returns {year: 2027, month: 1}
 * addMonths(2026, 1, -1) returns {year: 2025, month: 12}
 */
export function addMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return { year: newYear, month: newMonth };
}

export const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export const DAY_NAMES_ES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;
