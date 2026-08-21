import { describe, it, expect } from 'vitest';
import {
  NEVER_DAYS,
  PERSON_COST_LABELS,
  PERSON_COST_TOLERANCE,
  compareCandidates,
  orderByVariety,
  daysSince,
  personCost,
  rejectPerson,
  type PersonCostInput,
} from '../../src/domain/scoring';

// Base de un candidato "neutro": todos los componentes en su valor más
// favorable, para poder variar un único componente por prueba y comprobar
// que ese componente por sí solo decide el ganador. Esto es justo lo que
// pide la especificación: "un caso por cada componente de la tupla".
function baseInput(overrides: Partial<PersonCostInput> & Pick<PersonCostInput, 'personId'>): PersonCostInput {
  return {
    date: '2026-08-03',
    typeKey: 'acomodador_entrada',
    seed: 1,
    monthCount: 0,
    typeCountSoFar: 0,
    lastTypeDate: null,
    histCount: 0,
    lastAssignedDate: null,
    ...overrides,
  };
}

describe('rejectPerson — filtros duros, en el orden de la especificación', () => {
  it('filtro 1: persona inactiva → INACTIVE, incluso si el resto es válido', () => {
    const reason = rejectPerson({
      active: false,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('INACTIVE');
  });

  it('filtro 5: ya asignada hoy y no se permite doble asignación → ALREADY_ASSIGNED_THIS_DATE', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: true,
      allowMultiplePerDay: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('ALREADY_ASSIGNED_THIS_DATE');
  });

  it('allowMultiplePerDay=true anula el filtro 5', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: true,
      allowMultiplePerDay: true,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBeNull();
  });

  it('filtro 6: monthCount alcanza el tope → AT_CAP', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 2,
      effectiveCap: 2,
    });
    expect(reason).toBe('AT_CAP');
  });

  it('monthCount por debajo del tope → elegible (null)', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 1,
      effectiveCap: 2,
    });
    expect(reason).toBeNull();
  });

  it('el filtro 1 (INACTIVE) se reporta antes que todos los demás cuando varios fallan a la vez', () => {
    const reason = rejectPerson({
      active: false,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: true,
      allowMultiplePerDay: false,
      monthCount: 99,
      effectiveCap: 1,
    });
    expect(reason).toBe('INACTIVE');
  });

  it('el filtro 5 se reporta antes que el 6 cuando ambos fallan', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: true,
      allowMultiplePerDay: false,
      monthCount: 99,
      effectiveCap: 1,
    });
    expect(reason).toBe('ALREADY_ASSIGNED_THIS_DATE');
  });

  it('filtro 2: el día de la semana está bloqueado para esa persona → DAY_BLOCKED', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: false,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('DAY_BLOCKED');
  });

  it('filtro 3: la responsabilidad no está entre las suyas → TYPE_NOT_ALLOWED', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: false,
      inCaptainPool: null,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('TYPE_NOT_ALLOWED');
  });

  it('filtro 4: la regla de capitanes gobierna la casilla y no está en la reserva → NOT_IN_CAPTAIN_POOL', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: false,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBe('NOT_IN_CAPTAIN_POOL');
  });

  // `null` es "la regla no gobierna esta casilla" y `false` es "la gobierna y
  // esta persona no entra". Si el filtro los confundiera, activar la regla
  // dejaría fuera del reparto todas las responsabilidades que NO gobierna.
  it('inCaptainPool = null no rechaza a nadie: la regla no gobierna esa casilla', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: true,
      inCaptainPool: null,
      assignedToday: false,
      allowMultiplePerDay: false,
      monthCount: 0,
      effectiveCap: 5,
    });
    expect(reason).toBeNull();
  });

  it('las restricciones personales se reportan antes que el cupo del mes', () => {
    const reason = rejectPerson({
      active: true,
      dayAllowed: true,
      typeAllowed: false,
      inCaptainPool: null,
      assignedToday: true,
      allowMultiplePerDay: false,
      monthCount: 99,
      effectiveCap: 1,
    });
    expect(reason).toBe('TYPE_NOT_ALLOWED');
  });
});

describe('daysSince', () => {
  it('null (nunca) se mapea a NEVER_DAYS', () => {
    expect(daysSince(null, '2026-08-03')).toBe(NEVER_DAYS);
  });

  it('calcula la diferencia real cuando hay una fecha', () => {
    expect(daysSince('2026-08-01', '2026-08-08')).toBe(7);
  });

  it('se acota en NEVER_DAYS aunque la diferencia real sea mayor', () => {
    expect(daysSince('2000-01-01', '2026-08-03')).toBe(NEVER_DAYS);
  });
});

