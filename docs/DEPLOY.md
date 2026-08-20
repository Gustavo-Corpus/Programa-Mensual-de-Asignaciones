# Publicar en GitHub Pages, paso a paso

Antes de empezar debes haber completado [`FIREBASE.md`](./FIREBASE.md), incluido el **paso 5**
(dominio autorizado). Sin él la web se publicará bien pero nadie podrá iniciar sesión.

Datos concretos de este proyecto:

| Dato | Valor |
|---|---|
| Repositorio | `Gustavo-Corpus/Programa-Mensual-de-Asignaciones` |
| Rama que publica | `main` |
| URL final | `https://gustavo-corpus.github.io/Programa-Mensual-de-Asignaciones/` |
| `base` de Vite | `/Programa-Mensual-de-Asignaciones/` |

---

## Paso 1 — Comprobar el `base` de Vite

Abre `vite.config.ts` y verifica que dice exactamente:

```ts
base: '/Programa-Mensual-de-Asignaciones/',
```

**Con la barra al principio y al final.** Tiene que coincidir carácter por carácter con el nombre
del repositorio, respetando mayúsculas.

> **Por qué esto importa más de lo que parece.** GitHub Pages no sirve tu sitio en la raíz del
> dominio, sino bajo `/Programa-Mensual-de-Asignaciones/`. Si `base` no coincide, el `index.html`
> pedirá el JavaScript en una ruta que no existe: verás una **página completamente en blanco, sin
> ningún mensaje de error visible**. Es el fallo número uno de este tipo de despliegue, y como no
> falla ruidosamente cuesta mucho de diagnosticar.

Si algún día renombras el repositorio, cambia también este valor y el dominio del paso 5 de
`FIREBASE.md`. Si usas un dominio propio, `base` pasa a ser `'/'`.

---

## Paso 2 — Activar GitHub Pages

1. Ve a **https://github.com/Gustavo-Corpus/Programa-Mensual-de-Asignaciones**.
2. Pestaña **Settings** (arriba a la derecha).
3. Menú lateral izquierdo → **Pages**.
4. En **Source**, despliega el selector y elige **GitHub Actions**.

   > **No elijas** *Deploy from a branch*. Esa opción publicaría los archivos tal cual están en el
   > repositorio, y nuestro sitio hay que **compilarlo** antes. Con *GitHub Actions* es el workflow
   > del paso 4 el que compila y publica.

5. No hay que pulsar *Guardar*: el cambio se aplica solo.

---

## Paso 3 — Cargar las claves como *secrets* del repositorio

El workflow compila la aplicación en los servidores de GitHub, así que necesita las mismas seis
variables que tienes en tu `.env.local`.

1. **Settings** → menú lateral **Secrets and variables** → **Actions**.
2. Pestaña **Secrets** → botón **New repository secret**.
3. Crea **seis** secrets, uno por uno. El nombre debe coincidir **exactamente** (mayúsculas y
   guiones bajos incluidos) y el valor es el mismo que en tu `.env.local`:

