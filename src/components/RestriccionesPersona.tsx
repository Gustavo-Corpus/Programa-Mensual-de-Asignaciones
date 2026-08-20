import { useMemo, useState } from 'react';
import type { AssignmentType, Group, GroupRole, Person, Team } from '@/domain/types';
import { DAY_NAMES_ES } from '@/domain/dates';
import { teamDisplayText } from '@/domain/teams';
import type { PersonChanges } from '@/data/people.repo';

/**
 * El editor de grupo, papel y restricciones de una persona.
 *
 * Vive en su propio componente y no dentro de PersonasPage porque es la única
 * parte de esa pantalla con estado propio no trivial (un borrador que se puede
 * descartar) y porque así la lista de personas sigue leyéndose de un vistazo.
 *
 * Nada de lo que se ofrece aquí está escrito a mano: las responsabilidades
 * salen del catálogo y los días, de los `daysOfWeek` de esas responsabilidades.
 * Añadir un tipo nuevo o hacer que algo se haga en domingo aparece solo.
 */

export const ETIQUETA_PAPEL: Readonly<Record<GroupRole, string>> = {
  CAPTAIN: 'Capitán',
  ASSISTANT: 'Auxiliar',
  MEMBER: 'Miembro',
};

export interface RestriccionesProps {
  readonly persona: Person;
  readonly assignmentTypes: readonly AssignmentType[];
  readonly groups: readonly Group[];
  readonly teams: readonly Team[];
  readonly ocupado: boolean;
  readonly onGuardar: (cambios: PersonChanges) => void;
  readonly onCancelar: () => void;
}

/** Nombre completo de un grupo con su equipo: «Grupo 1 · Grupos 1 y 5». */
export function nombreDeGrupo(
  group: Group,
  teams: readonly Team[],
  groups: readonly Group[],
): string {
  const equipo = teams.find((t) => t.id === group.teamId);
  const equipoTexto = equipo === undefined ? '' : teamDisplayText(equipo, groups);
  return equipoTexto === '' ? `Grupo ${group.name}` : `Grupo ${group.name} · ${equipoTexto}`;
}

