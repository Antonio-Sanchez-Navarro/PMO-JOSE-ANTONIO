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

- **El cron de vencidas vive en Redis, no en el proceso.** `OverdueModule`
  programa un job repetible de BullMQ (`overdue-sweep`) en vez de usar un
  `@Cron` de `@nestjs/schedule`: con varias instancias de la API, un cron en
  proceso correría en todas a la vez. Si hacen falta más tareas programadas,
  seguir el mismo patrón (`overdue.scheduler.ts` como plantilla).

  El barrido es **de ida**: una tarea que pasa a `OVERDUE` pierde de qué columna
  venía. Si el usuario aplaza la fecha, saca la tarjeta arrastrándola.

## Deuda técnica anotada

- ~~**Origen de la tarea**: etiqueta `'manual'` en `tags[]` como apaño~~ —
  **saldada el 2026-07-27**: existe la columna `Task.source`
  (`EMAIL` | `WHATSAPP` | `MANUAL`) y el reproceso automático filtra por ella.
  Falta solo pintar el indicador en la tarjeta del tablero (Gemini).
