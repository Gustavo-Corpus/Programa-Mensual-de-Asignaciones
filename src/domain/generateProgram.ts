import type {
  AssignmentType,
  CandidateTrace,
  GenerateInput,
  GenerateOutput,
  GenerationTrace,
  HistoricalAssignment,
  LockedAssignment,
  ProgramDateOut,
  RejectionReason,
  RejectionTrace,
  ResolvedAssignment,
  Slot,
  SlotTrace,
  Warning,
} from './types';
import type { IsoDate, PlainDate } from './dates';
import { addMonths, dayOfWeek, DAY_NAMES_ES, fromIso, MONTH_NAMES_ES, toIso } from './dates';
import { buildSlots } from './slots';
import { allowsDay, allowsType, canOccupy, captainPool, captainRuleApplies } from './eligibility';
import {
  PERSON_COST_LABELS,
  PERSON_COST_TOLERANCE,
  compareCandidates,
  orderByVariety,
  personCost,
  rejectPerson,
} from './scoring';
import { TEAM_COST_LABELS, TEAM_COST_TOLERANCE, rejectTeam, teamCost } from './teamScoring';
import { repair } from './repair';
import { computeLoadTarget, computeStats } from './stats';

// El orquestador. Ver docs/algoritmo.md completo; cada paso numerado abajo
// corresponde a la sección del mismo número en ese documento.

const MAX_RUNNERS_UP = 3;
const MAX_REJECTIONS_TRACED = 5;

// ---------------------------------------------------------------------------
// Paso 0 · Canonicalizar
// ---------------------------------------------------------------------------

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalizeInput(input: GenerateInput): GenerateInput {
  const people = input.people.slice().sort((a, b) => compareStrings(a.id, b.id));

  const teams = input.teams
    .slice()
    .sort((a, b) => a.order - b.order || compareStrings(a.id, b.id));

  const assignmentTypes = input.assignmentTypes
    .slice()
    .sort((a, b) => a.order - b.order || compareStrings(a.key, b.key));

  const previousAssignments = input.previousAssignments.slice().sort((a, b) => {
    if (a.date !== b.date) return compareStrings(a.date, b.date);
    if (a.typeKey !== b.typeKey) return compareStrings(a.typeKey, b.typeKey);
    const aId = a.personId ?? a.teamId ?? '';
    const bId = b.personId ?? b.teamId ?? '';
    return compareStrings(aId, bId);
  });

  const lockedAssignments = input.lockedAssignments.slice().sort((a, b) => {
    if (a.date !== b.date) return compareStrings(a.date, b.date);
    if (a.typeKey !== b.typeKey) return compareStrings(a.typeKey, b.typeKey);
    return a.slotIndex - b.slotIndex;
  });

  return { ...input, people, teams, assignmentTypes, previousAssignments, lockedAssignments };
}

// ---------------------------------------------------------------------------
// Paso 4 · Contadores
// ---------------------------------------------------------------------------

interface EngineState {
  histCount: number;
  readonly histTypeCount: Map<string, number>;
  histLastDate: IsoDate | null;
  readonly histLastTypeDate: Map<string, IsoDate>;
  monthCount: number;
  readonly monthTypeCount: Map<string, number>;
  readonly assignedDates: Set<IsoDate>;
  /** Máximo entre historial y mes en curso; solo se usa para personas (componente 4). */
  lastAssignedDate: IsoDate | null;
  /** Por tipo, combinado entre historial y mes en curso. */
  readonly lastTypeDate: Map<string, IsoDate>;
}

function newEngineState(): EngineState {
  return {
    histCount: 0,
    histTypeCount: new Map(),
    histLastDate: null,
    histLastTypeDate: new Map(),
    monthCount: 0,
    monthTypeCount: new Map(),
    assignedDates: new Set(),
    lastAssignedDate: null,
    lastTypeDate: new Map(),
  };
}

function selectHistoryWindow(
  all: readonly HistoricalAssignment[],
  year: number,
  month: number,
  historyWindowMonths: number
): readonly HistoricalAssignment[] {
  if (historyWindowMonths === 0) return all;
  const end = toIso({ y: year, m: month, d: 1 });
  const startYm = addMonths(year, month, -historyWindowMonths);
  const start = toIso({ y: startYm.year, m: startYm.month, d: 1 });
  return all.filter((h) => h.date >= start && h.date < end);
}

