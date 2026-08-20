import type { IsoDate } from './dates';

// Contract for the whole domain. The normative description of every rule and
// cost component lives in docs/arquitectura.md and docs/algoritmo.md. If code
// and those documents disagree, one of the two is wrong — resolve it, do not
// quietly adjust the document afterwards.

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type AssignmentKind = 'PERSON' | 'GROUP';

/**
 * Column header icons. The LIST is the source of truth and the type is derived
 * from it — not the other way round. Anything that needs to offer the icons as
 * choices (the admin screen, a Zod schema) reads this array, so the compiler
 * guarantees the options and the type can never drift apart.
 *
 * Extend here and in pdf/icons.tsx at the same time.
 */
export const ICON_NAMES = [
  'calendar',
  'person',
  'arrow-left',
  'arrow-right',
  'broom',
  'hands-heart',
  'people',
  'dot',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface AssignmentType {
  readonly id: string;
  /** Stable key used across history. Survives relabelling. */
  readonly key: string;
  /** User-facing label, in Spanish. */
  readonly label: string;
  readonly kind: AssignmentKind;
  /** Date.getDay() convention: 0 = Sunday, 1 = Monday, 6 = Saturday. */
  readonly daysOfWeek: readonly number[];
  readonly slotsPerDate: number;
  readonly order: number;
  readonly icon: IconName;
  readonly active: boolean;
}

/**
 * Papel de una persona dentro de su grupo de aseo. La LISTA es la fuente de
 * verdad y el tipo se deriva de ella, igual que con ICON_NAMES: la pantalla de
 * personas y el esquema de Zod leen este array, así que las opciones que se
 * ofrecen y el tipo que las acepta no pueden separarse.
 */
export const GROUP_ROLES = ['CAPTAIN', 'ASSISTANT', 'MEMBER'] as const;

export type GroupRole = (typeof GROUP_ROLES)[number];

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  /**
   * Grupo de aseo al que pertenece, o `null` si no pertenece a ninguno. Es la
   * pertenencia la que da acceso a la reserva de capitanes de su equipo
   * (`CaptainRuleSettings`); no se usa para nada más.
   */
  readonly groupId: string | null;
  readonly role: GroupRole;
  /**
   * Responsabilidades individuales que esta persona PUEDE recibir, por `key`.
   *
   * `null` significa "sin restricción" y es distinto de `[]`, que significa
   * "ninguna". Esa distinción es la que permite que quien nunca ha tocado la
   * pantalla de restricciones siga entrando en todo el reparto, mientras que
   * quien deliberadamente se dejó sin marcar ninguna casilla queda fuera.
   *
   * Se guardan claves de tipo, no ids: una responsabilidad puede cambiar de
   * etiqueta sin que las restricciones dejen de apuntar a donde apuntaban.
   */
  readonly allowedTypeKeys: readonly string[] | null;
  /**
   * Días de la semana en los que esta persona NO puede servir, convención
   * `Date.getDay()` (0 = domingo, 1 = lunes, 6 = sábado). Se guarda la lista
   * de bloqueados y no la de permitidos para que añadir un día nuevo al
   * programa no excluya en silencio a quien nunca dijo nada al respecto.
   */
  readonly blockedDaysOfWeek: readonly number[];
}

/** A single cleaning group. Belongs to a team; never assigned on its own. */
export interface Group {
  readonly id: string;
  readonly name: string;
  readonly teamId: string;
  readonly order: number;
  readonly active: boolean;
}

/**
 * The assignable unit for GROUP-kind responsibilities. Groups always serve in
 * fixed pairs, so the pair — not the group — is what gets scheduled.
 */
