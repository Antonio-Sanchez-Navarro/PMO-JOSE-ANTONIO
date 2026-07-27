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

- [x] 🔴 Módulo AI: `@anthropic-ai/sdk`, prompts y JSON Schemas (Zod o raw JSON) — ✅ `AiService` con salida estructurada vía tool use y `strict: true` (esquema con `additionalProperties: false`); el modelo se lee de `CLAUDE_MODEL_CLASSIFY`
- [x] 🔴 Worker `classify-email`: Lee de la DB, envía a Claude y clasifica `isActionable` — ✅ `AiProcessor`; lo alimenta `GmailService.persistEmails`, que encola tras cada upsert
- [x] 🔴 Generación de Tareas: crear entidades `Task` (con `priority`, `tags`, etc.) si es accionable — ✅ `prisma.task.createMany` dentro de una transacción junto al `update` del `Email`. Extrae también `dueDate`
- [x] 🟡 Crear `Task` desde correo de forma idempotente (sin duplicar) — ✅ Guard por `Email.processedAt` + transacción atómica
- [x] 🟡 Capa determinista de ajuste de prioridad (heurísticas + `aiConfidence`) — ✅ `priority.rules.ts`: función pura que ajusta **solo por fecha de vencimiento** (<24 h ⇒ `URGENT`, <72 h ⇒ `HIGH`) y **nunca baja** lo que dijo el modelo. Una tarea ya vencida cuenta como <24 h. Se aplica en `EmailClassificationService` antes de persistir y cada ajuste se registra en el log con su motivo. 15 pruebas en `priority.rules.spec.ts` + 3 de integración. _Con `aiConfidence < 0.5` se escala igual porque el único disparador es la fecha, que es un dato del calendario y no una interpretación del modelo; el umbral queda explícito por si se añaden otras señales_
- [x] 🟡 Endpoint manual `POST /emails/:id/to-task` — ✅ `EmailsModule`: 201 con las tareas creadas, 404 si el correo no es del usuario, 409 si ya tenía tareas (`"force": true` para insistir). Con `title` es manual puro (sin coste de IA); sin él, la IA analiza forzando `isActionable`. Comparte `EmailClassificationService` con el worker
- [ ] 🟢 Panel de auditoría: ver por qué se asignó una prioridad — _no existe en el frontend_
- [x] 🟢 Tests de extracción con correos de ejemplo (fixtures) — ✅ Jest configurado (`jest.config.js` + `tsconfig.spec.json`) y 39 pruebas en 3 suites: `ai.service.spec.ts`, `email-classification.service.spec.ts`, `emails.service.spec.ts`. Fixtures en `modules/ai/__fixtures__/`, con capturas reales de las salidas corruptas del modelo como regresión. Sin DB, Redis ni llamadas a Anthropic; corren en ~4 s y ya van en CI

**Entregable:** un correo relevante genera automáticamente una tarea con prioridad.

---

## Sprint 4 — Dashboard Kanban + creación de tareas
**Objetivo:** tablero interactivo con las 5 columnas y CRUD directo.

