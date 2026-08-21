# Algoritmo de distribución — especificación

Documento normativo. La implementación se hace **contra este documento**, no contra una
interpretación de él. Cada número y cada orden de criterios está aquí por una razón que se explica
en el texto; si algo parece arbitrario, es un error del documento y hay que señalarlo.

Tipos en [`arquitectura.md`](./arquitectura.md).

```ts
export function generateProgram(input: GenerateInput): GenerateOutput;
```

Función **pura**: sin `Math.random`, sin `Date.now()`, sin E/S. Misma entrada + mismo `seed` ⇒
salida idéntica, siempre.

---

## Constantes

```ts
const NEVER_DAYS = 3650;   // "nunca lo ha hecho" ≡ hace 10 años. Tope de daysSince.
const W_LOAD = 100;        // pesos del pase de mejora
const W_TYPE = 10;
const W_ADJ  = 1;
const MAX_RUNNERS_UP = 3;
const MAX_REJECTIONS_TRACED = 5;
```

`NEVER_DAYS` es un tope, no un infinito: mantiene las tuplas comparables como números y evita que
`-Infinity` contamine sumas. 3650 supera cualquier ventana de historial realista.

---

## Paso 0 · Canonicalizar

Ordenar las entradas como indica `arquitectura.md` §7. El resultado no puede depender del orden en
que Firestore devolvió los documentos.

## Paso 1 · Fechas del mes

```
activeTypes  = assignmentTypes.filter(t => t.active)
daysNeeded   = unión ordenada de t.daysOfWeek de activeTypes
dates        = datesOfMonthMatching(year, month, daysNeeded)   // ascendente
```

**Las fechas se derivan de los tipos, no de una constante.** Con la semilla por defecto
(`daysOfWeek = [1, 6]`) salen exactamente los lunes y sábados del mes, sean 4 o 5 de cada uno, sin
que el código sepa qué es un lunes.

Si `dates` está vacío se devuelve un programa vacío con un aviso. No es un error.

## Paso 2 · Slots

Para cada `date`, cada `type` de `activeTypes` cuyo `daysOfWeek` incluya `dayOfWeek(date)`, y cada
`slotIndex` de `0` a `type.slotsPerDate - 1`, se crea un slot.

**Orden canónico** — es la columna vertebral de la reproducibilidad:

```
1º  date ascendente
2º  type.order ascendente (desempate: type.key)
3º  slotIndex ascendente
```

Hospitalidad solo tiene `daysOfWeek = [6]`, así que la invariante "hospitalidad solo en sábados"
sale del modelo de datos, no de un `if`. Nadie tiene que acordarse de mantenerla.

## Paso 3 · Aplicar bloqueos

Cada `lockedAssignment` que corresponda a un slot existente lo ocupa y lo marca inamovible.

- Los ocupantes bloqueados **cuentan en todos los contadores** (mes, tipo, historial). Si no
  contaran, el equilibrio se calcularía sobre una realidad falsa.
- Un bloqueo sobre una persona o equipo inactivo **se respeta** y emite `LOCKED_INACTIVE_PERSON` /
  `LOCKED_INACTIVE_TEAM`. Bloquear es una decisión explícita del administrador; el sistema avisa,
  no la revoca.
- Dos bloqueos que pongan a la misma persona dos veces el mismo día se respetan y emiten
  `LOCKED_DUPLICATE_SAME_DAY`. Mismo criterio.
- Un bloqueo que no case con ningún slot (porque cambió el catálogo) se ignora en silencio: el slot
  ya no existe.

## Paso 4 · Contadores

Ventana de historial:

```
si settings.historyWindowMonths === 0  →  todo previousAssignments
si no  →  windowStart = toIso(primer día de addMonths(year, month, -historyWindowMonths))
          se conservan los que cumplan  date >= windowStart  y  date < toIso(primer día del mes generado)
```

La comparación es de cadenas `IsoDate`, que ya es cronológica.

De ahí se precalculan, **por persona**:

| Contador | Contenido |
|---|---|
| `histCount[p]` | asignaciones en la ventana |
| `histTypeCount[p][k]` | asignaciones de la responsabilidad `k` en la ventana |
| `histLastDate[p]` | fecha más reciente en la ventana, o `null` |
| `histLastTypeDate[p][k]` | fecha más reciente de `k` en la ventana, o `null` |

