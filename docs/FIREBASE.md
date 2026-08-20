# Configurar Firebase, paso a paso

Guía para dejar el proyecto funcionando desde cero. Está pensada para seguirse **en orden y sin
saltarse pasos**. Cada paso dice exactamente dónde hacer clic y qué escribir.

Si en algún punto tienes que adivinar algo, esta guía tiene un fallo: dímelo y la corrijo.

> **Nota sobre los nombres de los botones.** La consola de Firebase se muestra en español o en
> inglés según la configuración de tu cuenta de Google. Cuando el nombre puede variar, escribo los
> dos así: *Crear base de datos* (*Create database*). La **ruta de navegación** siempre es la
> misma.

**Antes de empezar necesitas:** una cuenta de Google, Node.js instalado (ya lo tienes: v24) y el
proyecto clonado en tu equipo.

---

## Paso 1 — Crear el proyecto de Firebase

1. Entra en **https://console.firebase.google.com/** con tu cuenta de Google.
2. Pulsa **Crear un proyecto** (*Create a project*).
3. Nombre del proyecto: `programa-asignaciones` (o el que prefieras; no afecta al código).
   Debajo aparecerá un identificador real, del tipo `programa-asignaciones-a1b2c`. **Apunta ese
   identificador**: es tu `projectId` y lo necesitarás en el paso 6.
4. En la pantalla de **Google Analytics**, desactiva el interruptor y pulsa **Crear proyecto**.

   > Analytics no aporta nada aquí — no hay visitantes que medir, solo tú y quien administre el
   > programa — y activarlo añade una cuenta más que gestionar. Si lo activas por error no pasa
   > nada, pero no lo necesitas.

5. Espera a que termine y pulsa **Continuar**. Llegas al panel del proyecto.

---

## Paso 2 — Crear la base de datos Firestore

> ⚠️ **La región de Firestore NO se puede cambiar después.** Para cambiarla habría que borrar el
> proyecto entero y empezar de nuevo. Lee el punto 4 antes de pulsar nada.

1. En el menú lateral izquierdo: **Compilación** (*Build*) → **Firestore Database**.
2. Pulsa **Crear base de datos** (*Create database*).
3. Elige **Modo de producción** (*Production mode*), **no** modo de prueba.

   > El modo de prueba deja la base abierta a todo el mundo durante 30 días y luego la cierra de
   > golpe. Nosotros desplegamos nuestras propias reglas en el paso 8, así que empezamos cerrados
   > desde el minuto uno.

4. **Ubicación** (*Location*). Elige una y no la vuelvas a tocar:
   - Desde México o Latinoamérica: **`nam5 (us-central)`** — es la recomendada, multi-región y con
     buena latencia hacia toda América.
   - Desde España: `eur3 (europe-west)`.
5. Pulsa **Crear** (*Create*) y espera a que se aprovisione (menos de un minuto).

---

## Paso 3 — Activar el acceso por correo y contraseña

1. Menú lateral: **Compilación** (*Build*) → **Authentication**.
2. Pulsa **Comenzar** (*Get started*).
3. En la pestaña **Sign-in method** (*Método de acceso*), pulsa sobre
   **Correo electrónico/contraseña** (*Email/Password*).
4. Activa el **primer** interruptor (*Habilitar* / *Enable*).
   **Deja desactivado** el segundo, *Vínculo del correo electrónico (acceso sin contraseña)*.
5. Pulsa **Guardar** (*Save*).

---

## Paso 4 — Crear el usuario administrador

No hay pantalla de registro en la aplicación: las cuentas se crean aquí a mano, a propósito. Nadie
que llegue a la URL puede darse de alta solo.

1. En **Authentication**, pestaña **Users** (*Usuarios*).
2. Pulsa **Agregar usuario** (*Add user*).
3. Escribe el correo y una contraseña de al menos 6 caracteres. Usa una contraseña larga y
   guárdala en tu gestor de contraseñas: **es la única llave de todo el sistema**.
4. Pulsa **Agregar usuario**.

Repite este paso por cada persona que vaya a administrar el programa. Si prefieres una sola cuenta
compartida, con crear una basta — pero ten presente que entonces no queda constancia de quién
editó qué.

---

## Paso 5 — Autorizar el dominio de GitHub Pages

> ⚠️ **Este es el paso que todo el mundo se salta.** Si no lo haces, el acceso funcionará
> perfectamente en tu ordenador y fallará al desplegar, con el error
> `auth/unauthorized-domain`. `localhost` viene autorizado de fábrica; tu dominio de GitHub Pages,
> no.

