# API_CONTRACTS

**Único punto de verdad para endpoints, WebSockets y modelos.**

> **Aquí no se reparte trabajo.** Ningún agente escribe instrucciones en este
> archivo: qué hay que hacer vive en `CLAUDE_MEMORY.md`, en `GRAVITY_MEMORY.md`
> y en `DOC.md`. Esto describe **qué manda y qué devuelve cada ruta**, y se lee
> igual dentro de seis meses.
>
> **Cómo leerlo.** Donde algo esté escrito en imperativo —«manda esto», «pinta
> aquello»—, léelo en pasado: viene de cuando estos contratos se entregaban como
> encargos y describe trabajo ya hecho. Alguna frase habla en presente de cosas
> ya cerradas, y los ids de ejemplo puede que ya no existan en la base; **lo que
> sigue vigente es el contrato de cada ruta**.
>
> _Nació el 2026-08-03 al partir `HANDOFF.md` en dos: los contratos se quedaron
> aquí y la misión de infraestructura se fue a `GRAVITY_MEMORY.md`. Antes de
> eso, buena parte de esto se había perdido en una reescritura y se recuperó de
> `git show HEAD:HANDOFF.md` y `git show 7232c17:HANDOFF.md`._

---

### Handshake del socket — por qué falla y qué debe hacer el cliente (2026-08-21)

**Este es el contrato entre dominios: el backend manda los códigos, el frontend
decide qué hacer con ellos. Programa contra el `codigo`, nunca contra el
mensaje** — el mensaje es texto para un humano y puede cambiar.

#### Lo que estaba roto, porque explica el diseño

El rechazo ocurría **dentro de `handleConnection`**, con un `client.disconnect()`.
Eso significa que la conexión **se establecía y después se caía**, y desde el
cliente eso no es un rechazo: es un `connect` seguido de un `disconnect`, es
decir **una caída de red normal**. Ante una caída normal, socket.io reconecta
indefinidamente — que es exactamente lo que hacía, y con razón.

Por eso `useSocket` no tenía manejador de `connect_error`: **ese evento no
llegaba a dispararse nunca**. No era un olvido del frontend; es que no había nada
que manejar.

Desde el 2026-08-21 la autenticación es **middleware del servidor** y rechaza con
`next(err)`, así que `connect_error` sí se dispara y lleva el motivo dentro.

#### Los tres desenlaces

| Situación | Qué llega al cliente | Qué debe hacer |
|---|---|---|
| Sesión válida | `connect` | Nada más: ya está en su sala |
| **Token de acceso caducado** | `connect_error` con `err.data.codigo === "SESION_CADUCADA"` | Refrescar **una vez** y reconectar. **Sin molestar al usuario** |
| **Sin cookie, token inválido o `typ` incorrecto** | `connect_error` con `err.data.codigo === "SESION_INVALIDA"` | **Dejar de reintentar** y mandar al login |
| Fallo interno del servidor | `connect_error` con `err.data.codigo === "ERROR_INTERNO"` | Reconexión normal, con tope. **No** mandar al login |
| Cualquier otra cosa (red, servidor caído) | `connect_error` sin `err.data` | Reconexión normal, con tope |

La diferencia entre las dos primeras es la que decide si el usuario ve un login o
no ve nada. Hasta hoy las dos producían el mismo `disconnect` mudo.

⚠️ **`ERROR_INTERNO` existe para que un tropiezo del servidor no eche a nadie.**
Si un fallo inesperado saliera como `SESION_INVALIDA`, el cliente sacaría al
usuario al login por algo que no tiene nada que ver con su sesión.

⚠️ **Un token de refresco usado como token de acceso es `SESION_INVALIDA`, no
`SESION_CADUCADA`.** Está vivo; lo que falla es el `typ`. Refrescar no lo
arreglaría, así que reintentar sería un bucle.

Cómo se lee, del lado del cliente:

```ts
socket.on('connect_error', (err) => {
  switch (err.data?.codigo) {
    case 'SESION_CADUCADA':  /* refrescar una vez y reconectar */ break;
    case 'SESION_INVALIDA':  /* parar y mandar al login */        break;
    default:                 /* reconexión normal, con tope */    break;
  }
});
```

#### El socket ya no sobrevive a su propio token

