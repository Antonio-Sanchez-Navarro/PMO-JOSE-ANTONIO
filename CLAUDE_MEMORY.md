# CLAUDE_MEMORY

**Cerebro del Backend.** Refactorizaciones, variables de entorno y lógica de
`@pmo/api`.

> Los contratos de las rutas **no viven aquí**: están en `API_CONTRACTS.md`.
> Esto es lo que hay que saber para tocar el backend sin repetir un error ya
> pagado.

---

## Estado a 2026-08-15

### 🔴 `users.watch` de Gmail: hay que llamar a `stop` ANTES

Es la causa raíz de que la ingesta llevara dos días condenada. Gmail admite
**un solo cliente de notificaciones push por desarrollador** y rechaza el
segundo:

```
HTTP 400 · INVALID_ARGUMENT
"Only one user push notification client allowed per developer
 (call /stop then try again)"
```

`watchInbox` llama ahora a `gmail.users.stop()` antes de `gmail.users.watch()`.
`stop` es idempotente —sobre un buzón sin watch no falla— y va en su propio
`try` para no confundir un fallo suyo con un rechazo del `watch`.

**La forma del fallo es lo que hay que recordar:** el primer `watch` funciona
—no hay ninguno que estorbe— y **fallan todas las renovaciones posteriores**.
Una vez bien y las demás mal. Eso hace que se lea como «funcionó y luego dejó
de funcionar», que es el patrón de una credencial que caduca: por eso el
diagnóstico apuntó dos días a OAuth y al refresh token, que estaban sanos.

⚠️ **Y sin renovación, la ingesta se apaga sola a los 7 días** sin un solo
error: dejan de llegar push y ya está. Hay prueba del orden en
`gmail.service.spec.ts`, incluida una que renueva **dos veces**, porque una
prueba de una sola llamada no habría visto nunca este fallo.

### 🔴 `logger.error(mensaje, err)` tira el error al suelo

**La segunda ranura de `logger.error` de Nest es el `stack` y espera una
cadena.** Al pasarle un objeto, el formateador de pino lo descarta entero.
Comprobado en el registro crudo del fallo del 08-14: el `jsonPayload` traía
`message`, `logger`, `pid` y `req` — ni `err`, ni `stack`, ni `code`.

Eso es lo que hizo la causa del watch **ilegible durante dos días**. La trampa
ya estaba documentada en `all-exceptions.filter.ts` («el serializador de pino
esperaba un `Error` de verdad») y aun así se repitió en nueve sitios.

La forma correcta, con el helper de `common/observability/describir-error.ts`:

```ts
this.logger.error(`No se pudo X: ${describirError(err)}`, stackDe(err));
```

`describirError` saca además **`err.response.data.error`**, que es donde
`googleapis` esconde el motivo real de un rechazo (`Insufficient Permission`,
`Topic not found`, el `call /stop` de arriba). Sin eso, un 400 no se distingue
de otro 400.

### 🔴 Neon tarda más en despertar que el plazo de Prisma

`Transaction already closed` intermitente: Neon es serverless, despertarlo tarda
**~5,3 s** y el plazo por defecto de Prisma es de **5 s**. Fallaba por
trescientas milésimas y solo con la base dormida — nunca en local, nunca dos
veces seguidas.

Fijado en el **constructor** de `PrismaService`, que Prisma admite desde la 5.10:

| Opción | Antes | Ahora |
|---|---|---|
| `maxWait` | 2 s | 10 s |
| `timeout` | 5 s | 15 s |

Un solo sitio cubre las nueve transacciones del proyecto y las que se escriban
después. **No es cosa de los workers**: Cloud Run también escala a cero, así que
cualquier transacción puede pillar la base fría.

⚠️ El precio: una transacción de verdad atascada retiene su conexión el triple.
Correcto aquí —las transacciones son cortas— pero es el primer sospechoso si
algún día aparece contención de conexiones.

### 🔴 Deduplicación: deduplicar lo hecho, no lo intentado

Google entrega **cada aviso de Gmail dos veces** (medido: dos push con el mismo
`historyId` separados por 15 ms). El segundo job no encuentra nada porque el
primero ya avanzó el marcador.

