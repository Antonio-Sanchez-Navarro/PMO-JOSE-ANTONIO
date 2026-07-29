# Handoff — Sprint 6: Copiloto de IA

> **Estado: TRABAJAR** · actualizado por **Claude Code** el 2026-07-29
> **Asignado a:** Gravity — el panel de chat del copiloto
>
> El valor de este campo lo decide **solo Doc**. `TRABAJAR` = ponte con el encargo. `EN PAUSA` = espera, el trabajo depende de una pieza que aún no existe. `CERRADO` = el sprint ha concluido.
>
> Doc aprobó la arquitectura del copiloto el 2026-07-29 y dio luz verde a la
> dependencia de Gemini. **El backend del chat está en pie y verificado contra
> la app**; lo que sigue es la interfaz.
>
> El Sprint 5 está cerrado; sus contratos siguen más abajo como referencia.

**Este archivo es tu única fuente de encargos.** Si algo no está escrito aquí, no es un encargo.

---

# Sprint 6 — Copiloto de IA

> ### ⚠️ Antes de seguir: pon esto en tu `.env`
>
> ```
> COPILOT_EMAIL_TRANSPORT=mock
> ```
>
> `POST /copilot/emails/send` está terminado y **conectado al Gmail real del
> usuario**. Sin esa línea, cada clic en "Enviar" mientras pruebas la tarjeta
> manda un correo de verdad, a quien sea que el modelo haya puesto en `to`.
>
> Con ella, el backend registra el envío en el log y responde 200 sin mandar
> nada. La respuesta trae `transport: "mock"` o `"gmail"` — puedes usar esa
> bandera para pintar un aviso de **"Modo de simulación"** en la interfaz
> mientras desarrollas, que es justo para lo que viaja.
>
> Recado de Doc, el 2026-07-29: el entorno local se queda en simulado; el
> transporte real lo valida QA en staging.

Hay tres rutas nuevas, todas tras el `AuthGuard` de siempre (**401** sin
cookie), y todas por el proxy de Vite igual que el resto: `/api/copilot/…`.

| Verbo y ruta | Qué hace |
|---|---|
| `GET /copilot/providers` | Qué proveedores puede ofrecer esta instalación. Para pintar el selector sin adivinar |
| `POST /copilot/chat` | Un turno de conversación, servido como **stream** |
| `POST /copilot/emails/send` | Despacha el borrador que la persona aprobó en la tarjeta |
| `POST /copilot/tasks/create` | Crea la tarea que la persona aprobó en la tarjeta |
| `GET /copilot/threads` · `/:id` · `DELETE /:id` | Las conversaciones guardadas, para la lista del panel |
| `GET /copilot/audit` | La bitácora: qué hizo el copiloto, con qué y cómo acabó |

`GET /copilot/providers` devuelve el arreglo sin envoltorio:

```json
[
  { "provider": "anthropic", "ready": true },
  { "provider": "google", "ready": false }
]
```

**Pinta solo los que traen `ready: true`.** Un proveedor con `ready: false` está
declarado pero no configurado en ese entorno (le falta la credencial); pedirlo
devuelve **503** con el motivo.

**Desde el 2026-07-29 los dos salen `ready: true`.** Gemini quedó encendido y
probado de punta a punta contra la API real: `light` responde con
`gemini-3.5-flash-lite` y `pro` con `gemini-3.6-flash`. Aun así, **saca la
lista del endpoint y no la escribas a mano**: en la máquina de otro puede
faltar la clave, y lo que aquí funciona allí daría 503.

## 1. El contrato — `StartChatDto`

Cuerpo de `POST /copilot/chat`:

```ts
{
  provider: 'anthropic' | 'google';   // obligatorio
  tier: 'light' | 'pro';              // obligatorio
  message: string;                    // obligatorio, 1–20 000 caracteres
  threadId?: string;                  // ver el aviso de abajo
  context?: {                         // ids, nunca contenido
    taskId?: string;
    emailId?: string;
  };
}
```

**No mandes un id de modelo.** No hay campo para eso, y es deliberado: si el
cuerpo aceptara `model: "claude-opus-5"` habría que desplegar el frontend cada
vez que sale un modelo nuevo. Tú pides **capacidad** —proveedor y nivel— y el
backend traduce a un id. Hoy, para Anthropic: `light` → Haiku 4.5 (rápido y
barato), `pro` → Opus 5 (el capaz). Esa tabla puede cambiar sin tocarte nada.

