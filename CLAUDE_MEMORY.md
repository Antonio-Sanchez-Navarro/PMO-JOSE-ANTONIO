# CLAUDE_MEMORY

**Cerebro del Backend.** Refactorizaciones, variables de entorno y lógica de
`@pmo/api`.

> Los contratos de las rutas **no viven aquí**: están en `API_CONTRACTS.md`.
> Esto es lo que hay que saber para tocar el backend sin repetir un error ya
> pagado.

---

## §45.1: el asunto colaba cabeceras, y la condición que lo permitía parecía una defensa (2026-08-25)

`encodeHeader` devolvía el texto **intacto** si era ASCII puro:

```ts
if (/^[\x00-\x7F]*$/.test(texto)) return texto;
```

**`\r` y `\n` son ASCII** —0x0D y 0x0A—, así que un asunto como
`Hola\r\nBcc: alguien@ejemplo.com` pasaba entero a `buildRawMessage`, que une
las cabeceras **justo con `\r\n`**. El `Bcc` se convertía en una cabecera de
verdad: copia oculta, sin aparecer en ninguna pantalla.

> **La condición tenía cara de comprobación de seguridad y era la puerta.** Es la
> familia de «verde por la razón equivocada», pero peor: aquí el código que
> tranquiliza al que lo lee es el mismo que abre el agujero.

Y el asunto de un borrador **lo redacta el modelo**, así que basta con que el
copiloto lea un correo que lleve dentro la instrucción para que llegue hasta aquí
sin que ninguna persona la teclee.

**Arreglado en dos capas, y la separación es el fondo del asunto:**

| Capa | Qué hace | Por qué ahí |
|---|---|---|
| `SendEmailDto` | **Rechaza** con un motivo legible | Es la frontera: quien se equivoca merece enterarse |
| `encodeHeader` | **Sanea y no lanza** | Es la única que ninguna ruta puede saltarse |

No es duplicar. Si mañana otra herramienta del copiloto arma un correo sin pasar
por ese DTO, la garantía tiene que seguir en pie — y **una garantía que lanza deja
de garantizar el día que alguien la envuelve en un `try`**.

Dos detalles que costaría redescubrir:

- **Los controles se sustituyen por un espacio, no se borran**, para que
  `linea1\r\nlinea2` no acabe como `linea1linea2`.
- **Se sanea antes de decidir la rama.** Codificar el original en base64 habría
  metido los saltos **dentro** del *encoded-word*, y vuelven al decodificar.

**`To` y `Cc` no estaban expuestos**: los cubre `@IsEmail`, que no admite CRLF. Se
comprobó antes de tocarlos, en vez de blindarlos por si acaso.

**La prueba arma el mensaje entero** y comprueba que no existe una cabecera `Bcc`.
Probar `encodeHeader` a solas dejaría pasar una regresión que volviera a meter el
texto en crudo desde otro sitio: el daño no se hace en la función, se hace al unir.

### ⚠️ Un `\0` en el fuente es un byte NUL de verdad

Escribiendo esas pruebas dejé un NUL **literal** dentro de `copilot.spec.ts`. El
archivo compila y las pruebas pasan, pero `grep` lo declara **binario** y deja de
buscar dentro — en un repositorio donde media verificación es un `grep`, eso es un
archivo que se vuelve invisible sin que nadie lo note.

Y de paso me hizo perder un rato en falso: `grep -c $'\x00'` **no sirve para
detectarlo**, porque bash no puede pasar un NUL como argumento y el patrón llega
vacío — con lo que cuenta **todas** las líneas y parece que todo está infectado.
Se comprueba leyendo los bytes (`.count(b'\x00')`), no con `grep`.

En las pruebas, los controles se escriben `String.fromCharCode(0)`.

---

## Capa 3: vigilar lo que se consume, no lo que se hace (2026-08-25)

Las tres pasadas de código dieron 27 hallazgos y **ninguno era una cuenta atrás**.
Quedaban ~$8 de crédito en Anthropic y no los miraba nadie.

### Las dos comprobaciones previas, y una dijo que no

| | |
|---|---|
| ¿Se puede habilitar `cloudbilling`? | **Sí** — estaban apagadas `cloudbilling` **y** `billingbudgets`; ya lo están |
| ¿Puede el pipeline crear presupuestos? | **No.** En la cuenta `015493-A5F85A-D7B488` el único miembro es el usuario del Jefe |

Así que **no se escribe el paso**: haría 403 el día que hiciera falta. Y aunque se
pudiera conceder, dar a una cuenta de CI derechos sobre la **cuenta de
facturación** es un salto de alcance mucho mayor que los roles de proyecto — para
crear un objeto una sola vez. Se crea a mano y se documenta.

### 🔴 A.3: el saldo agotado NO es un 429

Comprobado en la referencia de la API, no supuesto. Es **`billing_error` con
403**, y **no es reintentable**. Eso desmonta la cadena que suponíamos:

| Lo que creíamos | Lo que pasa |
|---|---|
| 429 → `convieneEsperar` → `frenarLaCola` pausa el worker | 403 no lo reconoce nadie → el job se relanza, agota sus tres intentos y cae en la DLQ |

**El worker no se pausa.** Es peor de diagnosticar: cada correo falla por
separado y la DLQ se llena de síntomas. El fondo del hallazgo se sostiene entero
— la DLQ diría «un job falló» y nadie diría la causa.

Ahora se detecta por `type`, se avisa con las palabras «se acabó el crédito de
Anthropic» y **no se relanza**: reintentar no rellena la cuenta.

### Verificado contra la API real

Un `billing_error` de verdad no se puede provocar sin vaciar la cuenta, así que se
comprobó lo que sí se podía y era lo que estaba en duda — **que el error real
traiga los campos donde el código los lee**:

```
constructor : AuthenticationError
status      : 401
type        : "authentication_error"
esSaldoAgotado(error) -> false
```

`.type` existe y lleva el tipo de la API. La discriminación funciona sobre un
error **real**, no sobre un doble.

⚠️ **Y apareció algo que no buscaba: la `ANTHROPIC_API_KEY` del `.env` local está
inválida** (`401 API key is invalid`). Producción usa la de Secret Manager y esa
sí funciona — se ve clasificando en los logs—, pero **en local nadie puede llamar
a Anthropic**. Por eso no se pudo confirmar contra una respuesta real que
`usage.input_tokens` venga donde A.1 lo lee; queda pendiente y **se dice en vez de
darlo por hecho**.

### A.1: el aviso dice días, no porcentaje

«Quedan ~11 días al ritmo de los últimos 7» se actúa; «has consumido el 90 %» se
archiva.

Tabla `AiUsage` por día y modelo —no por llamada: hace falta el ritmo, no la
auditoría— y los precios **en configuración con su fecha**, que el aviso repite.
Un precio sin fecha es la familia del `maxScale` del comentario: correcto el día
que se escribió y silenciosamente falso después.

Dos decisiones sobre **de qué lado equivocarse**:

- Cada día se cuenta **al precio que regía ese día**. Sumar el pasado al precio
  nuevo inflaría el gasto y adelantaría el aviso sin motivo.
- Un modelo que no está en la tabla se estima **por arriba**. Contarlo como gratis
  haría que el gasto pareciera menor **justo cuando alguien ha cambiado algo**:
  pasarse es recuperable, quedarse corto es cómo se llega a cero sin aviso.

**Sonnet 5 sube un 50 % el 31-08** y `CLAUDE_MODEL_CLASSIFY` es `sonnet-5`, así
que lo que sube es la clasificación — el gasto continuo. La subida se aplica sola
al llegar el día.

### 🔴 Y un fallo de diseño propio, que encontró una prueba

La prueba del umbral fallaba porque **el aviso de la subida de precio saltaba por
su cuenta**. Con el cron diario habría mandado el mismo mensaje **catorce días
seguidos**.

Una subida programada es **el hecho más estable que existe**: eso no es una
alerta, es una suscripción. Lo escribí yo, después de pasarme la sesión
arreglando exactamente eso en el barrido y en la sonda.

> **La lección no es «poner freno», es que la pregunta correcta no es «esto
> avisa?» sino «¿cada cuánto avisaría si la condición dura?».** Y que sin
> escribir la prueba, esto llega a producción con el mismo fallo que llevamos un
> mes cerrando.

Ahora lleva freno propio de una semana: avisa dos veces en la ventana, no catorce.

### ✅ Firmada en fuego real: llegaron los dos mensajes (2026-08-25)

Igual que las dos capas anteriores, **viendo llegar el aviso** y no razonando que
el `if` es correcto. La cadena entera, contra producción:

| | |
|---|---|
| Revisión sirviendo | `pmo-api-00100-gnd` = `d0354ad`, desplegada 11:05 |
| Job `pmo-coste-ia` | `ENABLED`, 08:00 `America/Cancun`, **nunca había corrido** |
| Primera pasada forzada | `200`, `$0.00 de $20` — la tabla existe, la migración entró |
| Correo real de prueba | webhook → clasificado en **6 s**, `isActionable=true` |
| Consumo registrado | `$0.01` (real ≈ $0,0069), sin una sola línea de «No se pudo anotar» |
| Umbral bajado a `0.007` | **`99%` · «quedan ~0 dia(s)»** |
| En Chat | los **dos** mensajes, con sus palabras |

**El punto de partida obligado, y por qué el orden importa.** La tabla nace vacía,
así que `gastado` era **cero**, y con cero **ningún presupuesto dispara**: `0/x` es
0 por bajo que se ponga `x`. Primero hay que gastar y después bajar el umbral —
al revés no se prueba nada y parece que el aviso no funciona.

**El freno, comprobado en vivo y gratis.** Forcé el cron **cuatro veces** en veinte
minutos y el aviso de la subida de precio está en Chat **una sola vez**. No hizo
falta prueba aparte: la repetición era el experimento.

### ⚠️ El log de `ALERTA ·` NO prueba que el aviso saliera

`AlertService.avisar` escribe `logger.warn('ALERTA · …')` **antes** de consultar el
freno en Redis, y a propósito —el log es la fuente de verdad y la notificación solo
una copia—. Consecuencia para quien verifique: **un `ALERTA ·` en Cloud Logging es
compatible con un mensaje que nunca se mandó.**

Lo confirmé del lado bueno: en la segunda pasada la línea de la subida volvió a
salir en el log y en Chat **no** apareció un segundo mensaje. Si me hubiera quedado
en el log, habría firmado la capa con una alerta frenada creyéndola enviada.

Lo que sí es señal negativa fiable: `El webhook de alertas respondió <status>` y
`No se pudo enviar la alerta`. Su **ausencia** no basta; la presencia sí acusa.

### 🔴 El ritmo se divide siempre entre 7, tenga o no 7 días de datos

`ritmoDiario()` suma lo de los últimos 7 días y hace `total / DIAS_DE_RITMO`. Con
la tabla estrenada hoy hay **un** día de datos y se divide entre **siete**: el
ritmo sale 7 veces menor que el real, y `diasRestantes` 7 veces mayor.

Se ve en la línea de después de restaurar el presupuesto:

```
Coste IA · $0.01 de $20 (0%) · ritmo $0.00/dia · quedan 20235 dia(s)
```

Con el gasto de hoy repartido en un día serían ~2.900; con el reparto entre siete,
20.235. **El sesgo va hacia «queda más de lo que queda»**, que es justo el lado por
el que se llega a cero sin aviso — y es el contrario del que este mismo archivo
eligió para el modelo desconocido, que se estima **por arriba** a propósito.

Dura una semana desde el estreno y vuelve cada vez que el consumo se interrumpe
varios días. No lo he tocado: es un cambio de criterio, no un descuido, y va en el
buzón para que lo decida Doc.

### ✅ El ritmo, corregido (2026-08-25, autorizado por Doc)

Ya no divide entre 7 fijo: **entre los días que la observación cubre de verdad**,
contados desde el primer dato. Con la ventana entera cubierta el resultado no
cambia, que es el caso de todos los días a partir de la primera semana.

**Los días sin fila cuentan igual.** Un sábado sin correos es un cero **real** y
tiene que pesar en la media; descontarlo inflaría el ritmo y adelantaría el aviso
sin motivo. Lo que no era real es contar como observados los seis días anteriores
a que la tabla existiera.

