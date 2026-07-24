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

- [ ] 🔴 Crear proyecto en Google Cloud Console + habilitar Gmail API — _acción del usuario_
- [ ] 🔴 Configurar pantalla de consentimiento OAuth y credenciales — _acción del usuario_
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

- [x] 🔴 Servicio Gmail: `messages.list/get`, parseo de cuerpo y headers — ✅ Implementado `getInbox`
- [ ] 🔴 Sincronización inicial (backfill) + `historyId`
- [x] 🔴 `users.watch` + Pub/Sub topic/subscription — ✅ Implementado en `GmailService.watchInbox` y documentado en `GCP_SETUP.md`
- [x] 🔴 Webhook `/webhooks/gmail` con verificación de firma — ✅ Implementado en `GmailController` y encolado seguro por base64
- [x] 🔴 Cola BullMQ: `sync-history` y `process-email` (idempotentes) — ✅ Implementado `GmailProcessor` y encolado en `gmail-sync`
- [ ] 🟡 Normalización y deduplicación (por `gmailMessageId`)
- [x] 🟡 Persistir `Email` con `threadId`, labels y snippet — ✅ Implementado `prisma.email.upsert` en `GmailService.syncHistory`
- [x] 🟡 Frontend: vista **Inbox** agrupada por hilo/etiqueta — ✅ `InboxPage` + hook `useInbox`: agrupa por `threadId` con hilos desplegables, estados de carga/error/vacío. _Falta agrupar por etiqueta: `GET /gmail/inbox` todavía no devuelve `labels`._
- [ ] 🟢 Reintentos y dead-letter en colas

**Entregable:** los correos nuevos aparecen en la app clasificados por hilo/etiqueta.

---

## Sprint 3 — IA: extracción de tareas y prioridad automática
**Objetivo:** convertir correos accionables en tareas priorizadas.

- [ ] 🔴 `AiModule` con cliente Anthropic Claude + config de modelos
- [ ] 🔴 Prompt + **salida estructurada (JSON Schema)** para clasificar/extraer
- [ ] 🔴 Job `classify-email`: categoría, `isActionable`, tareas, prioridad, due date
- [ ] 🟡 Capa determinista de ajuste de prioridad (heurísticas + `aiConfidence`)
- [ ] 🟡 Crear `Task` desde correo de forma idempotente (sin duplicar)
- [ ] 🟡 Endpoint manual `POST /emails/:id/to-task`
- [ ] 🟢 Panel de auditoría: ver por qué se asignó una prioridad
- [ ] 🟢 Tests de extracción con correos de ejemplo (fixtures)

**Entregable:** un correo relevante genera automáticamente una tarea con prioridad.

---

## Sprint 4 — Dashboard Kanban + creación de tareas
**Objetivo:** tablero interactivo con las 5 columnas y CRUD directo.

- [ ] 🔴 CRUD Tasks (`GET/POST/PATCH/DELETE /tasks`)
- [ ] 🔴 Columnas: **Por hacer · En proceso · Pospuestas · Cumplidas · Atrasadas**
- [ ] 🔴 Drag & drop con `@dnd-kit` + `PATCH /tasks/:id/move` (status+position)
- [ ] 🔴 Job cron: marcar `OVERDUE` (dueDate vencido)
- [ ] 🟡 Modal de creación/edición (React Hook Form + Zod)
- [ ] 🟡 Filtros (prioridad, etiqueta, fecha) y búsqueda
- [ ] 🟡 Realtime: `socket.io` emite `task.*` → UI se actualiza sin recargar
- [ ] 🟢 Badges de prioridad, indicador de origen (correo/WhatsApp/manual)

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
