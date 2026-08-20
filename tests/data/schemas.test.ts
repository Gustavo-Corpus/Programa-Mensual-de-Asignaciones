import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import {
  assignmentTypeSchema,
  daysOfWeekSchema,
  generationSettingsSchema,
  groupSchema,
  isoDateSchema,
  parseFirestoreDoc,
  personSchema,
  programDocumentSchema,
  slotsPerDateSchema,
  teamSchema,
} from '../../src/data/schemas';
import { expandHistoricalProgram, verifyExpandedProgram, type SeedData } from '../../scripts/seedExpand';

// ---------------------------------------------------------------------------
// Los esquemas se prueban con documentos malformados: es para lo que existen.
// Nada aquí toca la red ni un emulador — solo funciones puras sobre datos
// literales (vitest.config.ts corre estos tests con environment: 'node').
// ---------------------------------------------------------------------------

describe('isoDateSchema', () => {
  it('acepta una fecha real con formato correcto', () => {
    expect(isoDateSchema.parse('2026-08-03')).toBe('2026-08-03');
  });

  it('rechaza una fecha con formato correcto pero inexistente', () => {
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false);
  });

  it('rechaza formatos que no son "YYYY-MM-DD"', () => {
    expect(isoDateSchema.safeParse('2026/08/03').success).toBe(false);
    expect(isoDateSchema.safeParse('26-08-03').success).toBe(false);
    expect(isoDateSchema.safeParse('2026-8-3').success).toBe(false);
  });

  it('rechaza un Timestamp de Firestore donde debería haber una cadena', () => {
    const result = isoDateSchema.safeParse(Timestamp.fromDate(new Date(2026, 7, 3)));
    expect(result.success).toBe(false);
  });
});

describe('daysOfWeekSchema', () => {
  it('acepta un array válido de días 0-6 sin repetidos', () => {
    expect(daysOfWeekSchema.parse([1, 6])).toEqual([1, 6]);
  });

  it('rechaza un array vacío', () => {
    expect(daysOfWeekSchema.safeParse([]).success).toBe(false);
  });

  it('rechaza valores fuera de 0-6', () => {
    expect(daysOfWeekSchema.safeParse([1, 7]).success).toBe(false);
    expect(daysOfWeekSchema.safeParse([-1, 2]).success).toBe(false);
  });

  it('rechaza valores repetidos', () => {
    expect(daysOfWeekSchema.safeParse([1, 1, 6]).success).toBe(false);
  });
});

describe('slotsPerDateSchema', () => {
  it('acepta enteros positivos', () => {
    expect(slotsPerDateSchema.parse(1)).toBe(1);
    expect(slotsPerDateSchema.parse(2)).toBe(2);
  });

  it('rechaza 0 y negativos', () => {
    expect(slotsPerDateSchema.safeParse(0).success).toBe(false);
    expect(slotsPerDateSchema.safeParse(-1).success).toBe(false);
  });

  it('rechaza no enteros', () => {
    expect(slotsPerDateSchema.safeParse(1.5).success).toBe(false);
  });
});

describe('assignmentTypeSchema', () => {
  const valido = {
    id: 't1',
    key: 'acomodador_entrada',
    label: 'Acomodador de entrada',
    kind: 'PERSON',
    daysOfWeek: [1, 6],
    slotsPerDate: 1,
    order: 1,
    icon: 'person',
    active: true,
  };

  it('acepta un documento válido y produce el tipo del dominio', () => {
    const result = assignmentTypeSchema.parse(valido);
    expect(result).toEqual(valido);
  });

  it('rechaza cuando falta un campo', () => {
    const sinLabel: Record<string, unknown> = { ...valido };
    delete sinLabel.label;
    expect(assignmentTypeSchema.safeParse(sinLabel).success).toBe(false);
  });

  it('rechaza un tipo equivocado en un campo', () => {
    expect(assignmentTypeSchema.safeParse({ ...valido, order: '1' }).success).toBe(false);
  });

  it('rechaza kind inválido', () => {
    expect(assignmentTypeSchema.safeParse({ ...valido, kind: 'TEAM' }).success).toBe(false);
  });

  it('rechaza icon inválido', () => {
    expect(assignmentTypeSchema.safeParse({ ...valido, icon: 'star' }).success).toBe(false);
  });

  it('rechaza daysOfWeek con valores fuera de rango', () => {
    expect(assignmentTypeSchema.safeParse({ ...valido, daysOfWeek: [1, 9] }).success).toBe(false);
  });

  it('rechaza daysOfWeek repetidos', () => {
    expect(assignmentTypeSchema.safeParse({ ...valido, daysOfWeek: [1, 1] }).success).toBe(false);
  });

  it('rechaza slotsPerDate <= 0', () => {
    expect(assignmentTypeSchema.safeParse({ ...valido, slotsPerDate: 0 }).success).toBe(false);
  });
});

