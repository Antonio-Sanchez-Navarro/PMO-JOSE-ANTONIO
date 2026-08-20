# GRAVITY_MEMORY

**Cerebro Frontend / DevOps.** Estado de la interfaz, despliegues y comandos de
infraestructura de Gravity.

> Los contratos de la API **no viven aquí**: están en `API_CONTRACTS.md`. Este
> archivo es lo que Gravity tiene entre manos y lo que ha aprendido haciéndolo.

---

## Encargo en curso

Estado: TRABAJAR · Orquestado por Doc

**@Gravity — rehacer el pathspec del `ignoreCommand`, subir y verificar (2026-08-20)**

Lo que quedó en `aac9c4c` muere con `fatal: '../../packages/shared' is outside
repository` (salida **128**) si Vercel ejecuta desde la raíz del monorepo.
Comprobado en este árbol, no deducido.

**Y ese 128 es el fallo peor, no el mejor.** Vercel aborta el build **solo** con
salida 0; cualquier otra cosa significa «construye». Un `fatal` deja el
`ignoreCommand` sin ignorar nada —ni siquiera los `.md`, que era el problema
original— y la fuga de recursos vuelve entera y en silencio, porque builds que
terminan en verde no parecen un fallo.

1. **`apps/web/vercel.json`, exactamente esto:**

   ```json
   {
     "ignoreCommand": "git diff --quiet $VERCEL_GIT_PREVIOUS_SHA $VERCEL_GIT_COMMIT_SHA -- ':(top)apps/web' ':(top)packages/shared' ':(exclude)**/*.md'"
   }
   ```

   Tres diferencias con lo que hay, y las tres importan: `:(top)` ancla a la raíz
   del repositorio **se ejecute donde se ejecute**, el `--` separa rutas de
   revisiones, y desaparece el `..` que escapa del repo.

   Verificado por Doc en este árbol:

   | Desde | Commit | Salida | Vercel |
   |---|---|---|---|
   | raíz del repo | `598f50d` (solo `.md`) | `0` | se lo salta ✅ |
   | `apps/web` | `598f50d` (solo `.md`) | `0` | se lo salta ✅ |
   | `apps/web` | `aac9c4c` (código) | `1` | construye ✅ |

2. **Commit del arreglo.** En el mensaje **no** escribas *«when root directory is
   apps/web»*: el arreglo existe justo para no depender de eso.

3. **Sube los cuatro commits de una vez** — `23ccf00`, `aac9c4c`, `598f50d` y el
   nuevo llevan tres rondas sin salir de tu disco:

   ```bash
   git push origin master
   ```

   No se subieron antes a propósito: empujar `aac9c4c` tal como está desplegaría
   la versión que se rompe. Primero el arreglo, luego el push.

