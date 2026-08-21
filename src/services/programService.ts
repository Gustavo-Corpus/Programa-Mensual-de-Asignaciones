import { generateProgram } from '@/domain/generateProgram';
import { buildEmptyProgram } from '@/domain/emptyProgram';
import { monthKey } from '@/domain/dates';
import { allowsDay, allowsType, captainPool, captainRuleApplies } from '@/domain/eligibility';
import { PERSON_COST_LABELS } from '@/domain/scoring';
import { TEAM_COST_LABELS } from '@/domain/teamScoring';
import { teamDisplayText } from '@/domain/teams';
import type {
  AssignmentType,
  GenerateOutput,
  GenerationSettings,
  GenerationTrace,
  Group,
  Person,
  RejectionReason,
  Team,
} from '@/domain/types';
import { listAssignmentTypes } from '@/data/types.repo';
import { listPeople } from '@/data/people.repo';
import { listGroups } from '@/data/groups.repo';
import { listTeams } from '@/data/teams.repo';
import { getSettings } from '@/data/settings.repo';
import {
  deleteProgram,
  getHistory,
  getProgram,
  getTrace,
  saveProgram,
  updateProgramDates,
} from '@/data/programs.repo';
import type { ProgramAssignmentDoc, ProgramDateDoc, ProgramDocument } from '@/data/types';
import { buildPdfModel, buildPdfModelFromStored } from '@/pdf/buildPdfModel';
import type { ProgramPdfModel } from '@/pdf/model';

/**
 * Capa de orquestación: es el único sitio autorizado a combinar las tres capas
 * (datos, dominio y PDF).
 *
 * `src/data` no conoce reglas de negocio, `src/domain` no conoce Firestore y
 * `src/pdf` no conoce ninguno de los dos. Alguien tiene que unirlos, y ese
 * alguien vive aquí y no repartido por los componentes de React: así la lógica
 * de "cargar catálogo, generar, guardar" se puede seguir de un vistazo y no
 * depende de en qué orden se monten las pantallas.
 */

export interface Catalogo {
  readonly assignmentTypes: AssignmentType[];
  readonly people: Person[];
  readonly teams: Team[];
  readonly groups: Group[];
  readonly settings: GenerationSettings;
}

export async function loadCatalogo(): Promise<Catalogo> {
  const [assignmentTypes, people, teams, groups, settings] = await Promise.all([
    listAssignmentTypes(),
    listPeople(),
    listTeams(),
    listGroups(),
    getSettings(),
  ]);
  return { assignmentTypes, people, teams, groups, settings };
}

/**
 * Semilla por defecto de un mes. Se deriva del propio mes para que generar
 * septiembre de 2026 dé siempre lo mismo, en cualquier equipo y en cualquier
 * momento — nada de `Date.now()`, que haría irreproducible el resultado.
 */
export function seedForMonth(year: number, month: number): number {
  return year * 100 + month;
}

export interface GeneracionResultado {
  readonly output: GenerateOutput;
  readonly seed: number;
  readonly catalogo: Catalogo;
}

/**
 * Cuántas semillas se prueban como mucho al pedir otra variante antes de
 * darse por satisfecho. Con las casillas casi todas bloqueadas puede que no
 * exista ninguna variante distinta, y entonces hay que parar en vez de girar
 * en vano.
 */
const MAX_INTENTOS_VARIANTE = 12;

/** Identidad de un reparto: quién ocupa cada casilla, en orden estable. */
function huella(pares: ReadonlyArray<readonly [string, string]>): string {
  return [...pares]
    .map(([casilla, ocupante]) => `${casilla}=${ocupante}`)
    .sort()
    .join('\n');
}

function huellaDeSalida(output: GenerateOutput): string {
  return huella(
    output.assignments.map(
      (a) =>
        [`${a.date}|${a.typeKey}|${a.slotIndex}`, a.personId ?? a.teamId ?? ''] as const,
    ),
  );
}

