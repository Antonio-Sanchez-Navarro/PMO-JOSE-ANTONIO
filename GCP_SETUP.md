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
