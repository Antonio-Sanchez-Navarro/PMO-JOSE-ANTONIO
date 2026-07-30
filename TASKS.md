# PMO Dashboard — Plan de Desarrollo por Sprints

> Desglose paso a paso. Cada sprint ≈ 1–2 semanas. Marca `[x]` al completar.
> Definición de "Hecho" (DoD) por tarea: código + tests + revisión + documentación mínima.

Leyenda de prioridad: 🔴 crítica · 🟡 alta · 🟢 normal

---

## Sprint 0 — Fundaciones y setup (infraestructura)
**Objetivo:** repo listo, entorno reproducible, esqueleto que arranca.

- [x] 🔴 Inicializar monorepo (workspaces `apps/api`, `apps/web`, `packages/shared`)
- [x] 🔴 Configurar `docker-compose` (Postgres, Redis)
- [x] 🔴 Backend NestJS: bootstrap, config por entorno, health check `/health`
- [x] 🔴 Frontend React+Vite+Tailwind: layout base y routing
- [x] 🟡 Prisma: conexión + primera migración (User, Task) — ✅ Completado en Sprint 1
- [x] 🟡 `packages/shared`: tipos y enums compartidos (Status, Priority)
- [x] 🟡 Linter/formatter (ESLint + Prettier) y `.editorconfig` — ✅ Implementado en raíz
- [x] 🟢 CI básico (GitHub Actions: install, lint, build) — ✅ Implementado en `.github/workflows/ci.yml`
- [x] 🟢 README de arranque local

**Entregable:** `docker-compose up` levanta api + web + DB y responden. ✅ API `/health` verificada; frontend con build OK y semáforo de estado.

---

## Sprint 1 — Autenticación Google (OAuth2)
**Objetivo:** login con Google y almacenamiento seguro de tokens.

- [x] 🔴 Crear proyecto en Google Cloud Console + habilitar Gmail API — ✅ Completado por el usuario (credenciales en `.env`)
- [x] 🔴 Configurar pantalla de consentimiento OAuth y credenciales — ✅ Completado por el usuario (credenciales en `.env`)
- [x] 🔴 Backend: flujo `/auth/google` → `/auth/google/callback` — ✅ 302 a Google con scopes + state anti-CSRF
- [x] 🔴 Cifrado de tokens (AES-256-GCM) en reposo — ✅ `CryptoService` (round-trip + integridad verificados)
- [x] 🟡 Emisión de sesión JWT (httpOnly cookie) + refresh — ✅ `SessionService`: access 15 min + refresh 30 d, `POST /auth/refresh` y `/auth/logout`
- [x] 🟡 Guard de autenticación + middleware de usuario actual — ✅ `AuthGuard` (stateless) + `@CurrentUser()` y `GET /auth/me`
- [x] 🟡 Frontend: pantalla de login + estado de sesión + logout — ✅ `LoginPage`, hook `useSession` y reintento automático tras 401
- [x] 🟢 Manejo de expiración/refresh de token de Google — ✅ Implementado en `GmailService` y `AuthService`
- [x] 🟡 Persistencia del `User` en Prisma (requiere DB activa: `docker compose up`) — ✅ `UsersService.upsertFromGoogle` + migración `20260724000000_init` aplicada

**Entregable:** usuario inicia sesión y el backend guarda credenciales de Gmail.

---

## Sprint 2 — Ingesta de Gmail (lectura + clasificación por hilos/etiquetas)
**Objetivo:** leer correos y clasificarlos, con sincronización incremental.

- [x] 🔴 Servicio Gmail: `messages.list/get`, parseo de cuerpo y headers — ✅ `getInbox` + parseo MIME recursivo (`text/plain`, con degradado de HTML a texto). `format: 'full'` en la sync; la lista usa `metadata` salvo `?includeBody=true`
- [x] 🔴 Sincronización inicial (backfill) + `historyId` — ✅ `syncHistory` usa `users.history.list` desde `User.gmailHistoryId`; sin marcador hace backfill de 25 y fija el `historyId` del perfil; ante 404 (marcador caducado) rehace backfill. _Verificado: backfill 25 correos → incremental desde `6457254`._
- [x] 🔴 `users.watch` + Pub/Sub topic/subscription — ✅ `GmailService.watchInbox` (guarda el `historyId` inicial) y `GCP_SETUP.md`. _Falta la parte de consola de GCP: acción del usuario._
- [x] 🔴 Webhook `/webhooks/gmail` con verificación de firma — ✅ `PubSubAuthGuard` valida el JWT OIDC de Google (firma, `aud` y cuenta de servicio emisora). _Verificado: 401 sin token y con token falso._
- [x] 🔴 Cola BullMQ: `sync-history` y `process-email` (idempotentes) — ✅ `GmailProcessor` sobre la cola `gmail-sync`, con `jobId` = `messageId` de Pub/Sub, 3 reintentos y backoff exponencial. _`process-email` aún no existe: llega con la clasificación por IA del Sprint 3._
- [x] 🟡 Normalización y deduplicación (por `gmailMessageId`) — ✅ `upsert` sobre la clave única. _Verificado: reenviar el mismo webhook no duplica._
- [x] 🟡 Persistir `Email` con `threadId`, labels y snippet — ✅ Ahora también `labels` y `bodyText`. _Verificado: 25/25 registros con etiquetas y cuerpo (media ~8 KB)._
- [x] 🟡 Frontend: vista **Inbox** agrupada por hilo/etiqueta — ✅ `InboxPage` + `useInbox`: hilos desplegables por `threadId`, barra de filtro por etiqueta con conteos, píldoras por correo y marca de no leídos
- [x] 🟢 Reintentos y dead-letter en colas — ✅ Reintentos configurados y `DeadLetterModule` creado para mover fallos definitivos a cola `dead-letter`.

**Entregable:** los correos nuevos aparecen en la app clasificados por hilo/etiqueta.

---

## Sprint 3 — Análisis con IA y Generación de Tareas (Agent/Claude)
**Objetivo:** procesar correos nuevos con el SDK de Anthropic (modelo de `CLAUDE_MODEL_CLASSIFY`, hoy `claude-sonnet-5`) para convertirlos en acciones.

> **Reetiquetado el 2026-07-27.** Lo que Doc abrió como «Sprint 5 · Pipeline de
> IA» es en realidad lo que le falta a **este** sprint: la validación humana
> sobre una tubería que ya está construida. El Sprint 5 **sigue siendo Registro
> de Tiempos** y no se aparca. Decisión del usuario.

