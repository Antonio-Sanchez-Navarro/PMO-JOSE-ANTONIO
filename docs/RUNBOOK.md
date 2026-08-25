# PMO Dashboard — Runbook de Operaciones e Incidentes

Este documento describe la operativa básica y la resolución de incidentes para el entorno de producción de **PMO Dashboard**.

## 1. Arquitectura y Entorno

- **Frontend**: Alojado en Vercel (`pmo-frontend.vercel.app`). El despliegue lo maneja la integración nativa de Vercel escuchando la rama `master`.
- **Backend API**: Alojada en Google Cloud Run (`pmo-api`, región `us-central1`, proyecto `pmo-dashboard-503418`). Despliegue gestionado por GitHub Actions (`deploy.yml`).
- **Base de Datos**: PostgreSQL alojado en **Neon**. Se accede desde Google Cloud vía **Cloud SQL Auth Proxy** (`pmo-postgres-db`).
- **Caché y Colas**: Redis alojado en **Upstash**.
- **Ingesta de Correo**: Google Pub/Sub envía webhooks a `/webhooks/gmail` cuando llegan nuevos correos.
- **Alertas**: Se envían mediante webhook hacia un espacio de Google Chat.

## 2. Acceso a los Servicios

### Base de Datos (Producción)
La conexión a producción está protegida y se enruta por el Cloud SQL Auth Proxy para no exponer la instancia de base de datos a internet de forma insegura.
Para conectarte desde tu máquina local (si tienes los permisos de IAM correspondientes):
```bash
./cloud-sql-proxy.exe pmo-dashboard-503418:us-central1:pmo-postgres-db --port 5432
```
Una vez abierto el proxy, puedes usar `psql` o Prisma Studio apuntando a `localhost:5432`.

### Ver Logs (Cloud Logging)
La API envía los logs en JSON estructurado a Cloud Logging. No hay SDK de telemetría extra. Para leer los logs en vivo de producción:
```bash
gcloud beta run services logs tail pmo-api --project pmo-dashboard-503418 --region us-central1
```

## 3. Resolución de Incidentes Comunes

### 3.1. Alerta: "La ingesta de Gmail dejó de funcionar" (Capa 2)
**Síntoma**: La política de Cloud Monitoring detecta 0 peticiones en el webhook de Gmail por más de 23.5 horas.
**Causa probable**: El token de `users.watch` caducó (dura 7 días) o fue revocado por un error (p. ej. si se renueva sin llamar a `stop` primero).
**Solución**:
Renovar el watch manualmente ejecutando el endpoint (protegido por OIDC):
```bash
curl -X POST https://pmo-api-mlpuuasqka-uc.a.run.app/cron/gmail-watch \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=https://pmo-api-mlpuuasqka-uc.a.run.app)"
```
Revisar los logs para confirmar que devolvió 200 y registró el historial.

### 3.2. Alerta: "Fallo en el respaldo de Base de Datos" (Capa 1/2)
**Síntoma**: Notificación en Google Chat de que la ejecución `pmo-respaldo-db` falló.
**Causa probable**: Límite de tamaño (`TAMANO_MINIMO`), credenciales caducadas, o error al montar el proxy de Cloud SQL.
**Solución**:
1. Inspeccionar el log del job fallido:
   ```bash
   gcloud run jobs executions list --job=pmo-respaldo-db --region us-central1
   gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="pmo-respaldo-db"' --limit 50
   ```
2. Corregir el script si es un fallo de lógica (cuidado con los retornos de carro CRLF).
3. Si el respaldo es irrecuperable y se necesita restaurar un día previo, seguir estrictamente el manual en `infra/backup/RESTAURACION.md`.

### 3.3. Errores 500 intermitentes
**Síntoma**: Alertas de Capa 1 informando de excepciones capturadas por el filtro global.
**Causa probable**: Prisma desconectándose de Neon (Serverless cold starts).
**Solución**: 
- Verificar que el `transaction_timeout` es holgado (Neon tarda ~5.3s en despertar). Ya está configurado a 15s en PrismaService.
- Si persiste, revisar la cuota en Neon y Upstash (Redis).

## 4. Despliegues de Emergencia

Si un despliegue de la API rompe producción, se puede revertir el tráfico instantáneamente a la revisión anterior desde Google Cloud Run:
```bash
gcloud run services update-traffic pmo-api --to-revisions=REVISION_ANTERIOR=100
```
(Puedes listar las revisiones con `gcloud run revisions list --service pmo-api`).

Para el frontend, entra al panel de Vercel, selecciona el despliegue funcional anterior y dale a **"Promote to Production"**.
