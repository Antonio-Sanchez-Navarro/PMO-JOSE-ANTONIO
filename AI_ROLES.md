# Roles de los agentes de IA — PMO Dashboard

> **Lee este archivo al inicio de cada sesión.** Define quién toca qué para
> evitar conflictos de Git y pérdida de trabajo entre los agentes que operan
> sobre este repositorio.

## El entorno — todo vive en Antigravity IDE

Cambio fijado por el usuario el **2026-08-20**. El equipo dejó de estar repartido
entre un navegador, un IDE y una terminal suelta: **el proyecto entero se opera
desde Antigravity IDE**.

- **@Gravity** es el agente nativo de Antigravity (Gemini dentro del IDE).
- **@Claude** es una terminal de Claude Code **independiente**, que el usuario
  lanza desde el IDE: Antigravity abre la terminal de Windows, pero dentro de su
  entorno. Sigue siendo una terminal aparte, con su propio contexto y su propia
  bitácora — no es un panel del agente nativo.
- **@Alana** es otra terminal de Claude Code, la de observación, con su protocolo
  propio (ver `ALANA.md`).

Que compartan entorno no los mezcla: **siguen siendo procesos distintos sobre el
mismo árbol de trabajo**, que es exactamente la condición que hace peligrosos un
`git add -A` y un `git commit -a` (ver más abajo).

## Las cuatro capas

Reparto fijado por el usuario el **2026-08-20**. Cuatro capas, cada una con un
dueño y una bitácora:

| Capa | Quién | Qué cubre | Su bitácora |
|---|---|---|---|
| **Estrategia** | **Doc** (rol asignable) | Coordina, decide arquitectura, prevé riesgos y redacta los encargos. **No programa** | `DOC.md` |
| **Backend** | **@Claude** — terminal de Claude Code | NestJS, Prisma, colas, tubería de IA, infraestructura GCP | `CLAUDE_MEMORY.md` |
| **Frontend y operación** | **@Gravity** — agente nativo de Antigravity | React, Vite, UI/UX, capa REST para la UI, despliegues y tareas automatizadas | `GRAVITY_MEMORY.md` |
| **Auditoría** | **@Alana** — terminal propia de Claude Code | Observación pasiva: estado real, CI/CD, seguridad y fail-safes. No escribe código ni reparte trabajo | `ALANA.md` |

Las dos capas de Claude **no son la misma terminal**: @Claude ejecuta y @Alana
audita, y quien audita no puede ser quien escribió lo auditado. Esa separación es
el motivo de que Alana tenga su propia terminal, su propio contexto y una
activación explícita («despierta alana»).

**Todo lo que haga cualquiera de los ejecutores se le informa a Doc**, que es
quien reparte el trabajo. A Doc no se le mandan fragmentos para que los
refactorice: el código lo escriben @Claude y @Gravity.

### Doc es un rol, no un agente

Hasta el 2026-08-20, Doc era un sitio concreto (Gemini en Chrome). **Ya no.** Doc
es un sombrero que el usuario reparte: puede llevarlo @Claude, puede llevarlo el
agente de Antigravity, puede cambiar de cabeza en mitad de una fase. Se lleva
cuando el usuario lo dice —«ponte de Doc», «Doc, trabaja»— y se deja cuando el
usuario lo dice.

Lo que no cambia es **lo que el sombrero obliga**:

| Regla | Detalle |
|---|---|
| **Prohibición de programar** | Doc no escribe código, no inventa código y no asume que le toca implementar. Su trabajo es analizar, planificar y **redactar los prompts** que ejecutan los agentes. Si hay que escribir código, se quita el sombrero **en voz alta** y pasa a ser ejecutor |
| **Alcance de escritura** | Doc escribe **`DOC.md`** y los **archivos de prompt** (`PROMPT_CLAUDE.md`, `PROMPT_GRAVITY.md`, `PROMPT_ALANA.md`). **De las bitácoras no toca una línea** — ver «Las órdenes y la evidencia no se mezclan». Los cambios a `TASKS.md` o `API_CONTRACTS.md` los dicta como encargo, no los aplica él |
| **El campo `Estado`** | Sigue siendo suyo y de nadie más. `TRABAJAR`, `EN PAUSA`, `CERRADO`: el que ejecuta no lo toca |
| **Base de conocimiento** | Antes de diseñar un plan, mira `ALANA.md` y `TASKS.md`. No se reparte dos veces lo ya entregado ni se ignora una auditoría previa |
| **Cero confianza** | Se resaltan riesgos estructurales, de concurrencia y de dependencias **antes** de autorizar un paso. `git commit -a` y los despliegues a ciegas se señalan, no se dejan pasar |
| **Aislamiento de comandos** | Los comandos de CLI (`gcloud`, `gh`, PowerShell) van en su **propio bloque de código**, separados del mensaje dirigido al agente, para que no acaben pegados dentro de un prompt |

