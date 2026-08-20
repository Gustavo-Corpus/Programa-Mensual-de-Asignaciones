import { describe, expect, it } from 'vitest';
import {
  aplicarBloqueo,
  aplicarEdicion,
  duplicadosPorFecha,
  type CasillaRef,
  type Catalogo,
} from '@/services/programService';
import type { ProgramDocument } from '@/data/types';

// Reglas de la edición manual. Se prueban sobre las funciones puras: la
// escritura en Firestore es un detalle de transporte, la regla de negocio no.

const SIN_RESTRICCIONES = {
  groupId: null,
  role: 'MEMBER',
  allowedTypeKeys: null,
  blockedDaysOfWeek: [],
} as const;

const catalogo: Catalogo = {
  assignmentTypes: [
    { id: 't1', key: 'entrada', label: 'Entrada', kind: 'PERSON', daysOfWeek: [1], slotsPerDate: 1, order: 1, icon: 'person', active: true },
    { id: 't5', key: 'aseo', label: 'Aseo', kind: 'GROUP', daysOfWeek: [1], slotsPerDate: 1, order: 5, icon: 'broom', active: true },
  ],
  people: [
    { id: 'p1', name: 'Ana Ruiz', active: true, ...SIN_RESTRICCIONES },
    { id: 'p2', name: 'Beto Sosa', active: true, ...SIN_RESTRICCIONES },
    { id: 'p3', name: 'Caro Diez', active: false, ...SIN_RESTRICCIONES },
  ],
  teams: [
    { id: 'e1', displayName: null, order: 1, active: true },
    { id: 'e2', displayName: 'Equipo Norte', order: 2, active: true },
  ],
  groups: [
    { id: 'g1', name: '1', teamId: 'e1', order: 1, active: true },
    { id: 'g5', name: '5', teamId: 'e1', order: 2, active: true },
  ],
  settings: {
    historyWindowMonths: 6,
    allowMultiplePerDay: false,
    allowTeamTwiceSameDate: false,
    runRepairPass: true,
    maxRepairIterations: 200,
    captainRule: { enabled: false, sourceTypeKey: '', targetTypeKeys: [] },
  },
};

function programa(): ProgramDocument {
  return {
    id: '2026-09',
    year: 2026,
    month: 9,
    status: 'DRAFT',
    seed: 202609,
    settingsSnapshot: catalogo.settings,
    warnings: [],
    createdAt: 0,
    updatedAt: 0,
    dates: [
      {
        date: '2026-09-07',
        dayOfWeek: 1,
        order: 0,
        assignments: [
          { typeKey: 'entrada', slotIndex: 0, kind: 'PERSON', personId: 'p1', personName: 'Ana Ruiz', teamId: null, teamLabel: null, locked: false, unfilledReason: null },
          { typeKey: 'aseo', slotIndex: 0, kind: 'GROUP', personId: null, personName: null, teamId: 'e1', teamLabel: 'Grupos 1 y 5', locked: false, unfilledReason: null },
        ],
      },
      {
        date: '2026-09-14',
        dayOfWeek: 1,
        order: 1,
        assignments: [
          { typeKey: 'entrada', slotIndex: 0, kind: 'PERSON', personId: 'p2', personName: 'Beto Sosa', teamId: null, teamLabel: null, locked: true, unfilledReason: null },
          { typeKey: 'aseo', slotIndex: 0, kind: 'GROUP', personId: null, personName: null, teamId: 'e2', teamLabel: 'Equipo Norte', locked: false, unfilledReason: null },
        ],
      },
    ],
  };
}

const refEntrada7: CasillaRef = { date: '2026-09-07', typeKey: 'entrada', slotIndex: 0 };
const refAseo7: CasillaRef = { date: '2026-09-07', typeKey: 'aseo', slotIndex: 0 };

function casilla(dates: ProgramDocument['dates'], ref: CasillaRef) {
  return dates
    .find((d) => d.date === ref.date)
    ?.assignments.find((a) => a.typeKey === ref.typeKey && a.slotIndex === ref.slotIndex);
}

