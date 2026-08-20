import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateProgram } from '../../src/domain/generateProgram';
import { dayOfWeek, fromIso, monthKey } from '../../src/domain/dates';
import { allowsDay, allowsType, captainPool } from '../../src/domain/eligibility';
import type {
  AssignmentType,
  CaptainRuleSettings,
  GenerateInput,
  GenerationSettings,
  Group,
  GroupRole,
  HistoricalAssignment,
  LockedAssignment,
  Person,
  Team,
} from '../../src/domain/types';

// Invariantes de generateProgram, comprobadas con fast-check sobre plantillas
// generadas al azar en vez de sobre un puñado de casos escritos a mano.
//
// Estas son las propiedades que NO pueden fallar nunca, pase lo que pase con la
// plantilla de personas, equipos, responsabilidades o bloqueos. Están numeradas
// igual que la tabla final de docs/algoritmo.md.
//
// Un fallo aquí no es "un test quisquilloso": significa que el programa que se
// imprime y se reparte puede poner a alguien dos veces el mismo día, olvidar a
// una persona un mes entero o dejar de ser reproducible.

const RUNS = 200;

// El pase de mejora es O(casillas² × iteraciones). Con plantillas realistas
// (36 casillas) eso es trivial, pero un generador sin freno puede producir
// cientos de casillas y hacer que la suite tarde minutos sin aportar nada:
// una plantilla con 7 responsabilidades de 3 cupos los 7 días de la semana no
// existe en la vida real. Los máximos de abajo mantienen la variedad donde
// importa (personas, equipos, inactivos, bloqueos, huecos) y acotan lo que
// solo hace lento el test.
const TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------

/**
 * Persona sin ninguna restricción. Las invariantes INV1-INV11 se comprueban
 * sobre plantillas SIN restringir a propósito: son propiedades del reparto
 * equilibrado, y las restricciones tienen su propio bloque más abajo con las
 * invariantes que de verdad les corresponden.
 */
const SIN_RESTRICCIONES = {
  groupId: null,
  role: 'MEMBER',
  allowedTypeKeys: null,
  blockedDaysOfWeek: [],
} as const satisfies Omit<Person, 'id' | 'name' | 'active'>;

const REGLA_CAPITANES_APAGADA: CaptainRuleSettings = {
  enabled: false,
  sourceTypeKey: '',
  targetTypeKeys: [],
};

const peopleArb = fc
  .array(fc.boolean(), { minLength: 0, maxLength: 26 })
  .map((flags): Person[] =>
    flags.map((active, i) => ({
      id: `p${String(i).padStart(3, '0')}`,
      name: `Persona ${i}`,
      active,
      ...SIN_RESTRICCIONES,
    })),
  );

const teamsArb = fc
  .array(fc.boolean(), { minLength: 0, maxLength: 10 })
  .map((flags): Team[] =>
    flags.map((active, i) => ({
      id: `e${String(i).padStart(2, '0')}`,
      displayName: null,
      order: i + 1,
      active,
    })),
  );

const typesArb = fc
  .array(
    fc.record({
      kind: fc.constantFrom('PERSON' as const, 'GROUP' as const),
      daysOfWeek: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), {
        minLength: 1,
        maxLength: 3,
      }),
      slotsPerDate: fc.integer({ min: 1, max: 2 }),
      active: fc.boolean(),
    }),
    { minLength: 0, maxLength: 6 },
  )
  .map((raw): AssignmentType[] =>
    raw.map((t, i) => ({
      id: `t${i}`,
      key: `tipo_${i}`,
      label: `Responsabilidad ${i}`,
      kind: t.kind,
      daysOfWeek: t.daysOfWeek,
      slotsPerDate: t.slotsPerDate,
      order: i + 1,
      icon: 'dot',
      active: t.active,
    })),
  );

