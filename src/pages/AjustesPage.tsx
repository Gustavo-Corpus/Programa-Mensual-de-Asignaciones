import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import '@/styles/catalogo.css';
import type { AssignmentType, GenerationSettings } from '@/domain/types';
import { getSettings, saveSettings } from '@/data/settings.repo';
import { listAssignmentTypes } from '@/data/types.repo';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; settings: GenerationSettings; assignmentTypes: AssignmentType[] };

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

export function AjustesPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [borrador, setBorrador] = useState<GenerationSettings | null>(null);

  const cargar = useCallback(async () => {
    setEstado({ fase: 'cargando' });
    setGuardadoOk(false);
    try {
      // Las responsabilidades hacen falta aquí para poder elegir cuáles
      // gobierna la regla de capitanes, en vez de escribir sus claves a mano.
      const [settings, assignmentTypes] = await Promise.all([getSettings(), listAssignmentTypes()]);
      setEstado({ fase: 'listo', settings, assignmentTypes });
      setBorrador(settings);
    } catch (error) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(error) });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      if (borrador === null) return;
      if (borrador.historyWindowMonths < 0 || !Number.isInteger(borrador.historyWindowMonths)) {
        setErrorAccion('Los meses de historial deben ser un entero de 0 o más.');
        return;
      }
      if (borrador.maxRepairIterations < 1 || !Number.isInteger(borrador.maxRepairIterations)) {
        setErrorAccion('El tope de iteraciones debe ser un entero de 1 o más.');
        return;
      }

      setOcupado(true);
      setErrorAccion(null);
      setGuardadoOk(false);
      void saveSettings(borrador)
        .then(() => {
          setGuardadoOk(true);
          return cargar();
        })
        .catch((error: unknown) => setErrorAccion(mensajeDeError(error)))
        .finally(() => setOcupado(false));
    },
    [borrador, cargar],
  );

  const tiposDeEquipo = useMemo(
    () =>
      estado.fase === 'listo'
        ? estado.assignmentTypes.filter((t) => t.kind === 'GROUP').sort((a, b) => a.order - b.order)
        : [],
    [estado],
  );

  const tiposDePersona = useMemo(
    () =>
      estado.fase === 'listo'
        ? estado.assignmentTypes.filter((t) => t.kind === 'PERSON').sort((a, b) => a.order - b.order)
        : [],
    [estado],
  );

  if (estado.fase === 'cargando' || borrador === null) {
    return (
      <section className="pagina">
        <h1>Ajustes</h1>
        <p>Cargando…</p>
      </section>
    );
  }

  if (estado.fase === 'error') {
    return (
      <section className="pagina">
        <h1>Ajustes</h1>
        <p className="mensaje-error">{estado.mensaje}</p>
        <button type="button" onClick={() => void cargar()}>
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <section className="pagina">
      <header className="pagina-encabezado">
        <h1>Ajustes de generación</h1>
      </header>

      <p className="ajuste-nota-snapshot">
        Estos ajustes NO cambian un programa ya generado: cada programa guarda una copia de los
        ajustes con los que se generó (<code>settingsSnapshot</code>). Para que un cambio aquí se
        note, hay que regenerar el mes.
      </p>

      {errorAccion !== null && <p className="mensaje-error">{errorAccion}</p>}
      {guardadoOk && <p className="contador-catalogo">Ajustes guardados.</p>}

      <form className="lista-ajustes" onSubmit={guardar}>
        <div className="ajuste-item">
          <label htmlFor="ajuste-historial">
            Meses de historial a considerar:
            <input
              id="ajuste-historial"
              type="number"
              min={0}
              value={borrador.historyWindowMonths}
              disabled={ocupado}
              onChange={(e) =>
                setBorrador({ ...borrador, historyWindowMonths: Number(e.target.value) })
              }
            />
          </label>
          <p className="ajuste-explicacion">
            Cuántos meses hacia atrás pesan en el reparto de este mes. <strong>0 significa todo el
            historial disponible.</strong> Una ventana corta (1-3 meses) hace que el algoritmo
            "olvide" rápido quién sirvió hace tiempo y reparte casi solo mirando el mes actual; una
            ventana larga (o 0) tiene en cuenta más años de historia y tiende a corregir
            desequilibrios acumulados con más paciencia, a costa de reaccionar más despacio a
            cambios recientes (alguien que se reincorpora tras una ausencia larga, por ejemplo).
          </p>
        </div>

        <div className="ajuste-item">
          <label htmlFor="ajuste-multiple-dia">
            <input
              id="ajuste-multiple-dia"
              type="checkbox"
              checked={borrador.allowMultiplePerDay}
              disabled={ocupado}
              onChange={(e) => setBorrador({ ...borrador, allowMultiplePerDay: e.target.checked })}
            />
            Permitir que una misma persona lleve dos responsabilidades el mismo día
          </label>
          <p className="ajuste-explicacion">
            Lo normal es dejarlo <strong>apagado</strong>: nadie repite el mismo día. Solo tiene
            sentido encenderlo con muy poca gente disponible, porque si no el algoritmo preferirá
            de todas formas repartir entre personas distintas y esta casilla no cambiará nada en la
            práctica salvo abrir la puerta a que sí se repita cuando haga falta.
          </p>
        </div>

        <div className="ajuste-item">
          <label htmlFor="ajuste-equipo-doble">
            <input
              id="ajuste-equipo-doble"
              type="checkbox"
              checked={borrador.allowTeamTwiceSameDate}
              disabled={ocupado}
              onChange={(e) =>
                setBorrador({ ...borrador, allowTeamTwiceSameDate: e.target.checked })
              }
            />
            Permitir que un mismo equipo haga Aseo e Hospitalidad el mismo sábado
          </label>
          <p className="ajuste-explicacion">
            Igual que el anterior pero para equipos en vez de personas. Apagado por defecto: un
            equipo no cubre dos responsabilidades el mismo día. Actívalo solo si hay pocos equipos
            activos para las fechas del mes.
          </p>
        </div>

        <div className="ajuste-item">
          <label htmlFor="ajuste-repair">
            <input
              id="ajuste-repair"
              type="checkbox"
              checked={borrador.runRepairPass}
              disabled={ocupado}
              onChange={(e) => setBorrador({ ...borrador, runRepairPass: e.target.checked })}
            />
            Aplicar el pase de mejora después del reparto inicial
          </label>
          <p className="ajuste-explicacion">
            El reparto inicial es voraz: llena las casillas en orden, una a una. El pase de mejora
            recorre después el resultado buscando intercambios entre dos casillas que reduzcan la
            repetición del mismo tipo de responsabilidad para una persona y mejoren el espaciado
            entre sus asignaciones del mes. <strong>No cambia cuántas veces sale cada quien</strong>
            —eso ya lo garantiza el tope de carga del paso anterior—, solo mejora qué le toca hacer
            y cuándo. Es determinista y tiene un límite de iteraciones, no es una búsqueda abierta.
          </p>
        </div>

        <div className="ajuste-item">
          <label htmlFor="ajuste-repair-iter">
            Tope de iteraciones del pase de mejora:
            <input
              id="ajuste-repair-iter"
              type="number"
              min={1}
              value={borrador.maxRepairIterations}
              disabled={ocupado || !borrador.runRepairPass}
              onChange={(e) =>
                setBorrador({ ...borrador, maxRepairIterations: Number(e.target.value) })
              }
            />
          </label>
          <p className="ajuste-explicacion">
            Salvaguarda de tiempo para el pase de mejora anterior (por defecto 200). El pase se
            detiene solo, antes de llegar aquí, en cuanto deja de encontrar un intercambio que
            mejore el resultado; este número solo importa si el mes es grande y hay muchas mejoras
            posibles que aplicar en cadena. Sin efecto si el pase de mejora está apagado.
          </p>
        </div>

        <div className="ajuste-item">
          <h2 className="ajuste-subtitulo">Regla de capitanes y auxiliares</h2>
          <label htmlFor="ajuste-regla-capitanes">
            <input
              id="ajuste-regla-capitanes"
              type="checkbox"
              checked={borrador.captainRule.enabled}
              disabled={ocupado}
              onChange={(e) =>
                setBorrador({
                  ...borrador,
                  captainRule: { ...borrador.captainRule, enabled: e.target.checked },
                })
              }
            />
            El equipo que hace el aseo cubre también otras responsabilidades
          </label>
          <p className="ajuste-explicacion">
            Cuando a un equipo le toca la responsabilidad de abajo, las que marques como cubiertas
            solo pueden asignarse a los <strong>capitanes y auxiliares</strong> de los grupos de ese
            equipo. Pueden ser los dos del mismo grupo o uno de cada uno: el algoritmo elige entre
            los cuatro. Es una regla dura y <strong>manda por encima del tope mensual</strong>; si la
            reserva no puede cubrir una casilla, se asigna a otra persona apta y aparece un aviso
            explicando qué día y por qué.
          </p>
          <p className="ajuste-explicacion">
            Requiere que cada persona tenga grupo y papel, que se indican en{' '}
            <strong>Personas → Grupo y restricciones</strong>. Sin eso la reserva sale vacía.
          </p>

          <div className="campo-catalogo">
            <label htmlFor="ajuste-regla-fuente">Responsabilidad que manda</label>
            <select
              id="ajuste-regla-fuente"
              value={borrador.captainRule.sourceTypeKey}
              disabled={ocupado || !borrador.captainRule.enabled}
              onChange={(e) =>
                setBorrador({
                  ...borrador,
                  captainRule: { ...borrador.captainRule, sourceTypeKey: e.target.value },
                })
              }
            >
              <option value="">— sin elegir —</option>
              {tiposDeEquipo.map((tipo) => (
                <option key={tipo.key} value={tipo.key}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="campo-catalogo-checkboxes">
            <legend>Responsabilidades que cubre esa reserva</legend>
            {tiposDePersona.map((tipo) => {
              const marcada = borrador.captainRule.targetTypeKeys.includes(tipo.key);
              return (
                <label key={tipo.key}>
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={ocupado || !borrador.captainRule.enabled}
                    onChange={() =>
                      setBorrador({
                        ...borrador,
                        captainRule: {
                          ...borrador.captainRule,
                          targetTypeKeys: marcada
                            ? borrador.captainRule.targetTypeKeys.filter((k) => k !== tipo.key)
                            : [...borrador.captainRule.targetTypeKeys, tipo.key],
                        },
                      })
                    }
                  />
                  {tipo.label}
                </label>
              );
            })}
          </fieldset>

          {borrador.captainRule.enabled && borrador.captainRule.sourceTypeKey === '' && (
            <p className="ajuste-nota-snapshot">
              Sin responsabilidad que mande, la regla no hace nada: no hay equipo del que sacar la
              reserva.
            </p>
          )}
          {borrador.captainRule.enabled &&
            borrador.captainRule.sourceTypeKey !== '' &&
            borrador.captainRule.targetTypeKeys.length === 0 && (
              <p className="ajuste-nota-snapshot">
                Sin ninguna responsabilidad marcada, la regla tampoco hace nada.
              </p>
            )}
        </div>

        <button type="submit" className="boton-principal" disabled={ocupado}>
          Guardar ajustes
        </button>
      </form>
    </section>
  );
}