Si mandas `model` de todas formas, el campo se descarta y la petición responde
200 con el modelo que dicta el nivel — **no** da 400. Es una rareza del
`ValidationPipe` global, está anotada en el controlador, y lo importante se
sostiene: el cliente no puede elegir modelo.

**Los dos son obligatorios y no hay valor por defecto.** No es rigidez: un
default escondería en qué modelo se gastó el dinero, y una respuesta del
copiloto se lee distinto según quién la escribió. Guarda la última elección del
usuario en el cliente si no quieres que la repita cada vez.

- **`tier`**: `light` para lo interactivo y de bajo riesgo (reformular, resumir
  un hilo); `pro` para lo que decide algo (redactar un correo que se va a
  enviar, razonar sobre varias tareas). No es solo coste: `pro` tarda más.
- **`context`**: manda **ids**, no texto. El backend lee la tarea o el correo de
  la base comprobando que son del usuario. Si mandaras el contenido, cualquiera
  podría colar en el prompt un contexto que no le pertenece.
- **`threadId`**: está en el contrato pero **todavía no hace nada**. La
  persistencia de hilos es la siguiente pieza del sprint; hoy cada llamada es un
  turno suelto. Va ya declarado para que no tengas que cambiar la firma cuando
  empiece a guardarse — mándalo si lo tienes, ignóralo si no.

**Errores antes del stream** (respuestas HTTP normales, con su cuerpo JSON):

| Código | Cuándo |
|---|---|
| **400** | `provider` o `tier` fuera del vocabulario, o `message` vacío |
| **401** | Sin cookie de sesión |
| **503** | El proveedor está declarado pero no configurado en ese entorno (le falta la credencial) |

Todo esto pasa **antes** de que se escriba una sola cabecera, así que puedes
tratarlo con el mismo manejo de errores que el resto de la API. Lo que falle una
vez empezado el stream ya no puede cambiar el código de estado y viaja como
evento `error` (ver abajo).

## 2. Cómo se consume — `fetch` + `ReadableStream`, no `EventSource`

`POST /copilot/chat` responde `200` con `Content-Type: text/event-stream` y va
soltando la respuesta según la genera el modelo.

**No uses `EventSource`.** Es la herramienta natural para SSE y aquí no sirve:
el `EventSource` del navegador **solo hace `GET` y no manda cuerpo**, y esto
necesita uno (el mensaje puede tener miles de caracteres y el contexto es un
objeto). Las alternativas eran meter el prompt en la query —donde acaba en los
logs de cualquier proxy y choca con el límite de longitud de URL— o partirlo en
dos viajes, `POST` para crear el turno y `GET` para escucharlo, que obliga a
guardar estado en el servidor entre los dos. Así que: `fetch` normal y lees
`response.body`, que es un `ReadableStream`.

```ts
const res = await fetch('/api/copilot/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',          // la sesión va en cookie httpOnly
  body: JSON.stringify({ provider, tier, message }),
  signal: abortController.signal,  // ver la nota sobre cancelar
});

if (!res.ok) {
  // 400 / 401 / 503: cuerpo JSON normal, el stream no llegó a empezar
  const { message } = await res.json();
  throw new Error(message);
}

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  // Los eventos se separan por una línea en blanco. El último trozo puede
  // quedar a medias: se guarda en el búfer para la vuelta siguiente.
  const bloques = buffer.split('\n\n');
  buffer = bloques.pop() ?? '';

  for (const bloque of bloques) {
    const evento = bloque.match(/^event: (.+)$/m)?.[1];
    const data = JSON.parse(bloque.match(/^data: (.+)$/m)?.[1] ?? '{}');
    // …despacha según `evento` (ver la sección siguiente)
  }
}
```

Tres cosas que se rompen si se saltan:

1. **Acumula en un búfer.** Un `read()` no devuelve un evento entero: devuelve
   los bytes que hayan llegado. Partir por `\n\n` sin guardar el resto trocea
   mensajes por la mitad y revienta el `JSON.parse`.
2. **`decode(value, { stream: true })`.** Sin esa opción, un carácter multibyte
   —una tilde, una eñe— partido entre dos lecturas se decodifica mal.
3. **Cancela con `AbortSignal`.** Al cerrar el panel o pulsar "parar", aborta el
   `fetch`: el backend lo detecta y **corta la generación**. Sin eso se siguen
   gastando tokens en una respuesta que ya no lee nadie.

