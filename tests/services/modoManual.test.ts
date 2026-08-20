import { describe, expect, it } from 'vitest';
import {
  aplicarVaciado,
  claveCasilla,
  infraccionesDeRestriccion,
  resumenReparto,
  type Catalogo,
} from '@/services/programService';
import { buildEmptyProgram } from '@/domain/emptyProgram';
import type { ProgramDocument } from '@/data/types';
import type { AssignmentType, GenerationSettings, Person } from '@/domain/types';

// El modo manual: vaciar el mes, empezarlo en blanco y ver de un vistazo a
// quién le falta. Se prueba sobre las funciones puras — quién escribe en
// Firestore es un detalle de transporte, no una regla.

const SIN_RESTRICCIONES = {
  groupId: null,
  role: 'MEMBER',
  allowedTypeKeys: null,
  blockedDaysOfWeek: [],
} as const satisfies Omit<Person, 'id' | 'name' | 'active'>;

const tipos: AssignmentType[] = [
  { id: 't1', key: 'entrada', label: 'Entrada', kind: 'PERSON', daysOfWeek: [1, 6], slotsPerDate: 1, order: 1, icon: 'person', active: true },
  { id: 't2', key: 'auditorio', label: 'Auditorio', kind: 'PERSON', daysOfWeek: [1, 6], slotsPerDate: 1, order: 2, icon: 'person', active: true },
  { id: 't5', key: 'aseo', label: 'Aseo', kind: 'GROUP', daysOfWeek: [1, 6], slotsPerDate: 1, order: 5, icon: 'broom', active: true },
];

const settings: GenerationSettings = {
  historyWindowMonths: 6,
  allowMultiplePerDay: false,
  allowTeamTwiceSameDate: false,
  runRepairPass: true,
  maxRepairIterations: 200,
  captainRule: {
    enabled: true,
    sourceTypeKey: 'aseo',
    targetTypeKeys: ['entrada', 'auditorio'],
  },
};

const catalogo: Catalogo = {
  assignmentTypes: tipos,
  people: [
    // Capitán y auxiliar del equipo e1 (grupos 1 y 5).
    { id: 'cap1', name: 'Cap Uno', active: true, ...SIN_RESTRICCIONES, groupId: 'g1', role: 'CAPTAIN' },
    { id: 'aux5', name: 'Aux Cinco', active: true, ...SIN_RESTRICCIONES, groupId: 'g5', role: 'ASSISTANT' },
    // Mayor: solo auditorio.
    { id: 'mayor', name: 'Mayor', active: true, ...SIN_RESTRICCIONES, allowedTypeKeys: ['auditorio'] },
    // No sirve los sábados.
    { id: 'nosab', name: 'Sin Sábados', active: true, ...SIN_RESTRICCIONES, blockedDaysOfWeek: [6] },
    { id: 'libre', name: 'Libre', active: true, ...SIN_RESTRICCIONES },
    { id: 'baja', name: 'De Baja', active: false, ...SIN_RESTRICCIONES },
  ],
  teams: [
    { id: 'e1', displayName: null, order: 1, active: true },
    { id: 'e2', displayName: null, order: 2, active: true },
  ],
  groups: [
    { id: 'g1', name: '1', teamId: 'e1', order: 1, active: true },
    { id: 'g5', name: '5', teamId: 'e1', order: 2, active: true },
    { id: 'g2', name: '2', teamId: 'e2', order: 1, active: true },
  ],
  settings,
};

/** Lunes 7 y sábado 12 de septiembre de 2026. */
function programa(): ProgramDocument {
  return {
    id: '2026-09',
    year: 2026,
    month: 9,
    status: 'DRAFT',
    seed: 202609,
    settingsSnapshot: settings,
    warnings: [],
    createdAt: 0,
    updatedAt: 0,
    dates: [
      {
        date: '2026-09-07',
        dayOfWeek: 1,
        order: 0,
        assignments: [
          { typeKey: 'entrada', slotIndex: 0, kind: 'PERSON', personId: 'cap1', personName: 'Cap Uno', teamId: null, teamLabel: null, locked: false, unfilledReason: null },
          { typeKey: 'auditorio', slotIndex: 0, kind: 'PERSON', personId: 'aux5', personName: 'Aux Cinco', teamId: null, teamLabel: null, locked: true, unfilledReason: null },
          { typeKey: 'aseo', slotIndex: 0, kind: 'GROUP', personId: null, personName: null, teamId: 'e1', teamLabel: 'Grupos 1 y 5', locked: false, unfilledReason: null },
        ],
      },
      {
        date: '2026-09-12',
        dayOfWeek: 6,
        order: 1,
        assignments: [
          { typeKey: 'entrada', slotIndex: 0, kind: 'PERSON', personId: 'cap1', personName: 'Cap Uno', teamId: null, teamLabel: null, locked: false, unfilledReason: null },
          { typeKey: 'auditorio', slotIndex: 0, kind: 'PERSON', personId: null, personName: null, teamId: null, teamLabel: null, locked: false, unfilledReason: 'NO_ELIGIBLE_CANDIDATE' },
          { typeKey: 'aseo', slotIndex: 0, kind: 'GROUP', personId: null, personName: null, teamId: 'e1', teamLabel: 'Grupos 1 y 5', locked: false, unfilledReason: null },
        ],
      },
    ],
  };
}