Dos cosas que costaron entenderlo:

1. **La clave es el `historyId`, no el `messageId`.** El `jobId: messageId` ya
   deduplicaba y aun así entraron los dos, luego traían `messageId` distinto:
   son entregas separadas de Google, no reintentos.
2. **La clave se reserva antes de encolar y se libera si el encolado falla.**
   La primera versión la reservaba y no la liberaba, y eso *perdía correos*:
   había 27 fallos de encolado en dos días que se recuperaban solos porque la
   segunda entrega reintentaba 4 ms después. Reservar por adelantado convertía
   esa red de seguridad en diez minutos de silencio.

**No se puede escribir la clave *después* del encolado**: `SET NX` es lo único
atómico, y sin reserva previa las dos entregas concurrentes verían el terreno
libre y encolarían las dos. Lo que arregla el fallo es el `del` en el `catch`.

Si Redis falla, se deja pasar: perder un correo es peor que procesarlo dos
veces, y el duplicado ya se sabe inofensivo.

### 🟠 `AlertService` — las tres reglas de la Capa 1

`common/alerts/`. Webhook entrante de **Google Chat** (`{ text }`, negrita con
**un solo asterisco** — Chat no entiende `**esto**`).

1. **Nunca lanza.** Se llama desde bloques `catch`; un alertador que lance
   convierte un fallo en dos y se traga el error original.
2. **Freno en Redis** (`SET NX EX`, 15 min por clave). Sin él un bucle de fallos
   manda cientos de mensajes, y un canal que grita se silencia. Ante un fallo de
   Redis, **manda igualmente**: un aviso de más es menos grave que un silencio.
3. **Lleva la causa** (`describirError`). «0 de 1» sin motivo no es una alerta,
   es una intriga.

**Google Chat y no correo, por diseño:** la mitad de lo que hay que vigilar *es*
Gmail, y mandar por Gmail el aviso de que Gmail falló es un detector de
incendios que se apaga con el incendio.

Cuatro enganches: el cron del watch cuando `renovados < candidatos`, el fallo de
encolado del webhook, los 5xx no previstos del filtro global, y **los dos
oyentes de la DLQ de BullMQ** — que llevaban semanas anotando trabajo perdido en
una cola que **no leía nadie**. `QueueEvents.failed` se emite solo cuando el job
llega al conjunto `failed`, es decir tras agotar reintentos, así que lo que pasa
por ahí es trabajo definitivamente perdido.

⚠️ `ALERT_WEBHOOK_URL` **es una credencial** —quien la tenga escribe en el
canal—, así que va por Secret Manager. En `deploy.yml` se añade condicionada a
`vars.ALERT_WEBHOOK_SECRET`: un `--set-secrets` que nombre un secreto
inexistente **falla el despliegue entero**.

---

## Estado a 2026-08-13

### ⏰ Ya no hay cron dentro de la API

El barrido de vencidas era un **job repetible de BullMQ**, y un repetible
necesita un proceso vivo que lo dispare. Cloud Run escala a cero sin tráfico y
estrangula la CPU entre peticiones, así que **no corría**: medido en la propia
cola, una cita de las 01:05 se ejecutó **39,5 horas tarde**, y solo porque una
sonda externa despertó el contenedor.

Ahora lo dispara **Cloud Scheduler** por HTTP, que es como Cloud Run espera que
se haga un cron:

| Ruta | Cada | Qué hace |
|---|---|---|
| `POST /cron/overdue` | hora | El barrido de vencidas de siempre |
| `POST /cron/gmail-watch` | día | Renueva `users.watch`, que **caduca a los 7 días** |

Tres cosas que conviene no volver a descubrir:

1. **Sin prefijo global.** `main.ts` no llama a `setGlobalPrefix`, así que las
   rutas son exactamente `/cron/...`. Un `/api/cron/...` en la configuración de
   Scheduler da 404 y el job se ve «ejecutado» en la consola igual.