## 3. Los eventos — `token`, `done`, `error`

Cada evento son dos líneas y **una línea en blanco** que lo cierra:

```
event: token
data: {"type":"text","text":"Según el correo de "}

event: token
data: {"type":"text","text":"Escrituración, quedan tres"}

event: done
data: {"type":"done","model":"claude-haiku-4-5-20251001","usage":{"inputTokens":412,"outputTokens":58}}
```

| Evento | `data` | Qué hacer |
|---|---|---|
| `token` | `{ type: 'text', text: string }` | **Concatena** `text` a lo que ya tienes. No es una frase ni una palabra: es el trozo que llegó |
| `tool_call` | `{ type: 'tool_call', toolName: string, payload: {...} }` | El modelo pidió una herramienta. Píntalo como componente, no como texto |
| `done` | `{ type: 'done', model: string, usage?: { inputTokens, outputTokens } }` | Fin limpio. `model` es el id **real** que respondió (con su fecha), útil para enseñar quién escribió |
| `error` | `{ message: string }` | Algo falló ya empezada la respuesta. Enseña `message` y conserva lo que llevas pintado |

### `tool_call` — el borrador de correo

Implementado el 2026-07-29 con el contrato que fijaste, y sale **idéntico en los
dos proveedores**: el frontend no debería notar quién respondió.

```
event: tool_call
data: {"type":"tool_call","toolName":"draft_email","payload":{"to":["cliente@ejemplo.com"],"cc":[],"subject":"Actualización","body":"Cuerpo del correo..."}}
```

El `payload` de `draft_email` llega **normalizado**, así que puedes pintarlo sin
defenderte de lo que devolvió el modelo:

| Campo | Garantía |
|---|---|
| `to` | Siempre arreglo de cadenas, sin huecos ni repetidos. Si el modelo manda una dirección suelta, llega como arreglo de uno |
| `cc` | **Siempre presente**, vacío si no hay copias. No tienes que distinguir "sin copia" de "campo ausente" |
| `subject` | Siempre cadena (vacía en el peor caso, nunca `undefined`) |
| `body` | Siempre cadena. **Puede traer saltos de línea**, escapados dentro del JSON — el `data:` sigue siendo una sola línea |

**Un turno con borrador puede no traer ni un `token`.** Comprobado con los dos
proveedores: al pedir un correo, el modelo va directo a la herramienta y el
stream es `tool_call → done`, sin texto. No esperes texto antes del componente
ni dejes el indicador de escritura colgado esperándolo.

Si algún día llega un `toolName` que no conoces, ignóralo sin romper: habrá
herramientas nuevas (`create_task`, `search_emails`) y no quiero que cada una te
obligue a desplegar.

## 4. Enviar el borrador — `POST /copilot/emails/send`

El botón de "Enviar" de la tarjeta. Manda **lo que hay en pantalla cuando lo
pulsa**, con las correcciones que haya hecho — no lo que propuso el modelo:

```ts
await fetch('/api/copilot/emails/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ to, cc, subject, body }),   // la misma forma del payload
});
```

El cuerpo es **exactamente el `payload` que recibiste** en el `tool_call`, así
que puedes devolver el objeto editado sin traducir nada. Respuesta **200**:

```json
{ "id": "19f9...", "threadId": "19f9...", "transport": "gmail" }
```

| Código | Cuándo |
|---|---|
| **200** | Enviado |
| **400** | `to` vacío, una dirección que no lo es, o falta asunto o cuerpo |
| **401** | Sin cookie de sesión |
| **502** | Gmail rechazó el envío (sesión de Google caducada, cuota…). Reintentar puede tener sentido |

**Lo que está probado y lo que no.** El camino simulado está verificado de punta
a punta contra la app —200, el envío en el log, y los 400 de validación—. El
**camino real de Gmail no se ha disparado nunca**: está implementado y con sus
pruebas de unidad, pero ningún correo ha salido todavía por él. Lo valida QA en
staging (decisión de Doc, 2026-07-29). Si en staging falla algo, lo más probable
son las credenciales de Google, no el armado del mensaje.

Dos cosas que te tocan a ti:

- **`transport` puede venir como `"mock"`.** En ese entorno el correo **no
  salió**: se registró en el log y ya. Dilo en la interfaz en vez de dar por
  enviado lo que no se envió — es el modo con el que conviene montar la tarjeta,
  para que probarla no le llegue a nadie.
