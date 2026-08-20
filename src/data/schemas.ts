import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';

import { monthKey } from '../domain/dates';
import { GROUP_ROLES, ICON_NAMES } from '../domain/types';
import type {
  AssignmentKind,
  AssignmentType,
  CandidateTrace,
  CaptainRuleSettings,
  GenerationSettings,
  GenerationTrace,
  Group,
  IconName,
  Person,
  RejectionTrace,
  SlotTrace,
  Team,
  Warning,
} from '../domain/types';
import type {
  ProgramAssignmentDoc,
  ProgramDateDoc,
  ProgramDocument,
} from './types';

// ---------------------------------------------------------------------------
// Frontera de validación (docs/arquitectura.md §9)
//
// Todo lo que sale de Firestore pasa por uno de los esquemas de este archivo
// antes de convertirse en un tipo del dominio. Un documento corrupto debe dar
// un error claro señalando la colección y el id, no un `undefined` que viaja
// hasta el generador de PDF y revienta ahí.
// ---------------------------------------------------------------------------

/**
 * Valida `data` contra `schema` y, si falla, lanza un error legible que dice
 * exactamente qué documento está mal y por qué. Es el único punto de entrada
 * pensado para usarse desde `mappers.ts`.
 */
export function parseFirestoreDoc<T>(
  // El tercer parámetro de ZodType (Input) se deja en `unknown` a propósito:
  // programDocumentSchema transforma `Timestamp` -> `number` (createdAt/
  // updatedAt), así que su Input real difiere de su Output y no encajaría
  // en `z.ZodType<T>` (que fija Input = Output = T). `safeParse` siempre
  // acepta `unknown` en tiempo de ejecución; esto solo afecta al tipado.
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  collectionPath: string,
  id: string,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(raíz)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Documento corrupto en ${collectionPath}/${id}: ${detalle}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Primitivas compartidas
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true si "YYYY-MM-DD" es una fecha civil real (rechaza "2026-02-30"). */
function isRealCalendarDate(iso: string): boolean {
  const parts = iso.split('-');
  const yearStr = parts[0] ?? '';
  const monthStr = parts[1] ?? '';
  const dayStr = parts[2] ?? '';
  const y = Number(yearStr);
  const m = Number(monthStr);
  const d = Number(dayStr);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Cadena "YYYY-MM-DD". Nunca un `Timestamp`: un `Timestamp` es un instante
 * UTC y reintroduce el problema de huso horario que `PlainDate` existe para
 * eliminar (docs/arquitectura.md §3). `z.string()` ya rechaza por sí solo
 * cualquier objeto `Timestamp` que llegue en su lugar.
 */
export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_RE, 'formato de fecha inválido, se esperaba "YYYY-MM-DD"')
  .refine(isRealCalendarDate, { message: 'la fecha no existe en el calendario' });

/** Convierte un Firestore `Timestamp` a epoch millis. Solo para metadatos
 * de escritura (`createdAt`/`updatedAt`), nunca para fechas del programa. */
const timestampMillisSchema = z
  .instanceof(Timestamp, { message: 'se esperaba un Timestamp de Firestore' })
  .transform((t) => t.toMillis());

export const daysOfWeekSchema = z
  .array(z.number().int().min(0, 'día de semana fuera de rango 0-6').max(6, 'día de semana fuera de rango 0-6'))
  .min(1, 'daysOfWeek no puede estar vacío')
  .refine((arr) => new Set(arr).size === arr.length, {
    message: 'daysOfWeek no puede tener valores repetidos',
  });

export const slotsPerDateSchema = z.number().int().min(1, 'slotsPerDate debe ser un entero >= 1');

export const assignmentKindSchema: z.ZodType<AssignmentKind> = z.enum(['PERSON', 'GROUP']);

// Se construye a partir de ICON_NAMES del dominio en vez de repetir la lista:
// añadir un icono en un solo sitio basta, y es imposible que este esquema
// acepte un valor que el tipo no contemple, o al revés.
export const iconNameSchema: z.ZodType<IconName> = z.enum(ICON_NAMES);

export const unfilledReasonSchema = z
  .enum(['NO_ACTIVE_PEOPLE', 'NO_ACTIVE_TEAMS', 'NO_ELIGIBLE_CANDIDATE', 'MANUALLY_CLEARED'])
  .nullable();

export const groupRoleSchema = z.enum(GROUP_ROLES);

// ---------------------------------------------------------------------------
// Catálogo: assignmentTypes, people, groups, teams
// ---------------------------------------------------------------------------

export const assignmentTypeSchema: z.ZodType<AssignmentType> = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  kind: assignmentKindSchema,
  daysOfWeek: daysOfWeekSchema,
  slotsPerDate: slotsPerDateSchema,
  order: z.number().int(),
  icon: iconNameSchema,
  active: z.boolean(),
});