function buildStates(
  entityIds: readonly string[],
  history: readonly HistoricalAssignment[],
  kind: 'PERSON' | 'GROUP'
): Map<string, EngineState> {
  const states = new Map<string, EngineState>();
  for (const id of entityIds) states.set(id, newEngineState());

  for (const h of history) {
    if (h.kind !== kind) continue;
    const entityId = kind === 'PERSON' ? h.personId : h.teamId;
    if (entityId === null) continue;
    const state = states.get(entityId);
    if (state === undefined) continue; // referencia a una entidad fuera del catálogo actual

    state.histCount++;
    state.histTypeCount.set(h.typeKey, (state.histTypeCount.get(h.typeKey) ?? 0) + 1);
    if (state.histLastDate === null || h.date > state.histLastDate) state.histLastDate = h.date;
    const prevTypeDate = state.histLastTypeDate.get(h.typeKey);
    if (prevTypeDate === undefined || h.date > prevTypeDate) {
      state.histLastTypeDate.set(h.typeKey, h.date);
    }
  }

  for (const state of states.values()) {
    state.lastAssignedDate = state.histLastDate;
    for (const [typeKey, date] of state.histLastTypeDate) state.lastTypeDate.set(typeKey, date);
  }

  return states;
}

// Paso 5 · Meta de carga: `computeLoadTarget` vive en ./stats porque la
// página de estadísticas necesita la misma fórmula.

// ---------------------------------------------------------------------------
// Formato de fechas y mensajes de aviso
// ---------------------------------------------------------------------------

function formatDateEs(date: PlainDate): string {
  const dayName = DAY_NAMES_ES[dayOfWeek(date)] ?? '';
  const monthName = MONTH_NAMES_ES[date.m - 1] ?? '';
  return `${dayName} ${date.d} de ${monthName}`;
}

type UnfilledClassification =
  | 'ALL_ALREADY_ASSIGNED'
  | 'ALL_AT_CAP'
  | 'ALL_RESTRICTED'
  | 'MIXED'
  | 'ALL_INACTIVE';

/** Motivos que describen a la persona, no al estado del reparto. */
const RESTRICTION_REASONS: readonly RejectionReason[] = [
  'DAY_BLOCKED',
  'TYPE_NOT_ALLOWED',
  'NOT_IN_CAPTAIN_POOL',
];

function classifyUnfilled(rejected: readonly { readonly reason: RejectionReason }[]): UnfilledClassification {
  const activeOnes = rejected.filter((r) => r.reason !== 'INACTIVE');
  if (activeOnes.length === 0) return 'ALL_INACTIVE';
  if (activeOnes.every((r) => r.reason === 'ALREADY_ASSIGNED_THIS_DATE')) return 'ALL_ALREADY_ASSIGNED';
  if (activeOnes.every((r) => r.reason === 'AT_CAP')) return 'ALL_AT_CAP';
  if (activeOnes.every((r) => RESTRICTION_REASONS.includes(r.reason))) return 'ALL_RESTRICTED';
  return 'MIXED';
}

function unfilledDetail(classification: UnfilledClassification, subjectPlural: string): string {
  switch (classification) {
    case 'ALL_ALREADY_ASSIGNED':
      return `${subjectPlural} ya tienen asignación ese día.`;
    case 'ALL_AT_CAP':
      return `${subjectPlural} alcanzaron el tope de asignaciones, incluso tras ampliarlo localmente.`;
    case 'ALL_INACTIVE':
      return `no queda ninguno activo disponible.`;
    case 'ALL_RESTRICTED':
      return `nadie tiene esta responsabilidad habilitada para ese día de la semana.`;
    case 'MIXED':
      return (
        `${subjectPlural} restantes ya tienen asignación ese día, están en el tope de ` +
        `asignaciones o tienen esta responsabilidad restringida.`
      );
  }
}

function warnNoActivePeople(): Warning {
  return {
    code: 'NO_ACTIVE_PEOPLE',
    message: 'No hay personas activas: ninguna casilla de responsabilidad individual pudo asignarse este mes.',
  };
}

function warnNoActiveTeams(): Warning {
  return {
    code: 'NO_ACTIVE_TEAMS',
    message: 'No hay equipos activos: ninguna casilla de tipo equipo pudo asignarse este mes.',
  };
}

function warnCapRelaxed(date: IsoDate, type: AssignmentType, cap: number, relaxedTo: number): Warning {
  return {
    code: 'CAP_RELAXED',
    date,
    typeKey: type.key,
    message:
      `Se amplió el tope de asignaciones para «${type.label}» el ${formatDateEs(fromIso(date))}: ` +
      `de ${cap} a ${relaxedTo}, porque no quedaba nadie disponible dentro del tope normal.`,
  };
}

function warnSlotUnfilled(
  date: IsoDate,
  type: AssignmentType,
  classification: UnfilledClassification,
  subjectPlural: string
): Warning {
  return {
    code: 'SLOT_UNFILLED',
    date,
    typeKey: type.key,
    message:
      `No hay nadie disponible para «${type.label}» el ${formatDateEs(fromIso(date))}: ` +
      unfilledDetail(classification, subjectPlural),
  };
}