La sesión se validaba **una sola vez**, en el handshake, con un token de 15
minutos — y después el socket vivía indefinidamente. Uno abierto toda la noche
seguía recibiendo eventos con una sesión caducada hacía horas, y si el usuario
cerraba sesión **el socket seguía oyendo** hasta caerse por otro motivo.

Ahora cada socket lleva un temporizador alineado con el `exp` de su token. Al
vencer, el servidor **avisa y cierra**:

| Evento | Cuerpo | Cuándo |
|---|---|---|
| `session.rechazada` | `{ codigo: "SESION_CADUCADA" }` | El token del socket venció. Llega **antes** del cierre |

**Hace falta un evento propio porque `connect_error` solo existe durante el
handshake.** Una vez conectado, un cierre del servidor le llega al cliente como
un `disconnect` pelado, otra vez indistinguible de que se haya caído el wifi.

Qué debe hacer el cliente: lo mismo que con `SESION_CADUCADA` en el handshake —
refrescar y reconectar, en silencio. La cookie del handshake **no se actualiza
sola** mientras el socket vive, así que la reconexión es lo que trae la cookie
nueva.

#### Dónde viven los nombres

**En `@pmo/shared` desde el 2026-08-22** (`packages/shared/src/index.ts`):
`CODIGO_SESION`, `CodigoSesion`, `SESSION_EVENTS` y `SesionRechazadaEvento`.

Se importan igual desde los dos lados:

```ts
import { CODIGO_SESION, SESSION_EVENTS } from '@pmo/shared';
```

⚠️ **Vivieron en `apps/api` un día y estuvo mal.** Es un contrato entre dominios:
mientras solo existieran en el backend, la única forma de que el frontend
programara contra ellos era **copiar las cadenas a mano**, y una constante
copiada es una constante que se desincroniza el día que alguien la cambia de un
solo lado. `apps/api` los reexporta para no romper lo que ya los importaba, pero
**el sitio donde se cambian es el paquete**.

Los tres casos están **provocados**, no razonados, en
`tasks.gateway.handshake.spec.ts`: servidor y cliente de socket.io reales, y un
JWT caducado firmado con `expiresIn` negativo.

### Eventos de socket — tareas

> **Este bloque no se recuperó: se escribió.** `task.created`, `task.updated`,
> `task.reordered` y `task.deleted` **no aparecen en ninguna revisión de
> `HANDOFF.md`** — se comprobó recorriendo el historial completo del archivo.
> Nunca estuvieron ahí, así que el borrado del 2026-08-03 no los perdió: ya
> faltaban. Lo que sigue sale de leer `apps/api/src/modules/tasks/tasks.gateway.ts`
> el 2026-08-03, no de otro documento.

Todos van por el **mismo socket** que ya usa `useSocket`, con la sala por
`userId` (`ws://localhost:3000`, namespace por defecto, handshake con cookie).

| Evento | Cuerpo | Cuándo |
|---|---|---|
| `task.created` | La tarea entera | Alta manual, extracción desde correo o `POST /copilot/tasks/create` |
| `task.updated` | La tarea entera | Cualquier edición, incluido el cambio de columna de un arrastre |
| `task.reordered` | `{ userId, columns }` | Se renumeró el orden dentro de una o varias columnas |
| `task.deleted` | `{ id, status, userId }` | Se borró. Llega lo justo para quitarla del tablero sin volver a pedirla |

**Un arrastre emite dos eventos, y el orden importa:** primero `task.updated`
—la tarjeta con su columna nueva— y después `task.reordered` con el orden final.
Al revés, el reordenamiento llegaría con un id que la columna todavía no tiene.

**Por qué `task.reordered` manda ids y no filas.** Mover una tarjeta renumera a
todas las que van detrás. Con solo `task.updated` viajaba únicamente la movida,
así que los demás clientes veían el cambio de columna pero conservaban el orden
viejo de sus hermanas. Mandar cada fila renumerada serían N eventos por
arrastre; se manda la lista de ids de cada columna tocada y el cliente reordena
lo que ya tiene.