- [x] 🔴 CRUD Tasks (`GET/POST/PATCH/DELETE /tasks`) — ✅ Los cuatro verbos en `TasksController`. `GET` ordena por `status` (orden del enum) y `position`. `POST` devuelve 201 con la tarea creada sin envoltorio, la coloca al final de su columna, fuerza `source: MANUAL` y aplica las mismas reglas que el cron (escalado por fecha y nacer en `OVERDUE` si la fecha ya pasó). `DELETE` devuelve 204 y filtra por `userId` (404 si es de otro). _Pendiente en el frontend: `createTask`/`deleteTask` de `tasks.api.ts` siguen siendo mocks_
- [x] 🔴 Columnas: **Por hacer · En proceso · Pospuestas · Cumplidas · Atrasadas** — ✅ Las cinco columnas están en `KanbanBoard`
- [x] 🔴 Drag & drop con `@dnd-kit` + `PATCH /tasks/:id/move` (status+position) — ✅ **Completado**: El frontend ahora consume el endpoint, implementa UI optimista y se reconcilia sin efecto boomerang usando `MoveTaskResponse`.
- [x] 🔴 Job cron: marcar `OVERDUE` (dueDate vencido) — ✅ `OverdueModule`: job repetible de BullMQ (cola `overdue-sweep`, patrón en `OVERDUE_CRON`, por defecto cada hora en el minuto 5, más un barrido al arrancar). Mueve a `OVERDUE` las tareas vencidas en `TODO`/`IN_PROGRESS`/`POSTPONED` anexándolas al final de la columna; una transacción por usuario y relectura dentro para no pisar cambios del tablero. En la misma pasada **reevalúa la prioridad** con `adjustPriority` (Sprint 3), así que una tarea sube sola conforme se acerca su fecha. 16 pruebas en `overdue.service.spec.ts`
- [ ] 🟡 Modal de creación/edición (React Hook Form + Zod) — _`TaskModal.tsx` ya existe, pero el `POST /tasks` que necesita no está implementado_
- [ ] 🟡 Filtros (prioridad, etiqueta, fecha) y búsqueda — ✅ En la API: `GET /tasks?status=&priority=&search=&skip=&take=`. `search` busca en título y descripción con `mode: 'insensitive'` (ILIKE). La validación vive en `QueryTasksDto`, así que un enum inválido da 400 y no un 500 desde Prisma. _Faltan el filtro por etiqueta y por rango de fechas, y la UI de filtros (frontend)_
- [ ] 🟡 Realtime: `socket.io` emite `task.*` → UI se actualiza sin recargar — ✅ Infraestructura lista: `TasksGateway` emite `task.created` (tarea completa) y `task.deleted` (`{ id, status, userId }`). _Faltan: eventos de `PATCH` y de `move`, **salas por usuario** y autenticación del handshake —hoy el broadcast es global y sin autenticar—, y el consumo en el frontend_
- [ ] 🟢 Badges de prioridad, indicador de origen (correo/WhatsApp/manual) — _la columna `Task.source` ya está en la API; falta pintarla en la tarjeta_

**Entregable:** tablero Kanban funcional, con creación directa y movimiento por columnas.

---

## Sprint 5 — Registro de tiempos (Time Tracking)
**Objetivo:** medir tiempo dedicado por tarea y reportar.

- [ ] 🔴 Modelo `TimeEntry` + endpoints `POST /time/start` · `/time/stop`
- [ ] 🔴 Un solo timer activo por usuario (validación)
- [ ] 🟡 UI: botón start/stop en tarjeta + cronómetro visible
- [ ] 🟡 Registro manual de tiempo (edición de entradas)
- [ ] 🟡 Reporte `GET /time/report` (por tarea/día/semana)
- [ ] 🟢 Gráfica de tiempos (Recharts) en el dashboard

**Entregable:** el usuario mide y consulta el tiempo invertido por tarea.

---

## Sprint 6 — Copiloto de IA (chat + redacción de correos)
**Objetivo:** asistente embebido que actúa sobre el sistema y redacta correos.

- [ ] 🔴 `CopilotModule`: chat con streaming (SSE) y persistencia de hilos
- [ ] 🔴 **Tool use**: `create_task`, `search_emails`, `get_metrics`, `draft_email`
- [ ] 🔴 `POST /copilot/draft-email` (genera borrador desde hilo/contexto)
- [ ] 🔴 `POST /copilot/send-email` vía `gmail.send` **con confirmación humana**
- [ ] 🟡 UI panel lateral de chat + vista previa/edición del borrador
- [ ] 🟡 Contexto: adjuntar hilo/tarea seleccionada al prompt
- [ ] 🟢 Registro de auditoría de acciones del copiloto
- [ ] 🟢 Plantillas de correo reutilizables

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

- [ ] 🔴 `GET /dashboard/metrics`: WIP, throughput, tareas atrasadas, tiempos
- [ ] 🔴 Vista de métricas con gráficas (burndown/throughput)
- [ ] 🔴 Seguridad: rate limiting, Helmet, CORS, validación exhaustiva
- [ ] 🟡 Tests: unitarios (servicios/IA), e2e (flujos clave)
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
