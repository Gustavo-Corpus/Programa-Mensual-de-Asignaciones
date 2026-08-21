import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MONTH_NAMES_ES } from '@/domain/dates';
import type { GenerationTrace, Warning } from '@/domain/types';
import type { ProgramDocument } from '@/data/types';
import { computeLoadTarget } from '@/domain/stats';
import { RejillaPrograma } from '@/components/RejillaPrograma';
import { PanelReparto } from '@/components/PanelReparto';
import {
  alternarBloqueo,
  borrarPrograma,
  cargarMes,
  cargarTraza,
  crearMesVacio,
  duplicadosPorFecha,
  editarCasilla,
  generarMes,
  guardarMes,
  infraccionesDeRestriccion,
  modeloDeGuardado,
  resumenReparto,
  seedForMonth,
  vaciarPrograma,
  type CasillaRef,
  type Catalogo,
  type Infraccion,
} from '@/services/programService';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | {
      fase: 'listo';
      programa: ProgramDocument | null;
      catalogo: Catalogo;
      warnings: readonly Warning[];
      seed: number;
      /** Hay cambios generados que aún no se han guardado. */
      sinGuardar: boolean;
    };

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

export function ProgramaPage() {
  const params = useParams<{ year: string; month: string }>();
  const year = Number(params.year);
  const month = Number(params.month);
  const valido = Number.isInteger(year) && month >= 1 && month <= 12;

  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [ocupado, setOcupado] = useState(false);
  const [traza, setTraza] = useState<GenerationTrace | null>(null);

  const cargar = useCallback(async () => {
    setEstado({ fase: 'cargando' });
    setTraza(null);
    try {
      const mes = await cargarMes(year, month);
      setEstado({
        fase: 'listo',
        programa: mes.programa,
        catalogo: mes.catalogo,
        warnings: mes.programa?.warnings ?? [],
        seed: mes.programa?.seed ?? seedForMonth(year, month),
        sinGuardar: false,
      });
    } catch (error) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(error) });
    }
  }, [year, month]);

  useEffect(() => {
    if (valido) void cargar();
  }, [valido, cargar]);

  /** Envuelve una acción asíncrona: marca ocupado y traduce el error. */
  const ejecutar = useCallback(async (accion: () => Promise<void>) => {
    setOcupado(true);
    try {
      await accion();
    } catch (error) {
      setEstado({ fase: 'error', mensaje: mensajeDeError(error) });
    } finally {
      setOcupado(false);
    }
  }, []);

  const generarYGuardar = useCallback(
    (nuevaVariante: boolean) =>
      ejecutar(async () => {
        if (estado.fase !== 'listo') return;
        const seed = nuevaVariante ? estado.seed + 1 : estado.seed;
        const resultado = await generarMes(year, month, {
          seed,
          catalogo: estado.catalogo,
          // "Otra variante" tiene que dar otra variante de verdad, no solo
          // otra semilla: el servicio sigue probando hasta que el reparto
          // cambia. Ver `OpcionesGeneracion` en programService.
          distintaDeLaGuardada: nuevaVariante,
        });
        // Se guarda de inmediato: así el candado, la edición y el «¿Por qué?»
        // trabajan siempre sobre un programa persistido, y no hay dos verdades
        // (una en pantalla y otra en la base) que puedan divergir.
        await guardarMes(year, month, resultado);
        await cargar();
      }),
    [ejecutar, estado, year, month, cargar],
  );

  const editar = useCallback(
    (ref: CasillaRef, nuevoId: string | null) =>
      void ejecutar(async () => {
        if (estado.fase !== 'listo' || estado.programa === null) return;
        const actualizado = await editarCasilla(estado.programa, estado.catalogo, ref, nuevoId);
        setEstado({ ...estado, programa: actualizado });
      }),
    [ejecutar, estado],
  );

  const bloquear = useCallback(
    (ref: CasillaRef) =>
      void ejecutar(async () => {
        if (estado.fase !== 'listo' || estado.programa === null) return;
        const actualizado = await alternarBloqueo(estado.programa, ref);
        setEstado({ ...estado, programa: actualizado });
      }),
    [ejecutar, estado],
  );

  /**
   * Modo manual: el mes existe con sus fechas y casillas, pero vacío. No es un
   * modo aparte del programa, es el mismo programa sin decisiones tomadas.
   */
  const empezarEnBlanco = useCallback(
    () =>
      void ejecutar(async () => {
        if (estado.fase !== 'listo') return;
        await crearMesVacio(year, month, { catalogo: estado.catalogo });
        await cargar();
      }),
    [ejecutar, estado, year, month, cargar],
  );

  const vaciar = useCallback(
    () =>
      void ejecutar(async () => {
        if (estado.fase !== 'listo' || estado.programa === null) return;
        const bloqueadas = estado.programa.dates.reduce(
          (n, d) => n + d.assignments.filter((a) => a.locked).length,
          0,
        );
        const aviso =
          bloqueadas === 0
            ? 'Se vaciarán todas las casillas del mes. ¿Continuar?'
            : `Se vaciarán todas las casillas del mes salvo las ${bloqueadas} bloqueadas. ¿Continuar?`;
        if (!window.confirm(aviso)) return;
        const actualizado = await vaciarPrograma(estado.programa);
        setEstado({ ...estado, programa: actualizado });
      }),
    [ejecutar, estado],
  );

  /**
   * Borrar es la salida de emergencia cuando el mes ha quedado inservible:
   * deja de existir y se vuelve a empezar. Por eso pide confirmación diciendo
   * exactamente qué se pierde, y no se ofrece si el mes no está guardado.
   */
  const borrar = useCallback(
    () =>
      void ejecutar(async () => {
        if (estado.fase !== 'listo' || estado.programa === null) return;
        const aviso =
          `Se borrará el programa de ${MONTH_NAMES_ES[month - 1] ?? ''} de ${year} por completo: casillas, bloqueos y ` +
          'explicaciones. Este mes dejará de contar como historial. ¿Continuar?';
        if (!window.confirm(aviso)) return;
        await borrarPrograma(year, month);
        await cargar();
      }),
    [ejecutar, estado, year, month, cargar],
  );

  const pedirTraza = useCallback(() => {
    if (traza !== null) return;
    void cargarTraza(year, month).then(setTraza).catch(() => setTraza(null));
  }, [traza, year, month]);

  const descargar = useCallback(
    () =>
      void ejecutar(async () => {
        if (estado.fase !== 'listo' || estado.programa === null) return;
        // Import dinámico: @react-pdf/renderer y las tipografías pesan más de
        // un mega y solo hacen falta al pulsar este botón.
        const { downloadProgramPdf } = await import('@/pdf/download');
        const modelo = modeloDeGuardado(estado.programa, estado.catalogo.assignmentTypes);
        await downloadProgramPdf(modelo, year, month);
      }),
    [ejecutar, estado, year, month],
  );

  const duplicados = useMemo(
    () =>
      estado.fase === 'listo' && estado.programa !== null
        ? duplicadosPorFecha(estado.programa)
        : new Map<string, Set<string>>(),
    [estado],
  );

  const infracciones = useMemo(
    () =>
      estado.fase === 'listo' && estado.programa !== null
        ? infraccionesDeRestriccion(estado.programa, estado.catalogo)
        : new Map<string, Infraccion>(),
    [estado],
  );

  const resumen = useMemo(
    () =>
      estado.fase === 'listo' && estado.programa !== null
        ? resumenReparto(estado.programa, estado.catalogo)
        : null,
    [estado],
  );

  if (!valido) {
    return (
      <section className="pagina">
        <h1>Mes no válido</h1>
        <p>La dirección debe tener la forma /programa/2026/9.</p>
      </section>
    );
  }

  const titulo = `${MONTH_NAMES_ES[month - 1] ?? ''} de ${year}`;

  if (estado.fase === 'cargando') {
    return (
      <section className="pagina">
        <h1>{titulo}</h1>
        <p>Cargando…</p>
      </section>
    );
  }

  if (estado.fase === 'error') {
    return (
      <section className="pagina">
        <h1>{titulo}</h1>
        <p className="mensaje-error">{estado.mensaje}</p>
        <button type="button" onClick={() => void cargar()}>
          Reintentar
        </button>
      </section>
    );
  }

  const hayPrograma = estado.programa !== null;
  const totalDuplicados = [...duplicados.values()].reduce((n, s) => n + s.size, 0);

  return (
    <section className="pagina">
      <header className="pagina-encabezado">
        <h1>{titulo}</h1>
        <p className="pagina-estado">
          {hayPrograma ? 'Guardado. Los cambios se aplican al momento.' : 'Este mes todavía no se ha generado.'}
        </p>
      </header>

      <div className="barra-acciones">
        <button type="button" disabled={ocupado} onClick={() => void generarYGuardar(false)}>
          {hayPrograma ? 'Regenerar' : 'Generar programa'}
        </button>
        <button
          type="button"
          disabled={ocupado || !hayPrograma}
          onClick={() => void generarYGuardar(true)}
        >
          Probar otra variante
        </button>
        {hayPrograma ? (
          <button type="button" className="boton-peligro-suave" disabled={ocupado} onClick={vaciar}>
            Vaciar y asignar a mano
          </button>
        ) : (
          <button type="button" disabled={ocupado} onClick={empezarEnBlanco}>
            Empezar en blanco
          </button>
        )}
        <button
          type="button"
          className="boton-principal"
          disabled={ocupado || !hayPrograma}
          onClick={descargar}
        >
          Descargar PDF
        </button>
        {hayPrograma && (
          <button type="button" className="boton-peligro" disabled={ocupado} onClick={borrar}>
            Borrar programa
          </button>
        )}
      </div>

      {hayPrograma && (
        <p className="nota-regenerar">
          Al regenerar se conservan las casillas bloqueadas. Editar una a mano la bloquea
          automáticamente, para que tu cambio no se pierda.
        </p>
      )}

      {estado.warnings.length > 0 && (
        <ul className="avisos">
          {estado.warnings.map((aviso, i) => (
            <li key={`${aviso.code}-${i}`}>{aviso.message}</li>
          ))}
        </ul>
      )}

      {totalDuplicados > 0 && (
        <ul className="avisos avisos-error">
          <li>
            Hay {totalDuplicados === 1 ? 'una persona o equipo repetido' : `${totalDuplicados} repeticiones`} en
            un mismo día, por una edición manual. Están marcadas en la tabla.
          </li>
        </ul>
      )}

      {infracciones.size > 0 && (
        <ul className="avisos avisos-error">
          <li>
            {infracciones.size === 1
              ? 'Hay una casilla asignada a alguien que la tiene restringida.'
              : `Hay ${infracciones.size} casillas asignadas a alguien que las tiene restringidas.`}{' '}
            Están marcadas en la tabla. No se cambian solas: puedes dejarlas si tienes un motivo.
          </li>
        </ul>
      )}

      {estado.programa === null ? (
        <p>
          Pulsa «Generar programa» para que el algoritmo lo reparta, o «Empezar en blanco» para
          crear el mes vacío y asignarlo tú.
        </p>
      ) : (
        <div className="programa-con-panel">
          <RejillaPrograma
            programa={estado.programa}
            catalogo={estado.catalogo}
            traza={traza}
            duplicados={duplicados}
            infracciones={infracciones}
            ocupado={ocupado}
            onEditar={editar}
            onAlternarBloqueo={bloquear}
            onPedirTraza={pedirTraza}
          />
          {resumen !== null && (
            <PanelReparto
              resumen={resumen}
              assignmentTypes={estado.catalogo.assignmentTypes}
              objetivo={
                computeLoadTarget(
                  resumen.casillasPersona,
                  estado.catalogo.people.filter((p) => p.active).length,
                ).cap
              }
            />
          )}
        </div>
      )}
    </section>
  );
}