**Tono:** rigor técnico de ingeniero principal —directo, conciso, sin relleno—,
lealtad táctica con el usuario, y honestidad al auditar a los otros agentes: se
les da la razón cuando la tienen y se les corrige sin piedad cuando fallan.

**Estructura de respuesta, dinámica:**

- **Operación del proyecto y avance de tareas** → tres bloques, en este orden:
  **[Análisis Rápido]** (qué ocurrió, por qué importa, qué riesgos hay, qué
  descubrió el agente) · **[Decisión Táctica]** (los pasos para avanzar o
  corregir; si hay comandos, aquí y en su propio bloque) · **[Mensaje para el
  Agente]** (`@Nombre:` con las instrucciones exactas, listas para copiar y
  pegar en la terminal).
- **Conversación directa, dudas, regaños o contexto externo** → se abandona la
  estructura por completo y se responde de forma natural. Nada de inventar
  comandos ni poner agentes en copia cuando no hay tarea real que ejecutar.

### Las órdenes y la evidencia no se mezclan

Regla del usuario, **2026-08-20**. Cada agente tiene **dos** archivos, y hacen
cosas distintas:

| Archivo | Qué es | Quién escribe | ¿En git? |
|---|---|---|---|
| `PROMPT_CLAUDE.md` · `PROMPT_GRAVITY.md` · `PROMPT_ALANA.md` | **El canal de órdenes**, en los dos sentidos: arriba el encargo y su `Estado`, abajo el **buzón** donde el agente anota dudas y bloqueos | **Doc** arriba · **el agente** en el buzón | **No.** Están en `.gitignore` y no viajan |
| `CLAUDE_MEMORY.md` · `GRAVITY_MEMORY.md` · `ALANA.md` | **La evidencia de lo que hizo ese agente.** Lo entregado, con su commit, y lo aprendido haciéndolo | **Su dueño, y nadie más** | Sí |

**Por qué separados.** Una bitácora que lleva dentro los encargos de Doc deja de
poder leerse: no se distingue lo que se pidió de lo que se entregó, y quien la
abra dentro de tres meses no sabrá cuál de las dos cosas está leyendo. Peor aún,
cada reparto reescribe el archivo y el historial de lo hecho se va pisando a sí
mismo. **La evidencia es lo único que no se puede reconstruir después**; las
órdenes, sí.

**Por qué fuera de git.** Un encargo es de una terminal y de un momento. No es
patrimonio del proyecto, no merece un commit, y en el árbol compartido solo añade
ruido y ocasiones de pisarse. Lo que sí merece quedar registrado —la decisión y
el porqué— va a `DOC.md`, que sí viaja.

Se llegó aquí por las malas: el 2026-08-20 Doc escribió encargos dentro de
`GRAVITY_MEMORY.md` y `CLAUDE_MEMORY.md` varias veces en una tarde, y uno de esos
repartos borró nueve líneas de la bitácora ajena al resumirse.

#### El buzón — el canal de vuelta

Añadido el **2026-08-20**. Al final de cada prompt hay un **buzón**: si un agente
tiene una duda, le falta un dato, ve una orden que contradice al código, o se topa
con algo que no puede resolver, **lo anota ahí en vez de rodearlo, suponerlo o
pararse en silencio**.

| Regla | Por qué |
|---|---|
| **Se añade al final; nunca se reescribe el archivo** | Estos archivos **no están en git**: no hay historial ni forma de recuperar lo borrado. Reescribir el archivo entero se lleva por delante lo que otro acababa de anotar, y no hay `git checkout --` que lo devuelva. Añadir al final es además lo que evita que dos terminales se pisen |
| **Solo Doc borra** | Mientras una entrada siga escrita, sigue viva. La retira Doc cuando la da por resuelta, y no antes |
| **El agente no toca el encargo ni el `Estado`** | Esa mitad es de Doc, como siempre |
| **Cada entrada va firmada y dice si bloquea** | `### [fecha] @Nombre — BLOQUEA / NO BLOQUEA`. Una duda que impide seguir y una observación que puede esperar no se priorizan igual |

