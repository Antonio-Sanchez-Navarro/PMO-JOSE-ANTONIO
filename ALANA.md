# ALANA — cuaderno de la terminal de observación

> **Uso exclusivo de Alana.** Este archivo no es un encargo para nadie, no
> reparte trabajo y no sustituye a `GRAVITY_MEMORY.md` ni a `CLAUDE_MEMORY.md`
> (que son de ellos) ni a `TASKS.md` (que es el plan). Es la memoria de esta
> terminal. **Desde el 2026-08-03 vive en git** —se lo llevó `3578f8d` sin
> mencionarlo—, así que lo que se escriba aquí viaja a GitHub.

---

## 0. Protocolo de esta terminal

Reglas fijadas por el usuario el **2026-07-29**:

| Regla | Detalle |
|---|---|
| **Nombre** | Esta terminal se llama **Alana**. La otra terminal de Claude Code se llama **Claude** y ya tiene sus roles (`AI_ROLES.md`). |
| **Activación** | Alana **solo** despierta con la instrucción literal **«despierta alana»**. Nunca por iniciativa propia, nunca por inferencia. |
| **Qué hace al despertar** | 1) Revisa contextos · 2) Revisa cambios (git, archivos, docs) · 3) Actualiza **este** archivo · 4) **Para**. |
| **Alcance de escritura** | Alana **solo escribe en `ALANA.md`**. No toca código, no toca `TASKS.md`, no toca las memorias de los otros agentes, no commitea, no arranca servidores. |
| **Fuera de activación** | Sin la orden, Alana no trabaja. |

**Chequeo estándar de despertar** (lo que hay que mirar, en orden):

```
git log --oneline -20          # qué se commiteó desde el último corte
git status --short             # qué hay sin commitear (y de quién es)
git diff --stat                # tamaño y forma de lo pendiente
TASKS.md                       # casillas que cambiaron de estado
AI_ROLES.md → Excepciones      # si se acordó alguna nueva
PROMPT_ALANA.md                # el encargo vivo y el contexto que da Doc
docs/SESSION-*.md              # si hay registro de sesión nuevo
gh run list                    # NUEVO el 2026-08-07: `gh` ya está instalado y
                               # autenticado, así que el CI y el despliegue por
                               # fin se miran desde aquí en vez de suponerlos
curl <URL>/health/ready        # y la API desplegada se sonda sin credenciales
gh variable list               # NUEVO el 2026-08-12: WEB_URL y GOOGLE_REDIRECT_URI
                               # deciden si el login existe, y cambian fuera de git
curl <WEB_URL> | grep title    # y se compara con apps/web/index.html: el 08-10 ese
                               # dominio servía otra aplicación entera (§13)
```

> ### ⚖️ Por qué faltan tres líneas ahí arriba (2026-08-21)
>
> El chequeo listaba también **`DOC.md`, `GRAVITY_MEMORY.md → Estado` y
> `CLAUDE_MEMORY.md`**. Se quitaron por regla del Jefe, y el hueco es
> deliberado: **Alana ya no lee las tres bitácoras de los otros agentes.**
>
> Nació leyéndolas porque Doc vivía fuera de este entorno y necesitaba ojos
> dentro. Doc ya opera aquí y ve lo mismo. Lo que era útil pasó a ser un lastre:
> **un auditor que lee la bitácora del ejecutor hereda su relato** — sus
> palabras, su orden de importancia y su convicción de que algo está resuelto.
>
> Y hay evidencia en este mismo cuaderno, no es una hipótesis. §37 fue fuerte
> justo donde leí **código**. En cambio §36.9 —proponer una capa que ya estaba
> entregada— salió de trabajar sobre estado leído, y §37.20 dejó viva una
> pregunta sobre el *Root Directory* de Vercel que ya estaba contestada, porque
> la deduje de documentos en vez de mirar el panel.
>
> **Sigue leyéndose todo lo demás, que es casi todo:** el código entero, git en
> todas sus formas, la nube (`gcloud`, `gh`, sondas, paneles) y los documentos
> neutrales —`AI_ROLES.md`, `TASKS.md`, `API_CONTRACTS.md`, `ARCHITECTURE.md`,
> `GCP_SETUP.md`, `README.md`, `infra/` y `docs/`—. Eso es verdad del proyecto,
> no relato de un agente.
>
> **La contrapartida es mía:** el contexto que antes iba a buscar a una bitácora
> ahora lo da Doc en `PROMPT_ALANA.md`. Y cuando algo **parezca** un defecto pero
> huela a decisión deliberada —el caso de manual es el `stalledInterval` de 10
> minutos, que se subió a propósito para ahorrar comandos de Upstash—, **no se
> afirma: se pregunta en el buzón.** Un hallazgo que resulta ser una decisión
> consciente gasta el tiempo de todos y desgasta la autoridad del siguiente.

> ### 🔎 Y desde hoy: encuentro y compruebo, no arreglo (2026-08-21)
>
> Los cinco hallazgos de §38.5 los cerré yo, con código, en `apps/api`,
> `apps/web` e `infra/` (§40). **No vuelve a pasar.**
>
> El motivo no es la línea de dominio, es más hondo y lo firmo: **audité y luego
> corregí mis propios hallazgos.** Eso disuelve lo único que me hace útil — si
> quien audita también arregla, no queda nadie fuera para decir «eso que
> arreglaste no estaba roto». Que esta vez lo dijera yo fue honestidad, no
> diseño, **y un control que depende de la honestidad del controlado no es un
> control**.
>
> A partir de ahora: encuentro, compruebo y escribo el hallazgo verificado —qué
> pasa, dónde, qué lo demuestra y **si de verdad está roto**—. Lo reparte Doc.
> Y si veo un hueco sin dueño, **no lo tapo: lo digo**. Ofrecerme a cerrarlo es
> justo lo que arrancó esto.

> **Excepción puntual del 2026-08-07**, por orden expresa del usuario: Alana
> escribió un bloque de hallazgos al final de `GRAVITY_MEMORY.md`. Va **añadido**,
> sin tocar una línea de las suyas (141 inserciones, 0 borrados), firmado, y
> declarando que **no es un encargo y que el campo `Estado` sigue siendo de
> Doc**. La regla de fondo no cambia: sin una orden así, Alana solo escribe aquí.

**`HANDOFF.md` ya no existe** (2026-08-03, `a1e9554`): se partió en dos y el
reparto de documentos es otro. Ver §1 y §3.

---

## 1. Qué es el proyecto

**PMO Dashboard** — plataforma web de gestión de proyectos para un director de
PMO. Integra **Gmail**, **WhatsApp** (pendiente) y un **copiloto de IA**.

Cinco piezas funcionales:

1. **Ingesta de correo** — Gmail → Pub/Sub → cola BullMQ → clasificación.
2. **Extracción de tareas con IA** — un correo accionable se convierte en tareas
   con prioridad automática.
3. **Kanban** — 5 columnas: Por hacer · En proceso · Pospuestas · Cumplidas ·
   Atrasadas. Drag & drop, realtime por socket.
4. **Registro de tiempos** — cronómetro por tarea + informes con gráficas.
5. **Copiloto** — chat en panel lateral que redacta y envía correos.

Documentos de referencia, **con el reparto nuevo del 2026-08-03** (`a1e9554`,
`79636b7`), que sustituye al `HANDOFF.md` único:

| Archivo | Qué es | Quién escribe |
|---|---|---|
| `API_CONTRACTS.md` (1093 líneas) | **Territorio neutral**: rutas, sockets, sondas, sesión. Sin instrucciones dentro | nadie, salvo cambio acordado |
| `CLAUDE_MEMORY.md` (465) | Cerebro del backend: estado de `@pmo/api`, variables, trampas | Doc reparte · Claude anota |
| `GRAVITY_MEMORY.md` (265) | Cerebro de frontend y DevOps: encargo con su `Estado`, entregado, deuda | Doc reparte · Gravity anota |
| `DOC.md` (80) | Memoria de alto nivel del PM: hitos, reglas y **pendientes de decisión** | Doc |

Y siguen: `TASKS.md` (plan por sprints), `AI_ROLES.md` (quién toca qué),
`ARCHITECTURE.md`, `GCP_SETUP.md`, `README.md`.

**Cómo se hizo la partición, que conviene no perder:** `HANDOFF.md` no se
renombró entero. Sus líneas 211–1281 (contratos) fueron a `API_CONTRACTS.md` y
las 1–210 (la misión de DevOps viva, con su `Estado: TRABAJAR`) a
`GRAVITY_MEMORY.md`. Renombrarlo entero habría metido instrucciones dentro del
archivo que el estándar declara libre de ellas. `git log --follow
API_CONTRACTS.md` sigue llevando al historial completo.

---

## 2. Estructura y stack

Monorepo con npm workspaces (`apps/*`, `packages/*`).

```
apps/api/     NestJS 10 + TypeScript + Prisma 5 + PostgreSQL 16 + Redis 7/BullMQ + socket.io
apps/web/     React 18 + Vite 5 + TailwindCSS 3 + @dnd-kit + Recharts + socket.io-client
              react-hook-form + zod + sonner (toasts). NO hay axios ni TanStack Query ni Zustand
              (el ARCHITECTURE.md los sugería; la implementación usa fetch y estado propio)
packages/shared/  tipos y enums compartidos (Status, Priority, DTOs)
docs/         registros de sesión
```

**Scripts de la raíz:** `dev:api`, `dev:web`, `build` (compila los tres),
`lint`, `test`, `infra:up` / `infra:down` (docker compose: Postgres + Redis).

**Dónde vive esto en producción, desde el 2026-08-07:** la API en **Cloud Run**
(`pmo-api`, `us-central1`, proyecto `pmo-dashboard-503418`), Postgres en **Neon**
y Redis en **Upstash** —los dos gestionados; el `docker compose` se queda en
local—, la imagen en **Artifact Registry** y el frontend en **Vercel**
(`pmo-frontend.vercel.app`). El despliegue de la API va por GitHub Actions con
federación de identidades; **el del frontend no está en este repo** (§5).

**IA en el backend:**
- `@anthropic-ai/sdk` ^0.115.0 — clasificación de correos y copiloto.
- `@google/genai` ^2.13.0 — Gemini en el copiloto (instalado 2026-07-29).

**Otras dependencias que entraron el 2026-07-29:** `helmet` y
`@nestjs/throttler` en `apps/api`; `recharts` en `apps/web` (de Gravity).

**Y el 2026-07-31, con la observabilidad:** `@nestjs/terminus`, `nestjs-pino`,
`pino` y `pino-http` en `apps/api`, más `pino-pretty` como dependencia de
desarrollo. Módulo nuevo `common/observability/` (`logger.config.ts` 242 ·
`gcp-logging.ts` · `all-exceptions.filter.ts` · `service-context.ts`) y
`modules/health/` con `prisma.health.ts` y `redis.health.ts`.

**Modelos configurados** (`.env`): `CLAUDE_MODEL_REASONING=claude-opus-4-8`,
`CLAUDE_MODEL_CLASSIFY=claude-sonnet-5`, `CLAUDE_MODEL_CHEAP=claude-haiku-4-5-20251001`.
En el copiloto los modelos **no** se piden por id: se piden por `(provider, tier)`
y `llm/model-tiers.ts` traduce. Anthropic: `light`→Haiku 4.5, `pro`→Opus 5.
Google: `light`→gemini-3.5-flash-lite, `pro`→gemini-3.6-flash.

---

## 3. Los tres agentes y sus dominios

| Agente | Dónde | Papel | Dominio |
|---|---|---|---|
| **Doc** | Gemini en Chrome | PM y arquitecto. **No escribe código.** Decide arquitectura, valida, orquesta. | — |
| **Gravity** | Gemini local (IDE) | Frontend | `apps/web/` completo + capa REST CRUD de NestJS |
| **Claude Code** | Terminal | Backend | workers/colas, Prisma, tubería de IA, `.spec.ts`, lógica de dominio |
| **Alana** | Esta terminal | Observación | solo `ALANA.md` |

**Canal único con Gravity: `GRAVITY_MEMORY.md`** (antes `HANDOFF.md`). Todos
sus encargos van escritos ahí y a Gravity solo se le dice «lee tu md». El campo
**Estado** (`TRABAJAR` / `EN PAUSA` / `CERRADO`) lo cambia **solo Doc**. El
backend tiene su espejo en `CLAUDE_MEMORY.md`.

✅ **Cerrado el pendiente nº 1 de `DOC.md`**: `AI_ROLES.md` ya no nombra
`HANDOFF.md` como canal (`79636b7`, el mismo día del cambio). _Este cuaderno no
aparece en `AI_ROLES.md`; Alana sigue viviendo solo en la regla del usuario._

### Excepciones vigentes al reparto (acordadas)
- `KanbanBoard.tsx` — arreglo de colisión del drag, commiteado por Claude Code
  el 2026-07-27 con visto bueno de Doc. Queda pendiente para Gravity el refactor
  de `handleDragEnd`: llama a `moveTask()` dentro del updater de `setTasks`, que
  debe ser puro (StrictMode puede invocarlo dos veces). Hoy funciona por suerte.
- `modules/emails/` — es capa REST pero lo lleva Claude (su lógica es la tubería
  de IA). **Gravity no lo edita**; si necesita un campo, lo pide.
- `POST /tasks`, `DELETE /tasks/:id`, `TasksGateway`, `modules/time/` — mismo
  motivo: comparten reglas con el cron y con los sockets.

### Zona compartida (avisar antes de tocar)
`apps/api/src/app.module.ts` · `TASKS.md` · `ARCHITECTURE.md` · `HANDOFF.md` ·
`AI_ROLES.md` · `package.json` de raíz y workspaces · `.env` / `.env.example`

---

## 4. Estado por sprints (corte del 2026-08-07)

| Sprint | Tema | Estado |
|---|---|---|
| 0 | Fundaciones, monorepo, Docker, CI | ✅ cerrado |
| 1 | Auth Google OAuth2 + tokens cifrados | ✅ cerrado |
| 2 | Ingesta Gmail + Pub/Sub + colas | ✅ cerrado |
| 3 | IA: clasificación y extracción de tareas | ✅ cerrado (con deuda) |
| 4 | Kanban + CRUD + realtime | ✅ cerrado (con deuda) |
| 4.5 | «Inbox Zero» — máquina de estados del correo | ✅ cerrado |
| 5 | Registro de tiempos | ✅ cerrado el 2026-07-29 |
| **6** | **Copiloto de IA** | ✅ **completo en el código el 2026-07-30**: backend cerrado el 29 y las dos piezas de interfaz commiteadas hoy en `0d2a4f4`. Falta que Doc lo declare cerrado |
| 7 | WhatsApp | ⬜ sin empezar (bloqueado: alta en Meta Business / Twilio) |
| **8** | **Métricas, hardening, despliegue** | 🚧 **abierto el 2026-07-29**: seguridad ✅, métricas ✅, observabilidad ✅ el 08-03, **CI/CD y despliegue de la API ✅ el 2026-08-07**. **El frontend ya habla con la API en el código ✅ (08-12)**, pero su despliegue está detrás del SSO de Vercel y no lo publica el pipeline. Quedan runbook, backups, las variables de Pub/Sub y el acceso al frontend (§14) |

### Sprint 8 — el despliegue (lo nuevo, y es casi todo este corte)

**La API está en producción.** `https://pmo-api-mlpuuasqka-uc.a.run.app`,
servicio `pmo-api`, región `us-central1`, proyecto `pmo-dashboard-503418`.
Postgres es **Neon** y Redis es **Upstash**, los dos gestionados: el
`docker-compose` se queda en local. Sondado por mí hoy, sin credenciales:

| Sonda | Respuesta |
|---|---|
| `GET /health/ready` | **200** · `database up` (53 ms) · `redis up` (24 ms) |
| `GET /health/live` | **200** |
| `GET /auth/me` sin cookie | **401** |
| `GET /auth/google` | **302** hacia Google |

Las dos últimas son las que dicen que **abrir el servicio no lo dejó
desprotegido**: la puerta de Cloud Run deja pasar y es el `AuthGuard` el que
corta.

**El pipeline entero: `ci.yml` → `deploy.yml` encadenados por `workflow_run`.**
No por `on: push`, para que no exista la puerta de desplegar con el CI en rojo.
Cuatro condiciones en el `if` del job y ninguna sobra: CI en verde, rama
`master`, origen `push`, y `vars.GCP_PROJECT_ID != ''` —que se comprueba sobre
`vars` y no sobre `secrets` porque **el contexto `secrets` no existe en el `if`
de un job**: escribirlo ahí no deja el job en espera, GitHub rechaza el archivo
entero al parsearlo y el workflow deja de existir—. Autenticación por
federación de identidades (WIF), sin clave JSON. La imagen se etiqueta con el
SHA además de `latest`. `concurrency` con `cancel-in-progress`.

**Los tres obstáculos del 2026-08-07, y lo que tienen en común.** Ninguno era
del código de la API —la aplicación llevaba días lista— y **los tres se veían
desde fuera del proceso y ninguno desde dentro**: no dejan una sola línea en el
log de la aplicación.

1. **Los secretos `pmo-claude-model-*` no existían.** Se cablearon por
   `--set-secrets` dos veces, la segunda (`d3547fc`) **sobre un reporte de que
   ya estaban aprovisionados**. `gcloud secrets list` devuelve ocho y ninguno es
   de modelos. Y el coste no fue un rojo y ya: **la revisión condenada retiró a
   la 00008, que sí estaba sirviendo** — en Cloud Run, la revisión rota se lleva
   por delante a la buena. Ahora van por `vars` y son **opcionales**, porque son
   ids públicos y el código trae valor por defecto: una variable que falta
   cambia el modelo, no tumba el despliegue.
2. **Cloud Run nace privado.** Con todo lo demás arreglado, `gcloud run deploy`
   salió con 0, la revisión quedó lista sirviendo el 100% del tráfico… y la
   sonda se comió **cinco 403 seguidos**. El 403 lo devuelve la puerta de
   entrada *antes* de tocar el contenedor. En el log de la revisión se ve el
   arranque impecable y **al lado** las líneas de la puerta. Resuelto con
   `--allow-unauthenticated`: los tres que llaman —el SPA, el callback que abre
   Google en el navegador y el empuje de Pub/Sub— son anónimos por naturaleza y
   ninguno puede presentar un token de Google.
3. **`--args` de `gcloud` exige el igual.** `--args "--workspace,…"`: el parser
   ve algo que empieza por `--`, lo toma por la bandera siguiente y muere con
   `expected one argument`. Tumbó el despliegue de las 17:41 UTC; `--args=…` lo
   arregló y el de las 17:46 salió verde.

**Las migraciones ya corren, y antes de publicar la revisión** (`c0eea91`). Un
Job de Cloud Run (`pmo-api-migrate`) con `prisma migrate deploy`, ejecutado con
`--wait` para que sea una puerta de verdad. El orden no es negociable: al revés,
la revisión nueva pediría columnas que aún no existen. De ahí la regla al
escribir migraciones — **compatibles con el código que ya está arriba**: añadir
lo es, renombrar y borrar no, y van en dos despliegues. Es un Job y no un paso
del runner para que **`DATABASE_URL` no salga nunca de Google Cloud**. Se temía
un `P3005` en la primera ejecución (base con tablas y sin `_prisma_migrations`)
y **no ocurrió**: `Execution [pmo-api-migrate-pkg6z] has successfully
completed`, comprobado en el log del run.

**El CI se salta los commits de solo documentación** (`c0eea91`): `paths-ignore`
en `ci.yml` y **no** en `deploy.yml`, porque `workflow_run` **no admite `paths`
ni `paths-ignore`** y GitHub los ignora en silencio. Filtrando en el CI sale
gratis: sin run de CI no hay `workflow_run` que concluya. `.github/**` queda
fuera de la lista a propósito.

### Sprint 8 — lo que entró (tabla del corte del 2026-08-03)

| Casilla | Estado |
|---|---|
| Helmet + límite de peticiones + CORS | ✅ `27ef27e` |
| `GET /dashboard/metrics` | ✅ backend `8897ae1` · ✅ **la vista ya come datos reales** `0d2a4f4` |
| `completedAt` sellado al cerrar tarea | ✅ `8897ae1` (`tasks/completion.ts`, función pura) |
| `GET /time/report` alineado a hora local | ✅ `3cffc21` · ✅ el frontend manda `tz` (entró en `2ceedd2`, ver §5) |
| Vista de métricas con gráficas | ✅ `4191bda` la pintó, `0d2a4f4` la enchufó a la API |
| `GET /time/active` devuelve `null` de verdad | ✅ `eb4449d` — era 200 con **cero bytes**, ver §6 |
| CI apuntando a la rama de trabajo | ✅ `eb4449d` (`main` → `master`) · ✅ **y ya hay remoto**, ver §9 |
| Observabilidad (logs, sondas, incidencias) | ✅ `37e634e` (la mitad) + `0439a3b` (pruebas, verificación viva y dos fallos), ver más abajo |
| Sentry | ❌ **cancelado el 2026-08-03** por el usuario: lo cubre Error Reporting leyendo de Cloud Logging, sin SDK ni credencial |
| Verificación viva del corte de días contra Postgres | ✅ `4b3db45` documenta lo comprobado |
| Linter reparado | ✅ `2ceedd2` — **no había configuración de ESLint en ninguna parte** · ✅ **y HEAD vuelve a pasarlo** (`b5995a7`, 0 errores / 28 avisos), ver §5 |
| CI/CD completo | ✅ **2026-08-07** — pipeline encadenado, migraciones y sonda de verdad contra la revisión desplegada |
| Runbook y backups | ⬜ |

### Sprint 8 — observabilidad (del corte del 2026-08-03)

Entró en dos tiempos y **el segundo es el que importa**: `37e634e` (07-31 18:45)
dejó escrito en su propio mensaje que compilaba y pasaba las 426 pruebas de
siempre pero que **no estaba probado contra la aplicación levantada ni tenía
pruebas propias**; `0439a3b` (08-03 11:36) cierra eso con 71 pruebas nuevas y la
verificación viva. **Los dos únicos fallos aparecieron en la verificación viva**,
no en el código leído ni en las pruebas:

1. 🔒 **El código de autorización de Google se estaba escribiendo en el log.**
   El serializador de fábrica de `pino-http` guarda la petición como **binding
   del logger hijo**, no como campo de una línea: `url` y `query` en crudo salían
   en **todas** las líneas de esa petición. `GET /auth/google/callback?code=…`
   dejó cuatro veces el código con el que se canjean los tokens de Gmail, una de
   ellas dentro de un aviso que escribe `AuthController`. **Lo engañoso es que el
   mensaje sí salía tapado**, y eso daba la sensación de estar cubierto. Se
   arregló eligiendo qué se guarda (`id`, `method`, URL saneada) en vez de
   filtrando lo que sobra. La cookie de sesión —que **es** un JWT válido 15 min—
   ya salía tapada desde el primer intento.
2. **El 503 de la sonda abría una incidencia por latido.** Con Redis parado,
   `/health/ready` devuelve 503 —su trabajo— y el filtro global lo marcaba como
   `ReportedErrorEvent`. Con la sonda disparando cada pocos segundos, un minuto
   de caída son decenas de incidencias diciendo lo que el cuerpo del 503 ya
   decía. Ahora se registra como aviso y sin marca.

**Sin SDK de telemetría y sin credencial**: los logs van a la salida estándar en
JSON de una línea con los nombres que Cloud Logging reconoce (`severity`,
`message`, `time`, `httpRequest`) y Error Reporting lee las excepciones de ahí.
El filtro **extiende `BaseExceptionFilter` y delega la respuesta en `super`**:
registrar no puede cambiar lo que la API devuelve. Los 33 `new Logger(...)`
repartidos en 32 archivos pasan a JSON estructurado por `app.useLogger`, sin
tocar ninguno. Dependencias nuevas: `@nestjs/terminus`, `nestjs-pino`, `pino`,
`pino-http` y `pino-pretty` (dev).

_Queda dicho por el propio commit lo que **no** se pudo ejercitar: un 500 de una
ruta de negocio, porque todas las que pueden producirlo están tras el
`AuthGuard`._

**El linter nunca funcionó en todo el proyecto.** `npm run lint` no fallaba por
estilo: no había `.eslintrc` ni `eslint.config` en ninguno de los tres paquetes,
y sin parser de TypeScript instalado tampoco habría podido leer un `.ts`. Moría
antes de abrir un archivo. Ahora hay configuración plana única en la raíz
(`eslint.config.mjs`), sin reglas con type-check —levantan el programa entero de
`tsc`, que es justo lo que cuesta memoria aquí— y sin `eslint-plugin-prettier`,
porque el primer `--fix` reescribiría el repo entero incluido `apps/web`, que es
de Gravity. Quedan 0 errores y 26 avisos. **Esto conecta con el CI**: el
workflow escucha `main` y se trabaja en `master`, y eso es lo que dejó pasar un
`lint` roto durante meses. Excepción de zona compartida concedida por Doc el
2026-07-30.

**El hilo conductor de los dos commits del 2026-07-30** es que había **dos
motores contando lo mismo**: la herramienta `get_metrics` del copiloto contaba
por su cuenta y ahora consume `MetricsService`; y `GET /time/report` agrupaba en
UTC mientras métricas agrupaba en local, así que las dos gráficas del tablero
repartían la tarde en días distintos. La zona por defecto, la validación de `tz`
y el doble `AT TIME ZONE` se mudaron a `apps/api/src/common/time-zone.ts`.

**Trampa de Prisma anotada:** los `DateTime` son `timestamp WITHOUT time zone`
guardando UTC, así que un solo `AT TIME ZONE 'America/...'` **interpreta** la
columna en esa zona en vez de convertirla. Hace falta
`AT TIME ZONE 'UTC' AT TIME ZONE tz`. Las cuentas salían igual: solo en el día
equivocado. Hay prueba de regresión.

### Sprint 6 — desglose fino (revisado el 2026-07-30 ~13:10: **cerrado en el código**)

| Casilla | Estado |
|---|---|
| `CopilotModule`: chat SSE + persistencia de hilos | ✅ commiteado (`e2bfbcf`) |
| Tool use: `create_task`, `search_emails`, `get_metrics`, `draft_email` | ✅ las cuatro (`fc130a6`, `56979b9`) |
| `POST /copilot/draft-email` | ❌ **cancelado** por Doc: el borrador ya sale del chat por `draft_email`; un segundo camino duplicaría el prompt |
| `POST /copilot/emails/send` con confirmación humana | ✅ (transporte real de Gmail **nunca disparado**; lo valida QA en staging) |
| UI panel lateral + editor de borrador | ✅ Gravity |
| Contexto: adjuntar hilo/tarea al prompt | ✅ Gravity |
| Registro de auditoría del copiloto | ✅ `CopilotAuditLog` + `GET /copilot/audit` (`fc130a6`) |
| Plantillas de correo reutilizables | ➡️ **movida al backlog** por Doc |

**Doc cerró formalmente el backend del Sprint 6 el 2026-07-29.** Lo único que
queda del sprint son dos piezas de interfaz, encargadas a Gravity en la
sección 6 de `HANDOFF.md`:

✅ **Las dos piezas de interfaz del Sprint 6 están hechas** (commit `0d2a4f4`,
2026-07-30 13:02). Es el cambio grande de este corte: llevaban abiertas desde el
29 y en los dos despertares anteriores el grep no daba un solo resultado.
Verificado en el código, no en los documentos:

1. ✅ **`threadId` viaja en `POST /copilot/chat`** —
   `CopilotDrawer.tsx:96`, `body: { provider, tier, message, context, threadId: currentThreadId }`—
   y se recoge del evento `done` (`:174`), que es exactamente el contrato: en una
   conversación nueva el cliente no lo conoce hasta que el backend la crea. El
   copiloto ya recuerda entre mensajes.
2. ✅ **La lista de conversaciones** — `copilot.api.ts` nuevo, con las tres
   rutas (`GET /copilot/threads`, `/:id`, `DELETE`). Panel de historial con
   título y fecha, cargar un hilo rehidrata los mensajes, y borrar el hilo
   **activo** limpia `currentThreadId` y vuelve al mensaje de bienvenida, que es
   el caso que se suele olvidar.

✅ **La comprobación que pedía Doc sale bien: el indicador de escritura no cuelga
del primer `token`.** El mensaje del asistente nace con `status: 'pending'` y
pasa a `'streaming'` en cuanto la respuesta trae cabeceras (`res.ok`), antes de
cualquier token. Con `search_emails` o `get_metrics` por delante, el usuario ve
actividad durante toda la espera.

_Detalle sin consecuencia, anotado por si algún día cambia el backend:_ el
`break` del evento `done` sale del `for` de bloques, no del `while` del lector,
así que el bucle sigue leyendo hasta que el servidor cierra el stream. Hoy el
backend cierra siempre; si dejara la conexión abierta, la promesa colgaría.

### Las dos familias de herramientas (decisión de diseño a recordar)

| Familia | Cuáles | Cómo funciona |
|---|---|---|
| **Actúan** | `draft_email`, `create_task` | Salen como evento `tool_call`. Las confirma **una persona** contra una ruta REST |
| **Solo lectura** | `search_emails`, `get_metrics` | Las ejecuta el backend y el resultado vuelve al modelo **en el mismo turno**, sin preguntar |

El catálogo declara de cada una quién la ejecuta, y hay una prueba que fija esa
lista: una herramienta que escriba marcada como `execute` se saltaría la
confirmación humana sin que nadie lo note. Tope de **4 vueltas** en el bucle.
El `userId` se cierra en el ejecutor: el modelo pide "busca X" sin saber de
quién son los datos.

**Trampa de Gemini 3 anotada:** exige que se le reenvíe el `thought_signature`
que vino con la llamada, así que el turno del modelo se reenvía con sus partes
originales en vez de reconstruirlo. Costó un 400.

### Ojo con la numeración
Ha habido **dos reetiquetados** de sprints. Doc abrió cosas como «Sprint 5» que
en realidad eran cierre del 3 y del 4. Regla acordada: mirar el checklist de
`TASKS.md` antes de numerar nada.

---

## 5. Árbol de trabajo

### Corte del 2026-08-12 (rama `master`)

```
 M GRAVITY_MEMORY.md     (3 inserciones, 1 borrado)
```

HEAD es **`ccbd498`**, del 08-10 a las 17:11. `origin/master` al día (0 ahead /
0 behind). **Dos commits desde el corte anterior**, los dos del 08-10 por la
tarde y los dos respuesta directa al diagnóstico de §13: `2123003` (documenta la
`WEB_URL` de producción) y `ccbd498` (`vercel.json`). El detalle de este corte
está en **§14**.

### Corte del 2026-08-07 (histórico)

```
 M GRAVITY_MEMORY.md
 M apps/web/src/features/dashboard/types.ts
 M apps/web/src/features/kanban/api/time.api.ts
 M apps/web/src/features/kanban/components/KanbanBoard.tsx
```

HEAD era `b1f6bcb`, de ese día a las 12:45. **33 commits desde el corte
anterior**, repartidos en tres días de trabajo: 08-03 (tarde), 08-05 y 08-07.

**`ALANA.md` ya no sale como `??`.** Se commiteó el 2026-08-03 dentro de
`3578f8d` («Actualización de infraestructura y variables de entorno»), un commit
de dos archivos que se llevó este cuaderno entero —781 líneas— sin mencionarlo
en el mensaje. Es justo lo que la regla de `DOC.md` «añadir por ruta, nunca
`git add -A`» viene a evitar, y esa regla está escrita porque ya costó un
disgusto. No rompe nada: lo que cambia es que estas notas viajan a GitHub.

### 🔴 Hallazgo rojo: el frontend desplegado no puede hablar con la API desplegada

> **Cerrado en el código el 2026-08-12** (ver §14): las tres roturas y la cookie
> están arregladas y verificadas. Lo que queda vivo de este apartado es otra
> cosa —a qué dominio apunta `WEB_URL` y quién puede entrar en él—, y eso vive
> en §13 y §14. Se deja el texto entero porque explica **cómo** se rompió.

Es el hallazgo de este corte y no lo ve ningún guardarraíl del proyecto, porque
todos miran la API. **El pipeline en verde dice que la API atiende; no dice que
el producto funcione.** El detalle está en §12: son **tres roturas
independientes**, no una, y ninguna deja rastro del lado del servidor.

Lo comprobado en vivo, que es el síntoma:

```
GET https://pmo-frontend.vercel.app/           -> 200, el SPA compilado
GET https://pmo-frontend.vercel.app/api/health -> 404  (X-Vercel-Error: NOT_FOUND)
GET https://pmo-api-mlpuuasqka-uc.a.run.app/api/auth/me -> 404
GET https://pmo-api-mlpuuasqka-uc.a.run.app/auth/me     -> 401  ← la ruta que sí existe
```

**Y detrás de las tres, la misma segunda mitad:** las cookies de sesión se
firman con `sameSite: "lax"` (`session.service.ts:39`, `auth.controller.ts:52`).
Apuntar el SPA al host de Cloud Run deja las peticiones como **cross-site**, y
con `lax` el navegador no manda la cookie: 401 aunque la API esté perfecta y la
URL sea la buena. La vía que mantiene `lax` viable es reescribir desde el propio
origen de Vercel.

_Y queda una pregunta que no me toca resolver:_ el callback de OAuth lo abre
Google contra `GOOGLE_REDIRECT_URI`, que apunta al host de Cloud Run, así que
**la cookie de sesión nace en el dominio de `run.app`**. Qué host sirve el
callback decide de qué dominio es la sesión, y el guardarraíl de `deploy.yml`
rechaza cualquier ruta que no sea exactamente `/auth/google/callback`. Es
decisión de Doc; lo dejo anotado, no tocado.

### 🟢 Lo que hay sin commitear cierra tres apuntes míos de golpe

Los cuatro archivos del árbol son el saneamiento de deuda del frontend, y entre
ellos están los tres apuntes que arrastraba desde el corte del 30:

- **Fuera el `MOCK_TASKS` del `catch`** de `KanbanBoard.tsx`. Era el gemelo del
  `MOCK_METRICS` que ya costó un hallazgo, pero sobre la superficie de trabajo
  principal: con la API caída o la sesión caducada, el tablero se rellenaba con
  cinco tareas inventadas que se arrastran, se editan y se cronometran contra
  ids que no existen. Ahora hay estado de error, aviso y botón de reintento.
- **El updater impuro de `handleDragEnd`, arreglado.** `moveTask()` ya se llama
  **fuera** de `setTasks` (`:243` fija el estado, `:246` llama a la API), y las
  dos mutaciones `t.status = col.status` dentro de los updaters pasan a `map`
  con copia. Era la única deuda de arquitectura declarada del proyecto, viva
  desde el 2026-07-27.
- **Los dos contratos duplicados a mano, cerrados.** `features/dashboard/types.ts`
  pasa de 37 líneas copiadas a `export type { DashboardMetrics } from '@pmo/shared'`,
  y `TimeReportResult` ya declara el campo `tz`.

_Apunte menor:_ `mockTasks.ts` **sigue en el disco** y ya no lo importa nadie —
archivo muerto de cinco tareas de ejemplo. Y la línea que `GRAVITY_MEMORY.md`
deja en su lugar es «*(Actualmente sin deuda crítica documentada)*», que será
cierto cuando esto se commitee: hoy el árbol lo tiene sin commitear y **el
hallazgo rojo de arriba no está en ninguna lista de deuda**.

### Verificado ejecutando, no leyendo (hoy, sobre el árbol de trabajo)

```
npm test       ->  Test Suites: 20 passed · Tests: 525 passed   (19,9 s)
npm run lint   ->  los tres paquetes limpios: 0 errores y 0 avisos
```

Los 28 avisos de `no-explicit-any` desaparecieron (Gravity los saldó el 08-03) y
el CI corre con `--max-warnings 0` desde `d653b5f`, así que ya no hay margen.

### Los 33 commits, por bloques

| Bloque | Qué |
|---|---|
| `470e5f6` → `c8a5d33` (08-03 tarde) | El `prisma generate` que faltaba en el CI · Node 22 · `--max-warnings 0` · los 28 `any` de `apps/web` · **el fallo del segundo turno del copiloto** · cada sonda dejaba un temporizador colgando |
| `ad920e7` → `79636b7` (08-03 noche) | **La partición de `HANDOFF.md`** en las cuatro memorias, `AI_ROLES.md` al día, y el primer `deploy.yml` |
| `3578f8d` (08-03) | Se lleva `ALANA.md` a git sin decirlo |
| `73ade8a` → `4418490` (08-05) | `CLAUDE_MODEL_*` de punta a punta y límite de tasa de Anthropic · degradación segura del arranque · **siete despliegues en rojo** |
| `8f0040d` → `b1f6bcb` (08-07) | Los tres obstáculos del despliegue (§4) · migraciones antes de la revisión · el CI ignora la bitácora |

### El fallo que más costaba encontrar: el segundo turno del copiloto (`9a45a58`)

Moría **siempre**, en cualquier conversación. `saveTurn` metía pregunta y
respuesta en el mismo `createMany` y `@default(now())` de Postgres devuelve la
hora de **inicio de la transacción**: las dos filas quedaban selladas con el
mismo instante al milisegundo. `history()` ordenaba solo por esa columna, el
empate lo deshacía el motor y lo deshacía al revés, así que el hilo rehidrataba
`ASSISTANT → USER → USER` y Anthropic —que exige que el primer mensaje sea del
usuario— devolvía un 400. Arreglado ordenando por `[createdAt, id]` y sellando
las dos filas a mano.

**Era invisible por tres capas sumadas**, y esto es lo que hay que recordar antes
de decir «no hay error en los logs»: `/copilot/chat` está fuera del log
automático de peticiones; el `catch` del controlador convierte el fallo en un
evento SSE **sobre una respuesta que ya salió con 200**, así que se clasifica
como `info` y Error Reporting no se entera; y la línea que sí se escribía
registraba el texto genérico que el usuario ya tenía en pantalla, no la causa.

### ⚠️ `CLAUDE_MEMORY.md` se contradice a sí mismo sobre `GOOGLE_REDIRECT_URI`

En la línea 26 dice que la variable «hoy vale `https://pmo-api-dummy-url.run.app/…`,
un host inventado», y sesenta líneas más abajo, que «ya vale
`https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback`, puesta el
2026-08-07». **Los dos textos entraron en el mismo commit** (`5482469`). Lo
comprobé contra GitHub: `gh variable list` da la **URL real**, actualizada hoy a
las 17:15 UTC, así que la primera línea es la caducada. Importa porque de esa
cadena depende que el login llegue a existir, y quien lea el documento por arriba
se queda con la versión falsa.

_De lo mismo:_ sigue pendiente **la otra mitad del login** —autorizar esa URI en
el cliente OAuth de la consola de Google—, y **un pipeline verde no lo prueba**:
la sonda solo mira `/health/ready`, y el 302 de `/auth/google` demuestra que
salimos hacia Google, no que Google nos acepte de vuelta.

### ⚠️ Dos variables de repositorio para lo mismo, y la que se tocó hoy no la lee nadie

`gh variable list` devuelve `WEB_URL` **y** `FRONTEND_URL`, las dos con
`https://pmo-frontend.vercel.app`. `deploy.yml` solo lee `vars.WEB_URL`
(`FRONTEND_URL` es una variable **de shell** dentro del paso, que se llama igual
por casualidad). `FRONTEND_URL` se actualizó hoy a las 17:37 UTC, veinte minutos
después del primer despliegue verde, **sin efecto ninguno**. Confirmado también
que a nivel de repositorio solo hay dos secretos —los dos de WIF—: el resto vive
en Secret Manager, coherente con lo que dice `CLAUDE_MEMORY.md`.

### 🟢 Cerrado: la fila del Inbox recuperó el teclado

`d358152` es el encargo de la sección 0 del handoff, hecho: `role="button"`,
`tabIndex={0}` y un `onKeyDown` con Enter/Espacio y `preventDefault`, más un
`stopPropagation` en el `onKeyDown` del botón ✨ Copiloto. Era mi apunte de los
dos cortes anteriores.

### ⚠️ Pero el botón anidado ha vuelto, ahora en ARIA

`EmailRow` devuelve dos `div` **uno dentro de otro y los dos con
`role="button"` y `tabIndex={0}`**: el envoltorio que alterna el hilo
(`InboxPage.tsx:427`) y el contenido de la fila (`:279`), que es su hijo. Es la
misma forma del problema que `0d2a4f4` vino a arreglar —un botón dentro de otro
botón— pero declarada con ARIA en vez de con HTML, y el validador no la ve.
Consecuencias concretas:

- **Dos paradas de tabulación por cada fila** en lugar de una.
- Las dos hacen cosas distintas: Enter sobre el envoltorio solo alterna; Enter
  sobre el contenido llama a `onRead` **y** burbujea al `onKeyDown` del padre,
  que vuelve a alternar (el hijo no corta la propagación). Con ratón siempre
  pasaban las dos cosas, así que no es un cambio de comportamiento: es que el
  teclado ofrece dos puertas que no se comportan igual.
- ARIA declara presentacionales a los hijos de un `role="button"`, así que qué
  anuncia el lector de pantalla del de dentro depende del producto.

Se arregla dejando `role`/`tabIndex` en **uno solo** de los dos.

### ⚠️ El handoff volvió a quedarse atrás, y esta vez al revés (histórico: el archivo ya no existe)

`66cf3ea` puso la cabecera en **`CERRADO` · asignado a nadie** y dejó en la
sección 0 el encargo del teclado del Inbox **«a la espera de que Doc lo active,
no arranques hasta que ponga `TRABAJAR`»**. Cuarenta y ocho minutos después,
`d358152` lo hizo. Es decir: el trabajo entró **mientras el documento decía que
no se empezara**, y hoy la sección 0 sigue describiéndolo como pendiente. Antes
el handoff pedía cosas hechas por despiste; aquí la regla de que el Estado lo
pone Doc se saltó en los hechos. **Cambiar ese campo es de Doc: anotado, no
tocado.**

Del mismo documento, sin cerrar por cuarto corte seguido: la **§9 sigue diciendo
«Lo que te toca a ti: manda `tz`»** (línea 629), hecho desde `2ceedd2`.

### Lo que se commiteó el 2026-07-30 por la tarde (2 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `b5995a7` | 07-30 18:02 | Los tres `catch (err)` sin usar de `CopilotDrawer.tsx` |
| `f9ce09b` | 07-30 18:04 | `HANDOFF.md`: reescribe la sección 0 caducada |

### Lo que se commiteó el 2026-07-30 a mediodía (3 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `eb4449d` | 07-30 12:42 | `GET /time/active` devuelve `null` de verdad · CI a `master` · migración que faltaba en el HANDOFF |
| `0d2a4f4` | 07-30 13:02 | **(Gravity)** eje X en hora local · `<div>` en vez de `<button>` anidado en el Inbox · **persistencia de hilos del copiloto** · métricas sin mock |
| `877c06c` | 07-30 13:03 | `HANDOFF.md`: sección 0 pidiéndole a Gravity que commitee |

### 🟢 Gravity commiteó: el árbol volvió a git

`0d2a4f4` es el commit que llevaba dos cortes pendiente. Lo que trae, verificado
archivo por archivo:

- **Copiloto** — las dos piezas del Sprint 6 (ver §4). `copilot.api.ts` nace
  rastreado, que era el archivo en riesgo.
- **Métricas sin mock** — fuera las 59 líneas de `MOCK_METRICS` y el
  `setTimeout(800)` que simulaba latencia; dentro
  `fetch('/api/dashboard/metrics?tz=' + tz)` con la zona del navegador. **El
  hallazgo rojo de los dos cortes anteriores queda cerrado.**
- **Eje X** — `new Date(dateStr + 'T00:00:00')` en `DashboardPage.tsx:41`. Es el
  arreglo correcto: `perDay` llega en `YYYY-MM-DD` ya en local y `new Date()` a
  secas lo interpretaba como UTC, corriendo cada barra un día.
- **Inbox** — el `<button>` que envolvía otros botones pasa a `<div>`. Queda
  pendiente de ver si al conectar el tablero con datos reales aparece el aviso
  del throughput a cero (`HANDOFF.md` §8): las tareas cerradas antes del
  2026-07-29 no tienen `completedAt`, así que la gráfica arranca plana y **no**
  está rota.

✅ El apunte de accesibilidad que dejó `0d2a4f4` —fila sin teclado— se cerró en
`d358152`, con la salvedad del `role="button"` anidado que anoto arriba.

✅ **La cabecera caducada del HANDOFF se cerró en `66cf3ea`**: pasó a `CERRADO`
con la tabla de dónde quedó cada uno de los cuatro frentes (§6, §7, §8 y §9).
Duró desde el 30 a mediodía hasta el 31 por la tarde. Lo que queda vivo del
documento es lo que anoto arriba: la §0 y la §9.

### ✅ Cerrado — el cambio de comportamiento que viajó dentro del commit del linter

`2ceedd2` se llama «chore: fix eslint config and styling» y su mensaje dice que
los 22 errores se arreglaron **«sin cambiar comportamiento»**. Pero uno de los
trozos no es un arreglo de lint: en `features/kanban/api/time.api.ts:102` añade
las dos líneas que mandan `tz` en `getTimeReport`. Eso es el encargo de
`HANDOFF.md` §9 —dominio de Gravity— hecho a medias por la terminal de backend,
sin que el mensaje lo mencione. **Se cierra el 2026-08-07 por defunción del
documento**: la §9 del handoff que seguía pidiéndolo desapareció con la partición
de `HANDOFF.md`, y `TimeReportResult` ya declara el campo `tz` en el árbol de
trabajo. _Lo que queda de esto es la lección, no la deuda: un mensaje de commit
que dice «sin cambiar comportamiento» y trae uno dentro cuesta que nadie sepa
quién entregó qué._

### Lo que se commiteó el 2026-07-30 por la mañana (3 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `2ceedd2` | 07-30 12:01 | ESLint configurado por primera vez + los 22 errores que destapó |
| `4b3db45` | 07-30 12:06 | `TASKS.md`: la verificación viva del corte de días y el linter |
| `0af5a28` | 07-30 12:10 | `HANDOFF.md`: cabecera nueva con los tres frentes ordenados para Gravity |

### Lo que se commiteó el 2026-07-29 y el 30 (7 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `27ef27e` | 07-29 16:46 | Cabeceras de seguridad (Helmet) y límite de peticiones |
| `e1abb2d` | 07-29 16:56 | `docs/SESSION-2026-07-29.md` |
| `417941f` | 07-29 17:12 | Filtros por etiqueta y por rango de vencimiento en `GET /tasks` |
| `795bae1` | 07-29 17:34 | La tarea dice por qué le subieron la prioridad (3 columnas + migración) |
| `4191bda` | 07-29 17:56 | **(Gravity)** tablero de métricas con datos falsos + auditoría de prioridad en la tarjeta |
| `8897ae1` | 07-30 11:39 | Módulo `metrics`: un solo motor de cálculo, dos proyecciones · `completedAt` |
| `3cffc21` | 07-30 11:46 | `GET /time/report` corta los días en hora local |

Módulos nuevos del backend: `modules/metrics/` (`metrics.service.ts` 275 ·
`metrics.types.ts` 88 · `metrics.service.spec.ts` 232) ·
`modules/tasks/completion.ts` (37, función pura) · `common/time-zone.ts` (72) ·
`common/security/throttle.config.ts` (44) · migración
`20260729160000_add_priority_audit`. `packages/shared` creció +100 líneas
(`DashboardMetrics` y los campos de auditoría de prioridad).

### ✅ Cerrado: el tablero de métricas ya no enseña números inventados

`MOCK_METRICS` desapareció de `useDashboardMetrics.ts` en `0d2a4f4`. Era el
hallazgo rojo de los despertares 2 y 3: una pantalla enchufada en `App.tsx`
(`DashboardPage as MetricsPage`) dando cifras plausibles y falsas sin nada en la
interfaz que lo dijera. Vivió desde el 29 a las 17:56 hasta el 30 a las 13:02.

**Queda un apunte de la misma vista, sin cerrar (reverificado el 2026-08-03):**
`features/dashboard/types.ts` sigue siendo una **copia a mano** del tipo, cuando
`HANDOFF.md` §8 avisa de que `DashboardMetrics` ya viaja en `@pmo/shared`. Dos
definiciones del mismo contrato que pueden separarse en silencio, y ahora que la
vista come datos de verdad, separarse significa pintar mal.

**Detalles de diseño que merece recordar:**
- `chat()` pasó de síncrono a `async`: resuelve proveedor, hilo y contexto
  **antes** de devolver el iterable, para que el 503/404 salga como error HTTP
  antes de escribir cabeceras SSE.
- Ventana de **20 turnos** al rehidratar; el turno se guarda al cerrar el stream
  (no por token), en transacción, y también si el cliente aborta a media
  respuesta.
- Título del hilo compuesto del primer mensaje, sin llamar al modelo.
- La bitácora va como **envoltorio** de cada acción, no como dos líneas sueltas
  en cada sitio: así no existe el camino en el que se registra el intento y se
  olvida el resultado. **Nunca propaga**: si falla el registro, la acción ya
  está hecha.

---

## 6. Contratos vigentes de la API (referencia rápida)

**Sesión:** dos cookies httpOnly, `path:"/"` — `pmo_session` (access, 15 min) y
`pmo_refresh` (refresh, 30 d). Ante 401 el frontend renueva con
`POST /auth/refresh`. El claim `typ` impide usar un refresco como acceso, y el
socket exige `typ: access` en el handshake.

| Área | Rutas |
|---|---|
| Auth | `GET /auth/google`, `/auth/google/callback`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout` |
| Tareas | `GET/POST /tasks`, `PATCH /tasks/:id`, `PATCH /tasks/:id/move`, `DELETE /tasks/:id` |
| Métricas | `GET /dashboard/metrics?from=&to=&tz=` (nuevo el 2026-07-30) |
| Correos | `GET /emails`, `GET /emails/:id`, `PATCH /emails/:id/status`, `POST /emails/:id/classify`, `POST /emails/:id/to-task` |
| Etiquetas | `GET/POST /tags` |
| Tiempos | `POST /time/:taskId/start`, `/stop`, `POST /time/stop`, `GET /time/active`, `GET/POST /time/entries`, `PATCH`/`DELETE /time/entries/:id`, `GET /time/report` |
| Copiloto | `GET /copilot/providers` · `POST /copilot/chat` (SSE) · `GET /copilot/threads` · `GET /copilot/threads/:id` · `DELETE /copilot/threads/:id` · `POST /copilot/tasks/create` · `POST /copilot/emails/send` · `GET /copilot/audit` |
| Webhooks | `POST /webhooks/gmail` (JWT OIDC de Pub/Sub verificado) |
| Salud | `GET /health` (compat) · `GET /health/live` · `GET /health/ready` (nuevas el 2026-07-31) |

**Las tres sondas de salud** (desde `37e634e`, las tres con `@SkipThrottle()`
porque quien llama es infraestructura y un 429 lo lee como «no está sano»):

| Ruta | Qué mira | Por qué separada |
|---|---|---|
| `GET /health` | nada, `{status:"ok"}` | **se queda igual a propósito**: `README` y `ARCHITECTURE` la citan y darle ahora profundidad cambiaría en silencio lo que hace para quien ya la use como sonda de reinicio |
| `GET /health/live` | nada | si el liveness consultara la base, **una base caída reiniciaría procesos sanos** |
| `GET /health/ready` | Postgres (`SELECT 1`) + Redis (`PING`), corte a 3 s | 503 con el motivo. Reiniciar no levanta la base: lo que toca es salir del balanceador |

El `PING` va **sobre el cliente de la cola `gmail-sync`**, no sobre una conexión
nueva: la pregunta no es si Redis vive, es si esta aplicación puede encolar —una
conexión nueva puede abrirse mientras la de BullMQ está rota, y entonces la
sonda mentiría—. Por lo mismo no se añadió `ioredis` como dependencia directa.
Y el 503 de readiness **se registra como aviso y sin marca de incidencia**: es
estado operativo esperado, no un defecto (ver §4).

**`GET /time/active` devuelve `null` de verdad desde `eb4449d`.** Respondía 200
con **cero bytes** y sin `Content-Type`: Nest traduce un `null` devuelto por el
controlador a cuerpo vacío, así que el `response.json()` del cliente reventaba
con «Unexpected end of JSON input» en cada montaje del tablero sin cronómetro
corriendo. Ahora se responde con `res.json()`: 4 bytes y `application/json`.
**El fallo estaba en la frontera, no en la lógica** —`findActive` ya devolvía
`null`—, que es justo por lo que las 423 pruebas de servicio no podían verlo; la
suite nueva (`time.controller.spec.ts`) mira lo que se le entrega a la respuesta
HTTP. Gravity había programado contra el contrato escrito: el que no lo cumplía
era el backend.

**Límite de peticiones por IP** (desde `27ef27e`): 240/min general · **20/min en
todo `/copilot`** (es donde una petición cuesta tokens) · 10/min en auth. El
webhook de Gmail va exento (`@SkipThrottle()`): quien llama es Pub/Sub y un 429
no lo disuade, lo reintenta con backoff perdiendo notificaciones; a esa ruta la
protege la firma OIDC. **Un 429 en el panel de chat no es un fallo: es el
límite** — la interfaz debería decirlo así. Hay un solo cubo `default` a
propósito: tres cubos con nombre en `forRoot` se aplican **todos** a cada ruta y
el más estrecho gobierna la API entera.

**Nuevo en `GET /tasks`:** `?tagId=` (repetible, por la relación `labels` del
modelo `Tag`, **no** por el arreglo de texto `tags` que extrae la IA) y
`?dueFrom=` / `?dueTo=` (incluye por abajo, **excluye por arriba**, y las tareas
sin fecha quedan fuera en cuanto se usa el rango). Varias etiquetas usan `some`,
que es lo que hace un filtro de facetas. Un id ajeno devuelve lista vacía, no
404.

**Nuevo en la tarea (viaja plano, así que llega igual en `GET /tasks`, en el 201
de `POST /tasks` y en los eventos `task.*`):** `priorityReason`,
`priorityAdjustedAt`, `priorityAdjustedFrom`. Se escriben en los tres sitios
donde se ajusta la prioridad (alta manual, vía de IA, barrido de vencidas) y
**solo si hubo ajuste**. Denormalizado y no tabla aparte por decisión de Doc:
`adjustPriority` nunca baja la prioridad, así que el último ajuste *es* la
explicación vigente.

**`GET /dashboard/metrics`** — ventana por defecto de 7 días, cortada en
`America/Mexico_City`; `from` inclusivo, `to` exclusivo. Zona inventada o
ventana al revés dan **400**. Las series traen **todos** los días de la ventana
(incluidos los de cero) y `byStatus`/`byPriority` **todas** las claves del enum:
el cliente no rellena huecos ni le baila la leyenda. `wip` es solo
`IN_PROGRESS`; las atrasadas van aparte en `overdue`. Las fechas de `perDay`
llegan en `YYYY-MM-DD` **ya en local** — pasarlas por `new Date(...)` las
correría un día.

**`GET /time/report` acepta `?tz=`** desde `3cffc21`, con el mismo defecto, y
devuelve `tz` en la respuesta. Cambia el reparto entre barras, **no el total**;
`groupBy=task` no se toca; `from`/`to` siguen sin reinterpretarse.

⚠️ **El throughput arranca en cero.** `completedAt` existía desde el Sprint 1 y
no la escribía nadie; se enciende ahora, y las tareas cerradas antes del
2026-07-29 no tienen fecha: cuentan en `byStatus.DONE` y **no** en el
throughput. Decisión de Doc: mejor una gráfica que empieza vacía y es verdad que
una rellenada con `updatedAt`.

**Sockets** (`ws://localhost:3000`, namespace por defecto, handshake con cookie,
sala por `userId`):
`task.created` · `task.updated` · `task.reordered` · `task.deleted` ·
`email.updated` · `time.started` · `time.stopped` · `time.deleted`

**Supresión de eco:** el cliente manda su `socket.id` en la cabecera
`X-Socket-Id` y el backend emite con `.except(socketId)`. El `socket.id` cambia
en cada reconexión: hay que leerlo en el momento de la petición.

**Un arrastre emite dos eventos en este orden:** `task.updated` primero,
`task.reordered` después. Al revés, el reordenamiento llegaría con un id que la
columna todavía no tiene.

**SSE del copiloto:** se consume con `fetch` + `ReadableStream`, **no con
`EventSource`** (solo hace GET y no manda cuerpo). Eventos: `token`, `tool_call`,
`done`, `error`. Hay que acumular en búfer, usar `decode(value,{stream:true})` y
cancelar con `AbortSignal`. Un turno con borrador puede no traer ni un `token`.
El evento `done` trae `threadId` (lo añade el servicio, no el proveedor): en una
conversación nueva el cliente no lo conoce hasta que el backend la crea.

**Las dos tarjetas de confirmación** (mismo patrón: el copiloto propone, la
persona confirma):

| `toolName` del `tool_call` | Se confirma contra | Devuelve |
|---|---|---|
| `draft_email` | `POST /copilot/emails/send` | 200 con `{ id, threadId, transport }` |
| `create_task` | `POST /copilot/tasks/create` | 201 con la tarea, igual que `POST /tasks` |

En `create_task`: `priority` siempre viene (`MEDIUM` si el modelo no la dijo),
`dueDate` es `null` o ISO válida (nunca "Invalid Date") y `sourceEmailId` trae
el correo del que salió si había uno abierto. **Hay que mandar `x-socket-id`**:
la tarea se anuncia por socket como cualquier otra y sin la cabecera se pintaría
dos veces. Un `toolName` desconocido se ignora sin romper.

---

## 7. Notas de operación (trampas conocidas)

Todas están en `AI_ROLES.md`; las repito porque son las que hacen perder tiempo.

1. **`start:dev` lleva `--max-old-space-size=4096`.** Los tipos de `googleapis`
   son enormes; con el heap por defecto el supervisor muere de OOM a los ~45 min.
   **El síntoma engaña:** muere el padre, el hijo sobrevive, `/health` sigue
   dando 200 y **el hot-reload deja de funcionar en silencio**.
2. **Un solo `dev:api` a la vez.** Dos watchers escriben en `apps/api/dist` y se
   pisan; el `dist` se queda en una versión anterior a su fuente. Comprobar con
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`.
2b. **El mismo heap hace falta en `build` dentro de un contenedor**, donde Node
   lo dimensiona según la RAM que le hayan dado: sin él, `nest build` muere con
   `Aborted (core dumped)` y código 134, que se lee como fallo del compilador y no
   como falta de memoria.
3. **No ejecutar `nest build` con el watcher levantado** — el build borra `dist`
   bajo los pies del watcher y su hijo muere con `Cannot find module dist/main`.
   Para comprobar tipos con el servidor arriba:
   `npx tsc -p apps/api/tsconfig.spec.json` (lleva `noEmit`).
4. **Matar node por puerto, no por PID** (el hijo sobrevive al padre):
   `Get-NetTCPConnection -LocalPort 3000 -State Listen | ... Stop-Process -Force`.
   ⚠️ **Y matar el puerto tampoco basta** (añadido el 2026-08-03): ese proceso es
   el último eslabón de cuatro —`npm run dev:api` → `start:dev` → `cross-env` →
   `nest start --watch`— y el watcher vuelve a levantarlo. El 08-03 había **tres
   cadenas completas** a la vez. Para reiniciar de verdad hay que filtrar por
   línea de comando.
5. **El cron de vencidas vive en Redis** (job repetible de BullMQ), no un `@Cron`
   en proceso — con varias instancias correría en todas.
6. **`COPILOT_EMAIL_TRANSPORT=mock`** — sin esa línea, cada clic en «Enviar» del
   borrador manda un correo **de verdad** desde el Gmail del usuario. Decisión de
   Doc: el entorno local se queda simulado; el transporte real lo valida QA en
   staging.

---

## 8. Entorno (`.env`, solo presencia — sin valores)

**Definidas:** `NODE_ENV`, `API_PORT`, `WEB_URL`, `API_URL`, `DATABASE_URL`,
`REDIS_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GMAIL_PUBSUB_TOPIC`,
`GMAIL_PUBSUB_ALLOW_UNSIGNED`, `ANTHROPIC_API_KEY`, los tres `CLAUDE_MODEL_*`,
`GEMINI_API_KEY`, `COPILOT_EMAIL_TRANSPORT`, `WHATSAPP_VERIFY_TOKEN`.

**Vacías:** `GOOGLE_CLOUD_PROJECT`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` (coherente: Sprint 7 sin abrir).

**Faltan en `.env` respecto a `.env.example`:** `OVERDUE_CRON`,
`GMAIL_PUBSUB_AUDIENCE`, `GMAIL_PUBSUB_SERVICE_ACCOUNT` — los dos últimos son los
que validan el push de Pub/Sub. Con `GMAIL_PUBSUB_ALLOW_UNSIGNED` presente en
local, cuadra.

**Nuevas en `.env.example` desde `0439a3b`, ausentes de `.env`:** `LOG_FORMAT`
(`gcp` si `NODE_ENV=production`, `pretty` fuera), `LOG_LEVEL` (`info` en
producción, `debug` fuera) y `SERVICE_VERSION`. Las tres tienen valor por
defecto, así que en local no falta nada.

✅ **`GOOGLE_CLOUD_PROJECT` ya no está apagada en producción.** Era mi apunte
del corte anterior: sin ella `traceFieldsFrom` devuelve `{}` y las líneas de una
misma petición dejan de agruparse, **sin error y sin aviso en Cloud Logging**.
`deploy.yml` la pone a mano en el `--set-env-vars`, que es lo que había que
recordar porque **Cloud Run no la inyecta** (inyecta `K_SERVICE` y `K_REVISION`).
En local sigue vacía, y ahí no molesta.

### Lo que recibe la revisión de Cloud Run (2026-08-07)

| Vía | Variables |
|---|---|
| `--set-env-vars` | `NODE_ENV=production`, `LOG_FORMAT=gcp`, `GOOGLE_CLOUD_PROJECT`, `WEB_URL`, `GOOGLE_REDIRECT_URI`, `SERVICE_VERSION=<sha>` y los `CLAUDE_MODEL_*` **solo si están puestos** |
| `--set-secrets` (Secret Manager) | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` |
| Cloud Run | `PORT` — **manda sobre `API_PORT`**: si el contenedor no escucha ahí, la revisión no pasa la sonda de arranque y el error habla de contenedor, no de puerto |

Los tres ids de modelo van **opcionales a propósito**: el código trae valor por
defecto y lo dice en el log de arranque, así que una que falte cambia el modelo
en vez de tumbar el despliegue. Es lo contrario de `GOOGLE_REDIRECT_URI`, que no
se puede adivinar y por eso sí para el despliegue. Hoy los tres salen como no
definidos en los avisos del run.

## 9. Pruebas y CI

- **535 pruebas en 21 suites**, ejecutadas el 2026-08-12 sobre el árbol (68,8 s).
  Antes eran 525 en 20, y antes 497 en 18. La suite nueva es `health.spec.ts`:
  las diez que faltaban cubren la sonda de esquema de `0c6c238`.
- `npm run lint`: **0 errores y 0 avisos** en los tres paquetes, ejecutado el
  2026-08-12.
- ⚠️ **Corrección a lo que escribí abajo: el CI sí mira el frontend.** `npm run
  build` de la raíz construye los tres paquetes, y el 08-07 **tumbó el CI dos
  veces seguidas** (`31206448510` y `31206463690`) con
  `src/lib/api.ts(8,37): error TS2339: Property 'env' does not exist on type
  'ImportMeta'` — el commit que puso la URL de producción en el frontend
  (`5a8e15f`) no compilaba, y quien lo destapó fue el guardarraíl, no una
  persona. `dbeb4d5` lo cerró añadiendo `vite-env.d.ts`. Lo que **nadie** hace
  desde este repo es **desplegar ni sondar** `apps/web`; construirlo sí se
  construye.
  El CI corre con `--max-warnings 0` desde `d653b5f`, así que ya no queda margen:
  un aviso nuevo es un rojo.
- ✅✅ **Se acabó la suposición: `gh` está instalado y autenticado.** Era la
  frase que arrastraba tres cortes seguidos —«que *pueda* dispararse está
  comprobado; que *se haya* disparado, no»— y hoy los runs se miran desde aquí.
  Lo que se ve:

  | Run | Qué |
  |---|---|
  | `31201583614` | **Primer despliegue en verde de la historia del proyecto** (17:17 UTC) |
  | `31203892703` | El de HEAD, verde con las migraciones dentro (17:46 → 17:50) |
  | `31199020603`, `31203481234` | Los dos rojos de hoy: los 403 de Cloud Run privado y el `--args` sin igual |

- **Y el verde es de verdad, no de comando que salió con 0.** El último paso
  sonda `/health/ready` contra la revisión recién desplegada: `intento 1: 200`
  con `database up` (53 ms) y `redis up` (24 ms). Lo repetí yo mismo contra la
  URL pública y da lo mismo. Es la primera prueba viva de que **Neon y Upstash
  responden desde la revisión que publicó la pipeline**, no desde una manual.
- **La migración también corrió de verdad**: `Execution [pmo-api-migrate-pkg6z]
  has successfully completed`. El `P3005` que se temía no apareció.
- **Ojo con lo que aún no cubre ningún guardarraíl:** el CI y el despliegue
  miran la API entera y **nadie mira el frontend**. `apps/web` no se construye ni
  se despliega desde este repo —Vercel lo hace por su cuenta— y el 404 de §5
  habría salido en la primera petición de cualquier comprobación de extremo a
  extremo. Sigue sin haber E2E: movido al backlog el 2026-07-31 por Doc.
- **El `prisma generate` que faltaba** (`dd99adb`) tuvo el CI tres runs en rojo:
  el cliente de Prisma es código generado, en una máquina de desarrollo lo dejó
  `prisma migrate` hace semanas y en un CI que parte de `npm ci` no lo ha generado
  nadie, así que el build se caía con errores **que parecen del código**. Ahora
  hay un `prebuild` en `@pmo/api`.
- ⚠️ **`TASKS.md` va por detrás por sexto corte, y ahora además afirma de más.**
  No se toca desde el 08-07 (`5a8e15f`, una línea). La 192 sigue diciendo
  **«497 pruebas en 18 suites»** (son **535/21**) y **«`gh` no está instalado en
  la máquina»** (lo está desde el 08-07). Y la 201 ya no es solo foto vieja: está
  marcada `[x]` y dice «API desplegada en Cloud Run **y Frontend en Vercel por el
  pipeline CI/CD**». **El pipeline no despliega el frontend**: no hay workflow que
  lo publique: lo construye Vercel por su cuenta con el `vercel.json` de
  `ccbd498`. Una casilla marcada que describe algo que no existe es peor que una
  sin marcar.
- ⚠️ **El hueco del histórico ya no es un hueco, es un cambio de costumbre.**
  `docs/` se para en `SESSION-2026-07-31.md`: el 08-03, el 08-05 y el 08-07 no
  tienen acta, y son los tres días del despliegue. Lo que sí hay es el relato
  dentro de `CLAUDE_MEMORY.md`, `GRAVITY_MEMORY.md` y `DOC.md`, que desde
  `a1e9554` hacen de bitácora viva. **No es una pérdida, pero conviene decidirlo
  en vez de heredarlo**: si las memorias sustituyen a las actas, `docs/` sobra; si
  no, faltan tres.

## 10. Deuda abierta

> Estado al **2026-08-12**. Lo anterior a esta línea se conserva por historia;
> lo vigente es esto.

### 🔴 Lo rojo hoy

**El frontend solo lo puede ver su dueño.** `WEB_URL` ya no apunta a la
aplicación ajena —eso se arregló el 08-10— pero el dominio nuevo
(`pmo-frontend-antoniosanchez-5466s-projects.vercel.app`) responde **302 hacia
`vercel.com/sso-api`** a cualquiera sin sesión en esa cuenta de Vercel. Para el
dueño el producto funciona; para todos los demás el login termina en la puerta
de Vercel. Detalle y comprobación en **§14**.

### ✅ Cerrado el 2026-08-12 (verificado, no leído)

- **Las tres roturas del §12**: `API_BASE` sin `/api`, el socket ya no apunta a
  `localhost` en producción, y no queda una sola llamada con `/api` relativo.
- **La cookie cross-site**: `sameSite: none` + `secure` en producción, con el
  `lax` del `state` de OAuth conservado **a propósito y razonado**.
- **`WEB_URL` apuntando a otra aplicación** (§13), la causa del 404 del login.
- **La sonda de salud ahora mira el esquema**, no solo la conexión.

### Lo que se cerró en el corte del 2026-08-07

- ✅ **`MOCK_TASKS` como respaldo del `catch`** — el gemelo de `MOCK_METRICS`,
  sobre la superficie de trabajo principal. En el árbol, **sin commitear**.
- ✅ **El refactor de `handleDragEnd`** — la única deuda de arquitectura
  declarada (`AI_ROLES.md`), viva desde el 2026-07-27. En el árbol, sin commitear.
- ✅ **Los dos contratos duplicados a mano** (`DashboardMetrics` y el `tz` de
  `TimeReportResult`). En el árbol, sin commitear.
- ✅ **`GOOGLE_CLOUD_PROJECT`**, que apagaba en silencio la correlación por traza:
  `deploy.yml` la inyecta (§8).
- ✅ **`AI_ROLES.md` ya no nombra `HANDOFF.md`** (pendiente nº 1 de `DOC.md`).
- ✅ **El guardarraíl entero, comprobado corriendo**: CI verde, despliegue verde,
  sonda viva. Ya no es «debería salir en verde».

### Lo que sigue abierto

- ⚠️ **El login no está probado y el verde no lo prueba**: falta autorizar
  `https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback` en el cliente
  OAuth de la consola de Google. Hasta entonces, `redirect_uri_mismatch` desde la
  pantalla de Google —un error que parece del cliente y no del despliegue.
- ⚠️ **`CLAUDE_MEMORY.md` se contradice** sobre esa misma variable (§5).
- ⚠️ **`role="button"` anidado en el Inbox**, reverificado hoy: `InboxPage.tsx`
  lo lleva en `:283` y en `:431`, los dos con `tabIndex={0}`, uno dentro del otro.
  Dos paradas de tabulación por fila y el botón dentro del botón otra vez, ahora
  en ARIA, donde el validador no lo ve. Se arregla dejando `role`/`tabIndex` en
  **uno solo** de los dos.
- ⚠️ **`TASKS.md` con la foto vieja** y **`docs/` parado el 07-31** (§9).
- **`mockTasks.ts` se queda en el disco** sin que lo importe nadie.
- **Peso de la imagen: ~882 MB**, de los que `googleapis` son 204 para usar solo
  Gmail. `@googleapis/gmail` ahorraría ~190, pero toca varios archivos. _Ojo:
  Docker 29 reporta el tamaño **comprimido** (153 MB) en `docker images`._
- **El bundle del frontend, 794 kB** desde que entró Recharts. Vite ya lo comenta.
- **`FRONTEND_URL`**, variable de repositorio que no lee ningún workflow (§5).
- **Herramienta del copiloto para mover correos** — en el backlog, pendiente de
  decisión de Doc, y con confirmación humana obligatoria: un correo es texto de un
  desconocido y una herramienta que mueva sola es una puerta a la inyección de
  instrucciones.
- **Runbook y backups** — las dos casillas que le quedan al Sprint 8 además del
  frontend.
- El `forbidNonWhitelisted` global sigue fuera **a propósito**: es zona compartida.

## 11. Bitácora de Alana

| Fecha | Qué revisó | Corte de git |
|---|---|---|
| 2026-08-20 | **Fase 4 cerrada: la comprobación final (§34).** Barrido de cierre, no para repetir lo escrito sino porque **firmar una fase con lo que recuerdo de ayer sería el error que esta fase vino a corregir**. Comprobado hoy pieza por pieza: respaldos de Cloud SQL `enabled: true` **con PITR**, `sslMode: TRUSTED_CLIENT_CERTIFICATE_REQUIRED` y sin redes autorizadas, los **tres crones ENABLED**, revisión viva `pmo-api-00070-rkb`, **614 pruebas en 30 suites ejecutadas por mí**, y el repositorio sincronizado con mis siete commits en `origin`. Y `TASKS.md` ya registra la clausura, el simulacro con sus 394 filas, la regla del cliente de Postgres, los CRLF y la comprobación por tubería — antes no sabía nada del 19-08 y mentía por omisión en lo más importante del día. De paso corregí el `README` del respaldo, que enseñaba a restaurar **a mano contra la instancia**, algo que ya no se puede hacer desde el 18 y que además usaba `--clean --if-exists`, justo las banderas contra las que el script pone una guarda. **Lo único que queda de la 4**: `ipv4Enabled` sigue en `true` — no entra nadie, pero el cierre limpio es `--no-assign-ip`, y como reinicia la instancia lo ejecuta el Jefe cuando le venga bien. **Lo que pasa a la Fase 5, y es lo primero**: nadie vigila los fallos del job de respaldo. El 19-08 estuvo roto entre las 22:12 y las 22:54 y lo supimos **porque estábamos delante**; a las 03:30 el silencio habría sido idéntico al de un respaldo correcto. Es el mismo agujero que la Fase 4 vino a tapar, en el único sitio donde no se tapó, y en la pieza que protege todo lo demás. **Lo que la fase deja escrito**: una pieza puede estar puesta, conectada y con el interruptor en `false`; un canal puede existir y no entregar nada; un archivo puede pasar su propia verificación y ser inservible; y una comprobación puede pasar por casualidad. Ninguna de las cuatro la habría encontrado una revisión de diseño. **Una fase no se cierra porque las piezas estén: se cierra cuando el mensaje llega al otro lado.** Añadida la sección 34. | `a3f662b` · revisión `00070-rkb` |
| 2026-08-19 | **La bóveda, probada (§33).** `SIMULACRO CORRECTO: … se restaura y trae 394 filas` — Email 172, Task 145, ChatMessage 35, CopilotAuditLog 27, migraciones 9, ChatThread 5, User 1. Un volcado del bucket restaurado sobre una base vacía, devolviendo correos y tareas reales. **El punto 1 del acuerdo con Doc queda cerrado con hechos.** **Cinco intentos, y ninguno era el respaldo**: (1) mi sustitución del nombre de base era global y sin anclar, y la ruta del socket contiene `/pmo`, así que el proxy pidió una instancia inexistente; (2) `unrecognized configuration parameter "transaction_timeout"` — un `pg_dump` 18 escribe directivas de PG17+ **dentro del archivo** y el servidor es 16, **error mío de razonamiento que además le hice cambiar al Jefe**, que tenía razón desde el principio; (3) `$'\r': command not found`, Git convirtió `respaldo.sh` a CRLF y `gcloud builds submit` sube el árbol de trabajo tal cual; (4) `Source hash … does not match destination hash 1B2M2Y8AsgTpgAmY7PhCfg==`, mi comprobación leía por tubería y `pg_restore --list` la cerraba antes de tiempo. **Lo que descubrió, y justifica todo**: **los cuatro volcados anteriores no se podían restaurar** — escritos por un cliente 18 contra un servidor 16, ni uno habría vuelto, y durante más de un día fueron la única protección de la base. `pg_restore --list` decía que estaban bien y era cierto: **leer el índice no es devolver los datos**. Y **mi propia comprobación pasaba por casualidad**, porque los archivos de 200 KB cabían en el búfer de la tubería; el primero de 270 KB la destapó — no una pieza desconectada, sino **una que parecía funcionar**. **Queda**: el job `pmo-respaldo-db` sigue en `v5` con la comprobación rota (sube el archivo y muere después), se arregla con `v6` ya commiteada; y **nadie vigila los fallos de ese job** — la alerta de Capa 2 mira la ausencia de push, no esto. `TimeEntry` con 0 filas no es fallo de la restauración: está vacía en producción, el registro de tiempos no se usa. **La lección**: cuatro errores que ningún repaso de diseño habría encontrado, y que aparecieron todos en cuanto alguien intentó **usar** el respaldo en vez de mirarlo. **Un respaldo no se audita: se restaura.** Añadida la sección 33. | `96ba4af` · imagen `v5` |
| 2026-08-18 (4) | **El parche de Cloud SQL y el segundo barrido (§32).** **Los dos interruptores de §31, cerrados y comprobados**: respaldos `enabled: true` con **PITR**, archivado de registros a Cloud Storage, 7 copias y 7 días de logs; y `requireSsl: true` con `authorizedNetworks` **vacío**. Mi job de `pg_dump` deja de ser la única red. **Matiz**: `sslMode` quedó en `TRUSTED_CLIENT_CERTIFICATE_REQUIRED`, que no es «exige cifrado» sino **exige certificado de cliente** — el proxy no se entera, pero una conexión directa ya no entra ni con TLS; escrito para que nadie lo afloje el día que falle. `ipv4Enabled` sigue en `true`, aunque sin redes autorizadas no la alcanza nadie. **El parche costó un barrido**: la operación reinició la instancia (22:02:55→22:14:48) y a las 22:05:11 el cron de vencidas se llevó un `P1001` y devolvió 500. **Y la alerta sonó sola** — `ALERTA · Error 500 en POST /cron/overdue` —: **primera vez en esta bitácora que el sistema avisa de un incidente antes de que yo lo encuentre mirando**, y encima uno no provocado. A las 22:18 `/health/ready` da **200** con `database up`, 9 migraciones aplicadas y 0 a medias, `redis up`. **🟠 Upstash tiene fecha**: **297 k de 500 k** comandos al 18 de agosto (59 %), con un ritmo medido de **~18 k/día** (vie 21k, sáb 15k, dom 13k, lun 21k, mar 20k). Quedan 203 k y 13 días: **el tope se alcanza hacia el 29-30**, antes del corte mensual. Y el gasto **no es trabajo, es sondeo** —19 comandos/min en reposo, §20—, y con `--no-cpu-throttling` la instancia vive más rato, así que va a más. Falta confirmar qué hace Upstash al llegar al tope; si rechaza comandos, se cae la cola y con ella la ingesta. **🟡 Vercel sano pero redesplegando documentación**: plan Hobby, producción en verde, consumo ridículo (302 peticiones de 1 M en 30 días), y **el último despliegue es `cea0145`, un commit solo de `.md`** — Vercel no tiene el `paths-ignore` de `ci.yml`, así que «hay un despliegue nuevo» ha dejado de significar nada. Las 302 peticiones son además un dato de producto: el tablero apenas se abre. No pude abrir la lista completa de despliegues, la consola dejó de responder. **La lección**: hoy no hizo falta ir a mirar, el sistema lo contó solo — y aun así **los topes de los planes gratuitos no avisan, llegan**, y la alerta nueva no los ve porque vigila el silencio de los push, no el saldo de un cubo en la consola de otra empresa. Añadida la sección 32. | `cea0145` · revisión `00065-jsc` |
| 2026-08-18 (3) | **Despertar 14. La migración a Cloud SQL, auditada (§31).** Catorce commits desde `4c564f2`; `HEAD` = `cea0145`, árbol limpio, revisión viva `00065-jsc`, **610 pruebas en 29 suites ejecutadas por mí**. Y **`ALANA.md` no aparece en el diff**: nadie se lo llevó de polizón, primera vez en cuatro. **Lo grande funcionó**: los `P1001` se acabaron — el último es del 17-08 a las 16:47 contra el host de Neon y desde la migración **ninguno**, de 22 en 7 días a cero. **Y el parte de Gravity sobre el respaldo es cierto pieza por pieza**: proxy montado en el job (`cloudsql-instances`), `roles/cloudsql.client` en su cuenta, **tres ejecuciones correctas** (17:16, 17:34, 19:11) con tres volcados reales de 203–211 KB e índice legible, y `--set-cloudsql-instances` escrito en `deploy.yml` en los **dos** sitios. El 🔴 que cazó Claude en `d226f00` estaba bien visto y bien cerrado. **🔴 Pero los respaldos automáticos de Cloud SQL están APAGADOS**: `backupConfiguration.enabled = false`, con la retención de 7 copias y la ventana de las 05:00 configuradas y la casilla en `false` — y **esa era la razón de la migración**. Lo único que respalda hoy la base es el job de `pg_dump` que diseñé como puente provisional para Neon. **🔴 Y la base tiene IP pública sin exigir cifrado**: `requireSsl=false`, `sslMode=ALLOW_UNENCRYPTED_AND_ENCRYPTED`, dos redes autorizadas —el «parche temporal» de la IP de casa sigue puesto y `34.24.236.30/32` no está documentada—, y el `.env` local sigue apuntando a la IP pública: la cadena de producción vive en un portátil y viaja por internet contra un servidor que acepta texto plano. **`DATABASE_URL` ya sale de Google Cloud**, y no por decisión sino por residuo. **🟠 Dos derivas**: el job de respaldo se configuró a mano y solo vive en la consola —la misma deriva de `--no-cpu-throttling`, otra vez—, y mi propio `README` de `infra/backup/` ya miente: dice que respalda Neon y fija `PG_MAJOR=18` cuando el servidor es Cloud SQL **POSTGRES_16**. Instancia `db-f1-micro` `ZONAL`, sin alta disponibilidad. **La lección**: ya no es una pieza puesta y desconectada, es una pieza puesta, conectada **y con el interruptor en `false`** — nada de lo que se mira dice que falte algo, hay que ir a buscar el booleano. Y una a mi cuenta: **un parche que nadie retira se convierte en la arquitectura** sin que nadie decida que lo sea. Añadida la sección 31. | `cea0145` · revisión `00065-jsc` |
| 2026-08-18 (2) | **Veredicto de entrega: la alerta llegó (§30).** Entré al espacio «Alertas PMO» de Google Chat en modo estricto de lectura, que es la comprobación que venía pidiendo desde §27.8. **CONFIRMADA, y por identificador**: el mensaje está publicado por `Alertas API Capa 1` con marca **«Ayer 5:53 p.m.» = 22:53 UTC** y lleva dentro `job=105` y `request_id req_011Ce99Bqd7KhyUyKVfNGbMh`, **el mismo** que la línea del log de las `22:53:04.815Z`. Ya no es *ausencia de error*: es **constancia de llegada**, con la cadena entera probada —modelo inexistente a propósito → reintentos agotados → oyente de la cola de fallidos → `AlertService` → webhook → mensaje—. **Llegó uno de los dos, y es lo correcto**: en `alert.service.ts` el `logger.warn` es incondicional y el envío pasa después por un `SET NX EX` de 15 min con el título como clave; los dos avisos comparten título y se llevan 74 s, así que el segundo se calló **por diseño**. La prueba validó la entrega **y** el antirrebote en la misma pasada, y `job=106` no se perdió: está en el log, que es la fuente de verdad. **Bloque 1–5 ejecutado**, cuatro commits atómicos en local: `8092852` (línea 213 de `TASKS.md`, que registraba como logro lo que rompió la clasificación), `f895925` (`--no-cpu-throttling` en `deploy.yml`, con el precio anotado), `83aa449` (la política a `infra/alert_policy.json` —existía en tres sitios y ninguno era la fuente— y el paso que faltaba en `GCP_SETUP.md`: crear `ALERT_WEBHOOK_SECRET`), `64fca42` (`.githooks/pre-commit` + `AI_ROLES.md`). **El gancho está probado**: con `ALANA.md` y un archivo bajo `packages/` a la vez sale con **código 1**, y luego deja pasar un commit legítimo — no iba a añadir otra pieza puesta y desconectada. **Sin `push`**: subirlos dispara CI y una revisión nueva, queda a decisión de Doc. **La lección, por una vez del derecho**: esta junta sí estaba conectada, y se supo **mirando el otro extremo** — no del código, ni del parte, ni de la ausencia de un error. Añadida la sección 30. | `64fca42` (local) · `155e592` (origin) |
| 2026-08-18 | **Despertar 13. La Fase 4 cerrada y contrastada (§29).** Primer despertar con la directiva ampliada —puedo escribir en todo el repositorio y usar Chrome previo acuerdo—; sigo comprobando igual. `HEAD` = `155e592`, local y remoto idénticos, revisión viva `00057-ksl`, **601 pruebas en 29 suites ejecutadas por mí**. **Los tres 🔴 resueltos**: `CLAUDE_MODEL_CLASSIFY` = `claude-sonnet-5` y la clasificación **funciona** (hoy 13:42, `isActionable=true, 2 tareas creadas`); `ALERT_WEBHOOK_URL` está en el entorno de la revisión viva; y la Capa 1 **dispara de verdad**. **Y aparece la causa exacta de §27.5, con fecha**: el secreto contenía el texto de relleno —cada alerta moría con `Failed to parse URL from TO_BE_FILLED_BY_USER`— hasta la **versión 2, del 17-08 a las 18:39:54**. El canal existía desde el 14 y no llegaba nada, tres días. **La prueba de punta a punta, casi entera**: el 17 a las 22:53 y 22:54, con `modelo-inexistente-prueba-e2e` puesto a propósito, dos alertas recorrieron fallo → reintentos agotados → oyente de la cola de fallidos → envío, **sin ningún error detrás**. Pero `AlertService` **no registra el éxito, solo el fallo**, así que tengo *ausencia de error*, no *constancia de llegada* — falta mirar el espacio de Chat. **La tabla del Jefe, comprobada una a una**: el 🔴 de `TASKS.md` es cierto (la línea 213 registra como logro el cambio que rompió producción); la disciplina de `git add` es cierta y con caso —`ce5b7de`, titulado «Update GRAVITY_MEMORY.md», commiteó **1.542 líneas de `ALANA.md`**, 71 de `DOC.md` y un archivo de código, y **no hay ningún gancho de git**—; `--no-cpu-throttling` está aplicado a mano pero no en `deploy.yml`; **`GCP_SETUP.md` ya no está desactualizado** (sí tiene dos «Paso B», ningún «Paso C», y no menciona `ALERT_WEBHOOK_SECRET`); y `alert_policy_v2.json` sigue sin seguimiento y duplica el manual. **Abierto de lo mío**: Neon sigue perdiendo trabajo en frío —el 17 dos clasificaciones perdidas por `Can't reach database server`, con aviso pero sin reintento—, la deduplicación sin verse disparar, y la versión 1 del secreto sigue `enabled`. **La lección**: los cuatro fallos de esta fase no estaban dentro de ninguna pieza, sino **en la junta entre dos**, y ninguno era un error de programación. Añadida la sección 29. | `155e592` · revisión `00057-ksl` |
| 2026-08-14 (7) | **🔴 La clasificación está rota en producción (§28).** Lo que en §27.4 escribí como riesgo ocurrió: `22:45:52 ERROR Falló la clasificación … HTTP 404 · {"type":"not_found_error","message":"model: claude-3-sonnet-20240229"}`. **Anthropic no sirve ese modelo**: la función que decide qué es accionable y crea tareas **no funciona** sobre la revisión viva `00046-64q`. Desde las 22:15 no hay ni un `Resultado de IA`; cuatro correos han entrado a clasificarse y ninguno ha salido. El último éxito es de las 21:32, con `claude-sonnet-5`, antes de que la variable existiera. La cadena entera: yo señalé la variable como **ruido de arranque** (§19.4-E) → se «limpió» a un modelo de junio de 2024 (§26.4) → se «revirtió» a uno de febrero de 2024 (§27.4) → **404**. **Y la alerta estaba muda**: trece minutos antes, `ALERT_WEBHOOK_URL no está configurada: las alertas se registrarán en el log pero no se enviarán a ningún sitio`. La Capa 1 **sí llegó a producción** —`adf2efe` incluye `a23202d`, resuelto §27.2— pero sin URL, porque `ALERT_WEBHOOK_SECRET` sigue sin existir y `deploy.yml` toma el `else`. Así que **el primer fallo real que el sistema de alertas tenía que contar no se lo contó a nadie**: es la demostración que pedía §27.8 y llegó sola. **Dos cambios de un minuto, ninguno de código**: `CLAUDE_MODEL_CLASSIFY` → `claude-sonnet-5` (el valor que funcionaba y el que el código trae por defecto), y crear `ALERT_WEBHOOK_SECRET` con el nombre del secreto que existe desde las 21:49. Y una lección mía: **señalar algo como ruido invita a callarlo, no a arreglarlo** — enumerar molestias sin decir cuál es el arreglo correcto es repartir trabajo mal definido. Añadida la sección 28. | `adf2efe` · revisión `00046-64q` |
| 2026-08-15 | **Despertar 12. La Capa 1 y la Capa 2, contrastadas (§27).** **Arreglado de §26 y bien arreglado**: la política de errores desapareció y en su sitio hay una de **ausencia** —`conditionAbsent` sobre `push_request_count` de `gmail-ingest-push`, 23,5 h—, que es exactamente la alerta por silencio que faltaba y que **sí** habría visto la avería del día 20; `retryPolicy` puesta a `10s/600s`; y **597 pruebas en 29 suites, ejecutadas por mí**, con las cuatro suites nuevas —`alert.service`, `cron.controller`, `cron-auth.guard`, `overdue.cron-purge`— que **cierran §19.4-D**, abierto desde hacía seis despertares. La Capa 1 está bien diseñada y sus cuatro enganches existen de verdad en el árbol. **🔴 Pero la Capa 1 no está en producción**: busqué en el log el aviso de arranque de `AlertService`, **no aparece ninguno**, y esa ausencia era el hallazgo — `a23202d` está commiteado en local **y sin empujar**, `origin/master` sigue en `4de9236` y la revisión viva `00045-ndn` corre `4de9236`. **🔴 Y cuando se empuje seguirá muda**: `deploy.yml` condiciona el secreto a `vars.ALERT_WEBHOOK_SECRET`, **esa variable no existe**, así que se ejecuta el `else` y solo queda un aviso amarillo en un run que nadie mira. **🔴 El modelo de clasificación ha ido hacia atrás dos veces**: `21:47 claude-sonnet-5` → `21:48 claude-3-5-sonnet-20240620` → `22:15 claude-3-sonnet-20240229`; `TASKS.md` lo llama «revertida», y revertir habría sido volver a `claude-sonnet-5` — esto es un segundo salto atrás, a un modelo de febrero de 2024 que además está **retirado**, y **no se ha clasificado ni un correo desde las 21:32**, así que ninguno de los dos valores nuevos ha funcionado nunca. **🟠 El canal se llama «Google Chat Webhook (Pendiente)»**, es un webhook genérico y nadie ha demostrado que llegue un mensaje. **Dos correcciones al parte**: `GCP_SETUP.md` **no** está congelado (+84 líneas sin commitear, de otro), y `alert_policy_v2.json` **coincide exactamente con la política ya aplicada** — es el archivo origen, no un pendiente. **El patrón, una capa más arriba**: escrito, probado y commiteado ≠ en producción; y un sistema de alertas es donde ese error se paga doble. Se cierra provocando un fallo y esperando el mensaje en Chat. Añadida la sección 27. | `a23202d` (local) · `4de9236` (origin) · revisión `00045-ndn` |
| 2026-08-14 (6) | **La infraestructura de la Fase 4, auditada (§26).** Levantada en consola entre 21:47 y 21:51; comprobada con `gcloud` y con la API de Monitoring. **Bien hecho**: la cola de mensajes fallidos está **completa** —tema `gmail-ingest-dlq`, `maxDeliveryAttempts: 5`, suscripción propia, y **las dos concesiones de IAM** que hacen falta (`publisher` sobre el tema, `subscriber` sobre la suscripción de origen), que es justo donde esto falla en silencio—. Cierra §19.4-C. **🔴 La alerta no avisa a nadie**: la política `[Capa 2] Fallo Critico en Infraestructura` está activa con `notificationChannels` **vacío**, y en el proyecto entero **no existe ni un canal de notificación** — abre el incidente y no se lo cuenta a nadie. **🔴 Y esa «Capa 2» es por error, no por silencio**: su filtro es `severity>=ERROR` sobre Cloud Run y Scheduler, así que **no habría visto el fallo que motivó la fase** — el `watch` dejaba un `WARNING` y el apagón del día 20 no habría dejado nada. **🔴 «Limpiar» `CLAUDE_MODEL_CLASSIFY` cambió el modelo del producto**: `21:47 claude-sonnet-5` → `21:48 claude-3-5-sonnet-20240620`, un modelo de junio de 2024, como efecto secundario de una tarea de higiene; y no se ha clasificado ni un correo desde entonces, así que ni se sabe si ese id sigue vivo. **🟠 Además**: `ALERT_WEBHOOK_URL` existe en Secret Manager pero **no está en el entorno de la revisión**, y la suscripción sigue **sin `retryPolicy`** —cinco intentos inmediatos contra un contenedor dormido acaban en la cola de fallidos, que nadie lee y que no genera ninguna línea que la alerta pueda ver—. Sigue abierto: cobertura cero en los tres del cron, Neon rechazando conexiones en frío (`P1001` a las 21:32) y la deduplicación nunca vista disparar. **El patrón: la infraestructura quedó puesta y desconectada** — cada pieza existe y el sistema sigue igual de ciego. Añadida la sección 26. | `4de9236` · revisión `00044-k8n` |
| 2026-08-14 (5) | **N=1 por decisión de producto, y la Fase 4 definida (§25).** El Product Owner fija el alcance: desarrollo personal a medida, **no se escala a multiusuario**. Retiro mi recomendación de §24.5 — y conviene decir lo que la decisión **resuelve**: el bucle que llama a `stop` y `watch` usuario por usuario no puede tropezar con el «one push client per developer» si nunca hay un segundo buzón. Un límite que no se toca no es una deuda. Para mí cambia una cosa: **`1 de 1` deja de ser una muestra pequeña y pasa a ser el universo entero**. Fase 4: alertas como prioridad alta, más cola de mensajes fallidos en Pub/Sub, `CLAUDE_MODEL_CLASSIFY` y las pruebas de los crones; el reparto vive en `TASKS.md`. **Dos condiciones que sostiene mi propia auditoría**: (1) **la alerta tiene que dispararse por silencio, no solo por error** — el `watch` fallando dejaba un `WARNING` que nadie leyó, pero la ingesta apagándose el 20 no habría producido **ninguna línea**, y ningún aviso construido sobre errores puede ver eso; hace falta algo que avise cuando *deja de pasar* lo que debe pasar. (2) **el canal no puede depender de lo que vigila**: una alerta por correo viaja por la misma cuenta y la misma API de Google cuya caída notifica, así que falla justo cuando hace falta. Y una anotación sobre mí: en §24 presenté como hueco técnico lo que era una pregunta de alcance que no me correspondía responder. Añadida la sección 25. | `4de9236` · revisión `00042-5rm` |
| 2026-08-14 (4) | **Las pruebas del hotfix y la clausura de la Fase 3 (§24).** `4de9236`: **385 líneas en tres archivos** y **569 pruebas en 25 suites, ejecutadas por mí** —eran 547 en 22—. Y lo que importa no es el número: **las aserciones muerden**. El orden se fija con `invocationCallOrder`, así que invertirlo hace fallar la prueba **por construcción** —un «se llamaron los dos» habría pasado con el fallo dentro—; la liberación de la clave se prueba **simulando Redis de verdad** con un `Set`, comprobando que tras un encolado fallido la segunda entrega sí encola; y `describirError` usa el error literal de Google con su `response.data.error` anidado. Cubren además cosas que no pedí: que un tropiezo de la base después del `watch` no lo invalide, y que un duplicado real no borre una clave ajena. **La reversión no la he repetido** —revertir código no me toca—, pero las aserciones son sensibles a la mutación por construcción, comprobado leyéndolas una a una. **Donde me equivoqué yo**: propuse «escribir la clave después de encolar **o** borrarla en el `catch`», y la primera mitad era mala —el `SET NX` tiene que ir delante o pasan las dos entregas concurrentes—; se implementó la segunda, que era la correcta. Diagnosticar bien y recetar de más es el error típico del que audita. **Fase 3 clausurada** con nueve puntos comprobados uno a uno, y con la palabra que se sostiene: **estable**, no *blindada*. **Sin cubrir**: Pub/Sub sin cola de fallidos (abierto desde §19.4-C), `CLAUDE_MODEL_CLASSIFY`, cobertura cero en `CronAuthGuard`/`CronController`/`OverdueCronPurge`, la deduplicación nunca vista disparar en vivo, **nadie vigila** —nada de estos dos días disparó un solo aviso— y **todo verificado con un único usuario**, cuando el error que costó la ingesta decía «per developer». Añadida la sección 24. | `4de9236` · revisión `00042-5rm` |
| 2026-08-14 (3) | **El `watch` arreglado y la causa por fin leída (§23).** `a09d05d` no arregla el `watch`: arregla **poder leerlo**, y en cuanto se desplegó el registro dijo lo que llevaba dos días callado — `HTTP 400 · Only one user push notification client allowed per developer (call /stop then try again)`. **Gmail admite un solo cliente push y exige parar el anterior**, así que el `watch` del 08-13 entró porque no había ninguno y todas las renovaciones chocaron contra el que aquel dejó: **falla solo a partir de la segunda ejecución**. Descartado mi candidato (b) de §21.3 — el rechazo venía de Gmail, no del `findUnique`. `b8f9a4f` llama a `users.stop` antes de `users.watch`; vivo en **`pmo-api-00042-5rm`**. **Forcé el cron dos veces, con permiso expreso**: `17:46:22` y `17:56:03`, las dos con `Bandeja de entrada observada` y `1 de 1 usuario(s)`, sin un solo aviso de fallo del `stop`. **La segunda importa más que la primera**: una sola habría reproducido el estado del 08-13 y no habría probado nada. **La caducidad del 2026-08-20 queda cancelada.** También liberada la clave de deduplicación en el `catch` —estuvo mal escrita 46 minutos y no llegó a costar ningún correo— y arreglados los nueve registros mudos con un helper que saca el cuerpo de la respuesta de Google. **Lo que no doy por bueno**: **cero pruebas nuevas** —547 en 22 suites, las mismas que antes; el diff de `*.spec.ts` está **vacío** y el módulo `gmail` no tiene ni un archivo de pruebas—, así que el orden `stop` → `watch` no lo protege nada; y el push sobre el registro nuevo quedó comprobado a las 18:06 con un correo real de punta a punta (§23.6), aunque la deduplicación sigue sin verse porque Google entregó una sola vez. Añadida la sección 23. | `b8f9a4f` · revisión `00042-5rm` |
| 2026-08-14 (2) | **La Fase 4 no existe: la app es Interna (§22).** Comprobado en la consola con el navegador, en lectura: **Google Auth Platform → Público → Tipo de usuario: `Interno`**, y el Centro de verificación lo dice él mismo — «No se requiere la verificación porque tu app está configurada con un tipo de usuario interno». De ahí: **la app nunca estuvo en «Testing»** —las Internas no tienen estado de publicación—, **la caducidad de siete días de los refresh tokens no aplica**, y **la verificación de Google no hay que pedirla** aunque `gmail.modify` y `gmail.send` sean permisos restringidos. Tercer camino independiente que confirma §21.3: el token del 12 de agosto no está revocado y no va a caducar el 19. **La Fase 4, tal como estaba planteada, no tenía contenido**: no era urgente por el motivo equivocado, es que el trabajo entero sobraba — semanas de trámites con Google sobre una suposición que una página desmiente en cinco segundos. Anotado por si algún día se marca como externa: las tres tablas de «Acceso a los datos» están **vacías** mientras la app pide dos permisos restringidos en ejecución. **Lo de §21 no cambia**: el `watch` sigue fallando a diario, el motivo sigue sin registrarse y **la ingesta se apaga sola el 2026-08-20 hacia las 02:41 UTC**. Añadida la sección 22. | `8c5642d` · revisión `00040-t94` |
| 2026-08-14 | **Despertar 11. La retrospectiva del 14, contrastada (§21).** Dos commits nuevos y un parte de cinco puntos. **Lo que se sostiene**: las pruebas del `GoogleOidcVerifier` pagan la deuda de §20.5 y la que importa es la correcta —token impecable, rechazado por falta de variable, sin llegar a verificar la firma—, **547 pruebas en 22 suites ejecutadas por mí**; los plazos de Prisma corrigen un fallo medido de verdad (`5289 ms` y `5503 ms` contra `5000`), aunque desplegados a las 16:42 y todavía sin horas de vuelo; y el diagnóstico del `historyId` está medido —dos avisos con `historyId 6578238` separados por **4 ms**—. **Lo que la retrospectiva no vio**: hay **27 errores de encolado en dos días**, todos desde la revisión `00038`, y **la entrega doble de Google llevaba dos días siendo su red de seguridad** (14:43: falla la primera entrega, entra la segunda, el correo se sincroniza; 15:02: fallan las dos y no hay sincronización detrás). La clave `SET NX` se escribe **antes** del `add()` y no se borra si el `add()` falla, así que el parche cambia «recuperado a los 4 ms» por «sin encolar, diez minutos en silencio». **Y el hallazgo crítico no cuadra con los registros**: la última concesión de OAuth es del **12-08 a las 22:13 UTC**, el `watch` se renovó bien nueve horas después y falló a las siguientes; y **el token está vivo hoy** —a las 16:25 leyó Gmail, `historyId 6578667 → 6578770`—, luego no hay revocación a los siete días. Falla `users.watch` **y solo eso**, y **no se puede saber por qué**: `logger.error(mensaje, err)` deja el motivo en la ranura del *stack* y el formateador lo tira — la trampa está documentada en `all-exceptions.filter.ts` y hay **nueve llamadas** con esa forma. **Lo urgente sí tiene fecha**: el único `watch` aceptado en diez días es el del 13-08 a las 02:41:45, caduca a los siete días, y si la renovación diaria sigue fallando **la ingesta se apaga sola el 2026-08-20 hacia las 02:41 UTC**. Fase 3 cerrable; Fase 4 con el motivo mal puesto, y una comprobación de un minuto —si la pantalla de consentimiento puede ser **Interna** en el Workspace de `zepto.com.mx`— que decidiría la fase entera. Añadida la sección 21. | `8c5642d` · revisión `00040-t94` |
| 2026-08-13 (2) | **Verificación del parche de urgencia `679b3c3` (§20).** Claude respondió a los tres hallazgos de §19.4 y los tres están bien resueltos, comprobados en código, en pruebas y en producción. **El sondeo de Redis, medido con el monitor en vivo**: tres ciclos consecutivos separados por **60,08 s exactos** y los valores nuevos **literalmente en el cable** —`BZPOPMIN … "60"` y `XREAD BLOCK 60000`—, con `overdue-sweep` ausente porque el worker huérfano se borró. Coste actual: **~19 comandos/min ≈ 1 140/h despierto y en reposo**, cifra que **cuadra con el contador medido por separado** (+90 en 4,5 min), lo que además resuelve que Upstash cobra los subcomandos `lua`. **Lo que casi me hace medir mal**: a las 04:58 el monitor no mostraba ni un comando, y eso no probaba que el parche funcionara sino que el contenedor estaba dormido — tuve que despertarlo con `/health/live`. Sin medición limpia de antes, el efecto es grande pero **no tiene múltiplo exacto**. **El fail-closed, probado contra el llamante real**: el cron de las 05:05 dejó `Ejecución de cron autorizada para pmo-scheduler@…` y `POST /cron/overdue 200` sobre la revisión parcheada — un fail-closed no está verificado hasta que el legítimo pasa por él. **536 pruebas en 21 suites**, una más, la del turno mixto del copiloto. **Y tres términos corregidos del parte antes de que se hagan historia**: no había «workers fantasma» —el fantasma lo mató la purga de la Fase 3 y lo que se quitó fue un worker legítimo sin productor—, la cuota estaba al **37 %** y no al borde, y **no se cerró ninguna brecha activa** sino la posibilidad de una, porque las variables estaban puestas. Nuevo a cambio: un fallo de configuración ahora **para el producto** en vez de abrirlo, y `deploy.yml` sigue avisando sin bloquear; y el cambio más consecuente —el `GoogleOidcVerifier` que puede tumbar los dos crones— **entró sin una sola prueba**. Añadida la sección 20. | `679b3c3` · revisión `00038-kwr` |
| 2026-08-13 | **Despertar 10. Auditoría de la Fase 3 ya ejecutada (§19).** Primera vez que un aviso previo evita trabajo perdido: **los seis puntos de §18 llegaron al código** —rutas `/cron` sin prefijo, `CronAuthGuard` propio con `GoogleOidcVerifier` compartido, la cuenta firmante y su `serviceAccountTokenCreator`, la purga explícita del repetible y la renovación del `watch` pasada a diaria—. Comprobado en vivo con `gcloud`, no en el parte: los dos jobs de Scheduler `ENABLED` en `America/Cancun` con la audiencia idéntica a `CRON_OIDC_AUDIENCE`, `/cron/overdue` **200** a las 03:05:02 UTC y `/cron/gmail-watch` **200**. **La purga, por dos caminos**: el log a las 02:29:11 y la última entrada de `bull:overdue-sweep:completed` en Upstash en ese mismo segundo exacto, ninguna después. **Pero el error del prefijo se cometió igual**: `POST /api/cron/overdue 404` a las 02:30:04, cuarta vez — un comentario en el código protege a quien lee el archivo, no a quien teclea en la consola de GCP. **Hallazgo nuevo que no está en ninguna memoria: el copiloto se rompe con dos herramientas en el mismo turno** — `anthropic.strategy.ts:183` empuja el `content` entero del asistente con todos los `tool_use` y responde solo por los `ejecutables`, así que una herramienta que espera confirmación humana viaja sin su `tool_result` y la API devuelve 400 (visto a las 02:56:23). **Y el siguiente límite que se agota es Redis**, no la clave de Anthropic: Upstash va por **177 k de 500 k** comandos del mes, y `CLAUDE_MEMORY.md` todavía dice 108 k. Abiertos además: la suscripción sin cola de mensajes fallidos, **cero pruebas para todo el código nuevo** (535/21, las mismas de antes de la Fase 3) y `CLAUDE_MODEL_CLASSIFY` que el pipeline cree inyectar y no existe. El fail-open de §18-3 quedó a medias: sin audiencia ya falla cerrado, pero la cuenta sigue en `if (cuentaEsperada && …)` — tapado por configuración, no eliminado del diseño. Memorias ajenas repasadas: `CLAUDE_MEMORY.md` exacta salvo la cifra de Upstash, `TASKS.md` cierta en lo que afirma, `GRAVITY_MEMORY.md` recoge por fin el 409 del Inbox, `DOC.md` cuadra. Añadida la sección 19. | `34d75d1` · revisión `00037-ztk` (`SERVICE_VERSION=c8c87f0`) |
| 2026-08-12 (3) | **Verificación de las Fases 1 y 2 de la estabilización (§16 y §17).** El día en que el producto funcionó por primera vez de extremo a extremo: entré yo a la aplicación desplegada y **el tablero carga con sesión viva, socket conectado y las columnas vacías de verdad** —sin `MOCK_TASKS`—. Confirmado que el bucle de login que veía Doc era **incógnito bloqueando cookies de terceros**, no el backend. Encontré un defecto que no estaba en ninguna lista: `useDashboardMetrics.ts` llamaba con `fetch` **sin `credentials`**, el único de todo `apps/web`, así que Métricas daba **401** en producción y solo ahí —en local el proxy de Vite lo tapa—. De la Fase 2 tuve que corregir tres cosas del parte: **nunca se llegó a servir una revisión sin el `mock`** (la salvó `cancel-in-progress` por ~18 segundos, no el diseño condicional, que avisa pero no bloquea); **el arreglo de Métricas no estaba en producción** porque Vercel seguía con Branch Tracking en `main` y el build —ya sano tras borrar `vercel.json`, 25 s en verde— caía en Preview. Cerradas las dos: revisión **`pmo-api-00034-68q`** con `SERVICE_VERSION=c836d1f` y **`COPILOT_EMAIL_TRANSPORT=mock` puesto ya por el pipeline**, y frontend en **`index-DqcH8EI6.js`** con `/dashboard/metrics` en **200**. Anotado como decisión tomada y no implementada: invertir el valor por defecto del transporte de correo, porque hoy la ausencia de una variable significa enviar de verdad. | `c836d1f` · revisión `00034-68q` |
| 2026-08-12 (2) | **Barrido de los entornos externos, con el navegador y en modo lectura (§15).** Y lo primero es una corrección mía: **el frontend sí es público y sí es el nuestro** —`pmo-frontend-ten.vercel.app` da 200 con la pantalla de login—; lo que probé en §14 era el alias protegido porque es el que dice `WEB_URL`, y de ahí saqué una conclusión falsa. **El fallo real es de una variable**: `WEB_URL` apunta al alias del equipo, así que la API autoriza por CORS un origen distinto del que sirve la página, y ejecutado dentro de la propia página el `fetch` con credenciales sale **`TypeError: Failed to fetch`** mientras el mismo servidor responde en `no-cors`. La API está intacta; el navegador tira todas las respuestas. **Y en Vercel hay dos cosas más:** la rama de producción es **`main`** y el repo trabaja en `master` —el mismo fallo que ya tuvo el CI, repetido en otra herramienta—, así que los pushes caen en Preview; y **`vercel.json` no arregló la compilación, la rompió** (`Missing script: "build:shared"`, porque el comando se ejecuta dentro de `apps/web`). Lo que sostiene producción es un **redespliegue a mano**, y lo que sirve es el código de `dbeb4d5`, no el de HEAD. **En Google:** la URI de redirección está autorizada y exacta ✅ —duda cerrada desde el 08-07—, pero la pantalla de consentimiento está en **«Prueba», con cero usuarios de prueba** y pidiendo ámbitos **restringidos** (`gmail.modify`, `gmail.send`): el refresco caduca a los 7 días, nadie externo puede autorizar, y publicar exige verificación de Google. Anotado también que la consola dice «última fecha de uso: 29 de julio», que apunta en contra del «login verificado» del árbol. Confirmado por CLI: 8 secretos, un servicio y un job, y **Pub/Sub completamente vacío**. Sin revisar por pedir sesión: Neon, Upstash, Anthropic y AI Studio. | `ccbd498`, sin cambios en el repo |
| 2026-08-12 | **Despertar 9. El corte en que el hallazgo rojo cambia de forma en vez de desaparecer.** Dos commits, los dos del 08-10 y los dos respuesta a mi diagnóstico de §13. **La causa del 404 del login está corregida**: `WEB_URL` dejó de apuntar a la aplicación ajena el 08-10 a las 22:08 UTC, y no me quedé en la variable del repositorio —**lo leí de la revisión que sirve**, por el `access-control-allow-origin` de un preflight, que además devuelve el dominio nuevo aunque le mande el viejo, que es lo correcto—. **Pero el dominio nuevo responde 302 hacia `vercel.com/sso-api`**: está detrás de la protección de despliegue de Vercel y solo atiende a quien tenga sesión en esa cuenta. De ahí las tres cosas que dejo dichas: que **no puedo verificar desde aquí que ese dominio sirva nuestro código** —lo digo en vez de suponerlo—, que el «funciona» del usuario y el mío no son el mismo experimento, y que para cualquier otra persona el login sigue acabando en una puerta que parece un fallo de OAuth y no lo es. **Cerradas y verificadas en el código las cuatro roturas del frontend**: `API_BASE` sin `/api`, ni una llamada relativa, el socket ya no apunta al `localhost` de quien mire la página, y la cookie a `none`+`secure` en producción — con el `lax` del `state` de OAuth **conservado a propósito y razonado en el propio archivo**, que es la clase de distinción que se pierde cuando se arregla a golpe de buscar y reemplazar. Nuevo y bueno: `/health/ready` **comprueba el esquema**, y en vivo devuelve `aplicadas: 9, aMedias: 0, revertidas: 0`. Reconfirmado que el dominio viejo sirve otra aplicación, ahora con la prueba barata que faltaba: el HTML servido es `lang="en"` / «Vite + React» con PWA y el del repo es `lang="es"` / «PMO Dashboard». **Sigue apagada la ingesta de Gmail** —`deploy.yml` no inyecta una sola `GMAIL_PUBSUB_*`, van dos cortes— y **`WEB_URL` sigue sin guardarraíl**, que era la lección del corte anterior. `TASKS.md` ya no solo va atrasado: tiene marcada `[x]` una casilla que dice que el pipeline despliega el frontend, y no lo despliega. Ejecutado, no leído: **535 pruebas en 21 suites y lint a 0/0**. Actualizadas las secciones 5, 9, 10, 13 y añadida la 14. | `ccbd498` + `GRAVITY_MEMORY.md` sin commitear (3 líneas) |
| 2026-08-10 | **Despertar 8.** Encargo puntual: diagnóstico del `404 DEPLOYMENT_NOT_FOUND` al entrar con Google. **La sospecha del usuario —que el backend redirigía a un despliegue muerto— es razonable y es falsa: el backend no participa en ese 404.** Descartado con cinco comprobaciones, entre ellas que la cadena `manejo-org` no ha existido nunca en el repo y que las 26 revisiones de Cloud Run llevan la misma `WEB_URL`. Lo que sí pasa: **`https://pmo-frontend.vercel.app` no es el frontend de este proyecto** — sirve «PMO Digital / Gestão de Planos de Manejo Orgânico», una aplicación en portugués con Supabase, y quien redirige tras el consentimiento es Supabase hacia el despliegue hermano de *esa* aplicación, que ya no existe. Causa de fondo en una frase: **el frontend de este proyecto no estaba desplegado en ninguna parte**, y `WEB_URL` se rellenó con un dominio que «parecía el nuestro» porque los dos proyectos se llaman PMO. Registrado en §13. | `dbeb4d5` |
| 2026-08-07 | **Despertar 7. El corte del despliegue: la API está en producción — y el frontend no llega a ella.** 33 commits en tres días (08-03, 08-05, 08-07) y el mayor cambio de forma del proyecto: **`HANDOFF.md` se partió en cuatro memorias** (`API_CONTRACTS.md` neutral, `CLAUDE_MEMORY.md`, `GRAVITY_MEMORY.md`, `DOC.md`) y `AI_ROLES.md` ya lo refleja. **La API vive en `https://pmo-api-mlpuuasqka-uc.a.run.app`** sobre Cloud Run con Neon y Upstash, desplegada por pipeline encadenado al CI, con las migraciones corriendo en un Job **antes** de publicar la revisión. Sondado por mí, sin credenciales: `/health/ready` **200** con base y Redis arriba, `/health/live` 200, `/auth/me` **401** y `/auth/google` **302** —abrir el servicio no lo dejó desprotegido—. **Y por fin se acabó suponer: `gh` está instalado**, así que el verde del CI y del despliegue está visto, no deducido. Costó tres obstáculos y **ninguno era del código**: unos secretos de modelo que no existían y cuya revisión condenada **se llevó por delante a la que estaba sirviendo**, Cloud Run naciendo privado (cinco 403 de la puerta, con el contenedor arrancando impecable al lado) y un `--args` de gcloud que exige el igual. **Hallazgo rojo nuevo, y no lo ve ningún guardarraíl porque todos miran la API: el SPA de Vercel pide contra `/api/…` relativo —el proxy de Vite, que en producción no existe— y devuelve 404 comprobado en vivo; detrás, las cookies `sameSite: lax` cierran la salida fácil de apuntar al host de Cloud Run.** En el árbol sin commitear está el saneamiento de Gravity, que cierra de golpe tres apuntes míos: fuera `MOCK_TASKS` del `catch`, el updater impuro de `handleDragEnd` —única deuda de arquitectura declarada— y los dos contratos copiados a mano. Ejecutado, no leído: **525 pruebas en 20 suites y lint a 0 errores / 0 avisos**. Anotado también: `CLAUDE_MEMORY.md` se contradice a sí mismo sobre `GOOGLE_REDIRECT_URI` (comprobado contra GitHub: vale la URL real); `3578f8d` se llevó este cuaderno a git sin decirlo; `TASKS.md` sigue con la foto vieja y `docs/` se paró el 07-31. **Y después, a petición del usuario, barrido completo de la programación (§12)**, que multiplica el hallazgo rojo por tres —prefijo `/api` inexistente en `API_BASE`, llamadas relativas contra el origen de Vercel y el socket clavado en `localhost:3000`— y destapa que **la ingesta de Gmail está apagada en producción** por dos variables que nadie inyecta. El backend, en cambio, sale limpio de lo que fui a buscar: 0 `any`, SQL parametrizado, propiedad por `userId` en todas las escrituras, AES-256-GCM correcto y la carrera del cronómetro resuelta con índice único. Actualizadas las secciones 0, 1, 3, 4, 5, 8, 9, 10 y añadida la 12. **Y por orden del usuario, los hallazgos quedaron también anotados al final de `GRAVITY_MEMORY.md`**, añadidos y revalidados antes contra `0c6c238`: entre el barrido y la escritura, la otra terminal cerró dos —las llamadas con `/api` relativo y las cookies cross-site (`sameSite: none`)— y siguen vivos el prefijo `/api` de `API_BASE`, el socket clavado en `localhost:3000` y las variables de Pub/Sub ausentes. | `b1f6bcb` + 13 archivos sin commitear, y **el árbol cambiando mientras leía** |
| 2026-08-03 | **Despertar 6. El corte sin hallazgos rojos, el primero.** Cuatro commits nuevos (tres del viernes por la tarde, uno de hoy) y árbol limpio por tercera vez seguida. **Se cerró el hallazgo rojo único: ya hay remoto** —`origin` en GitHub, `HEAD == origin/master`, 0 ahead / 0 behind—, así que el proyecto deja de vivir en un solo disco y el CI tiene por fin dónde correr; no lo hizo ningún commit, se configuró fuera del historial. **Cerrada la observabilidad del Sprint 8** en dos tiempos: `37e634e` dejó escrito que no estaba probado contra la app, y `0439a3b` lo cierra con 71 pruebas y la verificación viva, donde aparecieron los dos únicos fallos — 🔒 **el código de autorización de Google se estaba escribiendo cuatro veces en el log** (el serializador de `pino-http` guarda la petición como binding del logger hijo, así que la URL cruda salía en todas las líneas de esa petición) y el 503 de la sonda abriendo una incidencia por latido. Sentry cancelado: Error Reporting lee de Cloud Logging, sin SDK ni credencial. Ejecutado, no leído: **497 pruebas en 18 suites, 0 errores y 28 avisos de lint**. Cerrados también el acta del 30, las dos casillas de Gravity, el hash inventado del acta del 29 y la fila del Inbox sin teclado. **Hallazgos nuevos, ninguno rojo:** el `role="button"` anidado con que se arregló el Inbox (dos paradas de tabulación por fila, el botón dentro del botón otra vez pero en ARIA); el handoff al revés —la §0 dice «no arranques hasta que Doc active» y el trabajo entró 48 minutos después—; `GOOGLE_CLOUD_PROJECT` vacía apagando en silencio la correlación por traza, que Cloud Run no inyecta sola; y el hueco del histórico, que se movió del 30 al 31. `TASKS.md` vuelve a arrastrar la cifra vieja y a decir que no hay remoto. No se puede comprobar desde aquí si el CI llegó a ejecutarse: `gh` no está instalado. Actualizadas las secciones 4, 5, 6, 8, 9, 10. | `0439a3b` + árbol limpio (solo `?? ALANA.md`) |
| 2026-07-31 | **Despertar 5.** Corte de cierre de día: dos commits nuevos, los dos de ayer a las 18:0x, **ninguno de hoy**, y el árbol limpio por segunda vez en la historia del proyecto. Los dos hallazgos que dejé abiertos anoche están cerrados: `b5995a7` quita los tres `catch (err)` y **`npm run lint` sobre HEAD da 0 errores / 28 avisos** (ejecutado, no leído del mensaje del commit); `f9ce09b` reescribe la sección 0 caducada del handoff y la sustituye por una regla útil para Gravity — lint en verde antes de cada commit. Anotado que esta vez la excepción de dominio en `apps/web` va **declarada** en el mensaje y comunicada, al contrario que el `tz` de `2ceedd2`. **Queda un solo hallazgo rojo, y es el mismo desde el despertar 4: no hay remoto** (`git remote -v` vacío) — sin CI y sin copia, el proyecto entero en un disco. Los demás hallazgos son de documentos que no siguen al código: la cabecera del HANDOFF sigue en `TRABAJAR` pidiendo cuatro cosas ya hechas, la §9 sigue pidiendo el `tz`, y **`TASKS.md` no se toca desde ayer al mediodía** (423/13 suites, CI en `main`, dos casillas de Gravity sin marcar). Y el 30 cerró con 9 commits y **sin acta**. Actualizadas las secciones 4, 5, 9, 10. | `f9ce09b` + árbol limpio (solo `?? ALANA.md`) |
| 2026-07-30 ~13:10 | **Despertar 4.** El corte del desbloqueo: **Gravity commiteó** (`0d2a4f4`) y con ello se cierran de golpe los dos hallazgos rojos que llevaban tres despertares abiertos — el tablero de métricas ya no pinta `MOCK_METRICS` y **las dos piezas de interfaz del Sprint 6 están hechas** (`threadId` en el cuerpo del chat, recogido del evento `done`, y la lista de hilos con sus tres rutas). Verificado en el código: el indicador de escritura no cuelga del primer `token`, pasa a `streaming` con las cabeceras. También cayeron el CI apuntando a `main` (`eb4449d`) y la migración ausente del handoff. **Hallazgo nuevo, rojo: HEAD no pasa el linter** — tres `catch (err)` sin usar en `CopilotDrawer.tsx`, cuyo arreglo está en el árbol sin commitear, otra vez tocado desde la terminal de backend en dominio de Gravity. **Y el CI recuperado todavía no puede correr: no hay remoto configurado.** La sección 0 del handoff, escrita 8 segundos después del commit que pedía, nació caducada. Actualizadas las secciones 4, 5, 6, 9, 10. | `877c06c` + `CopilotDrawer.tsx` modificado sin commitear |
| 2026-07-29 ~13:40 | Escaneo inicial completo del entorno. Sin modificar nada del proyecto. | `4fcbea6` + árbol de trabajo con la persistencia de hilos del copiloto sin commitear |
| 2026-07-30 ~12:15 | **Despertar 3.** Corte corto, 15 minutos después del anterior, con 3 commits nuevos y trabajo vivo en el árbol. **Se destapó que el linter nunca funcionó en todo el proyecto**: no había configuración de ESLint en ninguna parte, y el CI —que escucha `main` mientras se trabaja en `master`— nunca lo ejecutó, así que el fallo del workflow deja de ser sospecha y pasa a tener una consecuencia comprobada. Gravity está quitando el mock del tablero de métricas ahora mismo, sin commitear: el hallazgo rojo del corte anterior se está arreglando. **Nuevo hallazgo:** el `tz` de `getTimeReport` (encargo §9, dominio de Gravity) entró dentro del commit del linter, cuyo mensaje afirma que no cambia comportamiento. Corregida mi cifra de pruebas: son 423 en 13 suites, no ~407 — las tablas `it.each` declaran varios casos por llamada. De los hallazgos anteriores, el único que sigue vivo es la migración `add_priority_audit` ausente de «Estado del repo». Actualizadas las secciones 4, 5, 9, 10. | `0af5a28` + `useDashboardMetrics.ts` modificado sin commitear |
| 2026-07-30 ~12:00 | **Despertar 2.** Árbol limpio por primera vez: los 7 commits nuevos incluyen todo lo que estaba suelto de Gravity. Se saldó la deuda de plan entera (auditoría de prioridad y filtros) y se abrió el Sprint 8: seguridad, `GET /dashboard/metrics` con motor único de cálculo, `completedAt` encendida y los husos alineados entre métricas y `GET /time/report`. **Hallazgo principal: el tablero de métricas está enchufado en `App.tsx` pintando `MOCK_METRICS` con la llamada real comentada.** Otras discrepancias: la sub-casilla de pintar la prioridad está sin marcar y sí está hecha; falta la migración `add_priority_audit` en «Estado del repo»; el registro del 29 cita un hash que no existe (`bb0b73f`); y las dos piezas de interfaz del Sprint 6 (`threadId` y lista de hilos) siguen sin empezar. Actualizadas las secciones 4, 5, 6, 9, 10. | `3cffc21` + árbol limpio (solo `?? ALANA.md`) |
| 2026-07-29 ~16:30 | **Despertar 1.** 5 commits nuevos: el backend del Sprint 6 quedó completo y Doc lo cerró formalmente. Se commiteó todo lo que en el corte anterior estaba en el árbol de trabajo. Entraron las cuatro herramientas, la bitácora y el bucle de tool use. `POST /copilot/draft-email` cancelado y las plantillas al backlog. Lo pendiente pasó a ser solo frontend de Gravity: mandar `threadId` y la lista de conversaciones. Actualizadas las secciones 4, 5, 6, 9, 10. | `72e1b78` + árbol con 6 archivos de `apps/web/` modificados y `CreateTaskCard.tsx` sin rastrear |

---

## 12. Barrido completo del código (2026-08-07, 13:15)

Encargo del usuario: leer toda la programación, no solo lo que cambió.

> ⚠️ **Aviso de método, y no es menor: el árbol se estaba editando mientras yo
> leía.** A las 13:13 había **13 archivos modificados**, once de ellos de
> `apps/web`, con marcas de tiempo entre las 13:03 y las 13:13 —otra terminal
> está centralizando ahora mismo la capa de API—. Un archivo llegó a cambiar
> **entre dos lecturas mías**. Todo lo que digo de `apps/web` es una foto de las
> 13:15, no un estado estable; lo de `apps/api` sí está quieto.

### Inventario

| Paquete | Archivos | Líneas |
|---|---|---|
| `apps/api/src` | 120 (21 de ellos `.spec.ts`) | 16 656 |
| `apps/web/src` | 38 | 4 879 |
| `packages/shared/src` | 1 | 216 |

Más 9 migraciones de Prisma y un esquema de 248 líneas.

### El backend está bien construido, y esto es lo que lo sostiene

No es impresión de lectura: es lo que fui a buscar expresamente y encontré en su
sitio.

- **Cero `any` fuera de las pruebas**, en los tres paquetes. Cero `@ts-ignore`,
  cero `@ts-expect-error`, cero `TODO`/`FIXME` en `apps/api`. Un solo
  `eslint-disable`, para un `no-control-regex` que trata caracteres de control
  al construir MIME —justificado y comentado.
- **El SQL crudo está parametrizado.** Los cuatro `$queryRaw` usan `Prisma.sql`
  con interpolación de parámetros; el único `Prisma.raw` recibe un **nombre de
  columna literal del código**, nunca entrada de usuario. La zona horaria viaja
  como parámetro, no concatenada.
- **La propiedad se comprueba en todas las escrituras.** Revisé una a una las que
  escriben por `id`: las dos que a primera vista no filtran por `userId`
  —`chatThread.update` y `email.update`— van precedidas, dentro de la misma
  transacción o del mismo método, de una lectura que sí lo exige. No encontré
  ningún camino en que un id ajeno bastara.
- **El cifrado de los tokens de Google es correcto**: AES-256-GCM, IV aleatorio
  de 96 bits por mensaje, etiqueta de autenticación verificada al descifrar, y
  la clave se valida al arrancar (64 hex) en vez de fallar en el primer uso.
- **La carrera del cronómetro está resuelta donde hay que resolverla**: una
  columna centinela con índice único, y el `UNIQUE_VIOLATION` traducido a 409.
  Dos pestañas no pueden abrir dos fichajes, y no depende de que la lectura
  previa gane la carrera.
- **El socket se autentica con la misma cookie que el REST** y exige
  `typ: access`, así que un token de refresco no abre un socket. Cada cliente
  entra en la sala de su `userId`.
- **Los guards están donde deben**: todos los controladores llevan `AuthGuard`
  salvo los tres públicos por diseño —`/health/*`, el arranque y el callback de
  OAuth, y el webhook, que va con `PubSubAuthGuard` verificando firma OIDC,
  `aud` y cuenta de servicio emisora.
- **La separación de herramientas del copiloto se sostiene en el código**, no
  solo en la documentación: las de solo lectura las ejecuta el backend con el
  `userId` cerrado en el ejecutor —el modelo pide «busca X» sin saber de quién
  son los datos— y las que actúan salen como propuesta que confirma una persona
  contra una ruta REST. Enviar correo **no es una herramienta del modelo**, que
  es la decisión de seguridad importante cuando lo que lee son correos ajenos.
- **El Dockerfile es de los cuidados**: tres etapas, árbol de producción
  resuelto desde cero en vez de podado, usuario `node` sin privilegios, y
  `CMD ["node", ...]` sin `npm` por medio para que el `SIGTERM` de Cloud Run
  llegue a Node y corra el cierre ordenado.
- El cuerpo de los correos se pinta como **texto**: no hay un solo
  `dangerouslySetInnerHTML` en `apps/web`.

### 🔴 Lo que impide que el producto funcione en producción

**Tres roturas independientes, las tres en `apps/web`, y ninguna visible desde la
API.** Esto es lo que quiero dejar dicho: no es un descuido, es que `apps/web`
**nunca se adaptó a producción**, y el guardarraíl no puede verlo porque el CI y
el despliegue solo construyen y sondan la API.

1. **`API_BASE` en producción lleva un `/api` que no existe.** `lib/api.ts`
   resuelve `import.meta.env.VITE_API_URL || (PROD ? "https://pmo-api-…/api" : "/api")`.
   La API **no tiene prefijo global** —`main.ts` no llama a `setGlobalPrefix`—,
   así que las nueve archivos que pasan por `apiFetch` piden contra un 404.
   Comprobado contra la API real: `/api/auth/me` → **404**, `/auth/me` → **401**.
   **Es el error del prefijo `/api` por tercera vez en el proyecto**, y esta vez
   dentro del código del frontend, donde la comprobación de `deploy.yml` —que ya
   paró dos intentos en la variable de OAuth— no alcanza.
2. **Los que aún llaman con `/api` relativo** —a las 13:13,
   `useDashboardMetrics.ts`— piden contra el origen de Vercel, donde no hay API
   ni reescritura: **404 comprobado en vivo**. Este es el grupo que la otra
   terminal está migrando ahora mismo.
3. **El tiempo real apunta a la máquina del usuario.** `useSocket.ts:90` hace
   `io('http://localhost:3000')`, fijo, sin variable ni relativo. En producción
   el navegador intenta abrir un socket contra el `localhost` de quien mire la
   página. No hay tablero en vivo, y el fallo no aparece en ningún log del
   servidor porque la conexión nunca sale hacia él.

Y por debajo de las tres, la cookie `sameSite: "lax"` (§5), que decide cuál de
las salidas posibles es viable.

### 🟠 La ingesta de Gmail está apagada en producción, y avisa con una línea de log

Es la pieza nú​mero uno del producto —correo → Pub/Sub → cola → clasificación— y
en la revisión desplegada no puede funcionar. Comparé **todas** las variables que
lee el código con las que inyecta `deploy.yml`:

| Variable | Quién la lee | En producción | Consecuencia |
|---|---|---|---|
| `GMAIL_PUBSUB_TOPIC` | `gmail.service.ts:354` | **ausente** | `watchInbox` escribe `«no está configurado. Omitiendo»` y **vuelve**: no se registra la suscripción push |
| `GMAIL_PUBSUB_AUDIENCE` | `pubsub-auth.guard.ts` | **ausente** | y si llegara un push igualmente, el guard lo rechaza con 401 «Webhook mal configurado» |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT` | mismo guard | ausente | solo se comprueba si está puesta; no bloquea |

Las dos primeras **no son opcionales para que el producto haga lo que promete**,
y su ausencia no rompe el arranque ni la sonda: la revisión sale verde, atiende,
y no entra un solo correo. Es exactamente la forma de fallo que el proyecto ya se
encontró con `GOOGLE_CLOUD_PROJECT` —capacidad que se apaga en silencio— y para
la que `main.ts` tiene un `avisoDeConfiguracion` que aquí no cubre nada.

### 🟡 Lo demás que encontré

- **`COPILOT_EMAIL_TRANSPORT` no está puesta en producción, y el valor por
  defecto es Gmail de verdad** (`copilot.module.ts:66`: simulado **solo** si vale
  `mock`). Es coherente con la decisión de Doc —local simulado, real en la nube—
  y el arranque lo deja dicho en el log. Lo anoto porque **el transporte real no
  se ha disparado nunca** y el plan era validarlo en un staging que no existe: el
  primer clic de «Enviar» en producción manda un correo auténtico desde el Gmail
  del usuario.
- **Una mina en el entorno local: `apps/web/.env`** (del 25 de julio, ignorado por
  git, así que solo está en esta máquina) dice
  `VITE_API_URL=http://localhost:3000/tasks`. Esa variable **gana sobre todo lo
  demás** en `lib/api.ts`, así que en desarrollo `apiFetch('/tasks')` sale hacia
  `http://localhost:3000/tasks/tasks`, y además salta el proxy de Vite, con lo
  que las cookies pasan a ser cross-site. `VITE_API_URL` **no está documentada en
  ningún `.env.example`**, así que nadie que monte el proyecto sabrá que existe
  ni que puede estar mintiendo.
- **Fecha de vencimiento con un día de menos en la tarjeta del copiloto.**
  `CreateTaskCard.tsx:146`: el `<input type="date">` da `2026-07-10`,
  `new Date('2026-07-10')` lo interpreta como **medianoche UTC** y la línea de al
  lado lo pinta con `toLocaleDateString()`, que en México resta seis horas y
  enseña el **9**. El propio `input` sigue mostrando el 10 porque se recalcula
  con `split('T')[0]`: la misma tarjeta muestra dos fechas distintas. Es la misma
  trampa que ya se arregló en el eje X del tablero —`new Date(dateStr + 'T00:00:00')`,
  `DashboardPage.tsx:41`—, sin arreglar aquí.
- **`role="button"` anidado en el Inbox**, reverificado: `InboxPage.tsx:283` y
  `:431`, uno dentro del otro, los dos con `tabIndex={0}`.
- **Dos migraciones se llaman igual**: `20260728221900_add_tags` crea la tabla y
  `20260728221924_add_tags`, veinticuatro segundos después, le añade el
  `createdAt` que faltaba. Prisma las distingue por carpeta, así que no rompe
  nada; leer el historial con dos entradas del mismo nombre sí cuesta.
- **`mockTasks.ts` sigue en el disco** sin que lo importe nadie.
- **El `AuthGuard` es deliberadamente sin estado**: no consulta la base en cada
  petición, así que un usuario borrado o revocado conserva sesión válida hasta
  15 minutos. Está escrito en el propio archivo y es un intercambio razonable;
  lo dejo anotado porque no aparece en ninguna lista.

### Lo que **no** revisé línea a línea

Para que nadie lea esto como «todo comprobado»: leí entero lo pequeño y
sensible —`main.ts`, guards, cripto, sesión, ejecutor de herramientas,
Dockerfile, workflows— y recorrí por estructura y por patrones los servicios
grandes (`emails` 614 líneas, `time` 496, `gmail` 383, `tasks` 371, `ai` 343).
De `apps/web` miré en detalle la capa de API, el socket, el tablero, el Inbox y
las tarjetas del copiloto; los modales y los componentes de presentación solo
por barrido de patrones. Las **21 suites de pruebas** no las audité: comprobé
que pasan (525), no qué dejan fuera.

---


---

## 13. El 404 del login: `WEB_URL` apunta a otra aplicación (2026-08-10)

Encargo del usuario: diagnóstico quirúrgico de un
`404 DEPLOYMENT_NOT_FOUND` al entrar con Google, con la sospecha de que el
backend redirigía a un despliegue inexistente de Vercel.

**La sospecha era razonable y es falsa. El backend no participa en ese 404.**

### Lo que descarta al backend

| Comprobación | Resultado |
|---|---|
| `git log --all -S "manejo-org"` | **cero commits**: la cadena no ha existido nunca en el repo |
| URLs quemadas en `apps/api/src` | ninguna; el único respaldo de `WEB_URL` es `http://localhost:5173` |
| `WEB_URL` de **las 26 revisiones** de Cloud Run | `https://pmo-frontend.vercel.app` en todas desde la 00009 (la 00008 tenía el marcador, la 1–7 ninguna) |
| Tráfico | 100 % a `pmo-api-00026-m7w`, con esa misma `WEB_URL` |
| El `state` | 16 bytes aleatorios (`auth.controller.ts:62`), cotejado contra su cookie. **No guarda ninguna URL de origen**, ni se lee `Origin` ni `Referer` en ninguna parte de la redirección |

### Lo que sí pasa

**`https://pmo-frontend.vercel.app` no es el frontend de este proyecto.** Sirve
**otra aplicación**, y se identifica sola en su propio manifiesto:

```json
{"name":"PMO Digital","short_name":"PMO",
 "description":"Gestão de Planos de Manejo Orgânico"}
```

Descargado el bundle que sirve hoy (`/assets/index-vq9e4Vot.js`, 827 KB) y
contado dentro:

| Cadena | Ocurrencias |
|---|---|
| `supabase` | **43** — el proyecto `hejewayflbuemnffrhae.supabase.co` |
| `run.app` | **0** — no conoce nuestra API |
| `socket.io`, `Kanban`, `Copiloto`, `Por Hacer` | **0 cada una** |

Es una aplicación en portugués, con Material UI, autenticación de **Supabase** y
botones «Entrar com Google» y Facebook. Nada que ver con este monorepo.

**De ahí sale el 404 y de ahí sale el nombre**: `manejo-org-app-v2` es el
despliegue hermano de *esa* aplicación —«manejo orgánico»—, y quien redirige
hacia él tras el consentimiento de Google es **Supabase**, con la URL que tenga
configurada ese otro proyecto. Ese despliegue ya no existe, y Vercel responde
`DEPLOYMENT_NOT_FOUND`. Nuestro NestJS no interviene en ningún paso.

**La causa de fondo, en una frase: el frontend de este proyecto no está
desplegado en ninguna parte**, y `WEB_URL` se rellenó con un dominio que
«parecía el nuestro» porque los dos proyectos se llaman PMO.

### Consecuencia colateral, ya anotada en §12

El bundle servido hoy es el mismo hash que el del 2026-08-07
(`index-vq9e4Vot.js`), así que **ninguno de los arreglos de frontend de estos
días está en producción** —ni el `API_BASE` sin `/api` ni el socket, los dos
corregidos en `dbeb4d5`—. No podían estarlo: ese dominio nunca ha servido este
código, y **el despliegue de `apps/web` no está en el pipeline** (no hay
`vercel.json` ni workflow que lo construya).

### El guardarraíl que falta

`deploy.yml` valida `GOOGLE_REDIRECT_URI` con cuatro comprobaciones —y ya paró
dos despliegues—, pero **no comprueba `WEB_URL` en absoluto**: se acepta
cualquier cadena. Una comprobación de que responde y de que **es nuestra**
(buscar un marcador propio en el HTML servido) habría cazado esto el primer día.
Es la misma leccion del `/api/v1`: lo que no valida el pipeline, lo descubre el
usuario.

> ✅ **Atendido el mismo día.** `WEB_URL` se cambió el 2026-08-10 a las 22:08 UTC
> y el despliegue de las 22:12 la recogió. **El guardarraíl que pedía este
> apartado sigue sin existir**: `deploy.yml` continúa aceptando cualquier cadena
> en `WEB_URL`, con respaldo `https://pmo-frontend.placeholder.com`. Ver §14.

---

## 14. Despertar 9 — el corte del 2026-08-12

Dos commits desde el corte anterior, los dos del **08-10 por la tarde** y los dos
respuesta directa al diagnóstico de §13. HEAD `ccbd498`, `origin/master` al día,
árbol con un solo archivo tocado (`GRAVITY_MEMORY.md`, 3 líneas).

| Hash | Hora | Qué |
|---|---|---|
| `2123003` | 08-10 17:08 | Anota la `WEB_URL` de producción en `GRAVITY_MEMORY.md` — **y se lleva dentro 794 líneas de `ALANA.md`** sin mencionarlo |
| `ccbd498` | 08-10 17:11 | `vercel.json` en la raíz, seis líneas |

### ✅ La causa del 404 del login está corregida

`gh variable list`, hoy:

| Variable | Valor | Puesta |
|---|---|---|
| `WEB_URL` | `https://pmo-frontend-antoniosanchez-5466s-projects.vercel.app` | 08-10 **22:08** UTC |
| `FRONTEND_URL` | lo mismo | 08-10 22:12 UTC |

Y no me quedo en la variable del repositorio: **lo leí de la revisión que está
sirviendo**, sin credenciales. Un preflight `OPTIONS /auth/me` devuelve
`access-control-allow-origin:` con el dominio nuevo — y lo devuelve **también
cuando mando el `Origin` viejo**, que es exactamente lo correcto: la lista de
orígenes es fija, no un eco de lo que pregunte el cliente. El despliegue
`31437342971` (22:12 UTC, en verde) es el que la recogió.

_`FRONTEND_URL` sigue sin leerla ningún workflow_ (§5); ahora al menos las dos
dicen lo mismo, así que ya no puede engañar a quien la mire.

### 🔴 Pero el dominio nuevo está detrás del SSO de Vercel

Es el hallazgo de este corte, y sale de una comprobación de dos líneas:

```
GET https://pmo-frontend-antoniosanchez-5466s-projects.vercel.app/
  -> 302  Location: https://vercel.com/sso-api?url=…&nonce=…
          Set-Cookie: _vercel_sso_nonce=…
```

Es la **protección de despliegue** de Vercel: el dominio con sufijo de proyecto
sirve solo a quien tenga sesión en esa cuenta. Tres consecuencias, y las tres
importan:

1. **No puedo verificar desde aquí que ese dominio sirva nuestro código.** Lo
   digo en vez de suponerlo: es el primer hallazgo de este cuaderno que se me
   queda sin comprobar por falta de credenciales, y suponer que sí es justo el
   error que costó el corte anterior.
2. **El «funciona» del usuario y el mío no son el mismo experimento.** Su
   navegador lleva la cookie de Vercel; el de cualquier otra persona, no. Un
   producto que solo atiende a su dueño no está desplegado, está en preestreno.
3. **El login acaba ahí.** Tras el consentimiento de Google, la API redirige a
   `WEB_URL`; quien no sea el dueño aterriza en la puerta de Vercel, y el síntoma
   —una pantalla de Vercel al volver de Google— vuelve a parecer un fallo de
   OAuth sin serlo. Exactamente la forma del 404 de §13.

**Lo que lo cierra**, y no me toca decidirlo: quitar la protección de despliegue
en el proyecto de Vercel, o darle un dominio propio. La segunda arregla de paso
la cookie: con `api.ejemplo.com` y `app.ejemplo.com` la sesión vuelve a `lax` y
deja de depender de que el navegador acepte cookies de terceros —lo dice el
propio `session.service.ts`—.

### El dominio viejo sigue sirviendo la aplicación ajena

Reconfirmado hoy, y con una prueba más limpia que la del 08-10:

| Comprobación | Resultado |
|---|---|
| Bundle servido | `index-vq9e4Vot.js` — **el mismo hash del 08-07 y del 08-10** |
| `manifest.webmanifest` | `{"name":"PMO Digital","description":"Gestão de Planos de Manejo Orgânico"}` |
| Dentro del bundle | `supabase` **38** · `manejo` **43** · `run.app` **0** |
| HTML servido | `lang="en"`, `<title>Vite + React</title>`, registra un service worker de PWA |
| `apps/web/index.html` de este repo | `lang="es"`, `<title>PMO Dashboard</title>`, **sin plugin de PWA** |

Las dos últimas filas son la prueba barata que no había hecho: no es una versión
vieja de lo nuestro, **es otro programa**. Y sirve para el futuro — comparar el
`<title>` servido con el del repo es una comprobación de una línea, que es justo
el guardarraíl que §13 pedía para `WEB_URL`.

### ✅ Las cuatro roturas del frontend, cerradas y verificadas en el código

| Rotura (§12) | Estado hoy |
|---|---|
| `API_BASE` con un `/api` que no existe | ✅ `lib/api.ts:8` — en `PROD` va el host de Cloud Run pelado |
| Llamadas con `/api` relativo | ✅ no queda ninguna: los tres aciertos del grep son comentarios |
| Socket clavado en `localhost:3000` | ✅ `useSocket.ts:90` — `PROD` → Cloud Run |
| Cookie `sameSite: "lax"` cross-site | ✅ `session.service.ts:63` — `none` + `secure` en producción |

**Y el `lax` que queda no es un olvido.** `auth.controller.ts:65` conserva
`sameSite: "lax"` en la cookie del `state`, con veinte líneas explicando por qué:
sus dos puntas son navegaciones de primer nivel —un `<a href>` y el redirect de
Google—, donde `Lax` **sí** viaja, y esa cookie **es** la defensa anti-CSRF del
login: aflojarla a `none` la haría viajar también en peticiones cross-site que no
son navegaciones, que es justo lo que debe impedir. Se aflojó lo que estorbaba y
no lo que estaba al lado. Es la clase de distinción que se suele perder cuando se
arregla a golpe de buscar y reemplazar.

### 🆕 La sonda de salud ahora comprueba el esquema

`0c6c238` añade un indicador de migraciones a `/health/ready`. Sondado hoy en
vivo, sin credenciales:

```json
{"status":"ok","info":{
  "database":{"status":"up","responseTimeMs":28},
  "schema":{"status":"up","aplicadas":9,"aMedias":0,"revertidas":0,"responseTimeMs":30},
  "redis":{"status":"up","responseTimeMs":28}}}
```

Es mejor sonda de lo que suele verse: una base que **conecta** pero con
migraciones a medias o revertidas ya no pasa por sana, que es precisamente el
estado en que la API responde y falla en la primera consulta real. Las nueve
aplicadas cuadran con las nueve carpetas de `prisma/migrations`.

### 🟠 Sigue apagada la ingesta de Gmail, y van dos cortes

Reverificado leyendo el `ENV_VARS` que arma `deploy.yml` (~línea 297): lleva
`NODE_ENV`, `LOG_FORMAT`, `GOOGLE_CLOUD_PROJECT`, `WEB_URL`,
`GOOGLE_REDIRECT_URI`, `SERVICE_VERSION` y los `CLAUDE_MODEL_*` opcionales.
**Ni una `GMAIL_PUBSUB_*`.** La pieza número uno del producto —correo → Pub/Sub →
cola → clasificación— no puede funcionar en la revisión desplegada, la revisión
sale verde igual y no entra un solo correo. Está anotado desde el 08-07, también
al final de `GRAVITY_MEMORY.md`, y nadie lo ha recogido.

### ⚠️ Lo que dice el árbol sin commitear, y lo que puedo sostener de ello

`GRAVITY_MEMORY.md` tiene tres líneas sin commitear que afirman **«Frontend
Vercel completado»** e **«Integración OAuth verificada: el flujo de login con
Google en producción se completa sin errores»**. Separo lo que comprobé de lo que
no:

- **Lo confirmo**: la revisión viva tiene la `WEB_URL` nueva, `/auth/google`
  devuelve 302 hacia Google, `/auth/me` sin cookie devuelve 401, la cookie es
  `none`+`secure` en producción y el CORS admite el origen nuevo. La mitad de
  backend del flujo está en su sitio.
- **No lo puedo confirmar ni desmentir**: que el SPA servido en ese dominio sea
  el nuestro y que el login se complete. El SSO me deja fuera.
- **Y matizo una palabra**: «se completa sin errores» se comprobó desde un
  navegador con sesión de Vercel. Es un resultado verdadero y más estrecho de lo
  que la frase sugiere.

### Ejecutado, no leído (hoy)

```
npm test       ->  Test Suites: 21 passed · Tests: 535 passed   (68,8 s)
npm run lint   ->  los tres paquetes limpios: 0 errores y 0 avisos
gh run list    ->  los cuatro últimos runs en verde; el despliegue 31437342971
                   (08-10 22:12 UTC) es el que lleva la WEB_URL nueva
```

Sondas en vivo: `/health/ready` **200** (con el esquema dentro), `/health/live`
**200**, `/auth/me` **401**, `/auth/google` **302**.

### Apuntes menores de este corte

- **`2123003` volvió a llevarse `ALANA.md` dentro sin decirlo** —794 líneas—,
  igual que `3578f8d` el 08-03. Van dos. No rompe nada; es la regla de `DOC.md`
  de «añadir por ruta, nunca `git add -A`» saltada otra vez, y quien lea el
  mensaje del commit no sabrá que este cuaderno viajó dentro.
- **`vercel.json` es configuración de Vercel, no del pipeline.** Seis líneas con
  `buildCommand` (`build:shared` y luego el workspace `@pmo/web`) y
  `outputDirectory`. Está bien planteado —resuelve el problema real del monorepo,
  que `@pmo/web` no compila sin `@pmo/shared` construido antes— pero **no mete el
  frontend en GitHub Actions**, y `TASKS.md` dice que sí (§9).
- **`docs/` sigue parado en `SESSION-2026-07-31.md`.** Van doce días y cinco de
  trabajo sin acta. Sigue sin decidirse si las cuatro memorias las sustituyen.
- **`DOC.md` no se toca desde el 08-03** (`a1e9554`), y es el documento donde
  viven los pendientes de decisión — que ahora incluyen dos gordos: qué se hace
  con la protección de Vercel y si el frontend entra en el pipeline.

---

## 15. Barrido de los entornos externos (2026-08-12, con el navegador)

Encargo del usuario: entrar yo a las consolas en vez de pedirle capturas. Todo en
**modo lectura**: no cambié un solo ajuste. Lo que sigue **corrige** parte de §14
—ahí me faltaba mirar dentro de Vercel—.

### ✅ Corrección a §14: el frontend **sí** es público, y es el nuestro

`https://pmo-frontend-ten.vercel.app` → **200**, `lang="es"`,
`<title>PMO Dashboard</title>`, y la pantalla de login de Sprint 1 pintada. Ese
es el **dominio de producción** del proyecto `pmo-frontend`. Lo que está detrás
del SSO es el alias del equipo y las vistas previas, que es el comportamiento
normal de Vercel. **Mi conclusión de §14 —«el producto solo lo puede ver su
dueño»— era falsa, y lo era porque probé el dominio equivocado: el que dice
`WEB_URL`.**

### 🔴 El fallo real, y es de una sola variable

**`WEB_URL` apunta al alias protegido en vez de al dominio de producción**, y de
ahí sale que el CORS de la API autorice un origen distinto del que sirve la
página. Comprobado en los dos sentidos:

```
OPTIONS /auth/me   Origin: https://pmo-frontend-ten.vercel.app
  -> access-control-allow-origin: https://pmo-frontend-antoniosanchez-5466s-projects.vercel.app
```

Y ejecutado **dentro** de la página pública, que es la prueba que no admite
discusión:

```js
fetch('https://pmo-api-.../auth/me', {credentials:'include'})
  -> BLOQUEADA: TypeError — Failed to fetch
fetch('https://pmo-api-.../health/live', {mode:'no-cors'})
  -> el servidor sí responde (opaque)
```

O sea: **la API está perfecta y el navegador tira todas las respuestas**. El
arreglo es poner `vars.WEB_URL` = `https://pmo-frontend-ten.vercel.app` y
redesplegar. No hay que tocar la protección de Vercel para nada.

_Nota de método:_ el rastreador de red del navegador enseñaba esas llamadas como
**503**, y `curl` contra la misma ruta daba 401. La diferencia no era el
servidor: un bloqueo de CORS no tiene código de estado, y quien mire solo esa
cifra concluye «la API está caída» y se va a depurar al sitio equivocado.

### 🔴 Los pushes a `master` no llegan a producción, y encima no compilan

Dos cosas distintas, las dos en la consola de Vercel:

1. **Branch Tracking = `main`.** Está escrito en Settings → Environments →
   Production: «Every commit pushed to the `main` branch will create a Production
   Deployment». **El repo trabaja en `master`.** Por eso `ccbd498` y `2123003`
   figuran como **Preview**, no como Production. **Es exactamente el mismo fallo
   que tuvo el CI** —el workflow escuchaba `main` mientras se trabajaba en
   `master`— y que este cuaderno tiene anotado como lo que dejó pasar un `lint`
   roto durante meses. Ha vuelto, en otra herramienta.
2. **`vercel.json` no arregló la compilación: la rompió.** El despliegue de
   `ccbd498` murió en 9 segundos:

   ```
   npm error Lifecycle script 'build:shared' failed with error:
   npm error workspace @pmo/web@0.1.0
   npm error location /vercel/path0/apps/web
   npm error Missing script: "build:shared"
   ```

   El `buildCommand` da por hecho que se ejecuta en la raíz del repo, y se
   ejecutó dentro de `apps/web`, donde ese script no existe: `build:shared` solo
   está en el `package.json` de la raíz.

**Lo que sostiene producción hoy es un redespliegue a mano.** En la lista de
despliegues, los dos únicos `Ready` son «Redeploy of 58vizb3ke»; todos los que
vienen de un push están en `Error`. Los ajustes de la interfaz (Root Directory
vacío, Build Command, Output Directory `apps/web/dist`) ya están bien puestos, así
que probablemente un push nuevo **sí** compile — pero seguiría cayendo en Preview
mientras la rama de producción sea `main`.

_Y hay una consecuencia que conviene decir:_ **el frontend en producción es el
código de `dbeb4d5`**, no el de HEAD.

### 🔴 La pantalla de consentimiento de Google está en «Prueba» y con cero usuarios

`console.cloud.google.com/auth/audience`:

| Campo | Valor |
|---|---|
| Estado de publicación | **Prueba** |
| Tipo de usuario | Externos |
| Usuarios de prueba | **ninguno** («No hay filas para mostrar») |
| Límite de OAuth | 0 usuarios (0 de prueba, 0 de otro tipo) / 100 |

Tres consecuencias, y ninguna deja rastro en nuestros logs:

1. **En «Prueba», el token de refresco de Google caduca a los 7 días.** La sesión
   de Gmail se rompe sola cada semana, y el síntoma es «dejó de entrar correo»
   sin ningún error el día que pasa.
2. **Sin usuarios de prueba, nadie que no administre el proyecto puede
   autorizar**: Google corta en su propia pantalla con «acceso bloqueado».
3. **Publicar no es un botón.** Los ámbitos que pide la aplicación son
   `gmail.modify` y `gmail.send`, que Google clasifica como **restringidos**:
   pasar a producción exige verificación con evaluación de seguridad. Es un
   trámite largo, y conviene saberlo ahora y no el día del arranque.

### ✅ Lo que sí está bien en el cliente OAuth

- **URI de redirección autorizada**, exacta:
  `https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback`. Era la duda que
  arrastraba desde el 08-07 y queda cerrada.
- Ámbitos pedidos: `openid email profile gmail.modify gmail.send`, con
  `access_type=offline` y `prompt=consent` — correcto para obtener refresco.
- ⚠️ Los **orígenes de JavaScript** listan el alias protegido y
  `http://localhost:3000`, y **no** el dominio de producción. En este flujo
  —redirección de servidor— no bloquea nada, pero es el mismo dominio equivocado
  otra vez, en un tercer sitio.
- ⚠️ **«Última fecha de uso: 29 de julio de 2026».** La propia consola avisa de
  que ese dato puede retrasarse «un día o más», pero de ser correcto significa
  que **desde el 29 de julio no se ha completado un intercambio OAuth**, lo que
  no cuadra con el «login verificado en producción» del árbol sin commitear. No
  lo doy por probado: lo dejo como lo que es, un indicador que apunta en contra.

### Inventario confirmado

| Entorno | Estado |
|---|---|
| **GitHub** | 7 variables, 2 secretos (los dos de WIF). Sin sorpresas |
| **Cloud Run** | servicio `pmo-api` + job `pmo-api-migrate`, `us-central1` |
| **Secret Manager** | **8 secretos**, los ocho que consume `deploy.yml` |
| **Artifact Registry** | repositorio `pmo`, formato DOCKER |
| **Pub/Sub** | **cero temas y cero suscripciones** — la tubería de Gmail no existe |
| **Vercel** | proyecto `pmo-frontend`, plan Hobby, **sin variables de entorno** |
| **Google OAuth** | un cliente web, creado el 24 jul, secreto habilitado |
| **Neon** | org ZEPTO, plan Free, `pmo-db` en **AWS Ohio**, historial **6 h** |
| **Upstash** | `pmo-redis` Free en **AWS Ohio**, 108 k/500 k comandos, sin expulsión, sin copias |
| **Anthropic** | nivel Scale · **una clave, «Make Consciente», vence el 17 ago** |
| **Google AI Studio** | dos claves, **ninguna del proyecto del PMO** |

### Neon, revisado (segunda pasada, con sesión)

| Campo | Valor |
|---|---|
| Organización · plan | ZEPTO · **Free** |
| Proyecto | `pmo-db` (`quiet-wave-45706493`), creado ~2026-08-05 |
| Región | **AWS US East 2 (Ohio)** |
| Ramas | **1** (`production`), de 10 |
| Cómputo | `.25 ↔ 2 CU` con autoescalado · **Scale to zero: 5 minutos** |
| **Ventana de historial** | **6 h** — el máximo del plan gratuito |
| Consumo | 0,81/100 CU-h · 33 MB/0,5 GB · 0/5 GB de red |
| Red | solo internet público; sin lista de IP ni VPC en este plan |
| Acceso | una persona, Admin |

**Lo que esto significa para la casilla «backups» del Sprint 8: hay seis horas de
restauración puntual y nada más.** No hay volcado programado en ninguna parte.
Una tabla borrada a las 09:00 se recupera hasta las 15:00; a las 15:01, no. Es el
mínimo del plan y conviene que sea una decisión y no un descubrimiento.

_Y un apunte de arquitectura:_ la base está en **AWS Ohio** y la API en **GCP
Iowa**. Los 28 ms que mide la sonda lo hacen perfectamente viable, pero cada
consulta cruza de nube, y eso no está escrito en ningún documento del proyecto.

### Upstash, revisado

| Campo | Valor |
|---|---|
| Base · plan | `pmo-redis` (`clean-flamingo-142554`) · **Free Tier** |
| Región | **AWS Ohio (us-east-2)**, tipo Global — **la misma que Neon** |
| Consumo | **108 k comandos / 500 k al mes** · 81 KB de 256 MB · 0 B de 50 GB |
| **Expulsión de claves** | **desactivada** ✅ |
| Copias | **ninguna** — la pestaña Backups está vacía |
| TLS | habilitado, puerto 6379 |
| Del plan gratuito | sin lista de IP, sin cifrado en reposo, sin SLA |

**La expulsión desactivada es lo correcto y conviene que quede escrito por qué:**
con expulsión encendida, al llenarse la base Redis empezaría a borrar claves para
hacer sitio, y en una cola eso significa **trabajos que desaparecen sin error**.
Apagada, la escritura falla y se entera alguien. Es la diferencia entre un fallo
ruidoso y uno silencioso, y aquí está del lado bueno.

⚠️ **108 k de 500 k comandos al mes, con el producto sin usuarios.** El consumo no
viene del trabajo: viene de que BullMQ sondea Redis mientras hay un proceso vivo.
Si se corrige el escalado a cero —que es lo que hay que corregir, ver abajo— el
consumo sube, no baja. Con el tope del plan gratuito eso deja de ser un detalle.

### 🔴 Los trabajos de fondo no corren a su hora, y aquí está la prueba

Era una deducción cuando junté el escalado de Cloud Run con el cron de BullMQ.
**Ya no lo es: está en el registro de la propia cola.** `deploy.yml` **no pasa
`--min-instances` ni `--no-cpu-throttling`**, así que la revisión se queda en el
valor por defecto —cero instancias sin tráfico, CPU estrangulada entre
peticiones— y el barrido de vencidas es un job repetible (`5 * * * *`,
`overdue.constants.ts:16`), o sea un temporizador que necesita un proceso vivo.

`bull:overdue-sweep:completed` es un conjunto ordenado de **29 elementos** donde
el identificador lleva la hora **programada** y el marcador la hora **de
ejecución**. Convertidas:

| Programado (UTC) | Ejecutado (UTC) | Retraso |
|---|---|---|
| 2026-08-11 00:05:00 | 2026-08-11 00:26:01 | 21 min |
| **2026-08-11 01:05:00** | **2026-08-12 16:35:28** | **39,5 h** |

Las citas del cron son las de identificador redondo; las demás son el barrido de
arranque, que sí sale puntual porque lo dispara el propio arranque. **Y las dos
ejecuciones del 08-12, a las 16:35 y 17:36 UTC, coinciden con mis propias
sondas**: el barrido que llevaba atascado desde el día 11 se disparó en cuanto
mis peticiones despertaron el contenedor. Es decir: **lo desperté yo, sin
querer, y eso es la demostración**.

Sumado a que Pub/Sub no existe (§14), **la mitad de fondo del producto está
inerte en producción**: ni entra correo, ni se marcan las tareas vencidas a su
hora. Y explica por qué todo se ve sano desde fuera — **lo único que falla es lo
que no responde a una petición HTTP**, y las sondas solo miran lo que sí.

_Se arregla con `--min-instances=1` y `--no-cpu-throttling` en el despliegue._
Cuesta dinero (una instancia siempre encendida) y sube el consumo de Upstash: es
decisión de Doc, no mía. La alternativa barata sería mover el barrido a Cloud
Scheduler llamando a una ruta, que es lo que Cloud Run espera de un cron.

### 🔴 Anthropic: la clave caduca el 17 de agosto, y es la única que hay

`console.anthropic.com` redirige a **`platform.claude.com`** —el permiso que
faltaba era el de ese dominio, no el del primero—. Dentro, una sola clave:

| Campo | Valor |
|---|---|
| Nombre | **«Make Consciente»** |
| Creada | 18 jul 2026 |
| **Vence** | **17 ago 2026** |
| Último uso | **4 ago 2026** |
| Coste acumulado | $0,31 |

**Faltan cinco días.** Cuando caduque, la clasificación de correos y el copiloto
empiezan a devolver 401 —no un error de configuración, no un fallo de despliegue:
una credencial vencida—, y como la ingesta ya está apagada, es muy posible que
nadie lo note hasta que alguien abra el copiloto y no funcione.

**Y el nombre no es un detalle: la clave nació para otra cosa.** «Make
Consciente» es de un escenario de Make.com, no de este proyecto. El PMO va
montado sobre una credencial prestada de otro sistema: si allí la rotan o la
borran, esto se cae, y nadie relacionará una cosa con la otra. Es el mismo patrón
que `WEB_URL` apuntando a otra aplicación (§13) — **infraestructura de otro
proyecto reutilizada porque estaba a mano**.

_El «último uso: 4 ago» encaja con todo lo demás de este barrido:_ la mitad de
fondo del producto lleva días sin ejecutarse.

### ⚠️ El gasto no tiene freno real

| Campo | Valor |
|---|---|
| Organización · nivel | Individual · **Scale** |
| Saldo | $12,50 con **recarga automática activada** (Visa ••••0905) |
| Gastado en el mes | $0,31 |
| **Límite de gasto mensual** | **USD 200 000** |

Un tope de doscientos mil dólares **con recarga automática y tarjeta guardada no
es un tope**. El límite de 20 peticiones/minuto de `/copilot` protege del abuso
de fuera, no de un bucle propio: el tope de 4 vueltas del bucle de herramientas
es hoy la única barrera real, y es de código, no de cuenta.

Los **límites de tasa no son un problema**: nivel Scale, 10 000 peticiones y 10 M
de tokens de entrada por minuto en Opus y Sonnet 5. Nada que ver con el 429 de
Anthropic que motivó el código de espera del 08-05, que sería de ráfaga.

### ⚠️ Gemini: dos claves, ninguna del proyecto del PMO

| Clave | Proyecto de Google | Nivel |
|---|---|---|
| `…YnSQ` | `My First Project` (`continual-loop-496922-h9`) | 1 · pospago |
| `…BNpY` | `Gemini Project` (`gen-lang-client-0325947422`) | 2 · pospago |

Las dos son del **20 may 2026** y **ninguna pertenece a
`pmo-dashboard-503418`**. No puedo decir cuál de las dos está en Secret Manager
sin leer el secreto, y no lo voy a hacer. Lo que importa es el patrón, que ya van
tres: **la aplicación de producción se sostiene sobre credenciales y dominios de
otros proyectos** — la clave de Anthropic de un escenario de Make, las de Gemini
de dos proyectos sueltos, y hasta el 08-10 la `WEB_URL` de una aplicación ajena.
Ninguna de esas dependencias está escrita en ningún documento del repositorio.

### Inventario cerrado

No queda ningún entorno sin revisar.

---

## 16. Verificación de la Fase 1 (2026-08-12, en el navegador)

Doc ejecutó la Fase 1 y me pidió comprobar el resultado. **Entré yo a la
aplicación desplegada**, con permiso expreso del usuario y sin escribir ninguna
contraseña.

### ✅ Por primera vez, el producto funciona de extremo a extremo

En una **ventana normal** —no incógnito— la sesión vive y el tablero carga:

| Comprobación | Resultado |
|---|---|
| `GET /auth/me` | **200** |
| `GET /tags` · `GET /emails?status=PENDING` · `GET /health` | **200** los tres |
| WebSocket | **conectado** — `🔗 Conectado a WebSocket 3lnwajjDVVtNORNcAAAF` |
| Cuenta | `antonio.sanchez@zepto.com.mx`, rol `owner`, **permisos de Gmail concedidos** |
| Revisión que sirve | `vpmo-api-00033-g6g` |
| Kanban | las cinco columnas, **vacías de verdad** — sin `MOCK_TASKS` |
| Bandeja | **0 correos · 0 conversaciones** |

**El socket conectado cierra en vivo la tercera rotura del §12**, que hasta hoy
solo estaba comprobada leyendo el código. Y las columnas vacías cierran la del
respaldo falso: con la API respondiendo y sin datos, el tablero enseña vacío en
vez de cinco tareas inventadas, que era justo el hallazgo.

_Los 0 correos no son un fallo nuevo: son la ingesta apagada de la Fase 3,
visible ahora en la pantalla en vez de deducida del `deploy.yml`._

### ✅ El diagnóstico de Doc sobre el bucle era correcto

El bucle de login se daba en **incógnito**, donde Chrome bloquea las cookies de
terceros por defecto. En ventana normal no ocurre. Queda confirmado que el
backend hacía su parte y que lo que fallaba era el navegador descartando la
cookie — y con ello, que **la solución de fondo sigue siendo un dominio propio**,
no una bandera: hoy la sesión depende de que cada navegador acepte cookies
cruzadas, y esa puerta se está cerrando en toda la industria.

### Variables de la revisión viva, leídas directamente

`WEB_URL` = `https://pmo-frontend-ten.vercel.app` ✅ ·
`COPILOT_EMAIL_TRANSPORT` = `mock` ✅ ·
`ANTHROPIC_API_KEY` → `pmo-anthropic-api-key:latest` ✅ ·
`SERVICE_VERSION` = `ccbd498…` (HEAD).

⚠️ **Y aquí se ve el aviso que di al revisar el plan, ya no como hipótesis:**
`COPILOT_EMAIL_TRANSPORT=mock` **existe solo en esta revisión inyectada a mano**.
`deploy.yml` construye su lista con `--set-env-vars`, que reemplaza el conjunto
entero, y esa variable no está en la lista. **El primer push de la Fase 2 la
borra**, sin error y sin rojo, y el transporte vuelve a Gmail real. Tiene que
entrar en `deploy.yml` antes de que la Fase 2 despliegue algo.

### 🔴 Defecto nuevo: la vista de Métricas no carga en producción

`Error al cargar métricas: Failed to fetch metrics`, y en la red:

```
GET /dashboard/metrics?tz=America/Cancun  ->  401
```

**401 en la misma sesión en la que `/auth/me`, `/tags` y `/emails` dan 200.** La
causa está en `useDashboardMetrics.ts:15`:

```js
const response = await fetch(`${API_BASE}/dashboard/metrics?tz=${tz}`);
```

**Le falta `credentials: 'include'`.** Sin eso el navegador no adjunta las
cookies en una petición cross-site, y la API responde lo que debe: 401. Es la
**única** llamada de `apps/web` a la que le falta —comprobado archivo por
archivo; `time.api.ts` y `tags.api.ts` parecen sospechosas pero solo redefinen
`API_BASE` localmente y sí llevan credenciales, y el `/health` de `App.tsx` es
público—.

**Es el último superviviente del saneamiento de la capa de API**: a este archivo
le arreglaron la URL y se le olvidaron las credenciales. Y de paso se salta el
reintento con `/auth/refresh` que da `apiFetch`, así que ni siquiera se recupera
cuando caduca el token de 15 minutos.

**En local no se ve**, porque el proxy de Vite lo convierte en mismo origen y ahí
las cookies viajan solas. Es exactamente la misma forma de fallo que todo lo
demás de este proyecto: **solo existe en producción**.

_Se arregla llamando por `apiFetch`, que da las dos cosas a la vez. Es
`apps/web`, o sea dominio de Gravity._

---

## 17. Verificación de la Fase 2 (`c836d1f`) — y tres correcciones al parte

Doc reportó la Fase 2 y pidió que registrara. Comprobé antes de registrar, y el
parte tiene tres cosas que no se sostienen contra el estado real.

### ✅ Lo que sí está, verificado

- **`workflow_dispatch` está bien hecho.** Era mi aviso nº 2 al revisar el plan:
  añadirlo a `ci.yml` sin tocar el `if` de `deploy.yml` habría dejado un botón
  que corre y no despliega. **Se hizo bien**, con el `if` reagrupado:
  `vars.GCP_PROJECT_ID != '' && ( event_name == 'workflow_dispatch' || ( … ) )`,
  y el `ref`/`SHA` con respaldo `workflow_run.head_sha || github.sha`, que es el
  detalle que se olvida y deja la imagen etiquetada con la cadena vacía. El
  comentario del propio archivo describe el fallo del que avisé.
- **`COPILOT_EMAIL_TRANSPORT` y las cuatro `GMAIL_PUBSUB_*` ya están en
  `deploy.yml`**, leídas de `vars`, con aviso si faltan. Era mi aviso nº 1.
- **`vercel.json` eliminado** y **el arreglo de Métricas es el correcto**:
  `apiFetch<DashboardMetrics>(…)`, que da credenciales **y** el reintento.

### ❌ Corrección 1: nunca se reactivó el envío de correos reales

El parte dice que se desplegó una revisión sin el mock. **No llegó a existir.**

| Comprobación | Resultado |
|---|---|
| `latestReadyRevisionName` | **`pmo-api-00033-g6g`** |
| Creada | **21:58**, o sea la de la Fase 1 |
| `SERVICE_VERSION` de esa revisión | `ccbd498…` — **no** `c836d1f` |
| `COPILOT_EMAIL_TRANSPORT` en ella | **`mock`**, presente |
| Revisiones posteriores a las 21:58 | **ninguna** |

El despliegue por `workflow_run` (`31647146749`, 22:29) figura como
**`cancelled`** a los 2 m 21 s. Lo canceló el `concurrency: cancel-in-progress`
cuando entró el despliegue manual (`31647295146`) a las **22:31:15** — es decir,
**unos 18 segundos antes de que el otro terminara**. La ventana de riesgo no
llegó a abrirse.

### ⚠️ Corrección 2: lo que salvó la situación no fue el diseño condicional

El parte concluye que «el error humano demostró que el diseño condicional de
`ENV_VARS` funciona». **A medias.** Demostró que el **aviso salta**; no impidió
nada, porque por diseño avisa y sigue. Lo que impidió el incidente fue
`concurrency: cancel-in-progress`, que es un ajuste sin relación con esto y que
funcionó por un margen de segundos.

**Y eso deja una pregunta de diseño abierta**, que no me toca decidir pero sí
señalar: para una variable cuyo modo de fallo es *mandar un correo auténtico a
una persona real*, un aviso no es un guardarraíl. `GOOGLE_REDIRECT_URI` **para**
el despliegue cuando está mal; esta no. Las dos salidas razonables son
equipararla —que pare— o quitarle el filo en el código: hoy
`copilot.module.ts:66` trata **cualquier valor distinto de `mock`, y la ausencia,
como envío real**, así que el estado peligroso es el que sale por defecto.
Invertirlo —real solo si alguien lo pide explícitamente— elimina la clase entera
de fallo en vez de vigilarla.

### ⚠️ Corrección 3: el arreglo de Métricas no está en producción

El código está en `master`; **el frontend servido no ha cambiado**. El bundle de
`pmo-frontend-ten.vercel.app` sigue siendo **`index-CFVaNA44.js`**, el mismo de
antes del push. Es decir, **se sigue sirviendo el `fetch` sin credenciales y la
vista de Métricas sigue dando 401 a cualquiera que la abra**.

La causa más probable es que la **alineación de ramas en Vercel** —punto 1 de la
Fase 2— no se ha hecho: con la rama de producción en `main`, el push a `master`
produce una vista previa y producción no se entera. El parte no lo menciona.

### ✅ El despliegue manual, verificado

`31647295146` (`workflow_dispatch`) terminó en **success** a las 22:35:36 y
publicó **`pmo-api-00034-68q`**, que es la que sirve. Variables leídas de la
revisión, no del parte:

| Variable | Valor |
|---|---|
| `SERVICE_VERSION` | **`c836d1f…`** — el código de la Fase 2 |
| `COPILOT_EMAIL_TRANSPORT` | **`mock`** |
| `WEB_URL` | `https://pmo-frontend-ten.vercel.app` |
| `GMAIL_PUBSUB_*` | ausentes, como se esperaba (Fase 3) |

**Lo importante es de dónde sale ahora el `mock`:** ya no de una inyección
manual, sino de `deploy.yml` leyendo `vars`. Sobrevive al siguiente despliegue,
que es lo que no pasaba esta mañana. Aviso nº 1 cerrado del todo.

Sondas en vivo contra esa revisión: `/health/ready` **200** (base 93 ms, esquema
con 9 aplicadas y 0 a medias, Redis 47 ms) · `/auth/me` **401** sin cookie ·
`/auth/google` **302** · CORS devolviendo el dominio público. Las cuatro
correctas.

_Y queda dicho, porque el propio archivo lo advierte:_ **el botón manual se salta
el CI a propósito**. Aquí no hubo riesgo —el SHA desplegado es el mismo que el CI
puso en verde cuatro minutos antes— pero el botón conserva la capacidad de
publicar código sin probar, y eso hay que saberlo al pulsarlo.

### El frontend, diagnosticado en el panel de Vercel

Doc pidió entender por qué no se actualizó el bundle. **La respuesta es limpia y
son dos hechos separados, uno bueno y uno pendiente:**

| Hecho | Estado |
|---|---|
| Compilación de `c836d1f` | ✅ **Ready en 25 s** |
| Entorno en que quedó | ❌ **Preview** |
| Producción sigue siendo | «Redeploy of 58vizb3ke», de hace dos días |
| Branch Tracking (Settings → Environments → Production) | **`main`**, sin cambiar |

**Borrar `vercel.json` arregló la compilación.** Es un resultado de verdad y
conviene no perderlo: el despliegue de `ccbd498` moría en 9 s con
`Missing script: "build:shared"`, y este pasa en 25 s. La configuración de la
interfaz —directorio raíz vacío, `apps/web/dist`, comando propio— es la que
funciona, y el archivo en el repositorio era el que estorbaba.

**Y no llegó a producción por una sola razón:** el punto 1 de la Fase 2 —alinear
la rama— no se ejecutó. Con Branch Tracking en `main` y el repositorio trabajando
en `master`, un push produce una vista previa y producción no se entera. No es un
fallo del build ni del commit: es un ajuste que se quedó sin tocar.

Consecuencia vigente: **Métricas sigue rota para cualquiera que abra la
aplicación**, porque se sirve el bundle viejo con el `fetch` sin credenciales,
aunque el arreglo lleve horas en `master`.

**Lo que la cierra son dos gestos**, y ninguno es mío: poner `master` en Branch
Tracking, y **promover a producción la vista previa de `c836d1f`** que ya está
construida y en verde —promover evita reconstruir—. Con
`Auto-assign Custom Production Domains` activado, el dominio se reasigna solo.

Es media fase: la parte de Claude está hecha y verificada; la de Gravity, no.

### ✅ Cierre de la Fase 2: verificado en producción

Doc alineó la rama y promovió `c836d1f`. Comprobado por mí, entrando:

| Comprobación | Resultado |
|---|---|
| Bundle servido | **`index-DqcH8EI6.js`** — era `index-CFVaNA44.js` |
| `GET /dashboard/metrics?tz=America/Cancun` | **200** — estaba en **401** |
| `/auth/me` · `/tags` · `/emails` · `/health` | 200 los cuatro |
| WebSocket | conectado, desde el bundle nuevo |
| Consola | sin errores |

**La vista de Métricas pinta.** Ventana 6/8 – 12/8, las cuatro tarjetas (WIP,
atrasadas, completadas, bandeja) y las dos gráficas. Todo a cero, que es la
verdad: no hay datos porque no hay ingesta ni tareas. Es exactamente lo que
tenía que pasar — **una pantalla vacía y honesta en vez de números inventados**,
que es donde empezó todo esto en el corte del 2026-07-29.

Dos detalles que aprovecho para dar por buenos, porque solo se ven con la vista
funcionando:

- **El eje X va de `06-ago` a `12-ago` y termina hoy**, en hora local. La trampa
  del `new Date()` interpretando `YYYY-MM-DD` como UTC —que corría cada barra un
  día— está resuelta también en producción.
- La nota «las tareas completadas antes del último despliegue no tienen registro
  de fecha y no aparecerán aquí» sale en pantalla. Es el comportamiento
  documentado de `completedAt`, no un fallo, y **está bien que el producto lo
  diga en vez de callárselo**.

**Con esto la Fase 2 queda cerrada entera**, backend y frontend, y con ella el
último resto del hallazgo rojo que abrí el 2026-08-07.

### ✅ El fail-safe del transporte de correo, implementado y verificado (`00af5ef`)

Era «decisión tomada y no implementada» hace unas horas. Ya no. Y **es el primer
parte del día que no necesita una sola corrección**: comprobé los cuatro puntos y
los cuatro se sostienen.

**El código está bien hecho, y el detalle importa.** `copilot.module.ts` compara
contra una lista cerrada de **valores que encienden** el envío
(`TRANSPORTES_REALES = ['real', 'smtp']`) en vez de contra los que lo apagan.
Ausente, vacío o irreconocible → simulado. Un `=reall` con un dedazo se queda en
simulado **y lo dice en el log**, en vez de salir a la calle. Es la forma
correcta del guardarraíl: la lista de lo que envía de verdad es corta y cerrada;
la de lo que no, infinita.

| Comprobación | Resultado |
|---|---|
| Revisión viva | **`pmo-api-00035-45f`** |
| `SERVICE_VERSION` | `00af5ef…` |
| `COPILOT_EMAIL_TRANSPORT` en la revisión | **ausente** |
| Log de ejecución | **`Transporte de correo: SIMULADO (no se envía nada)`** ×2 |
| Origen del despliegue | `workflow_run` — pasó por CI, no por el botón manual |

Esa última fila importa: el despliegue **no** usó el atajo manual, así que el
código desplegado está probado.

**Y los guardarraíles nuevos corrieron de verdad**, leído en el log del run
`31649348661`:

```
Comprobando WEB_URL: https://pmo-frontend-ten.vercel.app
WEB_URL sirve este frontend y responde sin credenciales.
```

La comprobación busca **`<title>PMO Dashboard`** en el HTML servido — que es
exactamente lo que propuse en §13 y §14 tras el episodio del dominio ajeno.
Existe además un paso aparte, «Comprobar que el CORS de la revisión admite
`WEB_URL`», separado a propósito porque **en el momento de validar la variable la
revisión que sirve todavía lleva la anterior**. Ese razonamiento es correcto y no
es obvio.

**Higiene de git respetada por primera vez:** `00af5ef` toca cinco archivos y
**`ALANA.md` no está entre ellos**.

### ⚠️ Un punto de la Fase 4 que ya no es lo que dice

El parte anuncia como pendiente «la clave de Anthropic, que vence el 17 de
agosto». **Eso quedó atrás en la Fase 1 y arrastrarlo puede hacer daño.** Hoy hay
dos claves:

| Clave | Vence | Último uso |
|---|---|---|
| **`pmo-api-produccion`** (12 ago) | **10 nov 2026** | **— nunca** |
| `Make Consciente` (18 jul) | 17 ago 2026 | 4 ago · $0,31 |

La que está en producción es la nueva: `pmo-anthropic-api-key` tiene **versión 2
desde las 21:43 de hoy** y la revisión lee `:latest`. **La urgencia del día 17
desapareció**; quedan casi tres meses.

Dos cosas que sí quedan, y ninguna es la que dice el parte:

1. **La clave nueva no se ha usado nunca.** «Último uso: —». Está cableada, que
   no es lo mismo que probada: un pegado con un carácter de más daría un 401 en
   el primer uso del copiloto, y hoy nadie lo ha ejercitado porque no hay
   clasificación de correos ni se ha abierto el chat. **Se comprueba en un
   minuto**: un mensaje en el copiloto.
2. **`Make Consciente` sigue viva y sigue caducando el 17.** Ya no la usa el PMO,
   pero presumiblemente sí el escenario de Make. El riesgo ahora es el inverso al
   de esta mañana: que alguien la borre creyendo que es la vieja del PMO y tumbe
   la automatización de al lado.

### ✅ La clave nueva está probada, no solo cableada

Doc hizo la prueba de humo en el copiloto. **Comprobado en la consola:**
`pmo-api-produccion` pasó de `Costo: —` a **`$0.01`**, y el saldo de la
organización bajó de **$12,50 a $12,49**. La cadena entera —Secret Manager →
revisión → llamada real a Anthropic— funciona.

_El campo «Último uso» sigue en `—`, pero eso es el retraso que la propia consola
declara. El coste es la señal fiable, y se movió._

Con eso queda cerrado el único pendiente real que le quedaba a la clave, y
`Make Consciente` se deja en paz por decisión de Doc, que es lo correcto: es de
otro sistema.

---

## 18. Fase 3 — foto de partida (2026-08-12)

Doc anuncia la entrada en la Fase 3. Tomo la medida **antes** de que se toque
nada, para poder decir después qué cambió de verdad y no fiarme del parte.

| Elemento | Estado hoy |
|---|---|
| Temas de Pub/Sub | **ninguno** |
| Suscripciones de Pub/Sub | **ninguna** |
| Trabajos de Cloud Scheduler (`us-central1`) | **ninguno** |
| Revisión viva | `pmo-api-00035-45f` (`SERVICE_VERSION=00af5ef`) |
| `GMAIL_PUBSUB_*` en la revisión | ausentes las cuatro |
| Barrido de vencidas | la cita de las 01:05 del 08-11 se ejecutó **39,5 h tarde** |
| Bandeja de la aplicación | **0 correos · 0 conversaciones** |
| Upstash | **108 k / 500 k** comandos del mes |

### Lo que comprobaré cuando la Fase 3 diga estar hecha

Y lo dejo escrito ahora, antes de tener el parte delante, para que la lista no se
adapte al resultado:

1. Que existan **tema y suscripción push**, y que la suscripción apunte a
   `/webhooks/gmail` con OIDC y la audiencia que el guard verifica.
2. Que las **`GMAIL_PUBSUB_*` estén en la revisión**, no solo en `vars`.
3. Que **desaparezca del log de arranque** la línea «no está configurado.
   Omitiendo» de `gmail.service.ts:354`. Mientras esa línea salga, no está hecho,
   por muy verde que vaya todo lo demás.
4. Que **un correo real recorra la cadena** —push recibido → trabajo encolado →
   tarea creada— y aparezca en la bandeja, que hoy está a cero.
5. Que el **barrido de vencidas se ejecute con retrasos de segundos**, no de
   horas, y que la cita venga de Cloud Scheduler y no de un temporizador dentro
   del contenedor.
6. Que el **consumo de Upstash no se dispare**: es el efecto colateral esperado
   de reactivar el trabajo de fondo, y el plan gratuito tiene tope mensual.

_Y una que no es técnica:_ que el escalado siga en cero instancias. Si aparece un
`--min-instances`, la decisión de arquitectura habrá cambiado sin decirlo, y eso
cuesta dinero todos los meses.

### Auditoría de la arquitectura propuesta (antes de escribir código)

Doc pidió revisar el diseño de la Fase 3 antes de encargarlo. **La forma es
correcta** —Cloud Scheduler en vez de `--min-instances`, y el push de Pub/Sub
despierta el contenedor solo, así que la ingesta no necesita instancia
encendida—. Y la **renovación del `users.watch` cada 5 días** es un acierto que
yo no tenía anotado: sin ella la ingesta muere a los 7 días sin decir nada.

Lo que encontré, comprobado en el código de HEAD:

**🔴 1. El prefijo `/api` no existe. Sería la cuarta vez.** `main.ts` **no llama
a `setGlobalPrefix`** —verificado directamente—, así que `/api/cron/overdue` y
`/api/cron/gmail-watch` darían **404**. Las rutas son `/cron/…`. Este error ya se
cometió tres veces (§12) y `deploy.yml` tiene una validación escrita a propósito
contra él para `GOOGLE_REDIRECT_URI`. La audiencia del webhook, en cambio, está
bien: `/webhooks/gmail` sí existe.

**🔴 2. Las variables ya están cableadas, y son cuatro, no tres.** `deploy.yml`
las lee de `vars` desde `c836d1f`, con aviso si faltan. **El trabajo pendiente es
`gh variable set`, no tocar el workflow**; si Claude las «inyecta» otra vez,
duplicará o pisará el bloque que ya avisa. La cuarta es
`GMAIL_PUBSUB_ALLOW_UNSIGNED` y **no hace falta ponerla**: el guard la ignora en
producción (`!isProduction && …`), así que no es una puerta abierta.

**🟠 3. Falta una cuenta de servicio, y una variable vacía desarma el guard.**
`gmail-api-push@system.gserviceaccount.com` es quien **publica en el tema**;
quien **firma el OIDC del push** es otra cuenta, la que se designa en la
suscripción, y el agente de Pub/Sub necesita `serviceAccountTokenCreator` sobre
ella. Sin ese paso la suscripción no puede firmar. Y `GMAIL_PUBSUB_SERVICE_ACCOUNT`
debe llevar **ese** correo: el guard hace `if (expectedAccount && …)`, así que
**vacía se salta la comprobación** y bastaría cualquier token de Google con el
`aud` correcto. El servicio es `--allow-unauthenticated`: esa es la única puerta.

**🟠 4. Reusar `PubSubAuthGuard` en el cron dará 401.** Compara `payload.email`
contra `GMAIL_PUBSUB_SERVICE_ACCOUNT`, y Cloud Scheduler firma con **su propia**
cuenta. Hace falta guard propio o lista de cuentas admitidas, cada una con su
audiencia.

**🟠 5. Problema de estado: quitar el job de BullMQ del código no lo apaga.**
`overdue.scheduler.ts` usa `upsertJobScheduler(OVERDUE_SCHEDULER_ID, …)` y **la
programación vive en Redis**. Sin un `removeJobScheduler` explícito, la clave se
queda en Upstash —la vi: `bull:overdue-sweep:*` con 29 completados— y el barrido
**puede seguir disparándose** cuando haya instancia viva, duplicando el de
Scheduler.

**🟠 6. La renovación de 5 días choca con el token de 7 días.** `users.watch` es
por usuario y usa su token de Google; con la pantalla de consentimiento en
«Prueba», **el refresco caduca cada 7 días**. La cadencia de 5 ayuda, pero si el
usuario no vuelve a entrar, el token muere y la renovación falla en silencio. Es
la primera dependencia dura entre la Fase 3 y la verificación de Google que está
aparcada en la Fase 4.

**🟡 Menores:** quién dispara el **primer** `watch` (que la ruta B sirva también
para eso y se llame a mano tras desplegar, en vez de esperar 5 días) ·
reintentos de Scheduler ante no-2xx, que con arranque en frío pueden solapar dos
barridos · `@SkipThrottle()` en las rutas nuevas, como ya lo llevan sondas y
webhook · el tema en la variable con **nombre completo**
(`projects/…/topics/gmail-ingest`), que es lo que exige `users.watch`.

_Apunte de siempre:_ `c836d1f` volvió a llevarse `ALANA.md` dentro —644 líneas—
sin mencionarlo en el mensaje. Van tres.

---

## 19. Auditoría de la Fase 3 **ejecutada** (2026-08-13)

Contrastado contra `HEAD` = `34d75d1` y la revisión viva `pmo-api-00037-ztk`
(`SERVICE_VERSION` = `c8c87f0`). Los tres commits posteriores a `c8c87f0` tocan
solo `.md`, que `ci.yml` ignora por `paths-ignore`: **la producción va al día**,
no atrasada.

### 19.1 Los seis hallazgos de §18, uno a uno

| # | Hallazgo de §18 | Estado | Prueba |
|---|---|---|---|
| 🔴1 | `/api/cron/...` daría 404 | **Corregido** | `@Controller('cron')`; en el log, `Mapped {/cron/overdue, POST}` |
| 🔴2 | Variables ya cableadas, y son cuatro | **Corregido** | `gh variable list`: las `GMAIL_PUBSUB_*` (menos `ALLOW_UNSIGNED`, que no hace falta) + 2 `CRON_*` |
| 🟠3 | Falta cuenta firmante; variable vacía desarma el guard | **Corregido a medias** | ver 19.5 |
| 🟠4 | Reusar `PubSubAuthGuard` en `/cron` daría 401 | **Corregido** | `CronAuthGuard` propio; `GoogleOidcVerifier` comparte solo la verificación |
| 🟠5 | El repetible de BullMQ sigue en Redis | **Corregido y verificado dos veces** | ver 19.3 |
| 🟠6 | Renovar cada 5 días con token de 7 | **Mejorado**, no resuelto | pasa a diario; la dependencia con la verificación de Google sigue en pie |

Los cuatro menores también: la misma ruta registra y renueva, `@SkipThrottle()`
está puesto, y el tema viaja con nombre completo
(`projects/pmo-dashboard-503418/topics/gmail-ingest`).

**El error del prefijo se cometió igual.** En el log de las 02:30:04 UTC está
`POST /api/cron/overdue 404`. Se detectó dentro del mismo minuto porque el 404
salió en la consola de Cloud Run, no en la de Scheduler. La advertencia sirvió
para el código, no para la mano que configuró el job.

### 19.2 La infraestructura, tal como está

Todo comprobado con `gcloud`, no con el parte de nadie:

- **Scheduler** — `pmo-overdue-sweep` (`5 * * * *`) y `pmo-gmail-watch-renew`
  (`30 2 * * *`), los dos en `America/Cancun`, `ENABLED`, firmando con
  `pmo-scheduler@…` y con `aud` = `https://pmo-api-mlpuuasqka-uc.a.run.app/cron`,
  **idéntica a `CRON_OIDC_AUDIENCE`**. Una sola audiencia para los dos jobs, que
  es lo que exige una única variable.
- **Pub/Sub** — tema `gmail-ingest` con `roles/pubsub.publisher` para
  `gmail-api-push@system.gserviceaccount.com`; suscripción `gmail-ingest-push`
  contra `/webhooks/gmail` con OIDC de `pmo-pubsub-push@…`; y el agente
  `service-614812477499@gcp-sa-pubsub` tiene `serviceAccountTokenCreator` sobre
  esa cuenta. **Las tres piezas que faltaban en §18, puestas.**
- **Cloud Run** — `--allow-unauthenticated` sigue (`allUsers` → `run.invoker`),
  que es correcto: el navegador llama a esta API. Por eso los guards son la
  única puerta y por eso importa el 19.5.
- **Ejecuciones reales** — `/cron/gmail-watch` **200** a las 02:41:51 y
  `/cron/overdue` **200** a las 03:05:02 UTC (= 22:05 en Tulum, que cuadra con
  `5 * * * *` en `America/Cancun`).

### 19.3 La purga de BullMQ, comprobada por dos caminos

1. **En el log**: `Purgado el planificador BullMQ "overdue-sweep-cron"` a las
   02:29:11, y en el arranque siguiente (03:21:48) ya `Sin crones BullMQ
   pendientes de purgar`.
2. **En Upstash**: `bull:overdue-sweep:completed` conserva 37 entradas y la más
   reciente es `1786588151721` → **02:29:11 UTC exactas**. Ni una después. El
   repetible dejó de dispararse en el instante de la purga, y el barrido de las
   03:05 vino de Scheduler.

En las tres horas siguientes hay **una sola** línea de barrido. No hay cron
fantasma.

### 19.4 Lo que queda abierto

**🔴 A. Fallo nuevo, sin registrar en ninguna memoria: el copiloto se rompe con
dos herramientas en el mismo turno.**

En el log de las 02:56:23 UTC:

> `Copiloto interrumpido (anthropic/pro, hilo cmsqxb46m0007hnyt20aozwu4): 400
> … tool_use ids were found without tool_result blocks immediately after:
> toolu_01MNYF3RDhDwiEjCJqHhZVuL, toolu_01Wb7sNhidZ7ftNZg7iynXd6`

**Dos ids en un mismo mensaje.** El mecanismo está en
`llm/anthropic.strategy.ts:183-198`: se empuja
`{ role: 'assistant', content: final.content }` —el contenido **entero**, con
todos los `tool_use`— y a continuación un mensaje de resultados construido solo
sobre `ejecutables`. Todo `tool_use` que **no** sea ejecutable —una herramienta
que espera confirmación humana, como redactar un correo, o un nombre que no está
en `NOMBRES`— viaja sin su `tool_result`, y la API lo rechaza con 400.

Se dispara cuando el modelo pide en un mismo turno algo que se ejecuta y algo
que se propone. No lo cubre ninguna prueba: `copilot.spec.ts` ejercita los dos
casos por separado, nunca mezclados.

**🟠 B. El siguiente límite que se agota es Redis, no la clave de Anthropic.**

Upstash marca **177 k de 500 k comandos** del mes (79.884 escrituras / 97.216
lecturas), con 107 KB de almacenamiento. `CLAUDE_MEMORY.md` anotó 108 k; **la
cifra ya no es esa**. Entre dos lecturas de la consola separadas por un par de
minutos subió de 174 k a 177 k, con el contenedor caliente — son cifras
redondeadas y no sirven para extrapolar, pero apuntan a que quien consume no son
los correos sino **los workers de BullMQ sondeando mientras hay instancia viva**.
Merece una medición seria: si el cubo se agota, se cae la cola, y con la cola se
cae la ingesta entera.

**🟠 C. La suscripción no tiene cola de mensajes fallidos.**
`deadLetterPolicy` está vacío y `retryPolicy` también. Un aviso que el webhook
no consiga procesar se reintenta contra el servicio hasta agotar la retención
—siete días— sin que nadie lo vea. Hay `DeadLetterModule` para BullMQ, pero eso
es la capa de abajo: lo que falta es del lado de Pub/Sub.

**🟡 D. El código nuevo no tiene ni una prueba.** 535 pruebas en 21 suites, las
mismas que antes de la Fase 3. `CronController`, `CronAuthGuard`,
`GoogleOidcVerifier` y `OverdueCronPurge` entraron con cobertura **cero**, y son
justamente las piezas que deciden quién puede disparar trabajo en producción.
Lo único que hay bajo `common/security/` con prueba es `throttle.config.spec.ts`.

**🟡 E. `CLAUDE_MODEL_CLASSIFY` no está definida.** Está en la lista de
`deploy.yml` y en `.env.example`, pero no en `gh variable list`, así que en cada
arranque se registra el aviso y se clasifica con el valor por defecto. Da igual
—coincide con el que se quiere— pero es ruido en cada arranque y una variable
que el pipeline cree que inyecta.

**🟡 F. Pub/Sub entrega cada aviso dos veces.** Confirmado en el log: a las
03:26:22 y 03:27:05 hay pares de jobs, uno encuentra 1 correo y el otro 0. El
`jobId = messageId` no deduplica porque son `messageId` distintos. Inofensivo
para los datos, pero es el trabajo que alimenta el punto B. Doc ya lo tiene en
su backlog.

### 19.5 Sobre el fail-open que quedó a medias (§18-3)

`GoogleOidcVerifier` **sí** falla cerrado cuando falta la audiencia —lo dice y lo
hace, líneas 53-59—, que era la mitad grave. Pero la comprobación de la cuenta
sigue siendo `if (cuentaEsperada && …)`: **con la variable vacía no se comprueba
nada**. Hoy no hay agujero porque las dos variables están puestas y `deploy.yml`
grita si faltan. El riesgo no está eliminado del diseño, está tapado por la
configuración — que es exactamente la distinción que sí se hizo bien con
`COPILOT_EMAIL_TRANSPORT`.

### 19.6 Repaso de las memorias ajenas

- **`CLAUDE_MEMORY.md`** — la sección «Estado a 2026-08-13» es exacta en todo lo
  que he podido contrastar: el prefijo, los dos guards, la audiencia única, la
  purga, `--set-env-vars`, el `passthrough` y el `try` demasiado ancho. **Un solo
  dato desfasado**: los 108 k de Upstash son ya 177 k.
- **`TASKS.md`** — la afirmación «Scheduler llamó a las 03:05:00 UTC con 200, y
  en las 3 h siguientes hay una sola línea `Barriendo`» es **cierta**,
  comprobada. La corrección de 497/18 → 535/21 también, aunque conviene decir
  que ese salto es **anterior** a la Fase 3.
- **`GRAVITY_MEMORY.md`** — dos líneas nuevas, correctas, y por fin recoge la
  deuda del 409 al convertir un correo, que yo venía viendo en los logs
  (`POST /emails/…/to-task 409`, dos veces seguidas a las 02:52).
- **`DOC.md`** — el estado y el backlog cuadran con lo que hay. Nada que
  corregir.
- **Higiene**: `c681a00` y `34d75d1` llevan **el mismo mensaje de commit** con
  contenidos distintos. Sin consecuencia técnica, pero el historial deja de
  poder leerse.

### 19.7 Lo que esta fase enseña

La Fase 3 es la primera en la que un aviso previo evitó trabajo perdido: los seis
puntos de §18 llegaron al código. Lo que **no** evitó fue el mismo error en la
mano —`/api/cron/overdue`, 404, cuarta vez—, porque una advertencia escrita en un
comentario protege al que lee el archivo, no al que teclea en la consola de GCP.

Y se repite el patrón de siempre: **lo que falló no dejó rastro donde se mira**.
El 400 del copiloto está en Cloud Logging y en ninguna bitácora; el cubo de
Upstash está en la consola de Upstash y en ninguna alerta; la suscripción sin
cola de fallidos no produce ningún error hasta el día que lo produce.

---

## 20. El parche de urgencia `679b3c3`, verificado (2026-08-13)

Respuesta de Claude a los tres hallazgos de §19.4. Commit `679b3c3`, revisión
`pmo-api-00038-kwr` publicada a las **04:36:14 UTC**. Verificado por mí en el
código, en las pruebas y en producción.

### 20.1 Los tres puntos

**1. El sondeo de Redis.** `common/bullmq/polling.config.ts` sube `drainDelay`
de 5 a 60 s, `stalledInterval` de 30 a 300 s y el `blockingTimeout` de los
`QueueEvents` de 10 a 60 s, aplicado a los dos workers vivos (`gmail-sync`,
`classify-email`) y a los dos oyentes. Y **se borra `OverdueProcessor`**: desde
que el barrido lo dispara Cloud Scheduler nadie encola en `overdue-sweep`, así
que ese worker mantenía su llamada bloqueante esperando un trabajo que no podía
llegar. La cola sigue registrada porque `OverdueCronPurge` necesita el objeto
`Queue`; un `Queue` no sondea.

**2. El 400 del copiloto.** `anthropic.strategy.ts` ahora contesta a **todos**
los `tool_use` del turno: a los ejecutables con su resultado y a los manuales con
`estado: pendiente_de_confirmacion`, que además evita que el modelo dé la acción
por hecha. Prueba nueva del turno mixto —`SEARCH_EMAILS` + `CREATE_TASK` en la
misma respuesta— que comprueba que el turno devuelto lleva los dos
`tool_use_id`. **536 pruebas en 21 suites, ejecutadas por mí**: una más que
antes, exactamente la que dice el parte.

**3. El fail-open.** `GoogleOidcVerifier` pasa de `if (cuentaEsperada && …)` a
rechazar con 401 cuando la variable no está. Arregla las dos puertas a la vez,
porque la verificación es compartida.

### 20.2 La medición del sondeo, con el método

**Primero, lo que casi me hace medir mal.** A las 04:58 arranqué el monitor de
Upstash y no llegaba **ni un comando**. Eso no probaba que el parche funcionara:
probaba que el contenedor estaba dormido. Tuve que despertarlo con
`GET /health/live` para poder medir nada.

Con el contenedor despierto y en reposo, tres ciclos consecutivos:

| Cliente | Ciclo 1 | Ciclo 2 | Ciclo 3 |
|---|---|---|---|
| `classify-email` | 04:59:31.940 | 05:00:32.023 | 05:01:32.9 |
| `gmail-sync` | 04:59:32.753 | 05:00:32.836 | 05:01:32.919 |

**60,08 s exactos** entre ciclos. Y los valores nuevos **están literalmente en el
cable**, no inferidos:

```
BZPOPMIN "bull:classify-email:marker" "60"
XREAD "BLOCK" "60000" "STREAMS" "bull:classify-email:events" "$"
```

`overdue-sweep` no aparece ni una vez: el worker huérfano está muerto de verdad.

**Coste**: 19 comandos por ciclo de 60 s → **~19/min ≈ 1 140/h despierto y sin
trabajo**. Contrastado con el contador por separado —04:53 → 04:57:30, +90
comandos en 4,5 min = 20/min—: **dos métodos independientes, el mismo número**.
De paso queda resuelto que Upstash cobra los subcomandos `lua`, no solo el
`EVALSHA`.

**Lo que no se puede afirmar.** No hay medición limpia de antes del parche —solo
la estimación de ~4 000/h del propio archivo y mi ventana de 04:00→04:53, que dio
~7 000/h pero incluía el despliegue, dos arranques y uso real del copiloto—, así
que **el efecto es grande y no tiene múltiplo exacto**. Son además cinco minutos
de observación. Y la variable que más manda no es el intervalo de sondeo sino
**cuánto rato pasa el contenedor despierto**: con Cloud Run escalando a cero, el
gasto en reposo tiende a cero solo.

Estado: **183 k de 500 k** comandos del mes.

### 20.3 El fail-closed, probado contra el llamante real

El cron de las 05:05, ya sobre la revisión parcheada:

```
05:05:07.642  Ejecución de cron autorizada para pmo-scheduler@pmo-dashboard-503418.iam.gserviceaccount.com
05:05:08.648  Barrido de vencidas ejecutado por Cloud Scheduler
05:05:08.650  POST /cron/overdue 200
05:05:13.282  Scheduler registra 200
```

El guard estricto **comprueba la cuenta por nombre y deja pasar**. Era la pieza
que faltaba: un fail-closed no está verificado hasta que el llamante legítimo
pasa por él.

### 20.4 Los términos exactos, porque el parte los infló

Tres cosas que **no** ocurrieron, y conviene que queden escritas antes de que se
conviertan en historia del proyecto:

- **No había «workers fantasma».** El cron fantasma lo había matado la purga de
  la Fase 3 y quedó comprobado en §19.3. Lo que quitó este parche fue un worker
  **legítimo y registrado** que se había quedado sin productor, más los valores
  por defecto de los dos workers buenos. Configuración corriente, no residuo.
- **La cuota no estaba a punto de quemarse.** Estaba al **37 %**. Iba en mala
  dirección; no al borde.
- **No se cerró ninguna brecha activa.** Las dos variables estaban puestas, y así
  lo dije en §19.5. Lo que había era un diseño que se abría si alguien las
  borraba. El parche elimina esa posibilidad, que es un arreglo real — pero
  prevenir la posibilidad de una brecha y cerrar una brecha no son lo mismo.

Lo que sí merece constar sin rebaja: **el 400 del copiloto estaba bien
diagnosticado**, el parche lo corrige por el mecanismo correcto —contestar a
todos los `tool_use`— y trae la prueba que lo fija.

### 20.5 Lo que este parche abre

**Un fallo de configuración ahora para el producto en vez de abrirlo.** Es la
elección correcta, pero cambia las consecuencias: si algún día falta
`CRON_SERVICE_ACCOUNT` o `GMAIL_PUBSUB_SERVICE_ACCOUNT`, los crones y la ingesta
se paran en seco. Y `deploy.yml` **avisa pero no bloquea** —lo dice él mismo: «No
se bloquea el despliegue»—. El aviso pasa a valer bastante más que antes.

**Y el cambio más consecuente entró sin prueba.** La única prueba nueva es la del
turno mixto del copiloto. `GoogleOidcVerifier` —el que ahora puede tumbar los dos
crones y la ingesta si una variable falta—, `CronAuthGuard`, `CronController` y
`OverdueCronPurge` siguen con cobertura **cero**. Lo que verificó el fail-closed
fue el cron de las 05:05, es decir producción, no la batería.

Sigue abierto de §19.4, sin tocar: la suscripción de Pub/Sub **sin cola de
mensajes fallidos**, la **entrega doble** de cada aviso y
`CLAUDE_MODEL_CLASSIFY`, que el pipeline cree inyectar y no existe.

---

## 21. La retrospectiva del 14 de agosto, contrastada (2026-08-14)

Dos commits nuevos, `8bf9c8b` y `8c5642d`, y un parte de sesión con cinco
puntos. Contrastado contra el código, contra la suite y contra los registros de
producción de hoy. Revisión viva al escribir esto: **`pmo-api-00040-t94`**,
publicada a las **16:42:24 UTC**, con `8c5642d` dentro.

### 21.1 Lo que está y funciona

**Las pruebas del `GoogleOidcVerifier` (`8bf9c8b`).** Es la deuda que dejé
señalada en §20.5 y está bien pagada: 183 líneas, y la prueba que importa es la
que tenía que ser — token **perfectamente válido**, firma buena y audiencia
correcta, y aun así rechaza porque falta la variable, sin llegar siquiera a
verificar la firma. Cubre además que la cuenta de Pub/Sub no abre `/cron` y al
revés. **547 pruebas en 22 suites, ejecutadas por mí**: exactamente lo que dice
el parte.

Sigue **sin una sola prueba** lo demás de aquella lista: `CronAuthGuard`,
`CronController` y `OverdueCronPurge`.

**Los plazos de Prisma (`8c5642d`).** El fallo estaba medido de verdad, no
supuesto: en el registro de hoy hay `5289 ms` y `5503 ms` contra un plazo de
`5000 ms`. Se corrige en el constructor del cliente, que cubre las nueve
transacciones de una vez. Los últimos `Transaction already closed` son de las
**15:11**, anteriores al despliegue de las 16:42 — así que el arreglo aún no
tiene ninguna hora de vuelo. No es una objeción; es que todavía no está
comprobado.

**El diagnóstico del `historyId` es correcto y está medido.** Lo confirmo en el
registro, dos veces:

```
14:43:27.214  Webhook de Gmail recibido … (historyId 6578238)
14:43:27.218  Webhook de Gmail recibido … (historyId 6578238)
```

Cuatro milisegundos, el mismo `historyId`. Deduplicar por `messageId` no habría
servido. Ese punto del parte se sostiene entero.

### 21.2 Lo que la retrospectiva no vio: la deduplicación tapa un fallo vivo

En dos días hay **27 errores** `No se pudo encolar la sincronización de … (¿Redis
caído?)`, todos sobre `pmo-api-00038-kwr`. Ninguno antes. Y esto es lo que pasa
alrededor de ellos:

```
14:43:27.214  ERROR  No se pudo encolar la sincronización …   ← primera entrega
14:43:27.218  Webhook de Gmail recibido … (historyId 6578238) ← segunda entrega
14:43:27.282  Procesando tarea de sincronización …
14:43:31.782  Sincronización completada: 1 correo(s)
```

**La entrega doble de Google llevaba dos días siendo la red de seguridad de este
fallo.** El primer aviso no consigue encolar, el segundo sí, y el correo entra.
Nadie lo ha notado porque el resultado final era correcto.

A las **15:02:06** fallaron **las dos** (`historyId 6578446`) y detrás no hay
ninguna sincronización. Ese correo entró más tarde, cuando otro aviso disparó una
sincronización incremental que arrastra desde el `historyId` guardado. Se salva
solo, pero por una propiedad del diseño que nadie eligió para esto.

**Y ahí está el problema del parche.** La clave `SET NX` se escribe **antes** del
`add()`, en su propio bloque, y **no se borra si el `add()` falla**. Desde el
despliegue de las 16:42, cuando el primer encolado falle, el segundo aviso —el
que hoy salva el correo— se descartará por duplicado durante diez minutos. El
fallo no desaparece: cambia de «recuperado a los 4 ms» a «sin encolar, en
silencio».

Mientras siga llegando correo después, la sincronización incremental lo arrastra.
El caso que no se arrastra es **el último correo antes de una pausa**.

Se arregla en un sitio: escribir la clave **después** de encolar con éxito, o
borrarla en el `catch`.

Del porqué del fallo no puedo decir nada: **el error no se registra** (ver 21.3).
No es la cuota de Upstash —iba por 183 k de 500 k el día 13, con un gasto medido
de ~1 140/h, que no llega ni de lejos al tope—, y la conexión funciona un
milisegundo después. Sin el texto del error no hay diagnóstico.

### 21.3 El hallazgo crítico: la causa que se da no cuadra con los registros

El parte afirma que Google revoca los refresh tokens **a los siete días exactos**
por estar la app en «Testing», y que eso explica el fallo de las 02:30.

**No cuadra, y conviene saberlo antes de construir una fase encima.**

- **La última concesión de OAuth es del `2026-08-12 22:13:16 UTC`**, con
  `prompt=consent`. No hay ninguna otra en los registros. El `watch` se renovó
  **bien** el 08-13 a las `02:41:45`, y falló el 08-13 y el 08-14 a las `07:30`.
  Eso son **nueve horas** después de la concesión, no siete días.
- **El token está vivo hoy.** A las `16:25:51` de hoy la sincronización
  incremental leyó Gmail con esas mismas credenciales:
  `1 correo(s) desde historyId 6578667 → 6578770`. Un refresh token revocado no
  lee correo.

Lo que falla es **`users.watch`, y solo eso**. La ingesta, la lectura y el
refresco del access token funcionan.

**Por qué nadie puede saber la causa.** El registro de las 07:30 dice
`Error configurando watchInbox para cmsntcsn8…` y **nada más**: ni `err`, ni
`stack`, ni código. El motivo está en `gmail.service.ts:393` —
`this.logger.error(mensaje, err)`—: Nest coloca el segundo argumento en la
ranura del *stack*, que espera una cadena, y el formateador no escribe el objeto.
**El proyecto ya conoce esta trampa**: está documentada palabra por palabra en
`all-exceptions.filter.ts`, donde se explica que el serializador de pino
«esperaba un `Error` de verdad». Hay **nueve llamadas** con esa forma, y dos de
ellas son justo los dos fallos importantes de hoy.

Sobre las «02:30 AM»: `07:30 UTC` son las `02:30` en Tulum, así que la hora citada
es la del cron de renovación. Coincide la hora; eso no acredita la causa.

Dos candidatos me parecen posibles y **ninguno demostrable sin el texto del
error**: que Gmail rechace la llamada `watch` por sí misma, o que reviente la
consulta a Prisma que va **dentro** del mismo `try`, después de que Gmail haya
aceptado —en cuyo caso el `watch` habría funcionado y lo estaríamos contando como
fallo—. Un solo registro bien hecho lo resuelve.

### 21.4 Lo urgente tiene fecha, y no es la que se ha dicho

El **único** `watch` que Gmail ha aceptado en diez días es el del
**2026-08-13 a las 02:41:45 UTC**. `users.watch` caduca a los siete días, y esa
caducidad no avisa: simplemente dejan de llegar avisos.

> **Si la renovación diaria sigue fallando, la ingesta de correo se apaga sola el
> 2026-08-20, hacia las 02:41 UTC** — las 21:41 del día 19 en Tulum.

Eso es lo urgente de esta semana. No la verificación de Google.

### 21.5 Sobre cerrar la Fase 3 y abrir la Fase 4

**La Fase 3 se puede cerrar** en todo lo que he podido comprobar: rutas, guards,
cuentas firmantes, purga del repetible, sondeo de Redis, el 400 del copiloto, el
fail-closed y ahora sus pruebas. Queda registrado en §18, §19, §20 y aquí.

**La Fase 4 tiene sentido, pero el motivo que se le ha puesto no se sostiene**, y
una fase que arranca con un diagnóstico equivocado gasta el esfuerzo en el sitio
equivocado. Antes de preparar nada para Google hay **una comprobación de un
minuto que decide la fase entera**: todos los inicios de sesión traen
`hd=zepto.com.mx`. Si la pantalla de consentimiento puede declararse de tipo
**Interno** dentro del Workspace del dominio, **no hay verificación que pedir**,
no existe la caducidad de siete días y la Fase 4 se reduce a cambiar un ajuste.
No lo he comprobado —no tengo esa consola— y no está en ninguna memoria.

Sigue abierto de §19 y §20, sin tocar: la suscripción de Pub/Sub **sin cola de
mensajes fallidos**; `CLAUDE_MODEL_CLASSIFY`, que sigue avisando en cada arranque
y **no aparece en el entorno de la revisión desplegada** —y el aviso ahora dice
que llega «desde Secret Manager», que es una afirmación distinta de la de
`deploy.yml`—; y la cobertura cero de `CronAuthGuard`, `CronController` y
`OverdueCronPurge`.

### 21.6 Lo que enseña

Otra vez lo mismo, y ya van demasiadas: **lo que falla no deja rastro donde se
mira**. El fallo de encolado se ve solo si uno cuenta los errores de dos días
seguidos; el motivo del `watch` está en un objeto que el registro tira a la
basura; y la caducidad del 20 de agosto no la va a anunciar nadie.

Y una nueva: **la entrega doble de Google no era solo ruido, era una red**.
Quitar una redundancia accidental sin mirar qué estaba sosteniendo es cómo un
arreglo correcto se convierte en una avería nueva.

---

## 22. La Fase 4 no existe: la app es Interna (2026-08-14)

Comprobado en la consola de Google Cloud, proyecto `pmo-dashboard-503418`, con el
navegador y en modo lectura. Resuelve lo que dejé como pregunta abierta en §21.5.

**Google Auth Platform → Público → Tipo de usuario: `Interno`.**

Y el propio **Centro de verificación** lo dice sin margen de interpretación:

> «No se requiere la verificación porque tu app está configurada con un tipo de
> usuario interno.»

De ahí se sigue todo lo demás:

- **La app nunca estuvo en «Testing».** Las apps Internas no tienen estado de
  publicación: la pantalla de «Descripción general» no ofrece ninguno, porque no
  hay nada que publicar.
- **La caducidad de siete días de los refresh tokens no aplica.** Es una regla de
  las apps **Externas en pruebas**. Esta no lo es y nunca lo fue. Confirma por
  tercer camino lo de §21.3: el token del 12 de agosto no ha sido revocado, y no
  va a serlo el día 19.
- **La verificación de Google —política de privacidad, dominio verificado, vídeo
  del flujo, evaluación de seguridad— no hay que pedirla.** `gmail.modify` y
  `gmail.send` son permisos restringidos, pero una app Interna los usa dentro de
  su Workspace sin pasar por ahí.

**La Fase 4, tal como estaba planteada, no tiene contenido.** No es que fuera
urgente por el motivo equivocado: es que el trabajo entero sobraba.

Un detalle que anoto por si algún día se marca como externa: en «Acceso a los
datos» las tres tablas —no sensibles, sensibles y restringidos— están **vacías**.
La pantalla de consentimiento no declara ni un permiso, mientras la aplicación
pide dos restringidos en tiempo de ejecución. Para una app Interna es normal y no
molesta a nadie. El día que alguien pulse «Marcar como externo», ese botón está a
un clic del que mira el tipo de usuario, y esa lista vacía pasa de ser un detalle
a ser el primer trámite de un proceso de semanas.

**Lo que queda en pie de §21 no cambia ni una coma**: el `watch` sigue fallando
todos los días, el motivo sigue sin registrarse, y **la ingesta se apaga sola el
2026-08-20 hacia las 02:41 UTC** si nadie lo arregla. Se ha ido el trabajo
imaginario; el real sigue entero.

### 22.1 Lo que enseña

Dos veces en el mismo día, el mismo error de método: **el diagnóstico se dedujo
de un síntoma en vez de leerse de la fuente**. La app «estaba en Testing» sin que
nadie hubiera abierto la pantalla que lo dice, igual que el fallo del `watch`
«era el token» sin que nadie hubiera leído el error — que además nadie puede
leer, porque el código lo tira.

Una fase entera de trabajo —semanas de trámites con Google— iba a arrancar sobre
una suposición que una página de la consola desmiente en cinco segundos. Mirar
primero no es prudencia: es la parte barata del trabajo.

---

## 23. El `watch` arreglado, y la causa por fin leída (2026-08-14)

Dos commits, `a09d05d` y `b8f9a4f`, en respuesta a §21. Verificado por mí en el
código, en la suite y en producción, con el cron forzado **dos veces**.

### 23.1 La causa, dicha por Gmail

El primer commit no arregla el `watch`: arregla **poder leerlo**. En cuanto se
desplegó, el registro de las **17:29:54** dijo lo que llevaba dos días callado:

```
Gmail rechazó el watch de cmsntcsn8…: code=400 · HTTP 400 ·
Only one user push notification client allowed per developer
(call /stop then try again)   ·   status=INVALID_ARGUMENT
```

**Gmail admite un solo cliente de notificaciones push y exige parar el anterior
antes de poner otro.** De ahí la forma exacta del fallo, que era lo que no me
cuadraba: el `watch` del 08-13 entró **porque no había ninguno puesto**, y todas
las renovaciones posteriores chocaron contra el que aquel mismo dejó. Falla solo
**a partir de la segunda ejecución**. Un cron que se estrena bien y se rompe para
siempre a la segunda vuelta.

Queda descartado mi candidato (b) de §21.3: el rechazo venía de Gmail, no del
`findUnique`. La separación de aquel `try` se hizo igual, y sigue valiendo — un
tropiezo de Postgres no debe poder disfrazarse de `watch` fallido.

### 23.2 Lo comprobado en producción

`b8f9a4f` llama a `users.stop` antes de `users.watch`, con captura aparte para no
confundir un fallo del `stop` con un rechazo del `watch`. Vivo en
**`pmo-api-00042-5rm`** (`SERVICE_VERSION=b8f9a4f`).

Forcé `pmo-gmail-watch-renew` **dos veces**, con permiso expreso:

```
17:46:22  Bandeja de entrada observada (watch) para el usuario cmsntcsn8…
17:46:22  Watch de Gmail renovado: 1 de 1 usuario(s)

17:56:03  Bandeja de entrada observada (watch) para el usuario cmsntcsn8…
17:56:03  Watch de Gmail renovado: 1 de 1 usuario(s)
```

**Las dos veces importan, y la segunda más que la primera.** El fallo original
era «funciona una vez y falla a partir de la segunda»: una sola ejecución buena
habría reproducido exactamente el estado del 08-13 y no habría probado nada. Con
dos seguidas, lo que se demuestra es que el ciclo se sostiene.

**La caducidad del 2026-08-20 queda cancelada.** El `watch` vigente es el de las
17:56 de hoy y la renovación diaria ya sabe reemplazarlo.

Ni un aviso de `No se pudo parar el watch anterior`: el `stop` funcionó limpio
las dos veces.

### 23.3 La regresión que se corrigió sin haber llegado a morder

`a09d05d` libera la clave de deduplicación en el `catch` del encolado. Es el
punto de §21.2, y el razonamiento que trae el commit es el correcto:
**deduplicar lo hecho es correcto; deduplicar lo intentado pierde correos.**
Estuvo mal escrita desde las 16:42 hasta las 17:28 — poco más de una hora, y sin
ningún fallo de encolado en medio, así que no llegó a costar ningún correo.

El helper `describir-error.ts` arregla los nueve sitios de una vez y saca el
cuerpo de la respuesta de Google, que es donde vivía el motivo. Documentado con
la trampa entera, que es lo que hacía falta: **estaba ya documentada en
`all-exceptions.filter.ts` y aun así se repitió nueve veces**, porque estaba
escrita en el archivo equivocado — en el que la sufrió, no en el que se copia.

### 23.4 Lo que sigo sin poder dar por bueno

**Cero pruebas nuevas.** 547 en 22 suites, **las mismas que antes de los dos
commits**: el diff de `*.spec.ts` entre `8c5642d` y `b8f9a4f` está **vacío**, y el
módulo `gmail` no tiene ni un archivo de pruebas. Han entrado sin cobertura el
arreglo de una caída de dos días, el orden de la clave de deduplicación y un
helper que ahora usan nueve sitios. Que la causa se leyera en producción no
sustituye a una prueba de que `stop` se llama **antes** que `watch`: eso es
exactamente el tipo de orden que una refactorización futura invierte sin darse
cuenta, y el fallo vuelve a tardar dos días en verse.

**Y no he visto un push entrar después del ciclo.** El `watch` está registrado y
Gmail lo acepta; que los avisos sigan llegando sobre el registro nuevo se
comprobará con el primer correo que entre. Comprobado a las 18:06 con un correo
real: ver 23.6.

Sigue abierto de §19–§22: la suscripción de Pub/Sub **sin cola de mensajes
fallidos**, `CLAUDE_MODEL_CLASSIFY` —que sigue sin estar en el entorno de la
revisión desplegada—, y la cobertura cero de `CronAuthGuard`, `CronController` y
`OverdueCronPurge`.

### 23.5 Lo que enseña

**El arreglo entero cabía en treinta líneas; lo caro fue no poder leer el error.**
Dos días de ingesta condenada, una fase de trabajo inventada sobre una causa
falsa y una fecha de apagado a seis días vista — todo por un segundo argumento
que el formateador tiraba a la basura. Lo primero que hizo Claude fue lo correcto
y lo aburrido: hacer legible el fallo antes de tocarlo. La causa apareció en la
primera ejecución.

Y una que ya es de método: **un fallo que se estrena bien miente sobre sí mismo**.
El `watch` del 08-13 funcionó, se anotó como éxito y esa anotación —mía, en
§19.2— es la que dejó la avería fuera del radar dos días. Una sola muestra buena
no dice que algo funcione; dice que ha funcionado una vez. Por eso hoy lo he
forzado dos.

### 23.6 Un correo real, de punta a punta (18:06 UTC)

Envié un correo de verdad desde `zepto.soluciones@gmail.com` —cuenta externa, en
el Chrome del usuario y con permiso expreso— a `antonio.sanchez@zepto.com.mx`,
asunto `prueba alana 14ago`. La cadena completa, sin un solo error:

```
18:06:25.440  Webhook de Gmail recibido para: antonio.sanchez@… (historyId 6579583)
18:06:25.525  POST /webhooks/gmail 200
18:06:25.562  Procesando tarea de sincronización para el job 21012378828370433
18:06:29.479  Sync incremental: 1 correo(s) desde historyId 6579495 → 6579583
18:06:29.879  Sincronización completada: 1 correo(s)
18:06:31.079  Procesando clasificación de email cmst9dnoc0007148pexs2q41u
18:06:38.980  Resultado de IA: isActionable=false
```

**Trece segundos del envío al veredicto de la IA.** Y con esto queda cerrado lo
que dejé abierto en 23.4: **los push llegan sobre el `watch` que registré a las
17:56**. La ingesta está viva sobre el registro nuevo, no solo aceptada por
Gmail.

Ni un fallo de encolado, esta vez con el contenedor caliente.

**Lo que este correo NO prueba, y conviene no apuntarse:** Google entregó el
aviso **una sola vez**. No hay segunda entrega, así que **no aparece
`Aviso duplicado de Gmail ignorado`** y **la deduplicación sigue sin haberse
visto funcionar en producción** — ni la de `8c5642d` ni la liberación de la clave
de `a09d05d`. Una prueba que no dispara el caso no dice nada sobre el caso.
Aparecerá sola el día que Google vuelva a entregar doble; hasta entonces, ese
punto sigue apoyado únicamente en las pruebas unitarias que Claude está
escribiendo ahora.

---

## 24. Las pruebas del hotfix, y la Fase 3 clausurada (2026-08-14)

`4de9236`. **385 líneas en tres archivos**, exactamente lo que dice el parte, y
**569 pruebas en 25 suites ejecutadas por mí** —eran 547 en 22—.

### 24.1 Lo que importa no es el número, sino si las aserciones muerden

Las tres pruebas que pedí están, y están escritas de la única forma que sirve:

**El orden `stop` → `watch`.** No se conforma con que se llamen los dos:

```ts
expect(stop.mock.invocationCallOrder[0]).toBeLessThan(watch.mock.invocationCallOrder[0]);
```

Invertir el orden **hace fallar la prueba por construcción**. Un
`expect(stop).toHaveBeenCalled()` habría pasado con el fallo dentro; esto no
puede.

**La liberación de la clave.** La tercera prueba **simula Redis de verdad** —un
`Set` que guarda al reservar y borra al liberar— y comprueba que, tras un
encolado fallido, la segunda entrega **sí encola**: `add` llamado dos veces. Es
exactamente la regresión de §21.2 puesta en una aserción.

**`describirError`.** Usa el error literal de Google, con el
`response.data.error` anidado tal cual llega de `googleapis`, y exige que el
motivo salga. Si algún día alguien simplifica el helper y se deja el nivel de
dentro, la prueba cae.

Y cubren además cosas que yo no había pedido y que hacen falta: que un tropiezo
de la base **después** del `watch` no lo invalide, que el motivo del rechazo
viaje hasta el resultado del cron, y que un duplicado real **no borre** una clave
ajena.

**Sobre la validación por reversión**: no la he repetido: revertir un arreglo en
el árbol de trabajo es tocar código y eso no me toca a mí. Lo que sí afirmo, y es
lo que importa, es que **las aserciones son sensibles a la mutación por
construcción** — comprobado leyéndolas una a una, no por el parte.

### 24.2 Donde me equivoqué yo

En el mensaje que pasé al equipo propuse arreglar la deduplicación «escribiendo
la clave **después** de encolar, o borrándola en el `catch`». **La primera mitad
era mala**: escribir después deja pasar las dos entregas concurrentes, que es
justo lo que la deduplicación existe para impedir — el `SET NX` es lo único
atómico y tiene que ir delante. Se implementó la segunda, que era la correcta, y
la prueba lo explica mejor de lo que lo expliqué yo.

Queda anotado porque es la clase de error que un auditor comete con facilidad:
**diagnosticar bien y recetar de más**. El diagnóstico era mío y era correcto; una
de las dos recetas habría abierto un fallo nuevo.

### 24.3 La Fase 3 queda clausurada

Con lo verificado en §18 a §24, y no por acuerdo sino por comprobación:

| Qué | Cómo quedó comprobado |
|---|---|
| Rutas `/cron` sin prefijo, dos guards separados | Log de arranque y `200` reales |
| Cuenta firmante y OIDC fail-closed | Cron de las 05:05 con `200` + 14 pruebas |
| Purga del repetible de BullMQ | Log y marca de tiempo en Upstash, dos caminos |
| Sondeo de Redis | Monitor en vivo: 60,08 s por ciclo, ~1 140/h |
| El 400 del copiloto | Prueba del turno mixto |
| Plazos de Prisma para Neon | Medido `5289/5503 ms` contra `5000` |
| Renovación del `watch` | **Dos** ejecuciones forzadas, `1 de 1` las dos |
| Ingesta completa | Correo real, 13 s de extremo a extremo (§23.6) |
| Los tres arreglos del hotfix | 569 pruebas en 25 suites |

**La arquitectura base está estable.** Lo digo con la palabra que se sostiene:
*estable*, no *blindada*. Blindado es lo que resiste lo que no ha pasado todavía,
y de eso no tengo ninguna prueba.

### 24.4 Lo que la clausura no cubre

Nada de esto bloquea cerrar la fase. Todo esto sigue abierto:

- **La suscripción de Pub/Sub no tiene cola de mensajes fallidos.** Abierto desde
  §19.4-C, sin tocar en cuatro despertares.
- **`CLAUDE_MODEL_CLASSIFY` sigue sin existir** en el entorno de la revisión
  desplegada, avisando en cada arranque.
- **`CronAuthGuard`, `CronController` y `OverdueCronPurge` siguen con cobertura
  cero.** Se cubrió el `GoogleOidcVerifier`, que era el grave; estos tres no.
- **La deduplicación nunca se ha visto disparar en producción** (§23.6). Está
  probada en la suite y no observada en vivo.
- **Nadie vigila.** Todo lo de estos dos días lo encontré mirando. Ni la ingesta
  condenada, ni los 27 fallos de encolado, ni el 400 del copiloto, ni el cubo de
  Upstash dispararon **ningún aviso a nadie**. El sistema no sabe pedir ayuda.
- **Todo está verificado con un solo usuario.** Cada `1 de 1` de esta bitácora es
  literalmente un usuario. El error que costó la ingesta decía «per **developer**»,
  y el bucle de renovación llama a `stop` y `watch` usuario por usuario. Con dos
  buzones eso vuelve a ser territorio sin explorar.

### 24.5 Lo que enseña

La Fase 3 se cierra con el mismo patrón con el que se abrió: **los seis avisos
previos llegaron al código, y aun así la avería más cara del período no estaba en
la lista de nadie**. No apareció por revisar mejor el plan, sino por leer lo que
producción estaba diciendo — cuando por fin se pudo leer.

Y la lección que me llevo yo: **una muestra buena no es una prueba**. Anoté el
`watch` del 08-13 como éxito y esa anotación tapó la avería dos días. Hoy el
mismo cron lo he forzado dos veces, y el correo lo mandé de verdad en vez de
darlo por bueno. Esa es toda la diferencia.

---

## 25. N=1 por decisión de producto, y la Fase 4 (2026-08-14)

Decisión del Product Owner, registrada aquí porque **cambia lo que hay que
auditar**, no solo lo que hay que construir.

### 25.1 El alcance: un solo usuario, a propósito

El PMO es un desarrollo personal a medida. **No se escala a multiusuario**, y la
razón dada es buena: no meter complejidad ni pelearse con los límites de la API
de Gmail sin una necesidad de negocio.

Retiro por tanto mi recomendación de §24.5. Y conviene decir lo que la decisión
resuelve, no solo lo que renuncia: **el riesgo que yo señalaba desaparece con
ella**. El bucle que llama a `stop` y `watch` usuario por usuario dentro del mismo
proyecto no puede tropezar con el «one push client per developer» si nunca hay un
segundo buzón. Un límite que no se toca no es una deuda.

Lo que sí cambia para mí: **`1 de 1` deja de ser una muestra pequeña y pasa a ser
el universo entero**. Cuando escriba «verificado con un usuario» ya no es una
reserva; es la cobertura completa.

### 25.2 La Fase 4, tal como queda definida

Sistema de alertas como prioridad alta, y el resto de la deuda: cola de mensajes
fallidos en Pub/Sub, `CLAUDE_MODEL_CLASSIFY` y las pruebas de los crones. El
reparto y el detalle viven en `TASKS.md`, que es donde va el trabajo; aquí queda
solo lo que tendré que comprobar.

**Dos cosas que mi propia auditoría sostiene, y que decidirán si esto sirve:**

**1. La alerta tiene que dispararse por silencio, no solo por error.** Es la
lección de estos dos días y es estructural. El `watch` fallando **sí** dejaba un
`WARNING` —que nadie leyó—, pero la avería de verdad, la ingesta apagándose el
2026-08-20, no habría producido **ninguna línea de ningún color**: los push
sencillamente dejan de llegar. Ningún aviso construido sobre errores puede ver
eso. Hace falta lo contrario: algo que avise cuando **deja de pasar** lo que debe
pasar —un cron que no reportó hoy, un buzón sin un solo correo en X horas—. Las
dos formas hacen falta; la segunda es la que faltaba.

**2. El canal no puede depender de lo que vigila.** Si la alerta viaja por correo
a través de la misma cuenta y la misma API de Google cuya caída se está
notificando, falla exactamente cuando hace falta. Cualquier canal fuera de esa
cadena —Discord, Slack, Telegram— cumple esa condición; el correo simple, no. Es
la única objeción que tengo sobre la elección del canal, y es la que importa.

### 25.3 Lo que enseña

El alcance se define, no se descubre. Yo puedo decir qué está sin probar; **qué
merece probarse es una decisión de producto**, y esta la ha tomado quien debía con
un motivo dicho en voz alta. Anoto la diferencia porque en §24 la crucé: presenté
como hueco técnico —«todo verificado con un único usuario»— algo que era en
realidad una pregunta de alcance que no me correspondía responder.

---

## 26. La infraestructura de la Fase 4, auditada (2026-08-14)

Levantada por el usuario en la consola entre las 21:47 y las 21:51. Comprobada
por mí con `gcloud` y con la API de Monitoring, no con el parte. Revisión viva
`pmo-api-00044-k8n`.

### 26.1 Lo que está bien hecho

**La cola de mensajes fallidos, completa.** Tema `gmail-ingest-dlq`, y
`gmail-ingest-push` con `deadLetterTopic` y `maxDeliveryAttempts: 5`. Las dos
concesiones de IAM que hacen falta **están puestas**, que es donde esto suele
fallar en silencio:

- `roles/pubsub.publisher` sobre el tema de fallidos, y
- `roles/pubsub.subscriber` sobre la suscripción de origen,

las dos para `service-614812477499@gcp-sa-pubsub`. Sin cualquiera de las dos, el
reenvío a la cola falla **sin error visible** y el mensaje se pierde igual. Y hay
`gmail-ingest-dlq-sub` sobre el tema: un tema de fallidos sin suscripción tira los
mensajes según llegan, así que ese detalle también está cubierto.

Cierra §19.4-C, abierto desde hace cinco despertares.

### 26.2 🔴 La alerta no avisa a nadie

La política existe, se llama **`[Capa 2] Fallo Critico en Infraestructura`**, está
`enabled: true`… y su campo `notificationChannels` está **vacío**. No es que
apunte a un canal mal configurado: **en el proyecto entero no existe ni un solo
canal de notificación**. Comprobado contra
`monitoring.googleapis.com/v3/projects/…/notificationChannels`: la lista vuelve
vacía.

Una política sin canal **evalúa la condición, abre el incidente y no se lo cuenta
a nadie**. Aparece en la consola de Monitoring si alguien entra a mirarla — que es
exactamente la postura que la Fase 4 existe para eliminar.

Es el punto entero de la fase, y ahora mismo no está conectado.

### 26.3 🔴 La «Capa 2 por silencio» es en realidad una alerta por error

La condición de esa misma política, tal cual:

```
conditionMatchedLog.filter =
  resource.type=("cloud_run_revision" OR "cloud_scheduler_job") AND severity>=ERROR
```

Eso es un aviso **por error registrado**, es decir Capa 1 con otro nombre. La
Capa 2 que se definió —y que el propio nombre promete— era **por silencio**, y
esa no existe: no hay condición de ausencia, ni comprobación de actividad, ni
nada que mire lo que *deja* de pasar.

**Y esa distinción no es teórica en este proyecto**: es literalmente la avería de
ayer. La ingesta camino de apagarse el 2026-08-20 no habría producido **ni una
línea de severidad ERROR**; el `watch` fallido dejaba un `WARNING`, que este
filtro tampoco recoge, y el apagón final no habría dejado nada en absoluto. Esta
política, tal como está, **no habría visto el fallo que motivó la fase**.

Falta lo contrario: un vigía fuera del proceso que se queje cuando el cron no
reporta o cuando no entra un correo en N horas.

### 26.4 🔴 «Limpiar» `CLAUDE_MODEL_CLASSIFY` cambió el modelo del producto

La variable ya existe. Su valor es **`claude-3-5-sonnet-20240620`**.

En el log, con quince segundos de diferencia:

```
21:47:37  pmo-api-00043-4zn  Modelo de clasificación: claude-sonnet-5
21:48:22  pmo-api-00044-k8n  Modelo de clasificación: claude-3-5-sonnet-20240620
```

El aviso de arranque desapareció, y con él el modelo. Lo que estaba corriendo por
defecto era **Claude Sonnet 5**; lo que corre ahora es un modelo de **junio de
2024**. La clasificación de correo —que es la función central del producto:
decide qué es accionable y crea tareas— pasó a un modelo dos generaciones más
viejo **como efecto secundario de una tarea de limpieza**.

Yo señalé esa variable como ruido en cada arranque (§19.4-E). Ruido era el aviso.
La respuesta correcta era fijarla al valor que ya se estaba usando, o borrar el
aviso; no cambiar el modelo.

**Y no se sabe siquiera si ese identificador sigue vivo**: desde las 21:48 no se
ha clasificado ni un correo, así que la primera clasificación que llegue es la
que lo dirá. Si el modelo está retirado, la clasificación no se degrada: falla.

### 26.5 🟠 Dos detalles del despliegue

**El secreto no está enchufado.** `ALERT_WEBHOOK_URL` existe en Secret Manager
—creado a las 21:49:18, y no he mirado su valor— pero **no aparece en el entorno
de la revisión desplegada**. La Capa 1 no podrá enviar nada aunque Claude escriba
el código: falta cablearlo en `deploy.yml` como los demás secretos.

**La suscripción sigue sin `retryPolicy`.** Con `maxDeliveryAttempts: 5` y sin
política de reintento, Pub/Sub reintenta *lo antes posible*. En un servicio que
escala a cero y con una base que tarda ~5 s en despertar, cinco intentos se
pueden quemar en segundos y mandar a la cola de fallidos un aviso que habría
entrado a la sexta. Un `minimumBackoff` de unos segundos lo evita.

Y lo que hace eso peor: **un mensaje que cae en la cola de fallidos no genera
ninguna línea en Cloud Run**, así que la política de 26.3 tampoco lo vería. La
`gmail-ingest-dlq-sub` es de extracción y no tiene a nadie leyéndola: lo que caiga
ahí se queda siete días y caduca.

### 26.6 Lo que sigue abierto de antes

- **`CronAuthGuard`, `CronController` y `OverdueCronPurge`: cobertura cero.** Sin
  cambios.
- **Neon sigue rechazando conexiones en frío.** Hoy a las 21:32:
  `code=P1001 · Can't reach database server`. El arreglo de `8c5642d` sube el
  plazo de las **transacciones**; esto es otra cosa —no llegar a conectar— y no
  lo toca.
- **La deduplicación sigue sin verse disparar en producción** (§23.6).

### 26.7 Lo que enseña

Tres de los cuatro hallazgos son de la misma familia y merece decirlo junto:
**la infraestructura quedó puesta y desconectada**. La cola de fallidos existe
pero nadie la lee; la política de alertas existe pero no tiene canal; el secreto
existe pero no llega al contenedor. Cada pieza pasa su propia comprobación —está
creada, está activa, está guardada— y el sistema sigue exactamente igual de ciego
que ayer.

Es la versión de infraestructura del mismo error que llevo cuatro días
persiguiendo: **algo que parece hecho porque existe**. El `watch` estaba
registrado y no se renovaba; el error se registraba y no se leía; ahora la alerta
se dispara y no llega. Lo que hay que comprobar nunca es si la pieza está: es si
**el mensaje llega al otro extremo**.

Y una que es solo para el que limpia: **una tarea de higiene que cambia el
comportamiento del producto no es higiene**. Fijar una variable al valor que ya
estaba en uso cuesta lo mismo que fijarla a otro.

---

## 27. La Capa 1 y la Capa 2, contrastadas (2026-08-14/15)

Parte de Claude con cuatro documentos y la Capa 1 escrita, más el trabajo de
Gravity en la infraestructura. Comprobado contra el árbol, la suite, `gcloud` y
la API de Monitoring.

### 27.1 Lo que quedó arreglado de §26, y está bien arreglado

**La alerta por silencio existe y es la correcta.** La política de errores que
señalé en §26.3 **ha desaparecido**, y en su lugar hay
`[Capa 2] Fallo Critico: Apagon del Watcher de Gmail`, con esto dentro:

```
conditionAbsent.filter   = metric.type="pubsub.googleapis.com/subscription/push_request_count"
                           AND resource.type="pubsub_subscription"
                           AND resource.labels.subscription_id="gmail-ingest-push"
conditionAbsent.duration = 84600s   (23,5 h)
```

Es exactamente lo que argumenté que faltaba: **vigila la ausencia, no el error**.
Y mide en el sitio correcto — las invocaciones que Pub/Sub hace al webhook—, que
es la señal que se apaga cuando el `watch` caduca sin dejar ni una línea de log.
Habría visto la avería del día 20. Y ya **tiene canal asignado**, que era el otro
agujero de §26.2.

**La política de reintentos, puesta**: `minimumBackoff 10s`, `maximumBackoff
600s`, con `maxDeliveryAttempts: 5`. Cierra §26.5: ya no se pueden quemar cinco
intentos inmediatos contra un contenedor dormido.

**Las pruebas de los crones, hechas.** **597 pruebas en 29 suites, ejecutadas por
mí** —eran 569 en 25—. Las cuatro suites nuevas son `alert.service`,
`cron.controller`, `cron-auth.guard` y `overdue.cron-purge`: **cierra §19.4-D**,
abierto desde hace seis despertares.

**Y la Capa 1 está bien diseñada.** `AlertModule` importado en `app.module.ts`, y
los cuatro enganches existen de verdad —comprobado en el árbol, no en el parte—:
`dead-letter.listener.ts`, `all-exceptions.filter.ts`, `gmail.controller.ts` y
`gmail.service.ts`. Las tres reglas se sostienen: nunca lanza, freno en Redis,
lleva la causa.

### 27.2 🔴 La Capa 1 no está en producción

Me puse a buscar en el log el aviso de arranque de `AlertService` y **no aparece
ninguno**. Esa ausencia es el hallazgo:

```
origin/master     → 4de9236   (las pruebas del hotfix)
HEAD local        → a23202d   (feat(alerts): la aplicación aprende a pedir ayuda)
revisión viva     → pmo-api-00045-ndn, SERVICE_VERSION = 4de9236
```

**`a23202d` está commiteado en local y sin empujar.** Lo que corre en producción
es el código de antes: no hay `AlertService`, no hay enganches, y la revisión
`00045` —desplegada a las 22:14— se construyó desde `4de9236`, disparada por el
cambio de variable, no por el commit.

No es un fallo: Claude dijo expresamente que no empujaba. Lo anoto porque **el
parte y el estado de producción no dicen lo mismo**, y porque cualquiera que lea
«la aplicación aprende a pedir ayuda» dará por hecho que ya lo hace.

### 27.3 🔴 Y cuando se empuje, seguirá muda

`deploy.yml` inyecta el secreto **condicionado** a que exista la variable de
repositorio `ALERT_WEBHOOK_SECRET`:

```bash
if [ -n "${{ vars.ALERT_WEBHOOK_SECRET }}" ]; then
  SECRETS="${SECRETS},ALERT_WEBHOOK_URL=${{ vars.ALERT_WEBHOOK_SECRET }}:latest"
else
  echo "::warning::ALERT_WEBHOOK_SECRET no está definida; la API no podrá enviar alertas."
fi
```

**Esa variable no existe.** `gh variable list` no la trae. El secreto sí está en
Secret Manager desde las 21:49:18, pero **nada lo nombra**, así que la rama que
se ejecuta es el `else` y lo único que pasa es un aviso amarillo en un run que
nadie mira.

El razonamiento de por qué va condicionada es correcto —un `--set-secrets` que
nombre un secreto inexistente tumba el despliegue entero—, y el servicio avisa al
arrancar si le falta la URL. Pero el resultado neto, hoy, es que **la Capa 1 se
desplegará muda y el único aviso de que está muda es del mismo tipo que los que
nadie ha leído estos cuatro días**. Falta un paso de un minuto: crear la variable
con el nombre del secreto.

### 27.4 🔴 El modelo de clasificación ha ido hacia atrás dos veces

En el log, con las tres revisiones:

```
21:47:37  pmo-api-00043-4zn  Modelo de clasificación: claude-sonnet-5
21:48:22  pmo-api-00044-k8n  Modelo de clasificación: claude-3-5-sonnet-20240620
22:15:09  pmo-api-00045-ndn  Modelo de clasificación: claude-3-sonnet-20240229
```

`TASKS.md` lo llama «**variable revertida** a `claude-3-sonnet-20240229` tras
corrección arquitectónica». **No es una reversión**: revertir habría sido volver
a `claude-sonnet-5`, que es lo que estaba corriendo y lo que el código trae por
defecto. Lo que ha ocurrido es un **segundo salto hacia atrás** — de un modelo de
junio de 2024 a uno de **febrero de 2024**.

Y `claude-3-sonnet-20240229` es Claude 3 Sonnet, un modelo **retirado**. Si ese
identificador ya no se sirve, la clasificación no se degrada: **falla entera**.

**No se ha clasificado ni un correo desde las 21:32**, así que ninguno de los dos
valores nuevos ha llegado a funcionar nunca. La única evidencia de que la
clasificación funciona es de cuando la variable no existía.

El valor correcto es el que ya se estaba usando: `claude-sonnet-5`.

### 27.5 🟠 El canal de notificación dice de sí mismo que está pendiente

```
CANAL: "Google Chat Webhook (Pendiente)"  ·  tipo=webhook_tokenauth  ·  enabled=true
```

La política apunta a él, así que la Capa 2 está formalmente completa. Pero su
propio nombre dice que no lo está, es un webhook genérico y no el canal nativo de
Chat, y **nadie ha demostrado que llegue un mensaje al otro extremo**. Conviene
saber además que el cuerpo que manda Cloud Monitoring no tiene la forma que un
webhook entrante de Google Chat espera —Chat quiere un `text`—, así que esto es
justo lo que hay que probar disparándolo, no leyéndolo.

### 27.6 Dos correcciones al parte

- **`GCP_SETUP.md` no está congelado**: tiene **+84 líneas** sin commitear. El
  parte dice «no lo toqué… congelado el 24 de julio»; lo ha tocado otro.
- **`alert_policy_v2.json` no es un pendiente de nadie**: su contenido
  —`displayName`, filtro, duración y canal— **coincide exactamente con la política
  que ya está aplicada** en el proyecto. Es el archivo desde el que se creó. Lo
  que hay que decidir es si se versiona (la infraestructura escrita es lo único
  que sobrevive a quien la configuró) o se borra, no si se aplica.

### 27.7 Lo que sigue abierto

- **Neon sigue rechazando conexiones en frío**: `P1001` a las 21:32. El arreglo
  de los plazos sube el tiempo de las transacciones; esto es no llegar a
  conectar. La política de reintentos de Pub/Sub lo amortigua ahora, que es más
  de lo que había.
- **La deduplicación sigue sin verse disparar en producción** (§23.6).

### 27.8 Lo que enseña

Es el patrón de §26.7 una capa más arriba, y por eso lo repito en vez de darlo
por dicho: **la Capa 1 está escrita, probada, revisada y commiteada — y no está
en producción**. La Capa 2 está aplicada y apunta a un canal que se llama a sí
mismo «Pendiente». El secreto existe y nada lo nombra.

Cada pieza pasa su propia comprobación. Nadie ha comprobado la única que importa,
que es la misma de siempre: **que el mensaje llegue al otro extremo**. Un sistema
de alertas es exactamente el sitio donde ese error se paga doble, porque cuando
falle no habrá nada que avise de que la alerta no avisó.

La forma de cerrarlo es una sola: **provocar un fallo a propósito y esperar el
mensaje en Chat**. Mientras eso no ocurra, la Fase 4 está escrita, no terminada.

---

## 28. La clasificación está rota en producción (2026-08-14, 22:45 UTC)

Lo que en §27.4 escribí como riesgo —«si ese identificador está retirado, la
clasificación no se degrada: falla entera»— ha ocurrido. No es una previsión: está
en el log.

```
22:45:52  ERROR  Falló la clasificación del email cmstjc7g50001h7p0xafrfq3o:
                 HTTP 404 · {"type":"error","error":{"type":"not_found_error",
                 "message":"model: claude-3-sonnet-20240229"}}
```

**Anthropic devuelve 404 `not_found_error`: ese modelo ya no se sirve.** La
clasificación de correo —la función que decide qué es accionable y crea tareas—
**no funciona**, sobre la revisión viva `pmo-api-00046-64q`.

**Alcance**: desde las 22:15, cuando la variable entró en producción, no hay ni
un solo `Resultado de IA` en el log. Cuatro correos han entrado a clasificarse
—`cmstjc7g5`, `cmstjc92i`, `cmstjxvdx`, `cmstjxwut`— y ninguno ha salido. El
último éxito es de las **21:32**, con `claude-sonnet-5`, antes de que la variable
existiera.

La cadena, en tres pasos y por escrito, porque conviene verla entera:

1. Yo señalé `CLAUDE_MODEL_CLASSIFY` como **ruido en el arranque** (§19.4-E).
2. Se «limpió» fijándola a `claude-3-5-sonnet-20240620` (§26.4) y luego a
   `claude-3-sonnet-20240229`, anotado en `TASKS.md` como «revertida» (§27.4).
3. El modelo estaba retirado. **404 en producción.**

Ninguno de los tres pasos fue descuidado por separado. El resultado es que una
tarea de higiene apagó la función central del producto.

### 28.1 Y la alerta estaba muda

En el arranque de esa misma revisión, trece minutos antes del 404:

```
22:32:47  WARNING  ALERT_WEBHOOK_URL no está configurada: las alertas se
                   registrarán en el log pero no se enviarán a ningún sitio.
```

La Capa 1 **sí llegó a producción** —`adf2efe` incluye `a23202d`, y la revisión
`00046-64q` la lleva dentro—, así que §27.2 queda resuelto. Pero llegó **sin la
URL**, porque la variable de repositorio `ALERT_WEBHOOK_SECRET` sigue sin existir
y `deploy.yml` toma la rama del `else`.

De modo que **el primer fallo real que el sistema de alertas tenía que contar
—este— no se lo ha contado a nadie**. Los fallos de clasificación acaban en los
oyentes de la cola de fallidos de BullMQ, que es uno de los cuatro enganches: el
aviso se generó y se quedó en el log, que es exactamente el sitio donde nadie
mira.

Es la demostración que pedía §27.8, y ha llegado sola: un sistema de alertas que
no se prueba de punta a punta falla la primera vez que hace falta, y falla en
silencio por definición.

### 28.2 Lo que hay que hacer, y es corto

Dos cambios de un minuto, ninguno de código:

1. **`CLAUDE_MODEL_CLASSIFY` → `claude-sonnet-5`.** Es el valor que estaba
   funcionando hasta las 21:47 y el que el código trae por defecto. No es una
   elección de modelo: es volver al que ya se estaba usando.
2. **Crear la variable de repositorio `ALERT_WEBHOOK_SECRET`** con el nombre del
   secreto que ya existe en Secret Manager desde las 21:49. Sin ella, la Capa 1
   se despliega muda cada vez.

Y después, la comprobación que cierra la fase de verdad: **provocar un fallo y
esperar el mensaje en Chat**. Hoy había uno servido y no llegó.

### 28.3 Lo que enseña

Tres veces en dos días, la misma forma: **algo que parece hecho porque existe**.
La variable existía y apuntaba a un modelo muerto; la alerta existía y no tenía
URL; el canal existe y se llama «Pendiente».

Y una nueva, que es mía y me la apunto: **señalar algo como ruido invita a
callarlo, no a arreglarlo**. Escribí que `CLAUDE_MODEL_CLASSIFY` era «ruido en
cada arranque». Era cierto y era incompleto: lo que había que decir es que el
aviso protegía un valor por defecto correcto, y que fijar la variable **sin
comprobar el modelo** cambiaba el producto. Un auditor que enumera molestias sin
decir cuál es el arreglo correcto está repartiendo trabajo mal definido, y el
trabajo mal definido se hace mal.

---

## 29. La Fase 4, cerrada y contrastada (2026-08-18)

Despertar 13, y el primero con la directiva ampliada: puedo escribir en todo el
repositorio, y usar Chrome previo acuerdo. Sigo comprobando igual.

Estado al escribir: `HEAD` = `155e592`, local y remoto **idénticos**, árbol
limpio salvo `alert_policy_v2.json` sin seguimiento. Revisión viva
**`pmo-api-00057-ksl`** (`SERVICE_VERSION` = `10def67`; los dos commits
posteriores son solo `.md`, que `ci.yml` ignora). **601 pruebas en 29 suites,
ejecutadas por mí.**

### 29.1 Los tres 🔴 de §26–§28, resueltos y verificados

**La clasificación funciona.** `CLAUDE_MODEL_CLASSIFY` = `claude-sonnet-5`, en la
variable del repositorio y en el entorno de la revisión viva. Y no lo doy por
bueno porque lo diga la configuración: hoy a las **13:42** el log dice
`Resultado de IA … isActionable=true, 2 tareas creadas`. El 404 de §28 está
cerrado.

**La Capa 1 tiene URL y llegó a producción.** `ALERT_WEBHOOK_SECRET` existe desde
el 14-08 a las 23:07 y `ALERT_WEBHOOK_URL` **está en el entorno de `00057-ksl`**.

**Y la Capa 1 dispara de verdad.** En el log del 17 hay alertas reales, no
simuladas: `ALERTA · No se pudo encolar un correo entrante`, `ALERTA ·
Clasificación perdida: un job agotó sus reintentos`.

### 29.2 El detalle que confirma §27.5, con fecha

El canal existía desde el 14 y **no llegaba nada**, exactamente como escribí.
Ahora está la causa, en el log del 17:

```
15:38:34  ERROR  No se pudo enviar la alerta «No se pudo encolar un correo
                 entrante»: Failed to parse URL from TO_BE_FILLED_BY_USER
```

**El secreto contenía el texto de relleno.** Se creó el 14-08 a las 21:49
(versión 1) y no se sustituyó por la URL real hasta el **17-08 a las 18:39:54**
(versión 2). Entre esas dos fechas cada alerta se generó, intentó salir y murió
en el envío — y el único sitio donde constaba era el log.

Es el mismo error tres veces seguidas, y ya con nombre: **una pieza existe, pasa
su propia comprobación y no conecta con la siguiente**. Aquí la comprobación que
faltaba costaba un `curl`.

Desde las 18:16 del 17 **no hay un solo fallo de envío**.

### 29.3 La prueba de punta a punta que pedí, casi entera

El 17 a las 22:53 y 22:54, con un modelo inexistente puesto a propósito:

```
ALERTA · Clasificación perdida: un job agotó sus reintentos:
cola=classify-email job=105 · 404 {"type":"not_found_error",
"message":"model: modelo-inexistente-prueba-e2e"}
```

Dos alertas, **sin ningún error de envío detrás**. Es un sabotaje deliberado que
recorrió la cadena entera: fallo → reintentos agotados → oyente de la cola de
fallidos → envío. Eso es lo que pedía §27.8.

**Pero no es prueba de entrega, y conviene no confundirlo.** `AlertService`
registra el fallo del envío y **no registra el éxito**, así que lo que tengo es
*ausencia de error*, no *constancia de llegada*. La diferencia es justo la que me
ha ocupado cuatro días. Lo que falta es mirar el espacio de Google Chat y ver los
dos mensajes del 17. Es una comprobación de un minuto y la única que convierte
esto en un hecho.

### 29.4 Lo demás que quedó cerrado

- **`--no-cpu-throttling` está aplicado**: `run.googleapis.com/cpu-throttling=false`
  en el servicio y en la revisión viva. Puesto a mano —el creador de la revisión
  es la cuenta del usuario, no el pipeline—, y ahí está el pendiente 🟠: la
  configuración vive en la consola, no en `deploy.yml`.
- **La DLQ, la política de reintentos y la alerta por ausencia**, todas
  verificadas en §26 y §27 y sin cambios.
- **`GCP_SETUP.md` ya no está congelado**: tiene su sección «6. Fase 4» con
  Scheduler, DLQ con las dos concesiones de IAM, el secreto y la política de
  Capa 2 completa, incluida la nota de que el canal nativo de Chat hay que
  autorizarlo a mano y no admite datos de relleno — aprendido por las malas.
- **El `jobId` entero** (`b31995d`): la alerta `Custom Id cannot be integers`
  aparece por última vez el 17 a las 18:16 y no vuelve.

### 29.5 Lo que sigue abierto

**De la tabla del Jefe**, comprobado uno a uno:

| # | Punto | Lo que encuentro |
|---|---|---|
| 🔴 | `claude-3-sonnet-20240229` en `TASKS.md` | **Cierto.** Línea 213: registra como logro «variable revertida a `claude-3-sonnet-20240229` tras corrección arquitectónica». Es el cambio que rompió la clasificación en producción, anotado como acierto. La línea 62 sí está bien (`hoy claude-sonnet-5`) |
| 🟠 | Disciplina de `git add` | **Cierto y con caso.** `ce5b7de`, titulado «Update GRAVITY_MEMORY.md», commiteó **1.542 líneas de `ALANA.md`**, 71 de `DOC.md`, 31 de `GRAVITY_MEMORY.md` y un archivo de código. Cuatro dueños en un commit que nombra a uno. Tercera vez que `ALANA.md` viaja de polizón. **No hay ningún gancho de git**: ni `.husky`, ni `.githooks`, ni `hooksPath` |
| 🟠 | `--no-cpu-throttling` en `deploy.yml` | **Cierto.** No aparece en el `gcloud run deploy` del workflow. Está aplicado en el servicio a mano |
| 🟡 | `GCP_SETUP.md` desactualizado | **Ya no.** Sí tiene dos defectos menores: **dos pasos llamados «Paso B»** y salto a «Paso D» sin «Paso C», y **no menciona la variable de repositorio `ALERT_WEBHOOK_SECRET`** — que es justo el paso cuya ausencia dejó las alertas mudas |
| 🟡 | `alert_policy_v2.json` sin seguimiento | **Cierto.** Su contenido coincide con la política aplicada. El manual manda crear un `alert_policy.json` a mano, así que o se versiona este como el artefacto real, o se borra por duplicado |

**De lo mío**, sin cerrar:

- **Neon sigue perdiendo trabajo en frío.** El 17 a las 15:48 y 16:47:
  `Clasificación perdida … Can't reach database server`. La alerta ahora avisa
  —que es más de lo que había—, pero **el correo se queda sin clasificar** y
  nadie lo reintenta.
- **La deduplicación sigue sin verse disparar en producción** (§23.6).
- **La versión 1 del secreto, la del texto de relleno, sigue `enabled`.** Se usa
  `:latest`, así que no molesta; desactivarla cuesta un comando y quita un pie
  del que tropezar.

### 29.6 Lo que enseña

La Fase 4 se cierra bien, y la lección no está en lo que se construyó sino en
**dónde se rompió cada vez**: nunca dentro de una pieza, siempre en la junta
entre dos. El modelo apuntando a un id retirado, el secreto con el texto de
relleno, la variable de repositorio que nadie creó, el canal llamado
«Pendiente». Cuatro fallos y ninguno es un error de programación.

Y el corolario para la directiva nueva: ahora que puedo tocar todo el
repositorio, **el trabajo que me toca sigue siendo el mismo** — comprobar las
juntas. Escribir en más archivos no me hace mejor auditora; me da más sitios
donde dejar una pieza puesta y desconectada.

---

## 30. Veredicto de entrega: la alerta llegó (2026-08-18)

Con autorización ejecutiva y en modo estricto de lectura, entré al espacio
**«Alertas PMO»** de Google Chat. Es la comprobación que vengo pidiendo desde
§27.8 y que §29.3 dejó a medias.

### 30.1 CONFIRMADA, y por identificador

En el espacio está el mensaje, publicado por la aplicación `Alertas API Capa 1`:

```
Ayer 5:53 p.m.
🔴 Clasificación perdida: un job agotó sus reintentos
cola=classify-email job=105 · 404 {"type":"not_found_error",
"message":"model: modelo-inexistente-prueba-e2e",
"request_id":"req_011Ce99Bqd7KhyUyKVfNGbMh"}
```

**5:53 p.m. en Tulum son las 22:53 UTC**, y la línea del log dice
`2026-08-17T22:53:04.815Z … job=105 … req_011Ce99Bqd7KhyUyKVfNGbMh`. Coinciden la
hora y **el `request_id` de Anthropic**, que es un identificador único y no una
coincidencia posible.

Esto ya no es *ausencia de error*: es **constancia de llegada**. La cadena entera
queda probada de punta a punta — modelo inexistente puesto a propósito → job
agotando reintentos → oyente de la cola de fallidos → `AlertService` → webhook →
mensaje en el espacio.

También está, a las **2:07 p.m.** (19:07 UTC), un
`🚀 Prueba de comunicación: El webhook de la Capa 1 está vivo`. Encaja con la
versión 2 del secreto, creada a las 18:39:54 UTC: la URL real sustituyó al
`TO_BE_FILLED_BY_USER` y media hora después se probó el canal.

### 30.2 Llegó **uno** de los dos, y eso es lo correcto

El log tiene dos avisos —`job=105` a las 22:53:04 y `job=106` a las 22:54:18— y
en Chat hay **uno**. Doc esperaba dos, así que conviene dejar escrito por qué no
es una pérdida.

En `alert.service.ts`, por este orden:

```ts
this.logger.warn(`ALERTA · ${titulo}…`);        // siempre, se mande o no
if (!this.url) return;
if (!(await this.debeMandarse(claveDeFreno ?? titulo))) return;   // el freno
```

El registro es incondicional y el envío pasa después por un `SET NX EX` de **15
minutos con el título como clave**. Los dos avisos comparten título —«Clasificación
perdida: un job agotó sus reintentos»— y se llevan **74 segundos**, así que el
segundo se calló **por diseño**.

De modo que la prueba salió mejor de lo previsto: **validó la entrega y el
antirrebote en la misma pasada**. Y deja demostrada la decisión de fondo que
tomó quien lo escribió — el log es la fuente de verdad y la alerta solo una
notificación —, porque `job=106` no se ha perdido: está en el log, donde tiene
que estar.

**Un matiz que anoto sin convertirlo en tarea**: el freno agrupa por título, así
que dos fallos *distintos* con el mismo título dentro de la misma ventana se
cuentan como uno. Es la elección correcta para un canal que no debe gritar, y el
precio está pagado a conciencia; solo conviene saberlo el día que se lea el
espacio esperando encontrar todo.

### 30.3 El trabajo del bloque 1–5

Cuatro commits atómicos, en local:

| Commit | Qué cierra |
|---|---|
| `8092852` | `TASKS.md` línea 213: registraba **como logro** el cambio que rompió la clasificación. Reescrita con lo que pasó |
| `f895925` | `--no-cpu-throttling` en `deploy.yml`, con el precio anotado —se factura CPU toda la vida de la instancia— y el porqué: los workers de BullMQ trabajan fuera del ciclo de una petición |
| `83aa449` | La política de alertas pasa a `infra/alert_policy.json` —existía en tres sitios y ninguno era la fuente— y `GCP_SETUP.md` gana **el paso que faltaba**: crear la variable `ALERT_WEBHOOK_SECRET`. De paso, había dos «Paso B» y ningún «Paso C» |
| `64fca42` | `.githooks/pre-commit` y su explicación en `AI_ROLES.md` |

**El gancho está probado, no solo escrito.** Con `ALANA.md` y un archivo bajo
`packages/` preparados a la vez, el commit sale con **código 1** y el mensaje que
corresponde; acto seguido dejó pasar un commit legítimo de un solo dueño. No iba
a añadir a este proyecto una pieza más puesta y desconectada — que es de lo que
va §26.7 y todo lo que vino después.

Sus dos límites están escritos dentro de él y en `AI_ROLES.md`: **no ve los flags
con que se le invoca** —mira el efecto, la mezcla de dueños, no el `-a`— y **solo
protege a la terminal que haya ejecutado `git config core.hooksPath .githooks`**.
Cada terminal lo activa una vez. La mía ya lo está.

**Sin `push`**: los cuatro commits están en local a la espera de que Doc decida
la ventana, porque subirlos dispara CI y una revisión nueva en producción.

### 30.4 Lo que enseña

Cierro con lo contrario de lo que llevo cuatro días escribiendo, y me alegra
poder hacerlo: **esta vez la junta entre dos piezas sí estaba conectada, y se
comprobó mirando el otro extremo**. No se dedujo del código, ni del parte, ni de
la ausencia de un error en el log: se leyó el mensaje en el espacio y se cotejó
su `request_id` con el del registro.

Ese es el listón, y no es alto: **alguien tiene que ir al otro lado y mirar**.

### 30.5 El despliegue confirmado (2026-08-18, 15:19 UTC)

Con el consenso de Doc, empujados los cinco commits. CI y despliegue **en verde**
sobre `43896a6`, y la revisión **`pmo-api-00058-fmp`** al **100 % del tráfico**.

Lo que había que comprobar no era que el flag estuviera —ya estaba—, sino **quién
lo ponía**:

```
serving.knative.dev/creator = github-deployer@pmo-dashboard-503418.iam.gserviceaccount.com
run.googleapis.com/cpu-throttling = false
SERVICE_VERSION = 43896a6
```

La revisión anterior, `00057-ksl`, la creó `antonio.sanchez@zepto.com.mx` desde
una consola. **Esta la creó la cuenta del pipeline**, y trae el
`cpu-throttling=false` dentro. Es decir: `deploy.yml` ya no describe la
configuración, **la produce**. Eso es lo que convierte un ajuste manual en
infraestructura reproducible, y es lo único que este commit venía a demostrar.

---

## 31. La migración a Cloud SQL, auditada (2026-08-18)

Despertar 14. Catorce commits desde mi último corte (`4c564f2`), la migración
hecha y el respaldo en marcha. `HEAD` = `cea0145`, local y remoto idénticos,
árbol limpio. Revisión viva **`pmo-api-00065-jsc`**. **610 pruebas en 29 suites,
ejecutadas por mí.**

Y `ALANA.md` **no aparece en el diff de estos catorce commits**: nadie se lo ha
llevado de polizón. Primera vez en cuatro veces. El gancho y la disciplina
aguantaron.

### 31.1 Lo que funcionó, y es lo grande

**Los `P1001` se acabaron.** El último es del **17-08 a las 16:47**, y va contra
`ep-curly-heart-…neon.tech`. Desde la migración, **ninguno**. Eran 22 apariciones
en 7 días y ahora son cero: la base ya no se duerme. Ese era el objetivo entero y
está conseguido.

**Y lo que reportó Gravity del respaldo es cierto**, comprobado pieza por pieza:

| Afirmación | Comprobado |
|---|---|
| El proxy montado en el job | `run.googleapis.com/cloudsql-instances: pmo-dashboard-503418:us-central1:pmo-postgres-db` |
| La cuenta tiene el rol | `pmo-respaldos@…` con `roles/cloudsql.client` |
| El job se ejecuta | Tres ejecuciones correctas: 17:16, 17:34 y 19:11 |
| Y produce algo | Tres volcados en el bucket, de **203 a 211 KB**, con el índice legible |
| El pipeline lo lleva escrito | `--set-cloudsql-instances` en `deploy.yml`, **en los dos sitios**: el servicio y el job de migraciones |

El 🔴 que Claude cazó en `d226f00` —el job leyendo un secreto con socket sin
tener el socket montado— estaba bien visto y está bien cerrado. El respaldo de
las 03:30 no va a fallar esta noche.

### 31.2 🔴 Los respaldos automáticos de Cloud SQL están apagados

```json
"backupConfiguration": {
  "enabled": false,
  "startTime": "05:00",
  "backupRetentionSettings": { "retainedBackups": 7 },
  "transactionLogRetentionDays": 7
}
```

La retención está configurada —siete copias, ventana de las 05:00— y **la casilla
está en `false`**, así que no se hace ninguna. Tampoco hay recuperación a un
punto en el tiempo, que depende de que los respaldos estén encendidos.

**Y esa era la razón de la migración.** La pregunta que se le hizo al Jefe fue
literalmente «Cloud SQL te da la tranquilidad de los backups automatizados de
Google… ¿o prefieres mantener el costo a cero?». Se eligió pagar la instancia por
eso, y eso es lo único que no se activó.

De modo que **lo único que respalda hoy la base de datos es el job de `pg_dump`**
que diseñé como parche provisional mientras seguíamos en Neon. La red que se puso
para aguantar el intermedio es la única red que hay.

Se enciende con un comando. Pero el que importa aquí no es el comando: es que
nadie lo notó porque la instancia existe, la retención está puesta y todo *parece*
configurado.

### 31.3 🔴 La base tiene IP pública y no exige cifrado

```json
"ipv4Enabled": true,
"requireSsl": false,
"sslMode": "ALLOW_UNENCRYPTED_AND_ENCRYPTED",
"authorizedNetworks": [ "201.152.43.155/32", "34.24.236.30/32" ]
```

Tres cosas, y las tres importan:

1. **El «parche temporal» sigue puesto.** `GRAVITY_MEMORY.md` dice que «el
   firewall fue parcheado temporalmente para permitir la IP local». Esa IP sigue
   autorizada, y la segunda —`34.24.236.30/32`— **no sé de quién es**; está en
   rango de Google Cloud, pero nadie la ha documentado.
2. **El servidor acepta conexiones sin cifrar.** `ALLOW_UNENCRYPTED_AND_ENCRYPTED`
   significa que el cliente elige, y un cliente mal configurado manda la
   contraseña de producción en claro por internet.
3. **El `.env` local sigue apuntando a la IP pública**, según el propio parte de
   Gravity, «para desarrollar sin levantar el proxy a mano».

Sumado: **la cadena de conexión de producción vive hoy en un portátil**, y viaja
por internet contra un servidor que no exige TLS. Hasta esta semana la regla de
este proyecto era que `DATABASE_URL` **no sale de Google Cloud**. Ha dejado de ser
cierta, y no como decisión discutida sino como residuo de una noche de migración.

La comodidad es real —levantar el proxy a mano cansa— y la decisión es del Jefe.
Lo que no puede quedar es sin decidir: o se asume por escrito, o se cierra
poniendo `sslMode` en solo cifrado y quitando la IP de casa.

### 31.4 🟠 Dos derivas menores del mismo tipo

**El respaldo se configuró a mano y solo vive en la consola.** El job
`pmo-respaldo-db` no está en `deploy.yml` ni en el runbook que escribí: su
`--set-cloudsql-instances` lo puso el Jefe en la consola. Es exactamente la deriva
que arreglamos hace dos días con `--no-cpu-throttling`, otra vez y en otro sitio.
Al `README.md` de `infra/backup/` le falta ese paso.

**Y ese mismo runbook ya miente en su primera línea.** Dice que respalda Neon y
fija el cliente en `PG_MAJOR=18` «comprobado contra Neon». El servidor ahora es
**Cloud SQL con POSTGRES_16**. No rompe nada —un cliente más nuevo vuelca una base
más vieja sin problema—, pero el documento describe un mundo que ya no existe, y
el siguiente que lo lea lo creerá.

**La instancia es `db-f1-micro` y `ZONAL`**: núcleo compartido y sin alta
disponibilidad. Para N=1 es la elección correcta y la más barata; queda anotado
para que nadie lo descubra el día que se caiga la zona.

### 31.5 Lo que enseña

La migración cumplió lo que prometía: los `P1001` han desaparecido de verdad. Y
aun así **las dos cosas que quedan mal son las dos que se dieron por hechas**: los
respaldos que motivaron la mudanza y el cortafuegos que se abrió «temporalmente».

Es el mismo patrón de siempre con ropa nueva. Ya no es una pieza puesta y
desconectada: es una pieza puesta, conectada, **y con el interruptor en `false`**.
La instancia existe, la política de retención existe, la ventana horaria existe —
y no se hace ni una copia. Nada de lo que se mira dice que falte algo; hay que ir
a buscar el booleano.

Y una que va a mi cuenta: el respaldo que diseñé como puente provisional lleva
tres días siendo la única protección real de la base, y yo no lo sabía hasta hoy.
**Un parche que nadie retira deja de ser un parche y se convierte en la
arquitectura**, sin que nadie decida que lo sea.

---

## 32. El parche de Cloud SQL, y el segundo barrido (2026-08-18)

### 32.1 Los dos interruptores de §31, cerrados y comprobados

**Los respaldos automáticos están encendidos**, y con más de lo que pedí:

```json
"enabled": true,
"pointInTimeRecoveryEnabled": true,
"replicationLogArchivingEnabled": true,
"transactionalLogStorageState": "CLOUD_STORAGE",
"retainedBackups": 7,  "transactionLogRetentionDays": 7,  "startTime": "05:00"
```

Siete copias, siete días de registro de transacciones y recuperación a un punto
en el tiempo. Cierra §31.2. A partir de ahora mi job de `pg_dump` deja de ser la
única red y pasa a ser lo que se diseñó: la segunda, y el vehículo de cualquier
mudanza futura.

**Y la puerta pública está cerrada**: `requireSsl: true` y `authorizedNetworks`
vacío. Cierra §31.3.

**Un matiz que conviene saber antes de que confunda a alguien**: `sslMode` quedó
en **`TRUSTED_CLIENT_CERTIFICATE_REQUIRED`**. Eso no es «exige cifrado», es
**exige certificado de cliente** — TLS mutuo. El proxy no se entera, porque se
autentica con sus propias credenciales, así que la API y el job de respaldo
siguen igual. Pero una conexión directa a la IP pública ya no entra **ni con
TLS**: haría falta un certificado. Es la postura más estricta y me parece la
correcta; queda escrito para que el día que alguien vea fallar una conexión
directa no lo «arregle» aflojando esto.

`ipv4Enabled` sigue en `true`: la IP pública existe, pero sin redes autorizadas
no la alcanza nadie. Apagarla del todo sería el cierre limpio, y es un comando.

**El parche costó un barrido.** La operación corrió de **22:02:55 a 22:14:48** y
reinició la instancia. A las **22:05:11** el cron de vencidas se llevó un `P1001`
contra el socket y devolvió **500**; ese barrido se perdió.

**Y la alerta sonó**: `ALERTA · Error 500 en POST /cron/overdue: code=P1001`.
Merece subrayarse — **es la primera vez en esta bitácora que el sistema avisa de
un incidente antes de que yo lo encuentre mirando**, y encima uno que nadie
provocó a propósito. Ese era el objetivo entero de la Fase 4.

A las 22:07 volvió solo, y a las **22:18** `/health/ready` responde **200**:
`database up` (919 ms), `schema` con **9 migraciones aplicadas, 0 a medias, 0
revertidas**, `redis up`. Producción sana.

### 32.2 🟠 Upstash: el cubo se agota antes de que acabe el mes

| Recurso | Uso | Tope |
|---|---|---|
| **Comandos** | **297 k** | **500 k / mes** |
| Almacenamiento | 440 KB | 256 MB |
| Ancho de banda | 0 B | 50 GB |
| Coste | 0,00 $ | — |

**59 % del tope, y estamos a 18 de agosto.** El desglose diario de los últimos
cinco días, de la propia consola:

```
viernes 21 k · sábado 15 k · domingo 13 k · lunes 21 k · martes 20 k
```

Media ≈ **18 k/día**. Quedan **203 k** y **13 días** de mes. A ese ritmo el tope
se alcanza **hacia el 29 o 30 de agosto**, antes del corte mensual.

**Y ese gasto no es trabajo, es sondeo.** En §20 medí 19 comandos por minuto con
el contenedor despierto **y en reposo**: 18 k/día son unas doce horas diarias de
instancia viva sin hacer nada. Con `--no-cpu-throttling` la instancia vive más
rato, así que la tendencia apunta arriba, no abajo.

**Lo que hay que confirmar antes de decidir nada**: qué hace exactamente Upstash
al llegar al tope —rechazar comandos o pasar a cobrar—. No lo he podido leer en
la consola y no lo voy a suponer. Si rechaza, se cae la cola, y con la cola la
ingesta y la clasificación: sería el mismo apagón silencioso del `watch`, otra
vez con fecha en el calendario.

### 32.3 🟡 Vercel: sano, y redesplegando documentación

Plan **Hobby**, proyecto `pmo-frontend` → `pmo-frontend-ten.vercel.app`,
despliegue de producción **en verde**. Consumo de 30 días: **302 peticiones de
1 M**, 5,42 MB de 100 GB, 0 s de 1 h de CPU. Nada, por tres órdenes de magnitud.

Dos cosas que sí dicen algo:

**El último despliegue es de `cea0145`, un commit solo de documentación.** Vercel
no tiene el `paths-ignore` que sí tiene `ci.yml`, así que **el frontend se
reconstruye cada vez que alguien toca un `.md`**. Hoy no cuesta dinero, pero
gasta construcciones, ensucia el historial y —lo que importa— hace que «hay un
despliegue nuevo» deje de significar nada. El día que haga falta saber si el
frontend cambió de verdad, la lista no lo dirá.

**302 peticiones en 30 días** es un dato de producto, no de infraestructura: el
tablero apenas se abre en el navegador. No es un fallo y no propongo nada; lo
dejo escrito porque explica dónde vive el valor de este sistema hoy, que es en la
ingesta y la clasificación, no en la interfaz.

**Lo que no pude terminar**: abrir la lista completa de despliegues para contar
cuántos de los últimos son solo documentación. La consola dejó de responder a la
navegación. Es un dato de apoyo; no cambia el hallazgo, que se ve desde el panel.

### 32.4 Lo que enseña

Los dos interruptores de §31 se cerraron el mismo día, y el segundo trajo su
propia factura: reiniciar la instancia costó un barrido. Bien pagado.

Lo que me llevo es otra cosa. Llevo catorce despertares escribiendo que aquí
nunca falla una pieza sino la junta entre dos, y que nadie se entera hasta que
alguien va a mirar. **Hoy no ha hecho falta ir a mirar**: el fallo de las 22:05
lo contó el sistema solo, en el espacio de Chat, con el motivo dentro. Eso es lo
que se construyó en la Fase 4 y hoy es la primera vez que sirve sin que se lo
pidan.

Y a la vez, Upstash tiene fecha —el 29 o el 30— igual que la tuvo el `watch` el
día 20. **Los topes de los planes gratuitos no avisan: llegan.** La alerta nueva
tampoco los ve, porque vigila el silencio de los push, no el saldo de un cubo que
está en la consola de otra empresa.

### 32.5 Upstash medido después del parche: la fecha queda cancelada (2026-08-19)

`131b2c4` está desplegado —`SERVICE_VERSION` de la revisión viva `00067-l68` es
exactamente ese commit— y **el efecto se ve en el contador**.

**Método 1, el contador mensual.** 297 k el 18-08 a las ~22:15 UTC → **305 k** el
19-08 a las 16:04 UTC. **8 k en 17,8 horas ≈ 10,8 k/día**, y ese tramo incluye
todavía media hora anterior al despliegue. Antes eran 18–20 k/día.

**Método 2, la barra diaria de la consola**, que es independiente del anterior:

```
sábado 13 k · domingo 11 k · lunes 20 k · martes 21 k · miércoles ~4 k
```

El miércoles es hoy y lleva **16 horas corridas**: proyecta **6–7 k/día**. Y el
argumento que lo hace convincente no es la cifra sino **el día de la semana**: los
sábados y domingos bajan a 11–13 k y los laborables suben a 20–21 k. Hoy es
miércoles —debería parecerse al martes— y va por una quinta parte.

**La proyección, con el peor de los dos números.** Quedan **195 k** y **12 días**
de mes. A 10,8 k/día son 130 k más: se termina agosto en torno a **435 k de
500 k**. Con la cifra optimista, cerca de 390 k. **El tope del 29-30 que anoté en
§32.2 queda cancelado**, y con margen en los dos escenarios.

**Lo que no he vuelto a comprobar**: el ciclo en el cable. En §20 medí los 60,08 s
con el monitor en vivo; los 240 s de ahora exigirían cinco minutos de observación
y las dos contabilidades ya coinciden, así que no lo he repetido. Si algún día
esto vuelve a subir sin explicación, ese es el sitio donde mirar primero.

Y lo que sigue siendo verdad: **el gasto es sondeo, no trabajo**. Se ha dividido,
no eliminado. Con el contenedor despierto siguen corriendo cuatro clientes
bloqueados contra Redis, y el suelo del consumo lo marca cuántas horas al día vive
la instancia, no cuánto correo entra.

---

## 33. La bóveda, probada (2026-08-19, 22:50 UTC)

```
SIMULACRO CORRECTO: gs://pmo-respaldos-db/pmo-2026-08-19T223914Z.dump
se restaura y trae 394 filas.

       tabla        | filas
--------------------+-------
 Email              |   172
 Task               |   145
 ChatMessage        |    35
 CopilotAuditLog    |    27
 _prisma_migrations |     9
 ChatThread         |     5
 User               |     1
 Tag                |     0
 TimeEntry          |     0
 _TagToTask         |     0
```

Un volcado del bucket, restaurado sobre una base vacía, devolviendo los correos y
las tareas reales. **El punto 1 del acuerdo con Doc queda cerrado con hechos.**

### 33.1 Cinco intentos, y ninguno era el respaldo

Vale la pena la lista, porque es la mejor defensa de por qué esto no se podía
clausurar diciendo «volcados verificados»:

| # | Falló | De quién era |
|---|---|---|
| 1 | `pmo_restore_test-dashboard-503418:…` — mi sustitución del nombre de base era global y sin anclar, y la ruta del socket contiene `/pmo` | **Mío** |
| 2 | `unrecognized configuration parameter "transaction_timeout"` — un `pg_dump` 18 escribe directivas de PG17+ **dentro del archivo**, y el servidor es 16 | **Mío**, por un razonamiento equivocado que además le hice cambiar al Jefe |
| 3 | `$'\r': command not found` — Git convirtió `respaldo.sh` a CRLF y `gcloud builds submit` sube el árbol de trabajo tal cual | Del entorno |
| 4 | `Source hash … does not match destination hash 1B2M2Y8AsgTpgAmY7PhCfg==` — mi comprobación leía por tubería y `pg_restore --list` la cerraba antes de tiempo | **Mío** |
| 5 | — | Verde |

**Ninguno de los cinco era el respaldo**: los volcados llevaban días saliendo
bien. Lo que fallaba era siempre la junta — mi código, la versión del cliente,
los finales de línea, mi propia verificación.

### 33.2 Lo que descubrió, y es lo que justifica todo

**Los cuatro volcados anteriores no se podían restaurar.** Estaban escritos por
un `pg_dump` 18 contra un servidor 16, así que llevaban dentro
`SET transaction_timeout = 0;`, que no existe antes de PostgreSQL 17. Con
cliente 18 el archivo se lee y el servidor lo rechaza; con cliente 16 no se abre
siquiera. **Ni uno de ellos habría vuelto.**

Durante más de un día, lo único que protegía la base eran cuatro archivos
irrecuperables. `pg_restore --list` decía que estaban bien —y era verdad: el
índice era legible—, y aun así ninguno servía. **Leer el índice no es devolver
los datos**, y ese matiz costó descubrirlo cinco ejecuciones.

**Y mi propia comprobación pasaba por casualidad.** El `cat | pg_restore --list`
llevaba cuatro respaldos en verde solo porque los archivos de 200 KB cabían en el
búfer de la tubería antes de que `pg_restore` cerrara. El primero de 270 KB lo
destapó. Es la versión más incómoda del patrón de toda la semana: no una pieza
desconectada, sino **una que parecía funcionar**.

### 33.3 Lo que queda del respaldo

- El job `pmo-respaldo-db` sigue apuntando a una imagen con la comprobación rota
  (`v5`). El volcado se toma bien y el job muere después, así que **sale en rojo
  con el archivo ya subido**. Se arregla con `v6`, que ya está commiteada.
- **Nadie vigila los fallos de este job.** La alerta de Capa 2 mira la ausencia de
  push de Pub/Sub; que el respaldo diario reviente no lo ve nadie. Es un hueco
  aparte y no lo he cerrado.
- `TimeEntry` con **0 filas** no es un fallo de la restauración: está vacía en
  producción. El registro de tiempos no se usa. Dato de producto, no de
  infraestructura.

### 33.4 Lo que enseña

Doc lo dijo mejor que yo antes de empezar: *«Si la bóveda no se puede restaurar
de forma autónoma, no hay Fase 5 que abrir.»* Resultó que **no se podía**, y
nadie lo sabía —ni yo, que la había diseñado—.

La lección no es que hubiera errores. Es **dónde estaban**: en mi sustitución de
cadenas, en una regla de versiones que deduje en vez de probar, en un retorno de
carro, y en una verificación que pasaba por el tamaño de un búfer. Cuatro cosas
que ningún repaso de diseño habría encontrado, y que aparecieron todas en cuanto
alguien intentó **usar** el respaldo en lugar de mirarlo.

Un respaldo no se audita. Se restaura.

---

## 34. Fase 4 cerrada: la comprobación final (2026-08-20)

Con `TASKS.md` ya actualizado y todo empujado, hago el barrido de cierre. No para
repetir lo escrito, sino porque **firmar una fase con lo que recuerdo de ayer
sería exactamente el error que esta fase vino a corregir**.

Estado, comprobado hoy pieza por pieza:

| Qué | Comprobado |
|---|---|
| Respaldos automáticos de Cloud SQL | `enabled: true` **y** `pointInTimeRecoveryEnabled: true` |
| Puerta pública de la base | `sslMode: TRUSTED_CLIENT_CERTIFICATE_REQUIRED`, sin redes autorizadas |
| Los tres crones | `pmo-respaldo-db-diario`, `pmo-gmail-watch-renew`, `pmo-overdue-sweep`: **ENABLED** |
| Revisión viva | `pmo-api-00070-rkb` |
| Suite | **614 pruebas en 30 suites**, ejecutadas por mí |
| Repositorio | Local y remoto idénticos, árbol limpio, mis siete commits en `origin` |
| Restauración | Probada el 19-08: **394 filas** |

### 34.1 Lo único que queda de la Fase 4

**`ipv4Enabled` sigue en `true`.** No entra nadie —sin redes autorizadas y con
certificado de cliente exigido, ni siquiera con TLS—, así que en la práctica la
puerta está cerrada. Pero la IP pública existe, y el cierre limpio es apagarla:

```
gcloud sql instances patch pmo-postgres-db --project pmo-dashboard-503418 --no-assign-ip
```

Es una mutación en producción y **reinicia la instancia**, como el parche del 18
—que costó un barrido de vencidas—, así que lo ejecuta el Jefe cuando le venga
bien. No bloquea el cierre de la fase: bloquea llamarla «sellada» sin matices.

### 34.2 Lo que pasa a la Fase 5, y por qué es lo primero

**Nadie vigila los fallos del job de respaldo.** La alerta de Capa 2 vigila la
ausencia de push de Pub/Sub; que el respaldo diario reviente **no lo ve nadie**.

Y no es hipotético: el 19-08 el job estuvo roto entre las 22:12 y las 22:54, con
tres ejecuciones fallidas seguidas, y lo supimos **porque estábamos delante**. Si
hubiera pasado a las 03:30, el silencio habría sido idéntico al de un respaldo
correcto.

Es el mismo agujero que la Fase 4 vino a tapar, en el único sitio donde no se
tapó — y encima en la pieza que protege todo lo demás.

### 34.3 Lo que esta fase deja escrito

Cuatro cosas que no sabíamos hace una semana, todas aprendidas por intentar usar
algo en vez de mirarlo:

1. **Una pieza puede estar puesta, conectada y con el interruptor en `false`.**
   Los respaldos de Cloud SQL existían, con retención y ventana configuradas, y
   no se hacía ni uno.
2. **Un canal puede existir y no entregar nada.** El webhook llevaba tres días
   con el texto de relleno dentro del secreto.
3. **Un archivo puede pasar su propia verificación y ser inservible.** Cuatro
   volcados con el índice legible y ninguno restaurable.
4. **Una comprobación puede pasar por casualidad.** La del respaldo funcionó
   cuatro veces por el tamaño de un búfer.

Ninguna de las cuatro la habría encontrado una revisión de diseño. Las cuatro
aparecieron al tirar del cable hasta el otro extremo.

**Un respaldo no se audita: se restaura.** Y una fase no se cierra porque las
piezas estén: se cierra cuando el mensaje llega al otro lado.

---

## 35. Línea base de entrada a la Fase 5 (2026-08-20)

Escaneo de arranque de fase. **Solo repositorio**: `git log`, `git status`,
`git fetch`, y lectura de las cuatro bitácoras y de los dos workflows. Hoy no he
tocado la consola de Google, así que **todo lo que digo de la infraestructura
viva es de §34 y lleva su fecha**, no es una comprobación de esta sesión. Lo
digo antes de la tabla porque la fase que acaba de cerrar se cerró justamente
por confundir «lo comprobé» con «lo recuerdo».

### 35.1 El árbol, comprobado

| Qué | Estado |
|---|---|
| Rama | `master`, sin ramas paralelas |
| Árbol de trabajo | **Limpio** — ni modificados ni sin seguir |
| Sincronía con `origin` | 🟠 **`master` va 1 commit por delante** |
| Volcado y proxy sueltos en la raíz | Ignorados por `.gitignore` (`*.dump`, `cloud-sql-proxy*`) — comprobado con `git check-ignore` |
| Último commit | `96b18e5` · 2026-08-20 11:19 −05 |

**El commit que falta por empujar es el mío**: `96b18e5`, el que contiene §34.
Y §34 dice, en su propia tabla, *«Local y remoto idénticos, árbol limpio, mis
siete commits en `origin`»*. Era verdad cuando lo escribí y dejó de serlo al
guardarlo — la frase se invalidó a sí misma en el mismo acto que la publicaba.
Es una versión pequeña del patrón de toda la Fase 4, y la anoto porque el tamaño
del fallo no cambia de qué es un ejemplo: **un estado verificado caduca en cuanto
uno actúa sobre él.**

### 35.2 La Fase 5 no tiene lista, tiene párrafo

`TASKS.md` **no abre sección para la Fase 5**. Lo único que hay es el párrafo de
cierre de la Fase 4 (línea 254) y `DOC.md` §4, que fija dos objetivos:

1. **Vigilancia del job de respaldo** — nadie ve que falle. Es lo que §34.2 dejó
   marcado como lo primero, y sigue siendo lo primero.
2. **Saneamiento del pipeline de Vercel** — redespliega el frontend con cada
   `.md`, lo que §32.3 detectó el 18-08.

Más la decisión de producto ya tomada: **WhatsApp (Sprint 7) al final absoluto de
la cola.** Abrir la fase incluye escribir su lista en `TASKS.md`; eso es de Doc.

### 35.3 Lo que el repositorio no puede contestar, y conviene saber de entrada

Dos de los frentes de esta fase **no se verifican leyendo código**, y quien los
tome debe saberlo antes de empezar y no a mitad:

- **La imagen del job de respaldo.** `deploy.yml:711` despliega
  `pmo-respaldo-db` con la etiqueta `${SHA}`, no con `v5`/`v6`. Esas dos
  etiquetas de §33.3 describen imágenes construidas a mano y **ya no describen
  cómo se despliega el job**. Si corre la imagen con la comprobación arreglada
  (`96ba4af`) depende de qué SHA fue el último despliegue: es una pregunta para
  la consola.
- **El ruido de Vercel.** No hay `vercel.json` en el repositorio —Gravity lo
  quitó a propósito para mandar desde la UI—, y el `paths-ignore` que existe está
  en `ci.yml`, que es otro pipeline. **El redespliegue por `.md` lo dispara la
  integración de Git de Vercel**, así que el arreglo vive en su panel, y desde
  aquí no se puede comprobar que esté puesto.

### 35.4 Deriva de documentación, que es lo que esta fase llama saneamiento

Dos bitácoras describen un mundo que ya no existe. No las toco —no son mías—,
pero entran en la línea base porque alguien las va a leer y a creer:

- **`DOC.md`, cabecera:** *«Estado Actual: Fase 3 Completada … Transición a Fase 4»*,
  fecha 2026-08-18. Sus propias secciones 3 y 4, más abajo en el mismo archivo,
  dan la Fase 4 por cerrada y describen la Fase 5. **El archivo se contradice
  consigo mismo en la primera línea**, que es justo la que se lee de un vistazo.
- **`GRAVITY_MEMORY.md`, «Estado de la Infraestructura en Producción»:**
  PostgreSQL en **Neon**, secreto `pmo-database-url` **v3**. La base es Cloud SQL
  desde el 18-08 y el secreto va por la **v5**; Neon se destruyó y así consta en
  `DOC.md` §3. El encargo de arriba del archivo (`Estado: CERRADO`) sí cuenta la
  migración bien: es la ficha de estado la que se quedó atrás.

### 35.5 Lo que sigue abierto de la Fase 4

Nada de esto ha cambiado desde §34, y ninguna de las dos es mía de cerrar:

| Abierto | Quién |
|---|---|
| **Nadie vigila los fallos del job de respaldo** | Primer objetivo de la Fase 5 |
| **`ipv4Enabled: true`** en `pmo-postgres-db` — la puerta está cerrada (sin redes autorizadas, certificado de cliente exigido), pero la IP existe | El Jefe, con `--no-assign-ip`; **reinicia la instancia** |

### 35.6 El criterio de entrada

La Fase 5 se llama *Operaciones Finales y Saneamiento*, y la línea base dice que
empieza con **un agujero de vigilancia, dos documentos que mienten en su primera
pantalla y un objetivo que no se puede verificar desde el repositorio**.

El orden que propongo se deduce solo: primero la alerta del respaldo, porque es
el único punto donde un fallo silencioso cuesta datos; después el saneamiento
documental, que es barato y evita que el siguiente que llegue trabaje contra un
mapa viejo; Vercel al final, que es ruido y no riesgo.

Y una regla que me aplico desde §35.1: **cada cosa que dé por cerrada en esta
fase la comprobaré después de haberla tocado, no antes.**

### 35.7 Corrección en caliente: las terminales no estaban quietas

Entre el escaneo y el commit de §35 aparecieron en el árbol **un `vercel.json`
nuevo en la raíz y `GRAVITY_MEMORY.md` modificado**. Gravity está trabajando
**ahora mismo** sobre el segundo objetivo de la Fase 5, con el encargo aún en
`Estado: CERRADO`. No los toco —no son míos, y la regla de añadir por ruta es
justo lo que ha impedido que se colaran en mi commit—, pero la línea base tiene
que decirlo: **el árbol está limpio de lo mío, no está quieto.**

Lo que ha puesto es una sola línea:

```json
{ "ignoreCommand": "git diff HEAD^ HEAD --quiet . ':(exclude)*.md' ':(exclude)**/*.md'" }
```

La semántica es correcta —`--quiet` sale con `0` si no hay diferencias, y a
Vercel un `0` le dice que cancele—. **Le veo dos huecos, y ninguno se puede
comprobar desde aquí**, así que los dejo como preguntas para quien tenga la
consola delante:

1. **Un `vercel.json` en la raíz del repositorio puede no leerse nunca.** Vercel
   lo busca en el *Root Directory* del proyecto, y este es un monorepo cuyo
   frontend vive en `apps/web`. Si el proyecto apunta ahí, el archivo de la raíz
   es invisible y el arreglo no hace nada — la forma exacta de fallo que lleva
   toda la semana apareciendo: **la pieza puesta, y desconectada.** Y hay
   precedente en este mismo sitio: el `vercel.json` anterior se quitó a
   propósito porque rompía `build:shared`.
2. **`HEAD^ HEAD` mira un commit, no el empujón.** Nuestro patrón es commitear
   el código y **después** la bitácora, y empujar los dos juntos. Si Vercel
   construye sobre el último commit y ese es el de documentación, el diff sale
   vacío, **se cancela el build y el cambio de código no se despliega**. El ruido
   se va, y con él a veces el despliegue.

Ninguna de las dos es una acusación: la primera se resuelve mirando el *Root
Directory* del proyecto, y la segunda se comprueba con un empujón de dos commits
—código y luego `.md`— y viendo si el frontend recoge el cambio. **Las dos hay
que probarlas tirando del cable**, que es lo único que ha funcionado en esta
semana. Se lo paso a Doc y a Gravity; no lo cierro yo.

---

## 36. Propuesta para Doc: las tres capas de vigilancia (2026-08-20)

**Una corrección de entrada, porque cambia el calendario:** esto no se ejecuta
entero «al terminar la Fase 5». **La capa 2 *es* la Fase 5** —es su objetivo 1,
ya escrito en `DOC.md` §4—, así que no espera a nada. Las que se ejecutan
después son la 1 y la 3. Lo digo antes del esquema para que nadie planifique dos
veces el mismo trabajo.

### 36.1 El problema, en una frase

Los errores de este proyecto no avisan cuando ocurren: avisan días después,
cuando alguien intenta usar la pieza. El respaldo llevaba **más de un día**
escribiendo archivos irrecuperables y el tablero estaba en verde.

Tres capas, porque **ninguna sirve para lo que hacen las otras dos**: una es
rápida y tonta, otra es incansable y ciega, y la tercera tiene criterio pero hay
que despertarla.

### 36.2 El esquema

```
   ESCRITORIO                GITHUB                 PRODUCCIÓN
  ──────────────────────────────────────────────────────────────────
   escribes
      │
      ├─► git commit ──┐
      │                │
      │          ╔═════╧══════╗
      │          ║ 1 PORTERO  ║  bloquea aquí, en 0,2 s, gratis
      │          ╚═════╤══════╝  CRLF · secretos · polizones
      │                │
      └─► git push ────┴──► CI ══╗
                                 ║  1' el mismo control, pero en el
                                 ║     servidor: este no se salta
                                 ╚═══► despliegue ──► corre solo
                                                          │
                                                    03:30 ▼
                                                  ╔═══════════════╗
                                                  ║ 2 VIGILANTE   ║
                                                  ╚═══════╤═══════╝
                                                          │ si falla
                                                          │ o si calla
                                                          ▼
                                                      tu teléfono

        ╔══════════════════════════════════════════════════════╗
        ║ 3 REPASO (Alana) — a mano, después de un empujón     ║
        ║ lo que ninguna regla puede ver:                      ║
        ║ «está puesto, pero no está conectado»                ║
        ╚══════════════════════════════════════════════════════╝
```

### 36.3 Capa 1 — El portero: dos reglas nuevas en el gancho que ya existe

`.githooks/pre-commit` ya bloquea la mezcla de dueños en un commit, y
`core.hooksPath` está apuntando ahí. Se le añaden **dos reglas, y las dos nacen
de un incidente real de esta semana**:

**Regla A — un `.sh` con retornos de carro.** Mató el job de respaldo el 19-08
(`$'\r': command not found`, §33.1).

```sh
# Se mira el archivo EN DISCO, no el que va al commit. El repositorio nunca
# estuvo mal: `.gitattributes` normaliza a LF al indexar, así que el blob
# staged sale limpio. Lo que `gcloud builds submit` sube es el ÁRBOL DE
# TRABAJO — y ahí es donde Git en Windows dejó el CRLF.
for f in $(git diff --cached --name-only --diff-filter=ACM -- '*.sh'); do
  [ -f "$f" ] || continue
  if grep -q "$(printf '\r')" "$f"; then
    echo "BLOQUEADO: $f tiene retornos de carro (CRLF) en el árbol de trabajo."
    echo "  Arréglalo con:  sed -i 's/\r$//' $f && git add $f"
    exit 1
  fi
done
```

**Regla B — credenciales o volcados sueltos.** El 18-08 aparecieron en la raíz
un `dump.sql` de producción y un `new_db_url.txt` con la cadena de conexión.
`.gitignore` los tapa, pero **`git add -f` se lo salta sin decir nada.**

```sh
# Por nombre: lo que .gitignore ya cubre, pero que un `git add -f` colaría.
for f in $(git diff --cached --name-only --diff-filter=ACM); do
  case "$f" in
    apps/api/prisma/migrations/*) continue ;;
    *.example) continue ;;
    *.dump|*.sql|*db_url*|.env|.env.*)
      echo "BLOQUEADO: $f no debería viajar en un commit."
      exit 1 ;;
  esac
done

# Por contenido: una cadena de conexión con contraseña de verdad, una clave
# privada, una clave de API. Patrones estrechos a propósito.
patron='(postgres(ql)?|rediss?)://[^:@/ ]+:[^@ ]{6,}@'
patron="$patron"'|-----BEGIN [A-Z ]*PRIVATE KEY-----'
patron="$patron"'|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}'
for f in $(git diff --cached --name-only --diff-filter=ACM); do
  case "$f" in *.example) continue ;; esac
  if git show ":$f" | grep -qE "$patron"; then
    echo "BLOQUEADO: $f parece llevar una credencial dentro."
    exit 1
  fi
done
```

**Dos cosas que hay que aceptar al aprobar esto**, o no vale la pena ponerlo:

1. **Si sale un falso positivo, se afina el patrón — no se usa `--no-verify`.**
   Un gancho que se salta una vez se salta siempre, y a partir de ahí es
   decoración.
2. **El gancho solo protege al clon que lo tenga configurado.** Por eso va
   acompañado de **1'**: las mismas dos comprobaciones como un paso de `ci.yml`,
   sobre el árbol completo. El gancho es rápido y evitable; CI es lento e
   inevitable. Se necesitan los dos, y no es redundancia: son dos alcances
   distintos.

### 36.4 Capa 2 — El vigilante: es el objetivo 1 de la Fase 5

Hoy, si el respaldo de las 03:30 revienta, **no lo ve nadie**. La alerta de
Capa 2 de la Fase 4 vigila la ausencia de push de Pub/Sub, que es otra cosa.

Son **dos políticas, y la segunda es la que importa**:

| | Qué vigila | Por qué |
|---|---|---|
| **A. Fallo** | Ejecuciones fallidas del job `pmo-respaldo-db` | La fácil. El 19-08 hubo tres seguidas entre 22:12 y 22:54, y se supieron porque había alguien delante |
| **B. Ausencia** | Que **no haya** ejecución correcta en 26 h | 🔴 La que de verdad hace falta. **El silencio de un respaldo que no corrió es idéntico al de uno que salió bien.** Cubre el cron desactivado, el job borrado y el que ni llegó a arrancar |

Dos condiciones para darla por hecha, y las dos son lección ya pagada:

- **La política va como archivo en `infra/alertas/`**, aplicada con
  `gcloud ... policies create --policy-from-file`. La Fase 4 sacó el job de
  respaldo de la consola por este mismo motivo: lo que vive en un panel se
  pierde, y nadie sabe que existía.
- **No se firma hasta que suene en fuego real.** Se provoca un fallo del job a
  propósito y se ve llegar el mensaje. Exactamente como se firmó la Capa 1 de la
  Fase 4 — que sonó sola y se verificó por `request_id`.

### 36.5 Capa 3 — El repaso, y lo único que encuentra los archivos muertos

**A mí se me despierta, no se me programa.** Un barrido diario gasta todos los
días para encontrar algo una vez por semana. Dos disparadores bastan: **después
de un empujón grande**, y **antes de cerrar cualquier fase**.

Y una casilla recurrente que pido que entre en `TASKS.md`, porque no es un extra:

> **Repetir el simulacro de restauración una vez al mes y después de cada
> migración de esquema.**

Es lo único que encuentra un volcado que pasa su propia verificación y no sirve.
Ninguna de las otras dos capas puede verlo.

### 36.6 Quién impulsa cada cosa

| Capa | Quién la hace | Quién la aprueba | Cuándo |
|---|---|---|---|
| **1 · Portero** (gancho + espejo en CI) | **Claude Code** — es configuración estática, su dominio en `AI_ROLES.md` | Doc | **Al cerrar la Fase 5** |
| **2 · Vigilante** (las dos políticas) | **Gravity** — operador DevOps, afinidad con GCP. El Jefe ejecuta lo que necesite consola | Doc reparte · **la firma un fallo provocado**, no un informe | **Ya: es la Fase 5** |
| **3 · Repaso** | **Alana**, despertada por el Jefe | — | Continuo |
| **3b · Simulacro mensual** | Quien lleve infraestructura | Doc lo escribe en `TASKS.md` | Mensual, y tras cada migración |

### 36.7 Qué habría atrapado cada capa, del registro real

No es teoría: todo esto ya pasó.

| Lo que pasó | Quién lo habría atrapado |
|---|---|
| `respaldo.sh` con CRLF tumbando el job (19-08) | **1** — en el commit, no en la tercera ejecución fallida |
| `dump.sql` y `new_db_url.txt` en la raíz (18-08) | **1** |
| `ALANA.md` de polizón, tres veces | **1** — ya lo hace |
| Tres ejecuciones fallidas del respaldo, 22:12–22:54 (19-08) | **2** |
| Respaldos de Cloud SQL configurados y **apagados** (§31.2) | **3** |
| El webhook con el texto de relleno dentro del secreto (§30) | **3** |
| El `vercel.json` de hoy, puesto donde quizá no se lee (§35.7) | **3** |

### 36.8 Y lo que ninguna capa atrapa

**Los cuatro volcados irrecuperables.** Ni el portero, ni el vigilante, ni yo
leyendo el diff. Los cuatro tenían el índice legible, el job salía en verde y la
comprobación pasaba. **Lo encontró una sola cosa: alguien intentando usarlos.**

Por eso el simulacro mensual de §36.5 no es el apéndice de esta propuesta: es la
única parte que cubre el fallo que más cerca estuvo de costar la base de datos.
Las tres capas hacen que no vuelvan los errores que ya conocemos. El simulacro
es lo que encuentra el que todavía no conocemos.

**Un respaldo no se audita: se restaura.**

### 36.9 Corrección: la capa 2 se entregó mientras yo la proponía

Publiqué §36 a las 12:5x. **La capa 2 estaba hecha desde las 12:36**, por la
terminal de backend con aprobación de Doc, en `2ee6d2e`, `7296ace`, `285e3a2` y
`ad1fe4c`. Mi propuesta llegó tarde a su propio apartado 36.4.

Comprobado por mí en `infra/alert_policy_respaldo.json`, no en el reporte:

| Lo que pedía §36.4 | Lo que hay |
|---|---|
| Política de **fallo** | ✅ `completed_execution_count` con `result="failed"`, umbral 0, `duration 0s` |
| Política de **ausencia** | ✅ `conditionAbsent` sobre `result="succeeded"`, `duration 50400s` (14 h) |
| **Como archivo**, no clics en consola | ✅ Las dos en el repositorio, `combiner: OR`, canal asignado |
| **Que suene en fuego real** | ⬜ **Abierto** — y lo declaran ellos mismos en el commit: *«nadie ha visto sonar la política todavía»* |

**Y mi número estaba mal.** Pedí ausencia a **26 h**, y no cabe: Cloud
Monitoring topa la ventana en **23 h 30 m**, así que con una ejecución diaria
cualquier ventana admisible se agota antes de la siguiente y la alerta sonaría
todos los días. La solución no fue ajustar el número —fue **doblar la cadencia**
a `30 3,15 * * *`, que deja 12 h entre volcados y hace que 14 h sea una
ejecución perdida más 2 h de margen. Yo propuse un umbral sin comprobar que la
herramienta lo aceptara. Es el error de la casa, en pequeño: **deducir un
parámetro en vez de probarlo**, igual que la versión del cliente de Postgres.

**Y encontraron algo que yo no vi.** El aviso ya existía *dentro* de
`respaldo.sh` el 19-08, y aun así los 42 minutos pasaron en silencio: los
retornos de carro mataron a bash en la primera línea, cuando la función `avisar`
todavía no existía. **Un vigilante que vive dentro de lo vigilado comparte su
suerte.** Esa frase es el argumento de la capa 2 mejor dicho de lo que yo lo
dije, y explica por qué la política tiene que estar fuera y no ser un `curl` al
final del script.

**Qué queda en pie de §36, entonces:**

- **Capa 2** — hecha, salvo la firma. Lo único pendiente es **provocar un fallo
  y ver llegar el mensaje**, que es la condición que puse y sigue valiendo: la
  Capa 1 de la Fase 4 se firmó porque sonó sola, no porque estuviera escrita.
- **Capa 1 (portero + espejo en CI)** — sin tocar. Sigue siendo para Claude Code
  al cerrar la Fase 5. Y la regla A gana peso: el CRLF no solo tumbó el respaldo,
  **también desactivó el aviso que debía contarlo**.
- **Capa 3 y el simulacro mensual** — sin tocar.

**Lo que esto enseña, y va sin ironía:** he tardado media hora en escribir una
propuesta y en ese rato el trabajo ya se había hecho. No es un problema de
velocidad ajena, es mío: **empecé a escribir con el estado que había leído al
principio y no volví a mirarlo antes de publicar** — exactamente lo que §35.1
dice que pasa, *un estado verificado caduca en cuanto alguien actúa sobre él*, y
lo escribí yo hace dos horas. Antes de publicar cualquier cosa que describa el
estado del sistema, `git log` otra vez. Cuesta dos segundos.

---

## 37. Auditoría completa del código (2026-08-21)

Barrido de todo el árbol: `apps/api` (19 434 líneas), `apps/web` (4 815),
`packages/shared`, `infra/`, los dos workflows y los Dockerfiles. Sobre `master`
en `d5d2d45`, árbol limpio.

**Lo que comprobé ejecutando, no leyendo:** `npm run lint` limpio en los tres
paquetes · **614 pruebas en 30 suites, todas en verde** (45 s) · sin secretos en
el árbol (patrones de cadena de conexión, clave privada y claves de API) · sin
`as any`, sin `@ts-ignore`, sin un solo `catch {}` vacío · los dos `.sh` en LF ·
`.env.example` cubre las cuatro variables que el arranque exige con `getOrThrow`.

**Lo que NO comprobé, y hay que decirlo:** nada vivo en Google Cloud, ni la
aplicación en el navegador, ni carga. Esto es lectura de código y ejecución
local. Todo lo que digo de producción es inferencia sobre la configuración
escrita, y va marcado como tal.

**El código está muy por encima de la media.** Las sondas separadas, el cifrado
de tokens, el alertador que nunca lanza, el Dockerfile de tres etapas, el freno
de alertas con `SET NX EX`, la separación entre lo que el modelo propone y lo
que ejecuta una persona: eso está bien pensado y bien escrito. Lo que sigue son
**19 hallazgos**, y los tres primeros son de los que se pagan con datos.

---

### 37.1 🔴 El marcador de Gmail avanza aunque el correo no se haya guardado

`gmail.service.ts:236-240` y `persistEmails` (`:325-361`).

```ts
const processed = await this.persistEmails(userId, emails);
const newHistoryId = notifiedHistoryId ?? latestHistoryId ?? startHistoryId;
await this.saveHistoryId(userId, newHistoryId);   // ← pase lo que pase
```

`persistEmails` **se traga los fallos correo a correo**: `catch` → `logger.warn`
→ sigue con el siguiente. Y el marcador se guarda después, sin mirar si algo
falló.

**Un correo que falle al guardarse no se vuelve a ver nunca.** La siguiente
sincronización arranca desde el marcador nuevo y `users.history.list` ya no lo
menciona: no está en la base y no volverá a estarlo. No hay error, no hay 500,
no hay reintento — hay una línea `warn` en Cloud Logging que nadie lee.

**Y hay un caso peor dentro del mismo `try`:**

```ts
const upsertedEmail = await this.prisma.email.upsert({ ... });
await this.classifyQueue.add('classify', { emailId: upsertedEmail.id });  // ← Redis
```

Si **Redis está caído o rechaza**, el correo ya está guardado y el `add` lanza:
el `catch` se lo traga, `processedCount` no se incrementa, y ese correo queda en
la base **sin clasificar para siempre**. Nada lo reintenta: no existe ningún
barrido de «correos guardados sin procesar». El síntoma para el usuario es un
correo que aparece en la bandeja y del que nunca sale una tarea.

**El arreglo tiene dos mitades y las dos son pequeñas:** que el marcador avance
solo si no hubo fallos —o solo hasta el último correo que sí se guardó—, y sacar
el `add` de la cola del `try` del upsert, porque **son dos fallos distintos con
consecuencias distintas** y ahora comparten el mismo `catch`.

### 37.2 🔴 La cola de clasificación se encola sin opciones

`gmail.service.ts:355`:

```ts
await this.classifyQueue.add('classify', { emailId: upsertedEmail.id });
```

Sin `attempts`, sin `backoff`, sin `removeOnComplete`, sin `removeOnFail`. Y
`BullModule.forRootAsync` (`app.module.ts:81`) **no declara `defaultJobOptions`**:
solo la conexión. Así que valen los valores de fábrica de BullMQ, y son dos:

**a) `attempts` por defecto es 1: no hay reintento.** Y el worker está escrito
como si lo hubiera — `ai.processor.ts:106`:

```ts
throw error; // Para que BullMQ lo reintente si hay redelivery configurado
```

No lo hay. Un fallo transitorio —un corte de red hacia Anthropic que no sea un
429— manda el correo directo a fallidos y a la DLQ en el primer intento. **El
comentario describe una red de seguridad que nadie tendió.** Y la comparación lo
delata: sus dos vecinas sí las ponen (`gmail.controller.ts:223` con
`attempts: 3`, `auth.controller.ts:114` igual), así que esto es un olvido, no
una decisión.

**b) `removeOnComplete` por defecto es `false`: los trabajos completados se
quedan en Redis para siempre.** Cada correo clasificado deja un registro
permanente. Sus vecinas también lo ponen (`removeOnComplete: 100` en el webhook,
`true` en el login) y esta no. En un Upstash con cuota —y con la historia de
consumo que arrastra este proyecto, §32.2— es crecimiento sin techo en el sitio
donde ya duele.

### 37.3 🔴 Bucle de paginación sin tope contra Gmail

`gmail.service.ts:266-284`, `collectHistory`:

```ts
do {
  const res = await gmail.users.history.list({ ..., maxResults: 500, pageToken });
  ...
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);
```

**No hay límite de páginas ni de tiempo.** Es el único bucle verdaderamente
abierto del backend —los otros tres que hay terminan solos, los revisé uno a
uno—. Tras una caída larga, con muchos correos acumulados desde el
`startHistoryId`, esto encadena llamadas hasta que Gmail deje de paginar.

Y el bucle no se rompe solo: lo rompe **Cloud Run cortando la petición**, y
entonces Pub/Sub reintenta el push, que vuelve a empezar **desde el mismo
marcador** —porque el marcador solo avanza al final—. Un bucle de reintentos que
no converge, con la DLQ como único final.

La red de seguridad que sí existe cubre otro caso: si el `historyId` caducó,
Google responde 404 y se cae a `backfill`, que está acotado. Pero eso es para el
marcador viejo, no para el volumen. **Un tope de páginas —20, por decir un
número— con caída a `backfill` al superarlo cierra el hueco entero.**

---

### 37.4 🟠 El límite «por IP» no es por IP

`throttle.config.ts` se titula *«Límite de peticiones por IP»* y `main.ts`
**no llama a `app.set('trust proxy', ...)`** en ninguna línea. Lo busqué en todo
el backend: no está.

`ThrottlerGuard` identifica al cliente por `req.ips[0] ?? req.ip`, y `req.ips`
**solo se rellena si Express confía en el proxy**. En Cloud Run, detrás del
frontend de Google, sin esa bandera `req.ip` es la dirección del proxy: **la
misma para todo el mundo**. Todo el tráfico comparte un único cubo.

Con N=1 no se nota. Lo que cambia es qué protege: el cubo estrecho de
autenticación —10 por minuto— también es global, así que **cualquiera que pruebe
contra `/auth` deja al usuario legítimo fuera**. Se arregla con una línea, y hay
que ponerla con cuidado (`trust proxy` mal configurado permite falsear la IP con
una cabecera).

### 37.5 🟠 Cloud Run corta a los 5 minutos; el copiloto se concede 10

`anthropic.strategy.ts:37`:

```ts
const TIMEOUT_MS = 10 * 60_000;   // 10 minutos
```

Y el `gcloud run deploy` de `deploy.yml:610-620` **no pasa `--timeout`**, así
que rige el valor por defecto de Cloud Run: **300 segundos**. Un turno largo
—hasta cuatro vueltas con herramientas entre medias, que es lo que `MAX_VUELTAS`
permite— lo corta la plataforma a los 5 minutos mientras el backend cree que le
quedan otros 5. El usuario ve el stream morir sin evento `error`, porque el
corte ocurre por debajo del código.

Los dos números tienen que decir lo mismo. Da igual cuál se mueva; hoy se
contradicen.

### 37.6 🟠 Sin `--max-instances`, y el comentario dice que sí lo hay

El mismo bloque de `deploy.yml` explica el coste de `--no-cpu-throttling` con
esta frase: *«Con `maxScale=20` y escalado a cero el gasto sigue siendo
pequeño»*. **`maxScale` no está en el comando.** Ni `--max-instances`, ni
`--concurrency`, ni `--cpu`, ni `--memory`. Rige el defecto: **100 instancias**.

Es exactamente el fallo contra el que ese mismo archivo advierte dos párrafos más
arriba —una configuración que se da por puesta y vive en otro sitio—, cometido
en el comentario que lo advierte.

Y se junta con lo siguiente: **Prisma no lleva `connection_limit`** en la cadena
de conexión, así que cada instancia abre su pool por defecto. Cien instancias
por un pool de cinco son quinientas conexiones contra un Cloud SQL que no las
admite. Hoy es teórico —hay un usuario—, pero el que lo dispararía es un bucle
de reintentos, y de esos ya hemos tenido.

### 37.7 🟠 Escalar a cero apaga los workers, y nadie los despierta

`--no-cpu-throttling` mantiene la CPU **mientras la instancia viva**, y el
comentario lo explica bien. Lo que no cubre es que Cloud Run **apaga la
instancia** tras un rato sin peticiones.

Los workers de BullMQ trabajan fuera del ciclo HTTP. Si la última instancia se
apaga con trabajos pendientes, **nadie los toma hasta que llegue otra
petición**. Y con `stalledInterval: 600_000` (10 min, subido a propósito para
ahorrar comandos de Upstash, §32), la reclamación tampoco ocurre: reclamar
requiere un worker vivo.

Hoy lo tapa la casualidad de que el disparador es un push HTTP —llega un correo,
despierta el contenedor, y de paso se procesa la cola—. Pero un trabajo que se
quede atrás **espera al siguiente correo**, no a un temporizador. Si el trabajo
atrasado *es* el de un correo, puede esperar horas.

### 37.8 🟠 El socket reconecta para siempre y la sesión no se refresca

`tasks.gateway.ts:88-110` autentica el socket **una sola vez, en el handshake**,
con el token de acceso — que dura **15 minutos** (`auth.constants.ts:24`). El
socket no se vuelve a autenticar mientras siga abierto.

El problema aparece en la reconexión. `useSocket.ts:93` crea el socket con las
opciones por defecto de socket.io, y por defecto **`reconnectionAttempts` es
infinito** con un tope de 5 s entre intentos. Si la conexión se cae después de
que el token de acceso haya expirado —una pestaña abierta toda la noche, un
cambio de red—, el backend rechaza el handshake, socket.io reintenta, el backend
vuelve a rechazar, **y así indefinidamente**: un intento cada 5 s, unos 17 000 al
día, cada uno despertando Cloud Run.

Y no hay manejador de `connect_error` en todo el frontend. **El tablero deja de
actualizarse en vivo y no se lo dice a nadie**: las tarjetas siguen ahí, viejas,
con aspecto de estar bien. Es la forma de fallo de esta casa, otra vez.

Lo que lo cierra: un `connect_error` que llame a `/auth/refresh` y reconecte, y
un tope de reintentos con aviso visible al usuario.

---

### 37.9 🟡 El buscador del tablero lanza una petición por tecla

`KanbanBoard.tsx:374` → `setSearchFilter(e.target.value)` en cada `onChange`.
`searchFilter` es dependencia de `loadTasks` (`:45,79`), que es dependencia del
`useEffect` (`:83`). Sin `debounce` y sin cancelación.

Escribir «reunión» son **siete peticiones `GET /tasks`**, y como `loadTasks`
empieza con `setLoading(true)`, el tablero entero **parpadea a «Cargando
tablero…» en cada letra**. Además, sin cancelación, dos respuestas pueden llegar
desordenadas y dejar en pantalla el resultado de una búsqueda anterior.

### 37.10 🟡 Mover una tarjeta no se deshace si falla

`KanbanBoard.tsx:246-264`:

```ts
moveTask(activeId, finalTask.status, positionInColumn)
  .then((response) => { /* reconcilia */ })
  .catch((err) => console.error("Error guardando el movimiento de tarea en BD:", err));
```

Un `console.error` y nada más. **La tarjeta se queda movida en pantalla y el
servidor no se enteró**: al recargar vuelve a su sitio, sin que nadie haya dicho
que el movimiento no se guardó.

Lo que lo convierte en hallazgo y no en opinión es que **el mismo archivo lo hace
bien 60 líneas más abajo**: `handleDeleteTask` (`:317-329`) guarda la tarea,
revierte si falla y avisa con un `toast`. Dos caminos optimistas en el mismo
componente, uno con red y otro sin ella.

### 37.11 🟡 Cambiar de pestaña en la bandeja puede dejar la lista anterior

`useInbox.ts:52-71`. `load` no cancela la petición en vuelo y el efecto se
redispara al cambiar `activeStatus`. Dos peticiones vivas, la vieja resuelve
después, `setEmails(data)` pisa a la nueva: **se ven los correos de la pestaña
que ya no está seleccionada**. Un `AbortController` o un contador de generación
lo cierra.

### 37.12 🟡 El 401 se detecta leyendo el texto del error

`useInbox.ts:65`:

```ts
err instanceof Error && err.message.includes("401")
```

Y `ApiError` **tiene un campo `status`** (`lib/api.ts:12`). Buscar «401» dentro
de un mensaje que se construye como `` `${método} ${ruta} → ${status}` `` acierta
hoy y falla el día que una ruta lleve 401 en el texto. El dato correcto está a
mano.

### 37.13 🟡 `apiFetch` refresca sin cerrojo

`lib/api.ts:29-37`. Si cinco peticiones reciben 401 a la vez, se disparan cinco
`/auth/refresh` simultáneos. **Hoy no rompe nada** —los JWT no se rotan ni se
invalidan, así que los cinco tienen éxito—, pero el cubo de autenticación son 10
por minuto (§37.4, y global), así que dos rachas seguidas rozan el límite. El día
que se rote el refresh, esto se convierte en cierres de sesión aleatorios.

### 37.14 🟡 La URL de producción está escrita a mano en dos archivos

`lib/api.ts:8` y `useSocket.ts:91` llevan ambos
`https://pmo-api-mlpuuasqka-uc.a.run.app` como valor de reserva. Es un hecho de
infraestructura duplicado en dos sitios del código: el día que cambie el
servicio, el frontend se queda hablando solo, y hay que acordarse de los dos.

### 37.15 🟡 Consultas sin tope

`time.service`, `tags.service`, `copilot-audit.service` y `overdue.service` hacen
`findMany` sin `take`. `GET /tasks` sí pagina y el copiloto también, así que esto
está acotado por costumbre y no por regla. Con N=1 no importa; el barrido de
vencidas es el que primero lo notaría, porque mete todo lo leído en **una sola
transacción con plazo de 15 s** (`prisma.service.ts:36`).

### 37.16 🟡 Rotar `TOKEN_ENCRYPTION_KEY` apaga Gmail sin decir por qué

`crypto.service.ts:68`, `decryptJson`, no captura: si la clave cambia, los tokens
guardados dejan de descifrarse y cualquier operación de Gmail muere con un 500
opaco. No hay camino de «vuelve a autorizar». No es un error de hoy: es una
trampa de operación que conviene tener escrita antes de tocar esa variable.

---

### 37.17 🔵 Deriva de documentación: cinco sitios que describen un mundo anterior

Es el patrón de la casa y por eso va como bloque, no como notas sueltas:

| Dónde | Qué dice | Qué es |
|---|---|---|
| `prisma.service.ts:5-25` | Los plazos suben por *«los arranques en frío de **Neon**»* | La base es Cloud SQL desde el 18-08. Los números siguen siendo razonables; **el motivo ya no existe**, y es el motivo lo que se lee al decidir si tocarlos |
| `infra/backup/respaldo.sh:9` | *«de Secret Manager al contenedor y de ahí a **Neon**»* | Igual |
| `useInbox.ts:38` | *«Carga la bandeja desde `GET /gmail/inbox`»* | El código llama a `/emails` (`:59`) |
| `deploy.yml:606` | *«Con `maxScale=20`…»* | No está en el comando (§37.6) |
| `app.module.ts:28` | `// import { AiModule }` comentado | Está importado de verdad tres líneas arriba |

### 37.18 🔵 Mezcla de idioma en los mensajes de consola

La base es deliberadamente española —comentarios, identificadores, mensajes de
error al usuario—, y quedan cinco mensajes de consola en inglés:
`'Error fetching copilot providers'`, `'Failed to parse SSE data'`,
`'Error creating tag'`, `'Error fetching tags'`, `console.error(e)` a secas en
`EmailDetailModal.tsx:26`. Cosmético, pero es donde se mira cuando algo falla.

### 37.19 🔵 Los scripts no llevan el bit de ejecución

`infra/backup/respaldo.sh` y `restaurar.sh` están en el índice como `100644`. Hoy
da igual porque el `Dockerfile` hace `chmod`, pero el día que alguien los
ejecute desde el árbol o simplifique esa línea, dejan de arrancar. Un
`git update-index --chmod=+x` y deja de ser una dependencia oculta.

---

### 37.20 Lo que quedó bien cerrado desde ayer

Comprobado, porque también forma parte del barrido:

- **El ARIA anidado del Inbox está arreglado**, y arreglado bien:
  `InboxPage.tsx:284` lleva ahora `{...(!interactive ? { role: "button", tabIndex: 0 } : {})}`,
  que es lo que conserva el acceso por teclado en el caso sin `onToggle`.
- **`mockTasks.ts` ya no existe** y no queda ni una referencia.
- **`vercel.json` usa `$VERCEL_GIT_PREVIOUS_SHA..$VERCEL_GIT_COMMIT_SHA`**, que
  cierra el hueco de `HEAD^ HEAD` que señalé: ya mira el empujón y no el último
  commit. ⚠️ **Pero volvió a la raíz del repositorio**, así que la pregunta de
  §35.7 sigue viva y sin comprobar: si el *Root Directory* del proyecto en Vercel
  es `apps/web`, ese archivo no se lee. Una mirada al panel lo resuelve.

### 37.21 Lo que enseña este barrido

Los tres hallazgos rojos son **la misma forma de fallo**, y es la de toda la
Fase 4: **algo que sale en verde mientras pierde trabajo por detrás.** El
marcador que avanza sobre un correo que no se guardó, la cola que no reintenta
aunque el comentario diga que sí, el bucle que solo termina cuando lo corta la
plataforma. Ninguno lanza, ninguno tiene 500, ninguno enciende una alerta.

Y lo que más me interesa: **dos de ellos están documentados al revés.**
`ai.processor.ts` explica un reintento que no existe, y `deploy.yml` justifica un
coste con un `maxScale` que no fija. En un repositorio donde los comentarios son
tan buenos, **un comentario equivocado es más peligroso que ninguno**, porque el
siguiente que llegue no va a ir a comprobarlo — va a leerlo y a creerlo.

Un respaldo no se audita, se restaura. Un comentario tampoco se audita: se
comprueba contra lo que hace el código.

---

## 38. Reverificación de los 19 hallazgos (2026-08-21)

Doce commits después de §37. **Comprobado en el código, archivo por archivo, no
en los mensajes de commit** — que es la regla de la casa y hoy tocaba
aplicármela a mí, porque el informe era mío y la tentación de darlo por hecho es
mayor.

**Estado de la suite tras los arreglos:** `lint` limpio en los tres paquetes ·
**621 pruebas en 30 suites, todas en verde** (eran 614; el arreglo de Gmail trajo
**199 líneas de pruebas nuevas**, que es lo que hace creíble el resto).

### 38.1 Los nueve cerrados, con la línea que lo demuestra

| § | Qué era | Comprobado |
|---|---|---|
| **37.1** 🔴 | El marcador de Gmail avanzaba sobre correos no guardados | `gmail.service.ts:336-343`: `quedaPendiente` retiene el marcador, `PersistResult` separa `guardados`/`encolados`/`fallidos`/`sinEncolar`, y el `add` a Redis salió del `try` del `upsert` (`:551-560`). **Y avisa** por `AlertService` cuando se atasca |
| **37.2** 🔴 | Cola sin `attempts` ni `removeOnComplete` | `app.module.ts:107-120`: `defaultJobOptions` con `attempts: 3`, `backoff` exponencial, `removeOnComplete: {count: 1_000, age: 24 h}` y `removeOnFail: {count: 5_000, age: 7 d}`. **Y el comentario que prometía el reintento inexistente ya no está** (`ai.processor.ts:113`) |
| **37.3** 🔴 | Paginación de Gmail sin tope | `MAX_PAGINAS_HISTORIAL = 20` (`:94`), bandera `truncado`, caída a `backfill` y aviso |
| **37.9** 🟡 | Una petición por tecla | `KanbanBoard.tsx:48-53`: `debounce` de 300 ms sobre `searchInput`, **más** `reqIdRef` contra respuestas desordenadas **y** `hasLoadedRef` para que el tablero no vuelva a parpadear. Las tres cosas, no solo el `debounce` |
| **37.10** 🟡 | Mover sin revertir | `:263` captura `previousTasks`, `:283-287` revierte y avisa con `toast` |
| **37.11** 🟡 | Carrera al cambiar de pestaña | `useInbox.ts:50-72`, mismo contador de generación |
| **37.12** 🟡 | 401 detectado por texto | `useInbox.ts:66`: `err instanceof ApiError && err.status === 401` |
| **37.13** 🟡 | Refresco sin cerrojo | `api.ts:26-42`: una sola promesa en vuelo, limpiada en `finally`. Revisado el caso que suele romperse —una promesa fallida cacheada para siempre— y **no ocurre**: se limpia igual |
| **37.14** 🟡 | La URL de producción duplicada | `api.ts:8` exporta `PROD_API_URL` y `useSocket.ts:5` la importa |

Los seis de frontend con **un commit por hallazgo**, que es lo que permite
revisarlos de uno en uno.

### 38.2 Uno contestado con un dato, y me deja a mí corregida

**§37.20 — el `vercel.json` de la raíz.** Yo dejé viva la sospecha de que si el
*Root Directory* del proyecto era `apps/web`, ese archivo no se leería. **Doc
entró al panel: es `./`.** El archivo se lee, y hay prueba de que funciona —el
despliegue `e031dee` salió `Canceled by Ignored Build Step`.

Mi §37.20 se escribió sin ese dato y la sospecha era razonable, pero la lección
es la de siempre y vale igual cuando me toca a mí: **la pregunta se cerró
mirando, no razonando.**

### 38.3 Uno decidido y todavía sin hacer

**§37.7 — escalar a cero apaga los workers.** Decidido con el Jefe y escrito en
`DOC.md`: ni `--min-instances=1` (15–25 USD al mes fijos) ni un ping —que con
`--no-cpu-throttling` cuesta casi lo mismo sin dar la garantía— sino **un barrido
de reconciliación en Cloud Scheduler cada 15 minutos**.

Es mejor solución que la que yo insinuaba, y por un motivo que no está en mi
informe: **el barrido despierta el contenedor *y además* recoge los correos
guardados sin encolar de §37.1**, que es el hueco que ni `min-instances` ni un
ping ven nunca, porque ahí el trabajo **nunca llegó a existir en la cola**.

Iba secuenciado después del Encargo A. **El Encargo A ya está hecho** (`337340e`,
`3e43af5`), así que esto es lo siguiente y ya no está bloqueado.

### 38.4 Los nueve que siguen abiertos, comprobados hoy

| § | Estado | Repartido |
|---|---|---|
| **37.4** 🟠 `trust proxy` | Sigue sin estar: lo busqué en todo el backend y no aparece | Sí — Encargo C, aparte a propósito |
| **37.5** 🟠 `--timeout` vs 10 min del copiloto | `TIMEOUT_MS` sigue en `10 * 60_000` y `deploy.yml` sigue sin `--timeout` | Sí — Encargo B |
| **37.6** 🟠 `--max-instances` + `connection_limit` | Ninguno de los dos | Sí — Encargo B |
| **37.8** 🟠 Socket: reconexión infinita sin refresco | Ni `connect_error` ni `reconnectionAttempts` en `useSocket.ts` | **No** — partido entre dominios, lo coordina Doc |
| **37.15** 🟡 `findMany` sin `take` | Igual que ayer: `time`, `tags`, `copilot-audit`, `overdue`, `gmail` | No |
| **37.16** 🟡 `decryptJson` sin captura | `crypto.service.ts:67-69` intacto | No |
| **37.17** 🔵 Cinco derivas de documentación | **Las cinco siguen** (ver abajo) | No |
| **37.18** 🔵 Mensajes en inglés | Siguen, y **son seis, no cinco**: se me pasaron los dos de `copilot.api.ts:12,26` | No |
| **37.19** 🔵 Scripts sin bit de ejecución | Siguen en `100644` | No |

### 38.5 Y lo que me parece que hay que decir de este reparto

**Los cinco puntos de §37.17 siguen exactamente donde estaban.** `prisma.service.ts`
y `respaldo.sh` siguen explicándose por los arranques en frío de **Neon**;
`useInbox.ts:38` sigue diciendo que carga de `GET /gmail/inbox` cuando llama a
`/emails`; el import comentado de `AiModule` sigue debajo del import real; y
**`deploy.yml:606` sigue justificando el coste «con `maxScale=20`»**.

Ese último es el que más me chirría, porque **el Encargo B va a abrir ese mismo
archivo para poner `--max-instances`**. Quien lo haga va a leer, tres líneas
arriba, un comentario que afirma que el tope ya está puesto.

Y es justo el hallazgo cuyo argumento era: *en un repositorio donde los
comentarios son tan buenos, un comentario equivocado es peor que ninguno, porque
el siguiente no va a comprobarlo — va a creerlo.* Se repartieron los tres rojos
y los seis amarillos, que es el orden correcto; lo que quedó sin dueño es lo
único que cuesta cinco minutos y protege al que venga después.

No es una queja del reparto: **es que los arreglos de documentación no compiten
por prioridad con los de código, compiten por acordarse.** Van bien pegados al
commit que toca ese archivo, y el Encargo B toca cuatro de los cinco sitios.

### 38.6 El saldo

**Nueve de diecinueve cerrados en un día, incluidos los tres rojos**, con
pruebas nuevas que los sostienen y sin romper nada: de 614 a 621 en verde.

Los tres rojos eran los que perdían datos, y son los que están hechos. Lo que
queda abierto no pierde nada: son topes de configuración, una reconexión que
gasta, y comentarios que mienten.

Y la parte que no me esperaba: **§37.1 se arregló mejor de lo que yo lo
describí.** Yo pedí separar el `catch` y no avanzar el marcador. Lo que hay
además **avisa cuando se atasca**, y documenta dentro del código el precio de
esa decisión —que un correo que falle siempre repite el tramo, y que los
`historyId` caducan a la semana—. Atascarse y gritar es mejor que avanzar y
perder, **pero solo si alguien se entera**, y eso lo añadieron ellos.

---

## 39. Escaneo de arranque: el agujero tenía 27 correos dentro (2026-08-21)

Cuatro commits desde §38. Árbol limpio, `master` a la par de `origin`, nadie con
trabajo a medias. Comprobado en el código, no en los mensajes.

### 39.1 Lo que confirma la auditoría entera

**§37.1 no era teórico: había 27.** La primera ejecución del barrido de
reconciliación —forzada para comprobar la audiencia OIDC— devolvió 200 y
**27 reencolados de 27 candidatos**. Veintisiete correos llevaban guardados en la
base **sin trabajo asociado en la cola**, y uno de ellos traía dentro una tarea
que nunca llegó al tablero.

Es la frase «pierde correos en silencio» **medida**. Y es el argumento entero de
por qué el barrido gana al ping y a `min-instances`: esos veintisiete no estaban
atascados ni fallidos. **Su trabajo nunca existió.** No había nada que
reintentar, así que ningún worker vivo, por despierto que estuviera, los habría
recogido jamás.

### 39.2 Cerrados desde §38

| § | Comprobado |
|---|---|
| **37.5** | `deploy.yml:659` pasa `--timeout=900s`, y `anthropic.strategy.ts:64` baja `TIMEOUT_MS` a **3 min**. Los dos números por fin se ordenan, y con margen |
| **37.6** | `--max-instances=8`, `--concurrency=80`, `--cpu=1`, `--memory=512Mi`, y el `connection_limit` resuelto en `prisma.service.ts:73-90` |
| **37.7** | `/cron/reconciliar` cada 15 min, con gracia de 30 min para no pisar trabajos en vuelo. **Verificado en fuego real**, no desplegado y supuesto |
| **37.17** | El comentario del `maxScale` en `deploy.yml:606` ya dice `--max-instances=8` |

### 39.3 Y una corrección mía, que es la parte que me toca

En §37.6 escribí que, al no pasar `--max-instances`, **regía el defecto de 100
instancias**. Es falso, y el commit `5a6bf38` lo explica mejor de lo que yo lo
investigué: **el servicio vivo sí tenía `maxScale=20`**, puesto a mano en la
consola, porque `gcloud run deploy` **conserva lo que no se le nombra**.

Así que no había cien instancias posibles ni el riesgo de agotar conexiones que
yo describí con ese número. Mi conclusión —que el valor tiene que estar en el
archivo— seguía siendo la correcta, y por una razón que el propio commit dice
mejor: no estaba mal configurado, **estaba configurado en un sitio que no se
revisa y que desaparece el día que alguien recree el servicio**.

Pero el mecanismo que afirmé estaba mal. **Deduje el comportamiento de `gcloud`
en vez de comprobarlo**, que es exactamente lo que le reproché a la regla de la
versión del cliente de Postgres en §33. La ironía es que lo escribí en el mismo
informe donde denunciaba comentarios que afirman cosas sin comprobar.

### 39.4 Lo que queda, y ya son solo seis

**Doce de diecinueve cerrados**, más el `maxScale` de §37.17.

| § | Qué | Repartido |
|---|---|---|
| **37.4** 🟠 | `trust proxy`: el límite «por IP» sigue siendo un cubo global | Sí — Encargo C |
| **37.8** 🟠 | El socket reintenta cada 5 s para siempre sin refrescar sesión | Con Doc |
| **37.15** 🟡 | `findMany` sin `take` en `time`, `tags`, `copilot-audit`, `overdue`, `gmail` | No |
| **37.16** 🟡 | `decryptJson` sin captura: rotar la clave apaga Gmail con un 500 opaco | No |
| **37.17** 🔵 | Cuatro sitios: `prisma.service.ts` (×2) y `respaldo.sh` siguen explicándose por **Neon**; `useInbox.ts:38` sigue diciendo `GET /gmail/inbox`; el import comentado de `AiModule` | No |
| **37.18** 🔵 | Seis mensajes en inglés en una base en español | No |
| **37.19** 🔵 | Los dos `.sh` en `100644` | No |

Los dos naranjas tienen dueño. Los cinco de abajo siguen sin repartir desde
§38.5, y sigue valiendo lo que dije entonces: **no compiten por prioridad,
compiten por acordarse.** Cuestan una tarde entre todos.

### 39.5 Lo que enseña

Los tres rojos de §37 eran los que perdían datos, y los tres están cerrados. Uno
de ellos dejó una cifra: **27**.

Que un informe acierte no es noticia. Lo que sí lo es: **el agujero llevaba
abierto desde que existe la ingesta, la suite estaba en verde, y ninguna de las
614 pruebas lo veía** — porque probaban que el código hace lo que dice, y el
fallo era que el código decía lo que no era. Lo encontró alguien preguntando por
qué el marcador avanzaba, y lo contó alguien ejecutando el barrido.

Se mira, y luego se ejecuta. En ese orden, y las dos cosas.

---

## 40. Los cinco sin dueño, cerrados — y dos eran míos (2026-08-21)

Encargo del Jefe: cerrar los cinco hallazgos que nadie se había llevado.
**Cerrados los cinco, en cinco commits, uno por hallazgo.** Verde: `lint` limpio
en los tres paquetes, **627 pruebas en 30 suites**, y `tsc -b apps/web` sin
errores.

Pero el resultado no es el que yo anunciaba, y esa es la parte que importa:
**dos de los cinco no había que arreglarlos, porque no estaban rotos.**

### 40.1 §37.15 — la mitad de las consultas «sin tope» sí lo tenían

Lo detecté con `grep -c "take:"` por archivo. Dos errores en esa sola línea:
cuenta **por archivo y no por consulta**, y `take:` **no encuentra la forma
abreviada `take,`**, que es como está escrita en la mitad de los sitios.

Contadas de verdad, una a una: de las catorce `findMany` del backend, **once
llevan tope** —`time.findAll` (`take = 50` del DTO), `copilot-audit.list`
(`take = 50`), `tasks.findAll`, los hilos del copiloto, `search_emails`,
`listForTriage`— y tres no. Las tres que faltan **están bien así**, y ponerles un
`take` habría metido justo el fallo que llevamos un mes persiguiendo:

| Consulta | Qué pasaría con un tope |
|---|---|
| `renovarWatchDeTodos` (`gmail.service.ts:813`) | Los usuarios que quedaran fuera verían **caducar su `watch` a los 7 días** y su ingesta se apagaría sin un error. Es literalmente el fallo que esa función existe para evitar |
| Candidatas del barrido (`overdue.service.ts:70`) | Las tareas recortadas se quedan en su columna **como si no hubiera vencido nada**, y el barrido sale en verde |
| `columnOf` en el movimiento (`tasks.service.ts:287`) | Lee la columna entera para renumerar `position`: con tope quedan tarjetas con posiciones ya reasignadas |

Las tres llevan ahora escrito **por qué no llevan tope y qué las acota en su
lugar** —el `horizon`, el filtro por estado, una columna de un usuario— y qué
hacer el día que no quepan: **paginar cubriéndolas todas, que no es lo mismo que
recortar la lectura.**

Un hallazgo que, aplicado, habría creado tres agujeros nuevos.

### 40.2 §37.16 — ya estaba capturado, y con el mensaje correcto

Dije que `decryptJson` no captura y que rotar `TOKEN_ENCRYPTION_KEY` mataría
Gmail «con un 500 opaco» y sin camino de volver a autorizar.

**Lo hay, y es exactamente el que pedí.** `UsersService.getGoogleCredentials`
(`users.service.ts:56-62`) lo envuelve en un `try`, registra la causa probable
—«suele indicar que `TOKEN_ENCRYPTION_KEY` cambió: el usuario debe volver a
autorizar»— y devuelve `null`. Y `AuthService.getAuthorizedClient` convierte ese
`null` en un **401** con «debe volver a autorizar».

Leí `crypto.service.ts` y **no seguí la única llamada que tiene**. Eso es todo lo
que pasó. Queda anotado en el propio archivo quién recoge el `throw`, para que el
siguiente que lo lea —o yo dentro de un mes— no vuelva a reportarlo.

### 40.3 Los tres que sí eran reales

- **§37.17** — cuatro sitios corregidos. `prisma.service.ts` explicaba sus plazos
  por los arranques en frío de **Neon**: se conserva la historia —que es lo que
  impide volver a ponerlos a ojo— y se dice que la base es Cloud SQL y que lo
  que sigue justificándolos es el escalado a cero de Cloud Run. `respaldo.sh`
  decía que la credencial viajaba «de ahí a Neon», **tres días después de que
  Neon dejara de existir**. `useInbox.ts` decía cargar de `GET /gmail/inbox`
  cuando llama a `/emails` —y no es un matiz de nombre: una va a la API de Google
  y la otra lee la tabla ingerida, que es la única con el estado de triage por el
  que ese hook filtra—. Y `app.module.ts` tenía comentados los imports de
  `AiModule` (importado de verdad quince líneas más arriba) y de
  `TimeTrackingModule` (existe desde el Sprint 5, con otro nombre).
- **§37.18** — siete mensajes en inglés traducidos, incluido un
  `console.error(e)` pelado que no decía ni qué estaba cargando.
- **§37.19** — los dos `.sh` a `100755`. Hoy no cambia nada porque el
  `Dockerfile` hace `chmod`; el día que alguien simplifique esa línea, sí.

### 40.4 Lo que enseña, y va sin adorno

**Dos de cinco eran míos.** Los dos por la misma causa: **miré un archivo y no
seguí la llamada.** `grep -c "take:"` en vez de leer las catorce consultas;
`crypto.service.ts` en vez de su único llamador.

Y hay una simetría incómoda con §39.3, donde ya me corregí por deducir el
comportamiento de `gcloud` en lugar de comprobarlo. Van tres errores míos en tres
secciones seguidas, **todos de la misma forma**: una inferencia razonable sobre
una pieza, sin ir a ver la pieza de al lado.

Es exactamente lo que este proyecto lleva un mes aprendiendo, y resulta que a un
informe se le aplica igual que a un respaldo: **una pieza que parece rota vista
sola puede estar perfectamente conectada, y solo se sabe tirando del cable.**

Lo que salva el informe no es que acertara: es que **§37.1 tenía 27 correos
dentro**. Doce hallazgos ciertos y tres equivocados siguen siendo un buen
informe. Pero los tres equivocados habrían costado tres agujeros nuevos si
alguien los hubiera aplicado sin mirar — y por poco: el encargo fue «ciérralos»,
no «compruébalos».

**Un hallazgo tampoco se audita: se comprueba antes de arreglarlo.**

---

## 41. Mi commit de siete palabras movió 726 líneas (2026-08-21)

Doc lo detectó y me lo pasó para el registro. **Comprobado por mí, porque el
commit es mío:**

```
git show --stat 36938c9                    → 368 insertions, 368 deletions
git show --ignore-cr-at-eol --stat 36938c9 →   7 insertions,   7 deletions
```

`CopilotDrawer.tsx` sale con **726 líneas cambiadas** en un commit titulado
«siete mensajes de error en inglés». Los cambios reales del archivo son **dos**.
Las otras 724 son finales de línea: el archivo estaba en `CRLF + CR` mezclado y
mi `sed -i` lo dejó mezclado de otra forma.

### 41.1 Por qué no es estético

Tres motivos, y ninguno es de gusto:

1. **Un cambio de dos líneas escondido entre 726 no se puede revisar.** Es
   exactamente lo contrario de lo que buscaba haciendo un commit por hallazgo.
2. **Es la familia del CRLF que ya mató `respaldo.sh` el 19-08**, con `bash`
   muriendo en la línea 1 (§33.1). Ahí costó una ejecución del respaldo.
3. **Viajó dentro de un commit que nombra otra cosa**, así que el historial no
   lo cuenta. Es el patrón del polizón, en versión de bytes en vez de archivos.

### 41.2 Y lo que de verdad enseña: `.gitattributes` no lo está impidiendo

Existe desde el 19-08 y marca `*.sh text eol=lf`. **No cubre `.ts` ni `.tsx`**, y
Doc midió que **5 de los primeros 60 archivos de `apps/web` tienen finales
mezclados**. O sea: el archivo ya estaba sucio antes de que yo lo tocara, y
cualquier edición masiva sobre esos cinco va a repetir esto.

Es el mismo error de §31.2 y §30 en otra ropa: **una pieza puesta que cubre menos
de lo que se cree que cubre.** El `.gitattributes` se leyó como «los finales de
línea están resueltos» cuando lo que dice es «los de los scripts, sí».

La normalización se reparte a @Gravity; **no la hago yo** — es código, y desde
hoy encuentro y compruebo, no arreglo (§0).

### 41.3 Lo que me llevo a la rutina

Antes de commitear cualquier edición que toque más de una línea de un archivo:

```
git diff --stat
git diff --ignore-cr-at-eol --stat
```

Si los dos números no se parecen, lo que hay dentro del commit no es lo que dice
el mensaje. **Cuesta un segundo y lo caza entero.**

Y la lección de fondo, que es la de la casa otra vez: **miré el resultado del
`sed` —los siete mensajes traducidos, correctos— y no miré el diff.** Comprobé lo
que quería cambiar, no lo que cambié.

### 41.4 Y una segunda causa que ninguno teníamos (aporte de @Gravity)

`CopilotDrawer.tsx` estaba marcado como **binario en el índice de git**, por los
`\r` sueltos que llevaba dentro. Y a un archivo binario **`--renormalize` no lo
toca**.

O sea: **aunque el `.gitattributes` hubiera estado completo, ese archivo no se
habría curado.** Mi diagnóstico —que solo cubría `*.sh`— era cierto y no era
suficiente: había dos capas, y la segunda hacía inmune al archivo contra el
arreglo de la primera.

Es la misma familia que el `maxScale` del comentario y que los respaldos de §31.2:
**una pieza que se cree que cubre lo que no cubre**, con el agravante de que aquí
el que quedaba fuera era invisible — nadie mira si un `.tsx` figura como binario.

_Detalle de números, para que no se lea como una contradicción: yo medí **7+7**
sobre el commit entero (cinco archivos) y Doc midió **2+2** sobre
`CopilotDrawer.tsx` solo. Los dos son correctos; son alcances distintos._

---

## 42. Los 27 huérfanos: la premisa era falsa, y hay un bucle vivo (2026-08-21)

Encargo de Doc. Fuente: Cloud Logging, 30 días, más el código. **Ningún dato de
este apartado sale de una bitácora ajena.**

### 42.1 La respuesta corta, porque cambia la pregunta

**El `add` a Redis no falló ni una sola vez en 30 días.** La hipótesis con la que
se abrió el encargo —«un rechazo de Redis dejaba el correo guardado y sin
encolar»— no tiene un solo caso detrás.

El `catch` de `persistEmails` dejó **una** línea en 30 días:

```
2026-08-17T13:50:08.565Z
Error guardando correo 1a00ffbde06a9573 en BD para usuario cmsntcsn80000jn4jlxt18qag:
code=P1001 · Can't reach database server at
  ep-curly-heart-ayxrowqc.c-5.us-east-2.aws.neon.tech:5432
```

Es **la base**, no Redis. Y como lo que falló fue el `upsert`, ese correo **nunca
llegó a guardarse**: no es un huérfano, es la **otra** mitad de §37.1 —el correo
perdido con el marcador avanzando igual—. Un caso real, medido, de lo que aquel
hallazgo describía; pero no de esto.

**Lo que se le pedía a este expediente era decidir sobre Cloud Tasks. No lo
decide: no hay ningún fallo de Redis que migrar.** Ni lo propongo ni lo descarto
—no me toca—; digo que aquí no hay apoyo para ninguna de las dos.

### 42.2 Qué pasó de verdad con los 27

Del propio barrido, pasada a pasada:

| Hora (UTC) | Candidatos | Reencolados |
|---|---|---|
| 22:37:57 | **27** | 27 |
| 22:45:13 | 4 | 4 |
| 23:00:11 | 4 | 4 |
| 23:15:03 | **5** | 5 |
| 23:30:12 | 5 | 5 |
| 23:45:01 | 5 | 5 |

**23 de los 27 se recuperaron en la primera pasada.** Tenían texto, se
clasificaron y quedaron marcados. **El barrido funcionó, y la decisión de §37.7
está justificada por este número solo.**

Lo que no se recuperó son 4, que ahora son 5. Y ahí está el problema.

### 42.3 🔴 El bucle: los mismos cinco correos, cada quince minutos, para siempre

Los mismos cinco ids, en las seis pasadas seguidas:

```
cmstjc92i0003h7p0v4h7rdp7   cmsutn44e000113wk681pvq75
cmsxwfcua0006nucgd118c6n2   cmt29a4rh000213ftj0ym9nof
cmt3k70t0002jr3uvmxrfij40
```

y en cada pasada, la misma línea por cada uno:

```
El email <id> no tiene texto para analizar.
```

**El mecanismo, en tres piezas que por separado están bien:**

1. `ai.processor.ts:82-85` — si el correo no tiene `bodyText` **ni** `snippet`,
   el worker avisa y **hace `return` sin escribir `processedAt`**.
2. `processedAt` solo lo escriben `email-classification.service.ts:147` y la vía
   manual `emails.service.ts:598`. Si el worker sale por ahí, **no lo escribe
   nadie**.
3. El barrido busca exactamente `processedAt: null` con 30 minutos de
   antigüedad. Los vuelve a ver a los quince minutos. Y a los treinta. Y así.

**Es un bucle sin final**, y **nació hoy con el despliegue del barrido**: antes
esos cinco correos estaban quietos en la base, sin molestar a nadie. Cada vuelta
gasta comandos de Redis —el recurso que §32 pasó dos semanas racionando—, una
llamada a Cloud SQL y un despertar de Cloud Run, 96 veces al día, para no hacer
nada.

**Y no es un caso raro:** el aviso aparece también el 14-08, el 15-08 y el 18-08,
un correo cada vez. Los correos sin texto llegan solos —un adjunto suelto, un
calendario, una notificación con todo el contenido en HTML que el extractor deja
vacío—. **Cada uno que llegue se queda dentro del bucle para siempre.**

### 42.4 🟠 Dos consecuencias que van con el bucle

**a) El freno de alertas tiene margen cero.** `VENTANA_DE_FRENO_S = 900` s
(`alert.service.ts:9`) y `pmo-reconciliar-clasificacion` corre `*/15`, que son
**exactamente 900 s**. El freno existe, dice su propio comentario, para que «un
fallo en bucle no dispare cientos de mensajes; un canal que grita se silencia».
Está puesto en el mismo periodo del evento que debe frenar, así que cada pasada
es una carrera contra el reloj.

Desde los logs **no se puede saber si Chat recibió los 96 avisos del día**: la
línea `ALERTA ·` se registra **antes** de consultar el freno, así que sale
siempre. Lo que sí se puede afirmar es que el margen es cero, y eso ya es el
defecto: el amortiguador no puede amortiguar un evento de su misma frecuencia.

**b) `MAX_RECONCILIADOS = 100` con `orderBy: receivedAt asc`.** Cada correo sin
texto ocupa **una plaza permanente**, y las ocupa por delante, porque son los más
antiguos. Hoy son 5 de 100 y no pasa nada. El día que sean 100, **el barrido
dejará de alcanzar a los huérfanos de verdad y seguirá saliendo en verde**, que
es la forma de fallo de esta casa otra vez.

### 42.5 Lo que preguntaba Doc, punto por punto

| Pregunta | Respuesta |
|---|---|
| **El texto del error** | `P1001 · Can't reach database server` (Neon). **Una vez, el 17-08.** No es Redis |
| **Las fechas** | Ese único caso: 17-08 13:50 UTC. Los 27 huérfanos no dejaron rastro de fallo: **no fallaron al encolarse** |
| **Cuántos de verdad** | 27 vivos, **23 recuperados**, 4 atascados que hoy son 5 y **no crecen** por esa vía |
| **Si el goteo sigue** | **Sí, pero es otro goteo, y es un bucle** (§42.3). Ni un solo aviso de «Sincronización de Gmail incompleta» desde `337340e`: el arreglo del marcador **no ha tenido que retener nada** |
| **Correlación con §32 (Upstash)** | **Ninguna.** En 30 días: `OOM` 0, `maxmemory` 0, `evicted` 0, `ENOTFOUND` 0, `ECONNREFUSED` 0. Solo **2 `ECONNRESET`** sobre TLS, el 21-08 a las 15:19:32, sin traza de pino y sin caída del proceso. No coinciden con nada |

### 42.6 Y la cuarta, que era la mía: ¿hay más sitios con esta forma?

**El patrón literal —un efecto secundario dentro de un `try` cuyo `catch` solo
avisa— ya no está.** Solo hay dos `add` a una cola en todo el backend
(`gmail.service.ts:582` y `:666`) y los dos quedaron arreglados hoy.

**Pero la forma de fondo es otra, y es la que hay que buscar:** *salir de una
función sin dejar marca del estado en el que se sale.* En el worker hay cuatro
`return` tempranos:

| Línea | Caso | Deja huérfano |
|---|---|---|
| 60 | `!emailId` — job sin datos | No: no hay correo |
| 72 | `!email` — el correo ya no existe | No: nada que marcar |
| 78 | `processedAt` ya puesto | No: correcto, es la idempotencia |
| **83** | **sin texto que analizar** | **Sí, y es el del bucle** |

Tres de cuatro están bien. El cuarto es el que sostiene todo lo de arriba.

### 42.7 Lo que enseña

**Un arreglo correcto puede crear un bucle si el estado que arregla no tiene
dónde escribirse.** El barrido hace lo que se diseñó —encontró 27 y recuperó
23— y aun así dejó cinco correos girando, porque **preguntó «¿está clasificado?»
a un campo que solo se escribe cuando la clasificación tiene éxito**. Un correo
que no se puede clasificar no tiene forma de decirlo.

No es un error de quien lo escribió: es que faltaba un estado. `processedAt` sabe
decir «la IA pasó» y no sabe decir **«la IA pasó y aquí no había nada que
hacer»**, que es una respuesta legítima y definitiva.

Y lo otro, que me toca a mí: **abrí el expediente con la respuesta ya escrita en
el enunciado** —«averigua por qué falló el `add`»— y lo primero que dijeron los
logs es que el `add` no falló nunca. Si hubiera ido a buscar la confirmación en
vez de los hechos, habría encontrado el único P1001 del mes y lo habría contado
como prueba. Estaba ahí, con su fecha, listo para servir de prueba de lo que no
era.

**No lo arreglo. Lo reparte Doc** (§0, regla de hoy).