const settingsArb: fc.Arbitrary<GenerationSettings> = fc.record({
  historyWindowMonths: fc.constantFrom(0, 1, 3, 6),
  allowMultiplePerDay: fc.boolean(),
  allowTeamTwiceSameDate: fc.boolean(),
  runRepairPass: fc.boolean(),
  maxRepairIterations: fc.constantFrom(0, 20, 60),
  captainRule: fc.constant(REGLA_CAPITANES_APAGADA),
});

/** Historial en meses anteriores al generado, referido a ids que existen. */
function historyArb(
  people: readonly Person[],
  teams: readonly Team[],
  types: readonly AssignmentType[],
  year: number,
  month: number,
): fc.Arbitrary<HistoricalAssignment[]> {
  if (people.length === 0 || types.length === 0) return fc.constant([]);
  return fc.array(
    fc.record({
      monthsBack: fc.integer({ min: 1, max: 8 }),
      day: fc.integer({ min: 1, max: 28 }),
      typeIdx: fc.integer({ min: 0, max: types.length - 1 }),
      personIdx: fc.integer({ min: 0, max: Math.max(0, people.length - 1) }),
      teamIdx: fc.integer({ min: 0, max: Math.max(0, teams.length - 1) }),
    }),
    { maxLength: 40 },
  ).map((rows) =>
    rows.flatMap((r): HistoricalAssignment[] => {
      const type = types[r.typeIdx];
      if (type === undefined) return [];
      const total = year * 12 + (month - 1) - r.monthsBack;
      const y = Math.floor(total / 12);
      const m = (total % 12) + 1;
      const date = `${monthKey(y, m)}-${String(r.day).padStart(2, '0')}`;
      if (type.kind === 'PERSON') {
        const person = people[r.personIdx];
        if (person === undefined) return [];
        return [{ date, typeKey: type.key, kind: 'PERSON', personId: person.id, teamId: null }];
      }
      const team = teams[r.teamIdx];
      if (team === undefined) return [];
      return [{ date, typeKey: type.key, kind: 'GROUP', personId: null, teamId: team.id }];
    }),
  );
}

/**
 * Bloqueos que de verdad corresponden a casillas existentes. Se derivan de una
 * primera generación sin bloqueos: así el test comprueba de verdad la invariante
 * 5 en vez de generar bloqueos que el algoritmo descarta por no casar con nada.
 */
function locksFrom(input: GenerateInput, keep: readonly number[]): LockedAssignment[] {
  const first = generateProgram({ ...input, lockedAssignments: [] });
  const filled = first.assignments.filter(
    (a) => a.personId !== null || a.teamId !== null,
  );
  return keep
    .map((idx) => filled[idx % Math.max(1, filled.length)])
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .map((a) => ({
      date: a.date,
      typeKey: a.typeKey,
      slotIndex: a.slotIndex,
      personId: a.personId,
      teamId: a.teamId,
    }));
}