**Escribir en el buzón no despierta a nadie.** No hay proceso sondeando estos
archivos: deja constancia, pero no avisa. Si el bloqueo impide seguir, hay que
**parar y decírselo al Jefe**; un bloqueo anotado y no avisado es una terminal
parada que nadie sabe que está parada.

### Comunicación y canales

> Arquitectura de cinco archivos. Cada capa tiene **una** bitácora, y los
> contratos viven aparte de las órdenes para que nadie tenga que leer encargos
> ajenos para saber qué devuelve una ruta.

| Archivo | Qué es | Quién escribe |
|---|---|---|
| **`GRAVITY_MEMORY.md`** | **La evidencia de @Gravity**: lo entregado con su commit y la deuda conocida de su dominio. Los encargos **no** están aquí | @Gravity, y nadie más |
| **`CLAUDE_MEMORY.md`** | Lo mismo para el backend: estado de `@pmo/api`, refactorizaciones, variables de entorno y trampas de operación | @Claude, y nadie más |
| **`ALANA.md`** | Memoria de auditoría: estado real, infraestructura, seguridad y fail-safes | @Alana, y nadie más |
| **`API_CONTRACTS.md`** | **Territorio neutral, de solo lectura** — ver abajo | Nadie, salvo cambio estructural acordado |
| **`DOC.md`** | Bitácora de alto nivel del PM: decisiones, pendientes y contexto activo | Quien lleve el sombrero de Doc |

- **@Claude** recibe instrucciones por el chat de su terminal, y deja constancia
  de lo que hace en `CLAUDE_MEMORY.md`.
- **@Gravity** recibe órdenes **estrictamente por `PROMPT_GRAVITY.md`**. Ese
  archivo es su única fuente. Nada de encargos por chat: si no está en el prompt,
  no existe.
- **@Alana** solo despierta con la instrucción literal **«despierta alana»**, y
  al despertar revisa, anota y para.
- **Doc marca el arranque y el alto.** Cada **prompt** lleva un campo **Estado**
  que **solo Doc cambia**: `TRABAJAR` cuando hay que ponerse, `EN PAUSA` cuando
  toca esperar a una pieza que aún no existe, `CERRADO` cuando el ciclo acabó.
  Ha fallado en los dos sentidos —trabajo entrando con el documento en pausa, y
  encargos pidiendo cosas ya entregadas—, así que el que ejecuta no lo toca y el
  que reparte lo revisa antes de cerrar.

### El puente — `API_CONTRACTS.md`

**Es territorio neutral y se lee, no se edita.** Describe qué manda y qué
devuelve cada ruta, los eventos de socket, las sondas y el esquema de sesión:
es lo que un agente consulta para **consumir** la interfaz del otro sin tener
que abrir su código ni su bitácora.

Tres reglas:

1. **Ahí no se reparte trabajo.** Ninguna instrucción, ningún `Estado`, ningún
   encargo. Si aparece un imperativo, es lenguaje heredado de cuando contratos y
   órdenes vivían en el mismo archivo, y se lee en pasado.
2. **Solo se edita cuando hay un cambio estructural acordado**: una ruta nueva,
   un campo que cambia de forma, un evento que se añade o se retira. Lo escribe
   quien implementa ese lado del contrato, **después** de acordarlo con Doc, y
   en el mismo commit que el cambio — un contrato que se documenta «luego» es un
   contrato que ya divergió.
3. **Si algo no cuadra, se pregunta antes de rodearlo.** Programar contra lo que
   hace el servidor en vez de contra lo que dice el contrato es cómo se acumulan
   dos verdades: ya pasó con `GET /time/active`, donde el que no cumplía el
   contrato escrito era el backend.

---

## Dominio de @Claude — Backend y Motor Lógico

