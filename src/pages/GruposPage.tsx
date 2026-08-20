import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import '@/styles/catalogo.css';
import type { Group, Team } from '@/domain/types';
import { teamDisplayText } from '@/domain/teams';
import { createGroup, listGroups, updateGroup } from '@/data/groups.repo';
import { createTeam, listTeams, updateTeam } from '@/data/teams.repo';
import { equiposMalFormados, gruposHuerfanos } from '@/services/catalogoService';
import { CampoEnLinea } from '@/components/CampoEnLinea';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; teams: Team[]; groups: Group[] };

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

function siguienteOrden(ordenes: readonly number[]): number {
  return ordenes.length === 0 ? 1 : Math.max(...ordenes) + 1;
}

export function GruposPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const [nuevoEquipoNombre, setNuevoEquipoNombre] = useState('');
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState('');
  const [nuevoGrupoTeamId, setNuevoGrupoTeamId] = useState('');

  const cargar = useCallback(async () => {
    setEstado({ fase: 'cargando' });
    try {
      const [teams, groups] = await Promise.all([listTeams(), listGroups()]);
      setEstado({ fase: 'listo', teams, groups });
    } catch (error) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(error) });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejecutar = useCallback(async (accion: () => Promise<void>) => {
    setOcupado(true);
    setErrorAccion(null);
    try {
      await accion();
    } catch (error) {
      setErrorAccion(mensajeDeError(error));
    } finally {
      setOcupado(false);
    }
  }, []);

  const teams = useMemo(() => (estado.fase === 'listo' ? estado.teams : []), [estado]);
  const groups = useMemo(() => (estado.fase === 'listo' ? estado.groups : []), [estado]);

  // Preselecciona el primer equipo disponible en cuanto carga la lista.
  useEffect(() => {
    if (estado.fase === 'listo' && nuevoGrupoTeamId === '' && estado.teams.length > 0) {
      const primero = estado.teams[0];
      if (primero) setNuevoGrupoTeamId(primero.id);
    }
  }, [estado, nuevoGrupoTeamId]);

  const crearEquipo = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      void ejecutar(async () => {
        const nombre = nuevoEquipoNombre.trim();
        await createTeam({
          displayName: nombre === '' ? null : nombre,
          order: siguienteOrden(teams.map((t) => t.order)),
        });
        setNuevoEquipoNombre('');
        await cargar();
      });
    },
    [ejecutar, nuevoEquipoNombre, teams, cargar],
  );

  const crearGrupo = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      void ejecutar(async () => {
        const nombre = nuevoGrupoNombre.trim();
        if (nombre === '' || nuevoGrupoTeamId === '') return;
        const ordenesDelEquipo = groups.filter((g) => g.teamId === nuevoGrupoTeamId).map((g) => g.order);
        await createGroup({
          name: nombre,
          teamId: nuevoGrupoTeamId,
          order: siguienteOrden(ordenesDelEquipo),
        });
        setNuevoGrupoNombre('');
        await cargar();
      });
    },
    [ejecutar, nuevoGrupoNombre, nuevoGrupoTeamId, groups, cargar],
  );

  const guardarEquipo = useCallback(
    (id: string, changes: Partial<Pick<Team, 'displayName' | 'order'>>) =>
      void ejecutar(async () => {
        await updateTeam(id, changes);
        await cargar();
      }),
    [ejecutar, cargar],
  );

  const alternarActivoEquipo = useCallback(
    (team: Team) =>
      void ejecutar(async () => {
        await updateTeam(team.id, { active: !team.active });
        await cargar();
      }),
    [ejecutar, cargar],
  );

  const guardarGrupo = useCallback(
    (id: string, changes: Partial<Pick<Group, 'name' | 'order' | 'teamId'>>) =>
      void ejecutar(async () => {
        await updateGroup(id, changes);
        await cargar();
      }),
    [ejecutar, cargar],
  );

  const alternarActivoGrupo = useCallback(
    (group: Group) =>
      void ejecutar(async () => {
        await updateGroup(group.id, { active: !group.active });
        await cargar();
      }),
    [ejecutar, cargar],
  );

  const equiposMal = useMemo(() => new Set(equiposMalFormados(teams, groups).map((r) => r.teamId)), [teams, groups]);
  const huerfanos = useMemo(() => gruposHuerfanos(groups, teams), [groups, teams]);

  if (estado.fase === 'cargando') {
    return (
      <section className="pagina">
        <h1>Grupos y equipos</h1>
        <p>Cargando…</p>
      </section>
    );
  }

  if (estado.fase === 'error') {
    return (
      <section className="pagina">
        <h1>Grupos y equipos</h1>
        <p className="mensaje-error">{estado.mensaje}</p>
        <button type="button" onClick={() => void cargar()}>
          Reintentar
        </button>
      </section>
    );
  }

  const teamsOrdenados = [...teams].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  return (
    <section className="pagina">
      <header className="pagina-encabezado">
        <h1>Grupos y equipos</h1>
      </header>

      <p className="nota-explicativa">
        Un <strong>grupo</strong> es una cuadrilla de aseo individual ("1", "2"…). Un{' '}
        <strong>equipo</strong> es la pareja fija de dos grupos que realmente se asigna: el
        generador siempre reparte equipos, nunca grupos sueltos. Nada se borra nunca, solo se
        desactiva.
      </p>

      {errorAccion !== null && <p className="mensaje-error">{errorAccion}</p>}

      <form className="form-catalogo" onSubmit={crearEquipo}>
        <div className="campo-catalogo">
          <label htmlFor="nuevo-equipo-nombre">Nuevo equipo (nombre propio, opcional)</label>
          <input
            id="nuevo-equipo-nombre"
            type="text"
            value={nuevoEquipoNombre}
            disabled={ocupado}
            placeholder="Vacío = etiqueta automática por sus grupos"
            onChange={(e) => setNuevoEquipoNombre(e.target.value)}
          />
        </div>
        <button type="submit" className="boton-principal" disabled={ocupado}>
          Crear equipo
        </button>
      </form>

      <form className="form-catalogo" onSubmit={crearGrupo}>
        <div className="campo-catalogo">
          <label htmlFor="nuevo-grupo-nombre">Nuevo grupo</label>
          <input
            id="nuevo-grupo-nombre"
            type="text"
            value={nuevoGrupoNombre}
            disabled={ocupado || teams.length === 0}
            placeholder="Nombre o número"
            onChange={(e) => setNuevoGrupoNombre(e.target.value)}
          />
        </div>
        <div className="campo-catalogo">
          <label htmlFor="nuevo-grupo-equipo">Equipo</label>
          <select
            id="nuevo-grupo-equipo"
            value={nuevoGrupoTeamId}
            disabled={ocupado || teams.length === 0}
            onChange={(e) => setNuevoGrupoTeamId(e.target.value)}
          >
            {teams.length === 0 && <option value="">— crea primero un equipo —</option>}
            {teamsOrdenados.map((t) => (
              <option key={t.id} value={t.id}>
                {teamDisplayText(t, groups) || '(sin grupos activos)'}
                {!t.active ? ' (inactivo)' : ''}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="boton-principal"
          disabled={ocupado || teams.length === 0 || nuevoGrupoNombre.trim() === ''}
        >
          Crear grupo
        </button>
      </form>

      {huerfanos.length > 0 && (
        <ul className="avisos-catalogo">
          <li>
            {huerfanos.length === 1
              ? 'Hay un grupo activo cuyo equipo ya no existe: el generador lo ignora por completo.'
              : `Hay ${huerfanos.length} grupos activos cuyo equipo ya no existe: el generador los ignora por completo.`}{' '}
            Reasígnalos abajo, en «Grupos sin equipo».
          </li>
        </ul>
      )}

      {teamsOrdenados.length === 0 ? (
        <p className="estado-vacio">Todavía no hay ningún equipo; crea el primero arriba.</p>
      ) : (
        teamsOrdenados.map((team) => (
          <TarjetaEquipo
            key={team.id}
            team={team}
            grupos={groups
              .filter((g) => g.teamId === team.id)
              .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))}
            todosLosEquipos={teamsOrdenados}
            todosLosGrupos={groups}
            ocupado={ocupado}
            malFormado={equiposMal.has(team.id)}
            onGuardarEquipo={(changes) => guardarEquipo(team.id, changes)}
            onAlternarActivoEquipo={() => alternarActivoEquipo(team)}
            onGuardarGrupo={guardarGrupo}
            onAlternarActivoGrupo={alternarActivoGrupo}
          />
        ))
      )}

      {huerfanos.length > 0 && (
        <>
          <h2 className="subtitulo-catalogo">Grupos sin equipo</h2>
          <ul className="lista-catalogo">
            {huerfanos.map((grupo) => (
              <FilaGrupo
                key={grupo.id}
                grupo={grupo}
                todosLosEquipos={teamsOrdenados}
                todosLosGrupos={groups}
                ocupado={ocupado}
                onGuardar={(changes) => guardarGrupo(grupo.id, changes)}
                onAlternarActivo={() => alternarActivoGrupo(grupo)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface TarjetaEquipoProps {
  readonly team: Team;
  readonly grupos: Group[];
  readonly todosLosEquipos: Team[];
  readonly todosLosGrupos: Group[];
  readonly ocupado: boolean;
  readonly malFormado: boolean;
  readonly onGuardarEquipo: (changes: Partial<Pick<Team, 'displayName' | 'order'>>) => void;
  readonly onAlternarActivoEquipo: () => void;
  readonly onGuardarGrupo: (id: string, changes: Partial<Pick<Group, 'name' | 'order' | 'teamId'>>) => void;
  readonly onAlternarActivoGrupo: (grupo: Group) => void;
}

function TarjetaEquipo(props: TarjetaEquipoProps) {
  const { team, grupos, ocupado, malFormado } = props;
  const titulo = teamDisplayText(team, props.todosLosGrupos) || '(equipo sin nombre ni grupos activos)';

  return (
    <div className={team.active ? 'tarjeta-equipo' : 'tarjeta-equipo inactiva'}>
      <div className="tarjeta-equipo-encabezado">
        <h2 className="tarjeta-equipo-titulo">
          {titulo}
          {!team.active && <span className="etiqueta-inactiva">inactivo</span>}
        </h2>
        <div className="campo-catalogo">
          <label htmlFor={`equipo-nombre-${team.id}`}>Nombre propio</label>
          <CampoEnLinea
            valor={team.displayName ?? ''}
            ocupado={ocupado}
            ariaLabel={`Nombre propio del equipo ${titulo}`}
            placeholder="Vacío = automático"
            onGuardar={(v) => props.onGuardarEquipo({ displayName: v.trim() === '' ? null : v.trim() })}
          />
        </div>
        <div className="campo-catalogo">
          <label htmlFor={`equipo-orden-${team.id}`}>Orden</label>
          <CampoEnLinea
            valor={String(team.order)}
            tipo="number"
            ocupado={ocupado}
            ariaLabel={`Orden del equipo ${titulo}`}
            onGuardar={(v) => {
              const n = Number.parseInt(v, 10);
              if (!Number.isNaN(n)) props.onGuardarEquipo({ order: n });
            }}
          />
        </div>
        <div className="acciones-catalogo">
          <button
            type="button"
            className={team.active ? 'boton-peligro-suave' : ''}
            disabled={ocupado}
            aria-pressed={!team.active}
            onClick={props.onAlternarActivoEquipo}
          >
            {team.active ? 'Desactivar equipo' : 'Activar equipo'}
          </button>
        </div>
      </div>

      {malFormado && (
        <p className="tarjeta-equipo-aviso">
          Este equipo no tiene exactamente 2 grupos activos: su etiqueta impresa saldrá con un
          solo nombre, o vacía.
        </p>
      )}

      {grupos.length === 0 ? (
        <p className="estado-vacio">Este equipo todavía no tiene ningún grupo.</p>
      ) : (
        <ul className="grupos-del-equipo">
          {grupos.map((grupo) => (
            <FilaGrupo
              key={grupo.id}
              grupo={grupo}
              todosLosEquipos={props.todosLosEquipos}
              todosLosGrupos={props.todosLosGrupos}
              ocupado={ocupado}
              onGuardar={(changes) => props.onGuardarGrupo(grupo.id, changes)}
              onAlternarActivo={() => props.onAlternarActivoGrupo(grupo)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface FilaGrupoProps {
  readonly grupo: Group;
  readonly todosLosEquipos: Team[];
  readonly todosLosGrupos: Group[];
  readonly ocupado: boolean;
  readonly onGuardar: (changes: Partial<Pick<Group, 'name' | 'order' | 'teamId'>>) => void;
  readonly onAlternarActivo: () => void;
}

function FilaGrupo(props: FilaGrupoProps) {
  const { grupo, ocupado } = props;

  return (
    <li className={grupo.active ? 'grupo-fila' : 'grupo-fila inactivo'}>
      <CampoEnLinea
        valor={grupo.name}
        ocupado={ocupado}
        ariaLabel={`Nombre del grupo ${grupo.name}`}
        onGuardar={(v) => {
          if (v.trim() !== '') props.onGuardar({ name: v.trim() });
        }}
      />
      <label>
        Equipo:{' '}
        <select
          value={props.todosLosEquipos.some((t) => t.id === grupo.teamId) ? grupo.teamId : ''}
          disabled={ocupado}
          aria-label={`Equipo del grupo ${grupo.name}`}
          onChange={(e) => {
            if (e.target.value !== '') props.onGuardar({ teamId: e.target.value });
          }}
        >
          {!props.todosLosEquipos.some((t) => t.id === grupo.teamId) && (
            <option value="">— equipo inexistente —</option>
          )}
          {props.todosLosEquipos.map((t) => (
            <option key={t.id} value={t.id}>
              {teamDisplayText(t, props.todosLosGrupos) || '(sin grupos activos)'}
              {!t.active ? ' (inactivo)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        Orden:{' '}
        <CampoEnLinea
          valor={String(grupo.order)}
          tipo="number"
          ocupado={ocupado}
          ariaLabel={`Orden del grupo ${grupo.name}`}
          onGuardar={(v) => {
            const n = Number.parseInt(v, 10);
            if (!Number.isNaN(n)) props.onGuardar({ order: n });
          }}
        />
      </label>
      {!grupo.active && <span className="etiqueta-inactiva">inactivo</span>}
      <div className="acciones-catalogo">
        <button
          type="button"
          className={grupo.active ? 'boton-peligro-suave' : ''}
          disabled={ocupado}
          aria-pressed={!grupo.active}
          onClick={props.onAlternarActivo}
        >
          {grupo.active ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </li>
  );
}
