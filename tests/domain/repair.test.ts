import { describe, expect, it } from 'vitest';
import { computeObjective, repair, type RepairInput } from '@/domain/repair';
import type { LoadTarget, ResolvedAssignment } from '@/domain/types';

// Pase de mejora local (docs/algoritmo.md, paso 8) probado AISLADO del
// generador, para que un fallo aquí señale a este módulo y no al voraz.
//
// La propiedad que gobierna todo lo demás: `repair` solo INTERCAMBIA
// ocupantes entre dos casillas. Una permuta no cambia cuántas veces sale
// cada persona, así que el término de carga es constante durante todo el
// pase. Lo único que este módulo puede mejorar es la rotación de tipo y el
// espaciado entre fechas. Si algún día alguien lo cambia para que mueva
// cargas, varios de estos tests deberían fallar — es su función.

const DOS: LoadTarget = { base: 2, remainder: 0, cap: 2 };

/** Cuatro fechas consecutivas en el índice: d0 y d1 son adyacentes, etc. */
const D = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'] as const;

function persona(
  date: string,
  typeKey: string,
  personId: string | null,
  extra: Partial<ResolvedAssignment> = {},
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
    ...extra,
  };
}

function equipo(
  date: string,
  typeKey: string,
  teamId: string | null,
  extra: Partial<ResolvedAssignment> = {},
): ResolvedAssignment {
  return {
    date,
    typeKey,
    slotIndex: 0,
    kind: 'GROUP',
    personId: null,
    teamId,
    locked: false,
    unfilledReason: null,
    ...extra,
  };
}

function entrada(
  assignments: readonly ResolvedAssignment[],
  extra: Partial<RepairInput> = {},
): RepairInput {
  return {
    dates: [...D],
    assignments,
    personTarget: DOS,
    teamTarget: DOS,
    allowMultiplePerDay: false,
    allowTeamTwiceSameDate: false,
    maxIterations: 200,
    ...extra,
  };
}

/** ¿Alguien ocupa dos casillas la misma fecha? Invariante dura del paso 7. */
function hayDuplicadoPorFecha(assignments: readonly ResolvedAssignment[]): boolean {
  const porFecha = new Map<string, Set<string>>();
  for (const a of assignments) {
    const ocupante = a.kind === 'PERSON' ? a.personId : a.teamId;
    if (ocupante === null) continue;
    const clave = `${a.date}|${a.kind}`;
    const vistos = porFecha.get(clave) ?? new Set<string>();
    if (vistos.has(ocupante)) return true;
    vistos.add(ocupante);
    porFecha.set(clave, vistos);
  }
  return false;
}

/** Cuántas veces sale cada quien. Debe ser idéntico antes y después. */
function cargas(assignments: readonly ResolvedAssignment[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const a of assignments) {
    const ocupante = a.kind === 'PERSON' ? a.personId : a.teamId;
    if (ocupante === null) continue;
    conteo.set(ocupante, (conteo.get(ocupante) ?? 0) + 1);
  }
  return conteo;
}

// ---------------------------------------------------------------------------
// computeObjective
// ---------------------------------------------------------------------------

describe('computeObjective — mide lo que el pase intenta reducir', () => {
  it('baja cuando la carga se acerca a la meta', () => {
    // Meta base = 2. Un reparto de 4-0 está el doble de lejos que uno de 2-2.
    const desequilibrado = [
      persona(D[0], 't1', 'x'),
      persona(D[1], 't2', 'x'),
      persona(D[2], 't3', 'x'),
      persona(D[3], 't4', 'x'),
    ];
    const equilibrado = [
      persona(D[0], 't1', 'x'),
      persona(D[1], 't2', 'y'),
      persona(D[2], 't3', 'x'),
      persona(D[3], 't4', 'y'),
    ];

    const costeMalo = computeObjective(desequilibrado, [...D], DOS, DOS);
    const costeBueno = computeObjective(equilibrado, [...D], DOS, DOS);

    expect(costeBueno).toBeLessThan(costeMalo);
    // Reparto perfecto y sin fechas contiguas ni tipos repetidos: coste cero.
    expect(costeBueno).toBe(0);
  });

  it('penaliza repetir la misma responsabilidad, aunque la carga sea perfecta', () => {
    const rotando = [persona(D[0], 't1', 'x'), persona(D[2], 't2', 'x')];
    const repitiendo = [persona(D[0], 't1', 'x'), persona(D[2], 't1', 'x')];

    expect(computeObjective(repitiendo, [...D], DOS, DOS)).toBeGreaterThan(
      computeObjective(rotando, [...D], DOS, DOS),
    );
  });

  it('penaliza dos fechas consecutivas frente a dos separadas', () => {
    const separadas = [persona(D[0], 't1', 'x'), persona(D[2], 't2', 'x')];
    const seguidas = [persona(D[0], 't1', 'x'), persona(D[1], 't2', 'x')];

    expect(computeObjective(seguidas, [...D], DOS, DOS)).toBeGreaterThan(
      computeObjective(separadas, [...D], DOS, DOS),
    );
  });

  it('las casillas vacías no cuentan para nada', () => {
    const conVacia = [persona(D[0], 't1', 'x'), persona(D[1], 't2', null)];
    const soloOcupada = [persona(D[0], 't1', 'x')];

    expect(computeObjective(conVacia, [...D], DOS, DOS)).toBe(
      computeObjective(soloOcupada, [...D], DOS, DOS),
    );
  });
});

