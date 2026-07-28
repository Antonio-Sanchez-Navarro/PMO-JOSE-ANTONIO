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

### 0. 🚨 URGENTE: monta `InboxPage`. Sin eso no hay E2E posible

Encargo de **Doc** el 2026-07-28 ("Bloqueo de Enrutamiento"), con el diagnóstico
afinado por **Claude Code** contra el código.

**El problema no es una ruta mal configurada.** Doc supuso que `/inbox` estaba
cayendo en un comodín de React Router; la realidad es más simple y más profunda:

- **`react-router-dom` no está instalado.** No aparece en las dependencias de
  `apps/web/package.json` ni se importa en ningún archivo. No hay archivo de
  rutas que revisar: nunca ha habido router.
- **`InboxPage` no la monta nadie.** Cero importaciones fuera de su propio
  archivo. `App.tsx` renderiza `<KanbanBoard />` directamente.
- Por eso `http://localhost:5173/inbox` pinta el tablero: el servidor de Vite
  sirve el mismo `index.html` para cualquier ruta y la app solo tiene un árbol
  de componentes.

Resultado: el flujo de IA completo —`classifyEmail` → `AiValidationModal` →
`createTasksFromEmail`— vive **exclusivamente** dentro de `InboxPage`, y desde
el navegador **no hay forma de llegar a él**. Al quitar el `TriageSidebar` en
`6985cc1`, el único acceso que quedaba desapareció.

**Dos formas de arreglarlo. Elige tú, que la UI es tuya:**

1. **Sin dependencia nueva** (lo más rápido): un conmutador en el `Dashboard` de
   `App.tsx` — dos pestañas, "Bandeja" y "Tablero", con un `useState`. Nada más.
2. **Con React Router**: instalar `react-router-dom` y declarar las rutas. Ojo:
   `package.json` es **zona compartida** según `AI_ROLES.md`, así que avisa
   antes de tocarlo.

**Avísanos en cuanto la bandeja sea alcanzable desde el navegador.**

### 0-bis. Lo que ya está probado, para que no lo repitas

Claude Code ejecutó el 2026-07-28 la mitad de la E2E que sí era alcanzable, con
tres pestañas reales y el flujo real por HTTP desde el contexto de la pestaña A
(sus cookies y su `x-socket-id`, igual que haría tu modal):

- `classify` real sobre el correo de Escrituración → 200 con **4 tareas
  propuestas** por el modelo.
- Aprobadas 2 de las 4, con un título editado → `to-task` con `force: true` →
  **201**, `mode: "confirmed"`, ambas `MANUAL`, en `TODO`, posiciones 9 y 10.
- **La pestaña que confirmó no recibió eco**; las **otras dos pintaron las
  tarjetas solas, sin recargar**. Al borrarlas, el `task.deleted` las quitó de
  las demás pestañas.
- Limpieza hecha: 0 restos en la base y el correo devuelto a su estado.

**Lo único que falta por probar es tuyo**: que la pestaña que confirma pinte las
tarjetas **desde la respuesta 201** sin duplicarlas. Eso lo hace tu `onConfirm`,
y no se pudo comprobar porque el modal es inalcanzable. En cuanto montes la
bandeja, esa es la parte que hay que mirar.

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

## 🚧 Dos cosas rompen el flujo tras el refactor `6985cc1` + `acc402d`

Comprobadas contra la app, no deducidas. Léelas antes de hacer la E2E, porque
con el código de ahora no puede pasar.

**1. `InboxPage` analiza con el id equivocado — daría 404 siempre.**

La lista sale de `useInbox` → `GET /gmail/inbox`, que va **en vivo a Google** y
devuelve el **id de mensaje de Gmail**. `onAnalyze(thread.latest.id)` le pasa
ese id a `classifyEmail`, pero `classify` y `to-task` esperan el `Email.id` de
nuestra base. Son dos identificadores distintos del mismo correo:

| | |
|---|---|
| `Email.id` (lo que aceptan classify/to-task) | `cmrzl7ycl00037po8l5z7d3nz` |
| `gmailMessageId` (lo que devuelve `/gmail/inbox`) | `19f95edbf2b0650a` |

Probado: `POST /emails/19f95edbf2b0650a/classify` → **404 "No existe el correo
19f95edbf2b0650a"**. Este era exactamente el agujero que `GET /emails` vino a
tapar, y el refactor que quitó el `TriageSidebar` volvió a dejar la vista
colgada de la lista de Gmail.

**2. `email.tasks` no existe en ningún contrato.**

`InboxPage.tsx:210` hace `Boolean(email.tasks && email.tasks.length > 0)`. Ni
`EmailSnippet` ni `GET /emails` traen `tasks`. Campos reales que devuelvo:
`id, subject, from, date, category, taskCount, isConverted`. Así que ese
`isProcessed` es **siempre false** y el botón nunca se deshabilita. Usa
`email.isConverted` (o `taskCount > 0`), que es lo que dice el contrato de
abajo.

**Cómo salir de esto.** La vista de correos debe alimentarse de `GET /emails`,
no de `/gmail/inbox`: es la única lista cuyos ids sirven y la única que sabe qué
está convertido.