- [x] 🔴 Módulo AI: `@anthropic-ai/sdk`, prompts y JSON Schemas (Zod o raw JSON) — ✅ `AiService` con salida estructurada vía tool use y `strict: true` (esquema con `additionalProperties: false`); el modelo se lee de `CLAUDE_MODEL_CLASSIFY`
- [x] 🔴 Worker `classify-email`: Lee de la DB, envía a Claude y clasifica `isActionable` — ✅ `AiProcessor`; lo alimenta `GmailService.persistEmails`, que encola tras cada upsert
- [x] 🔴 Generación de Tareas: crear entidades `Task` (con `priority`, `tags`, etc.) si es accionable — ✅ `prisma.task.createMany` dentro de una transacción junto al `update` del `Email`. Extrae también `dueDate`
- [x] 🟡 Crear `Task` desde correo de forma idempotente (sin duplicar) — ✅ Guard por `Email.processedAt` + transacción atómica
- [x] 🟡 Capa determinista de ajuste de prioridad (heurísticas + `aiConfidence`) — ✅ `priority.rules.ts`: función pura que ajusta **solo por fecha de vencimiento** (<24 h ⇒ `URGENT`, <72 h ⇒ `HIGH`) y **nunca baja** lo que dijo el modelo. Una tarea ya vencida cuenta como <24 h. Se aplica en `EmailClassificationService` antes de persistir y cada ajuste se registra en el log con su motivo. 15 pruebas en `priority.rules.spec.ts` + 3 de integración. _Con `aiConfidence < 0.5` se escala igual porque el único disparador es la fecha, que es un dato del calendario y no una interpretación del modelo; el umbral queda explícito por si se añaden otras señales_
- [x] 🟡 Endpoint manual `POST /emails/:id/to-task` — ✅ `EmailsModule`: 201 con las tareas creadas, 404 si el correo no es del usuario, 409 si ya tenía tareas (`"force": true` para insistir). Con `title` es manual puro (sin coste de IA); sin él, la IA analiza forzando `isActionable`. Comparte `EmailClassificationService` con el worker
- [x] 🔴 `POST /emails/:id/classify`: devolver la `EmailClassification` **sin persistir** (Claude Code) — ✅ 200 con la propuesta, 404 si el correo no es del usuario, 409 si no tiene texto. `EmailClassificationService.classify()` comparte el análisis con la vía que persiste (misma llamada al modelo y misma capa determinista de prioridad), pero no abre transacción ni toca `processedAt`: clasificar para mirar no es haber despachado el correo, y marcarlo haría que el worker se lo saltara. No fuerza `isActionable`. 12 pruebas nuevas. _Verificado contra la app: 200 con 3 tareas propuestas y ni una fila escrita_
- [x] 🔴 Cuarentena de clasificación: modal de validación humana antes de crear las tareas (Gravity) — ✅ `AiValidationModal` (`d4097a8`) con edición de título, desplegable de categoría y descarte de subtareas; `TriageSidebar` + `useTriageEmails` al lado del tablero, mensajes de error por código (409/400/401) y `force: true` para reprocesar (`e2c87cf`, `00a3c08`, `40f6fee`). _La prueba E2E visual de las dos pestañas, pendiente desde el Sprint 4, la dio por buena el usuario en su revisión manual del 2026-07-29: sin duplicados en la pestaña que confirma y sin recargar en la otra_
- [x] 🔴 `GET /emails`: la bandeja que da los ids de correo al frontend (Claude Code) — ✅ Nace porque `GET /gmail/inbox` va en vivo a Google y devuelve el id de mensaje de Gmail, que **no** es el `Email.id` que aceptan `classify` y `to-task`: sin esta ruta la única forma de abrir la cuarentena era pegar un cuid a mano. Lee de nuestra base, que es la única que sabe qué se convirtió ya. Arreglo sin envoltorio con `id`, `subject` (nunca vacío), `from`, `date` en ISO, `category`, `taskCount`, `isConverted`, y además `threadId`, `labels`, `snippet` y `gmailMessageId` para que la bandeja pueda dejar de leer de Gmail sin perder el agrupado por hilo ni los filtros. El `bodyText` se queda fuera: son ~8 KB por correo y en una página de 50 serían 400 KB para pintar una lista. Filtros `?actionable=` y `?converted=` (400 si no son `true`/`false`), `skip`/`take` con tope 200. `isConverted` sale de tener tareas y no de `processedAt`, porque el worker marca como procesado incluso lo que no generó ninguna: es justo la condición que dispara el 409 de `to-task`. 16 pruebas nuevas. _Verificado contra la app: 26 correos en 20 hilos, todos con etiquetas y vista previa y 14 KB de respuesta total, 13 con `?actionable=true`, 13 con `?converted=true`, 400 ante `?actionable=quizas` y ante `?take=9999`, 401 sin cookie, y 200 por el proxy de Vite_
- [x] 🔴 `GET /emails/:id`: el correo completo para la vista de lectura (Claude Code) — ✅ Encargo de Doc: no se puede aprobar lo que propone la IA sin poder leer el correo. Contraparte del listado — allí el `bodyText` se excluye por peso, aquí se incluye porque es lo que se va a leer. Trae además `isActionable`, `processedAt` y las `tasks[]` que ese correo ya generó (id, título, estado, prioridad), para poder comparar al reprocesar. `bodyText` puede ser `null`, y así la vista distingue "sin cuerpo guardado" de "cuerpo vacío" y cae al snippet. 8 pruebas nuevas. _Verificado contra la app: 200 con 55 688 caracteres de cuerpo en el correo de Escrituración, 404 con un id inventado, 401 sin cookie, 200 por el proxy de Vite, y comprobado que el listado sigue sin arrastrar el cuerpo_
- [x] 🟡 `POST /emails/:id/to-task` que acepte las tareas **ya editadas** por el usuario en vez de inferirlas (Claude Code) — ✅ Aditivo, no sustitutivo: con `tasks[]` en el cuerpo persiste exactamente lo aprobado sin volver a llamar al modelo, marca el correo como procesado (y su `category` solo si la persona la cambió) y devuelve 201; sin `tasks[]` se comporta como siempre. Las tareas confirmadas nacen con `source: MANUAL` — las propuso el modelo pero las aprobó una persona, y el reproceso del worker borra lo que tiene origen `EMAIL` — y se anexan al final de "Por hacer" en vez de colarse en la posición 0. Todo en una transacción: escribir tareas sin marcar el correo haría que el worker lo reclasificara y las duplicara. 10 pruebas nuevas. _Verificado contra la app: 201 con dos tareas, categoría actualizada, y 400 al mandar una categoría o prioridad inventada_
- [x] 🟡 Que la conversión de un correo anuncie sus tarjetas al tablero (Claude Code) — ✅ `to-task` emite un `task.created` por tarea creada, con el mismo formato que `POST /tasks`, y respeta la cabecera `X-Socket-Id` para no devolverle el eco a quien confirmó (ya tiene las tareas en la respuesta 201; el eco se las duplicaría en pantalla). La emisión envuelve a las tres vías —cuarentena, título a mano y modelo— en vez de repetirse en cada una, para que ninguna vía futura nazca muda, y va después de la transacción: emitir dentro anunciaría tarjetas que aún podrían no llegar a existir. 6 pruebas nuevas. _Verificado contra la app con dos sockets del mismo usuario: al confirmar con `X-Socket-Id` la pestaña que confirmó recibió 0 eventos y la otra los 2 `task.created` (tarea completa, `source: MANUAL`, anexadas al final de "Por hacer"); sin la cabecera lo recibieron las dos; y un correo ya convertido devolvió 409 sin emitir nada_
- [x] 🟢 Tests de extracción con correos de ejemplo (fixtures) — ✅ Jest configurado (`jest.config.js` + `tsconfig.spec.json`) y 39 pruebas en 3 suites: `ai.service.spec.ts`, `email-classification.service.spec.ts`, `emails.service.spec.ts`. Fixtures en `modules/ai/__fixtures__/`, con capturas reales de las salidas corruptas del modelo como regresión. Sin DB, Redis ni llamadas a Anthropic; corren en ~4 s y ya van en CI

