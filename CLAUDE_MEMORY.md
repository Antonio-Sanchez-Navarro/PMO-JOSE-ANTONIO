## Fase 8 — cuota, adjuntos y las dos listas cerradas (2026-09-11)

**885 pruebas en 40 suites**, en verde. `tsc` y ESLint limpios. Tres commits:
el P0 de la cuota, los vocabularios de banco y empresa, y la épica de adjuntos.

### El P0: un correo borrado se comía la cuota de Gmail

`fetchMessages` contaba como `fallidos` **cualquier** error por mensaje, y
`syncHistory` retiene el marcador cuando hay `fallidos` para no perder correos.
Con un correo borrado en el tramo, eso es retener para siempre: el 404 se repite
en cada pasada, el marcador no avanza nunca, y cada notificación de Pub/Sub
redescarga el tramo entero para encontrarse el mismo 404.

**Retener protege de perder lo que existe; no sirve de nada con lo que ya no
existe.** Esa es la frase entera del arreglo. Ahora hay tres desenlaces por
mensaje y no dos: cuota (para la ingesta), omisión permanente 404/410 (se
registra, no cuenta, el marcador avanza) y cualquier otro fallo (cuenta y
retiene, como siempre).

**Es la tercera vez que este bucle aparece con otra cara.** El 08-09 fue la
clasificación caída dejando todo `sinEncolar`; el 09-09 se sacó `sinEncolar` de
los que retienen; hoy, el 404. Cada vez, el mismo patrón: algo que no se puede
arreglar reintentando, tratado como si se pudiera. **La pregunta que ahorra la
próxima no es «¿esto falló?» sino «¿reintentarlo puede cambiar el resultado?»**
— si no, retener no es prudencia, es un bucle.

**Y el 400 se quedó fuera de las omisiones a propósito.** Un 400 puede ser «ese
id está malformado» —un mensaje— o «el parámetro `format` no vale», que
afectaría a la tanda entera. Tratarlo como omisión convertiría un fallo global
en «la tanda entera no existía»: se saltarían todos, el marcador avanzaría y el
tramo se perdería en silencio. **Atascarse y avisar es el lado seguro por el que
equivocarse**, y por eso el 401 y el 403 de permisos tampoco entran.

El centinela es un `Symbol` y no `null` porque `null` ya significaba «falló,
quizá se recupere». Confundir los dos era el bug; ahora no compila.

De paso, la alerta `gmail-cuota-agotada` decía que la causa típica es una
clasificación caída aguas abajo. Dejó de ser cierto el 09-09. Un texto de alerta
que describe el mundo de hace dos semanas manda a mirar donde ya no está.

### Banco y empresa: `null` no es «no lo sé»

Las listas van en `@pmo/shared` y como `enum` en la herramienta, que es la
lección de `category` aplicada antes de que cueste: mientras fue `type: string`,
la API aceptó salidas corruptas del modelo dentro del valor.

Aquí hubo un motivo propio y más fuerte: **estos campos se convierten en
pestañas**, así que «Santander», «SANTANDER» y «santander» serían tres. Por eso
`canonico()` normaliza en vez de guardar lo que llegue.

**Lo que no está en la lista degrada a `null` y no a un valor de respaldo, al
revés que `category` con su `OTHER`.** Y la diferencia no es estética: un
`OTHER` en `category` es una categoría legítima —«este correo no encaja»— pero
un «otro banco» sería una pestaña con correos que no tienen nada en común. La
regla que me llevo: **un valor de respaldo solo vale cuando el respaldo
significa algo**; si no, el hueco es más honesto.

Se persisten siempre, también en `null`. Dejar el valor viejo por no pisarlo
convertiría un banco corregido en un banco pegado para siempre.

### Adjuntos: lo caro no era el código, era decidir qué se manda

La ficha se guarda, el contenido no. Un correo con tres PDF de 8 MB son tres
fichas de doscientos bytes, y el binario se le pide a Gmail cuando alguien lo
necesita.

**`attachment-budget.ts` vive aparte porque equivocarse ahí no da un error: da
una factura.** Y el filtro que más ahorra es el que no estaba en el encargo:

⚠️ **Los adjuntos incrustados no se mandan.** Casi toda firma corporativa lleva
un logo, y el logo tiene `attachmentId` igual que un contrato. Sin ese filtro,
la clasificación le mandaría a Claude el logotipo de la empresa **en cada correo
que entra**, pagando tokens de imagen por mirar un PNG de 4 KB. Se distinguen
por `Content-Disposition: inline` o por tener `Content-ID`, y se miran los dos
porque no todos los clientes de correo escriben los dos.

El tope por archivo es 4,5 MB y no 5: lo que se cuenta es el tamaño que declara
Gmail, y lo que viaja es base64, que abulta un tercio más.

### El aviso tiene que seguir al hecho

