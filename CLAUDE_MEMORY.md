# CLAUDE_MEMORY

**Cerebro del Backend.** Refactorizaciones, variables de entorno y lógica de
`@pmo/api`.

> Los contratos de las rutas **no viven aquí**: están en `API_CONTRACTS.md`.
> Esto es lo que hay que saber para tocar el backend sin repetir un error ya
> pagado.

---

## Estado a 2026-08-07

### 🌐 La URL pública de la API

```
https://pmo-api-mlpuuasqka-uc.a.run.app
```

Servicio `pmo-api`, región `us-central1`, proyecto `pmo-dashboard-503418`
(número 614812477499). **De aquí salen dos valores que hay que escribir a
mano en otro sitio**, y ninguno de los dos lo puede adivinar el despliegue:

- `GOOGLE_REDIRECT_URI` = `https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback`
  — en las variables del repositorio **y** en las URIs autorizadas del cliente
  OAuth. Hoy la variable vale `https://pmo-api-dummy-url.run.app/...`, un host
  inventado que pasa el guardarraíl porque la **ruta** sí es correcta.
- `WEB_URL` — hoy `https://pmo-frontend.vercel.app`, que responde 200.

- **El despliegue por pipeline quedó resuelto**, tras dos obstáculos que se
  descubrieron uno detrás del otro. Ninguno de los dos era del código de la
  API: la aplicación llevaba días lista y lo que fallaba era cómo se le
  entregaba la configuración.
- ⚠️ **Ningún despliegue había llegado nunca a verde por la pipeline.** Los
  siete runs del 2026-08-05 fallaron, y el servicio quedó **sin URL y sin
  revisión lista**. Lo que hay en las bitácoras dando el despliegue por
  validado describe el **despliegue manual** de Gravity (revisión
  `pmo-api-00008-mqz`), no la pipeline.
- **Los `CLAUDE_MODEL_*` vuelven a `vars` opcionales** (orden de Doc, 2026-08-07)
  y con eso se deshace `d3547fc`. Ver abajo la sección de variables: es la
  segunda vez que se intentan por Secret Manager y la segunda que `gcloud` lo
  desmiente.

  **Lo que hay que recordar de esto no es la variable, es cómo se rompió.** Se
  movieron a `--set-secrets` sobre un reporte de que los secretos ya estaban
  aprovisionados. No lo estaban —`gcloud secrets list` devuelve ocho y ninguno
  es de modelos—, así que `gcloud run deploy` rechazó la revisión y el servicio
  **perdió la ruta que ya tenía**: la 00009 condenada retiró a la 00008, que
  estaba sirviendo. Una configuración que falla en el despliegue no es
  inofensiva por fallar pronto; en Cloud Run, la revisión rota se lleva por
  delante a la buena. Comprobar antes de cablear (`gcloud secrets list`) cuesta
  un comando.
- ⚠️ **`GOOGLE_REDIRECT_URI` apunta a un host inventado**:
  `https://pmo-api-dummy-url.run.app/auth/google/callback`. Pasa el guardarraíl
  porque la **ruta** es la correcta, que es lo único que el workflow puede
  comprobar —el host real no existe hasta que hay revisión lista—, y el login
  fallará con `redirect_uri_mismatch` hasta que Gravity ponga la URL de verdad
  en la variable y en el cliente OAuth. **Un pipeline en verde no significa que
  el login funcione**: la sonda solo mira `/health/ready`, que no toca OAuth.

  **El `/api/v1` se ha escrito dos veces, y la segunda ya con el host bueno.**
  El 2026-08-07 la variable pasó a
  `https://pmo-api-mlpuuasqka-uc.a.run.app/api/v1/auth/google/callback`: host
  correcto, ruta inventada. **El guardarraíl lo paró en el runner**, con el
  motivo escrito, antes de publicar revisión — que es justo para lo que se
  añadió la comprobación de la ruta completa y no del sufijo. Que reincida
  siendo el error mejor documentado del proyecto dice que el prefijo `/api/v1`
  es lo que cualquiera espera de una API; conviene repetir el porqué al pedirlo:
  `main.ts` **no llama a `setGlobalPrefix`**, así que la única ruta que existe
  es `/auth/google/callback`.

### Cloud Run nace privado, y eso no se ve en ningún log de la aplicación

El segundo obstáculo del 2026-08-07, y el más engañoso de los dos. Con los ids
de modelo arreglados, `gcloud run deploy` **salió con 0**, la revisión
`pmo-api-00011-r2l` quedó lista y sirviendo el 100% del tráfico, y el
despliegue siguió en rojo: la sonda se comió cinco **403** seguidos.