**El divisor tiene suelo de dos días, y eso cuesta algo.** El primer día el ritmo
sale la mitad del real y el aviso llega más tarde de lo que debería. Se acepta
porque dura un día y porque un aviso falso el día del estreno es la forma más
rápida de que alguien silencie el canal — pero **es una decisión, no una
propiedad**, y va en la dirección incómoda. Está escrito en el código, junto al
número.

### La estimación arranca hoy, y el mes ya llevaba gasto

`estimar()` suma desde el día 1 del mes, pero en la tabla **no hay nada anterior al
despliegue**: los 1.354.565 tokens de entrada de agosto que motivaron esta capa no
están, y no se pueden reconstruir desde aquí. Hasta el 1 de septiembre, «lo gastado
este mes» significa **«lo gastado desde las 11:05 del 25 de agosto»**.

Importa al elegir el presupuesto: poner `PRESUPUESTO_IA_USD=8` pensando «es el
crédito que me queda» compararía un crédito real contra un gasto que empieza a
contar tarde. El primer mes limpio es septiembre.

---

## Los seis correos sin texto: eran correos sin texto (2026-08-24)

**Cerrado midiendo, no razonando**, y la respuesta no era la que ninguno de los
dos esperaba.

### La forma, pedida a Gmail

```
1a02ae24…  snippet=NO  sizeEstimate=273867
  partes=[multipart/alternative:vacia | multipart/related:vacia
        | text/html:data:1661 | image/jpeg:attachmentId:192179]

1a02693b…  snippet=NO  sizeEstimate=493300
  partes=[multipart/mixed:vacia | application/pdf:attachmentId:355259]
```

**Cinco de seis sí traían una parte `text/html` con `data`.** El parseo la
encontró y la leyó: el `attachmentId` de esos mensajes es **la imagen**, no el
texto. El sexto no tiene ninguna parte de texto, solo un PDF.

Ese HTML **solo envuelve una imagen incrustada**, y `htmlToText` lo deja en cadena
vacía — correctamente. Comprobado en seco antes de afirmarlo:

```
solo imagen  -> ""             (897–1661 bytes de HTML, cero texto)
con texto    -> "Hola
que tal"
```

### Lo que enseña, y es lo que importa

**La correlación que parecía rara tenía UNA sola causa.** Yo escribí que eran
«dos cosas y la segunda sin explicar»: cuerpo vacío por un lado y `snippet` vacío
por otro. Era una. Gmail devuelve el snippet vacío **por el mismo motivo** por el
que nosotros no sacamos cuerpo: no hay texto que previsualizar.

Y dos hipótesis cómodas se cayeron por el camino, las dos mías:

| Lo que supuse | Lo que era |
|---|---|
| El hueco del `attachmentId` se está comiendo cuerpos | Aquí no perdió ni uno: el `attachmentId` era la imagen |
| Son dos fallos distintos | Es uno, y no es un fallo |

**Y lo que hizo posible contestarlo fue registrar la forma** —`mimeType`,
`data`/`attachmentId`, tamaño— en vez del contenido. Un diagnóstico que no toca
el correo de nadie y aun así responde.

### Lo que se retiró, y por qué cuenta

La ruta de diagnóstico llevaba escrito en su propio comentario que era **código
con fecha de caducidad**: que el día que supiéramos la respuesta sobraría. Ese día
llegó y se fue con ella. Una herramienta de diagnóstico que se queda acaba siendo
código que nadie sabe si se usa.

Lo mismo con el permiso: `roles/iam.serviceAccountTokenCreator` sobre
`pmo-scheduler@`, **acotado al recurso y no al proyecto**, concedido para esto y
retirado después — con la retirada **dentro del encargo**, no como limpieza
opcional. Se descartó crear un disparador temporal en Scheduler por lo contrario:
es estado en una pieza delicada, y una limpieza fallida deja un disparador sin
documentar.

### Y la sonda cambia de criterio

Con la respuesta en la mano, registrar **todo** cuerpo vacío como aviso sería
repetir el error del barrido **dentro del log**: gritar por una condición conocida
y estable hasta que nadie lo lea.

Ahora avisa **solo si hay una parte de texto con `attachmentId`** — el cuerpo
perdido de verdad, que sigue siendo posible y todavía no ha ocurrido. Lo demás
queda en registro normal.

**El hueco del `attachmentId` sigue abierto y ahora sabemos qué aspecto tendrá
cuando muerda**, que es mejor sitio del que estábamos.

---

## El bucle del barrido, cerrado — y lo que aparecía detrás (2026-08-22)

**La traza, que es como se firma esto:**

```
00:45:06  Reconciliacion: 5 reencolado(s) de 5 candidato(s), 0 fallido(s), 5 cerrado(s) sin clasificar
00:49:27  Reconciliacion: 0 reencolado(s) de 0 candidato(s), 0 fallido(s), 5 cerrado(s) sin clasificar
```

La de las `00:45` es la última pasada del bucle: reencoló los cinco de siempre y
**esta vez el procesador los cerró** con `SIN_TEXTO`. La de las `00:49` es la
primera con el conjunto de candidatos vacío. Seis pasadas idénticas y luego cero.

Migración `20260822000000_add_email_skip_reason` aplicada a las `00:41:03`,
comprobada en el log del Job: sin la columna, nada de lo demás existía.

### 🔴 Y las etiquetas contestan la pregunta que iba antes de escribir nada

Se registraron a propósito, porque el bucle podía ser el síntoma menor:

```
cmt3k70t…  UNREAD, IMPORTANT, CATEGORY_PERSONAL, INBOX
cmt29a4r…  UNREAD, CATEGORY_UPDATES, INBOX
cmsxwfcu…  CATEGORY_PROMOTIONS, UNREAD, INBOX
cmsutn44…  CATEGORY_PROMOTIONS, UNREAD, INBOX
cmstjc92…  UNREAD, CATEGORY_UPDATES, INBOX
```

**No son invitaciones de Calendar ni mensajes solo-adjunto.** Son correos
corrientes de la bandeja — personales, novedades, promociones— y uno marcado
`IMPORTANT`. La hipótesis cómoda («son correos legítimamente vacíos») **queda
descartada por la evidencia**, no por opinión.

Lo que sí sé, y lo que no:

- **El parseo tiene un hueco conocido y encaja con `CATEGORY_PROMOTIONS`:**
  `extractBodyText` busca partes con `p.body?.data`, y Gmail **no manda `data`
  cuando la parte es grande** — manda `attachmentId` y hay que pedirla aparte.
  Un correo promocional en HTML es justo el caso grande. Ese cuerpo se pierde
  entero y en silencio.
- **Pero eso no explica el `snippet` vacío.** La guarda es
  `!bodyText && !snippet`: para llegar ahí, Gmail tenía que haber devuelto
  también el `snippet` vacío, y eso no lo causa el hueco de arriba. Comprobado
  además que **solo hay un creador de filas `Email`** (`persistEmails`), así que
  no viene de otra vía que se salte el campo.

O sea: **hay dos cosas, no una**, y la segunda no está explicada. Queda como
hallazgo abierto con su evidencia, no como suposición cerrada.

### Lo que enseñó el aviso, que es lo que más vale

El aviso del primer barrido —27 correos rescatados, uno con una tarea dentro que
nunca llegó al tablero— hizo su trabajo. Los cuatro siguientes eran el mismo
hecho contado otra vez.

> **Un aviso que se dispara por una condición conocida y estable no es un aviso,
> es una suscripción.**

Y el daño no es la molestia: la próxima alerta de verdad —un respaldo caído—
llegaría enterrada entre mensajes idénticos que ya nadie lee. **El canal se
gasta.** Por eso el barrido ahora recuerda en Redis qué huérfanos vio la pasada
anterior y **solo avisa de los ids nuevos**.

Dos decisiones dentro de eso, y las dos son sobre de qué lado equivocarse:

- **TTL de 24 h**, muy por encima de la cadencia. Si caducara cerca de los 15
  min, cada pasada creería que todo es nuevo y volveríamos al aviso por
  condición — el mismo fallo con otro disfraz.
- **Fallo abierto:** si Redis no contesta, se avisa igual. Prefiero un aviso
  repetido a callarme la primera vez que pasa algo de verdad, y el freno de una
  hora acota el ruido.

**El freno tenía margen cero** —900 s contra un cron de 900 s— y eso se notó en
el chat del Jefe: llegaron los avisos de tres pasadas de seis, uno de cada dos,
que es exactamente lo que predice un borde que coincide. Subó a 3.600 s. Pero
conviene ver que **el freno solo acotaba**: lo que cura es dejar de avisar por
una condición conocida.

### Y una que me apunto para después

La condición de ausencia de 14 h de la Capa 2 **tiene la misma forma**: avisa por
una condición, no por un cambio. Hoy se salva sola porque no ha disparado nunca.
El día que dispare de verdad —y ese día importa— repetirá igual.

---

## §37.8 · mi mitad del socket: el contrato, y por qué el frontend no podía arreglarlo solo (2026-08-21)

**El síntoma era del frontend y la causa estaba aquí.** El informe describía
`reconnectionAttempts` infinito y ningún manejador de `connect_error`. Lo segundo
parecía un olvido de @Gravity y no lo era:

> `tasks.gateway.ts` rechazaba **dentro de `handleConnection`**, con
> `client.disconnect()`. O sea que la conexión **se establecía y después se
> caía** — y eso, desde el cliente, es un `connect` seguido de un `disconnect`:
> **una caída de red normal**. Ante una caída normal, reconectar sin fin es
> exactamente lo que socket.io debe hacer.

**`connect_error` no llegaba a dispararse nunca.** No había nada que manejar. Por
eso el arreglo no podía empezar por el cliente.

### La raíz estaba un piso más abajo

`session.service.ts` envolvía **cualquier** fallo del JWT en un `catch` desnudo:

```ts
} catch {
  throw new UnauthorizedException("Sesión inválida o expirada");
}
```

Caducado e inválido salían **idénticos**. Y esa distinción es justo la que decide
si el usuario ve un login o no ve nada. **Da igual lo que haga el cliente si el
servidor ya se comió el motivo.**

`jsonwebtoken` sí lo distingue —`TokenExpiredError`— y ese dato se estaba tirando.

Se recupera con un `SesionRechazadaError` que **hereda de
`UnauthorizedException` y conserva los mensajes**, así que las respuestas REST no
cambian ni una coma: el código es información de más para quien la sepa leer.

### Tres códigos, y el tercero no estaba pedido

| Código | Qué significa |
|---|---|
| `SESION_CADUCADA` | Era buena y se le pasó el plazo. Refresca y reconecta, **sin molestar al usuario** |
| `SESION_INVALIDA` | No hay sesión o no sirve. Para y al login |
| `ERROR_INTERNO` | Tropiezo del servidor. **Reconexión normal** |

**El tercero lo añadí yo y creo que hace falta**: sin él, un fallo inesperado
saldría como `SESION_INVALIDA` y el cliente sacaría al usuario al login por algo
que no tiene nada que ver con su sesión. Un rechazo que no sabe por qué rechaza
no debería poder echar a nadie.

Y un matiz que no es obvio: **un token de refresco usado como de acceso es
`INVALIDA`, no `CADUCADA`**. Está vivo; lo que falla es el `typ`. Marcarlo como
caducado haría que el cliente refrescara en bucle.

### El socket ya no sobrevive a su propio token

Se validaba **una sola vez**, en el handshake, con un token de 15 minutos, y
después vivía indefinidamente. Uno abierto toda la noche seguía recibiendo
eventos con una sesión caducada hacía horas.

Un temporizador por socket alineado con el `exp`. Al vencer **avisa y cierra** —
y el aviso necesita **evento propio** (`session.rechazada`) porque
`connect_error` solo existe durante el handshake: una vez conectado, un cierre
del servidor llega como un `disconnect` pelado, otra vez indistinguible del wifi.

Dos detalles que costarían un rato si se pierden: el temporizador se **limpia al
desconectar** —si no, cada socket dejaría el suyo vivo hasta vencer, apuntando a
un cliente que ya no existe, que con reconexiones frecuentes es una fuga lenta— y
lleva **`unref`**, para que un socket abierto no retrase el apagado ordenado de
Cloud Run hasta que venza.

