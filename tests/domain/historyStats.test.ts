import { describe, expect, it } from 'vitest';
import { computeHistoryStats, type HistoryStatsInput } from '../../src/domain/historyStats';
import { computeLoadTarget } from '../../src/domain/stats';
import type { AssignmentType, Group, HistoricalAssignment, Person, Team } from '../../src/domain/types';

// ---------------------------------------------------------------------------
// Fixtures compartidos: dos tipos de persona, un tipo de equipo, tres
// personas, dos equipos de dos grupos cada uno. Deliberadamente pequeño para
// que cada test pueda razonar el resultado a mano.
// ---------------------------------------------------------------------------

const TYPES: AssignmentType[] = [
  {
    id: 't1',
    key: 'acomodador_entrada',
    label: 'Acomodador de entrada',
    kind: 'PERSON',
    daysOfWeek: [1, 6],
    slotsPerDate: 1,
    order: 1,
    icon: 'person',
    active: true,
  },
  {
    id: 't2',
    key: 'pasillo_izquierdo',
    label: 'Pasillo izquierdo',
    kind: 'PERSON',
    daysOfWeek: [1, 6],
    slotsPerDate: 1,
    order: 2,
    icon: 'arrow-left',
    active: true,
  },
  {
    id: 't3',
    key: 'aseo',
    label: 'Aseo',
    kind: 'GROUP',
    daysOfWeek: [1, 6],
    slotsPerDate: 2,
    order: 3,
    icon: 'broom',
    active: true,
  },
];

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Ana', active: true },
  { id: 'p2', name: 'Beto', active: true },
  { id: 'p3', name: 'Cira', active: false },
];

const GROUPS: Group[] = [
  { id: 'g1', name: '1', teamId: 'eq1', order: 1, active: true },
  { id: 'g2', name: '5', teamId: 'eq1', order: 2, active: true },
  { id: 'g3', name: '2', teamId: 'eq2', order: 1, active: true },
  { id: 'g4', name: '6', teamId: 'eq2', order: 2, active: true },
];

const TEAMS: Team[] = [
  { id: 'eq1', displayName: null, order: 1, active: true },
  { id: 'eq2', displayName: null, order: 2, active: false },
];

function baseInput(overrides: Partial<HistoryStatsInput> = {}): HistoryStatsInput {
  return {
    people: PEOPLE,
    teams: TEAMS,
    groups: GROUPS,
    assignmentTypes: TYPES,
    history: [],
    monthsInWindow: [],
    ...overrides,
  };
}

function h(overrides: Partial<HistoricalAssignment>): HistoricalAssignment {
  return {
    date: '2026-06-01',
    typeKey: 'acomodador_entrada',
    kind: 'PERSON',
    personId: 'p1',
    teamId: null,
    ...overrides,
  };
}

describe('computeHistoryStats — casos básicos', () => {
  it('cuenta el total y el desglose por tipo de una persona', () => {
    const output = computeHistoryStats(
      baseInput({
        history: [
          h({ date: '2026-06-01', typeKey: 'acomodador_entrada', personId: 'p1' }),
          h({ date: '2026-06-06', typeKey: 'pasillo_izquierdo', personId: 'p1' }),
          h({ date: '2026-07-04', typeKey: 'acomodador_entrada', personId: 'p1' }),
        ],
        monthsInWindow: ['2026-06', '2026-07'],
      })
    );

    const ana = output.people.find((p) => p.id === 'p1');
    expect(ana?.total).toBe(3);
    expect(ana?.byType).toEqual({ acomodador_entrada: 2, pasillo_izquierdo: 1 });
    expect(ana?.lastAssignedDate).toBe('2026-07-04');
    expect(ana?.label).toBe('Ana');
  });

  it('una persona activa sin ninguna asignación en la ventana sigue apareciendo, con 0', () => {
    const output = computeHistoryStats(
      baseInput({
        history: [h({ personId: 'p1' })],
        monthsInWindow: ['2026-06'],
      })
    );

    const beto = output.people.find((p) => p.id === 'p2');
    expect(beto).toBeDefined();
    expect(beto?.total).toBe(0);
    expect(beto?.byType).toEqual({ acomodador_entrada: 0, pasillo_izquierdo: 0 });
  });

  it('usa teamDisplayText para la etiqueta de equipo, no la construye a mano', () => {
    const output = computeHistoryStats(
      baseInput({
        history: [h({ kind: 'GROUP', typeKey: 'aseo', personId: null, teamId: 'eq1' })],
        monthsInWindow: ['2026-06'],
      })
    );

    const eq1 = output.teams.find((t) => t.id === 'eq1');
    expect(eq1?.label).toBe('Grupos 1 y 5');
  });

  it('reutiliza computeLoadTarget: la meta de la pantalla coincide con la del algoritmo', () => {
    const history = [
      h({ date: '2026-06-01', personId: 'p1' }),
      h({ date: '2026-06-06', personId: 'p2' }),
      h({ date: '2026-06-08', personId: 'p1' }),
    ];
    const output = computeHistoryStats(baseInput({ history, monthsInWindow: ['2026-06'] }));

    // 3 asignaciones PERSON en la ventana, 2 personas activas.
    expect(output.summary.personTarget).toEqual(computeLoadTarget(3, 2));
  });
});