1. En **Authentication**, pestaña **Settings** (*Configuración*).
2. Sección **Authorized domains** (*Dominios autorizados*).
3. Pulsa **Agregar dominio** (*Add domain*).
4. Escribe exactamente esto, **en minúsculas**:

   ```
   gustavo-corpus.github.io
   ```

   Es el dominio de tu usuario de GitHub (`Gustavo-Corpus`), en minúsculas porque los dominios no
   distinguen mayúsculas y GitHub Pages siempre los sirve así.

   > Es el **dominio**, no la URL completa. Escribir
   > `gustavo-corpus.github.io/Programa-Mensual-de-Asignaciones/` o `https://gustavo-corpus.github.io`
   > sería **incorrecto** y el acceso seguiría fallando.

5. Pulsa **Agregar**.

---

## Paso 6 — Registrar la aplicación web y copiar las claves

1. Pulsa el **engranaje ⚙** junto a *Descripción general del proyecto* (arriba a la izquierda) →
   **Configuración del proyecto** (*Project settings*).
2. Baja hasta la sección **Tus aplicaciones** (*Your apps*).
3. Pulsa el icono **`</>`** (*Web*).
4. **Sobrenombre de la app**: `Programa Mensual`.
5. **NO marques** *También configurar Firebase Hosting* — desplegamos en GitHub Pages.
6. Pulsa **Registrar app**.
7. Aparecerá un bloque de código con un objeto `firebaseConfig`. Déjalo abierto: lo copias ahora.

### Crear el archivo `.env.local`

En la **raíz del proyecto** (junto a `package.json`) crea un archivo llamado exactamente
`.env.local` y copia cada valor del objeto `firebaseConfig` a su variable:

| Campo en `firebaseConfig` | Variable en `.env.local` |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |

Debe quedar así (con **tus** valores, sin comillas y sin espacios alrededor del `=`):

```dotenv
VITE_FIREBASE_API_KEY=AIzaSyD-ejemplo-no-uses-este-valor
VITE_FIREBASE_AUTH_DOMAIN=programa-asignaciones-a1b2c.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=programa-asignaciones-a1b2c
VITE_FIREBASE_STORAGE_BUCKET=programa-asignaciones-a1b2c.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
```

> **Estas claves no son secretas.** Van dentro del JavaScript que se descarga cualquier visitante:
> es imposible ocultarlas y Google las diseñó para ser públicas. Identifican tu proyecto, no
> autorizan nada. Lo que impide que alguien lea o escriba tus datos son las reglas de
> `firestore.rules` del paso 8, combinadas con el inicio de sesión del paso 4.
>
> Lo que **sí** es secreto es la clave del paso 9. Esa nunca sale de tu equipo.

`.env.local` ya está en `.gitignore`, así que no se subirá al repositorio. No lo quites de ahí:
no porque las claves sean secretas, sino porque cada entorno debe traer las suyas.

Si más adelante pierdes estos valores, están siempre en **Configuración del proyecto → Tus
aplicaciones → SDK setup and configuration → Config**.

---

## Paso 7 — Preparar la CLI de Firebase

Abre PowerShell **en la carpeta del proyecto** y ejecuta:

```powershell
npx firebase-tools login
```

Se abrirá el navegador para que autorices con la misma cuenta de Google del paso 1. Al terminar,
vuelve a la terminal.

```powershell
npx firebase-tools use --add
```

Elige tu proyecto de la lista y, cuando pida un alias, escribe `default`.

> Uso `npx` en lugar de `npm install -g firebase-tools` a propósito: evita problemas de permisos y
> de PATH en Windows, y garantiza que usas una versión reciente. Si prefieres instalarlo global,
> `npm install -g firebase-tools` y luego `firebase` en vez de `npx firebase-tools` en todos los
> comandos.

---

## Paso 8 — Desplegar las reglas de seguridad

Este es el paso que realmente protege tus datos.

