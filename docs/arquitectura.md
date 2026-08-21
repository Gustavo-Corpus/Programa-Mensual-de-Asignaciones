# Arquitectura y contratos del dominio

Documento normativo. Si el código y este documento discrepan, uno de los dos está mal y hay que
resolverlo antes de seguir — no se "arregla" el documento a posteriori para que encaje.

---

## 1. Capas y frontera

```
src/pages/ · src/components/     UI. Puede importar todo.
src/services/                    Orquestación: el ÚNICO sitio que combina data + domain + pdf.
src/pdf/                         Presentación en PDF. Importa tipos del dominio. Nada de Firebase.
src/data/                        ÚNICO lugar que importa `firebase/*`. Traduce Firestore ⇄ dominio.
src/domain/                      PURO. Solo puede importar de sí mismo y de `date-fns`.
```

### Por qué existe `src/services/`

Las tres capas de abajo se ignoran deliberadamente entre sí: `data` no sabe de
reglas de negocio, `domain` no sabe de Firestore y `pdf` no sabe de ninguna de
las dos. Alguien tiene que unirlas —cargar el catálogo, pedir el historial,
generar, guardar, componer el modelo del PDF— y ese alguien vive en un módulo
propio y no repartido por los componentes de React.

La diferencia es práctica: la secuencia completa de "generar un mes" se lee de
un vistazo en `programService.ts`, y no depende de en qué orden monte React sus
pantallas ni de qué componente llame a qué. Cuando mañana la misma operación
haga falta desde otro sitio —un botón de la lista de meses, una regeneración
masiva— no hay que extraerla de dentro de un `useEffect`.

`src/domain/` no importa React, ni Firebase, ni nada de `src/data`. Se hace cumplir con
`eslint.config.js` (`no-restricted-imports`) **y** con `tests/architecture/domain-boundary.test.ts`,
que recorre los imports reales. La regla de lint sola no basta: se puede silenciar con un
comentario y nadie se entera.

**Por qué importa:** el algoritmo tiene que ser ejecutable en un test con datos literales, sin
navegador y sin red. Esa es la única forma de probar en serio las invariantes.

## 2. Reglas transversales

- **Nada hardcodeado.** Ni nombres de personas, ni de grupos, ni de responsabilidades, ni
  cantidades. Todo sale de datos. Buscar `"Aseo"` o `"Hospitalidad"` en `src/domain/` debe dar
  cero resultados.
- **Sin `Math.random` ni `Date.now()` en `src/domain/`.** El azar entra solo por el parámetro
  `seed`. El "hoy" se inyecta si alguna vez hace falta.
- **Idioma:** identificadores y comentarios del código en inglés; todo el texto visible al
  usuario, en español.

---

## 3. Fechas: el tipo `PlainDate`

El fallo clásico de este tipo de aplicación es que "sábado 1" se convierta en "viernes 31" al
cruzar un huso horario. Se elimina de raíz no usando nunca un instante.

```ts
/** Fecha civil sin hora ni zona. `m` es 1-12 (enero = 1), NO el 0-11 de Date. */
export interface PlainDate { readonly y: number; readonly m: number; readonly d: number }

