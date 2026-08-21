import {
  DAY_NAMES_ES,
  MONTH_NAMES_ES,
  fromIso,
  daysBetween,
} from '../domain/dates';
import { TEAM_PREFIX, teamDisplayText } from '../domain/teams';
import type {
  AssignmentType,
  Group,
  Person,
  ProgramDateOut,
  ResolvedAssignment,
  Team,
} from '../domain/types';
import type { IconName, PdfCell, PdfColumn, PdfDateRow, PdfWeekCard, ProgramPdfModel } from './model';

/**
 * Puente entre el dominio y el documento PDF.
 *
 * `src/pdf/` no conoce el dominio: recibe texto ya compuesto. Este módulo es el
 * único sitio donde se decide cómo se lee una casilla, y por eso todas las
 * decisiones de presentación viven aquí y no repartidas por los componentes.
 */

const SUBTITULO = 'ASIGNACIONES DE SERVICIO';

/**
 * Parte un texto en dos líneas por el ÚLTIMO espacio.
 *
 * Es lo que hace la hoja original: "Constantino Castillo" ocupa dos líneas para
 * que quepa en una columna estrecha. Partir por el último espacio y no por el
 * primero es lo que mantiene juntos los nombres compuestos:
 * "Jose M. García" → "Jose M." / "García", no "Jose" / "M. García".
 */
export function splitInTwoLines(text: string): string[] {
  // Se normalizan los espacios antes de partir: un nombre tecleado con doble
  // espacio dejaría un espacio colgando al final de la primera línea, y en el
  // PDF eso se ve como un texto mal centrado sin causa aparente.
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed === '') return [];
  const cut = trimmed.lastIndexOf(' ');
  if (cut <= 0) return [trimmed];
  return [trimmed.slice(0, cut), trimmed.slice(cut + 1)];
}

/**
 * Parte el texto de un equipo en sus dos piezas.
 *
 * "Grupos 4 y 8" NO se puede partir por el último espacio: daría
 * "Grupos 4 y" / "8". El prefijo y la etiqueta son piezas distintas, así que se
 * corta justo detrás del prefijo cuando está. Un equipo con nombre propio
 * ("Equipo Norte") no lleva prefijo y se parte como cualquier otro texto.
 */
export function splitTeamText(text: string): string[] {
  const limpio = text.trim().replace(/\s+/g, ' ');
  if (limpio === '') return [];
  const conPrefijo = `${TEAM_PREFIX} `;
  if (limpio.startsWith(conPrefijo)) {
    return [TEAM_PREFIX, limpio.slice(conPrefijo.length)];
  }
  return splitInTwoLines(limpio);
}

export interface BuildPdfModelInput {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly dates: readonly ProgramDateOut[];
  readonly assignments: readonly ResolvedAssignment[];
  readonly assignmentTypes: readonly AssignmentType[];
  readonly people: readonly Person[];
  readonly teams: readonly Team[];
  readonly groups: readonly Group[];
}

function upper(text: string): string {
  return text.toLocaleUpperCase('es');
}

function monthName(month: number): string {
  return MONTH_NAMES_ES[month - 1] ?? '';
}

/**
 * Compone el contenido de una casilla a partir de las líneas de cada ocupante.
 *
 * Un tipo con `slotsPerDate > 1` produce varias asignaciones para la misma
 * fecha y columna. Con una sola ocupación se usan sus dos líneas (nombre /
 * apellidos); con varias, cada ocupante se aplana a una línea para que la
 * casilla no crezca sin control.
 */
function buildCell(ocupantes: readonly string[][]): PdfCell {
  if (ocupantes.length === 0) return { lines: [] };
  if (ocupantes.length === 1) return { lines: ocupantes[0] ?? [] };
  return { lines: ocupantes.map((lineas) => lineas.join(' ')) };
}

