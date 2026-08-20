import { describe, expect, it } from 'vitest';
import { computeLoadTarget, computeStats, type StatsInput } from '@/domain/stats';
import type { LoadTarget, Person, ResolvedAssignment, Team } from '@/domain/types';

// `computeStats` no decide nada: resume una solución ya tomada
// (docs/algoritmo.md, paso 9). Su valor está en que las cifras que enseña la
// interfaz sean las mismas que usó el algoritmo, así que lo que se prueba
// aquí es sobre todo que no invente, no descarte y no divida entre cero.

const TIPOS = ['entrada', 'auditorio', 'aseo'] as const;

function persona(id: string, active = true): Person {
  return { id, name: id.toUpperCase(), active };
}

function equipo(id: string, order: number, active = true): Team {
  return { id, displayName: null, order, active };
}

function asignacionPersona(
  date: string,
  typeKey: string,
  personId: string | null,
): ResolvedAssignment {
  return {
    date,
    typeKey,
    slotIndex: 0,
    kind: 'PERSON',
    personId,
    teamId: null,
    locked: false,
    unfilledReason: null,
  };
}

function asignacionEquipo(date: string, typeKey: string, teamId: string | null): ResolvedAssignment {
  return {
    date,
    typeKey,
    slotIndex: 0,
    kind: 'GROUP',
    personId: null,
    teamId,
    locked: false,
    unfilledReason: null,
  };
}

