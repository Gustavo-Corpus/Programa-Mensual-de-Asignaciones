import { useMemo, useState } from 'react';
import type { ProgramAssignmentDoc, ProgramDocument } from '@/data/types';
import type { AssignmentType, GenerationTrace } from '@/domain/types';
import { DAY_NAMES_ES, fromIso } from '@/domain/dates';
import { teamDisplayText } from '@/domain/teams';
import { allowsDay, allowsType } from '@/domain/eligibility';
import { claveCasilla, type CasillaRef, type Catalogo, type Infraccion, type MotivoInfraccion } from '@/services/programService';
import { ExplicacionCasilla } from './ExplicacionCasilla';

/**
 * Por qué una casilla sale marcada. Se dice en la casilla y no solo en el
 * aviso de cabecera porque el aviso dice cuántas hay y esto dice cuál.
 */
const TEXTO_INFRACCION: Readonly<Record<MotivoInfraccion, string>> = {
  DAY_BLOCKED: 'No sirve este día',
  TYPE_NOT_ALLOWED: 'No hace esta responsabilidad',
  NOT_IN_CAPTAIN_POOL: 'No es capitán ni auxiliar del equipo que limpia',
};

export interface RejillaProps {
  readonly programa: ProgramDocument;
  readonly catalogo: Catalogo;
  readonly traza: GenerationTrace | null;
  readonly duplicados: Map<string, Set<string>>;
  /** Casillas cuyo ocupante infringe sus restricciones, por `claveCasilla`. */
  readonly infracciones: Map<string, Infraccion>;
  readonly ocupado: boolean;
  readonly onEditar: (ref: CasillaRef, nuevoId: string | null) => void;
  readonly onAlternarBloqueo: (ref: CasillaRef) => void;
  readonly onPedirTraza: () => void;
}

