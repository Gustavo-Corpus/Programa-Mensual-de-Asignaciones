import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import '@/styles/catalogo.css';
import { DAY_NAMES_ES } from '@/domain/dates';
import { ICON_NAMES } from '@/domain/types';
import type { AssignmentKind, AssignmentType, IconName } from '@/domain/types';
import { createAssignmentType, listAssignmentTypes, updateAssignmentType } from '@/data/types.repo';
import {
  claveDuplicada,
  claveResponsabilidadSchema,
  mensajeCambioKind,
  sinDiasDeSemana,
} from '@/services/catalogoService';
import { CampoEnLinea } from '@/components/CampoEnLinea';

// La lista de iconos viene del dominio, que es donde se declara. No se
// escribe aquí una segunda vez ni se extrae del esquema de Zod: el tipo
// `IconName` se DERIVA de este mismo array, así que el compilador garantiza
// que el desplegable ofrece exactamente los iconos que existen.
const ICONOS_DISPONIBLES = ICON_NAMES;

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error'; mensaje: string }
  | { fase: 'listo'; tipos: AssignmentType[] };

function mensajeDeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado.';
}

interface FormularioNuevo {
  readonly key: string;
  readonly label: string;
  readonly kind: AssignmentKind;
  readonly daysOfWeek: readonly number[];
  readonly slotsPerDate: string;
  readonly order: string;
  readonly icon: IconName;
}

const FORM_INICIAL: FormularioNuevo = {
  key: '',
  label: '',
  kind: 'PERSON',
  daysOfWeek: [],
  slotsPerDate: '1',
  order: '1',
  icon: 'dot',
};

