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
| --- | --- | --- |
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

---

## Reglas de Oro y Lecciones Aprendidas (Frontend / DevOps)

### 1. `ignoreCommand` de Vercel y Clones Superficiales

- **Ubicación obligatoria:** `vercel.json` vive en la raíz del monorepo (`./vercel.json`) con una única clave (`ignoreCommand`). No incluir `buildCommand` ni `outputDirectory` (se gestionan en la interfaz de Vercel).
- **Infalibilidad ante shallow clones:** El script debe comprobar la existencia del commit previo con `git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}" 2>/dev/null`. Si la variable está vacía o el commit no existe en el clon superficial, debe hacer `exit 1` (construir).
- **Semántica de salida en Vercel:** Cualquier código de salida distinto de 0 generado por error (como código 128 por objeto inexistente) aborta el despliegue como **fallido** en lugar de construir. Ante la duda, siempre retornar `exit 1`.

### 2. Finales de Línea y Detección de Archivos Binarios en Git

- **Configuración estricta en `.gitattributes`:** Declarar `* text=auto eol=lf` junto a reglas explícitas para extensiones web (`*.ts`, `*.tsx`, `*.js`, `*.json`, `*.css`, `*.md`, etc.) y binarias (`*.png`, `*.woff2`, etc.).
- **Peligro de `\r` aislados:** Si un archivo contiene retornos de carro sueltos, la heurística de Git lo clasifica como binario (`i/-text`). Un archivo marcado como binario en el índice es omitido por `git add --renormalize` y genera diffs masivos inflados.
- **Hábito de verificación antes del commit:** Comparar siempre:

  ```bash
  git diff --stat
  git diff --ignore-cr-at-eol --stat
  ```

  Ambas salidas deben coincidir exactamente antes de confirmar cualquier commit amplio.

### 3. Fronteras de Dominio y Avisos de Cruce

- **Regla de propiedad de dominios:** `apps/web` es dominio de Gravity; `apps/api` es dominio de Claude.
- **Excepciones comunicadas en el buzón:** Si para desbloquear el CI de todos es imprescindible tocar código fuera de nuestro dominio, **se debe comunicar explícitamente en el buzón en ese mismo instante**. Un cruce avisado es una excepción de emergencia visible; un cruce silencioso es una sorpresa en un commit con otro nombre.
- **Nunca borrar aserciones en pruebas:** Relajar una aserción estricta cambiándola a `expect.any(String)` o similar no soluciona el desacoplamiento: elimina el test y enmascara fallos reales de configuración (como regresiones de IDs de modelos 404).

### 4. Verificación Obligatoria Pre-Push (`npm run lint`)

- **Ejecutar siempre en el monorepo completo:** Antes de pushear cualquier commit, correr `npm run lint` sobre los 3 paquetes (`@pmo/shared`, `@pmo/api`, `@pmo/web`) y `npm run test --workspaces --if-present`.
- **Preservación de causa de error (`preserve-caught-error`):** Al capturar y relanzar un error sintomático, incluir siempre `{ cause: err }` en `new Error('...', { cause: err })`.

### 5. Detección Tipada de Errores HTTP vs. Antipatrones de Cadenas

- **Nunca usar substrings sobre `error.message`:** No usar `error.message.includes('401')` ni `error.message.includes('409')`.
- **Inspección tipada:** Comprobar siempre `err instanceof ApiError && err.status === 409` (o el código correspondiente) utilizando la clase `ApiError` centralizada en `lib/api`.

### 6. Una sonda cara se abarata bajando la frecuencia, no la profundidad

Regla escrita al revés el 2026-08-25 y corregida el mismo día, con el error ya
en producción. Vale más el error que la regla.

- **`/health/ready` cuesta dinero por vuelta.** Hace ping a Postgres y a Redis
  en cada llamada. Un `setInterval` de 30 s en el navegador son ~2.900 comandos
  de Upstash al día **por pestaña abierta**: la fuga escala con las pestañas, no
  con los usuarios, y no aparece en ningún log de error.
