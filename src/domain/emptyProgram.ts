import type { AssignmentType, ProgramDateOut, ResolvedAssignment } from './types';
import { dayOfWeek, toIso } from './dates';
import { buildSlots } from './slots';

// El mes en blanco del modo manual.
//
// Es deliberadamente lo MISMO que produce el generador, menos las decisiones:
// las mismas fechas y las mismas casillas, todas sin ocupante. Así el modo
// manual no es una segunda clase de programa con sus propias reglas, sino el
// mismo objeto con las casillas por rellenar — y todo lo que ya funciona
// encima (edición, candados, PDF, estadísticas, historial) sigue funcionando
// sin enterarse de por dónde llegó.

export interface EmptyProgramInput {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly assignmentTypes: readonly AssignmentType[];
}

export interface EmptyProgramOutput {
  readonly dates: readonly ProgramDateOut[];
  readonly assignments: readonly ResolvedAssignment[];
}

export function buildEmptyProgram(input: EmptyProgramInput): EmptyProgramOutput {
  const { dates: monthDates, slots } = buildSlots(input.year, input.month, input.assignmentTypes);

  const dates: ProgramDateOut[] = monthDates.map((d, order) => ({
    date: toIso(d),
    dayOfWeek: dayOfWeek(d),
    order,
  }));

  const assignments: ResolvedAssignment[] = slots.map((slot) => ({
    date: slot.date,
    typeKey: slot.typeKey,
    slotIndex: slot.slotIndex,
    kind: slot.kind,
    personId: null,
    teamId: null,
    locked: false,
    // Vacía por decisión, no por falta de candidatos: `MANUALLY_CLEARED`
    // impide que la pantalla avise de un hueco que el administrador abrió a
    // propósito.
    unfilledReason: 'MANUALLY_CLEARED',
  }));

  return { dates, assignments };
}