function casilla(doc: ProgramDocument['dates'], date: string, typeKey: string) {
  return doc.find((d) => d.date === date)?.assignments.find((a) => a.typeKey === typeKey);
}

describe('aplicarVaciado', () => {
  it('vacía las casillas libres y deja intactas las bloqueadas', () => {
    const dates = aplicarVaciado(programa());

    const bloqueada = casilla(dates, '2026-09-07', 'auditorio');
    expect(bloqueada?.personId).toBe('aux5');
    expect(bloqueada?.personName).toBe('Aux Cinco');
    expect(bloqueada?.locked).toBe(true);

    const libre = casilla(dates, '2026-09-07', 'entrada');
    expect(libre?.personId).toBeNull();
    expect(libre?.personName).toBeNull();
    expect(libre?.locked).toBe(false);
  });

  it('vacía también los equipos, no solo las personas', () => {
    const dates = aplicarVaciado(programa());
    const aseo = casilla(dates, '2026-09-07', 'aseo');
    expect(aseo?.teamId).toBeNull();
    expect(aseo?.teamLabel).toBeNull();
  });

  // Una casilla vacía a propósito no es un hueco que el algoritmo no supo
  // cubrir, y la pantalla no debe avisar de ella como si lo fuera.
  it('marca lo vaciado como MANUALLY_CLEARED, no como falta de candidatos', () => {
    const dates = aplicarVaciado(programa());
    expect(casilla(dates, '2026-09-07', 'entrada')?.unfilledReason).toBe('MANUALLY_CLEARED');
    expect(casilla(dates, '2026-09-07', 'aseo')?.unfilledReason).toBe('MANUALLY_CLEARED');
  });

  it('no muta el programa original', () => {
    const original = programa();
    aplicarVaciado(original);
    expect(casilla(original.dates, '2026-09-07', 'entrada')?.personId).toBe('cap1');
  });

  it('vaciar dos veces da lo mismo que vaciar una', () => {
    const unaVez = aplicarVaciado(programa());
    const dosVeces = aplicarVaciado({ ...programa(), dates: unaVez });
    expect(JSON.stringify(dosVeces)).toBe(JSON.stringify(unaVez));
  });
});

describe('buildEmptyProgram', () => {
  it('produce las mismas fechas y casillas que generaría el algoritmo, todas vacías', () => {
    const out = buildEmptyProgram({ year: 2026, month: 9, assignmentTypes: tipos });

    // Septiembre de 2026: 4 lunes y 4 sábados.
    expect(out.dates.map((d) => d.date)).toEqual([
      '2026-09-05',
      '2026-09-07',
      '2026-09-12',
      '2026-09-14',
      '2026-09-19',
      '2026-09-21',
      '2026-09-26',
      '2026-09-28',
    ]);
    expect(out.assignments).toHaveLength(8 * 3);
    expect(out.assignments.every((a) => a.personId === null && a.teamId === null)).toBe(true);
    expect(out.assignments.every((a) => a.unfilledReason === 'MANUALLY_CLEARED')).toBe(true);
    expect(out.assignments.every((a) => !a.locked)).toBe(true);
  });

  it('respeta los días de cada responsabilidad: un tipo de solo sábado no aparece en lunes', () => {
    const soloSabado: AssignmentType[] = [
      { ...tipos[0]!, key: 'hospitalidad', daysOfWeek: [6] },
    ];
    const out = buildEmptyProgram({ year: 2026, month: 9, assignmentTypes: soloSabado });
    expect(out.dates).toHaveLength(4);
    expect(out.assignments).toHaveLength(4);
  });
});