describe('aplicarEdicion', () => {
  it('asignar a mano BLOQUEA la casilla', () => {
    // Sin esto, el cambio del administrador desaparecería al regenerar.
    const dates = aplicarEdicion(programa(), catalogo, refEntrada7, 'p2');
    const c = casilla(dates, refEntrada7);
    expect(c?.personId).toBe('p2');
    expect(c?.personName).toBe('Beto Sosa');
    expect(c?.locked).toBe(true);
    expect(c?.unfilledReason).toBeNull();
  });

  it('vaciar una casilla la DESbloquea, para que el algoritmo la recupere', () => {
    const dates = aplicarEdicion(programa(), catalogo, refEntrada7, null);
    const c = casilla(dates, refEntrada7);
    expect(c?.personId).toBeNull();
    expect(c?.personName).toBeNull();
    expect(c?.locked).toBe(false);
    expect(c?.unfilledReason).toBe('NO_ELIGIBLE_CANDIDATE');
  });

  it('denormaliza el nombre en el momento de editar', () => {
    const dates = aplicarEdicion(programa(), catalogo, refEntrada7, 'p3');
    expect(casilla(dates, refEntrada7)?.personName).toBe('Caro Diez');
  });

  it('un equipo guarda su texto completo, con prefijo', () => {
    const dates = aplicarEdicion(programa(), catalogo, refAseo7, 'e1');
    expect(casilla(dates, refAseo7)?.teamLabel).toBe('Grupos 1 y 5');
  });

  it('un equipo con nombre propio se guarda sin prefijo', () => {
    const dates = aplicarEdicion(programa(), catalogo, refAseo7, 'e2');
    expect(casilla(dates, refAseo7)?.teamLabel).toBe('Equipo Norte');
  });

  it('una casilla de persona nunca queda con datos de equipo, ni al revés', () => {
    const persona = casilla(aplicarEdicion(programa(), catalogo, refEntrada7, 'p2'), refEntrada7);
    expect(persona?.teamId).toBeNull();
    expect(persona?.teamLabel).toBeNull();

    const equipo = casilla(aplicarEdicion(programa(), catalogo, refAseo7, 'e1'), refAseo7);
    expect(equipo?.personId).toBeNull();
    expect(equipo?.personName).toBeNull();
  });

  it('un id inexistente vacía la casilla en vez de guardar una referencia rota', () => {
    const dates = aplicarEdicion(programa(), catalogo, refEntrada7, 'fantasma');
    const c = casilla(dates, refEntrada7);
    expect(c?.personId).toBeNull();
    expect(c?.personName).toBeNull();
  });

  it('no toca ninguna otra casilla ni ninguna otra fecha', () => {
    const antes = programa();
    const dates = aplicarEdicion(antes, catalogo, refEntrada7, 'p2');
    expect(casilla(dates, refAseo7)).toEqual(casilla(antes.dates, refAseo7));
    expect(dates[1]).toEqual(antes.dates[1]);
  });

  it('no muta el programa original', () => {
    const original = programa();
    const copia = JSON.parse(JSON.stringify(original)) as ProgramDocument;
    aplicarEdicion(original, catalogo, refEntrada7, 'p2');
    expect(original).toEqual(copia);
  });
});

describe('aplicarBloqueo', () => {
  it('alterna el candado sin cambiar quién ocupa la casilla', () => {
    const p = programa();
    const bloqueada = aplicarBloqueo(p, refEntrada7);
    expect(casilla(bloqueada, refEntrada7)?.locked).toBe(true);
    expect(casilla(bloqueada, refEntrada7)?.personId).toBe('p1');

    const liberada = aplicarBloqueo({ ...p, dates: bloqueada }, refEntrada7);
    expect(casilla(liberada, refEntrada7)?.locked).toBe(false);
    expect(casilla(liberada, refEntrada7)?.personId).toBe('p1');
  });
});

describe('duplicadosPorFecha', () => {
  it('no ve duplicados en un programa recién generado', () => {
    expect(duplicadosPorFecha(programa()).size).toBe(0);
  });

  it('detecta a la misma persona dos veces el mismo día', () => {
    const p = programa();
    const conDuplicado: ProgramDocument = {
      ...p,
      dates: [
        {
          ...p.dates[0]!,
          assignments: [
            ...p.dates[0]!.assignments,
            { typeKey: 'entrada', slotIndex: 1, kind: 'PERSON', personId: 'p1', personName: 'Ana Ruiz', teamId: null, teamLabel: null, locked: true, unfilledReason: null },
          ],
        },
        ...p.dates.slice(1),
      ],
    };
    const dup = duplicadosPorFecha(conDuplicado);
    expect(dup.get('2026-09-07')).toEqual(new Set(['p1']));
  });

  it('no cuenta como duplicadas las casillas vacías', () => {
    const p = programa();
    const conVacias: ProgramDocument = {
      ...p,
      dates: [
        {
          ...p.dates[0]!,
          assignments: p.dates[0]!.assignments.map((a) => ({
            ...a,
            personId: null,
            personName: null,
            teamId: null,
            teamLabel: null,
          })),
        },
      ],
    };
    expect(duplicadosPorFecha(conVacias).size).toBe(0);
  });
});