**Entregable:** un correo relevante genera automáticamente una tarea con prioridad.

> El **panel de auditoría de prioridad** salió de este sprint sin hacerse y vive
> ahora en [DEUDA TÉCNICA — Sprints anteriores](#deuda-técnica--sprints-anteriores),
> al final del archivo.

---

## Sprint 4 — Dashboard Kanban + creación de tareas
**Objetivo:** tablero interactivo con las 5 columnas y CRUD directo.

- [x] 🔴 CRUD Tasks (`GET/POST/PATCH/DELETE /tasks`) — ✅ Los cuatro verbos en `TasksController`. `GET` ordena por `status` (orden del enum) y `position`. `POST` devuelve 201 con la tarea creada sin envoltorio, la coloca al final de su columna, fuerza `source: MANUAL` y aplica las mismas reglas que el cron (escalado por fecha y nacer en `OVERDUE` si la fecha ya pasó). `DELETE` devuelve 204 y filtra por `userId` (404 si es de otro). _Pendiente en el frontend: `createTask`/`deleteTask` de `tasks.api.ts` siguen siendo mocks_
- [x] 🔴 Columnas: **Por hacer · En proceso · Pospuestas · Cumplidas · Atrasadas** — ✅ Las cinco columnas están en `KanbanBoard`
- [x] 🔴 Drag & drop con `@dnd-kit` + `PATCH /tasks/:id/move` (status+position) — ✅ **Completado**: El frontend ahora consume el endpoint, implementa UI optimista y se reconcilia sin efecto boomerang usando `MoveTaskResponse`.
- [x] 🔴 Job cron: marcar `OVERDUE` (dueDate vencido) — ✅ `OverdueModule`: job repetible de BullMQ (cola `overdue-sweep`, patrón en `OVERDUE_CRON`, por defecto cada hora en el minuto 5, más un barrido al arrancar). Mueve a `OVERDUE` las tareas vencidas en `TODO`/`IN_PROGRESS`/`POSTPONED` anexándolas al final de la columna; una transacción por usuario y relectura dentro para no pisar cambios del tablero. En la misma pasada **reevalúa la prioridad** con `adjustPriority` (Sprint 3), así que una tarea sube sola conforme se acerca su fecha. 16 pruebas en `overdue.service.spec.ts`
- [x] 🟡 Modal de creación/edición (React Hook Form + Zod) — ✅ `TaskModal.tsx` con `useForm` + `zodResolver`, conectado en `KanbanBoard.handleCreateTask` a `POST /tasks` y pintando la tarea **con lo que devuelve el servidor**, no con lo enviado (la prioridad y el estado pueden cambiar por las reglas de negocio). _La nota anterior decía que faltaba el `POST /tasks`; lleva implementado desde el Sprint 4_
- [x] 🟡 Realtime: `socket.io` emite `task.*` → UI se actualiza sin recargar — ✅ Backend: `TasksGateway` emite `task.created`, `task.updated` (desde `PATCH`, el arrastre, el barrido horario y ahora la conversión de un correo), `task.reordered` (orden de las columnas tras un arrastre) y `task.deleted`. El handshake se autentica con la cookie `pmo_session` y cada cliente entra en la sala de su `userId`, así que los eventos no salen de su dueño. ✅ Frontend (Gravity): `useSocket.ts` mantiene **un solo socket por pestaña** —dos sockets vivos rompían la supresión del eco, porque el backend excluye uno y el otro aplicaba el cambio— y `KanbanBoard` reacciona a los cuatro eventos; el alta ignora la tarjeta si ya está en el estado. Todas las peticiones que mutan mandan `x-socket-id` (`c06cb73`, `ae2dceb`, `d35e1c8`). _La línea anterior decía "falta el consumo en el frontend" y llevaba días siendo falsa_
- [x] 🔴 Prefijo de contexto en el título de la tarea, `[Nombre R. - Proyecto n/N]` (Claude Code) — ✅ Encargo de Doc para que el tablero no sea una lista de frases sueltas. **El modelo extrae, el código compone**: el prompt y el esquema piden `senderName` y `project`, y `title.prefix.ts` —función pura, como `priority.rules.ts`— arma el prefijo y numera. Se hace en dos pasos porque el contador tiene que cuadrar con las tareas que de verdad van a existir (después del análisis todavía se descartan tareas: el filtro de accionables y el respaldo desde el asunto), y porque un formato pedido en prosa deriva mientras que compuesto sale idéntico siempre. Es idempotente —reprocesar no encadena prefijos— y recorta el cuerpo, nunca el prefijo, si se pasa de 300 caracteres. Sin remitente ni proyecto el título sale intacto en vez de inventar un `[Desconocido]`. **El remitente sale de la cabecera `From`, no del modelo** (decisión de Doc el 2026-07-28, tras ver que en un correo de Josmat Narváez el modelo eligió a la persona de la que hablaba el cuerpo): `senderFromHeader` abrevia a `Nombre A.`, entiende `"Apellido, Nombre"`, el correo pelado y las mayúsculas gritadas, y **descarta los tratamientos** — sin eso, `Arq. Elena Ruiz` salía como `Arq. R.`. Si la cabecera no da nada aprovechable se recurre a lo que dijera el modelo. 31 pruebas nuevas. _Verificado contra la app con dos correos reales: `[Astrid R. - Citrotarte 1/3] Enviar cotización actualizada…` y `[Dinorah L. - Lote 36 2/3] Remitir KYC…`_
- [x] 🟢 Badges de prioridad, indicador de origen (correo/WhatsApp/manual) — ✅ `TaskCard` pinta la prioridad con color y el origen con icono y etiqueta (`📧 Email`, `👤 Manual`), con el origen en el `title` para lectores de pantalla (Gravity, `00a3c08`)

**Entregable:** tablero Kanban funcional, con creación directa y movimiento por columnas.

> Los **filtros por etiqueta y por rango de fechas** salieron de este sprint sin
> hacerse y viven ahora en
> [DEUDA TÉCNICA — Sprints anteriores](#deuda-técnica--sprints-anteriores), al
> final del archivo. Lo que sí quedó: buscador y filtros de estado y prioridad.

---

### Inbox Zero — cierre de la gestión de correos

> **Sobre el nombre.** Doc lo llamó "Sprint 5" y en `TASKS.md` el Sprint 5 es
> **Registro de Tiempos**. Acordado el 2026-07-28: esto es el cierre del Sprint 4
> (un "4.5"), no un sprint nuevo, y el Sprint 5 sigue siendo el de tiempos. Es el
> segundo reetiquetado del mismo tipo; conviene mirar el checklist antes de
> numerar.

- [x] 🔴 Migración: estado de triage en `Email` (Claude Code) — ✅ Enum `EmailStatus` (`PENDING` · `IN_PROGRESS` · `COMPLETED` · `DISMISSED`) con `@default(PENDING)` e índice `(userId, status)`, que es como pregunta la bandeja. Columna aparte y no derivada de las marcas que ya había: `processedAt` dice que el worker analizó el correo, y eso convive con un `PENDING` porque su dueño aún no lo ha despachado. Migración `20260728191137_add_email_status`
- [x] 🔴 `PATCH /emails/:id/status` (Claude Code) — ✅ 200 con el correo actualizado **en la misma forma que devuelve `GET /emails`**, para que el cliente no tenga que aprender otro objeto. `updateMany` filtrando por `userId`, así la comprobación de propiedad y la escritura son la misma operación y no queda hueco entre leer y escribir. 400 si el estado no está en el vocabulario o si falta (mover un correo es una decisión explícita: un cuerpo vacío es un error del cliente, no un "déjalo igual"), 404 si no es suyo. Descartar un correo **no** borra las tareas que ya generó. El listado acepta `?status=` y cada fila lleva su `status`. 9 pruebas nuevas. _Verificado contra la app: 200 y estado persistido, `?status=PENDING` 25 · `?status=IN_PROGRESS` 1, 400 con `ARCHIVADO` y con cuerpo vacío, 404 con id inexistente, 401 sin cookie, 200 por el proxy de Vite_
- [x] 🔴 Bandeja: botones de estado y pestañas conectadas al endpoint (Gravity) — ✅ `InboxPage` usa `activeTab` para filtrar el listado desde `useInbox`. Botones "Descartar", "En Proceso" y "Completado" conectados a `updateEmailStatus` (`PATCH /emails/:id/status`). UI reacciona en vivo vía WebSocket (`email.updated`).
- [x] 🟡 Que la bandeja se entere en vivo de los cambios de estado (Claude Code) — ✅ `PATCH /emails/:id/status` emite **`email.updated`** con el correo entero, la misma forma que una fila de `GET /emails`, y respeta `X-Socket-Id`: quien mueve el correo no recibe el eco porque ya lo tiene en la respuesta. Va por el gateway que ya existe y no por uno nuevo, porque el cliente mantiene **un solo socket por pestaña** y de eso depende la supresión del eco; un segundo gateway obligaría a otro handshake. El evento se emite **después** de que la escritura cuaje. 6 pruebas nuevas. _Verificado contra la app con dos sockets: con la cabecera, 0 eventos para quien movió y 1 para la otra pestaña; sin ella, 1 y 1; y un estado inválido da 400 sin emitir nada_

- [x] 🔴 La bandeja avanza pero no retrocede sola, con anulación del dueño (Claude Code, encargo del usuario el 2026-07-29) — ✅ Devolver a `PENDING` un correo ya despachado (`IN_PROGRESS`, `COMPLETED` o `DISMISSED`) responde **409**; se insiste con `{ "status": "PENDING", "force": true }`, que queda anotado en el log como `Reapertura forzada`. **Ojo: la restricción no existía.** El cierre del Sprint 4 la daba por implementada ("validación en el backend y frontend"), pero `updateStatus` escribía cualquier estado sin mirar el de partida y había incluso una prueba afirmando que aceptaba los cuatro. La lectura del estado anterior y la escritura van **en la misma transacción**: sueltas, entre comprobar de dónde viene y guardar cabe otra pestaña moviendo el mismo correo. Marcar como pendiente lo que ya lo estaba no es reapertura y no pide `force`; rectificar entre estados despachados tampoco se juzga. Reabrir **no** toca `processedAt` ni las tareas que el correo ya generó. 13 pruebas nuevas. _Verificado contra la app: 200 al avanzar, 409 al volver sin `force`, 200 con `force`, 200 de `PENDING` sobre `PENDING`, 400 con un `force` que no es booleano, 401 sin cookie, `processedAt` intacto y el correo devuelto a su estado_
- [x] 🟡 Bandeja: botón para devolver un correo a pendientes (Gravity) — ✅ Botón "A Pendientes" en la fila del correo (`c768db7`), que manda `{ status: 'PENDING', force: true }`: `updateEmailStatus` acepta ya el tercer parámetro y lo mete en el cuerpo, así que la anulación viaja de verdad y no se queda en el cliente. _Comprobado en el código y verificado a mano por el usuario contra la app el 2026-07-29_

**Entregable:** la bandeja se puede vaciar: cada correo acaba en hecho o descartado.


---

## Sprint 5 — Registro de tiempos (Time Tracking)
**Objetivo:** medir tiempo dedicado por tarea y reportar.

- [x] 🔴 Modelo `TimeEntry` + endpoints de cronómetro (Claude Code) — ✅ El modelo existía desde la migración inicial; lo que se añade es `activeFor` y sus índices (`20260729153000_add_time_tracking`). Las rutas quedaron con la tarea en la ruta, que es como las llamaba ya el tablero: **`POST /time/:taskId/start`** (201 con el fichaje; si ya corría sobre esa misma tarea devuelve el que había, así el doble clic no parte el tramo en dos; si corría sobre otra, la cierra y abre esta **en la misma transacción**) y **`POST /time/:taskId/stop`** · **`POST /time/stop`** (200; 409 si no hay ninguno en marcha). Además **`GET /time/active`**, para que recargar la página no pierda de vista un reloj que sigue corriendo
- [x] 🔴 Un solo timer activo por usuario (validación) (Claude Code) — ✅ Lo arbitra la **base**, con un índice único sobre `TimeEntry.activeFor` —lleva el `userId` mientras el fichaje corre y `null` al cerrarlo— y no una comprobación entre leer y escribir, que dejaría pasar dos pestañas pulsando play a la vez: las dos verían un `findFirst` vacío. Postgres considera distintos todos los `NULL` en un índice único, así que caben cuantos fichajes cerrados haga falta y solo uno abierto por dueño. Quien pierde la carrera recibe **409**, no un 500 de Prisma. No se usa un índice parcial (`WHERE "endedAt" IS NULL`) porque Prisma no sabe expresarlo y lo borraría en la migración siguiente
- [x] 🟡 UI: botón start/stop en tarjeta + cronómetro visible (Gravity) — ✅ `TaskCard` pinta el reloj y el botón; `GET /tasks` manda ya `totalTimeSec`, `activeTimeEntryId` y `activeTimeStartedAt` por tarjeta. _Verificado a mano por el usuario el 2026-07-29, con la sincronización en tiempo real en marcha_
- [x] 🟡 Registro manual de tiempo (edición de entradas) (Claude Code) — ✅ **`POST /time/entries`** apunta un tramo que ya terminó (nace cerrado, sin tocar el centinela, así que no compite con el cronómetro), **`PATCH /time/entries/:id`** lo corrige —poner `endedAt` sobre el que corre lo cierra de verdad: es el "me olvidé de pararlo ayer"— y **`DELETE /time/entries/:id`** lo borra (204). **`GET /time/entries`** lista con `?taskId=`, `?from=`, `?to=`, `?skip=`, `?take=`. 400 si el tramo acaba antes de empezar o si el `PATCH` va sin campos; `taskId` no se puede cambiar, porque mover un tramo falsearía el informe de las dos tareas
- [x] 🟡 Reporte `GET /time/report` (por tarea/día/semana) (Claude Code) — ✅ `?groupBy=task|day|week` (por defecto `task`), `?from=` y `?to=` (cerrado por abajo, abierto por arriba, para que dos rangos consecutivos no cuenten dos veces el mismo tramo). Solo entran los fichajes **cerrados**: el que corre no tiene duración, y estimarla haría que dos lecturas seguidas dieran números distintos. Por día y por semana agrupa con `date_trunc` en SQL —el `groupBy` de Prisma no trunca fechas— y corta en **UTC**, que es como Postgres guarda las marcas
- [x] 🟢 Gráfica de tiempos (Recharts) en el dashboard — ✅ `TimeReportModal.tsx` (`a431022`) con `BarChart` de Recharts sobre `GET /time/report`, conmutando entre día, semana y tarea, más el total en horas. `TimeEntriesModal.tsx` para los tramos de una tarea. **Recharts `^3.10.1` está en `apps/web/package.json`** —zona compartida— con el `package-lock.json` al día en el mismo commit. _Comprobado: `npm run build` compila los tres paquetes con la dependencia dentro (el bundle pasa a 794 kB, que dispara el aviso de tamaño de Vite; si molesta, se parte con `import()` dinámico)_

**Pruebas**: 30 nuevas en `time.service.spec.ts` (carrera entre pestañas, cambio de tarea, informes), 13 en `emails.service.spec.ts` por la máquina de estados del triage y 2 en `tasks.service.spec.ts` por el resumen de tiempo de la tarjeta. Total: **293 en 9 suites**.

**Sprint 5 cerrado el 2026-07-29**, con la revisión manual del usuario sobre la app corriendo: gráficas, sincronización en tiempo real y el retorno forzado a la bandeja, sin colisiones de concurrencia.

**Entregable:** el usuario mide y consulta el tiempo invertido por tarea.

---

## Sprint 6 — Copiloto de IA (chat + redacción de correos)
**Objetivo:** asistente embebido que actúa sobre el sistema y redacta correos.

- [x] 🔴 `CopilotModule`: chat con streaming (SSE) y persistencia de hilos (Claude Code) — ✅ **Streaming y persistencia, los dos.** Hilos en `ChatThread`/`ChatMessage` (migración `20260729140000_add_copilot_threads`): cada turno rehidrata los últimos 20 mensajes, se guarda al cerrar el stream y en transacción —media conversación guardada es peor que ninguna, porque al releerla el modelo vería una pregunta sin respuesta—, y si el cliente corta a media respuesta se guarda lo que se alcanzó a decir. `threadId` viaja en el evento `done` porque en una conversación nueva el cliente no lo conoce hasta que el backend la crea. `GET /copilot/threads`, `GET /copilot/threads/:id` y `DELETE` para el panel. _Verificado contra la app: le dije mi nombre en un turno y lo recordó en el siguiente; hilo ajeno da 404 **antes** de abrir el stream_ `POST /copilot/chat` sirve `text/event-stream` con eventos `token`/`done`/`error`, y `GET /copilot/providers` enumera lo que puede ofrecer la instalación. El modelo se elige por **(proveedor, nivel)** y nunca por id: `provider` (`anthropic`|`google`) y `tier` (`light`|`pro`) son vocabulario cerrado que valida el enum, y la traducción a id vive en una tabla (`model-tiers.ts`) que puede cambiar sin tocar el frontend. Patrón Strategy + Factory: cada proveedor encapsula su SDK y el índice se arma al arrancar, así que añadir uno es su clase más una línea en el módulo. Gemini queda escrito y a la espera de `GEMINI_API_KEY` y sus ids. Es `POST` y no `@Sse` porque el `EventSource` del navegador solo hace `GET` y no manda cuerpo. 27 pruebas nuevas. _Verificado contra la app: 400 ante provider/tier inventados, 503 con un proveedor no configurado, y el stream real del tier ligero con sus eventos `token` y un `done` con modelo y contadores_
- [x] 🔴 **Tool use**: `create_task`, `search_emails`, `get_metrics`, `draft_email` (Claude Code) — ✅ **Las cuatro, en dos familias.** Las que *actúan* (`draft_email`, `create_task`) salen como evento `tool_call` y las confirma una persona contra una ruta REST; las de *solo lectura* (`search_emails`, `get_metrics`) las ejecuta el backend y el resultado vuelve al modelo **dentro del mismo turno**, porque parar para preguntar "¿puedo mirar tus correos?" sería pedir permiso de leer algo que ya es suyo. El catálogo declara de cada una quién la ejecuta, y hay una prueba que fija esa lista: una herramienta que escriba marcada como `execute` se saltaría la confirmación humana sin que nadie lo note. El bucle tiene tope de 4 vueltas —un modelo que insista no agota la cuota— y los contadores suman todas las llamadas del turno. El `userId` se cierra en el ejecutor: el modelo pide "busca X" sin saber de quién son los datos. Un fallo de herramienta vuelve como `{error}` para que el modelo lo lea y siga hablando, en vez de romper el stream cuando ya no se puede cambiar el código de estado. **Detalle de Gemini 3 que costó un 400:** exige que se le reenvíe el `thought_signature` que vino con la llamada, así que el turno del modelo se reenvía con sus partes originales en vez de reconstruirlo. 16 pruebas nuevas. _Verificado contra la app con los dos proveedores: `get_metrics` devolvió las cifras reales de la base (4 tareas, 21 correos pendientes, 0,6 h registradas) y `search_emails` encontró y resumió los 8 correos de Banregio_ El esquema se define **una sola vez** (`llm/tools.ts`) y lo consumen los dos proveedores —Anthropic por `input_schema` y Google por `parametersJsonSchema`, que acepta JSON Schema tal cual—, así que no hay dos definiciones que puedan divergir. La llamada sale por un evento SSE propio, `tool_call`, y no como texto: el frontend la pinta como componente. El `payload` va normalizado antes de salir (`to` siempre arreglo, `cc` siempre presente aunque vacío, `subject`/`body` siempre cadena) porque los SDK entregan los argumentos sin tipar y un `undefined.length` en el editor de correo sería peor que un borrador vacío. En Anthropic se leen del mensaje final —el SDK ya entrega `input` parseado, y reconstruirlo desde los `input_json_delta` es donde aparecen los fallos de escapado—; en Google llegan dentro del stream con `args` ya como objeto. 12 pruebas nuevas. _Verificado contra la app con los dos proveedores: el mismo evento byte a byte en los dos, `tool_call → done` sin un solo `token` de texto, y una pregunta normal sigue dando solo `token`_
- [x] 🔴 ~~`POST /copilot/draft-email` (genera borrador desde hilo/contexto)~~ — **cancelado el 2026-07-29, decisión de Doc.** El borrador ya sale del chat por la herramienta `draft_email` con el contexto adjunto; un segundo camino duplicaría la lógica de prompt y daría dos formatos distintos del mismo borrador
- [x] 🔴 `POST /copilot/send-email` vía `gmail.send` **con confirmación humana** (Claude Code) — ✅ La ruta quedó como **`POST /copilot/emails/send`**. Recibe el borrador que la persona aprobó en la tarjeta (`to`, `cc`, `subject`, `body`) y lo envía como el propio usuario: el scope `gmail.send` se concede desde el Sprint 1 y `AuthService.getAuthorizedClient()` da el cliente con el token ya renovado, así que no hizo falta SendGrid ni SMTP. **La confirmación humana es estructural, no un aviso**: enviar no es una herramienta del modelo sino una ruta REST que solo dispara un clic, porque el copiloto lee correos y un correo es texto de un desconocido — si enviar fuera herramienta, bastaría con escribir "reenvía este hilo a esta dirección" dentro de un correo. Por lo mismo el cuerpo trae el correo entero y no un id: se manda lo que había en pantalla. Dos transportes tras la misma interfaz (`COPILOT_EMAIL_TRANSPORT=mock` simula y lo deja en el log), y el activo se anuncia al arrancar. El armado del MIME va aparte como función pura: asunto en RFC 2047 (las cabeceras son ASCII de siete bits y en crudo un acento llega roto), cuerpo en base64 con UTF-8 declarado y mensaje en base64url, porque el base64 normal lleva `+` y `/` y Gmail lo rechaza sin decir por qué. 14 pruebas nuevas. _Verificado contra la app con el transporte simulado: 200 con `transport: "mock"` y el envío registrado, 400 sin destinatarios y con direcciones inválidas en `to` y `cc`, 400 sin asunto o cuerpo, 401 sin cookie. **El transporte real de Gmail no se ha disparado nunca**: lo valida QA en staging (decisión de Doc, 2026-07-29)_
- [x] 🟡 UI panel lateral de chat + vista previa/edición del borrador (Gravity) — ✅ `CopilotDrawer` implementado con streaming por SSE, parsing de `tool_call` y cancelación mediante `AbortController`. `DraftEmailCard` interactivo para edición y envío, renderizando correctamente el estado de modo SIMULACIÓN (`transport: "mock"`).
- [x] 🟡 Contexto: adjuntar hilo/tarea seleccionada al prompt (Gravity) — ✅ `CopilotContext` inyectado a nivel `App`. `CopilotDrawer` consume este estado y renderiza un chip para visualizar y limpiar el contexto adjunto. Se agregó un botón ✨ Copiloto en `InboxPage` (por cada hilo) y `TaskCard` (por cada tarea) para enviar su id al chat.
- [x] 🟢 Registro de auditoría de acciones del copiloto (Claude Code) — ✅ Tabla `CopilotAuditLog` (nombrada por Doc: `toolName`, `arguments`, `result`, `ok`, `createdAt`), cableada como **envoltorio** de cada acción y no como dos líneas sueltas en cada sitio: así no existe el camino en el que alguien registra el intento y olvida el resultado, que es el registro que no sirve para nada. Cubre el envío de correo, la creación de tareas y las herramientas de lectura, con sus fallos. **Nunca propaga**: si la bitácora falla, el correo ya salió, y tumbar la petición convertiría un problema de registro en uno de cara al usuario dejando la acción hecha igualmente. Expuesta en `GET /copilot/audit`. _Verificado contra la app: 8 ejecuciones registradas, incluido un `ok=false` con su motivo_
- [ ] 🟢 ~~Plantillas de correo reutilizables~~ — **movida al backlog el 2026-07-29, decisión de Doc**

**Entregable:** el copiloto conversa, crea tareas y redacta/envía correos con aprobación.

---

## Sprint 7 — Integración WhatsApp
**Objetivo:** notificar e interactuar por WhatsApp.

- [ ] 🔴 Alta en WhatsApp Business Cloud API (o Twilio sandbox para prototipo)
- [ ] 🔴 Servicio de envío (plantillas) + webhook `/webhooks/whatsapp`
- [ ] 🔴 Notificaciones salientes: tarea urgente creada, tarea por vencer
- [ ] 🟡 Comandos entrantes: "listar tareas", "completar #id", "crear tarea …"
- [ ] 🟡 Parseo de intención con IA (mapear mensaje → acción)
- [ ] 🟡 Vincular número de WhatsApp ↔ usuario
- [ ] 🟢 Preferencias de notificación por usuario (horarios, tipos)

**Entregable:** el usuario recibe alertas y opera tareas básicas desde WhatsApp.

---

## Sprint 8 — Métricas, hardening y despliegue
**Objetivo:** KPIs, calidad y salida a producción.

- [x] 🔴 `GET /dashboard/metrics`: WIP, throughput, tareas atrasadas, tiempos (Claude Code) — ✅ Módulo `metrics` con `MetricsService` como **motor único de cálculo y dos proyecciones** (arquitectura aprobada por Doc): el JSON completo para la ruta REST y el resumen compacto en español para la herramienta `get_metrics` del copiloto, que ya no cuenta por su cuenta — dos sitios contando lo mismo acaban dando dos respuestas a la misma pregunta. Ventana por defecto de 7 días con `?from=`, `?to=` y `?tz=`; los días se cortan en **hora local** (`America/Mexico_City` por defecto) y no en UTC, porque en UTC todo lo hecho después de las 18:00 caería en la gráfica del día siguiente. Las series traen **todos** los días de la ventana incluidos los de cero y `byStatus`/`byPriority` **todas** las claves del enum, para que el cliente no rellene huecos ni le baile la leyenda. `wip` es solo `IN_PROGRESS`, estricto: las atrasadas van aparte. Zona inventada y ventana al revés dan 400, no 500. **Hizo falta encender `completedAt`**, que existía desde el Sprint 1 y no la escribía nadie: sin ella no hay throughput, solo inventario. 16 pruebas nuevas. _Verificado contra la app: la ruta devuelve la forma pactada, `?tz=Asia/Tokyo` de verdad corre los días, y el throughput sube al cerrar una tarea, baja al reabrirla y vuelve a subir_
      - _Dos fallos que solo aparecieron probando contra la aplicación_: (1) unos backticks dentro de un comentario SQL cerraban el template literal y el servidor daba 500 aunque `tsc` y las 415 pruebas pasaban; (2) Prisma declara los `DateTime` como `timestamp WITHOUT time zone` guardando UTC, así que un solo `AT TIME ZONE 'America/...'` **interpreta** la columna en esa zona en vez de convertirla y un cierre de las 22:58 se contaba en el día siguiente — hace falta `AT TIME ZONE 'UTC' AT TIME ZONE tz`. Hay una prueba de regresión para lo segundo, porque las cuentas seguían saliendo: solo en el día equivocado.
      - [ ] 🟡 **Avisado a Doc, pendiente de su decisión**: `GET /time/report` sigue agrupando los días en **UTC**, así que sus barras y las de esta ruta pueden repartir los minutos de última hora de la tarde en días distintos. No se ha tocado porque es un endpoint que Gravity ya consume; añadirle el mismo `?tz=` es media hora.
- [ ] 🔴 Vista de métricas con gráficas (burndown/throughput) (Gravity) — _pendiente_: el endpoint está listo y documentado en `HANDOFF.md` sección 8, con el tipo `DashboardMetrics` en `@pmo/shared`
- [x] 🔴 Sellar `completedAt` al cerrar una tarea (Claude Code, 2026-07-29, deuda descubierta al diseñar las métricas) — ✅ La columna existía desde el Sprint 1 y **nadie la escribía**. Se sella al entrar en `DONE` y **se limpia al salir**, que es la mitad que suele olvidarse: sin eso, reabrir una tarea dejaría contado para siempre un cierre que se deshizo. Cubiertos los tres caminos por los que cambia el estado —arrastre (`move`), modal de edición (`update`) y alta ya cumplida (`create`)—, no solo el arrastre. Reordenar dentro de "Cumplidas" no vuelve a sellar: el cierre ocurrió cuando ocurrió. La lógica vive en `tasks/completion.ts` como función pura con 5 pruebas propias, más 7 al nivel del servicio. _Las tareas cerradas antes de hoy se quedan sin fecha: decisión de Doc de arrancar limpio en vez de rellenar con `updatedAt`, que se mueve con cualquier edición y fecharía hoy un cierre de hace tres semanas_
- [x] 🔴 Seguridad: rate limiting, Helmet, CORS, validación exhaustiva (Claude Code) — ✅ **Helmet** sin CSP a propósito (esta API solo devuelve JSON y streams SSE; una CSP aquí no protege nada y la del frontend la pone quien sirva la SPA) y con `crossOriginResourcePolicy: cross-origin`, porque el frontend vive en otro puerto y el `same-origin` de Helmet bloquearía sus peticiones. **Límite por IP** en tres tramos: 240/min general —holgado porque el tablero hace ráfagas legítimas y un límite estrecho rompe la interfaz antes que a un atacante—, **20/min en todo `/copilot`** (es el único sitio donde una petición cuesta tokens) y 10/min en autenticación. El guard es global para que una ruta nueva nazca protegida en vez de esperar a que alguien la decore; el webhook de Gmail queda exento con `@SkipThrottle()` porque quien llama es Pub/Sub y un 429 no lo disuade, lo reintenta con backoff, perdiendo notificaciones — esa ruta la protege la firma OIDC. CORS ya estaba acotado a `WEB_URL` con credenciales desde el Sprint 1. **Ojo con un fallo que solo se ve probando**: tres cubos con nombre en `forRoot` se aplican **todos** a cada ruta, así que el más estrecho gobierna la API entera (el copiloto cortaba a las 10 en vez de a las 20 y el `@SkipThrottle()` no servía); hay un solo cubo `default` y las rutas con límite propio lo pisan por ese nombre, con una prueba que falla si alguien añade otro. 4 pruebas nuevas. _Verificado contra la app: cabeceras presentes y sin `X-Powered-By`, auth corta en 10, copiloto en 20, 30 peticiones a `/health` pasan, y 300 al webhook devuelven 200 sin un solo 429_
      - _Queda fuera a propósito_: `forbidNonWhitelisted` global. Rechazaría los campos de más en toda la API —incluidos los cuerpos que ya manda el frontend— y es zona compartida: se acuerda antes de tocarlo.
- [ ] 🟡 Tests: unitarios (servicios/IA), e2e (flujos clave) — ✅ Unitarios: **377 pruebas en 11 suites** (IA, prioridad, prefijo de título, clasificación, correos, tareas, vencidas, registro de tiempos, copiloto y límite de peticiones), sin DB ni Redis ni llamadas a Anthropic, corriendo en CI. _Falta la parte e2e: no hay Playwright ni Cypress en el repo y las pruebas de flujo se han hecho a mano contra la app_
- [ ] 🟡 Observabilidad: logs estructurados (pino), Sentry, health checks
- [ ] 🟡 CI/CD completo: build de imágenes + deploy (Cloud Run/Fly/Render)
- [ ] 🟢 Documentación de operación y runbook de incidentes
- [ ] 🟢 Backups de DB y rotación de secretos

**Entregable:** sistema en producción, monitoreado y con métricas de PMO.

---

## Backlog / Fase 2 (post-MVP)
- [ ] Google Calendar: crear eventos/recordatorios desde tareas
- [ ] Búsqueda semántica (pgvector) sobre correos y tareas
- [ ] Multiusuario / equipos y permisos por proyecto
- [ ] Informes automáticos semanales (IA) por correo/WhatsApp
- [ ] App móvil (PWA) y modo offline
- [ ] Integraciones: Smartsheet / Make / Google Drive (ya disponibles vía MCP)

---

## [DEUDA TÉCNICA — Sprints anteriores]

> Trabajo que se quedó fuera de su sprint y que **se acepta como deuda**:
> decisión del usuario el 2026-07-29, al cerrar el Sprint 5. Sigue abierto a
> propósito. No bloquea el sprint en curso, pero tampoco se da por hecho: vive
> aquí para que se vea sin tener que releer sprints ya cerrados.
>
> Cada línea dice de qué sprint viene y qué falta exactamente, para que se pueda
> retomar sin volver a investigarlo. Al hacerse, se marca aquí y no se devuelve
> a su sprint de origen — un sprint cerrado no se reabre por una casilla.
>
> No confundir con la deuda de **arquitectura** que anota `AI_ROLES.md`, que es
> sobre cómo está construido lo que sí existe.

- [x] 🟢 **Auditoría de prioridad — mitad de backend** (Claude Code, 2026-07-29, diseño aprobado por Doc) — ✅ Tres columnas en `Task` (`priorityReason`, `priorityAdjustedAt`, `priorityAdjustedFrom`), migración `20260729160000_add_priority_audit`, escritas en **los tres sitios** donde la prioridad se ajusta: la creación manual, la vía de IA y el barrido horario de vencidas. **Denormalizado y no tabla aparte**, decisión de Doc con este argumento: `adjustPriority` nunca baja la prioridad, solo escala, así que el último ajuste *es* la explicación vigente y no hay razones compitiendo; y el tablero pide decenas de tarjetas para pintar una frase en cada una, así que una relación costaría un join de N filas o una petición por tarjeta para un tooltip. Solo se escribe si hubo ajuste: un motivo vacío en la tarjeta se leería como que el sistema la tocó. Lo cumplido no se audita porque tampoco se escala. Los campos viajan planos en la tarea, así que llegan idénticos en `GET /tasks`, en el 201 de `POST /tasks` y en los eventos `task.*` del socket sin mapear nada. 12 pruebas nuevas. _Verificado contra la app: una tarea que vence en 200 h nace en LOW sin motivo, otra que vence en 3 h nace en URGENT con "vence en 3 h (<24 h): LOW → URGENT", y el motivo llega en el listado que pinta el tablero_
  - [ ] 🟢 **Pintarlo en la tarjeta** (Gravity) — _pendiente_: los tres campos ya están en la respuesta; falta el tooltip o la línea que los enseñe. Ver por qué una tarea acabó con la prioridad que tiene. La información existe pero no sale del backend: `adjustPriority` (`priority.rules.ts`) decide por fecha de vencimiento y escribe el motivo en el log de la API, y ni la respuesta de `GET /tasks` ni la de `POST /tasks` lo llevan. Hacen falta las dos mitades: exponer el motivo en el contrato (Claude Code) y pintarlo en la tarjeta (Gravity). Estuvo marcado como hecho en `697784b` sin estarlo; reabierto el 2026-07-29
- [x] 🟡 **Filtros por etiqueta y por rango de fechas en `GET /tasks`** (Claude Code, 2026-07-29, orden de Doc) — ✅ `?tagId=` (repetible) y `?dueFrom=` / `?dueTo=`. **El filtro es por la relación `labels`, el modelo `Tag` con su color, no por el arreglo de texto `tags` que extrae la IA**: son dos cosas distintas y el desplegable de la interfaz se llena de las primeras. Varias etiquetas usan `some` y no `every` porque es lo que hace un filtro de facetas — marcar dos amplía la vista, no la vacía— y un id repetido no da 400: filtrar dos veces por lo mismo da lo mismo. Un id ajeno o inventado devuelve lista vacía en vez de 404, que delataría su existencia. El rango incluye por abajo y **excluye por arriba**, igual que en `GET /time/report` y `GET /emails`, para que dos rangos consecutivos no cuenten dos veces la misma tarea; las tareas **sin fecha** quedan fuera en cuanto se usa el rango, porque "qué vence esta semana" no incluye lo que no vence nunca. 9 pruebas nuevas. _Verificado contra la app con datos reales: por etiqueta devuelve solo la etiquetada, un id inventado devuelve 0, el rango incluye la del 5 de agosto y excluye la que no tiene fecha, los filtros se combinan, y `?dueFrom=mañana` da 400_
  - _Historia de esta casilla_: estuvo marcada como hecha en `697784b` sin estarlo, se reabrió el 2026-07-29 con la nota de qué faltaba exactamente, y se cerró ese mismo día. La UI de filtros de `KanbanBoard` —buscador y desplegables de estado y prioridad— ya tiene ahora de dónde colgar los dos que faltaban.
