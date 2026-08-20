import type { CaptainRuleSettings, Group, GroupRole, Person } from './types';

// Quién puede ocupar qué. Predicados puros, sin contadores ni estado: dicen si
// una persona es APTA para una casilla, no si le conviene. El equilibrio vive
// en scoring.ts; aquí solo están las reglas que no se negocian.
//
// Los tres filtros por persona (día, responsabilidad y reserva de capitanes)
// están juntos a propósito. El generador, el pase de mejora y la interfaz
// tienen que coincidir exactamente en qué es "apto": si cada uno lo decidiera
// por su cuenta, el programa mostraría en rojo casillas que él mismo generó.

/** Papeles que entran en la reserva de un equipo. Un MEMBER no entra. */
export const CAPTAIN_POOL_ROLES: readonly GroupRole[] = ['CAPTAIN', 'ASSISTANT'];

/**
 * `allowedTypeKeys === null` es "sin restricción", no "ninguna". Ver el
 * comentario del campo en types.ts: la diferencia entre no haber tocado nunca
 * las restricciones y haberlas vaciado a conciencia.
 */
export function allowsType(person: Person, typeKey: string): boolean {
  return person.allowedTypeKeys === null || person.allowedTypeKeys.includes(typeKey);
}

/** `dayOfWeek` en convención `Date.getDay()`: 0 = domingo, 1 = lunes, 6 = sábado. */
export function allowsDay(person: Person, dayOfWeek: number): boolean {
  return !person.blockedDaysOfWeek.includes(dayOfWeek);
}

/** true si esta persona tiene alguna restricción declarada. Solo para la interfaz. */
export function hasRestrictions(person: Person): boolean {
  return person.allowedTypeKeys !== null || person.blockedDaysOfWeek.length > 0;
}

/**
 * true si la regla de capitanes gobierna esta responsabilidad. Una regla
 * activada pero sin tipo fuente no gobierna nada: sin saber qué equipo limpia
 * no hay reserva que aplicar, y aplicar una reserva vacía dejaría el mes en
 * blanco.
 */
export function captainRuleApplies(rule: CaptainRuleSettings, typeKey: string): boolean {
  return rule.enabled && rule.sourceTypeKey !== '' && rule.targetTypeKeys.includes(typeKey);
}

/**
 * Ids de las personas que forman la reserva del equipo `teamId`: los capitanes
 * y auxiliares de los grupos que componen ese equipo.
 *
 * Con `teamId === null` (la casilla de aseo de ese día quedó sin cubrir) la
 * reserva es vacía. El llamador decide qué hacer con eso; esta función no
 * inventa una reserva que no existe.
 *
 * No mira `active`: la actividad es un filtro aparte, y mezclarlos haría que
 * un capitán desactivado desapareciera de la reserva sin dejar rastro del
 * motivo en la traza.
 */
export function captainPool(
  people: readonly Person[],
  groups: readonly Group[],
  teamId: string | null
): ReadonlySet<string> {
  if (teamId === null) return new Set();

  const groupIdsOfTeam = new Set(groups.filter((g) => g.teamId === teamId).map((g) => g.id));

  const pool = new Set<string>();
  for (const person of people) {
    if (person.groupId === null) continue;
    if (!groupIdsOfTeam.has(person.groupId)) continue;
    if (!CAPTAIN_POOL_ROLES.includes(person.role)) continue;
    pool.add(person.id);
  }
  return pool;
}

export interface OccupancyCheckInput {
  readonly person: Person;
  readonly dayOfWeek: number;
  readonly typeKey: string;
  /**
   * Reserva vigente para esta casilla, o `null` si la regla no aplica aquí —
   * ya sea porque está desactivada, porque la responsabilidad no está entre
   * sus objetivos, o porque el generador tuvo que renunciar a ella ese día.
   */
  readonly pool: ReadonlySet<string> | null;
}

/**
 * ¿Puede esta persona ocupar esta casilla, ignorando cupos y duplicados?
 *
 * Es el predicado que usa el pase de mejora: intercambiar dos ocupantes no
 * cambia cuántas veces sale cada quien, pero sí puede meter a alguien en una
 * responsabilidad que tiene vetada. Sin esta comprobación, el paso 8
 * deshacía en silencio lo que el paso 6 había respetado.
 */
export function canOccupy(input: OccupancyCheckInput): boolean {
  if (!allowsDay(input.person, input.dayOfWeek)) return false;
  if (!allowsType(input.person, input.typeKey)) return false;
  if (input.pool !== null && !input.pool.has(input.person.id)) return false;
  return true;
}