/** Forma serializada y ordenable: "2026-08-03". Comparar con `<` da orden cronológico. */
export type IsoDate = string;
```

Reglas:

- `src/domain/` **nunca** manipula un `Date` de JS fuera de `dates.ts`, y cuando lo hace es un
  `Date` local construido con `new Date(y, m - 1, d)` y consumido en el acto.
- Firestore guarda las fechas como **cadena `IsoDate`**, nunca como `Timestamp`. Un `Timestamp` es
  un instante UTC y reintroduce el problema.
- El día de la semana usa la convención de `Date.prototype.getDay()`: **0 = domingo … 1 = lunes …
  6 = sábado**. No se inventa otra numeración.

API mínima de `src/domain/dates.ts`:

```ts
export function toIso(date: PlainDate): IsoDate;
export function fromIso(iso: IsoDate): PlainDate;
export function dayOfWeek(date: PlainDate): number;          // 0-6, convención getDay()
export function daysBetween(a: IsoDate, b: IsoDate): number; // b - a, en días completos
export function datesOfMonthMatching(year: number, month: number, daysOfWeek: readonly number[]): PlainDate[];
export function isoWeekKey(date: PlainDate): string;          // "2026-W32" (utilidad; el PDF ya no agrupa por semana ISO)
export function monthKey(year: number, month: number): string; // "2026-08"
export function addMonths(year: number, month: number, delta: number): { year: number; month: number };
export const MONTH_NAMES_ES: readonly string[];               // ["enero", ... "diciembre"]
export const DAY_NAMES_ES: readonly string[];                 // ["domingo", ... "sábado"]
```

`datesOfMonthMatching` devuelve los días del mes cuyo `getDay()` está en `daysOfWeek`, en orden
ascendente. **No conoce lunes ni sábados**: recibe los días que le pidan.

---

## 4. Catálogo

```ts
export type AssignmentKind = 'PERSON' | 'GROUP';

export interface AssignmentType {
  readonly id: string;
  /** Clave estable usada en el historial. No cambia aunque se renombre la etiqueta. */
  readonly key: string;          // p.ej. 'acomodador_entrada'
  readonly label: string;        // p.ej. 'Acomodador de entrada'  (visible al usuario)
  readonly kind: AssignmentKind;
  readonly daysOfWeek: readonly number[]; // convención getDay(): [1, 6] = lunes y sábado
  readonly slotsPerDate: number; // 1 en los seis tipos por defecto (un equipo cubre Aseo entero)
  readonly order: number;        // orden de columnas en la UI y el PDF
  readonly icon: IconName;       // icono de la cabecera de columna
  readonly active: boolean;
}

/**
 * Iconos disponibles. Ampliar aquí y en `pdf/icons.tsx` a la vez.
 *
 * La LISTA es la fuente de verdad y el tipo se DERIVA de ella, no al revés:
 * la pantalla de responsabilidades y el esquema de Zod leen `ICON_NAMES`, de
 * modo que el compilador garantiza que las opciones ofrecidas y el tipo no
 * puedan separarse nunca.
 */