**Supresión de eco — `x-socket-id`.** El cliente manda su `socket.id` en esa
cabecera y el backend emite con `.except(socketId)`, así que quien originó el
cambio no recibe el eco de algo que ya pintó. Vale para `POST`, `PATCH`, el
movimiento y `DELETE` sin tocar ningún DTO. **El `socket.id` cambia en cada
reconexión**: hay que leerlo en el momento de la petición, no guardarlo al
montar.

Los mismos eventos de correos y tiempos —`email.updated`, `time.started`,
`time.stopped`, `time.deleted`— salen por el mismo camino y respetan la misma
cabecera.

> Detalle de implementación, por si algún día cuadra un comportamiento raro: si
> el payload llega sin `userId`, el gateway **difunde a todos los clientes** y
> deja un aviso en el log. Es un cinturón, no el camino normal.

---

### Rutas de sistema — las llama Google, no el frontend

> Añadidas el **2026-08-15**. Existían desde el 08-12 y faltaban aquí por
> completo; se documentan ahora con el visto bueno del PO. **El SPA no las
> llama nunca**: están aquí para que se sepa que existen, quién puede entrar y
> qué pasa si dejan de responder.

Las tres son **públicas a nivel de plataforma** —Cloud Run sirve el servicio con
`--allow-unauthenticated`, porque quien llama no puede presentar un token de
Google en la puerta— así que **lo único que las protege es su guard**. Y las
tres están **exentas del límite por IP** (`@SkipThrottle()`): quien llama es
Google desde unas pocas direcciones, un 429 no lo disuade —lo reintenta— y una
ráfaga legítima se leería como abuso.

| Ruta | Quién la llama | Guard | Cuenta de servicio |
|---|---|---|---|
| `POST /webhooks/gmail` | Pub/Sub (push de Gmail) | `PubSubAuthGuard` | `GMAIL_PUBSUB_SERVICE_ACCOUNT` |
| `POST /cron/overdue` | Cloud Scheduler, cada hora | `CronAuthGuard` | `CRON_SERVICE_ACCOUNT` |
| `POST /cron/gmail-watch` | Cloud Scheduler, a diario | `CronAuthGuard` | `CRON_SERVICE_ACCOUNT` |

⚠️ **Los guards no son intercambiables, y es deliberado.** Pub/Sub y Cloud
Scheduler firman con **cuentas de servicio distintas**: usar uno donde va el
otro devuelve 401, y relajarlo para aceptar ambas dejaría que el webhook de
Gmail pudiera disparar el barrido de vencidas, y al revés. La verificación OIDC
común —firma, `aud` y cuenta emisora— vive una sola vez en
`common/security/google-oidc.verifier.ts`, y **falla cerrado**: sin audiencia o
sin cuenta esperada configuradas, rechaza.

**Sin prefijo global.** `main.ts` no llama a `setGlobalPrefix`, así que las
rutas son exactamente `/cron/overdue` y `/cron/gmail-watch`. Un `/api/cron/...`
da 404 — y el job se ve «ejecutado» en la consola de Scheduler igualmente.

#### `POST /cron/overdue`

Marca como `OVERDUE` las tareas que pasaron de fecha. Sustituye al repetible de
BullMQ, que no corría porque Cloud Run escala a cero (llegó a ejecutarse
**39,5 h tarde**). Es idempotente: un reintento de Scheduler tras un timeout no
hace daño.

```jsonc
// 200
{ "ok": true, "candidates": 12, "moved": 3, "users": 1 }
```

#### `POST /cron/gmail-watch`

Registra **o** renueva la suscripción push de Gmail de todos los usuarios con
credenciales de Google. Sirve para las dos cosas a propósito: `users.watch`
**caduca a los 7 días** y la llamada para renovarlo es la misma que para
crearlo, así que se puede invocar a mano tras desplegar sin esperar a la
primera cita.

```jsonc
// 200
{ "ok": true, "candidatos": 1, "renovados": 1 }
```

> **`renovados < candidatos` es un incidente, no un detalle.** Significa que a
> esos buzones les quedan como mucho 7 días de ingesta antes de apagarse **sin
> error y sin aviso**. Desde el 08-15 dispara una alerta a Google Chat con el
> motivo dentro.

Internamente llama a `users.stop()` **antes** de `users.watch()`: Gmail admite
un solo cliente de notificaciones push por desarrollador y rechaza el segundo
con `400 INVALID_ARGUMENT`.