Y no se revalida en bucle a propósito: **la cookie del handshake no se actualiza
sola** mientras el socket vive, así que volver a mirar el mismo token daría
siempre lo mismo. Lo útil es cerrar a tiempo y dejar que la reconexión traiga la
cookie nueva.

### Los tres casos, provocados

Servidor y cliente de socket.io **reales**, y un JWT caducado firmado con
`expiresIn: '-10s'` — que es la forma honesta de provocarlo sin esperar quince
minutos ni falsear relojes. Con dobles se puede comprobar que llamamos a
`next(err)`, pero **no que `connect_error` llegue al otro lado con el código
dentro**, que es contra lo que va a programar @Gravity.

---

## Encargos B, C y el barrido de reconciliación (2026-08-21)

### B — los números del despliegue decían una cosa y el comando otra

**B.1.** El copiloto se concedía **10 min por llamada** y Cloud Run cortaba a los
**5** (su defecto, porque el pipeline no pasaba `--timeout`). El turno lo mataba la
plataforma **por debajo del código**, así que el stream moría **sin evento
`error`**: no había nadie arriba para emitirlo.

**Se bajó el del copiloto a 3 min en vez de subir el de Cloud Run**, y el motivo
ya estaba escrito en este proyecto: el copiloto no frena ante un 429 porque «al
otro lado hay alguien esperando y un error a los veinte segundos es mejor que un
cursor parpadeando tres minutos». Una llamada que no termina en tres minutos no
está tardando, está colgada.

La invariante queda escrita **en los dos archivos**, que es lo que evita que
vuelvan a separarse:

```
MAX_VUELTAS × TIMEOUT_MS + herramientas < timeout de Cloud Run
         4 × 180 s = 720 s + margen      < 900 s
```

**B.2, con una corrección al hallazgo.** El informe decía que regía el defecto de
100 instancias. **No regía**: el servicio vivo tenía `maxScale=20`, puesto a mano
en la consola, y `gcloud run deploy` **conserva lo que no se le nombra**. O sea que
no estaba mal configurado — estaba configurado **en un sitio que no se revisa y
que desaparece el día que alguien recree el servicio**. Peor de diagnosticar y
exactamente igual de malo.

Y el número que se eligió no sale del tráfico:

> **`--max-instances=8`, y el límite no es el tráfico: es la base.**

Cada instancia abre su propio pool de Prisma y el total contra Cloud SQL es
`pool × instancias`. Con `connection_limit=2`: 8 × 2 = 16, más migraciones,
respaldo y una sesión manual ≈ 19, por debajo de las ~25 de un `db-f1-micro`.
Veinte instancias serían 40 y no caben.

El `connection_limit` va en `prisma.service.ts` y **no en el secreto**: el secreto
es una credencial que no se revisa en un diff, y esto es una decisión de
dimensionado que sí. Si la URL ya lo trae, se respeta.

⚠️ **Las ~25 son el defecto documentado del tier, NO verificado leyendo la
base** — la instancia no admite conexión directa. Queda escrito en el código, con
la comprobación (`SHOW max_connections;` desde el Job de restauración) y con la
regla de qué mover si fuera menos: **baja `--max-instances`, no el pool**.
Estrangular el pool hace que las peticiones se peleen por una conexión en vez de
repartirse.

### C — parado a propósito, en el buzón

`trust proxy` no está en ninguna línea de `apps/api`, así que `req.ips` va vacío y
todo el tráfico comparte cubo.

**Lo razonado:** `trust proxy: true` queda descartado — hace que Express tome la
entrada **más a la izquierda** de `X-Forwarded-For`, justo la que controla el
cliente. Con `/auth` en 10 por minuto, cada intento estrenaría cubo y el límite
dejaría de existir. Lo correcto es un **número de saltos**, porque Express cuenta
**desde la derecha** y el cliente solo puede añadir por la izquierda.

**Lo comprobado:** mandé una petición a `/health/live` con
`X-Forwarded-For: 203.0.113.9` y el log de Cloud Run registró
`remoteIp = 189.174.75.51` — mi IP real. **Google no se cree la cabecera.**

**Lo que falta, y es un solo hecho:** que `remoteIp` sea correcto **no es lo
mismo** que saber en qué posición queda la IP real dentro de la cabecera que ve
Express. Si Cloud Run añade, `1` es correcto; si dejara pasar, `1` sería **igual
de falsificable que `true`** y lo habría empeorado creyendo arreglarlo. Nada del
código registra hoy `x-forwarded-for`, así que no se puede observar sin desplegar.

Parado por instrucción expresa de Doc —«prefiero el cubo global una semana más
que una IP falsificable»— y con la sonda de una línea propuesta en el buzón.

### El barrido de reconciliación (§37.7)

Ni `--min-instances=1` ni un ping: **un barrido cada 15 min**. La diferencia no es
el precio, es lo que hace de más.

- Cualquier petición periódica tapa el primer agujero: Cloud Run escala a cero,
  con la instancia se apagan los workers, y un trabajo rezagado espera al
  **siguiente correo** — `stalledInterval` no lo reclama porque reclamar exige un
  worker vivo.
- **Solo el barrido tapa el segundo**: un correo cuyo `add` falló no está
  atascado ni fallido. **Su trabajo nunca existió.** No hay nada que reintentar, y
  por eso ningún worker vivo lo recoge jamás.

**La ventana de gracia de 30 min no es cortesía**: sin ella el barrido reencolaría
correos que están en la cola ahora mismo, y dos trabajos simultáneos sobre el
mismo correo pueden pasar **los dos** la comprobación de `processedAt` y crear las
tareas por duplicado. El camino normal se agota en menos de un minuto.

**El `remove` antes del `add` es lo que lo hace correcto en los dos estados.** El
`jobId` determinista hace que BullMQ ignore un alta duplicada: bien frente a un
trabajo **activo**, mal frente a uno **terminado o fallido**, que sigue guardado
días y bloquearía el reintento. Y `remove` **falla** sobre un job activo — así que
tragarse ese fallo da la rama buena **sin preguntar en qué estado está**.

Dos cosas que la decisión escrita daba por sabidas y no eran:

- **La audiencia OIDC es `<URL>/cron`, no `<URL>`.** El guard compara con
  `CRON_OIDC_AUDIENCE`, que en la revisión desplegada vale `.../cron`, igual que
  los dos disparadores que ya funcionan. Con la URL a secas el token se firma
  bien, **Scheduler lo da por entregado** y la ruta devuelve 401 para siempre. Es
  el modo de fallo favorito de este proyecto: verde por fuera.
- **El coste no es cero.** `DOC.md` dice que el nivel gratuito cubre tres trabajos
  «y hoy se usa uno»; hoy se usan **tres**. Este es el cuarto: ~0,10 USD al mes.
  No cambia la decisión —sigue siendo mucho más barato que `min-instances=1`—
  pero el número estaba mal y no conviene repetirlo.

#### 🔴 El agujero no era teórico: había 27

Forcé la primera ejecución nada más desplegarlo, para comprobar la audiencia OIDC.
Devolvió **200** —`Ejecución de cron autorizada para pmo-scheduler@…`— y de paso
contestó una pregunta que nadie había hecho:

```
Reconciliación: 27 reencolado(s) de 27 candidato(s), 0 fallido(s)
POST /cron/reconciliar 200
```

**Veintisiete correos llevaban guardados en la base y sin trabajo asociado.**
Nadie los habría recogido nunca: no estaban atascados ni fallidos, es que su
trabajo **jamás existió**. Un `--min-instances=1` los habría dejado exactamente
igual de invisibles, y un ping también. Es la mejor justificación posible de por
qué se eligió un barrido y no despertar el contenedor.

Y se clasificaron de verdad, no solo se encolaron — uno de ellos tenía trabajo
pendiente dentro:

```
Resultado de IA para cmsw59pf90003vj6g8uer5bn1: isActionable=true, 1 tareas creadas
```

Una tarea que existía en un correo y **no existía en el tablero**. Eso es lo que
significaba «pierde correos en silencio», medido.

La Capa 1 también sonó sola, con el texto del barrido y su freno de 15 min puesto.

**Verificado en la revisión viva** después del despliegue: `timeoutSeconds=900`,
`maxScale=8`, `containerConcurrency=80`, `memory=512Mi`. Los cuatro números del
Encargo B están donde tenían que estar.

---

## El vigilante también nace del pipeline — escrito, probado y **bloqueado por IAM** (2026-08-21)

`deploy.yml` desplegaba `pmo-respaldo-db` y **nada más**. La política de alerta y
el Cloud Scheduler vivían en la consola: si alguien los tocaba o los borraba, git
no se enteraba. Es la configuración fantasma que este pipeline lleva meses
eliminando, un piso más arriba — y con un agravante, porque **lo que desaparecía
sin dejar rastro era el vigilante**.

Dos pasos nuevos al final del job (`526372b`, `c91344d`). **El código está hecho y
probado; no funciona todavía porque la cuenta del pipeline no tiene permisos.**
Ver el final.

### Por qué `create` a secas no vale

`gcloud beta monitoring policies create` **no falla si ya existe**: crea una
**segunda política idéntica**. A partir de ahí cada fallo del respaldo avisa dos
veces, y el final previsible es alguien silenciando el canal — con lo cual el
pipeline que despliega la alerta acabaría siendo la causa de que nadie la lea. De
ahí la búsqueda previa por `displayName` y el `update` cuando existe.

### El canal sale del repositorio, y el marcador importa más que el hecho

Se resuelve **por nombre** (`displayName="Alertas PMO"`) y el pipeline lo inyecta
con `jq`. Un id de consola en git sólo significa algo en este proyecto, y si el
canal se recrea cambia sin que nada avise.

Con `[]` habría bastado para que el pipeline funcionara — pero un despliegue
manual del archivo habría creado una política **encendida y muda**, indistinguible
de una sana desde fuera. Con el marcador, la API rechaza y no toca nada:

```
INVALID_ARGUMENT: Name must begin with
'projects/{project_id}/notificationChannels/{channel_id}',
got: EL-PIPELINE-RESUELVE-ESTE-CANAL-POR-DISPLAYNAME
```

Comprobado contra la política viva: la rechaza y **deja el canal bueno intacto**.
Elegir entre dos formas de fallar es la mitad del trabajo en este archivo.

### Cinco guardas, ninguna teórica

| Guarda | Ya pasó, o casi |
|---|---|
| la herramienta no responde | ver más abajo: saltó **de verdad**, dos veces |
| 0 canales con ese nombre | dejaría la política apuntando a la nada |
| >1 canal homónimo | uno recreado, uno de pruebas: avisar a un sitio que nadie mira |
| canal existe pero **`enabled: false`** | tercera forma de quedarse mudo, encontrada al montar esto |
| `notificationChannels` vacío **al releer** | literalmente lo que le pasó a la política del watcher seis días |

La última es la que más vale: **no se da por hecho lo que se acaba de escribir.**

El `enabled` va con `describe` y **no en el filtro** — corrección de Doc sobre una
propuesta mía peor. La API lo rechaza con 400, pero el motivo de fondo es mejor
que el técnico: filtrando, un canal apagado da **cero coincidencias** y el paso
diría *«no encontrado»* de un canal que está delante. **«No encontrado» manda a
buscar; «existe pero está apagado» manda a encenderlo.**

### 🔴 La trampa del `grep -c` bajo el shell de Actions

`grep -c` **sale con código 1 cuando no cuenta nada**, y el shell por defecto de
GitHub Actions es `bash -e`. Escrito así:

```bash
NUM=$(printf '%s\n' "$CANAL" | grep -c .)
```

el caso «no hay canal» **mata el paso ahí mismo** con un fallo genérico, y no se
llega nunca a imprimir el `::error::` que lo explica: la guarda más importante se
habría comido su propio mensaje. Va con `|| true`.

Misma familia que el `pipefail` de `respaldo.sh`: **el código de salida de una
tubería no es lo que parece.**

### 🔴 Verde y sin hacer nada, dos veces — y el fallo era mío

El primer run (`32511589977`) salió **success** y **ni la política ni el Scheduler
se tocaron**: los dos pasos se plantaron en su comprobación previa. Es el diseño
funcionando —`exit 0` para no bloquear la API, con el `::error::` como único
aviso— pero deja dos lecciones.