2. **Los guards no se comparten.** `CronAuthGuard` valida a Scheduler y
   `PubSubAuthGuard` a Pub/Sub, **con cuentas de servicio distintas**.
   Reutilizar uno para el otro da 401; relajarlo para aceptar ambas dejaría que
   el webhook de Gmail pudiera disparar el barrido, y al revés. La verificación
   OIDC común (firma, `aud`, cuenta emisora) vive una sola vez en
   `common/security/google-oidc.verifier.ts`.
3. **La audiencia es una sola para los dos jobs**, pasada explícita con
   `--oidc-token-audience`. Si se deja que Scheduler la deduzca, cada job firma
   con su propia URL como `aud` y `CRON_OIDC_AUDIENCE` solo puede validar uno.

⚠️ **Quitar un cron de BullMQ del código no lo apaga**: el planificador vive en
Redis y con Upstash sobrevive indefinidamente. `OverdueCronPurge` lo borra
explícitamente al arrancar, en tres pasadas —nuestro id, planificadores
huérfanos de la cola y repetibles del formato antiguo `queue.add({repeat})`—.
Sin eso habría dos barridos: el nuevo y el fantasma.

### 📧 La ingesta de Gmail está viva (por fin)

Verificada de extremo a extremo el 2026-08-13: correo real → push de Gmail →
webhook 200 → cola → `Sync incremental: 1 correo(s)` → clasificación por IA →
**1 tarea creada**. Antes no podía funcionar: `deploy.yml` no inyectaba ni una
`GMAIL_PUBSUB_*` y la revisión salía verde igual.

⚠️ **Pub/Sub entrega cada aviso dos veces** (dos `messageId` distintos, así que
el `jobId` no deduplica). Es inofensivo —la sincronización es idempotente y el
segundo job encuentra 0 correos— pero duplica el trabajo en Redis, y Upstash va
por 108 k de 500 k comandos al mes del plan gratuito. Sin resolver.

### 🚨 Dos trampas de `deploy.yml` que costaron un diagnóstico cada una

**`--set-env-vars` reemplaza el conjunto entero.** Todo lo inyectado a mano con
`gcloud run services update` desaparece en el siguiente despliegue, **sin un
solo error**. Si una variable tiene que sobrevivir, va en la lista condicional
de `deploy.yml`; ponerla solo en la revisión es ponerla hasta el próximo push.

**`WEB_URL` no se validaba** y por ahí entraron dos fallos: un dominio que
servía otra aplicación entera y luego un alias tras el SSO de Vercel (302 para
quien no tenga sesión en la cuenta). Ahora el pipeline exige 200 sin
credenciales y `<title>PMO Dashboard` en el HTML antes de construir, más un
preflight de CORS **después** de desplegar. Ese último no puede ir antes:
interrogaría a la revisión vieja y bloquearía justo el despliegue que arregla la
variable.

### ✉️ El transporte de correo ahora falla del lado seguro

`COPILOT_EMAIL_TRANSPORT` comparaba contra `'mock'`, así que **su ausencia
significaba enviar por Gmail de verdad** — y el despliegue la borraba en cada
revisión. Invertido: el envío real se pide por su nombre (`real` o `smtp`) y
todo lo demás cae en simulado. Un correo enviado no se recoge, así que el modo
peligroso no puede ser el que sale de no hacer nada.

### 🐛 `@Res({ passthrough: true })` + `res.json()` = 500 intermitente

`/time/active` daba `ERR_HTTP_HEADERS_SENT` cinco veces cada diez minutos. Con
`passthrough`, Nest **conserva el control del ciclo de respuesta** y manda
también el valor devuelto: tras el `res.json()` del método, intentaba un segundo
envío con `undefined` sobre una respuesta ya cerrada. `passthrough` es para
tocar la respuesta —una cookie, una cabecera— **y dejar que Nest mande el
cuerpo**. Si el cuerpo lo manda el método, el control tiene que ser suyo entero:
`@Res()` a secas.

### 🔎 Un `try` demasiado ancho miente sobre la causa

El webhook de Gmail registraba `Error parseando payload` cada pocos minutos, y
`queue.add` estaba **dentro del mismo `try`** que el `JSON.parse`: un fallo de
Redis se registraba como un fallo de parseo, culpando al remitente. Ahora hay
tres mensajes distintos —payload que no es JSON, notificación de control sin
`emailAddress` que se ignora limpiamente, y fallo de la cola—, los dos primeros
con muestra recortada a 200 caracteres del contenido real.