const inputArb: fc.Arbitrary<GenerateInput> = fc
  .record({
    year: fc.integer({ min: 2024, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    people: peopleArb,
    teams: teamsArb,
    assignmentTypes: typesArb,
    settings: settingsArb,
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  })
  .chain((base) =>
    historyArb(base.people, base.teams, base.assignmentTypes, base.year, base.month).map(
      (previousAssignments): GenerateInput => ({
        ...base,
        groups: [],
        previousAssignments,
        lockedAssignments: [],
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Plantillas CON restricciones y regla de capitanes
//
// Aparte de las de arriba y no mezcladas con ellas: una plantilla restringida
// puede dejar a alguien a cero un mes entero sin que eso sea un fallo, así que
// no sirve para comprobar el equilibrio. Lo que sí tiene que cumplir es que
// una restricción declarada NUNCA se incumpla en silencio.
// ---------------------------------------------------------------------------

/** Las claves que produce `typesArb`; una restricción puede nombrar cualquiera. */
const CLAVES_POSIBLES = ['tipo_0', 'tipo_1', 'tipo_2', 'tipo_3', 'tipo_4', 'tipo_5'] as const;

/** Dos grupos por equipo, como los pares reales de la congregación (1 y 5, 2 y 6…). */
function gruposDe(teams: readonly Team[]): Group[] {
  return teams.flatMap((t, i): Group[] => [
    { id: `${t.id}-ga`, name: `${i + 1}`, teamId: t.id, order: 1, active: true },
    { id: `${t.id}-gb`, name: `${i + 5}`, teamId: t.id, order: 2, active: true },
  ]);
}

const personaRestringidaArb = fc.record({
  active: fc.boolean(),
  ranuraGrupo: fc.option(fc.nat({ max: 25 }), { nil: null }),
  role: fc.constantFrom<GroupRole>('CAPTAIN', 'ASSISTANT', 'MEMBER'),
  // `null` = sin restricción; una lista (incluso vacía) = solo esas.
  allowedTypeKeys: fc.option(
    fc.uniqueArray(fc.constantFrom(...CLAVES_POSIBLES), { maxLength: 6 }),
    { nil: null },
  ),
  blockedDaysOfWeek: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 3 }),
});

const restrictedInputArb: fc.Arbitrary<GenerateInput> = fc
  .record({
    year: fc.integer({ min: 2024, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    plantillaPersonas: fc.array(personaRestringidaArb, { minLength: 0, maxLength: 26 }),
    teams: teamsArb,
    assignmentTypes: typesArb,
    settings: settingsArb,
    reglaActiva: fc.boolean(),
    objetivos: fc.uniqueArray(fc.constantFrom(...CLAVES_POSIBLES), { maxLength: 3 }),
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  })
  .map((base) => {
    const groups = gruposDe(base.teams);
    const people: Person[] = base.plantillaPersonas.map((raw, i) => ({
      id: `p${String(i).padStart(3, '0')}`,
      name: `Persona ${i}`,
      active: raw.active,
      groupId:
        raw.ranuraGrupo === null || groups.length === 0
          ? null
          : (groups[raw.ranuraGrupo % groups.length]?.id ?? null),
      role: raw.role,
      allowedTypeKeys: raw.allowedTypeKeys,
      blockedDaysOfWeek: raw.blockedDaysOfWeek,
    }));

    // El tipo fuente tiene que ser de equipo: es de su casilla de donde sale
    // el equipo que define la reserva del día.
    const fuente = base.assignmentTypes.find((t) => t.kind === 'GROUP' && t.active);
    const captainRule: CaptainRuleSettings = {
      enabled: base.reglaActiva,
      sourceTypeKey: fuente?.key ?? '',
      targetTypeKeys: base.objetivos,
    };

    return {
      ...base,
      people,
      groups,
      settings: { ...base.settings, captainRule },
    };
  })
  .chain((base) =>
    historyArb(base.people, base.teams, base.assignmentTypes, base.year, base.month).map(
      (previousAssignments): GenerateInput => ({
        year: base.year,
        month: base.month,
        people: base.people,
        teams: base.teams,
        groups: base.groups,
        assignmentTypes: base.assignmentTypes,
        settings: base.settings,
        seed: base.seed,
        previousAssignments,
        lockedAssignments: [],
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

function activeTypeByKey(input: GenerateInput, key: string): AssignmentType | undefined {
  return input.assignmentTypes.find((t) => t.key === key);
}

function countBy<T>(items: readonly T[], key: (t: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------

describe('invariantes de generateProgram', () => {
  it('INV1 · toda fecha pertenece al mes pedido y a un día válido de algún tipo activo', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        const permitidos = new Set(
          input.assignmentTypes.filter((t) => t.active).flatMap((t) => t.daysOfWeek),
        );
        for (const d of out.dates) {
          const pd = fromIso(d.date);
          expect(pd.y).toBe(input.year);
          expect(pd.m).toBe(input.month);
          expect(permitidos.has(dayOfWeek(pd))).toBe(true);
          expect(d.dayOfWeek).toBe(dayOfWeek(pd));
        }
        // Las fechas no se repiten y van en orden ascendente.
        const isos = out.dates.map((d) => d.date);
        expect([...isos].sort()).toEqual(isos);
        expect(new Set(isos).size).toBe(isos.length);
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV2 · ninguna persona repite día (salvo allowMultiplePerDay)', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        fc.pre(!input.settings.allowMultiplePerDay);
        const out = generateProgram(input);
        const porFecha = new Map<string, Set<string>>();
        for (const a of out.assignments) {
          if (a.personId === null) continue;
          const set = porFecha.get(a.date) ?? new Set<string>();
          expect(set.has(a.personId)).toBe(false);
          set.add(a.personId);
          porFecha.set(a.date, set);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV3 · una responsabilidad solo aparece en los días de su daysOfWeek', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        for (const a of out.assignments) {
          const type = activeTypeByKey(input, a.typeKey);
          expect(type).toBeDefined();
          if (type === undefined) continue;
          expect(type.active).toBe(true);
          expect(type.daysOfWeek).toContain(dayOfWeek(fromIso(a.date)));
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV4 · sin allowTeamTwiceSameDate, ningún equipo repite fecha', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        fc.pre(!input.settings.allowTeamTwiceSameDate);
        const out = generateProgram(input);
        const porFecha = new Map<string, Set<string>>();
        for (const a of out.assignments) {
          if (a.teamId === null) continue;
          const set = porFecha.get(a.date) ?? new Set<string>();
          expect(set.has(a.teamId)).toBe(false);
          set.add(a.teamId);
          porFecha.set(a.date, set);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV5 · las asignaciones bloqueadas aparecen intactas', () => {
    fc.assert(
      fc.property(
        inputArb,
        fc.array(fc.nat({ max: 200 }), { maxLength: 6 }),
        (base, keep) => {
          const locks = locksFrom(base, keep);
          fc.pre(locks.length > 0);
          const out = generateProgram({ ...base, lockedAssignments: locks });
          for (const lock of locks) {
            const found = out.assignments.find(
              (a) =>
                a.date === lock.date &&
                a.typeKey === lock.typeKey &&
                a.slotIndex === lock.slotIndex,
            );
            expect(found).toBeDefined();
            expect(found?.personId ?? null).toBe(lock.personId);
            expect(found?.teamId ?? null).toBe(lock.teamId);
            expect(found?.locked).toBe(true);
          }
        },
      ),
      { numRuns: 150 },
    );
  }, TIMEOUT_MS);

  it('INV6 · ninguna persona ni equipo inactivo aparece, salvo bloqueado y con aviso', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        const inactivos = new Set([
          ...input.people.filter((p) => !p.active).map((p) => p.id),
          ...input.teams.filter((t) => !t.active).map((t) => t.id),
        ]);
        for (const a of out.assignments) {
          const id = a.personId ?? a.teamId;
          if (id === null || !inactivos.has(id)) continue;
          // Solo se admite si venía bloqueado, y entonces tiene que haber aviso.
          expect(a.locked).toBe(true);
          expect(
            out.warnings.some(
              (w) =>
                w.code === 'LOCKED_INACTIVE_PERSON' || w.code === 'LOCKED_INACTIVE_TEAM',
            ),
          ).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV7 · sin bloqueos ni relajación de tope, la carga no se desvía más de 1', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        const activos = input.people.filter((p) => p.active);
        fc.pre(activos.length > 0);
        fc.pre(out.stats.personSlots > 0);
        // La invariante solo se sostiene si se pudo cubrir todo sin ceder.
        fc.pre(!out.warnings.some((w) => w.code === 'CAP_RELAXED'));
        fc.pre(out.assignments.every((a) => a.unfilledReason === null));

        const conteo = countBy(
          out.assignments.filter((a) => a.personId !== null),
          (a) => a.personId as string,
        );
        const cargas = activos.map((p) => conteo.get(p.id) ?? 0);
        expect(Math.max(...cargas) - Math.min(...cargas)).toBeLessThanOrEqual(1);
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV8 · misma entrada y mismo seed producen exactamente la misma salida', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const a = generateProgram(input);
        const b = generateProgram(input);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV9 · toda casilla está cubierta o explica por qué no', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        for (const a of out.assignments) {
          const cubierta = a.personId !== null || a.teamId !== null;
          if (cubierta) {
            expect(a.unfilledReason).toBeNull();
            // Una casilla de persona no lleva equipo, y viceversa.
            if (a.kind === 'PERSON') expect(a.teamId).toBeNull();
            else expect(a.personId).toBeNull();
          } else {
            expect(a.unfilledReason).not.toBeNull();
          }
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV10 · barajar el orden de las entradas no cambia el resultado', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 1, max: 5 }), (input, rot) => {
        const rotate = <T,>(xs: readonly T[]): T[] =>
          xs.length === 0 ? [] : [...xs.slice(rot % xs.length), ...xs.slice(0, rot % xs.length)];

        const original = generateProgram(input);
        const barajado = generateProgram({
          ...input,
          people: rotate(input.people),
          teams: rotate(input.teams),
          assignmentTypes: rotate(input.assignmentTypes),
          previousAssignments: rotate(input.previousAssignments),
        });
        expect(JSON.stringify(barajado)).toBe(JSON.stringify(original));
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV11 · nadie supera el tope salvo bloqueo o aviso de relajación', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        fc.pre(!out.warnings.some((w) => w.code === 'CAP_RELAXED'));

        const bloqueados = new Set(
          out.assignments.filter((a) => a.locked && a.personId !== null).map((a) => a.personId),
        );
        const conteo = countBy(
          out.assignments.filter((a) => a.personId !== null),
          (a) => a.personId as string,
        );
        for (const [personId, carga] of conteo) {
          if (bloqueados.has(personId)) continue;
          expect(carga).toBeLessThanOrEqual(out.stats.personTarget.cap);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('nunca lanza una excepción, por degenerada que sea la plantilla', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(() => generateProgram(input)).not.toThrow();
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('la traza cubre todas las casillas y sus etiquetas están alineadas', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = generateProgram(input);
        expect(out.trace.slots.length).toBe(out.assignments.length);
        expect(out.trace.seed).toBe(input.seed);
        for (const slot of out.trace.slots) {
          if (slot.chosenCost === null) continue;
          const esperado =
            out.assignments.find(
              (a) =>
                a.date === slot.date &&
                a.typeKey === slot.typeKey &&
                a.slotIndex === slot.slotIndex,
            )?.kind === 'PERSON'
              ? out.trace.costLabelsPerson.length
              : out.trace.costLabelsTeam.length;
          expect(slot.chosenCost.length).toBe(esperado);
          for (const runner of slot.runnersUp) {
            expect(runner.cost.length).toBe(esperado);
          }
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// Invariantes bajo restricciones y regla de capitanes
//
// Aquí no se comprueba el equilibrio: una plantilla restringida al azar puede
// dejar legítimamente a alguien a cero. Lo que se comprueba es lo que una
// restricción PROMETE — que no se incumple sin decirlo — y que el resto de
// garantías estructurales sobreviven a tener restricciones encima.
// ---------------------------------------------------------------------------

describe('invariantes de generateProgram con restricciones', () => {
  it('INV12 · nadie recibe una responsabilidad ni un día que tiene vetados', () => {
    fc.assert(
      fc.property(restrictedInputArb, (input) => {
        const out = generateProgram(input);
        const porId = new Map(input.people.map((p) => [p.id, p] as const));

        for (const a of out.assignments) {
          if (a.personId === null) continue;
          const persona = porId.get(a.personId);
          expect(persona).toBeDefined();
          if (persona === undefined) continue;
          expect(allowsDay(persona, dayOfWeek(fromIso(a.date)))).toBe(true);
          expect(allowsType(persona, a.typeKey)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV13 · toda casilla que gobierna la regla la ocupa la reserva del día, o hay aviso', () => {
    fc.assert(
      fc.property(restrictedInputArb, (input) => {
        const regla = input.settings.captainRule;
        fc.pre(regla.enabled && regla.sourceTypeKey !== '' && regla.targetTypeKeys.length > 0);

        const out = generateProgram(input);

        for (const a of out.assignments) {
          if (a.personId === null) continue;
          if (!regla.targetTypeKeys.includes(a.typeKey)) continue;

          // La reserva se compone leyendo el resultado: qué equipo quedó ese
          // día en la casilla del tipo fuente.
          const reserva = new Set<string>();
          for (const fuente of out.assignments) {
            if (fuente.date !== a.date || fuente.typeKey !== regla.sourceTypeKey) continue;
            for (const id of captainPool(input.people, input.groups, fuente.teamId)) {
              reserva.add(id);
            }
          }

          if (reserva.has(a.personId)) continue;

          // Ceder está permitido, callárselo no.
          expect(
            out.warnings.some(
              (w) =>
                w.code === 'CAPTAIN_RULE_UNMET' && w.date === a.date && w.typeKey === a.typeKey,
            ),
          ).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV2, INV4 y INV9 siguen valiendo con restricciones encima', () => {
    fc.assert(
      fc.property(restrictedInputArb, (input) => {
        const out = generateProgram(input);

        const personasPorFecha = new Map<string, Set<string>>();
        const equiposPorFecha = new Map<string, Set<string>>();

        for (const a of out.assignments) {
          const cubierta = a.personId !== null || a.teamId !== null;
          expect(cubierta).toBe(a.unfilledReason === null);

          if (a.personId !== null && !input.settings.allowMultiplePerDay) {
            const set = personasPorFecha.get(a.date) ?? new Set<string>();
            expect(set.has(a.personId)).toBe(false);
            set.add(a.personId);
            personasPorFecha.set(a.date, set);
          }
          if (a.teamId !== null && !input.settings.allowTeamTwiceSameDate) {
            const set = equiposPorFecha.get(a.date) ?? new Set<string>();
            expect(set.has(a.teamId)).toBe(false);
            set.add(a.teamId);
            equiposPorFecha.set(a.date, set);
          }
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV6 · una persona inactiva sigue sin aparecer, tenga las restricciones que tenga', () => {
    fc.assert(
      fc.property(restrictedInputArb, (input) => {
        const out = generateProgram(input);
        const inactivas = new Set(input.people.filter((p) => !p.active).map((p) => p.id));
        for (const a of out.assignments) {
          if (a.personId === null) continue;
          expect(inactivas.has(a.personId)).toBe(false);
        }
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('INV8 e INV10 · sigue siendo determinista e independiente del orden de entrada', () => {
    fc.assert(
      fc.property(restrictedInputArb, fc.integer({ min: 1, max: 5 }), (input, rot) => {
        const rotate = <T,>(xs: readonly T[]): T[] =>
          xs.length === 0 ? [] : [...xs.slice(rot % xs.length), ...xs.slice(0, rot % xs.length)];

        const original = generateProgram(input);
        expect(JSON.stringify(generateProgram(input))).toBe(JSON.stringify(original));

        const barajado = generateProgram({
          ...input,
          people: rotate(input.people),
          teams: rotate(input.teams),
          groups: rotate(input.groups),
          assignmentTypes: rotate(input.assignmentTypes),
          previousAssignments: rotate(input.previousAssignments),
        });
        expect(JSON.stringify(barajado)).toBe(JSON.stringify(original));
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);

  it('nunca lanza, por restringida que esté la plantilla', () => {
    fc.assert(
      fc.property(restrictedInputArb, (input) => {
        expect(() => generateProgram(input)).not.toThrow();
      }),
      { numRuns: RUNS },
    );
  }, TIMEOUT_MS);
});