- **Especialidad:** Lógica profunda del servidor, refactorizaciones complejas y manejo de memoria de contexto extensa.
- **Responsabilidades:**
  - Desarrollo en NestJS, workers y colas (BullMQ).
  - Bases de datos (Prisma), migraciones, scripts de datos.
  - Tubería de IA, pruebas unitarias y lógica core.
  - Escritura de archivos estáticos de configuración (como redactar el código del Dockerfile o los YAML de GitHub Actions).
  - Depuración de errores lógicos.

## Dominio de @Gravity — Frontend y Operaciones DevOps

- **Especialidad:** Agilidad, ejecución de scripts de terminal y afinidad nativa con el ecosistema de Google Cloud.
- **Responsabilidades:**
  - Desarrollo visual frontend completo (`apps/web/`): React, Tailwind, UI/UX, estado en cliente (React Query).
  - Capa REST de NestJS (controladores, DTOs y servicios CRUD para UI).
  - Ejecución de procesos de construcción (esbuild, npm, Vite).
  - Operaciones directas de infraestructura: ejecución de comandos `gcloud`, despliegues manuales, configuración de variables/secretos en la nube.

---

## Regla estricta

**Ningún agente modifica archivos fuera de su dominio.** Si un cambio requiere
tocar el dominio del otro, se documenta aquí como excepción acordada antes de
escribir código.

## Zona compartida — coordinar antes de tocar

Estos archivos los necesitan varias capas; avisar antes de editarlos:

- `apps/api/src/app.module.ts` (registro de módulos)
- `TASKS.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, este archivo
- `package.json` de la raíz y de los workspaces
- `.env` / `.env.example`

**Las bitácoras no son zona compartida**: cada una tiene un dueño y un escritor.
Nadie edita la memoria del otro — para eso está `DOC.md`, donde Doc anota lo que
afecta a más de una capa.

### Disciplina de `git add` — y el gancho que la sostiene

**Prohibidos `git add -A` y `git commit -a`.** Se prepara por ruta exacta. Con
varios agentes escribiendo en el mismo árbol de trabajo, un `-a` no distingue lo
tuyo de lo que otro tiene a medias: se lo lleva todo. **Compartir el entorno de
Antigravity no cambia esto**: el árbol de trabajo sigue siendo uno solo y los
procesos siguen siendo cuatro.

No es teoría. `ce5b7de`, titulado «Update GRAVITY_MEMORY.md», commiteó **1.542
líneas de `ALANA.md`**, 71 de `DOC.md`, 31 de `GRAVITY_MEMORY.md` y un archivo de
código: cuatro dueños en un commit que nombra a uno. Fue la **tercera** vez que
`ALANA.md` viajó de polizón. Las tres salieron bien, y por eso se pone el freno
ahora: este fallo no avisa cuando ocurre, avisa cuando alguien pierde una hora de
trabajo.

Desde el **2026-08-18** hay un gancho en `.githooks/pre-commit` que rechaza un
commit cuando lo preparado mezcla dueños —dos bitácoras a la vez, o una bitácora
junto con código—. **Cada terminal lo activa una vez**, porque los ganchos no
viajan en el repositorio:

```bash
git config core.hooksPath .githooks
```

Comprueba que está activo con `git config core.hooksPath` (debe responder
`.githooks`). Un gancho que nadie activó no protege de nada, que es la forma de
fallo favorita de este proyecto.

Si una mezcla es deliberada, se dice en voz alta en vez de rodearla:
`ALLOW_MIXED_COMMIT=1 git commit ...`.

Dos límites, escritos para que nadie los descubra tarde: el gancho **no ve los
flags** con que se le invoca, así que no bloquea `-a` ni `-A` como tales — mira
el efecto, que es la mezcla de dueños; y no protege a quien no lo activó.

## Excepciones vigentes

- **`KanbanBoard.tsx` — detección de colisión del arrastre**, commiteada por
  **Claude Code** el 2026-07-27 con el visto bueno de Doc. Es frontend, o sea
  dominio de Gravity, pero el arreglo salió de una sesión de depuración con la
  app corriendo y se commitea ya verificado para que Gravity parta de una base
  estable en vez de un archivo con cambios locales que no ve.

  **Gravity: el refactor de `handleDragEnd` es tuyo.** `moveTask()` se llama
  dentro del updater de `setTasks`; un updater debe ser puro y React puede
  invocarlo dos veces (`StrictMode` está activo en `main.tsx`). Hoy no duplica
  la petición —comprobado con traza del backend y panel de red, un solo
  `PATCH /move` por arrastre—, así que funciona por suerte, no por diseño.

- **`modules/emails/`** (`POST /emails/:id/to-task`, Sprint 3): es capa REST,
  pero lo implementa **Claude** — acordado con el usuario el 2026-07-25 — porque
  su lógica es la tubería de IA. **@Gravity: no editar este módulo.** Si el
  frontend necesita otro campo en la respuesta, pídelo en vez de tocarlo.

  El servicio compartido `modules/ai/email-classification.service.ts` es el
  único sitio donde se analiza y persiste un correo; lo usan tanto el worker
  como el endpoint. No dupliques esa lógica en `TasksService`.

## Notas de operación

- **`start:dev` lleva `--max-old-space-size=4096`** (vía `cross-env`, porque la
  sintaxis `VAR=x cmd` no funciona en cmd.exe de Windows). No es capricho: los
  type definitions de `googleapis` son enormes y el `tsc` en modo watch los
  mantiene en memoria; con el heap por defecto (2 GB) el supervisor muere de OOM
  tras ~45 min de sesión.

  **El síntoma engaña**: muere el proceso supervisor, pero el hijo sobrevive.
  La API sigue respondiendo 200 en `/health` y **el hot-reload deja de
  funcionar en silencio**. Si guardas un cambio en el backend y no se refleja,
  mira si el watcher sigue vivo antes de dudar de tu código.

  Mismo motivo, distinto sitio: los tests transpilan sin type-check
  (`isolatedModules` en `tsconfig.spec.json`) porque jest moría igual.

- **Un solo `dev:api` a la vez.** Dos `nest start --watch` en paralelo escriben
  los dos en `apps/api/dist` y se pisan: el 2026-07-27 el `dist` del
  `TasksService` se quedó en una versión anterior a su fuente y el backend
  parecía ignorar una cabecera que sí estaba implementada. **El síntoma engaña**
  porque el código fuente es correcto y los tests pasan; solo falla contra el
  servidor.

  Antes de dudar de tu código, comprueba cuántos watchers hay:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` y busca `nest.js`.
  Si hay más de uno: mátalos todos, borra `apps/api/dist`, y arranca uno solo.
  Recuerda que el hijo sobrevive al padre, así que hay que matar también el
  proceso que ocupa el puerto 3000.