function entrada(extra: Partial<StatsInput> = {}): StatsInput {
  const personTarget: LoadTarget = { base: 1, remainder: 0, cap: 1 };
  const teamTarget: LoadTarget = { base: 1, remainder: 0, cap: 1 };
  return {
    people: [persona('p1'), persona('p2')],
    teams: [equipo('e1', 1)],
    personSlots: 2,
    teamSlots: 1,
    personTarget,
    teamTarget,
    assignments: [],
    typeKeys: [...TIPOS],
    personHistoryCount: new Map(),
    teamHistoryCount: new Map(),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// computeLoadTarget
// ---------------------------------------------------------------------------

describe('computeLoadTarget — de dónde sale el "~2 veces al mes" de CLAUDE.md', () => {
  it('con los datos reales de la congregación: 36 casillas y 19 personas', () => {
    // El caso que motivó todo: 17 personas salen 2 veces y 2 salen 1.
    // Nadie escribió el 2 en ningún sitio; sale de dividir.
    expect(computeLoadTarget(36, 19)).toEqual({ base: 1, remainder: 17, cap: 2 });
  });

  it('cuando la división es exacta, el tope coincide con la base', () => {
    // No hay resto que repartir, así que nadie puede pasar de la base.
    expect(computeLoadTarget(36, 18)).toEqual({ base: 2, remainder: 0, cap: 2 });
    expect(computeLoadTarget(40, 10)).toEqual({ base: 4, remainder: 0, cap: 4 });
  });

  it('con más personas que casillas, la mayoría se queda a cero', () => {
    expect(computeLoadTarget(36, 100)).toEqual({ base: 0, remainder: 36, cap: 1 });
  });

  it('con cero personas activas NO divide entre cero', () => {
    // Es el caso de una congregación recién creada, o de todo el mundo
    // desactivado. Debe devolver ceros, no NaN ni Infinity: un NaN aquí se
    // propagaría hasta la pantalla de estadísticas sin que nada lo detenga.
    const meta = computeLoadTarget(36, 0);
    expect(meta).toEqual({ base: 0, remainder: 0, cap: 0 });
    expect(Number.isNaN(meta.base)).toBe(false);
    expect(Number.isFinite(meta.cap)).toBe(true);
  });

  it('con cero casillas devuelve ceros', () => {
    expect(computeLoadTarget(0, 19)).toEqual({ base: 0, remainder: 0, cap: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeStats
// ---------------------------------------------------------------------------

describe('computeStats — conteos', () => {
  it('cuenta el total y el desglose por responsabilidad', () => {
    const stats = computeStats(
      entrada({
        assignments: [
          asignacionPersona('2026-09-05', 'entrada', 'p1'),
          asignacionPersona('2026-09-12', 'entrada', 'p1'),
          asignacionPersona('2026-09-05', 'auditorio', 'p2'),
          asignacionEquipo('2026-09-05', 'aseo', 'e1'),
        ],
      }),
    );

    const p1 = stats.people.find((s) => s.id === 'p1');
    expect(p1?.monthCount).toBe(2);
    expect(p1?.byType).toEqual({ entrada: 2, auditorio: 0, aseo: 0 });

    const p2 = stats.people.find((s) => s.id === 'p2');
    expect(p2?.monthCount).toBe(1);
    expect(p2?.byType).toEqual({ entrada: 0, auditorio: 1, aseo: 0 });

    const e1 = stats.teams.find((s) => s.id === 'e1');
    expect(e1?.monthCount).toBe(1);
    expect(e1?.byType).toEqual({ entrada: 0, auditorio: 0, aseo: 1 });
  });

  it('una persona sin ninguna asignación aparece con 0, no desaparece de la lista', () => {
    // El cero visible es justo la información que se busca en esta pantalla:
    // si la fila desapareciera, nadie notaría que alguien se está quedando
    // fuera del reparto.
    const stats = computeStats(
      entrada({ assignments: [asignacionPersona('2026-09-05', 'entrada', 'p1')] }),
    );

    expect(stats.people.map((s) => s.id)).toEqual(['p1', 'p2']);
    const p2 = stats.people.find((s) => s.id === 'p2');
    expect(p2?.monthCount).toBe(0);
    expect(p2?.byType).toEqual({ entrada: 0, auditorio: 0, aseo: 0 });
  });

  it('una persona inactiva sigue apareciendo con sus conteos', () => {
    // Desactivar a alguien no borra lo que ya hizo este mes; la pantalla
    // tiene que poder explicar por qué aparece en el programa impreso.
    const stats = computeStats(
      entrada({
        people: [persona('p1'), persona('p2', false)],
        assignments: [asignacionPersona('2026-09-05', 'entrada', 'p2')],
      }),
    );

    const p2 = stats.people.find((s) => s.id === 'p2');
    expect(p2?.monthCount).toBe(1);
  });

  it('las casillas vacías no cuentan para nadie', () => {
    const stats = computeStats(
      entrada({
        assignments: [
          asignacionPersona('2026-09-05', 'entrada', null),
          asignacionEquipo('2026-09-05', 'aseo', null),
        ],
      }),
    );

    expect(stats.people.every((s) => s.monthCount === 0)).toBe(true);
    expect(stats.teams.every((s) => s.monthCount === 0)).toBe(true);
  });

  it('una asignación a un id que no está en la lista canónica se ignora sin romper', () => {
    // Puede pasar si el historial menciona a alguien que ya no está en el
    // catálogo. Contarlo crearía una fila fantasma; lanzar una excepción
    // dejaría la pantalla en blanco por un dato viejo.
    const stats = computeStats(
      entrada({
        assignments: [
          asignacionPersona('2026-09-05', 'entrada', 'fantasma'),
          asignacionPersona('2026-09-05', 'auditorio', 'p1'),
        ],
      }),
    );

    expect(stats.people.map((s) => s.id)).toEqual(['p1', 'p2']);
    expect(stats.people.find((s) => s.id === 'p1')?.monthCount).toBe(1);
  });

  it('una responsabilidad fuera de typeKeys no aparece como columna de las demás', () => {
    const stats = computeStats(
      entrada({ assignments: [asignacionPersona('2026-09-05', 'desconocida', 'p1')] }),
    );

    // Suma al total —la asignación existió— pero NO crea una columna que las
    // demás entidades no tendrían: `byType` debe tener idéntica forma en
    // todas, o una tabla construida recorriéndola saldría descuadrada.
    const p1 = stats.people.find((s) => s.id === 'p1');
    expect(p1?.monthCount).toBe(1);
    expect(p1?.byType).toEqual({ entrada: 0, auditorio: 0, aseo: 0 });
    expect(Object.keys(p1?.byType ?? {})).toEqual(Object.keys(stats.people[1]?.byType ?? {}));
  });

  it('no confunde personas con equipos aunque compartan id', () => {
    const stats = computeStats(
      entrada({
        people: [persona('mismo')],
        teams: [equipo('mismo', 1)],
        assignments: [asignacionPersona('2026-09-05', 'entrada', 'mismo')],
      }),
    );

    expect(stats.people.find((s) => s.id === 'mismo')?.monthCount).toBe(1);
    expect(stats.teams.find((s) => s.id === 'mismo')?.monthCount).toBe(0);
  });

  it('arrastra el historial precalculado sin recalcularlo', () => {
    const stats = computeStats(
      entrada({ personHistoryCount: new Map([['p1', 7]]), teamHistoryCount: new Map([['e1', 3]]) }),
    );

    expect(stats.people.find((s) => s.id === 'p1')?.historyCount).toBe(7);
    expect(stats.people.find((s) => s.id === 'p2')?.historyCount).toBe(0);
    expect(stats.teams.find((s) => s.id === 'e1')?.historyCount).toBe(3);
  });
});

describe('computeStats — balance', () => {
  it('mide la desviación SOLO entre personas activas', () => {
    // Una persona inactiva con 0 asignaciones no es un desequilibrio: es que
    // no participa. Si contase, la pantalla daría una alarma permanente y
    // falsa en cuanto alguien se diera de baja.
    const stats = computeStats(
      entrada({
        people: [persona('p1'), persona('p2'), persona('p3', false)],
        assignments: [
          asignacionPersona('2026-09-05', 'entrada', 'p1'),
          asignacionPersona('2026-09-12', 'auditorio', 'p2'),
        ],
      }),
    );

    expect(stats.balance).toEqual({ min: 1, max: 1, spread: 0 });
  });

  it('detecta un reparto desigual', () => {
    const stats = computeStats(
      entrada({
        people: [persona('p1'), persona('p2'), persona('p3')],
        assignments: [
          asignacionPersona('2026-09-05', 'entrada', 'p1'),
          asignacionPersona('2026-09-12', 'entrada', 'p1'),
          asignacionPersona('2026-09-19', 'auditorio', 'p1'),
          asignacionPersona('2026-09-05', 'auditorio', 'p2'),
        ],
      }),
    );

    // p1 tres veces, p2 una, p3 ninguna.
    expect(stats.balance).toEqual({ min: 0, max: 3, spread: 3 });
  });

  it('sin ninguna persona activa devuelve ceros en vez de -Infinity', () => {
    // `Math.max()` sin argumentos devuelve -Infinity y `Math.min()` devuelve
    // Infinity: un spread de -Infinity llegaría a la interfaz como "-∞".
    const stats = computeStats(entrada({ people: [], assignments: [] }));

    expect(stats.balance).toEqual({ min: 0, max: 0, spread: 0 });
    expect(Number.isFinite(stats.balance.spread)).toBe(true);
  });

  it('con todas las personas inactivas también devuelve ceros', () => {
    const stats = computeStats(
      entrada({ people: [persona('p1', false), persona('p2', false)], assignments: [] }),
    );

    expect(stats.balance).toEqual({ min: 0, max: 0, spread: 0 });
  });

  it('deja pasar tal cual las metas y los totales de casillas que recibe', () => {
    const personTarget: LoadTarget = { base: 1, remainder: 17, cap: 2 };
    const teamTarget: LoadTarget = { base: 3, remainder: 1, cap: 4 };
    const stats = computeStats(entrada({ personSlots: 36, teamSlots: 13, personTarget, teamTarget }));

    expect(stats.personSlots).toBe(36);
    expect(stats.teamSlots).toBe(13);
    expect(stats.personTarget).toEqual(personTarget);
    expect(stats.teamTarget).toEqual(teamTarget);
  });
});
