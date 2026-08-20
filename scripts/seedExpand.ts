import { teamDisplayText } from '../src/domain/teams';
import type { AssignmentKind, Group, Team } from '../src/domain/types';

// ---------------------------------------------------------------------------
// Formas de scripts/seed-data.json (compacto) y su expansión al formato de
// documento de docs/arquitectura.md §8. Extraído a un módulo importable para
// que `npm run seed` y `tests/data/schemas.test.ts` compartan exactamente la
// misma función: la semilla queda verificada sin tocar Firebase.
// ---------------------------------------------------------------------------

export interface SeedAssignmentType {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly kind: AssignmentKind;
  readonly daysOfWeek: readonly number[];
  readonly slotsPerDate: number;
  readonly order: number;
  readonly icon: string;
  readonly active: boolean;
}

export interface SeedPerson {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly groupId: string | null;
  readonly role: 'CAPTAIN' | 'ASSISTANT' | 'MEMBER';
  readonly allowedTypeKeys: readonly string[] | null;
  readonly blockedDaysOfWeek: readonly number[];
}

export interface SeedTeam {
  readonly id: string;
  readonly displayName: string | null;
  readonly order: number;
  readonly active: boolean;
}

export interface SeedGroup {
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
  readonly order: number;
  readonly active: boolean;
}

export interface SeedCaptainRule {
  readonly enabled: boolean;
  readonly sourceTypeKey: string;
  readonly targetTypeKeys: readonly string[];
}

export interface SeedSettings {
  readonly historyWindowMonths: number;
  readonly allowMultiplePerDay: boolean;
  readonly allowTeamTwiceSameDate: boolean;
  readonly runRepairPass: boolean;
  readonly maxRepairIterations: number;
  readonly captainRule: SeedCaptainRule;
}

export interface SeedHistoricalRow {
  readonly date: string;
  readonly dayOfWeek: number;
  /** typeKey -> personId */
  readonly people: Readonly<Record<string, string>>;
  /** typeKey -> teamId */
  readonly teams?: Readonly<Record<string, string>>;
}

export interface SeedHistoricalProgram {
  readonly id: string;
  readonly year: number;
  readonly month: number;
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly seed: number;
  readonly rows: readonly SeedHistoricalRow[];
}

export interface SeedVerification {
  readonly fechas: number;
  readonly casillasDePersona: number;
  readonly casillasDeEquipo: number;
  readonly personas: number;
  readonly equipos: number;
  readonly grupos: number;
  readonly emparejamiento: string;
  readonly repartoEsperadoPersonas: string;
  readonly repartoEsperadoEquipos: string;
}

export interface SeedData {
  readonly assignmentTypes: readonly SeedAssignmentType[];
  readonly people: readonly SeedPerson[];
  readonly teams: readonly SeedTeam[];
  readonly groups: readonly SeedGroup[];
  readonly settings: SeedSettings;
  readonly historicalProgram: SeedHistoricalProgram;
  readonly _verificacion: SeedVerification;
}

export interface ExpandedAssignment {
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly kind: AssignmentKind;
  readonly personId: string | null;
  readonly personName: string | null;
  readonly teamId: string | null;
  readonly teamLabel: string | null;
  readonly locked: false;
  readonly unfilledReason: null;
}

export interface ExpandedDate {
  readonly date: string;
  readonly dayOfWeek: number;
  readonly order: number;
  readonly assignments: readonly ExpandedAssignment[];
}

export interface ExpandedProgram {
  readonly id: string;
  readonly year: number;
  readonly month: number;
  readonly status: 'DRAFT' | 'PUBLISHED';
  readonly seed: number;
  readonly dates: readonly ExpandedDate[];
}

/**
 * Expande el `historicalProgram` compacto de seed-data.json
 * (`people: { typeKey: personId }`, `teams: { typeKey: teamId }`) al formato
 * de documento de docs/arquitectura.md §8, con nombres y etiquetas
 * denormalizados y `locked: false` (nunca hubo bloqueos: es historial, no
 * algo generado por el algoritmo).
 *
 * Todos los tipos en la semilla tienen `slotsPerDate: 1`, así que
 * `slotIndex` siempre es 0.
 */
export function expandHistoricalProgram(seed: SeedData): ExpandedProgram {
  const peopleById = new Map(seed.people.map((p) => [p.id, p]));
  const teamsById = new Map(seed.teams.map((t) => [t.id, t]));
  const typesByKey = new Map(seed.assignmentTypes.map((t) => [t.key, t]));

  const dates: ExpandedDate[] = seed.historicalProgram.rows.map((row, index) => {
    const assignments: ExpandedAssignment[] = [];

    for (const [typeKey, personId] of Object.entries(row.people)) {
      if (!typesByKey.has(typeKey)) {
        throw new Error(`Fila ${row.date}: tipo de asignación desconocido "${typeKey}"`);
      }
      const person = peopleById.get(personId);
      if (!person) {
        throw new Error(`Fila ${row.date}: persona desconocida "${personId}" para "${typeKey}"`);
      }
      assignments.push({
        typeKey,
        slotIndex: 0,
        kind: 'PERSON',
        personId: person.id,
        personName: person.name,
        teamId: null,
        teamLabel: null,
        locked: false,
        unfilledReason: null,
      });
    }

    for (const [typeKey, teamId] of Object.entries(row.teams ?? {})) {
      if (!typesByKey.has(typeKey)) {
        throw new Error(`Fila ${row.date}: tipo de asignación desconocido "${typeKey}"`);
      }
      const team = teamsById.get(teamId);
      if (!team) {
        throw new Error(`Fila ${row.date}: equipo desconocido "${teamId}" para "${typeKey}"`);
      }
      assignments.push({
        typeKey,
        slotIndex: 0,
        kind: 'GROUP',
        personId: null,
        personName: null,
        teamId: team.id,
        teamLabel: teamDisplayText(team as Team, seed.groups as readonly Group[]),
        locked: false,
        unfilledReason: null,
      });
    }

    return { date: row.date, dayOfWeek: row.dayOfWeek, order: index, assignments };
  });

  return {
    id: seed.historicalProgram.id,
    year: seed.historicalProgram.year,
    month: seed.historicalProgram.month,
    status: seed.historicalProgram.status,
    seed: seed.historicalProgram.seed,
    dates,
  };
}

