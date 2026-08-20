import type { IsoDate } from './dates';
import { computeLoadTarget } from './stats';
import { teamDisplayText } from './teams';
import type {
  AssignmentType,
  Group,
  HistoricalAssignment,
  LoadTarget,
  Person,
  Team,
} from './types';

/**
 * Resumen de equilibrio para la pantalla de Estadísticas, sobre una ventana de
 * historial ya recortada por quien llama (src/services/estadisticasService.ts).
 *
 * Función PURA: no sabe de Firestore ni de React. Reutiliza `computeLoadTarget`
 * de `stats.ts` en vez de reimplementar la fórmula de la meta — si esta
 * pantalla calculara su propia meta, acabaría discrepando del algoritmo de
 * generación sin que nadie se enterase (docs/algoritmo.md, paso 5).
 */

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface HistoryStatsInput {
  /** Personas del catálogo, activas e inactivas. */
  readonly people: readonly Person[];
  /** Equipos del catálogo, activos e inactivos. */
  readonly teams: readonly Team[];
  /** Necesarios para componer la etiqueta de equipo con `teamDisplayText`. */
  readonly groups: readonly Group[];
  readonly assignmentTypes: readonly AssignmentType[];
  /** Asignaciones históricas ya recortadas a la ventana elegida. */
  readonly history: readonly HistoricalAssignment[];
  /** Ids de mes (\"YYYY-MM\") de los programas guardados que caen en la ventana, ascendente. */
  readonly monthsInWindow: readonly string[];
}

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

export type LoadStatus = 'below' | 'onTarget' | 'above';

export interface TypeColumn {
  readonly key: string;
  readonly label: string;
}

export interface EntityHistoryStat {
  readonly id: string;
  /** Nombre de la persona, o texto de equipo compuesto con `teamDisplayText`. */
  readonly label: string;
  readonly total: number;
  /** typeKey -> veces en la ventana. Solo cubre los tipos ACTIVOS de ese kind. */
  readonly byType: Readonly<Record<string, number>>;
  readonly lastAssignedDate: IsoDate | null;
  /** Comparación de `total` contra la meta de la ventana (ver `computeLoadTarget`). */
  readonly loadStatus: LoadStatus;
}

export interface OrphanReference {
  readonly id: string;
  readonly assignmentCount: number;
}

export interface HistoryStatsSummary {
  readonly monthsInWindow: readonly string[];
  /** Todas las asignaciones de tipo PERSON en la ventana, incluidas las huérfanas. */
  readonly personAssignmentsCount: number;
  /** Todas las asignaciones de tipo GROUP en la ventana, incluidas las huérfanas. */
  readonly teamAssignmentsCount: number;
  readonly personTarget: LoadTarget;
  readonly teamTarget: LoadTarget;
}

export type HistoryAlertSeverity = 'warning' | 'info';

export interface HistoryAlert {
  readonly severity: HistoryAlertSeverity;
  /** Ya redactado en español, listo para mostrar (igual que `Warning.message`). */
  readonly message: string;
}