_El misterio sigue medio abierto:_ contando líneas del incidente de las 21:51:30
(dos pushes, dos «recibido», un error) al menos **uno** de esos errores no pudo
ser de parseo. Los de las 21:51:08 sí encajan con parseo real. La sospecha es la
notificación inicial que Gmail manda al crear un `watch` — el primer error cae
un segundo después de registrarlo.

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
  — hace falta en **dos sitios**: las variables del repositorio (✅ puesta el
  2026-08-07) y las URIs autorizadas del cliente OAuth (⏳ pendiente, es de
  Gravity y no se hace desde aquí). Mientras falte la segunda, el login muere
  con `redirect_uri_mismatch` aunque el despliegue esté en verde.
- `WEB_URL` — hoy `https://pmo-frontend.vercel.app`, que responde 200.

- **El CI se salta los commits de solo documentación** (encargo de Doc,
  2026-08-07). `paths-ignore` con `**/*.md`, `docs/`, `.gitignore`,
  `.editorconfig` y `LICENSE`.

  **El filtro va en `ci.yml` y no en `deploy.yml`, y esto es lo que hay que
  recordar**: `deploy.yml` se dispara por `workflow_run`, y **`workflow_run` no
  admite `paths` ni `paths-ignore`** — GitHub los ignora en silencio, sin error
  de sintaxis y sin aviso, así que escribirlos allí daría una protección
  inexistente. Filtrando en el CI sale gratis: sin run de CI no hay
  `workflow_run` que concluya, y el despliegue tampoco se dispara.

  Se salta **solo si todos** los archivos del push encajan; un commit mixto
  corre entero. `.github/**` queda fuera de la lista a propósito: un cambio en
  los workflows tiene que probarse a sí mismo.

- ✅ **Primer despliegue en verde por la pipeline en la historia del proyecto**
  (`472a6ba`, run `31201583614`). Comprobado contra la URL pública, sin
  credenciales de por medio:

  | Sonda | Respuesta |
  |---|---|
  | `GET /health/ready` | **200** · `database up` (66 ms) · `redis up` (34 ms) |
  | `GET /health/live` | **200** |
  | `GET /auth/me` sin cookie | **401** |
  | `GET /auth/google` | **302** hacia Google |

  Las dos últimas son las que confirman que **abrir el servicio no lo dejó
  desprotegido**: la puerta de Cloud Run deja pasar a cualquiera y es el
  `AuthGuard` el que corta, que es exactamente el reparto que se diseñó. Y el
  200 de `ready` es la primera prueba viva de que **Neon y Upstash responden
  desde la revisión desplegada por la pipeline**, no desde una manual.

- **Costó tres obstáculos encadenados, y ninguno era del código de la API.** La
  aplicación llevaba días lista; lo que fallaba era cómo se le entregaba la
  configuración. Los tres se parecen en algo que conviene no olvidar: **los tres
  se veían desde fuera del proceso y ninguno desde dentro**. Un secreto que no
  existe, una puerta que rechaza antes del contenedor y una variable con la ruta
  equivocada no dejan ni una línea en el log de la aplicación.
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
- ⚠️ **El login todavía no está probado, y el verde no lo prueba.** La variable
  `GOOGLE_REDIRECT_URI` ya vale
  `https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback` (puesta el
  2026-08-07), pero **falta la otra mitad**: autorizar esa misma cadena en el
  cliente OAuth de la consola de Google. Hasta que eso ocurra, Google devuelve
  `redirect_uri_mismatch` desde su propia pantalla — un error que parece del
  cliente OAuth y no del despliegue. **Un pipeline en verde no significa que el
  login funcione**: la sonda solo mira `/health/ready`, que no toca OAuth, y el
  302 de `/auth/google` demuestra que salimos hacia Google, no que Google nos
  acepte de vuelta.

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

### 🔴 La base de producción estaba VACÍA (hallazgo del 2026-08-07)