describe('computeHistoryStats — casos límite', () => {
  it('sin programas guardados: no revienta y la meta sale en ceros', () => {
    const output = computeHistoryStats(baseInput());

    expect(output.summary.monthsInWindow).toEqual([]);
    expect(output.summary.personAssignmentsCount).toBe(0);
    expect(output.summary.personTarget).toEqual({ base: 0, remainder: 0, cap: 0 });
    expect(output.people).toHaveLength(2); // p1, p2 activas; p3 inactiva no entra aquí
  });

  it('cero personas activas: no revienta, meta en ceros y hay una alerta informativa', () => {
    const output = computeHistoryStats(
      baseInput({ people: [{ id: 'p1', name: 'Ana', active: false }] })
    );

    expect(output.people).toEqual([]);
    expect(output.summary.personTarget).toEqual({ base: 0, remainder: 0, cap: 0 });
    expect(output.alerts.some((a) => a.message.includes('No hay personas activas'))).toBe(true);
  });

  it('id de persona en el historial que ya no existe en el catálogo: no revienta, se cuenta aparte', () => {
    const output = computeHistoryStats(
      baseInput({
        history: [h({ personId: 'fantasma' }), h({ personId: 'fantasma' }), h({ personId: 'p1' })],
        monthsInWindow: ['2026-06'],
      })
    );

    expect(output.orphanPeople).toEqual([{ id: 'fantasma', assignmentCount: 2 }]);
    expect(output.people.find((p) => p.id === 'p1')?.total).toBe(1);
    // Las asignaciones huérfanas SÍ cuentan en el total de la ventana (son
    // casillas reales que se cubrieron), aunque no en la fila de nadie.
    expect(output.summary.personAssignmentsCount).toBe(3);
  });

  it('id de equipo en el historial que ya no existe en el catálogo: igual, para equipos', () => {
    const output = computeHistoryStats(
      baseInput({
        history: [h({ kind: 'GROUP', typeKey: 'aseo', personId: null, teamId: 'fantasma' })],
        monthsInWindow: ['2026-06'],
      })
    );

    expect(output.orphanTeams).toEqual([{ id: 'fantasma', assignmentCount: 1 }]);
  });

  it('persona inactiva que aparece en el historial: se reporta aparte, no en la tabla principal', () => {
    const output = computeHistoryStats(
      baseInput({
        history: [h({ personId: 'p3' })], // p3 está inactiva
        monthsInWindow: ['2026-06'],
      })
    );

    expect(output.people.some((p) => p.id === 'p3')).toBe(false);
    expect(output.inactivePeopleInHistory).toHaveLength(1);
    expect(output.inactivePeopleInHistory[0]?.label).toBe('Cira');
    expect(output.alerts.some((a) => a.message.includes('persona inactiva'))).toBe(true);
  });

  it('cero equipos activos: la tabla de equipos sale vacía sin reventar', () => {
    const output = computeHistoryStats(
      baseInput({ teams: TEAMS.map((t) => ({ ...t, active: false })) })
    );
    expect(output.teams).toEqual([]);
  });
});

