import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import '@/styles/estadisticas.css';
import { fromIso, MONTH_NAMES_ES } from '@/domain/dates';
import type { IsoDate } from '@/domain/dates';
import type { EntityHistoryStat, TypeColumn } from '@/domain/historyStats';
import type { LoadTarget } from '@/domain/types';
import type { Catalogo } from '@/services/programService';
import {
  cargarEstadisticas,
  WINDOW_OPTIONS,
  type EstadisticasCargadas,
} from '@/services/estadisticasService';

// La pregunta que esta pantalla responde no es "cuántas asignaciones hay",
// sino "¿está saliendo esto justo, y quién lleva más o menos de lo que le
// toca?". Por eso cada tabla marca de un vistazo quién está por debajo o por
// encima de la meta, y las alertas se redactan como frases accionables, no
// como códigos.

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly datos: EstadisticasCargadas };

type CampoOrden = 'total' | 'nombre';
interface Orden {
  readonly campo: CampoOrden;
  readonly direccion: 'asc' | 'desc';
}

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

function formatearFecha(iso: IsoDate): string {
  const fecha = fromIso(iso);
  const mes = MONTH_NAMES_ES[fecha.m - 1] ?? '';
  return `${fecha.d} de ${mes} de ${fecha.y}`;
}

function formatearMeta(target: LoadTarget): string {
  if (target.cap === 0) return 'sin datos suficientes';
  if (target.remainder === 0) return `${target.base} ${target.base === 1 ? 'vez' : 'veces'} cada uno`;
  return `entre ${target.base} y ${target.cap} veces (${target.remainder} de ellos con ${target.cap})`;
}

function porcentajeDeCarga(actual: number, target: LoadTarget): number {
  if (target.cap === 0) return 0;
  return Math.min(100, Math.round((actual / target.cap) * 100));
}

function alternarOrden(actual: Orden, campo: CampoOrden): Orden {
  if (actual.campo !== campo) return { campo, direccion: campo === 'total' ? 'desc' : 'asc' };
  return { campo, direccion: actual.direccion === 'asc' ? 'desc' : 'asc' };
}

function ordenarEntidades(entidades: readonly EntityHistoryStat[], orden: Orden): EntityHistoryStat[] {
  const factor = orden.direccion === 'asc' ? 1 : -1;
  return [...entidades].sort((a, b) => {
    if (orden.campo === 'nombre') return factor * a.label.localeCompare(b.label);
    return factor * (a.total - b.total) || a.label.localeCompare(b.label);
  });
}

function indicadorDeOrden(orden: Orden, campo: CampoOrden): string {
  if (orden.campo !== campo) return '';
  return orden.direccion === 'asc' ? ' ↑' : ' ↓';
}

function ariaSort(orden: Orden, campo: CampoOrden): 'ascending' | 'descending' | 'none' {
  if (orden.campo !== campo) return 'none';
  return orden.direccion === 'asc' ? 'ascending' : 'descending';
}

function marcaDeCarga(estado: EntityHistoryStat['loadStatus']): string {
  if (estado === 'below') return '▼ por debajo';
  if (estado === 'above') return '▲ por encima';
  return '● en la meta';
}