La primera ejecución del Job lo destapó: aplicó **las nueve migraciones desde
cero**, empezando por `20260724000000_init`. Que corra la migración inicial
significa que Neon **no tenía ni una sola tabla**.

**Y nada lo delataba.** `/health/ready` llevaba días devolviendo
`database: up`, y era cierto: la sonda comprueba **conectividad**, no esquema —
un `SELECT 1` funciona igual de bien contra una base vacía. Así que la API
figuraba sana en todos los tableros, con la revisión lista, la sonda en verde y
los logs impecables, mientras **cualquier petición que tocara una tabla habría
muerto** con `relation does not exist`. Nunca fue funcional en producción; solo
lo parecía.

Es el mismo patrón que los otros fallos de la jornada: **visible desde fuera del
proceso, invisible desde dentro**. Y es la cuarta afirmación de
`GRAVITY_MEMORY.md` que los hechos desmienten — no es que faltara el Job, es que
no había esquema.

_Por qué no salió `P3005`_: ese error necesita una base **con** tablas y **sin**
registro de migraciones. Esta no tenía nada, así que el camino limpio era el
único posible.

**Saldado el mismo día.** `/health/ready` tiene ahora una tercera entrada,
`schema`, que cuenta las filas de `_prisma_migrations`. Se pregunta por esa
tabla y no por una del dominio porque responde a la pregunta correcta: no
«existe esta tabla» —que la crea cualquiera a mano y da un falso verde— sino
«se llegó a migrar».

`database` y `schema` van **separadas a propósito**: son dos fallos que piden
dos reacciones distintas. «No contesta» se espera; «no está migrada» se corre el
Job. Fundidas en un solo `up`/`down` habría que entrar en los logs para saber
cuál de las dos es.

⚠️ **Solo falla si no hay esquema en absoluto, y esa acotación es la parte
delicada.** Una migración a medias es lo **normal** durante unos segundos de
cada despliegue, porque el Job migra mientras la revisión vieja sirve: si
tumbara la sonda, cada despliegue sacaría del balanceador a **toda** la flota y
el arreglo sería peor que el fallo. Lo mismo con una revertida, que necesita una
persona y no un 503. Las dos se cuentan y se enseñan en el detalle —para
diagnosticar, no para tumbar—. Hay una prueba por cada caso.

### Cookies entre sitios distintos (2026-08-07, encargo de Doc)

En producción el frontend (Vercel) y la API (Cloud Run) son **sitios distintos**,
así que cada `fetch` del tablero es una petición *cross-site*.

- `SameSite` depende del entorno: **`none` en producción**, `lax` en desarrollo.
  Con `lax` en producción el navegador **descarta la cookie sin avisar** —sin
  error de red, sin nada en consola— y el síntoma es un 401 en todas las rutas
  justo después de un login que pareció ir bien. Del lado del servidor no hay
  nada que mirar: la petición llega, llega sin cookie.
- **`none` obliga a `secure`**: el navegador rechaza un `SameSite=None` sin
  `Secure`. Van juntas o no van. En Cloud Run se cumple sola porque sirve HTTPS.
- En desarrollo se queda `lax` **y sin `secure`**, que además de correcto es lo
  único que funciona: por el proxy de Vite el frontend es mismo origen, y
  `secure` sobre `http://localhost` dejaría la cookie sin guardar.
- `clear()` borra con **las mismas señas** con las que puso. Un `clearCookie`
  con otro `sameSite`/`secure`/`path` no identifica la misma cookie y el logout
  no borraría nada. Hay prueba.
- ⚠️ **La cookie de `state` del OAuth se queda en `lax`, y no es un olvido.**
  Sus dos puntas son navegaciones de primer nivel (un `<a href>` y el redirect
  de Google), y `Lax` **sí** viaja en una navegación GET de primer nivel aunque
  venga de otro sitio. Además es la defensa anti-CSRF del login: aflojarla a
  `none` la haría viajar en peticiones cross-site que no son navegaciones, que
  es justo lo que debe impedir. Se afloja lo que estorba, no lo que está al lado.