export function buildPdfModel(input: BuildPdfModelInput): ProgramPdfModel {
  const columnTypes = [...input.assignmentTypes]
    .filter((t) => t.active)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const columns: readonly PdfColumn[] = columnTypes.map((t) => ({
    typeKey: t.key,
    label: upper(t.label),
    icon: t.icon as IconName,
  }));

  const personById = new Map(input.people.map((p) => [p.id, p]));
  const teamById = new Map(input.teams.map((t) => [t.id, t]));

  /** date -> typeKey -> líneas de cada ocupante, ordenados por slotIndex */
  const porFecha = new Map<string, Map<string, string[][]>>();
  for (const a of [...input.assignments].sort((x, y) => x.slotIndex - y.slotIndex)) {
    // Las líneas se construyen SIN pasar por un texto intermedio. Componer
    // "Grupos 4 y 8" y partirlo después por el último espacio daría
    // "Grupos 4 y" / "8": el prefijo y la etiqueta son piezas distintas y
    // tienen que seguir siéndolo.
    let lineas: string[] | null = null;
    if (a.personId !== null) {
      const nombre = personById.get(a.personId)?.name;
      lineas = nombre === undefined ? null : splitInTwoLines(nombre);
    } else if (a.teamId !== null) {
      const team = teamById.get(a.teamId);
      if (team !== undefined) lineas = splitTeamText(teamDisplayText(team, input.groups));
    }
    if (lineas === null || lineas.length === 0) continue;

    const porTipo = porFecha.get(a.date) ?? new Map<string, string[][]>();
    const lista = porTipo.get(a.typeKey) ?? [];
    lista.push(lineas);
    porTipo.set(a.typeKey, lista);
    porFecha.set(a.date, porTipo);
  }

  const mesEnMayusculas = upper(monthName(input.month));
  const etiquetaMes = `DE ${mesEnMayusculas}`;

  const rows: PdfDateRow[] = [...input.dates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const plain = fromIso(d.date);
      const porTipo = porFecha.get(d.date) ?? new Map<string, string[][]>();
      return {
        date: d.date,
        dayName: upper(DAY_NAMES_ES[d.dayOfWeek] ?? ''),
        dayNumber: String(plain.d).padStart(2, '0'),
        monthLabel: etiquetaMes,
        cells: columnTypes.map((t) => buildCell(porTipo.get(t.key) ?? [])),
      };
    });

  return {
    title: mesEnMayusculas,
    subtitle: SUBTITULO,
    columns,
    weeks: groupIntoCards(rows),
  };
}

/**
 * Máxima separación, en días, entre dos fechas para que compartan tarjeta.
 *
 * Con la pareja habitual —sábado y el lunes siguiente— la distancia es de 2
 * días. Se admite hasta 3 para que la regla siga valiendo si el administrador
 * configura otros días de reunión (miércoles y sábado, por ejemplo), sin llegar
 * nunca a los 5 días que separan un lunes del sábado de su propia semana.
 */
const MAX_DIAS_MISMA_TARJETA = 3;

/** Nunca más de dos fechas por tarjeta: la tarjeta está diseñada para dos filas. */
const MAX_FILAS_POR_TARJETA = 2;

/**
 * Agrupa las filas en tarjetas de dos fechas seguidas.
 *
 * Una tarjeta junta un sábado con el LUNES SIGUIENTE, no con el lunes de su
 * misma semana. Es lo que pide la hoja de referencia, y es también lo que hace
 * que el mes salga en tarjetas completas: agrupando por semana ISO, un mes que
 * abre en sábado y cierra en lunes deja una fecha huérfana arriba y otra abajo,
 * y esas dos medias tarjetas desperdician alto que debería ser de las filas.
 *
 * El criterio es la DISTANCIA entre fechas consecutivas, no el nombre del día:
 * dos fechas van juntas si las separan como mucho `MAX_DIAS_MISMA_TARJETA`
 * días. Así el emparejado no se desalinea si falta una fecha (un sábado de
 * asamblea, por ejemplo) —la fecha suelta forma su propia tarjeta y las demás
 * siguen bien emparejadas— y sigue funcionando con otros días de reunión, sin
 * que este módulo tenga que saber qué es un sábado.
 */