describe('personSchema', () => {

  it('rechaza cuando falta "active"', () => {
    expect(personSchema.safeParse({ id: 'p01', name: 'Hugo Jiménez' }).success).toBe(false);
  });

  it('rechaza un tipo equivocado en "active"', () => {
    expect(personSchema.safeParse({ id: 'p01', name: 'Hugo Jiménez', active: 'true' }).success).toBe(false);
  });

  it('rechaza un nombre vacío', () => {
    expect(personSchema.safeParse({ id: 'p01', name: '', active: true }).success).toBe(false);
  });

  // Lo que garantiza que la aplicación siga funcionando sobre la colección
  // `people` tal y como está guardada hoy, sin migrarla.
  it('un documento anterior a las restricciones se lee sin grupo y sin restricciones', () => {
    expect(personSchema.parse({ id: 'p01', name: 'Hugo Jiménez', active: true })).toEqual({
      id: 'p01',
      name: 'Hugo Jiménez',
      active: true,
      groupId: null,
      role: 'MEMBER',
      allowedTypeKeys: null,
      blockedDaysOfWeek: [],
    });
  });

  it('acepta un documento con grupo, papel y restricciones', () => {
    const valido = {
      id: 'p01',
      name: 'Hugo Jiménez',
      active: true,
      groupId: 'g1',
      role: 'CAPTAIN',
      allowedTypeKeys: ['acomodador_auditorio'],
      blockedDaysOfWeek: [6],
    };
    expect(personSchema.parse(valido)).toEqual(valido);
  });

  // `null` (sin restricción) y `[]` (ninguna responsabilidad) son estados
  // distintos, y el esquema tiene que conservar la diferencia sin colapsarla.
  it('conserva allowedTypeKeys vacío como lista vacía, no como null', () => {
    const parsed = personSchema.parse({
      id: 'p01',
      name: 'Hugo Jiménez',
      active: true,
      allowedTypeKeys: [],
    });
    expect(parsed.allowedTypeKeys).toEqual([]);
    expect(parsed.allowedTypeKeys).not.toBeNull();
  });

  it('rechaza un papel que no existe', () => {
    expect(
      personSchema.safeParse({ id: 'p01', name: 'Hugo', active: true, role: 'JEFE' }).success,
    ).toBe(false);
  });

  it('rechaza un día de la semana fuera de rango', () => {
    expect(
      personSchema.safeParse({ id: 'p01', name: 'Hugo', active: true, blockedDaysOfWeek: [7] })
        .success,
    ).toBe(false);
  });
});

describe('groupSchema', () => {
  it('acepta un documento válido', () => {
    const valido = { id: 'g1', name: '1', teamId: 'e1', order: 1, active: true };
    expect(groupSchema.parse(valido)).toEqual(valido);
  });

  it('rechaza cuando falta teamId', () => {
    expect(groupSchema.safeParse({ id: 'g1', name: '1', order: 1, active: true }).success).toBe(false);
  });
});