**Una es del pipeline**: `google-github-actions/setup-gcloud@v2` instala gcloud
**sin** los componentes `alpha` ni `beta`. Doc avisó de esto para `alpha` y valía
igual para `beta`, que es donde vive toda la gestión de políticas. Va explícito
con `install_components: beta`.

**La otra es mía, y es peor**: mis dos comprobaciones previas mandaban `stderr` a
`/dev/null`. Cuando saltaron de verdad, el log sólo decía «no responde». **Escribí
una guarda que esconde por qué salta** — el pecado exacto de la alerta muda que
todo esto viene a arreglar, cometido dentro del arreglo. Ahora capturan la salida
y la imprimen antes del `::error::`, y esa línea fue la que dio el diagnóstico
real en el segundo run.

### 🔴 Y el diagnóstico real: no es la herramienta, es el IAM

Con la salida ya visible, el run `32512450469`:

```
ERROR: (gcloud.beta.monitoring.policies.list) [...] does not have permission
to access projects instance [pmo-dashboard-503418]

ERROR: (gcloud.scheduler.jobs.list) PERMISSION_DENIED: The principal lacks
IAM permission "cloudscheduler.jobs.list" for the resource
"projects/pmo-dashboard-503418/locations/us-central1"
```

**Y aquí me equivoqué antes de empezar.** Di por comprobado que
`github-deployer@` tenía `roles/editor` «que cubre políticas y Scheduler». No lo
tiene. Lo leí de un `grep` sobre una tabla aplanada donde la línea del rol y las
de los miembros no se correspondían. Los roles reales son **dos**:

```
roles/iam.serviceAccountUser
roles/run.admin
```

Que es un reparto sensato —la cuenta del pipeline podía desplegar Cloud Run y
nada más— y explica por qué el Job sí se desplegaba desde hace días y esto no.

**La lección se repite y ya van tres en dos días:** un `grep` sobre una salida
formateada no es una comprobación, es una impresión. Lo mismo que `pg_restore
--list` leyendo el índice, y lo mismo que «no hay línea AVISO NO ENVIADO». La
comprobación buena era una sola línea:

```bash
gcloud projects get-iam-policy pmo-dashboard-503418 \
  --flatten="bindings[].members" --format="value(bindings.role)" \
  --filter="bindings.members:github-deployer@..."
```

### Estado: el código está, inerte

- **Producción intacta**, comprobado después de los dos runs: las dos políticas
  con su canal, y el disparador `ENABLED` en `30 3,15 * * *`. Las guardas se
  negaron a tocar nada, que era exactamente su trabajo.
- **Los pasos no pueden funcionar hasta que alguien conceda el IAM.** Y ese
  alguien no soy yo: el IAM de este proyecto es manual y documentado a propósito
  —«un workflow con permiso para repartir roles de proyecto es una escalada de
  privilegios esperando a que alguien toque el repositorio»—, así que las
  concesiones quedan escritas para que las ejecute quien corresponde:

```bash
# Politicas de alerta: crear y actualizar.
gcloud projects add-iam-policy-binding pmo-dashboard-503418 \
  --member="serviceAccount:github-deployer@pmo-dashboard-503418.iam.gserviceaccount.com" \
  --role="roles/monitoring.alertPolicyEditor"

# Leer los canales para resolver 'Alertas PMO' por nombre. Solo lectura.
gcloud projects add-iam-policy-binding pmo-dashboard-503418 \
  --member="serviceAccount:github-deployer@pmo-dashboard-503418.iam.gserviceaccount.com" \
  --role="roles/monitoring.notificationChannelViewer"

# El disparador: crear y actualizar.
gcloud projects add-iam-policy-binding pmo-dashboard-503418 \
  --member="serviceAccount:github-deployer@pmo-dashboard-503418.iam.gserviceaccount.com" \
  --role="roles/cloudscheduler.admin"
```

Tres roles acotados en vez de `roles/editor`, que es lo que haría falta si se
resolviera de un plumazo. `notificationChannelViewer` y no `...Editor`: el
pipeline **lee** canales, no los crea — el canal de Chat se autoriza a mano en la
consola y así sigue.

El `actAs` sobre `pmo-scheduler@` —que hace falta para crear un job de Scheduler
con `--oauth-service-account-email`— **ya está cubierto** por el
`roles/iam.serviceAccountUser` a nivel de proyecto que la cuenta ya tenía.

**Hasta que eso se conceda, el vigilante sigue viviendo en la consola.** El
pipeline lo intenta, falla en la primera línea y lo dice; no rompe nada y no
tapa nada.

### ✅ Cerrado el mismo día: los tres roles y el `workflow_dispatch`

Concedidos los tres, comprobados en el IAM antes de disparar nada. El run
`32519401879` (`workflow_dispatch`) salió verde **y esta vez el verde sí
significaba algo**, porque los pasos dijeron lo que hicieron:

```
Canal resuelto: .../notificationChannels/1419143099601865450 (enabled=True)
Ya existe (.../alertPolicies/2425639254030427438): se actualiza.
Politica desplegada y verificada. Avisa a: .../notificationChannels/1419143099601865450

El disparador pmo-respaldo-db-diario: se hace update.
Disparador pmo-respaldo-db-diario ENABLED: 03:30 y 15:30 America/Cancun.
```

Y comprobado **en la nube, no en el log**, que es lo que de verdad cierra esto:

| Qué | Resultado |
|---|---|
| Políticas con ese `displayName` | **1**, y con el **mismo id** que ya tenía → actualizó, no duplicó. La idempotencia era justo lo que se probaba |
| `notificationChannels` | no vacío, apunta a «Alertas PMO» |
| Disparador | `ENABLED`, `30 3,15 * * *`, `America/Cancun`, `pmo-scheduler@` |

**Condición de Doc al conceder `cloudscheduler.admin`**, escrita ya como
comentario en el propio paso (`61368de`): **solo `create` o `update`, nunca
`delete` ni `pause`**. Ese rol es el mínimo que existe —Cloud Scheduler no admite
IAM por trabajo— y da poder para borrar el disparador; un disparador que no
dispara es el punto ciego exacto que la condición de ausencia cubre, así que un
`delete` aquí convertiría un error de tecleo en «se acabaron los respaldos», y
tardaría 14 h en notarse.

**El vigilante ya nace del pipeline.** Si alguien lo borra en la consola, el
siguiente despliegue lo repone.

---

## ✅ La Capa 2 firmada con fuego real: sonaron las dos (2026-08-20)

**Resultado: llegaron los dos avisos, y son distintos.** Es lo que se estaba
probando y es lo que salió bien. Lo que no salió como yo lo había escrito está
en «Lo que no esperaba», más abajo, y me obliga a corregir tres documentos.

### El simulacro

`pmo-respaldo-db-mcqnv` · arrancada `2026-08-20T23:13:56Z` (18:13 de Tulum) ·
`failedCount=1` · completada `23:19:37Z`.

Vía: `--update-env-vars="BUCKET_RESPALDOS=pmo-respaldos-db-simulacro-inexistente"`
sobre `jobs execute`, **sin tocar el job desplegado**. `pg_dump` es solo lectura y
la subida muere en el destino, así que el fallo ocurre **antes de escribir nada**.

Verificado: el bucket real pasó de **16 objetos a 17**, y el único nuevo es el de
la ejecución de recuperación (`pmo-2026-08-20T232554Z.dump`, 311.152 bytes,
`23:25:58Z`). Entre las `20:34Z` y las `23:25Z` no hay ningún objeto: **el
simulacro no dejó ni un volcado a medias**.

Los tres intentos, tal cual (`--max-retries=2` ⇒ tres, como estaba previsto):

```
2026-08-20T23:15:31.927248Z  Volcando a gs://pmo-respaldos-db-simulacro-inexistente/pmo-2026-08-20T231531Z.dump
2026-08-20T23:15:35.099369Z  ERROR: (gcloud.storage.cp) gs://pmo-respaldos-db-simulacro-inexistente not found: 404.
2026-08-20T23:15:35.264900Z  RESPALDO FALLIDO: pg_dump o la subida terminaron con error (ver los logs del job)
2026-08-20T23:15:35.265554Z  [pmo-postgres-db] connection aborted - error writing to client: write unix …/.s.PGSQL.5432->@: write: broken pipe
2026-08-20T23:15:35.727519Z  Container called exit(1).
2026-08-20T23:17:34.262706Z  Volcando a gs://pmo-respaldos-db-simulacro-inexistente/pmo-2026-08-20T231734Z.dump
2026-08-20T23:17:37.449599Z  ERROR: (gcloud.storage.cp) gs://pmo-respaldos-db-simulacro-inexistente not found: 404.
2026-08-20T23:17:37.611359Z  RESPALDO FALLIDO: pg_dump o la subida terminaron con error (ver los logs del job)
2026-08-20T23:17:37.611811Z  [pmo-postgres-db] connection aborted - error writing to client: write unix …/.s.PGSQL.5432->@: write: broken pipe
2026-08-20T23:17:38.077957Z  Container called exit(1).
2026-08-20T23:19:28.935307Z  Volcando a gs://pmo-respaldos-db-simulacro-inexistente/pmo-2026-08-20T231928Z.dump
2026-08-20T23:19:32.133022Z  ERROR: (gcloud.storage.cp) gs://pmo-respaldos-db-simulacro-inexistente not found: 404.
2026-08-20T23:19:32.263822Z  RESPALDO FALLIDO: pg_dump o la subida terminaron con error (ver los logs del job)
2026-08-20T23:19:32.264474Z  [pmo-postgres-db] connection aborted - error reading from client: read unix …/.s.PGSQL.5432->@: read: connection reset by peer
2026-08-20T23:19:32.700288Z  Container called exit(1).
```

El `broken pipe` del Auth Proxy **no es un fallo aparte**: es `pg_dump` recibiendo
el cierre de la tubería cuando `gcloud storage cp` muere. Es el síntoma normal de
que `pipefail` está haciendo su trabajo, no una avería de Cloud SQL. Conviene
saberlo porque en un log de madrugada parece lo segundo.

### Los dos mensajes, tal cual llegaron a «Alertas PMO»

**Capa 1 — tres mensajes**, uno por intento, en segundos. Emisor `Alertas API Capa 1`:

```
🔴 Respaldo de la base de datos fallido
pg_dump o la subida terminaron con error (ver los logs del job)
```

**Capa 2 — un mensaje**, emisor `Google Cloud Monitoring`, tarjeta:

```
El respaldo de la base de datos no esta bien

Completed Executions for pmo-dashboard-503418 Cloud Run Job labels
{project_id=pmo-dashboard-503418, job_name=pmo-respaldo-db,
location=us-central1} is above threshold of 0.000 with a value of 1.000.

!!! Critical severity

Incident Labels
    job_name     pmo-respaldo-db
    location     us-central1
    project_id   pmo-dashboard-503418
    result       failed

[ View ]
```

**Tres mensajes de Capa 1 y no seis: el `trap` no duplicó.** La guarda
`YA_AVISADO` funciona en producción, no solo en la prueba de mesa.

### Tiempos

| Hito | Momento |
|---|---|
| Primer intento fallido | `23:15:35Z` |
| Ejecución dada por fallida | `23:19:37Z` |
| Punto en la métrica `completed_execution_count{result="failed"}` | `23:24:00Z` |
| Mensaje de Capa 2 en Chat | entre `23:23Z` y `23:27Z` (lo vi ausente y luego «Recién») |

Del primer síntoma al mensaje de Capa 2: **menos de 10 minutos**, con el grueso
del retardo en el borde de la ventana de alineación de 300 s. En el simulacro
anterior del día el retardo fue **de un minuto** (Capa 1 a las `18:16Z`, Capa 2 a
las `18:17Z`), así que el retardo depende de dónde caiga el fallo dentro de la
ventana, no de una latencia fija. **Entre 1 y 10 minutos** es el rango honesto.

### 🔴 Lo que no esperaba, y me obliga a corregir tres documentos

**El bloque `documentation` de la política NO aparece en la tarjeta de Chat.**

Yo escribí —en `CLAUDE_MEMORY.md`, en `infra/backup/README.md` §6 y en
`GCP_SETUP.md`— que ese bloque «es lo que Google Chat enseña dentro del mensaje»
y que lleva «los tres comandos de diagnóstico en orden». **Es falso.** De todo el
bloque, Chat usa **solo `documentation.subject`**, como título de la tarjeta. El
`content` —los comandos, el orden de diagnóstico, el aviso de mirar `PG_MAJOR`
contra la versión de Cloud SQL— no sale ni desplegando «Mostrar más», que solo
añade los *Incident Labels*.

