# CLAUDE_MEMORY

**Cerebro del Backend.** Refactorizaciones, variables de entorno y lógica de
`@pmo/api`.

> Los contratos de las rutas **no viven aquí**: están en `API_CONTRACTS.md`.
> Esto es lo que hay que saber para tocar el backend sin repetir un error ya
> pagado.

---

## Estado a 2026-08-03

- **510 pruebas en 19 suites**, todas en verde.
- `npm run lint`: **0 errores y 0 avisos** en los tres paquetes.
- El CI corre con `--max-warnings 0` desde `d653b5f` y **sale verde**. Es la
  primera vez en el proyecto que el guardarraíl funciona entero: rama correcta,
  remoto, lint en verde y sitio donde ejecutarse.
- Migraciones aplicadas: `20260729140000_add_copilot_threads`,
  `20260729153000_add_time_tracking`, `20260729160000_add_priority_audit`.

## Trampas de operación (cada una costó tiempo)

1. **`start:dev` lleva `--max-old-space-size=4096`.** Los tipos de `googleapis`
   son enormes y con el heap por defecto el supervisor muere de OOM. **El
   síntoma engaña**: muere el padre, el hijo sobrevive, `/health` sigue dando
   200 y el hot-reload deja de funcionar en silencio.
2. **El mismo heap hace falta en `build`** dentro de un contenedor, donde Node
   lo dimensiona según la RAM que le hayan dado. Sin él, `nest build` muere con
   `Aborted (core dumped)` y código 134, que se lee como un fallo del compilador
   y no como falta de memoria.
3. **Un solo `dev:api` a la vez.** Dos watchers escriben en `apps/api/dist` y se
   pisan. **Matar el proceso del puerto 3000 no basta**: ese es el último
   eslabón de cuatro (`npm run dev:api` → `start:dev` → `cross-env` →
   `nest start --watch`) y el watcher vuelve a levantarlo. El 2026-08-03 había
   **tres cadenas completas** corriendo a la vez. Para reiniciar de verdad hay
   que filtrar por línea de comando, no por puerto.
4. **No ejecutar `nest build` con el watcher levantado**: el build borra `dist`
   bajo sus pies. Para comprobar tipos con el servidor arriba,
   `npx tsc -p apps/api/tsconfig.spec.json`.
5. **El cron de vencidas vive en Redis** (job repetible de BullMQ), no un
   `@Cron` en proceso: con varias instancias correría en todas.
6. **`COPILOT_EMAIL_TRANSPORT=mock` en local.** Sin esa línea, cada clic en
   «Enviar» del borrador manda un correo **de verdad** desde el Gmail del
   usuario.

## Prisma

- **El cliente es código generado.** Sin `prisma generate` no existen ni los
  tipos de los modelos ni el namespace `Prisma`, y el build se cae con errores
  que **parecen del código** —típicamente `Prisma.PrismaClientKnownRequestError`
  en `tags.service.ts` y `time.service.ts`, que son los dos únicos sitios que lo
  usan—. En una máquina de desarrollo no se nota porque lo dejó `prisma migrate`
  hace semanas; en un CI, que parte de `npm ci`, no lo ha generado nadie. Por eso
  existe el `prebuild` de `@pmo/api` (`dd99adb`), y por eso el CI estuvo en rojo
  tres runs seguidos.
- **En 5.22.0, `PrismaClientKnownRequestError` solo existe dentro del namespace.**
  `import { PrismaClientKnownRequestError } from '@prisma/client'` **no
  compila** (`TS2305`): en el `.d.ts` generado vive bajo `export namespace
  Prisma`. La forma correcta es `Prisma.PrismaClientKnownRequestError`.
- **`@default(now())` no desempata dentro de una transacción.** `now()` de
  Postgres devuelve la hora de **inicio de la transacción**, así que dos filas
  insertadas en el mismo `createMany` se sellan con el mismo instante al
  milisegundo. Costó el fallo del copiloto (ver abajo).
- **Los `DateTime` son `timestamp WITHOUT time zone` guardando UTC**, así que un
  solo `AT TIME ZONE 'America/...'` **interpreta** la columna en esa zona en vez
  de convertirla. Hace falta `AT TIME ZONE 'UTC' AT TIME ZONE tz`. Las cuentas
  salían bien pero en el día equivocado. Hay prueba de regresión.