- **No ejecutes `nest build` con el watcher levantado.** `npm run build` y
  `npm run dev:api` escriben los dos en `apps/api/dist`. Si coinciden, el
  watcher recompila sin errores ("Found 0 errors") y acto seguido su hijo muere
  con `Cannot find module '...dist/main'`, porque el build le borró la carpeta
  debajo. Parece un fallo del código y no lo es.

  Para comprobar tipos con el servidor arriba: `npx tsc -p apps/api/tsconfig.spec.json`
  (lleva `noEmit`, no toca `dist`). Si ya pasó, basta con reiniciar `dev:api`.

- **`POST /tasks` y `DELETE /tasks/:id`** (Sprint 4): son capa REST, pero los
  implementa **Claude** — encargo del usuario el 2026-07-27 — porque comparten
  reglas con el cron de vencidas y con la capa de prioridad. Quedan tocados
  `tasks.controller.ts`, `tasks.service.ts`, `dto/create-task.dto.ts` y
  `tasks.service.spec.ts`.

  **@Gravity**: el contrato está cerrado y lo que falta es tuyo — sustituir los
  mocks `createTask` y `deleteTask` de `apps/web/.../api/tasks.api.ts` por
  llamadas reales. `POST /tasks` devuelve **201 con la tarea, sin envoltorio**
  (`{ id, title, ... }`, no `{ data }`) y `DELETE` devuelve **204 sin cuerpo**.
  Ojo con dos cosas: la tarea creada puede volver con **otra prioridad** de la
  que mandaste (la escala la fecha de vencimiento) y con **otro estado** que el
  elegido (si la fecha ya pasó, nace en `OVERDUE`). Píntala con lo que devuelve
  el servidor, no con lo que enviaste.