Era exactamente la pregunta de Doc: si el que lo recibe a las 3 de la mañana sabe
qué hacer. **Con esta tarjeta, no.** Sabe que algo del respaldo está mal y tiene
un botón `View` a la consola. Nada más.

Y hay un segundo agujero de la misma familia: **el `displayName` de la condición
tampoco aparece.** El cuerpo es el texto autogenerado de la condición. Yo había
escrito dentro del `content` que «cuál de las dos es, se ve en el nombre de la
condición que disparó» — y ese nombre no viaja. Lo único que hoy distingue las
dos condiciones en la tarjeta es la etiqueta `result`, y **con la de ausencia
dirá `result = succeeded`**, que leído de madrugada dice justo lo contrario de lo
que pasa.

#### Cómo se cerró (2026-08-21)

**Eran cuatro sitios, no tres.** Corregí los documentos y dejé **la fuente** —el
`content` del propio `alert_policy_respaldo.json`, que además estaba **desplegado
en la política viva**— diciendo todavía «se ve en el nombre de la condición que
disparó». Lo cazó Doc. La lección no es el descuido: **al desmentir algo, el sitio
que hay que corregir primero es el que está en producción**, no la prosa que lo
describe.

**La documentación por condición no existe.** Antes de tocar el `subject` probé si
la API acepta `conditions[].documentation`, que habría resuelto los dos agujeros de
golpe —un `subject` por condición y de paso recuperar la distinción que se pierde
al no viajar el `displayName`—. La respuesta es no, y es tajante:

```
INVALID_ARGUMENT: Invalid JSON payload received.
Unknown name "documentation" at 'alert_policy.conditions[0]': Cannot find field.
```

`documentation` es de **nivel política**: un solo `subject` heredado por las dos
condiciones. Eso descarta redactarlo para el caso del fallo —sería mentiroso para
la ausencia, donde lo probable es que no haya ejecución que revisar—. El que quedó
no miente en ninguno de los dos, y pone el Scheduler por delante porque es el que
no deja rastro:

```
"Respaldo de la BD en rojo - fallo o 14 h sin volcado. Mira Scheduler y ejecuciones"
```

Y dentro del `content`, ahora en la primera línea, queda escrito que **Chat solo
enseña el `subject`**, para que el siguiente no lo descubra con fuego real. Junto
con la trampa que se descubrió midiendo: en la condición de ausencia la tarjeta
dirá **`result = succeeded`**, que no significa que fuera bien — significa que
lleva 14 h sin un solo éxito que registrar.

### Procedencia, para que el registro no mienta

Hubo **dos** tandas de simulacro este día y no son la misma:

- `~18:07Z–18:35Z` (13:07–13:35 Tulum), vía `TAMANO_MINIMO=999999999` — **no son
  míos**. Dejaron seis volcados buenos en el bucket, porque esa vía sube el
  archivo y lo rechaza después. Sus mensajes de Capa 1 dicen «el volcado pesa
  294937 bytes, por debajo del mínimo (999999999)».
- `23:13Z` (18:13 Tulum), vía bucket inexistente — **mío**, y es el que no dejó
  rastro en el bucket.

La diferencia importa: **la vía del bucket inexistente es la buena** justo porque
la otra escribe. Si algún día hay que repetir esto, que se repita con la segunda.

### Deuda menor que queda anotada

- **`avisar` no puede detectar un rechazo HTTP.** Usa `curl -sS` sin `--fail`, así
  que un `400` del webhook devuelve 0 y el script lo da por enviado. Hoy no picó
  —los mensajes llegaron— pero «no hay línea `AVISO NO ENVIADO`» prueba que la
  llamada salió, **no que Chat la aceptara**. Un `--fail` lo cerraría.
- **El emisor de Capa 1 se llama `Alertas API Capa 1`** y ya no avisa solo de la
  API: lleva también los fallos del job de respaldo. El nombre engaña al leer el
  espacio.

---

## ✅ Vigilancia del respaldo: el vigilante no puede vivir dentro de lo vigilado (2026-08-20)

**Apertura de la Fase 5.** El 2026-08-19 el job `pmo-respaldo-db` estuvo roto
**42 minutos en silencio absoluto**. Los hechos, sacados de la nube y no de la
memoria de nadie:

| Ejecución | Inicio (UTC) | Tulum | Resultado |
|---|---|---|---|
| `pmo-respaldo-db-tgzzf` | `22:09:45Z` | 17:09 | ❌ falló |
| `pmo-respaldo-db-df7hl` | `22:33:08Z` | 17:33 | ❌ falló |
| `pmo-respaldo-db-t5297` | `22:52:42Z` | 17:52 | ✅ correcta |

Se supo porque había alguien delante mirando. Esa es toda la detección que había.

### Lo que hay que entender, porque el aviso YA estaba puesto

`respaldo.sh` tenía —desde el 18-08— su función `avisar` mandando al webhook de
Chat en cada `fallar`. Y aun así: silencio. El primero de los dos fallos fueron
**los retornos de carro**: `bash` murió en la primera línea del archivo, cuando
la función `avisar` **todavía no se había definido**.

> **Un vigilante que vive dentro de lo vigilado comparte su suerte.**

No es un caso raro, es una familia entera. Nada de esto puede avisar desde dentro
del script, porque el script no llega a correr o no llega a terminar:

- CRLF, un error de sintaxis, un `ENTRYPOINT` mal puesto → `bash` muere en la línea 1
- la imagen no se descarga, el contenedor no arranca
- `OOM` (SIGKILL: no corre ni un `trap`)
- `--task-timeout=900s` agotado
- el secreto ya no se puede leer → Cloud Run ni arranca el contenedor
- **el Scheduler no dispara** → no hay ejecución, no hay fallo, no hay nada que avisar

Ese último es el que cierra el argumento: **una alerta que vive dentro del job
jamás puede detectar un job que no se ejecutó.**

### El diseño: dos capas que no comparten suerte

Deliberadamente **no** se sustituyó una por otra. Se dejaron las dos porque ven
cosas distintas:

| | Quién | Qué garantiza | Su punto ciego |
|---|---|---|---|
| **Dentro** | `avisar`/`fallar` + el `trap` nuevo de `respaldo.sh` | dice **por qué** falló, con el texto de la comprobación concreta | todo lo anterior a que `bash` lea el archivo |
| **Fuera** | Política de Cloud Monitoring | garantiza que **te enteras**, sea cual sea la causa | no sabe el motivo: solo que la ejecución acabó en rojo |

La de dentro da el diagnóstico; la de fuera da la garantía. Quitar cualquiera de
las dos deja un agujero que la otra no tapa.

### Capa de fuera: la política

`infra/alert_policy_respaldo.json` → desplegada como
`projects/pmo-dashboard-503418/alertPolicies/2425639254030427438`, con **dos
condiciones** unidas por `OR`. Esta primera es la que responde a «falló»; la de
ausencia, que responde a «dejó de haber respaldos», se añadió después y está
más abajo, porque su número gobierna la cadencia del Scheduler.

```
metric.type="run.googleapis.com/job/completed_execution_count"
resource.type="cloud_run_job"
resource.label."job_name"="pmo-respaldo-db"
metric.label."result"="failed"
→ ALIGN_SUM 300s · COMPARISON_GT 0 · duration 0s · trigger 1
```

Salta con **una sola** ejecución fallida y sin esperar: no hay umbral que afinar
porque no existe «un poco de respaldo fallido». Se eligió
`completed_execution_count` y no `completed_task_attempt_count` a propósito —
con `--max-retries=2`, el segundo cuenta cada intento y avisaría de reintentos
que acaban bien.

**Está comprobado contra los hechos, no deducido.** La serie temporal de aquel
día tiene los dos puntos que la política mira:

```
result=failed  2026-08-19T22:20:00Z = 1
result=failed  2026-08-19T22:40:00Z = 1
```

Con esta política puesta, el chat habría sonado a los **11 minutos** del apagón
en vez de a los 42.

**`autoClose: 1800s`**, que es el mínimo que admite la API, y no es un detalle
cosmético: un incidente abierto **se traga los avisos siguientes**. Los dos
fallos del 19-08 iban con 24 minutos de diferencia y habrían caído dentro del
mismo incidente → **un solo mensaje para dos averías**. Cerrar pronto hace que
el fallo del día siguiente vuelva a sonar. Que cada fallo cuente su historia es
tarea de la capa de dentro, no de esta.

La política lleva además un bloque `documentation` con los comandos de
diagnóstico en orden y el aviso de mirar **la versión de Cloud SQL contra
`PG_MAJOR`** si el respaldo se rompe de golpe sin haber tocado nada.

> ⚠️ **Corrección del 2026-08-20, con fuego real:** aquí estaba escrito que ese
> bloque «es lo que Google Chat enseña dentro del mensaje», y **es falso**. Chat
> usa **solo `documentation.subject`**, como título; el `content` no sale. Ver la
> entrada del simulacro, arriba.

### Capa de dentro: el `trap`, y un hueco que no habíamos visto

Además del CRLF, `respaldo.sh` tenía un segundo modo de fallar callado que sí se
podía arreglar desde dentro. Todas las comprobaciones acaban en `|| fallar` —
pero `set -e` mata el script en **cualquier** línea que devuelva error sin pasar
por `fallar`. Las dos que había:

- `: "${DATABASE_URL:?falta DATABASE_URL}"` — muere ahí, en silencio.
- la asignación de `TAMANO` con `gcloud storage ls` — igual.

Job en rojo, chat mudo. Ahora hay un `trap ... EXIT` que avisa de **cualquier**
salida distinta de 0, con un `YA_AVISADO` que evita el mensaje doble cuando el
fallo sí pasó por `fallar`. Probado en los cuatro caminos (éxito silencioso,
fallo previsto, fallo imprevisto, variable ausente) antes de tocar nada.

Dos detalles que costarían un rato si se pierden:

- **`if` y no `&&` dentro del `trap`.** La condición de un `if` está exenta de
  `set -e`; una lista `&&` que corta, no. Escrito con `&&`, el `trap` podía irse
  sin avisar — es decir, el arreglo del silencio fallando en silencio.
- **`avisar` ya no traga el error de `curl`.** Era `>/dev/null 2>&1 || true`: si
  el webhook rechazaba la llamada no quedaba ni rastro. **El sistema de avisos
  no podía avisar de que estaba roto** — exactamente lo que pasó tres días con
  el `TO_BE_FILLED_BY_USER` de agosto. Ahora lo deja escrito en el log del job.

### 🔴 Hallazgo colateral, y es el peor de todos

Al ir a enganchar el canal apareció que **`alert_policy.json` —la alerta del
watcher de Gmail, viva desde el 14-08— tenía `notificationChannels` vacío.**

`enabled: true`. Evaluaba. Abría incidentes en la consola. **No se lo contaba a
nadie. Seis días.** Y el cierre de la Fase 4 en este mismo archivo la daba por
«✅ Operativa».

Es el mismo fallo que esta fase venía a cerrar, un piso más arriba: no un
respaldo fallando en silencio, sino **el vigilante del respaldo fallando en
silencio**. Y era invisible por partida doble — `create` sale en verde sin el
campo, y el campo tampoco estaba en el archivo, así que releerlo no lo delataba.

Corregido el 2026-08-20 en la política viva y en el archivo. La comprobación que
ahora es obligatoria después de desplegar cualquier política:

```bash
gcloud beta monitoring policies list --project pmo-dashboard-503418 \
  --format="value(displayName,enabled,notificationChannels)"
```

**Tercera columna vacía = alerta que no existe.**

### La cadencia: por qué el RPO bajó a 12 h

Faltaba la mitad que importa: **una alerta sobre fallos no puede ver una
ejecución que nunca ocurrió**. Si el Scheduler se pausa, se borra o pierde el
`run.invoker`, no hay fallo del que avisar — solo dejan de existir respaldos,
calladamente, hasta el día que hagan falta.

Lo natural era un `conditionAbsent` sobre `result="succeeded"`, y no cabía:

