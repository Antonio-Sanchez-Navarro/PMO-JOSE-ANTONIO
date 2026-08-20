# Respaldo de la base de datos (dos veces al día)

**Paso 1 del plan de migración**, y deliberadamente independiente de él: esto
tiene valor aunque la migración a Cloud SQL no llegue nunca.

## Por qué existe

El tablero es el sistema de registro de las tareas y los fichajes, y **eso no
existe en ningún otro sitio**: los correos están en Gmail, las tareas no están
en ninguna parte. Sin volcados, estamos a un accidente de perder el histórico
entero.

Nació urgente porque la base de entonces conservaba **6 horas** de historial.
Desde la migración a **Cloud SQL** (2026-08-18) el suelo es mejor —la instancia
tiene sus propias copias automáticas— pero esto **no sobra**: un volcado
`--format=custom` en un bucket ajeno a la instancia es lo único que sobrevive a
que alguien borre la instancia entera, y es el vehículo para restaurar en otro
sitio.

**Lo que esto NO arregla**: los `P1001` (`Can't reach database server`), 22
apariciones en 7 días. Venían de que la base se suspendía sin tráfico, y **eso
lo cerró la migración a Cloud SQL**, que no se duerme — no un volcado. Queda
escrito para que nadie confunda las dos cosas.

## Qué hace

Un **Cloud Run Job** que corre **dos veces al día**, disparado por Cloud
Scheduler:

1. Lee `DATABASE_URL` de Secret Manager, montada como variable de entorno.
2. `pg_dump --format=custom` y sube el resultado a Cloud Storage **por tubería**,
   sin escribirlo en disco.
3. **Comprueba el archivo**: que pese más de un mínimo y que `pg_restore --list`
   sepa leer su índice.
4. Si algo falla, avisa por el webhook de Google Chat de la Capa 1 y sale con
   error, para que Cloud Scheduler lo cuente como fallo.

`DATABASE_URL` **no sale de Google Cloud**: va de Secret Manager al contenedor y
de ahí a Cloud SQL **por el socket del Auth Proxy**, no por IP pública. No se
registra, no se imprime y no viaja como argumento.

⚠️ Eso es lo que obliga a que el Job lleve `--set-cloudsql-instances`: sin esa
bandera Cloud Run no monta el socket `/cloudsql/…` y `pg_dump` busca un archivo
que no existe. Lo pone el pipeline (`deploy.yml`); **no se configura a mano**.

### Las tres decisiones que importan

**`set -o pipefail`.** En `pg_dump | gcloud storage cp`, sin `pipefail` el código
de salida es el del último comando. Si `pg_dump` revienta a mitad, `gcloud` sube
lo que le llegó y el job sale en **verde** con un archivo truncado. Es la forma
de fallo favorita de este proyecto: una pieza que parece hecha porque existe.

**Comprobar, no solo escribir.** Un respaldo que nadie ha leído es un archivo,
no un respaldo. `pg_restore --list` sobre el objeto subido es la única prueba
barata de que el volcado está completo.

**Avisar al fallar.** Un respaldo silencioso que lleva tres semanas roto es peor
que no tener respaldo, porque encima da tranquilidad.

## Lo que hay que aceptar

- **Dos copias al día significan hasta 12 h de pérdida** en el peor caso.
  Pasamos de «6 h de historial» a «hasta 12 h de trabajo perdido, pero
  recuperable».

  > El RPO bajó de 24 h a 12 h el **2026-08-20**, y conviene saber que **no se
  > hizo por el RPO**: se hizo porque con cadencia diaria la alerta de ausencia
  > no cabía en el techo de 23h30m de Cloud Monitoring y habría saltado todos
  > los días. Doblar la frecuencia era lo que hacía vigilable el «no se ha
  > ejecutado». El RPO a la mitad salió de regalo. Ver §6.
- La instancia es `db-f1-micro`, la más pequeña: un volcado grande tardará.

---

# Comandos

Todo con estos valores. Cámbialos si algo no coincide.

