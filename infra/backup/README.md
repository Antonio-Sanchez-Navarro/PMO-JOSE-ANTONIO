# Respaldo diario de la base de datos

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

Un **Cloud Run Job** que corre una vez al día, disparado por Cloud Scheduler:

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

- **Una copia al día significa hasta 24 h de pérdida** en el peor caso. Pasamos
  de «6 h de historial» a «hasta 24 h de trabajo perdido, pero recuperable». Si
  eso es demasiado, se duplica la frecuencia cambiando una línea del Scheduler.
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

**Cloud SQL corre `POSTGRES_16`** (`gcloud sql instances describe pmo-postgres-db`),
y `PG_MAJOR` está puesto en 16 en el `Dockerfile`. No hay nada que hacer aquí.

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

## 5. El disparador diario

```bash
export SCHED_SA="pmo-scheduler@${PROYECTO}.iam.gserviceaccount.com"

# La cuenta que ya dispara los otros crones puede ejecutar este job.
gcloud run jobs add-iam-policy-binding "${JOB}" \
  --project="${PROYECTO}" --region="${REGION}" \
  --member="serviceAccount:${SCHED_SA}" \
  --role="roles/run.invoker"

# 03:30 hora de Tulum, cuando no hay nadie trabajando.
gcloud scheduler jobs create http pmo-respaldo-db-diario \
  --project="${PROYECTO}" \
  --location="${REGION}" \
  --schedule="30 3 * * *" \
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

---

# Restaurar

**Esto hay que probarlo una vez, ahora, no el día que haga falta.** Un respaldo
sin una restauración probada es una suposición.

```bash
# Bajar el volcado más reciente
gcloud storage ls "gs://${BUCKET}" | tail -1
gcloud storage cp "gs://${BUCKET}/pmo-XXXX.dump" ./restauracion.dump

# Ver qué hay dentro sin tocar nada
pg_restore --list ./restauracion.dump | head -40

# Restaurar sobre una base VACÍA (nunca sobre producción para practicar)
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="postgresql://.../base_de_pruebas" ./restauracion.dump
```

El día de la migración a Cloud SQL, este mismo archivo es el vehículo: se
restaura en la instancia nueva y se compara. Por eso el volcado va con
`--no-owner` y `--no-privileges`, para que el usuario del destino dé igual.
