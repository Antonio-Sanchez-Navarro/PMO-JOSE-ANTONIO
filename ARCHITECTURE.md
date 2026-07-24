# PMO Dashboard — Arquitectura Técnica

> Sistema de Gestión de Proyectos (PMO) integrado con Google Workspace (Gmail),
> WhatsApp y un Copiloto de IA. Documento de diseño técnico de referencia.

**Versión:** 1.0 · **Fecha:** 2026-07-24 · **Autor:** Arquitectura / Tech Lead

---

## 1. Visión general

El PMO Dashboard es una plataforma web que centraliza la operación de un director/equipo de proyecto:

1. **Ingesta de correo (Gmail):** lee, clasifica por hilos/etiquetas y analiza el contenido.
2. **Extracción de tareas con IA:** convierte correos en tareas accionables con **prioridad automática**.
3. **Dashboard web interactivo:** tablero **Kanban** (Por hacer · En proceso · Pospuestas · Cumplidas · Atrasadas), **registro de tiempos** y **creación directa** de tareas.
4. **WhatsApp:** notificaciones salientes e interacción entrante (comandos/respuestas).
5. **Copiloto de IA:** asistente embebido en la web para conversar, resumir hilos y **redactar/enviar correos** automáticos.

### Principios de diseño
- **Monorepo** con frontend y backend desacoplados por API REST + WebSocket.
- **Event-driven** para el correo: Gmail → Pub/Sub → cola de trabajos → clasificación IA.
- **Idempotencia** en la ingesta (un correo nunca genera tareas duplicadas).
- **Seguridad primero:** OAuth2 con tokens cifrados en reposo, secretos fuera del repo.
- **IA como servicio interno** aislado detrás de una interfaz (fácil de cambiar de modelo/proveedor).

---

## 2. Stack tecnológico sugerido

### Frontend (Web)
| Componente | Elección | Motivo |
|---|---|---|
| Framework | **React 18 + TypeScript** | Ecosistema, tipado, mantenibilidad |
| Build | **Vite** | Dev server rápido, HMR |
| UI | **TailwindCSS + shadcn/ui** | Diseño consistente y accesible |
| Kanban DnD | **@dnd-kit/core** | Drag & drop performante y accesible |
| Estado servidor | **TanStack Query** | Cache, refetch, sincronización |
| Estado cliente | **Zustand** | Ligero, sin boilerplate |
| Realtime | **socket.io-client** | Actualización viva del tablero |
| Gráficas | **Recharts** | KPIs, burndown, tiempos |
| Formularios | **React Hook Form + Zod** | Validación tipada |

### Backend (API)
| Componente | Elección | Alternativa |
|---|---|---|
| Runtime | **Node.js 20 + TypeScript** | Python 3.12 |
| Framework | **NestJS** (modular, DI) | Express / FastAPI (Python) |
| ORM | **Prisma** | TypeORM / SQLAlchemy |
| Base de datos | **PostgreSQL 16** | — |
| Cache / Cola | **Redis 7 + BullMQ** | Celery (Python) |
| Realtime | **socket.io** (Gateway) | — |
| Auth | **Google OAuth2 + JWT (sesiones)** | — |
| Validación | **Zod / class-validator** | — |

> **Recomendación:** Node.js/NestJS para todo el backend, así se comparten **tipos TypeScript**
> entre `web` y `api` vía `packages/shared`. Si el equipo es Python-first, sustituir `api` por
> **FastAPI + SQLAlchemy + Celery** manteniendo los mismos contratos REST.

### IA
| Componente | Elección |
|---|---|
| Modelos | **Anthropic Claude** — `claude-opus-4-8` (razonamiento complejo/redacción), `claude-sonnet-5` (clasificación/extracción por volumen), `claude-haiku-4-5` (tareas baratas y rápidas) |
| Patrón | Servicio `AiModule` con *tool use* (function calling) y salida **estructurada (JSON Schema)** |
| Embeddings (fase 2) | pgvector para búsqueda semántica sobre correos/tareas |