---

### Contratos REST — vigentes

> Recuperados literalmente de `git show HEAD:HANDOFF.md` y de
> `git show 7232c17:HANDOFF.md`. Alguna frase habla en presente de trabajo
> que ya entregaste —los ids de correo de ejemplo puede que ya no existan—,
> pero **los contratos de las rutas siguen vigentes**.

# Sprint 6 — Copiloto de IA · contrato de referencia

> ### El transporte de correo, y cómo se elige
>
> `POST /copilot/emails/send` está terminado y puede hablar con el **Gmail real
> del usuario**. Cuál de los dos transportes atiende lo decide
> `COPILOT_EMAIL_TRANSPORT`:
>
> | Valor | Transporte |
> |---|---|
> | (sin poner), vacío, o cualquier valor no reconocido | **simulado** — registra el envío en el log y responde 200 sin mandar nada |
> | `real` · `smtp` | **Gmail** — el correo sale de verdad |
>
> **Cambio de contrato del 2026-08-12.** Hasta esa fecha era al revés: sin la
> variable se enviaba de verdad, y solo `=mock` lo apagaba. Se invirtió porque
> esa variable no llegaba a producción —el despliegue la borraba en cada
> revisión— y el descuido caía del lado que no se puede deshacer: un clic en
> «Enviar» mandaba un correo auténtico a quien el modelo hubiera puesto en `to`.
> Ahora el modo peligroso hay que pedirlo por su nombre.
>
> **Lo que no cambió, y es lo que consume la interfaz:** la respuesta sigue
> trayendo `transport: "mock"` o `"gmail"`. Esa bandera es la fuente de verdad
> para pintar el aviso de **«Modo de simulación»** — no supongas el transporte
> a partir de tu propia configuración, léelo de la respuesta.
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

Dos detalles del contrato que se ven en la interfaz:

- **`transport` puede venir como `"mock"`.** En ese entorno el correo **no
  salió**: se registró en el log y ya. La tarjeta lo dice en vez de dar por
  enviado lo que no se envió — es el modo con el que conviene probar, para que
  no le llegue a nadie.
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

## 5. Lo que cambió el 2026-07-29

El backend del Sprint 6 quedó terminado. Cuatro cosas te afectan directamente:

**1. `threadId`.** El copiloto recuerda la conversación. El `threadId` llega en
el evento `done` y viaja en el turno siguiente; sin él se abriría una
conversación nueva cada vez. La lista del panel sale de
`GET /copilot/threads` (id, título, fechas), `GET /copilot/threads/:id` (con
todos los mensajes) y `DELETE` para borrarla.

**2. `context`.** Se manda `{ taskId }` o `{ emailId }` de lo que la persona
tenga abierto y el copiloto lo lee de la base. Con un correo adjunto,
preguntarle "¿quién manda esto?" responde con el remitente de verdad.

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

## 6. El Sprint 6 quedó entregado por los dos lados

**Backend** completo y cerrado formalmente por Doc el 2026-07-29: chat con
streaming, hilos, contexto, las cuatro herramientas, envío de correo y bitácora.

**Interfaz** completa en `0d2a4f4`. Lo que esta sección pedía —mandar el
`threadId` recogido del evento `done`, y la lista de conversaciones con sus tres
rutas— está hecho y comprobado en el código. El resto ya estaba: consumo de
`/copilot/chat`, `/emails/send`, `/providers` y `/tasks/create`, lectura del
stream con `getReader` y **cero `EventSource`**, despacho de `token`,
`tool_call`, `error` y `done`, distinción entre `draft_email` y `create_task`,
cancelación con `AbortController` y el aviso de simulación con `transport`.

También quedó bien resuelto el detalle que se avisaba aquí: **el indicador de
escritura no cuelga del primer `token`**, se enciende al mandar la petición. Con
las herramientas de lectura el copiloto puede buscar antes de hablar y tardar
varios segundos en decir la primera palabra.

Si algo del contrato no te cuadra en el futuro, pídelo antes de rodearlo.

## 7. La tarea dice por qué subió de prioridad

