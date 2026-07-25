# Roles de los agentes de IA — PMO Dashboard

> **Lee este archivo al inicio de cada sesión.** Define quién toca qué para
> evitar conflictos de Git y pérdida de trabajo entre los dos agentes que
> operan sobre este repositorio.

## Agentes

| Agente | Dónde corre |
|---|---|
| **Claude** | Terminal (Claude Code) |
| **Gemini** | IDE |

---

## Dominio de Claude — backend profundo

- **Workers y colas** (BullMQ): `gmail.processor.ts`, `ai.processor.ts`,
  `dead-letter/`, configuración de reintentos y backoff.
- **Prisma**: `schema.prisma`, migraciones, scripts de datos y limpieza de DB.
- **Tubería de IA**: `modules/ai/` — prompts, JSON Schemas, parseo y validación
  de la salida del modelo.
- **Pruebas unitarias**: todos los `.spec.ts` y sus fixtures.
- **Lógica core del backend**: servicios de dominio que no son CRUD
  (`GmailService`, `AuthService`, `CryptoService`, guards, integraciones).

## Dominio de Gemini — frontend y capa REST

- **Frontend** completo: `apps/web/` — React, componentes, hooks, routing.
- **UI/UX**: Tailwind, layout, estados de carga/error/vacío.
- **Estado en cliente**: React Query, hooks de sesión, caché.
- **Capa REST de NestJS**: controladores, DTOs y servicios CRUD
  (p. ej. `modules/tasks/`).

---

## Regla estricta

**Ningún agente modifica archivos fuera de su dominio.** Si un cambio requiere
tocar el dominio del otro, se documenta aquí como excepción acordada antes de
escribir código.

## Zona compartida — coordinar antes de tocar

Estos archivos los necesitan ambos; avisar antes de editarlos:

- `apps/api/src/app.module.ts` (registro de módulos)
- `TASKS.md`, `ARCHITECTURE.md`, `HANDOFF.md`, este archivo
- `package.json` de la raíz y de los workspaces
- `.env` / `.env.example`

## Excepciones vigentes

- **`POST /emails/:id/to-task`** (Sprint 3): es un controlador, pero lo
  implementa **Claude** porque su lógica es la tubería de IA (reusar
  `AiService` + creación idempotente de `Task`). Pendiente de confirmación:
  si Gemini prefiere quedárselo, Claude expone el servicio y Gemini el
  controlador.