/**
 * La reserva de capitanes no dio para cubrir la casilla. No es un fallo del
 * algoritmo sino un hecho del mes: el aviso nombra el día y la responsabilidad
 * para que el administrador decida — mover el turno de aseo, levantar una
 * restricción o dejarlo así.
 */
function warnCaptainRuleUnmet(date: IsoDate, type: AssignmentType, sourceLabel: string): Warning {
  return {
    code: 'CAPTAIN_RULE_UNMET',
    date,
    typeKey: type.key,
    message:
      `Ningún capitán ni auxiliar del equipo de «${sourceLabel}» del ${formatDateEs(fromIso(date))} ` +
      `podía cubrir «${type.label}», así que se asignó a otra persona.`,
  };
}

function warnLockedInactivePerson(date: IsoDate, type: AssignmentType, personId: string, personName: string): Warning {
  return {
    code: 'LOCKED_INACTIVE_PERSON',
    date,
    typeKey: type.key,
    personId,
    message:
      `«${personName}» está inactivo pero permanece asignado a «${type.label}» el ` +
      `${formatDateEs(fromIso(date))} porque la asignación fue bloqueada manualmente.`,
  };
}

function warnLockedInactiveTeam(date: IsoDate, type: AssignmentType, teamId: string, teamLabel: string): Warning {
  return {
    code: 'LOCKED_INACTIVE_TEAM',
    date,
    typeKey: type.key,
    teamId,
    message:
      `«${teamLabel}» está inactivo pero permanece asignado a «${type.label}» el ` +
      `${formatDateEs(fromIso(date))} porque la asignación fue bloqueada manualmente.`,
  };
}

function warnLockedDuplicatePerson(date: IsoDate, type: AssignmentType, personId: string, personName: string): Warning {
  return {
    code: 'LOCKED_DUPLICATE_SAME_DAY',
    date,
    typeKey: type.key,
    personId,
    message:
      `«${personName}» tiene más de una asignación bloqueada el ${formatDateEs(fromIso(date))} ` +
      `(incluye «${type.label}»): se respetan ambas por tratarse de bloqueos manuales.`,
  };
}