```bash
export PROYECTO=pmo-dashboard-503418
export REGION=us-central1
export BUCKET=pmo-respaldos-db
export SA=pmo-respaldos
export JOB=pmo-respaldo-db
export GAR=us-central1-docker.pkg.dev/${PROYECTO}/pmo
```

## 0. La versión del servidor — ✅ resuelto

**Cloud SQL corre `POSTGRES_16`** (`gcloud sql instances describe pmo-postgres-db`)
y `PG_MAJOR` tiene que ser **16**: **la misma major que el servidor**, no «mayor o
igual».

> ⚠️ **Esto costó dos simulacros fallidos el 2026-08-19, y merece leerse entero.**
>
> `pg_dump` **no escribe un archivo neutro**: escribe SQL para la versión con la
> que habla. Un `pg_dump` 18 mete `SET transaction_timeout = 0;` en la cabecera
> del volcado, y ese parámetro **no existe antes de PostgreSQL 17**. Restaurarlo
> contra `POSTGRES_16` muere con
> `unrecognized configuration parameter "transaction_timeout"` — **y da igual con
> qué `pg_restore` se lea, porque el problema viaja dentro del archivo**.
>
> Por el otro lado tampoco se puede bajar: `pg_dump` se niega a volcar una base
> más nueva que él («server version mismatch») y `pg_restore` rechaza un archivo
> escrito por un cliente más nuevo (`unsupported version (1.16) in file header`).
>
> Las dos paredes juntas dejan **un solo valor válido: el del servidor**.
>
> **El día que Cloud SQL actualice**, subir esta línea es parte de la migración,
> no un detalle posterior: los volcados viejos dejan de restaurarse en el servidor
> nuevo. **Toma un volcado nuevo el mismo día y vuelve a correr el simulacro.**

Sí lo habrá el día que se actualice la instancia, y **nada avisa**: `pg_dump` se
niega a volcar una base más nueva que él y el error aparece **la primera vez que
el job se ejecuta**, no al construir la imagen. Si el respaldo falla de golpe sin
haber tocado nada, mira esto primero:

```bash
gcloud sql instances describe pmo-postgres-db   --project pmo-dashboard-503418 --format='value(databaseVersion)'
```

## 1. El bucket

```bash
gcloud storage buckets create "gs://${BUCKET}" \
  --project="${PROYECTO}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --public-access-prevention

# Borra los volcados de más de 30 días. Sin esto el bucket crece para siempre.
cat > /tmp/ciclo.json <<'JSON'
{"lifecycle": {"rule": [
  {"action": {"type": "Delete"}, "condition": {"age": 30}}
]}}
JSON
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file=/tmp/ciclo.json

# Red de seguridad: un objeto borrado se puede recuperar durante 7 días.
gcloud storage buckets update "gs://${BUCKET}" --soft-delete-duration=7d
```

## 2. La cuenta de servicio del job

```bash
gcloud iam service-accounts create "${SA}" \
  --project="${PROYECTO}" \
  --display-name="Respaldo diario de la base de datos"

export SA_MAIL="${SA}@${PROYECTO}.iam.gserviceaccount.com"

# Leer la cadena de conexión. Solo ese secreto, no todos.
gcloud secrets add-iam-policy-binding pmo-database-url \
  --project="${PROYECTO}" \
  --member="serviceAccount:${SA_MAIL}" \
  --role="roles/secretmanager.secretAccessor"

# Y la URL del webhook, para poder avisar si falla.
gcloud secrets add-iam-policy-binding ALERT_WEBHOOK_URL \
  --project="${PROYECTO}" \
  --member="serviceAccount:${SA_MAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

Y **conectarse a Cloud SQL**. Este se olvidó al crear la cuenta y hubo que
añadirlo de urgencia el 08-18: sin él el Job tiene el socket montado pero no
puede autenticarse contra la instancia.

```bash
gcloud projects add-iam-policy-binding "${PROYECTO}"   --member="serviceAccount:${SA_MAIL}"   --role="roles/cloudsql.client"
```

> ⚠️ **El IAM no está en el pipeline y es deliberado.** Un workflow con permiso
> para repartir roles de proyecto es una escalada de privilegios esperando a que
> alguien toque el repositorio. Estos tres `add-iam-policy-binding` se ejecutan
> una vez, a mano, y quedan escritos aquí — que es la diferencia entre
> configuración manual **documentada** y configuración fantasma.

Sobre el bucket, **crear y leer, nunca borrar**:

```bash
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_MAIL}" \
  --role="roles/storage.objectCreator"

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_MAIL}" \
  --role="roles/storage.objectViewer"