describe('teamSchema', () => {
  it('acepta displayName null', () => {
    const valido = { id: 'e1', displayName: null, order: 1, active: true };
    expect(teamSchema.parse(valido)).toEqual(valido);
  });

  it('acepta displayName con texto', () => {
    const valido = { id: 'e1', displayName: 'Equipo Norte', order: 1, active: true };
    expect(teamSchema.parse(valido)).toEqual(valido);
  });

  it('rechaza displayName con tipo equivocado', () => {
    expect(teamSchema.safeParse({ id: 'e1', displayName: 42, order: 1, active: true }).success).toBe(false);
  });
});

describe('generationSettingsSchema', () => {
  const valido = {
    historyWindowMonths: 6,
    allowMultiplePerDay: false,
    allowTeamTwiceSameDate: false,
    runRepairPass: true,
    maxRepairIterations: 200,
    captainRule: {
      enabled: true,
      sourceTypeKey: 'aseo',
      targetTypeKeys: ['acomodador_entrada', 'acomodador_auditorio'],
    },
  };

  it('acepta un documento válido', () => {
    expect(generationSettingsSchema.parse(valido)).toEqual(valido);
  });

  // Igual que con las personas: settings/app tal y como está guardado hoy
  // sigue siendo válido, y se lee con la regla apagada — que es exactamente el
  // comportamiento que esa instalación tenía.
  it('un documento sin captainRule se lee con la regla apagada', () => {
    const sinRegla: Record<string, unknown> = { ...valido };
    delete sinRegla.captainRule;
    expect(generationSettingsSchema.parse(sinRegla).captainRule).toEqual({
      enabled: false,
      sourceTypeKey: '',
      targetTypeKeys: [],
    });
  });

  it('acepta sourceTypeKey vacío: es "sin tipo fuente elegido"', () => {
    const sinFuente = { ...valido, captainRule: { ...valido.captainRule, sourceTypeKey: '' } };
    expect(generationSettingsSchema.safeParse(sinFuente).success).toBe(true);
  });

  it('rechaza captainRule sin enabled', () => {
    const roto = { ...valido, captainRule: { sourceTypeKey: 'aseo', targetTypeKeys: [] } };
    expect(generationSettingsSchema.safeParse(roto).success).toBe(false);
  });

  it('rechaza maxRepairIterations < 1', () => {
    expect(generationSettingsSchema.safeParse({ ...valido, maxRepairIterations: 0 }).success).toBe(false);
  });

  it('rechaza historyWindowMonths negativo', () => {
    expect(generationSettingsSchema.safeParse({ ...valido, historyWindowMonths: -1 }).success).toBe(false);
  });
});

describe('programDocumentSchema', () => {
  const validCreated = Timestamp.fromDate(new Date(2026, 7, 1));
  const validUpdated = Timestamp.fromDate(new Date(2026, 7, 2));

  const validDoc = {
    id: '2026-08',
    year: 2026,
    month: 8,
    status: 'PUBLISHED',
    seed: 20260801,
    settingsSnapshot: {
      historyWindowMonths: 6,
      allowMultiplePerDay: false,
      allowTeamTwiceSameDate: false,
      runRepairPass: true,
      maxRepairIterations: 200,
    },
    warnings: [],
    createdAt: validCreated,
    updatedAt: validUpdated,
    dates: [
      {
        date: '2026-08-03',
        dayOfWeek: 1,
        order: 0,
        assignments: [
          {
            typeKey: 'acomodador_entrada',
            slotIndex: 0,
            kind: 'PERSON',
            personId: 'p01',
            personName: 'Hugo Jiménez',
            teamId: null,
            teamLabel: null,
            locked: false,
            unfilledReason: null,
          },
        ],
      },
    ],
  };

  it('acepta un documento válido y convierte createdAt/updatedAt a millis', () => {
    const result = programDocumentSchema.parse(validDoc);
    expect(result.createdAt).toBe(validCreated.toMillis());
    expect(result.updatedAt).toBe(validUpdated.toMillis());
    expect(result.dates[0]?.assignments[0]?.personId).toBe('p01');
  });

  it('rechaza cuando el id del documento no casa con year/month', () => {
    const result = programDocumentSchema.safeParse({ ...validDoc, id: '2026-09' });
    expect(result.success).toBe(false);
  });

  it('rechaza cuando createdAt es una cadena en vez de un Timestamp', () => {
    const result = programDocumentSchema.safeParse({ ...validDoc, createdAt: '2026-08-01' });
    expect(result.success).toBe(false);
  });

  it('rechaza una fecha inexistente dentro de "dates"', () => {
    const result = programDocumentSchema.safeParse({
      ...validDoc,
      dates: [{ ...validDoc.dates[0], date: '2026-02-30' }],
    });
    expect(result.success).toBe(false);
  });

  it('da un error que señala la colección y el id ante un documento corrupto', () => {
    expect(() => parseFirestoreDoc(programDocumentSchema, 'programs', '2026-08', { ...validDoc, id: '2026-09' })).toThrow(
      /programs\/2026-08/
    );
  });
});

