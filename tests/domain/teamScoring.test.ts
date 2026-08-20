import { describe, it, expect } from 'vitest';
import { NEVER_DAYS, compareCandidates } from '../../src/domain/scoring';
import { TEAM_COST_LABELS, rejectTeam, teamCost, type TeamCostInput } from '../../src/domain/teamScoring';

function baseInput(overrides: Partial<TeamCostInput> & Pick<TeamCostInput, 'teamId'>): TeamCostInput {
  return {
    date: '2026-08-08',
    typeKey: 'aseo',
    seed: 1,
    monthCount: 0,
    typeCountSoFar: 0,
    lastTypeDate: null,
    histCount: 0,
    ...overrides,
  };
}

describe('rejectTeam — filtros duros, en el orden de la especificación', () => {
  it('filtro 1: equipo inactivo → INACTIVE', () => {
    const reason = rejectTeam({
      active: false,
      assignedToday: false,
      allowTeamTwiceSameDate: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('INACTIVE');
  });

  it('filtro 2: ya asignado esa fecha y no se permite doble → ALREADY_ASSIGNED_THIS_DATE', () => {
    const reason = rejectTeam({
      active: true,
      assignedToday: true,
      allowTeamTwiceSameDate: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('ALREADY_ASSIGNED_THIS_DATE');
  });

  it('allowTeamTwiceSameDate=true anula el filtro 2 (Aseo e Hospitalidad el mismo sábado)', () => {
    const reason = rejectTeam({
      active: true,
      assignedToday: true,
      allowTeamTwiceSameDate: true,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBeNull();
  });

  it('filtro 3: monthCount alcanza el tope → AT_CAP', () => {
    const reason = rejectTeam({
      active: true,
      assignedToday: false,
      allowTeamTwiceSameDate: false,
      monthCount: 4,
      effectiveCap: 4,
    });
    expect(reason).toBe('AT_CAP');
  });

  it('el filtro 1 se reporta antes que el 2 y el 3', () => {
    const reason = rejectTeam({
      active: false,
      assignedToday: true,
      allowTeamTwiceSameDate: false,
      monthCount: 99,
      effectiveCap: 1,
    });
    expect(reason).toBe('INACTIVE');
  });
});

describe('teamCost — un componente por prueba (5 componentes, sin espaciado)', () => {
  it('tiene exactamente 5 componentes, no 6: no lleva espaciado', () => {
    const cost = teamCost(baseInput({ teamId: 'e1' }));
    expect(cost).toHaveLength(5);
  });

  it('componente 0 (carga del mes): menor monthCount gana', () => {
    const a = teamCost(baseInput({ teamId: 'e1', monthCount: 1 }));
    const b = teamCost(baseInput({ teamId: 'e2', monthCount: 2 }));
    expect(compareCandidates({ id: 'e1', cost: a }, { id: 'e2', cost: b })).toBeLessThan(0);
  });

  it('componente 1 (veces en esta responsabilidad): nunca hecho le gana a hecho una vez hace mucho', () => {
    const nunca = teamCost(baseInput({ teamId: 'nunca', typeCountSoFar: 0, lastTypeDate: null }));
    const haceMucho = teamCost(baseInput({ teamId: 'haceMucho', typeCountSoFar: 1, lastTypeDate: '2020-01-01' }));
    expect(compareCandidates({ id: 'nunca', cost: nunca }, { id: 'haceMucho', cost: haceMucho })).toBeLessThan(0);
  });

  it('componente 2 (antigüedad en la responsabilidad): a igualdad de veces, quien la hizo hace más gana', () => {
    const haceMucho = teamCost(baseInput({ teamId: 'haceMucho', typeCountSoFar: 3, lastTypeDate: '2025-01-01' }));
    const haceRecien = teamCost(baseInput({ teamId: 'haceRecien', typeCountSoFar: 3, lastTypeDate: '2026-08-01' }));
    expect(
      compareCandidates({ id: 'haceMucho', cost: haceMucho }, { id: 'haceRecien', cost: haceRecien })
    ).toBeLessThan(0);
  });

  it('componente 3 (carga histórica): a igualdad de los anteriores, menor histCount gana', () => {
    const a = teamCost(baseInput({ teamId: 'e1', histCount: 1 }));
    const b = teamCost(baseInput({ teamId: 'e2', histCount: 8 }));
    expect(compareCandidates({ id: 'e1', cost: a }, { id: 'e2', cost: b })).toBeLessThan(0);
  });

  it('componente 4 (desempate determinista): decide cuando los cuatro anteriores empatan', () => {
    const a = teamCost(baseInput({ teamId: 'e1' }));
    const b = teamCost(baseInput({ teamId: 'e2' }));
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
    expect(a[3]).toBe(b[3]);
    expect(a[4]).not.toBe(b[4]);
  });

  it('tupla completa en el orden exacto de la especificación', () => {
    const cost = teamCost({
      teamId: 'e4',
      date: '2026-08-15',
      typeKey: 'aseo',
      seed: 20260801,
      monthCount: 3,
      typeCountSoFar: 5,
      lastTypeDate: '2026-08-08',
      histCount: 12,
    });
    expect(cost[0]).toBe(3);
    expect(cost[1]).toBe(5);
    expect(cost[2]).toBe(-7); // -daysSince('2026-08-08','2026-08-15')
    expect(cost[3]).toBe(12);
  });

  it('daysSince nunca se acota fuera de NEVER_DAYS incluso con historial muy viejo', () => {
    const cost = teamCost(baseInput({ teamId: 'e1', lastTypeDate: '2000-01-01' }));
    expect(cost[2]).toBe(-NEVER_DAYS);
  });

  it('costLabelsTeam tiene 5 etiquetas, sin "espaciado"', () => {
    expect(TEAM_COST_LABELS).toEqual([
      'Veces este mes',
      'Veces en esta responsabilidad',
      'Antigüedad en la responsabilidad',
      'Veces en el historial',
      'Desempate',
    ]);
  });
});

describe('compareCandidates aplicado a tuplas de equipo', () => {
  it('desempate final por id cuando las cinco componentes empatan', () => {
    const a = teamCost(baseInput({ teamId: 'e1', seed: 1 }));
    const b = teamCost(baseInput({ teamId: 'e1', seed: 1 })); // mismo id, todo idéntico
    expect(compareCandidates({ id: 'e1', cost: a }, { id: 'e1', cost: b })).toBe(0);
  });
});