El prompt decía siempre «NO puedes ver su contenido». Era verdad y dejó de
serlo, y **quitarlo del todo habría sido el error fácil**: un correo puede traer
tres PDF de los que se manden dos y se quede fuera uno de 20 MB. Sin aviso, el
modelo escribe «según el documento adjunto…» sobre el que no vio; con el aviso
puesto siempre, se le prohíbe usar justo lo que acabamos de pagar por mandarle.

Por eso los ausentes viajan **con nombre y motivo** desde el reparto hasta el
prompt, y se nombran uno a uno. Es la mitad del trabajo que no se ve en la
respuesta de la API y sin la cual el resto no vale.

### La ruta de descarga es la parte con superficie de ataque

Dos cosas que no son opcionales:

1. **Se comprueba que el adjunto sea de ese correo**, no solo que el correo sea
   del usuario. El `userId` protege el correo; es la lista de fichas la que dice
   qué adjuntos son suyos. Sin eso, la ruta es un proxy para bajar cualquier
   adjunto del buzón conociendo su id.
2. **`Content-Disposition: inline` va por lista de permitidos, no de
   prohibidos.** Un adjunto `text/html` servido en línea se ejecuta en
   **nuestro** origen, con la cookie de sesión a mano: bastaría mandarle un
   correo al Jefe para robarle la sesión en cuanto lo abriera. Y el nombre del
   archivo lo escribió el remitente y acaba dentro de una cabecera HTTP, así que
   un salto de línea ahí la parte en dos.

### Lo que **no** está verificado

Lo mismo que la Fase 7, y ahora pesa más: **Docker sigue parado, así que nada de
esto se ha ejecutado contra un Postgres ni contra Gmail ni contra Anthropic.**
Las dos migraciones están escritas a mano —`prisma migrate dev` necesita base— y
las aplica el Job de `deploy.yml` antes de publicar la revisión, que es donde se
sabrá si están bien.

Lo que más conviene mirar en la primera ejecución real, por orden:

1. Que `migrate deploy` pase. Si falla, la revisión vieja sigue sirviendo.
2. El primer correo con adjunto de verdad: que `messages.attachments.get`
   conteste y que Anthropic acepte el bloque `document`. El formato del bloque
   está escrito contra el SDK y comprobado por tipos, no por una llamada.
3. El coste de la primera tanda con adjuntos. Los topes son una apuesta.

---

## Fase 7 — el despacho masivo de la bandeja (2026-09-10)

Dos rutas nuevas para vaciar los 728 `PENDING` de producción: `GET /emails/threads`
(401 hilos en vez de 728 filas) y `POST /emails/bulk-dismiss` (los 318 no
accionables en dos llamadas). Contrato acordado con Gravity **antes** de escribir
código, y documentado en `API_CONTRACTS.md`. `POST /emails/bulk-approve` se sacó
del alcance por decisión de Doc.

**801 pruebas en 38 suites**, en verde. `tsc` y ESLint limpios.

### `isActionable` estaba en la base y no salía por ninguna parte

`GET /emails` **aceptaba `?actionable=false` para filtrar y luego no devolvía el
campo por el que acababa de filtrar**. La columna existía desde el Sprint 3 y
estaba en `GET /emails/:id`, pero no en `SELECT_TRIAGE`, así que la fila viajaba
sin ella. La bandeja podía pedir los no accionables y no podía enseñar cuáles lo
eran, ni ofrecer «marca todos».

Es exactamente la lección que Gravity escribió en la Fase 6 sobre
`hasAttachments` —_«un campo que no devuelve ningún endpoint no existe»_—, con
otro campo y cuatro meses después. **La forma de que no vuelva a pasar no es
recordarla: es que un filtro y su campo se añadan juntos.** Un `?actionable=` sin
`isActionable` en el `select` es un contrato incompleto que compila y pasa los
tests, porque nadie prueba lo que no devuelve.

### La trampa de la fase: `isActionable: false` no significa «no accionable»

**La columna nace en `false` y se queda ahí hasta que alguien clasifique el
correo.** Así que «la IA dijo que aquí no hay trabajo» y «nadie ha mirado esto
todavía» se leen **idénticos** desde el campo.

Y el encargo era «deja que el Jefe barra los no accionables de un golpe». Con el
atajo colgado de `!isActionable`, ese golpe se lleva también todo lo que el
worker no ha procesado — que es justo lo que no se puede descartar a ciegas,
porque puede tener trabajo dentro. **Un descarte masivo mal condicionado no da
error: deja la bandeja limpia y el trabajo perdido**, que es la peor forma de
fallar que puede tener esta fase.

Por eso `allNonActionable` exige **tres** condiciones por correo, no una:
`processedAt` puesto (el worker lo despachó), `skipReason` vacío (la IA llegó a
opinar; si está puesto, el correo se saltó la clasificación y su `false` no
significa nada) y el veredicto negativo. Y es `every`, no `some`: basta un
mensaje con trabajo dentro para que el hilo no se pueda barrer.