**El 403 no era nuestro.** Lo devuelve la puerta de entrada de Cloud Run
*antes* de tocar el contenedor, porque un servicio nuevo no admite invocación
anónima. En los logs de la revisión se ve el arranque impecable —`Nest
application successfully started`, `PMO API escuchando en el puerto 8080`,
sonda TCP a la primera, las rutas mapeadas y el barrido de vencidas programado,
que de paso confirma que Upstash responde— y **al lado**, las líneas de la
puerta: `The request was not authenticated. Either allow unauthenticated
invocations or set the proper Authorization header.` Buscar la causa dentro de
la aplicación no habría dado nada nunca.

Resuelto con `--allow-unauthenticated` en el despliegue (aprobado el
2026-08-07). Los tres que llaman a esta API son anónimos por naturaleza y
ninguno puede presentar un token de Google: el SPA desde el navegador, el
callback de OAuth que abre Google en ese mismo navegador, y el empuje de
Pub/Sub. **Abierto no es desprotegido**: los datos los guarda la capa de
aplicación del Sprint 8 —`AuthGuard`, límite por IP, CORS acotado a `WEB_URL` y
la firma OIDC del webhook—, y lo que queda público es lo que tiene que serlo.

_Nota menor pendiente_: el aviso de `ai.service.ts` sigue diciendo «En Cloud Run
llega desde Secret Manager», y ya no es cierto. Es texto de un log, no cambia
comportamiento.

## Estado a 2026-08-05

- **525 pruebas en 20 suites**, todas en verde (`73ade8a`). Las 15 nuevas cubren
  la cadena `COPILOT_ANTHROPIC_MODEL_*` → `CLAUDE_MODEL_*` → tabla y el cálculo
  de espera ante un 429.
- `npx tsc -p apps/api/tsconfig.spec.json` y ESLint, limpios.
- **En `master` (`73ade8a` → `f75cfb2`): la protección del arranque y la
  fortificación de variables.** Es decir, la degradación segura de `AiService`
  ante un `CLAUDE_MODEL_CLASSIFY` ausente, la política de reintentos compartida
  con freno en la cola, y las comprobaciones de `deploy.yml` que paran el
  despliegue antes de publicar una revisión condenada.
- ✅ **Validación viva conseguida el 2026-08-05.** El despliegue manual de
  Gravity levantó el contenedor: escucha en el 8080 y `/health/ready` devuelve
  **200** contra Neon y Upstash. Es lo que faltaba — hasta ese momento ninguna
  revisión había llegado a arrancar, y ninguna prueba de las nuestras podía
  demostrarlo. La degradación segura del arranque hizo su papel. _La 00009 la
  retiró unos minutos después; ver el estado del 2026-08-07._

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
- ⚠️ **`GOOGLE_REDIRECT_URI` tumbaba el contenedor y tampoco iba en el
  despliegue.** `AuthService` la pide con `getOrThrow` **en su constructor**, y
  los proveedores de Nest se construyen al arrancar: sin ella la aplicación
  revienta antes de escuchar en el 8080 y Cloud Run lo informa como **timeout de
  arranque**, sin nombrar ninguna variable. Es exactamente el síntoma que
  Gravity anotó el 2026-08-05 y por el que subió el timeout del servicio a 300 s:
  no es que tarde, es que no llega. Desde el 2026-08-05 va en `--set-env-vars`
  desde `vars.GOOGLE_REDIRECT_URI`, y el despliegue **se para con un mensaje** si
  la variable no está. No es un secreto: es la URL de vuelta del login, y tiene
  que coincidir carácter a carácter con una URI autorizada del cliente OAuth.

  **La ruta es `/auth/google/callback` y nada más.** `main.ts` no llama a
  `setGlobalPrefix` ni usa versionado, así que no hay `/api` ni `/v1` por
  ninguna parte: el controlador es `@Controller("auth")` con
  `@Get("google/callback")` y esa es la única ruta que existe. El valor que se
  puso en la variable el 2026-08-05 —`https://<DOMAIN>/api/v1/auth/google/callback`—
  fallaba por partida doble, y ninguno de los dos fallos se ve al arrancar: la
  aplicación levanta igual y es Google quien rechaza el login después con
  `redirect_uri_mismatch`, un error que parece del cliente OAuth y no del
  despliegue. Por eso el guardarraíl comprueba la ruta completa y los
  marcadores sin sustituir, no solo que la variable esté puesta.
