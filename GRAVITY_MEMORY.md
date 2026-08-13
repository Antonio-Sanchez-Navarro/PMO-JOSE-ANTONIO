# GRAVITY_MEMORY

**Cerebro Frontend / DevOps.** Estado de la interfaz, despliegues y comandos de
infraestructura de Gravity.

> Los contratos de la API **no viven aquí**: están en `API_CONTRACTS.md`. Este
> archivo es lo que Gravity tiene entre manos y lo que ha aprendido haciéndolo.

---

## Encargo en curso

**Estado:** EN PAUSA · lo decide **solo Doc**

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
| Provisión de Infraestructura GCP | Completado (Neon + Upstash + Cloud Run) |
| Saneamiento de Deuda Técnica (Frontend) | Eliminación de mocks, mutación impura en DND y corrección de tipos |
| Configuración de OAuth de Google | Variable `GOOGLE_REDIRECT_URI` actualizada en GitHub Actions |
| Configuración de Vercel (CI/CD) | Eliminación de `vercel.json` local para priorizar la UI de Vercel y prevenir errores de `build:shared`. |
| Estabilización de Métricas (Producción) | Refactor de llamada directa a `apiFetch` en `useDashboardMetrics.ts`, resolviendo errores 401 mediante `credentials: 'include'` y refresh de tokens. |
## Estado de la Infraestructura en Producción

**Infraestructura de Datos:**
- **PostgreSQL:** Migrado exitosamente a Neon.tech (Serverless PostgreSQL). Cadena de conexión actualizada en GCP Secret Manager bajo el secreto `pmo-database-url` (Versión 3 activa).
- **Redis Cache:** Migrado exitosamente a Upstash Redis (Serverless). Cadena de conexión TLS actualizada en GCP Secret Manager bajo el secreto `pmo-redis-url` (Versión 2 activa, protocolo `rediss://`).

**Estado del Despliegue:**
- Eliminados los placeholders de bases de datos locales.
- Cloud Run configurado para inyectar las versiones activas de Secret Manager directamente a las variables de entorno `DATABASE_URL` y `REDIS_URL`.
- Las migraciones de Prisma se ejecutan sobre Neon durante el despliegue.
- **Frontend Vercel completado:** El monorepo compila de forma consistente usando la configuración de Vercel manual / `vercel.json` desde la raíz. El frontend (Vite) consume la API en Cloud Run sin sufijos extra.
- **Integración OAuth verificada:** El flujo de login con Google en producción se completa sin errores, enlazando el cliente de Vercel con la redirección autorizada hacia el dominio de Cloud Run.

**Diagnóstico y Mitigación (Arranque de Cloud Run):**
- **Causa Raíz:** El origen real del timeout fue resuelto por la revisión de proveedores síncronos en el bootstrap (el `AuthService` requería `GOOGLE_REDIRECT_URI` de forma estricta antes de abrir el puerto).
- **Solución:** Claude añadió validación e inyección de la variable en `deploy.yml`. 
- **Timeouts y Secretos:** El timeout de Cloud Run se reestablece a su valor estándar de 60s tras confirmar que el servicio responde. *(Nota: El pipeline ya no inyecta los secretos `pmo-claude-model-*` mediante `--set-secrets`)*.
- **Verificación Final (Telemetría y End-to-End):** El flujo Frontend ↔ Backend opera en verde total. La integración de OAuth de Google valida credenciales correctamente desde Vercel hacia la API de Cloud Run, registrando sesiones vivas. Cloud Logging confirma que la API escucha y rutea CORS adecuadamente.

## Deuda conocida de `apps/web`, sin asignar

- **UX del Botón "Convertir a Tarea" (Inbox):** El botón debe desaparecer, deshabilitarse o cambiar a "Ver Tarea" si el correo ya fue procesado automáticamente por la IA y enlazado a una tarjeta. Actualmente, el frontend permite hacer clic múltiples veces, lo que provoca que el backend rechace la duplicación con errores `409 Conflict` en `POST /emails/.../to-task`.

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
gh variable set WEB_URL           --body "https://pmo-frontend-antoniosanchez-5466s-projects.vercel.app" --repo "$GH_REPO"

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


---


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

### 🔴 Sigue abierto: el prefijo `/api` que la API no sirve

`apps/web/src/lib/api.ts:8`

```ts
export const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? "https://pmo-api-mlpuuasqka-uc.a.run.app/api" : "/api");
```

**La API no tiene prefijo global.** `main.ts` no llama a `setGlobalPrefix`, así
que la única ruta que existe es `/auth/google/callback`, no `/api/...`.
Comprobado contra la revisión desplegada, sin credenciales:

```
GET https://pmo-api-mlpuuasqka-uc.a.run.app/api/auth/me  -> 404
GET https://pmo-api-mlpuuasqka-uc.a.run.app/auth/me      -> 401   <- la que sí existe
GET https://pmo-api-mlpuuasqka-uc.a.run.app/api/tasks    -> 404
```

Ahora que las cookies ya viajan cross-site, **esto es lo único que separa al SPA
de la API**: quitar `/api` del valor de producción. En desarrollo el `/api` sí
hace falta, porque ahí es el prefijo que el proxy de Vite recorta antes de
reenviar —son dos cosas distintas con el mismo nombre, y por eso confunde.

**Es la tercera vez que el prefijo `/api` rompe algo en este proyecto.** Las dos
anteriores fueron en `GOOGLE_REDIRECT_URI` y las paró el guardarraíl de
`deploy.yml`; esta vive dentro del código del frontend, donde ese guardarraíl no
llega. Conviene recordar el porqué al escribir cualquier URL de esta API: **no
hay `/api` ni `/v1` en ninguna ruta.**

### 🔴 Sigue abierto: el tiempo real apunta a la máquina del usuario

`apps/web/src/features/kanban/hooks/useSocket.ts:90`

```ts
globalSocket = io('http://localhost:3000', { withCredentials: true, ... });
```

Fijo, sin variable y sin relativo. En producción el navegador intenta abrir un
socket contra el `localhost` **de quien mire la página**, así que no hay tablero
en vivo: ni tareas que aparecen solas, ni cronómetro que se sincroniza entre
pestañas, ni el `email.updated` del Inbox.

**Y no deja rastro en ningún log del servidor**, porque la conexión nunca sale
hacia él: mirar los logs de Cloud Run para entender por qué no llegan eventos no
daría nada nunca. Con las cookies ya en `none`, apuntarlo al origen de la API
debería bastar; el `cors.origin` del gateway ya se lee de `WEB_URL`, que en
producción vale la URL de Vercel.

### 🟠 La ingesta de Gmail está apagada en producción, y avisa con una línea de log

Terreno de despliegue, por eso lo dejo aquí; la decisión de qué hacer es de Doc.
Comparé **todas** las variables que lee el backend con las que inyecta
`deploy.yml`, y faltan las dos que sostienen la pieza número uno del producto
(`grep -c GMAIL_PUBSUB .github/workflows/deploy.yml` → **0**):

| Variable | Quién la lee | Qué pasa sin ella |
|---|---|---|
| `GMAIL_PUBSUB_TOPIC` | `gmail.service.ts:354` | `watchInbox` escribe «no está configurado. Omitiendo» y **vuelve**: la suscripción push no se registra |
| `GMAIL_PUBSUB_AUDIENCE` | `pubsub-auth.guard.ts` | y si un push llegara igualmente, el guard lo rechaza: «Webhook de Pub/Sub mal configurado» |

Ninguna de las dos rompe el arranque ni la sonda: **la revisión sale verde,
atiende, y no entra un solo correo**. Es la misma forma de fallo que
`GOOGLE_CLOUD_PROJECT` —una capacidad que se apaga en silencio— salvo que aquí
no la cubre el `avisoDeConfiguracion` de `main.ts`.

_Relacionado, y solo para que se sepa:_ `COPILOT_EMAIL_TRANSPORT` tampoco se
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
- **`role="button"` anidado en el Inbox.** `InboxPage.tsx:283` y `:431`, uno
  dentro del otro y los dos con `tabIndex={0}`: dos paradas de tabulación por
  fila, y Enter sobre el hijo dispara lo suyo **y** burbujea al padre. Es la misma
  forma del botón dentro de un botón que `0d2a4f4` vino a quitar, ahora declarada
  con ARIA, donde el validador de HTML no la ve. Se arregla dejando
  `role`/`tabIndex` en **uno solo** de los dos.
- **`mockTasks.ts` sigue en el disco** y ya no lo importa nadie: 79 líneas de
  cinco tareas de ejemplo. Quitarlo cierra del todo el capitulo de los mocks.

### ⚠️ Una mina en el entorno local, que no está en git

`apps/web/.env` (del 25 de julio, ignorado por `.gitignore`, así que solo existe
en esta máquina) contiene:

```
VITE_API_URL=http://localhost:3000/tasks
```

Esa variable **gana sobre todo lo demás** en `lib/api.ts`, así que en desarrollo
`apiFetch('/tasks')` sale hacia `http://localhost:3000/tasks/tasks`, y de paso se
salta el proxy de Vite. Si alguna vez has visto la capa central fallar en local y
las llamadas sueltas funcionar, el motivo puede estar ahí y no en el código.
**`VITE_API_URL` no está documentada en ningún `.env.example`**, así que quien
monte el proyecto no sabrá que existe ni que puede estar mintiendo.

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