function huellaDeGuardado(programa: ProgramDocument): string {
  return huella(
    programa.dates.flatMap((d) =>
      d.assignments.map(
        (a) => [`${d.date}|${a.typeKey}|${a.slotIndex}`, a.personId ?? a.teamId ?? ''] as const,
      ),
    ),
  );
}

export interface OpcionesGeneracion {
  readonly seed?: number;
  readonly catalogo?: Catalogo;
  /**
   * "Probar otra variante": no basta con cambiar la semilla, el resultado
   * tiene que salir DISTINTO del que ya está guardado. Cambiar la semilla
   * mueve el desempate, y el desempate solo decide entre candidatos
   * empatados; si en ese mes no hay empates que romper, la nueva semilla
   * devuelve exactamente el mismo programa y el administrador ve un botón que
   * no hace nada. Con esto se prueban semillas hasta que el reparto cambia de
   * verdad.
   */
  readonly distintaDeLaGuardada?: boolean;
}

/**
 * Genera un mes sin guardarlo. `seed` permite pedir otra variante del mismo
 * mes sin cambiar nada más.
 */
export async function generarMes(
  year: number,
  month: number,
  opciones: OpcionesGeneracion = {},
): Promise<GeneracionResultado> {
  const catalogo = opciones.catalogo ?? (await loadCatalogo());
  const primeraSemilla = opciones.seed ?? seedForMonth(year, month);

  const previousAssignments = await getHistory(
    year,
    month,
    catalogo.settings.historyWindowMonths,
  );

  // Un mes ya guardado puede tener casillas bloqueadas: se respetan al
  // regenerar. Es la diferencia entre "recalcular" y "tirar el trabajo del
  // administrador a la basura".
  const existente = await getProgram(year, month);
  const lockedAssignments = (existente?.dates ?? []).flatMap((d) =>
    d.assignments
      .filter((a) => a.locked)
      .map((a) => ({
        date: d.date,
        typeKey: a.typeKey,
        slotIndex: a.slotIndex,
        personId: a.personId,
        teamId: a.teamId,
      })),
  );

  const generar = (seed: number): GenerateOutput =>
    generateProgram({
      year,
      month,
      people: catalogo.people,
      teams: catalogo.teams,
      groups: catalogo.groups,
      assignmentTypes: catalogo.assignmentTypes,
      previousAssignments,
      lockedAssignments,
      settings: catalogo.settings,
      seed,
    });

  let seed = primeraSemilla;
  let output = generar(seed);

  if (opciones.distintaDeLaGuardada === true && existente !== null) {
    const anterior = huellaDeGuardado(existente);
    for (let intento = 0; intento < MAX_INTENTOS_VARIANTE; intento++) {
      if (huellaDeSalida(output) !== anterior) break;
      seed += 1;
      output = generar(seed);
    }
  }

  return { output, seed, catalogo };
}

export async function guardarMes(
  year: number,
  month: number,
  resultado: GeneracionResultado,
  status: 'DRAFT' | 'PUBLISHED' = 'DRAFT',
): Promise<void> {
  const { output, seed, catalogo } = resultado;
  await saveProgram({
    year,
    month,
    status,
    seed,
    settingsSnapshot: catalogo.settings,
    warnings: output.warnings,
    dates: output.dates,
    assignments: output.assignments,
    people: catalogo.people,
    teams: catalogo.teams,
    groups: catalogo.groups,
    trace: output.trace,
  });
}

/** Modelo de PDF de un resultado recién generado y todavía sin guardar. */
export function modeloDeGeneracion(
  year: number,
  month: number,
  resultado: GeneracionResultado,
): ProgramPdfModel {
  return buildPdfModel({
    year,
    month,
    dates: resultado.output.dates,
    assignments: resultado.output.assignments,
    assignmentTypes: resultado.catalogo.assignmentTypes,
    people: resultado.catalogo.people,
    teams: resultado.catalogo.teams,
    groups: resultado.catalogo.groups,
  });
}

/**
 * Modelo de PDF de un mes GUARDADO, con los nombres tal y como quedaron al
 * guardarlo. Reimprimir un mes antiguo da la hoja que se repartió, no una
 * recalculada con el catálogo de hoy.
 */
