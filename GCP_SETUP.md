# Configuración de Google Cloud Pub/Sub para Webhooks de Gmail

Para que tu PMO Dashboard reciba notificaciones en tiempo real cuando llega un nuevo correo, debemos configurar Google Cloud Pub/Sub. Este servicio actuará como intermediario entre los servidores de Gmail y tu aplicación (API).

Sigue estos pasos cuidadosamente en tu [Consola de Google Cloud](https://console.cloud.google.com/):

## 1. Habilitar la API de Pub/Sub
1. Ve a **APIs & Services** > **Library**.
2. Busca `Cloud Pub/Sub API` y haz clic en **Enable** (Habilitar).

## 2. Crear un Tema (Topic)
1. Ve al menú de navegación principal (las tres líneas) > **Pub/Sub** > **Topics**.
2. Haz clic en **Create Topic**.
3. Ponle un nombre identificativo, por ejemplo: `gmail-webhook-topic`.
4. (Opcional) Desmarca la opción "Add a default subscription", ya que crearemos la nuestra manualmente.
5. Haz clic en **Create**.
6. Copia el nombre del Topic recién creado (suele tener el formato `projects/TU_PROYECTO/topics/gmail-webhook-topic`).
7. Pega este valor en tu archivo `.env` local:
   ```env
   GMAIL_PUBSUB_TOPIC=projects/TU_PROYECTO/topics/gmail-webhook-topic
   ```

## 3. Otorgar Permisos a Gmail
Gmail necesita permiso explícito para publicar mensajes en este Topic recién creado.
1. Haz clic en tu Topic recién creado (`gmail-webhook-topic`) para ver sus detalles.
2. En el panel derecho (o pestaña) llamado **Permissions** (Permisos) o **Info Panel**, haz clic en **Add Principal**.
3. En el campo **New principals**, ingresa EXACTAMENTE la siguiente cuenta de servicio de Google:
   `gmail-api-push@system.gserviceaccount.com`
4. En **Select a role**, elige **Pub/Sub Publisher** (Publicador de Pub/Sub).
5. Haz clic en **Save**.

## 4. Configurar la Suscripción Push (El Webhook)
Para que Google Cloud envíe las notificaciones a nuestra API local, necesitamos un túnel (ngrok) y una suscripción.

### Paso A: Obtener tu URL Pública
Si estás en desarrollo local, levanta ngrok apuntando al puerto de la API:
```bash
ngrok http 3000
```
Obtendrás una URL como `https://abcd-12-34.ngrok.app`.
Tu URL de webhook será: `https://abcd-12-34.ngrok.app/webhooks/gmail`

### Paso B: Validar el Dominio en GCP
Google Cloud requiere verificar que eres dueño del dominio al que envías los push.
1. Ve a **APIs & Services** > **Credentials**.
2. En la pestaña **Domain verification**, haz clic en **Add domain**.
3. Agrega tu dominio ngrok (ej. `https://abcd-12-34.ngrok.app`).
   *(Nota: Ngrok cambia cada vez que lo reinicias en la capa gratuita, por lo que tendrás que re-verificarlo o usar un dominio estático de ngrok/localtunnel).*

### Paso C: Crear la Suscripción
1. Ve de nuevo a **Pub/Sub** > **Subscriptions**.
2. Haz clic en **Create Subscription**.
3. Ponle un nombre, por ejemplo: `gmail-webhook-sub`.
4. En **Select a Cloud Pub/Sub topic**, elige el Topic que creaste en el paso 2 (`gmail-webhook-topic`).
5. En **Delivery type**, selecciona **Push**.
6. En **Endpoint URL**, pega la URL completa de tu webhook (ej. `https://abcd-12-34.ngrok.app/webhooks/gmail`).
7. Deja el resto de opciones por defecto y haz clic en **Create**.

---

## 5. Probar End-to-End
Una vez completados estos pasos, el flujo es el siguiente:
1. Asegúrate de tener el backend corriendo (`npm run dev:api`).
2. El frontend debe llamar silenciosamente a un endpoint que dispare la función `GmailService.watchInbox(userId)`. *(Actualmente esto deberá integrarse al iniciar sesión)*.
3. Envía un correo de prueba a la cuenta de Gmail logueada.
4. Google enviará un POST a tu URL de ngrok.
5. El endpoint `/webhooks/gmail` lo recibe y encola un trabajo en BullMQ.
6. El worker `GmailProcessor` lo consume y llama a `syncHistory`, guardando el correo en PostgreSQL de forma silenciosa.

---

## 6. Fase 4: Cloud Scheduler, Alertas Capa 2 y DLQ

Para asegurar la robustez del sistema en producción, se migraron los trabajos en segundo plano a Cloud Scheduler, se implementó una DLQ para fallos de entrega, y un sistema de alertas proactivo basado en Cloud Monitoring.

### Paso A: Migración a Cloud Scheduler (Crones)
Los procesos recurrentes ahora son invocados por Cloud Scheduler mediante peticiones HTTP firmadas con OIDC.

1. **Crear la Cuenta de Servicio y Asignar Permisos:**
   ```bash
   gcloud iam service-accounts create pmo-scheduler --display-name="Cloud Scheduler Invoker"
   export SCHEDULER_SA="pmo-scheduler@TU_PROYECTO.iam.gserviceaccount.com"
   # La API validará automáticamente los tokens emitidos por esta SA mediante el OIDC_AUDIENCE
   ```
2. **Crear el Job de Barrido de Vencidas (Cada hora):**
   ```bash
   gcloud scheduler jobs create http pmo-cron-overdue \
     --schedule="0 * * * *" \
     --uri="https://TU_API_URL/cron/overdue" \
     --http-method=POST \
     --oidc-service-account-email="${SCHEDULER_SA}" \
     --oidc-token-audience="https://TU_API_URL/cron"
   ```
3. **Crear el Job de Renovación del Watch (Diario):**
   ```bash
   gcloud scheduler jobs create http pmo-cron-gmail-watch \
     --schedule="0 0 * * *" \
     --uri="https://TU_API_URL/cron/gmail-watch" \
     --http-method=POST \
     --oidc-service-account-email="${SCHEDULER_SA}" \
     --oidc-token-audience="https://TU_API_URL/cron"
   ```

### Paso B: Configurar la Dead Letter Queue (DLQ) y Retry Policy
Si la API falla al procesar un webhook, Pub/Sub reintentará la entrega con pausas exponenciales. Si agota los 5 intentos, enviará el mensaje a la DLQ.

1. **Crear Tópico y Suscripción DLQ:**
   ```bash
   gcloud pubsub topics create gmail-ingest-dlq
   gcloud pubsub subscriptions create gmail-ingest-dlq-sub --topic=gmail-ingest-dlq
   ```
2. **Asignar Roles IAM al Agente de Pub/Sub:**
   ```bash
   export PROJECT_NUM="TU_PROJECT_NUMBER"
   gcloud pubsub topics add-iam-policy-binding gmail-ingest-dlq \
     --member="serviceAccount:service-${PROJECT_NUM}@gcp-sa-pubsub.iam.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
     
   gcloud pubsub subscriptions add-iam-policy-binding gmail-ingest-push \
     --member="serviceAccount:service-${PROJECT_NUM}@gcp-sa-pubsub.iam.gserviceaccount.com" \
     --role="roles/pubsub.subscriber"
   ```
3. **Actualizar la suscripción principal (DLQ + Backoff Exponencial):**
   ```bash
   gcloud pubsub subscriptions update gmail-ingest-push \
     --dead-letter-topic=gmail-ingest-dlq \
     --max-delivery-attempts=5 \
     --min-retry-delay=10s \
     --max-retry-delay=600s
   ```

### Paso C: Secreto para el Webhook de Google Chat (Capa 1)
La URL del webhook **es una credencial**: lleva la clave dentro de la propia URL, así que quien la tenga puede escribir en tu espacio. Va a Secret Manager, nunca a una variable en claro.

1. **Crear el secreto:**
   ```bash
   echo -n "URL_DEL_WEBHOOK" | gcloud secrets create ALERT_WEBHOOK_URL --data-file=-
   ```
   > ⚠️ **Pon la URL de verdad ya, no un texto de relleno.** El 2026-08-14 este secreto se creó con el valor `TO_BE_FILLED_BY_USER` y estuvo así tres días: las alertas se generaban, intentaban salir y morían con `Failed to parse URL from TO_BE_FILLED_BY_USER`, y lo único que constaba era una línea en el log. Un sistema de alertas roto no puede avisar de que está roto.

2. **Crear la variable de repositorio en GitHub** — **este paso es obligatorio y es el que se olvidó**:
   ```bash
   gh variable set ALERT_WEBHOOK_SECRET --body "ALERT_WEBHOOK_URL"
   ```
   `deploy.yml` inyecta el secreto **condicionado** a esta variable, que guarda el *nombre* del secreto:
   ```bash
   if [ -n "${{ vars.ALERT_WEBHOOK_SECRET }}" ]; then
     SECRETS="${SECRETS},ALERT_WEBHOOK_URL=${{ vars.ALERT_WEBHOOK_SECRET }}:latest"
   else
     echo "::warning::ALERT_WEBHOOK_SECRET no está definida; la API no podrá enviar alertas."
   fi
   ```
   Va condicionado a propósito —un `--set-secrets` que nombre un secreto inexistente **falla el despliegue entero**, así que fijarlo antes de crear el secreto dejaría la API sin poder desplegarse—. El precio de esa prudencia es que **sin la variable el despliegue sale en verde y la API arranca muda**, avisando solo con un `::warning::` en el run y un `WARNING` al arrancar. Ambos son fáciles de no leer.

3. **Comprobar que llegó al contenedor**, que es lo único que prueba que funciona:
   ```bash
   gcloud run revisions describe $(gcloud run services describe pmo-api \
     --region us-central1 --format 'value(status.traffic[0].revisionName)') \
     --region us-central1 --format 'value(spec.containers[0].env[].name)' | tr ';' '\n' | grep ALERT_WEBHOOK_URL
   ```
   Sin salida, la Capa 1 está desplegada y no puede enviar nada.

### Paso D: Alerta de Cloud Monitoring (Capa 2) por Ausencia
Se configura una alerta para detectar si el *watch* de Gmail deja de enviar notificaciones (ausencia de tráfico).

1. **Crear el Canal de Notificación (Google Chat):**
   > **Nota Importante:** Los canales de tipo `google_chat` deben ser autorizados interactivamente por Google Cloud Monitoring y no admiten datos "dummy".
   - Ve a la consola de Google Cloud > **Monitoring** > **Alerting** > **Edit Notification Channels**.
   - En **Google Chat**, haz clic en **Add New**.
   - Sigue el flujo de autorización para seleccionar tu Espacio de Chat.
   - Anota el ID generado (puedes verlo ejecutando `gcloud beta monitoring channels list`). Ej: `projects/.../notificationChannels/1234567`.

2. **La política vive en el repositorio**: [`infra/alert_policy.json`](infra/alert_policy.json). Es el archivo con el que se creó la política que está aplicada hoy, no una copia de ejemplo — antes este manual llevaba el JSON transcrito aquí dentro y había además un `alert_policy_v2.json` suelto en la raíz, así que la misma política existía en tres sitios y ninguno era el bueno. Se edita ahí y se despliega desde ahí.

   Lo que hay que entender de ella, que es lo que no se ve leyendo el JSON:
   - **Vigila la ausencia, no el error** (`conditionAbsent`). Es lo único que detecta el fallo que motivó la fase: cuando el `watch` de Gmail caduca, los push **dejan de llegar** y no se registra ni una línea de ninguna severidad. Una alerta por `severity>=ERROR` no lo vería nunca.
   - Mide `push_request_count` de la suscripción `gmail-ingest-push`, es decir **las invocaciones que Pub/Sub hace al webhook**: la señal que se apaga.
   - `duration: 84600s` son **23,5 h**. El buzón recibe correo a diario, así que un día entero sin una sola invocación es una avería, no una racha tranquila. Si algún día el volumen baja, este número es lo primero que hay que revisar para no llenarlo de falsos avisos.

3. **Desplegar la Política:**
   ```bash
   gcloud beta monitoring policies create --policy-from-file=infra/alert_policy.json
   ```
   Sustituye antes el ID del canal por el tuyo si estás levantando el proyecto de cero.

4. **Comprobar que la política tiene canal.** No es opcional y no es un extra:

   ```bash
   gcloud beta monitoring policies list --project pmo-dashboard-503418 \
     --format="value(displayName,enabled,notificationChannels)"
   ```

   > ⚠️ **Una política sin canal está encendida y muda.** El 2026-08-20 se
   > descubrió que esta misma política del watcher llevaba desde el 14-08 con
   > `notificationChannels` **vacío**: `enabled: true`, evaluando, abriendo
   > incidentes en la consola y sin contárselo a nadie. Seis días. El `create`
   > sale en verde igual, y el campo faltaba en el archivo, así que releerlo
   > tampoco lo delataba. Ya está puesto en `infra/alert_policy.json`.
   >
   > Una fila con la tercera columna vacía es una alerta que no existe.

### Paso E: Alerta de Cloud Monitoring (Capa 2) por Fallo del Respaldo

La política vive en [`infra/alert_policy_respaldo.json`](infra/alert_policy_respaldo.json)
y vigila el Cloud Run Job `pmo-respaldo-db`.

```bash
gcloud beta monitoring policies create \
  --policy-from-file=infra/alert_policy_respaldo.json \
  --project pmo-dashboard-503418
```

Lleva **dos condiciones** unidas por `OR`, porque hacen preguntas distintas:

- **El volcado falló** — `completed_execution_count` con `result="failed"`,
  umbral > 0 y `duration: 0s`. Salta con una sola ejecución en rojo.
- **No hay volcado correcto desde hace 14 h** — `conditionAbsent` sobre
  `result="succeeded"`, `duration: 50400s`. Es la única que puede ver que el job
  **no llegue a ejecutarse**, y la que obliga a que el respaldo corra **dos veces
  al día**: con cadencia diaria no cabía bajo el techo de 23h30m y habría
  saltado a diario. **Si alguien vuelve a tocar la cadencia del Scheduler, este
  número se toca con ella.**

La razón de que todo esto exista fuera del script —habiendo ya un aviso dentro de
`respaldo.sh`— está contada entera en
[`infra/backup/README.md`](infra/backup/README.md#6-la-vigilancia--quién-avisa-cuando-esto-se-rompe).