export interface HistoryStatsOutput {
  readonly summary: HistoryStatsSummary;
  readonly personColumns: readonly TypeColumn[];
  readonly teamColumns: readonly TypeColumn[];
  /** Solo personas ACTIVAS: son las que importan de cara a la próxima generación. */
  readonly people: readonly EntityHistoryStat[];
  /** Solo equipos ACTIVOS. */
  readonly teams: readonly EntityHistoryStat[];
  /** Personas INACTIVAS que aun así aparecen en la ventana (informativo, no un error). */
  readonly inactivePeopleInHistory: readonly EntityHistoryStat[];
  readonly inactiveTeamsInHistory: readonly EntityHistoryStat[];
  /** Ids de persona en el historial que no están en `input.people`. */
  readonly orphanPeople: readonly OrphanReference[];
  readonly orphanTeams: readonly OrphanReference[];
  readonly alerts: readonly HistoryAlert[];
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

interface Accumulator {
  total: number;
  byType: Map<string, number>;
  lastAssignedDate: IsoDate | null;
}

function newAccumulator(): Accumulator {
  return { total: 0, byType: new Map(), lastAssignedDate: null };
}

function typeColumns(types: readonly AssignmentType[], kind: 'PERSON' | 'GROUP'): TypeColumn[] {
  return types
    .filter((t) => t.kind === kind && t.active)
    .slice()
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map((t) => ({ key: t.key, label: t.label }));
}

function loadStatusOf(total: number, target: LoadTarget): LoadStatus {
  // cap === 0 && base === 0 solo ocurre con cero entidades activas: no hay
  // meta contra la que comparar, así que no se marca ni por encima ni por
  // debajo.
  if (target.base === 0 && target.cap === 0) return 'onTarget';
  if (total < target.base) return 'below';
  if (total > target.cap) return 'above';
  return 'onTarget';
}

function buildEntityStats(
  entities: readonly { readonly id: string; readonly active: boolean }[],
  labelOf: (id: string) => string,
  accumulators: ReadonlyMap<string, Accumulator>,
  columns: readonly TypeColumn[],
  target: LoadTarget
): { active: EntityHistoryStat[]; inactiveWithHistory: EntityHistoryStat[] } {
  const active: EntityHistoryStat[] = [];
  const inactiveWithHistory: EntityHistoryStat[] = [];

  for (const entity of entities) {
    const acc = accumulators.get(entity.id);
    const total = acc?.total ?? 0;
    const byType: Record<string, number> = {};
    for (const column of columns) byType[column.key] = acc?.byType.get(column.key) ?? 0;

    const stat: EntityHistoryStat = {
      id: entity.id,
      label: labelOf(entity.id),
      total,
      byType,
      lastAssignedDate: acc?.lastAssignedDate ?? null,
      loadStatus: loadStatusOf(total, target),
    };

    if (entity.active) {
      active.push(stat);
    } else if (total > 0) {
      inactiveWithHistory.push(stat);
    }
  }

  return { active, inactiveWithHistory };
}

function formatList(names: readonly string[], limit = 6): string {
  if (names.length === 0) return '';
  const visible = names.length <= limit ? names : names.slice(0, limit);
  const joined =
    visible.length === 1
      ? (visible[0] ?? '')
      : `${visible.slice(0, -1).join(', ')} y ${visible[visible.length - 1] ?? ''}`;
  if (names.length <= limit) return joined;
  return `${joined} y ${names.length - limit} más`;
}

/**
 * Alerta de reparto desigual: diferencia mayor que 1 entre quien más y quien
 * menos ha servido, entre las entidades activas. CLAUDE.md pide equilibrio
 * tanto para personas como para los grupos de Aseo/Hospitalidad, así que se
 * aplica al mismo criterio a `people` y a `teams`.
 */
function spreadAlert(entities: readonly EntityHistoryStat[], pluralNoun: string): HistoryAlert | null {
  if (entities.length < 2) return null;
  const totals = entities.map((e) => e.total);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  if (max - min <= 1) return null;

  const withMax = entities.filter((e) => e.total === max).map((e) => e.label);
  const withMin = entities.filter((e) => e.total === min).map((e) => e.label);
  const verbMax = withMax.length === 1 ? 'tiene' : 'tienen';
  const verbMin = withMin.length === 1 ? 'tiene' : 'tienen';

  return {
    severity: 'warning',
    message:
      `La carga entre ${pluralNoun} activos no está pareja: ${formatList(withMax)} ${verbMax} ` +
      `${max} asignaciones en esta ventana, mientras que ${formatList(withMin)} ${verbMin} ${min}; ` +
      `la diferencia es ${max - min}, mayor que 1.`,
  };
}

interface BuildAlertsInput {
  readonly activePeopleCount: number;
  readonly activeTeamsCount: number;
  readonly people: readonly EntityHistoryStat[];
  readonly teams: readonly EntityHistoryStat[];
  readonly personColumns: readonly TypeColumn[];
  readonly teamColumns: readonly TypeColumn[];
  readonly inactivePeopleInHistory: readonly EntityHistoryStat[];
  readonly inactiveTeamsInHistory: readonly EntityHistoryStat[];
  readonly orphanPeople: readonly OrphanReference[];
  readonly orphanTeams: readonly OrphanReference[];
}

function buildAlerts(input: BuildAlertsInput): HistoryAlert[] {
  const alerts: HistoryAlert[] = [];

  if (input.activePeopleCount === 0) {
    alerts.push({
      severity: 'info',
      message: 'No hay personas activas en el catálogo: no se puede calcular una meta de carga de personas.',
    });
  }
  if (input.activeTeamsCount === 0) {
    alerts.push({
      severity: 'info',
      message: 'No hay equipos activos en el catálogo: no se puede calcular una meta de carga de equipos.',
    });
  }

  const peopleAtZero = input.people.filter((p) => p.total === 0).map((p) => p.label);
  if (peopleAtZero.length > 0) {
    const subject = peopleAtZero.length === 1 ? 'Una persona activa no tiene' : `${peopleAtZero.length} personas activas no tienen`;
    alerts.push({
      severity: 'warning',
      message: `${subject} ninguna asignación en esta ventana: ${formatList(peopleAtZero)}.`,
    });
  }

  const teamsAtZero = input.teams.filter((t) => t.total === 0).map((t) => t.label);
  if (teamsAtZero.length > 0) {
    const subject = teamsAtZero.length === 1 ? 'Un equipo activo no tiene' : `${teamsAtZero.length} equipos activos no tienen`;
    alerts.push({
      severity: 'warning',
      message: `${subject} ninguna asignación en esta ventana: ${formatList(teamsAtZero)}.`,
    });
  }

  const peopleSpread = spreadAlert(input.people, 'personas');
  if (peopleSpread !== null) alerts.push(peopleSpread);
  const teamsSpread = spreadAlert(input.teams, 'equipos');
  if (teamsSpread !== null) alerts.push(teamsSpread);

  // Rotación de TIPO (CLAUDE.md: "rotar tipos de responsabilidad, no solo la
  // cantidad total"). Se omite para quien ya está en la alerta de 0 arriba,
  // para no repetir la misma señal dos veces.
  for (const person of input.people) {
    if (person.total === 0) continue;
    const missing = input.personColumns.filter((c) => (person.byType[c.key] ?? 0) === 0).map((c) => c.label);
    if (missing.length > 0) {
      alerts.push({
        severity: 'warning',
        message: `${person.label} nunca ha hecho, en esta ventana: ${formatList(missing)}.`,
      });
    }
  }
  for (const team of input.teams) {
    if (team.total === 0) continue;
    const missing = input.teamColumns.filter((c) => (team.byType[c.key] ?? 0) === 0).map((c) => c.label);
    if (missing.length > 0) {
      alerts.push({
        severity: 'warning',
        message: `${team.label} nunca ha hecho, en esta ventana: ${formatList(missing)}.`,
      });
    }
  }

  if (input.inactivePeopleInHistory.length > 0) {
    const names = input.inactivePeopleInHistory.map((p) => p.label);
    const subject = names.length === 1 ? 'Una persona inactiva aparece' : `${names.length} personas inactivas aparecen`;
    alerts.push({
      severity: 'info',
      message: `${subject} en el historial de esta ventana (normal si se desactivó después de servir): ${formatList(names)}.`,
    });
  }
  if (input.inactiveTeamsInHistory.length > 0) {
    const names = input.inactiveTeamsInHistory.map((t) => t.label);
    const subject = names.length === 1 ? 'Un equipo inactivo aparece' : `${names.length} equipos inactivos aparecen`;
    alerts.push({
      severity: 'info',
      message: `${subject} en el historial de esta ventana (normal si se desactivó después de servir): ${formatList(names)}.`,
    });
  }

  if (input.orphanPeople.length > 0) {
    const count = input.orphanPeople.length;
    const total = input.orphanPeople.reduce((n, r) => n + r.assignmentCount, 0);
    const subject = count === 1 ? 'un id de persona que ya no existe' : `${count} ids de persona que ya no existen`;
    alerts.push({
      severity: 'info',
      message: `El historial de esta ventana menciona ${subject} en el catálogo (${total} ${total === 1 ? 'asignación' : 'asignaciones'} en total).`,
    });
  }
  if (input.orphanTeams.length > 0) {
    const count = input.orphanTeams.length;
    const total = input.orphanTeams.reduce((n, r) => n + r.assignmentCount, 0);
    const subject = count === 1 ? 'un id de equipo que ya no existe' : `${count} ids de equipo que ya no existen`;
    alerts.push({
      severity: 'info',
      message: `El historial de esta ventana menciona ${subject} en el catálogo (${total} ${total === 1 ? 'asignación' : 'asignaciones'} en total).`,
    });
  }

  if (alerts.length === 0 && (input.activePeopleCount > 0 || input.activeTeamsCount > 0)) {
    alerts.push({
      severity: 'info',
      message:
        'La distribución está equilibrada: nadie activo se ha quedado sin asignaciones, la diferencia ' +
        'entre quien más y quien menos ha servido no supera 1, y todas las responsabilidades activas ' +
        'están cubiertas por todos al menos una vez.',
    });
  }

  return alerts;
}

export function computeHistoryStats(input: HistoryStatsInput): HistoryStatsOutput {
  // Canonicalizado: la salida no debe depender del orden en que Firestore
  // devolvió people/teams (mismo principio que arquitectura.md §7).
  const people = [...input.people].sort((a, b) => a.id.localeCompare(b.id));
  const teams = [...input.teams].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const personIds = new Set(people.map((p) => p.id));
  const teamIds = new Set(teams.map((t) => t.id));

  const personNames = new Map(people.map((p) => [p.id, p.name] as const));
  const teamLabels = new Map(
    teams.map((t) => [t.id, teamDisplayText(t, input.groups) || `Equipo ${t.id}`] as const)
  );

  const personColumns = typeColumns(input.assignmentTypes, 'PERSON');
  const teamColumns = typeColumns(input.assignmentTypes, 'GROUP');

  const personAccumulators = new Map<string, Accumulator>();
  const teamAccumulators = new Map<string, Accumulator>();
  const orphanPersonCounts = new Map<string, number>();
  const orphanTeamCounts = new Map<string, number>();

  let personAssignmentsCount = 0;
  let teamAssignmentsCount = 0;

  for (const h of input.history) {
    if (h.kind === 'PERSON') {
      personAssignmentsCount++;
      if (h.personId === null) continue; // defensivo: el mapper nunca produce esto
      if (!personIds.has(h.personId)) {
        orphanPersonCounts.set(h.personId, (orphanPersonCounts.get(h.personId) ?? 0) + 1);
        continue;
      }
      const acc = personAccumulators.get(h.personId) ?? newAccumulator();
      acc.total++;
      acc.byType.set(h.typeKey, (acc.byType.get(h.typeKey) ?? 0) + 1);
      if (acc.lastAssignedDate === null || h.date > acc.lastAssignedDate) acc.lastAssignedDate = h.date;
      personAccumulators.set(h.personId, acc);
    } else {
      teamAssignmentsCount++;
      if (h.teamId === null) continue;
      if (!teamIds.has(h.teamId)) {
        orphanTeamCounts.set(h.teamId, (orphanTeamCounts.get(h.teamId) ?? 0) + 1);
        continue;
      }
      const acc = teamAccumulators.get(h.teamId) ?? newAccumulator();
      acc.total++;
      acc.byType.set(h.typeKey, (acc.byType.get(h.typeKey) ?? 0) + 1);
      if (acc.lastAssignedDate === null || h.date > acc.lastAssignedDate) acc.lastAssignedDate = h.date;
      teamAccumulators.set(h.teamId, acc);
    }
  }

  const activePeopleCount = people.filter((p) => p.active).length;
  const activeTeamsCount = teams.filter((t) => t.active).length;
  const personTarget = computeLoadTarget(personAssignmentsCount, activePeopleCount);
  const teamTarget = computeLoadTarget(teamAssignmentsCount, activeTeamsCount);

  const { active: peopleStats, inactiveWithHistory: inactivePeopleInHistory } = buildEntityStats(
    people,
    (id) => personNames.get(id) ?? id,
    personAccumulators,
    personColumns,
    personTarget
  );
  const { active: teamStats, inactiveWithHistory: inactiveTeamsInHistory } = buildEntityStats(
    teams,
    (id) => teamLabels.get(id) ?? id,
    teamAccumulators,
    teamColumns,
    teamTarget
  );

  const orphanPeople: OrphanReference[] = [...orphanPersonCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, assignmentCount]) => ({ id, assignmentCount }));
  const orphanTeams: OrphanReference[] = [...orphanTeamCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, assignmentCount]) => ({ id, assignmentCount }));

  const alerts = buildAlerts({
    activePeopleCount,
    activeTeamsCount,
    people: peopleStats,
    teams: teamStats,
    personColumns,
    teamColumns,
    inactivePeopleInHistory,
    inactiveTeamsInHistory,
    orphanPeople,
    orphanTeams,
  });

  return {
    summary: {
      monthsInWindow: input.monthsInWindow,
      personAssignmentsCount,
      teamAssignmentsCount,
      personTarget,
      teamTarget,
    },
    personColumns,
    teamColumns,
    people: peopleStats,
    teams: teamStats,
    inactivePeopleInHistory,
    inactiveTeamsInHistory,
    orphanPeople,
    orphanTeams,
    alerts,
  };
}