/**
 * Los cuatro campos de restricción llevan `.default(...)`, y por eso el
 * esquema declara su Input como `unknown`: una persona guardada antes de que
 * existieran las restricciones sigue siendo un documento VÁLIDO — se lee como
 * "sin grupo, miembro, sin restricciones", que es exactamente el
 * comportamiento que tenía. Migrar la colección entera para añadir cuatro
 * valores por defecto sería trabajo y riesgo a cambio de nada.
 */
export const personSchema: z.ZodType<Person, z.ZodTypeDef, unknown> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  groupId: z.string().min(1).nullable().default(null),
  role: groupRoleSchema.default('MEMBER'),
  // `null` (sin restricción) y `[]` (ninguna responsabilidad) son estados
  // distintos y ambos legítimos; ver Person.allowedTypeKeys.
  allowedTypeKeys: z.array(z.string().min(1)).nullable().default(null),
  blockedDaysOfWeek: z
    .array(z.number().int().min(0, 'día de semana fuera de rango 0-6').max(6, 'día de semana fuera de rango 0-6'))
    .default([]),
});

export const groupSchema: z.ZodType<Group> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  order: z.number().int(),
  active: z.boolean(),
});

export const teamSchema: z.ZodType<Team> = z.object({
  id: z.string().min(1),
  // Cadena vacía se trata igual que null en domain/teams.ts (teamLabel
  // compone el nombre a partir de los grupos); no se fuerza min(1) aquí.
  displayName: z.string().nullable(),
  order: z.number().int(),
  active: z.boolean(),
});

// ---------------------------------------------------------------------------
// settings/app
// ---------------------------------------------------------------------------

export const captainRuleSettingsSchema: z.ZodType<CaptainRuleSettings> = z.object({
  enabled: z.boolean(),
  // Cadena vacía = "sin tipo fuente elegido"; con ella la regla no gobierna
  // nada aunque esté marcada como activa (ver domain/eligibility.ts).
  sourceTypeKey: z.string(),
  targetTypeKeys: z.array(z.string().min(1)),
});

/** Regla apagada: lo que rige para una instalación anterior a esta versión. */
const CAPTAIN_RULE_OFF: CaptainRuleSettings = {
  enabled: false,
  sourceTypeKey: '',
  targetTypeKeys: [],
};

export const generationSettingsSchema: z.ZodType<GenerationSettings, z.ZodTypeDef, unknown> = z.object({
  historyWindowMonths: z.number().int().min(0),
  allowMultiplePerDay: z.boolean(),
  allowTeamTwiceSameDate: z.boolean(),
  runRepairPass: z.boolean(),
  maxRepairIterations: z.number().int().min(1),
  // Por defecto APAGADA, no encendida con claves adivinadas: encenderla sola
  // cambiaría en silencio el reparto de quien actualice la aplicación, y
  // además la regla no significa nada hasta que alguien diga a qué grupo
  // pertenece cada persona.
  captainRule: captainRuleSettingsSchema.default(CAPTAIN_RULE_OFF),
});

// ---------------------------------------------------------------------------
// Traza de explicación: programs/{YYYY-MM}/meta/trace
// ---------------------------------------------------------------------------

export const candidateTraceSchema: z.ZodType<CandidateTrace> = z.object({
  id: z.string().min(1),
  cost: z.array(z.number()),
});

