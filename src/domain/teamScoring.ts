import type { CostTuple, RejectionReason } from './types';
import type { IsoDate } from './dates';
import { daysSince } from './scoring';
import { stableHash } from './rng';

// Filtros duros y tupla de coste de EQUIPOS. Ver docs/algoritmo.md, paso 7.
//
// La unidad asignable de tipo GROUP es el equipo, no el grupo suelto (ver
// arquitectura.md §4): un equipo se comporta exactamente igual que una
// persona, con contadores propios e independientes de los de las personas.
// Es la misma tupla que la de personas, sin el componente de espaciado.

export interface TeamFilterInput {
  readonly active: boolean;
  /** true si este equipo ya tiene una asignación esa misma fecha. */
  readonly assignedToday: boolean;
  readonly allowTeamTwiceSameDate: boolean;
  readonly monthCount: number;
  readonly effectiveCap: number;
}

/**
 * Filtros duros para un candidato EQUIPO, en el orden fijado por la
 * especificación (paso 7): el primero que falla es el que se reporta.
 * Devuelve `null` cuando el candidato es elegible.
 */
export function rejectTeam(input: TeamFilterInput): RejectionReason | null {
  if (!input.active) return 'INACTIVE';
  if (!input.allowTeamTwiceSameDate && input.assignedToday) return 'ALREADY_ASSIGNED_THIS_DATE';
  if (input.monthCount >= input.effectiveCap) return 'AT_CAP';
  return null;
}

export interface TeamCostInput {
  readonly teamId: string;
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly seed: number;
  /** teamMonthCount[t] */
  readonly monthCount: number;
  /** histTeamTypeCount[t][T.key] + monthTeamTypeCount[t][T.key] */
  readonly typeCountSoFar: number;
  /** Último uso de T por t (historial combinado con el mes en curso), o null. */
  readonly lastTypeDate: IsoDate | null;
  /** histTeamCount[t] */
  readonly histCount: number;
}

/**
 * Tupla de coste de cinco componentes para un candidato EQUIPO. El orden
 * está fijado por docs/algoritmo.md, paso 7: no se reordena ni se añaden
 * componentes.
 */
export function teamCost(input: TeamCostInput): CostTuple {
  return [
    input.monthCount,
    input.typeCountSoFar,
    -daysSince(input.lastTypeDate, input.date),
    input.histCount,
    stableHash(input.seed, input.teamId, input.date, input.typeKey),
  ];
}

/** Etiquetas en español de cada componente, en el mismo orden que teamCost. */
export const TEAM_COST_LABELS: readonly string[] = [
  'Veces este mes',
  'Veces en esta responsabilidad',
  'Antigüedad en la responsabilidad',
  'Veces en el historial',
  'Desempate',
];