### Infra / DevOps
- **Docker + docker-compose** (dev): Postgres, Redis, api, web.
- **CI/CD:** GitHub Actions (lint, test, build, deploy).
- **Despliegue:** contenedores en Cloud Run / Fly.io / Render; DB gestionada.
- **Secretos:** Google Secret Manager / Doppler / `.env` (nunca en git).
- **Observabilidad:** logs estructurados (pino), Sentry, health checks.

---

## 3. Diagrama de arquitectura (lógico)

```
                         ┌──────────────────────────────────────────┐
                         │            NAVEGADOR (SPA React)          │
                         │  Kanban · Inbox · Time Tracking · Copiloto│
                         └───────────────┬───────────────┬──────────┘
                                REST/JSON │      WS       │
                                          ▼               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          BACKEND API (NestJS)                          │
│  Auth │ Gmail │ Tasks │ TimeTracking │ WhatsApp │ AI │ Copilot │ WS GW  │
└───┬─────────┬──────────┬──────────────┬───────────┬─────────────┬──────┘
    │         │          │              │           │             │
    ▼         ▼          ▼              ▼           ▼             ▼
┌────────┐┌────────┐┌─────────┐   ┌──────────┐ ┌─────────┐  ┌──────────────┐
│Postgres││ Redis  ││ BullMQ  │   │ WhatsApp │ │ Claude  │  │  Gmail API   │
│(Prisma)││(cache) ││(colas)  │   │Cloud API │ │  API    │  │  + Pub/Sub   │
└────────┘└────────┘└─────────┘   └──────────┘ └─────────┘  └──────────────┘
                         ▲                                          │
                         └──────── push notifications ─────────────┘
```

### Flujo de ingesta de correo (event-driven)
```
Gmail (nuevo correo)
   → Google Pub/Sub (watch push)
   → Webhook /webhooks/gmail (verifica firma)
   → Encola job "sync-history" (BullMQ)
   → Worker: history.list → fetch mensajes nuevos
   → Normaliza + deduplica (messageId, threadId)
   → Job "classify-email" → AiModule (Claude)
        · categoría / etiqueta
        · ¿es accionable? → extrae Tarea(s) + prioridad + due date
   → Persiste Email + Task (idempotente)
   → Emite evento WS "task.created" → UI actualiza Kanban
   → (opcional) Notifica por WhatsApp si prioridad ALTA
```

---

## 4. Modelo de datos (entidades núcleo)

```
User(id, email, name, googleTokens(cifrados), whatsappNumber, role, createdAt)

EmailAccount(id, userId, provider='gmail', historyId, watchExpiration)

Email(id, userId, gmailMessageId[uniq], threadId, from, to, subject,
      snippet, bodyText, labels[], receivedAt, category, isActionable,
      processedAt)

Task(id, userId, title, description, status[enum], priority[enum],
     dueDate, startedAt, completedAt, sourceEmailId?, sourceThreadId?,
     aiConfidence, tags[], position, createdAt, updatedAt)
     status  ∈ { TODO, IN_PROGRESS, POSTPONED, DONE, OVERDUE }
     priority∈ { LOW, MEDIUM, HIGH, URGENT }

TimeEntry(id, taskId, userId, startedAt, endedAt, durationSec, note)

Notification(id, userId, channel[web|whatsapp], type, payload, status, sentAt)

CopilotThread(id, userId, title, createdAt)
CopilotMessage(id, threadId, role[user|assistant|tool], content, createdAt)

WhatsAppMessage(id, userId, direction[in|out], waMessageId, body,
                intent, status, createdAt)
```

> **Estado `OVERDUE` (Atrasadas):** no se persiste manualmente; un **job programado**
> (cron cada 15 min) marca como `OVERDUE` toda tarea con `dueDate < now` y `status ∈ {TODO, IN_PROGRESS, POSTPONED}`.
> En la UI se puede mostrar como columna derivada o como badge.

---

## 5. APIs y servicios externos necesarios

### Google Cloud / Workspace
1. **Gmail API** — lectura de mensajes/hilos, etiquetas, envío de correos (`gmail.send`).
2. **Google OAuth 2.0 / Identity** — login y consentimiento; scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `openid email profile`
3. **Google Cloud Pub/Sub** — notificaciones *push* de Gmail (`users.watch`) para tiempo real.
4. *(Fase 2)* **Google Calendar API** — crear eventos/recordatorios desde tareas.