describe('resumenReparto', () => {
  it('cuenta lo que hay ahora mismo en el mes, venga de donde venga', () => {
    const resumen = resumenReparto(programa(), catalogo);
    const porId = new Map(resumen.personas.map((p) => [p.id, p]));

    expect(porId.get('cap1')?.veces).toBe(2);
    expect(porId.get('aux5')?.veces).toBe(1);
    expect(porId.get('libre')?.veces).toBe(0);
    expect(porId.get('e1' as never)).toBeUndefined();

    const equipos = new Map(resumen.equipos.map((t) => [t.id, t]));
    expect(equipos.get('e1')?.veces).toBe(2);
    expect(equipos.get('e2')?.veces).toBe(0);
  });

  // Quien falta es justo a quien hay que ver, así que va primero.
  it('ordena de menos a más asignaciones, y a igualdad por nombre', () => {
    const resumen = resumenReparto(programa(), catalogo);
    const veces = resumen.personas.map((p) => p.veces);
    expect([...veces].sort((a, b) => a - b)).toEqual(veces);

    const aCero = resumen.personas.filter((p) => p.veces === 0).map((p) => p.nombre);
    expect([...aCero].sort()).toEqual(aCero);
  });

  it('incluye a todas las personas activas aunque estén a cero, y excluye a las inactivas sin asignación', () => {
    const resumen = resumenReparto(programa(), catalogo);
    const ids = resumen.personas.map((p) => p.id);
    expect(ids).toContain('libre');
    expect(ids).toContain('mayor');
    expect(ids).not.toContain('baja');
  });

  it('desglosa por responsabilidad, para ver de qué le toca a cada quien', () => {
    const resumen = resumenReparto(programa(), catalogo);
    const cap1 = resumen.personas.find((p) => p.id === 'cap1');
    expect(cap1?.porTipo.get('entrada')).toBe(2);
    expect(cap1?.porTipo.get('auditorio')).toBeUndefined();
  });

  it('cuenta las casillas por cubrir', () => {
    const resumen = resumenReparto(programa(), catalogo);
    expect(resumen.casillasPersona).toBe(4);
    expect(resumen.casillasEquipo).toBe(2);
    expect(resumen.sinCubrir).toBe(1);
  });

  it('tras vaciar, todo el mundo queda a cero salvo lo bloqueado', () => {
    const vaciado = { ...programa(), dates: aplicarVaciado(programa()) };
    const resumen = resumenReparto(vaciado, catalogo);
    const porId = new Map(resumen.personas.map((p) => [p.id, p]));

    expect(porId.get('cap1')?.veces).toBe(0);
    expect(porId.get('aux5')?.veces).toBe(1); // seguía bloqueada
    expect(resumen.sinCubrir).toBe(5);
  });
});

describe('infraccionesDeRestriccion', () => {
  /** Coloca a `personId` en una casilla concreta, como haría una edición a mano. */
  function con(date: string, typeKey: string, personId: string): ProgramDocument {
    const base = programa();
    return {
      ...base,
      dates: base.dates.map((d) =>
        d.date !== date
          ? d
          : {
              ...d,
              assignments: d.assignments.map((a) =>
                a.typeKey === typeKey ? { ...a, personId, personName: personId } : a,
              ),
            },
      ),
    };
  }

  it('el programa coherente no produce ninguna infracción', () => {
    // cap1 y aux5 son la reserva de e1, que es quien limpia ambos días.
    expect(infraccionesDeRestriccion(programa(), catalogo).size).toBe(0);
  });

  it('detecta una responsabilidad vetada', () => {
    const doc = con('2026-09-07', 'entrada', 'mayor');
    const infracciones = infraccionesDeRestriccion(doc, catalogo);
    const clave = claveCasilla({ date: '2026-09-07', typeKey: 'entrada', slotIndex: 0 });
    expect(infracciones.get(clave)?.motivo).toBe('TYPE_NOT_ALLOWED');
  });

  it('detecta un día vetado', () => {
    const doc = con('2026-09-12', 'auditorio', 'nosab');
    const infracciones = infraccionesDeRestriccion(doc, catalogo);
    const clave = claveCasilla({ date: '2026-09-12', typeKey: 'auditorio', slotIndex: 0 });
    expect(infracciones.get(clave)?.motivo).toBe('DAY_BLOCKED');
  });

  it('detecta a alguien fuera de la reserva de capitanes del día', () => {
    const doc = con('2026-09-07', 'entrada', 'libre');
    const infracciones = infraccionesDeRestriccion(doc, catalogo);
    const clave = claveCasilla({ date: '2026-09-07', typeKey: 'entrada', slotIndex: 0 });
    expect(infracciones.get(clave)?.motivo).toBe('NOT_IN_CAPTAIN_POOL');
  });

  // El día se compone leyendo el propio programa: si cambia el equipo de
  // aseo, cambia quién es válido en entrada y auditorio.
  it('la reserva sale del equipo que figura AHORA en la casilla de aseo', () => {
    const otroEquipo: ProgramDocument = (() => {
      const base = programa();
      return {
        ...base,
        dates: base.dates.map((d) =>
          d.date !== '2026-09-07'
            ? d
            : {
                ...d,
                assignments: d.assignments.map((a) =>
                  a.typeKey === 'aseo' ? { ...a, teamId: 'e2', teamLabel: 'Grupos 2' } : a,
                ),
              },
        ),
      };
    })();

    const infracciones = infraccionesDeRestriccion(otroEquipo, catalogo);
    // cap1 y aux5 son de e1; ahora limpia e2, así que ambos sobran.
    expect(infracciones.size).toBe(2);
    expect(
      [...infracciones.values()].every((i) => i.motivo === 'NOT_IN_CAPTAIN_POOL'),
    ).toBe(true);
  });

  it('con la regla apagada, la reserva deja de importar y solo quedan las restricciones personales', () => {
    const sinRegla: Catalogo = {
      ...catalogo,
      settings: { ...settings, captainRule: { enabled: false, sourceTypeKey: '', targetTypeKeys: [] } },
    };
    const doc = con('2026-09-07', 'entrada', 'libre');
    expect(infraccionesDeRestriccion(doc, sinRegla).size).toBe(0);
  });

  it('una casilla vacía no infringe nada', () => {
    const infracciones = infraccionesDeRestriccion(
      { ...programa(), dates: aplicarVaciado(programa()) },
      catalogo,
    );
    expect(infracciones.size).toBe(0);
  });
});