describe('personCost — un componente por prueba', () => {
  it('componente 0 (carga del mes): menor monthCount gana', () => {
    const a = personCost(baseInput({ personId: 'a', monthCount: 0 }));
    const b = personCost(baseInput({ personId: 'b', monthCount: 1 }));
    expect(compareCandidates({ id: 'a', cost: a }, { id: 'b', cost: b })).toBeLessThan(0);
  });

  it('componente 1 (veces en esta responsabilidad): nunca hecho le gana a hecho una vez, incluso hace mucho', () => {
    // "Quien nunca ha hecho X debe ganarle a quien lo hizo hace ocho meses":
    // el componente 1 pesa más que el 2 aunque el 2 favorezca fuertemente al otro.
    const nunca = personCost(
      baseInput({ personId: 'nunca', typeCountSoFar: 0, lastTypeDate: null })
    );
    const haceMucho = personCost(
      baseInput({ personId: 'haceMucho', typeCountSoFar: 1, lastTypeDate: '2020-01-01' })
    );
    expect(compareCandidates({ id: 'nunca', cost: nunca }, { id: 'haceMucho', cost: haceMucho })).toBeLessThan(0);
  });

  it('componente 2 (antigüedad en la responsabilidad): a igualdad de veces, quien la hizo hace más gana', () => {
    const haceMucho = personCost(
      baseInput({ personId: 'haceMucho', typeCountSoFar: 2, lastTypeDate: '2025-01-01' })
    );
    const haceRecien = personCost(
      baseInput({ personId: 'haceRecien', typeCountSoFar: 2, lastTypeDate: '2026-08-01' })
    );
    expect(
      compareCandidates({ id: 'haceMucho', cost: haceMucho }, { id: 'haceRecien', cost: haceRecien })
    ).toBeLessThan(0);
  });

  it('componente 3 (carga histórica): a igualdad de los anteriores, menor histCount gana', () => {
    const a = personCost(baseInput({ personId: 'a', histCount: 0 }));
    const b = personCost(baseInput({ personId: 'b', histCount: 10 }));
    expect(compareCandidates({ id: 'a', cost: a }, { id: 'b', cost: b })).toBeLessThan(0);
  });

  it('componente 4 (espaciado): a igualdad de los anteriores, quien fue asignado hace más gana', () => {
    const haceMucho = personCost(baseInput({ personId: 'haceMucho', lastAssignedDate: '2025-01-01' }));
    const haceRecien = personCost(baseInput({ personId: 'haceRecien', lastAssignedDate: '2026-08-01' }));
    expect(
      compareCandidates({ id: 'haceMucho', cost: haceMucho }, { id: 'haceRecien', cost: haceRecien })
    ).toBeLessThan(0);
  });

  it('componente 5 (desempate determinista): decide cuando los cinco anteriores empatan', () => {
    const a = personCost(baseInput({ personId: 'aaa' }));
    const b = personCost(baseInput({ personId: 'bbb' }));
    // Los primeros cinco componentes son idénticos por construcción (mismo
    // baseInput); solo cambia personId, que entra en el stableHash.
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
    expect(a[3]).toBe(b[3]);
    expect(a[4]).toBe(b[4]);
    expect(a[5]).not.toBe(b[5]);
  });

  it('tupla completa: seis componentes en el orden exacto de la especificación', () => {
    const cost = personCost({
      personId: 'p01',
      date: '2026-08-08',
      typeKey: 'pasillo_derecho',
      seed: 42,
      monthCount: 2,
      typeCountSoFar: 3,
      lastTypeDate: '2026-08-01',
      histCount: 7,
      lastAssignedDate: '2026-08-03',
    });
    expect(cost).toHaveLength(6);
    expect(cost[0]).toBe(2); // monthCount
    expect(cost[1]).toBe(3); // typeCountSoFar
    expect(cost[2]).toBe(-7); // -daysSince('2026-08-01', '2026-08-08')
    expect(cost[3]).toBe(7); // histCount
    expect(cost[4]).toBe(-5); // -daysSince('2026-08-03', '2026-08-08')
  });

  it('costLabelsPerson tiene 6 etiquetas, en el orden del documento', () => {
    expect(PERSON_COST_LABELS).toEqual([
      'Veces este mes',
      'Veces en esta responsabilidad',
      'Antigüedad en la responsabilidad',
      'Veces en el historial',
      'Días desde su última asignación',
      'Desempate',
    ]);
  });
});

