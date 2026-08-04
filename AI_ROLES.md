# Roles de los agentes de IA — PMO Dashboard

> **Lee este archivo al inicio de cada sesión.** Define quién toca qué para
> evitar conflictos de Git y pérdida de trabajo entre los dos agentes que
> operan sobre este repositorio.

## Agentes

Reglas fijadas por el usuario el 2026-08-03 con una nueva división operativa:

| Agente | Dónde corre | Papel |
|---|---|---|
| **Doc** | Gemini en Chrome | Project manager y arquitecto principal. **No escribe código**: supervisa la integración, decide arquitectura, valida el trabajo y orquesta los siguientes pasos. |
| **Gravity** | Gemini local (IDE) | **Ejecutor Frontend y Operador DevOps**. Especialidad: Agilidad, ejecución de scripts de terminal y afinidad nativa con Google Cloud. |
| **Claude Code** | Terminal (Claude Code) | **Arquitecto Backend y Motor Lógico**. Especialidad: Lógica profunda del servidor, refactorizaciones complejas y memoria extensa. |

**Todo lo que haga cualquiera de los dos desarrolladores se le informa a Doc**,
que es quien reparte el trabajo. A Doc no se le mandan fragmentos para que los
refactorice: el código lo escriben Gravity y Claude Code.

### Comunicación y canales

> Arquitectura de cuatro archivos, fijada el **2026-08-03**. Cada agente tiene
> **una** bitácora, y los contratos viven aparte de las órdenes para que nadie
> tenga que leer encargos ajenos para saber qué devuelve una ruta.

| Archivo | Qué es | Quién escribe |
|---|---|---|
| **`GRAVITY_MEMORY.md`** | **La única lista de tareas y bitácora de estado de Gravity.** Encargo en curso con su campo `Estado`, lo entregado y la deuda conocida de su dominio | Doc reparte · Gravity anota lo hecho |
| **`CLAUDE_MEMORY.md`** | Lo mismo para el backend: estado de `@pmo/api`, refactorizaciones, variables de entorno y trampas de operación | Doc reparte · Claude Code anota lo hecho |
| **`API_CONTRACTS.md`** | **Territorio neutral, de solo lectura** — ver abajo | Nadie, salvo cambio estructural acordado |
| **`DOC.md`** | Bitácora de alto nivel del PM: decisiones, pendientes y contexto activo | Doc |

- **Claude Code** recibe instrucciones por el chat de su terminal, y deja
  constancia de lo que hace en `CLAUDE_MEMORY.md`.
- **Gravity** recibe órdenes **estrictamente por `GRAVITY_MEMORY.md`**. Ese
  archivo es su única fuente. Nada de encargos por chat: si no está en el `.md`,
  no existe.
- **Doc marca el arranque y el alto.** Cada bitácora lleva un campo **Estado**
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

## Dominio de Claude Code — Backend y Motor Lógico

- **Especialidad:** Lógica profunda del servidor, refactorizaciones complejas y manejo de memoria de contexto extensa.
- **Responsabilidades:**
  - Desarrollo en NestJS, workers y colas (BullMQ).
  - Bases de datos (Prisma), migraciones, scripts de datos.
  - Tubería de IA, pruebas unitarias y lógica core.
  - Escritura de archivos estáticos de configuración (como redactar el código del Dockerfile o los YAML de GitHub Actions).
  - Depuración de errores lógicos.

## Dominio de Gravity — Frontend y Operaciones DevOps

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

Estos archivos los necesitan ambos; avisar antes de editarlos:

- `apps/api/src/app.module.ts` (registro de módulos)
- `TASKS.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, este archivo
- `package.json` de la raíz y de los workspaces
- `.env` / `.env.example`

**Las bitácoras no son zona compartida**: cada una tiene un dueño y un escritor.
Nadie edita la memoria del otro — para eso está `DOC.md`, donde Doc anota lo que
afecta a los dos.

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
  su lógica es la tubería de IA. **Gemini: no editar este módulo.** Si el
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

  **Gemini**: el contrato está cerrado y lo que falta es tuyo — sustituir los
  mocks `createTask` y `deleteTask` de `apps/web/.../api/tasks.api.ts` por
  llamadas reales. `POST /tasks` devuelve **201 con la tarea, sin envoltorio**
  (`{ id, title, ... }`, no `{ data }`) y `DELETE` devuelve **204 sin cuerpo**.
  Ojo con dos cosas: la tarea creada puede volver con **otra prioridad** de la
  que mandaste (la escala la fecha de vencimiento) y con **otro estado** que el
  elegido (si la fecha ya pasó, nace en `OVERDUE`). Píntala con lo que devuelve
  el servidor, no con lo que enviaste.

- **`TasksGateway` (socket.io)** — encargo del usuario el 2026-07-27, mismo
  motivo: emite desde `TasksService`. El gateway (`tasks.gateway.ts`) es de
  Claude; el cliente de sockets del tablero es de Gemini.

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
