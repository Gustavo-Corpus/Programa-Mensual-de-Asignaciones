# Programa Mensual de Asignaciones

Genera automáticamente el programa mensual de asignaciones de servicio —acomodadores, pasillos,
aseo y hospitalidad— para todos los lunes y sábados de un mes, lo reparte de forma equilibrada,
permite editarlo y lo exporta a un PDF listo para imprimir.

El reparto no es solo automático: es **reproducible** (el mismo mes con la misma semilla da
siempre el mismo resultado) y **explicable** (cada casilla puede decir por qué eligió a esa
persona, con los criterios y los finalistas que quedaron por detrás).

---

## Qué hace

- Detecta solos los lunes y sábados del mes. Nunca asume que son cuatro de cada: hay meses con
  cinco, y la meta de carga se recalcula sola a partir del calendario real.
- Reparte intentando que cada persona salga un número parecido de veces **y** que rote de tipo de
  responsabilidad, no solo de cantidad.
- Tiene en cuenta el historial de meses anteriores, con una ventana configurable.
- Respeta las casillas bloqueadas al regenerar.
- Nunca pone a la misma persona dos veces el mismo día (salvo que se active esa opción).
- Nunca incluye a personas ni equipos inactivos en una generación nueva.
- Cuando no hay gente suficiente, deja la casilla **vacía con su motivo y un aviso** — no duplica
  a nadie en silencio ni lanza un error.
- Respeta las **restricciones de cada persona**: qué responsabilidades puede recibir (para quien
  solo puede estar sentado en el auditorio, o para quien no cubre los pasillos) y qué días puede
  servir (para quien no puede los sábados).
- Puede aplicar la **regla de capitanes**: el equipo al que le toca el aseo un día pone también,
  de entre sus capitanes y auxiliares, a quien cubre las responsabilidades que se decidan en
  Ajustes. Es configurable, no está escrita en el código.
- Se puede repartir **a mano**: vaciar el mes o empezarlo en blanco y asignarlo casilla a casilla,
  con un panel que va contando cuántas lleva cada persona y quién sigue sin ninguna.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # y rellena los valores de Firebase
npm run dev
```

Antes del primer arranque hace falta un proyecto de Firebase configurado. La guía
[`docs/FIREBASE.md`](docs/FIREBASE.md) lo lleva paso a paso, con el nombre literal de cada botón
de la consola y el valor exacto a introducir. Si algún paso te obliga a adivinar, la guía está mal
y hay que corregirla.

Para cargar los datos iniciales (responsabilidades, personas, grupos, equipos y el agosto
histórico):

```bash
npm run seed
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Toda la suite: dominio, invariantes, PDF, esquemas y frontera de arquitectura |
| `npm run test:watch` | Tests en modo continuo |
| `npm run lint` | ESLint sobre todo el proyecto |
| `npm run build` | Compila TypeScript y genera `dist/` |
| `npm run seed` | Carga los datos iniciales en Firestore |
| `npm run pdf:preview` | Genera un PDF de muestra en `dist-preview/` sin abrir la aplicación |
| `npm run pdf:png` | Convierte ese PDF a PNG para poder **mirarlo** al ajustar la maqueta |

Los dos últimos merecen una nota. Ajustar un PDF a ciegas, sin verlo, es adivinar: `pdf:png`
existe porque durante el desarrollo hubo dos defectos visuales —etiquetas de cabecera cortadas e
iconos rellenos de negro macizo— que **ningún test detectaba** y que solo aparecieron al mirar la
página renderizada.

## Cómo está organizado

Cinco capas, con una frontera que se hace cumplir de verdad:

```
src/pages/ · src/components/   Interfaz. Puede importar de cualquier capa.
src/services/                  Orquestación: el ÚNICO sitio que combina datos + dominio + PDF.
src/pdf/                       Presentación en PDF. Conoce los tipos del dominio, nada de Firebase.
src/data/                      ÚNICO lugar que importa `firebase/*`.
src/domain/                    PURO. Solo puede importar de sí mismo y de `date-fns`.
```

`src/domain/` es una función pura que recibe datos planos: no sabe si vienen de Firestore, de un
JSON de test o de otra base de datos. Esa frontera la vigilan **una regla de ESLint y un test**
que recorre los imports del directorio, porque una regla de lint se puede desactivar sin que nadie
se entere.

Documentación normativa —si el código y estos documentos discrepan, uno de los dos está mal y hay
que resolverlo, no ajustar el documento después:

- [`docs/arquitectura.md`](docs/arquitectura.md) — capas, contratos y modelo de datos en Firestore.
- [`docs/algoritmo.md`](docs/algoritmo.md) — el algoritmo de reparto paso a paso, la función de
  coste y las invariantes.
- [`docs/FIREBASE.md`](docs/FIREBASE.md) — configurar Firebase desde cero.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — publicar en GitHub Pages.

## Fechas: por qué no hay ni un `Date` en el dominio

Todo el dominio trabaja con `PlainDate = { y, m, d }` y su forma serializada `"YYYY-MM-DD"`.
Nunca un `Date` de JavaScript con hora, y nunca un `Timestamp` de Firestore para las fechas del
programa.

Un `Timestamp` es un instante en UTC: convertiría «sábado 1» en «viernes 31» según el huso horario
del dispositivo que abra la aplicación. Como el programa se consulta desde varios dispositivos,
ese error aparecería solo en algunos y sería casi imposible de reproducir.

## Seguridad

- Las seis variables `VITE_FIREBASE_*` **son públicas por diseño**: viajan dentro del bundle y
  cualquiera puede leerlas desde el navegador. Ocultarlas no protege nada. Quien protege los datos
  es [`firestore.rules`](firestore.rules) junto con Firebase Auth: sin sesión iniciada no se lee
  ni un byte.
- La clave de cuenta de servicio (`firebase-service-account.json`, que usa el script de carga
  inicial) **sí es un secreto de verdad**. Está en `.gitignore` y no debe salir nunca del equipo.
  Si alguna vez llega a un repositorio público, hay que revocarla de inmediato en
  Firebase → Configuración del proyecto → Cuentas de servicio.
- El sitio es público aunque los datos no lo sean: cualquiera puede abrir la URL y ver la pantalla
  de inicio de sesión.
- El acceso es una cuenta compartida, así que **no queda constancia de quién editó qué**. Si algún
  día hace falta, el salto a cuentas individuales es directo —Auth ya está puesto— y solo añade un
  campo `updatedBy`.

## Despliegue

Cada `push` a `main` ejecuta las pruebas, compila y publica en GitHub Pages. El build **falla a
propósito si las pruebas no pasan**: no se publica un programa mal repartido.

El detalle está en [`docs/DEPLOY.md`](docs/DEPLOY.md), incluidos los dos fallos que se comen a
todo el mundo la primera vez: el `base` de Vite mal puesto (la página carga en blanco, sin ningún
error visible) y el dominio de GitHub Pages sin autorizar en Firebase Auth (el inicio de sesión
funciona en local y falla en producción).