Y los mismos cuatro **por equipo**. Durante la generación se mantienen además, mutables:
`monthCount`, `monthTypeCount`, `assignedDates` (conjunto de fechas ya ocupadas por esa persona) y
`lastAssignedDate` (máximo entre historial y mes en curso).

`daysSince` se mide **respecto a la fecha del slot que se está rellenando**:

```
daysSince(last, slotDate) = last === null ? NEVER_DAYS
                          : min(daysBetween(last, slotDate), NEVER_DAYS)
```

## Paso 5 · Meta de carga — aquí muere el "2" hardcodeado

```
personSlots  = nº de slots con kind === 'PERSON'
activePeople = people.filter(p => p.active)

base      = floor(personSlots / activePeople.length)
remainder = personSlots % activePeople.length
cap       = base + (remainder > 0 ? 1 : 0)
```

Idéntico para los equipos con `teamSlots` y `activeTeams`.

Implementado como `computeLoadTarget` en `src/domain/stats.ts` —y no dentro de
`generateProgram.ts`— porque la pantalla de estadísticas usa la misma función para decir quién va
corto o pasado. Con `activeCount === 0` devuelve ceros en vez de dividir entre cero: un `NaN` aquí
llegaría hasta la interfaz sin que nada lo detuviese.

`CLAUDE.md` pide "≈2 veces al mes". Ese 2 **no se escribe en ninguna parte**: emerge del cociente.

| Situación | base | resto | cap | Reparto |
|---|---|---|---|---|
| 36 slots, 18 personas | 2 | 0 | **2** | todos exactamente 2 |
| 36 slots, **19 personas** (hoja real) | 1 | 17 | 2 | 17 con 2, 2 con 1 |
| 36 slots, 10 personas | 3 | 6 | 4 | 6 con 4, 4 con 3 |
| 13 slots de equipo, 4 equipos | 3 | 1 | 4 | 1 con 4, 3 con 3 |

Las dos filas que corresponden a la hoja de referencia (36/19 personas y 13/4 equipos) reproducen
**exactamente** el reparto real de agosto: 17 personas con 2 asignaciones y 2 con 1; el equipo
"4 y 8" con 4 y los otros tres con 3. La fórmula no se ajustó para que cuadrara — cuadró sola.

Cuando el reparto es exacto, `cap = base`: nadie puede salir 3 veces mientras otro sale 1. Esa es
la regla "0-1 = prioridad alta, 2 = ideal, 3+ = evitar" expresada como una restricción dura en vez
de como una preferencia que se puede ignorar.

Si `activePeople.length === 0`, todos los slots de persona quedan vacíos con `NO_ACTIVE_PEOPLE` y
un aviso. Sin excepciones ni divisiones por cero.

## Paso 6 · Elegir persona — filtros y coste

Se recorren los slots de persona **en orden canónico**, y **después** de haber resuelto todos los
slots de equipo (ver el orden de pasadas más abajo).

### Filtros duros (en este orden; el primero que falla es el que se registra en la traza)

| # | Condición para descartar | `RejectionReason` |
|---|---|---|
| 1 | `!person.active` | `INACTIVE` |
| 2 | `person.blockedDaysOfWeek.includes(dayOfWeek(D))` | `DAY_BLOCKED` |
| 3 | `person.allowedTypeKeys !== null && !person.allowedTypeKeys.includes(T.key)` | `TYPE_NOT_ALLOWED` |
| 4 | la regla de capitanes gobierna `T` y `p` no está en la reserva de `D` | `NOT_IN_CAPTAIN_POOL` |
| 5 | `!allowMultiplePerDay && assignedDates[p].has(slotDate)` | `ALREADY_ASSIGNED_THIS_DATE` |
| 6 | `monthCount[p] >= effectiveCap` | `AT_CAP` |

**Una invariante dura nunca se rompe para llenar una casilla.** Si no queda nadie, la casilla se
queda vacía y se avisa.

**Por qué los filtros 2, 3 y 4 van antes que el 5 y el 6.** Describen a la persona, no al estado
del reparto. Decirle al administrador que alguien "ya llegó a su cupo" cuando en realidad tiene esa
responsabilidad vetada le haría buscar el problema donde no está.

`allowedTypeKeys === null` significa "sin restricción" y es distinto de `[]`, que significa
"ninguna responsabilidad". La diferencia importa: quien nunca ha tocado la pantalla de
restricciones entra en todo, y quien vació la lista a conciencia queda fuera del reparto
automático sin perder su historial.

