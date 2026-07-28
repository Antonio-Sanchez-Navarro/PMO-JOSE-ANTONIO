# Handoff — Prueba E2E de la cuarentena (para Gravity)

> **Estado: TRABAJAR** · puesto por **Doc** el 2026-07-27, vigente el 2026-07-28
> **Asignado a:** Gravity (cuarentena montada; toca cerrarla con la prueba E2E)
>
> El valor de este campo lo decide **solo Doc**. `TRABAJAR` = ponte con el
> encargo de abajo. `EN PAUSA` = espera, el trabajo depende de una pieza que aún
> no existe. Doc no tiene acceso al repositorio, así que quien escribe el cambio
> es el agente que lo tenga a mano; la decisión sigue siendo suya y queda
> firmada aquí.
>
> **Ya no falta ninguna pieza del backend.** `classify` (`6fd683f`), `to-task`
> con `tasks[]` (`79c5adf`) y el aviso por socket (`9b65ae6`) están en la rama y
> verificados contra la app.

**Este archivo es tu única fuente de encargos.** Si algo no está escrito aquí,
no es un encargo. Cuando te digan "lee tu md", vuelve a este archivo y trabaja
lo que marque el Estado.

Órdenes de **Doc** del 2026-07-28, redactadas por **Claude Code**. Cierran lo
que le falta al **Sprint 3** (la tubería de IA); el Sprint 5 sigue siendo
Registro de Tiempos. Lo anterior quedó al final, bajo "Histórico".

## Lo que pide Doc — en este orden

### 1. Commitea lo tuyo antes de probar

`AiValidationModal.tsx`, `KanbanBoard.tsx`, `tasks.api.ts` y `types/index.ts`
siguen sin commitear en el árbol de trabajo. Si la prueba falla sobre código
flotante, no habrá forma de separar tu cambio del resto. Commitéalo como punto
de control **antes** de tocar nada más.

### 2. La prueba E2E la lideras tú

Es puramente visual, así que es tuya. Doc fija el escenario:

- Levanta el entorno (la API y los contenedores ya están corriendo).
- Abre **dos pestañas** con el tablero.
- En la **pestaña A**, procesa un correo por el modal de cuarentena y confirma.
- **Criterio de éxito**: la **A** refleja las tareas nuevas de inmediato —vía la
  respuesta 201 y **sin duplicarlas**, porque manda `x-socket-id`— y la **B** las
  pinta sola, en tiempo real, sin recargar.

Reporta el hash del commit y lo que viste en las dos pestañas.

### 3. Después: badges de prioridad con el origen

En cuanto la E2E pase en verde, tu siguiente encargo (Sprint 4) son los badges
de prioridad en la tarjeta con el **indicador visual de origen** (`Task.source`,
que ya viaja en la API), para distinguir de un vistazo lo creado o validado a
mano (`MANUAL`) de lo que no.

**Falsa alarma que conviene aclarar**: Doc estuvo a punto de encargarte el
cliente de socket.io del tablero. Ya lo tienes hecho (`c06cb73`, `ae2dceb`,
`d35e1c8`) y el error fue de Claude Code, que leyó una línea desactualizada de
`TASKS.md` en vez de mirar tu código. El checklist ya está corregido (`b87b42d`).

## De qué partes — la cuarentena que ya montaste

**Componente de cuarentena (UI).** Un modal o drawer de validación.

- **Flujo**: cuando se reciba el JSON de la IA, el componente se abre
  automáticamente para que el usuario actúe como *human in the loop*.
- **Interacción**: revisar, editar el título, cambiar la categoría en un
  desplegable y aprobar o eliminar las subtareas propuestas antes de
  confirmarlas y lanzarlas a la base de datos y al tablero.

## Contra qué trabajas

### `POST /emails/:id/classify` — la propuesta, sin crear nada

Es el que alimenta la cuarentena. Analiza el correo y devuelve lo que
propondría **sin escribir una sola fila**: ni tareas, ni la marca de procesado
del correo. Puedes llamarlo tantas veces como quieras (cuesta tokens, eso sí).

- **200** con la propuesta. Es 200 y no 201 porque no nace ningún recurso.
- **404** si el correo no existe o no es del usuario.
- **409** si el correo no tiene texto que analizar.

Cuerpo de la respuesta, tipado en `EmailClassification`
(`packages/shared/src/index.ts`):

