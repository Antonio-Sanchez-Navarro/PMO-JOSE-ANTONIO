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

### 1. Commitea lo tuyo antes de probar — ✅ hecho

Doc pidió aislar tu trabajo antes de probar, para que un fallo de la E2E no se
confundiera con código flotante. Ya está: `d4097a8` (`AiValidationModal.tsx`,
`KanbanBoard.tsx`, `tasks.api.ts`, `types/index.ts`), commiteado por ti el
2026-07-28 a las 10:18. El árbol está limpio; se puede probar.

### 2. La prueba E2E la lideras tú

Es puramente visual, así que es tuya. Doc fija el escenario:

- Levanta el entorno (la API y los contenedores ya están corriendo).
- Abre **dos pestañas** con el tablero.
- En la **pestaña A**, procesa un correo por el modal de cuarentena y confirma.
- **Criterio de éxito**: la **A** refleja las tareas nuevas de inmediato —vía la
  respuesta 201 y **sin duplicarlas**, porque manda `x-socket-id`— y la **B** las
  pinta sola, en tiempo real, sin recargar.

Reporta el hash del commit y lo que viste en las dos pestañas.

**El primer intento falló, y no fue culpa tuya ni de los sockets.** Salió
"Error al crear las tareas propuestas" porque el `window.prompt` del botón
**Test IA Modal** propone por defecto el correo `cmrzlm1lc000hju1mu8rhe83u`,
que **ya tiene 3 tareas** de una conversión anterior. El endpoint responde
**409** a propósito: es el guardarraíl contra duplicados. Reproducido contra el
3000 y por el proxy de Vite, 409 en los dos casos.

Usa un correo sin tareas. Del mismo usuario y limpios a día de hoy:

| Id | Asunto |
|---|---|
| `cmrzl7ybd00017po8j7ifuwqx` | Banregio - Transferencia Procesada |
| `cmrzl7ycl00037po8l5z7d3nz` | Estamos entre las 500 empresas más importantes… |
| `cmrzl7ycw00057po8qx6ybmdm` | Banregio - Transferencia Procesada |

Con cualquiera de esos la confirmación devuelve 201 y la prueba sí se ve. Ojo:
cada correo sirve **una vez**; al segundo intento dará 409 con razón.

### 3. Micro-misión de Doc: que el error diga qué pasó

Antes de los badges. `createTasksFromEmail` lanza el mismo `Error` genérico para
cualquier respuesta no-ok, así que un 409 (correo ya convertido), un 400
(payload inválido) y un 401 (sesión caída) se ven idénticos en pantalla — por
eso este fallo costó un rato de investigación. Lee el `statusCode` y el
`message` del cuerpo:

- **409** → avisar de que ese correo ya fue convertido.
- **400** / **401** → el error que corresponda.

### 4. Después: badges de prioridad con el origen

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

### `GET /emails` — la bandeja de triage · **nuevo, ya en la rama**

Lo que le faltaba a `useTriageEmails`. Devuelve **el arreglo sin envoltorio**
(como `POST /tasks`), del correo más reciente al más antiguo:

```json
[
  {
    "id": "cmrzm8nhx0001bgaendpebue5",
    "subject": "Pendientes proyecto Torre Citrotarte",
    "from": "Astrid Robles <astrid@example.test>",
    "date": "2026-07-25T00:13:24.584Z",
    "category": "PROJECT_MANAGEMENT",
    "taskCount": 3,
    "isConverted": true
  }
]
```

`id` es el `Email.id` que exigen `classify` y `to-task` — **ya no hace falta
pegar cuids a mano**. `date` va en ISO para que la formatees tú. `subject` nunca
llega vacío: si el correo no lo trae, se sustituye por `(sin asunto)` para que
no aparezca una fila muda. `category` sí puede ser `null` (correo aún sin
clasificar).

`isConverted` sale de **tener tareas**, no de `processedAt`: el worker marca
como procesado incluso lo que no generó ninguna tarea, así que esa marca no te
sirve para saber si `to-task` va a darte 409. Es exactamente la condición que
dispara ese 409, así que con este campo sabes de antemano cuándo hace falta
`force: true`.

Filtros, todos opcionales: `?actionable=true|false`, `?converted=true|false`,
`?skip=` y `?take=` (por defecto 50, tope 200). Un valor que no sea `true` ni
`false` da **400**, no se interpreta por su cuenta. Sin cookie, **401**.

**Ojo con lo que vas a ver hoy**: de los 26 correos hay 13 accionables y **los
13 ya están convertidos** por el worker, así que `?actionable=true&converted=false`
devuelve **0**. Si filtras solo por accionables, la barra saldrá entera en modo
*Reprocesar* — que es el caso que Doc aprobó, pero conviene que no te sorprenda
ni lo leas como un fallo. Si quieres ver correos vírgenes, quita el filtro de
accionable: hay 13 no accionables sin tareas.

### `POST /emails/:id/classify` — la propuesta, sin crear nada

**Ya existía** desde `6fd683f`; no había que programarlo. Está verificado y es
el que alimenta tu modal.

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