function warnLockedDuplicateTeam(date: IsoDate, type: AssignmentType, teamId: string, teamLabel: string): Warning {
  return {
    code: 'LOCKED_DUPLICATE_SAME_DAY',
    date,
    typeKey: type.key,
    teamId,
    message:
      `«${teamLabel}» tiene más de una asignación bloqueada el ${formatDateEs(fromIso(date))} ` +
      `(incluye «${type.label}»): se respetan ambas por tratarse de bloqueos manuales.`,
  };
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

export function generateProgram(rawInput: GenerateInput): GenerateOutput {
  const input = canonicalizeInput(rawInput);

  const { dates: monthDates, slots } = buildSlots(input.year, input.month, input.assignmentTypes);

  const typesByKey = new Map(input.assignmentTypes.map((t) => [t.key, t] as const));
  const typeKeysSorted = input.assignmentTypes.map((t) => t.key).slice().sort(compareStrings);

  // Paso 1: si no hay fechas (p.ej. cero tipos activos), el programa está
  // legítimamente vacío. No es un error.
  if (monthDates.length === 0) {
    const personTarget = computeLoadTarget(0, input.people.filter((p) => p.active).length);
    const teamTarget = computeLoadTarget(0, input.teams.filter((t) => t.active).length);
    const stats = computeStats({
      people: input.people,
      teams: input.teams,
      personSlots: 0,
      teamSlots: 0,
      personTarget,
      teamTarget,
      assignments: [],
      typeKeys: typeKeysSorted,
      personHistoryCount: new Map(),
      teamHistoryCount: new Map(),
    });
    const trace: GenerationTrace = {
      seed: input.seed,
      costLabelsPerson: PERSON_COST_LABELS,
      costLabelsTeam: TEAM_COST_LABELS,
      slots: [],
    };
    return { dates: [], assignments: [], warnings: [], stats, trace };
  }

  const personSlotCount = slots.filter((s) => s.kind === 'PERSON').length;
  const teamSlotCount = slots.filter((s) => s.kind === 'GROUP').length;

  const activePeople = input.people.filter((p) => p.active);
  const activeTeams = input.teams.filter((t) => t.active);

  const personTarget = computeLoadTarget(personSlotCount, activePeople.length);
  const teamTarget = computeLoadTarget(teamSlotCount, activeTeams.length);

  // Paso 4: historial dentro de la ventana + contadores iniciales.
  const history = selectHistoryWindow(input.previousAssignments, input.year, input.month, input.settings.historyWindowMonths);
  const personStates = buildStates(
    input.people.map((p) => p.id),
    history,
    'PERSON'
  );
  const teamStates = buildStates(
    input.teams.map((t) => t.id),
    history,
    'GROUP'
  );

  const peopleById = new Map(input.people.map((p) => [p.id, p] as const));
  const teamsById = new Map(input.teams.map((t) => [t.id, t] as const));

  const warnings: Warning[] = [];

  // Estructuras finales, indexadas por posición del slot en el orden canónico.
  const resolved: (ResolvedAssignment | undefined)[] = new Array(slots.length);
  const traceSlots: (SlotTrace | undefined)[] = new Array(slots.length);
  const lockedIndices = new Set<number>();

  // -------------------------------------------------------------------------
  // Paso 3 · Aplicar bloqueos
  // -------------------------------------------------------------------------

  const slotIndexByKey = new Map<string, number>();
  slots.forEach((s, idx) => slotIndexByKey.set(`${s.date}|${s.typeKey}|${s.slotIndex}`, idx));

  function applyLock(lock: LockedAssignment): void {
    const key = `${lock.date}|${lock.typeKey}|${lock.slotIndex}`;
    const idx = slotIndexByKey.get(key);
    if (idx === undefined) return; // el slot ya no existe: se ignora en silencio
    const slot = slots[idx];
    if (slot === undefined) return;
    const type = typesByKey.get(slot.typeKey);
    if (type === undefined) return;

    if (slot.kind === 'PERSON') {
      const personId = lock.personId;
      if (personId !== null) {
        const person = peopleById.get(personId);
        if (person === undefined || !person.active) {
          warnings.push(warnLockedInactivePerson(slot.date, type, personId, person?.name ?? personId));
        }
        const state = personStates.get(personId);
        if (state !== undefined) {
          if (state.assignedDates.has(slot.date)) {
            warnings.push(warnLockedDuplicatePerson(slot.date, type, personId, person?.name ?? personId));
          }
          state.monthCount++;
          state.monthTypeCount.set(slot.typeKey, (state.monthTypeCount.get(slot.typeKey) ?? 0) + 1);
          state.assignedDates.add(slot.date);
          state.lastAssignedDate = slot.date;
          state.lastTypeDate.set(slot.typeKey, slot.date);
        }
      }
      resolved[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        kind: 'PERSON',
        personId,
        teamId: null,
        locked: true,
        unfilledReason: null,
      };
    } else {
      const teamId = lock.teamId;
      if (teamId !== null) {
        const team = teamsById.get(teamId);
        if (team === undefined || !team.active) {
          warnings.push(warnLockedInactiveTeam(slot.date, type, teamId, team?.displayName ?? teamId));
        }
        const state = teamStates.get(teamId);
        if (state !== undefined) {
          if (state.assignedDates.has(slot.date)) {
            warnings.push(warnLockedDuplicateTeam(slot.date, type, teamId, team?.displayName ?? teamId));
          }
          state.monthCount++;
          state.monthTypeCount.set(slot.typeKey, (state.monthTypeCount.get(slot.typeKey) ?? 0) + 1);
          state.assignedDates.add(slot.date);
          state.lastTypeDate.set(slot.typeKey, slot.date);
        }
      }
      resolved[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        kind: 'GROUP',
        personId: null,
        teamId,
        locked: true,
        unfilledReason: null,
      };
    }

    traceSlots[idx] = {
      date: slot.date,
      typeKey: slot.typeKey,
      slotIndex: slot.slotIndex,
      outcome: 'LOCKED',
      chosenId: slot.kind === 'PERSON' ? lock.personId : lock.teamId,
      chosenCost: null,
      runnersUp: [],
      rejected: [],
      capRelaxedTo: null,
      changedByRepair: false,
    };
    lockedIndices.add(idx);
  }

  for (const lock of input.lockedAssignments) applyLock(lock);

  // -------------------------------------------------------------------------
  // Pasos 6 y 7 · Elegir persona / equipo, en orden canónico de slots.
  // -------------------------------------------------------------------------

  if (personSlotCount > 0 && activePeople.length === 0) warnings.push(warnNoActivePeople());
  if (teamSlotCount > 0 && activeTeams.length === 0) warnings.push(warnNoActiveTeams());

  // -------------------------------------------------------------------------
  // Regla de capitanes · reserva del día
  //
  // La reserva de una fecha son los capitanes y auxiliares de los grupos que
  // forman el equipo asignado ese día al tipo fuente (el aseo, por defecto).
  // Se calcula LEYENDO `resolved`, así que exige que las casillas de equipo
  // estén resueltas antes que las de persona: de ahí las dos pasadas de más
  // abajo.
  // -------------------------------------------------------------------------

  function slotKey(date: IsoDate, typeKey: string, slotIndex: number): string {
    return `${date}|${typeKey}|${slotIndex}`;
  }

  /** Casillas donde hubo que renunciar a la regla; el paso 8 tampoco la exige ahí. */
  const captainRuleRelaxed = new Set<string>();
  const poolCache = new Map<IsoDate, ReadonlySet<string>>();

  /**
   * Unión de las reservas de todos los equipos asignados ese día al tipo
   * fuente. La unión —y no el primer equipo— es lo correcto el día que el tipo
   * fuente tenga más de una casilla por fecha: si limpian dos equipos, los
   * capitanes de ambos están de servicio.
   */
  function poolForDate(date: IsoDate): ReadonlySet<string> {
    const cached = poolCache.get(date);
    if (cached !== undefined) return cached;

    const sourceTypeKey = input.settings.captainRule.sourceTypeKey;
    const pool = new Set<string>();
    for (const assignment of resolved) {
      if (assignment === undefined) continue;
      if (assignment.date !== date || assignment.typeKey !== sourceTypeKey) continue;
      for (const id of captainPool(input.people, input.groups, assignment.teamId)) pool.add(id);
    }
    poolCache.set(date, pool);
    return pool;
  }

  function sourceTypeLabel(): string {
    return typesByKey.get(input.settings.captainRule.sourceTypeKey)?.label ?? 'aseo';
  }

  function selectPerson(slot: Slot, idx: number): void {
    if (activePeople.length === 0) {
      resolved[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        kind: 'PERSON',
        personId: null,
        teamId: null,
        locked: false,
        unfilledReason: 'NO_ACTIVE_PEOPLE',
      };
      traceSlots[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        outcome: 'UNFILLED',
        chosenId: null,
        chosenCost: null,
        runnersUp: [],
        rejected: [],
        capRelaxedTo: null,
        changedByRepair: false,
      };
      return;
    }

    const type = typesByKey.get(slot.typeKey);
    if (type === undefined) throw new Error(`Tipo desconocido en slot: ${slot.typeKey}`);

    function evaluate(
      effectiveCap: number,
      pool: ReadonlySet<string> | null
    ): {
      eligible: { id: string; state: EngineState }[];
      rejected: RejectionTrace[];
    } {
      const eligible: { id: string; state: EngineState }[] = [];
      const rejected: RejectionTrace[] = [];
      for (const person of input.people) {
        const state = personStates.get(person.id);
        if (state === undefined) continue;
        const reason = rejectPerson({
          active: person.active,
          dayAllowed: allowsDay(person, slot.dayOfWeek),
          typeAllowed: allowsType(person, slot.typeKey),
          inCaptainPool: pool === null ? null : pool.has(person.id),
          assignedToday: state.assignedDates.has(slot.date),
          allowMultiplePerDay: input.settings.allowMultiplePerDay,
          monthCount: state.monthCount,
          effectiveCap,
        });
        if (reason === null) eligible.push({ id: person.id, state });
        else rejected.push({ id: person.id, reason });
      }
      return { eligible, rejected };
    }

    /**
     * Un intento completo con una reserva dada: tope normal y, si no cabe
     * nadie, la relajación local del tope (paso 6). La relajación sube el
     * cupo, nunca levanta una restricción: para eso está el segundo intento.
     */
    function attempt(pool: ReadonlySet<string> | null): {
      eligible: { id: string; state: EngineState }[];
      rejected: RejectionTrace[];
      capRelaxedTo: number | null;
    } {
      const first = evaluate(personTarget.cap, pool);
      if (first.eligible.length > 0) return { ...first, capRelaxedTo: null };

      const basicPassers = input.people.filter((p) => {
        const state = personStates.get(p.id);
        if (state === undefined) return false;
        if (!p.active) return false;
        if (!allowsDay(p, slot.dayOfWeek) || !allowsType(p, slot.typeKey)) return false;
        if (pool !== null && !pool.has(p.id)) return false;
        return input.settings.allowMultiplePerDay || !state.assignedDates.has(slot.date);
      });
      if (basicPassers.length === 0) return { ...first, capRelaxedTo: null };

      for (let k = 1; k <= personSlotCount; k++) {
        const candidateCap = personTarget.cap + k;
        const found = basicPassers.some((p) => {
          const state = personStates.get(p.id);
          return state !== undefined && state.monthCount < candidateCap;
        });
        if (found) return { ...evaluate(candidateCap, pool), capRelaxedTo: candidateCap };
      }
      return { ...first, capRelaxedTo: null };
    }

    const ruleApplies = captainRuleApplies(input.settings.captainRule, slot.typeKey);
    let pool: ReadonlySet<string> | null = ruleApplies ? poolForDate(slot.date) : null;
    let intento = attempt(pool);

    // La regla de capitanes manda por encima del tope mensual — el intento de
    // arriba ya probó a ampliarlo sin salirse de la reserva. Solo si ni así
    // hay nadie se renuncia a la regla, y queda dicho en un aviso.
    if (intento.eligible.length === 0 && pool !== null) {
      warnings.push(warnCaptainRuleUnmet(slot.date, type, sourceTypeLabel()));
      captainRuleRelaxed.add(slotKey(slot.date, slot.typeKey, slot.slotIndex));
      pool = null;
      intento = attempt(null);
    }

    const evalResult = { eligible: intento.eligible, rejected: intento.rejected };
    const capRelaxedTo = intento.capRelaxedTo;

    if (evalResult.eligible.length === 0) {
      const classification = classifyUnfilled(evalResult.rejected);
      warnings.push(warnSlotUnfilled(slot.date, type, classification, 'todas las personas activas'));
      resolved[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        kind: 'PERSON',
        personId: null,
        teamId: null,
        locked: false,
        unfilledReason: 'NO_ELIGIBLE_CANDIDATE',
      };
      traceSlots[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        outcome: 'UNFILLED',
        chosenId: null,
        chosenCost: null,
        runnersUp: [],
        rejected: evalResult.rejected.slice(0, MAX_REJECTIONS_TRACED),
        capRelaxedTo: null,
        changedByRepair: false,
      };
      return;
    }

    if (capRelaxedTo !== null) {
      warnings.push(warnCapRelaxed(slot.date, type, personTarget.cap, capRelaxedTo));
    }

    const scored = evalResult.eligible.map(({ id, state }) => ({
      id,
      cost: personCost({
        personId: id,
        date: slot.date,
        typeKey: slot.typeKey,
        seed: input.seed,
        monthCount: state.monthCount,
        typeCountSoFar:
          (state.histTypeCount.get(slot.typeKey) ?? 0) + (state.monthTypeCount.get(slot.typeKey) ?? 0),
        lastTypeDate: state.lastTypeDate.get(slot.typeKey) ?? null,
        histCount: state.histCount,
        lastAssignedDate: state.lastAssignedDate,
      }),
    }));
    scored.sort(compareCandidates);
    // La semilla solo puede cambiar el reparto entre candidatos empatados en
    // lo que de verdad importa. Ver `orderByVariety` y docs/algoritmo.md §6.
    const porVariedad = orderByVariety(scored, PERSON_COST_TOLERANCE);

    const winner = porVariedad[0];
    if (winner === undefined) throw new Error('No debería ocurrir: eligible no vacío pero scored sí.');

    const winnerState = personStates.get(winner.id);
    if (winnerState === undefined) throw new Error('Estado inconsistente para el candidato elegido.');
    winnerState.monthCount++;
    winnerState.monthTypeCount.set(slot.typeKey, (winnerState.monthTypeCount.get(slot.typeKey) ?? 0) + 1);
    winnerState.assignedDates.add(slot.date);
    winnerState.lastAssignedDate = slot.date;
    winnerState.lastTypeDate.set(slot.typeKey, slot.date);

    const runnersUp: CandidateTrace[] = porVariedad.slice(1, 1 + MAX_RUNNERS_UP).map((c) => ({ id: c.id, cost: c.cost }));

    resolved[idx] = {
      date: slot.date,
      typeKey: slot.typeKey,
      slotIndex: slot.slotIndex,
      kind: 'PERSON',
      personId: winner.id,
      teamId: null,
      locked: false,
      unfilledReason: null,
    };
    traceSlots[idx] = {
      date: slot.date,
      typeKey: slot.typeKey,
      slotIndex: slot.slotIndex,
      outcome: 'CHOSEN',
      chosenId: winner.id,
      chosenCost: winner.cost,
      runnersUp,
      rejected: evalResult.rejected.slice(0, MAX_REJECTIONS_TRACED),
      capRelaxedTo,
      changedByRepair: false,
    };
  }

  function selectTeam(slot: Slot, idx: number): void {
    if (activeTeams.length === 0) {
      resolved[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        kind: 'GROUP',
        personId: null,
        teamId: null,
        locked: false,
        unfilledReason: 'NO_ACTIVE_TEAMS',
      };
      traceSlots[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        outcome: 'UNFILLED',
        chosenId: null,
        chosenCost: null,
        runnersUp: [],
        rejected: [],
        capRelaxedTo: null,
        changedByRepair: false,
      };
      return;
    }

    const type = typesByKey.get(slot.typeKey);
    if (type === undefined) throw new Error(`Tipo desconocido en slot: ${slot.typeKey}`);

    function evaluate(effectiveCap: number): {
      eligible: { id: string; state: EngineState }[];
      rejected: RejectionTrace[];
    } {
      const eligible: { id: string; state: EngineState }[] = [];
      const rejected: RejectionTrace[] = [];
      for (const team of input.teams) {
        const state = teamStates.get(team.id);
        if (state === undefined) continue;
        const reason = rejectTeam({
          active: team.active,
          assignedToday: state.assignedDates.has(slot.date),
          allowTeamTwiceSameDate: input.settings.allowTeamTwiceSameDate,
          monthCount: state.monthCount,
          effectiveCap,
        });
        if (reason === null) eligible.push({ id: team.id, state });
        else rejected.push({ id: team.id, reason });
      }
      return { eligible, rejected };
    }

    let effectiveCap = teamTarget.cap;
    let evalResult = evaluate(effectiveCap);
    let capRelaxedTo: number | null = null;

    if (evalResult.eligible.length === 0) {
      const basicPassers = input.teams.filter((t) => {
        const state = teamStates.get(t.id);
        if (state === undefined) return false;
        return t.active && (input.settings.allowTeamTwiceSameDate || !state.assignedDates.has(slot.date));
      });

      if (basicPassers.length > 0) {
        for (let k = 1; k <= teamSlotCount; k++) {
          const candidateCap = teamTarget.cap + k;
          const found = basicPassers.some((t) => {
            const state = teamStates.get(t.id);
            return state !== undefined && state.monthCount < candidateCap;
          });
          if (found) {
            effectiveCap = candidateCap;
            capRelaxedTo = candidateCap;
            evalResult = evaluate(effectiveCap);
            break;
          }
        }
      }
    }

    if (evalResult.eligible.length === 0) {
      const classification = classifyUnfilled(evalResult.rejected);
      warnings.push(warnSlotUnfilled(slot.date, type, classification, 'todos los equipos activos'));
      resolved[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        kind: 'GROUP',
        personId: null,
        teamId: null,
        locked: false,
        unfilledReason: 'NO_ELIGIBLE_CANDIDATE',
      };
      traceSlots[idx] = {
        date: slot.date,
        typeKey: slot.typeKey,
        slotIndex: slot.slotIndex,
        outcome: 'UNFILLED',
        chosenId: null,
        chosenCost: null,
        runnersUp: [],
        rejected: evalResult.rejected.slice(0, MAX_REJECTIONS_TRACED),
        capRelaxedTo: null,
        changedByRepair: false,
      };
      return;
    }

    if (capRelaxedTo !== null) {
      warnings.push(warnCapRelaxed(slot.date, type, teamTarget.cap, capRelaxedTo));
    }

    const scored = evalResult.eligible.map(({ id, state }) => ({
      id,
      cost: teamCost({
        teamId: id,
        date: slot.date,
        typeKey: slot.typeKey,
        seed: input.seed,
        monthCount: state.monthCount,
        typeCountSoFar:
          (state.histTypeCount.get(slot.typeKey) ?? 0) + (state.monthTypeCount.get(slot.typeKey) ?? 0),
        lastTypeDate: state.lastTypeDate.get(slot.typeKey) ?? null,
        histCount: state.histCount,
      }),
    }));
    scored.sort(compareCandidates);
    // La semilla solo puede cambiar el reparto entre candidatos empatados en
    // lo que de verdad importa. Ver `orderByVariety` y docs/algoritmo.md §6.
    const porVariedad = orderByVariety(scored, TEAM_COST_TOLERANCE);

    const winner = porVariedad[0];
    if (winner === undefined) throw new Error('No debería ocurrir: eligible no vacío pero scored sí.');

    const winnerState = teamStates.get(winner.id);
    if (winnerState === undefined) throw new Error('Estado inconsistente para el candidato elegido.');
    winnerState.monthCount++;
    winnerState.monthTypeCount.set(slot.typeKey, (winnerState.monthTypeCount.get(slot.typeKey) ?? 0) + 1);
    winnerState.assignedDates.add(slot.date);
    winnerState.lastTypeDate.set(slot.typeKey, slot.date);

    const runnersUp: CandidateTrace[] = porVariedad.slice(1, 1 + MAX_RUNNERS_UP).map((c) => ({ id: c.id, cost: c.cost }));

    resolved[idx] = {
      date: slot.date,
      typeKey: slot.typeKey,
      slotIndex: slot.slotIndex,
      kind: 'GROUP',
      personId: null,
      teamId: winner.id,
      locked: false,
      unfilledReason: null,
    };
    traceSlots[idx] = {
      date: slot.date,
      typeKey: slot.typeKey,
      slotIndex: slot.slotIndex,
      outcome: 'CHOSEN',
      chosenId: winner.id,
      chosenCost: winner.cost,
      runnersUp,
      rejected: evalResult.rejected.slice(0, MAX_REJECTIONS_TRACED),
      capRelaxedTo,
      changedByRepair: false,
    };
  }

  // Dos pasadas, equipos primero. La regla de capitanes necesita saber QUÉ
  // equipo limpia ese día antes de repartir entrada y auditorio, y el tipo
  // fuente va después en el orden de columnas.
  //
  // Reordenar no cambia lo que sale: la elección de equipo depende solo del
  // estado de los equipos, nunca del de las personas, así que resolverlas
  // antes da exactamente el mismo reparto que antes de existir esta regla. Lo
  // que sí se conserva estrictamente es el orden canónico DENTRO de cada
  // pasada, que es de donde viene la reproducibilidad.
  slots.forEach((slot, idx) => {
    if (lockedIndices.has(idx) || slot.kind !== 'GROUP') return;
    selectTeam(slot, idx);
  });
  slots.forEach((slot, idx) => {
    if (lockedIndices.has(idx) || slot.kind !== 'PERSON') return;
    selectPerson(slot, idx);
  });

  let finalAssignments: ResolvedAssignment[] = resolved.map((r, idx) => {
    if (r === undefined) throw new Error(`Slot ${idx} quedó sin resolver: esto es un error del algoritmo.`);
    return r;
  });
  const finalTraceSlots: SlotTrace[] = traceSlots.map((t, idx) => {
    if (t === undefined) throw new Error(`Traza del slot ${idx} quedó sin resolver.`);
    return t;
  });

  // -------------------------------------------------------------------------
  // Paso 8 · Pase de mejora
  // -------------------------------------------------------------------------

  if (input.settings.runRepairPass) {
    const dateStrings = monthDates.map((d) => toIso(d));
    const dayOfWeekByDate = new Map(monthDates.map((d) => [toIso(d), dayOfWeek(d)] as const));

    // El paso 8 permuta ocupantes, y una permuta respeta las cargas pero no
    // las restricciones. Este predicado es lo que impide que la mejora del
    // reparto se pague colocando a alguien donde no puede estar.
    const reglaActiva =
      input.settings.captainRule.enabled && input.settings.captainRule.sourceTypeKey !== '';

    const puedeOcupar = (entityId: string, assignment: ResolvedAssignment): boolean => {
      // Con la regla activa, las casillas del TIPO FUENTE quedan congeladas.
      // De ellas cuelga la reserva de capitanes de cada fecha, así que mover
      // un equipo de día aquí invalidaría por la espalda la entrada y el
      // auditorio que el paso 6 ya había elegido para las dos fechas.
      if (assignment.kind === 'GROUP') {
        return !(reglaActiva && assignment.typeKey === input.settings.captainRule.sourceTypeKey);
      }

      const person = peopleById.get(entityId);
      const dow = dayOfWeekByDate.get(assignment.date);
      if (person === undefined || dow === undefined) return true;

      const exigeReserva =
        captainRuleApplies(input.settings.captainRule, assignment.typeKey) &&
        !captainRuleRelaxed.has(slotKey(assignment.date, assignment.typeKey, assignment.slotIndex));

      return canOccupy({
        person,
        dayOfWeek: dow,
        typeKey: assignment.typeKey,
        pool: exigeReserva ? poolForDate(assignment.date) : null,
      });
    };

    const repairResult = repair({
      dates: dateStrings,
      assignments: finalAssignments,
      personTarget,
      teamTarget,
      allowMultiplePerDay: input.settings.allowMultiplePerDay,
      allowTeamTwiceSameDate: input.settings.allowTeamTwiceSameDate,
      maxIterations: input.settings.maxRepairIterations,
      canOccupy: puedeOcupar,
    });
    finalAssignments = repairResult.assignments.slice();
    for (const idx of repairResult.changedIndices) {
      const trace = finalTraceSlots[idx];
      const assignment = finalAssignments[idx];
      if (trace === undefined || assignment === undefined) continue;
      finalTraceSlots[idx] = {
        ...trace,
        chosenId: assignment.kind === 'PERSON' ? assignment.personId : assignment.teamId,
        // El coste original ya no describe una decisión "ganó la comparación":
        // el repair mueve ocupantes por el objetivo global, no por la tupla.
        chosenCost: null,
        changedByRepair: true,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Paso 9 · Estadísticas, avisos y traza
  // -------------------------------------------------------------------------

  const dates: ProgramDateOut[] = monthDates.map((d, order) => ({
    date: toIso(d),
    dayOfWeek: dayOfWeek(d),
    order,
  }));

  const personHistoryCount = new Map<string, number>();
  for (const [id, state] of personStates) personHistoryCount.set(id, state.histCount);
  const teamHistoryCount = new Map<string, number>();
  for (const [id, state] of teamStates) teamHistoryCount.set(id, state.histCount);

  const stats = computeStats({
    people: input.people,
    teams: input.teams,
    personSlots: personSlotCount,
    teamSlots: teamSlotCount,
    personTarget,
    teamTarget,
    assignments: finalAssignments,
    typeKeys: typeKeysSorted,
    personHistoryCount,
    teamHistoryCount,
  });

  const trace: GenerationTrace = {
    seed: input.seed,
    costLabelsPerson: PERSON_COST_LABELS,
    costLabelsTeam: TEAM_COST_LABELS,
    slots: finalTraceSlots,
  };

  return { dates, assignments: finalAssignments, warnings, stats, trace };
}
