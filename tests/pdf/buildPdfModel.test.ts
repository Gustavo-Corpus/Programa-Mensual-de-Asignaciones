import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildPdfModel,
  buildPdfModelFromStored,
  groupIntoWeekCards,
  splitInTwoLines,
} from '@/pdf/buildPdfModel';
import { programaPdfModel } from '@/pdf/fixtures';
import { dayOfWeek, fromIso } from '@/domain/dates';
import type {
  AssignmentType,
  Group,
  Person,
  ProgramDateOut,
  ResolvedAssignment,
  Team,
} from '@/domain/types';
import type { PdfDateRow } from '@/pdf/model';

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
      dayOfWeek: number;
      people: Record<string, string>;
      teams: Record<string, string>;
    }>;
  };
}

const seed = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../scripts/seed-data.json', import.meta.url)), 'utf-8'),
) as SeedData;

const dates: ProgramDateOut[] = seed.historicalProgram.rows.map((row, i) => ({
  date: row.date,
  dayOfWeek: row.dayOfWeek,
  order: i,
}));

const assignments: ResolvedAssignment[] = seed.historicalProgram.rows.flatMap((row) => {
  const out: ResolvedAssignment[] = [];
  for (const [typeKey, personId] of Object.entries(row.people)) {
    out.push({
      date: row.date, typeKey, slotIndex: 0, kind: 'PERSON',
      personId, teamId: null, locked: false, unfilledReason: null,
    });
  }
  for (const [typeKey, teamId] of Object.entries(row.teams)) {
    out.push({
      date: row.date, typeKey, slotIndex: 0, kind: 'GROUP',
      personId: null, teamId, locked: false, unfilledReason: null,
    });
  }
  return out;
});

const model = buildPdfModel({
  year: seed.historicalProgram.year,
  month: seed.historicalProgram.month,
  dates,
  assignments,
  assignmentTypes: seed.assignmentTypes,
  people: seed.people,
  teams: seed.teams,
  groups: seed.groups,
});

describe('buildPdfModel', () => {
  // La prueba que de verdad importa. `programaPdfModel` es la hoja de
  // referencia transcrita A MANO, celda por celda. Si el puente produce lo
  // mismo partiendo de los datos del dominio, el enganche es correcto: no hay
  // margen para que una columna se desplace, un nombre se parta mal o una
  // fecha caiga en la tarjeta equivocada sin que esto se entere.
  it('reproduce exactamente la hoja de referencia transcrita a mano', () => {
    expect(model).toEqual(programaPdfModel);
  });

  it('compone las líneas de un equipo como prefijo + etiqueta, no partiendo el texto', () => {
    // "Grupos 4 y 8" partido por el último espacio daría ["Grupos 4 y", "8"].
    const aseoLunes3 = model.weeks[0]?.rows[0]?.cells[4];
    expect(aseoLunes3?.lines).toEqual(['Grupos', '4 y 8']);
  });

  it('deja vacía la hospitalidad de los lunes', () => {
    for (const week of model.weeks) {
      for (const row of week.rows) {
        const esLunes = dayOfWeek(fromIso(row.date)) === 1;
        const hospitalidad = row.cells[5];
        if (esLunes) expect(hospitalidad?.lines).toEqual([]);
        else expect(hospitalidad?.lines.length).toBeGreaterThan(0);
      }
    }
  });

  it('usa el nombre propio del equipo cuando lo tiene, sin prefijo', () => {
    const conNombre = buildPdfModel({
      year: 2026, month: 8, dates: dates.slice(0, 1),
      assignments: assignments.filter((a) => a.date === dates[0]?.date),
      assignmentTypes: seed.assignmentTypes,
      people: seed.people,
      groups: seed.groups,
      teams: seed.teams.map((t) =>
        t.id === 'e4' ? { ...t, displayName: 'Equipo Norte' } : t,
      ),
    });
    expect(conNombre.weeks[0]?.rows[0]?.cells[4]?.lines).toEqual(['Equipo', 'Norte']);
  });
});

describe('splitInTwoLines', () => {
  it('parte por el último espacio para no romper nombres compuestos', () => {
    expect(splitInTwoLines('Hugo Jiménez')).toEqual(['Hugo', 'Jiménez']);
    expect(splitInTwoLines('Jose M. García')).toEqual(['Jose M.', 'García']);
    expect(splitInTwoLines('Luis M. Priego')).toEqual(['Luis M.', 'Priego']);
  });

  it('aguanta los casos raros', () => {
    expect(splitInTwoLines('Madonna')).toEqual(['Madonna']);
    expect(splitInTwoLines('  ')).toEqual([]);
    expect(splitInTwoLines('')).toEqual([]);
    expect(splitInTwoLines('  Ana  Ruiz  ')).toEqual(['Ana', 'Ruiz']);
  });
});

