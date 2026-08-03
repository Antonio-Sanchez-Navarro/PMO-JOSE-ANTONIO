# Handoff — Gravity

> **Estado: TRABAJAR** · puesto el **2026-08-03**
> **Asignado a:** Gravity — **los 28 `any` de `apps/web`**. Está en la sección 0.
>
> El valor de este campo lo decide **solo Doc**. `TRABAJAR` = ponte con el encargo. `EN PAUSA` = espera, el trabajo depende de una pieza que aún no existe. `CERRADO` = el sprint ha concluido.
>
> El ciclo anterior quedó entregado entero, comprobado en el código el
> 2026-08-03 y no en el documento:
>
> | Lo que se pidió | Dónde quedó |
> |---|---|
> | `threadId` en `/copilot/chat` y la lista de conversaciones | `0d2a4f4` |
> | El motivo de la prioridad, pintado en la tarjeta | `4191bda` — `TaskCard.tsx:187` |
> | Vista de métricas contra `GET /dashboard/metrics` | `4191bda` + `0d2a4f4`, sin `MOCK_METRICS` |
> | Mandar `tz` en las dos rutas de fechas | `useDashboardMetrics.ts:14` y `time.api.ts:101` |
> | Teclado en las filas del Inbox | `d358152` — `role`, `tabIndex`, `onKeyDown` y el `stopPropagation` de los botones anidados |
>
> Con esto **el Sprint 6 está cerrado entero** —backend el 29, interfaz el 30— y
> del Sprint 8 ya no queda nada de tu lado.
>
> **El otro frente del proyecto es CI/CD y despliegue en Cloud Run**, que es
> backend e infraestructura y **no es tuyo**. Lo que ya está preparado para él
> está anotado al final, en «Terreno preparado para el despliegue».

**Este archivo es tu única fuente de encargos.** Si algo no está escrito aquí, no es un encargo.

> **Cómo leer el resto.** De la sección 1 en adelante **ya no hay encargos, solo
> contratos**: qué manda y qué devuelve cada ruta que consumes. Se conserva
> porque lo vas a necesitar, no porque quede algo por hacer. Donde algo esté
> escrito en imperativo —«manda esto», «pinta aquello»—, **léelo en pasado**: se
> refiere a trabajo que ya hiciste.

---

# 0. Encargo abierto — los 28 `any` de `apps/web`

> Puesto el **2026-08-03**. Todo el encargo vive en `apps/web`, que es tuyo
> entero. **No toques `apps/api`**: sus tres `any` ya están arreglados
> (`a3c887a`) y esa parte queda en cero.

## Empecemos por lo que **no** es

**Esto no está rompiendo el CI, y conviene que lo sepas antes de empezar** para
que no vayas con prisa ni te tiente el atajo:

- `@typescript-eslint/no-explicit-any` está declarado **`'warn'`** en
  `eslint.config.mjs`.
- **No hay `--max-warnings` en ninguna parte** — ni en los tres scripts de lint,
  ni en el workflow.
- ESLint sale con **código 0** cuando solo hay avisos.

Se pidió esto a raíz de un fallo del CI atribuido a «avisos tratados como
errores fatales». Esa explicación no se sostiene contra la configuración del
repo; la causa que sí encaja era la versión de Node —ESLint 10 exige
`^20.19.0 || ^22.13.0 || >=24` y el workflow pedía `20.x`, que podía resolverse
a una anterior—, y ya está corregida.

**Lo que sí justifica el encargo** es que cada uno de estos `any` es un agujero
real, y que con `apps/web` en cero se puede encender `--max-warnings 0` y que no
vuelvan a entrar. Hoy no se puede encender: cortaría en el primer push.

## La lista completa — 28 avisos en 11 archivos

Ojo, porque la lista que circuló tenía **7 de estos**. Estos son todos, sacados
de `npm --workspace @pmo/web run lint` el 2026-08-03:

| Archivo (desde `apps/web/src/`) | Líneas |
|---|---|
| `features/kanban/hooks/useSocket.ts` | 49, 50, 51, 111, 113, 115 |
| `features/kanban/components/KanbanBoard.tsx` | 282, 317, 326, 335 |
| `features/inbox/InboxPage.tsx` | 56, 98, 149, 187 |
| `features/copilot/components/CopilotDrawer.tsx` | 122, 183, 241 |
| `features/dashboard/components/DashboardPage.tsx` | 103, 133, 134 |
| `features/kanban/api/tasks.api.ts` | 79, 173 |
| `features/kanban/components/TimeEntriesModal.tsx` | 85, 98 |
| `features/copilot/api/copilot.api.ts` | 15 |
| `features/copilot/components/CreateTaskCard.tsx` | 48 |
| `features/copilot/components/DraftEmailCard.tsx` | 49 |
| `features/kanban/components/AiValidationModal.tsx` | 80 |

## Qué tipo va en cada familia

No son 28 problemas distintos: son cuatro, repetidos.

**1. Manejadores de socket** (`useSocket.ts`, las seis). Hoy:

```ts
onEmailUpdated?: (email: any) => void;
onTimeStarted?: (timeEntry: any) => void;
```

`TimeEntry` **ya está en `@pmo/shared`** y lo importas igual que `Task`. Para el
correo no hay interfaz compartida —solo los enums `EmailStatus` y
`EmailCategory`—, así que o declaras la forma que consumes en `apps/web`, o
**me pides un `Email` en `@pmo/shared` y lo añado**: `packages/shared` es zona
compartida y se acuerda antes de tocarla.

**2. El parseo del stream del copiloto** (`CopilotDrawer.tsx:122`,
`let data: any = {}`). Este es el que más rinde: los eventos SSE son un conjunto
cerrado y están documentados en la **sección 3** de este archivo. Una unión
discriminada por `type` —`token`, `tool_call`, `done`, `error`— hace que el
compilador te avise si el backend añade un evento y tú no lo tratas, que es
exactamente el fallo que hoy pasaría en silencio.

**3. `catch (err: any)`** (`CopilotDrawer.tsx:183` y compañía). Quítale el tipo y
déjalo en `catch (err)`: TypeScript ya lo da como `unknown`. Para distinguir la
cancelación, comprueba antes de usarlo:

```ts
if (err instanceof DOMException && err.name === 'AbortError') { … }
```

Es el mismo patrón de los `catch` que se limpiaron en `b5995a7`.

**4. Respuestas de la API sin tipar** (`copilot.api.ts:15` con `Promise<any[]>`,
`tasks.api.ts`, y los `any` de las tarjetas). Declara la forma que consumes.
Para los hilos del copiloto no hay tipo compartido todavía; sirve uno local en
`copilot.api.ts`, que es donde se lee.

Los de `DashboardPage.tsx` (103, 133, 134) son formateadores de Recharts: con
`(label: string | number)` se van, sin inventar nada.

## Dos cosas que no valen

- **Nada de `// eslint-disable-next-line`** ni de `as any`. Silencian el aviso y
  dejan el agujero: el objetivo es poder encender `--max-warnings 0`, y un
  archivo lleno de excepciones lo hace inútil.
- **No cambies la severidad de la regla** en `eslint.config.mjs`. Es zona
  compartida, y bajarla a `off` haría desaparecer el problema del informe sin
  tocarlo.

## Cómo saber que has terminado

```bash
npm --workspace @pmo/web run lint     # 0 problemas
npm run build                         # los tres paquetes compilan
```

Cada workspace imprime **su propio resumen**: el «28 problems» que se venía
citando era solo el de `apps/web`. `@pmo/api` y `@pmo/shared` ya salen en cero.

Y lo de siempre antes de commitear: `npm run lint` en cero **errores**, y añade
por ruta.

---

# Convenciones vigentes

> Esto no es un encargo: son las cuatro reglas que han costado un disgusto cada
> una. Se quedan aquí porque siguen aplicando a todo lo que hagas.

### 1. Pasa el linter antes de commitear