```powershell
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

Debe terminar con `Deploy complete!`. Las reglas que se despliegan (archivo `firestore.rules`)
dicen: **solo quien haya iniciado sesión puede leer o escribir; todo lo demás, denegado**.

Compruébalo: entra en **Firestore Database → Reglas** (*Rules*) en la consola y verifica que el
contenido coincide con el del archivo `firestore.rules` del repositorio.

> Este es el **único** uso de la CLI de Firebase en el proyecto. El sitio web se publica en GitHub
> Pages, no en Firebase Hosting — eso está en [`DEPLOY.md`](./DEPLOY.md).

---

## Paso 9 — Clave de servicio y carga de datos iniciales

El script de carga inicial (`npm run seed`) escribe en Firestore desde tu equipo, sin pasar por el
navegador, así que necesita credenciales de administrador propias.

1. **Configuración del proyecto** (⚙) → pestaña **Cuentas de servicio** (*Service accounts*).
2. Pulsa **Generar nueva clave privada** (*Generate new private key*) → **Generar clave**.
3. Se descargará un archivo `.json`. **Renómbralo a `firebase-service-account.json` y muévelo a la
   raíz del proyecto.**

> 🔒 **Este archivo sí es secreto de verdad.** Da control total sobre tu base de datos, saltándose
> las reglas de seguridad. `.gitignore` ya incluye el patrón `*-service-account*.json` para que no
> se suba nunca. **Verifícalo** antes de tu primer commit:
>
> ```powershell
> git status --short
> ```
>
> Si ves `firebase-service-account.json` en la lista, **detente** y avísame: el `.gitignore` está
> mal. Si se te escapa a un repositorio público, ve inmediatamente a *Cuentas de servicio* y
> revoca la clave.

Ahora carga los datos iniciales:

```powershell
npm run seed
```

Al terminar, comprueba en **Firestore Database → Datos** (*Data*) que existen estas colecciones:

| Colección | Debe contener |
|---|---|
| `assignmentTypes` | 6 documentos (las seis responsabilidades) |
| `people` | 19 documentos |
| `teams` | 4 documentos (las parejas de grupos) |
| `groups` | 8 documentos |
| `settings` | 1 documento, `app` |
| `programs` | 1 documento, `2026-08`, con el mes histórico de la hoja de referencia |

---

## Paso 10 — Arrancar la aplicación

```powershell
npm install
npm run dev
```

Abre la URL que muestre la terminal (normalmente `http://localhost:5173/`) e inicia sesión con el
usuario del paso 4.

**Comprobación de que la seguridad funciona:** abre la misma URL en una ventana de incógnito. Debes
ver la pantalla de acceso y ningún dato. Si ves datos sin iniciar sesión, las reglas del paso 8 no
se desplegaron.

---

## Paso 11 — Emuladores (opcional, para desarrollar sin tocar los datos reales)

```powershell
npx firebase-tools emulators:start
```

Levanta Firestore y Authentication en local. Los tests de reglas de seguridad
(`tests/` con `@firebase/rules-unit-testing`) lo usan. Útil si quieres probar cambios sin
ensuciar la base real; no es necesario para el uso normal.

---

## Solución de problemas

### `auth/unauthorized-domain` al iniciar sesión en la web publicada
No hiciste el **paso 5**, o escribiste la URL completa en vez del dominio. Debe ser exactamente
`gustavo-corpus.github.io`, sin `https://` y sin la ruta del repositorio. El cambio tarda un par
de minutos en propagarse.

### `auth/invalid-api-key` o pantalla con el mensaje de configuración incompleta
Falta alguna variable en `.env.local`, o hay una errata. Revisa la tabla del paso 6 campo por
campo. **Después de editar `.env.local` hay que reiniciar `npm run dev`**: Vite lee las variables
de entorno solo al arrancar.

### `auth/invalid-credential` al iniciar sesión
Correo o contraseña incorrectos. Verifica en **Authentication → Users** que el usuario existe. Si
no recuerdas la contraseña, en el menú `⋮` de ese usuario puedes restablecerla.

### `permission-denied` / `Missing or insufficient permissions`
Casi siempre son las reglas sin desplegar: repite el **paso 8**. Si acabas de desplegarlas, espera
un minuto — tardan un poco en propagarse. Si el error sale en `npm run seed`, el problema es otro:
falta `firebase-service-account.json` o está mal (paso 9).

### `npm run seed` falla con `Could not load the default credentials`
No existe `firebase-service-account.json` en la raíz del proyecto, o el nombre no coincide
exactamente. Repite el paso 9.

### Las reglas no parecen actualizarse
Confirma que estás desplegando al proyecto correcto:

```powershell
npx firebase-tools use
```

Debe mostrar el `projectId` del paso 1. Si no, repite `npx firebase-tools use --add`.

### ¿Se me va a cobrar algo?
No. El plan **Spark** es gratuito y suficiente de sobra: permite 50 000 lecturas y 20 000
escrituras al día, y esta aplicación lee **un solo documento** por mes consultado, porque el
programa entero se guarda junto. Un uso normal son unas decenas de operaciones al día. GitHub
Pages tampoco cuesta nada.

Solo necesitarías el plan de pago (Blaze) si en el futuro se añadieran Cloud Functions, que este
proyecto no usa.

---

## Resumen de comprobación

Cuando termines, deberías poder marcar las diez casillas:

- [ ] Proyecto creado y `projectId` apuntado
- [ ] Firestore creado en **modo producción**
- [ ] Acceso por correo/contraseña activado
- [ ] Usuario administrador creado
- [ ] `gustavo-corpus.github.io` en los dominios autorizados
- [ ] `.env.local` con las 6 variables
- [ ] `npx firebase-tools use` apunta a tu proyecto
- [ ] Reglas desplegadas (`Deploy complete!`)
- [ ] `firebase-service-account.json` en la raíz y **fuera** de `git status`
- [ ] `npm run seed` ejecutado y las 6 colecciones visibles en la consola

Siguiente paso: [`DEPLOY.md`](./DEPLOY.md) para publicar en GitHub Pages.
