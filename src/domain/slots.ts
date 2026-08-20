import type { AssignmentType, Slot } from './types';
import type { PlainDate } from './dates';
import { dayOfWeek, datesOfMonthMatching, toIso } from './dates';

// Fechas del mes y lista canónica de slots. Ver docs/algoritmo.md, pasos 1 y 2.
// No elige a nadie: solo construye la estructura vacía a rellenar.

function compareTypeOrder(a: AssignmentType, b: AssignmentType): number {
  if (a.order !== b.order) return a.order - b.order;
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

export interface SlotsResult {
  /** Fechas del mes cuyo día de semana está en la unión de los tipos activos, ascendente. */
  readonly dates: readonly PlainDate[];
  /** Lista de slots en orden canónico: fecha, luego tipo (order, key), luego slotIndex. */
  readonly slots: readonly Slot[];
}

/**
 * Construye la lista canónica de slots del mes.
 *
 * Las fechas se derivan de `daysOfWeek` de los tipos ACTIVOS, no de una
 * constante: con la semilla por defecto ([1, 6] en los seis tipos) salen
 * exactamente los lunes y sábados del mes, sean 4 o 5 de cada uno.
 *
 * `assignmentTypes` no necesita venir pre-ordenado por el llamador: esta
 * función aplica el orden canónico (order, key) ella misma antes de generar
 * los slots, para ser fiel al paso 2 de la especificación de forma
 * autocontenida y testeable en aislamiento.
 */
export function buildSlots(
  year: number,
  month: number,
  assignmentTypes: readonly AssignmentType[]
): SlotsResult {
  const activeTypes = assignmentTypes
    .filter((t) => t.active)
    .slice()
    .sort(compareTypeOrder);

  const daysNeededSet = new Set<number>();
  for (const type of activeTypes) {
    for (const day of type.daysOfWeek) daysNeededSet.add(day);
  }
  const daysNeeded = Array.from(daysNeededSet).sort((a, b) => a - b);

  const dates = datesOfMonthMatching(year, month, daysNeeded);

  const slots: Slot[] = [];
  for (const date of dates) {
    const dow = dayOfWeek(date);
    const iso = toIso(date);
    for (const type of activeTypes) {
      if (!type.daysOfWeek.includes(dow)) continue;
      for (let slotIndex = 0; slotIndex < type.slotsPerDate; slotIndex++) {
        slots.push({
          date: iso,
          dayOfWeek: dow,
          typeKey: type.key,
          typeOrder: type.order,
          kind: type.kind,
          slotIndex,
        });
      }
    }
  }

  return { dates, slots };
}