## El fallo del copiloto del 2026-08-03 (`9a45a58`)

El segundo turno de **cualquier** conversación moría, siempre. `saveTurn` metía
pregunta y respuesta en el mismo `createMany`, las dos con el mismo `createdAt`;
`history()` ordenaba solo por esa columna, el empate lo deshacía el motor, y lo
deshacía al revés. Anthropic exige que el primer mensaje sea del usuario, así
que la llamada moría con un 400 del proveedor.

Comprobado contra la base real: el hilo rehidrataba
`ASSISTANT → USER → USER`. Arreglado ordenando por `[createdAt, id]`, sellando
las dos filas a mano y separadas, y descartando las respuestas que la ventana de
20 deja sin su pregunta —ese último es el mismo 400 por otra puerta, en hilos
largos, y no se arregla ordenando.

**Y era invisible por tres capas sumadas**, que conviene recordar antes de
declarar «no hay error en los logs»:

1. `/copilot/chat` está **fuera del log automático de peticiones**
   (`logger.config.ts`), así que no hay línea de petición.
2. El `catch` del controlador convierte el fallo en un evento SSE **sobre una
   respuesta que ya salió con 200** —las cabeceras se mandan antes—, así que
   `customLogLevel` lo clasifica como `info` y Error Reporting no se entera.
3. La línea que sí se escribía registraba **el texto genérico** que el usuario
   ya tenía en pantalla, no la causa. Eso está arreglado.

## Observabilidad

- `nestjs-pino` + `pino`. `app.useLogger` redirige **los 33 `new Logger(...)`**
  repartidos en 32 archivos sin tocar ninguno.
- `LOG_FORMAT`: `gcp` (JSON de una línea con `severity`, `time`, `message`,
  `httpRequest`) o `pretty`. Por defecto sigue a `NODE_ENV`.
- **Los formateadores de Google se aplican solo en `gcp`**: el de nivel
  sustituye `level` por `severity` y `pino-pretty` busca `level` para colorear.
  Con los dos a la vez, la terminal se queda sin colores y sin niveles.
- **El serializador de fábrica de `pino-http` es peligroso**: guarda la petición
  como *binding del logger hijo*, así que `url` y `query` en crudo salen en
  **todas** las líneas de esa petición. Dejó el código de autorización de Google
  cuatro veces en el log. Por eso aquí se **elige** qué se guarda (`id`,
  `method`, URL saneada) en vez de filtrar lo que sobra.
- Sentry se canceló: Error Reporting lee las excepciones de Cloud Logging, sin
  SDK ni credencial.

## Variables de entorno

- **`PORT` manda sobre `API_PORT`.** Cloud Run inyecta `PORT` y espera que el
  contenedor escuche ahí; si no, la revisión no pasa la sonda de arranque y se
  revierte con un error que habla de contenedor que no arranca, sin mencionar el
  puerto. `API_PORT` se queda para local.
- ⚠️ **`GOOGLE_CLOUD_PROJECT` la tiene que poner el despliegue a mano.** Cloud
  Run **no** la inyecta: pone `K_SERVICE` y `K_REVISION`. Sin ella
  `traceFieldsFrom` devuelve `{}` y **las líneas de una misma petición dejan de
  agruparse**, con los logs saliendo y pareciendo correctos. Ya va en el
  `--set-env-vars` de `deploy.yml`.
- `LOG_LEVEL`, `SERVICE_VERSION` y `OVERDUE_CRON` tienen valor por defecto.
- ⚠️ **Los tres `CLAUDE_MODEL_*` no llegaban a Cloud Run.** Estaban en
  `.env.example` y `AiService` los exigía con `getOrThrow`, pero el
  `--set-secrets` de `deploy.yml` no los inyectaba: el primer despliegue con la
  nube provisionada habría tumbado **la API entera** —tablero y sesiones
  incluidos— al construir el módulo de IA. Arreglado el 2026-08-05 por los dos
  lados: van en el `--set-secrets` (`pmo-claude-model-classify`,
  `pmo-claude-model-reasoning`, `pmo-claude-model-cheap`) y `AiService` degrada
  a un modelo por defecto con aviso en vez de impedir el arranque.
