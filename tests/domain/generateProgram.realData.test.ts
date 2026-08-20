import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateProgram } from '../../src/domain/generateProgram';
import { dayOfWeek, fromIso } from '../../src/domain/dates';
import type {
  AssignmentType,
  GenerateInput,
  Group,
  HistoricalAssignment,
  Person,
  Team,
} from '../../src/domain/types';

// La prueba de fuego: los datos REALES de la hoja de referencia.
//
// Todo lo demás comprueba propiedades sobre plantillas inventadas. Esto
// comprueba que, con las 19 personas, los 4 equipos y las 6 responsabilidades
// que se usan de verdad, generar el mes siguiente produce un programa que un
// humano firmaría. Si esta prueba falla, da igual lo verde que esté el resto.

interface SeedData {
  assignmentTypes: AssignmentType[];
  people: Person[];
  teams: Team[];
  groups: Group[];
  historicalProgram: {
    year: number;
    month: number;
    rows: Array<{
      date: string;
      people: Record<string, string>;
      teams: Record<string, string>;
    }>;
  };
}

const seed = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../scripts/seed-data.json', import.meta.url)), 'utf-8'),
) as SeedData;

/** Agosto de 2026, tal y como está en la hoja, como historial. */
const historia: HistoricalAssignment[] = seed.historicalProgram.rows.flatMap((row) => {
  const out: HistoricalAssignment[] = [];
  for (const [typeKey, personId] of Object.entries(row.people)) {
    out.push({ date: row.date, typeKey, kind: 'PERSON', personId, teamId: null });
  }
  for (const [typeKey, teamId] of Object.entries(row.teams)) {
    out.push({ date: row.date, typeKey, kind: 'GROUP', personId: null, teamId });
  }
  return out;
});

/** Septiembre de 2026: 4 lunes (7, 14, 21, 28) y 4 sábados (5, 12, 19, 26). */
const input: GenerateInput = {
  year: 2026,
  month: 9,
  people: seed.people,
  teams: seed.teams,
  groups: seed.groups,
  assignmentTypes: seed.assignmentTypes,
  previousAssignments: historia,
  lockedAssignments: [],
  settings: {
    historyWindowMonths: 6,
    allowMultiplePerDay: false,
    allowTeamTwiceSameDate: false,
    runRepairPass: true,
    maxRepairIterations: 200,
    // La hoja de referencia no dice quién es capitán de qué grupo, así que la
    // regla viaja apagada en la semilla y este fichero comprueba el reparto
    // "de siempre". La regla tiene sus propios casos en el fichero de casos
    // límite, con memberships escritas a mano.
    captainRule: { enabled: false, sourceTypeKey: '', targetTypeKeys: [] },
  },
  seed: 20260901,
};

