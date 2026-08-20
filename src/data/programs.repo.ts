import {
  Timestamp,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { addMonths, monthKey } from '../domain/dates';
import type {
  GenerationSettings,
  GenerationTrace,
  Group,
  HistoricalAssignment,
  Person,
  ProgramDateOut,
  ResolvedAssignment,
  Team,
  Warning,
} from '../domain/types';
import { db } from './firebase';
import {
  buildProgramDates,
  programDocToHistoricalAssignments,
  programFromDoc,
  programToDocData,
  traceFromDoc,
  traceToDoc,
} from './mappers';
import type { ProgramDateDoc, ProgramDocument, ProgramStatus } from './types';

const COLLECTION = 'programs';

/**
 * Una sola lectura: el documento es el agregado completo del mes
 * (docs/arquitectura.md §8). `null` si el mes nunca se generó/guardó.
 */
export async function getProgram(year: number, month: number): Promise<ProgramDocument | null> {
  const id = monthKey(year, month);
  const snapshot = await getDoc(doc(db, COLLECTION, id));
  if (!snapshot.exists()) return null;
  return programFromDoc(id, snapshot.data());
}

export interface SaveProgramInput {
  readonly year: number;
  readonly month: number;
  readonly status: ProgramStatus;
  readonly seed: number;
  /** Los ajustes usados AL generar, no los actuales. */
  readonly settingsSnapshot: GenerationSettings;
  readonly warnings: readonly Warning[];
  readonly dates: readonly ProgramDateOut[];
  readonly assignments: readonly ResolvedAssignment[];
  readonly people: readonly Person[];
  readonly teams: readonly Team[];
  readonly groups: readonly Group[];
  readonly trace: GenerationTrace;
}

/**
 * Escribe el documento agregado del programa y, en el mismo lote atómico, la
 * traza de explicación en `programs/{YYYY-MM}/meta/trace`. `createdAt` se
 * conserva si el mes ya existía; `updatedAt` siempre se refresca.
 */
export async function saveProgram(input: SaveProgramInput): Promise<void> {
  const id = monthKey(input.year, input.month);
  const programRef = doc(db, COLLECTION, id);
  const traceRef = doc(db, COLLECTION, id, 'meta', 'trace');

  const existing = await getDoc(programRef);
  const existingData = existing.exists() ? existing.data() : null;
  const createdAt =
    existingData !== null && existingData.createdAt instanceof Timestamp
      ? existingData.createdAt.toMillis()
      : Date.now();

  const dates = buildProgramDates({
    dates: input.dates,
    assignments: input.assignments,
    people: input.people,
    teams: input.teams,
    groups: input.groups,
  });

  const docData = programToDocData({
    year: input.year,
    month: input.month,
    status: input.status,
    seed: input.seed,
    settingsSnapshot: input.settingsSnapshot,
    warnings: input.warnings,
    createdAt,
    updatedAt: Date.now(),
    dates,
  });

  const batch = writeBatch(db);
  batch.set(programRef, docData);
  batch.set(traceRef, traceToDoc(input.trace));
  await batch.commit();
}

/**
 * Ventana de historial consultada por RANGO SOBRE EL ID DEL DOCUMENTO, no por
 * campos. Los ids son "2026-08" con cero a la izquierda, así que su orden
 * lexicográfico ya es el cronológico y no hace falta índice compuesto
 * (docs/arquitectura.md §8, decisión 1). `windowMonths === 0` trae todo el
 * historial anterior al mes pedido.
 */
export async function getHistory(
  year: number,
  month: number,
  windowMonths: number
): Promise<HistoricalAssignment[]> {
  const targetId = monthKey(year, month);
  const constraints = [where(documentId(), '<', targetId)];

  if (windowMonths > 0) {
    const start = addMonths(year, month, -windowMonths);
    constraints.push(where(documentId(), '>=', monthKey(start.year, start.month)));
  }

  const historyQuery = query(collection(db, COLLECTION), ...constraints, orderBy(documentId()));
  const snapshot = await getDocs(historyQuery);

  const result: HistoricalAssignment[] = [];
  for (const docSnapshot of snapshot.docs) {
    const program = programFromDoc(docSnapshot.id, docSnapshot.data());
    result.push(...programDocToHistoricalAssignments(program));
  }
  return result;
}

/**
 * Ventana de historial para la pantalla de Estadísticas, ANCLADA en el último
 * mes guardado (no en la fecha de hoy): así el resultado no depende de qué
 * día se abra la pantalla, y "último mes" significa siempre "el mes más
 * reciente que de verdad se generó y guardó".
 *
 * A diferencia de `getHistory` (que EXCLUYE el mes objetivo porque ese mes se
 * está generando), aquí no hay ningún mes en curso que excluir de su propio
 * historial: el último mes guardado se incluye.
 *
 * `windowMonths` cuenta meses GUARDADOS a partir del último, inclusive: con
 * `windowMonths = 1` solo entra el último mes; con `3`, el último y los dos
 * anteriores. `0` trae todo el historial.
 *
 * Coste de lectura: 1 lectura para localizar el último mes guardado (consulta
 * por rango sobre `documentId()`, límite 1 — mismo patrón sin índice
 * compuesto que `getHistory`) + 1 lectura por cada documento de programa
 * ANTERIOR al último dentro de la ventana. El último mes no se vuelve a leer:
 * ya se tiene su contenido de la primera consulta. En total, exactamente
 * tantas lecturas como meses entren en la ventana (con `windowMonths = 0`,
 * tantas como meses se hayan guardado alguna vez).
 */
export async function getHistoryWindow(
  windowMonths: number
): Promise<{ months: string[]; assignments: HistoricalAssignment[] }> {
  const latestSnapshot = await getDocs(
    query(collection(db, COLLECTION), orderBy(documentId(), 'desc'), limit(1))
  );
  const latestDocSnapshot = latestSnapshot.docs[0];
  if (latestDocSnapshot === undefined) return { months: [], assignments: [] };

  const latestProgram = programFromDoc(latestDocSnapshot.id, latestDocSnapshot.data());

  const constraints = [where(documentId(), '<', latestDocSnapshot.id)];
  if (windowMonths > 0) {
    const start = addMonths(latestProgram.year, latestProgram.month, -(windowMonths - 1));
    constraints.push(where(documentId(), '>=', monthKey(start.year, start.month)));
  }

  const olderQuery = query(collection(db, COLLECTION), ...constraints, orderBy(documentId()));
  const olderSnapshot = await getDocs(olderQuery);

  const olderPrograms = olderSnapshot.docs.map((d) => programFromDoc(d.id, d.data()));

  const months = [...olderPrograms.map((p) => p.id), latestDocSnapshot.id];
  const assignments: HistoricalAssignment[] = [
    ...olderPrograms.flatMap(programDocToHistoricalAssignments),
    ...programDocToHistoricalAssignments(latestProgram),
  ];
  return { months, assignments };
}

/** Se lee solo cuando el usuario abre el popover "¿Por qué?". */
export async function getTrace(year: number, month: number): Promise<GenerationTrace | null> {
  const id = monthKey(year, month);
  const snapshot = await getDoc(doc(db, COLLECTION, id, 'meta', 'trace'));
  if (!snapshot.exists()) return null;
  return traceFromDoc(id, snapshot.data());
}

/**
 * Reescribe solo las fechas de un programa ya guardado, para una edición
 * manual de casilla.
 *
 * Firestore no sabe actualizar un elemento concreto de un array anidado, así
 * que se reescribe el array completo. No es un problema aquí: el programa es un
 * agregado de un documento y el mes entero pesa unas decenas de kilobytes.
 *
 * `seed` y `settingsSnapshot` NO se tocan: describen cómo se generó el mes, y
 * una edición a mano posterior no cambia ese hecho. Confundirlos haría que
 * regenerar con el mismo seed dejara de reproducir lo que se generó.
 */
export async function updateProgramDates(
  year: number,
  month: number,
  dates: readonly ProgramDateDoc[],
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, monthKey(year, month)), {
    dates,
    updatedAt: Timestamp.fromMillis(Date.now()),
  });
}
