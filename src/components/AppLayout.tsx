import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';

const ENLACES_NAV = [
  { to: '/', etiqueta: 'Panel principal', fin: true },
  { to: '/personas', etiqueta: 'Personas' },
  { to: '/grupos', etiqueta: 'Grupos' },
  { to: '/responsabilidades', etiqueta: 'Responsabilidades' },
  { to: '/estadisticas', etiqueta: 'Estadísticas' },
  { to: '/ajustes', etiqueta: 'Ajustes' },
] as const;

export function AppLayout() {
  const { signOut } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-encabezado">
        <span className="app-titulo">Programa Mensual de Asignaciones</span>
        <nav className="app-nav">
          {ENLACES_NAV.map((enlace) => (
            <NavLink
              key={enlace.to}
              to={enlace.to}
              end={'fin' in enlace ? enlace.fin : false}
              className={({ isActive }) =>
                isActive ? 'app-nav-enlace activo' : 'app-nav-enlace'
              }
            >
              {enlace.etiqueta}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="boton-cerrar-sesion"
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </button>
      </header>
      <main className="app-contenido">
        <Outlet />
      </main>
    </div>
  );
}