`npm run lint` en **0 errores**. Los avisos no bloquean: quedan **28**, todos
`no-explicit-any` y casi todos en `apps/web`. No urgen y el CI pasa con ellos.

Viene de que `0d2a4f4` dejó `master` en rojo con tres `catch (err)` sin usar en
`CopilotDrawer.tsx`. Se arreglaron desde la terminal de backend (`b5995a7`)
porque el guardarraíl acababa de encenderse, pero **`apps/web` es tuyo y los que
salgan los arreglas tú**.

> **Por qué es fácil que se te pase**: hasta el 2026-07-30 no había configuración
> de ESLint en el repo, así que `npm run lint` moría antes de abrir un archivo y
> nadie lo corría. Ahora sí funciona, y ahora sí corta.

### 2. Añade por ruta, nunca `git add -A` ni `git add .`

Trabajamos dos a la vez sobre el mismo árbol y ya se llevó por delante un
archivo tuyo una vez.

### 3. Mira el build antes de dar algo por cerrado

`npm run build` en la raíz compila los tres paquetes. El cierre del Sprint 4
decía «todos los tests y builds en verde» y `@pmo/web` no compilaba.

### 4. Si el backend te bloquea, pídelo aquí en vez de escribirlo

`modules/emails/` y `modules/time/` son dominio de backend (excepción escrita en
`AI_ROLES.md`). Ya hubo un choque: los dos escribiendo el módulo de tiempos a la
vez, en la misma carpeta y la misma mañana. No se perdió nada, pero fue por
poco, y deshacer un choque es más lento que pedirlo.

Y una de operación: **un solo `npm run dev:api` a la vez**. Dos watchers
escribiendo en `apps/api/dist` se pisan, y el síntoma engaña porque el código
fuente está bien y solo falla contra el servidor.

Desde el 2026-07-31 **el CI ya puede correr de verdad**: hay remoto
(`Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO`, privado) y el workflow escucha
`master`, así que cada push pasa por lint, build y las pruebas. Hasta entonces
`npm run lint` en local era el único guardarraíl que existía.

---

# Sprint 6 — Copiloto de IA · contrato de referencia

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

**Y las dos casillas que hubo que reabrir, también están saldadas.** El commit
de cierre `697784b` marcó como hechos el *panel de auditoría de prioridad* y los
*filtros por etiqueta y fecha* sin estarlo; se reabrieron el 2026-07-29 como
deuda de plan, fuera de sus sprints, y se cerraron las dos ese mismo día y el
siguiente: los filtros en `417941f`, y la auditoría por sus dos mitades —el
motivo en el contrato (`795bae1`) y el tooltip en la tarjeta (`4191bda`).

Queda como recordatorio de por qué ninguna casilla se marca sin mirar el código.

---

## Estado del repo

> Al día a **2026-08-03**.

- **`504 pruebas en 18 suites`, todas en verde.** El build de `@pmo/web` compila
  (844 kB, el aviso de tamaño de Vite sigue ahí) y el type-check de la API sale
  limpio. _Si hay un `dev:api` levantado, comprueba la API con
  `npx tsc -p apps/api/tsconfig.spec.json` en vez de `npm run build`: los dos
  escriben en el mismo `dist` y se pisan._
- **`npm run lint`: 0 errores y 28 avisos.** Hasta el 2026-07-30 fallaba
  siempre, y no por estilo: no había configuración de ESLint en ninguna parte
  del repo, así que moría antes de abrir un archivo. Ahora hay una sola
  (`eslint.config.mjs` en la raíz). Los avisos son `no-explicit-any`, casi todos
  en `apps/web`: son tuyos, no urgen y no rompen nada.
- El formato **no** se comprueba con el linter, a propósito: lo sigue poniendo
  `prettier` por su cuenta. Así nadie te reescribe media `apps/web` en un
  `--fix`.
- **Remoto**: `origin` → `Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO`, **privado**,
  rama por defecto `master`. Existe desde el 2026-07-31; antes el proyecto vivía
  entero en un solo disco.
