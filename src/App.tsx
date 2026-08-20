import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/components/AuthProvider';
import { RequireAuth } from '@/components/RequireAuth';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProgramaPage } from '@/pages/ProgramaPage';
import { PersonasPage } from '@/pages/PersonasPage';
import { GruposPage } from '@/pages/GruposPage';
import { ResponsabilidadesPage } from '@/pages/ResponsabilidadesPage';
import { EstadisticasPage } from '@/pages/EstadisticasPage';
import { AjustesPage } from '@/pages/AjustesPage';

// Usamos createHashRouter (rutas del tipo #/ruta) en vez de
// createBrowserRouter porque el sitio se publica en GitHub Pages, que no
// reescribe rutas del lado del servidor: con un router basado en History,
// recargar la página en una ruta distinta de "/" daría 404.
const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'programa/:year/:month', element: <ProgramaPage /> },
      { path: 'personas', element: <PersonasPage /> },
      { path: 'grupos', element: <GruposPage /> },
      { path: 'responsabilidades', element: <ResponsabilidadesPage /> },
      { path: 'estadisticas', element: <EstadisticasPage /> },
      { path: 'ajustes', element: <AjustesPage /> },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