export function RestriccionesPersona(props: RestriccionesProps) {
  const { persona, assignmentTypes, groups, teams, ocupado } = props;

  const tiposDePersona = useMemo(
    () =>
      assignmentTypes
        .filter((t) => t.kind === 'PERSON' && t.active)
        .slice()
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
    [assignmentTypes],
  );

  /** Los días en los que de verdad hay algo que asignar, no los siete. */
  const diasPosibles = useMemo(() => {
    const dias = new Set<number>();
    for (const tipo of assignmentTypes) {
      if (!tipo.active) continue;
      for (const dia of tipo.daysOfWeek) dias.add(dia);
    }
    return [...dias].sort((a, b) => a - b);
  }, [assignmentTypes]);

  const gruposActivos = useMemo(
    () =>
      groups
        .filter((g) => g.active || g.id === persona.groupId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })),
    [groups, persona.groupId],
  );

  const [groupId, setGroupId] = useState<string | null>(persona.groupId);
  const [role, setRole] = useState<GroupRole>(persona.role);
  const [tiposPermitidos, setTiposPermitidos] = useState<readonly string[] | null>(
    persona.allowedTypeKeys,
  );
  const [diasBloqueados, setDiasBloqueados] = useState<readonly number[]>(persona.blockedDaysOfWeek);

  const sinRestriccionDeTipo = tiposPermitidos === null;

  /**
   * Marcar «todas» vuelve a `null` en vez de rellenar la lista con todas las
   * claves de hoy: son estados distintos. Con `null`, una responsabilidad que
   * se cree mañana la incluye; con la lista completa de hoy, quedaría fuera y
   * nadie entendería por qué.
   */
  const alternarTodas = (todas: boolean) => {
    setTiposPermitidos(todas ? null : tiposDePersona.map((t) => t.key));
  };

  const alternarTipo = (key: string) => {
    const actuales = tiposPermitidos ?? tiposDePersona.map((t) => t.key);
    setTiposPermitidos(
      actuales.includes(key) ? actuales.filter((k) => k !== key) : [...actuales, key],
    );
  };

  const alternarDia = (dia: number) => {
    setDiasBloqueados(
      diasBloqueados.includes(dia)
        ? diasBloqueados.filter((d) => d !== dia)
        : [...diasBloqueados, dia],
    );
  };

  const nadaPermitido = tiposPermitidos !== null && tiposPermitidos.length === 0;
  const todosLosDiasBloqueados =
    diasPosibles.length > 0 && diasPosibles.every((d) => diasBloqueados.includes(d));

  return (
    <form
      className="restricciones"
      onSubmit={(e) => {
        e.preventDefault();
        props.onGuardar({
          groupId,
          role,
          allowedTypeKeys: tiposPermitidos,
          blockedDaysOfWeek: [...diasBloqueados].sort((a, b) => a - b),
        });
      }}
    >
      <div className="restricciones-bloque">
        <h3>Grupo de aseo</h3>
        <p className="restricciones-ayuda">
          Solo importa para la regla de capitanes: cuando a un equipo le toca el aseo, su capitán y
          su auxiliar son quienes pueden cubrir las responsabilidades que decidas en Ajustes.
        </p>
        <div className="restricciones-fila">
          <label className="campo-catalogo">
            Grupo
            <select
              value={groupId ?? ''}
              disabled={ocupado}
              onChange={(e) => setGroupId(e.target.value === '' ? null : e.target.value)}
            >
              <option value="">Sin grupo</option>
              {gruposActivos.map((g) => (
                <option key={g.id} value={g.id}>
                  {nombreDeGrupo(g, teams, groups)}
                  {g.active ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
          </label>

          <label className="campo-catalogo">
            Papel
            <select
              value={role}
              disabled={ocupado || groupId === null}
              onChange={(e) => setRole(e.target.value as GroupRole)}
            >
              <option value="CAPTAIN">{ETIQUETA_PAPEL.CAPTAIN}</option>
              <option value="ASSISTANT">{ETIQUETA_PAPEL.ASSISTANT}</option>
              <option value="MEMBER">{ETIQUETA_PAPEL.MEMBER}</option>
            </select>
          </label>
        </div>
        {groupId === null && role !== 'MEMBER' && (
          <p className="restricciones-aviso">
            Sin grupo, el papel no se usa: la reserva se compone a partir de los grupos del equipo
            que limpia.
          </p>
        )}
      </div>

      <div className="restricciones-bloque">
        <h3>Responsabilidades que puede recibir</h3>
        <label className="restricciones-casilla">
          <input
            type="checkbox"
            checked={sinRestriccionDeTipo}
            disabled={ocupado}
            onChange={(e) => alternarTodas(e.target.checked)}
          />
          <span>Todas, incluidas las que se creen más adelante</span>
        </label>

        <div className="restricciones-opciones" aria-disabled={sinRestriccionDeTipo}>
          {tiposDePersona.map((tipo) => (
            <label key={tipo.key} className="restricciones-casilla">
              <input
                type="checkbox"
                checked={sinRestriccionDeTipo || (tiposPermitidos?.includes(tipo.key) ?? false)}
                disabled={ocupado || sinRestriccionDeTipo}
                onChange={() => alternarTipo(tipo.key)}
              />
              <span>{tipo.label}</span>
            </label>
          ))}
        </div>

        {nadaPermitido && (
          <p className="restricciones-aviso">
            Sin ninguna marcada, esta persona no entrará en el reparto automático. Sigue activa y su
            historial se conserva; si lo que quieres es apartarla del todo, es mejor desactivarla.
          </p>
        )}
      </div>

      <div className="restricciones-bloque">
        <h3>Días en los que puede servir</h3>
        <div className="restricciones-opciones">
          {diasPosibles.map((dia) => (
            <label key={dia} className="restricciones-casilla">
              <input
                type="checkbox"
                checked={!diasBloqueados.includes(dia)}
                disabled={ocupado}
                onChange={() => alternarDia(dia)}
              />
              <span className="restricciones-dia">{DAY_NAMES_ES[dia]}</span>
            </label>
          ))}
        </div>
        {todosLosDiasBloqueados && (
          <p className="restricciones-aviso">
            Sin ningún día marcado tampoco entrará en el reparto.
          </p>
        )}
      </div>

      <div className="acciones-catalogo">
        <button type="submit" className="boton-principal" disabled={ocupado}>
          Guardar restricciones
        </button>
        <button type="button" disabled={ocupado} onClick={props.onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Resumen de una línea de lo que tiene declarado una persona, para la lista. */
export function resumenRestricciones(
  persona: Person,
  assignmentTypes: readonly AssignmentType[],
): string[] {
  const etiquetas: string[] = [];

  if (persona.allowedTypeKeys !== null) {
    const nombres = persona.allowedTypeKeys.map(
      (key) => assignmentTypes.find((t) => t.key === key)?.label ?? key,
    );
    etiquetas.push(nombres.length === 0 ? 'sin responsabilidades' : `solo ${nombres.join(', ')}`);
  }

  if (persona.blockedDaysOfWeek.length > 0) {
    const dias = [...persona.blockedDaysOfWeek]
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES_ES[d] ?? String(d));
    etiquetas.push(`no ${dias.join(' ni ')}`);
  }

  return etiquetas;
}