```
INVALID_ARGUMENT: condition_absent.duration had an invalid value of "24h":
Durations longer than 23h30m are not supported.
```

23h30m es el techo duro de Cloud Monitoring — de ahí sale el `84600s` de la
política de Gmail, que hasta ahora parecía un número elegido a ojo. Con respaldo
**diario**, cualquier ventana admisible se agota **antes** de la ejecución
siguiente: saltaría todos los días. Una alerta que miente a diario es peor que
ninguna, porque enseña a ignorar el canal.

**La salida no fue tocar la política, fue tocar la cadencia.** Doc aprobó el
cambio el 2026-08-20 y ejecutó él mismo el Scheduler, que ya está en
`30 3,15 * * *` (03:30 y 15:30 de Tulum) — verificado con `describe`, no
supuesto. Con los éxitos a 12 h, la condición cabe de sobra:

| | |
|---|---|
| Cadencia | 12 h |
| Ventana de la alerta | **14 h** (`duration: 50400s`) = una ejecución perdida + 2 h de margen |
| Techo de la API | 23h30m — sobra sitio, ya no es la restricción |

Se eligieron **14 h y no las 23h30m que caben**: 23h30m significaría «se han
perdido dos seguidos» y tardaría casi medio día en decirlo. Con 14 h el aviso
llega a las dos horas de la primera ausencia, y ese margen está muy por encima
de lo que puede tardar una ejecución legítima — el peor caso real son tres
intentos de `--task-timeout=900s`, unos 45 minutos.

> ⚠️ **El RPO de 12 h salió de regalo, no fue el objetivo, y esto hay que
> recordarlo al revés de como se cuenta solo.** Se dobló la frecuencia para
> hacer vigilable el «no se ha ejecutado»; que la pérdida máxima bajara de 24 h
> a 12 h vino encima. Importa porque invita al error contrario: **volver a la
> cadencia diaria para ahorrar dos minutos de cómputo apagaría la mitad de la
> vigilancia**, y el JSON de la política no lo dice por ningún lado. Si algún
> día se toca la cadencia, esta ventana se toca con ella. Queda escrito también
> en `GCP_SETUP.md` y en `infra/backup/README.md` §6, que son los dos sitios
> donde alguien lo miraría.

Detalle menor y deliberado: el Scheduler sigue llamándose `pmo-respaldo-db-diario`
y ya no es diario. Renombrarlo obliga a borrar y recrear, y el nombre está en el
IAM, en el README y en la documentación de la alerta. Un nombre algo viejo cuesta
menos que un disparador que desaparece un rato.

### ✅ Estado: instrumentación de respaldos CERRADA (2026-08-20)

| Pieza | Estado |
|---|---|
| Aviso desde dentro (`avisar`/`fallar`) | ✅ con `trap EXIT`, sin caminos mudos, probado en los cuatro |
| `avisar` ya no traga el error de `curl` | ✅ |
| Alerta de fallo (fuera) | ✅ desplegada, **comprobada contra la serie temporal del 19-08** |
| Alerta de ausencia (fuera) | ✅ desplegada, `50400s`, viable gracias a la cadencia de 12 h |
| Canal enganchado a **las dos** políticas | ✅ verificado con `policies list` |
| Cadencia a 12 h | ✅ ejecutada por Doc, verificada con `describe` |
| RPO | **24 h → 12 h** |

**La única casilla que queda, y no es de esta fase:** nadie ha visto sonar la
política todavía. La prueba es barata e inocua —sube un volcado bueno y lo
rechaza en la comprobación de tamaño, ejercitando las dos capas de golpe—:

```bash
gcloud run jobs execute pmo-respaldo-db --region us-central1 \
  --update-env-vars="TAMANO_MINIMO=999999999" --async
```

Se deja escrito sin adornos, porque cerrar en falso es justo el error que esta
entrada documenta: **el cierre de la Fase 4 dio la Capa 2 por «✅ Operativa» y
la política llevaba seis días sin canal.** Lo de aquí está verificado contra la
nube pieza por pieza —serie temporal, `policies list`, `describe` del
Scheduler— pero *ver sonar el timbre* sigue siendo otra cosa que *saber que el
cable está conectado*. Es la misma distinción que costó cinco intentos en el
simulacro de restauración: `pg_restore --list` decía que los volcados estaban
bien y no mentía, simplemente no probaba lo que hacía falta probar.

### Nota de dominio

`gcloud` es de Gravity. Los cuatro comandos que se ejecutaron aquí —crear la
política, engancharle el canal, parchear la del watcher y añadir la condición de
ausencia— se hicieron por encargo directo y explícito de Doc, y quedan escritos
arriba para que no sean configuración fantasma. **El del Scheduler lo ejecutó
Doc en su terminal**, que es donde corresponde. Los archivos
(`infra/alert_policy*.json`, `infra/backup/respaldo.sh`) sí son dominio propio.

---

## 🔴 El simulacro de restauración: los cuatro volcados anteriores no servían (2026-08-19)

**La conclusión primero, porque es la que importa:** durante **más de un día**,
los cuatro volcados del bucket fueron la única protección de la base de datos y
**ninguno de ellos se podía restaurar**. No estaban corruptos ni truncados —
estaban escritos por un cliente incompatible con el servidor al que había que
devolverlos. Nadie lo habría sabido sin ejecutar el simulacro.

Y lo peor: **la comprobación automática decía que estaban bien, y no mentía.**
`pg_restore --list` leía el índice y respondía que sí. Leer el índice no es
devolver los datos. **Un respaldo no se audita, se restaura.**

El simulacro correcto —**394 filas** desde un volcado del bucket a una base
vacía: `Email` 172, `Task` 145, `ChatMessage` 35— costó **cinco intentos**.
Ninguno de los cuatro primeros falló por el respaldo: fallaron por la herramienta
que iba a comprobarlo. Cada uno es una trampa que conviene no repetir.

### 1 · Un reemplazo global destrozó la ruta del socket (`688c4ce`)

Fallo mío, cazado en la primera ejecución. Para restaurar sobre una base de
pruebas había que cambiar el nombre de la base dentro de `DATABASE_URL`, y lo
escribí como un reemplazo **global y sin anclar** (`${DATABASE_URL//\/pmo/...}`).

La cadena de Cloud SQL contiene `/cloudsql/pmo-dashboard-503418:...`, que
**también** contiene `/pmo`. El proxy acabó pidiendo una instancia llamada
`pmo_restore_test-dashboard-503418:us-central1:pmo-postgres-db` y `pg_restore`
murió sin socket.

**El nombre de la base era prefijo de su propio proyecto.** Esa es la clase de
coincidencia que no se ve al escribir la línea y que solo aparece al ejecutarla.

Ahora el reemplazo se ancla al `?` que abre los parámetros o al final de la
cadena —los dos únicos sitios donde puede terminar el nombre— y **si no reconoce
ninguno, aborta en vez de adivinar**. Pero lo que de verdad cierra el agujero es
lo otro: después de crear la base, se conecta con la cadena nueva y pregunta
`current_database()`. Dejar de fiarse del reemplazo y **preguntarle al servidor
dónde está** es la diferencia entre creer y saber.

### 2 · 🔴 El cliente tiene que ser **la misma** major que el servidor, no «>=»

**Me equivoqué el 08-18 y el simulacro lo demostró.** Razoné «cliente mayor o
igual que el servidor» y con eso subí `PG_MAJOR` a 18. Segunda ejecución:

```
pg_restore: error: unrecognized configuration parameter "transaction_timeout"
Command was: SET transaction_timeout = 0;
```

**`pg_dump` no escribe un archivo neutro: escribe SQL para la versión con la que
habla.** El 18 mete `SET transaction_timeout = 0` en la cabecera, y ese parámetro
**no existe antes de PostgreSQL 17**. Contra `POSTGRES_16` muere, y da igual con
qué `pg_restore` se lea, porque **el problema viaja dentro del archivo**.

Bajar tampoco vale: `pg_dump` se niega a volcar una base más nueva que él, y
`pg_restore` rechaza un archivo escrito por uno más nuevo (los volcados del 18
llevan `PGDMP` versión 1.16, ilegible para un `pg_restore` 16). **Las dos paredes
juntas dejan un solo valor válido: el del servidor.**

⚠️ **Consecuencia:** los cuatro volcados tomados con el cliente 18 **no se pueden
restaurar en esta instancia por ningún camino**. No hay recuperación parcial ni
truco; son papel.

⚠️ **Y una consecuencia futura:** subir esta línea es **parte de la migración de
versión de Cloud SQL**, no un detalle posterior. El día que se actualice la
instancia hay que tomar volcado nuevo y **repetir el simulacro**.

_Cómo se cometió: le hice cambiar al Jefe algo en lo que tenía razón. El
razonamiento «mayor o igual» es correcto para conectarse y consultar; es falso
para volcar y restaurar. **Aplicar una regla verdadera fuera de su dominio es más
difícil de detectar que un error de bulto**, porque la regla resiste el
escrutinio._

### 3 · Los retornos de carro tumbaban el script en Cloud Build (`369676c`)

```
/usr/local/bin/respaldo.sh: line 12: $'\r': command not found
```

Git en Windows convierte los archivos a **CRLF** al ponerlos en el árbol de
trabajo, y `gcloud builds submit` sube el árbol **tal cual**. `bash` no entiende
el retorno de carro: muere en la primera línea con el contenedor ya arrancado y
autenticado, **así que el error no se parece en nada a su causa**.

Los scripts funcionaron mientras estuvieron recién escritos con LF y se rompieron
en cuanto Git los normalizó al recommittearlos. El detalle que lo explica todo:
**solo `respaldo.sh` tenía CRLF** —`restaurar.sh` seguía en LF—, y por eso el
simulacro llegaba a ejecutarse mientras el respaldo moría en la línea 12.

Arreglado en **dos capas a propósito**:

- `.gitattributes` marca los `.sh` y el `Dockerfile` como `eol=lf`.
- Y el `Dockerfile` limpia los `\r` antes del `chmod`. **Esta es la que cierra el
  asunto**: el `.gitattributes` depende de que la configuración de Git esté bien
  en la máquina de quien construya; esto no depende de nadie.

Una sola habría bastado hoy. Las dos juntas evitan que vuelva el día que alguien
clone el repositorio en otra máquina.

### 4 · 🔴 Mi comprobación pasaba por casualidad del tamaño del búfer (`96ba4af`)

Esta es la más incómoda, porque **la escribí yo como red de seguridad** y era ella
la que fallaba.

```
ERROR: (gcloud.storage.cat) Source hash ... does not match destination hash
1B2M2Y8AsgTpgAmY7PhCfg==
```

Ese hash de destino es **el de la cadena vacía**. La comprobación era
`gcloud storage cat "$DESTINO" | pg_restore --list`, y **estuvo mal desde el
primer día aunque pasara**: `pg_restore --list` lee solo el índice del archivo y
sale, así que la tubería se cierra antes de que `gcloud` termine de escribir.
`gcloud` lo cuenta como fallo de integridad y `pipefail` se lleva el job por
delante.

**Funcionó cuatro veces por el tamaño del búfer.** Con volcados de ~200 KB,
`gcloud` acababa antes de que `pg_restore` cerrara. El primero de 270 KB lo
despertó. **Una comprobación que depende de que el archivo sea pequeño no
comprueba nada** — y lo peor de su forma: **crece hacia el fallo**. Cuantos más
datos hay que proteger, menos protege.

Ahora se baja a disco y se lee de ahí. De paso **mejora lo que prueba**: verifica
el objeto tal como quedó guardado, ida y vuelta completa, en vez del flujo que
acabamos de mandar.

### Lo que enseña, y por qué va en esta bitácora

No fue una pieza desconectada: **fue una que parecía funcionar**. Es el mismo modo
de fallo que el `.gitignore` en UTF-16 del 08-18 y que el `git check-ignore` sin
`-v`: **verde por la razón equivocada**. Tres veces en una semana, cada una con un
disfraz distinto.

Y hay una asimetría que conviene tener presente: de las cuatro trampas, **tres
eran mías** —el reemplazo, el razonamiento de versiones, la comprobación— y las
tres pasaron sus propias pruebas. Lo único que las cazó fue **ejecutar la cosa de
verdad, de punta a punta, contra una base real**.