export function modeloDeGuardado(
  programa: ProgramDocument,
  assignmentTypes: readonly AssignmentType[],
): ProgramPdfModel {
  return buildPdfModelFromStored({
    month: programa.month,
    dates: programa.dates,
    assignmentTypes,
  });
}

export interface MesCargado {
  readonly year: number;
  readonly month: number;
  readonly id: string;
  readonly programa: ProgramDocument | null;
  readonly catalogo: Catalogo;
  readonly modelo: ProgramPdfModel | null;
}

/** Carga un mes para mostrarlo. Si no está guardado, `programa` es `null`. */
export async function cargarMes(year: number, month: number): Promise<MesCargado> {
  const [catalogo, programa] = await Promise.all([loadCatalogo(), getProgram(year, month)]);
  return {
    year,
    month,
    id: monthKey(year, month),
    programa,
    catalogo,
    modelo: programa === null ? null : modeloDeGuardado(programa, catalogo.assignmentTypes),
  };
}

// ---------------------------------------------------------------------------
// Edición manual de casillas
// ---------------------------------------------------------------------------

export interface CasillaRef {
  readonly date: string;
  readonly typeKey: string;
  readonly slotIndex: number;
}

function mismaCasilla(a: ProgramAssignmentDoc, ref: CasillaRef): boolean {
  return a.typeKey === ref.typeKey && a.slotIndex === ref.slotIndex;
}

function reemplazarCasilla(
  programa: ProgramDocument,
  ref: CasillaRef,
  cambio: (a: ProgramAssignmentDoc) => ProgramAssignmentDoc,
): ProgramDateDoc[] {
  return programa.dates.map((d) =>
    d.date !== ref.date
      ? d
      : { ...d, assignments: d.assignments.map((a) => (mismaCasilla(a, ref) ? cambio(a) : a)) },
  );
}

/**
 * Aplica una edición manual y devuelve las fechas resultantes. **Función pura**:
 * la escritura en Firestore la hace `editarCasilla`. Separadas para que la regla
 * de negocio se pueda probar sin red.
 *
 * Dos decisiones que están aquí y no en la interfaz:
 *
 * 1. **Asignar a mano bloquea la casilla.** Sin eso, el administrador cambiaría
 *    un nombre, pulsaría «Regenerar» y su cambio desaparecería sin aviso. Una
 *    edición manual es una decisión explícita y el algoritmo tiene que
 *    respetarla; el candado queda visible y se puede quitar.
 * 2. **Vaciar una casilla la DESbloquea.** Vaciar significa "vuelve a
 *    intentarlo", no "que se quede vacía para siempre": al regenerar, el
 *    algoritmo la cubrirá.
 */
export function aplicarEdicion(
  programa: ProgramDocument,
  catalogo: Catalogo,
  ref: CasillaRef,
  nuevoId: string | null,
): ProgramDateDoc[] {
  return reemplazarCasilla(programa, ref, (a) => {
    const base = {
      ...a,
      locked: nuevoId !== null,
      unfilledReason: nuevoId === null ? ('NO_ELIGIBLE_CANDIDATE' as const) : null,
    };
    if (a.kind === 'PERSON') {
      const persona = nuevoId === null ? undefined : catalogo.people.find((p) => p.id === nuevoId);
      return {
        ...base,
        personId: persona?.id ?? null,
        personName: persona?.name ?? null,
        teamId: null,
        teamLabel: null,
      };
    }
    const equipo = nuevoId === null ? undefined : catalogo.teams.find((t) => t.id === nuevoId);
    return {
      ...base,
      personId: null,
      personName: null,
      teamId: equipo?.id ?? null,
      teamLabel: equipo === undefined ? null : teamDisplayText(equipo, catalogo.groups),
    };
  });
}

/** Pone o quita el candado sin tocar quién ocupa la casilla. Función pura. */
export function aplicarBloqueo(programa: ProgramDocument, ref: CasillaRef): ProgramDateDoc[] {
  return reemplazarCasilla(programa, ref, (a) => ({ ...a, locked: !a.locked }));
}