export function groupIntoCards(rows: readonly PdfDateRow[]): PdfWeekCard[] {
  const cards: PdfWeekCard[] = [];
  let current: PdfDateRow[] = [];

  for (const row of rows) {
    const anterior = current[current.length - 1];
    const cabeEnLaActual =
      anterior !== undefined &&
      current.length < MAX_FILAS_POR_TARJETA &&
      daysBetween(anterior.date, row.date) <= MAX_DIAS_MISMA_TARJETA;

    if (!cabeEnLaActual) {
      if (current.length > 0) cards.push({ rows: current });
      current = [];
    }
    current.push(row);
  }
  if (current.length > 0) cards.push({ rows: current });

  return cards;
}

// ---------------------------------------------------------------------------
// Programa YA GUARDADO
// ---------------------------------------------------------------------------

/** Forma mínima que este módulo necesita de un programa guardado. */
export interface StoredAssignment {
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly personName: string | null;
  readonly teamLabel: string | null;
}
export interface StoredDate {
  readonly date: string;
  readonly dayOfWeek: number;
  readonly order: number;
  readonly assignments: readonly StoredAssignment[];
}
export interface BuildPdfModelFromStoredInput {
  readonly month: number;
  readonly dates: readonly StoredDate[];
  readonly assignmentTypes: readonly AssignmentType[];
}

/**
 * Construye el modelo a partir de un programa GUARDADO, usando los nombres
 * denormalizados tal y como quedaron al guardarlo.
 *
 * Esta es la diferencia importante con `buildPdfModel`: aquí NO se vuelve a
 * buscar el nombre actual de nadie. Reimprimir el programa del año pasado tiene
 * que dar exactamente la hoja que se repartió, aunque desde entonces alguien se
 * haya dado de baja, se haya renombrado o haya cambiado de equipo.
 *
 * Las fechas tampoco se recalculan: se pintan las guardadas, en su orden. Un
 * mes al que le falta un sábado porque hubo asamblea se imprime sin ese sábado.
 */
export function buildPdfModelFromStored(
  input: BuildPdfModelFromStoredInput,
): ProgramPdfModel {
  const columnTypes = [...input.assignmentTypes]
    .filter((t) => t.active)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const mesEnMayusculas = upper(monthName(input.month));
  const etiquetaMes = `DE ${mesEnMayusculas}`;

  const rows: PdfDateRow[] = [...input.dates]
    .sort((a, b) => a.order - b.order || a.date.localeCompare(b.date))
    .map((d) => {
      const porTipo = new Map<string, string[][]>();
      for (const a of [...d.assignments].sort((x, y) => x.slotIndex - y.slotIndex)) {
        let lineas: string[] | null = null;
        if (a.personName !== null && a.personName !== '') {
          lineas = splitInTwoLines(a.personName);
        } else if (a.teamLabel !== null && a.teamLabel !== '') {
          lineas = splitTeamText(a.teamLabel);
        }
        if (lineas === null || lineas.length === 0) continue;
        const lista = porTipo.get(a.typeKey) ?? [];
        lista.push(lineas);
        porTipo.set(a.typeKey, lista);
      }

      return {
        date: d.date,
        dayName: upper(DAY_NAMES_ES[d.dayOfWeek] ?? ''),
        dayNumber: String(fromIso(d.date).d).padStart(2, '0'),
        monthLabel: etiquetaMes,
        cells: columnTypes.map((t) => buildCell(porTipo.get(t.key) ?? [])),
      };
    });

  return {
    title: mesEnMayusculas,
    subtitle: SUBTITULO,
    columns: columnTypes.map((t) => ({
      typeKey: t.key,
      label: upper(t.label),
      icon: t.icon as IconName,
    })),
    weeks: groupIntoCards(rows),
  };
}