export function RejillaPrograma(props: RejillaProps) {
  const { programa, catalogo, traza, duplicados, infracciones, ocupado } = props;
  const [abierta, setAbierta] = useState<CasillaRef | null>(null);

  const columnas = useMemo(
    () =>
      [...catalogo.assignmentTypes]
        .filter((t) => t.active)
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
    [catalogo.assignmentTypes],
  );

  const nombrePor = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of catalogo.people) mapa.set(p.id, p.name);
    for (const t of catalogo.teams) mapa.set(t.id, teamDisplayText(t, catalogo.groups));
    return (id: string) => mapa.get(id) ?? id;
  }, [catalogo]);

  /** Quién ocupa ahora la casilla, según el programa guardado. */
  const ocupanteDe = (ref: CasillaRef): string | null => {
    const a = programa.dates
      .find((d) => d.date === ref.date)
      ?.assignments.find((x) => x.typeKey === ref.typeKey && x.slotIndex === ref.slotIndex);
    return a === undefined ? null : (a.personId ?? a.teamId);
  };

  const slotAbierto =
    abierta === null
      ? null
      : (traza?.slots.find(
          (s) =>
            s.date === abierta.date &&
            s.typeKey === abierta.typeKey &&
            s.slotIndex === abierta.slotIndex,
        ) ?? null);

  return (
    <>
      <table className="tabla-programa editable">
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            {columnas.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {programa.dates.map((fecha) => {
            const plain = fromIso(fecha.date);
            const repetidos = duplicados.get(fecha.date) ?? new Set<string>();
            return (
              <tr key={fecha.date}>
                <th scope="row">
                  <span className="dia-nombre">
                    {DAY_NAMES_ES[fecha.dayOfWeek]?.toUpperCase()}
                  </span>{' '}
                  <span className="dia-numero">{String(plain.d).padStart(2, '0')}</span>
                </th>
                {columnas.map((tipo) => {
                  const casillas = fecha.assignments
                    .filter((a) => a.typeKey === tipo.key)
                    .sort((a, b) => a.slotIndex - b.slotIndex);

                  // Sin casillas = la responsabilidad no aplica ese día
                  // (hospitalidad en lunes). No es un hueco por cubrir.
                  if (casillas.length === 0) {
                    return (
                      <td key={tipo.key} className="celda-no-aplica">
                        <span className="celda-vacia">—</span>
                      </td>
                    );
                  }

                  return (
                    <td key={tipo.key}>
                      {casillas.map((a) => {
                        const ocupanteId = a.personId ?? a.teamId;
                        return (
                          <Casilla
                            key={a.slotIndex}
                            asignacion={a}
                            tipo={tipo}
                            fecha={fecha.date}
                            catalogo={catalogo}
                            duplicada={ocupanteId !== null && repetidos.has(ocupanteId)}
                            infraccion={
                              infracciones.get(
                                claveCasilla({
                                  date: fecha.date,
                                  typeKey: tipo.key,
                                  slotIndex: a.slotIndex,
                                }),
                              ) ?? null
                            }
                            diaDeSemana={fecha.dayOfWeek}
                            ocupado={ocupado}
                            onEditar={props.onEditar}
                            onAlternarBloqueo={props.onAlternarBloqueo}
                            onExplicar={(ref) => {
                              props.onPedirTraza();
                              setAbierta(ref);
                            }}
                          />
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {abierta !== null && (
        <div className="explicacion-fondo" onClick={() => setAbierta(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            {traza === null ? (
              <div className="explicacion">
                <p>Cargando la explicación…</p>
              </div>
            ) : slotAbierto === null ? (
              <div className="explicacion">
                <button
                  type="button"
                  className="explicacion-cerrar"
                  onClick={() => setAbierta(null)}
                >
                  ×
                </button>
                <p>
                  No hay explicación guardada para esta casilla. La traza se escribe al generar el
                  mes, así que un programa creado antes de esta versión no la tiene. Al regenerar
                  aparecerá.
                </p>
              </div>
            ) : (
              <ExplicacionCasilla
                traza={traza}
                slot={slotAbierto}
                nombrePor={nombrePor}
                esPersona={columnas.find((c) => c.key === abierta.typeKey)?.kind === 'PERSON'}
                ocupanteActual={ocupanteDe(abierta)}
                onCerrar={() => setAbierta(null)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

interface CasillaProps {
  readonly asignacion: ProgramAssignmentDoc;
  readonly tipo: AssignmentType;
  readonly fecha: string;
  readonly catalogo: Catalogo;
  readonly duplicada: boolean;
  readonly infraccion: Infraccion | null;
  readonly diaDeSemana: number;
  readonly ocupado: boolean;
  readonly onEditar: (ref: CasillaRef, nuevoId: string | null) => void;
  readonly onAlternarBloqueo: (ref: CasillaRef) => void;
  readonly onExplicar: (ref: CasillaRef) => void;
}

function Casilla(props: CasillaProps) {
  const { asignacion: a, tipo, fecha, catalogo, duplicada, infraccion, diaDeSemana, ocupado } = props;
  const ref: CasillaRef = { date: fecha, typeKey: tipo.key, slotIndex: a.slotIndex };
  const esPersona = tipo.kind === 'PERSON';
  const valor = (esPersona ? a.personId : a.teamId) ?? '';

  // Un inactivo que YA ocupa la casilla sigue en la lista: si no, editar
  // cualquier otra cosa lo borraría sin querer al no encontrar su opción.
  const opciones = esPersona
    ? catalogo.people
        .filter((p) => p.active || p.id === a.personId)
        .map((p) => ({
          id: p.id,
          etiqueta: p.name,
          inactivo: !p.active,
          // Se marca, no se esconde: quitar la opción dejaría al administrador
          // buscando un nombre que existe sin saber por qué no aparece.
          restringido: !allowsDay(p, diaDeSemana) || !allowsType(p, tipo.key),
        }))
    : catalogo.teams
        .filter((t) => t.active || t.id === a.teamId)
        .map((t) => ({
          id: t.id,
          etiqueta: teamDisplayText(t, catalogo.groups),
          inactivo: !t.active,
          restringido: false,
        }));

  const clases = ['casilla'];
  if (duplicada) clases.push('duplicada');
  if (infraccion !== null) clases.push('infringe');

  return (
    <div className={clases.join(' ')}>
      <select
        value={valor}
        disabled={ocupado}
        aria-label={`${tipo.label}, ${fecha}`}
        onChange={(e) => props.onEditar(ref, e.target.value === '' ? null : e.target.value)}
      >
        <option value="">— sin asignar —</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
            {o.inactivo ? ' (inactivo)' : ''}
            {o.restringido ? ' (restringido)' : ''}
          </option>
        ))}
      </select>

      <div className="casilla-acciones">
        <button
          type="button"
          className={a.locked ? 'candado activo' : 'candado'}
          disabled={ocupado}
          title={
            a.locked
              ? 'Bloqueada: se conservará al regenerar. Pulsa para desbloquear.'
              : 'Sin bloquear: puede cambiar al regenerar. Pulsa para bloquear.'
          }
          aria-pressed={a.locked}
          onClick={() => props.onAlternarBloqueo(ref)}
        >
          {a.locked ? 'Bloqueada' : 'Libre'}
        </button>
        <button
          type="button"
          className="por-que"
          title="Ver por qué el algoritmo eligió esta opción"
          onClick={() => props.onExplicar(ref)}
        >
          ¿Por qué?
        </button>
      </div>

      {duplicada && <span className="aviso-casilla">Repetido este día</span>}
      {infraccion !== null && (
        <span className="aviso-casilla">{TEXTO_INFRACCION[infraccion.motivo]}</span>
      )}
    </div>
  );
}