export const ICON_NAMES = [
  'calendar', 'person', 'arrow-left', 'arrow-right',
  'broom', 'hands-heart', 'people', 'dot',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
```

El icono es **un dato de la responsabilidad**, no una decisión del PDF. Si no lo fuera, `pdf/`
acabaría con un `if (typeKey === 'aseo') return <Broom/>`, y añadir una responsabilidad nueva
obligaría a tocar código de presentación. `'dot'` es el icono neutro por defecto para una
responsabilidad creada por el administrador.

```ts

/**
 * Papel dentro del grupo de aseo. La LISTA es la fuente de verdad y el tipo se
 * deriva de ella, igual que con ICON_NAMES.
 */
export const GROUP_ROLES = ['CAPTAIN', 'ASSISTANT', 'MEMBER'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;

  /** Grupo de aseo al que pertenece, o null. Solo se usa para la regla de capitanes. */
  readonly groupId: string | null;
  readonly role: GroupRole;

  /**
   * Responsabilidades que PUEDE recibir, por `key`. `null` = sin restricción;
   * `[]` = ninguna. Son estados distintos y la diferencia importa.
   */
  readonly allowedTypeKeys: readonly string[] | null;

  /** Días en los que NO puede servir, convención getDay(). */
  readonly blockedDaysOfWeek: readonly number[];
}

/** Un grupo suelto. Pertenece a un equipo. Nunca se asigna por sí solo. */
export interface Group {
  readonly id: string;
  readonly name: string;        // "1", "2"… o "Norte" — lo que el administrador quiera
  readonly teamId: string;
  readonly order: number;
  readonly active: boolean;
}

/** La unidad ASIGNABLE de tipo GROUP. Los grupos sirven siempre emparejados. */
export interface Team {
  readonly id: string;
  /** Si es null, la etiqueta se compone con los nombres de sus grupos activos. */
  readonly displayName: string | null;
  readonly order: number;
  readonly active: boolean;
}
```

### Restricciones por persona: por qué así

Los tres vetos que existen —"solo puede el auditorio", "no puede pasillos", "no puede sábados"— son
**un solo mecanismo**: qué responsabilidades y qué días admite cada persona. Modelarlos como tres
banderas (`esMayor`, `puedePasillo`, `sinSabados`) habría metido en el dominio nombres de
responsabilidades concretas y habría obligado a tocar código cada vez que aparece un caso nuevo.

Se guardan **claves de tipo**, no ids: una responsabilidad puede cambiar de etiqueta sin que las
restricciones dejen de apuntar a donde apuntaban.

De los días se guarda la lista de **bloqueados** y no la de permitidos. Así, añadir un día nuevo al
programa no excluye en silencio a quien nunca dijo nada al respecto — que es justo lo que pasaría
con una lista de permitidos escrita antes de que ese día existiera.

`groupId` y `role` son datos del catálogo, no de la generación: existen para que la regla de
capitanes pueda componer la reserva de un día, y no significan nada si esa regla está apagada.

### Por qué el equipo, y no el grupo, es la unidad asignable

La hoja de referencia empareja los grupos **siempre igual** — 1 y 5, 2 y 6, 3 y 7, 4 y 8 — en las
trece asignaciones, sin una sola excepción. No es una coincidencia estadística: los grupos están
organizados en parejas estables.

Modelarlo así simplifica todo. El equipo se comporta exactamente igual que una persona: una
entidad, una casilla, `slotsPerDate = 1`. Desaparecen la puntuación de combinaciones, el filtro de
"los dos grupos de una casilla deben ser distintos" y toda la aritmética de parejas.

La etiqueta que se muestra se compone en la capa de presentación, nunca en el dominio:

```ts
// src/domain/teams.ts
export function teamLabel(team: Team, groups: readonly Group[]): string {
  if (team.displayName) return team.displayName;
  return groups.filter(g => g.teamId === team.id && g.active)
               .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
               .map(g => g.name)
               .join(' y ');
}
```

Junto a ella vive `teamDisplayText()`, que devuelve el texto **completo** que se muestra:
`"Grupos 1 y 5"`, o el nombre propio del equipo sin prefijo si lo tiene.

**Lo que se denormaliza en un programa guardado es `teamDisplayText`, no `teamLabel`.** Guardar
`"1 y 5"` perdería la diferencia entre una etiqueta compuesta automáticamente y un nombre elegido
a mano, y al reimprimir un programa antiguo no habría forma de saber si toca anteponer "Grupos".
La denormalización existe para conservar lo que se imprimió, así que guarda exactamente eso. Si el administrador pone `displayName = "Equipo Norte"`, se muestra eso.
Nada de esto está escrito en `src/domain/scoring`: el algoritmo solo ve identificadores.

Un equipo con un grupo desactivado sigue funcionando y muestra un solo nombre. Un equipo puede
tener tres grupos si algún día hace falta: nada en el modelo lo impide.

`key` y `label` están separados a propósito: el historial se cuenta por `key`, así que renombrar
"Pasillo izquierdo" a "Pasillo lateral" no borra el historial de nadie.

**Las fechas del programa se derivan de `daysOfWeek` de los tipos activos**, no de una constante.
Con la semilla por defecto (`[1, 6]` en los seis tipos) salen exactamente los lunes y sábados que
pide `CLAUDE.md`; si mañana se añade una responsabilidad en domingo, aparecen los domingos sin
tocar código.

---

## 5. Entrada y salida de `generateProgram`

```ts
export interface HistoricalAssignment {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly kind: AssignmentKind;
  readonly personId: string | null;
  readonly teamId: string | null;
}

export interface LockedAssignment {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly personId: string | null;
  readonly teamId: string | null;
}

export interface GenerationSettings {
  /** Meses de historial a considerar. 0 = todo el historial. */
  readonly historyWindowMonths: number;
  readonly allowMultiplePerDay: boolean;
  readonly allowTeamTwiceSameDate: boolean;
  readonly runRepairPass: boolean;
  readonly maxRepairIterations: number;   // por defecto 200
  readonly captainRule: CaptainRuleSettings;
}

/**
 * "El equipo que limpia ese día pone también a quien recibe en la puerta."
 *
 * Se expresa con CLAVES DE TIPO, no con las palabras "aseo" o "acomodador":
 * el administrador elige qué responsabilidad de equipo manda y qué
 * responsabilidades individuales cubre su reserva. Ver algoritmo.md, paso 6.
 */
export interface CaptainRuleSettings {
  readonly enabled: boolean;
  /** `key` del tipo GROUP cuyo equipo del día define la reserva. '' = sin definir. */
  readonly sourceTypeKey: string;
  /** `key` de los tipos PERSON que deben cubrirse desde esa reserva. */
  readonly targetTypeKeys: readonly string[];
}

export interface GenerateInput {
  readonly year: number;
  readonly month: number;                 // 1-12
  readonly people: readonly Person[];
  readonly teams: readonly Team[];
  readonly groups: readonly Group[];
  readonly assignmentTypes: readonly AssignmentType[];
  readonly previousAssignments: readonly HistoricalAssignment[];
  readonly lockedAssignments: readonly LockedAssignment[];
  readonly settings: GenerationSettings;
  readonly seed: number;
}
```

`GenerateInput` **sí recibe `groups`**, y no siempre fue así. Durante toda la primera versión no los
recibía, con este argumento: el algoritmo no necesita saber de qué grupos se compone un equipo,
igual que no necesita saber el nombre de una persona.

La regla de capitanes lo cambió. Una persona pertenece a un **grupo**, y lo que se asigna es un
**equipo**; los grupos son el único puente entre ambos, así que sin ellos no hay forma de saber
quién está de servicio el día que limpia el equipo 1 y 5. Siguen sin usarse para etiquetar nada
dentro del dominio: eso sigue siendo cosa de `domain/teams.ts` y de la presentación.

```ts
export type UnfilledReason =
  | 'NO_ACTIVE_PEOPLE' | 'NO_ACTIVE_TEAMS' | 'NO_ELIGIBLE_CANDIDATE'
  /** Vaciada a propósito por el administrador (modo manual). El generador nunca la produce. */
  | 'MANUALLY_CLEARED';

export interface ProgramDateOut {
  readonly date: IsoDate;
  readonly dayOfWeek: number;
  readonly order: number;
}

export interface ResolvedAssignment {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly kind: AssignmentKind;
  readonly personId: string | null;
  readonly teamId: string | null;
  readonly locked: boolean;
  readonly unfilledReason: UnfilledReason | null;
}

export type WarningCode =
  | 'NO_ACTIVE_PEOPLE' | 'NO_ACTIVE_TEAMS'
  | 'CAP_RELAXED' | 'SLOT_UNFILLED'
  | 'LOCKED_INACTIVE_PERSON' | 'LOCKED_INACTIVE_TEAM' | 'LOCKED_DUPLICATE_SAME_DAY'
  /** La reserva de capitanes del día no pudo cubrir la casilla; se cubrió con otra persona. */
  | 'CAPTAIN_RULE_UNMET';

export interface Warning {
  readonly code: WarningCode;
  /** Mensaje ya redactado en español, listo para mostrar. */
  readonly message: string;
  readonly date?: IsoDate;
  readonly typeKey?: string;
  readonly personId?: string;
  readonly teamId?: string;
}

export interface GenerateOutput {
  readonly dates: readonly ProgramDateOut[];
  readonly assignments: readonly ResolvedAssignment[];
  readonly warnings: readonly Warning[];
  readonly stats: Stats;
  readonly trace: GenerationTrace;
}
```

Los avisos traen su `message` ya redactado en español: la lógica sabe *por qué* pasó algo y la UI
no debería tener que reconstruirlo con un `switch`. El `code` está para filtrar y para los tests.

### Estadísticas

```ts
export interface LoadTarget { readonly base: number; readonly remainder: number; readonly cap: number }

export interface EntityStat {
  readonly id: string;
  readonly monthCount: number;
  readonly byType: Readonly<Record<string, number>>;  // typeKey -> veces este mes
  readonly historyCount: number;                       // dentro de la ventana
}

export interface Stats {
  readonly personSlots: number;
  readonly teamSlots: number;
  readonly personTarget: LoadTarget;
  readonly teamTarget: LoadTarget;
  readonly people: readonly EntityStat[];
  readonly teams: readonly EntityStat[];
  readonly balance: { readonly min: number; readonly max: number; readonly spread: number };
}
```

### Traza de explicación

Es lo que sostiene el requisito de que el algoritmo sea **explicable**, no solo funcional. Se
guarda en un documento aparte de Firestore y alimenta el popover "¿Por qué?" de cada celda.

```ts
export type CostTuple = readonly number[];

export type RejectionReason =
  | 'INACTIVE'
  | 'DAY_BLOCKED'          // no sirve ese día de la semana
  | 'TYPE_NOT_ALLOWED'     // esa responsabilidad no está entre las suyas
  | 'NOT_IN_CAPTAIN_POOL'  // la regla de capitanes gobierna la casilla y no está en la reserva
  | 'ALREADY_ASSIGNED_THIS_DATE'
  | 'AT_CAP';

export interface CandidateTrace { readonly id: string; readonly cost: CostTuple }
export interface RejectionTrace { readonly id: string; readonly reason: RejectionReason }

export interface SlotTrace {
  readonly date: IsoDate;
  readonly typeKey: string;
  readonly slotIndex: number;
  readonly outcome: 'LOCKED' | 'CHOSEN' | 'UNFILLED';
  readonly chosenId: string | null;
  readonly chosenCost: CostTuple | null;
  readonly runnersUp: readonly CandidateTrace[];   // hasta 3
  readonly rejected: readonly RejectionTrace[];    // hasta 5
  readonly capRelaxedTo: number | null;
  /** true si el pase de mejora cambió esta casilla después del voraz. */
  readonly changedByRepair: boolean;
}

export interface GenerationTrace {
  readonly seed: number;
  /** Etiquetas en español de cada componente de la tupla, en orden. */
  readonly costLabelsPerson: readonly string[];
  readonly costLabelsTeam: readonly string[];
  readonly slots: readonly SlotTrace[];
}
```

`costLabelsPerson` viaja con la traza para que la UI pueda pintar la tupla con nombres legibles
sin duplicar el conocimiento de qué significa cada posición. Si mañana se añade un criterio, la UI
se entera sola.

---

## 6. Responsabilidad de cada módulo

| Módulo | Hace | No hace |
|---|---|---|
| `domain/dates.ts` | Aritmética de fechas civiles, días del mes que casan, semana ISO | No sabe qué es un lunes ni una asignación |
| `domain/rng.ts` | `stableHash` determinista | No genera azar real |
| `domain/slots.ts` | Construye la lista canónica de slots y su orden | No elige a nadie |
| `domain/eligibility.ts` | Quién PUEDE ocupar qué: día, responsabilidad y reserva de capitanes | No mira contadores ni decide quién conviene |
| `domain/scoring.ts` | Filtros duros y tupla de coste de **personas** | No muta estado |
| `domain/teamScoring.ts` | Filtros duros y tupla de coste de **equipos** | No muta estado |
| `domain/teams.ts` | `teamLabel()` — compone la etiqueta a partir de los grupos | No decide asignaciones |
| `domain/generateProgram.ts` | Orquesta: slots → bloqueos → topes → asignación → avisos | No calcula costes a mano |
| `domain/repair.ts` | Pase de mejora local acotado y determinista | No cambia bloqueos ni cargas |
| `domain/emptyProgram.ts` | El mes en blanco del modo manual: mismas fechas y casillas, sin ocupantes | No elige a nadie |
| `domain/stats.ts` | `computeLoadTarget` (la meta de carga) y los conteos de una salida | No decide nada |
| `domain/historyStats.ts` | Resumen de VARIOS meses para la pantalla de estadísticas | No lee de ningún sitio |
| `data/*.repo.ts` | Leer/escribir Firestore, validar con Zod | No contiene reglas de negocio |
| `services/programService.ts` | Generar, guardar, editar, bloquear, vaciar y contar un mes | No maqueta ni consulta Firestore directamente |
| `services/catalogoService.ts` | Reglas del catálogo: clave inmutable, equipos mal formados, huérfanos | No escribe en Firestore |
| `services/estadisticasService.ts` | Une la ventana de historial con `historyStats` | No calcula nada por su cuenta |
| `pdf/buildPdfModel.ts` | Traducir dominio → modelo de vista (texto ya compuesto y partido en líneas) | No maqueta ni mide |
| `pdf/layout.ts` | Repartir el alto de la hoja carta entre las fechas del mes; de ahí salen el alto de fila y el cuerpo de los nombres | No conoce el dominio ni `@react-pdf/renderer` |
| `pdf/ProgramDocument.tsx` | Pintar el documento con lo que le dan `buildPdfModel` y `layout` | No decide asignaciones |

`computeLoadTarget` vive en `domain/stats.ts` y no dentro de `generateProgram.ts` porque la
pantalla de estadísticas necesita **exactamente** la misma fórmula para decir si alguien va corto
o pasado. Con dos copias, la pantalla y el algoritmo acabarían discrepando y sería la pantalla la
que mentiría.

`scoring.ts` y `groupScoring.ts` son funciones puras sin estado: reciben los contadores ya
calculados y devuelven la tupla. Así se pueden probar aisladamente con contadores literales, que
es la única forma de verificar que el orden de los criterios es el que dice el documento.

`eligibility.ts` está separado de `scoring.ts` porque responde a otra pregunta. `scoring` dice a
quién **conviene** poner; `eligibility` dice quién **puede** estar ahí. Y sobre todo: sus
predicados los usan tres sitios distintos —el paso 6, el pase de mejora del paso 8 y la interfaz,
que marca en rojo las casillas incoherentes—. Si cada uno decidiera por su cuenta qué es "apto", la
pantalla acabaría marcando en rojo casillas que el propio algoritmo generó.

### Modo manual

Vaciar el mes y repartirlo a mano **no es un modo aparte**. `buildEmptyProgram` produce
exactamente lo mismo que el generador —las mismas fechas y las mismas casillas— menos las
decisiones, y `aplicarVaciado` deja un programa existente en ese estado conservando lo bloqueado.
A partir de ahí, todo lo que ya funcionaba (editar, bloquear, avisar de duplicados, imprimir,
contar para el historial) sigue funcionando sin enterarse de por dónde llegó el mes.

El candado sobrevive al vaciado por coherencia con lo que ya significa en todas partes: "esto lo he
decidido yo, no me lo toques". Borrarlo también dejaría al administrador sin lo único que había
marcado explícitamente como suyo.

`resumenReparto` cuenta sobre el **programa guardado**, no sobre `GenerateOutput.stats`: en modo
manual no hay ninguna generación de la que sacar estadísticas, y tras editar a mano las cifras del
generador dejarían de describir lo que hay en la tabla.

---

## 7. Canonicalización de la entrada

Antes de nada, `generateProgram` ordena sus entradas. **El resultado no puede depender del orden
en que Firestore devolvió los documentos.**

- `people` por `id` ascendente
- `teams` por `(order, id)` ascendente
- `groups` no se reordena: solo se consultan por `teamId`, nunca se recorren en orden
- `assignmentTypes` por `(order, key)` ascendente
- `previousAssignments` por `(date, typeKey, personId ?? groupId ?? '')`
- `lockedAssignments` por `(date, typeKey, slotIndex)`

Hay un test que genera la misma entrada con los arrays barajados y exige salida idéntica.

---

## 8. Modelo en Firestore

```
assignmentTypes/{typeId}   AssignmentType (sin `id`, que es el del documento)
people/{personId}          { name, active, notes?, createdAt }
teams/{teamId}             { displayName, order, active }
groups/{groupId}           { name, teamId, order, active }
settings/app               GenerationSettings
programs/{YYYY-MM}         documento agregado (abajo)
programs/{YYYY-MM}/meta/trace   GenerationTrace
```

**El programa es un agregado**: un mes entero (≈62 asignaciones) cabe de sobra en el límite de
1 MiB de un documento. Ventajas: una sola lectura por mes, escritura atómica y sin estados a
medias.

```ts
// programs/{YYYY-MM}
{
  year: number, month: number,
  status: 'DRAFT' | 'PUBLISHED',
  seed: number,
  settingsSnapshot: GenerationSettings,   // los ajustes usados AL generar, no los actuales
  warnings: Warning[],
  createdAt: Timestamp, updatedAt: Timestamp,
  dates: Array<{
    date: IsoDate, dayOfWeek: number, order: number,
    assignments: Array<{
      typeKey: string, slotIndex: number, kind: AssignmentKind,
      personId: string | null, personName: string | null,   // nombre DENORMALIZADO
      teamId:   string | null, teamLabel:  string | null,   // etiqueta DENORMALIZADA ("1 y 5")
      locked: boolean, unfilledReason: UnfilledReason | null
    }>
  }>
}
```

Cuatro decisiones y su razón:

1. **ID de documento `YYYY-MM`** (mes con cero a la izquierda). Da unicidad por mes sin
   *constraint*, y como el orden lexicográfico coincide con el cronológico, la ventana de
   historial se consulta con un rango sobre el ID (`>= '2026-02'`, `<= '2026-07'`) sin necesidad
   de índice compuesto.
2. **Nombre y etiqueta denormalizados** junto al `id`. Si se renombra a alguien, se cambia un grupo
   de equipo o se desactiva un grupo, los programas pasados siguen mostrando lo que realmente se
   imprimió. El `id` se conserva para los conteos.
3. **`personId`/`teamId` nulos son deliberados**: representan una casilla que no se pudo cubrir,
   con `unfilledReason`. Es la diferencia entre "el sistema falló" y "no hay gente suficiente".
4. **`settingsSnapshot`**: un programa se reproduce con los ajustes que tenía cuando se generó. Si
   se guardara solo el `seed`, cambiar un ajuste global rompería la reproducibilidad de todos los
   meses anteriores.

Las personas, los grupos y los equipos **nunca se borran**: `active = false`. Firestore no tiene
claves foráneas y los programas históricos deben seguir siendo legibles.

### Un programa guardado se muestra tal y como se guardó

Las fechas se derivan del calendario **solo al generar un mes nuevo**. Al abrir un programa
existente, la UI y el PDF pintan exactamente las fechas y asignaciones almacenadas, sin
recalcular ni completar nada.

Esto no es un detalle menor. La hoja de referencia de agosto no incluye el sábado 1, aunque ese
día cae en sábado: en la vida real se salta una fecha por una asamblea, una limpieza especial o
cualquier otro motivo. Si al abrir un programa la aplicación "arreglara" las fechas ausentes,
estaría reescribiendo un historial que ya se imprimió y se repartió.

El usuario puede añadir o quitar fechas a mano en el editor. Regenerar el mes sí vuelve a derivar
las fechas del calendario, y eso es explícito y voluntario.

## 9. Validación en la frontera

Todo lo que sale de Firestore pasa por un esquema Zod en `src/data/schemas.ts` antes de
convertirse en un tipo del dominio. Un documento corrupto debe dar un error claro en el punto de
lectura, no un `undefined` que viaja hasta el generador de PDF y revienta ahí.