// ---------------------------------------------------------------------------
// repair — garantías
// ---------------------------------------------------------------------------

describe('repair — lo que nunca debe hacer', () => {
  /**
   * Escenario base: x hace dos veces la responsabilidad A, y dos veces la B.
   * Intercambiar dentro de una fecha arregla la rotación de ambos sin mover
   * la carga de nadie.
   */
  function escenarioRotacionMala(): ResolvedAssignment[] {
    return [
      persona(D[0], 'A', 'x'),
      persona(D[0], 'B', 'y'),
      persona(D[1], 'A', 'x'),
      persona(D[1], 'B', 'y'),
    ];
  }

  it('mejora la rotación de tipo sin tocar la carga de nadie', () => {
    const antes = escenarioRotacionMala();
    const salida = repair(entrada(antes));

    expect(computeObjective(salida.assignments, [...D], DOS, DOS)).toBeLessThan(
      computeObjective(antes, [...D], DOS, DOS),
    );
    // La permuta conserva exactamente cuántas veces sale cada persona.
    expect(cargas(salida.assignments)).toEqual(cargas(antes));
  });

  it('nunca mueve una casilla bloqueada, aunque moverla mejorase el resultado', () => {
    // Mismo escenario, pero las dos casillas de la fecha 0 están bloqueadas.
    // El único intercambio que quedaba disponible ahí deja de estarlo.
    const antes = escenarioRotacionMala();
    const conBloqueos = antes.map((a, i) => (i < 2 ? { ...a, locked: true } : a));

    const salida = repair(entrada(conBloqueos));

    expect(salida.assignments[0]).toEqual(conBloqueos[0]);
    expect(salida.assignments[1]).toEqual(conBloqueos[1]);
    for (const indice of salida.changedIndices) {
      expect(indice).toBeGreaterThan(1);
    }
  });

  it('nunca crea un duplicado el mismo día, ni siquiera para bajar más el coste', () => {
    // Este es el test que de verdad prueba el filtro duro. En el escenario
    // base hay DOS intercambios que mejoran:
    //   · el legal   (dentro de una fecha): deja el objetivo en 2;
    //   · el ilegal  (x a las dos casillas de la fecha 1, y a las dos de la
    //     fecha 0): dejaría el objetivo en 0 — es estrictamente MEJOR.
    // Con `allowMultiplePerDay: false`, `repair` tiene que rechazar el mejor
    // porque rompe una invariante dura. Un pase de mejora que solo mirase el
    // coste elegiría el ilegal, y este test lo cazaría.
    const salida = repair(entrada(escenarioRotacionMala(), { allowMultiplePerDay: false }));

    expect(hayDuplicadoPorFecha(salida.assignments)).toBe(false);
    expect(computeObjective(salida.assignments, [...D], DOS, DOS)).toBe(2);
  });

  it('con allowMultiplePerDay sí toma el intercambio que antes era ilegal', () => {
    // La cara B del test anterior: demuestra que el 2 de arriba lo impone la
    // regla de negocio y no un límite del algoritmo.
    const salida = repair(entrada(escenarioRotacionMala(), { allowMultiplePerDay: true }));

    expect(computeObjective(salida.assignments, [...D], DOS, DOS)).toBe(0);
    expect(hayDuplicadoPorFecha(salida.assignments)).toBe(true);
  });

  it('respeta allowTeamTwiceSameDate igual que su equivalente de personas', () => {
    const equipos = [
      equipo(D[0], 'aseo', 'e1'),
      equipo(D[0], 'hospitalidad', 'e2'),
      equipo(D[1], 'aseo', 'e1'),
      equipo(D[1], 'hospitalidad', 'e2'),
    ];

    const estricto = repair(entrada(equipos, { allowTeamTwiceSameDate: false }));
    expect(hayDuplicadoPorFecha(estricto.assignments)).toBe(false);

    const permisivo = repair(entrada(equipos, { allowTeamTwiceSameDate: true }));
    expect(computeObjective(permisivo.assignments, [...D], DOS, DOS)).toBe(0);
  });

  it('nunca deja la solución peor de como la recibió', () => {
    // Varias formas distintas de estar mal repartido. En ninguna el pase
    // puede empeorar: solo aplica un intercambio si el delta es < 0.
    const escenarios: ResolvedAssignment[][] = [
      escenarioRotacionMala(),
      [
        persona(D[0], 'A', 'x'),
        persona(D[1], 'A', 'x'),
        persona(D[2], 'A', 'y'),
        persona(D[3], 'A', 'y'),
      ],
      [
        persona(D[0], 'A', 'x'),
        persona(D[0], 'B', 'y'),
        persona(D[1], 'A', 'z'),
        persona(D[1], 'B', 'x'),
        persona(D[2], 'A', 'y'),
        persona(D[2], 'B', 'z'),
      ],
      [persona(D[0], 'A', 'x'), persona(D[1], 'B', null), persona(D[2], 'A', 'y')],
      [],
    ];

    for (const escenario of escenarios) {
      const salida = repair(entrada(escenario));
      const antes = computeObjective(escenario, [...D], DOS, DOS);
      const despues = computeObjective(salida.assignments, [...D], DOS, DOS);
      expect(despues).toBeLessThanOrEqual(antes);
      expect(hayDuplicadoPorFecha(salida.assignments)).toBe(false);
      expect(cargas(salida.assignments)).toEqual(cargas(escenario));
    }
  });

  it('no muta el array de entrada', () => {
    const antes = escenarioRotacionMala();
    const copia = structuredClone(antes);
    repair(entrada(antes));
    expect(antes).toEqual(copia);
  });
});