### Regla de capitanes y auxiliares

Ajuste `settings.captainRule`: `{ enabled, sourceTypeKey, targetTypeKeys }`. Se expresa con
**claves de tipo**, no con las palabras "aseo" o "acomodador": qué responsabilidad de equipo manda
y qué responsabilidades individuales cubre su reserva lo decide el administrador.

**Reserva de la fecha `D`**: los `CAPTAIN` y `ASSISTANT` cuyos `groupId` pertenecen a alguno de los
equipos asignados a `sourceTypeKey` ese día. Si el tipo fuente tuviera varias casillas por fecha, la
reserva es la **unión** de las reservas de esos equipos: si limpian dos equipos, los capitanes de
ambos están de servicio.

La regla es un **filtro duro que manda por encima del tope mensual**: la relajación local del cupo
(abajo) se prueba *dentro* de la reserva antes de considerar siquiera renunciar a ella. Solo si la
reserva no puede cubrir la casilla de ninguna manera se repite el intento sin reserva, y entonces:

- se emite un aviso `CAPTAIN_RULE_UNMET` con la fecha y la responsabilidad;
- la casilla queda marcada como *regla relajada*, y el paso 8 tampoco le exigirá la reserva.

Rellenar con otra persona apta y avisar es deliberado: un programa completo con una nota vale más
que un hueco silencioso. La regla `enabled` pero con `sourceTypeKey === ''` no gobierna nada — sin
saber qué equipo limpia no hay reserva que aplicar, y aplicar una reserva vacía dejaría el mes en
blanco.

### Relajación local del tope

Si ningún candidato pasa el filtro 6 pero alguno pasó los filtros 1 a 5, se reintenta con
`effectiveCap = cap + k`, con `k = 1, 2, 3…`, hasta encontrar candidato o hasta `k > personSlots`.

La relajación es **local a esa casilla**: el `cap` global no sube. Así el daño no se propaga al
resto del mes. Se registra `capRelaxedTo` en la traza y un aviso `CAP_RELAXED` con la fecha y la
responsabilidad, para que se vea exactamente dónde hubo que ceder.

Si aun así no hay nadie: casilla vacía, `unfilledReason = 'NO_ELIGIBLE_CANDIDATE'`, aviso
`SLOT_UNFILLED`.

### Orden de las dos pasadas

Los slots se resuelven en **dos pasadas sobre la lista canónica**: primero todos los de `kind`
`GROUP`, después todos los de `kind` `PERSON`. La reserva de capitanes de una fecha se lee del
equipo ya asignado al tipo fuente ese día, y el tipo fuente va después en el orden de columnas.

Reordenar no cambia el resultado: la elección de equipo (paso 7) depende **solo** del estado de los
equipos, nunca del de las personas. Lo que se conserva estrictamente es el orden canónico *dentro*
de cada pasada, que es de donde viene la reproducibilidad.

### Tupla de coste (menor gana, comparación lexicográfica)

Para la persona `p` en el slot `(D, T)`:

| # | Componente | Fórmula | Regla de negocio |
|---|---|---|---|
| 0 | carga del mes | `monthCount[p]` | equilibrio dentro del mes |
| 1 | veces en esta responsabilidad | `histTypeCount[p][T.key] + monthTypeCount[p][T.key]` | **rotación de tipo** |
| 2 | antigüedad en esta responsabilidad | `-daysSince(histLastTypeDate[p][T.key] ⊔ mes, D)` | desempate de rotación |
| 3 | carga histórica | `histCount[p]` | equidad de largo plazo |
| 4 | espaciado | `-daysSince(lastAssignedDate[p], D)` | evita lunes 3 + sábado 8 |
| 5 | desempate determinista | `stableHash(seed, p.id, D, T.key)` | reparte los empates sin azar |

Si las seis componentes empatan, gana el `id` menor en orden lexicográfico. Con eso el orden es
**total**: nunca hay dos candidatos indistinguibles, y por tanto nunca hay una decisión implícita
tomada por el orden de un array.

Los componentes 2 y 4 van en negativo: más días transcurridos ⇒ número más pequeño ⇒ mejor
candidato.