Deuda vieja del Sprint 3, cerrada por el backend hoy con el visto bueno de Doc.
Hasta ahora, cuando la capa determinista subía la prioridad de una tarea, el
motivo solo salía al log del servidor: la persona veía un `URGENT` que nadie le
había pedido y no tenía forma de saber de dónde venía. Ya viaja en la respuesta.

**Tres campos, planos en el objeto `Task`** (no anidados; el porqué está más
abajo). Ya están en `@pmo/shared`, así que te llegan tipados sin tocar nada:

| Campo | Tipo | Qué trae |
|---|---|---|
| `priorityReason` | `string \| null` | El motivo ya redactado, listo para pintar: `"vence en 3 h (<24 h): LOW → URGENT"` |
| `priorityAdjustedAt` | ISO 8601 `\| null` | Cuándo se ajustó |
| `priorityAdjustedFrom` | `TaskPriority \| null` | De qué prioridad venía (`"LOW"`) |

**La regla para pintar es una sola: si `priorityReason` trae texto, hubo ajuste;
si es `null` o no viene, la prioridad es la que se pidió y no hay nada que
explicar.** No pintes un tooltip vacío en ese caso: una etiqueta de "ajustada"
en una tarea que nadie tocó se lee como un fallo del sistema. La mayoría de las
tareas no lleva motivo, y eso es lo normal.

Llegan en los tres sitios por los que ya lees tareas, sin diferencias entre
ellos: `GET /tasks` (el listado del tablero), el **201** de `POST /tasks` y los
eventos `task.created` / `task.updated` de socket. Los rellenan las tres vías
por las que una prioridad puede subir: la creación manual con fecha apretada, la
extracción desde correo (que es de donde nace casi todo) y el barrido nocturno
de tareas vencidas.

**Entregado** en `4191bda`: `TaskCard.tsx:187` comprueba `priorityReason` y saca
un tooltip con el motivo, la prioridad de origen y la fecha. Con eso la auditoría
de prioridad queda completa por las dos mitades.

> **Por qué planos y no anidados en un `priorityAudit`**: Doc pidió anidarlos y
> deliberadamente no lo hice. Prisma los devuelve planos en los tres canales de
> arriba sin mapeo; anidarlos obligaría a mapear en cinco sitios y con que uno
> se olvidara te llegarían dos formas distintas del mismo dato según por dónde
> entrara la tarea. Lo aprobó sin reservas el 2026-07-29: se quedan planos.

## 8. `GET /dashboard/metrics` — el contrato de la vista de métricas

**Entregado** en `4191bda` + `0d2a4f4`: el tablero llama a la ruta real con `tz`
y no queda una sola referencia a `MOCK_METRICS` en `apps/web/src`. Contrato
acordado con Doc el 2026-07-29; el tipo `DashboardMetrics` está en `@pmo/shared`.

```
GET /dashboard/metrics            → 200
GET /dashboard/metrics?from=&to=&tz=
```

Los tres parámetros son opcionales. Por defecto: **los últimos siete días**,
cortados en `America/Mexico_City`. `from` es inclusivo, `to` exclusivo, los dos
en ISO. `tz` es una zona IANA; una inventada da **400** con el motivo, y `from`
posterior a `to` también.

```json
{
  "generatedAt": "2026-07-29T23:01:00.000Z",
  "window": { "from": "2026-07-23T06:00:00.000Z", "to": "2026-07-29T23:01:00.000Z", "days": 7, "tz": "America/Mexico_City" },
  "tasks": { "byStatus": { "TODO": 3, "IN_PROGRESS": 0, "POSTPONED": 0, "DONE": 12, "OVERDUE": 1 }, "total": 16 },
  "wip": 0,
  "overdue": { "count": 1, "byPriority": { "LOW": 0, "MEDIUM": 0, "HIGH": 0, "URGENT": 1 } },
  "throughput": { "completedInWindow": 4, "avgPerDay": 0.6, "perDay": [{ "date": "2026-07-23", "count": 0 }] },
  "time": { "totalSecInWindow": 2246, "perDay": [{ "date": "2026-07-23", "seconds": 0 }] },
  "inbox": { "pending": 21, "byStatus": { "PENDING": 21, "IN_PROGRESS": 3, "COMPLETED": 0, "DISMISSED": 2 } }
}
```

**Cuatro cosas del contrato que te ahorran trabajo, y una que te lo puede dar:**

