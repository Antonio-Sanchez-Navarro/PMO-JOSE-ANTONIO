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

- **`modules/emails/`** (`POST /emails/:id/to-task`, Sprint 3): es capa REST,
  pero lo implementa **Claude** — acordado con el usuario el 2026-07-25 — porque
  su lógica es la tubería de IA. **Gemini: no editar este módulo.** Si el
  frontend necesita otro campo en la respuesta, pídelo en vez de tocarlo.

  El servicio compartido `modules/ai/email-classification.service.ts` es el
  único sitio donde se analiza y persiste un correo; lo usan tanto el worker
  como el endpoint. No dupliques esa lógica en `TasksService`.

## Deuda técnica anotada

- **Origen de la tarea**: hoy las tareas creadas a mano llevan la etiqueta
  `'manual'` en `tags[]`, y el reproceso automático las respeta filtrando por
  esa etiqueta (`MANUAL_TAG` en `email-classification.service.ts`). Es un apaño
  para no meter una migración a mitad de sprint. Lo correcto es la columna
  `Task.source` ('email' | 'whatsapp' | 'manual') que el Sprint 4 ya contempla
  en "indicador de origen". **Al implementarla, sustituir el filtro por etiqueta.**