- **El CI se dispara en cada push a `master`** (`.github/workflows/ci.yml`):
  `npm ci` → lint → build → pruebas, en Node 20. Escuchaba `main` hasta
  `eb4449d`, y como la rama de trabajo es `master` no se había disparado nunca —
  es lo que dejó pasar un `npm run lint` roto durante todo el proyecto.
  _Pendiente de mirar a mano en la consola de Actions que el run salga verde:
  `gh` no está instalado en la máquina._
- Migraciones aplicadas: `20260729140000_add_copilot_threads` (hilos del
  copiloto y su bitácora), `20260729153000_add_time_tracking` (registro de
  tiempos) y `20260729160000_add_priority_audit` (los tres campos de la
  sección 7). Si tu base es anterior, `npx prisma migrate deploy` desde
  `apps/api`. **La observabilidad no añadió ninguna**: no toca el esquema.
- **Helmet y límite de peticiones desde el 2026-07-29**: 240 por minuto en
  general y **20 por minuto en todo `/copilot`**, porque cada turno cuesta
  tokens. Un `429` en el panel de chat no es un fallo del backend: es el límite.
  Enséñalo como tal en vez de como error genérico.
- Dependencias del backend añadidas el 2026-07-31 para la observabilidad:
  `@nestjs/terminus`, `nestjs-pino`, `pino`, `pino-http` y `pino-pretty`. Se
  hoistean al `node_modules` de la raíz; si tu `npm install` no las trae, vuelve
  a instalar desde la raíz.

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

Ninguna necesita sesión y ninguna cuenta para el límite de peticiones. Si alguna
vez pintas un indicador de estado del sistema, la que quieres es `/health/ready`:
las otras dos dicen que sí con la base caída, que es justo su trabajo.

**2. Cada respuesta trae `x-request-id`.** Es el identificador con el que esa
petición quedó registrada en el servidor. Si te encuentras un fallo raro y lo
reportas, **pega esa cabecera**: con ella se encuentran todas las líneas de log
de esa petición exacta, en vez de buscar por hora.

Y una que te afecta sin que se vea: los logs del servidor ya **no** guardan la
cadena de consulta sin filtrar. Si alguna vez metes un dato sensible en un
parámetro de URL, dilo, porque la lista de los que se tapan es explícita
(`code`, `state`, `token`, `password`…) y lo que no está en ella se registra.

---

# Terreno preparado para el despliegue

> Para cuando Doc abra el frente de **CI/CD y Cloud Run**. No es un encargo y no
> es tuyo; se anota aquí para que quien lo abra no vuelva a investigarlo.

Lo que ya está hecho y no habrá que rehacer:

- **Sondas** `/health/live` y `/health/ready` separadas, que es lo que Cloud Run
  pide para *startup*, *liveness* y *readiness*.
- **Cierre ordenado**: `enableShutdownHooks()` en `main.ts`, sin el cual el
  `SIGTERM` de Cloud Run mataba el proceso con las conexiones de Prisma abiertas.
- **Logs en formato de Cloud Logging** por la salida estándar, que es
  exactamente como los recoge Cloud Run: sin agente, sin SDK y sin credencial de
  telemetría. Las excepciones las recoge **Error Reporting** de ahí, con la marca
  `@type` y el `serviceContext` de la revisión.
- `K_SERVICE` y `K_REVISION` ya se leen para identificar el servicio y la
  versión; las inyecta la propia plataforma.

Lo que **falta** y hay que acordarse de poner:

- **`GOOGLE_CLOUD_PROJECT` en el despliegue.** Cloud Run **no** la inyecta, y sin
  ella la correlación por traza se apaga: los logs salen y parecen correctos,
  pero las líneas de una misma petición no se agrupan. La API lo avisa al
  arrancar, así que se verá en el primer log de la primera revisión.
- Los secretos (`JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, credenciales de Google y de
  los modelos) tienen que salir del `.env` y pasar a Secret Manager.
- Postgres y Redis gestionados: hoy son dos contenedores de `docker-compose`.
- `WEB_URL` deja de ser `localhost:5173`, y el CORS va acotado a esa variable
  desde el Sprint 1.

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
