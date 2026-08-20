import { describe, expect, it } from 'vitest';
import { generateProgram } from '../../src/domain/generateProgram';
import { dayOfWeek, fromIso } from '../../src/domain/dates';
import type {
  AssignmentType,
  GenerateInput,
  GenerationSettings,
  Group,
  GroupRole,
  HistoricalAssignment,
  LockedAssignment,
  Person,
  Team,
} from '../../src/domain/types';

// Casos límite escritos a mano. La suite de invariantes (tests/invariants/) ya
// cubre estas propiedades de forma probabilística sobre plantillas al azar;
// el valor de este fichero es distinto: deja por escrito el comportamiento
// EXACTO esperado en las situaciones que de verdad ocurren, con entradas y
// aserciones concretas, para que un cambio futuro que las rompa se vea en el
// nombre del test que falla.

// ---------------------------------------------------------------------------
// Ayudantes de construcción de entradas
// ---------------------------------------------------------------------------

/** Sin grupo, miembro y sin restricciones: quien entra en todo el reparto. */
const SIN_RESTRICCIONES = {
  groupId: null,
  role: 'MEMBER',
  allowedTypeKeys: null,
  blockedDaysOfWeek: [],
} as const satisfies Omit<Person, 'id' | 'name' | 'active'>;

/** Regla de capitanes apagada: el reparto tal y como era antes de existir. */
const SIN_REGLA_CAPITANES = {
  enabled: false,
  sourceTypeKey: '',
  targetTypeKeys: [],
} as const;

function person(id: string, active = true): Person {
  return { ...SIN_RESTRICCIONES, id, name: `Persona ${id}`, active };
}

function people(n: number, opts: { active?: boolean; prefix?: string } = {}): Person[] {
  const { active = true, prefix = 'p' } = opts;
  return Array.from({ length: n }, (_, i) => ({
    ...SIN_RESTRICCIONES,
    id: `${prefix}${String(i).padStart(3, '0')}`,
    name: `Persona ${i}`,
    active,
  }));
}

function team(id: string, order: number, active = true): Team {
  return { id, displayName: null, order, active };
}