```

> `objectCreator` y `objectViewer` en vez de `objectAdmin` **a propósito**: si el
> job se vuelve loco o alguien se cuela en él, no puede borrar los respaldos
> antiguos. El borrado lo hace la regla de ciclo de vida, que no depende de él.

## 3 y 4. La imagen y el Job — **los hace el pipeline**

⚠️ **Ya no se ejecutan a mano.** Desde el 2026-08-18, `.github/workflows/deploy.yml`
construye la imagen (`respaldo-db`, contexto `infra/backup`) y despliega el Job en
cada despliegue de la API, con `gcloud run jobs deploy`, que es crear-o-actualizar.

Se llevó al pipeline porque este Job ya enseñó lo que cuesta lo contrario: se creó
a mano, la migración a Cloud SQL lo dejó sin poder alcanzar la base, y **hubo que
parchearlo a mano otra vez**. Configuración que solo vive en la consola no se
revisa, no se revierte y nadie sabe que existe hasta que se rompe.

Lo que el pipeline le pone, y por qué:

| Bandera | Motivo |
|---|---|
| `--set-cloudsql-instances` | sin ella no hay socket `/cloudsql/…` y `pg_dump` no encuentra la base |
| `--service-account=pmo-respaldos@…` | crear y leer en el bucket, nunca borrar |
| `--set-secrets` | `DATABASE_URL` y `ALERT_WEBHOOK_URL`, que no salen de Google Cloud |
| `--max-retries=2`, `--task-timeout=900s` | un volcado que tarda no es un volcado roto |

**No lleva `--no-cpu-throttling`, y no es un olvido:** esa bandera no existe para
los Jobs. El estrangulamiento de CPU es cosa de los **servicios**, atado al ciclo
de vida de la petición; en un Job la CPU está asignada durante toda la tarea, así
que el `pg_dump` no se puede congelar a mitad. Añadirla tumba el despliegue con
`unrecognized arguments`.

**Sí hay que probarlo a mano la primera vez**, que es el paso que este proyecto se
salta siempre:

```bash
gcloud run jobs execute pmo-respaldo-db --project="${PROYECTO}" --region="${REGION}" --wait
gcloud storage ls --long "gs://${BUCKET}"
```

Tiene que aparecer un `.dump` con tamaño razonable y el log terminar en
`Respaldo correcto:`.

## 5. El disparador (dos veces al día)

```bash
export SCHED_SA="pmo-scheduler@${PROYECTO}.iam.gserviceaccount.com"

# La cuenta que ya dispara los otros crones puede ejecutar este job.
gcloud run jobs add-iam-policy-binding "${JOB}" \
  --project="${PROYECTO}" --region="${REGION}" \
  --member="serviceAccount:${SCHED_SA}" \
  --role="roles/run.invoker"

# 03:30 y 15:30 hora de Tulum. La de madrugada es la principal; la de la tarde
# existe para que la alerta de ausencia del §6 tenga margen donde vivir.
#
# ⚠️ El nombre del job dice `-diario` y ya no lo es. Se deja: renombrarlo obliga
# a borrar y recrear, y el nombre está escrito en el IAM, en este README y en la
# documentación de la alerta. Un nombre algo viejo cuesta menos que un disparador
# que desaparece un rato.
gcloud scheduler jobs create http pmo-respaldo-db-diario \
  --project="${PROYECTO}" \
  --location="${REGION}" \
  --schedule="30 3,15 * * *" \
  --time-zone="America/Cancun" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROYECTO}/jobs/${JOB}:run" \
  --http-method=POST \
  --oauth-service-account-email="${SCHED_SA}" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