export function EstadisticasPage(): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [ordenPersonas, setOrdenPersonas] = useState<Orden>({ campo: 'total', direccion: 'desc' });
  const [ordenEquipos, setOrdenEquipos] = useState<Orden>({ campo: 'total', direccion: 'desc' });

  const cargar = useCallback(async (windowMonths?: number, catalogo?: Catalogo) => {
    setEstado({ fase: 'cargando' });
    try {
      const datos = await cargarEstadisticas(windowMonths, catalogo);
      setEstado({ fase: 'listo', datos });
    } catch (error) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(error) });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiarVentana = useCallback(
    (windowMonths: number) => {
      const catalogoPrevio = estado.fase === 'listo' ? estado.datos.catalogo : undefined;
      void cargar(windowMonths, catalogoPrevio);
    },
    [cargar, estado],
  );

  const personasOrdenadas = useMemo(
    () => (estado.fase === 'listo' ? ordenarEntidades(estado.datos.stats.people, ordenPersonas) : []),
    [estado, ordenPersonas],
  );
  const equiposOrdenados = useMemo(
    () => (estado.fase === 'listo' ? ordenarEntidades(estado.datos.stats.teams, ordenEquipos) : []),
    [estado, ordenEquipos],
  );

  if (estado.fase === 'cargando') {
    return (
      <section className="pagina">
        <h1>Estadísticas</h1>
        <p>Cargando…</p>
      </section>
    );
  }

  if (estado.fase === 'error') {
    return (
      <section className="pagina">
        <h1>Estadísticas</h1>
        <p className="mensaje-error">{estado.mensaje}</p>
        <button type="button" onClick={() => void cargar()}>
          Reintentar
        </button>
      </section>
    );
  }

  const { stats, windowMonths } = estado.datos;
  const sinMeses = stats.summary.monthsInWindow.length === 0;

  return (
    <section className="pagina">
      <header className="pagina-encabezado">
        <h1>Estadísticas</h1>
        <p className="pagina-estado">¿Está saliendo esto justo, y quién lleva más o menos de lo que le toca?</p>
      </header>

      <div className="selector-mes">
        <label>
          Ventana de historial
          <select value={windowMonths} onChange={(e) => cambiarVentana(Number(e.target.value))}>
            {WINDOW_OPTIONS.map((opcion) => (
              <option key={opcion.months} value={opcion.months}>
                {opcion.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sinMeses ? (
        <p className="estad-vacio">
          Todavía no hay ningún programa guardado. Genera y guarda el primer mes desde «Programa»
          para empezar a ver estadísticas aquí.
        </p>
      ) : (
        <>
          <section className="estad-resumen">
            <div className="estad-tarjeta">
              <span className="estad-tarjeta-numero">{stats.summary.monthsInWindow.length}</span>
              <span className="estad-tarjeta-etiqueta">
                {stats.summary.monthsInWindow.length === 1 ? 'mes guardado en la ventana' : 'meses guardados en la ventana'}
              </span>
              <p className="estad-tarjeta-meses">{stats.summary.monthsInWindow.join(' · ')}</p>
            </div>

            <div className="estad-tarjeta">
              <span className="estad-tarjeta-numero">{stats.summary.personAssignmentsCount}</span>
              <span className="estad-tarjeta-etiqueta">asignaciones de persona</span>
              <span className="estad-tarjeta-detalle">Meta: {formatearMeta(stats.summary.personTarget)}</span>
              <div
                className="estad-barra"
                role="img"
                aria-label={`Carga de personas: ${stats.summary.personAssignmentsCount} de la meta de ${stats.summary.personTarget.cap}`}
                style={{ '--estad-barra-pct': `${porcentajeDeCarga(stats.summary.personAssignmentsCount, stats.summary.personTarget)}%` } as CSSProperties}
              >
                <div className="estad-barra-relleno" />
              </div>
            </div>

            <div className="estad-tarjeta">
              <span className="estad-tarjeta-numero">{stats.summary.teamAssignmentsCount}</span>
              <span className="estad-tarjeta-etiqueta">asignaciones de equipo</span>
              <span className="estad-tarjeta-detalle">Meta: {formatearMeta(stats.summary.teamTarget)}</span>
              <div
                className="estad-barra"
                role="img"
                aria-label={`Carga de equipos: ${stats.summary.teamAssignmentsCount} de la meta de ${stats.summary.teamTarget.cap}`}
                style={{ '--estad-barra-pct': `${porcentajeDeCarga(stats.summary.teamAssignmentsCount, stats.summary.teamTarget)}%` } as CSSProperties}
              >
                <div className="estad-barra-relleno" />
              </div>
            </div>
          </section>

          <section className="estad-seccion">
            <h2>Por persona</h2>
            <TablaEntidades
              titulo="Asignaciones por persona en la ventana elegida"
              entidades={personasOrdenadas}
              columnas={stats.personColumns}
              orden={ordenPersonas}
              onOrdenar={(campo) => setOrdenPersonas((actual) => alternarOrden(actual, campo))}
              mensajeVacio="No hay personas activas en el catálogo."
            />
          </section>

          <section className="estad-seccion">
            <h2>Por equipo</h2>
            <TablaEntidades
              titulo="Asignaciones por equipo en la ventana elegida"
              entidades={equiposOrdenados}
              columnas={stats.teamColumns}
              orden={ordenEquipos}
              onOrdenar={(campo) => setOrdenEquipos((actual) => alternarOrden(actual, campo))}
              mensajeVacio="No hay equipos activos en el catálogo."
            />
          </section>

          <section className="estad-seccion">
            <h2>Alertas de desequilibrio</h2>
            <ul className="estad-lista-alertas">
              {stats.alerts.map((alerta, indice) => (
                <li key={indice} className={`estad-alerta estad-alerta-${alerta.severity}`}>
                  {alerta.message}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}

interface TablaEntidadesProps {
  readonly titulo: string;
  readonly entidades: readonly EntityHistoryStat[];
  readonly columnas: readonly TypeColumn[];
  readonly orden: Orden;
  readonly onOrdenar: (campo: CampoOrden) => void;
  readonly mensajeVacio: string;
}

function TablaEntidades(props: TablaEntidadesProps): JSX.Element {
  const { titulo, entidades, columnas, orden, onOrdenar, mensajeVacio } = props;

  return (
    <div className="estad-tabla-envoltura">
      <table className="estad-tabla">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={ariaSort(orden, 'nombre')}>
              <button type="button" className="estad-orden" onClick={() => onOrdenar('nombre')}>
                Nombre{indicadorDeOrden(orden, 'nombre')}
              </button>
            </th>
            <th scope="col" aria-sort={ariaSort(orden, 'total')}>
              <button type="button" className="estad-orden" onClick={() => onOrdenar('total')}>
                Total{indicadorDeOrden(orden, 'total')}
              </button>
            </th>
            {columnas.map((columna) => (
              <th key={columna.key} scope="col">
                {columna.label}
              </th>
            ))}
            <th scope="col">Última asignación</th>
          </tr>
        </thead>
        <tbody>
          {entidades.length === 0 ? (
            <tr className="estad-fila-vacia">
              <td colSpan={columnas.length + 3}>{mensajeVacio}</td>
            </tr>
          ) : (
            entidades.map((entidad) => (
              <tr key={entidad.id} className={`estad-fila-${entidad.loadStatus}`}>
                <th scope="row">{entidad.label}</th>
                <td>
                  {entidad.total}
                  <span className={`estad-marca estad-marca-${entidad.loadStatus}`}>
                    {marcaDeCarga(entidad.loadStatus)}
                  </span>
                </td>
                {columnas.map((columna) => (
                  <td key={columna.key}>{entidad.byType[columna.key] ?? 0}</td>
                ))}
                <td>{entidad.lastAssignedDate === null ? 'nunca' : formatearFecha(entidad.lastAssignedDate)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