export function ResponsabilidadesPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [form, setForm] = useState<FormularioNuevo>(FORM_INICIAL);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado({ fase: 'cargando' });
    try {
      const tipos = await listAssignmentTypes();
      setEstado({
        fase: 'listo',
        tipos: [...tipos].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
      });
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

  const tipos = useMemo(() => (estado.fase === 'listo' ? estado.tipos : []), [estado]);

  const crear = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      setErrorFormulario(null);

      const claveParseada = claveResponsabilidadSchema.safeParse(form.key.trim());
      if (!claveParseada.success) {
        setErrorFormulario(claveParseada.error.issues[0]?.message ?? 'Clave inválida.');
        return;
      }
      if (claveDuplicada(claveParseada.data, tipos)) {
        setErrorFormulario('Ya existe una responsabilidad con esta clave.');
        return;
      }
      if (form.label.trim() === '') {
        setErrorFormulario('La etiqueta no puede estar vacía.');
        return;
      }
      const slots = Number.parseInt(form.slotsPerDate, 10);
      if (Number.isNaN(slots) || slots < 1) {
        setErrorFormulario('Las casillas por fecha deben ser un entero de 1 o más.');
        return;
      }
      const order = Number.parseInt(form.order, 10);
      if (Number.isNaN(order)) {
        setErrorFormulario('El orden debe ser un número entero.');
        return;
      }

      void ejecutar(async () => {
        await createAssignmentType({
          key: claveParseada.data,
          label: form.label.trim(),
          kind: form.kind,
          daysOfWeek: form.daysOfWeek,
          slotsPerDate: slots,
          order,
          icon: form.icon,
        });
        setForm(FORM_INICIAL);
        await cargar();
      });
    },
    [ejecutar, form, tipos, cargar],
  );

  const alternarDiaNuevo = (dia: number) => {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(dia)
        ? f.daysOfWeek.filter((d) => d !== dia)
        : [...f.daysOfWeek, dia].sort((a, b) => a - b),
    }));
  };

  const guardarTipo = useCallback(
    (id: string, changes: Partial<Omit<AssignmentType, 'id' | 'key'>>) =>
      void ejecutar(async () => {
        await updateAssignmentType(id, changes);
        await cargar();
      }),
    [ejecutar, cargar],
  );

  const cambiarKind = useCallback(
    (tipo: AssignmentType, nuevoKind: AssignmentKind) => {
      if (nuevoKind === tipo.kind) return;
      if (!window.confirm(mensajeCambioKind(nuevoKind))) return;
      guardarTipo(tipo.id, { kind: nuevoKind });
    },
    [guardarTipo],
  );

  if (estado.fase === 'cargando') {
    return (
      <section className="pagina">
        <h1>Responsabilidades</h1>
        <p>Cargando…</p>
      </section>
    );
  }

  if (estado.fase === 'error') {
    return (
      <section className="pagina">
        <h1>Responsabilidades</h1>
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
        <h1>Responsabilidades</h1>
      </header>

      <p className="nota-explicativa">
        Cada responsabilidad define una columna del programa: en qué días de la semana aparece, si
        se asigna a personas o a equipos, y cuántas casillas tiene por fecha. Nada se borra nunca,
        solo se desactiva.
      </p>

      {errorAccion !== null && <p className="mensaje-error">{errorAccion}</p>}

      <form className="form-catalogo form-vertical" onSubmit={crear}>
        <h2 className="subtitulo-catalogo subtitulo-catalogo-primero">Nueva responsabilidad</h2>

        <div className="campo-catalogo">
          <label htmlFor="nueva-resp-key">Clave</label>
          <input
            id="nueva-resp-key"
            type="text"
            value={form.key}
            disabled={ocupado}
            placeholder="p. ej. acomodador_entrada"
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
          />
          <span>
            Minúsculas, dígitos y guion bajo. No se puede cambiar después de crearla: es la clave
            con la que se cuenta el historial de esta responsabilidad.
          </span>
        </div>

        <div className="campo-catalogo">
          <label htmlFor="nueva-resp-label">Etiqueta (lo que se imprime)</label>
          <input
            id="nueva-resp-label"
            type="text"
            value={form.label}
            disabled={ocupado}
            placeholder="p. ej. Acomodador de entrada"
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>

        <div className="campo-catalogo">
          <label htmlFor="nueva-resp-kind">Se asigna a</label>
          <select
            id="nueva-resp-kind"
            value={form.kind}
            disabled={ocupado}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AssignmentKind }))}
          >
            <option value="PERSON">Personas</option>
            <option value="GROUP">Equipos</option>
          </select>
        </div>

        <div className="campo-catalogo">
          <span>Días de la semana</span>
          <div className="campo-catalogo-checkboxes">
            {DAY_NAMES_ES.map((nombre, dia) => (
              <label key={dia}>
                <input
                  type="checkbox"
                  checked={form.daysOfWeek.includes(dia)}
                  disabled={ocupado}
                  onChange={() => alternarDiaNuevo(dia)}
                />
                {nombre}
              </label>
            ))}
          </div>
          {sinDiasDeSemana(form.daysOfWeek) && (
            <span>Sin ningún día marcado, esta responsabilidad no aparecerá en ninguna fecha.</span>
          )}
        </div>

        <div className="campo-catalogo">
          <label htmlFor="nueva-resp-slots">Casillas por fecha</label>
          <input
            id="nueva-resp-slots"
            type="number"
            min={1}
            value={form.slotsPerDate}
            disabled={ocupado}
            onChange={(e) => setForm((f) => ({ ...f, slotsPerDate: e.target.value }))}
          />
        </div>

        <div className="campo-catalogo">
          <label htmlFor="nueva-resp-order">Orden de la columna</label>
          <input
            id="nueva-resp-order"
            type="number"
            value={form.order}
            disabled={ocupado}
            onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
          />
        </div>

        <div className="campo-catalogo">
          <label htmlFor="nueva-resp-icon">Icono de la columna</label>
          <select
            id="nueva-resp-icon"
            value={form.icon}
            disabled={ocupado}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value as IconName }))}
          >
            {ICONOS_DISPONIBLES.map((icono) => (
              <option key={icono} value={icono}>
                {icono}
              </option>
            ))}
          </select>
        </div>

        {errorFormulario !== null && <p className="mensaje-error">{errorFormulario}</p>}

        <button type="submit" className="boton-principal" disabled={ocupado}>
          Crear responsabilidad
        </button>
      </form>

      {tipos.length === 0 ? (
        <p className="estado-vacio">Todavía no hay ninguna responsabilidad; crea la primera arriba.</p>
      ) : (
        <ul className="lista-catalogo">
          {tipos.map((tipo) => (
            <FilaResponsabilidad
              key={tipo.id}
              tipo={tipo}
              ocupado={ocupado}
              onGuardar={(changes) => guardarTipo(tipo.id, changes)}
              onCambiarKind={(nuevoKind) => cambiarKind(tipo, nuevoKind)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface FilaResponsabilidadProps {
  readonly tipo: AssignmentType;
  readonly ocupado: boolean;
  readonly onGuardar: (changes: Partial<Omit<AssignmentType, 'id' | 'key'>>) => void;
  readonly onCambiarKind: (nuevoKind: AssignmentKind) => void;
}

function FilaResponsabilidad(props: FilaResponsabilidadProps) {
  const { tipo, ocupado } = props;

  const alternarDia = (dia: number) => {
    const nuevos = tipo.daysOfWeek.includes(dia)
      ? tipo.daysOfWeek.filter((d) => d !== dia)
      : [...tipo.daysOfWeek, dia].sort((a, b) => a - b);
    props.onGuardar({ daysOfWeek: nuevos });
  };

  return (
    <li className={tipo.active ? 'fila-catalogo' : 'fila-catalogo inactiva'}>
      <div className="campo-catalogo clave-fija">
        <span>Clave (fija)</span>
        <span className="clave-fija-valor">{tipo.key}</span>
      </div>

      <div className="campo-catalogo">
        <label htmlFor={`resp-label-${tipo.id}`}>Etiqueta</label>
        <CampoEnLinea
          valor={tipo.label}
          ocupado={ocupado}
          ariaLabel={`Etiqueta de ${tipo.key}`}
          onGuardar={(v) => {
            if (v.trim() !== '') props.onGuardar({ label: v.trim() });
          }}
        />
      </div>

      <div className="campo-catalogo">
        <label htmlFor={`resp-kind-${tipo.id}`}>Se asigna a</label>
        <select
          id={`resp-kind-${tipo.id}`}
          value={tipo.kind}
          disabled={ocupado}
          onChange={(e) => props.onCambiarKind(e.target.value as AssignmentKind)}
        >
          <option value="PERSON">Personas</option>
          <option value="GROUP">Equipos</option>
        </select>
      </div>

      <div className="campo-catalogo">
        <span>Días</span>
        <div className="campo-catalogo-checkboxes">
          {DAY_NAMES_ES.map((nombre, dia) => (
            <label key={dia}>
              <input
                type="checkbox"
                checked={tipo.daysOfWeek.includes(dia)}
                disabled={ocupado}
                onChange={() => alternarDia(dia)}
              />
              {nombre}
            </label>
          ))}
        </div>
        {sinDiasDeSemana(tipo.daysOfWeek) && (
          <span>Sin días marcados: no aparece en ninguna fecha del programa.</span>
        )}
      </div>

      <div className="campo-catalogo">
        <label htmlFor={`resp-slots-${tipo.id}`}>Casillas por fecha</label>
        <CampoEnLinea
          valor={String(tipo.slotsPerDate)}
          tipo="number"
          ocupado={ocupado}
          ariaLabel={`Casillas por fecha de ${tipo.key}`}
          onGuardar={(v) => {
            const n = Number.parseInt(v, 10);
            if (!Number.isNaN(n) && n >= 1) props.onGuardar({ slotsPerDate: n });
          }}
        />
      </div>

      <div className="campo-catalogo">
        <label htmlFor={`resp-order-${tipo.id}`}>Orden</label>
        <CampoEnLinea
          valor={String(tipo.order)}
          tipo="number"
          ocupado={ocupado}
          ariaLabel={`Orden de ${tipo.key}`}
          onGuardar={(v) => {
            const n = Number.parseInt(v, 10);
            if (!Number.isNaN(n)) props.onGuardar({ order: n });
          }}
        />
      </div>

      <div className="campo-catalogo">
        <label htmlFor={`resp-icon-${tipo.id}`}>Icono</label>
        <select
          id={`resp-icon-${tipo.id}`}
          value={tipo.icon}
          disabled={ocupado}
          onChange={(e) => props.onGuardar({ icon: e.target.value as IconName })}
        >
          {ICONOS_DISPONIBLES.map((icono) => (
            <option key={icono} value={icono}>
              {icono}
            </option>
          ))}
        </select>
      </div>

      {!tipo.active && <span className="etiqueta-inactiva">inactiva</span>}

      <div className="acciones-catalogo">
        <button
          type="button"
          className={tipo.active ? 'boton-peligro-suave' : ''}
          disabled={ocupado}
          aria-pressed={!tipo.active}
          onClick={() => props.onGuardar({ active: !tipo.active })}
        >
          {tipo.active ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </li>
  );
}
