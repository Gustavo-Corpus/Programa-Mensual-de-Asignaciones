import type { AssignmentKind, LoadTarget, ResolvedAssignment } from './types';
import type { IsoDate } from './dates';

// Pase de mejora local. Ver docs/algoritmo.md, paso 8. Búsqueda local
// determinista y ACOTADA, no un solver opaco: intercambia ocupantes entre
// pares de casillas no bloqueadas y no vacías del mismo `kind`, y solo aplica
// el intercambio si reduce estrictamente el coste global. No cambia bloqueos
// ni cargas (una permuta no cambia cuántas veces sale cada quien).

const W_LOAD = 100;
const W_TYPE = 10;
const W_ADJ = 1;

export interface RepairInput {
  /** Fechas del programa, en el mismo orden ascendente que produjo generateProgram. */
  readonly dates: readonly IsoDate[];
  /** Asignaciones en orden canónico de slots (el mismo índice que los slots originales). */
  readonly assignments: readonly ResolvedAssignment[];
  readonly personTarget: LoadTarget;
  readonly teamTarget: LoadTarget;
  readonly allowMultiplePerDay: boolean;
  readonly allowTeamTwiceSameDate: boolean;
  /** Tope de iteraciones (`settings.maxRepairIterations`). */
  readonly maxIterations: number;
  /**
   * ¿Puede `entityId` ocupar esa casilla? Si se omite, todo intercambio entre
   * casillas del mismo `kind` es legal.
   *
   * Existe porque un intercambio conserva las CARGAS pero no las
   * RESTRICCIONES: mover a alguien de auditorio a pasillo no cambia cuántas
   * veces sale, y sin este predicado el pase de mejora colocaría en el pasillo
   * a quien tiene el pasillo vetado, deshaciendo lo que el paso 6 respetó.
   */
  readonly canOccupy?: (entityId: string, assignment: ResolvedAssignment) => boolean;
}

export interface RepairOutput {
  readonly assignments: readonly ResolvedAssignment[];
  /** Índices (en el array de entrada) de las casillas que el pase tocó. */
  readonly changedIndices: ReadonlySet<number>;
  readonly iterations: number;
}

function occupantOf(a: ResolvedAssignment): string | null {
  return a.kind === 'PERSON' ? a.personId : a.teamId;
}

function withOccupant(a: ResolvedAssignment, occupant: string | null): ResolvedAssignment {
  return a.kind === 'PERSON' ? { ...a, personId: occupant } : { ...a, teamId: occupant };
}

function buildDateIndex(dates: readonly IsoDate[]): ReadonlyMap<IsoDate, number> {
  const map = new Map<IsoDate, number>();
  dates.forEach((d, i) => map.set(d, i));
  return map;
}

/**
 * Coste local de una sola entidad: el término de carga (W_LOAD), el término
 * de rotación de tipo (W_TYPE) y el término de espaciado (W_ADJ) definidos en
 * el paso 8. Se usa para calcular el delta de un intercambio sin tener que
 * recorrer todas las entidades del programa.
 */
function localCost(
  assignments: readonly ResolvedAssignment[],
  dateIndex: ReadonlyMap<IsoDate, number>,
  target: LoadTarget,
  kind: AssignmentKind,
  entityId: string
): number {
  let monthCount = 0;
  const typeCount = new Map<string, number>();
  const assignedDateIndices = new Set<number>();

  for (const a of assignments) {
    if (a.kind !== kind) continue;
    if (occupantOf(a) !== entityId) continue;
    monthCount++;
    typeCount.set(a.typeKey, (typeCount.get(a.typeKey) ?? 0) + 1);
    const idx = dateIndex.get(a.date);
    if (idx !== undefined) assignedDateIndices.add(idx);
  }

  let cost = W_LOAD * (monthCount - target.base) ** 2;
  for (const count of typeCount.values()) {
    const over = Math.max(0, count - 1);
    cost += W_TYPE * over ** 2;
  }

  let adjacentPairs = 0;
  for (const idx of assignedDateIndices) {
    if (assignedDateIndices.has(idx + 1)) adjacentPairs++;
  }
  cost += W_ADJ * adjacentPairs;

  return cost;
}

/**
 * Coste global de la solución completa. Expuesto sobre todo para pruebas: la
 * invariante "el pase de mejora nunca deja la solución peor" se verifica
 * comparando este valor antes y después.
 */