```

Fuérzalo una vez para comprobar el camino entero:

```bash
gcloud scheduler jobs run pmo-respaldo-db-diario --project="${PROYECTO}" --location="${REGION}"
```

## 6. La vigilancia — quién avisa cuando esto se rompe

**El 2026-08-19 este job estuvo roto 42 minutos y no avisó nadie.** Dos
ejecuciones fallidas (`22:09:45Z` y `22:33:08Z`, o sea 17:09 y 17:33 de Tulum) y
la buena a las `22:52`. Se supo porque había una persona delante mirando.

Y eso pasó **teniendo ya el aviso puesto** en `respaldo.sh`. Ahí está la lección:

> Un vigilante que vive dentro de lo vigilado comparte su suerte.

El primero de los dos fallos fueron los retornos de carro: `bash` murió en la
primera línea del script, cuando la función `avisar` **todavía no existía**. No
hay forma de arreglar eso desde dentro del archivo. Lo mismo vale para una imagen
que no se descarga, un contenedor que no arranca, un `OOM`, un `--task-timeout`
agotado, un secreto que ya no se puede leer — y, sobre todo, para **el día que el
Scheduler no dispare y no haya ni ejecución ni fallo del que avisar**.

Por eso la vigilancia está en **dos capas que no comparten suerte**:

| | Quién es | Qué ve | Qué NO ve |
|---|---|---|---|
| **Dentro** | `avisar`/`fallar` + el `trap` de `respaldo.sh` | **por qué** falló, con el mensaje de la comprobación concreta | nada de lo que ocurre antes de que `bash` lea el script |
| **Fuera** | La política de Cloud Monitoring | **que** falló, siempre, sea cual sea la causa | el motivo: solo dice que la ejecución acabó en rojo |

Ninguna sustituye a la otra: la de dentro dice **por qué**, la de fuera garantiza
que **te enteras**.

### La política

Vive en [`../alert_policy_respaldo.json`](../alert_policy_respaldo.json) y se
despliega desde ahí. La primera vez con `create`; después, `update` con el
mismo archivo, que reemplaza la política entera:

```bash
gcloud beta monitoring policies create \
  --policy-from-file=infra/alert_policy_respaldo.json \
  --project pmo-dashboard-503418
