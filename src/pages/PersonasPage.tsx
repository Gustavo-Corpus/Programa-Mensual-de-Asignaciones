import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import '@/styles/catalogo.css';
import type { AssignmentType, Group, Person, Team } from '@/domain/types';
import { createPerson, listPeople, updatePerson, type PersonChanges } from '@/data/people.repo';
import { listAssignmentTypes } from '@/data/types.repo';
import { listGroups } from '@/data/groups.repo';
import { listTeams } from '@/data/teams.repo';
import { nombreDuplicado } from '@/services/catalogoService';
import {
  ETIQUETA_PAPEL,
  RestriccionesPersona,
  nombreDeGrupo,
  resumenRestricciones,
} from '@/components/RestriccionesPersona';

/**
 * El catálogo que necesita esta pantalla además de las personas: las
 * responsabilidades y los grupos son las opciones entre las que se elige al
 * restringir a alguien, así que se cargan de una vez con la lista.
 */
interface CatalogoPersonas {
  readonly assignmentTypes: AssignmentType[];
  readonly groups: Group[];
  readonly teams: Team[];
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; personas: Person[]; catalogo: CatalogoPersonas };

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

export function PersonasPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState('');
  const [restringiendoId, setRestringiendoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado({ fase: 'cargando' });
    try {
      const [personas, assignmentTypes, groups, teams] = await Promise.all([
        listPeople(),
        listAssignmentTypes(),
        listGroups(),
        listTeams(),
      ]);
      setEstado({
        fase: 'listo',
        personas: [...personas].sort((a, b) => a.name.localeCompare(b.name)),
        catalogo: { assignmentTypes, groups, teams },
      });
    } catch (error) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(error) });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Envuelve una acción de escritura: marca ocupado, traduce el error, y no
   * se lleva por delante la lista visible si la acción falla. */
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

  const personasActuales = estado.fase === 'listo' ? estado.personas : [];

  const crear = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      void ejecutar(async () => {
        const nombre = nombreNuevo.trim();
        if (nombre === '') return;
        await createPerson(nombre);
        setNombreNuevo('');
        await cargar();
      });
    },
    [ejecutar, nombreNuevo, cargar],
  );

  const iniciarEdicion = (persona: Person) => {
    setEditandoId(persona.id);
    setNombreEdicion(persona.name);
    setRestringiendoId(null);
    setErrorAccion(null);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNombreEdicion('');
  };

  const alternarRestricciones = (persona: Person) => {
    setRestringiendoId((actual) => (actual === persona.id ? null : persona.id));
    setEditandoId(null);
    setErrorAccion(null);
  };

  const guardarRestricciones = useCallback(
    (id: string, cambios: PersonChanges) =>
      void ejecutar(async () => {
        await updatePerson(id, cambios);
        setRestringiendoId(null);
        await cargar();
      }),
    [ejecutar, cargar],
  );

  const guardarRenombrado = useCallback(
    (id: string) =>
      void ejecutar(async () => {
        const nombre = nombreEdicion.trim();
        if (nombre === '') return;
        await updatePerson(id, { name: nombre });
        setEditandoId(null);
        setNombreEdicion('');
        await cargar();
      }),
    [ejecutar, nombreEdicion, cargar],
  );

  const alternarActivo = useCallback(
    (persona: Person) =>
      void ejecutar(async () => {
        await updatePerson(persona.id, { active: !persona.active });
        await cargar();
      }),
    [ejecutar, cargar],
  );

  if (estado.fase === 'cargando') {
    return (
      <section className="pagina">
        <h1>Personas</h1>
        <p>Cargando…</p>
      </section>
    );
  }

  if (estado.fase === 'error') {
    return (
      <section className="pagina">
        <h1>Personas</h1>
        <p className="mensaje-error">{estado.mensaje}</p>
        <button type="button" onClick={() => void cargar()}>
          Reintentar
        </button>
      </section>
    );
  }

  const activas = estado.personas.filter((p) => p.active);
  const inactivas = estado.personas.filter((p) => !p.active);
  const nombreNuevoDuplicado = nombreDuplicado(nombreNuevo, personasActuales, null);
  const catalogo = estado.catalogo;

  // Una sola función para las dos listas: cuando eran dos llamadas idénticas
  // con doce props cada una, la de inactivas se quedaba atrás en cada cambio.
  const fila = (persona: Person) => (
    <FilaPersona
      key={persona.id}
      persona={persona}
      catalogo={catalogo}
      ocupado={ocupado}
      editando={editandoId === persona.id}
      restringiendo={restringiendoId === persona.id}
      nombreEdicion={nombreEdicion}
      nombreDuplicadoEdicion={
        editandoId === persona.id && nombreDuplicado(nombreEdicion, personasActuales, persona.id)
      }
      onIniciarEdicion={() => iniciarEdicion(persona)}
      onCambiarNombreEdicion={setNombreEdicion}
      onGuardarEdicion={() => guardarRenombrado(persona.id)}
      onCancelarEdicion={cancelarEdicion}
      onAlternarActivo={() => alternarActivo(persona)}
      onAlternarRestricciones={() => alternarRestricciones(persona)}
      onGuardarRestricciones={(cambios) => guardarRestricciones(persona.id, cambios)}
    />
  );

  return (
    <section className="pagina">
      <header className="pagina-encabezado">
        <h1>Personas</h1>
        <p className="contador-catalogo">
          {activas.length} {activas.length === 1 ? 'persona activa' : 'personas activas'}
        </p>
      </header>

      <p className="nota-explicativa">
        Las personas nunca se borran, solo se desactivan: los programas ya guardados siguen
        mostrando su nombre y sus asignaciones históricas se siguen contando para el reparto.
      </p>

      {errorAccion !== null && <p className="mensaje-error">{errorAccion}</p>}

      <form className="form-catalogo" onSubmit={crear}>
        <div className="campo-catalogo">
          <label htmlFor="nueva-persona-nombre">Nueva persona</label>
          <input
            id="nueva-persona-nombre"
            type="text"
            value={nombreNuevo}
            disabled={ocupado}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre completo"
          />
          {nombreNuevoDuplicado && (
            <span className="ajuste-nota-snapshot">Ya existe una persona con este nombre.</span>
          )}
        </div>
        <button type="submit" className="boton-principal" disabled={ocupado || nombreNuevo.trim() === ''}>
          Añadir
        </button>
      </form>

      {estado.personas.length === 0 ? (
        <p className="estado-vacio">Todavía no hay ninguna persona; añade la primera.</p>
      ) : (
        <>
          <ul className="lista-catalogo" aria-label="Personas activas">
            {activas.map(fila)}
          </ul>

          {inactivas.length > 0 && (
            <>
              <h2 className="subtitulo-catalogo">Inactivas</h2>
              <ul className="lista-catalogo" aria-label="Personas inactivas">
                {inactivas.map(fila)}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

interface FilaPersonaProps {
  readonly persona: Person;
  readonly catalogo: CatalogoPersonas;
  readonly ocupado: boolean;
  readonly editando: boolean;
  readonly restringiendo: boolean;
  readonly nombreEdicion: string;
  readonly nombreDuplicadoEdicion: boolean;
  readonly onIniciarEdicion: () => void;
  readonly onCambiarNombreEdicion: (valor: string) => void;
  readonly onGuardarEdicion: () => void;
  readonly onCancelarEdicion: () => void;
  readonly onAlternarActivo: () => void;
  readonly onAlternarRestricciones: () => void;
  readonly onGuardarRestricciones: (cambios: PersonChanges) => void;
}

function FilaPersona(props: FilaPersonaProps) {
  const { persona, catalogo, ocupado, editando, restringiendo } = props;

  const grupo = catalogo.groups.find((g) => g.id === persona.groupId);
  const restricciones = resumenRestricciones(persona, catalogo.assignmentTypes);

  return (
    <li className={persona.active ? 'fila-catalogo' : 'fila-catalogo inactiva'}>
      {editando ? (
        <>
          <input
            type="text"
            className="entrada-en-linea fila-catalogo-nombre"
            value={props.nombreEdicion}
            disabled={ocupado}
            aria-label={`Nuevo nombre para ${persona.name}`}
            onChange={(e) => props.onCambiarNombreEdicion(e.target.value)}
          />
          {props.nombreDuplicadoEdicion && (
            <span className="etiqueta-inactiva">nombre repetido</span>
          )}
          <div className="acciones-catalogo">
            <button
              type="button"
              disabled={ocupado || props.nombreEdicion.trim() === ''}
              onClick={props.onGuardarEdicion}
            >
              Guardar
            </button>
            <button type="button" disabled={ocupado} onClick={props.onCancelarEdicion}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="fila-catalogo-nombre">
            {persona.name}
            {!persona.active && <span className="etiqueta-inactiva">inactiva</span>}
            {grupo !== undefined && (
              <span className="etiqueta-grupo">
                {ETIQUETA_PAPEL[persona.role]} ·{' '}
                {nombreDeGrupo(grupo, catalogo.teams, catalogo.groups)}
              </span>
            )}
            {restricciones.map((texto) => (
              <span key={texto} className="etiqueta-restriccion">
                {texto}
              </span>
            ))}
          </span>
          <div className="acciones-catalogo">
            <button type="button" disabled={ocupado} onClick={props.onIniciarEdicion}>
              Renombrar
            </button>
            <button
              type="button"
              disabled={ocupado}
              aria-expanded={restringiendo}
              onClick={props.onAlternarRestricciones}
            >
              {restringiendo ? 'Cerrar' : 'Grupo y restricciones'}
            </button>
            <button
              type="button"
              className={persona.active ? 'boton-peligro-suave' : ''}
              disabled={ocupado}
              aria-pressed={!persona.active}
              onClick={props.onAlternarActivo}
            >
              {persona.active ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </>
      )}

      {restringiendo && (
        <RestriccionesPersona
          persona={persona}
          assignmentTypes={catalogo.assignmentTypes}
          groups={catalogo.groups}
          teams={catalogo.teams}
          ocupado={ocupado}
          onGuardar={props.onGuardarRestricciones}
          onCancelar={props.onAlternarRestricciones}
        />
      )}
    </li>
  );
}
