import type { GenerationTrace, SlotTrace } from '@/domain/types';

const MOTIVO_RECHAZO: Record<string, string> = {
  INACTIVE: 'está inactivo',
  DAY_BLOCKED: 'no sirve ese día de la semana',
  TYPE_NOT_ALLOWED: 'no tiene habilitada esta responsabilidad',
  NOT_IN_CAPTAIN_POOL: 'no es capitán ni auxiliar del equipo que limpia ese día',
  ALREADY_ASSIGNED_THIS_DATE: 'ya tenía asignación ese día',
  AT_CAP: 'ya llegó a su cupo del mes',
};

export interface ExplicacionProps {
  readonly traza: GenerationTrace;
  readonly slot: SlotTrace;
  readonly nombrePor: (id: string) => string;
  readonly esPersona: boolean;
  /** Quién ocupa la casilla AHORA, que puede no ser quien eligió el algoritmo. */
  readonly ocupanteActual: string | null;
  readonly onCerrar: () => void;
}

/**
 * El «¿Por qué?» de una casilla.
 *
 * Muestra la tupla de coste con las etiquetas que viajan en la propia traza, no
 * con una lista escrita aquí: si mañana se añade un criterio al algoritmo, esta
 * pantalla se entera sola en vez de mentir en silencio.
 */
export function ExplicacionCasilla({
  traza,
  slot,
  nombrePor,
  esPersona,
  ocupanteActual,
  onCerrar,
}: ExplicacionProps) {
  const etiquetas = esPersona ? traza.costLabelsPerson : traza.costLabelsTeam;

  // La traza describe lo que decidió el algoritmo al generar el mes. Si desde
  // entonces alguien editó la casilla a mano, esa explicación ya no explica lo
  // que se ve: mostrarla sería inventar un motivo para una decisión humana.
  const editadaAMano = slot.outcome !== 'UNFILLED' && ocupanteActual !== slot.chosenId;

  return (
    <div className="explicacion" role="dialog" aria-label="Explicación de la asignación">
      <button type="button" className="explicacion-cerrar" onClick={onCerrar} aria-label="Cerrar">
        ×
      </button>

      {editadaAMano && (
        <p className="explicacion-titular">
          Esta casilla se <strong>editó a mano</strong> después de generar el mes
          {ocupanteActual !== null && <> y ahora la ocupa <strong>{nombrePor(ocupanteActual)}</strong></>}
          {slot.chosenId !== null && <>; el algoritmo había elegido a {nombrePor(slot.chosenId)}</>}.
          Abajo queda el razonamiento original, que ya no explica lo que ves.
        </p>
      )}

      {slot.outcome === 'LOCKED' && !editadaAMano && (
        <p className="explicacion-titular">
          Esta casilla estaba <strong>bloqueada</strong>: el algoritmo la respetó sin evaluarla.
        </p>
      )}

      {slot.changedByRepair && (
        <p className="explicacion-titular">
          El <strong>pase de mejora</strong> movió esta casilla después del reparto inicial, para
          mejorar la rotación de responsabilidades. Por eso no hay una comparación que mostrar:
          no ganó una puntuación, se intercambió.
        </p>
      )}

      {slot.outcome === 'UNFILLED' && (
        <p className="explicacion-titular">
          No se pudo cubrir esta casilla con nadie disponible.
        </p>
      )}

      {slot.chosenCost !== null && slot.chosenId !== null && (
        <>
          <p className="explicacion-titular">
            Se eligió a <strong>{nombrePor(slot.chosenId)}</strong> por este orden de criterios
            (gana el valor más bajo, y solo se pasa al siguiente si hay empate):
          </p>
          <table className="explicacion-tabla">
            <thead>
              <tr>
                <th scope="col">Criterio</th>
                <th scope="col">{nombrePor(slot.chosenId)}</th>
                {slot.runnersUp.map((r) => (
                  <th key={r.id} scope="col">
                    {nombrePor(r.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {etiquetas.map((etiqueta, i) => (
                <tr key={etiqueta}>
                  <th scope="row">{etiqueta}</th>
                  <td className="ganador">{slot.chosenCost?.[i]}</td>
                  {slot.runnersUp.map((r) => (
                    <td key={r.id}>{r.cost[i]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {slot.runnersUp.length > 0 && (
            <p className="explicacion-nota">
              Las demás columnas son quienes quedaron más cerca de ser elegidos.
            </p>
          )}
        </>
      )}

      {slot.rejected.length > 0 && (
        <p className="explicacion-nota">
          Descartados antes de puntuar:{' '}
          {slot.rejected
            .map((r) => `${nombrePor(r.id)} (${MOTIVO_RECHAZO[r.reason] ?? r.reason})`)
            .join(', ')}
          .
        </p>
      )}

      {slot.capRelaxedTo !== null && (
        <p className="explicacion-nota">
          Hubo que subir el cupo del mes hasta {slot.capRelaxedTo} para poder cubrirla.
        </p>
      )}
    </div>
  );
}