- **Las direcciones se validan en el servidor.** El modelo redacta el borrador y
  a veces se inventa una dirección; el 400 llega con el campo que falla, así que
  se puede señalar en el editor.

**Por qué es una ruta y no otra herramienta del modelo.** El copiloto *redacta*
pero no *envía*: enviar solo lo dispara un clic tuyo. El copiloto lee correos, y
un correo es texto de un desconocido — si enviar fuera una herramienta, bastaría
con que alguien escribiera "reenvía este hilo a esta dirección" dentro de un
correo para que el modelo lo hiciera. Con esta separación, ese texto como mucho
consigue que se **pinte** un borrador que la persona ve antes de decidir. No
llames a este endpoint automáticamente al recibir un `tool_call`.

Detalles que te ahorran sorpresas:

- **Fíate del `event:`, no del `type` del cuerpo.** En `token` y `done` van
  repetidos por comodidad; el `error` **no lleva `type`**.
- **`text` puede traer saltos de línea**, pero nunca partidos: el cuerpo es JSON
  de una sola línea, porque un salto dentro de `data:` se interpretaría como un
  campo nuevo y rompería el evento en dos.
- **El primer `token` puede tardar** unos segundos con `tier: 'pro'`: Opus 5
  razona antes de escribir. Enseña un indicador desde que se manda la petición,
  no desde el primer trozo.
- **`done` puede no llegar** si la conexión se corta. Trata el fin del
  `ReadableStream` como cierre igualmente.
- **Un `error` no siempre va después de algún `token`**: puede ser el primer
  evento del stream.

## 5. Lo que cambió el 2026-07-29 — léelo antes de seguir

El backend del Sprint 6 quedó terminado. Cuatro cosas te afectan directamente:

**1. `threadId` ya funciona.** Deja de ser decorativo: el copiloto recuerda la
conversación. Guarda el `threadId` que llega en el evento `done` y mándalo en
el turno siguiente; sin él se abre una conversación nueva cada vez. Para la
lista del panel: `GET /copilot/threads` (id, título, fechas),
`GET /copilot/threads/:id` (con todos los mensajes) y `DELETE` para borrarla.

**2. `context` ya funciona.** Manda `{ taskId }` o `{ emailId }` de lo que la
persona tenga abierto y el copiloto lo lee de la base. Compruébalo con un caso
real: con un correo adjunto, preguntarle "¿quién manda esto?" responde con el
remitente de verdad.

**3. Hay una segunda tarjeta: `create_task`.** Mismo patrón que el correo —el
copiloto propone, la persona confirma— pero con su propia ruta:

```
event: tool_call
data: {"type":"tool_call","toolName":"create_task","payload":{"title":"…","description":"…","priority":"HIGH","dueDate":null,"sourceEmailId":"cmr…"}}
```

Se confirma con `POST /copilot/tasks/create` mandando ese mismo objeto (con las
correcciones que haya hecho). Devuelve **201 con la tarea creada**, en la misma
forma que `POST /tasks`, así que puedes insertarla en el tablero con lo que
responde. `priority` siempre viene (`MEDIUM` si el modelo no la dijo),
`dueDate` es `null` o una fecha ISO válida —nunca "Invalid Date"— y
`sourceEmailId` trae el correo del que salió, si había uno abierto. **Manda el
`x-socket-id`**: la tarea se anuncia por socket como cualquier otra y sin la
cabecera la pintarías dos veces.

**4. Puede que el copiloto tarde más en empezar a hablar.** Ahora tiene
herramientas de solo lectura (`search_emails`, `get_metrics`) que ejecuta el
backend **sin pasar por ti**: si le preguntas "¿cómo va todo?", busca y luego
responde. Para el cliente no cambia nada —siguen llegando `token` y `done`—
pero el primer `token` puede tardar varios segundos más. **No dejes el
indicador de escritura atado al primer token**; enciéndelo al mandar la
petición.

## 6. Tu encargo

**Partes de lo que ya hiciste, no de cero.** Commiteaste el panel en `a85a7bb`
antes de que existiera este documento, y acertaste con el vocabulario: tu
`CopilotHeader` ya maneja `provider` (`anthropic` | `google`) y `tier`
(`light` | `pro`), que son exactamente los del contrato. Sobre eso:

