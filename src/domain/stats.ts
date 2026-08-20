import type { EntityStat, LoadTarget, Person, ResolvedAssignment, Stats, Team } from './types';

// Conteos y equilibrio a partir de una solución final. No decide nada: solo
// resume. Ver docs/algoritmo.md, paso 9, y arquitectura.md §5.

export interface StatsInput {
  /** Personas en orden canónico (por id), activas e inactivas. */
  readonly people: readonly Person[];
  /** Equipos en orden canónico (order, id), activos e inactivos. */
  readonly teams: readonly Team[];
  readonly personSlots: number;
  readonly teamSlots: number;
  readonly personTarget: LoadTarget;
  readonly teamTarget: LoadTarget;
  /** Asignaciones finales (después del pase de mejora, si corrió). */
  readonly assignments: readonly ResolvedAssignment[];
  /** typeKey de todos los tipos, ordenados, para que byType tenga la misma forma en todas las entidades. */
  readonly typeKeys: readonly string[];
  /** histCount[p] precalculado por generateProgram (paso 4), por id de persona. */
  readonly personHistoryCount: ReadonlyMap<string, number>;
  /** histCount[t] precalculado por generateProgram (paso 4), por id de equipo. */
  readonly teamHistoryCount: ReadonlyMap<string, number>;
}

/**
 * Meta de carga: cuántas veces «toca» a cada entidad activa.
 *
 * Vive aquí, y no dentro de `generateProgram`, porque la página de
 * estadísticas necesita exactamente la misma fórmula para decir si alguien va
 * corto o pasado. Duplicarla dejaría que la pantalla y el algoritmo
 * discrepasen sin que nadie se enterase.
 *
 * Ver docs/algoritmo.md, paso 5.
 */
export function computeLoadTarget(slotCount: number, activeCount: number): LoadTarget {
  if (activeCount === 0) return { base: 0, remainder: 0, cap: 0 };
  const base = Math.floor(slotCount / activeCount);
  const remainder = slotCount % activeCount;
  const cap = base + (remainder > 0 ? 1 : 0);
  return { base, remainder, cap };
}

function emptyByType(typeKeys: readonly string[]): Record<string, number> {
  const rec: Record<string, number> = {};
  for (const key of typeKeys) rec[key] = 0;
  return rec;
}

function buildEntityStats(
  entities: readonly { readonly id: string }[],
  kind: 'PERSON' | 'GROUP',
  assignments: readonly ResolvedAssignment[],
  typeKeys: readonly string[],
  historyCount: ReadonlyMap<string, number>
): EntityStat[] {
  const monthCount = new Map<string, number>();
  const byType = new Map<string, Record<string, number>>();
  for (const entity of entities) {
    monthCount.set(entity.id, 0);
    byType.set(entity.id, emptyByType(typeKeys));
  }

  for (const a of assignments) {
    if (a.kind !== kind) continue;
    const occupant = kind === 'PERSON' ? a.personId : a.teamId;
    if (occupant === null) continue;
    const current = monthCount.get(occupant);
    if (current === undefined) continue; // referencia a una entidad fuera de la lista canónica; se ignora
    monthCount.set(occupant, current + 1);
    const bt = byType.get(occupant);
    // Solo se desglosan las responsabilidades de `typeKeys`. Una clave que no
    // esté ahí (una asignación heredada de un tipo que ya no está en el
    // catálogo) SÍ suma al total, pero no crea una columna que el resto de
    // entidades no tendría: `byType` debe tener la misma forma en todas, o
    // quien la recorra para pintar una tabla obtendrá filas descuadradas.
    if (bt !== undefined && Object.hasOwn(bt, a.typeKey)) bt[a.typeKey] = (bt[a.typeKey] ?? 0) + 1;
  }

  return entities.map((entity) => ({
    id: entity.id,
    monthCount: monthCount.get(entity.id) ?? 0,
    byType: byType.get(entity.id) ?? emptyByType(typeKeys),
    historyCount: historyCount.get(entity.id) ?? 0,
  }));
}

export function computeStats(input: StatsInput): Stats {
  const people = buildEntityStats(
    input.people,
    'PERSON',
    input.assignments,
    input.typeKeys,
    input.personHistoryCount
  );
  const teams = buildEntityStats(
    input.teams,
    'GROUP',
    input.assignments,
    input.typeKeys,
    input.teamHistoryCount
  );

  const statById = new Map(people.map((s) => [s.id, s.monthCount] as const));
  const activeMonthCounts = input.people
    .filter((p) => p.active)
    .map((p) => statById.get(p.id) ?? 0);

  let min = 0;
  let max = 0;
  let spread = 0;
  if (activeMonthCounts.length > 0) {
    min = Math.min(...activeMonthCounts);
    max = Math.max(...activeMonthCounts);
    spread = max - min;
  }

  return {
    personSlots: input.personSlots,
    teamSlots: input.teamSlots,
    personTarget: input.personTarget,
    teamTarget: input.teamTarget,
    people,
    teams,
    balance: { min, max, spread },
  };
}