/** Asigna a mano una persona o un equipo a una casilla y lo persiste. */
export async function editarCasilla(
  programa: ProgramDocument,
  catalogo: Catalogo,
  ref: CasillaRef,
  nuevoId: string | null,
): Promise<ProgramDocument> {
  const dates = aplicarEdicion(programa, catalogo, ref, nuevoId);
  await updateProgramDates(programa.year, programa.month, dates);
  return { ...programa, dates, updatedAt: Date.now() };
}

/** Pone o quita el candado de una casilla sin cambiar quién la ocupa. */
export async function alternarBloqueo(
  programa: ProgramDocument,
  ref: CasillaRef,
): Promise<ProgramDocument> {
  const dates = aplicarBloqueo(programa, ref);
  await updateProgramDates(programa.year, programa.month, dates);
  return { ...programa, dates, updatedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Modo manual
//
// No es un modo aparte con sus propias reglas: es el mismo programa con las
// casillas en blanco. Todo lo que ya existe —editar, bloquear, avisar de
// duplicados, imprimir, contar para el historial— sigue funcionando igual,
// porque lo que cambia es el contenido y no la forma.
// ---------------------------------------------------------------------------

function trazaVacia(seed: number): GenerationTrace {
  // Las etiquetas viajan aunque no haya slots: el «¿Por qué?» de una casilla
  // rellenada a mano debe poder decir "no hay explicación" sin romperse.
  return { seed, costLabelsPerson: PERSON_COST_LABELS, costLabelsTeam: TEAM_COST_LABELS, slots: [] };
}

/**
 * Crea el mes en blanco y lo guarda: las fechas y casillas que le tocan a ese
 * mes, sin nadie dentro, listas para repartir a mano.
 *
 * Se guarda de inmediato por la misma razón que al generar: el candado, la
 * edición y los conteos trabajan siempre sobre un programa persistido.
 */
export async function crearMesVacio(
  year: number,
  month: number,
  opciones: { catalogo?: Catalogo } = {},
): Promise<void> {
  const catalogo = opciones.catalogo ?? (await loadCatalogo());
  const seed = seedForMonth(year, month);
  const { dates, assignments } = buildEmptyProgram({
    year,
    month,
    assignmentTypes: catalogo.assignmentTypes,
  });

  await saveProgram({
    year,
    month,
    status: 'DRAFT',
    seed,
    settingsSnapshot: catalogo.settings,
    warnings: [],
    dates,
    assignments,
    people: catalogo.people,
    teams: catalogo.teams,
    groups: catalogo.groups,
    trace: trazaVacia(seed),
  });
}

/**
 * Vacía las casillas SIN bloquear y respeta las bloqueadas. Función pura.
 *
 * Que el candado sobreviva a un vaciado es coherente con lo que ya significa
 * en todas partes: "esto lo he decidido yo, no me lo toques". Si además
 * borrara los bloqueos, el administrador perdería de golpe el único trabajo
 * que había marcado explícitamente como suyo.
 */
export function aplicarVaciado(programa: ProgramDocument): ProgramDateDoc[] {
  return programa.dates.map((fecha) => ({
    ...fecha,
    assignments: fecha.assignments.map((a) =>
      a.locked
        ? a
        : {
            ...a,
            personId: null,
            personName: null,
            teamId: null,
            teamLabel: null,
            unfilledReason: 'MANUALLY_CLEARED' as const,
          },
    ),
  }));
}

/** Vacía el mes conservando lo bloqueado y lo persiste. */
export async function vaciarPrograma(programa: ProgramDocument): Promise<ProgramDocument> {
  const dates = aplicarVaciado(programa);
  await updateProgramDates(programa.year, programa.month, dates);
  return { ...programa, dates, updatedAt: Date.now() };
}

export interface ConteoEntidad {
  readonly id: string;
  readonly nombre: string;
  readonly veces: number;
  readonly activo: boolean;
  /** typeKey -> veces, para ver de qué se le ha puesto y de qué no. */
  readonly porTipo: ReadonlyMap<string, number>;
}

export interface ResumenReparto {
  readonly personas: readonly ConteoEntidad[];
  readonly equipos: readonly ConteoEntidad[];
  readonly casillasPersona: number;
  readonly casillasEquipo: number;
  readonly sinCubrir: number;
}

function ordenarPorFalta(a: ConteoEntidad, b: ConteoEntidad): number {
  return a.veces - b.veces || a.nombre.localeCompare(b.nombre);
}

/**
 * Cuántas veces sale cada persona y cada equipo EN LO QUE HAY AHORA MISMO en
 * el mes, venga de una generación o de haberlo escrito a mano.
 *
 * Se cuenta sobre el programa guardado y no sobre `GenerateOutput.stats`
 * porque en modo manual no hay ninguna generación de la que sacar
 * estadísticas, y porque tras editar a mano las cifras del generador dejarían
 * de describir lo que hay en la tabla.
 *
 * Aparecen TODAS las personas activas, también las que están a cero: quien
 * falta es justo a quien hay que ver.
 */
export function resumenReparto(programa: ProgramDocument, catalogo: Catalogo): ResumenReparto {
  const vecesPersona = new Map<string, number>();
  const vecesEquipo = new Map<string, number>();
  const tiposPersona = new Map<string, Map<string, number>>();
  const tiposEquipo = new Map<string, Map<string, number>>();

  let casillasPersona = 0;
  let casillasEquipo = 0;
  let sinCubrir = 0;

  function anotar(
    veces: Map<string, number>,
    porTipo: Map<string, Map<string, number>>,
    id: string,
    typeKey: string,
  ): void {
    veces.set(id, (veces.get(id) ?? 0) + 1);
    const tipos = porTipo.get(id) ?? new Map<string, number>();
    tipos.set(typeKey, (tipos.get(typeKey) ?? 0) + 1);
    porTipo.set(id, tipos);
  }

  for (const fecha of programa.dates) {
    for (const a of fecha.assignments) {
      if (a.kind === 'PERSON') casillasPersona++;
      else casillasEquipo++;

      if (a.personId !== null) anotar(vecesPersona, tiposPersona, a.personId, a.typeKey);
      else if (a.teamId !== null) anotar(vecesEquipo, tiposEquipo, a.teamId, a.typeKey);
      else sinCubrir++;
    }
  }

  const personas = catalogo.people
    .filter((p) => p.active || vecesPersona.has(p.id))
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      veces: vecesPersona.get(p.id) ?? 0,
      activo: p.active,
      porTipo: tiposPersona.get(p.id) ?? new Map<string, number>(),
    }))
    .sort(ordenarPorFalta);

  const equipos = catalogo.teams
    .filter((t) => t.active || vecesEquipo.has(t.id))
    .map((t) => ({
      id: t.id,
      nombre: teamDisplayText(t, catalogo.groups),
      veces: vecesEquipo.get(t.id) ?? 0,
      activo: t.active,
      porTipo: tiposEquipo.get(t.id) ?? new Map<string, number>(),
    }))
    .sort(ordenarPorFalta);

  return { personas, equipos, casillasPersona, casillasEquipo, sinCubrir };
}