1. **Las series ya vienen completas y ordenadas.** `throughput.perDay` y
   `time.perDay` traen **un punto por cada día de la ventana**, incluidos los de
   cero, en orden. Se las puedes pasar a Recharts tal cual: no hace falta
   rellenar huecos ni ordenar por fecha. `perDay.length === window.days`, siempre.
2. **`byStatus` y `byPriority` traen siempre todas las claves**, con cero donde
   no hay nada. La leyenda de la gráfica no cambia de tamaño entre recargas.
3. **`wip` es solo `IN_PROGRESS`.** Las atrasadas **no** están sumadas ahí: van
   aparte en `overdue.count`, con su desglose por prioridad. Si las quieres
   juntas en una tarjeta, súmalas tú y ponle otro nombre; WIP responde "en qué
   estoy trabajando", no "cuánto debo".
4. **Los días se cortan en `window.tz`**, no en UTC. Cerrar una tarea a las
   19:00 en México cuenta para ese día. Pinta las etiquetas del eje con
   `point.date` tal cual (`YYYY-MM-DD`): ya está en hora local, así que **no lo
   pases por `new Date(...)` para reformatearlo** — eso lo interpretaría como
   medianoche UTC y te correría la etiqueta un día en tu zona.

Y la que te puede dar trabajo, dicho antes de que lo descubras pintando:

> **El throughput arranca en cero y se llena desde hoy.** La columna
> `completedAt` existía desde el Sprint 1 y **nadie la escribía**: era una
> columna muerta. Se enciende ahora (al pasar a `DONE` se sella, al reabrir se
> limpia), pero **las tareas cerradas antes del 2026-07-29 no tienen fecha**, así
> que cuentan en `tasks.byStatus.DONE` y no en el throughput. Decisión de Doc:
> preferimos una gráfica que empieza vacía y es verdad a una rellenada con
> `updatedAt`, que se mueve con cualquier edición y fecharía hoy un cierre de
> hace tres semanas. Con lo cual: **no te asustes si `completedInWindow` es 0 la
> primera vez que lo abras** — no está roto. Cierra una tarea arrastrándola y
> verás subir el número. Si la vista queda muy sosa con la serie a cero, dilo y
> vemos cómo enseñarlo (un texto de "empezamos a medir el 29 de julio" en el
> pie de la gráfica es honesto y evita la pregunta).

**Un detalle si pintas las dos gráficas de tiempo juntas**: ya no hay
discrepancia. `GET /time/report` agrupaba los días en **UTC** y esta ruta en
hora local, así que las dos podían repartir los minutos de última hora de la
tarde en días distintos. Doc dio luz verde el 2026-07-30 y quedó alineado — lee
la sección 9, que **te cambia algo de lo que ya tienes escrito**.

## 9. `GET /time/report` corta los días en hora local

Cambió el 2026-07-30, por encargo de Doc, después de ver el problema de la
sección 8: la gráfica de métricas hablaba en hora local y la de tiempos en UTC,
y no había forma de saber cuál de las dos mentía.

**Entregado por los dos lados.** El `tz` sale del navegador en las dos rutas
—`time.api.ts:101` y `useDashboardMetrics.ts:14`—, así que las dos gráficas
parten los días por el mismo sitio.

**Qué cambia**

| | Antes | Ahora |
|---|---|---|
| Corte de los días y las semanas | UTC | La zona de `?tz=`, por defecto `America/Mexico_City` |
| Parámetro `tz` | no existía | opcional, zona IANA; una inventada da **400** |
| Respuesta | `{ groupBy, from, to, totalSec, rows }` | lo mismo **más `tz`** |

```
GET /time/report?groupBy=day&tz=America/Mexico_City
```

```json
{ "groupBy": "day", "from": null, "to": null, "tz": "America/Mexico_City", "totalSec": 4200, "rows": [ … ] }
```

La zona se saca del navegador y no se escribe a mano:

