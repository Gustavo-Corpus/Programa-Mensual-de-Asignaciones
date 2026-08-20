import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Nombres de las variables de entorno requeridas para inicializar Firebase.
 * Todas deben estar presentes en tiempo de build (ver .env.example).
 */
const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

function findMissingEnvVars(env: ImportMetaEnv): RequiredEnvVar[] {
  return REQUIRED_ENV_VARS.filter((name) => !env[name]);
}

const missing = findMissingEnvVars(import.meta.env);

/**
 * Si no es null, la configuración de Firebase está incompleta y la app NO
 * debe intentar usar Auth/Firestore. La UI debe mostrar este mensaje en
 * pantalla en vez de dejar que Firebase lance una excepción críptica.
 */
export const firebaseConfigError: string | null =
  missing.length > 0
    ? `Faltan variables de entorno de Firebase: ${missing.join(', ')}. ` +
      'Copia .env.example a .env.local y complétalo con la configuración ' +
      'de tu proyecto de Firebase. Consulta docs/FIREBASE.md para más detalle.'
    : null;

function buildFirebaseOptions(env: ImportMetaEnv): FirebaseOptions {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

// Cuando falta configuración, igual inicializamos con valores vacíos para
// que el resto del módulo (imports) no explote; `firebaseConfigError` es lo
// que realmente controla si la app permite usar estos objetos.
const app = initializeApp(
  firebaseConfigError === null
    ? buildFirebaseOptions(import.meta.env)
    : { apiKey: 'missing', projectId: 'missing', appId: 'missing' },
);

export const auth = getAuth(app);

if (firebaseConfigError === null) {
  void setPersistence(auth, browserLocalPersistence);
}

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export default app;