_Nota operativa: el volcado en sí **sí** funcionaba. Las tres ejecuciones fallidas
dejaron sus archivos en el bucket, escritos ya con el cliente 16, y son **los
primeros restaurables que tenemos**._

---

## La infraestructura del respaldo ya es código (2026-08-18)

`deploy.yml` construye la imagen del respaldo y despliega el Job en cada
despliegue de la API. **Se acabó la configuración que solo vivía en la consola.**

```
Construir y publicar la imagen del respaldo   contexto infra/backup, etiqueta = SHA
Desplegar el Job de respaldo diario           gcloud run jobs deploy (crear-o-actualizar)
```

Se llevó al pipeline porque este Job enseñó por las malas lo que cuesta lo
contrario: se creó a mano, **la rotación del secreto en la migración a Cloud SQL
lo dejó sin poder alcanzar la base**, y hubo que parchearlo a mano otra vez. Lo
que solo vive en la consola no se revisa, no se revierte, y nadie sabe que
existe hasta que se rompe.

### ⚠️ En los Jobs no existe `--no-cpu-throttling`

Y no es un olvido de gcloud: **el estrangulamiento de CPU es un concepto de
servicios**, atado al ciclo de vida de la petición. En un Job la CPU está
asignada durante toda la tarea por definición, así que un `pg_dump` no se puede
congelar a mitad como se congelaban las alertas del servicio. Añadir la bandera
tumba el despliegue con `unrecognized arguments`.

Es el reverso exacto del hallazgo del 08-17: allí el `void fetch(...)` sí se
congelaba **porque era un servicio**. La misma palabra describe dos mundos
distintos.

### El paso va al final, y el IAM se queda fuera

**Al final** porque si falla, la API ya está desplegada y comprobada: un problema
con el respaldo no debe impedir que el producto salga.

**Y el IAM no entra en el pipeline a propósito.** Un workflow con permiso para
repartir roles de proyecto es una escalada de privilegios esperando a que alguien
toque el repositorio. Los tres `add-iam-policy-binding` —incluido el
`roles/cloudsql.client` que se olvidó y hubo que añadir de urgencia— se ejecutan
una vez a mano y quedan escritos en `infra/backup/README.md`. Esa es la
diferencia entre configuración manual **documentada** y configuración fantasma.

### Y una corrección de bulto en `deploy.yml`

El comentario de las migraciones decía que el Job existía por costumbre, porque
«Neon es Postgres público y el runner llegaría de sobra». Con Cloud SQL **vuelve
a valer el motivo original**: no hay IP pública y se entra por el Auth Proxy. El
segundo motivo no dejó de valer nunca: así `DATABASE_URL` no sale de Google
Cloud.

---

## Sondeo de Redis, segunda vuelta · y el `.gitignore` que tapaba todo (2026-08-18)

### 🔴 El ajuste del 08-13 se quedó corto, y el error estaba en la aritmética

Medido en la consola de Upstash: **297 k de 500 k** comandos, frente a 177 k el
08-14. Unos **30 k al día**, que agotan la cuota gratuita en menos de una semana.

La primera estimación contaba **un comando por ciclo de sondeo**. No lo es: cada
vencimiento de `drainDelay` arrastra el `BZPOPMIN` **más toda la contabilidad**
que BullMQ hace alrededor, del orden de cinco comandos. Con cuatro clientes que
sondean —dos workers y dos `QueueEvents`, verificados uno a uno— salen
**~1 250/hora**, no los ~264 que decía la tabla original.

Eso hace el arreglo **más** eficaz, no menos: subir el plazo divide el ciclo
entero, no una sola llamada.

```
drainDelay        60 → 240 s
blockingTimeout   60 → 240 s
stalledInterval  300 → 600 s
```

### ⚠️ Y hay un techo: Upstash corta a los 5 minutos

**Esta es la parte que no es obvia y por la que el número no es redondo.**
Upstash cierra las conexiones ociosas alrededor de los 300 s. Un bloqueo puesto
justo ahí se queda en la frontera y provoca reconexiones —cada una con su
`AUTH`, su `INFO` y su reenganche— que **gastan más que el ciclo que se quería
evitar**. Subir por encima de ese punto no ahorra: empeora.

240 s deja un minuto de margen. La constante `CORTE_DE_OCIOSIDAD_UPSTASH_MS`
está en el archivo para que la prueba pueda comprobarlo, y no como ajuste.

No toca la latencia de ninguna cola: **son llamadas bloqueantes, no encuestas**.
Redis responde en cuanto entra trabajo; el plazo solo decide cada cuánto se
rehace la llamada mientras no hay nada. `stalledInterval` sube solo el doble
porque es el único cuyo aumento cuesta algo real —un trabajo huérfano tarda más
en reclamarse—, y aun así no es una pérdida: sigue en la cola.

_Cuatro pruebas nuevas verificadas por reversión. Fijan el techo del proveedor y
**la trampa de unidades**, que es el error fácil de este archivo: `drainDelay`
va en segundos y `blockingTimeout` en milisegundos. Poner 240_000 en el primero
daría un bloqueo de 66 horas y el worker parecería colgado._

⚠️ **Falta medir.** El cambio no surte efecto hasta desplegar, y luego hay que
mirar el contador: si en 24 h no baja de ~30 k/día a ~8 k, la causa está en otro
sitio y toca el Monitor en vivo de Upstash.

### 🔴 El `.gitignore` ignoraba el repositorio entero, y parecía que protegía

Salió al rechazar `git add apps/...` con «paths are ignored». El patrón
`*db_url*` se había escrito en **UTF-16LE dentro de un archivo UTF-8**, con BOM
y bytes nulos al final — el `Set-Content` de PowerShell sin `-Encoding utf8`.
**Git corta el patrón en el primer byte nulo**, así que quedaba un `*` suelto.

**Lo grave no es que ignorara `apps`: es que yo lo había dado por bueno.**
Comprobé que `new_db_url.txt` y `dump.sql` estaban ignorados, salió que sí, y lo
reporté como cerrado. Era un falso positivo: no los protegía su regla, los
tapaba el catch-all. **La protección de credenciales que dimos por hecha no
existía.**

Es el mismo patrón que llevamos toda la semana: una comprobación que da verde
por una razón distinta de la que uno cree. `git check-ignore` respondía la
pregunta que le hice —«¿está ignorado?»— y no la que importaba —«¿por qué?». La
bandera `-v`, que dice **qué regla** lo caza, es la diferencia entre las dos.

Reescrito en UTF-8 sin BOM, con dos añadidos y un rescate:

```
*db_url*                                ahora sí es un patrón válido
*.sql                                   cubre los volcados sueltos
!apps/api/prisma/migrations/**/*.sql    ← sin esto, `*.sql` se lleva por
                                          delante las migraciones de Prisma
```

_Si hay que tocar ese archivo desde PowerShell: `-Encoding utf8` siempre, y
comprobar después que `git diff` lo muestra como texto y no como `Bin`._

---

## La base ya no es Neon: Cloud SQL (2026-08-18)

Migración de Gravity. **Todo lo que este archivo dice de Neon queda como
historia**, no como descripción de lo que corre. Lo que hay ahora:

```
Instancia   pmo-postgres-db · us-central1 · db-f1-micro · RUNNABLE
Versión     POSTGRES_16   (Neon corría 18)
Conexión    socket del Cloud SQL Auth Proxy, no IP pública
Secreto     pmo-database-url versión 5 (verificado: contiene /cloudsql/, ya no neon.tech)
```

El servicio `pmo-api` lleva adjunta la instancia
(`run.googleapis.com/cloudsql-instances`) y el pipeline la inyecta con
`--set-cloudsql-instances`, así que **esto ya no es estado manual**.

**Esto sí cierra los `P1001`**, que es lo que el respaldo no podía cerrar:
Cloud SQL no se suspende sin tráfico. La sección del respaldo diario decía que
haría falta esta migración; ya está hecha.

⚠️ Los plazos de transacción subidos por Neon (`maxWait` 10 s, `timeout` 15 s en
el constructor de `PrismaService`) **se quedan como están**. Se pusieron porque
despertar Neon tardaba ~5,3 s; con Cloud SQL despierto sobran, pero un plazo
generoso no cuesta nada y bajarlo ahora sería tocar lo que funciona para ganar
un margen que nadie ha pedido.

### 🔴 El respaldo diario dejó de alcanzar la base, y nadie lo sabía

**Detectado el 08-18 revisando `TASKS.md`, no por un fallo.** El job
`pmo-respaldo-db` lee `pmo-database-url:latest`, que ahora es la versión 5 con
el socket `/cloudsql/…` — pero **el job no tiene la instancia adjunta** (sin
anotación `cloudsql-instances`) y su cuenta `pmo-respaldos` **no tiene ningún
rol de proyecto**, así que le falta `roles/cloudsql.client`. `pg_dump` va a
buscar un socket que nadie ha montado.

El Scheduler está **ENABLED a las 03:30**, así que fallará esta noche. Los dos
comandos que lo arreglan están en `TASKS.md`.

**Y esto es exactamente la clase de junta que este proyecto rompe una y otra
vez**: dos piezas correctas por separado —la migración está bien hecha, el
respaldo está bien hecho— y nadie miró el punto donde se tocan. Rotar un secreto
compartido cambia el contrato de **todos** sus consumidores, no solo del que
motivó la rotación.

Lo único que sale bien de esto: **fallará ruidosamente**. `pipefail` lo caza, el
script sale con error y avisa por el webhook de la Capa 1. La alerta que
construimos el 08-17 va a cazar el fallo del respaldo que construimos el 08-18.

_`PG_MAJOR` bajó a **16** el 08-18 para igualar al servidor. 18 también
funcionaba —la regla es que el cliente no sea más viejo—, pero igualarlo evita
el problema del otro extremo: restaurar con un `pg_restore` de la versión del
servidor._

---

## `change_email_status`: el copiloto mueve la bandeja (2026-08-18)

Quinta herramienta del copiloto, en `llm/tools.ts`. Propone mover un correo por
el triage (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `DISMISSED`) y **la confirma
una persona, siempre**.

La regla de seguridad no hizo falta escribirla: ya estaba en la arquitectura.
`kind: 'propose'` hace que la llamada salga como evento `tool_call` y **ahí
termine el turno**; solo las `execute` las corre el backend. Lo que sí hacía
falta era **fijarla con pruebas**, porque un día alguien puede cambiar una
palabra en el catálogo y nadie lo notaría en una revisión. Cinco pruebas fallan
si esa palabra pasa a `execute`, y una de ellas cuenta las llamadas al SDK: una
sola vuelta significa que el backend no la ejecutó.

### 🔴 `force` NO está en el esquema, y es la decisión que importa

`PATCH /emails/:id/status` responde **409 al reabrir** un correo ya despachado y
solo cede con `force: true` — «la excepción del dueño». Meter ese campo en el
esquema le daría al modelo la llave de una barrera que existe precisamente para
que la cruce una persona a sabiendas. El frontend puede añadirlo al confirmar,
después de ver el 409; el modelo no lo ve nunca.

### 🔴 Un estado desconocido cae a `null`, no a un valor por defecto

Y aquí se rompe a propósito la simetría con `parseCreateTask`, donde una
prioridad inventada baja a `MEDIUM`. Allí el recurso es correcto: equivocarse de
prioridad es barato y perder la propuesta entera es peor.

**Aquí no hay ningún estado inocente al que caer.** Elegir uno convertiría una
respuesta ininteligible del modelo en una acción concreta sobre la bandeja de
alguien — `DISMISSED` por descarte descartaría correos de verdad. Con `null`, la
tarjeta sabe que la propuesta no es confirmable y no ofrece el botón.

Es la misma regla que el guard de OIDC y el filtro de excepciones: **ante la
duda, no actuar**. Un valor por defecto es una decisión disfrazada de detalle de
implementación.

_No se tocó `emails.controller.ts`: el frontend llama a `PATCH
/emails/:id/status` al confirmar. 601 → 610 pruebas._

**CERRADO y en producción.** Revisión **`pmo-api-00061-dqh`**, 100 % del
tráfico, con `SERVICE_VERSION = e3fd2c42294f7bc42f796056469147c819917c20` — el
commit exacto. Arranque sin un solo aviso.

