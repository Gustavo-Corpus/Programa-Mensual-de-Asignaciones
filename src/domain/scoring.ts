import type { CostTuple, RejectionReason } from './types';
import type { IsoDate } from './dates';
import { daysBetween } from './dates';
import { stableHash } from './rng';

// Filtros duros y tupla de coste de PERSONAS. Ver docs/algoritmo.md, paso 6.
// Funciones puras sin estado: reciben contadores ya calculados y devuelven la
// tupla o el motivo de rechazo. Así se pueden probar aisladamente con
// contadores literales — la única forma de verificar que el orden de los
// criterios es el que dice el documento.

/**
 * "Nunca lo ha hecho" se trata como hace 10 años, no como infinito: mantiene
 * las tuplas comparables como números y evita que -Infinity contamine sumas.
 */
export const NEVER_DAYS = 3650;

/**
 * Días transcurridos entre `last` y `slotDate`, acotados por NEVER_DAYS.
 * `last === null` ("nunca") también se mapea a NEVER_DAYS.
 */
export function daysSince(last: IsoDate | null, slotDate: IsoDate): number {
  if (last === null) return NEVER_DAYS;
  return Math.min(daysBetween(last, slotDate), NEVER_DAYS);
}

/**
 * Comparador lexicográfico de tuplas de coste (menor gana), con desempate
 * final por `id` ascendente. Da un orden total: nunca hay dos candidatos
 * indistinguibles.
 */