describe('groupIntoWeekCards', () => {
  const row = (date: string): PdfDateRow => ({
    date, dayName: '', dayNumber: '', monthLabel: '', cells: [],
  });

  it('empareja cada lunes con el sábado de su misma semana', () => {
    // Agosto 2026 completo: empieza en sábado, 5 sábados y 5 lunes.
    const cards = groupIntoWeekCards(
      ['2026-08-01', '2026-08-03', '2026-08-08', '2026-08-10', '2026-08-15',
       '2026-08-17', '2026-08-22', '2026-08-24', '2026-08-29', '2026-08-31'].map(row),
    );
    expect(cards.map((c) => c.rows.map((r) => r.date))).toEqual([
      ['2026-08-01'],
      ['2026-08-03', '2026-08-08'],
      ['2026-08-10', '2026-08-15'],
      ['2026-08-17', '2026-08-22'],
      ['2026-08-24', '2026-08-29'],
      ['2026-08-31'],
    ]);
  });

  it('no se desalinea cuando falta una fecha', () => {
    // Si se agrupara de dos en dos por posición, quitar el sábado 8 juntaría
    // el lunes 3 con el lunes 10. Agrupar por semana ISO lo impide.
    const cards = groupIntoWeekCards(
      ['2026-08-03', '2026-08-10', '2026-08-15'].map(row),
    );
    expect(cards.map((c) => c.rows.map((r) => r.date))).toEqual([
      ['2026-08-03'],
      ['2026-08-10', '2026-08-15'],
    ]);
  });

  it('sin fechas no produce tarjetas', () => {
    expect(groupIntoWeekCards([])).toEqual([]);
  });
});

describe('buildPdfModelFromStored', () => {
  // Un programa guardado se reimprime con los nombres que tenía al guardarse.
  // Es la razón de ser de la denormalización: la hoja del año pasado ya se
  // imprimió y se repartió, y volver a sacarla tiene que dar lo mismo aunque
  // desde entonces alguien se haya renombrado o dado de baja.
  const stored = {
    month: 8,
    assignmentTypes: seed.assignmentTypes,
    dates: seed.historicalProgram.rows.map((row, order) => ({
      date: row.date,
      dayOfWeek: row.dayOfWeek,
      order,
      assignments: [
        ...Object.entries(row.people).map(([typeKey, personId]) => ({
          typeKey,
          slotIndex: 0,
          personName: seed.people.find((p) => p.id === personId)?.name ?? null,
          teamLabel: null,
        })),
        ...Object.entries(row.teams).map(([typeKey, teamId]) => ({
          typeKey,
          slotIndex: 0,
          personName: null,
          teamLabel: `Grupos ${teamId === 'e1' ? '1 y 5' : teamId === 'e2' ? '2 y 6' : teamId === 'e3' ? '3 y 7' : '4 y 8'}`,
        })),
      ],
    })),
  };

  it('reproduce la misma hoja que la construcción desde el dominio', () => {
    expect(buildPdfModelFromStored(stored)).toEqual(programaPdfModel);
  });

  it('usa los nombres guardados, no los actuales', () => {
    // Se renombra a la persona en el catálogo actual: el programa guardado
    // debe seguir mostrando el nombre con el que se imprimió.
    const conNombreViejo = buildPdfModelFromStored({
      ...stored,
      dates: [
        {
          ...stored.dates[0]!,
          assignments: stored.dates[0]!.assignments.map((a) =>
            a.typeKey === 'acomodador_entrada'
              ? { ...a, personName: 'Hugo Jiménez' }
              : a,
          ),
        },
      ],
    });
    expect(conNombreViejo.weeks[0]?.rows[0]?.cells[0]?.lines).toEqual(['Hugo', 'Jiménez']);
  });

  it('respeta las fechas guardadas sin recalcular el calendario', () => {
    // La hoja real omite el sábado 1 de agosto. Reimprimirla no debe
    // "arreglarlo" añadiendo una fecha que nunca estuvo.
    const fechas = buildPdfModelFromStored(stored).weeks.flatMap((w) =>
      w.rows.map((r) => r.date),
    );
    expect(fechas).not.toContain('2026-08-01');
    expect(fechas).toHaveLength(9);
  });
});