describe('generateProgram con los datos reales de la hoja', () => {
  const out = generateProgram(input);

  it('la historia de agosto se leyó completa', () => {
    expect(historia.filter((h) => h.kind === 'PERSON')).toHaveLength(36);
    expect(historia.filter((h) => h.kind === 'GROUP')).toHaveLength(13);
  });

  it('genera los 8 días correctos de septiembre de 2026', () => {
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
    for (const d of out.dates) {
      expect([1, 6]).toContain(dayOfWeek(fromIso(d.date)));
    }
  });

  it('no deja ninguna casilla sin cubrir y no emite avisos', () => {
    const sinCubrir = out.assignments.filter((a) => a.unfilledReason !== null);
    expect(sinCubrir).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('hospitalidad solo aparece en sábados', () => {
    for (const a of out.assignments.filter((x) => x.typeKey === 'hospitalidad')) {
      expect(dayOfWeek(fromIso(a.date))).toBe(6);
    }
    expect(out.assignments.filter((a) => a.typeKey === 'hospitalidad')).toHaveLength(4);
  });

  it('nadie recibe dos responsabilidades el mismo día', () => {
    const porFecha = new Map<string, string[]>();
    for (const a of out.assignments) {
      if (a.personId === null) continue;
      const lista = porFecha.get(a.date) ?? [];
      lista.push(a.personId);
      porFecha.set(a.date, lista);
    }
    for (const [fecha, ids] of porFecha) {
      expect(new Set(ids).size, `día ${fecha}`).toBe(ids.length);
      expect(ids).toHaveLength(4); // las 4 responsabilidades de persona
    }
  });

  it('reparte 32 casillas entre 19 personas con el tope calculado, sin favoritos', () => {
    // 8 fechas × 4 responsabilidades = 32 casillas para 19 personas.
    // base = 1, resto = 13, tope = 2 → 13 personas con 2 y 6 con 1.
    expect(out.stats.personSlots).toBe(32);
    expect(out.stats.personTarget).toEqual({ base: 1, remainder: 13, cap: 2 });

    const conteo = new Map<string, number>();
    for (const a of out.assignments) {
      if (a.personId === null) continue;
      conteo.set(a.personId, (conteo.get(a.personId) ?? 0) + 1);
    }
    const cargas = seed.people.map((p) => conteo.get(p.id) ?? 0);
    expect(cargas.reduce((a, b) => a + b, 0)).toBe(32);
    expect(Math.min(...cargas)).toBe(1);
    expect(Math.max(...cargas)).toBe(2);
    expect(cargas.filter((c) => c === 2)).toHaveLength(13);
    expect(cargas.filter((c) => c === 1)).toHaveLength(6);
  });

  it('reparte 12 casillas entre los 4 equipos: tres cada uno', () => {
    // 8 aseo + 4 hospitalidad = 12 casillas, 4 equipos → exactamente 3 cada uno.
    expect(out.stats.teamSlots).toBe(12);
    expect(out.stats.teamTarget).toEqual({ base: 3, remainder: 0, cap: 3 });

    const conteo = new Map<string, number>();
    for (const a of out.assignments) {
      if (a.teamId === null) continue;
      conteo.set(a.teamId, (conteo.get(a.teamId) ?? 0) + 1);
    }
    for (const team of seed.teams) {
      expect(conteo.get(team.id), `equipo ${team.id}`).toBe(3);
    }
  });

  it('ningún equipo hace aseo y hospitalidad el mismo sábado', () => {
    const porFecha = new Map<string, string[]>();
    for (const a of out.assignments) {
      if (a.teamId === null) continue;
      const lista = porFecha.get(a.date) ?? [];
      lista.push(a.teamId);
      porFecha.set(a.date, lista);
    }
    for (const [fecha, ids] of porFecha) {
      expect(new Set(ids).size, `día ${fecha}`).toBe(ids.length);
    }
  });

  it('rota las responsabilidades: quien repite no hace dos veces lo mismo', () => {
    const porPersonaYTipo = new Map<string, Set<string>>();
    const veces = new Map<string, number>();
    for (const a of out.assignments) {
      if (a.personId === null) continue;
      const set = porPersonaYTipo.get(a.personId) ?? new Set<string>();
      set.add(a.typeKey);
      porPersonaYTipo.set(a.personId, set);
      veces.set(a.personId, (veces.get(a.personId) ?? 0) + 1);
    }
    for (const [personId, total] of veces) {
      // Nadie con 2 asignaciones las tiene en la misma responsabilidad.
      expect(porPersonaYTipo.get(personId)?.size, `persona ${personId}`).toBe(total);
    }
  });

  it('tiene en cuenta agosto: casi nadie repite en septiembre el rol que ya hizo', () => {
    // NO se exige cero, y no es una concesión: es la consecuencia directa de la
    // prioridad fijada en docs/algoritmo.md. El primer criterio de coste es el
    // equilibrio del mes; la rotación de tipo es el segundo. Cuando quedan
    // pocas personas con la carga más baja y ninguna está "limpia" para esa
    // responsabilidad, el algoritmo prefiere repetir el rol antes que
    // desequilibrar el mes — que es exactamente lo que pide CLAUDE.md.
    //
    // Con esta plantilla real el resultado es 1 repetición de 32 casillas. El
    // umbral de 2 deja margen para que un cambio legítimo de desempate no
    // rompa el test, pero se romperá si alguien invierte el orden de los
    // criterios y la rotación deja de funcionar de verdad.
    const agosto = new Map<string, Set<string>>();
    for (const h of historia) {
      if (h.personId === null) continue;
      const set = agosto.get(h.personId) ?? new Set<string>();
      set.add(h.typeKey);
      agosto.set(h.personId, set);
    }
    const repiten: string[] = [];
    for (const a of out.assignments) {
      if (a.personId === null) continue;
      if (agosto.get(a.personId)?.has(a.typeKey)) {
        repiten.push(`${a.personId} repite ${a.typeKey}`);
      }
    }
    expect(repiten.length, `repeticiones: ${repiten.join(', ')}`).toBeLessThanOrEqual(2);
  });

  it('es reproducible, y una variante distinta cambia el reparto sin romperlo', () => {
    expect(JSON.stringify(generateProgram(input))).toBe(JSON.stringify(out));

    const variante = generateProgram({ ...input, seed: input.seed + 1 });
    expect(JSON.stringify(variante)).not.toBe(JSON.stringify(out));
    expect(variante.warnings).toEqual([]);
    expect(variante.stats.personTarget).toEqual(out.stats.personTarget);
  });

  it('la traza explica cada casilla', () => {
    expect(out.trace.slots).toHaveLength(out.assignments.length);
    expect(out.trace.costLabelsPerson.length).toBeGreaterThan(0);
    for (const slot of out.trace.slots) {
      expect(slot.outcome).toBe('CHOSEN');
      expect(slot.chosenId).not.toBeNull();

      if (slot.changedByRepair) {
        // Una casilla movida por el pase de mejora no tiene tupla, y es
        // correcto: ahí nadie "ganó una comparación", se intercambió por el
        // objetivo global. La UI debe explicarla con ese motivo, no con
        // números. Lo que no puede pasar es quedarse sin ninguna explicación.
        expect(slot.chosenCost).toBeNull();
      } else {
        expect(slot.chosenCost).not.toBeNull();
        expect(slot.chosenCost?.length).toBe(
          out.assignments.find(
            (a) =>
              a.date === slot.date &&
              a.typeKey === slot.typeKey &&
              a.slotIndex === slot.slotIndex,
          )?.kind === 'PERSON'
            ? out.trace.costLabelsPerson.length
            : out.trace.costLabelsTeam.length,
        );
      }
    }

    // Toda casilla queda explicada de una de las dos formas.
    expect(
      out.trace.slots.every((s) => s.chosenCost !== null || s.changedByRepair),
    ).toBe(true);
  });
});