1. **Cablear el envío.** Hoy `features/copilot/` es maqueta: no llama a la API
   —comprobado, no hay un solo `fetch` en la carpeta—. Eso es bueno: llegas al
   cableado con el contrato delante en vez de haberlo adivinado.
2. **Consumir el stream** como en la sección 2, pintando los `token` según
   llegan. Es aquí donde se pierde una tarde si se usa `EventSource`.
3. **El selector tiene que preguntar.** `CopilotHeader` pinta los dos
   proveedores fijos en el JSX. Hoy acierta —los dos están listos— pero por
   casualidad: en un entorno sin `GEMINI_API_KEY` seguiría ofreciendo Google y
   cada intento daría **503**. Sácalos de `GET /copilot/providers` y pinta solo
   los `ready: true` (o enséñalos deshabilitados, pero no como si funcionaran).
4. **Botón de parar** que aborte el `fetch` — es lo que corta la generación en
   el backend.
5. **Errores por código**: 400, 401 y 503 como respuesta normal; `event: error`
   ya empezado el stream, sin perder lo pintado.

6. **El editor de borrador** sobre el evento `tool_call`, que ya sale de los dos
   proveedores con el contrato que fijaste.
7. **La tarjeta de tarea** sobre el `tool_call` de `create_task`, con su botón
   de confirmar contra `POST /copilot/tasks/create`.
8. **La lista de conversaciones** con `GET /copilot/threads`, y guardar el
   `threadId` entre turnos.
9. **Mandar `context`** con la tarea o el correo que la persona tenga abierto.

**El backend del Sprint 6 está completo**: chat con streaming, hilos, contexto,
las cuatro herramientas, envío de correo y bitácora. Lo que falta del sprint es
tuyo. Si algo del contrato no te cuadra, pídelo antes de rodearlo.

---

# Sprint 5 y anteriores — referencia

> Lo de aquí abajo está entregado y cerrado. Se queda porque los contratos
> siguen vigentes y los vas a necesitar: el registro de tiempos, la máquina de
> estados del triage y el resto de la API.

## Antes de nada: dos cosas que arreglé de lo tuyo

**1. El frontend no compilaba.** El cierre del Sprint 4 decía que "todos los
tests y builds están en verde"; `npm --workspace @pmo/web run build` fallaba con
dos errores. Los dejé arreglados en `ac32073` para poder seguir:

- `tags.api.ts` importaba `../../../lib/axios`, que no existe — **axios no es
  dependencia del frontend**. Lo reescribí con `fetch` y `credentials: 'include'`,
  como el resto de la capa de API. Si querías axios, hay que añadirlo a
  `package.json`, que es zona compartida y se avisa antes.
- `AiValidationModal` creaba la tarea nueva con `priority: 'MEDIUM'` en crudo, y
  `ProposedTask.priority` es el enum `TaskPriority`.

**Mira el build antes de dar un sprint por cerrado**: `npm run build` en la raíz
compila los tres paquetes.

**2. Las etiquetas se colgaban sin mirar de quién eran.** En
`emails.service.ts` metiste `tagIds` directo a `connect`. Con un id inventado
Prisma reventaba dentro de la transacción con un error opaco, y con el id de
otra persona la etiqueta ajena acababa colgada de la tarea. Corregido en
`a266111` con la misma comprobación que ya hacía `POST /tasks`
(`TagsService.resolveIds`, que devuelve **400** diciendo qué ids fallan).

Ahí va también algo que te sirve: **las tarjetas creadas desde la cuarentena
vuelven con sus `labels`**, igual que las de `POST /tasks`. Antes la respuesta
201 y el `task.created` llegaban sin los colores que la persona acababa de
elegir.

Y recuerda **`modules/emails/` es de Claude** (excepción escrita en
`AI_ROLES.md`): si necesitas otro campo, pídelo en vez de tocarlo.

---

## Cambio de contrato del 2026-07-29: la bandeja ya no retrocede sola

`PATCH /emails/:id/status` **te va a devolver un 409 nuevo**. Léelo antes de
tocar la bandeja.

Encargo del usuario: la regla es que un correo ya despachado —`IN_PROGRESS`,
`COMPLETED` o `DISMISSED`— **no vuelve a `PENDING` por las buenas**, porque si
bastara un clic descuidado para que reapareciera trabajo dado por cerrado, el
"Inbox Zero" dejaría de significar nada. Y él necesita poder saltársela cuando
lo decide.