```json
{
  "emailId": "cmrzlm1lc000hju1mu8rhe83u",
  "category": "PROJECT_MANAGEMENT",
  "isActionable": true,
  "aiConfidence": 0.92,
  "tasks": [
    {
      "title": "Confirmar respuesta del área contable sobre el Tipo de Cambio",
      "description": "…",
      "priority": "URGENT",
      "tags": ["TC", "impuestos", "notaría"],
      "dueDate": null
    }
  ]
}
```

Las tareas propuestas **no traen `id`**: todavía no existen. La `priority` ya
viene pasada por la capa determinista, así que es la que se guardaría de verdad
— píntala tal cual y no la recalcules.

Si `isActionable` es `false`, `tasks` viene vacío y no se fuerza nada: el modelo
no vio trabajo ahí. Enseña ese caso en vez de inventar una tarjeta.

### Corrección importante sobre las categorías

En la versión anterior de este archivo te dije que el desplegable saliera de
`EmailCategory` con los valores `cliente`, `interno`, `proveedor`,
`administrativo` y `spam`. **Eso era falso** y venía de un enum del Sprint 0 que
no importaba nadie y que no coincidía con lo que el backend produce. Ya está
corregido en `packages/shared`. Los valores reales son:

`PROJECT_MANAGEMENT` · `INVOICING` · `MEETING` · `INFORMATIONAL` · `OTHER`

Una categoría fuera de esa lista degrada a `OTHER` en el backend, así que el
desplegable puede asumir esos cinco y nada más. La misma corrección afecta al
resto de `EmailClassification`: el `summary` que declaraba no lo produce el
modelo, y la confianza es una sola por análisis (`aiConfidence`), no una por
tarea.

### `POST /emails/:id/to-task` — el paso que sí crea

**Ya acepta las tareas editadas.** El botón de Confirmar puede dejar de apuntar
a un stub. Manda en el cuerpo lo que el usuario aprobó:

```json
{
  "category": "INVOICING",
  "tasks": [
    {
      "title": "Remitir KYC con las correcciones",
      "description": "…",
      "priority": "HIGH",
      "tags": ["KYC"],
      "dueDate": "2026-08-10T00:00:00.000Z"
    }
  ]
}
```

- **201** con las tareas creadas, ya con `id`. Píntalas con lo que devuelve el
  servidor.
- **400** si una prioridad o una categoría no está en su vocabulario, o si una
  tarea viene sin `title`.
- **404** si el correo no es del usuario · **409** si ya tenía tareas
  (`"force": true` para insistir).

Detalles que te ahorran sorpresas:

- Solo `title` y `priority` son obligatorios en cada tarea. `category` es
  opcional: **mándala solo si el usuario la cambió**, porque si va, pisa la que
  tenía el correo.
- Un `tasks[]` **vacío no vale** como confirmación: si el usuario descarta todo,
  no llames a este endpoint. Un arreglo vacío cae a la vía antigua y acabarías
  creando una tarea que nadie aprobó.
- Las tareas confirmadas se guardan con `source: MANUAL`, aunque las propusiera
  el modelo: las aprobó una persona y así el reproceso del worker no las borra.
- Se anexan al final de **Por hacer**, no al principio.
- El correo queda marcado como procesado en la misma transacción.

**Ya emite por socket** (antes no lo hacía; queda corregido aquí). Cada tarjeta
creada sale como un `task.created` con la tarea completa —el mismo evento y el
mismo formato que `POST /tasks`, así que el cliente no tiene que aprender nada
nuevo— y las demás pestañas del usuario ven aparecer las tarjetas sin recargar.

Manda tu `X-Socket-Id` en la confirmación, igual que en el resto del tablero:
las tareas ya te llegan en la respuesta 201 y sin la cabecera las pintarías dos
veces, una por la respuesta y otra por el eco. Recuerda que el `socket.id`
cambia en cada reconexión, así que léelo en el momento de la petición.

Verificado contra la app con dos pestañas del mismo usuario: la que confirmó
mandando la cabecera no recibió nada y la otra vio aparecer las dos tarjetas;
sin cabecera llegaron a las dos. Un correo ya convertido responde 409 y no
emite nada, así que un reintento no te ensucia el tablero.

Las tareas del flujo están en `TASKS.md`, dentro del Sprint 3.

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