**Por qué el componente 1 va antes que el 2.** Quien nunca ha hecho "Pasillo derecho" debe ganarle
a quien lo hizo hace ocho meses. Con el orden inverso, alguien que hizo esa responsabilidad una
sola vez, hace mucho, se pondría por delante de quien no la ha hecho jamás — y la rotación de
tipos sería aparente, no real. `CLAUDE.md` pide explícitamente rotar tipos, no solo cantidades.

**Por qué la carga del mes va primero que todo lo demás.** El equilibrio del mes es lo que ve el
usuario y lo que pide `CLAUDE.md` como prioridad; el historial ajusta, no manda.

### Ventana de variedad (por qué la semilla cambia algo)

Ordenar por la tupla y quedarse con el primero tiene un problema práctico que se ve al pedir **otra
variante del mismo mes**: los componentes 2 y 4 se miden en días exactos, así que dos candidatos
casi idénticos casi nunca empatan, el componente 5 no llega a consultarse y cambiar la semilla
devuelve el mismo programa. Con los datos reales de la hoja eso pasaba de verdad: dos semillas
consecutivas podían dar **exactamente** el mismo septiembre, y las columnas de aseo y hospitalidad
salían idénticas en todas las variantes.

Por eso, entre ordenar y elegir hay un paso más (`orderByVariety` en `domain/scoring.ts`):

1. Se toma el mejor candidato de la lista ya ordenada.
2. Entran en la **ventana** todos los que no empeoran ningún componente más allá de su holgura:

   | Componente | Holgura | Por qué |
   |---|---|---|
   | 0 · carga del mes | **0** | es el equilibrio que pide `CLAUDE.md`; no se negocia |
   | 1 · veces en la responsabilidad | **0** | es la rotación de tipo; no se negocia |
   | 2 · antigüedad en la responsabilidad | 30 días | "hace mes y medio" y "hace dos meses" es lo mismo |
   | 3 · carga histórica | **0** | es la equidad de largo plazo; no se negocia |
   | 4 · espaciado | 7 días | las fechas son lunes y sábados: dentro de la semana da igual |

3. Dentro de la ventana gana el componente 5 (el hash de la semilla) y, si empata, el `id`.

Los tres componentes de **conteo** van a holgura cero, y de ahí sale la garantía importante: una
variante nunca puede darle una asignación de más a quien ya lleva más, ni repetirle a nadie una
responsabilidad que otro no ha hecho, ni cargar al que más ha servido en el historial. Lo único que
la semilla puede mover es la elección entre candidatos que ya eran equivalentes en todo eso, y cuya
única diferencia era una precisión en días que el negocio no tiene. La invariante 7 (desviación de
carga ≤ 1) y la 8 (misma entrada + misma semilla ⇒ misma salida) siguen valiendo tal cual.

Los equipos usan el mismo paso con `TEAM_COST_TOLERANCE`: holgura solo en el componente de fecha.

`costLabelsPerson` (viaja en la traza, para la UI):

```
["Veces este mes", "Veces en esta responsabilidad", "Antigüedad en la responsabilidad",
 "Veces en el historial", "Días desde su última asignación", "Desempate"]
```

## Paso 7 · Elegir equipos

**La unidad asignable de tipo `GROUP` es el equipo, no el grupo suelto** (ver `arquitectura.md`
§4). Un equipo se comporta exactamente igual que una persona: una entidad, una casilla,
`slotsPerDate = 1`. Sus contadores son propios e **independientes de los de las personas**.

### Filtros duros

| # | Condición para descartar | `RejectionReason` |
|---|---|---|
| 1 | `!team.active` | `INACTIVE` |
| 2 | `!allowTeamTwiceSameDate && assignedDatesTeam[t].has(D)` | `ALREADY_ASSIGNED_THIS_DATE` |
| 3 | `teamMonthCount[t] >= effectiveTeamCap` | `AT_CAP` |

El filtro 2 implementa la regla confirmada de que un mismo equipo no hace Aseo y Hospitalidad el
mismo sábado. Con la relajación local de tope y las casillas vacías se procede igual que con las
personas: `NO_ELIGIBLE_CANDIDATE` y aviso `SLOT_UNFILLED`.

Si no hay ningún equipo activo, todas las casillas de tipo `GROUP` quedan vacías con
`NO_ACTIVE_TEAMS` y su aviso.

### Tupla de coste (5 componentes)