- **Lo que no se toca es la profundidad.** El primer parche movió el latido a
  `/health` y dejó `/health/ready` para «los reintentos tras una caída». Eso
  dejó el semáforo ciego, y Alana lo cazó: **`/health` contesta 200 con Postgres
  y Redis caídos** —es su trabajo declarado, el controlador lo dice— así que el
  camino de reintento profundo solo se disparaba cuando la API entera había
  desaparecido. Una caída de dependencias, que es justo lo que el indicador
  existe para enseñar, pintaba verde. **Un indicador que no puede ponerse en
  rojo no es un indicador; es un adorno que además miente.**
- **La palanca correcta es el intervalo.** `/health/ready` siempre, cada 5 min
  (`300_000`): ~288 comandos al día por pestaña en vez de ~2.900, y la lectura
  sigue siendo profunda. Se paga con hasta 5 min de retraso en ver una caída,
  que con un solo usuario es barato.
- **Las dos sondas no devuelven lo mismo.** `/health` da el objeto plano
  (`status`, `service`, `version`, `uptimeSec`, `timestamp`); `/health/ready` da
  la forma de Terminus (`status`, `info`, `error`, `details`), **sin `version`
  ni `uptimeSec`**. Tipar la respuesta de una con el tipo de la otra compila
  igual y pinta `undefined` en pantalla: el `as T` de `apiFetch` no comprueba
  nada en tiempo de ejecución. Por eso, tras pasar la profunda, se pide
  `/health` detrás solo para esos dos campos — no toca dependencias, no cuesta
  cuota.
- **Lección de método, no de código:** el encargo decía «cierra la fuga» y se
  cerró, pero optimizar un número sin preguntarse qué señal lo producía se llevó
  la señal por delante. Antes de abaratar una llamada, escribe qué pregunta
  contesta y comprueba que la versión barata la sigue contestando.

### 7. Una cuarentena que la bandeja no enseña no es una cuarentena

Fase 6, 2026-09-08. El backend dejó de escribir en el tablero: la IA guarda su
propuesta en `Email.proposedTasks` y espera a que una persona decida. La pieza
que faltaba no era de backend.

- **`taskCount` dejó de significar lo que significaba, y nadie lo notó.** Es el
  número de filas `Task` de ese correo. Con la IA escribiendo en el tablero,
  `taskCount > 0` quería decir «esto ya está atendido»; desde la Fase 6 un
  correo con **tres propuestas esperando decisión** tiene `taskCount: 0` igual
  que uno que nadie ha mirado. La lista los pintaba idénticos. Construimos una
  bandeja de decisión en la que no se veía qué estaba esperando una decisión.
- **Regla que me llevo:** cuando una capa deja de escribir donde escribía, hay
  que ir a mirar **quién estaba leyendo de ahí**. El campo no desaparece —se
  queda con el mismo nombre, el mismo tipo y un significado nuevo—, así que no
  rompe la compilación ni los tests: rompe la pantalla, en silencio.
- **Un campo que no devuelve ningún endpoint no existe.** `hasAttachments` se
  detectaba en Gmail, se persistía y se le pasaba al modelo, pero no estaba en
  ningún `select`. Funcionaba de cara al LLM y era invisible de cara a la
  persona, que es quien tiene que decidir sabiendo que el modelo no leyó el PDF.
- **Caché sin puerta de salida.** `classify` empezó a servir siempre la
  propuesta guardada. Ahorra tokens y está bien, pero dejaba un correo mal
  clasificado mal clasificado para siempre. Se cerró con `?force=true` y un
  botón que dice lo que cuesta.

### 8. Corrección a mi propia nota sobre `vercel.json`

En el buzón escribí que el archivo «lleva una sola clave a propósito». **Falso, y
lo comprobé al abrirlo:** lleva `ignoreCommand` y `headers`. Lo que es cierto —y
lo que rompió el despliegue del 2026-08-07— es que **no puede llevar claves de
build**: `buildCommand`, `outputDirectory` e `installCommand` vienen del panel.

La nota generalizaba de un caso a una regla, y una regla más estricta de lo que
manda el hecho acaba frenando cambios legítimos. Añadir cabeceras es seguro; el
peligro está en una lista concreta de cuatro claves, no en el número de claves.