- ⚠️ **Los tres `CLAUDE_MODEL_*` no llegaban a Cloud Run.** Estaban en
  `.env.example` y `AiService` los exigía con `getOrThrow`, pero el
  `--set-secrets` de `deploy.yml` no los inyectaba: el primer despliegue con la
  nube provisionada habría tumbado **la API entera** —tablero y sesiones
  incluidos— al construir el módulo de IA. Arreglado el 2026-08-05 por los dos
  lados: `AiService` degrada a un modelo por defecto con aviso en vez de impedir
  el arranque, y el despliegue las inyecta.

  **Van por `vars` del repositorio, no por Secret Manager** — y esto se decidió
  **dos veces**, porque en medio se deshizo. Se intentaron como secretos y el
  despliegue lo desmintió: `Secret
  projects/614812477499/secrets/pmo-claude-model-classify/versions/latest was
  not found` — los tres. `f75cfb2` los pasó a `vars`; `d3547fc` los devolvió a
  `--set-secrets` sobre un reporte de que ya estaban aprovisionados, y volvió a
  fallar con el mismo mensaje literal. `gcloud secrets list` sigue devolviendo
  ocho secretos, ninguno de modelos. Restaurado el 2026-08-07 por orden de Doc.

  No son credenciales, son ids de modelo públicos. Y se añaden **solo si están
  puestas**: como el código trae un valor bueno y lo anuncia en el log, una
  variable que falta cambia el modelo, no tumba el despliegue. Hoy **no está
  puesta ninguna de las tres**, así que la API arrancará con sus modelos por
  defecto y lo dirá en el log; el workflow además emite un `::notice::` por cada
  una que falta, para que no sea un silencio.

  ⚠️ **Y la lección que costó el servicio caído**: una revisión que Cloud Run
  rechaza **retira a la que estaba sirviendo**. Fallar en el `gcloud run deploy`
  no es el fallo barato que parecía cuando se escribió que era «ruidoso pero
  bueno».
- **`CLAUDE_MODEL_REASONING` y `CLAUDE_MODEL_CHEAP` no las leía nadie.** El
  copiloto usaba solo `COPILOT_ANTHROPIC_MODEL_*`, así que configurarlas en la
  nube no cambiaba nada. Desde el 2026-08-05 `tierConfig` encadena
  `COPILOT_ANTHROPIC_MODEL_*` → `CLAUDE_MODEL_*` → tabla: la específica sigue
  sirviendo para probar un modelo solo en el copiloto, y la compartida gobierna
  el despliegue.
- `ANTHROPIC_MAX_RETRIES` (4) y `ANTHROPIC_TIMEOUT_MS` (120 s en clasificación,
  10 min en copiloto) ajustan la política de reintentos sin tocar código. Un
  valor no numérico se ignora y se queda el de por defecto.

## Qué puede impedir el arranque (regla, no lista)

Los proveedores de Nest se construyen **al arrancar**, así que un constructor
que lanza no deja sin servicio a su módulo: deja **la API entera** sin escuchar
en el puerto. Y el síntoma que se ve arriba, en Cloud Run, es *timeout de
arranque* — sin nombrar la variable, sin traza y sin pista de que el problema
sea de configuración. Ya pasó dos veces el 2026-08-05 (`GOOGLE_REDIRECT_URI` y
`CLAUDE_MODEL_CLASSIFY`), las dos con la misma cara.

La regla con la que se decide, al añadir una variable nueva:

- **Credencial que falta → no arrancar.** Una clave inventada no existe; el
  respaldo solo difiere el fallo hasta la primera llamada y lo disfraza de 401.
  `ANTHROPIC_API_KEY` y `TOKEN_ENCRYPTION_KEY` siguen así, a propósito.
- **Configuración cuyo valor bueno sabemos escribir → respaldo con aviso.** Un
  id de modelo lo sabemos poner desde el código. Impedir el arranque por él
  cambia "la clasificación usa otro modelo del previsto" por "no hay tablero".
  El aviso en el log es obligatorio: el entorno manda, y si no llegó, esto lo
  está ignorando en silencio.
- **Lo que no tiene valor bueno posible → pararlo antes de desplegar.** La URI
  de vuelta del login no se puede adivinar y una equivocada rompe el login de
  forma más confusa que no arrancar. Por eso la comprobación vive en
  `deploy.yml` y no en el código: falla en el runner, con el motivo escrito.

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
- **`AiService` anota y propaga; no espera.** Un 429 que llega hasta él ya pasó
  por los reintentos del SDK, así que registra el fallo con la espera que sugiere
  la respuesta (`retry-after`, o el `*-reset` más lejano si no viene) y lo deja
  subir. Dormir ahí solo retrasaría **ese** correo mientras los siguientes de la
  tanda van a chocar igual; quien puede frenar de verdad es el worker, que
  gobierna la cola entera.
- **La espera se acota entre 1 s y 5 min.** Sin techo, una cabecera con fecha
  rara o un reloj desajustado dejaría la cola dormida horas — un fallo que se
  leería como "la IA dejó de clasificar" sin ningún error a la vista.
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
