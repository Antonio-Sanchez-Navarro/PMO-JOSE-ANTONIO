# Handoff — Cuarentena de clasificación (para Gravity)

> **Estado: EN PAUSA** · actualizado el 2026-07-27
>
> Este campo lo cambia **solo Doc**. `TRABAJAR` = ponte con el encargo de abajo.
> `EN PAUSA` = espera, el trabajo depende de una pieza que aún no existe.
>
> **Motivo de la pausa**: falta el `POST /emails/:id/classify` del backend. Ver
> "Aviso antes de que empieces".

**Este archivo es tu única fuente de encargos.** Si algo no está escrito aquí,
no es un encargo. Cuando te digan "lee tu md", vuelve a este archivo y trabaja
lo que marque el Estado.

Encargo de **Doc**, redactado por **Claude Code** con los contratos del backend.
Pertenece a lo que le falta al **Sprint 3** (la tubería de IA); el Sprint 5
sigue siendo Registro de Tiempos. Lo anterior quedó al final, bajo "Histórico".

## Lo que pide Doc

**Componente de cuarentena (UI).** Un modal o drawer de validación.

- **Flujo**: cuando se reciba el JSON de la IA, el componente se abre
  automáticamente para que el usuario actúe como *human in the loop*.
- **Interacción**: revisar, editar el título, cambiar la categoría en un
  desplegable y aprobar o eliminar las subtareas propuestas antes de
  confirmarlas y lanzarlas a la base de datos y al tablero.

## Contratos que ya existen

- **Forma del JSON**: `EmailClassification` en `packages/shared/src/index.ts:50`
  — `{ category, isActionable, summary, tasks[] }`, y cada tarea lleva
  `{ title, description?, priority, dueDate?, confidence }`.
- **Desplegable de categoría**: `EmailCategory` (`packages/shared/src/index.ts:26`)
  — `cliente`, `interno`, `proveedor`, `administrativo`, `spam`. Ojo: los valores
  van en minúscula, no como el nombre del miembro del enum.
- **Endpoint actual**: `POST /emails/:id/to-task` → 201 con las tareas creadas,
  404 si el correo no es del usuario, 409 si ya tenía tareas (`"force": true`
  para insistir).

## Aviso antes de que empieces

**Hoy no hay nada que poner en cuarentena.** Tanto el worker como
`POST /emails/:id/to-task` clasifican y **persisten las tareas en la misma
transacción** (`EmailsService.convertToTask`, `apps/api/src/modules/emails/emails.service.ts:31`).
Cuando el frontend recibe la respuesta, las tareas ya están escritas en la base
de datos: no existe el momento intermedio en el que un humano pueda aprobarlas o
descartarlas.

Para que el flujo que describe Doc sea posible falta antes una pieza de backend
—mía— que devuelva la clasificación **sin escribir nada**, más un segundo paso
que confirme solo lo que el usuario apruebe. En la práctica: un
`POST /emails/:id/classify` que lea y devuelva `EmailClassification`, y un
`to-task` que acepte las tareas ya editadas en vez de inferirlas.

Mientras eso no exista, la UI de cuarentena no tiene contra qué trabajar salvo
mocks. Por eso el Estado de arriba está en `EN PAUSA`: en cuanto el endpoint
esté en la rama, Doc lo pasa a `TRABAJAR`.

Las tres tareas del flujo están anotadas en `TASKS.md`, dentro del Sprint 3.

---

# Histórico

## Sprint 2 — Inbox (entregado)

Endpoints que se consumieron y siguen vigentes:

### `GET /auth/me`
- **Autenticación**: cookie `pmo_session` (la gestiona el navegador).
- **Respuesta (200)**: `{ id, email, name, role, hasGoogleTokens }`.

Esquema de sesión vigente: **dos** cookies httpOnly con `path: "/"`.

| Cookie | Contenido | Vigencia |
|---|---|---|
| `pmo_session` | JWT de acceso (`typ: "access"`) | 15 min |
| `pmo_refresh` | JWT de refresco (`typ: "refresh"`) | 30 días |

Cuando el acceso expira la API responde 401 y el frontend renueva con
`POST /auth/refresh`; `POST /auth/logout` borra ambas. El claim `typ` impide que
un refresh se use como token de acceso.

### `GET /gmail/inbox`
- **Query**: `?maxResults=20` (por defecto 20).
- **Autenticación**: cookie `pmo_session` (peticiones con `credentials: 'include'`).
- **Contrato interno**: el `AuthGuard` deja el usuario en `req.user` como
  `{ userId, email }` — usa `user.userId`, **no** `user.id` (ver `auth.types.ts`).
- **Respuesta (200)**: array de `EmailSnippet`
  (`{ id, threadId, snippet, from, subject, date }`).

Entregado: `apps/web/src/features/inbox/` — `InboxPage` + hook `useInbox`, con
agrupación por `threadId` y estados de carga / error / vacío.

**Refresco de tokens centralizado**: la lógica vive solo en
`AuthService.getAuthorizedClient(userId)`. Si hace falta llamar a otra API de
Google, usar ese método en lugar de construir un `OAuth2Client` propio.

**Nota de tipos**: `googleapis-common` ancla su propia copia de
`google-auth-library`, así que pasar nuestro `OAuth2Client` a `google.gmail()`
exige un cast acotado. Está documentado en `gmail.service.ts`.