| Name | Value (cópialo de tu `.env.local`) |
|---|---|
| `VITE_FIREBASE_API_KEY` | valor de `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | valor de `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | valor de `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | valor de `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | valor de `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | valor de `appId` |

> **Un matiz importante para que no te lleves una sorpresa.** Estos valores acaban dentro del
> JavaScript público del sitio: cualquiera que abra las herramientas de desarrollador los verá.
> Están como *secrets* por higiene y para no tenerlos escritos en el repositorio, **no** porque
> ocultarlos aporte seguridad. Son públicos por diseño, como explica el paso 6 de `FIREBASE.md`.
> Lo que protege tus datos son las reglas de Firestore y el inicio de sesión.
>
> El archivo que **nunca** debe llegar a GitHub es `firebase-service-account.json`. Ese sí es un
> secreto real, y por eso no aparece en esta tabla ni hace falta para compilar.

---

## Paso 4 — Qué hace el workflow

El archivo `.github/workflows/deploy.yml` ya está en el repositorio. Se dispara con cada `push` a
`main` (y a mano desde la pestaña *Actions*, con *Run workflow*). Esto es lo que hace, en orden:

| Paso | Qué hace |
|---|---|
| `actions/checkout` | Descarga el código del repositorio |
| `actions/setup-node` | Instala Node y activa la caché de npm para que las siguientes ejecuciones sean rápidas |
| `npm ci` | Instala las dependencias exactamente como fija `package-lock.json` |
| **`npm test`** | **Ejecuta toda la suite de pruebas** |
| `npm run build` | Compila TypeScript y genera `dist/`, inyectando los seis secrets |
| `upload-pages-artifact` | Empaqueta `dist/` como artefacto de Pages |
| `deploy-pages` | Publica el artefacto en GitHub Pages y devuelve la URL |

Los permisos del workflow son `contents: read`, `pages: write` e `id-token: write`; los dos
últimos son los que GitHub exige para publicar en Pages. El `concurrency: pages` evita que dos
despliegues simultáneos se pisen.

### El paso de tests va antes del build, y a propósito

Si la suite falla, el workflow se detiene ahí y **no se publica nada**. La versión anterior sigue
en línea.

Esto no es celo de purista: la lógica que se está probando es la que decide quién limpia y quién
acomoda cada semana. Publicar un programa mal distribuido es peor que no publicar, porque el error
llega a personas reales que se organizan con él y nadie revisa a mano lo que la aplicación afirma
haber calculado bien.

---

## Paso 5 — Desplegar

```powershell
git add .
git commit -m "Configuración inicial del proyecto"
git push origin main
```

Después:

1. Ve a la pestaña **Actions** del repositorio.
2. Verás la ejecución en curso. Tarda entre uno y tres minutos.
3. Cuando el círculo se ponga **verde**, abre:

   ```
   https://gustavo-corpus.github.io/Programa-Mensual-de-Asignaciones/
   ```

4. **Inicia sesión ahí**, no solo en local. Es en la URL publicada donde se manifiesta el problema
   del dominio autorizado, y el único sitio donde puedes comprobar que el paso 5 de `FIREBASE.md`
   quedó bien.

> La primera vez, GitHub puede tardar un par de minutos extra en activar el dominio después de que
> el workflow termine en verde. Si da 404 justo al acabar, espera y recarga.

---

## Solución de problemas

### La página carga completamente en blanco
Casi siempre es el **`base` de Vite** (paso 1). Para confirmarlo: abre la consola del navegador
(F12) y mira la pestaña *Network*. Si ves peticiones a `/assets/…` en **404** cuando deberían ir a
`/Programa-Mensual-de-Asignaciones/assets/…`, ese es el problema. Corrige `vite.config.ts`, haz
commit y push.

### 404 al abrir la URL
- ¿El workflow terminó en verde? Míralo en **Actions**.
- ¿*Settings → Pages → Source* está en **GitHub Actions** y no en *Deploy from a branch*?
- Si acabas de activarlo, espera dos minutos y recarga.

### La app carga pero muestra el mensaje de configuración incompleta
Falta algún secret, o el nombre no coincide exactamente. Revisa los seis del paso 3 — un
`VITE_FIREBASE_APPID` en lugar de `VITE_FIREBASE_APP_ID` basta para romperlo. Después de
corregirlo hay que **relanzar el workflow**: *Actions* → última ejecución → *Re-run all jobs*.
Cambiar un secret no republica nada por sí solo.

### Inicio de sesión funciona en local pero no en la web publicada
Es el `auth/unauthorized-domain` del **paso 5 de `FIREBASE.md`**. Añade `gustavo-corpus.github.io`
a los dominios autorizados de Firebase Authentication. No requiere volver a desplegar: el cambio
es del lado de Firebase.

### El workflow falla en `npm test`
Está haciendo exactamente su trabajo. Abre la ejecución en *Actions*, mira qué prueba falló y
corrígela. No añadas `continue-on-error` para saltártelo.

### El workflow falla en `npm ci`
`package-lock.json` está desincronizado con `package.json`. Ejecuta `npm install` en local, haz
commit del `package-lock.json` actualizado y vuelve a empujar.

### Recargar una página interna da 404
No debería pasar: la aplicación usa `HashRouter` y todas las rutas van después de `#`
(`…/Programa-Mensual-de-Asignaciones/#/personas`). Si te encuentras una URL sin `#`, es un enlace
mal construido en el código — avísame.

---

## Resumen de comprobación

- [ ] `base` en `vite.config.ts` = `/Programa-Mensual-de-Asignaciones/`
- [ ] *Settings → Pages → Source* = **GitHub Actions**
- [ ] Los seis secrets `VITE_FIREBASE_*` creados con el nombre exacto
- [ ] `push` a `main` hecho y workflow en verde
- [ ] La URL publicada abre y muestra la pantalla de acceso
- [ ] **Inicio de sesión correcto desde la URL publicada**, no solo desde `localhost`