Se comprobó contra Cloud Run y no contra el «success» de Actions, que solo dice
que el pipeline terminó: es `SERVICE_VERSION` lo que demuestra que el código que
corre es este y no el anterior. La distinción no es pedantería — el 08-17 una
revisión desplegada por el pipeline y otra creada a mano desde una consola
convivieron sin que nadie supiera cuál servía.

---

## Respaldo diario de la base de datos (2026-08-18)

`infra/backup/` — Cloud Run Job disparado por Cloud Scheduler, volcado a Cloud
Storage. **Paso 1 del plan de migración a Cloud SQL, y deliberadamente
independiente de él**: vale aunque la migración no llegue nunca.

Existe porque **Neon en plan gratuito conserva 6 horas de historial** —
confirmado en la consola del proyecto `pmo-db` el 08-18 — y el tablero es el
único sitio donde viven las tareas y los fichajes. Los correos están en Gmail;
las tareas no están en ninguna parte.

⚠️ **Lo que esto NO arregla: los `P1001`.** 22 apariciones en 7 días, y vienen
de que Neon se suspende sin tráfico. Eso lo resuelve Cloud SQL, que no se
duerme. Un volcado no. Conviene tenerlo escrito para que nadie dé el problema
por cerrado con esto.

### 🔴 `PG_MAJOR` estaba en 17 y el servidor es 18

Comprobado contra la consola de Neon: **Postgres 18**. `pg_dump` se niega a
volcar una base más nueva que él (`server version mismatch`), y **ese error solo
aparece en la primera ejecución, no al construir la imagen** — habría dejado el
job en rojo con todo lo demás correcto. Hay que subirlo cada vez que Neon o
Cloud SQL actualicen; no hay aviso.

### Las cuatro decisiones de diseño

**`set -o pipefail`, y es la línea más importante del script.** En
`pg_dump | gcloud storage cp` el código de salida es el del **último** comando.
Si `pg_dump` revienta a mitad —la base dormida, un `P1001`—, `gcloud` sube
tranquilamente lo que le llegó y termina con 0: **el job sale en verde con un
archivo truncado**. Un bucket lleno de respaldos correctos a la vista e
inservibles, que se descubre el día que hay que restaurar. Es la forma de fallo
favorita de este proyecto: una pieza que parece hecha porque existe.

⚠️ Por eso el `ENTRYPOINT` es **`bash` y no `sh`**: el `dash` de Debian no
implementa `pipefail` y lo ignoraría sin error. La protección se caería sola al
cambiar de intérprete.

**Comprobar el archivo, no solo escribirlo.** Dos verificaciones baratas que
cierran el mismo fallo por el otro lado: que pese por encima de un mínimo, y que
`pg_restore --list` sepa leer su índice — lo único que demuestra que el volcado
está completo. Un respaldo que nadie ha leído es un archivo, no un respaldo.

**Avisar al fallar, reutilizando el webhook de la Capa 1.** Un respaldo
silencioso que lleva tres semanas roto es peor que no tener respaldo, porque
encima da tranquilidad. Si `ALERT_WEBHOOK_URL` no está, el aviso se omite pero
el job **sigue saliendo con error**, que es lo que ve Cloud Scheduler.

**IAM: `objectCreator` + `objectViewer`, nunca `objectAdmin`.** Si el job se
vuelve loco o alguien se cuela en él, **no puede borrar los respaldos
antiguos**. El borrado lo hace la regla de ciclo de vida del bucket (30 días),
que no depende del job. Más el `soft-delete` de 7 días como última red. La
cuenta de servicio lee **solo los dos secretos que necesita**, no todos.

`DATABASE_URL` no sale de Google Cloud: va de Secret Manager al contenedor y de
ahí a Neon. No se registra, no se imprime y **no viaja como argumento**, que
sería visible en la lista de procesos.

### Lo que hay que aceptar, y está escrito a propósito

Una copia al día significa **hasta 24 h de pérdida** en el peor caso. Se pasa de
«6 h de historial» a «hasta 24 h de trabajo perdido, pero recuperable». Duplicar
la frecuencia es cambiar una línea del Scheduler.

⚠️ **~~Y queda una prueba sin hacer: restaurar.~~ Hecha el 2026-08-19, y encontró
que los cuatro volcados de entonces no servían.** Ver la sección del simulacro al
principio de este archivo. Lo que se escribió aquí —«un respaldo sin una
restauración probada es una suposición»— resultó ser literal: la suposición era
falsa, y costó cinco intentos descubrirlo.

---

## Estado a 2026-08-17 — **Capa 1 PROBADA en fuego real**

> Lo que el 08-15 quedó como suposición ya no lo es. **La aplicación pidió
> ayuda sola y el mensaje llegó a Google Chat**, sin intervención humana en
> ningún punto de la cadena.
>
> ```
> Alertas API Capa 1 · App · 2026-08-17 22:53 UTC
> Clasificación perdida: un job agotó sus reintentos
> cola=classify-email job=105 · 404 {"type":"not_found_error",
> "message":"model: modelo-inexistente-prueba-e2e", "request_id":"req_011Ce99B…"}
> ```
>
> Dos cosas se validaron de una vez y solo una estaba planeada:
>
> 1. **La cadena completa**: fallo en producción → `AlertService` → `fetch` →
>    webhook → Chat.
> 2. **El freno de 15 minutos**, gratis. Saltaron dos alertas con 74 s de
>    diferencia (jobs 105 y 106, misma clave `dlq-classify-email`) y **en Chat
>    solo está la primera**. La segunda se frenó, que es exactamente el diseño.

### 🔴 BullMQ rechaza el `jobId` por su FORMA, no por su tipo

Tuvo toda la ingesta de correo caída y **ningún correo entraba en la cola**.
`job.js:1068`:

```js
if (`${parseInt(this.opts.jobId, 10)}` === this.opts.jobId) {
    throw new Error('Custom Id cannot be integers');
}
```

El `messageId` de Pub/Sub **ya es un `string`** —así está tipado— pero de
dígitos (`"15481022266393333"`), así que encajaba en esa comparación.
**`String(messageId)` no arregla nada**: sigue siendo dígitos. Hay que cambiar
la forma, no el tipo: `gmail-sync-${messageId}`, con guiones porque BullMQ solo
admite `:` en jobId de tres partes.

⚠️ El helper del spec usaba `messageId = 'msg-1'`, que no es un entero, y por
eso **las pruebas pasaban mientras producción rechazaba todo**. Un dato de
prueba que no se parece al real no prueba el caso real.

### 🔴 `void fetch(...)` en Cloud Run se congela a mitad de vuelo

Cloud Run **estrangula la CPU al cerrar la petición** salvo que se ponga
`run.googleapis.com/cpu-throttling=false`. Una promesa lanzada y olvidada puede
quedarse helada mientras su `AbortSignal.timeout` sigue corriendo, y la alerta
se pierde en silencio — el fallo que esta capa existe para evitar.

Los cinco puntos de llamada esperan ahora, pero **en dos de ellos la espera no
puede ir donde estaba el `void`**:

| Sitio | Dónde va el `await` | Por qué |
|---|---|---|
| `all-exceptions.filter` | tras `super.catch` | esperar antes suma el viaje al webhook al tiempo de un 500 |
| `gmail.controller` | tras soltar la clave de Redis | esperar antes retiene la reserva 5 s y la segunda entrega de Google (~4 ms) se descarta como duplicada: **la alerta costaría el correo del que avisa** |

⚠️ `cpu-throttling=false` vive **solo en la infraestructura**, no en
`deploy.yml`. Sobrevive a los despliegues porque Cloud Run conserva las
anotaciones que no se mencionan, pero nadie que lea el repositorio sabe que
existe y un despliegue con reemplazo completo se lo lleva sin avisar.

### Cómo provocar una alerta de Capa 1 sin romper nada importante

Las dos opciones que parecen obvias son trampas:

- ❌ **Vaciar `GMAIL_PUBSUB_TOPIC`.** `watchInbox` llama a `users.stop()`
  **antes** e incondicionalmente. El sabotaje apagaría el watch vigente y
  fallaría al reponerlo: la ingesta se queda ciega **en el acto**, no dentro de
  siete días.
- ❌ **Quitar `ANTHROPIC_API_KEY`.** `ai.service.ts:167` lanza en el
  constructor si falta, así que el contenedor no arranca, Cloud Run no le
  enruta tráfico y el sabotaje no llega a ocurrir. Además gcloud no deja
  cambiar la variable de secreto a literal en un solo paso.
- ✅ **Sabotear `CLAUDE_MODEL_CLASSIFY`** con un modelo inexistente. Un comando,
  variable en claro, ningún secreto tocado, el copiloto sigue vivo, y el 404 no
  lo cubre `convieneEsperar` (solo 429, 529 y ≥500), así que lanza → reintentos
  → DLQ → alerta. Falla además **más rápido**, porque el SDK no reintenta los
  4xx irrecuperables. Restaurar: `CLAUDE_MODEL_CLASSIFY=claude-sonnet-5`.

⚠️ Los jobs que agotan reintentos **no se reprocesan al restaurar**: quedan en
`dead-letter` y hay que reencolarlos a mano si importan.

### 🔴 Un `git commit -a` de un agente puede desplegar código de otro

`ce5b7de`, titulado «Update GRAVITY_MEMORY.md», arrastró un
`all-exceptions.filter.ts` **a medio escribir** de otro agente, lo empujó a
`master` y de ahí salió a Cloud Run. Salió verde por casualidad de segundos:
treinta antes habría publicado un filtro con `async catch` y sin los `await`.

⚠️ **Lo primero que escribí aquí era falso y conviene que quede dicho**: culpé
al pipeline de desplegar desde commits de documentación. No es cierto. El
`paths-ignore` de `ci.yml` existe desde el 2026-08-07 y funciona — `40b65c0`,
solo bitácora, no disparó nada. `ce5b7de` desplegó **porque llevaba un `.ts`
dentro**, y el filtro solo se salta si encajan *todos* los archivos del push.
El pipeline hizo exactamente lo que debía.

Así que el agujero es uno solo, y no está en el CI: **la disciplina de
`git add` de los agentes**. La regla de rutas exactas existe desde el 08-13 y no
la cumplen todos. No tiene equivalente en Git: solo la regla escrita y, si se
quiere red de verdad, un hook `pre-commit` que rechace un índice con rutas fuera
del dominio del agente que commitea.

Moraleja aparte, y más cara que la anterior: **un hallazgo sin verificar es una
suposición aunque suene a hallazgo**. Bastaba abrir `ci.yml`.

---

## Estado a 2026-08-15 — **CERRADO**

> **Fase 4 cerrada por Doc el 2026-08-15.** Lo que sigue queda como referencia:
> son trampas pagadas, no trabajo pendiente.
>
> **Salvo una cosa, y conviene que esté escrita en vez de descubrirse.** En el
> momento del cierre, comprobado contra producción:
>
> | | Estado real |
> |---|---|
> | Capa 2 (Cloud Monitoring) | ✅ **Operativa.** Canal `Alertas PMO`, tipo nativo `google_chat`, apuntando a un espacio real. El `webhook_tokenauth` con la URL de ejemplo ya no está — Gravity lo rehízo bien |
> | Capa 1 (`AlertService`) | ⚠️ **Desplegada pero muda.** La revisión `pmo-api-00046-64q` **no tiene `ALERT_WEBHOOK_URL`**: el servicio arranca, registra el aviso de que no puede enviar, y no manda nada |
>
> Falta atar el IAM del secreto (`roles/secretmanager.secretAccessor` para la
> cuenta de Cloud Run) y poner `vars.ALERT_WEBHOOK_SECRET`; el siguiente
> despliegue lo recoge solo. Hasta entonces **la aplicación sigue sin poder
> pedir ayuda**, que es justo lo que la Fase 4 venía a resolver.
>
> Y queda una prueba sin hacer: **nadie ha visto sonar el canal todavía**. Un
> alertador que no se ha visto disparar es una suposición — la forma barata de
> comprobarlo es provocar un «0 de N» real forzando el cron con la cuenta de
> servicio mal puesta.
>
> ⚠️ **Todo este bloque está resuelto desde el 2026-08-17**: ver el estado de
> arriba. El secreto llegó (versión 2), el canal sonó solo, y el método de
> prueba que se propone aquí resultó ser **el peligroso** — apaga la ingesta.

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