function teamsOf(n: number, opts: { active?: boolean; prefix?: string } = {}): Team[] {
  const { active = true, prefix = 't' } = opts;
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(i).padStart(2, '0')}`,
    displayName: null,
    order: i + 1,
    active,
  }));
}

/** Un tipo de asignación con valores por defecto sensatos; cada test cambia solo lo que le importa. */
function makeType(key: string, overrides: Partial<AssignmentType> = {}): AssignmentType {
  return {
    id: key,
    key,
    label: key,
    kind: 'PERSON',
    daysOfWeek: [1, 6],
    slotsPerDate: 1,
    order: 1,
    icon: 'dot',
    active: true,
    ...overrides,
  };
}

/** Las seis responsabilidades reales de CLAUDE.md: 4 de persona + aseo + hospitalidad (solo sábado). */
function standardTypes(): AssignmentType[] {
  return [
    makeType('acomodador_entrada', { label: 'Acomodador de entrada', order: 1 }),
    makeType('acomodador_auditorio', { label: 'Acomodador de auditorio', order: 2 }),
    makeType('pasillo_izquierdo', { label: 'Pasillo izquierdo', order: 3 }),
    makeType('pasillo_derecho', { label: 'Pasillo derecho', order: 4 }),
    makeType('aseo', { label: 'Aseo', kind: 'GROUP', order: 5 }),
    makeType('hospitalidad', { label: 'Hospitalidad', kind: 'GROUP', daysOfWeek: [6], order: 6 }),
  ];
}

function personTypesOnly(): AssignmentType[] {
  return standardTypes().filter((t) => t.kind === 'PERSON');
}

function groupTypesOnly(): AssignmentType[] {
  return standardTypes().filter((t) => t.kind === 'GROUP');
}

function makeSettings(overrides: Partial<GenerationSettings> = {}): GenerationSettings {
  return {
    historyWindowMonths: 6,
    allowMultiplePerDay: false,
    allowTeamTwiceSameDate: false,
    runRepairPass: false,
    maxRepairIterations: 200,
    captainRule: SIN_REGLA_CAPITANES,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<Omit<GenerateInput, 'year' | 'month'>> & Pick<GenerateInput, 'year' | 'month'>
): GenerateInput {
  return {
    people: [],
    teams: [],
    groups: [],
    assignmentTypes: standardTypes(),
    previousAssignments: [],
    lockedAssignments: [],
    settings: makeSettings(),
    seed: 1,
    ...overrides,
  };
}

function warningCodes(out: ReturnType<typeof generateProgram>): string[] {
  return out.warnings.map((w) => w.code);
}

// ---------------------------------------------------------------------------
// 1 · Detección de fechas: casos de calendario reales
// ---------------------------------------------------------------------------

describe('detección de fechas — casos de calendario reales', () => {
  it('febrero bisiesto que empieza en sábado (2020-02): protege que datesOfMonthMatching no dependa de que el mes "siempre" tenga 28 días ni de que el 1 caiga en un día concreto', () => {
    // 2020 es bisiesto (2020 % 4 === 0 y 2020 % 100 !== 0) y el 1 de febrero
    // de 2020 cae en sábado. Verificado por cálculo, no supuesto:
    //   node -e "console.log(new Date(2020,1,1).getDay())" → 6
    // Lunes de febrero 2020: 3, 10, 17, 24. Sábados: 1, 8, 15, 22, 29 (el 29
    // solo existe porque el año es bisiesto).
    const input = makeInput({
      year: 2020,
      month: 2,
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    expect(out.dates.map((d) => d.date)).toEqual([
      '2020-02-01',
      '2020-02-03',
      '2020-02-08',
      '2020-02-10',
      '2020-02-15',
      '2020-02-17',
      '2020-02-22',
      '2020-02-24',
      '2020-02-29',
    ]);
    // El día bisiesto entra como un sábado más: no hay tratamiento especial.
    expect(dayOfWeek(fromIso('2020-02-29'))).toBe(6);
  });

  it('mes que empieza en lunes (2026-06): la primera fecha del programa es el día 1, no un desplazamiento de "primer lunes disponible"', () => {
    // Comprobado por cálculo: new Date(2026,5,1).getDay() === 1.
    const input = makeInput({ year: 2026, month: 6 });
    const out = generateProgram(input);

    expect(out.dates.length).toBeGreaterThan(0);
    const first = out.dates[0];
    expect(first).toBeDefined();
    expect(first?.date).toBe('2026-06-01');
    expect(first?.dayOfWeek).toBe(1);
  });

  it('mes que termina en sábado (2026-10): la última fecha del programa es el último día del mes, sin recortar el sábado final', () => {
    // Comprobado por cálculo: new Date(2026,9,31).getDay() === 6.
    const input = makeInput({ year: 2026, month: 10 });
    const out = generateProgram(input);

    expect(out.dates.length).toBeGreaterThan(0);
    const last = out.dates[out.dates.length - 1];
    expect(last).toBeDefined();
    expect(last?.date).toBe('2026-10-31');
    expect(last?.dayOfWeek).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 2 · Meta de carga: el "~2 veces al mes" no es una constante
// ---------------------------------------------------------------------------

describe('meta de carga se recalcula por mes — el "2" de CLAUDE.md no está hardcodeado', () => {
  it('mes con 5 lunes y 4 sábados (2026-03): 36 casillas de persona / 10 personas → base 3, tope 4 (docs/algoritmo.md tabla del paso 5)', () => {
    // Lunes de marzo 2026: 2, 9, 16, 23, 30 (5). Sábados: 7, 14, 21, 28 (4).
    const input = makeInput({
      year: 2026,
      month: 3,
      people: people(10),
      teams: teamsOf(4),
    });
    const out = generateProgram(input);

    const lunes = out.dates.filter((d) => d.dayOfWeek === 1);
    const sabados = out.dates.filter((d) => d.dayOfWeek === 6);
    expect(lunes).toHaveLength(5);
    expect(sabados).toHaveLength(4);
    expect(out.dates).toHaveLength(9);

    // 9 fechas × 4 responsabilidades de persona = 36 casillas.
    expect(out.stats.personSlots).toBe(36);
    expect(out.stats.personTarget).toEqual({ base: 3, remainder: 6, cap: 4 });

    // aseo (los 9 días) + hospitalidad (los 4 sábados) = 13 casillas de equipo,
    // reproduciendo exactamente la fila de la hoja real citada en el documento.
    expect(out.stats.teamSlots).toBe(13);
    expect(out.stats.teamTarget).toEqual({ base: 3, remainder: 1, cap: 4 });
  });

  it('mes con 4 lunes y 5 sábados (2026-10): mismas 36 casillas de persona pero 18 personas → tope exacto 2, y más casillas de equipo por tener un sábado más', () => {
    // Lunes de octubre 2026: 5, 12, 19, 26 (4). Sábados: 3, 10, 17, 24, 31 (5).
    const input = makeInput({
      year: 2026,
      month: 10,
      people: people(18),
      teams: teamsOf(4),
    });
    const out = generateProgram(input);

    const lunes = out.dates.filter((d) => d.dayOfWeek === 1);
    const sabados = out.dates.filter((d) => d.dayOfWeek === 6);
    expect(lunes).toHaveLength(4);
    expect(sabados).toHaveLength(5);
    expect(out.dates).toHaveLength(9);

    expect(out.stats.personSlots).toBe(36);
    // División exacta: cap === base, nadie puede salir 3 veces mientras otro sale 1.
    expect(out.stats.personTarget).toEqual({ base: 2, remainder: 0, cap: 2 });

    // Un sábado más que el mes anterior ⇒ una hospitalidad más ⇒ 14, no 13.
    // La meta de equipo cambia SOLO por el calendario, sin tocar código.
    expect(out.stats.teamSlots).toBe(14);
    expect(out.stats.teamTarget).toEqual({ base: 3, remainder: 2, cap: 4 });
  });
});

// ---------------------------------------------------------------------------
// 3 · Escasez de personas: casillas vacías, nunca duplicados ni excepciones
// ---------------------------------------------------------------------------

describe('escasez de personas — protege que un roster insuficiente produzca huecos explicados, no duplicados ni excepciones', () => {
  it('3 personas activas para 4 responsabilidades de persona por fecha: exactamente 1 casilla vacía por fecha, sin repetir a nadie', () => {
    // Septiembre 2026: 4 lunes (7,14,21,28) + 4 sábados (5,12,19,26) = 8 fechas.
    const tres = [person('p1'), person('p2'), person('p3')];
    const input = makeInput({
      year: 2026,
      month: 9,
      people: [...tres, person('inactivo', false)],
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    expect(out.dates).toHaveLength(8);
    // 8 fechas × 4 responsabilidades = 32 casillas para solo 3 personas.
    expect(out.stats.personSlots).toBe(32);
    expect(out.stats.personTarget).toEqual({ base: 10, remainder: 2, cap: 11 });

    const porFecha = new Map<string, (string | null)[]>();
    for (const a of out.assignments) {
      const lista = porFecha.get(a.date) ?? [];
      lista.push(a.personId);
      porFecha.set(a.date, lista);
    }
    expect(porFecha.size).toBe(8);
    for (const [fecha, ids] of porFecha) {
      const llenas = ids.filter((id): id is string => id !== null);
      expect(llenas, `día ${fecha}`).toHaveLength(3);
      // Sin duplicados en silencio: las 3 casillas llenas son 3 personas distintas.
      expect(new Set(llenas).size, `día ${fecha}`).toBe(3);
      expect(ids.filter((id) => id === null), `día ${fecha}`).toHaveLength(1);
    }

    const vacias = out.assignments.filter((a) => a.personId === null);
    expect(vacias).toHaveLength(8);
    expect(vacias.every((a) => a.unfilledReason === 'NO_ELIGIBLE_CANDIDATE')).toBe(true);
    expect(warningCodes(out).filter((c) => c === 'SLOT_UNFILLED')).toHaveLength(8);
    // La persona inactiva jamás aparece.
    expect(out.assignments.some((a) => a.personId === 'inactivo')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4 · allowMultiplePerDay con una sola persona activa
// ---------------------------------------------------------------------------

describe('una sola persona activa — protege el comportamiento exacto de allowMultiplePerDay', () => {
  // Un tipo con 4 casillas por fecha, solo sábados, para que "el resto quedan
  // vacías" sea observable dentro de una misma fecha.
  function inputConUnaPersona(allowMultiplePerDay: boolean): GenerateInput {
    return makeInput({
      year: 2026,
      month: 9, // 4 sábados: 5, 12, 19, 26
      assignmentTypes: [makeType('rol', { label: 'Rol', daysOfWeek: [6], slotsPerDate: 4 })],
      people: [person('unica'), person('inactiva', false)],
      settings: makeSettings({ allowMultiplePerDay }),
    });
  }

  it('allowMultiplePerDay: true → la única persona activa ocupa TODAS las casillas, incluidas las repetidas el mismo día', () => {
    const out = generateProgram(inputConUnaPersona(true));

    expect(out.assignments).toHaveLength(16); // 4 fechas × 4 casillas
    expect(out.assignments.every((a) => a.personId === 'unica')).toBe(true);
    expect(out.assignments.every((a) => a.unfilledReason === null)).toBe(true);
    expect(out.stats.personTarget).toEqual({ base: 16, remainder: 0, cap: 16 });
  });

  it('allowMultiplePerDay: false → la única persona activa ocupa 1 casilla por fecha; las otras 3 quedan vacías con NO_ELIGIBLE_CANDIDATE', () => {
    const out = generateProgram(inputConUnaPersona(false));

    const porFecha = new Map<string, (string | null)[]>();
    for (const a of out.assignments) {
      const lista = porFecha.get(a.date) ?? [];
      lista.push(a.personId);
      porFecha.set(a.date, lista);
    }
    expect(porFecha.size).toBe(4);
    for (const [fecha, ids] of porFecha) {
      expect(ids.filter((id) => id === 'unica'), `día ${fecha}`).toHaveLength(1);
      expect(ids.filter((id) => id === null), `día ${fecha}`).toHaveLength(3);
    }
    const llenas = out.assignments.filter((a) => a.personId !== null);
    const vacias = out.assignments.filter((a) => a.personId === null);
    expect(llenas).toHaveLength(4);
    expect(vacias).toHaveLength(12);
    expect(vacias.every((a) => a.unfilledReason === 'NO_ELIGIBLE_CANDIDATE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5 · Equidad de largo plazo con 100 personas (criterio 4 del paso 6)
// ---------------------------------------------------------------------------

describe('100 personas activas — protege la equidad de largo plazo (componente 3 de la tupla de coste)', () => {
  it('nadie pasa de 1 asignación, y quienes se quedan en 0 son exactamente los de MÁS historial', () => {
    // Marzo 2026 (ver test anterior): 36 casillas de persona.
    // 100 personas activas ⇒ base=0, resto=36, tope=1: la mayoría se queda a 0.
    //
    // A cada persona p_i se le da un historial de tamaño i, con una clave de
    // responsabilidad ("distractor") que NO existe entre los tipos activos de
    // este mes. Así los componentes 0 (carga del mes), 1 (veces en esta
    // responsabilidad) y 2 (antigüedad en la responsabilidad) empatan para
    // TODAS las personas en TODAS las casillas restantes, y el desempate cae
    // siempre en el componente 3 (carga histórica, histCount). Como los 100
        // histCount son todos distintos (0..99), nunca hay empate real y el orden
    // de selección es determinista: gana siempre quien tiene MENOS historial.
    const cien = people(100);
    const previousAssignments: HistoricalAssignment[] = [];
    cien.forEach((p, i) => {
      for (let k = 0; k < i; k++) {
        previousAssignments.push({
          date: '2020-01-04',
          typeKey: 'distractor',
          kind: 'PERSON',
          personId: p.id,
          teamId: null,
        });
      }
    });

    const input = makeInput({
      year: 2026,
      month: 3,
      people: cien,
      assignmentTypes: personTypesOnly(),
      previousAssignments,
      settings: makeSettings({ historyWindowMonths: 0 }),
    });
    const out = generateProgram(input);

    expect(out.stats.personTarget).toEqual({ base: 0, remainder: 36, cap: 1 });
    expect(out.stats.people.every((s) => s.monthCount <= 1)).toBe(true);

    const winners = out.assignments
      .filter((a) => a.personId !== null)
      .map((a) => a.personId as string);
    expect(winners).toHaveLength(36);
    expect(new Set(winners).size).toBe(36); // el tope 1 impide que alguien repita.

    // Los 36 ganadores son, en orden de selección, exactamente p000..p035:
    // los 36 con MENOS historial. Ninguno de los 64 restantes (los de MÁS
    // historial) recibe una sola asignación.
    const winnerIndices = winners.map((id) => Number(id.slice(1)));
    expect(winnerIndices).toEqual(Array.from({ length: 36 }, (_, i) => i));

    const perdedores = out.stats.people.filter((s) => Number(s.id.slice(1)) >= 36);
    expect(perdedores).toHaveLength(64);
    expect(perdedores.every((s) => s.monthCount === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6 · Catálogo vacío: cero personas y cero equipos activos
// ---------------------------------------------------------------------------

describe('catálogo vacío — protege que la ausencia total de personas/equipos produzca un programa explicado, no un fallo', () => {
  it('cero personas activas y cero equipos activos: fechas correctas, todas las casillas vacías, un aviso de cada tipo, sin excepción', () => {
    const input = makeInput({ year: 2026, month: 9, people: [], teams: [] });

    expect(() => generateProgram(input)).not.toThrow();
    const out = generateProgram(input);

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

    expect(out.assignments.every((a) => a.personId === null && a.teamId === null)).toBe(true);
    expect(
      out.assignments
        .filter((a) => a.kind === 'PERSON')
        .every((a) => a.unfilledReason === 'NO_ACTIVE_PEOPLE')
    ).toBe(true);
    expect(
      out.assignments
        .filter((a) => a.kind === 'GROUP')
        .every((a) => a.unfilledReason === 'NO_ACTIVE_TEAMS')
    ).toBe(true);

    expect(warningCodes(out).filter((c) => c === 'NO_ACTIVE_PEOPLE')).toHaveLength(1);
    expect(warningCodes(out).filter((c) => c === 'NO_ACTIVE_TEAMS')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7 · Un solo equipo activo — allowTeamTwiceSameDate
// ---------------------------------------------------------------------------

describe('un solo equipo activo — protege la regla de aseo+hospitalidad el mismo sábado (filtro 2 del paso 7)', () => {
  function inputConUnEquipo(allowTeamTwiceSameDate: boolean): GenerateInput {
    return makeInput({
      year: 2026,
      month: 9, // 4 lunes + 4 sábados
      assignmentTypes: groupTypesOnly(),
      teams: [team('unico', 1), team('inactivo', 2, false)],
      settings: makeSettings({ allowTeamTwiceSameDate }),
    });
  }

  it('allowTeamTwiceSameDate: false (por defecto) → el equipo cubre aseo todos los días, pero NO hospitalidad el mismo sábado que ya hizo aseo', () => {
    const out = generateProgram(inputConUnEquipo(false));

    const aseo = out.assignments.filter((a) => a.typeKey === 'aseo');
    const hospitalidad = out.assignments.filter((a) => a.typeKey === 'hospitalidad');
    expect(aseo).toHaveLength(8); // 4 lunes + 4 sábados
    expect(hospitalidad).toHaveLength(4); // 4 sábados

    expect(aseo.every((a) => a.teamId === 'unico')).toBe(true);
    expect(hospitalidad.every((a) => a.teamId === null)).toBe(true);
    expect(hospitalidad.every((a) => a.unfilledReason === 'NO_ELIGIBLE_CANDIDATE')).toBe(true);
    expect(warningCodes(out).filter((c) => c === 'SLOT_UNFILLED')).toHaveLength(4);

    const stat = out.stats.teams.find((s) => s.id === 'unico');
    expect(stat?.monthCount).toBe(8);
  });

  it('allowTeamTwiceSameDate: true → el equipo repite el mismo sábado: aseo Y hospitalidad, sin ningún hueco', () => {
    const out = generateProgram(inputConUnEquipo(true));

    expect(out.assignments.every((a) => a.teamId === 'unico')).toBe(true);
    expect(out.assignments.every((a) => a.unfilledReason === null)).toBe(true);
    expect(out.warnings.filter((w) => w.code === 'SLOT_UNFILLED')).toHaveLength(0);

    const sabados = out.dates.filter((d) => d.dayOfWeek === 6).map((d) => d.date);
    for (const fecha of sabados) {
      const equiposEseDia = out.assignments.filter((a) => a.date === fecha).map((a) => a.teamId);
      expect(equiposEseDia).toEqual(['unico', 'unico']); // repite: aseo y hospitalidad
    }

    const stat = out.stats.teams.find((s) => s.id === 'unico');
    expect(stat?.monthCount).toBe(12); // 8 aseo + 4 hospitalidad
  });
});

// ---------------------------------------------------------------------------
// 8 · Bloqueos
// ---------------------------------------------------------------------------

describe('bloqueos — protegen que una decisión explícita del administrador se respete siempre al regenerar', () => {
  it('todas las casillas bloqueadas: la salida reproduce los bloqueos exactamente, sin rebalancear nada', () => {
    // 4 sábados de septiembre 2026, un único tipo, 1 casilla por fecha.
    // Las 4 se bloquean a la MISMA persona: un reparto que el algoritmo jamás
    // elegiría por sí solo (rompe el equilibrio adrede), precisamente para
    // demostrar que el bloqueo no se "corrige".
    const fechas = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'];
    const lockedAssignments: LockedAssignment[] = fechas.map((date) => ({
      date,
      typeKey: 'rol',
      slotIndex: 0,
      personId: 'p1',
      teamId: null,
    }));
    const input = makeInput({
      year: 2026,
      month: 9,
      assignmentTypes: [makeType('rol', { label: 'Rol', daysOfWeek: [6] })],
      people: [person('p1'), person('p2')],
      lockedAssignments,
    });
    const out = generateProgram(input);

    expect(out.assignments).toHaveLength(4);
    const esperado = fechas.map((date) => ({
      date,
      typeKey: 'rol',
      slotIndex: 0,
      kind: 'PERSON' as const,
      personId: 'p1',
      teamId: null,
      locked: true,
      unfilledReason: null,
    }));
    expect(out.assignments).toEqual(esperado);
    expect(out.warnings).toEqual([]);

    const p1 = out.stats.people.find((s) => s.id === 'p1');
    const p2 = out.stats.people.find((s) => s.id === 'p2');
    // Nada se inventa: p1 termina con las 4, p2 con 0, aunque el reparto
    // "justo" hubiera sido 2 y 2.
    expect(p1?.monthCount).toBe(4);
    expect(p2?.monthCount).toBe(0);
  });

  it('una persona y un equipo INACTIVOS con una asignación bloqueada: el bloqueo se respeta y se avisa (LOCKED_INACTIVE_PERSON / LOCKED_INACTIVE_TEAM)', () => {
    const assignmentTypes = [
      makeType('rol_persona', { label: 'Rol persona', daysOfWeek: [6] }),
      makeType('rol_equipo', { label: 'Rol equipo', kind: 'GROUP' as const, daysOfWeek: [6] }),
    ];
    const input = makeInput({
      year: 2026,
      month: 9, // sábados: 5, 12, 19, 26
      assignmentTypes,
      people: [person('activa'), person('inactiva', false)],
      teams: [team('activo', 1), team('inactivo', 2, false)],
      lockedAssignments: [
        { date: '2026-09-05', typeKey: 'rol_persona', slotIndex: 0, personId: 'inactiva', teamId: null },
        { date: '2026-09-05', typeKey: 'rol_equipo', slotIndex: 0, personId: null, teamId: 'inactivo' },
      ],
    });
    const out = generateProgram(input);

    const personaBloqueada = out.assignments.find(
      (a) => a.date === '2026-09-05' && a.typeKey === 'rol_persona'
    );
    expect(personaBloqueada?.personId).toBe('inactiva');
    expect(personaBloqueada?.locked).toBe(true);
    expect(personaBloqueada?.unfilledReason).toBeNull();

    const equipoBloqueado = out.assignments.find(
      (a) => a.date === '2026-09-05' && a.typeKey === 'rol_equipo'
    );
    expect(equipoBloqueado?.teamId).toBe('inactivo');
    expect(equipoBloqueado?.locked).toBe(true);
    expect(equipoBloqueado?.unfilledReason).toBeNull();

    expect(
      out.warnings.filter(
        (w) => w.code === 'LOCKED_INACTIVE_PERSON' && w.personId === 'inactiva' && w.date === '2026-09-05'
      )
    ).toHaveLength(1);
    expect(
      out.warnings.filter(
        (w) => w.code === 'LOCKED_INACTIVE_TEAM' && w.teamId === 'inactivo' && w.date === '2026-09-05'
      )
    ).toHaveLength(1);

    // La persona/equipo inactivos no aparecen en ninguna otra fecha.
    expect(out.assignments.filter((a) => a.personId === 'inactiva')).toHaveLength(1);
    expect(out.assignments.filter((a) => a.teamId === 'inactivo')).toHaveLength(1);
  });

  it('bloqueo de persona que crea un duplicado el mismo día: se respetan ambos y se avisa LOCKED_DUPLICATE_SAME_DAY', () => {
    const assignmentTypes = [
      makeType('tipoA', { label: 'Tipo A', daysOfWeek: [6], order: 1 }),
      makeType('tipoB', { label: 'Tipo B', daysOfWeek: [6], order: 2 }),
    ];
    const input = makeInput({
      year: 2026,
      month: 9,
      assignmentTypes,
      people: [person('duplicada')],
      lockedAssignments: [
        { date: '2026-09-05', typeKey: 'tipoA', slotIndex: 0, personId: 'duplicada', teamId: null },
        { date: '2026-09-05', typeKey: 'tipoB', slotIndex: 0, personId: 'duplicada', teamId: null },
      ],
    });
    const out = generateProgram(input);

    const eseDia = out.assignments.filter((a) => a.date === '2026-09-05');
    expect(eseDia.every((a) => a.personId === 'duplicada' && a.locked)).toBe(true);

    const avisos = out.warnings.filter(
      (w) => w.code === 'LOCKED_DUPLICATE_SAME_DAY' && w.personId === 'duplicada'
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.date).toBe('2026-09-05');
  });

  it('bloqueo de equipo que crea un duplicado el mismo sábado: se respetan ambos (aseo + hospitalidad) y se avisa LOCKED_DUPLICATE_SAME_DAY', () => {
    const input = makeInput({
      year: 2026,
      month: 9,
      assignmentTypes: groupTypesOnly(),
      teams: [team('duplicado', 1)],
      lockedAssignments: [
        { date: '2026-09-05', typeKey: 'aseo', slotIndex: 0, personId: null, teamId: 'duplicado' },
        { date: '2026-09-05', typeKey: 'hospitalidad', slotIndex: 0, personId: null, teamId: 'duplicado' },
      ],
    });
    const out = generateProgram(input);

    const eseDia = out.assignments.filter((a) => a.date === '2026-09-05');
    expect(eseDia.every((a) => a.teamId === 'duplicado' && a.locked)).toBe(true);

    const avisos = out.warnings.filter(
      (w) => w.code === 'LOCKED_DUPLICATE_SAME_DAY' && w.teamId === 'duplicado'
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.date).toBe('2026-09-05');
  });
});

// ---------------------------------------------------------------------------
// 9 · Reproducibilidad
// ---------------------------------------------------------------------------

describe('reproducibilidad — protege que la función sea pura respecto a `seed`', () => {
  it('mismo seed y misma entrada ⇒ salida idéntica; seed distinto ⇒ reparto distinto pero igual de equilibrado', () => {
    const input = makeInput({
      year: 2026,
      month: 9,
      people: people(16),
      teams: teamsOf(4),
      settings: makeSettings({ runRepairPass: true }),
      seed: 777,
    });

    const a = generateProgram(input);
    const b = generateProgram(input);
    expect(b).toEqual(a);

    const variante = generateProgram({ ...input, seed: 778 });
    expect(variante).not.toEqual(a);

    // Ambas están completamente cubiertas (16 personas / 32 casillas, 4
    // equipos / 12 casillas: sobra holgura, no debería haber avisos).
    expect(a.warnings).toEqual([]);
    expect(variante.warnings).toEqual([]);

    // La meta de carga no depende del seed.
    expect(variante.stats.personTarget).toEqual(a.stats.personTarget);
    expect(variante.stats.teamTarget).toEqual(a.stats.teamTarget);

    // Igual de equilibrado: la invariante 7 (comprobada exhaustivamente en
    // tests/invariants/) garantiza spread <= 1 cuando no hay huecos ni
    // relajación de tope, sea cual sea el seed.
    expect(a.stats.balance.spread).toBeLessThanOrEqual(1);
    expect(variante.stats.balance.spread).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 10 · slotsPerDate > 1 y tipo inactivo
// ---------------------------------------------------------------------------

describe('slotsPerDate > 1 y tipo inactivo — protegen dos reglas del modelo de datos que el algoritmo no debe conocer como casos especiales', () => {
  it('un tipo con slotsPerDate: 3 genera 3 casillas por fecha; un tipo inactivo no genera ninguna casilla ni aporta fechas', () => {
    const input = makeInput({
      year: 2026,
      month: 9,
      assignmentTypes: [
        makeType('multi', { label: 'Multi', daysOfWeek: [6], slotsPerDate: 3, order: 1 }),
        // Si esta responsabilidad estuviera activa, aportaría los lunes
        // (daysOfWeek: [1, 6]) al calendario. Al estar inactiva, no debe
        // aparecer ninguna fecha de lunes ni ninguna casilla con su typeKey.
        makeType('fantasma', { label: 'Fantasma', daysOfWeek: [1, 6], order: 2, active: false }),
      ],
      people: people(6),
    });
    const out = generateProgram(input);

    // Solo sábados: 5, 12, 19, 26. Ningún lunes, aunque "fantasma" los pediría.
    expect(out.dates.map((d) => d.date)).toEqual(['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
    expect(out.dates.every((d) => d.dayOfWeek === 6)).toBe(true);

    expect(out.assignments.every((a) => a.typeKey === 'multi')).toBe(true);
    expect(out.assignments.some((a) => a.typeKey === 'fantasma')).toBe(false);
    expect(out.trace.slots.some((s) => s.typeKey === 'fantasma')).toBe(false);

    for (const fecha of out.dates.map((d) => d.date)) {
      const deEseDia = out.assignments.filter((a) => a.date === fecha);
      expect(deEseDia.map((a) => a.slotIndex)).toEqual([0, 1, 2]);
      const ids = deEseDia.map((a) => a.personId);
      expect(ids.every((id) => id !== null)).toBe(true);
      expect(new Set(ids).size).toBe(3); // 3 personas distintas, sin duplicar.
    }
  });
});

// ---------------------------------------------------------------------------
// 9 · Restricciones por persona
// ---------------------------------------------------------------------------

describe('restricciones por persona — protegen que un veto declarado no se incumpla nunca', () => {
  /** Septiembre de 2026: 4 lunes (7, 14, 21, 28) y 4 sábados (5, 12, 19, 26). */
  const SEPTIEMBRE = { year: 2026, month: 9 } as const;

  function conRestricciones(
    id: string,
    restricciones: Partial<Pick<Person, 'allowedTypeKeys' | 'blockedDaysOfWeek'>>,
  ): Person {
    return { ...person(id), ...restricciones };
  }

  it('quien solo tiene habilitado el auditorio no aparece en ninguna otra responsabilidad', () => {
    const mayor = conRestricciones('mayor', { allowedTypeKeys: ['acomodador_auditorio'] });
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [mayor, ...people(9)],
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    const suyas = out.assignments.filter((a) => a.personId === 'mayor');
    expect(suyas.length).toBeGreaterThan(0);
    expect(suyas.every((a) => a.typeKey === 'acomodador_auditorio')).toBe(true);
  });

  it('quien no puede pasillos aparece en el resto, pero en ningún pasillo', () => {
    const sinPasillos = conRestricciones('sinp', {
      allowedTypeKeys: ['acomodador_entrada', 'acomodador_auditorio'],
    });
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [sinPasillos, ...people(9)],
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    const suyas = out.assignments.filter((a) => a.personId === 'sinp');
    expect(suyas.length).toBeGreaterThan(0);
    expect(suyas.some((a) => a.typeKey.startsWith('pasillo_'))).toBe(false);
  });

  it('quien no puede sábados sirve en lunes y en ningún sábado', () => {
    const soloLunes = conRestricciones('lunes', { blockedDaysOfWeek: [6] });
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [soloLunes, ...people(9)],
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    const suyas = out.assignments.filter((a) => a.personId === 'lunes');
    expect(suyas.length).toBeGreaterThan(0);
    expect(suyas.every((a) => dayOfWeek(fromIso(a.date)) === 1)).toBe(true);
  });

  // `[]` es "ninguna responsabilidad", que es distinto de `null`. Sirve para
  // apartar a alguien del reparto sin desactivarlo ni perder su historial.
  it('allowedTypeKeys vacío deja a la persona fuera de todo el reparto', () => {
    const apartado = conRestricciones('fuera', { allowedTypeKeys: [] });
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [apartado, ...people(9)],
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    expect(out.assignments.some((a) => a.personId === 'fuera')).toBe(false);
  });

  it('si nadie puede una responsabilidad, sus casillas quedan vacías y se explica por qué', () => {
    const restringidos = people(6).map((p) => ({
      ...p,
      allowedTypeKeys: ['acomodador_entrada'],
    }));
    const input = makeInput({
      ...SEPTIEMBRE,
      people: restringidos,
      assignmentTypes: personTypesOnly(),
    });
    const out = generateProgram(input);

    const pasillos = out.assignments.filter((a) => a.typeKey === 'pasillo_izquierdo');
    expect(pasillos).toHaveLength(8);
    expect(pasillos.every((a) => a.personId === null)).toBe(true);
    expect(pasillos.every((a) => a.unfilledReason === 'NO_ELIGIBLE_CANDIDATE')).toBe(true);
    expect(warningCodes(out)).toContain('SLOT_UNFILLED');
    expect(
      out.warnings.some((w) => w.message.includes('habilitada para ese día de la semana')),
    ).toBe(true);
  });

  // El pase de mejora permuta ocupantes, y una permuta conserva las cargas
  // pero no las restricciones. Sin el predicado de aptitud del paso 8, este
  // test coloca a "mayor" en un pasillo.
  it('el pase de mejora no coloca a nadie donde tiene vetado estar', () => {
    const mayor = { ...person('mayor'), allowedTypeKeys: ['acomodador_auditorio'] };
    const sinSabados = { ...person('nosab'), blockedDaysOfWeek: [6] };
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [mayor, sinSabados, ...people(10)],
      assignmentTypes: personTypesOnly(),
      settings: makeSettings({ runRepairPass: true, maxRepairIterations: 500 }),
    });
    const out = generateProgram(input);

    for (const a of out.assignments.filter((x) => x.personId === 'mayor')) {
      expect(a.typeKey).toBe('acomodador_auditorio');
    }
    for (const a of out.assignments.filter((x) => x.personId === 'nosab')) {
      expect(dayOfWeek(fromIso(a.date))).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// 10 · Regla de capitanes y auxiliares
// ---------------------------------------------------------------------------

describe('regla de capitanes — el equipo que limpia pone también entrada y auditorio', () => {
  const SEPTIEMBRE = { year: 2026, month: 9 } as const;

  /** Cuatro equipos de dos grupos, como los pares reales: 1y5, 2y6, 3y7, 4y8. */
  function gruposEmparejados(): Group[] {
    const out: Group[] = [];
    for (let i = 1; i <= 4; i++) {
      out.push({ id: `g${i}`, name: `${i}`, teamId: `e${i}`, order: 1, active: true });
      out.push({ id: `g${i + 4}`, name: `${i + 4}`, teamId: `e${i}`, order: 2, active: true });
    }
    return out;
  }

  function equipos(): Team[] {
    return [1, 2, 3, 4].map((i) => team(`e${i}`, i));
  }

  /** Capitán y auxiliar de cada uno de los 8 grupos: 16 personas con papel. */
  function plantilla(): Person[] {
    const out: Person[] = [];
    for (let g = 1; g <= 8; g++) {
      for (const role of ['CAPTAIN', 'ASSISTANT'] as const satisfies readonly GroupRole[]) {
        out.push({
          ...person(`g${g}-${role === 'CAPTAIN' ? 'cap' : 'aux'}`),
          groupId: `g${g}`,
          role,
        });
      }
    }
    return out;
  }

  const REGLA = {
    enabled: true,
    sourceTypeKey: 'aseo',
    targetTypeKeys: ['acomodador_entrada', 'acomodador_auditorio'],
  };

  function reservaDe(
    out: ReturnType<typeof generateProgram>,
    date: string,
    groups: readonly Group[],
  ): Set<string> {
    const teamId = out.assignments.find((a) => a.date === date && a.typeKey === 'aseo')?.teamId;
    const gruposDelEquipo = new Set(groups.filter((g) => g.teamId === teamId).map((g) => g.id));
    return new Set(
      plantilla()
        .filter((p) => p.groupId !== null && gruposDelEquipo.has(p.groupId))
        .filter((p) => p.role === 'CAPTAIN' || p.role === 'ASSISTANT')
        .map((p) => p.id),
    );
  }

  it('entrada y auditorio los cubren siempre capitanes o auxiliares del equipo que limpia ese día', () => {
    const groups = gruposEmparejados();
    const input = makeInput({
      ...SEPTIEMBRE,
      people: plantilla(),
      teams: equipos(),
      groups,
      settings: makeSettings({ captainRule: REGLA }),
    });
    const out = generateProgram(input);

    expect(out.warnings.some((w) => w.code === 'CAPTAIN_RULE_UNMET')).toBe(false);

    for (const fecha of out.dates) {
      const reserva = reservaDe(out, fecha.date, groups);
      expect(reserva.size).toBe(4); // 2 grupos × (capitán + auxiliar)

      const entrada = out.assignments.find(
        (a) => a.date === fecha.date && a.typeKey === 'acomodador_entrada',
      );
      const auditorio = out.assignments.find(
        (a) => a.date === fecha.date && a.typeKey === 'acomodador_auditorio',
      );

      expect(entrada?.personId).not.toBeNull();
      expect(auditorio?.personId).not.toBeNull();
      expect(reserva.has(entrada?.personId ?? '')).toBe(true);
      expect(reserva.has(auditorio?.personId ?? '')).toBe(true);
      // "Uno en la entrada y otro en el auditorio": nunca la misma persona.
      expect(entrada?.personId).not.toBe(auditorio?.personId);
    }
  });

  it('los pasillos siguen abiertos a todos: la regla solo gobierna sus dos responsabilidades', () => {
    const groups = gruposEmparejados();
    const input = makeInput({
      ...SEPTIEMBRE,
      people: plantilla(),
      teams: equipos(),
      groups,
      settings: makeSettings({ captainRule: REGLA }),
    });
    const out = generateProgram(input);

    let cubiertosPorFuera = 0;
    for (const fecha of out.dates) {
      const reserva = reservaDe(out, fecha.date, groups);
      const pasillos = out.assignments.filter(
        (a) => a.date === fecha.date && a.typeKey.startsWith('pasillo_'),
      );
      expect(pasillos).toHaveLength(2);
      expect(pasillos.every((a) => a.personId !== null)).toBe(true);
      cubiertosPorFuera += pasillos.filter((a) => !reserva.has(a.personId ?? '')).length;
    }
    // Si la regla se hubiera escapado a los pasillos, esto sería cero.
    expect(cubiertosPorFuera).toBeGreaterThan(0);
  });

  // La respuesta explícita del administrador: la regla es dura y manda sobre
  // el tope mensual. Con solo dos personas en la reserva y 8 fechas, cada una
  // acaba muy por encima de su cupo, y aun así la regla se respeta.
  it('la regla manda sobre el tope mensual: una reserva mínima cubre igualmente todas las fechas', () => {
    const groups: Group[] = [
      { id: 'g1', name: '1', teamId: 'e1', order: 1, active: true },
      { id: 'g5', name: '5', teamId: 'e1', order: 2, active: true },
    ];
    const reserva: Person[] = [
      { ...person('cap1'), groupId: 'g1', role: 'CAPTAIN' },
      { ...person('aux5'), groupId: 'g5', role: 'ASSISTANT' },
    ];
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [...reserva, ...people(12)],
      teams: [team('e1', 1)],
      groups,
      settings: makeSettings({ captainRule: REGLA }),
    });
    const out = generateProgram(input);

    const gobernadas = out.assignments.filter((a) => REGLA.targetTypeKeys.includes(a.typeKey));
    expect(gobernadas).toHaveLength(16); // 8 fechas × 2 responsabilidades
    expect(gobernadas.every((a) => a.personId === 'cap1' || a.personId === 'aux5')).toBe(true);

    const veces = gobernadas.filter((a) => a.personId === 'cap1').length;
    expect(veces).toBeGreaterThan(out.stats.personTarget.cap);
    expect(out.warnings.some((w) => w.code === 'CAPTAIN_RULE_UNMET')).toBe(false);
  });

  // La otra respuesta explícita: cuando la reserva no puede, se rellena con
  // otra persona apta y se avisa. Un programa completo con una nota vale más
  // que un hueco silencioso.
  it('si la reserva no puede cubrirla, se asigna a otra persona y se avisa (CAPTAIN_RULE_UNMET)', () => {
    const groups: Group[] = [{ id: 'g1', name: '1', teamId: 'e1', order: 1, active: true }];
    // Un único capitán, y solo puede el auditorio: la entrada se queda sin
    // reserva posible, caiga el día que caiga.
    const capitan: Person = {
      ...person('cap1'),
      groupId: 'g1',
      role: 'CAPTAIN',
      allowedTypeKeys: ['acomodador_auditorio'],
    };
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [capitan, ...people(8)],
      teams: [team('e1', 1)],
      groups,
      settings: makeSettings({ captainRule: REGLA }),
    });
    const out = generateProgram(input);

    const entradas = out.assignments.filter((a) => a.typeKey === 'acomodador_entrada');
    expect(entradas.every((a) => a.personId !== null)).toBe(true);
    expect(entradas.every((a) => a.personId !== 'cap1')).toBe(true);

    const avisos = out.warnings.filter((w) => w.code === 'CAPTAIN_RULE_UNMET');
    expect(avisos).toHaveLength(8);
    expect(avisos.every((w) => w.typeKey === 'acomodador_entrada')).toBe(true);

    // El auditorio sí puede cumplirla, y la cumple.
    const auditorios = out.assignments.filter((a) => a.typeKey === 'acomodador_auditorio');
    expect(auditorios.every((a) => a.personId === 'cap1')).toBe(true);
  });

  it('un MEMBER del grupo que limpia no entra en la reserva: solo capitanes y auxiliares', () => {
    const groups: Group[] = [{ id: 'g1', name: '1', teamId: 'e1', order: 1, active: true }];
    const miembro: Person = { ...person('miembro'), groupId: 'g1', role: 'MEMBER' };
    const capitan: Person = { ...person('cap1'), groupId: 'g1', role: 'CAPTAIN' };
    const auxiliar: Person = { ...person('aux1'), groupId: 'g1', role: 'ASSISTANT' };
    const input = makeInput({
      ...SEPTIEMBRE,
      people: [miembro, capitan, auxiliar, ...people(6)],
      teams: [team('e1', 1)],
      groups,
      settings: makeSettings({ captainRule: REGLA }),
    });
    const out = generateProgram(input);

    const gobernadas = out.assignments.filter((a) => REGLA.targetTypeKeys.includes(a.typeKey));
    expect(gobernadas.some((a) => a.personId === 'miembro')).toBe(false);
    expect(gobernadas.every((a) => a.personId === 'cap1' || a.personId === 'aux1')).toBe(true);
  });

  it('con la regla apagada, tener grupos y papeles no cambia nada del reparto', () => {
    const base = {
      ...SEPTIEMBRE,
      teams: equipos(),
      groups: gruposEmparejados(),
    };
    const conPapeles = generateProgram(makeInput({ ...base, people: plantilla() }));
    const sinPapeles = generateProgram(
      makeInput({ ...base, people: plantilla().map((p) => ({ ...p, ...SIN_RESTRICCIONES })) }),
    );

    expect(JSON.stringify(conPapeles.assignments)).toBe(JSON.stringify(sinPapeles.assignments));
  });
});

// ---------------------------------------------------------------------------
// 11 · El pase de mejora frente a la regla de capitanes
// ---------------------------------------------------------------------------

describe('pase de mejora con la regla de capitanes activa', () => {
  const SEPTIEMBRE = { year: 2026, month: 9 } as const;

  const REGLA = {
    enabled: true,
    sourceTypeKey: 'aseo',
    targetTypeKeys: ['acomodador_entrada', 'acomodador_auditorio'],
  };

  function escenario(mes: number = SEPTIEMBRE.month, seed = 1): GenerateInput {
    const groups: Group[] = [];
    const plantilla: Person[] = [];
    for (let i = 1; i <= 4; i++) {
      groups.push({ id: `g${i}`, name: `${i}`, teamId: `e${i}`, order: 1, active: true });
      groups.push({ id: `g${i + 4}`, name: `${i + 4}`, teamId: `e${i}`, order: 2, active: true });
    }
    for (let g = 1; g <= 8; g++) {
      plantilla.push({ ...person(`g${g}-cap`), groupId: `g${g}`, role: 'CAPTAIN' });
      plantilla.push({ ...person(`g${g}-aux`), groupId: `g${g}`, role: 'ASSISTANT' });
    }

    return makeInput({
      year: SEPTIEMBRE.year,
      month: mes,
      people: plantilla,
      teams: [1, 2, 3, 4].map((i) => team(`e${i}`, i)),
      groups,
      seed,
      settings: makeSettings({
        captainRule: REGLA,
        runRepairPass: true,
        maxRepairIterations: 500,
      }),
    });
  }

  /**
   * El fallo que este test existe para impedir: de la casilla de aseo cuelga
   * la reserva de capitanes de esa fecha. Si el paso 8 mueve un equipo de día
   * después de repartir, la entrada y el auditorio de las DOS fechas quedan
   * asignados a capitanes de un equipo que ya no limpia ahí — sin aviso y sin
   * que nada lo delate salvo mirar la tabla.
   */
  // Se barren los doce meses y varias semillas a propósito: el pase de mejora
  // solo mueve un equipo cuando encuentra una mejora concreta, así que un mes
  // suelto puede pasar el test sin que la protección exista siquiera.
  it('no mueve de fecha el equipo del tipo fuente: de él cuelga la reserva del día', () => {
    const aseoDe = (out: ReturnType<typeof generateProgram>) =>
      out.assignments
        .filter((a) => a.typeKey === 'aseo')
        .map((a) => `${a.date}:${a.teamId ?? '—'}`);

    for (let mes = 1; mes <= 12; mes++) {
      for (const seed of [0, 1, 2, 7]) {
        const input = escenario(mes, seed);
        const conMejora = generateProgram(input);
        const sinMejora = generateProgram({
          ...input,
          settings: { ...input.settings, runRepairPass: false },
        });
        expect(aseoDe(conMejora), `mes ${mes}, seed ${seed}`).toEqual(aseoDe(sinMejora));
      }
    }
  });

  it('la regla se sigue cumpliendo después del pase de mejora', () => {
    const input = escenario();
    const out = generateProgram(input);
    const porId = new Map(input.people.map((p) => [p.id, p] as const));

    for (const fecha of out.dates) {
      const teamId = out.assignments.find(
        (a) => a.date === fecha.date && a.typeKey === 'aseo',
      )?.teamId;
      const gruposDelEquipo = new Set(
        input.groups.filter((g) => g.teamId === teamId).map((g) => g.id),
      );

      for (const typeKey of REGLA.targetTypeKeys) {
        const casilla = out.assignments.find(
          (a) => a.date === fecha.date && a.typeKey === typeKey,
        );
        const persona = casilla?.personId === undefined ? undefined : porId.get(casilla.personId ?? '');
        expect(persona).toBeDefined();
        expect(persona?.groupId !== null && gruposDelEquipo.has(persona?.groupId ?? '')).toBe(true);
        expect(persona?.role === 'CAPTAIN' || persona?.role === 'ASSISTANT').toBe(true);
      }
    }
  });

  // Congelar el tipo fuente no debe congelar el resto: hospitalidad no
  // gobierna ninguna reserva y el pase de mejora sigue pudiendo reordenarla.
  it('los demás tipos de equipo siguen siendo intercambiables', () => {
    const input = escenario();
    const out = generateProgram(input);
    const hospitalidad = out.assignments.filter((a) => a.typeKey === 'hospitalidad');
    expect(hospitalidad.length).toBe(4);
    expect(hospitalidad.every((a) => a.teamId !== null)).toBe(true);
  });
});