| # | Componente | Fórmula |
|---|---|---|
| 0 | carga del mes | `teamMonthCount[t]` |
| 1 | veces en esta responsabilidad | `histTeamTypeCount[t][T.key] + monthTeamTypeCount[t][T.key]` |
| 2 | antigüedad en la responsabilidad | `-daysSince(último uso de T por t, D)` |
| 3 | carga histórica | `histTeamCount[t]` |
| 4 | desempate determinista | `stableHash(seed, t.id, D, T.key)` |

Desempate final por `id`, igual que en personas. Es la misma tupla que la de personas sin el
componente de espaciado: con 4 equipos y hasta 10 fechas, penalizar la proximidad solo entorpecería
el equilibrio.

`costLabelsTeam`:

```
["Veces este mes", "Veces en esta responsabilidad", "Antigüedad en la responsabilidad",
 "Veces en el historial", "Desempate"]
```

> **Lo que se simplificó al modelar equipos.** La hoja de referencia empareja los grupos siempre
> igual (1 y 5, 2 y 6, 3 y 7, 4 y 8). Al hacer del equipo la unidad asignable desaparecen tres
> cosas que serían pura complejidad accidental: la puntuación de combinaciones de grupos, el
> filtro de "los dos grupos de una casilla deben ser distintos" y el ajuste
> `avoidRepeatedGroupPairs`. El modelo de datos absorbió una regla de negocio que, de otro modo,
> habría vivido dispersa por el algoritmo.

## Paso 8 · Pase de mejora

Solo si `settings.runRepairPass`. Es una búsqueda local **determinista y acotada**, no un solver
opaco.

**Objetivo global a minimizar:**

```
coste = W_LOAD · Σ_p (monthCount[p] − base)²
      + W_TYPE · Σ_p Σ_k max(0, monthTypeCount[p][k] − 1)²
      + W_ADJ  · Σ_p (nº de pares de asignaciones de p en fechas consecutivas del programa)
```

**Operador: intercambio de ocupantes** entre dos casillas no bloqueadas y no vacías del mismo
`kind`.

> Nota honesta: un intercambio no cambia el número de asignaciones de nadie, así que el término
> `W_LOAD` es **constante** bajo este operador. Se deja en la fórmula porque es el objetivo real
> del problema y porque hace correcto el día que se añada un operador de *movimiento*. Quien lea
> el código no debe creer que este pase arregla desequilibrios de carga: eso ya lo garantiza el
> `cap` del paso 5. Lo que arregla es la **rotación de tipos** y el **espaciado**.

Procedimiento:

1. Enumerar los pares `(i, j)` con `i < j` en el orden canónico de slots.
2. Descartar el par si el intercambio violaría un filtro duro: misma persona dos veces en un día,
   mismo equipo dos veces en una fecha, **o el predicado de aptitud** — día bloqueado,
   responsabilidad no habilitada, o reserva de capitanes si esa casilla la exige.

   El predicado de aptitud (`RepairInput.canOccupy`) no es un adorno. Un intercambio conserva las
   **cargas** pero no las **restricciones**: mover a alguien de auditorio a pasillo no cambia
   cuántas veces sale. Sin esta comprobación, el paso 8 deshace en silencio lo que el paso 6
   respetó. Las casillas donde el paso 6 tuvo que renunciar a la reserva tampoco la exigen aquí.

   Con la regla de capitanes activa, las casillas del **tipo fuente** quedan además **congeladas**:
   de ellas cuelga la reserva de cada fecha, así que mover un equipo de día aquí invalidaría por la
   espalda la entrada y el auditorio que el paso 6 ya había elegido para las dos fechas
   implicadas — sin aviso y sin que nada lo delate salvo mirar la tabla. Los demás tipos de equipo
   (hospitalidad) siguen siendo intercambiables: no gobiernan ninguna reserva.
3. Calcular `Δcoste`. Quedarse con el par de `Δ` más negativo; en caso de empate, el de menor
   `(i, j)`.
4. Si no hay ningún `Δ < 0`, terminar. Si lo hay, aplicarlo, marcar ambas casillas con
   `changedByRepair = true` y volver al paso 1.
5. Máximo `settings.maxRepairIterations` iteraciones (por defecto 200).

Terminación garantizada: cada iteración reduce estrictamente un entero acotado inferiormente, y
además hay tope de iteraciones. Determinismo garantizado: el orden de enumeración y el desempate
son fijos.

## Paso 9 · Estadísticas, avisos y traza