export type MotivoInfraccion = Extract<
  RejectionReason,
  'DAY_BLOCKED' | 'TYPE_NOT_ALLOWED' | 'NOT_IN_CAPTAIN_POOL'
>;

export interface Infraccion {
  readonly ref: CasillaRef;
  readonly personId: string;
  readonly motivo: MotivoInfraccion;
}

/** Clave estable de una casilla; la comparten los mapas que la interfaz consulta. */
export function claveCasilla(ref: CasillaRef): string {
  return `${ref.date}|${ref.typeKey}|${ref.slotIndex}`;
}

/**
 * Casillas cuyo ocupante actual infringe sus propias restricciones.
 *
 * El generador nunca las produce: aparecen al asignar a mano, o cuando las
 * restricciones cambian DESPUÉS de generar el mes (se marca a alguien como
 * mayor y ya estaba puesto en un pasillo). Igual que con los duplicados, no se
 * impide —el administrador puede tener un motivo— pero se enseña, porque el
 * error que nadie ve es el que llega al sábado.
 */
export function infraccionesDeRestriccion(
  programa: ProgramDocument,
  catalogo: Catalogo,
): Map<string, Infraccion> {
  const peopleById = new Map(catalogo.people.map((p) => [p.id, p] as const));
  const regla = catalogo.settings.captainRule;
  const resultado = new Map<string, Infraccion>();

  for (const fecha of programa.dates) {
    // La reserva se lee del propio programa: es el equipo que figura HOY en la
    // casilla del tipo fuente, no el que el algoritmo eligió en su día.
    const equiposFuente = fecha.assignments
      .filter((a) => a.typeKey === regla.sourceTypeKey)
      .map((a) => a.teamId)
      .filter((teamId): teamId is string => teamId !== null);

    // Sin equipo de aseo ese día no hay reserva CONOCIDA, que no es lo mismo
    // que una reserva vacía: marcar a todo el mundo en rojo porque todavía no
    // se ha decidido quién limpia sería ruido, no un aviso.
    const reservaConocida = equiposFuente.length > 0;
    const reserva = new Set<string>();
    for (const teamId of equiposFuente) {
      for (const id of captainPool(catalogo.people, catalogo.groups, teamId)) reserva.add(id);
    }

    for (const a of fecha.assignments) {
      if (a.kind !== 'PERSON' || a.personId === null) continue;
      const persona = peopleById.get(a.personId);
      if (persona === undefined) continue;

      const ref: CasillaRef = { date: fecha.date, typeKey: a.typeKey, slotIndex: a.slotIndex };
      const motivo: MotivoInfraccion | null = !allowsDay(persona, fecha.dayOfWeek)
        ? 'DAY_BLOCKED'
        : !allowsType(persona, a.typeKey)
          ? 'TYPE_NOT_ALLOWED'
          : reservaConocida && captainRuleApplies(regla, a.typeKey) && !reserva.has(persona.id)
            ? 'NOT_IN_CAPTAIN_POOL'
            : null;

      if (motivo !== null) resultado.set(claveCasilla(ref), { ref, personId: persona.id, motivo });
    }
  }

  return resultado;
}

