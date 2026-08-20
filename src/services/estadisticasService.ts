import { getHistoryWindow } from '@/data/programs.repo';
import { computeHistoryStats } from '@/domain/historyStats';
import type { HistoryStatsOutput } from '@/domain/historyStats';
import { loadCatalogo, type Catalogo } from './programService';

/**
 * Capa de orquestación de la pantalla de Estadísticas: combina el catálogo
 * (`src/data`) con la ventana de historial (`src/data/programs.repo.ts`) y el
 * cálculo puro (`src/domain/historyStats.ts`). Ningún componente de React
 * debería llamar a Firestore o a `computeHistoryStats` directamente.
 */

/** Opciones fijas del selector de ventana de la pantalla. */
export const WINDOW_OPTIONS = [
  { months: 1, label: 'Último mes' },
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 0, label: 'Todo el historial' },
] as const;

export interface EstadisticasCargadas {
  readonly catalogo: Catalogo;
  /** Ventana efectivamente usada (puede venir de `settings.historyWindowMonths` si no se pidió otra). */
  readonly windowMonths: number;
  readonly stats: HistoryStatsOutput;
}

/**
 * Carga y calcula las estadísticas de una ventana de historial.
 *
 * Si no se indica `windowMonths`, se usa el `historyWindowMonths` de los
 * ajustes guardados — así la pantalla abre mostrando la misma ventana que usa
 * el generador por defecto, y el administrador solo cambia el selector si
 * quiere mirar algo distinto.
 *
 * `catalogo` es opcional para poder reutilizar uno ya cargado al cambiar de
 * ventana sin repetir las lecturas de personas/equipos/tipos/ajustes.
 */
export async function cargarEstadisticas(
  windowMonths?: number,
  catalogo?: Catalogo
): Promise<EstadisticasCargadas> {
  const catalogoResuelto = catalogo ?? (await loadCatalogo());
  const ventana = windowMonths ?? catalogoResuelto.settings.historyWindowMonths;

  const { months, assignments } = await getHistoryWindow(ventana);

  const stats = computeHistoryStats({
    people: catalogoResuelto.people,
    teams: catalogoResuelto.teams,
    groups: catalogoResuelto.groups,
    assignmentTypes: catalogoResuelto.assignmentTypes,
    history: assignments,
    monthsInWindow: months,
  });

  return { catalogo: catalogoResuelto, windowMonths: ventana, stats };
}