```

Tiene **dos condiciones**, unidas por `OR`, y responden a preguntas distintas:

| Condición | Qué pregunta | Cómo |
|---|---|---|
| **El volcado falló** | ¿hubo ejecución y acabó en rojo? | `result="failed"`, `COMPARISON_GT 0`, `duration: 0s` |
| **No hay volcado correcto desde hace 14 h** | ¿ha dejado de haber respaldos? | `conditionAbsent` sobre `result="succeeded"`, `duration: 50400s` |

La primera salta con que haya **una sola** ejecución fallida, y sin esperar: no
hay umbral que afinar porque no existe «un poco de respaldo fallido». La
segunda está explicada más abajo, porque su número es el que gobierna la
cadencia del Scheduler.

Se mide `completed_execution_count` y **no** `completed_task_attempt_count`, a
propósito: con `--max-retries=2`, el segundo cuenta cada intento y avisaría de
reintentos que acaban bien.

**La primera condición está comprobada contra los hechos, no deducida:** la
serie temporal del 19-08 tiene los dos puntos que mira, `22:20Z` y `22:40Z`. La
política habría sonado a los 11 minutos del apagón en vez de a los 42.

Tres cosas que hay que saber y no se leen en el JSON:

- **`autoClose: 1800s`** (el mínimo que admite la API). Un incidente abierto se
  come los avisos siguientes: los dos fallos del 19-08 iban con 24 minutos de
  diferencia y habrían entrado en el mismo incidente, con **un solo** mensaje.
  Cerrar pronto hace que el fallo del día siguiente vuelva a sonar. Que cada
  fallo cuente su historia es tarea de la capa de dentro, no de esta.
- **⚠️ Del bloque `documentation`, Chat solo enseña `subject`.** Comprobado con
  fuego real el 2026-08-20: la tarjeta usa `subject` como título y **descarta el
  `content` entero** — los comandos de diagnóstico, el orden en que mirarlos y el
  aviso de `PG_MAJOR` contra la versión de Cloud SQL no aparecen, ni siquiera
  desplegando «Mostrar más», que solo añade los *Incident Labels*. El `content`
  sigue sirviendo en la consola de Monitoring y en el canal de correo; en Chat,
  no. Este README decía lo contrario hasta ese día.

  Consecuencia práctica: **quien reciba la tarjeta a las 3 de la mañana no sabe
  qué hacer** — sabe que el respaldo está mal y tiene un botón a la consola. Si
  se quiere que diga algo accionable, tiene que ir en `subject`, que es el único
  campo que viaja.
- **⚠️ El `displayName` de la condición tampoco viaja.** El cuerpo de la tarjeta
  es el texto autogenerado. Lo único que distingue hoy a las dos condiciones es
  la etiqueta `result` de los *Incident Labels* — y en la de ausencia dirá
  **`result = succeeded`**, que de madrugada se lee como lo contrario de lo que
  pasa.
- **`notificationChannels` va en el archivo, y es la línea que más importa.**
  Ver justo aquí debajo.

### ⚠️ Una política sin canal está encendida y muda

Al montar esto se encontró que `alert_policy.json` —la alerta del watcher de
Gmail, viva desde el 2026-08-14— tenía **`notificationChannels` vacío**. Estaba
`enabled: true`, evaluaba, abría incidentes en la consola… y no se lo contaba a
nadie. Seis días.

Se le añadió el canal `Alertas PMO` el 2026-08-20 y el campo está ahora en el
archivo, que es donde se revisa.

**Es el mismo fallo que esta fase venía a cerrar, un piso más arriba**: no un
respaldo que falla en silencio, sino el vigilante del respaldo fallando en
silencio. Un `create` sin el campo sale en verde igual. Después de desplegar
cualquier política, esto es la comprobación, no un extra:

```bash
gcloud beta monitoring policies list --project pmo-dashboard-503418 \
  --format="value(displayName,enabled,notificationChannels)"
```

Una fila con la tercera columna vacía es una alerta que no existe.

### La segunda condición: que el job no llegue a ejecutarse

Una alerta sobre fallos **no puede ver una ejecución que nunca ocurrió**. Si el
Scheduler se pausa, se borra o pierde el `run.invoker`, no hay fallo del que
avisar: solo deja de haber respaldos, calladamente, hasta el día que hagan falta.

Por eso la política lleva una segunda condición, `conditionAbsent` sobre
`result="succeeded"` con `duration: 50400s` (**14 h**).

**Y ese número es el motivo por el que el respaldo corre dos veces al día.** Al
montar esto, con cadencia diaria, la condición no cabía:

```
INVALID_ARGUMENT: condition_absent.duration had an invalid value of "24h":
Durations longer than 23h30m are not supported.
```

23h30m es el techo duro de Cloud Monitoring —de ahí sale el `84600s` de la
política de Gmail, que hasta entonces parecía un número elegido a ojo—. Con un
respaldo diario, cualquier ventana admisible se agota **antes** de la ejecución
siguiente: saltaría todos los días. Y una alerta que miente a diario es peor que
ninguna, porque enseña a ignorar el canal.

La salida no fue tocar la política, fue **tocar la cadencia**. Con dos respaldos
al día los éxitos quedan a 12 h, y ahí sí hay sitio:

| | |
|---|---|
| Cadencia | 12 h (03:30 y 15:30 de Tulum) |
| Ventana de la alerta | 14 h = **una ejecución perdida + 2 h de margen** |
| Techo de la API | 23h30m — sobra sitio, ya no es la restricción |

Se eligieron 14 h y no las 23h30m que caben porque 23h30m significaría «se han
perdido **dos** seguidos» y tardaría casi medio día en decirlo. Con 14 h te
enteras a las dos horas de la primera ausencia, y las 2 h de margen están muy
por encima de lo que puede tardar una ejecución legítima: el peor caso real son
tres intentos de `--task-timeout=900s`, unos 45 minutos.

> **El RPO de 12 h salió de regalo, no fue el objetivo.** Doblar la frecuencia
> se hizo para que el «no se ha ejecutado» fuera vigilable; que la pérdida
> máxima bajara de 24 h a 12 h vino encima. Merece estar escrito porque
> invita al error contrario: **volver a la cadencia diaria para ahorrar dos
> minutos de cómputo apagaría la mitad de la vigilancia**, y el JSON no lo dice.
> Si algún día se toca la cadencia, esta ventana se toca con ella.

### Lo que sigue sin estar comprobado

**Nadie ha visto sonar esta política todavía.** La prueba es barata e inocua
—sube un volcado bueno y lo rechaza en la comprobación de tamaño, así que
ejercita el aviso de dentro y el de fuera sin destruir nada—:

```bash
gcloud run jobs execute pmo-respaldo-db --region us-central1 \
  --update-env-vars="TAMANO_MINIMO=999999999" --async