describe('repair — terminación', () => {
  it('para en cuanto no queda ningún intercambio que mejore', () => {
    const yaOptimo = [
      persona(D[0], 'A', 'x'),
      persona(D[0], 'B', 'y'),
      persona(D[2], 'A', 'y'),
      persona(D[2], 'B', 'x'),
    ];
    const salida = repair(entrada(yaOptimo));

    expect(salida.iterations).toBe(0);
    expect(salida.changedIndices.size).toBe(0);
    expect(salida.assignments).toEqual(yaOptimo);
  });

  it('nunca supera maxIterations', () => {
    const salida = repair(entrada(escenarioLargo(), { maxIterations: 1 }));
    expect(salida.iterations).toBeLessThanOrEqual(1);
  });

  it('con maxIterations = 0 devuelve la entrada intacta', () => {
    // Sirve para aislar al voraz en las pruebas: `runRepairPass` apagado y
    // este caso deben coincidir.
    const antes = escenarioLargo();
    const salida = repair(entrada(antes, { maxIterations: 0 }));

    expect(salida.iterations).toBe(0);
    expect(salida.changedIndices.size).toBe(0);
    expect(salida.assignments).toEqual(antes);
  });

  it('es determinista: la misma entrada da exactamente la misma salida', () => {
    const primera = repair(entrada(escenarioLargo()));
    const segunda = repair(entrada(escenarioLargo()));

    expect(segunda.assignments).toEqual(primera.assignments);
    expect(segunda.iterations).toBe(primera.iterations);
    expect([...segunda.changedIndices].sort()).toEqual([...primera.changedIndices].sort());
  });
});

/** Reparto suficientemente malo como para que haga falta más de un paso. */
function escenarioLargo(): ResolvedAssignment[] {
  return [
    persona(D[0], 'A', 'x'),
    persona(D[0], 'B', 'y'),
    persona(D[1], 'A', 'x'),
    persona(D[1], 'B', 'y'),
    persona(D[2], 'A', 'z'),
    persona(D[2], 'B', 'w'),
    persona(D[3], 'A', 'z'),
    persona(D[3], 'B', 'w'),
  ];
}
