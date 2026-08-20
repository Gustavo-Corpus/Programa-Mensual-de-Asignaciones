import { Timestamp } from 'firebase/firestore';

import { teamDisplayText } from '../domain/teams';
import type {
  AssignmentType,
  GenerationSettings,
  GenerationTrace,
  Group,
  HistoricalAssignment,
  Person,
  ProgramDateOut,
  ResolvedAssignment,
  Team,
  Warning,
} from '../domain/types';
import {
  assignmentTypeSchema,
  generationSettingsSchema,
  generationTraceSchema,
  groupSchema,
  parseFirestoreDoc,
  personSchema,
  programDocumentSchema,
  teamSchema,
} from './schemas';
import type { ProgramAssignmentDoc, ProgramDateDoc, ProgramDocument } from './types';

// ---------------------------------------------------------------------------
// Conversión Firestore -> dominio
//
// El `id` de cada entidad es el id del documento, no un campo de dentro: por
// eso cada función recibe `id` aparte y lo fusiona con los datos crudos antes
// de validar (docs/arquitectura.md §8).
// ---------------------------------------------------------------------------

function asRecord(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

export function assignmentTypeFromDoc(id: string, data: unknown): AssignmentType {
  return parseFirestoreDoc(assignmentTypeSchema, 'assignmentTypes', id, { id, ...asRecord(data) });
}

export function personFromDoc(id: string, data: unknown): Person {
  return parseFirestoreDoc(personSchema, 'people', id, { id, ...asRecord(data) });
}

export function groupFromDoc(id: string, data: unknown): Group {
  return parseFirestoreDoc(groupSchema, 'groups', id, { id, ...asRecord(data) });
}

export function teamFromDoc(id: string, data: unknown): Team {
  return parseFirestoreDoc(teamSchema, 'teams', id, { id, ...asRecord(data) });
}

export function settingsFromDoc(data: unknown): GenerationSettings {
  return parseFirestoreDoc(generationSettingsSchema, 'settings', 'app', asRecord(data));
}

export function programFromDoc(id: string, data: unknown): ProgramDocument {
  return parseFirestoreDoc(programDocumentSchema, 'programs', id, { id, ...asRecord(data) });
}

export function traceFromDoc(programId: string, data: unknown): GenerationTrace {
  return parseFirestoreDoc(generationTraceSchema, `programs/${programId}/meta`, 'trace', asRecord(data));
}

// ---------------------------------------------------------------------------
// Conversión dominio -> Firestore
//
// Nunca incluyen `id`: en Firestore el id vive en el documento, no en su
// contenido.
// ---------------------------------------------------------------------------

export function assignmentTypeToDoc(type: AssignmentType): Record<string, unknown> {
  return {
    key: type.key,
    label: type.label,
    kind: type.kind,
    daysOfWeek: type.daysOfWeek,
    slotsPerDate: type.slotsPerDate,
    order: type.order,
    icon: type.icon,
    active: type.active,
  };
}

export function personToDoc(person: Person): Record<string, unknown> {
  return {
    name: person.name,
    active: person.active,
    groupId: person.groupId,
    role: person.role,
    // Se escriben tal cual, `null` incluido: Firestore distingue "campo con
    // valor null" de "campo ausente", y esa diferencia es justo la que separa
    // "sin restricción" de "no se ha guardado todavía".
    allowedTypeKeys: person.allowedTypeKeys,
    blockedDaysOfWeek: person.blockedDaysOfWeek,
  };
}

export function groupToDoc(group: Group): Record<string, unknown> {
  return { name: group.name, teamId: group.teamId, order: group.order, active: group.active };
}

export function teamToDoc(team: Team): Record<string, unknown> {
  return { displayName: team.displayName, order: team.order, active: team.active };
}

export function settingsToDoc(settings: GenerationSettings): Record<string, unknown> {
  return { ...settings };
}

export function traceToDoc(trace: GenerationTrace): Record<string, unknown> {
  return {
    seed: trace.seed,
    costLabelsPerson: trace.costLabelsPerson,
    costLabelsTeam: trace.costLabelsTeam,
    slots: trace.slots,
  };
}

/**
 * Datos crudos listos para `setDoc(programRef, ...)`, sin el `id` (va en la
 * referencia del documento, no en el contenido). `createdAt`/`updatedAt`
 * llegan como epoch millis (ver src/data/types.ts) y se convierten aquí a
 * `Timestamp` de Firestore — son metadatos de escritura, no fechas del
 * programa, así que sí les corresponde ser un instante.
 */
export function programToDocData(program: Omit<ProgramDocument, 'id'>): Record<string, unknown> {
  return {
    year: program.year,
    month: program.month,
    status: program.status,
    seed: program.seed,
    settingsSnapshot: program.settingsSnapshot,
    warnings: program.warnings,
    createdAt: Timestamp.fromMillis(program.createdAt),
    updatedAt: Timestamp.fromMillis(program.updatedAt),
    dates: program.dates,
  };
}

// ---------------------------------------------------------------------------
// Denormalización al guardar un programa
// ---------------------------------------------------------------------------

export interface BuildProgramDatesInput {
  readonly dates: readonly ProgramDateOut[];
  readonly assignments: readonly ResolvedAssignment[];
  readonly people: readonly Person[];
  readonly teams: readonly Team[];
  readonly groups: readonly Group[];
}

/**
 * Compone las fechas del documento agregado a partir de la salida del
 * generador, denormalizando `personName` y `teamLabel` junto a
 * `personId`/`teamId` (docs/arquitectura.md §8, decisión 2). Si mañana se
 * renombra a alguien o se cambia un grupo de equipo, los programas del año
 * pasado deben seguir mostrando lo que realmente se imprimió.
 */
export function buildProgramDates(input: BuildProgramDatesInput): ProgramDateDoc[] {
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const teamsById = new Map(input.teams.map((t) => [t.id, t]));

  const assignmentsByDate = new Map<string, ResolvedAssignment[]>();
  for (const assignment of input.assignments) {
    const list = assignmentsByDate.get(assignment.date);
    if (list) {
      list.push(assignment);
    } else {
      assignmentsByDate.set(assignment.date, [assignment]);
    }
  }

  return input.dates.map((dateOut): ProgramDateDoc => {
    const assignmentsForDate = (assignmentsByDate.get(dateOut.date) ?? [])
      .slice()
      .sort((a, b) => a.slotIndex - b.slotIndex || a.typeKey.localeCompare(b.typeKey));

    const assignments: ProgramAssignmentDoc[] = assignmentsForDate.map((assignment) => {
      const person = assignment.personId !== null ? (peopleById.get(assignment.personId) ?? null) : null;
      const team = assignment.teamId !== null ? (teamsById.get(assignment.teamId) ?? null) : null;

      return {
        typeKey: assignment.typeKey,
        slotIndex: assignment.slotIndex,
        kind: assignment.kind,
        personId: assignment.personId,
        personName: person ? person.name : null,
        teamId: assignment.teamId,
        teamLabel: team ? teamDisplayText(team, input.groups) : null,
        locked: assignment.locked,
        unfilledReason: assignment.unfilledReason,
      };
    });

    return {
      date: dateOut.date,
      dayOfWeek: dateOut.dayOfWeek,
      order: dateOut.order,
      assignments,
    };
  });
}

// ---------------------------------------------------------------------------
// Historial: aplanar un ProgramDocument a HistoricalAssignment[]
// ---------------------------------------------------------------------------

/**
 * Una casilla no cubierta (`personId` y `teamId` ambos `null`) no representa
 * un hecho histórico — nadie sirvió ese día en ese tipo — así que no entra al
 * historial que alimenta `generateProgram`.
 */
export function programDocToHistoricalAssignments(program: ProgramDocument): HistoricalAssignment[] {
  const result: HistoricalAssignment[] = [];
  for (const date of program.dates) {
    for (const assignment of date.assignments) {
      if (assignment.personId === null && assignment.teamId === null) continue;
      result.push({
        date: date.date,
        typeKey: assignment.typeKey,
        kind: assignment.kind,
        personId: assignment.personId,
        teamId: assignment.teamId,
      });
    }
  }
  return result;
}

// Reexport para que los repos no necesiten importar Warning solo para
// tipar sus firmas.
export type { Warning };