export interface Team {
  readonly id: string;
  /** When null, the label is composed from the team's active groups. */
  readonly displayName: string | null;
  readonly order: number;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// Generator input
// ---------------------------------------------------------------------------

export interface HistoricalAssignment {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly kind: AssignmentKind;
  readonly personId: string | null;
  readonly teamId: string | null;
}

export interface LockedAssignment {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly personId: string | null;
  readonly teamId: string | null;
}

/**
 * "El equipo que limpia ese día pone también a quien recibe en la puerta".
 *
 * La regla se expresa con CLAVES DE TIPO, no con las palabras "aseo" o
 * "acomodador": el administrador elige qué responsabilidad de equipo manda y
 * qué responsabilidades individuales se cubren desde su reserva. Si mañana la
 * congregación decide que quien limpia también cubre los pasillos, es un
 * cambio de ajustes y no de código.
 *
 * La reserva de un día son los CAPTAIN y ASSISTANT cuyos grupos forman el
 * equipo asignado a `sourceTypeKey` esa fecha. Es un filtro duro: manda por
 * encima del tope mensual de asignaciones. Solo cede cuando la reserva no
 * puede cubrir la casilla de ninguna forma, y entonces deja un aviso
 * `CAPTAIN_RULE_UNMET` diciendo qué día y por qué.
 */
export interface CaptainRuleSettings {
  readonly enabled: boolean;
  /** `key` del tipo GROUP cuyo equipo del día define la reserva. `''` = sin definir. */
  readonly sourceTypeKey: string;
  /** `key` de los tipos PERSON que deben cubrirse desde esa reserva. */
  readonly targetTypeKeys: readonly string[];
}

export interface GenerationSettings {
  /** Months of history to consider. 0 means the whole history. */
  readonly historyWindowMonths: number;
  readonly allowMultiplePerDay: boolean;
  readonly allowTeamTwiceSameDate: boolean;
  readonly runRepairPass: boolean;
  readonly maxRepairIterations: number;
  readonly captainRule: CaptainRuleSettings;
}

export interface GenerateInput {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly people: readonly Person[];
  readonly teams: readonly Team[];
  /**
   * Necesarios desde que existe la regla de capitanes: son el puente entre la
   * persona (que pertenece a un grupo) y el equipo (que es lo que se asigna).
   */
  readonly groups: readonly Group[];
  readonly assignmentTypes: readonly AssignmentType[];
  readonly previousAssignments: readonly HistoricalAssignment[];
  readonly lockedAssignments: readonly LockedAssignment[];
  readonly settings: GenerationSettings;
  readonly seed: number;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/**
 * One assignable position. The canonical ordering — date, then typeOrder, then
 * slotIndex — is the backbone of reproducibility; nothing may reorder it.
 */
export interface Slot {
  readonly date: IsoDate;
  readonly dayOfWeek: number;
  readonly typeKey: string;
  readonly typeOrder: number;
  readonly kind: AssignmentKind;
  readonly slotIndex: number;
}

// ---------------------------------------------------------------------------
// Generator output
// ---------------------------------------------------------------------------

export type UnfilledReason =
  | 'NO_ACTIVE_PEOPLE'
  | 'NO_ACTIVE_TEAMS'
  | 'NO_ELIGIBLE_CANDIDATE'
  /**
   * Vaciada a propósito por el administrador (modo manual). El generador nunca
   * la produce: existe para que una casilla en blanco por decisión humana no se
   * confunda con una que el algoritmo no supo cubrir.
   */
  | 'MANUALLY_CLEARED';

export interface ProgramDateOut {
  readonly date: IsoDate;
  readonly dayOfWeek: number;
  readonly order: number;
}

export interface ResolvedAssignment {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly kind: AssignmentKind;
  readonly personId: string | null;
  readonly teamId: string | null;
  readonly locked: boolean;
  readonly unfilledReason: UnfilledReason | null;
}

export type WarningCode =
  | 'NO_ACTIVE_PEOPLE'
  | 'NO_ACTIVE_TEAMS'
  | 'CAP_RELAXED'
  | 'SLOT_UNFILLED'
  | 'LOCKED_INACTIVE_PERSON'
  | 'LOCKED_INACTIVE_TEAM'
  | 'LOCKED_DUPLICATE_SAME_DAY'
  /** La reserva de capitanes del día no pudo cubrir la casilla; se cubrió con otra persona. */
  | 'CAPTAIN_RULE_UNMET';

export interface Warning {
  readonly code: WarningCode;
  /** Already written in Spanish, ready to display. */
  readonly message: string;
  readonly date?: IsoDate | undefined;
  readonly typeKey?: string | undefined;
  readonly personId?: string | undefined;
  readonly teamId?: string | undefined;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface LoadTarget {
  readonly base: number;
  readonly remainder: number;
  readonly cap: number;
}

export interface EntityStat {
  readonly id: string;
  readonly monthCount: number;
  /** typeKey -> times this month. */
  readonly byType: Readonly<Record<string, number>>;
  /** Times within the history window. */
  readonly historyCount: number;
}

export interface Stats {
  readonly personSlots: number;
  readonly teamSlots: number;
  readonly personTarget: LoadTarget;
  readonly teamTarget: LoadTarget;
  readonly people: readonly EntityStat[];
  readonly teams: readonly EntityStat[];
  readonly balance: {
    readonly min: number;
    readonly max: number;
    readonly spread: number;
  };
}

// ---------------------------------------------------------------------------
// Explanation trace
// ---------------------------------------------------------------------------

export type CostTuple = readonly number[];

export type RejectionReason =
  | 'INACTIVE'
  /** No sirve ese día de la semana (`Person.blockedDaysOfWeek`). */
  | 'DAY_BLOCKED'
  /** Esa responsabilidad no está entre las suyas (`Person.allowedTypeKeys`). */
  | 'TYPE_NOT_ALLOWED'
  /** La regla de capitanes aplica a esta casilla y no está en la reserva del día. */
  | 'NOT_IN_CAPTAIN_POOL'
  | 'ALREADY_ASSIGNED_THIS_DATE'
  | 'AT_CAP';

export interface CandidateTrace {
  readonly id: string;
  readonly cost: CostTuple;
}

export interface RejectionTrace {
  readonly id: string;
  readonly reason: RejectionReason;
}

export interface SlotTrace {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly outcome: 'LOCKED' | 'CHOSEN' | 'UNFILLED';
  readonly chosenId: string | null;
  readonly chosenCost: CostTuple | null;
  readonly runnersUp: readonly CandidateTrace[];
  readonly rejected: readonly RejectionTrace[];
  readonly capRelaxedTo: number | null;
  readonly changedByRepair: boolean;
}

export interface GenerationTrace {
  readonly seed: number;
  /** Spanish labels for each cost component, in order. */
  readonly costLabelsPerson: readonly string[];
  readonly costLabelsTeam: readonly string[];
  readonly slots: readonly SlotTrace[];
}

export interface GenerateOutput {
  readonly dates: readonly ProgramDateOut[];
  readonly assignments: readonly ResolvedAssignment[];
  readonly warnings: readonly Warning[];
  readonly stats: Stats;
  readonly trace: GenerationTrace;
}