Se construye `Stats` a partir de la solución final (§5 de `arquitectura.md`), se acumulan los
avisos y se emite la traza con `costLabelsPerson` / `costLabelsGroup`.

---

## `stableHash` — definición exacta

Debe dar el mismo número en cualquier máquina y en cualquier versión de Node. Se especifica el
algoritmo, no "un hash cualquiera":

```ts
/** FNV-1a de 32 bits sobre las partes unidas por '|'. */
export function stableHash(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;                      // offset basis
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;    // primo FNV, aritmética uint32
  }
  return h >>> 0;
}
```

`Math.imul` es obligatorio: la multiplicación normal de JS pierde precisión por encima de 2^53 y
el hash dejaría de ser reproducible.

---

## Invariantes que el algoritmo garantiza

Se prueban con `fast-check` en `tests/invariants/` sobre rosters generados (0-60 personas, 0-15
equipos, con inactivos y bloqueos) × todos los meses de 2024 a 2030.

| # | Invariante |
|---|---|
| 1 | Toda fecha pertenece al mes pedido y su `getDay()` está en la unión de `daysOfWeek` de los tipos activos |
| 2 | Ninguna persona aparece dos veces en la misma fecha, salvo `allowMultiplePerDay` o bloqueo explícito |
| 3 | Una responsabilidad solo aparece en los días de su `daysOfWeek` (hospitalidad ⇒ solo sábados) |
| 4 | Sin `allowTeamTwiceSameDate`, ningún equipo aparece dos veces en la misma fecha |
| 5 | Toda asignación bloqueada aparece intacta en la salida |
| 6 | Ninguna persona o equipo inactivo aparece, salvo bloqueado (y entonces hay aviso) |
| 7 | Sin bloqueos ni historial, `max(monthCount) − min(monthCount) ≤ 1` entre las personas activas |
| 8 | Misma entrada + mismo `seed` ⇒ salida idéntica (`JSON.stringify` igual) |
| 9 | Toda casilla está cubierta **o** tiene `unfilledReason` |
| 10 | Barajar el orden de `people`, `groups` y `assignmentTypes` no cambia la salida |
| 11 | Ningún `monthCount` supera `cap`, salvo que haya un aviso `CAP_RELAXED` que lo justifique |
| 12 | Nadie recibe una responsabilidad que tiene vetada ni sirve un día que tiene bloqueado |
| 13 | Con la regla activa, toda casilla que gobierna la ocupa la reserva del día, **o** hay un aviso `CAPTAIN_RULE_UNMET` para esa fecha y responsabilidad |

Las invariantes 1-11 se comprueban sobre plantillas **sin restringir**, y las 12-13 (más 2, 4, 6,
8, 9 y 10, que deben seguir valiendo) sobre plantillas con restricciones y regla de capitanes al
azar. La separación es deliberada: la 7 —el equilibrio de carga— **no** se sostiene bajo
restricciones, y tiene que ser así. Si alguien solo puede el auditorio, va a salir más veces en el
auditorio y menos en total que quien no tiene ningún veto; eso es la restricción funcionando, no
un fallo del reparto.

## Casos límite con test propio

Febrero bisiesto que empieza en sábado · mes que empieza en lunes · mes que termina en sábado ·
5 lunes + 4 sábados y 4 + 5 · 3 personas (casillas vacías, sin duplicados) · 1 persona con
`allowMultiplePerDay` · 100 personas (nadie pasa de 1; los que quedan a 0 son los de más
historial) · todo bloqueado (salida ≡ entrada) · 1 solo equipo activo · cero personas · cero
equipos · cero tipos activos · un tipo con `slotsPerDate = 3` · un equipo con todos sus grupos
desactivados (sigue siendo asignable; su etiqueta queda vacía y se avisa).

Restricciones y regla de capitanes: solo auditorio · sin pasillos · sin sábados ·
`allowedTypeKeys: []` (fuera del reparto sin desactivar) · nadie puede una responsabilidad
(casillas vacías con el motivo escrito) · el pase de mejora no rompe ninguna de las anteriores ·
entrada y auditorio siempre de la reserva del día · los pasillos siguen abiertos a todos · reserva
mínima que supera el cupo mensual · reserva imposible (rellena y avisa) · un `MEMBER` del grupo que
limpia no entra en la reserva · con la regla apagada, tener grupos y papeles no cambia nada.
