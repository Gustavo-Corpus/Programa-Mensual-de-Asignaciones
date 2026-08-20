import type { IsoDate } from '../domain/dates';
import type {
  AssignmentKind,
  GenerationSettings,
  UnfilledReason,
  Warning,
} from '../domain/types';

/**
 * Shapes that exist only in Firestore, never in `src/domain/types.ts`.
 *
 * `generateProgram` produces `GenerateOutput` (dates + assignments + stats +
 * trace). What actually gets persisted at `programs/{YYYY-MM}` — per
 * docs/arquitectura.md §8 — is narrower and different: it adds denormalized
 * `personName`/`teamLabel`, and it deliberately leaves out `stats` (derived
 * data, recomputed by whoever needs it — not this layer's job to store
 * business-logic output) and `trace` (lives in its own subdocument,
 * `programs/{YYYY-MM}/meta/trace`, read only when the "¿Por qué?" popover
 * opens).
 */

export type ProgramStatus = 'DRAFT' | 'PUBLISHED';

export interface ProgramAssignmentDoc {
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly kind: AssignmentKind;
  readonly personId: string | null;
  /** Denormalized at save time. A later rename must not change history. */
  readonly personName: string | null;
  readonly teamId: string | null;
  /** Denormalized at save time (e.g. "1 y 5"). Survives group/team edits. */
  readonly teamLabel: string | null;
  readonly locked: boolean;
  readonly unfilledReason: UnfilledReason | null;
}

export interface ProgramDateDoc {
  readonly date: IsoDate;
  readonly dayOfWeek: number;
  readonly order: number;
  readonly assignments: readonly ProgramAssignmentDoc[];
}

export interface ProgramDocument {
  /** Firestore document id, "YYYY-MM". Must match `year`/`month` below. */
  readonly id: string;
  readonly year: number;
  readonly month: number;
  readonly status: ProgramStatus;
  readonly seed: number;
  /** Settings AT GENERATION TIME, not whatever the current global settings are. */
  readonly settingsSnapshot: GenerationSettings;
  readonly warnings: readonly Warning[];
  /** Epoch milliseconds. Converted from/to Firestore `Timestamp` at the edge. */
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly dates: readonly ProgramDateDoc[];
}