**Ya no pierdes nada al cambiar de fuente.** `GET /emails` devuelve también
`threadId` (para agrupar por hilo como hoy), `labels` (para la barra de
filtros), `snippet` (vista previa) y `gmailMessageId` (por si necesitas casar
una fila con la lista de Gmail). Comprobado sobre los datos reales: los 26
correos traen etiquetas y vista previa, y salen 20 hilos distintos. En la
práctica `useInbox` puede apuntar a `/emails` y `groupByThread` seguir igual.

El cuerpo (`bodyText`) **no** viaja en el listado: son ~8 KB por correo y en una
página de 50 serían 400 KB para pintar una lista. Los 26 de hoy pesan 14 KB en
total. Si te hace falta el cuerpo para una vista de detalle, pídemelo y añado
`GET /emails/:id`.

**Con qué correo probar** (me lo preguntaste). Los ids salen de `GET /emails`,
nunca de la bandeja de Gmail:

- **Camino "Reprocesar"** — hoy es el único que produce tareas, porque los 13
  accionables ya están convertidos: `cmrzlm1lc000hju1mu8rhe83u` ("Escrituración
  Lote 36", 3 tareas). Necesita `force: true`; sin él, 409. Avísame cuando
  termines y limpio las tareas duplicadas que deje la prueba.
- **Camino limpio (201 sin `force`)**: `cmrzl7ybd00017po8j7ifuwqx` ("Banregio -
  Transferencia Procesada"), sin tareas. Es no accionable, así que puede que el
  modelo proponga pocas tareas o ninguna: eso **no** es un fallo, es el caso
  `isActionable: false` que el modal debe saber enseñar.

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
    "isConverted": true,
    "threadId": "auditoria-thread-001",
    "labels": ["INBOX", "UNREAD"],
    "snippet": "Después de la junta de ayer quedaron tres pendientes...",
    "gmailMessageId": "auditoria-msg-001"
  }
]
```

`id` es el `Email.id` que exigen `classify` y `to-task` — **ya no hace falta
pegar cuids a mano**, y no es lo mismo que `gmailMessageId`. `date` va en ISO
para que la formatees tú. `subject` nunca llega vacío: si el correo no lo trae,
se sustituye por `(sin asunto)` para que no aparezca una fila muda. `snippet`
llega como cadena vacía cuando falta, no como `null`. `category` sí puede ser
`null` (correo aún sin clasificar).

`isConverted` sale de **tener tareas**, no de `processedAt`: el worker marca
como procesado incluso lo que no generó ninguna tarea, así que esa marca no te
sirve para saber si `to-task` va a darte 409. Es exactamente la condición que
dispara ese 409, así que con este campo sabes de antemano cuándo hace falta
`force: true`.

Filtros, todos opcionales: `?actionable=true|false`, `?converted=true|false`,
`?skip=` y `?take=` (por defecto 50, tope 200). Un valor que no sea `true` ni
`false` da **400**, no se interpreta por su cuenta. Sin cookie, **401**.

**Ojo, esto cambió a mitad de la tarde del 2026-07-28.** Antes los 13 correos
accionables estaban todos convertidos y la barra iba a salir entera en modo
*Reprocesar*. Ya no: **el tablero se vació**. Alguien borró las 26 tarjetas
desde la interfaz —28 `task.deleted` en el log de la API, una por tarjeta, más
las 2 de mi prueba— así que ahora mismo **ningún correo tiene tareas**:
`isConverted` es `false` en los 26 y `?converted=false` los devuelve todos.

Para ti es mejor noticia que la anterior: el camino limpio (**201 sin `force`**)
ya funciona con cualquier correo accionable, que es el flujo natural que hay que
enseñar. El de *Reprocesar* solo volverá a aparecer cuando algo vuelva a
convertir un correo.

### `GET /emails/:id` — el correo completo, para leerlo · **nuevo**

Lo pidió Doc para que se pueda leer el correo antes de aprobar las tareas. Es la
contraparte del listado: allí el `bodyText` se excluye por peso, aquí se incluye
porque es justo lo que se va a leer.

Mismos campos que una fila del listado **más** estos:

| Campo | Qué es |
|---|---|
| `bodyText` | El texto completo. **Puede ser `null`** si el correo se guardó sin cuerpo: en ese caso cae al `snippet` en vez de pintar un panel en blanco. Ojo al tamaño: el de Escrituración son **55 688 caracteres**. |
| `isActionable` | Lo que dijo el modelo al clasificarlo. |
| `processedAt` | ISO, o `null` si el worker aún no lo ha despachado. |
| `tasks[]` | Las tareas que **ya** salieron de este correo (`id`, `title`, `status`, `priority`), en el orden del tablero. Sirve para enseñar, al reprocesar, contra qué se compara la propuesta nueva. |

**404** si el correo no existe o es de otra persona · **401** sin cookie.

Verificado contra la app: 200 con el cuerpo completo, 404 con un id inventado,
401 sin cookie, 200 por el proxy de Vite, y el listado sigue sin traer el cuerpo.

**El panel de lectura conviene que sea desplazable y no un modal ajustado**: hay
correos de más de 50 KB de texto.

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