export function computeObjective(
  assignments: readonly ResolvedAssignment[],
  dates: readonly IsoDate[],
  personTarget: LoadTarget,
  teamTarget: LoadTarget
): number {
  const dateIndex = buildDateIndex(dates);
  const personIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const a of assignments) {
    if (a.kind === 'PERSON' && a.personId !== null) personIds.add(a.personId);
    if (a.kind === 'GROUP' && a.teamId !== null) teamIds.add(a.teamId);
  }

  let total = 0;
  for (const id of Array.from(personIds).sort()) {
    total += localCost(assignments, dateIndex, personTarget, 'PERSON', id);
  }
  for (const id of Array.from(teamIds).sort()) {
    total += localCost(assignments, dateIndex, teamTarget, 'GROUP', id);
  }
  return total;
}

/**
 * `entityId` pasaría a ocupar la fecha `targetDate` (kind `kind`). Determina
 * si eso choca con OTRA casilla ya ocupada por la misma entidad esa fecha
 * (excluyendo las dos casillas que forman el intercambio en curso).
 */
function wouldCollide(
  assignments: readonly ResolvedAssignment[],
  excludeI: number,
  excludeJ: number,
  kind: AssignmentKind,
  entityId: string,
  targetDate: IsoDate,
  allowMultiple: boolean
): boolean {
  if (allowMultiple) return false;
  for (let k = 0; k < assignments.length; k++) {
    if (k === excludeI || k === excludeJ) continue;
    const a = assignments[k];
    if (a === undefined) continue;
    if (a.kind !== kind) continue;
    if (a.date !== targetDate) continue;
    if (occupantOf(a) === entityId) return true;
  }
  return false;
}

export function repair(input: RepairInput): RepairOutput {
  const assignments = input.assignments.map((a) => ({ ...a }));
  const dateIndex = buildDateIndex(input.dates);
  const changed = new Set<number>();
  let iterations = 0;

  while (iterations < input.maxIterations) {
    const eligible: number[] = [];
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (a === undefined) continue;
      if (a.locked) continue;
      if (occupantOf(a) === null) continue;
      eligible.push(i);
    }

    let bestI = -1;
    let bestJ = -1;
    let bestDelta = 0;

    for (let ei = 0; ei < eligible.length; ei++) {
      const i = eligible[ei];
      if (i === undefined) continue;
      const ai = assignments[i];
      if (ai === undefined) continue;

      for (let ej = ei + 1; ej < eligible.length; ej++) {
        const j = eligible[ej];
        if (j === undefined) continue;
        const aj = assignments[j];
        if (aj === undefined) continue;
        if (ai.kind !== aj.kind) continue;

        const idI = occupantOf(ai);
        const idJ = occupantOf(aj);
        if (idI === null || idJ === null) continue;
        if (idI === idJ) continue;

        const canOccupy = input.canOccupy;
        if (canOccupy !== undefined && (!canOccupy(idI, aj) || !canOccupy(idJ, ai))) continue;

        const allowMultiple =
          ai.kind === 'PERSON' ? input.allowMultiplePerDay : input.allowTeamTwiceSameDate;
        if (wouldCollide(assignments, i, j, ai.kind, idI, aj.date, allowMultiple)) continue;
        if (wouldCollide(assignments, i, j, ai.kind, idJ, ai.date, allowMultiple)) continue;

        const target = ai.kind === 'PERSON' ? input.personTarget : input.teamTarget;
        const before =
          localCost(assignments, dateIndex, target, ai.kind, idI) +
          localCost(assignments, dateIndex, target, ai.kind, idJ);

        const simulated = assignments.slice();
        simulated[i] = withOccupant(ai, idJ);
        simulated[j] = withOccupant(aj, idI);
        const after =
          localCost(simulated, dateIndex, target, ai.kind, idI) +
          localCost(simulated, dateIndex, target, ai.kind, idJ);

        const delta = after - before;
        if (delta < bestDelta) {
          bestDelta = delta;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI === -1 || bestJ === -1) break;

    const ai = assignments[bestI];
    const aj = assignments[bestJ];
    if (ai === undefined || aj === undefined) break;
    const idI = occupantOf(ai);
    const idJ = occupantOf(aj);
    if (idI === null || idJ === null) break;

    assignments[bestI] = withOccupant(ai, idJ);
    assignments[bestJ] = withOccupant(aj, idI);
    changed.add(bestI);
    changed.add(bestJ);
    iterations++;
  }

  return { assignments, changedIndices: changed, iterations };
}
