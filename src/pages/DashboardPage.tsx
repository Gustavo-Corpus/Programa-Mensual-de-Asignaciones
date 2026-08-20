import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MONTH_NAMES_ES, addMonths } from '@/domain/dates';

/**
 * El mes que se ofrece por defecto es el SIGUIENTE al actual: un programa se
 * prepara con antelación, así que abrir la aplicación a mitad de mes casi
 * siempre significa querer armar el mes que viene.
 */
function mesPorDefecto(): { year: number; month: number } {
  const hoy = new Date();
  return addMonths(hoy.getFullYear(), hoy.getMonth() + 1, 1);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const inicial = mesPorDefecto();
  const [year, setYear] = useState(inicial.year);
  const [month, setMonth] = useState(inicial.month);

  const anteriores = [-1, -2, -3].map((delta) =>
    addMonths(inicial.year, inicial.month, delta),
  );

  return (
    <section className="pagina">
      <h1>Panel principal</h1>

      <form
        className="selector-mes"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/programa/${year}/${month}`);
        }}
      >
        <label>
          Mes
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES_ES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Año
          <input
            type="number"
            value={year}
            min={2000}
            max={2100}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="boton-principal">
          Abrir programa
        </button>
      </form>

      <h2>Meses recientes</h2>
      <ul className="lista-meses">
        {anteriores.map((m) => (
          <li key={`${m.year}-${m.month}`}>
            <Link to={`/programa/${m.year}/${m.month}`}>
              {MONTH_NAMES_ES[m.month - 1]} de {m.year}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
