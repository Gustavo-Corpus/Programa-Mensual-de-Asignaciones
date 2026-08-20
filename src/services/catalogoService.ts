import { z } from 'zod';

import type { AssignmentKind, AssignmentType, Group, Team } from '../domain/types';

/**
 * Reglas del catálogo (personas, grupos/equipos, responsabilidades) que no
 * son una validación de campo suelta: nombres duplicados, equipos mal
 * formados, grupos huérfanos, inmutabilidad de `key`. Viven aquí, como
 * funciones puras y exportadas, y no dentro de un componente de React,
 * porque ahí no se pueden probar (CLAUDE.md, sección Testing).
 *
 * Las validaciones de un solo campo (slotsPerDate entero >= 1, daysOfWeek,
 * icon) ya tienen esquema en `src/data/schemas.ts`: se reutilizan desde las
 * páginas en vez de duplicarlas aquí.
 */

// ---------------------------------------------------------------------------
// Nombres duplicados (personas, grupos, equipos con nombre propio)
// ---------------------------------------------------------------------------

export interface EntidadConNombre {
  readonly id: string;
  readonly name: string;
}

/**
 * true si `nombre` (comparado sin distinguir mayúsculas/minúsculas ni
 * espacios sobrantes al principio/final) ya lo usa otra entidad de la lista,
 * distinta de `idPropio`. Se compara contra activas E inactivas: nadie se
 * borra nunca (CLAUDE.md), así que un nombre nuevo puede colisionar con una
 * entidad desactivada hace tiempo.
 *
 * Es un aviso, no una prohibición: dos personas reales pueden compartir
 * nombre (padre e hijo, por ejemplo). La UI decide si bloquea o solo avisa.
 */
export function nombreDuplicado(
  nombre: string,
  existentes: readonly EntidadConNombre[],
  idPropio: string | null
): boolean {
  const normalizado = nombre.trim().toLowerCase();
  if (normalizado === '') return false;
  return existentes.some((e) => e.id !== idPropio && e.name.trim().toLowerCase() === normalizado);
}

// ---------------------------------------------------------------------------
// Grupos y equipos (docs/arquitectura.md §4)
// ---------------------------------------------------------------------------

export interface EquipoMalFormado {
  readonly teamId: string;
  /** Cuántos grupos activos tiene ahora mismo. Nunca es 2 en esta lista. */
  readonly gruposActivos: number;
}

/**
 * Equipos activos cuyo número de grupos activos no es exactamente 2. No es
 * un error de generación: un equipo con 1 grupo activo (o con 0) sigue
 * siendo asignable (docs/algoritmo.md, caso límite "un equipo con todos sus
 * grupos desactivados"), pero su etiqueta impresa saldrá con un solo nombre
 * o vacía, y el administrador probablemente quiere saberlo antes de
 * imprimir el programa.
 */
export function equiposMalFormados(
  teams: readonly Team[],
  groups: readonly Group[]
): EquipoMalFormado[] {
  return teams
    .filter((t) => t.active)
    .map((t) => ({
      teamId: t.id,
      gruposActivos: groups.filter((g) => g.teamId === t.id && g.active).length,
    }))
    .filter((r) => r.gruposActivos !== 2);
}

/**
 * Grupos activos cuyo `teamId` no corresponde a ningún equipo existente
 * (activo o inactivo). El generador ni siquiera ve los grupos —solo
 * equipos— así que un grupo huérfano no rompe la generación, pero queda
 * fuera de toda etiqueta y de toda cuenta: es un dato muerto que conviene
 * que el administrador vea y corrija.
 */
export function gruposHuerfanos(groups: readonly Group[], teams: readonly Team[]): Group[] {
  const idsEquipos = new Set(teams.map((t) => t.id));
  return groups.filter((g) => g.active && !idsEquipos.has(g.teamId));
}

// ---------------------------------------------------------------------------
// Responsabilidades (assignmentTypes) — docs/arquitectura.md §4
// ---------------------------------------------------------------------------

/**
 * Formato de `key`: minúsculas, dígitos y guion bajo, 1-40 caracteres. Es la
 * clave estable con la que se cuenta el historial (docs/arquitectura.md
 * §4): una vez creada no cambia nunca, así que se valida fuerte en el único
 * momento en que se puede, la creación.
 */
export const claveResponsabilidadSchema = z
  .string()
  .min(1, 'la clave no puede estar vacía')
  .max(40, 'la clave no puede tener más de 40 caracteres')
  .regex(/^[a-z0-9_]+$/, 'la clave solo puede tener minúsculas, dígitos y guion bajo');

/** true si `key` ya la usa otra responsabilidad (activa o inactiva). */
export function claveDuplicada(key: string, existentes: readonly AssignmentType[]): boolean {
  return existentes.some((t) => t.key === key);
}

/**
 * true si no queda ningún día de la semana marcado: la responsabilidad no
 * aparecerá en ninguna fecha del programa (docs/algoritmo.md, Paso 1 — las
 * fechas se derivan de `daysOfWeek` de los tipos activos). No es un error de
 * datos, pero seguramente no es lo que el administrador quería.
 */
export function sinDiasDeSemana(daysOfWeek: readonly number[]): boolean {
  return daysOfWeek.length === 0;
}

/**
 * Texto de confirmación al cambiar `kind` de una responsabilidad ya
 * existente. Cambiarlo es legítimo (una responsabilidad puede pasar de
 * persona a equipo si el administrador reorganiza el servicio) pero las
 * asignaciones ya guardadas de ese tipo no se convierten: siguen teniendo
 * `kind` antiguo en el historial y en los programas impresos.
 */
export function mensajeCambioKind(kindNuevo: AssignmentKind): string {
  const objetivo = kindNuevo === 'PERSON' ? 'personas' : 'equipos';
  return (
    `Vas a cambiar esta responsabilidad para que se asigne a ${objetivo}. ` +
    'Las asignaciones ya guardadas de este tipo NO se convierten: seguirán mostrando lo que ' +
    'se asignó entonces. ¿Confirmas el cambio?'
  );
}