- El CORS ya traía `credentials: true` desde el Sprint 1, en `main.ts` y en el
  gateway de sockets. No hizo falta tocarlo.

⚠️ **Esto depende de que el navegador acepte cookies de terceros.** Con el
bloqueo de terceros activado, `SameSite=None` tampoco viaja. La solución de
fondo no es una bandera sino un **dominio propio** que ponga API y frontend en
el mismo sitio (`api.ejemplo.com` + `app.ejemplo.com`); entonces esto vuelve a
`lax` y el problema desaparece de raíz.

### Migraciones en producción (2026-08-07, encargo de Doc)

**Nunca se han ejecutado por ningún job.** `gcloud run jobs list` devolvía cero
elementos, así que la línea de `GRAVITY_MEMORY.md` que dice «las migraciones de
Prisma se ejecutan sobre Neon durante el despliegue» describe algo que no
existía: ni había Job, ni había paso en el workflow.

Desde este encargo, `deploy.yml` trae un paso **`Migrar la base de datos`**
entre publicar la imagen y desplegar la revisión, con un Job de Cloud Run
(`pmo-api-migrate`) que corre `prisma migrate deploy`.

- **El orden importa y es el que es.** Migrar después de desplegar significa
  que la revisión nueva pide columnas que aún no existen. Migrando antes, la
  ventana de riesgo es la contraria y sí se puede controlar: entre migrar y
  desplegar sirve la revisión **vieja** contra el esquema **nuevo**. De ahí la
  regla al escribir migraciones: **compatibles con el código que ya está
  arriba**. Añadir es compatible; renombrar y borrar no, y van en dos
  despliegues.
- **Un Job y no un paso del runner.** El motivo escrito en su día —«el runner
  no llega a Cloud SQL sin el Auth Proxy»— **caducó con la mudanza a Neon**,
  que es Postgres público. El motivo que sigue en pie es que así `DATABASE_URL`
  **no sale de Google Cloud**.
- **`jobs deploy` (crear-o-actualizar), no `jobs create`.** El Job apunta
  siempre a la imagen de este commit. Con `create`, actualizarlo quedaría en
  manos de que alguien se acuerde, y el día que se olvidara migraría con un
  esquema viejo sin decirlo.
- `--max-retries 0`: una migración que falla se mira, no se reintenta sola.
- ✅ **El comando del Job está verificado dentro de la imagen real**, construida
  en local, antes de mandarlo a producción. Las tres cosas que había que
  comprobar y no se podían suponer:

  | Duda | Resultado |
  |---|---|
  | ¿Sobrevive la CLI de Prisma al `--omit=dev`? | Sí — `Prisma CLI Version : 5.22.0`. Es dependencia **de producción**, no de desarrollo |
  | ¿Encuentra el esquema? | Sí — `Prisma schema loaded from prisma/schema.prisma`; `npm --workspace` sitúa el cwd en `apps/api` |
  | ¿Falla por otra cosa? | No. El único error es `DATABASE_URL` ausente, que es justo lo que inyecta Secret Manager |

  La identidad también: el Job corre como `614812477499-compute@developer…`,
  la **misma** del servicio, que tiene `roles/secretmanager.secretAccessor` a
  nivel de proyecto. Por eso el Job no lleva `--service-account`: heredarla es
  lo correcto, y fijarla a mano sería otra cosa que mantener sincronizada.

  _De paso, sobre el peso de la imagen_: **Docker 29 reporta el tamaño
  comprimido** (153 MB) en `docker images`. El real sigue siendo ~882 MB
  —`node_modules` son 440 MB y `googleapis` 204 MB de ellos—, así que la cifra
  documentada y la propuesta de pasar a `@googleapis/gmail` siguen vigentes.
- ⚠️ **Riesgo real en la primera ejecución: `P3005`.** Si Neon ya tiene tablas
  pero no la tabla `_prisma_migrations`, `migrate deploy` se planta porque no
  puede saber qué se aplicó. Se resuelve marcando lo ya aplicado
  (`prisma migrate resolve --applied <nombre>`). **Falla antes de desplegar**,
  así que la revisión que sirve no se toca. Hay 9 migraciones en el repo.

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
