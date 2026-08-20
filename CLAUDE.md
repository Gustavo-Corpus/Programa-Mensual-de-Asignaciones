# Proyecto: Generador de Programa Mensual de Asignaciones

## Rol del orquestador
Actúas como arquitecto principal, orquestador y responsable técnico del proyecto.
Delegas implementación a los subagentes definidos en .claude/agents/ (Sonnet y Haiku)
cuando sea conveniente. No implementas tú mismo tareas que puedan delegarse.
Conservas siempre el control de la arquitectura y revisas el trabajo de los
subagentes antes de integrarlo — no asumas que su código es correcto.

- Sonnet: implementación de funcionalidades complejas (algoritmo de distribución,
  base de datos, PDF, componentes importantes, debugging complejo).
- Haiku: tareas pequeñas y bien delimitadas (tests sencillos, validaciones,
  utilidades, refactors simples, documentación).
- No delegues una tarea grande y ambigua a Haiku.

## Objetivo del proyecto
Generar automáticamente un programa mensual de asignaciones de servicio para
todos los lunes y sábados de un mes seleccionado.

### Responsabilidades por fecha
**Lunes y sábados:**
1. Acomodador de entrada
2. Acomodador de auditorio
3. Pasillo izquierdo
4. Pasillo derecho
5. Aseo — 2 grupos

**Solo sábados, además de lo anterior:**
6. Hospitalidad — 2 grupos

El sistema debe detectar automáticamente cuántos lunes y sábados hay en el mes
(no asumir cantidad fija: puede haber 4 o 5 de cada uno). Nunca generar fechas
que no sean lunes o sábado.

## Reglas de negocio clave
- Una misma persona nunca recibe dos responsabilidades el mismo día, salvo
  opción explícita del administrador que lo permita.
- Meta ideal: cada persona aparece ~2 veces al mes, ajustable según cantidad
  de personas, fechas y restricciones. 0-1 asignaciones = prioridad alta;
  2 = ideal; 3+ = evitar mientras haya personas con menos.
- Rotar tipos de responsabilidad por persona, no solo la cantidad total.
- Considerar historial de meses anteriores (ventana configurable: último mes,
  3 meses, 6 meses, todo el historial) para mejorar la distribución.
- Grupos de Aseo y Hospitalidad también deben distribuirse equilibradamente,
  evitando que las mismas combinaciones se repitan constantemente.
- Asignaciones bloqueadas por el administrador se respetan siempre al
  regenerar el programa.
- Personas y grupos inactivos nunca deben aparecer en nuevas generaciones.

## Arquitectura
- Separación estricta entre: UI / almacenamiento / algoritmo de generación /
  reglas de distribución / estadísticas / PDF.
- El algoritmo de generación debe ser una función pura, testeable de forma
  independiente de la UI, con firma similar a:
```ts
  generateProgram({ year, month, people, groups, previousAssignments, lockedAssignments, settings })
```
- No hardcodear nombres de personas ni cantidad/nombres de grupos — todo debe
  ser configurable por el administrador.
- El sistema debe seguir funcionando igual si cambian personas, grupos, o la
  cantidad de lunes/sábados del mes.

## Modelo de datos (referencia, Opus puede ajustar)
Personas (id, name, active), Grupos (id, name, active), Programas (id, year,
month, status), Fechas del programa (id, programId, date, dayOfWeek),
Asignaciones (id, programDateId, personId, assignmentType, locked),
Asignaciones de grupo (id, programDateId, groupId, assignmentType).

## Base de datos
SQLite para desarrollo local/MVP; evaluar PostgreSQL si se prevé uso desde
varios dispositivos/usuarios. Opus decide y justifica brevemente.

## PDF
Debe generarse con una librería real (no captura de pantalla), tamaño carta,
orientación según legibilidad de la tabla, con encabezados, saltos de página
y márgenes cuidados para impresión.

## Diseño visual
Las imágenes de referencia (si se proporcionan) solo sirven para entender
estructura y contenido, no como especificación visual. Prioridad:
correctitud de lógica > UX > mantenibilidad > rendimiento > diseño visual.
Interfaz pensada específicamente para esta herramienta, no genérica.

## Testing
Toda la lógica de negocio importante debe tener pruebas automatizadas:
detección de fechas, distribución de personas y grupos, duplicados por
fecha, hospitalidad solo sábados, bloqueos, regeneración, personas/grupos
inactivos, meses con distinta cantidad de lunes/sábados, generación del PDF.

## Prioridad de decisiones
correctitud > equilibrio de asignaciones > mantenibilidad > UX > estética.
No simplificar la lógica de asignación solo para terminar más rápido.

## Alcance
Resolver excelentemente: crear, equilibrar, editar, bloquear, guardar y
exportar programas mensuales. Diseñar pensando en futuras ampliaciones
(múltiples congregaciones, login, restricciones de disponibilidad, etc.)
sin implementarlas ahora ni sobrediseñar.