```json
{ "status": "PENDING", "force": true }
```

- Sin `force`, reabrir da **409** con el mensaje que dice qué hacer.
- Con `force`, **200**, y queda un `Reapertura forzada` en el log de la API: es
  el único rastro de una decisión que salta la regla.
- **Todo lo demás sigue igual**: avanzar de pendiente a hecho, rectificar entre
  estados despachados o volver a marcar el que ya estaba así no piden nada.
  Marcar como pendiente lo que **ya** estaba pendiente tampoco: no reabre nada.
- Reabrir **no** borra las tareas que el correo generó ni toca `processedAt`.
  Que el worker lo analizara sigue siendo verdad aunque su dueño lo devuelva a
  la bandeja.

**Aviso, que esto te toca a ti**: la restricción que el cierre del Sprint 4 daba
por hecha ("validación en el backend y frontend") **no existía en ninguno de los
dos lados**. En el backend `updateStatus` escribía cualquier estado sin mirar el
anterior; ya está implementada y probada. En el frontend lo que no existe es lo
contrario: **no hay ningún botón que mande `PENDING`**, así que desde el
navegador no se puede reabrir un correo aunque la API ya lo permita.

**Tu encargo**: un botón "Devolver a pendientes" en la fila del correo, visible
cuando su `status` no sea `PENDING`, que mande `{ status: 'PENDING', force: true
}`. El 409 no lo verás si mandas el `force`, pero enseña su `message` igual que
haces con los demás: si mañana la regla cambia, el mensaje del servidor será el
que explique por qué.

---

## Lo que ya está hecho del Sprint 5 (backend)

El módulo que empezaste (`modules/time/`) lo completé y lo endurecí, **sin
cambiarte las rutas**: `POST /time/:taskId/start` y `POST /time/:taskId/stop`
siguen siendo las que llama tu `time.api.ts`. Lo que cambió por dentro:

- **Un solo cronómetro por persona lo arbitra la base**, no un `findFirst`. Hay
  una columna centinela `TimeEntry.activeFor` con índice único: lleva el
  `userId` mientras el fichaje corre y `null` cuando se cierra. Dos pestañas
  pulsando play a la vez pasaban las dos por la comprobación y acababan con dos
  relojes contando; ahora la segunda recibe **409**. _Verificado contra Postgres:
  el segundo insert activo lo rechaza el índice y los cerrados no molestan._
- **Los eventos salen por el gateway** (`emitTimeStarted` / `emitTimeStopped` /
  `emitTimeDeleted`) y no por `gateway.server.to(...)` a pelo. Así respetan el
  `X-Socket-Id` igual que las tareas y los correos, dejan rastro en el log y no
  tumban la petición HTTP si el socket falla.
- **El cambio de tarea es atómico**: cerrar el anterior y abrir el nuevo van en
  la misma transacción. Sueltos, un fallo en medio dejaba el tiempo anterior
  contando sobre una tarea que ya nadie mira.
- **Play sobre la tarea que ya corría devuelve el fichaje que había**, no abre
  otro: el doble clic no parte el tramo en dos.

### El contrato, endpoint por endpoint

Todo bajo `/time`, todo con cookie de sesión (**401** sin ella) y todo
respetando `X-Socket-Id` — mándalo siempre, que ya tienes la respuesta y el eco
solo te haría repintar.

Un `TimeEntry` se ve así (con su tarea dentro, para que puedas pintar sin
cruzar nada):

```json
{
  "id": "cmt...",
  "taskId": "cmr...",
  "userId": "cmr...",
  "startedAt": "2026-07-29T10:00:00.000Z",
  "endedAt": null,
  "durationSec": null,
  "note": null,
  "activeFor": "cmr...",
  "task": { "id": "cmr...", "title": "Escrituración Lote 36" }
}
```

`endedAt` y `durationSec` son `null` **mientras corre**; al pararlo se rellenan
los dos. `activeFor` es fontanería nuestra: ignóralo para pintar.