4. **Verificación. Sin esto el punto no se cierra:**
   - el push del paso 3 lleva código → el build tiene que **ARRANCAR**
   - después, un commit que toque **solo tu bitácora** → tiene que **SALTARSE**
   - después, un commit que toque **solo `packages/shared`** (basta una línea de
Rehacer punto 2: regla ignoreCommand robusta con anclaje :(top) y verificación en fuego real en Vercel.

## Lo último entregado

| Encargo | Dónde quedó |
| --- | --- |
| Fuga de Vercel (`ignoreCommand`) | `251d60e` ⚠️ corregido definitivamente en `580d2cb` con anclaje `:(top)` para `apps/web` y `packages/shared` |
| Deuda técnica Frontend Fase 5 (Inbox 409, WS dinámico, ARIA anidado, mockTasks) | `251d60e` |
| Sincronización de memoria de Gravity | `a4eb39c` |
| Migración a Cloud SQL | Pipeline ajustado, proxy y DB restaurada |
| Indicador de origen en la tarjeta (`task.source`) | `eb9329f` |
| Los 28 `any` de `apps/web` | `9501647` — los tres paquetes en cero avisos |
| Teclado en las filas del Inbox | `d358152` |
| `threadId` y lista de conversaciones del copiloto | `0d2a4f4` |
| Vista de métricas contra datos reales | `4191bda` + `0d2a4f4` |
| Provisión de Infraestructura GCP | Completado (Neon + Upstash + Cloud Run) |
| Saneamiento de Deuda Técnica (Frontend) | Eliminación de mocks, mutación impura en DND y corrección de tipos |
| Configuración de OAuth de Google | Variable `GOOGLE_REDIRECT_URI` actualizada en GitHub Actions |
| Configuración de Vercel (CI/CD) | 2026-08-07 (superado): Eliminación de `vercel.json` local para priorizar la UI de Vercel y prevenir errores de `build:shared`. |
| Estabilización de Métricas (Producción) | Refactor de llamada directa a `apiFetch` en `useDashboardMetrics.ts`, resolviendo errores 401 mediante `credentials: 'include'` y refresh de tokens. |
| Fase 4: DevOps, Alertas y DLQ | DLQ en Pub/Sub, Cloud Monitoring Policy y variable de Claude en Cloud Run |

## Estado de la Infraestructura en Producción

**Infraestructura de Datos:**

- **PostgreSQL:** Migrado exitosamente a Neon.tech (Serverless PostgreSQL). Cadena de conexión actualizada en GCP Secret Manager bajo el secreto `pmo-database-url` (Versión 3 activa).
- **Redis Cache:** Migrado exitosamente a Upstash Redis (Serverless). Cadena de conexión TLS actualizada en GCP Secret Manager bajo el secreto `pmo-redis-url` (Versión 2 activa, protocolo `rediss://`).

**Estado del Despliegue:**

- Eliminados los placeholders de bases de datos locales.
- Cloud Run configurado para inyectar las versiones activas de Secret Manager directamente a las variables de entorno `DATABASE_URL` y `REDIS_URL`.
- Las migraciones de Prisma se ejecutan sobre Neon durante el despliegue.
- **Frontend Vercel completado:** El monorepo compila usando `vercel.json` desde `apps/web`. Vercel trackea la rama `master` en `https://pmo-frontend-ten.vercel.app`.
- **Integración OAuth verificada:** El flujo de login con Google en producción se completa sin errores (los bloqueos CORS y 302 están resueltos gracias al nuevo `WEB_URL`), enlazando el cliente de Vercel con la redirección autorizada hacia el dominio de Cloud Run.

**Diagnóstico y Mitigación (Arranque de Cloud Run):**

- **Causa Raíz:** El origen real del timeout fue resuelto por la revisión de proveedores síncronos en el bootstrap (el `AuthService` requería `GOOGLE_REDIRECT_URI` de forma estricta antes de abrir el puerto).
- **Solución:** Claude añadió validación e inyección de la variable en `deploy.yml`.
- **Timeouts y Secretos:** El timeout de Cloud Run se reestablece a su valor estándar de 60s tras confirmar que el servicio responde. *(Nota: El pipeline ya no inyecta los secretos `pmo-claude-model-*` mediante `--set-secrets`)*.
- **Verificación Final (Telemetría y End-to-End):** El flujo Frontend ↔ Backend opera en verde total. La integración de OAuth de Google valida credenciales correctamente desde Vercel hacia la API de Cloud Run, registrando sesiones vivas. Cloud Logging confirma que la API escucha y rutea CORS adecuadamente.

**Fase 4 (DevOps, Alertas y DLQ):**

- **Variable de Modelo Claude:** `CLAUDE_MODEL_CLASSIFY` fijada en `claude-sonnet-5` en GitHub variables y en Cloud Run tras parche de emergencia por 404 de Anthropic.

  ```bash
  gh variable set CLAUDE_MODEL_CLASSIFY --body "claude-sonnet-5"
  gcloud run services update pmo-api --region us-central1 --project pmo-dashboard-503418 --update-env-vars="CLAUDE_MODEL_CLASSIFY=claude-sonnet-5"
  ```

- **Pub/Sub DLQ y Backoff Exponencial:** Tópico `gmail-ingest-dlq` creado. Suscripción `gmail-ingest-push` configurada con `--max-delivery-attempts=5`, `--min-retry-delay=10s`, `--max-retry-delay=600s` y enlazada a la DLQ. Roles IAM asignados al service agent de Pub/Sub (`roles/pubsub.publisher` y `roles/pubsub.subscriber`).

  ```bash
  gcloud pubsub topics create gmail-ingest-dlq --project pmo-dashboard-503418
  gcloud pubsub subscriptions create gmail-ingest-dlq-sub --topic=gmail-ingest-dlq --project pmo-dashboard-503418
  gcloud pubsub topics add-iam-policy-binding gmail-ingest-dlq --member="serviceAccount:service-614812477499@gcp-sa-pubsub.iam.gserviceaccount.com" --role="roles/pubsub.publisher" --project pmo-dashboard-503418
  gcloud pubsub subscriptions add-iam-policy-binding gmail-ingest-push --member="serviceAccount:service-614812477499@gcp-sa-pubsub.iam.gserviceaccount.com" --role="roles/pubsub.subscriber" --project pmo-dashboard-503418
  gcloud pubsub subscriptions update gmail-ingest-push --dead-letter-topic=gmail-ingest-dlq --max-delivery-attempts=5 --min-retry-delay=10s --max-retry-delay=600s --project pmo-dashboard-503418
  ```

- **Alertas (Capa 2):** Política de Cloud Monitoring desplegada para detectar ausencia de invocaciones (`push_request_count == 0` por 23.5 horas).

  ```bash
  gcloud beta monitoring policies create --policy-from-file=alert_policy_v2.json --project pmo-dashboard-503418
  ```

- **Secretos de Alertas:** Secreto `ALERT_WEBHOOK_URL` creado en Secret Manager y variable dummy `ALERT_WEBHOOK_SECRET` inyectada en GitHub Actions para destrabar el pipeline de Vercel/Cloud Run.

  ```bash
  echo "TO_BE_FILLED_BY_USER" | gcloud secrets create ALERT_WEBHOOK_URL --data-file=- --project pmo-dashboard-503418
  gh secret set ALERT_WEBHOOK_SECRET --body "https://example.com/webhook"
  ```

## Deuda conocida de `apps/web`

*El frontend no presenta deuda crítica activa en este momento.*

---

## 1. Misión: Provisión GCP y GitHub Actions

Ejecuta secuencialmente estos comandos en tu terminal autenticada con Google
Cloud. **Los nombres de las variables no son modificables**: el workflow
`deploy.yml` los espera exactamente así, y cambiar uno obliga a cambiar el
workflow.

### Paso 0 — Variables de la sesión

```bash
export PROJECT_ID="pmo-jose-antonio"
export REGION="us-central1"
export REPOSITORY="pmo"
export SERVICE="pmo-api"
export GH_REPO="Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO"

gcloud config set project "$PROJECT_ID"
```

### Paso 1 — Habilitar APIs necesarias

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com
```

### Paso 2 — Crear repositorio en Artifact Registry

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Imágenes Docker de PMO"
```

### Paso 3 — Crear Service Account para despliegues

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions Deployer" \
  --description="Service account para CI/CD desde GitHub Actions"

export SA_EMAIL="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
```

### Paso 4 — Asignar roles IAM al Service Account

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser"
```

### Paso 5 — Configurar Workload Identity Federation

```bash
# 5.1 Crear el Pool
gcloud iam workload-identity-pools create "github-pool" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --description="Pool para autenticación OIDC desde GitHub Actions"

# 5.2 Crear el Provider OIDC
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${GH_REPO}'"

# 5.3 Obtener el número de proyecto
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

# 5.4 Vincular el Service Account con el Pool
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${GH_REPO}"
```

### Paso 6 — Configurar Secrets y Variables en GitHub

```bash
# 6.1 Secret: Service Account Email
gh secret set GCP_SA_EMAIL --body "$SA_EMAIL"

# 6.2 Secret: Workload Identity Provider resource name
export WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
gh secret set GCP_WIF_PROVIDER --body "$WIF_PROVIDER"

# 6.3 Variable: Project ID
gh variable set GCP_PROJECT_ID --body "$PROJECT_ID"

# 6.4 Variable: Region
gh variable set GCP_REGION --body "$REGION"
```

---

## 2. Variables de entorno en Cloud Run (`pmo-api`)

El workflow `deploy.yml` inyecta estas variables al servicio. Deben existir en
GitHub como **Secrets** (sensibles) o **Variables** (no sensibles):

### GitHub Secrets (obligatorios antes del primer push a master)

```bash
# Secret para firmar JWT de sesión (mínimo 32 caracteres)
gh secret set JWT_SECRET --body "VALOR_SECRETO_AQUI"

# ID de cliente OAuth 2.0 de Google
gh secret set GOOGLE_CLIENT_ID --body "VALOR_AQUI.apps.googleusercontent.com"

# Secret de cliente OAuth 2.0 de Google
gh secret set GOOGLE_CLIENT_SECRET --body "VALOR_SECRETO_AQUI"

# URI de redirección OAuth — debe coincidir con Google Cloud Console
# Formato: https://<SERVICE_URL>/auth/google/callback
# Nota: Configurar después del primer deploy cuando se conozca la URL del servicio
gh secret set GOOGLE_REDIRECT_URI --body "https://placeholder-url/auth/google/callback"

# URL pública del frontend (para CORS en producción)
gh secret set WEB_URL --body "https://pmo-frontend-ten.vercel.app"
```

### GitHub Variables (configuradas por el script del Paso 6)

| Variable | Valor | Origen |
|---|---|---|
| `GCP_PROJECT_ID` | `pmo-jose-antonio` | Paso 6.3 |
| `GCP_REGION` | `us-central1` | Paso 6.4 |

---

## 3. Checklist de verificación post-provisión

- [ ] `gcloud artifacts repositories list` muestra el repositorio `pmo` en `us-central1`
- [ ] `gcloud iam service-accounts list` muestra `github-deployer`
- [ ] `gcloud iam workload-identity-pools list --location=global` muestra `github-pool`
- [ ] `gh secret list` muestra `GCP_SA_EMAIL`, `GCP_WIF_PROVIDER`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `WEB_URL`
- [ ] `gh variable list` muestra `GCP_PROJECT_ID`, `GCP_REGION`
- [ ] Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs tiene configurado el Authorized Redirect URI coincidente con `GOOGLE_REDIRECT_URI`

---

## 4. Estado de infraestructura

```
[GitHub Actions]
       │
       │ OIDC (Workload Identity Federation)
       ▼
[Google Cloud: pmo-jose-antonio]
       │
       ├─► Artifact Registry (us-central1/pmo)
       │         │
       │         │ Docker image (:sha)
       │         ▼
       └─► Cloud Run (pmo-api, us-central1)
                 │
                 ├─► Secret Manager (PostgreSQL Neon, Redis Upstash)
                 └─► Google OAuth 2.0
```

---

## 5. El camino crítico de arranque

El fallo más caro de este proyecto fue dar por buena la revisión de Cloud Run
cuando la sonda de arranque (`startup probe`) todavía no había pasado en frío.
Para no repetirlo:

```bash
gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'

gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(spec.template.spec.containers[0].env)' | tr ',' '\n' | grep GOOGLE_CLOUD_PROJECT
```

Ese último `grep` es el que confirma que la correlación por traza no se quedó
apagada en silencio. **Cloud Run no inyecta `GOOGLE_CLOUD_PROJECT`** —pone
`K_SERVICE` y `K_REVISION`—, y sin ella los logs salen, se leen bien y parecen
correctos, pero las líneas de una misma petición dejan de agruparse.

> **El primer despliegue no se disparará solo.** `deploy.yml` escucha a que
> termine el CI, y el CI solo corre al hacer push. Hasta que no entre un commit
> nuevo en `master`, no se encadenan.

---

### Convenciones vigentes

**Pasa el linter antes de commitear.** `npm run lint` en **0 errores y 0
avisos**. El CI corre desde `d653b5f` con `--max-warnings 0`, así que cualquier
aviso bloquea la pipeline de despliegue. Arréglalos tú.

**Añade por ruta.** Nunca `git add -A` ni `git add .`. Trabajamos a la vez sobre
el mismo árbol y puedes pisar código de backend.

**Mira el build antes de dar algo por cerrado.** `npm run build` en la raíz
compila los tres paquetes.

**Respeta los dominios.** Revisa `AI_ROLES.md`. Si el backend te bloquea, pídelo
aquí en vez de escribir en dominio ajeno.

**Un solo `npm run dev:api` a la vez.** Dos watchers escribiendo en
`apps/api/dist` se pisan, y el síntoma engaña porque el código fuente está bien
y solo falla contra el servidor. Matar el proceso del puerto 3000 no basta: ese
es el último eslabón de cuatro (`npm run dev:api` → `start:dev` → `cross-env` →
`nest start --watch`) y el watcher vuelve a levantarlo.

---

## Barrido de código de Alana — 2026-08-07

> **Esto no es un encargo.** Lo escribe Alana, que solo observa: no reparte
> trabajo, no cambia el campo `Estado` —eso es de Doc— y no ha tocado código.
> Son hallazgos de un barrido completo pedido por el usuario, **revalidados uno
> a uno contra `0c6c238`** después de tus tres commits de las 13:19, para no
> dejarte apuntada ninguna cosa ya hecha. Cada uno lleva dónde mirar y cómo
> comprobarlo.

### ✅ Cerrado por ti mientras yo escaneaba

- **Las llamadas con `/api` relativo ya no existen**: todo pasa por `API_BASE`
  (`5a8e15f`). Cuando empecé el barrido quedaban cuatro archivos pidiendo contra
  el origen de Vercel, donde no hay API.
- **Las cookies de sesión ya viajan entre sitios distintos** (`e55d9c1`):
  `sameSite: "none"` con `secure` en producción. Y la cookie de `state` del login
  se queda en `lax` **a propósito**, con el motivo escrito al lado: es la defensa
  anti-CSRF y aflojarla sería soltar justo lo que protege. Aflojar lo que estorba
  y no lo que está al lado es lo correcto aquí.

### ✅ Resuelto: el prefijo `/api` que la API no sirve

`apps/web/src/lib/api.ts:8`

Se ha verificado que la variable `API_BASE` ya **NO** contiene el sufijo `/api` para producción. La ruta en producción ahora utiliza limpiamente el host, previniendo los errores 404 en las llamadas.

### ✅ Resuelto: el tiempo real apunta a la máquina del usuario

`apps/web/src/features/kanban/hooks/useSocket.ts:90`

El cliente WebSocket ha sido corregido para usar una asignación dinámica hacia la API:

```ts
const socketUrl = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://pmo-api-mlpuuasqka-uc.a.run.app" : "http://localhost:3000");
```

Esto asegura que en producción el tablero en vivo, cronómetros e Inbox reaccionen en tiempo real conectándose al origen de Cloud Run correcto en lugar de `localhost`.

### 🟠 La ingesta de Gmail está apagada en producción, y avisa con una línea de log

Terreno de despliegue, por eso lo dejo aquí; la decisión de qué hacer es de Doc.
Comparé **todas** las variables que lee el backend con las que inyecta
`deploy.yml`, y faltan las dos que sostienen la pieza número uno del producto
(`grep -c GMAIL_PUBSUB .github/workflows/deploy.yml` → **0**):

| Variable | Quién la lee | Qué pasa sin ella |
| --- | --- | --- |
| `GMAIL_PUBSUB_TOPIC` | `gmail.service.ts:354` | `watchInbox` escribe «no está configurado. Omitiendo» y **vuelve**: la suscripción push no se registra |
| `GMAIL_PUBSUB_AUDIENCE` | `pubsub-auth.guard.ts` | y si un push llegara igualmente, el guard lo rechaza: «Webhook de Pub/Sub mal configurado» |

Ninguna de las dos rompe el arranque ni la sonda: **la revisión sale verde,
atiende, y no entra un solo correo**. Es la misma forma de fallo que
`GOOGLE_CLOUD_PROJECT` —una capacidad que se apaga en silencio— salvo que aquí
no la cubre el `avisoDeConfiguracion` de `main.ts`.

*Relacionado, y solo para que se sepa:* `COPILOT_EMAIL_TRANSPORT` tampoco se
inyecta, y su valor por defecto es **Gmail de verdad** (`copilot.module.ts:66`:
simulado solo si vale `mock`). Es coherente con lo decidido —local simulado, real
en la nube—, pero el transporte real **no se ha disparado nunca**: el primer clic
de «Enviar» en producción manda un correo auténtico desde el Gmail del usuario.

### 🟡 Tres cosas pequeñas del frontend, todas comprobadas hoy

- **La fecha de vencimiento se pinta un día antes.**
  `CreateTaskCard.tsx:146`: el `<input type="date">` da `2026-07-10`,
  `new Date('2026-07-10')` lo interpreta como **medianoche UTC** y la línea de al
  lado lo muestra con `toLocaleDateString()`, que en México resta seis horas y
  enseña el **9**. El propio `input` sigue mostrando el 10 porque se recalcula con
  `split('T')[0]`: **la misma tarjeta enseña dos fechas distintas**. Es la trampa
  que ya resolviste en el eje X del tablero —`new Date(dateStr + 'T00:00:00')`,
  `DashboardPage.tsx:41`—, sin aplicar aquí.
- ✅ **Resuelto:** `role="button"` anidado en el Inbox (`InboxPage.tsx:283`). Se condicionó el `role` y `tabIndex` para que no se dupliquen cuando la fila es interactiva, evitando dobles paradas de tabulación y burbujeo en Enter/Espacio.
- ✅ **Resuelto:** `mockTasks.ts` ha sido eliminado completamente del disco.

### ✅ Resuelto: Mina en el entorno local eliminada

El archivo `apps/web/.env` fue eliminado para prevenir que inyectara un sufijo tóxico (`/tasks`) al endpoint de Vite, el cual saltaba el proxy y ocultaba los errores de enrutamiento real en el entorno local.

### Lo que el barrido **no** encontró

Para que conste, porque un informe que solo trae defectos no dice cuánto se miró:
en `apps/api` no hay un solo `any` fuera de las pruebas, ni `@ts-ignore`, ni
`TODO`; los cuatro `$queryRaw` van parametrizados y el único `Prisma.raw` recibe
un nombre de columna literal; todas las escrituras comprueban la propiedad por
`userId`; el cifrado de los tokens de Google es AES-256-GCM con IV por mensaje y
etiqueta verificada; la carrera del cronómetro está resuelta con un índice único
centinela; y el socket exige `typ: access` en el handshake. En `apps/web` no hay
un solo `dangerouslySetInnerHTML`. El detalle completo, con lo que **no** revisé
línea a línea, está en la sección 12 de `ALANA.md`.