```

Tarda unos 7 minutos en darse por fallida (`--max-retries=2`) y otros pocos en
que la política evalúe. Después conviene dejar constancia de que sonó.

⚠️ **Hasta que se corra, esto es una suposición bien fundada y no un hecho.** Es
la misma distinción que costó cinco intentos en el simulacro de restauración: la
comprobación automática decía que los volcados estaban bien y no mentía —
simplemente no probaba lo que hacía falta probar.

---

# Restaurar

**Probado el 2026-08-19: 394 filas devueltas** desde un volcado del bucket a una
base vacía (`Email` 172, `Task` 145, `ChatMessage` 35).

⚠️ **Costó cinco intentos, y el hallazgo fue que los cuatro volcados que había
hasta entonces no se podían restaurar** — estaban escritos por un cliente 18
contra un servidor 16. `pg_restore --list` decía que estaban bien y era cierto:
**leer el índice no es devolver los datos**. Las cuatro trampas están en
`CLAUDE_MEMORY.md`.

De ahí la regla que gobierna esta sección: **un respaldo no se audita, se
restaura.** Hay que repetir este simulacro cada vez que cambie la versión de
Cloud SQL o el `PG_MAJOR` del `Dockerfile`, porque son justo los cambios que
producen archivos que parecen correctos y no lo son.

## 👉 El procedimiento vive en [`RESTAURACION.md`](RESTAURACION.md)

Ahí están los comandos exactos, el script y las guardas. **Se ejecuta como Cloud
Run Job, no a mano**, y no es una preferencia de estilo:

- **Desde un portátil ya no se puede.** Desde el 2026-08-18 la instancia no tiene
  redes autorizadas y exige certificado de cliente (`TRUSTED_CLIENT_CERTIFICATE_REQUIRED`),
  así que una conexión directa no entra ni con TLS.
- **La cadena de conexión no sale de Secret Manager**: nadie la copia ni la deja
  en el historial de una terminal.
- **El cliente de Postgres es el mismo que escribió el volcado**, así que si uno
  escribe y el otro no puede leer, el problema es del archivo y no de las
  versiones — que fue exactamente la trampa del 19-08.

⚠️ **Y nada de `--clean` ni `--if-exists`** en un ensayo. Sobre una base recién
creada no hacen falta, y son justo las banderas que convierten un error de
destino en una pérdida irreversible. El script del runbook además **se niega a
arrancar** si el destino no contiene `restore_test`.

El día de la migración a Cloud SQL, este mismo archivo es el vehículo: se
restaura en la instancia nueva y se compara. Por eso el volcado va con
`--no-owner` y `--no-privileges`, para que el usuario del destino dé igual.