export const rejectionTraceSchema: z.ZodType<RejectionTrace> = z.object({
  id: z.string().min(1),
  reason: z.enum([
    'INACTIVE',
    'DAY_BLOCKED',
    'TYPE_NOT_ALLOWED',
    'NOT_IN_CAPTAIN_POOL',
    'ALREADY_ASSIGNED_THIS_DATE',
    'AT_CAP',
  ]),
});

export const slotTraceSchema: z.ZodType<SlotTrace> = z.object({
  date: isoDateSchema,
  typeKey: z.string().min(1),
  slotIndex: z.number().int().min(0),
  outcome: z.enum(['LOCKED', 'CHOSEN', 'UNFILLED']),
  chosenId: z.string().min(1).nullable(),
  chosenCost: z.array(z.number()).nullable(),
  runnersUp: z.array(candidateTraceSchema),
  rejected: z.array(rejectionTraceSchema),
  capRelaxedTo: z.number().nullable(),
  changedByRepair: z.boolean(),
});

export const generationTraceSchema: z.ZodType<GenerationTrace> = z.object({
  seed: z.number(),
  costLabelsPerson: z.array(z.string()),
  costLabelsTeam: z.array(z.string()),
  slots: z.array(slotTraceSchema),
});

// ---------------------------------------------------------------------------
// Avisos (embebidos en el documento de programa)
// ---------------------------------------------------------------------------

const warningCodeSchema = z.enum([
  'NO_ACTIVE_PEOPLE',
  'NO_ACTIVE_TEAMS',
  'CAP_RELAXED',
  'SLOT_UNFILLED',
  'LOCKED_INACTIVE_PERSON',
  'LOCKED_INACTIVE_TEAM',
  'LOCKED_DUPLICATE_SAME_DAY',
  'CAPTAIN_RULE_UNMET',
]);

export const warningSchema: z.ZodType<Warning> = z.object({
  code: warningCodeSchema,
  message: z.string().min(1),
  date: isoDateSchema.optional(),
  typeKey: z.string().min(1).optional(),
  personId: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// programs/{YYYY-MM}
// ---------------------------------------------------------------------------

const programAssignmentDocSchema: z.ZodType<ProgramAssignmentDoc> = z.object({
  typeKey: z.string().min(1),
  slotIndex: z.number().int().min(0),
  kind: assignmentKindSchema,
  personId: z.string().min(1).nullable(),
  personName: z.string().min(1).nullable(),
  teamId: z.string().min(1).nullable(),
  // Puede ser "" si el equipo tiene todos sus grupos inactivos: es un
  // estado legítimo (domain/teams.ts), no un error de datos.
  teamLabel: z.string().nullable(),
  locked: z.boolean(),
  unfilledReason: unfilledReasonSchema,
});

const programDateDocSchema: z.ZodType<ProgramDateDoc> = z.object({
  date: isoDateSchema,
  dayOfWeek: z.number().int().min(0).max(6),
  order: z.number().int(),
  assignments: z.array(programAssignmentDocSchema),
});

const programDocumentBaseSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}$/, 'el id del documento debe tener forma "YYYY-MM"'),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  seed: z.number(),
  settingsSnapshot: generationSettingsSchema,
  warnings: z.array(warningSchema),
  createdAt: timestampMillisSchema,
  updatedAt: timestampMillisSchema,
  dates: z.array(programDateDocSchema),
});

/**
 * El id del documento debe casar con `year`/`month` del contenido:
 * `programs/2026-08` tiene que llevar dentro `year: 2026, month: 8`. Si no
 * casan, es un documento corrupto (docs/arquitectura.md §8, decisión 1).
 */
export const programDocumentSchema: z.ZodType<ProgramDocument, z.ZodTypeDef, unknown> = programDocumentBaseSchema.superRefine(
  (doc, ctx) => {
    const expected = monthKey(doc.year, doc.month);
    if (doc.id !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `el id del documento ("${doc.id}") no coincide con year/month del contenido ("${expected}")`,
        path: ['id'],
      });
    }
  }
);