/**
 * Personas o equipos que aparecen dos veces la misma fecha.
 *
 * Solo puede ocurrir por una edición manual: el generador nunca lo produce. No
 * se impide —el administrador puede tener un motivo— pero se muestra, porque un
 * duplicado silencioso es justo el error que nadie detecta hasta que dos
 * personas se presentan al mismo puesto.
 */
export function duplicadosPorFecha(programa: ProgramDocument): Map<string, Set<string>> {
  const resultado = new Map<string, Set<string>>();
  for (const fecha of programa.dates) {
    const vistos = new Set<string>();
    const repetidos = new Set<string>();
    for (const a of fecha.assignments) {
      const id = a.personId ?? a.teamId;
      if (id === null) continue;
      if (vistos.has(id)) repetidos.add(id);
      vistos.add(id);
    }
    if (repetidos.size > 0) resultado.set(fecha.date, repetidos);
  }
  return resultado;
}

/** La traza vive aparte y solo se lee al abrir el «¿Por qué?». */
export async function cargarTraza(year: number, month: number): Promise<GenerationTrace | null> {
  return getTrace(year, month);
}

/**
 * Borra el mes entero: deja de existir y la pantalla vuelve a ofrecer
 * "Generar programa" como si nunca se hubiera tocado.
 *
 * Es distinto de "Vaciar y asignar a mano", que conserva el mes con sus
 * fechas y sus bloqueos. Aquí no queda nada: ni casillas, ni candados, ni
 * semilla, ni traza. Un mes borrado tampoco cuenta ya como historial de los
 * meses siguientes, que es justo lo que se quiere al empezar de cero.
 */
export async function borrarPrograma(year: number, month: number): Promise<void> {
  await deleteProgram(year, month);
}
