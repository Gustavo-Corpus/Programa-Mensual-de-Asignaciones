import { useState } from 'react';
import type { AssignmentType } from '@/domain/types';
import type { ConteoEntidad, ResumenReparto } from '@/services/programService';

/**
 * El contador del mes: quién lleva cuántas y, sobre todo, a quién no le ha
 * tocado nada.
 *
 * Cuenta lo que hay AHORA en la tabla, no lo que decidió el algoritmo, que es
 * lo único útil cuando se reparte a mano: la pregunta que se responde aquí es
 * «¿a quién me falta poner?», y se responde poniendo a los que están a cero
 * arriba del todo.
 */

export interface PanelRepartoProps {
  readonly resumen: ResumenReparto;
  readonly assignmentTypes: readonly AssignmentType[];
  /** Meta de carga del mes, para saber si un 2 es mucho o poco. */
  readonly objetivo: number | null;
}

function Fila({
  entidad,
  etiquetaTipo,
  objetivo,
}: {
  readonly entidad: ConteoEntidad;
  readonly etiquetaTipo: (key: string) => string;
  readonly objetivo: number | null;
}) {
  const desglose = [...entidad.porTipo.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, veces]) => (veces === 1 ? etiquetaTipo(key) : `${etiquetaTipo(key)} ×${veces}`))
    .join(' · ');

  const clase =
    entidad.veces === 0
      ? 'reparto-fila sin-asignar'
      : objetivo !== null && entidad.veces > objetivo
        ? 'reparto-fila por-encima'
        : 'reparto-fila';

  return (
    <li className={clase}>
      <span className="reparto-nombre">
        {entidad.nombre}
        {!entidad.activo && <span className="etiqueta-inactiva">inactiva</span>}
      </span>
      <span className="reparto-veces" aria-label={`${entidad.veces} asignaciones`}>
        {entidad.veces}
      </span>
      {desglose !== '' && <span className="reparto-desglose">{desglose}</span>}
    </li>
  );
}

export function PanelReparto({ resumen, assignmentTypes, objetivo }: PanelRepartoProps) {
  const [abierto, setAbierto] = useState(true);

  const etiquetaTipo = (key: string) =>
    assignmentTypes.find((t) => t.key === key)?.label ?? key;

  const aCero = resumen.personas.filter((p) => p.veces === 0).length;

  return (
    <aside className="panel-reparto">
      <button
        type="button"
        className="panel-reparto-titulo"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <span>Reparto del mes</span>
        <span className="panel-reparto-resumen">
          {resumen.sinCubrir === 0
            ? 'todas las casillas cubiertas'
            : `${resumen.sinCubrir} ${resumen.sinCubrir === 1 ? 'casilla' : 'casillas'} por cubrir`}
          {aCero > 0 && ` · ${aCero} sin ninguna asignación`}
        </span>
      </button>

      {abierto && (
        <div className="panel-reparto-cuerpo">
          <h3>
            Personas
            {objetivo !== null && <span className="panel-reparto-meta">meta del mes: {objetivo}</span>}
          </h3>
          <ul className="reparto-lista">
            {resumen.personas.map((p) => (
              <Fila key={p.id} entidad={p} etiquetaTipo={etiquetaTipo} objetivo={objetivo} />
            ))}
          </ul>

          {resumen.equipos.length > 0 && (
            <>
              <h3>Equipos</h3>
              <ul className="reparto-lista">
                {resumen.equipos.map((t) => (
                  <Fila key={t.id} entidad={t} etiquetaTipo={etiquetaTipo} objetivo={null} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