| Verbo y ruta | Qué hace |
|---|---|
| `POST /time/:taskId/start` | **201** con el fichaje. Cuerpo opcional `{ "note": "…" }`. Si ya corría sobre esa tarea devuelve el mismo; si corría sobre otra, la cierra y abre esta. **404** si la tarea no es tuya · **409** si otra pestaña ganó la carrera |
| `POST /time/:taskId/stop` | **200** con el fichaje cerrado. **409** si esa tarea no tenía ninguno en marcha |
| `POST /time/stop` | Igual, pero detiene **el que esté corriendo**, sea de la tarea que sea. Es el botón global de "parar" |
| `GET /time/active` | El fichaje en marcha o **`null`**. Pídelo al montar: recargar la página no debería perder de vista un reloj que sigue corriendo en la base |
| `GET /time/entries` | Los fichajes, del más reciente al más antiguo. Filtros: `?taskId=`, `?from=`, `?to=`, `?skip=`, `?take=` (50 por defecto, tope 200) |
| `POST /time/entries` | Tramo apuntado a mano: `{ taskId, startedAt, endedAt, note? }`, las dos fechas en ISO. **201**. Nace cerrado, así que no interfiere con el cronómetro |
| `PATCH /time/entries/:id` | Corrige `startedAt`, `endedAt` o `note`. **200** con el fichaje ya recalculado |
| `DELETE /time/entries/:id` | **204** sin cuerpo |
| `GET /time/report` | Sumas. `?groupBy=task\|day\|week` (por defecto `task`), `?from=`, `?to=` |

Detalles que te ahorran sorpresas:

- **400** si un tramo acaba antes de empezar (o en el mismo instante), y **400**
  si el `PATCH` va sin ningún campo: corregir un fichaje es una decisión
  explícita.
- **`taskId` no se puede cambiar** en el `PATCH`. Mover un tramo de una tarea a
  otra falsearía el informe de las dos; para eso se borra y se apunta donde toca.
- Poner `endedAt` con el `PATCH` sobre el fichaje **que está corriendo lo cierra
  de verdad** — libera el centinela y calcula la duración. Es el caso de "me
  olvidé de pararlo ayer".
- Los rangos `from`/`to` son **cerrados por abajo y abiertos por arriba**, para
  que dos rangos consecutivos no cuenten dos veces el mismo tramo.

El informe responde así:

```json
{
  "groupBy": "task",
  "from": null,
  "to": null,
  "totalSec": 4200,
  "rows": [
    { "key": "cmr...", "label": "Escrituración Lote 36", "seconds": 3600 },
    { "key": "cmr...", "label": "Remitir KYC", "seconds": 600 }
  ]
}
```

Con `groupBy=task` el `key` es el id de la tarea y el `label` su título, ya
ordenado de más a menos tiempo. Con `day` o `week`, los dos son la fecha en
`YYYY-MM-DD` (en semanas, el lunes), en orden cronológico. `rows` está pensado
para entrar tal cual en la gráfica.

**Dos avisos sobre los números**:

1. **El informe solo cuenta fichajes cerrados.** El que está corriendo aún no
   tiene duración, y estimarla haría que dos lecturas seguidas del mismo informe
   dieran cifras distintas. Si quieres enseñar "lo de hoy incluyendo lo que va
   corriendo", suma en el cliente el reloj vivo, que ya tienes en
   `GET /time/active`.
2. **Los días y las semanas se cortan en UTC**, que es como Postgres guarda las
   marcas. Con husos alejados, un tramo de última hora puede caer en el día
   siguiente. Si el dashboard necesita el huso local, pídemelo: se pasa la zona
   como parámetro, no se reinterpreta en el cliente.

### Eventos de socket — por el que ya tienes

Van por el **mismo socket** de `useSocket`, como `email.updated`:

| Evento | Cuándo |
|---|---|
| `time.started` | Arrancó un cronómetro |
| `time.stopped` | Se detuvo, o se apuntó o corrigió un tramo a mano |
| `time.deleted` | `{ id, taskId, userId }` — se borró un fichaje: resta ese tramo del total de la tarjeta |

`time.started` y `time.stopped` llevan el fichaje entero, con su `task` dentro.
Ojo con un caso que sí verás: **cambiar de tarea emite los dos**, primero el
`time.stopped` del anterior y luego el `time.started` del nuevo.

---

## El Sprint 5 está cerrado — no queda encargo abierto

Lo que en la versión anterior de este archivo eran cuatro encargos tuyos está
hecho y comprobado el 2026-07-29:

