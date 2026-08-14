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

### Paso B: Secreto para el Webhook de Google Chat
Crea el secreto en Secret Manager para almacenar la URL del Webhook de alertas (Capa 1 y Capa 2):
```bash
echo "URL_DEL_WEBHOOK" | gcloud secrets create ALERT_WEBHOOK_URL --data-file=-
```

### Paso D: Alerta de Cloud Monitoring (Capa 2) por Ausencia
Se configura una alerta para detectar si el *watch* de Gmail deja de enviar notificaciones (ausencia de tráfico).

1. **Crear el Canal de Notificación (Google Chat):**
   > **Nota Importante:** Los canales de tipo `google_chat` deben ser autorizados interactivamente por Google Cloud Monitoring y no admiten datos "dummy".
   - Ve a la consola de Google Cloud > **Monitoring** > **Alerting** > **Edit Notification Channels**.
   - En **Google Chat**, haz clic en **Add New**.
   - Sigue el flujo de autorización para seleccionar tu Espacio de Chat.
   - Anota el ID generado (puedes verlo ejecutando `gcloud beta monitoring channels list`). Ej: `projects/.../notificationChannels/1234567`.

2. **Crear la Política de Ausencia (JSON):**
   Crea un archivo `alert_policy.json` (asegúrate de incluir el ID del canal nativo en `notificationChannels`):
   ```json
   {
     "displayName": "[Capa 2] Fallo Critico: Apagon del Watcher de Gmail",
     "combiner": "OR",
     "conditions": [
       {
         "displayName": "Invocaciones al webhook caen a 0",
         "conditionAbsent": {
           "filter": "metric.type=\"pubsub.googleapis.com/subscription/push_request_count\" AND resource.type=\"pubsub_subscription\" AND resource.labels.subscription_id=\"gmail-ingest-push\"",
           "duration": "84600s",
           "aggregations": [
             {
               "alignmentPeriod": "300s",
               "perSeriesAligner": "ALIGN_RATE"
             }
           ]
         }
       }
     ],
     "notificationChannels": [
       "projects/TU_PROYECTO/notificationChannels/TU_CHANNEL_ID"
     ]
   }
   ```

3. **Desplegar la Política:**
   ```bash
   gcloud beta monitoring policies create --policy-from-file=alert_policy.json
   ```
