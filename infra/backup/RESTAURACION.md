# Simulacro de restauración

**Un respaldo que nadie ha restaurado no es un respaldo, es una suposición.**

El job de volcado ya comprueba que el archivo es legible (`pg_restore --list`),
pero leer el índice no es devolver los datos: un archivo puede tener índice
válido y romperse a la mitad de la restauración. Esto lo prueba de verdad.

## Por qué se ejecuta dentro de Google Cloud

Desde el 2026-08-18 la instancia **no admite conexiones directas**: sin redes
autorizadas y con `sslMode: TRUSTED_CLIENT_CERTIFICATE_REQUIRED`, ningún portátil
entra, ni siquiera con TLS. Se podría levantar el Auth Proxy a mano, pero
correrlo como Cloud Run Job es mejor por tres motivos:

- **La cadena de conexión no sale de Secret Manager.** Nadie la copia, nadie la
  ve, nadie la deja en el historial de una terminal.
- **El cliente de Postgres es el mismo que produjo el volcado**, así que si uno
  escribe y el otro no puede leer, el problema es del archivo — no de las
  versiones.
- **Es repetible.** Un simulacro que solo se hace a mano se hace una vez y nunca
  más. Este se vuelve a lanzar con un comando después de cada cambio de esquema.

## Las dos guardas

El riesgo aquí no es técnico, es de dedo: **apuntar a la base equivocada**.

1. **El destino tiene que llamarse algo con `restore_test`**, y el script se
   niega a arrancar si no. Ningún error de variable puede acabar en producción.
2. **Nada de `--clean` ni `--if-exists`.** Sobre una base recién creada no hacen
   falta, y son justo las banderas que convierten un error de destino en una
   pérdida irreversible.

Además, la base de prueba **se destruye pase lo que pase** —también si la
restauración falla—, porque una base abandonada en la instancia es basura que
alguien acabará confundiendo con algo real.

---

# La secuencia

```bash
export PROYECTO=pmo-dashboard-503418
export REGION=us-central1
export GAR=us-central1-docker.pkg.dev/${PROYECTO}/pmo
export INSTANCIA=${PROYECTO}:${REGION}:pmo-postgres-db
export SA_MAIL=pmo-respaldos@${PROYECTO}.iam.gserviceaccount.com
```

## 1. Elegir el paciente

```bash
gcloud storage ls --long "gs://pmo-respaldos-db/"
```

Usa **el más reciente**. Al escribir esto era
`gs://pmo-respaldos-db/pmo-2026-08-19T083205Z.dump` (227.573 bytes), el primero
que produjo el cron diario por su cuenta.

## 2. Reconstruir la imagen, que ahora lleva los dos scripts

```bash
gcloud builds submit infra/backup --project="${PROYECTO}" --tag "${GAR}/respaldo-db:v2"
```

> El job de respaldo sigue apuntando a `:v1` y **no se toca en este paso**. Se
> moverá a `:v2` cuando el simulacro haya pasado, no antes: no se cambia la
> herramienta que funciona en la misma maniobra en que se estrena otra.

## 3. Crear el job del simulacro

```bash
gcloud run jobs create pmo-restaurar-test \
  --project="${PROYECTO}" \
  --region="${REGION}" \
  --image="${GAR}/respaldo-db:v2" \
  --service-account="${SA_MAIL}" \
  --set-cloudsql-instances="${INSTANCIA}" \
  --set-secrets="DATABASE_URL=pmo-database-url:latest" \
  --set-env-vars="VOLCADO=gs://pmo-respaldos-db/pmo-2026-08-19T083205Z.dump" \
  --command="/usr/local/bin/restaurar.sh" \
  --max-retries=0 \
  --task-timeout=900s
```

**`--max-retries=0` a propósito**: si el simulacro falla, quiero verlo fallar una
vez y leer el motivo, no que lo intente tres veces y me deje tres registros
iguales.

La cuenta `pmo-respaldos` ya tiene `roles/cloudsql.client` y acceso al secreto,
así que no hay IAM nuevo que conceder. **Sí necesita permiso para crear bases**,
que es cosa del usuario de Postgres de la cadena de conexión, no de IAM: si el
paso 4 falla con `permission denied to create database`, ese es el motivo.

## 4. Ejecutarlo

```bash
gcloud run jobs execute pmo-restaurar-test --project="${PROYECTO}" --region="${REGION}" --wait
```

Termina en verde solo si **restaura sin un solo error y encuentra filas dentro**.
El registro imprime la tabla de filas por tabla y el total. Léelo: que existan
las tablas no prueba nada —un volcado de solo esquema también las crea—; lo que
prueba que el respaldo sirve es que haya **contenido**.

Para ver el detalle:

```bash
gcloud run jobs executions logs read $(gcloud run jobs executions list \
  --job=pmo-restaurar-test --region="${REGION}" --limit=1 --format='value(metadata.name)') \
  --region="${REGION}"
```

## 5. Recoger

```bash
gcloud run jobs delete pmo-restaurar-test --project="${PROYECTO}" --region="${REGION}" --quiet
```

La base `pmo_restore_test` ya se destruyó sola al terminar el job. Compruébalo
igualmente, que es la clase de cosa que se da por hecha:

```bash
gcloud sql databases list --instance=pmo-postgres-db --project="${PROYECTO}"
```

---

# Qué significa cada final

| Resultado | Qué dice |
|---|---|
| `SIMULACRO CORRECTO: … trae N filas` | El respaldo sirve. Anótalo con la fecha y el archivo probado |
| `pg_restore` falla con error | El volcado está incompleto. **Los del bucket son todos del mismo job**: si uno está roto, sospecha de los demás |
| Termina sin error pero con 0 filas | Se restauró el esquema y no los datos. Es el peor final posible y por eso se comprueba: sin esta cuenta, habría pasado por bueno |
| `permission denied to create database` | No es el respaldo: es que el usuario de la conexión no puede crear bases. Se arregla con un `GRANT`, no tocando el volcado |

**Cuándo repetirlo**: después de cada migración de esquema, y una vez al mes sin
motivo. El día que haga falta de verdad no es el día de averiguar si funciona.