export interface VerificationResult {
  readonly ok: boolean;
  readonly details: readonly string[];
}

/**
 * Comprueba las cifras del bloque `_verificacion` de seed-data.json contra
 * el programa expandido: es la red que detecta que el script expandió mal
 * los datos. El reparto esperado no se compara analizando el texto libre de
 * `_verificacion` (frágil); se deriva matemáticamente de base/resto/tope, que
 * es exactamente lo que ese texto describe.
 */
export function verifyExpandedProgram(seed: SeedData, program: ExpandedProgram): VerificationResult {
  const details: string[] = [];
  const expected = seed._verificacion;

  if (program.dates.length !== expected.fechas) {
    details.push(`fechas: esperadas ${expected.fechas}, obtenidas ${program.dates.length}`);
  }
  if (seed.people.length !== expected.personas) {
    details.push(`personas: esperadas ${expected.personas}, obtenidas ${seed.people.length}`);
  }
  if (seed.teams.length !== expected.equipos) {
    details.push(`equipos: esperados ${expected.equipos}, obtenidos ${seed.teams.length}`);
  }
  if (seed.groups.length !== expected.grupos) {
    details.push(`grupos: esperados ${expected.grupos}, obtenidos ${seed.groups.length}`);
  }

  let casillasDePersona = 0;
  let casillasDeEquipo = 0;
  const personCounts = new Map<string, number>();
  const teamCounts = new Map<string, number>();

  for (const date of program.dates) {
    for (const assignment of date.assignments) {
      if (assignment.kind === 'PERSON') {
        casillasDePersona++;
        if (assignment.personId !== null) {
          personCounts.set(assignment.personId, (personCounts.get(assignment.personId) ?? 0) + 1);
        }
      } else {
        casillasDeEquipo++;
        if (assignment.teamId !== null) {
          teamCounts.set(assignment.teamId, (teamCounts.get(assignment.teamId) ?? 0) + 1);
        }
      }
    }
  }

  if (casillasDePersona !== expected.casillasDePersona) {
    details.push(`casillas de persona: esperadas ${expected.casillasDePersona}, obtenidas ${casillasDePersona}`);
  }
  if (casillasDeEquipo !== expected.casillasDeEquipo) {
    details.push(`casillas de equipo: esperadas ${expected.casillasDeEquipo}, obtenidas ${casillasDeEquipo}`);
  }

  checkDistribution({
    label: 'personas',
    totalSlots: casillasDePersona,
    entityCount: seed.people.length,
    counts: personCounts,
    details,
  });

  checkDistribution({
    label: 'equipos',
    totalSlots: casillasDeEquipo,
    entityCount: seed.teams.length,
    counts: teamCounts,
    details,
  });

  // El texto de _verificacion nombra explícitamente a e4 con 4 asignaciones
  // y los otros tres equipos con 3: se comprueba también ese caso concreto,
  // no solo la forma agregada de la distribución.
  const e4Count = teamCounts.get('e4') ?? 0;
  if (e4Count !== 4) {
    details.push(`equipo e4: esperadas 4 asignaciones, obtenidas ${e4Count}`);
  }
  for (const teamId of ['e1', 'e2', 'e3']) {
    const count = teamCounts.get(teamId) ?? 0;
    if (count !== 3) {
      details.push(`equipo ${teamId}: esperadas 3 asignaciones, obtenidas ${count}`);
    }
  }

  return { ok: details.length === 0, details };
}

function checkDistribution(input: {
  readonly label: string;
  readonly totalSlots: number;
  readonly entityCount: number;
  readonly counts: ReadonlyMap<string, number>;
  readonly details: string[];
}): void {
  const { label, totalSlots, entityCount, counts, details } = input;
  if (entityCount === 0) return;

  const base = Math.floor(totalSlots / entityCount);
  const remainder = totalSlots % entityCount;
  const cap = remainder > 0 ? base + 1 : base;

  if (counts.size !== entityCount) {
    details.push(`${label}: se esperaba que las ${entityCount} entidades aparecieran al menos una vez, aparecieron ${counts.size}`);
  }

  let atCap = 0;
  let atBase = 0;
  const fueraDeRango: string[] = [];
  for (const [id, count] of counts) {
    if (count === cap) atCap++;
    else if (count === base) atBase++;
    else fueraDeRango.push(`${id}=${count}`);
  }

  if (fueraDeRango.length > 0) {
    details.push(`${label}: conteos fuera del rango [${base}, ${cap}]: ${fueraDeRango.join(', ')}`);
  }
  if (atCap !== remainder) {
    details.push(`${label}: se esperaban ${remainder} entidades con ${cap} asignaciones, hubo ${atCap}`);
  }
  if (atBase !== entityCount - remainder) {
    details.push(`${label}: se esperaban ${entityCount - remainder} entidades con ${base} asignaciones, hubo ${atBase}`);
  }
}