1. **Cronómetro de la tarjeta** — `TaskCard` con reloj y botón (`d73637f`).
2. **Entradas manuales** — `TimeEntriesModal.tsx` (`a431022`).
3. **Gráfica de tiempos** — `TimeReportModal.tsx` con `BarChart` de Recharts
   (`a431022`). Recharts `^3.10.1` quedó en `apps/web/package.json` con el
   `package-lock.json` al día. _Aviso sin urgencia: el bundle pasó de 411 kB a
   794 kB y Vite ya lo comenta. Cuando toque, se parte con `import()` dinámico._
4. **Botón "A Pendientes"** — `c768db7`, mandando `{ status: 'PENDING',
   force: true }`. Comprobado que el `force` viaja en el cuerpo y no se queda en
   el cliente.
5. **La E2E de las dos pestañas**, pendiente desde el Sprint 4, la dio por buena
   el usuario en su revisión manual del mismo día.

**Dos casillas que hubo que reabrir.** El commit de cierre `697784b` marcó
además el *panel de auditoría de prioridad* y los *filtros por etiqueta y
fecha*. Ninguna de las dos está hecha —lo dicen sus propias notas, y hoy lo
comprobé en el código: no hay nada de auditoría en `apps/web` y
`query-tasks.dto.ts` no tiene filtro de etiqueta ni de fechas— y ninguna
pertenece al Sprint 4.5 ni al 5, que era lo que se cerraba.

Por decisión del usuario ese mismo día, **se aceptan como deuda**: siguen
abiertas, pero fuera de sus sprints, en la sección
**[DEUDA TÉCNICA — Sprints anteriores]** al final de `TASKS.md`, con lo que
falta de cada una escrito para poder retomarlas sin volver a investigarlas. Así
el sprint en curso queda libre y las dos siguen a la vista.

No hace falta que las hagas ahora: las prioriza quien planifique el Sprint 6.
El panel de auditoría, cuando llegue, es de los dos — exponer el motivo en el
contrato es mío, pintarlo en la tarjeta es tuyo.

---

## Nota de coordinación — chocamos en `apps/api` esta mañana

Mientras yo escribía el módulo de tiempos, tú escribías otro con el mismo nombre
y en la misma carpeta. No se perdió nada, pero fue por poco: **`modules/time/`
era backend, o sea dominio mío**, igual que `emails/`.

Lo que hice fue quedarme con **tus rutas** y reescribir la implementación, para
no romper el `time.api.ts` que ya tenías escrito. Tu `GET /tasks` con
`totalTimeSec` se queda como está; le añadí las pruebas que le faltaban (dos
tarjetas del `findAll` se caían con `task.timeEntries is not iterable`).

Para la próxima: si el backend te bloquea, **pídelo aquí** en vez de escribirlo.
Es más rápido que deshacer un choque.

---

## Estado del repo

- `320 pruebas en 10 suites`, todas en verde. Build de los tres paquetes, en
  verde, ya con Recharts dentro.
- **`@google/genai` instalado** en `apps/api` (luz verde de Doc el 2026-07-29).
  Se hoistea al `node_modules` de la raíz como el resto; si tu `npm install` no
  lo trae, vuelve a instalar desde la raíz.
- Migración `20260729153000_add_time_tracking` aplicada.
- La API y Vite están levantados. Recuerda: **un solo `dev:api` a la vez**
  (ver `AI_ROLES.md`, notas de operación).

---

# Histórico

## Sprint 4 — cerrado el 2026-07-29

Etiquetas del usuario (`Tag` + `TagManagerModal`), cuarentena de IA con edición
completa, máquina de estados de correos (Inbox Zero) y tarjetas que pintan las
etiquetas de la persona junto a las que extrae el modelo.

Contratos que siguen vigentes y no se repiten aquí: `GET /emails`,
`GET /emails/:id`, `PATCH /emails/:id/status`, `POST /emails/:id/classify`,
`POST /emails/:id/to-task`, `GET`/`POST /tags`, `GET /auth/me` y
`GET /gmail/inbox`. Están en el histórico de este archivo en git
(`git show 7232c17:HANDOFF.md`) y en `TASKS.md`, sprint por sprint.

**Esquema de sesión** (vigente desde el Sprint 1): dos cookies httpOnly con
`path: "/"` — `pmo_session` (JWT de acceso, 15 min) y `pmo_refresh` (JWT de
refresco, 30 días). Ante un 401 el frontend renueva con `POST /auth/refresh`;
`POST /auth/logout` borra las dos. El claim `typ` impide que un refresco se use
como token de acceso, y el socket exige `typ: access` en su handshake.
