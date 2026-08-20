import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '@/components/AuthProvider';
import { firebaseConfigError } from '@/data/firebase';

function traducirErrorFirebase(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
        return 'Correo o contraseña incorrectos.';
      case 'auth/invalid-email':
        return 'El correo electrónico no es válido.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.';
      case 'auth/network-request-failed':
        return 'No hay conexión con el servidor. Revisa tu conexión a internet.';
      case 'auth/unauthorized-domain':
        return (
          'Este dominio no está autorizado para iniciar sesión. ' +
          'Añádelo en Firebase Console → Authentication → Settings → ' +
          'Authorized domains.'
        );
      default:
        return `No se pudo iniciar sesión (${error.code}).`;
    }
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (user !== null) {
    const destino =
      (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={destino} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(traducirErrorFirebase(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina-login">
      <form className="tarjeta-login" onSubmit={handleSubmit}>
        <h1>Programa Mensual de Asignaciones</h1>
        <p className="subtitulo">Inicia sesión para continuar</p>

        {firebaseConfigError !== null && (
          <p className="mensaje-error" role="alert">
            {firebaseConfigError}
          </p>
        )}

        <label htmlFor="email">Correo electrónico</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={firebaseConfigError !== null}
        />

        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={firebaseConfigError !== null}
        />

        {error !== null && (
          <p className="mensaje-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando || firebaseConfigError !== null}>
          {enviando ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
}