```ts
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Cinco cosas que conviene tener claras:**

1. **El defecto ya es el correcto.** Si no mandas `tz`, sale
   `America/Mexico_City`, no UTC. Mandarlo es para que a alguien que viaje —o
   que abra el tablero desde otro huso— le cuadren los días con su reloj.
2. **Los números de `groupBy=day` y `week` se mueven respecto a lo que pintabas
   antes**, y eso es lo que se venía a arreglar: un fichaje del 28 a las 19:00
   en México aparecía en el 29. Ahora aparece en el 28.
3. **El total no se mueve.** `totalSec` sale de las mismas filas: lo único que
   cambia es en qué barra cae cada tramo. Si tenías una cifra cuadrada con otra
   pantalla, sigue cuadrando.
4. **`groupBy=task` no cambia en nada.** Ahí no se corta por fechas, solo se
   filtra por el rango. `tz` viaja igual en la respuesta, pero no se usa.
5. **`from` y `to` siguen siendo instantes ISO y no se reinterpretan.** La zona
   decide en qué barra cae cada tramo, no cuáles entran en el informe — si no,
   dos rangos consecutivos se solaparían. Sigue siendo cerrado por abajo y
   abierto por arriba.

Las fechas de `rows` siguen llegando en `YYYY-MM-DD` **ya en hora local**: mismo
aviso que en métricas, píntalas tal cual y **no las pases por `new Date(...)`**
para reformatearlas, que las interpretaría como medianoche UTC y te correría la
etiqueta un día.

> **Nota de implementación, por si algún día lo lees**: la zona por defecto, la
> validación de `tz` y el `AT TIME ZONE` que usan las dos rutas viven en un solo
> sitio (`common/time-zone.ts`). Tener dos copias de esa lógica es exactamente
> lo que provocó esta discrepancia.

---

# Sprint 5 y anteriores — referencia

> Lo de aquí abajo está entregado y cerrado. Se queda porque los contratos
> siguen vigentes y los vas a necesitar: el registro de tiempos, la máquina de
> estados del triage y el resto de la API.

## Dos arreglos del 2026-07-29, y lo único que queda vigente de ellos

Se arreglaron dos cosas de `apps/web` desde la terminal de backend: el frontend
no compilaba (`ac32073` — un import de `axios`, que no es dependencia del
frontend, y un `priority: 'MEDIUM'` en crudo donde va el enum) y las etiquetas
se colgaban sin comprobar de quién eran (`a266111`). Está entregado y no queda
nada que hacer; lo que salió de ahí son las convenciones 3 y 4 de la sección 0.

Lo que sí sigue siendo contrato: **las tarjetas creadas desde la cuarentena
vuelven con sus `labels`**, igual que las de `POST /tasks`. Antes el 201 y el
`task.created` llegaban sin los colores que la persona acababa de elegir.

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

**Entregado por los dos lados.** La restricción que el cierre del Sprint 4 daba
por hecha ("validación en el backend y frontend") **no existía en ninguno de los
dos**: `updateStatus` escribía cualquier estado sin mirar el anterior, y en el
navegador no había ningún botón que mandara `PENDING`. El backend quedó
implementado y probado, y el botón "A Pendientes" entró en `c768db7` mandando
`{ status: 'PENDING', force: true }` — comprobado que el `force` viaja en el
cuerpo y no se queda en el cliente.

El 409 no se ve mientras se mande el `force`, pero su `message` se sigue
enseñando como el de los demás: si mañana la regla cambia, el mensaje del
servidor será el que explique por qué.

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
| `GET /time/report` | Sumas. `?groupBy=task\|day\|week` (por defecto `task`), `?from=`, `?to=`, `?tz=` — **ver la sección 9: desde el 2026-07-30 los días se cortan en hora local, no en UTC** |

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
2. ~~**Los días y las semanas se cortan en UTC**~~ — **cambiado el 2026-07-30**:
   se cortan en la zona de `?tz=`, por defecto `America/Mexico_City`. El detalle
   completo está en la **sección 9**.

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

---

# Sprint 4 — la bandeja de correos · contrato de referencia

> Recuperado de `git show 7232c17:HANDOFF.md`, palabra por palabra. Estas
> secciones llevaban fuera del archivo desde julio: no las borró la reescritura
> del 3 de agosto, ya faltaban antes.

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

### `PATCH /emails/:id/status` — el motor del Inbox Zero · **nuevo**

Lo que le falta a tus botones. Cuerpo obligatorio con un solo campo:

```json
{ "status": "COMPLETED" }
```

Vocabulario: `PENDING` · `IN_PROGRESS` · `COMPLETED` · `DISMISSED`. Devuelve
**200 con el correo ya actualizado, en la misma forma que una fila de
`GET /emails`**, así que puedes sustituir la fila en tu estado con lo que
responde en vez de recargar la lista.

- **400** si el estado no está en el vocabulario **o si el cuerpo va vacío**.
  Mover un correo es una decisión explícita: un `{}` es un error del cliente,
  no un "déjalo como está".
- **404** si el correo no es tuyo · **401** sin cookie.

Además, **cada fila del listado ya trae su `status`** y `GET /emails` acepta
`?status=PENDING`, que es la bandeja de verdad: lo que queda por despachar. Para
las pestañas, o filtras en el cliente por el campo o pides cada una con su
`?status=`; las dos valen.

**Descartar un correo no borra las tareas que ya generó.** Son cosas distintas:
la tarjeta vive en el tablero por su cuenta desde que se creó.

**Ya emite por socket** (antes no; queda corregido aquí). Cada cambio de estado
sale como **`email.updated`** con el correo entero, la misma forma que una fila
de `GET /emails`, así que puedes sustituir la tuya sin volver a pedir la lista.

Va por el **mismo socket que ya tienes** —el de `useSocket`—, no por uno nuevo:
un segundo gateway obligaría a otro handshake y rompería la supresión del eco,
que depende de que haya un solo socket por pestaña. Basta con añadir el
`socket.on('email.updated', …)` junto a los cuatro de tareas.

El payload lleva `userId` porque es lo que encamina el evento a la sala de su
dueño; para pintar, ignóralo igual que haces con las tareas.

Manda tu `X-Socket-Id` en el `PATCH`: quien mueve el correo ya lo tiene en la
respuesta 200 y el eco solo le haría repintar.

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

---


---

# Observabilidad — lo poco que te toca saber

> Entró el 2026-07-31 y el 2026-08-03. **Es backend entero y no te pide nada**,
> pero hay dos cosas que se ven desde fuera.

**1. Hay tres rutas de salud, y no son intercambiables.**

| Ruta | Qué contesta |
|---|---|
| `GET /health` | La de siempre, sin tocar dependencias. Se mantuvo con la misma forma por compatibilidad |
| `GET /health/live` | ¿El proceso responde? No mira Postgres ni Redis |
| `GET /health/ready` | ¿Puedo atender? Comprueba Postgres y Redis; **503** con el detalle de cuál falló |

Ninguna necesita sesión y ninguna cuenta para el límite de peticiones.

Para pintar un indicador de estado del sistema:
- Usa **`/health/ready`** cada **5 minutos** (300,000 ms) para el latido periódico. Hacerlo más frecuente (ej. 30s) evaporará la cuota gratuita de Redis. **Ojo con la forma:** devuelve el esquema de Terminus (`status`, `info`, `error`, `details`), sin `version` ni `uptimeSec`.
- No uses `/health` para latidos de estado: responde `200 OK` incluso con la base de datos caída, dejando la UI ciega a fallos de dependencias.

**2. Cada respuesta trae `x-request-id`.** Es el identificador con el que esa
petición quedó registrada en el servidor. Si te encuentras un fallo raro y lo
reportas, **pega esa cabecera**: con ella se encuentran todas las líneas de log
de esa petición exacta, en vez de buscar por hora.

Y una que te afecta sin que se vea: los logs del servidor ya **no** guardan la
cadena de consulta sin filtrar. Si alguna vez metes un dato sensible en un
parámetro de URL, dilo, porque la lista de los que se tapan es explícita
(`code`, `state`, `token`, `password`…) y lo que no está en ella se registra.

---

# Esquema de sesión (vigente desde el Sprint 1)

**Esquema de sesión** (vigente desde el Sprint 1): dos cookies httpOnly con
`path: "/"` — `pmo_session` (JWT de acceso, 15 min) y `pmo_refresh` (JWT de
refresco, 30 días). Ante un 401 el frontend renueva con `POST /auth/refresh`;
`POST /auth/logout` borra las dos. El claim `typ` impide que un refresco se use
como token de acceso, y el socket exige `typ: access` en su handshake.