// ---------------------------------------------------------------------------
// Expansión de scripts/seed-data.json con la misma función que usa
// `npm run seed`. Verifica las cifras de _verificacion sin tocar Firebase.
// ---------------------------------------------------------------------------

describe('expandHistoricalProgram (scripts/seed-data.json)', () => {
  const seedDataPath = fileURLToPath(new URL('../../scripts/seed-data.json', import.meta.url));
  const seedData = JSON.parse(readFileSync(seedDataPath, 'utf-8')) as SeedData;
  const expanded = expandHistoricalProgram(seedData);

  it('produce las 9 fechas esperadas', () => {
    expect(expanded.dates).toHaveLength(9);
  });

  it('cumple exactamente las cifras del bloque _verificacion', () => {
    const verification = verifyExpandedProgram(seedData, expanded);
    expect(verification.details).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it('denormaliza personName y teamLabel', () => {
    const primeraFecha = expanded.dates[0];
    expect(primeraFecha?.date).toBe('2026-08-03');
    const acomodador = primeraFecha?.assignments.find((a) => a.typeKey === 'acomodador_entrada');
    expect(acomodador?.personId).toBe('p01');
    expect(acomodador?.personName).toBe('Hugo Jiménez');

    const segundaFecha = expanded.dates[1];
    const aseo = segundaFecha?.assignments.find((a) => a.typeKey === 'aseo');
    expect(aseo?.teamId).toBe('e1');
    // Se guarda el TEXTO QUE SE MUESTRA, con su prefijo, no la etiqueta pelada.
    // Guardar "1 y 5" perdería la diferencia entre una etiqueta compuesta
    // automáticamente y un nombre propio que el administrador le haya puesto al
    // equipo, y al reimprimir un programa antiguo no habría forma de saber si
    // toca anteponer "Grupos" o no.
    expect(aseo?.teamLabel).toBe('Grupos 1 y 5');
  });

  it('marca todo el historial como no bloqueado', () => {
    for (const date of expanded.dates) {
      for (const assignment of date.assignments) {
        expect(assignment.locked).toBe(false);
        expect(assignment.unfilledReason).toBeNull();
      }
    }
  });

  it('detecta cuando las cifras no cuadran', () => {
    const seedRoto: SeedData = {
      ...seedData,
      _verificacion: { ...seedData._verificacion, fechas: 999 },
    };
    const result = verifyExpandedProgram(seedRoto, expanded);
    expect(result.ok).toBe(false);
    expect(result.details.some((d) => d.includes('fechas'))).toBe(true);
  });

  it('falla con un mensaje claro ante un typeKey desconocido en una fila', () => {
    const seedRoto: SeedData = {
      ...seedData,
      historicalProgram: {
        ...seedData.historicalProgram,
        rows: [
          {
            date: '2026-08-03',
            dayOfWeek: 1,
            people: { tipo_inexistente: 'p01' },
          },
        ],
      },
    };
    expect(() => expandHistoricalProgram(seedRoto)).toThrow(/tipo de asignación desconocido/);
  });
});
