# Respaldo diario de la base de datos

**Paso 1 del plan de migración**, y deliberadamente independiente de él: esto
tiene valor aunque la migración a Cloud SQL no llegue nunca.

## Por qué existe

Neon en plan gratuito conserva **6 horas** de historial. El tablero es el sistema
de registro de las tareas y los fichajes, y **eso no existe en ningún otro
sitio**: los correos están en Gmail, las tareas no están en ninguna parte. Hoy
estamos a un accidente de perder el histórico entero.

**Lo que esto NO arregla**: los `P1001` (`Can't reach database server`). Son 22
apariciones en 7 días, unos 10 incidentes, y vienen de que Neon se suspende sin
tráfico. Eso lo resuelve Cloud SQL, que no se duerme — no un volcado. Conviene
tenerlo escrito para que nadie dé el problema por cerrado con esto.

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
de ahí a Neon. No se registra, no se imprime y no viaja como argumento.

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
- El primer volcado despierta a Neon, así que tarda unos segundos más.

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

## 0. La versión del servidor — ✅ resuelto el 2026-08-18

**Neon corre Postgres 18** (consola del proyecto `pmo-db` → *Project settings* →
*Postgres version*), y `PG_MAJOR` ya está puesto en 18 en el `Dockerfile`.
Estaba en 17, que habría reventado la primera ejecución con
`server version mismatch`: el cliente no puede ser más viejo que el servidor.

**No hay nada que hacer aquí ahora**, pero sí más adelante: este número **hay que
subirlo cada vez que Neon o Cloud SQL actualicen**, y nada avisa. El error no
aparece al construir la imagen, sino la primera vez que el job se ejecuta — con
todo lo demás correcto. Si alguna vez el job falla de golpe sin haber tocado
nada, mira esto primero:

```bash
# La versión real, desde cualquier sitio que tenga la cadena de conexión
psql "$DATABASE_URL" -tAc 'SHOW server_version'
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

## 3. Construir y publicar la imagen

Desde la raíz del repositorio:

```bash
gcloud builds submit infra/backup \
  --project="${PROYECTO}" \
  --tag "${GAR}/respaldo-db:v1"
```

## 4. El Cloud Run Job

```bash
gcloud run jobs create "${JOB}" \
  --project="${PROYECTO}" \
  --region="${REGION}" \
  --image="${GAR}/respaldo-db:v1" \
  --service-account="${SA_MAIL}" \
  --set-env-vars="BUCKET_RESPALDOS=${BUCKET}" \
  --set-secrets="DATABASE_URL=pmo-database-url:latest,ALERT_WEBHOOK_URL=ALERT_WEBHOOK_URL:latest" \
  --max-retries=2 \
  --task-timeout=900s
```

**Pruébalo a mano antes de programarlo**, que es el paso que este proyecto se
salta siempre:

```bash
gcloud run jobs execute "${JOB}" --project="${PROYECTO}" --region="${REGION}" --wait
gcloud storage ls --long "gs://${BUCKET}"
```

Tiene que aparecer un `.dump` con tamaño razonable y el log debe terminar en
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