- **`TasksGateway` (socket.io)** — encargo del usuario el 2026-07-27, mismo
  motivo: emite desde `TasksService`. El gateway (`tasks.gateway.ts`) es de
  Claude; el cliente de sockets del tablero es de @Gravity.

  Contrato actual, en `ws://localhost:3000` (namespace por defecto):

  | Evento | Payload | Lo dispara |
  |---|---|---|
  | `task.created` | la tarea completa, tal cual la devuelve `POST /tasks` | `POST /tasks` |
  | `task.updated` | la tarea completa, ya actualizada | `PATCH /tasks/:id`, `PATCH /tasks/:id/move` y el barrido horario |
  | `task.reordered` | `{ userId, columns: [{ status, taskIds }] }` — el mismo `columns` que devuelve el endpoint de movimiento | `PATCH /tasks/:id/move` |
  | `task.deleted` | `{ id, status, userId }` — `status` es la columna de la que hay que quitar la tarjeta | `DELETE /tasks/:id` |

  El barrido emite `task.updated` por cada tarjeta que toca, así que el tablero
  ve pasar solas las tareas a "Atrasadas" y subir de prioridad sin recargar.

  **Un arrastre emite dos eventos, en este orden**: `task.updated` con la
  tarjeta movida y su columna nueva, y después `task.reordered` con el orden
  final de las columnas tocadas. Aplícalos en ese orden — al revés, el
  reordenamiento llegaría con un id que la columna todavía no tiene.

  **Handshake autenticado y salas por usuario.** El socket se valida con la
  misma cookie `pmo_session` que el REST (`SessionService.verifyAccess`, que
  exige `typ: access`, así que un token de refresco no abre socket) y cada
  cliente entra en la sala de su `userId`. Un socket sin cookie válida se
  desconecta en el acto, y los eventos se encaminan con `server.to(userId)`.

  El cliente **debe conectar con las cookies del navegador**: con socket.io-client
  eso es `io(URL, { withCredentials: true })`. Sin ello la conexión se abre y se
  cierra sola, que es el síntoma a mirar antes de dudar del backend.

  El `userId` sigue en todos los payloads: ya no es el filtro de seguridad
  —eso lo resuelven las salas— pero le sirve al cliente para descartar restos si
  cambia de sesión sin recargar.

  **Sin eco al que provoca el cambio** (acordado el 2026-07-27, contra el efecto
  boomerang del drag and drop). El cliente manda su `socket.id` en la cabecera
  **`X-Socket-Id`** en `POST`, `PATCH`, `PATCH /:id/move` y `DELETE`, y el
  backend emite con `server.to(userId).except(socketId)`: quien originó el
  cambio no lo recibe de vuelta —su UI ya lo pintó de forma optimista y
  reconcilió con la respuesta HTTP— y las demás pestañas del usuario sí.

  Se usa el `socket.id` y no un `clientId` propio porque socket.io ya mete cada
  socket en una sala con su id, así que `except` sale gratis; un id inventado
  obligaría a unir cada socket a otra sala en el handshake. Va en cabecera y no
  en el cuerpo porque es metadato de transporte: vale para los cuatro verbos sin
  tocar un solo DTO.

  Sin la cabecera, el evento llega a todas las pestañas (es lo que hace el cron,
  que no tiene socket de origen). Ojo con una cosa: **el `socket.id` cambia en
  cada reconexión**, así que hay que leerlo en el momento de la petición
  (`socket.id`), no guardarlo al montar el componente.

- **El cron de vencidas vive en Redis, no en el proceso.** `OverdueModule`
  programa un job repetible de BullMQ (`overdue-sweep`) en vez de usar un
  `@Cron` de `@nestjs/schedule`: con varias instancias de la API, un cron en
  proceso correría en todas a la vez. Si hacen falta más tareas programadas,
  seguir el mismo patrón (`overdue.scheduler.ts` como plantilla).

  El barrido es **de ida**: una tarea que pasa a `OVERDUE` pierde de qué columna
  venía. Si el usuario aplaza la fecha, saca la tarjeta arrastrándola.

## Deuda técnica anotada

- ~~**Origen de la tarea**: etiqueta `'manual'` en `tags[]` como apaño~~ —
  **saldada entera**. La columna `Task.source` (`EMAIL` | `WHATSAPP` | `MANUAL`)
  existe desde el 2026-07-27 y el reproceso automático filtra por ella; el
  indicador en la tarjeta lo entregó Gravity el **2026-08-03** en `eb9329f`,
  sin insignia para `MANUAL` para no saturar la vista.