Gravity tenía la mitad del hallazgo en un comentario de `types.ts` —había notado
que `undefined` no es `false`— pero seguía pensando en preguntar
`isActionable === false`. La otra mitad, que un `false` de verdad tampoco basta,
está avisada en su buzón.

### Por qué la paginación de hilos son tres consultas y no una

Agrupar en memoria lo que ya devuelve `GET /emails` era mucho más corto. Pero
habría paginado **por correo**: para servir «los 50 primeros hilos» hay que
bajarse la bandeja entera y averiguar dónde acaba el hilo 50. Con 728 se nota
poco; el problema es que ese número solo sube, y la fase existe justamente
porque la lista plana dejó de escalar.

Así que: `groupBy` paginado con `orderBy: { _max: { receivedAt: 'desc' } }` para
los hilos de la página, `groupBy` completo con `_count: { _all: true }` para los
dos totales —`total` es su longitud y `totalEmails` la suma, en una sola consulta
en vez de un `COUNT(DISTINCT)` en SQL crudo— y un `findMany` acotado a esos
hilos.

**El `findMany` repite el filtro además de acotar por `threadId`.** Sin eso, un
hilo con un correo pendiente y otro completado traería los dos y `messageCount`
diría 2 mientras la bandeja enseña 1. Tiene una consecuencia de contrato que hay
que decir en voz alta: **el hilo es el que deja el filtro, no el que hay en
Gmail**. Los `emailIds` que se devuelven son exactamente los que `bulk-dismiss`
va a mover, ni uno más — que es lo que se quiere— pero `messageCount` no es
«mensajes de la conversación» y pintarlo así mentiría.

Y el orden de la página se recorre sobre `threadIds`, no sobre el `Map` que los
agrupa: el orden lo decidió la base, y el de inserción de un `Map` solo lo
respeta por accidente.

### Un lote no es todo o nada, y tiene que decir por qué

318 ids y uno que ya no existe no pueden tumbar las otras 317. La respuesta es
**200 con desglose**: `{ requested, updated, skipped: [{ id, reason }] }`, con
tres motivos cerrados (`NOT_FOUND`, `ALREADY_DISMISSED`, `NOT_PENDING`) contra
los que se programa por código, no por texto.

Se cumple siempre **`updated + skipped.length === requested`**, y por eso los ids
repetidos se cuentan una vez. Es lo que deja al cliente *comprobar* la respuesta
en vez de creérsela — un lote que contesta solo «updated: 315» sobre 318 no dice
cuáles tres se quedaron dentro, y la bandeja se queda con correos que nadie sabe
nombrar.

El desglose se construye **dentro** de la transacción y se devuelve, en vez de
acumular sobre un array de fuera: si la transacción se reintentara, el array
externo se quedaría con los duplicados de la vuelta anterior.

**Sin `force` el lote solo mueve `PENDING`.** Descartar es avanzar, así que
`esReapertura` no protege esto —solo salta al volver a `PENDING`— y el
guardarraíl tuvo que ser propio del lote. El motivo: la selección se hizo sobre
una lista que pudo pintarse hace diez minutos, y arrastrar a `DISMISSED` un
correo que alguien completó mientras tanto es borrarle trabajo con un clic que
iba dirigido a los boletines.

### `email.bulk_updated`: el ahorro estaba en el número de eventos

318 `email.updated` seguidos no son más información: son 318 repintados
intercalados, y la bandeja parpadea mientras se vacía en vez de vaciarse. Un
evento por petición, con **solo los ids** —el cliente ya tiene esas filas
pintadas y lo único que necesita es quitarlas— y respetando `x-socket-id` igual
que todo lo demás. No se emite si no se movió nada.

De paso, corregido en `API_CONTRACTS.md` un párrafo que llevaba desde el
2026-08-25 describiendo el comportamiento **anterior** del gateway: decía que un
payload sin `userId` se difunde a todos los clientes, y desde §43.5 no se emite a
nadie y se registra un `error`.

### La trampa de Nest que no da error al compilar

**`@Get('threads')` va declarada antes que `@Get(':id')`, y tiene que seguir
ahí.** Nest resuelve por orden de declaración: con `:id` delante,
`/emails/threads` entra por el detalle con `id: "threads"` y contesta un 404
perfectamente razonable sobre un correo que nadie pidió. No lo ve el compilador
ni ningún test unitario del servicio — solo se ve llamando a la ruta.

### Lo que **no** está verificado

Docker Desktop estaba parado, así que **las dos consultas de `groupBy` no se han
ejecutado nunca contra un Postgres**. Están comprobadas por tipos —y los tipos de
`groupBy` en Prisma son estrictos de verdad, no un `any`— y por pruebas con
dobles, pero eso no es lo mismo. `orderBy` sobre un agregado con paginación es
exactamente la clase de consulta que compila y luego se queja. La primera llamada
real a `GET /emails/threads` es la prueba que falta.

---

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
