# GRAVITY_MEMORY

**Cerebro Frontend / DevOps.** Estado de la interfaz, despliegues y comandos de
infraestructura de Gravity.

> Los contratos de la API **no viven aquí**: están en `API_CONTRACTS.md`. Este
> archivo es lo que Gravity tiene entre manos y lo que ha aprendido haciéndolo.

---

## Encargo en curso

**Estado:** TRABAJAR · lo decide **solo Doc**

**@Gravity:** Has asegurado el indicador visual en `TaskCard.tsx`. Tu nueva y
única misión para este cierre de sprint es la **Provisión de Infraestructura en
Google Cloud (DevOps)**. No tocarás código de frontend ni de backend hasta
terminar y reportar esto.

> _Este encargo venía de `HANDOFF.md`, que el 2026-08-03 se partió en dos: los
> contratos de la API se quedaron en `API_CONTRACTS.md` y lo que Gravity tiene
> entre manos se mudó aquí. **El archivo `HANDOFF.md` ya no existe**, así que la
> regla de `AI_ROLES.md` que lo nombra como canal único apunta a un archivo
> que no está — está anotado en `DOC.md` para que Doc lo actualice._

## Lo último entregado

| Encargo | Dónde quedó |
|---|---|
| Indicador de origen en la tarjeta (`task.source`) | `eb9329f` |
| Los 28 `any` de `apps/web` | `9501647` — los tres paquetes en cero avisos |
| Teclado en las filas del Inbox | `d358152` |
| `threadId` y lista de conversaciones del copiloto | `0d2a4f4` |
| Vista de métricas contra datos reales | `4191bda` + `0d2a4f4` |

## Deuda conocida de `apps/web`, sin asignar

- ⚠️ **`KanbanBoard.tsx:71-73` usa `MOCK_TASKS` como fallback del `catch`.** Si
  `GET /tasks` falla —API caída, sesión caducada a los 15 minutos, red—, el
  tablero se rellena con cinco tareas inventadas y no lo dice: el único rastro
  es un `console.error`. Es el patrón de `MOCK_METRICS`, que ya costó un
  hallazgo, pero sobre la superficie de trabajo principal: esas tarjetas se
  arrastran, se editan y se cronometran contra ids que no existen en la base.
- El refactor de `handleDragEnd` en `KanbanBoard.tsx`: llama a `moveTask()`
  dentro del updater de `setTasks`, que debe ser puro. Hoy funciona por suerte.
- `features/dashboard/types.ts` copia `DashboardMetrics` a mano en vez de
  importarlo de `@pmo/shared`, y `TimeReportResult` (`time.api.ts`) no declara
  el campo `tz` que el backend ya devuelve.

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

### Paso 1 — APIs necesarias

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

`iamcredentials` y `sts` son las que hacen funcionar la federación de
identidades. Sin ellas, el paso de autenticación del workflow falla con un
mensaje que no menciona ninguna API.

### Paso 2 — Repositorio de Artifact Registry

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Imágenes de PMO"
```

La imagen quedará en
`${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}`, que es
exactamente lo que compone `deploy.yml`.

### Paso 3 — Cuenta de servicio del despliegue

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="Despliegues desde GitHub Actions"

export SA="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

for ROL in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" --role="$ROL"
done
```

⚠️ **`iam.serviceAccountUser` se olvida siempre.** Es el que permite a esta
cuenta desplegar un servicio que corre *como* otra identidad. Sin él,
`gcloud run deploy` falla **al final**, después de haber construido y subido la
imagen, y el error no menciona el rol que falta.

### Paso 4 — Credenciales de corto plazo (Workload Identity Federation)

```bash
gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${GH_REPO}'"

export PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github/attribute.repository/${GH_REPO}"

echo "projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github/providers/github-provider"
```

⚠️ **El `attribute-condition` no es opcional.** Sin él, cualquier repositorio de
GitHub puede pedir un token para esta cuenta de servicio. Es la diferencia entre
federación y una puerta abierta.

Guarda la salida del `echo`: es el valor de `GCP_WORKLOAD_IDENTITY_PROVIDER`.

### Paso 5 — Secretos de la aplicación

```bash
crear() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic; }

crear pmo-database-url          "postgresql://USUARIO:CLAVE@HOST:5432/pmo"
crear pmo-redis-url             "redis://HOST:6379"
crear pmo-jwt-secret            "$(openssl rand -base64 48)"
crear pmo-token-encryption-key  "$(openssl rand -hex 32)"
crear pmo-google-client-id      "REEMPLAZAR"
crear pmo-google-client-secret  "REEMPLAZAR"
crear pmo-anthropic-api-key     "REEMPLAZAR"
crear pmo-gemini-api-key        "REEMPLAZAR"

for S in pmo-database-url pmo-redis-url pmo-jwt-secret pmo-token-encryption-key \
         pmo-google-client-id pmo-google-client-secret pmo-anthropic-api-key pmo-gemini-api-key; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${PROJECT_NUM}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

⚠️ **`TOKEN_ENCRYPTION_KEY` son 32 bytes en hex, no base64.** Generado como el
`JWT_SECRET`, la API arranca bien y revienta al descifrar el primer token de
Gmail — un fallo que aparece lejos de su causa.

Quien lee los secretos es la identidad **con la que corre el servicio**, no la
del despliegue. Arriba va la cuenta de cómputo por defecto; si le pones una
dedicada a Cloud Run, el binding va a esa.

### Paso 6 — Variables y secretos en GitHub

```bash
gh variable set GCP_PROJECT_ID    --body "$PROJECT_ID"        --repo "$GH_REPO"
gh variable set GCP_REGION        --body "$REGION"            --repo "$GH_REPO"
gh variable set GAR_REPOSITORY    --body "$REPOSITORY"        --repo "$GH_REPO"
gh variable set CLOUD_RUN_SERVICE --body "$SERVICE"           --repo "$GH_REPO"
gh variable set WEB_URL           --body "https://REEMPLAZAR" --repo "$GH_REPO"

gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$GH_REPO" \
  --body "projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/github/providers/github-provider"
gh secret set GCP_SERVICE_ACCOUNT --repo "$GH_REPO" --body "$SA"
```

### Paso 7 — Migraciones (referencia post-despliegue)

Se ejecutan como un Job de Cloud Run aislado, **no como paso del workflow**: el
runner de GitHub no llega a Cloud SQL sin el Auth Proxy, y un Job vive dentro y
usa la misma conexión que el servicio.

```bash
gcloud run jobs create pmo-api-migrate \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:latest" \
  --region "$REGION" \
  --set-secrets "DATABASE_URL=pmo-database-url:latest" \
  --command npm \
  --args "--workspace,@pmo/api,exec,--,prisma,migrate,deploy"

gcloud run jobs execute pmo-api-migrate --region "$REGION" --wait
```

### Cómo saber que salió bien

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