- **`CLAUDE_MODEL_REASONING` y `CLAUDE_MODEL_CHEAP` no las leía nadie.** El
  copiloto usaba solo `COPILOT_ANTHROPIC_MODEL_*`, así que configurarlas en la
  nube no cambiaba nada. Desde el 2026-08-05 `tierConfig` encadena
  `COPILOT_ANTHROPIC_MODEL_*` → `CLAUDE_MODEL_*` → tabla: la específica sigue
  sirviendo para probar un modelo solo en el copiloto, y la compartida gobierna
  el despliegue.
- `ANTHROPIC_MAX_RETRIES` (4) y `ANTHROPIC_TIMEOUT_MS` (120 s en clasificación,
  10 min en copiloto) ajustan la política de reintentos sin tocar código. Un
  valor no numérico se ignora y se queda el de por defecto.

## Límite de tasa de Anthropic (2026-08-05)

`common/anthropic/anthropic-client.ts` es el único sitio donde se construye el
cliente, y lo comparten la clasificación y el copiloto.

- **Los reintentos los pone el SDK, no un bucle nuestro**: repite 408/409/429 y
  5xx con espera exponencial respetando `retry-after`, y no toca los 4xx que se
  repetirían igual de mal. Solo se sube el tope de 2 a 4.
- **La detección de fallos mira `error.status`, no `instanceof APIError`.** En
  `ai.service.spec.ts` el módulo del SDK está sustituido por un doble y sus
  clases de error **no existen**: un `instanceof` reventaría al comprobar el
  error en vez de al provocarlo.
- **El worker de clasificación es el único que frena.** Va con `concurrency: 2`
  y `limiter: { max: 20, duration: 60_000 }` —ventana compartida entre
  instancias porque el contador vive en Redis—, y ante un 429 que sobrevive a
  los reintentos llama a `worker.rateLimit(espera)` y lanza
  `Worker.RateLimitError()`: la cola se pausa lo que pida la cabecera y el job
  vuelve **sin gastar un intento**. Con un error normal, una tanda de correos
  buenos acabaría en la cola de fallidos por una saturación pasajera.
  Ojo: `worker.rateLimit` está marcado `@deprecated` para BullMQ 6, donde pasa
  a `queue.rateLimit`. En la 5 que usamos es el camino bueno.
- El copiloto **no** frena: al otro lado hay alguien esperando y un error a los
  veinte segundos es mejor que un cursor parpadeando tres minutos. Traduce el
  429 a un mensaje que el chat puede enseñar tal cual.

## Imagen y despliegue (`ebd06cc`)

`apps/api/Dockerfile`, tres etapas, **construido y arrancado de verdad**: sondas
en 200 contra Postgres y Redis, y `docker stop` saliendo con **código 0**, que
es lo que confirma que Node es PID 1 y corre el cierre ordenado. Con `npm start`
por medio no llegaría el `SIGTERM`.

Lo que rompió al construirlo, por si vuelve:

- Falta `tsconfig.base.json` en el contexto → `tsc` cae a sus valores por
  defecto y type-checkea `node_modules` entero; el error habla de ESLint.
- **npm no hoistea todo**: `@nestjs/terminus` se queda en
  `apps/api/node_modules`. Copiando solo el `node_modules` de la raíz, la imagen
  construye, arranca y se cae en el primer `require`.

⚠️ **Peso: 882 MB, y `googleapis` son 204 MB** —el 46% de `node_modules`— para
usar solo Gmail. `@googleapis/gmail` ahorraría unos 190 MB; es un cambio de
código y está sin hacer.

## Dominio

Backend profundo: workers y colas, Prisma, tubería de IA, `.spec.ts`, lógica de
dominio, y **los archivos estáticos de configuración** (Dockerfile, YAML de
Actions) desde el reparto del 2026-08-03. La **ejecución** en la nube —`gcloud`,
secretos, despliegues— es de Gravity.

Excepciones vigentes: `modules/emails/` y `modules/time/`, `POST /tasks`,
`DELETE /tasks/:id` y `TasksGateway` los lleva Claude aunque sean capa REST,
porque comparten reglas con el cron y los sockets.