describe('compareCandidates', () => {
  it('desempate final por id ascendente cuando todo el resto empata', () => {
    const cost = [0, 0, 0, 0, 0, 999] as const;
    expect(compareCandidates({ id: 'a', cost: cost as unknown as readonly number[] }, { id: 'b', cost: cost as unknown as readonly number[] })).toBeLessThan(0);
    expect(compareCandidates({ id: 'z', cost: cost as unknown as readonly number[] }, { id: 'a', cost: cost as unknown as readonly number[] })).toBeGreaterThan(0);
  });

  it('da un orden total: nunca devuelve 0 entre dos ids distintos con tuplas idénticas', () => {
    const cost = [1, 2, 3] as const;
    const result = compareCandidates(
      { id: 'x', cost: cost as unknown as readonly number[] },
      { id: 'y', cost: cost as unknown as readonly number[] }
    );
    expect(result).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ventana de variedad
//
// El fallo que arreglan estas pruebas: "probar otra variante" devolvía el
// mismo programa una y otra vez porque el componente de desempate (el único
// que depende de la semilla) casi nunca llegaba a consultarse. Los dos
// componentes de fecha se comparaban al día exacto, así que dos candidatos
// prácticamente iguales quedaban siempre en el mismo orden.
// ---------------------------------------------------------------------------

/** Candidato con tupla de persona: [mes, tipo, antigüedad, hist, espaciado, hash]. */
function cand(id: string, cost: readonly number[]) {
  return { id, cost };
}

describe('orderByVariety', () => {
  it('deja pasar delante al del hash menor cuando solo se distinguen por días', () => {
    // Mismos conteos; -19 y -14 son cinco días de diferencia, dentro de la
    // holgura de espaciado. El del hash menor gana aunque su tupla sea peor.
    const ordenados = [
      cand('a', [0, 0, -3650, 2, -19, 900]),
      cand('b', [0, 0, -3650, 2, -14, 100]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('nunca antepone a alguien con más carga del mes, por bajo que sea su hash', () => {
    const ordenados = [
      cand('a', [0, 0, -3650, 2, -14, 900]),
      cand('b', [1, 0, -3650, 2, -30, 1]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('nunca antepone a alguien que ya ha hecho más veces esa responsabilidad', () => {
    const ordenados = [
      cand('a', [0, 0, -3650, 2, -14, 900]),
      cand('b', [0, 1, -3650, 2, -30, 1]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('nunca antepone a alguien con más carga histórica', () => {
    const ordenados = [
      cand('a', [0, 0, -3650, 1, -14, 900]),
      cand('b', [0, 0, -3650, 2, -30, 1]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('deja fuera de la ventana una diferencia de espaciado mayor que la holgura', () => {
    // 30 días de diferencia: eso ya no es "prácticamente lo mismo".
    const ordenados = [
      cand('a', [0, 0, -3650, 2, -40, 900]),
      cand('b', [0, 0, -3650, 2, -10, 1]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('con la ventana llena, el orden lo fija el hash y, si empata, el id', () => {
    const ordenados = [
      cand('c', [0, 0, -3650, 2, -14, 5]),
      cand('a', [0, 0, -3650, 2, -14, 5]),
      cand('b', [0, 0, -3650, 2, -12, 1]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('conserva detrás el orden original de los que quedan fuera', () => {
    const ordenados = [
      cand('a', [0, 0, -3650, 2, -14, 900]),
      cand('b', [1, 0, -3650, 2, -14, 1]),
      cand('c', [2, 0, -3650, 2, -14, 2]),
    ];
    expect(orderByVariety(ordenados, PERSON_COST_TOLERANCE).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('devuelve lista vacía si no hay candidatos', () => {
    expect(orderByVariety([], PERSON_COST_TOLERANCE)).toEqual([]);
  });

  it('los componentes de conteo no llevan holgura y los de fecha sí', () => {
    // Si esto cambia, cambia la garantía de equilibrio: es el contrato.
    expect(PERSON_COST_TOLERANCE[0]).toBe(0); // carga del mes
    expect(PERSON_COST_TOLERANCE[1]).toBe(0); // veces en la responsabilidad
    expect(PERSON_COST_TOLERANCE[3]).toBe(0); // carga histórica
    expect(PERSON_COST_TOLERANCE[2]).toBeGreaterThan(0);
    expect(PERSON_COST_TOLERANCE[4]).toBeGreaterThan(0);
    // El desempate no entra en la ventana: es el que decide dentro de ella.
    expect(PERSON_COST_TOLERANCE.length).toBe(PERSON_COST_LABELS.length - 1);
  });
});