export function compareCandidates(
  a: { readonly id: string; readonly cost: CostTuple },
  b: { readonly id: string; readonly cost: CostTuple }
): number {
  const len = Math.max(a.cost.length, b.cost.length);
  for (let i = 0; i < len; i++) {
    const av = a.cost[i] ?? 0;
    const bv = b.cost[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export interface PersonFilterInput {
  readonly active: boolean;
  /** false si el día de la semana de la casilla está en sus días bloqueados. */
  readonly dayAllowed: boolean;
  /** false si la responsabilidad de la casilla no está entre las suyas. */
  readonly typeAllowed: boolean;
  /**
   * ¿Está en la reserva de capitanes del día? `null` cuando la regla no
   * gobierna esta casilla, que no es lo mismo que `false` ("la gobierna y esta
   * persona no entra").
   */
  readonly inCaptainPool: boolean | null;
  /** true si esta persona ya tiene una asignación esa misma fecha. */
  readonly assignedToday: boolean;
  readonly allowMultiplePerDay: boolean;
  readonly monthCount: number;
  readonly effectiveCap: number;
}

/**
 * Filtros duros para un candidato PERSONA, en el orden fijado por la
 * especificación (paso 6): el primero que falla es el que se reporta.
 * Devuelve `null` cuando el candidato es elegible.
 *
 * El orden no es decorativo: es el que hace legible la traza. Las tres
 * restricciones personales (día, responsabilidad, reserva) van ANTES que el
 * cupo porque describen a la persona y no al reparto — decirle al
 * administrador que alguien "ya llegó a su cupo" cuando en realidad tiene esa
 * responsabilidad vetada le haría buscar el problema donde no está.
 */
export function rejectPerson(input: PersonFilterInput): RejectionReason | null {
  if (!input.active) return 'INACTIVE';
  if (!input.dayAllowed) return 'DAY_BLOCKED';
  if (!input.typeAllowed) return 'TYPE_NOT_ALLOWED';
  if (input.inCaptainPool === false) return 'NOT_IN_CAPTAIN_POOL';
  if (!input.allowMultiplePerDay && input.assignedToday) return 'ALREADY_ASSIGNED_THIS_DATE';
  if (input.monthCount >= input.effectiveCap) return 'AT_CAP';
  return null;
}

export interface PersonCostInput {
  readonly personId: string;
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly seed: number;
  /** monthCount[p] */
  readonly monthCount: number;
  /** histTypeCount[p][T.key] + monthTypeCount[p][T.key] */
  readonly typeCountSoFar: number;
  /** histLastTypeDate[p][T.key] combinado con el mes en curso, o null. */
  readonly lastTypeDate: IsoDate | null;
  /** histCount[p] */
  readonly histCount: number;
  /** lastAssignedDate[p]: máximo entre historial y mes en curso, o null. */
  readonly lastAssignedDate: IsoDate | null;
}

/**
 * Tupla de coste de seis componentes para un candidato PERSONA. El orden está
 * fijado por docs/algoritmo.md, paso 6, y justificado ahí: no se reordena ni
 * se añaden componentes.
 */
export function personCost(input: PersonCostInput): CostTuple {
  return [
    input.monthCount,
    input.typeCountSoFar,
    -daysSince(input.lastTypeDate, input.date),
    input.histCount,
    -daysSince(input.lastAssignedDate, input.date),
    stableHash(input.seed, input.personId, input.date, input.typeKey),
  ];
}

/** Etiquetas en español de cada componente, en el mismo orden que personCost. */
export const PERSON_COST_LABELS: readonly string[] = [
  'Veces este mes',
  'Veces en esta responsabilidad',
  'Antigüedad en la responsabilidad',
  'Veces en el historial',
  'Días desde su última asignación',
  'Desempate',
];

// ---------------------------------------------------------------------------
// Ventana de variedad
// ---------------------------------------------------------------------------

/**
 * Cuánto puede empeorar cada componente respecto al mejor candidato sin dejar
 * de considerarse "igual de bueno". Mismo orden que `personCost`; el último
 * componente (el desempate) NO entra, porque es justo el que decide dentro de
 * la ventana.
 *
 * Los tres componentes de CONTEO van a cero y no se negocian: son el equilibrio
 * del mes, la rotación de responsabilidad y la equidad histórica, es decir,
 * todo lo que `CLAUDE.md` pide garantizar. Los dos componentes de FECHA sí
 * llevan holgura, porque su precisión es falsa: que alguien sirviera hace 12
 * días y otro hace 19 no es una razón de negocio para elegir siempre al mismo,
 * pero comparados al día exacto casi nunca empatan, y sin empates el desempate
 * por semilla no llega a usarse nunca. De ahí venía que "probar otra variante"
 * devolviera una y otra vez el mismo programa.
 *
 * Los valores son los tamaños naturales del problema: una semana para el
 * espaciado (las fechas del programa son lunes y sábados) y un mes para la
 * antigüedad en la responsabilidad.
 */
export const PERSON_COST_TOLERANCE: readonly number[] = [0, 0, 30, 0, 7];

/**
 * Reordena los candidatos YA ORDENADOS por `compareCandidates` de forma que
 * delante queden los que están dentro de la ventana de variedad del mejor,
 * barajados por su componente de desempate (que depende de la semilla), y
 * detrás el resto en su orden original.
 *
 * El resultado sigue siendo una función pura y determinista: misma entrada y
 * misma semilla, mismo orden. Lo que cambia es que ahora la semilla decide de
 * verdad entre candidatos empatados en lo que importa.
 */
export function orderByVariety<T extends { readonly id: string; readonly cost: CostTuple }>(
  sorted: readonly T[],
  tolerance: readonly number[]
): T[] {
  const best = sorted[0];
  if (best === undefined) return [];

  const dentro: T[] = [];
  const fuera: T[] = [];
  for (const candidate of sorted) {
    (withinTolerance(best.cost, candidate.cost, tolerance) ? dentro : fuera).push(candidate);
  }

  dentro.sort(compareTiebreakers);
  return [...dentro, ...fuera];
}

/** ¿`cost` es tan bueno como `best` en todo lo que no es el desempate? */
function withinTolerance(
  best: CostTuple,
  cost: CostTuple,
  tolerance: readonly number[]
): boolean {
  for (let i = 0; i < tolerance.length; i++) {
    const margin = tolerance[i] ?? 0;
    if ((cost[i] ?? 0) - (best[i] ?? 0) > margin) return false;
  }
  return true;
}

/** Solo el último componente (el hash de la semilla) y, si empata, el `id`. */
function compareTiebreakers(
  a: { readonly id: string; readonly cost: CostTuple },
  b: { readonly id: string; readonly cost: CostTuple }
): number {
  const av = a.cost[a.cost.length - 1] ?? 0;
  const bv = b.cost[b.cost.length - 1] ?? 0;
  if (av !== bv) return av - bv;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