### IA
5. **Anthropic Claude API** — clasificación, extracción de tareas, priorización, copiloto y redacción de correos. Modelos: `claude-opus-4-8`, `claude-sonnet-5`, `claude-haiku-4-5`.

### WhatsApp
6. **WhatsApp Business Cloud API (Meta Graph API)** — envío de plantillas/mensajes y recepción vía webhook.
   - *Alternativa más rápida de integrar:* **Twilio API for WhatsApp** (sandbox para prototipo).

### Internas (expuestas por el backend)
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/auth/google` · `/auth/google/callback` | OAuth login |
| `GET` | `/tasks` · `POST /tasks` · `PATCH /tasks/:id` · `DELETE /tasks/:id` | CRUD tareas |
| `PATCH` | `/tasks/:id/move` | Mover de columna Kanban (status + position) |
| `GET` | `/emails` · `GET /emails/:id` | Inbox clasificado |
| `POST` | `/emails/:id/to-task` | Convertir correo en tarea (manual) |
| `POST` | `/time/start` · `POST /time/stop` · `GET /time/report` | Registro de tiempos |
| `POST` | `/copilot/messages` | Chat del copiloto (streaming SSE) |
| `POST` | `/copilot/draft-email` · `POST /copilot/send-email` | Redactar / enviar correo |
| `POST` | `/webhooks/gmail` | Push de Pub/Sub |
| `POST`/`GET` | `/webhooks/whatsapp` | Recepción y verificación de WhatsApp |
| `GET` | `/dashboard/metrics` | KPIs (throughput, WIP, tiempos) |

---

## 6. Módulo de IA — contratos

**Clasificación + extracción (salida estructurada):**
```jsonc
// Input: {subject, from, bodyText, threadContext?}
// Output (JSON Schema forzado):
{
  "category": "cliente | interno | proveedor | administrativo | spam",
  "isActionable": true,
  "summary": "Resumen en 1 frase",
  "tasks": [
    {
      "title": "…",
      "description": "…",
      "priority": "LOW | MEDIUM | HIGH | URGENT",
      "dueDate": "2026-07-30 | null",
      "confidence": 0.0-1.0
    }
  ]
}
```

**Reglas de priorización (prompt + heurística):** remitente clave, palabras de urgencia
("hoy", "urgente", "vencimiento"), fechas límite explícitas, si el hilo espera respuesta.
La IA propone; una capa determinista ajusta y registra `aiConfidence` para auditoría.

**Copiloto:** usa *tool use* con herramientas internas (`create_task`, `search_emails`,
`draft_email`, `get_metrics`) para actuar sobre el sistema, no solo conversar.

---

## 7. Seguridad y cumplimiento
- Tokens OAuth **cifrados** (AES-256-GCM) en la DB; nunca en el cliente.
- Verificación de firma en webhooks (Pub/Sub JWT, WhatsApp `X-Hub-Signature-256`).
- Rate limiting, CORS estricto, Helmet, validación de entrada en todo endpoint.
- Principio de mínimo privilegio en scopes de Gmail; opción de solo-lectura.
- Registro de auditoría de acciones del copiloto (especialmente envío de correos → **confirmación humana** antes de enviar por defecto).
- PII: retención configurable de cuerpos de correo; cifrado en reposo.

---

## 8. Roadmap por fases (resumen)
- **F0 – Fundaciones:** monorepo, Docker, auth Google, esquema DB.
- **F1 – Ingesta Gmail + IA:** watch/Pub/Sub, clasificación, extracción de tareas.
- **F2 – Kanban + Tiempos:** tablero DnD, CRUD, time tracking, realtime.
- **F3 – Copiloto:** chat, redacción y envío de correos, tool use.
- **F4 – WhatsApp:** notificaciones e interacción entrante.
- **F5 – Métricas + Hardening:** KPIs, tests, observabilidad, despliegue.

El desglose detallado por sprint está en [`TASKS.md`](./TASKS.md).
