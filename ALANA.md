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
DOC.md                         # estado de alto nivel y pendientes de decisión
GRAVITY_MEMORY.md → Estado     # el encargo vivo de Gravity
CLAUDE_MEMORY.md               # lo último del backend, variables y trampas
AI_ROLES.md → Excepciones      # si se acordó alguna nueva
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