describe('computeHistoryStats — alertas', () => {
  it('persona activa con 0 asignaciones dispara una alerta accionable', () => {
    const output = computeHistoryStats(
      baseInput({ history: [h({ personId: 'p1' })], monthsInWindow: ['2026-06'] })
    );

    const alerta = output.alerts.find((a) => a.message.includes('Beto'));
    expect(alerta).toBeDefined();
    expect(alerta?.severity).toBe('warning');
  });

  it('diferencia mayor que 1 entre el máximo y el mínimo activo dispara alerta', () => {
    const history = [
      h({ date: '2026-06-01', personId: 'p1' }),
      h({ date: '2026-06-06', personId: 'p1' }),
      h({ date: '2026-06-08', personId: 'p1' }),
    ];
    const output = computeHistoryStats(baseInput({ history, monthsInWindow: ['2026-06'] }));

    const alerta = output.alerts.find((a) => a.message.includes('no está pareja'));
    expect(alerta).toBeDefined();
    expect(alerta?.message).toContain('Ana');
    expect(alerta?.message).toContain('Beto');
  });

  it('diferencia de 1 o menos NO dispara la alerta de reparto desigual', () => {
    const history = [
      h({ date: '2026-06-01', personId: 'p1' }),
      h({ date: '2026-06-06', personId: 'p1' }),
      h({ date: '2026-06-08', personId: 'p2' }),
    ];
    const output = computeHistoryStats(baseInput({ history, monthsInWindow: ['2026-06'] }));

    expect(output.alerts.some((a) => a.message.includes('no está pareja'))).toBe(false);
  });

  it('persona activa que nunca ha hecho un tipo concreto (pero sí tiene otras asignaciones) dispara alerta de rotación', () => {
    const history = [
      h({ date: '2026-06-01', typeKey: 'acomodador_entrada', personId: 'p1' }),
      h({ date: '2026-06-06', typeKey: 'acomodador_entrada', personId: 'p2' }),
    ];
    const output = computeHistoryStats(baseInput({ history, monthsInWindow: ['2026-06'] }));

    // Ana nunca ha hecho "Pasillo izquierdo": debe mencionarse por su label.
    expect(
      output.alerts.some(
        (a) => a.message.includes('Ana nunca ha hecho') && a.message.includes('Pasillo izquierdo')
      )
    ).toBe(true);
  });

  it('no repite la alerta de rotación para quien ya está en la alerta de 0 asignaciones', () => {
    const output = computeHistoryStats(
      baseInput({ history: [h({ personId: 'p1' })], monthsInWindow: ['2026-06'] })
    );

    // Beto tiene total 0: no debe generar además un "Beto nunca ha hecho...".
    expect(output.alerts.some((a) => a.message.startsWith('Beto nunca ha hecho'))).toBe(false);
  });

  it('sin ningún desequilibrio, hay una única alerta afirmativa', () => {
    // Un solo equipo activo (eq1) para que su meta sea trivialmente 1 = 1 y no
    // dispare ninguna alerta de equipo; ambas personas activas cubren ambos
    // tipos y quedan parejas en total.
    const history = [
      h({ date: '2026-06-01', typeKey: 'acomodador_entrada', personId: 'p1' }),
      h({ date: '2026-06-01', typeKey: 'pasillo_izquierdo', personId: 'p2' }),
      h({ date: '2026-06-08', typeKey: 'pasillo_izquierdo', personId: 'p1' }),
      h({ date: '2026-06-08', typeKey: 'acomodador_entrada', personId: 'p2' }),
      h({ date: '2026-06-01', kind: 'GROUP', typeKey: 'aseo', personId: null, teamId: 'eq1' }),
    ];
    const output = computeHistoryStats(baseInput({ history, monthsInWindow: ['2026-06'] }));

    expect(output.alerts).toEqual([
      {
        severity: 'info',
        message:
          'La distribución está equilibrada: nadie activo se ha quedado sin asignaciones, la diferencia ' +
          'entre quien más y quien menos ha servido no supera 1, y todas las responsabilidades activas ' +
          'están cubiertas por todos al menos una vez.',
      },
    ]);
  });
});

describe('computeHistoryStats — determinismo', () => {
  it('el orden de personas/equipos de entrada no cambia el resultado', () => {
    const history = [h({ personId: 'p1' }), h({ kind: 'GROUP', typeKey: 'aseo', personId: null, teamId: 'eq1' })];

    const a = computeHistoryStats(
      baseInput({ history, monthsInWindow: ['2026-06'] })
    );
    const b = computeHistoryStats(
      baseInput({
        people: [...PEOPLE].reverse(),
        teams: [...TEAMS].reverse(),
        history,
        monthsInWindow: ['2026-06'],
      })
    );

    expect(a.people).toEqual(b.people);
    expect(a.teams).toEqual(b.teams);
  });
});
