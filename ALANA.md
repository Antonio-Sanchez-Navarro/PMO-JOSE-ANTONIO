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

> ### 📬 Y desde hoy: el hallazgo va al buzón **sin preguntar** (2026-08-24)
>
> Orden del Jefe, y es la última pieza de la regla del 21-08. Hasta hoy cerraba
> cada informe con «¿se lo paso a Doc?». **Se acabó la pregunta**: en cuanto un
> hallazgo está verificado y escrito aquí, **se pasa al buzón de
> `PROMPT_ALANA.md`**, en la misma vuelta y sin esperar permiso.
>
> **Por qué importa y no es un detalle de cortesía:** un hallazgo que vive solo
> en `ALANA.md` no está repartido, y preguntar mete un paso humano entre
> encontrar algo y que alguien pueda arreglarlo. Si «encuentro y compruebo, no
> arreglo» es la regla, **entregar es la mitad que me queda** — y una entrega que
> depende de que me den permiso no es una entrega.
>
> Lo que **no** cambia: sigo sin cerrar nada, el reparto sigue siendo de Doc, y
> el buzón **se añade al final, nunca se reescribe**. Y sigue valiendo lo de
> siempre: **escribir ahí deja constancia pero no despierta a nadie**, así que
> cuando algo corre —como los $8.14 de crédito— hay que avisar al Jefe además de
> anotarlo.

> **Excepción puntual del 2026-08-07**, por orden expresa del usuario: Alana
> escribió un bloque de hallazgos al final de `GRAVITY_MEMORY.md`. Va **añadido**,
> sin tocar una línea de las suyas (141 inserciones, 0 borrados), firmado, y
> declarando que **no es un encargo y que el campo `Estado` sigue siendo de
> Doc**. La regla de fondo no cambia: sin una orden así, Alana solo escribe aquí.

> ### 🪜 Y desde hoy: al Jefe se le entrega un paso a paso, no un comando (2026-09-08)
>
> Regla general del equipo, fijada por Doc. **Cuando el Jefe tenga que intervenir
> a mano —en la consola de Google, en la nube o en local— hay que darle el
> recorrido exacto, paso por paso**, no la orden suelta.
>
> **Me obliga a mí más que a nadie**, y por lo que hago: yo encuentro y no
> arreglo, así que **todo lo mío acaba en manos de otro**. Un hallazgo mío que
> termina en «hay que rotar el secreto» no está entregado: está delegado a medias.
>
> Y hay caso propio del mismo día. En §56.1 dejé un `gcloud billing projects
> link …` sin decir dónde se teclea, qué contesta si sale bien, ni **qué había
> que averiguar antes** —por qué se cerró la cuenta—. La orden era correcta y la
> entrega no lo era: **si la hubiera ejecutado tal cual, habría movido el
> proyecto a otra cuenta de facturación sin necesidad**, porque una hora después
> la original se reabrió sola.
>
> **La forma:** dónde se hace, qué se teclea o se pulsa, qué se espera ver
> después, y **cómo se deshace** si sale mal. Si un paso puede romper algo, se
> dice en ese paso y no al final.

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

---

## 43. Auditoría línea a línea (2026-08-22)

Esta vez **leyendo**, no buscando patrones — que es exactamente donde me
equivoqué tres veces en §37. Trece hallazgos, y **todos verificados siguiendo la
llamada hasta el otro extremo**, no infiriendo desde un archivo.

**Qué leí entero:** `schema.prisma` · `gmail.service.ts` (997) ·
`emails.service.ts` (614) · `tasks.service.ts` · `time.service.ts` (arranque y
parada) · `ai.service.ts` · `ai.processor.ts` · `tasks.gateway.ts` (sesión y
emisión) · `copilot.service.ts` · `alert.service.ts` · `crypto.service.ts` ·
`users.service.ts` · `useSocket.ts` · `useSession.ts` · `useInbox.ts` ·
`tasks.api.ts` · `lib/api.ts` · `InboxPage.tsx` (flujo de datos) · los DTO de
tareas.

**Qué NO leí, y por tanto no cubre este informe:** `tools.ts`, `google.strategy`,
`metrics.service`, `logger.config` y el resto de `observability`, `title.prefix`,
`priority.rules`, `chat-threads`, los controladores salvo los citados,
`packages/shared`, y del frontend: `CopilotDrawer`, `TaskCard`, los cuatro
modales y `DashboardPage`. Queda para una segunda pasada.

---

### 43.1 🔴 A los quince minutos la sesión se rompe **a medias**

Son dos hallazgos y se potencian. Por separado son molestos; juntos explican un
síntoma que cualquiera describiría como «la aplicación se vuelve loca».

**a) Cuatro clientes HTTP no pasan por `apiFetch`, así que no refrescan el 401.**

| Módulo | Llamadas con `fetch` crudo | Qué se rompe |
|---|---|---|
| `tasks.api.ts` | 8 | El tablero entero: listar, mover, crear, borrar |
| `time.api.ts` | 8 | Todo el registro de tiempos |
| `tags.api.ts` | 2 | Las etiquetas |
| `copilot.api.ts` | 3 | La lista de conversaciones |

Solo `useSession`, `useDashboardMetrics`, `emails.api.ts` y `useInbox` usan
`apiFetch`. **El cerrojo de refresco que Gravity implementó bien en §37.13
protege a la minoría de las llamadas.**

Y no hay red de reserva: `useSession` consulta `/auth/me` **una sola vez al
montar** (`useSession.ts:32-34`); no hay temporizador ni refresco periódico en
todo el frontend. El token de acceso dura **15 minutos**
(`auth.constants.ts:24`).

**b) Y el socket ahora se cierra a propósito cuando el token caduca.**

`tasks.gateway.ts:219-241` programa un `setTimeout` que, al vencer el token,
emite `SESSION_EVENTS.rechazada` con `CODIGO_SESION.caducada` y desconecta. Es
el arreglo de mi §37.8 y está bien hecho —con `unref()` para no retrasar el
apagado y limpieza del temporizador en `handleDisconnect`—.

**Pero `SESSION_EVENTS` y `CODIGO_SESION` no aparecen ni una sola vez en
`apps/web`.** Lo comprobé sobre todo el árbol. El cliente:

- no escucha `session.rechazada`,
- no tiene manejador de `connect_error`,
- y crea el socket con las opciones por defecto de socket.io, que son
  `reconnectionAttempts: Infinity` con tope de 5 s entre intentos.

El comentario del gateway dice que el cliente «ya sabe qué hacer con él
—refrescar y reconectar—» y que reconectará «con la cookie nueva, que para
entonces el navegador ya habrá refrescado». **Ninguna de las dos cosas es
cierta**: no lo escucha, y lo único que refresca la cookie es un 401 recogido
por `apiFetch`, que el tablero no usa.

**El resultado combinado, y es reproducible:** dejas una pestaña abierta quince
minutos. A partir de ahí el socket entra en **reconexión perpetua, un intento
cada ~5 s** —unos 17 000 al día, cada uno despertando Cloud Run—, el tablero
deja de actualizarse en vivo sin decirlo, y la primera acción que hagas sobre él
falla con «Failed to move task». Si entonces tocas la bandeja, `apiFetch`
refresca la cookie y **el tablero vuelve a funcionar solo**. Ese vaivén es el
síntoma por el que se reconoce.

**Y lo que más me importa decir: el arreglo empeoró el síntoma.** Antes el
socket solo se rompía en un corte de red; ahora se rompe **siempre, a los quince
minutos**. Media pieza conectada es peor que ninguna, y es la tercera vez este
mes que aparece la misma forma.

### 43.2 🔴 `fetchMessages` descarta correos en silencio, y el marcador avanza igual

`gmail.service.ts:205-227`. Es **el mismo fallo de §37.1 una capa más arriba, y
sobrevivió al arreglo**.

```ts
const results = await Promise.all(ids.map(async (id) => {
  try { ... } catch (err) { this.logger.warn(...); return null; }   // ← se pierde aquí
}));
return results.filter((r) => r !== null);
```

`syncHistory` decide si retiene el marcador con `recuento.fallidos` y
`recuento.sinEncolar`, **que solo cuentan lo que llegó a `persistEmails`**. Un
correo que `fetchMessages` no pudo descargar no aparece en ningún contador: el
lote sale «completo», el marcador avanza y ese correo **no se vuelve a ver
nunca**. Exactamente lo que el comentario de arriba jura que ya no pasa.

**Y hay un multiplicador:** `Promise.all` sin tope de concurrencia sobre hasta
**500 ids** de una página de historial. Justo después de una caída —cuando el
lote es grande— eso es una ráfaga de 500 `messages.get` simultáneos contra la
cuota de Gmail, que responde 429. **El escenario que produce el lote grande es
el mismo que produce los fallos.**

⚠️ **Latente, no manifestado:** busqué el aviso `Error obteniendo detalle del
mensaje` en 30 días de Cloud Logging y **no hay ni uno**. El mecanismo es real y
alcanzable; no ha disparado.

### 43.3 🟠 `receivedAt` se fía de la cabecera `Date:` del remitente

`gmail.service.ts:237` toma `header('date')` y `persistEmails` hace
`receivedAt: new Date(email.date)` sin comprobar nada. Dos consecuencias:

1. **Una cabecera `Date:` malformada da `Invalid Date`, Prisma lanza, el correo
   cuenta como `fallidos` y —desde el arreglo del marcador— la ingesta se queda
   parada en ese tramo hasta que alguien lo mire.** Es el caso que el propio
   comentario de `syncHistory` describe como «un correo que falla siempre atasca
   la ingesta», solo que aquí el disparador **es externo**: lo activa cualquiera
   que pueda mandarte un correo.
2. **Una fecha futura falsificada deja el correo fuera del barrido para
   siempre**, porque la condición es `receivedAt < ahora - 30 min` y nunca se
   cumple. Y en la bandeja se queda arriba del todo, porque el orden es
   `receivedAt desc`.

Gmail devuelve **`internalDate`** —el sello del servidor, en milisegundos— en los
dos formatos que se piden aquí. Es el campo que no depende de quien escribe.

_Lo que hace este hallazgo incómodo: la guarda ya está escrita en esta misma base._
`ai.service.parseDueDate` comprueba `Number.isNaN(parsed.getTime())` antes de
aceptar una fecha del modelo. Se desconfía de lo que dice un LLM y no de lo que
dice un remitente desconocido.

### 43.4 🟠 El 409 anti-duplicados tiene una carrera dentro

`emails.service.ts:445-452`:

```ts
const existing = await this.prisma.task.count({ where: { sourceEmailId: email.id } });
if (existing > 0) throw new ConflictException(...);
// … y el `create` viene después, fuera de cualquier transacción
```

Dos peticiones simultáneas cuentan las dos cero y crean las dos. Y el docblock de
esa misma función dice: *«El guardarraíl contra duplicados es el 409, no el
borrado»*. Es un guardarraíl con una ventana.

Importa porque **el doble clic es justo el caso que motivó el arreglo de
interfaz de Gravity** (`isAnalyzing`, ocultar el botón si ya está convertido).
Esa mitad está bien; la del servidor, que es la que de verdad garantiza, no.

### 43.5 🟠 La emisión del socket falla abierto

`tasks.gateway.ts:367-374`:

```ts
const userId = (payload as { userId?: string })?.userId;
if (!userId) {
  this.logger.warn(`${event} sin userId: se difunde a todos los clientes`);
  this.server?.emit(event, payload);   // ← a TODOS
  return;
}
```

Revisé los cinco llamadores y **hoy todos llevan `userId`**, así que no hay fuga
en curso. Pero es un límite entre inquilinos que, ante la duda, **reparte en vez
de callar**. Lo correcto en un fallo de encaminamiento es no emitir y registrar
un error, no difundir a todo el mundo y anotar un aviso.

### 43.6 🟡 Las dos vías humanas de conversión no coinciden

En `createFromEmail`, la vía de la cuarentena (`persistConfirmed`) marca el
correo con `processedAt` e `isActionable`; **la vía manual —`dto.title`— no
marca nada** (`emails.service.ts:470-487`).

Las dos son una persona convirtiendo un correo a mano. Una de las dos está mal, y
no es un detalle estético: el correo que no se marca **sigue siendo candidato del
barrido de reconciliación**, que lo reencolará y hará que el modelo lo clasifique
por su cuenta encima de la tarea que la persona ya escribió.

Hoy casi nunca se alcanza —el worker ya suele haber marcado el correo minutos
antes— pero la asimetría está ahí y es la clase de cosa que se cobra cuando algo
más cambia.

### 43.7 🟡 Dos estándares de error en el mismo archivo

En `tasks.api.ts` conviven dos maneras de fallar:

- `classifyEmail`, `createTasksFromEmail` y `updateEmailStatus` **leen el cuerpo
  de la respuesta**, juntan los mensajes de validación y dan un texto en español.
- `fetchTasks`, `updateTaskStatus`, `moveTask`, `createTask` y `deleteTask`
  lanzan `'Failed to fetch tasks'` y tiran el mensaje del servidor a la basura.

Es el mismo archivo, escrito con dos criterios. Y el efecto es concreto: el 409
del tablero —«ya tiene N tarea(s), reenvía con force»— y el 400 que dice **qué
etiqueta** falla nunca llegan al usuario.

### 43.8 🟡 Mi §37.18 se quedó corto, y por el mismo vicio de siempre

Quedan **seis** mensajes en inglés: cinco en `tasks.api.ts` (`Failed to fetch
tasks`, `Error updating task`, `Failed to move task`, `Failed to create task`,
`Failed to delete task`) y uno en `copilot.api.ts:33` (`Error deleting thread`).

No los vi en §37 porque busqué `Error fetching|Failed to parse|Error creating` y
**no busqué `Failed to`**. Tercera vez que un grep mío define el alcance del
hallazgo en vez de definirlo el código.

### 43.9 🟡 `updateTaskStatus` es código muerto

Exportada en `tasks.api.ts:34`, **cero llamadas** en todo `apps/web`. Con ella
quedan sin consumidor `PATCH /tasks/:id`, `TasksService.update` y `UpdateTaskDto`
—que, de paso, solo admite `status`, `dueDate` y `description`—. Es una ruta con
pruebas y sin nadie al otro lado.

### 43.10 🔵 Cuatro cosas menores, comprobadas

- **El recuento de `skipReason` no filtra por `userId`**
  (`gmail.service.ts:766`). Es la única consulta de la casa que rompe la regla de
  filtrar por dueño, en un archivo que la aplica en todas las demás.
- **`reencolados` cuenta intentos, no altas.** Si el trabajo está activo,
  `remove` falla —se traga a propósito— y el `add` se ignora por `jobId`, pero el
  contador sube igual. Ese número viaja dentro del texto de la alerta.
- **El barrido no tiene índice.** `Email` solo indexa `[threadId]` y
  `[userId, status]`; la consulta del barrido filtra por `processedAt` y
  `receivedAt` y ordena por `receivedAt`. Son 96 escaneos secuenciales al día.
- **`sendEmail` convierte cualquier error en 502** (`copilot.service.ts:230`),
  incluidos los nuestros. El docblock justifica el 502 «porque el problema no es
  de esta API sino del servicio de arriba», y el `catch` no distingue.

### 43.11 🔵 Un riesgo aceptado que conviene cuantificar

El comentario de `reconciliarSinClasificar` acepta por escrito que un correo
cuya clasificación falle siempre volverá a ocupar plaza. Vale la pena poner el
número: **cada 15 minutos, con `attempts: 3`, son hasta 288 llamadas de pago al
modelo por día y por correo envenenado.**

No es hipotético del todo: el 21-08 hubo una
(`Campo "isActionable" ausente o no booleano`, correo `cmt39ijg6…`), y se
resolvió sola. El mecanismo de `skipReason` que se estrenó ayer es exactamente la
forma de cerrarlo, si se decide que merece la pena.

### 43.12 Lo que me llevo de leer en vez de buscar

Los tres hallazgos de arriba tienen una cosa en común y no es el módulo: **los
tres son una pieza cuya otra mitad está en otro archivo.** El socket que se
cierra bien y el cliente que no lo escucha. El contador que decide si el marcador
avanza y la función de la capa de arriba que ya había perdido los correos. La
guarda de fecha que existe para el modelo y no para el remitente.

Ninguno se ve leyendo un archivo. Los tres se ven al preguntar **quién está al
otro lado**, que es literalmente lo que fallé tres veces en §37 y lo que corregí
en §40 — con la diferencia de que entonces me hizo inventar defectos y ahora me
ha hecho encontrarlos.

**Un archivo no se audita: se audita el cable que sale de él.**

---

## 44. Segunda pasada: los archivos que declaré sin leer (2026-08-22)

Encargo del Jefe. El de Doc sigue `EN PAUSA` y no lo toco.

Nueve hallazgos. Vengo aplicando lo que Doc señaló de §43 —**la profundidad no
está en el archivo, está en las juntas**— así que en cada archivo he ido a
buscar qué afirma sobre alguien que está al otro lado, y luego lo he
comprobado allí. Los dos primeros salieron justo de ahí.

**Cobertura de esta pasada, sin adornos:**

| Leído entero | Leído en parte | **Sigue sin leer** |
|---|---|---|
| `tools.ts` · `metrics.service.ts` · `all-exceptions.filter.ts` · `time-zone.ts` · `query-metrics.dto.ts` · `kanban/types` | `google.strategy.ts` (el `stream`) · `packages/shared` (1-120 de 216) · `TaskCard.tsx` (70-140) · `AiValidationModal.tsx` (20-90) | `logger.config.ts` · `gcp-logging.ts` · `describir-error.ts` · `title.prefix.ts` · `priority.rules.ts` · `chat-threads.service.ts` · `anthropic-client.ts` · los controladores · **`CopilotDrawer.tsx`** · `TimeEntriesModal` · `TimeReportModal` · `TaskModal` · `TagManagerModal` · `EmailDetailModal` |

⚠️ **De `CopilotDrawer.tsx` solo miré la rama que atiende los `tool_call`.** El
hallazgo §44.1 sale de ahí y es firme; del resto de ese archivo **este informe no
dice nada**.

---

### 44.1 🔴 La tercera herramienta del copiloto no llega a la interfaz

`change_email_status` está **completa en el backend**: en el catálogo con
`kind: 'propose'` (`tools.ts:207-217`), con un esquema pensado —**sin `force`**,
para que el modelo no pueda saltarse el 409 que existe para que lo salte una
persona— y con un parser que devuelve `status: null` ante un valor desconocido en
vez de caer a un valor por defecto, porque *«aquí no hay ningún estado inocente
al que caer: `DISMISSED` por descarte descartaría correos»*.

**Y en `apps/web` no hay ni una sola referencia a ella.** `CopilotDrawer` tiene
rama para `draft_email` (línea 140) y para `create_task` (línea 156). Nada más.

Seguido el cable entero, esto es lo que pasa cuando el modelo la usa:

1. Se le ofrece la herramienta y se le dice *«propón en vez de preguntar»*.
2. La estrategia emite `tool_call` con `toolName: 'change_email_status'`.
3. Ninguna rama del cliente coincide: **no se pinta nada**.
4. La estrategia le devuelve al modelo un `tool_result` que dice
   `pendiente_de_confirmacion` — **así que el modelo cree que se enseñó una
   tarjeta** y, por diseño, no insiste.
5. La persona ve una respuesta que da a entender que el cambio está propuesto, y
   ninguna tarjeta. El correo no se mueve.

Lo que lo remata es el propio comentario del parser: *«Con `null`, la tarjeta
tiene cómo saber que la propuesta no es confirmable y no ofrecer el botón»*. **No
hay tarjeta que lo sepa.** La ruta REST que aplicaría el cambio sí existe y la
usa la bandeja; lo único que falta es el trozo de interfaz.

Es la forma de la casa otra vez, y van cuatro en dos días: puesto, conectado por
un lado, muerto por el otro.

### 44.2 🟠 La aplicación corta los días donde no está el usuario

`time-zone.ts:24` fija `ZONA_POR_DEFECTO = 'America/Mexico_City'` y justifica el
valor diciendo que es *«donde trabaja quien usa esto»*.

**Toda la infraestructura corre en `America/Cancun`**, y no es una suposición:
está escrito en `deploy.yml:937` y `:1030`, en los dos disparadores de Cloud
Scheduler. Son husos distintos — Cancún es **UTC−5 fijo**, Ciudad de México
**UTC−6** —, así que hay una hora de diferencia permanente.

**Consecuencia concreta:** lo que se cierre o se fiche entre las **00:00 y la
01:00 hora local** se cuenta en el **día anterior**, tanto en
`GET /dashboard/metrics` como en `GET /time/report`.

El archivo existe precisamente para que las dos rutas no diverjan entre sí, y lo
cumple: **divergen las dos a la vez, de la realidad.** Y la decisión está
declarada como de producto —«el día acaba a medianoche en México»—, así que **si
`America/Mexico_City` es deliberado, esto no es un defecto sino un comentario
mal escrito**; y si lo deliberado era la zona del usuario, el valor está mal.
No lo afirmo: lo pregunto, que es lo acordado para las cosas que huelen a
decisión.

### 44.3 🟠 Los dos proveedores no cuentan igual lo que cuesta un turno

`anthropic.strategy.ts` **acumula** a lo largo de las vueltas
(`entrada += final.usage.input_tokens`) y lo dice en su docblock: *«Sumados de
todas las vueltas: si el modelo buscó antes de responder, el turno costó las dos
llamadas y el informe tiene que decirlo.»*

`google.strategy.ts:152-155` **asigna**:

```ts
entrada = chunk.usageMetadata.promptTokenCount ?? entrada;
salida  = chunk.usageMetadata.candidatesTokenCount ?? salida;
```

De un turno con herramienta, **solo sobrevive la última vuelta**: los tokens de
salida de la primera llamada se pierden. El mismo campo `usage` del evento
`done` significa una cosa con Claude y otra con Gemini, y es el número con el que
se mira lo que cuesta el copiloto.

### 44.4 🟠 Y tampoco cierran igual las herramientas que solo se proponen

En Anthropic hay un bloque explícito que devuelve un `tool_result` de
`pendiente_de_confirmacion` **también para las no ejecutables**, con dos motivos
escritos: que la API responde **400** si falta uno, y —el que importa aquí— que
*«decírselo al modelo además evita que insista o dé por hecha una acción que aún
no ocurrió»*.

En Google, el `functionResponse` se construye **solo para `ejecutables`**
(`google.strategy.ts:161-176`). Las propuestas se quedan sin respuesta.

El primer motivo es de Anthropic y puede no aplicar a Gemini. **El segundo aplica
igual a los dos y no está implementado en uno.** Con §44.1 encima, el efecto se
suma: con Gemini el modelo puede insistir con una herramienta que además no se
pinta.

### 44.5 🟡 Un `0` suelto en la tarjeta

`TaskCard.tsx:133`:

```tsx
{task.aiConfidence && <AiAuditBadge confidence={task.aiConfidence} />}
```

`aiConfidence` es un número acotado a `[0, 1]` por `ai.service.parseAnalysis`
(`Math.min(1, Math.max(0, ...))`), así que **cero es un valor legítimo**. Con
cero, React no pinta el distintivo: pinta el carácter `0` junto al título.

### 44.6 🟡 `@IsNotEmpty()` deja pasar un título de solo espacios

`ConfirmedTaskDto` (`to-task.dto.ts:36-39`) valida el título con `@IsString()` +
`@IsNotEmpty()` + `@MaxLength(300)`. `@IsNotEmpty` rechaza `''`, `null` y
`undefined` — **no rechaza `'   '`**. Y `persistConfirmed` hace
`title: task.title.trim()`, así que se crea una tarjeta **con el título vacío**.

Se llega desde el botón «añadir tarea» del modal de validación, que crea la fila
con `title: ''` y no valida al confirmar.

Lo que lo hace un hallazgo y no una opinión: **`CreateTaskDto`, en este mismo
proyecto, lo hace bien** — `@Transform(trim)` + `@MinLength(1)` con su mensaje.
Dos DTO para el mismo campo, uno correcto y otro no.

### 44.7 🔵 Una consecuencia nueva de §37.4, que sigue abierto

`all-exceptions.filter.ts:62` registra `remoteIp: request.ip` en cada incidencia
de Error Reporting. Sin `trust proxy` —que sigue sin ponerse—, detrás de Cloud
Run `request.ip` es **el frontend de Google**, el mismo para todo el mundo.

O sea: la falta de esa línea no solo convierte el límite «por IP» en un cubo
global (§37.4); además **hace falsa la IP de cliente de todos los registros de
error**. Un dato equivocado en un panel es peor que un dato ausente.

### 44.8 🔵 Dos cosas menores de tipos

- **`TriageEmail` en `kanban/types/index.ts` es código muerto**: cero usos en
  todo `apps/web`. Está marcado como «tipo provisional» y el provisional se
  quedó.
- `KanbanBoard.tsx` importa `Task, TaskStatus` de `../types` y `TaskPriority` de
  `@pmo/shared` **en el mismo archivo**, cuando `../types` reexporta las tres.

### 44.9 🔵 Dos etiquetas más en inglés

`▶ Start` y `⏹ Stop` en `TaskCard.tsx`, en la interfaz visible. Ni §37.18 ni
§43.8 las vieron porque las dos buscaron en mensajes de error, no en JSX.

---

### 44.10 Lo que está bien y merece decirse

Un informe que solo enumera defectos miente por omisión sobre el estado de una
base. En esta pasada he leído cuatro piezas que están **muy bien** hechas:

- **`metrics.service.ts`** — SQL parametrizado de verdad: `tz` viaja como
  parámetro de Prisma y `Prisma.raw` se usa **solo** para nombres de columna que
  escribimos nosotros. La zona se valida con `Intl.DateTimeFormat`, así que un
  `?tz=Marte/Olympus` es un 400 y no un 500. Busqué la inyección y no está.
- **`all-exceptions.filter.ts`** — distingue el 503 de una sonda de un fallo del
  servicio, agrupa el freno **por ruta** y no por mensaje, y **espera la promesa
  de la alerta** porque con la CPU estrangulada un `fetch` sin dueño se congela.
  Eso último no se le ocurre a nadie hasta que lo ha perdido una vez.
- **`tools.ts`** — las dos decisiones de seguridad que tiene son las correctas y
  están razonadas: `force` fuera del esquema, y estado desconocido a `null` en
  lugar de a un valor por defecto.
- **`packages/shared`** — una sola fuente, y el frontend la extiende en vez de
  copiarla. Es exactamente lo que evita que los dos lados diverjan.

### 44.11 Lo que enseña esta pasada

Doc lo dijo de §43 y esta pasada lo confirma: **una lectura línea a línea
perfecta habría dado §44.5, §44.6, §44.8 y §44.9 — los cuatro menores — y
ninguno de los cuatro de arriba.**

Los cuatro primeros salieron de la misma pregunta hecha cuatro veces: *este
archivo afirma algo sobre alguien que está en otro sitio; ¿es verdad?* El parser
dice que la tarjeta sabrá qué hacer con `null` — no hay tarjeta. El comentario
dice que el usuario trabaja en Ciudad de México — la infraestructura dice
Cancún. El docblock de Anthropic dice que el turno cuenta las dos llamadas —
Gemini cuenta una. El bloque de `pendientes` explica por qué hay que contestar a
todas — el otro proveedor no contesta.

**Los cuatro son un comentario que dice la verdad sobre su archivo y mentira
sobre el sistema.** No hay `grep` que encuentre eso, y leer despacio tampoco
basta: hay que ir al otro extremo y mirar.

---

## 45. Cierre de la auditoría (2026-08-22)

Tercera y última pasada: lo que quedaba de la declaración de §44. Cinco
hallazgos, y **siete hipótesis mías que se murieron al comprobarlas** — que van
al final, porque son la mitad del informe.

---

### 45.1 🔴 Inyección de cabeceras por el asunto del correo

`mime.ts`, `buildRawMessage`:

```ts
const cabeceras = [
  `To: ${dto.to.join(', ')}`,
  ...(dto.cc?.length ? [`Cc: ${dto.cc.join(', ')}`] : []),
  `Subject: ${encodeHeader(dto.subject)}`,
  ...
];
const mensaje = `${cabeceras.join('\r\n')}\r\n\r\n${...}`;
```

Y `encodeHeader` **devuelve el texto intacto si es ASCII puro**:

```ts
if (/^[\x00-\x7F]*$/.test(texto)) return texto;
```

`\r` y `\n` **son ASCII**. Un asunto como `Hola\r\nBcc: alguien@ejemplo.com`
pasa el filtro sin tocarse y entra en el bloque de cabeceras como una cabecera
más.

**Qué está protegido y qué no**, comprobado campo por campo:

| Campo | Protección | Estado |
|---|---|---|
| `to`, `cc` | `@IsEmail({}, { each: true })` en el DTO — rechaza cualquier cosa con espacios o control | ✅ |
| `subject` | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(500)` — **ninguna mira los saltos de línea** | ❌ |
| `body` | Va en base64 después de la línea en blanco: no puede escapar | ✅ |

**La cadena completa, y digo también lo que la frena:** llega un correo hostil →
el copiloto lo lee (`search_emails` devuelve una vista previa del cuerpo) → una
inyección de prompt le hace proponer un borrador cuyo asunto lleva el `\r\n` →
la tarjeta lo pinta en un campo de una línea, **donde un salto no se ve** → una
persona pulsa enviar → Gmail manda el correo con la cabecera añadida.

**No es un exploit remoto sin autenticar**: hace falta que alguien apruebe el
borrador. Pero es exactamente el modelo de amenaza que este proyecto ya tiene
escrito —*«el copiloto lee correos, y un correo es texto de un desconocido»*— y
la defensa elegida contra él es la confirmación humana. Un `\r\n` invisible en
un campo de asunto es justo lo que esa defensa no puede ver.

**Y el detalle que lo hace bonito y peor a la vez:** un asunto **con acento** se
envuelve en base64 por RFC 2047 y queda **inofensivo**; uno en ASCII puro, no.
La codificación que existe por corrección ortográfica protege unos asuntos y
otros no, sin que nadie lo eligiera.

### 45.2 🔴 Los tramos de tiempo manuales se guardan desplazados, y cada edición los desplaza más

`TimeEntriesModal.tsx`. El ida y vuelta entre `<input type="datetime-local">` y
la ISO está invertido en los dos sentidos:

```ts
setStartedAt(oneHourAgo.toISOString().slice(0, 16));   // ← UTC dentro de un campo LOCAL
...
const startedAtIso = new Date(startedAt).toISOString();  // ← lo local reinterpretado
```

`toISOString()` da **UTC**; el campo `datetime-local` lee lo que le pongan como
**local**. Y al enviar, `new Date('2026-08-22T00:00')` se interpreta como local
y se convierte a UTC otra vez.

Con las 22:00 reales de Cancún (UTC−5):

| Paso | Valor |
|---|---|
| «hace una hora» real | 21:00 local |
| Lo que pinta el formulario | **02:00** (la hora UTC, con etiqueta local) |
| Lo que se guarda al enviar | 02:00 local → **07:00 UTC** |
| Desfase | **+5 h** |

Y **`handleEditClick` hace lo mismo**: abre un tramo ya guardado con
`toISOString().slice(0,16)`, así que lo muestra +5 h, y al guardar le suma otras
cinco. **Abrir y guardar tres veces deja el tramo quince horas movido.**

La duración sí sale bien —los dos extremos se desplazan igual— así que lo que se
corrompe es **a qué día pertenece**, que es justo lo que alimenta
`fichajesPorDia` y la gráfica del panel. Se suma a §44.2, y son dos defectos de
zona horaria independientes en el mismo módulo.

⚠️ **Hoy no ha hecho daño:** `TimeEntry` tiene **cero filas** en producción
(anotado desde §33.3). El registro de tiempos no se usa.

### 45.3 🟠 El formulario de tarea no ofrece «Urgente»

`TaskModal.tsx` declara `z.enum(['LOW', 'MEDIUM', 'HIGH'])` y su desplegable
tiene tres opciones. **`URGENT` existe en todo lo demás**: en el enum de Prisma,
en `packages/shared`, en el esquema de extracción del modelo, en el filtro del
tablero y en `adjustPriority` —que **escala precisamente a `URGENT`** cuando algo
vence en menos de 24 h—.

O sea: el sistema sube tareas a urgente solo, y **una persona no puede crear una
urgente a mano**.

### 45.4 🔵 El copiloto no envía correos en producción

No es un fallo — lo escribo porque es un hecho de producto que conviene tener
por escrito y hoy solo vive en el arranque de un contenedor.

`MockSender` es **el transporte por defecto** desde el 2026-08-12, y solo se pasa
a Gmail con `COPILOT_EMAIL_TRANSPORT=real`. Comprobado hoy:

- **no está** en las variables del repositorio (`gh variable list`),
- **no llega** a la revisión viva (`pmo-api-00087-s5v`).

Así que el botón «enviar» del copiloto **registra y no envía**. Y está bien
resuelto por los tres lados: el pipeline emite un `::notice::` al desplegar sin
la variable, el módulo lo registra al arrancar, y la tarjeta del frontend
distingue `transport: 'mock'` y se lo dice al usuario. **Este es el contraejemplo
de §44.1**: la misma forma —una capacidad apagada— con el cable puesto en los
tres extremos.

### 45.5 🔵 El contrato SSE sigue diciendo que hay una sola herramienta

`copilot.controller.ts:39`: *«El modelo pidió una herramienta (hoy solo
`draft_email`)»*. Hay **tres** que se proponen. Es, literalmente, el comentario
que habría delatado §44.1 si alguien lo hubiera actualizado al añadir las otras
dos.

---

### 45.6 Lo que comprobé y estaba bien: siete hipótesis mías, muertas

Esto no es cortesía. En §37 tuve **tres falsos positivos porque no seguí la
llamada**; el contrapeso honesto es decir cuántas veces la sospecha no
sobrevivió al mirar. En esta pasada, siete:

| Sospeché | Lo que hay |
|---|---|
| Que el cliente no atiende el evento `error` del stream y una respuesta truncada parecería terminada | **Sí lo atiende** (`CopilotDrawer.tsx:173`) |
| Que la interfaz da por enviado lo que el `MockSender` no manda | **Lo distingue** y lo pinta (§45.4) |
| Que el `code` de OAuth acaba en Cloud Logging | `sanitizeUrl` tapa `code`, `state`, `token` y siete más — **y el comentario dice que ya pasó una vez y por eso existe** |
| Que los logs llevan la cookie de sesión, que es un JWT vigente | `redact` tapa `cookie`, `authorization` y `set-cookie` |
| Que el guard de OIDC pasa si falta la cuenta esperada | **Falla cerrado**, y explica por qué: una firma de Google no acredita que la llamada sea nuestra |
| Que `?tz=` llega a SQL sin parametrizar | Es parámetro de Prisma; `Prisma.raw` solo toca nombres de columna nuestros |
| Que reabrir una tarea deja el cierre contado para siempre | `completionStamp` lo limpia al salir de `DONE`, y está razonado |

**Siete de doce sospechas no sobrevivieron.** Es la proporción que hace creíbles
las cinco que sí.

### 45.7 Cobertura final, y lo que sigue sin leer

**Cubierto en las tres pasadas (§43, §44, §45):** todo `gmail`, `emails`,
`tasks`, `time` (servicio), `ai`, `copilot` (servicio, controlador, catálogo, las
dos estrategias, hilos, MIME, emisor), `metrics`, `overdue`, `auth` (sesión,
servicio, constantes), `common/` (prisma, crypto, alerts, observability salvo lo
de abajo, security, time-zone, anthropic-client, bullmq), el esquema, los
workflows, los Dockerfiles, los scripts de respaldo, y del frontend `lib/api`,
`useSocket`, `useSession`, `useInbox`, `InboxPage`, `KanbanBoard`, `TaskCard`,
`CopilotDrawer`, `TaskModal`, `TimeEntriesModal`, `AiValidationModal`,
`tasks.api`, `types` y `packages/shared`.

**Sigue sin leer, y por tanto este informe no dice nada de ello:**
`TimeReportModal`, `TagManagerModal`, `EmailDetailModal`, `CopilotHeader`,
`ChatMessage`, `CreateTaskCard`, `KanbanColumn`, `AiAuditBadge`,
`CopilotContext`, `format.ts`, `App.tsx`, `LoginPage`, `DashboardPage`; y del
backend `auth.guard`, `pubsub-auth.guard`, `redis.health`, `con-plazo`,
`dead-letter.listener`, `copilot-audit.service`, `copilot-context.service`,
`tags.service`, `overdue.cron-purge`, `title.prefix`, `gcp-logging` (salvo
`sanitizeUrl`) y los controladores de `tasks`, `tags`, `time` y `emails`.

Es superficie de bajo riesgo —presentación, guards ya ejercitados por las rutas
que sí leí, y utilidades con prueba— pero **bajo riesgo no es leído**, y la
diferencia entre las dos cosas es lo único que hace que este informe se pueda
usar sin miedo.

### 45.8 El saldo de las tres pasadas

**Veintisiete hallazgos.** Y una cosa que ya no puedo llamar casualidad: **los
seis graves de las tres pasadas están todos en una junta, y ninguno dentro de un
archivo.**

El socket que se cierra bien y el cliente que no lo escucha. El contador que
decide si el marcador avanza y la capa de arriba que ya había perdido los
correos. La guarda de fecha que existe para el modelo y no para el remitente. La
herramienta completa en el backend y sin tarjeta en la interfaz. El comentario
que dice Ciudad de México y la infraestructura que corre en Cancún. Y la
codificación de cabeceras que protege los asuntos con acento y deja pasar los
otros.

Los seis los encontró la misma pregunta: **este archivo afirma algo sobre alguien
que está en otro sitio, ¿es verdad allí?** Ninguno lo habría dado un `grep`, y
—esto es lo que me llevo— **ninguno lo habría dado tampoco leer despacio**. Leer
línea a línea da los veintiuno menores. Los seis grandes salen de levantarse del
archivo e ir al otro extremo del cable.

Un archivo no se audita. Se audita el cable que sale de él.

---

## 46. Las consolas externas, una por una (2026-08-24)

Encargo del Jefe: revisar en Chrome los registros de los servicios que el código
describe. Ocho consolas en el inventario; **cinco revisadas, tres no**, y las
tres van nombradas al final.

**Todo lo de aquí es lectura.** No he tocado un solo ajuste, y donde Google pidió
contraseña me paré: eso lo hace el Jefe.

---

### 46.1 🔴 Anthropic: quedan **$8.14** de crédito

Consola de Anthropic, org «Jose Antonio's Individual Org». Consumo de agosto:
**1 354 565 tokens de entrada** y **113 599 de salida**, repartidos entre
`claude-sonnet-5` (la clasificación) y `claude-opus-5` (el nivel `pro` del
copiloto). La gráfica diaria se mueve entre 60 k y 250 k tokens.

**Créditos restantes: $8.14.**

Es la dependencia más dura del producto y **no la vigila nadie**. Ni la Capa 1
—que mira despliegues— ni la Capa 2 —que mira la ingesta de Pub/Sub— ni la
política del respaldo. Cuando ese saldo llegue a cero:

- la **clasificación de correo** deja de funcionar,
- el **copiloto** deja de funcionar,
- y por el camino que el código ya tiene escrito: un 429 lo trata
  `convieneEsperar` como «no hay cuota ahora», así que `frenarLaCola` **pausa el
  worker entero** en vez de fallar. La cola se queda quieta y los correos entran
  sin clasificar.
- La DLQ avisaría de los síntomas —clasificaciones fallidas— pero **la causa no
  la dice nadie**.

Es el mismo patrón que costó la semana del respaldo: una cuenta atrás visible
para quien la mire, sin nadie mirándola.

### 46.2 🔴 Google Cloud factura de verdad desde el 19 de agosto

Aviso en la consola, en todas las páginas del proyecto:

> *«Actualmente, estás generando cargos en tu cuenta de facturación **Mi cuenta
> de facturación** a partir del 19 de agosto de 2026.»*

Se acabó el crédito de prueba. **Todo lo que se decidió cuando esto era gratis
ahora tiene precio**, y hay tres decisiones nuestras que conviene volver a mirar
con esa luz:

- **`--no-cpu-throttling`**, que factura CPU **toda la vida de la instancia** y
  no solo mientras atiende. El propio `deploy.yml` lo avisa: *«si algún día la
  factura de Cloud Run sorprende, este flag es el primer sitio donde mirar»*.
- **El barrido de reconciliación cada 15 minutos**, que por diseño **despierta el
  contenedor** 96 veces al día. Se eligió sobre `min-instances=1` porque era
  gratis; ahora no lo es del todo.
- **`--max-instances=8`** con `--cpu=1` y `--memory=512Mi`, que acota el techo.

No digo que sea caro: digo que **nadie ha mirado el número desde que dejó de ser
cero**, y que las tres decisiones se tomaron con la premisa contraria.

### 46.3 🟠 La clave de Gemini vive fuera del proyecto y la paga otra cuenta

En `pmo-dashboard-503418` → Credenciales: **«No hay claves de API para
mostrar»**. Ninguna. Y sin embargo el copiloto tiene un proveedor Google
configurado.

En Google AI Studio hay **dos** claves, las dos del **20 de mayo de 2026** —dos
meses antes de que este proyecto existiera—:

| Clave | Proyecto | Facturación |
|---|---|---|
| `...YnSQ` | **My First Project** (`continual-loop-496922-h9`) | Nivel 1 · Pospago |
| `...BNpY` | **Gemini Project** (`gen-lang-client-0325947422`) | **Nivel 2 · Pospago · «My Billing Account»** |

Y la que corre en producción es **`...BNpY`** — comprobado leyendo solo los
cuatro últimos caracteres del secreto `pmo-gemini-api-key`, que es lo mínimo que
identifica sin exponer nada.

O sea: una dependencia de producción de este proyecto **está en otro proyecto de
Google, la paga otra cuenta de facturación, se creó antes que el producto y se
comparte con lo que sea «My First Project»**. Desde la consola de
`pmo-dashboard-503418` **no se puede rotar, ni revocar, ni ver su gasto**, y no
aparece en su factura.

Hoy no rompe nada. Lo que rompe es el día que haya que rotarla, o que alguien
audite qué consume este proyecto y no la encuentre.

### 46.4 🟠 La URL del webhook de Chat acabó en dos sitios

La instrucción de Doc para la Capa 1 fue explícita: *«léelo con
`gcloud secrets versions access` en vez de crear un secreto nuevo en GitHub. Una
sola fuente, un sitio donde rotarlo.»*

Lo que hay es un **secreto de GitHub Actions `ALERT_WEBHOOK_URL`**, creado el
2026-08-22 a las 02:23:33. Así que la misma URL vive ahora en **Secret Manager**
y en **Actions**, y rotarla exige acordarse de los dos.

Y al lado queda un **`ALERT_WEBHOOK_SECRET` como *secreto*** de Actions, del
14-08, con el **mismo nombre que una *variable*** que significa otra cosa —la
variable guarda el *nombre* del secreto de GCP—. Dos objetos homónimos y de
naturaleza distinta en el mismo repositorio.

_No lo cuento como un fallo del arreglo: funciona. Lo cuento porque el motivo
que Doc escribió para elegir la otra vía sigue siendo cierto, y ahora hay que
vivir con él._

### 46.5 🔵 La Capa 1 **sí sonó en fuego real**, y así consta

Esto es lo contrario de un hallazgo y por eso lo escribo. El historial del
workflow «Avisar si falla Vercel o el CI» cuenta la historia entera:

| Hora (22-08) | Qué |
|---|---|
| 02:21:45 | **Fallo.** `URL:` vacía → *«El secreto ALERT_WEBHOOK_URL de GitHub Actions no existe o esta vacio. NO se ha avisado del fallo.»* |
| 02:23:33 | El Jefe crea el secreto — **dos minutos después** |
| 02:30:02 | `workflow_dispatch` manual → **verde**. El simulacro |
| 02:30:27 y 02:37:09 | Dos avisos **reales** por `workflow_run` → verdes |

Es exactamente cómo se firma una alerta: **provocarla y verla llegar**. Y el
mensaje de error del fallo traía el comando para arreglarlo, que es lo que hizo
que se resolviera en dos minutos en vez de en dos días.

**Y Vercel está dentro**: hay ejecuciones disparadas por `deployment_status` y
«created by vercel Bot». El hueco que señalé —que un job en Actions no ve los
despliegues de Vercel— está cubierto por otro camino.

### 46.6 🔵 El frontend en producción **está al día**, y ahora se puede comprobar

`https://pmo-frontend-ten.vercel.app/version.json`:

```json
{ "commit": "f634efacd25bfdacef0f13cb5ed83ae305238b40",
  "construido": "2026-08-22T02:39:47.804Z" }
```

Y el último commit que toca `apps/web` o `packages/shared` es `d2ae401`, que es
**ancestro** de ése. Nada posterior toca el frontend.

**Los arreglos de frontend llegaron al navegador.** Lo digo con énfasis porque en
§38 escribí «comprobado en el código, archivo por archivo» y era cierto **y no
era suficiente**: comprobé que el arreglo existía, no que estuviera sirviendo.
Ese `version.json` es la pieza que convierte esa comprobación en una de un
segundo, y no existía cuando me equivoqué.

### 46.7 🔵 El cliente OAuth, y dos detalles

**Lo que está bien:** un solo cliente («Cliente web PMO», 24 jul), un solo
secreto habilitado, tipo de usuario **Interno** —confirmado en la pantalla de
Público, así que sin verificación de Google— y la **URI de redirección exacta**:
`https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback`, que coincide con
`GOOGLE_REDIRECT_URI`. Las cinco cuentas de servicio son las cinco esperadas.

**Dos detalles, ninguno rompe hoy:**

1. Los **orígenes de JavaScript** autorizados son
   `https://pmo-frontend-antoniosanchez-5466s-projects.vercel.app` y
   `http://localhost:3000`. El dominio que sirve el producto y que está en
   `WEB_URL` —`pmo-frontend-ten.vercel.app`— **no está**. No importa **porque
   este flujo es de servidor**: el navegador va a `/auth/google` con una
   navegación completa y el origen JS no interviene. Importaría el día que
   alguien añada un botón de Google del lado del cliente, y ese día la
   configuración parecerá correcta de un vistazo.
2. Las **tres tablas de permisos están vacías** —no sensibles, sensibles y
   restringidos— mientras la app pide `gmail.modify` y `gmail.send`, que son
   restringidos. En una app **Interna** es legítimo y no hay verificación que
   pase. El efecto es que **la consola dice que esta app no pide nada**, y la
   respuesta real solo está en `auth.constants.ts`.

### 46.8 🔵 Nadie inicia sesión desde el 20 de agosto

El cliente OAuth dice **«Última fecha de uso: 20 de agosto de 2026»** (con el
aviso de Google de que el dato puede retrasarse un día). Hoy es el 24.

No es un fallo — es un dato de producto que conviene tener delante cuando se
decide qué arreglar: **el producto lleva cuatro días sin que nadie entre.** Y va
con una advertencia de Google que sí es accionable: **un cliente OAuth sin uso
durante seis meses se elimina**, con aviso previo y 30 días para restaurarlo.

### 46.9 Lo que NO he podido revisar

- ~~**Upstash**~~ — **revisado al final de la sesión**, en cuanto el Jefe dio
  permiso a la extensión. Va en §46.11.
- **El espacio de Google Chat** donde caen las alertas. No lo abro: la URL del
  webhook es una credencial y no es cosa de un barrido de lectura.
- **El importe exacto de la factura de GCP.** Llegué a la cuenta vinculada («Mi
  cuenta de facturación», y hay **varias** cuentas en la organización) y no
  entré al informe de costes.

### 46.10 Lo que enseña el barrido

Las tres pasadas de código encontraron 27 hallazgos y **ninguno de ellos era una
cuenta atrás**. Los dos más urgentes de hoy —**$8.14 de crédito** y **una factura
que empezó el 19**— no están en el código, no los ve una prueba, no los ve el
CI, y no los ve ninguna de las dos capas de vigilancia que llevamos un mes
construyendo.

**Vigilamos lo que el sistema hace y no lo que el sistema consume.** Y de las dos
formas de que esto se pare un martes por la mañana, la segunda es hoy la más
probable.

### 46.11 Upstash, ya con permiso: **369 k de 500 k**, y el barrido se ve en el número

Cierra el hueco declarado en §46.9. La consola, hoy 24-08:

| | |
|---|---|
| Comandos (mes) | **369 k** |
| Almacenamiento medio | 250 KB |
| Coste | **$0.00** |
| Base | `pmo-redis` (clean-flamingo), AWS US-EAST-2, **Free Tier** |

**La proyección de §32.5 se sostiene.** Aquella decía: *«con el peor de los dos
números se cierra agosto en torno a 435 k de 500 k, así que la fecha de
agotamiento del 29-30 queda cancelada»*. Con los datos de hoy:

| Fecha | Comandos | Ritmo |
|---|---|---|
| 14-08 | 177 k | — |
| 18-08 22:15 | 297 k | ~30 k/día (antes del ajuste) |
| 19-08 16:04 | 305 k | ~10,8 k/día (después) |
| **24-08** | **369 k** | **~12,8 k/día** |

Quedan **131 k y siete días**: a este ritmo agosto cierra sobre **459 k de
500 k**. No se agota — con un margen del 8 %, que es más estrecho de lo que decía
mi estimación y sigue siendo suficiente.

**Y hay un dato que no esperaba encontrar: el barrido de reconciliación se ve en
el contador.** El ritmo pasó de **10,8 k/día** (medido el 19-08) a **12,8 k/día**
(hoy), unos **+2 k/día**, y en medio solo se desplegó una cosa que toque Redis de
forma periódica: el barrido cada 15 minutos del 21-08 —96 pasadas al día, cada
una con su lectura y escritura de `huerfanos-vistos` más el `remove`/`add` de los
que encuentre—.

O sea: **el barrido cuesta alrededor de un 18 % más de comandos de Redis**, y esa
factura no estaba en la comparación cuando se eligió frente al ping y a
`min-instances=1`. No cambia la decisión —sigue siendo la única de las tres que
recoge los huérfanos— pero **el «coste: cero» con el que se aprobó era el de
Cloud Scheduler, no el del sistema entero**.

⚠️ **Con la salvedad de siempre** ([[pmo-medir-redis-upstash]]): el contador de
la consola **redondea a miles**, así que los ritmos derivados de restar dos
lecturas arrastran ese error. La tendencia es sólida; el segundo decimal, no.

---

## 47. Verificación en frío y segunda pasada (2026-08-25)

Encargo de Doc, `TRABAJAR`, en dos partes. **Suite: 686 pruebas en verde, 1
dormida, 35 suites** — y la dormida es exactamente la que aparece abajo.

---

## Parte 1 — Lo entregado: ¿arregla o tapa?

### 47.1 ✅ El `version.json` arregla de verdad

Comprobado **en producción**, no en el repositorio:

```
cache-control : no-cache, no-store, must-revalidate
x-vercel-cache: MISS          age: 0
commit        : 7c0d79782f6a99bc9164d1fc813df93d2ffda2cf
construido    : 2026-08-25T16:48:08Z
```

- **Sin caché**, declarado en `vercel.json` y confirmado en la respuesta viva.
- **Coincide con lo desplegado**: `7c0d797` es descendiente de `d141f71`, que es
  el último commit que toca `apps/web` o `packages/shared`. **Nada pendiente.**
- **Clones superficiales resueltos**: el `ignoreCommand` hace
  `git cat-file -e "$VERCEL_GIT_PREVIOUS_SHA^{commit}"` y, si falla o la variable
  viene vacía, **`exit 1` → construye**. Falla hacia el lado seguro, que es el
  correcto: ante la duda, desplegar.

### 47.2 🟠 Pero la configuración que publica la sonda **no dispara su propio despliegue**

El `ignoreCommand` solo mira `':(top)apps/web'` y `':(top)packages/shared'`.
**`vercel.json` no está en esa lista.** Así que un commit que solo cambie
`vercel.json` —las cabeceras, la regla de ignorado— produce un diff vacío, sale
con 0, y Vercel **cancela**. El cambio de configuración se queda inerte hasta que
alguien empuje, por otro motivo, algo del frontend.

No es hipotético: **de los cinco commits que han tocado `vercel.json`, tres no
tocaban el frontend** — `f4afa28` (el propio arreglo de clones superficiales),
`adad87d` y `ccbd498`.

Y lo que lo hace desagradable es que **se oculta a sí mismo**: arreglas las
cabeceras, no se despliega, las cabeceras siguen viejas — y la herramienta con la
que ibas a comprobarlo, `version.json`, sigue enseñando el build anterior. La
conclusión natural es «el arreglo no funcionó», que es la equivocada.

Hoy no ha mordido porque las cabeceras viajaron junto a cambios de frontend.

### 47.3 ✅ El socket: el cliente está entero, y el diagnóstico del servidor es mejor que el mío

Las **tres condiciones** que el propio docblock del gateway exigía para
reencender, cumplidas:

| Condición | Dónde |
|---|---|
| Escuchar `SESSION_EVENTS.rechazada` y refrescar | `useSocket.ts:102-118` — `apiFetch('/auth/refresh')` y reconecta; si falla, al login |
| `connect_error` que distinga caducada de inválida | `:120-136` — mismas dos ramas |
| Tope de reintentos | `:95` — `reconnectionAttempts: 5` |

El contrato vive en `packages/shared` (`CODIGO_SESION`, `SESSION_EVENTS`,
`SesionRechazadaEvento`), que era la pieza que faltaba para que @Gravity
programara contra un nombre y no contra un mensaje.

Del lado del servidor: el rechazo se hace **en middleware** con `next(err)`
llevando `err.data.codigo`, y `session.service` mapea `TokenExpiredError` →
`caducada` y todo lo demás → `invalida` —incluido un token de refresco usado como
de acceso, que es `invalida` con razón: refrescar no lo arregla—.

**Y el docblock explica la causa raíz mejor de lo que la expliqué yo.** En §43.1
escribí «el cliente no escucha `connect_error`». La verdad era más honda: **ese
evento no llegaba a dispararse nunca**, porque el código viejo *aceptaba* la
conexión y después llamaba a `disconnect()` — y eso, desde el cliente, no es un
rechazo: es una caída de red, ante la cual socket.io reconecta indefinidamente y
**con razón**. No había nada que escuchar. Mi hallazgo era correcto en el efecto y
flojo en el porqué.

**Y las 21 llamadas con `fetch` crudo son cero:** `tasks.api` 9, `time.api` 9,
`tags.api` 3, `copilot.api` 4 — las 25 por `apiFetch`.

### 47.4 🟠 Pero el interruptor del servidor sigue apagado, y ya no hace falta

`tasks.gateway.ts:116` → **`REVALIDACION_ACTIVA = false`**, y
`tasks.gateway.handshake.spec.ts:159` → **`it.skip`**. Es la única prueba dormida
de las 687.

El archivo dice, literalmente, qué tenía que pasar para encenderlo:

> *«el día que `apps/web` escuche `SESSION_EVENTS.rechazada`, se pone
> `REVALIDACION_ACTIVA = true`, se cambia este `it.skip` por `it` y se borra la
> prueba de arriba»*

**Ese día llegó** — es §47.3, entregado hoy. Y mientras el interruptor siga
apagado sigue abierto lo que el propio docblock declara sin suavizar: **un socket
abierto sobrevive a su token, y si el usuario cierra sesión el socket sigue
oyendo** hasta que se caiga por otro motivo.

Ojo con la distinción, porque es la que decide la urgencia: **el rechazo en el
handshake ya funciona en los dos lados** —conectar con cookie caducada o inválida
está cubierto—. Lo que falta es la **revalidación periódica**, o sea el socket que
ya está dentro cuando su token vence. Con un usuario es una molestia; el propio
docblock dice que **con dos es una fuga de datos entre personas**.

### 47.5 ✅ Y de paso, el resto de la cola verificada

| Hallazgo | Estado |
|---|---|
| **§43.2** `fetchMessages` perdía correos en silencio | ✅ Ahora devuelve `{ correos, fallidos }` y los cuenta |
| **§43.3** `receivedAt` de la cabecera del remitente | ✅ `fechaDeRecepcion` cubre los **tres** casos: sin cabecera, ilegible y **futura** → cae a `internalDate`. Y deja escrito por qué la cabecera sigue siendo primera opción (no mover la fecha de los 247 ya guardados), «para que sea una decisión y no un descuido» |
| **§45.1** inyección de cabeceras por el asunto | ✅ **En dos capas**: `unaSolaLinea()` dentro de `encodeHeader` y un `@Matches` en el DTO que rechaza los caracteres de control con mensaje propio |
| **§44.2** zona horaria | ✅ `ZONA_POR_DEFECTO = 'America/Cancun'` |
| **§45.2** deriva de +5 h en los tramos | ✅ |
| **§45.3** `URGENT` en el formulario | ✅ enum y desplegable |
| **§43.5** `emit` difunde a todos si falta `userId` | ❌ **Sigue igual** (`:407-411`) |

---

## Parte 2 — Segunda pasada: dos hallazgos, los dos en una junta

### 47.6 🔴 El `cc` del borrador se pierde entre la propuesta y el envío

El backend lo tiene resuelto de punta a punta:

- `parseDraftEmail` (`tools.ts:325`) normaliza `cc` **siempre**, vacío si no hay,
  y el docblock dice por qué: *«para que la interfaz no tenga que distinguir "sin
  copia" de "campo ausente"»*.
- `SendEmailDto` lo acepta con `@IsEmail({}, { each: true })`.
- `buildRawMessage` emite la cabecera `Cc:` cuando llega.

**Y en `apps/web/src/features/copilot/` la palabra `cc` no aparece ni una vez.**
`CopilotDrawer` arma la tarjeta con `{ id, to, subject, body }` y
`DraftEmailCard` envía `{ to, subject, body }`.

Consecuencia, de punta a punta: le pides *«responde a Ana con copia a Luis»* → el
modelo propone `to: [ana]`, `cc: [luis]` → **la tarjeta enseña solo a Ana** → das
a enviar → **Luis no recibe nada**, y nada lo dice. Tú crees que la copia salió
porque la pediste.

Es la firma exacta de esta casa: **un campo que el backend normaliza
expresamente para facilitarle la vida al frontend, y que el frontend no lee.**

### 47.7 🟠 El error de etiqueta duplicada muere en la consola

La cadena está construida entera para explicar el fallo… y se tira en el último
paso:

1. `Tag` tiene `@@unique([userId, name])`.
2. `tags.service.create` captura el `UNIQUE_VIOLATION` y lanza
   `ConflictException('Ya tienes una etiqueta llamada "X".')` — específico, en
   español, con el nombre dentro.
3. `useTags.createTag` **no lo captura**: lo propaga bien.
4. `TagManagerModal.handleCreate` hace `console.error('No se pudo crear la
   etiqueta:', error)` **y nada más**.

Sin `toast`, sin estado de error, y **sin limpiar el campo** —`setName('')` solo
corre en el camino bueno—. El usuario pulsa «crear», el botón deja de girar, y
**no pasa nada**. Repetirá, y volverá a no pasar nada.

Lo que lo convierte en hallazgo y no en opinión: **todos los demás modales del
proyecto usan `toast.error`** —`TimeEntriesModal`, `TimeReportModal`,
`AiValidationModal`, `InboxPage`—. Éste es el único que no.

Y `useTags.fetchTags` tiene la misma forma: si la carga de etiquetas falla, se
registra en consola y el desplegable sale **vacío en silencio**, indistinguible de
«no tienes etiquetas».

### 47.8 🔵 Menor

`TimeReportModal` recarga con `useEffect([isOpen, groupBy])` **sin contador de
generación**: cambiar de agrupación dos veces seguidas puede dejar en pantalla el
informe de la anterior. Es la misma carrera que ya se arregló en `KanbanBoard`
(§37.9) y en `useInbox` (§37.11) — el patrón existe en la casa y aquí no se
aplicó. Bajo impacto: es un modal y el reloj no se usa.

### 47.9 Lo que enseña

Los dos hallazgos de la segunda pasada están **en una junta**, como los seis
graves de las tres pasadas anteriores. Y el del `cc` añade un matiz nuevo: no es
que faltara el contrato ni que estuviera mal documentado — **es que el backend
hizo trabajo extra explícitamente para el frontend, lo dejó escrito, y el
frontend no se enteró.**

Un contrato que una de las dos partes no ha leído no es un contrato: es una
suposición con buena letra.

---

## 48. Verificación de la Segunda Pasada: el código está bien, el frontend no está desplegado (2026-08-25)

Encargo de Doc. **Los doce arreglos están en el código y son correctos.** Y once
despliegues seguidos han fallado, así que **ninguno de los de frontend está en el
navegador de nadie**.

---

### 48.1 🔴 El frontend lleva 11 despliegues fallidos y ~35 minutos congelado

Producción, ahora mismo:

```
version.json → commit 7c0d797  ·  construido 2026-08-25T16:48:08Z
```

Ese es el build de **hace una hora**. Desde entonces, en el panel de Vercel:
**once despliegues consecutivos en `Error`**, de `2a0e915` a `b37fd0d`. El último
`Ready` es `7c0d797`, y es el que tiene la insignia de Producción.

Y hay **siete commits que tocan el frontend** sin desplegar — entre ellos
`7a3cd68`, que es el que trae **los cuatro arreglos de §47** que se me pidió
verificar.

**La causa, literal, del panel de Vercel:**

> **Build Failed** — *The `vercel.json` schema validation failed with the
> following message: `ignoreCommand` should NOT be longer than 256 characters*

Medido:

| | |
|---|---|
| `ignoreCommand` actual | **270 caracteres** |
| Límite de Vercel | **256** |
| Exceso | **14** |
| Quitando `' vercel.json'` del pathspec | **256 exactos** |

O sea: **el comando anterior estaba justo en el techo**, y añadir `'vercel.json'`
—catorce caracteres— lo pasó de largo. Falla en la **validación del esquema**,
antes de construir nada: por eso la duración es `—` y no hay log de build.

**Y aquí está lo que más me importa decir: el arreglo de §47.2 es lo que rompió
todos los despliegues.** Mi hallazgo era que `vercel.json` no disparaba su propio
despliegue. Ahora los dispara — y todos mueren en la puerta. **El hallazgo era
correcto y su arreglo, tal como cabía, no cabía.**

### 48.2 🟠 Por qué cuatro intentos seguidos no lo cazaron

Entre `7a3cd68` y ahora hay **cinco commits dedicados a esto**:

```
d2bb589  chore(web): bump version to 0.1.1 to trigger deployment
0426073  fix(ci): restore vercel.json single key invariant …
e4c26d1  fix(ci): normalize ignoreCommand exit codes to strictly 0 or 1
7063e6b  fix(ci): clean ignoreCommand with vercel.json in pathspec
37727b9  fix(ci): use vercel.json path in ignoreCommand
```

Los cinco tocan **el contenido** del comando —el disparo, los códigos de salida,
la forma del pathspec, la invariante de la clave—. Ninguno toca **su longitud**,
que es lo único que importaba. Los cinco siguen por encima de 256 y fallan
idénticamente.

_Es una inferencia mía a partir de los títulos, y la marco como tal: parece que
se diagnosticó **«no se dispara»** cuando lo que pasaba era **«se dispara y no
valida»**. Son dos síntomas que desde fuera se parecen mucho — en los dos casos
el sitio no cambia._

### 48.3 🔵 La Capa 1 hizo su trabajo, y aun así no acortó el diagnóstico

**Los avisos salieron.** El workflow «Avisar si falla Vercel o el CI» tiene seis
ejecuciones en verde por `deployment_status` a las 17:45, 17:50, 17:51, 17:56 y
17:59 — una por despliegue fallido. La Capa 1 funciona: se enteró de los once y
lo dijo.

Lo que el aviso **no lleva es la causa**. Su formato es título, commit y enlace:

```
🔴 *Despliegue fallido: …*
Commit: …
Log: …
```

Con el enlace basta para llegar, pero **no dice qué falló**. Y en este caso la
causa cabía en catorce palabras. No es un defecto del diseño —el aviso se hizo
para que nadie tuviera que ir a buscar el sitio, y eso lo cumple— pero es la
diferencia entre seis avisos que llevan a la puerta y seis avisos que resuelven
el problema.

⚠️ **Y una ejecución del vigilante falló**: la de las 17:56:35, sobre `9d08a00`.
De los once fallos, **uno no se comunicó**. No he mirado por qué; queda anotado.

### 48.4 ✅ Los doce arreglos, verificados en el código

Todos correctos. Que no estén desplegados es otro problema, y es el de arriba.

| Hallazgo | Estado | Dónde |
|---|---|---|
| **§47.6** el `cc` del borrador | ✅ **Completo por las tres patas**: `CopilotDrawer:167` lo arma, `DraftEmailCard:102-113` lo pinta y lo deja editar, `:32` lo envía | frontend |
| **§47.7** el error de etiqueta | ✅ `toast.error(err.message ...)` y limpieza del campo | frontend |
| **§47.2** `vercel.json` en su pathspec | ✅ …y es lo que rompió el despliegue (§48.1) | infra |
| **§47.8** carrera en `TimeReportModal` | ✅ `generationRef` | frontend |
| **§45.2** deriva de +5 h | ✅ | frontend |
| **§45.3** `URGENT` en el formulario | ✅ | frontend |
| **§47.4** interruptor del socket | ✅ `REVALIDACION_ACTIVA = true` **y** el `it.skip` reencendido a `it` | backend |
| **§43.5** `emit` sin `userId` | ✅ **Falla cerrado**: ya no difunde, registra un `error` y explica el precio | backend |
| **§45.1** inyección `\r\n` en el asunto | ✅ En dos capas | backend |
| `aiConfidence` pintaba un `0` | ✅ `typeof … === 'number'` | frontend |
| `TriageEmail` muerto | ✅ Ya no existe | frontend |
| `Start`/`Stop` en inglés | ✅ `▶ Iniciar` / `⏹ Detener` | frontend |

**Y el ritmo diario está mejor de lo que pedía el encargo.** Se pidió «dividir
entre los días con datos observados, no siempre entre 7». `ritmoDiario` hace algo
distinto y más correcto: divide entre **los días transcurridos desde el primer
dato**, no entre los días que tienen fila, con el motivo escrito —*«un sábado sin
correos es un cero real y tiene que pesar en la media; descontarlo inflaría el
ritmo y adelantaría el aviso sin motivo»*—. Y `divisorDeRitmo` lo acota por
arriba y por abajo (`Math.min(7, Math.max(MINIMO, cubiertos))`), así que ni una
ventana corta ni una larga lo distorsionan. **Eso no es cumplir el encargo: es
haberlo pensado mejor.**

Backend en producción: revisión `pmo-api-00107-gz4`, `SERVICE_VERSION = 9d08a00`
— **al día**. Suite: **verde**.

### 48.5 Lo que enseña

Hoy hay dos verdades a la vez y conviene no mezclarlas: **el código está bien y
el producto no lo tiene.** Doce arreglos correctos, uno de ellos bloqueando la
entrega de los otros seis.

Y la forma es la de esta casa otra vez, con una vuelta de tuerca: **el hallazgo
era bueno, el arreglo era el correcto, y aun así rompió** — porque nadie sabía
que había un techo de 256 caracteres a catorce de distancia. No fue un descuido
de nadie; era un límite invisible **hasta que se tocó**.

Lo que sí se puede aprender: el comando estaba **exactamente** en 256 antes de
esto. Un ajuste que deja un recurso al borde de su límite no está terminado,
está **apoyado**. Y lo siguiente que se le añada lo tirará igual, así que la
solución no es recortar catorce caracteres: es sacar el comando del `vercel.json`
y dejarlo donde pueda crecer.

---

## 49. Análisis completo, sin memoria previa (2026-08-25)

Encargo del Jefe: leer **todo** el código con ojos limpios —sin consultar
bitácoras ni mis propios informes— y listar cuanto perciba, incluido el lenguaje
y la programación sin sentido.

**Alcance real, sin adornos.** El árbol son **28.544 líneas**: 112 archivos de
backend (13.841), 36 de pruebas (9.493), 39 de frontend (4.945), `packages/shared`
(265) y la infraestructura. He leído **entera** toda la lógica —servicios, guards,
estrategias, procesadores, DTO, componentes con estado— y he recorrido por
inspección los módulos de Nest, los ficheros de índice y los componentes que solo
pintan. **De las 36 suites de pruebas he leído tres**; no las cubro aquí.

Diecinueve hallazgos. Ninguno es una catástrofe: **el código es
sistemáticamente bueno**, y eso me obliga a decir dónde exactamente falla en vez
de repartir impresiones.

---

## A. Backend

### 49.1 🟠 El error se pierde justo donde se pregunta por él

`overdue.cron-purge.ts:71`

```ts
this.logger.error(
  'No se pudo purgar el cron BullMQ de vencidas (¿Redis caído?). Puede quedar un barrido duplicado.',
  error,          // ← el objeto, en la ranura del stack
);
```

Es **exactamente** la trampa que `describir-error.ts` existe para evitar, y que su
docblock describe así: *«la segunda ranura es el stack y espera una cadena; al
pasarle un objeto, el formateador de pino lo descarta»*. Ese archivo dice que ya
costó dos días de ingesta rota y que se repitió en nueve sitios.

**Este es el décimo, y está escrito después de la lección.** El mensaje pregunta
«¿Redis caído?» y tira a la basura lo único que respondería. La forma correcta la
usa el resto del proyecto: `` `…: ${describirError(err)}` `` con `stackDe(err)`.

### 49.2 🟠 Si el `watch` de Gmail falla al iniciar sesión, nadie se entera

`gmail.processor.ts:47-52`

```ts
this.logger.log(`Activando watch de Gmail para el usuario ${userId}`);
await this.gmailService.watchInbox(userId);   // ← se ignora lo que devuelve
```

`watchInbox` devuelve `{ ok, motivo }`, y su docblock explica por qué: *«desde que
`/cron/gmail-watch` recorre a todos los usuarios hace falta saber **cuántos**
quedaron observados de verdad, porque un “renovados: 0 de 1” es la diferencia
entre la ingesta viva y apagada»*.

Aquí se descarta. Consecuencias encadenadas:

- El job **termina en éxito** aunque Gmail rechace el `watch`.
- Los `attempts: 3` con backoff que `auth.controller.ts:114` configura **no se
  usan nunca**, porque para reintentar hace falta que el job falle.
- No hay aviso, y el `ok:false` que `renovarWatchDeTodos` sí sabe reportar no
  llega a este camino.

O sea: alguien inicia sesión, su buzón **no queda observado**, y el sistema lo da
por hecho. Se cura solo al día siguiente a las 02:30 con el cron de renovación —
pero el primer inicio de sesión es justo cuando importa.

### 49.3 🟠 Cinco horas al mes en las que el gasto de IA parece cero

`ai-cost.service.ts` mezcla dos husos en la misma cuenta:

| Qué | Cómo se calcula |
|---|---|
| El día de cada fila (`registrar`) | `diaLocal()` → **America/Cancun** |
| El inicio del mes (`estimar`) | `Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)` → **UTC** |

El 31 de agosto a las 20:00 de Cancún ya es 1 de septiembre en UTC, así que
`desdeMes` salta a septiembre mientras las filas de ese día siguen etiquetadas
`2026-08-31`. El filtro `dia >= desdeMes` **las deja todas fuera**.

Resultado: entre las **19:00 y las 24:00 hora local del último día de cada mes**,
`gastado` sale ≈ 0, `consumido` ≈ 0 y **ningún umbral puede saltar**. El log diría
«$0.00 de $20 (0%)» en el momento en que el total del mes es el más alto.

⚠️ **Hoy es latente**: el cron corre a las **08:00 America/Cancun**, fuera de esa
ventana. Muerde el día que alguien mueva la hora o llame a `/cron/coste-ia` a
mano por la tarde de un fin de mes.

### 49.4 🟠 El precio de guardia se queda corto justo donde se prometió que no

`precios-modelo.ts` razona su fallback así: *«se estima por arriba a propósito…
que se pase es recuperable; que se quede corta es cómo se llega a cero sin
aviso»*. Y luego lo fija en **$5/$25**, que es la tarifa de Opus 5.

Pero la familia tiene modelos por encima: **Fable 5 y Mythos 5 están a
$10/$50**. Si alguien pone `COPILOT_ANTHROPIC_MODEL_PRO=claude-fable-5` —que es
justo el caso «alguien añadió un modelo sin pasar por aquí» que el fallback
existe para cubrir—, **la estimación sale a la mitad**. El principio está bien
escrito y el número no lo cumple.

De paso, la tabla no lista `claude-fable-5`, `claude-opus-4-7` ni
`claude-opus-4-6`, que son ids vigentes.

### 49.5 🟠 `Promise.all` dentro de una transacción, que este proyecto prohíbe dos veces

`email-classification.service.ts:150`

```ts
return Promise.all(toCreate.map((data) => tx.task.create({ data })));
```

`tasks.service.ts` y `emails.service.ts` llevan **cada uno** un comentario que
dice lo contrario: *«Secuencial y no `Promise.all`: Prisma desaconseja lanzar
consultas concurrentes sobre el cliente de una transacción interactiva»*.

Una transacción interactiva de Prisma va por **una sola conexión**; disparar N
`create` a la vez sobre `tx` es exactamente lo que las otras dos evitan. Que
funcione hoy no lo convierte en correcto: es la misma regla escrita dos veces y
rota en el tercer sitio.

### 49.6 🟠 La sonda del frontend puede gritar por un `.md`

`frontend-al-dia.service.ts` declara su propia invariante:

> *«Es el mismo criterio que usa el `ignoreCommand` de Vercel, **y tiene que
> seguir siéndolo**. Si aquí se mira una lista y allí otra, la sonda avisa de
> despliegues que Vercel se salta a propósito.»*

**Ya no es el mismo criterio, y en las dos direcciones:**

| | Sonda (`RUTAS_DEL_FRONTEND`) | `scripts/vercel-ignore.sh` |
|---|---|---|
| `apps/web` | ✅ | ✅ |
| `packages/shared` | ✅ | ✅ |
| `vercel.json` | ❌ **falta** | ✅ |
| Excluir `**/*.md` | ❌ **no excluye** | ✅ excluye |

La segunda fila es la peligrosa. `ultimoCommitDelFrontend` pregunta a GitHub por
el último commit que tocó `apps/web` **sin filtrar `.md`**. Un commit que solo
toque un `.md` de esa carpeta se convierte en `referencia`, Vercel **no
construye** —lo excluye a propósito— y, pasada la hora de margen, la sonda
declara **`atrasado` de forma permanente** hasta que llegue un cambio de frontend
de verdad.

Es literalmente el fallo que su propio comentario predice: *«una sonda que avisa
de lo normal se deja de mirar en una semana»*.

_Hoy no hay ningún `.md` bajo esas rutas, así que está latente. Lo activa el
primer `README.md` que alguien añada a `apps/web`._

### 49.7 🟡 El agujero del título en blanco se tapó en un DTO y no en el otro

`ConfirmedTaskDto` se arregló bien —`@Transform(trim)` + `@MinLength(1)`, con
cinco pruebas—. **`CreateTaskFromCopilotDto` sigue con `@IsString()` +
`@IsNotEmpty()`**, que no rechaza `'   '`.

Y no hay segunda barrera: `copilot.service.createTask` llama a
`this.tasks.create(userId, {…} as never)`, **saltándose `CreateTaskDto`** —que sí
recorta y exige longitud—. Así que un título de espacios desde la tarjeta del
copiloto crea una tarjeta en blanco en el tablero.

### 49.8 🟡 Tres asimetrías de validación entre DTO hermanos

- **`UpdateTaskDto.description`** no tiene `@MaxLength`; `CreateTaskDto` la
  limita a 5.000. Se puede engordar por la puerta de atrás lo que no se puede
  crear por la de delante.
- **`CreateEntryDto.taskId`** y **`QueryTimeDto.taskId`** no tienen `@MaxLength`,
  cuando todos los demás campos de id del proyecto llevan `@MaxLength(64)`
  (`sourceEmailId`, `emailId`, `threadId`, `taskId` del contexto del copiloto).
- **`UpdateEntryDto`** deja mandar `endedAt` sin `startedAt`. Si el servicio no
  revalida el rango contra lo guardado, un tramo puede quedar con fin anterior al
  inicio; conviene comprobarlo al arreglarlo.

### 49.9 🟡 La versión que publica `/health` no es la que inyecta el despliegue

`service-context.ts:16`

```ts
export const SERVICE_VERSION =
  process.env.K_REVISION ?? process.env.SERVICE_VERSION ?? '0.1.0';
```

En Cloud Run **`K_REVISION` siempre existe**, así que gana siempre y la variable
`SERVICE_VERSION` —que `deploy.yml` se molesta en rellenar con el SHA de git— **no
se usa nunca ahí**. `/health` responde `version: "pmo-api-00107-gz4"`, que es el
nombre de la revisión: identifica el despliegue pero **no dice qué commit corre**,
que es la pregunta que este proyecto se hace todo el rato.

### 49.10 🔵 Tres detalles menores, comprobados

- **`gcp-logging.traceFieldsFrom`**: `flags === '01'` da por no muestreada
  cualquier otra combinación con el bit activo (`'03'`); y del formato
  `X-Cloud-Trace-Context` se toma el `spanId` **en decimal**, donde Cloud Logging
  espera hexadecimal. El camino preferido (`traceparent`) es correcto.
- **`subidaCercana`** devuelve **solo la primera** subida pendiente (`for … return`).
  Hoy solo hay una; con dos, la segunda no se menciona.
- **`precioDe`** compara con `new Date('2026-08-31')`, que es medianoche **UTC**:
  la subida se aplica cinco horas antes en hora local. El sentido del error es el
  seguro (estima de más), pero corta el día en un huso distinto al del resto del
  proyecto.

---

## B. Frontend

### 49.11 🟠 El semáforo del backend no puede ponerse en rojo

`App.tsx:139-147`

```tsx
{health ? (
  <span className="h-3 w-3 … bg-green-500" />
  <span>{health.status.toUpperCase()}</span>
```

El punto se pinta **verde siempre que `health` tenga valor**, sin mirar
`health.status`. Y el endpoint elegido es **`/health`**, que por diseño responde
`status: 'ok'` sin tocar ninguna dependencia — su propio docblock lo dice: *«No
comprueba dependencias, a propósito»*.

O sea: la tarjeta que dice «Estado del backend» **solo puede estar verde o
desconectada**. Con Postgres caído y Redis caído seguiría verde. La respuesta de
verdad la da `/health/ready`, que la interfaz no consulta.

Y se agrava: el `useEffect` tiene dependencias `[]`, así que **se consulta una vez
al montar y nunca más**. Es un semáforo permanentemente verde mostrando un valor
de cuando se abrió la pestaña.

### 49.12 🟡 La nota del gráfico dice algo que empeora con cada despliegue

`DashboardPage.tsx:92`

> *«Las tareas completadas antes del **último despliegue** no tienen registro de
> fecha y no aparecerán aquí.»*

No es el último despliegue: es **desde que se empezó a escribir `completedAt`**,
una fecha fija. Tal como está, el texto le dice al usuario que **cada despliegue
le borra el histórico**, que es alarmante y falso. `metrics.service` lo tiene bien
explicado en su docblock; la interfaz lo repite mal.

### 49.13 🟡 «Bandeja Pendiente» se repite a sí misma y con la etiqueta equivocada

```tsx
value={inbox.pending}
subtitle={`Total: ${inbox.byStatus.PENDING || 0} sin leer`}
```

El subtítulo enseña **el mismo número** que el valor, con otro nombre. Y ese otro
nombre es incorrecto: `PENDING` es un estado de **triage**, no de lectura. El
esquema lo dice expresamente —*«es una decisión de la persona y no del sistema:
`processedAt` dice que el worker ya lo analizó, que es otra cosa»*—. La tarjeta
llama «sin leer» a correos que se han leído y no se han despachado.

### 49.14 🟡 Dos tarjetas de métricas con el color fijo

`trend="good"` está **codificado a mano** en «Completadas (Ventana)» y
`trend="neutral"` en «WIP» y «Bandeja Pendiente». Cero tareas completadas en la
semana se pinta igual que cincuenta. Solo «Atrasadas» calcula su color de verdad
(`overdue.count > 0 ? 'bad' : 'good'`).

### 49.15 🔵 La pantalla de entrada lleva un andamio de desarrollo

`LoginPage.tsx:29`

```tsx
<span className="…">Sprint 1 · Autenticación</span>
```

Es lo primero que ve cualquiera que abra el producto, y es vocabulario interno
del plan de trabajo.

---

## C. Lo que está bien, y hay que decirlo

Un listado de defectos sobre una base de este nivel miente por omisión. Cuatro
cosas que he intentado romper y no he podido:

- **`google-oidc.verifier.ts` falla cerrado** en los dos casos en que podría fallar
  abierto: sin audiencia configurada y sin cuenta esperada. Y explica por qué una
  firma de Google **no acredita** que la llamada sea nuestra.
- **`logger.config` + `gcp-logging`** tapan `cookie`, `authorization`, `set-cookie`
  y once parámetros de consulta —`code`, `state`, `token`…—, y el comentario dice
  que el `code` de OAuth ya se filtró una vez y por eso existe la lista.
- **`describir-error.ts`** saca el motivo real de los rechazos de Google, que
  `googleapis` esconde dos niveles adentro en `err.response.data.error`.
- **`con-plazo.ts`** limpia el temporizador perdedor en un `finally`, con la
  historia de cómo se descubrió: siete pruebas triviales tardando 24 segundos.

## D. Lo que enseña este barrido

Los hallazgos de hoy **no son de arquitectura**: son de **regla escrita y no
aplicada en el tercer sitio**. El `logger.error(msg, error)` que un archivo entero
existe para prohibir. El `Promise.all` en transacción que dos servicios prohíben
por escrito. La invariante «misma lista que el `ignoreCommand`» rota en el archivo
que la declara. El título en blanco tapado en un DTO y no en su hermano.

**Este proyecto documenta sus reglas mejor de lo que las cumple.** Y no por
descuido: cada una está escrita en el sitio donde se aprendió, y **ninguna está
escrita en el sitio donde se repite**. Un comentario solo protege el archivo en el
que vive.

Lo que convertiría esto en otra cosa es que las cuatro reglas de arriba fueran
**comprobables** —una regla de ESLint para `logger.error` con dos argumentos, una
prueba que compare las dos listas de rutas, un DTO base para los títulos— en vez
de párrafos que hay que recordar. La diferencia entre una regla escrita y una que
se sostiene sola ya la dice el propio proyecto en otro sitio: *«olvidarse NO
COMPILA»*.

---

## 50. Despertar del 2026-08-26: los seis commits que quedaban sin auditar

**Chequeo estándar, primero.** Árbol limpio, `master` y `origin/master` en
`a31384e`, sin nada sin commitear. CI en verde, despliegue en `success`. La API
sirve `7a85831` —y `SERVICE_VERSION` en Cloud Run es ese mismo SHA, así que
**§49.9 está cerrado**: `/health` ya sabe decir qué commit corre—. Vercel sirve
`259c91f`, posterior al último commit de `apps/web`; la sonda lo confirma cada
media hora (*«sirve 259c91f · referencia ba609aa · comparación: ahead»*).
`/health/ready` responde 200 con Postgres, esquema y Redis arriba. Los **seis**
disparadores de Cloud Scheduler están `ENABLED` y con intento de hoy.

Los dos últimos commits (`5b8df3a`, `a31384e`) no dispararon CI, y **está bien**:
son solo `.md` y los salta el `paths-ignore` de `ci.yml`, que existe justo para
eso.

Desde mi última verificación (§49, que cerró en `f65ca20` y `780ad95`) hay
**seis commits de código** sin auditar. Ninguno de los seis lleva ruido de fin
de línea —`--numstat` y `--numstat --ignore-cr-at-eol` dan lo mismo en los
seis—, que era la comprobación que me quedé debiendo desde `36938c9`.

### ✅ `8219b96` + `7dd3152` — `DashboardMetrics` sale a `@pmo/shared`

Correcto. Borra 70 líneas de `metrics.types.ts` y reexporta el contrato de
`packages/shared`. Lo que había que comprobar no es la forma, que se ve, sino
**los enums**: un `Record<TaskStatus, number>` se rompe en silencio si las dos
definiciones no coinciden **en los valores**. Coinciden una a una las tres
—`TaskStatus`, `TaskPriority`, `EmailStatus`— entre `packages/shared/src/index.ts`
y `apps/api/prisma/schema.prisma`. Las cuatro decisiones que documentaba el
docblock borrado siguen escritas, en el docblock del compartido.

`7dd3152` es la coleta: `TaskStatus` se sigue usando en `MetricsSummary`,
`EmailStatus` y `TaskPriority` ya no. **Un commit de una línea porque el anterior
no compilaba** — la lección que dejé escrita al cerrar §49 (`npx tsc --noEmit`
antes de commitear) todavía no se está aplicando.

### ⚠️ `8453d3f` — reabrió §49.11 durante dieciséis minutos

Movió el latido de `/health/ready` a `/health` para tapar la fuga de Upstash. El
motivo era bueno y el efecto no: `/health` contesta 200 con la base caída **por
diseño**, así que el semáforo volvió a no poder ponerse en rojo — que es el
hallazgo §49.11, cerrado esa misma tarde en `f65ca20`.

Vivió en `master` de 18:12:45 a 18:28:58. **No he comprobado si Vercel llegó a
servirlo** en esa ventana.

Lo anoto no para señalar el commit, que se corrigió solo en el siguiente, sino
por la forma: **un cambio que baja profundidad para bajar coste está reabriendo
un hallazgo, y debería decir cuál.** Aquí los dos hallazgos —la fuga de cuota y
el semáforo ciego— viven en el mismo `useEffect` y tiran en direcciones
opuestas; sin nombrarlo, cada arreglo parece completo por su lado.

### ✅ `c36d84e` — el cron de coste, cada hora

Correcto, y comprobado en producción: `pmo-coste-ia` está en `0 * * * *`,
`ENABLED`, con último intento hoy a las 21:00:35Z. Era mi hallazgo del hueco más
ancho de los seis disparadores, y está cerrado.

Lo que había que auditar de verdad era el freno, porque acelerar una cadencia es
como se rompen: `FRENO_S` sigue en 23 h contra una cita horaria, que está
veintitrés veces al lado seguro. **La regla es «igual o menor que la cadencia», y
23 h > 1 h.** Correcto.

Y los dos supuestos que colgaban de la hora del cron también:

- `cubiertos` es fraccionario y se mide con `instanteLocal()`, así que el día en
  curso pesa por las horas vividas y el ritmo no salta a cada medianoche.
- La ventana se corta por días locales —hoy y los seis anteriores— en vez de
  restar 168 h, así que no cambia de tamaño veinticuatro veces al día.

Queda un sesgo residual y **va en dirección segura**: `primerDia` es el primer
día **con fila**, no el principio de la ventana, así que un parón de varios días
se descuenta del divisor y el ritmo sale **inflado** → el aviso llega antes. Está
declarado en el docblock. No es un defecto.

### ⚠️ `ba609aa` — el semáforo ya puede ponerse en rojo, pero dice la causa equivocada

Cierra bien lo que reabrió `8453d3f`: `/health/ready` siempre, cada 300 s, con
`/health` detrás solo para pintar `version` y `uptimeSec` sin gastar cuota. De
~2.900 comandos de Upstash al día por pestaña a ~288. Eso está bien.

**Y quedan dos cosas, las dos comprobadas en el código:**

1. **La rama roja de `health.status` es inalcanzable.** `health` solo se puebla
   desde `/health`, que por diseño contesta `ok` siempre. En `App.tsx:179`,
   `health.status === 'ok' ? verde : rojo` **nunca toma la rama roja**, y
   `health.status.toUpperCase()` siempre imprime `OK`. El único rojo que llega a
   pintarse es el del ramal `error`.

2. **Una caída de dependencias se anuncia como «Sin conexión con la API», y es
   falso.** Con Postgres o Redis caídos, `/health/ready` devuelve **503**;
   `apiFetch` lanza ante cualquier `!ok` (`api.ts:59-72`) y el cuerpo de Terminus
   no trae `message`, así que el texto se queda en el de por defecto. La tarjeta
   pinta: *«Sin conexión con la API (GET /health/ready → 503)»*. **Un 503 es la
   prueba de que la API sí contestó.** El mensaje se contradice con la evidencia
   que lleva dentro, y manda a mirar la API cuando lo que está caído es Redis.

   Y esto no es un descubrimiento: **es la consecuencia que declaré en la
   revisión del plan de §49**, antes de que se ejecutara. Se arregló la
   profundidad de la sonda y no se trató el 503.

*Menor, de la misma familia:* la tarjeta se titula `Estado del backend
(/health/ready)` y los dos datos que enseña salen de `/health`.

### ✅ `de1a6ed` — `precioDelDia`, y es mejor que mi hallazgo

Yo marqué §49.10 parte 3 como **decisión, no arreglo**: mover el umbral a hora
local vuelve la estimación menos conservadora, y eso no lo decido yo.

**La solución no elige huso: parte la función en dos escalas.** `precioDe` para
instantes, `precioDelDia` para fechas de calendario, comparando `YYYY-MM-DD`
como texto —que en ISO ordena igual que el calendario— sin convertir nada a
instante. Comprobada la premisa: `diaLocal` (`ai-cost.service.ts:373-381`)
guarda el día local como medianoche UTC, así que `toISOString().slice(0,10)`
recupera exactamente el día que se quiere. Y **los dos únicos sitios que reciben
un `fila.dia` ya llaman a `precioDelDia`**; el `precioDe` que queda es para leer
`revisadoEl`, que no depende de la fecha.

De paso cierra **§49.4**: `PRECIO_DESCONOCIDO` sube a $10/$50 —ahora sí cumple su
propio principio de estimar por arriba— y entran `claude-fable-5`,
`claude-opus-4-7` y `claude-opus-4-6`.

Es el commit que mejor sale de los seis: cogió un hallazgo que yo di por ambiguo
y encontró el defecto real que había debajo.

---

## 50.1 Y lo que vi mirando producción, que no está en ningún commit

### 🔴 El único vigilante del crédito no puede dispararse

El cron de coste corre cada hora y escribe esto, medido hoy a las 21:00:35Z:

```
Coste IA · $0.53 de $20 (3%) · ritmo $0.32/dia · quedan 60 dia(s) · precios de 2026-08-25
```

Tres cosas, y las tres comprobadas:

1. **`PRESUPUESTO_IA_USD` no está en Cloud Run.** Comprobado en
   `gcloud run services describe pmo-api`: no aparece entre las variables del
   contenedor. Así que corre con `PRESUPUESTO_POR_DEFECTO = 20`.
2. **El umbral es inalcanzable al ritmo real.** `UMBRALES = [0.75, 0.9]`, así que
   el primer aviso pide **$15 de gasto dentro del mes en curso** —`estimar` corta
   en `desdeMes` (`ai-cost.service.ts:148-152`), o sea gasto mensual, que se
   reinicia el día 1—. A $0.32/día, un mes entero suma **$9.92**. El 75 % no se
   cruza nunca.
3. **«Quedan 60 días» se mide contra los $20, no contra el saldo.** El saldo real
   de Anthropic eran **$8.14** el 24-08 (§46.1), no lo conoce ninguna línea de
   este código, y **no se reinicia el día 1**. El número que sale del log es unas
   tres veces el que importa, y va en la dirección de «queda más de lo que
   queda» — la misma que este módulo declara peligrosa dos veces en sus propios
   docblocks, una para el modelo desconocido y otra para el divisor del ritmo.

O sea: **se construyó el vigilante que pedía §46.1 y quedó midiendo otra cosa.**
Vigila *gasto mensual contra un presupuesto de ejemplo*; lo que se acaba es *un
saldo prepagado*. Y el 31 de agosto —dentro de cinco días— Sonnet 5 sube un 50 %,
que es el modelo que hace toda la clasificación.

*Lo que no afirmo:* si el presupuesto **debe** seguir al saldo de Anthropic o ser
un tope de gasto propio es decisión de producto, no mía. Lo que sí es defecto,
decida lo que decida el Jefe: **hoy no hay ningún valor de `PRESUPUESTO_IA_USD`
configurado, y con el que hay por defecto la alarma no puede sonar.**

### ⚠️ El freno sigue sin registrarse, y ahora calla veinticuatro veces al día

`alert.service.ts:84` escribe `ALERTA · …` **antes** de consultar
`debeMandarse()`. Es el hallazgo que dejé en §47 —*un freno cuyo efecto no se
registra no se puede auditar*— y sigue abierto.

Lo que cambia es el precio. Con la cita diaria era una línea ciega al día; desde
que el cron es horario son veinticuatro. Hoy, de 16:01Z a 21:00Z, seis líneas
`WARNING` idénticas anunciando la subida del 31. `FRENO_SUBIDA_S` son 7 días, así
que a Google Chat le habrá llegado **una** — pero eso lo deduzco leyendo el
código, no el log, que es justo el problema.

---

**No cierro nada.** Cuatro cosas para repartir: los dos defectos de `ba609aa`, el
presupuesto sin configurar y el freno sin instrumentar.

---

## 51. Sesión de uso real con el Jefe, en el navegador (2026-08-26)

Primera vez que audito **usando la aplicación** en vez de leerla. El Jefe abrió la
suya, trabajó, y me pidió que interactuara y le dijera qué siento. Todo lo de
abajo está medido en producción.

> **Sin nombres ni contenido, por orden del Jefe.** Aquí van mecánicas: endpoints,
> códigos, tiempos y números. Los correos son de clientes reales y este cuaderno
> viaja a GitHub.

### Mecánicas medidas

**Arranque en frío — cinco llamadas, todas 200:**

```
GET /auth/me
GET /tags
GET /emails?status=PENDING&take=20
GET /health/ready      ← toca Postgres y Redis
GET /health            ← solo para pintar version y uptime
```

**Latido:** ese par de salud se repite cada 5 min mientras la pestaña siga
abierta (~288 comandos de Upstash al día por pestaña). Las métricas no se piden
hasta entrar en su pestaña.

**Mover una tarjeta:** `PATCH /tasks/{id}/move` → 200. **Una sola petición**,
interfaz optimista, arrastre fluido. Funciona bien.

**El socket:** su vida es **lo que le quede al access token**, no quince minutos.
`programarCaducidad` (`tasks.gateway.ts:258`) programa contra la caducidad
absoluta, así que un socket que nace tarde vive poco. Ciclos medidos: **2m38s** y
**2m32s**. El cierre y la vuelta, con refresco de cookie y reingreso a la sala,
tardaron **434 ms**. La alternancia en el log del backend es estricta: **nunca
hubo dos sockets vivos**, así que la invariante que el propio hook documenta se
cumple. La revalidación de §47.4 queda **comprobada viva en producción**, que era
lo que faltaba.

### Lo que el Jefe reporta, comprobado en el código

**1. Las tareas se crean solas.** `EmailDetailModal.tsx:127` enseña
`🪄 Generar Tareas (IA)` **solo si `!isProcessed`**. Todo lo que la tubería ya
procesó llega con las tarjetas hechas: no hay paso donde una persona diga cuáles
sí. El botón manual existe únicamente para lo que la IA no tocó.

**2. Del correo no hay salida hacia sus tareas.** Ese mismo botón, una vez
procesado, queda `disabled` con `cursor-not-allowed` y el texto
`✅ Convertido a Tareas`. Es la única pista, y es un cartel, no un enlace.

**Y el vínculo sí existe en la base:** `model Email` declara `tasks Task[]`. **No
falta el dato, falta el enlace.** De todo lo del día es lo que más me llama la
atención: el trabajo caro está hecho y lo que sobra es una línea de interfaz.

**3. Los adjuntos no existen en el sistema.** `model Email` no tiene campo ni
relación de adjuntos. Y `gmail.service.ts:330-347` dice por escrito que cuando
Gmail manda `attachmentId` en vez de `data` **no se descarga**, y que en esos
casos *«el cuerpo se pierde»*. No es que falte el botón de descargar: **el
archivo nunca entra**. Por eso el Copiloto no puede analizarlo — no está ciego,
es que no hay nada que mirar. _Y el mismo comentario admite que hay correos cuyo
cuerpo también se pierde por esa causa._

**4. El Copiloto tiene dos herramientas.** `tool-runner.service.ts:59-60`
despacha exactamente `SEARCH_EMAILS` y `GET_METRICS`; cualquier otra cosa cae en
`Herramienta desconocida`. Lo que el Jefe cita de su respuesta —que solo ve el
agregado del tablero y no el origen de cada tarea— **es literalmente cierto**.
No se resiste: no tiene por dónde. Conviene decirlo, porque un modelo que declara
bien sus límites es lo contrario de un problema.

**5. El número, dicho por la propia aplicación:** *333 tareas — 300 en TODO, 3 en
curso, 1 pospuesta, 1 hecha, 28 vencidas.* Sobre una bandeja de veinte correos
cargados. Eso es la saturación que reporta, cuantificada.

**6. Los hilos se deciden por mensaje.** Un hilo del día traía **doce mensajes**,
cada uno una fila `Email` propia (`gmailMessageId @unique`), cada una clasificada
por separado. La agrupación por `threadId` es **solo de pintado**: los botones de
triaje viven en la cabecera y los mensajes anidados solo ofrecen «Copiloto».
Responder dentro del hilo crea un mensaje nuevo, que entra, se clasifica y vuelve
a marcar. El esquema **tiene `threadId` indexado** y la decisión no lo usa.

### 🆕 7. El cronómetro y la columna no se hablan

Hallazgo mío, de mover cosas:

- Arrastré una tarjeta de *Por Hacer* a *En Progreso*. El `PATCH .../move`
  devolvió 200 y la tarjeta se movió. **Su reloj siguió en `0s`, con el botón en
  `▶ INICIAR`.**
- Y la primera tarjeta del tablero lleva **167 h 55 m corriendo** —siete días—
  **sentada en *Por Hacer***, con su botón en `⏹ DETENER`.

Hay una columna que se llama «En Progreso» y un cronómetro por tarjeta, y ninguno
de los dos sabe del otro. Se puede estar «en progreso» con cero segundos y se
puede acumular una semana de reloj sin haber empezado. **Y el efecto en las métricas es el contrario del que supuse al escribirlo:**
comprobado en la pantalla de Métricas, *Tiempo Registrado* marca **0.0 hrs** en la
ventana del 20 al 26 de agosto, con ese reloj corriendo desde hace siete días. Un
cronómetro que nunca se detiene **no cierra su `TimeEntry`**, así que no suma: no
envenena la métrica, **desaparece de ella**. Siete días de trabajo que el tablero
cree que son cero.

### Lo que enseña la sesión

Las siete cosas de arriba no son siete defectos: son **dos**, repetidos.

**El primero es que falta la capa de decisión.** La tubería clasifica, propone y
**ejecuta** de un tirón. En ningún punto hay un sitio donde una persona diga
«esta sí, esta no». De ahí salen las tareas que nadie pidió, las tres tarjetas por
correo y las 300 en TODO. No es un fallo de la IA: la IA hace bien su parte. Es
que **entre proponer y crear no hay nadie**.

**El segundo es que la unidad está equivocada.** El sistema decide sobre
**mensajes**; el Jefe trabaja sobre **asuntos**. Doce mensajes de una misma
conversación son un asunto, y para el sistema son doce entradas, doce
clasificaciones y doce oportunidades de crear tarjetas. Los adjuntos, el hilo que
se vuelve a marcar y el «no sé qué tareas salieron de este correo» son la misma
grieta vista desde tres lados.

Y una cosa que conviene decir porque es la buena noticia: **la fontanería está
por encima del producto.** El arrastre es instantáneo, el movimiento cuesta una
sola petición, el socket se revalida solo en 434 ms, el Copiloto declara sus
límites con honestidad y el backend contesta en décimas. Lo que falta no es
capacidad: es **dónde se decide y sobre qué se decide**.

**No cierro nada.**

---

## 51.1 El correo de prueba del Jefe, cronometrado de punta a punta

A mitad de la sesión el Jefe mandó un correo de prueba **diseñado**: un cuerpo con
**seis tareas numeradas**, una de ellas *«lee el archivo adjunto»*, y un adjunto de
verdad. Luego respondió al hilo con una línea. Quedó grabado entero.

### La tubería, con reloj

```
22:53:04.015  Webhook de Gmail recibido (historyId 6612163)
22:53:04.128  POST /webhooks/gmail 200
22:53:04.521  Sync incremental: 1 encolado, 1 guardado
22:53:04.599  Procesando clasificación de email …owg8s001z
22:53:12.318  Resultado de IA: isActionable=true, 6 tareas creadas   ← 8,3 s

22:54:05.796  Webhook de Gmail recibido (historyId 6612237)
22:54:10.681  Sync incremental: 0 encolados
22:54:12.560  Resultado de IA: isActionable=true, 6 tareas creadas   ← 6,7 s
```

**De correo recibido a tarjetas en el tablero: menos de nueve segundos.** Eso
funciona, y funciona bien.

### 🔴 Y aquí está la duplicación, probada con entrada controlada

El cuerpo del primer mensaje pedía **seis** tareas. Se crearon **seis**: la
clasificación es exacta.

Después el Jefe **respondió al hilo** con una sola línea —*«anotado procedo a
trabajar en ello»*— y ese mensaje, cuyo cuerpo es su línea **más las seis tareas
citadas debajo**, se clasificó otra vez y creó **otras seis**.

**Doce tarjetas de seis tareas reales.** No es una estimación ni una inferencia:
son dos líneas de log con el mismo número, sobre una prueba que el Jefe diseñó.

Y el mecanismo generaliza mal: **cada respuesta arrastra el hilo citado**, así que
un hilo de N mensajes reclasifica el mismo contenido N veces. El hilo que audité
antes tenía **doce mensajes**. Eso es lo que hay detrás de las **300 tareas en
TODO**: no son trescientas cosas que hacer, son unas pocas contadas muchas veces.

_El sistema tiene `threadId` indexado y `gmailMessageId @unique`. Decide sobre el
segundo e ignora el primero._

### 📎 El adjunto: la prueba salió como estaba escrito

El correo traía adjunto y una tarea que decía *«lee el archivo adjunto»*. En el
detalle del correo **no aparece el adjunto por ningún lado**: ni nombre, ni icono,
ni descarga. Concuerda con `model Email`, que no tiene campo ni relación para
adjuntos, y con `gmail.service.ts:330-347`, que declara que las partes con
`attachmentId` **no se descargan**.

Así que la IA creó una tarea que **le pide a alguien leer un archivo que el
sistema nunca guardó**. Es la mejor ilustración posible del hueco: no es que el
Copiloto no sepa leerlo, es que el archivo no entró.

### 🔴 Y una que sale de la pantalla de Métricas, y es de las gordas

| Pantalla | Qué dice |
|---|---|
| **Bandeja** | «20 correos · 8 conversaciones» |
| **Métricas → Bandeja Pendiente** | **329** · *«Total: 329 sin despachar»* |

**La bandeja tiene 329 correos pendientes y la pantalla de la bandeja dice
veinte.** Es mi hallazgo de esta sesión —`take=20` y `emails.length`— visto desde
el otro lado, y con el factor puesto: **16 veces**. No es un contador impreciso;
son dos pantallas de la misma aplicación dando dos verdades sobre lo mismo, y la
que el Jefe mira todos los días es la que se queda corta.

_Se ve además cómo muerde: al entrar el correo de prueba, el hilo que antes
enseñaba doce mensajes pasó a enseñar **once**. Algo salió de la página cargada y
**nada lo dijo**._

### ✅ Lo que sí quedó cerrado, y conviene anotarlo

- **§49.12 está cerrado, y mejor de lo que pedí.** La nota del gráfico ya no dice
  «antes del último despliegue»: dice *«las tareas completadas antes de que se
  empezara a registrar la fecha (`completedAt`) no aparecerán aquí»*. Eso es
  exacto y no asusta con algo falso.
- **§49.13 sigue abierto**, tal cual: *Bandeja Pendiente* repite `329` en el valor
  y en el subtítulo.

### 💸 Y el precio de una pregunta al Copiloto, medido

```
Copiloto (claude-opus-5): 13672 entrada / 871 salida
```

A tarifa de Opus 5 ($5/$25 por millón): **≈ $0.09 la pregunta**. Con los ~$8.14 de
saldo eso son **unas noventa preguntas**, y el nivel `Pro` viene seleccionado por
defecto en el cajón. Es el dato que le faltaba a §50.1 para que la decisión de
`PRESUPUESTO_IA_USD` se tome con un número delante.

### 🟡 Menor, del mismo log: dos avisos vacíos por cada correo

Por cada correo real llegaron **tres** webhooks de Gmail, y **dos sincronizaron
cero correos** (22:53:56 y 22:54:10). Cada uno cuesta un webhook, un trabajo en
la cola, una llamada al historial de Gmail y su ida y vuelta a Redis. No rompe
nada; multiplica por tres el tráfico de la ingesta.

---

## 52. Despertar del 2026-09-07: máquina nueva, y una rotación a medias

> ## ⚠️ LEER ANTES QUE NADA — la premisa de §52.1 era falsa
>
> Escribí toda esta sección creyendo que **la máquina se había formateado y
> saneado por seguridad**. **No ocurrió.** Es un portátil nuevo y la información
> se recuperó íntegra desde un respaldo de disco. No hubo incidente.
>
> **La corrección entera, con lo que cae y lo que sobrevive, está en §52.10 al
> final.** Se resume así: la medición del `.env.txt` sigue en pie tal cual; lo que
> deduje de ella, no. Y **mi recomendación se invierte** — véase §52.10.

Doce días desde §51. Portátil nuevo, restauración íntegra desde respaldo de
disco. Este barrido es completo pero **cojo, y hay que decirlo antes que nada**:
no hay credenciales de nube en esta máquina, así que `gcloud` y `gh` no han
contestado ni una vez. Todo lo que digo de producción sale de sondas HTTP sin
sesión.

### Chequeo estándar

| Qué | Resultado |
|---|---|
| `git log` | HEAD `a31384e`, **el mismo que el 26-08**. Cero commits en doce días. |
| `git status` | `ALANA.md` +408, `DOC.md` +18, `package-lock.json` ±1 — **sin commitear** |
| Herramientas | node 24.19.0 · npm 11.17.0 · git 2.55.0 · gh 2.100.0 · gcloud 583.0.0 · docker 29.7.2 — todas reinstaladas |
| **Credenciales** | `gh auth status` → *not logged into any host*. `gcloud auth list` → *No credentialed accounts* |
| `core.hooksPath` | `.githooks` — **sobrevivió al restore**, el portero pre-commit sigue armado |
| `npm ci --dry-run` | exit 0 con el lock de HEAD |
| Lint | 0 en los tres espacios de trabajo |
| Pruebas | **712 en 36 suites, todas en verde** |
| `tsc --noEmit` | limpio en `apps/api` y en `apps/web` |
| API en producción | `/health` 200 → `7a85831` · uptime **215.946 s (≈2,5 días)** |
| `/health/ready` | 200 · database up (189 ms) · schema 11 aplicadas / 0 a medias / 0 revertidas · redis up (140 ms) |
| Frontend | `pmo-frontend-ten.vercel.app` sirve `259c91f`, construido `2026-08-25T23:30:05Z` |

Nada se ha movido en doce días, y el sistema **sigue en pie solo**: la base, el
esquema y Redis responden, y el servicio lleva dos días y medio sin reiniciarse.

**Dos apuntes del chequeo que no son rutina:**

- **`pmo-frontend.vercel.app` sigue sirviendo otra aplicación entera** —
  `<title>Vite + React</title>` contra el `PMO Dashboard` de `apps/web/index.html`.
  Es §13, y cumple hoy **veintiocho días abierto**.
- **Un uptime de 2,5 días significa que Cloud Run no ha escalado a cero en 2,5
  días.** Con `--no-cpu-throttling` eso es CPU asignada todo ese tiempo. Es la
  consecuencia esperada del barrido cada 15 min, pero es la primera vez que la
  mido: la decisión de §37.7 se tomó cuando esto era gratis, y sigue sin revisarse
  con la factura delante.

---

### 🔴 52.1 La rotación de credenciales se generó y **no se aplicó**

En la raíz hay un `.env.txt` **creado hoy a las 12:04**, con los mismos 24 campos
que `.env` (del 25-08, restaurado del respaldo). Comparados campo a campo por
hash, sin mirar ni un valor:

```text
CLAVE                        .env       .env.txt   ¿igual?
ANTHROPIC_API_KEY            521ab37b   11a875bb   >>> NO <<<
GEMINI_API_KEY               98db66ca   eb8ce2c1   >>> NO <<<
GOOGLE_CLIENT_SECRET         27f49213   4c279b6d   >>> NO <<<
JWT_SECRET                   cab228ab   9200086e   >>> NO <<<
TOKEN_ENCRYPTION_KEY         c0df944d   f74df9ae   >>> NO <<<
DATABASE_URL · REDIS_URL · API_URL · WEB_URL · GOOGLE_REDIRECT_URI
GMAIL_PUBSUB_TOPIC · los tres CLAUDE_MODEL_* · NODE_ENV · …    todos iguales
```

**Cambian los cinco secretos y ni una sola pieza de configuración.** Eso no es
una edición: es una rotación. Y las formas lo confirman — `JWT_SECRET` pasa de 32
caracteres a 64, y `GEMINI_API_KEY` **cambia de familia entera**, de `AIzaSy…`
(39) al formato nuevo `AQ.Ab8R…` (53).

**Confirmado por el Jefe: las claves se generaron y no se han aplicado en ningún
sitio.** De ahí sale el hallazgo, y es el más grave del día:

> **Se formateó la máquina para sanearla, y las credenciales que vivían en esa
> máquina siguen vivas en producción.** El disco se limpió; lo que el disco
> contenía, no.

Un formateo cierra el acceso al equipo. No cierra una `sk-ant-…`, una
`GOCSPX-…` ni una clave de Gemini: valen desde cualquier sitio del mundo y no
saben en qué máquina estuvieron. **Mientras el juego viejo no se revoque, el
saneamiento está a medias, y la mitad que falta es la que protege.**

*Lo que no afirmo:* si hubo compromiso real, cuál fue el vector, ni si alguien
llegó a copiarlas. No lo puedo ver desde aquí y no me hace falta para el
hallazgo: **una credencial que estuvo en una máquina que hubo que formatear se
rota, se sepa o no lo que pasó.**

### 🟠 52.2 Y la aplicación lee el fichero viejo, no el nuevo

`app.module.ts:48` fija `envFilePath: ["../../.env", ".env"]`.

**`.env.txt` no lo lee nadie, ni ahora ni nunca.** No es un fichero de
configuración: es una nota. Hoy conviven dos juegos de secretos en la raíz, **el
que manda es el viejo**, y nada en el árbol dice cuál es cuál.

Los dos están cubiertos por `.gitignore` — `.env.*` alcanza a `.env.txt`, lo
comprobé con `git check-ignore` — así que **ninguno ha viajado a git**. Eso está
bien, y es mérito de la regla que se escribió el 18-08.

*Detalle de forma:* `.env.txt` trae además tres líneas pegadas de la consola de
Google (`ID del proyecto`, `Nombre del proyecto`, `Número del proyecto`) que no
son variables. Está montado a mano, y se nota.

### 🟡 52.3 El `.env` local apunta a la base de **producción**

```text
.env          DATABASE_URL = postgresql://<cred>@34.59.49.175:5432/pmo
.env.txt      DATABASE_URL = postgresql://<cred>@34.59.49.175:5432/pmo   (igual)
.env.example  DATABASE_URL = postgresql://<cred>@localhost:5432/pmo      ← lo correcto
```

Con `NODE_ENV=development`. Un `prisma migrate reset` o un `db push` desde esta
terminal apunta ahí.

**Hoy no muerde, y lo comprobé en vez de suponerlo:** abrí un socket contra
`34.59.49.175:5432` y no contesta. Las redes autorizadas de Cloud SQL siguen
vacías desde el 19-08. El riesgo es **latente**, no activo — vive del día en que
alguien reabra la IP para un rato y se olvide de este fichero.

*Menor, de la misma familia:* el `JWT_SECRET` de `.env` es literalmente el
marcador de posición de `.env.example` (`cambia-…`, 32 caracteres). El entorno
local nunca tuvo un secreto propio. No es explotable — es local — pero explica
por qué el de `.env.txt` sí está bien generado.

### ✅ 52.4 Si la rotación se aplica, `TOKEN_ENCRYPTION_KEY` tiene consecuencia — y está prevista

La miré porque es la única de las cinco que **cifra datos en reposo**: cambiarla
no invalida una sesión, deja ilegible lo guardado.

Rastreada entera, y el código lo tenía escrito antes que yo:

```text
crypto.service.ts:78    decryptJson → lanza si la etiqueta no cuadra
users.service.ts:56-62  getGoogleCredentials → captura, registra
                        «TOKEN_ENCRYPTION_KEY cambió», devuelve null
auth.service.ts:99-104  getAuthorizedClient → convierte ese null en 401
                        «debe volver a autorizar»
```

Y el trabajo de fondo tampoco se queda mudo: `renovarWatchDeTodos`
(`gmail.service.ts:1179`) cuenta los fallos y, si `renovados < usuarios`,
**dispara `avisar()` a Google Chat con el motivo dentro**, no un contador a secas.

**O sea: aplicar la clave nueva no rompe nada en silencio.** El efecto es que
todo usuario con Google conectado tiene que volver a autorizar, y el sistema lo
dice. Lo anoto como cosa que hay que saber **antes** de aplicarla, no como
defecto.

*Lo único que le pondría:* ese aviso llega por el cron de las 02:30, así que
entre aplicar la clave y enterarse pueden pasar hasta 24 h. Si se aplica,
conviene disparar `/cron/gmail-watch` a mano justo después en vez de esperar al
reloj.

### 🟠 52.5 `npm audit` no se ha ejecutado **nunca** en este proyecto

Cero menciones en los 426 KB de este cuaderno. Lo ejecuté hoy:

```text
todas las dependencias        29 vulnerabilidades (4 bajas, 14 medias, 11 altas)
solo produccion --omit=dev    15 vulnerabilidades (1 baja,   9 medias,  5 altas)
```

**El número que importa es el segundo**, y por eso lo separo: casi todas las
altas del primero son herramienta de construcción — `webpack`, `@nestjs/cli`,
`inquirer`, `tmp` — que no viaja al contenedor.

De las que sí llegan a producción, dos merecen nombre:

- **`qs`** (media, DoS remoto) — **es alcanzable**: Express analiza la cadena de
  consulta con `qs` en cada petición y la API está en internet abierto.
  `npm audit fix` lo cubre **sin cambio de ruptura**.
- **`multer`** (alta, cinco avisos de DoS) — entra de arrastre por
  `@nestjs/platform-express`. **No hay subida de ficheros en el producto** (§51.1:
  los adjuntos ni siquiera existen en el modelo), así que no hay ruta que lo
  alcance. Su arreglo **sí** es de ruptura. Yo no lo tocaría todavía.

Lo que va al registro no es la lista: es que **un proyecto que construyó tres
capas de vigilancia y probó su bóveda con fuego real nunca le preguntó a sus
dependencias**. Es el hueco de §46 visto desde otro lado — vigilamos lo que el
sistema hace, no de qué está hecho.

### 🟡 52.6 Un volcado de producción de hace 19 días sigue en la raíz

`pmo-2026-08-19T083205Z.dump` — 227.573 bytes, formato `PGDMP` (pg_dump custom),
del 19-08. Comprobé su **forma**, no su contenido: dentro están las tablas
`User`, `Email`, `Task`, `Tag` y `TimeEntry`. Es el volcado del simulacro de
restauración, el de las 394 filas reales.

Está en `.gitignore` (`*.dump`) y **nunca ha viajado a git** — lo verifiqué
recorriendo las 413 revisiones. Pero **sobrevivió intacto a un formateo hecho por
seguridad**, porque volvió dentro del respaldo del código: un volcado de correo
de clientes reales, sin cifrar, en un directorio de trabajo, diecinueve días
después de haber cumplido su función.

Es la regla que este proyecto ya escribió en otro sitio: *«el código con fecha de
caducidad se retira el día que caduca»*. Esto también.

### 🟡 52.7 Dos directorios sin ignorar que un `git add` masivo se llevaría

| Qué | Tamaño | Estado |
|---|---|---|
| `.venv-auditors/` | **229 MB** | creado hoy 13:23 por Antigravity (`google_antigravity 0.1.16`, `google_genai`) · **NO ignorado** |
| `.claude/` | pequeño | `settings.local.json` · **NO ignorado** |

Ninguno de los dos debe viajar. Hoy la casa se salva por una regla de conducta
— *«añadir por ruta, nunca `git add -A`»* — y no por el `.gitignore`. **Una regla
que se sostiene sola vale más que una que hay que recordar**, y esta cuesta dos
líneas.

### ⚪ 52.8 El lock desincronizado, y **no** rompe — comprobado, no supuesto

`package-lock.json` registra `apps/web` en `0.1.0`; el `package.json` de HEAD dice
`0.1.1` desde `d2bb589`. Cualquier `npm install` local vuelve a ensuciar el
fichero, que es por lo que sale en `git status` hoy.

Iba a reportarlo como riesgo de CI. **Lo probé antes de escribirlo**: devolví el
lock a HEAD y `npm ci --dry-run` sale **exit 0**. No rompe la construcción. Queda
en cosmético — un fichero permanentemente sucio, que ya es de por sí una
invitación a colarlo en un `add`.

### 🔴 52.9 La evidencia de dos auditorías vivió doce días en un solo disco, y ese disco se formateó

`ALANA.md` tenía al despertar **408 líneas sin commitear**: §50, §50.1, §51 y
§51.1 — el barrido de los seis commits, el vigilante de crédito que no puede
dispararse, la sesión de uso real con el Jefe y el correo de prueba cronometrado
con la duplicación probada. `DOC.md` tenía otras 18.

**Se salvaron por el respaldo, no por el proceso.** Y este cuaderno lleva escrito
desde su primera línea que existe porque *«la evidencia es lo único que no se
puede reconstruir después»*.

No lo commiteo yo: mi alcance es escribir aquí. **Lo levanto como lo que es — el
hallazgo con la ventana de pérdida más grande de todo el barrido — y con dueño:
Doc.** El resto de la casa exige que el trabajo llegue a producción para contar;
la auditoría tiene la misma regla, y hoy no la cumplió.

---

### Lo que sigue abierto de §50 y §51 — verificado hoy línea a línea

Sin commits en doce días esperaba que siguieran todos. Lo comprobé igualmente en
el archivo, porque un estado verificado caduca en cuanto alguien actúa:

| Ref | Qué | Comprobación de hoy |
|---|---|---|
| §50.1 | `PRESUPUESTO_IA_USD` sin configurar; con los $20 por defecto y `UMBRALES=[0.75,0.9]` el aviso no puede sonar | `ai-cost.service.ts:10,37,362` — **abierto, idéntico** |
| §50.1 | La rama roja de `health.status` es inalcanzable | `App.tsx:179-180` — **abierta**; `health` sigue poblándose solo desde `/health` |
| §50.1 | La tarjeta se titula `/health/ready` y pinta datos de `/health` | `App.tsx:176,183` — **abierta** |
| §47 | El freno de alertas no deja rastro cuando **calla** | `alert.service.ts:84` — matizado abajo |
| §51 | Falta la capa de decisión; la unidad es el mensaje y no el hilo | sin cambios |
| §51.1 | La bandeja dice 20 y Métricas dice 329 (§49.13) | sin cambios |
| §13 | `pmo-frontend.vercel.app` sirve otra aplicación | **comprobado hoy: sigue** |

**Y una corrección mía sobre §47, que es de las que este cuaderno debe hacerse a
sí mismo.** Releí `alert.service.ts:78-84` y encima de esa línea hay un
comentario que no cité en §50.1:

> *«Se registra siempre, se mande o no: el log es la fuente de verdad y la alerta
> solo una notificación. Si el webhook está caído, la información no se pierde.»*

**Eso es una decisión deliberada, y es la correcta.** Registrar antes del freno no
es el defecto; yo lo presenté como si lo fuera. El hueco real es más pequeño y
más concreto: **no hay una segunda línea que diga que el freno silenció el
aviso.** No sobra el log de arriba — falta el de abajo. Un `debug` de una línea
en el `return` de `debeMandarse` cierra §47 entero.

Lo dejo escrito porque es exactamente lo que me pide la regla del 21-08: lo que
huela a decisión consciente se pregunta o se relee **antes** de afirmarse. Esta
vez lo afirmé primero.

---

### Lo que NO he comprobado, y hoy es mucho

Lo digo con más peso que otras veces, porque **medio barrido no se ha podido
hacer**:

- **Nada en Google Cloud.** Sin `gcloud` autenticado: ni Cloud Logging, ni las
  variables reales de Cloud Run, ni los seis disparadores de Scheduler, ni las
  políticas de alerta, ni la facturación. En §50 los miré todos; hoy, ninguno.
- **Nada en GitHub.** Sin `gh`: ni `gh run list`, ni `gh variable list`, ni los
  estados de despliegue. **No sé si el último CI quedó en verde**; lo doy por
  bueno porque el árbol no se ha movido, que es un argumento débil.
- **Si producción tiene o no las claves nuevas** lo sé por el Jefe, no por haberlo
  visto. Es lo primero que verificaré en cuanto haya credenciales.
- **Nada en navegador todavía.** Esta terminal despertó sin la integración de
  Chrome cargada.
- **Nada de carga**, como siempre.
- **El contenido del volcado**: comprobé su forma y sus tablas; no lo descomprimí
  ni lo abrí, y no pienso hacerlo — es correo de clientes.

**No cierro nada.** Nueve cosas para repartir, y la primera — revocar el juego de
credenciales viejo — no es de @Claude ni de @Gravity: es del Jefe, en las
consolas.

---

## 52.10 Corrección de premisa: no hubo formateo, y me corrige entera (2026-09-07)

**Del Jefe, vía Doc, el mismo día.** No hubo formateo ni saneamiento por
seguridad: es **un portátil nuevo** y la información se recuperó **íntegra desde
un respaldo de disco**. Ningún incidente.

Y explica de paso las tres cosas que yo había atribuido a un formateo: `gh` y
`gcloud` sin sesión —las credenciales viven en el sistema operativo, no en la
imagen del proyecto—, y la supervivencia de las 408 líneas sin commitear y del
volcado del 19-08.

### De dónde salió el error, porque el sitio importa

La instrucción con la que desperté decía, literal, *«la máquina fue formateada y
saneada por seguridad»*. **No me lo inventé; lo heredé.** Pero tampoco lo traté
como lo que era —una frase de un encargo, sin comprobar— sino como un hecho, y
construí §52.1 encima: una vez dentro, cada dato que encontraba se leía a su luz.
El `.env.txt` con cinco secretos distintos, que es una observación neutra, se
convirtió en «las credenciales de la máquina comprometida siguen vivas».

**Y ahí está lo que hay que anotar.** La regla del 21-08 me cerró las tres
bitácoras para que no heredara el relato del que ejecuta. Hoy heredé un relato
igual de decisivo **por el único canal que esa regla deja abierto: el encargo**.
Cerrar las bitácoras y no mirar la premisa del encargo es proteger una puerta y
dejar la otra de par en par.

Lo que debí hacer no era desconfiar del Jefe: era **darme cuenta de que estaba
razonando sobre un suceso del que no tenía ni una prueba en la máquina**. Nunca
busqué una. Un formateo deja rastro —fechas de creación uniformes, perfiles
recién hechos, historiales vacíos— y yo tenía delante lo contrario: `.env` con
mtime del 25-08 y el `.git` entero con doce días de polvo intacto. **La evidencia
para desmentirlo estaba en el mismo barrido que escribí.**

Es la misma forma que ya está dos veces en este cuaderno —los 27 huérfanos que no
eran Redis, la alarma del parseo que no había mordido— pero al revés: aquellas las
desmonté midiendo. Esta la sostuve porque venía de arriba.

### Lo que cae

- **La frase «se formateó la máquina para sanearla y las credenciales siguen
  vivas en producción» está retirada.** No hubo saneamiento y no hay ni un indicio
  de compromiso.
- **Retiro la urgencia de revocar el juego de claves viejo.** Sin incidente, no
  hay nada que cerrar. §52.1 baja de 🔴 a 🟠.
- Y de §52.6 y §52.9 se cae el *«sobrevivió a un formateo»*. Los dos hallazgos
  siguen en pie; lo que era falso es el mérito que les atribuí.

### Lo que sobrevive, que es casi todo — y por qué

**La medición no dependía de la premisa.** Los cinco hashes distintos, los 24
campos idénticos, el `JWT_SECRET` de 32 a 64, la clave de Gemini cambiando de
familia y el `envFilePath: ["../../.env", ".env"]` que hace que **la aplicación
lea el fichero viejo** son hechos comprobados, y siguen exactamente igual. Lo que
cambia es lo que significan.

**El hallazgo reformulado, y ahora es el entero:**

> Hay **dos juegos de credenciales en la raíz**, la aplicación lee uno, el otro no
> lo lee nadie, y **nada en el árbol dice cuál es el bueno**. En una máquina
> recién estrenada, eso no es un resto de una emergencia: es el estado normal en
> el que quedó la mudanza, y es el que va a encontrar el siguiente que abra esta
> carpeta.

### 🔁 Y la recomendación se invierte, que es la parte útil

Ayer, con un incidente detrás, aplicar `TOKEN_ENCRYPTION_KEY` costaba una
reautorización de todos los usuarios **y compraba cerrar una exposición**.

**Sin incidente, el mismo movimiento cuesta lo mismo y no compra nada.** Rotar la
clave que cifra los tokens de Google en reposo obliga a volver a autorizar (§52.4)
a cambio de cero.

**Así que: no la apliquéis.** Ni esa ni las otras cuatro, mientras nadie ponga
encima un motivo que yo no conozca. Y si el motivo existe, que se escriba: hoy
hay un juego de claves nuevo, generado, sin aplicar y sin nota que diga por qué se
generó — que es justo la clase de cosa que dentro de dos meses nadie se atreve a
borrar ni a usar.

**La pregunta que sustituye a mi alarma, y es para el Jefe:** ¿por qué se creó
`.env.txt`? Si fue por dar por perdidas las claves al estrenar portátil y luego
aparecieron en el respaldo, entonces **lo correcto es borrar el fichero nuevo y
revocar las claves nuevas**, no las viejas — al revés de lo que dije esta mañana.

### Lo que empeora, no mejora

Dos cosas cambian de signo al quitar el formateo, y en la dirección mala:

1. **§52.6, el volcado.** Escribí que *«sobrevivió a un formateo hecho por
   seguridad»*. Lo que pasó es peor para un hallazgo de datos en reposo: **un
   volcado de correo de clientes reales se copió, íntegro, a una segunda máquina
   física.** No sobrevivió a nada — **se propagó**. Sigue sin cifrar, sigue sin
   motivo para existir, y ahora ha estado en dos discos.

2. **§52.9, la evidencia sin commitear.** Escribí *«se salvó por el respaldo, no
   por el proceso»*. Con la corrección aguanta mejor, no peor: **no la salvó una
   restauración cuidadosa, la salvó que alguien copiara un disco entero.** Una
   imagen de disco no es un proceso, es una casualidad con buen tiempo. Y el
   recuento de hoy es peor que el de esta mañana:

   ```text
   ALANA.md          698 lineas sin commitear
   CLAUDE_MEMORY.md  102
   DOC.md             18
   .gitignore          4
   ---------------------------------------------
   822 lineas de bitacora y configuracion, en un solo disco
   ```

   **Son las tres bitácoras a la vez, no la mía sola.**

### ✅ Y §52.7 queda cerrado — comprobado por mí, no por el reporte

Doc informa de haber añadido `.claude/` y `.venv-auditors/` al `.gitignore`. Lo
verifiqué en vez de creerlo, que es la regla de la casa:

```text
git check-ignore  .claude                       → IGNORADO
git check-ignore  .claude/settings.local.json   → IGNORADO
git check-ignore  .venv-auditors                → IGNORADO
git check-ignore  .venv-auditors/pyvenv.cfg     → IGNORADO
git status --short                              → sin un solo fichero sin rastrear
```

Cerrado de verdad, y **con la regla sostenida por el fichero y no por la
conducta**, que era el punto.

### Estado

Sin cambios en lo demás. Sigo **sin poder auditar la nube**: `gh` y `gcloud`
esperan a que el Jefe inicie sesión, y hasta entonces §52 vale la mitad de lo que
debería. El siguiente paso de infraestructura arranca ahí.

---

## 53. Revisión de páginas, solo por HTTP (2026-09-07)

**Sin navegador.** La integración de Chrome no llegó a conectarse: la sesión se
relanzó con `--chrome` (comprobado en la línea de órdenes del proceso 14924) y la
extensión *Claude in Chrome* v1.0.91 está instalada en el perfil `Default`, pero
**no me llegó ni una herramienta de navegador**. Así que **no he visto la
interfaz, no he pulsado nada y no he entrado con sesión.** Lo de abajo es lo que
se puede medir desde fuera con `curl`, que resultó no ser poco.

### ✅ Lo que está bien, y conviene decirlo primero

**La superficie de autenticación de la API no filtra nada.** Las seis rutas de
datos, sin sesión:

```text
/auth/me · /tags · /emails · /tasks · /dashboard/metrics · /time/report
  → 401 {"message":"No hay sesión activa","error":"Unauthorized","statusCode":401}
/cron/overdue · /webhooks/gmail · /copilot   → 404 (son POST)
```

Mismo mensaje en las seis, sin traza, sin nombre de tabla, sin decir si el
usuario existe. Es lo correcto.

**El CORS es lista blanca, no espejo** — y lo comprobé falsificando el origen:

```text
Origin: https://atacante.example   → access-control-allow-origin: https://pmo-frontend-ten.vercel.app
Origin: (el legitimo)              → access-control-allow-origin: https://pmo-frontend-ten.vercel.app
```

Devuelve **siempre el mismo**, así que el navegador del atacante bloquea la
respuesta. Con `access-control-allow-credentials: true` esto era justo lo que
había que mirar, porque un CORS que refleja el origen con credenciales activadas
es un agujero de libro. No lo es.

**No hay mapas de fuente publicados:** `/assets/index-JNoC7SoZ.js.map` → 404, y el
paquete de 847 KB no lleva `sourceMappingURL` al final.

**Y la API va vestida entera** (Helmet): `x-content-type-options: nosniff`,
`referrer-policy: no-referrer`, `x-frame-options: SAMEORIGIN`,
`cross-origin-opener-policy: same-origin`, HSTS a un año.

### 🟠 53.1 El tablero se puede meter en un marco ajeno, y la cookie va dentro

Aquí está el hallazgo, y sale de cruzar dos cosas que por separado parecen bien.

**Uno.** El frontend en Vercel se sirve **sin una sola cabecera de protección**:

```text
content-security-policy   >>> AUSENTE <<<
x-frame-options           >>> AUSENTE <<<
x-content-type-options    >>> AUSENTE <<<
referrer-policy           >>> AUSENTE <<<
permissions-policy        >>> AUSENTE <<<
```

**Dos.** En producción la cookie de sesión es `sameSite: "none"`
(`session.service.ts:98`), y **tiene que serlo**: la SPA vive en Vercel y la API
en Cloud Run, son sitios distintos, y con `lax` el navegador descarta la cookie en
silencio. El docblock que hay encima explica esto muy bien, incluso nombra el
arreglo de fondo — un dominio propio que ponga las dos mitades en el mismo sitio.

**Lo que ese docblock no dice es la otra mitad de `None`:** una cookie
`SameSite=None` **también viaja cuando la página está dentro de un `iframe`
ajeno**. Sin `X-Frame-Options` ni `frame-ancestors`, cualquiera puede empotrar el
tablero en su propia página con la sesión del Jefe viva dentro. Y este tablero se
maneja **arrastrando y con botones de un solo clic** —mover, borrar, triar—, que
es exactamente el tipo de interfaz sobre el que un secuestro de clic funciona.

**Y la asimetría, que es lo que lo hace fácil de pasar por alto:**

| | Protección de marco | ¿Alguien la enmarcaría? |
|---|---|---|
| **API** (Cloud Run, Helmet) | `x-frame-options: SAMEORIGIN` ✅ | No: devuelve JSON |
| **Frontend** (Vercel) | **ninguna** | **Sí: es la interfaz** |

**La mitad protegida es la que nadie enmarca, y la desprotegida es el tablero.**
Helmet cubre lo que pasa por Nest; lo que sirve Vercel no pasa por Nest, y nadie
puso ahí el equivalente.

*Lo que no afirmo:* no he podido montar el `iframe` y probarlo — eso necesita
navegador. Afirmo las dos piezas, que sí están medidas: cabeceras ausentes en la
respuesta real, y `sameSite: "none"` en la línea de código.

**Y el arreglo ya tiene sitio hecho:** `vercel.json` **ya lleva un bloque
`headers`** —lo usa para el `Cache-Control` de `/version.json`—. No hay que
inventar mecanismo ni tocar el panel, solo añadir entradas al bloque que existe.

### Lo que queda pendiente del navegador

Lo que iba a mirar y no he podido, para que no se pierda la lista:

- Los dos defectos del semáforo (§50.1): la rama roja inalcanzable de
  `App.tsx:179` y el 503 que se anuncia como *«Sin conexión con la API»*.
- El desfase de §51.1: la bandeja dice 20, Métricas dice 329.
- El correo sin salida hacia sus tareas, y el cronómetro que corre siete días en
  *Por Hacer* sin sumar una hora.
- Y ahora, además, **montar el `iframe` de §53.1** y ver si el secuestro de clic
  se completa de verdad.

**No cierro nada.**

---

## 54. La ingesta de correo lleva cuatro días muerta, y todo está en verde (2026-09-07)

**Esta vez sí hubo navegador.** Lo primero que miré con él no fue la interfaz:
fue el espacio **«Alertas PMO» de Google Chat**, que es donde el sistema pide
ayuda. Llevaba once días pidiéndola.

### La secuencia, con fechas

| Cuándo | Qué dice el canal |
|---|---|
| **28 ago, 02:30** | Primer `Watch de Gmail sin renovar: 0 de 1` · `invalid_grant` · *«Token has been expired or revoked»* |
| **28 ago – 3 sept** | Decenas de `Correo entrante perdido: un job agotó sus reintentos`, **todos** con `invalid_grant` |
| **3 sept, 20:26** | El **último** «Correo entrante perdido». Desde ahí, silencio |
| **4 sept, 20:06** | Cloud Monitoring, Capa 2: *push requests for `gmail-ingest-push` has not been seen for over **1410 minutes*** |
| **5, 6 y hoy 7 sept, 02:30** | Solo queda una línea al día: `Watch de Gmail sin renovar: 0 de 1`, mismo `invalid_grant`, mismo usuario `cmsntcsn80000jn4jlxt18qag` |

1410 minutos son 23 h 30 min: el último push cayó el **3 de septiembre sobre las
20:30**, que es la misma hora del último aviso de correo perdido. Las dos
mitades, medidas por sistemas distintos, apuntan al mismo minuto.

### Lo que esto significa, y es lo contrario de lo que parece

Hay **dos fases**, y confundirlas es el error que quiero evitar:

1. **Del 28 de agosto al 3 de septiembre.** El token está revocado, pero el
   `watch` sigue vivo. **El correo llega, el job falla, el correo se pierde —
   y el canal avisa.** Ruidoso, pero honesto.
2. **Del 3 de septiembre a hoy.** El `watch` caducó a los 7 días. Ya no llega
   push, ya no hay job, ya no hay job que falle. **El correo se sigue perdiendo
   y el canal ya no dice nada.**

**El canal se calló justo cuando la pérdida se volvió total.** Quien mire hoy
«Alertas PMO» ve una línea tranquila al día donde hace una semana había un
aguacero, y la lectura natural —*se arregló*— es exactamente la contraria a la
verdad. Esto no es una hipótesis sobre el diseño: es lo que el canal enseña.

### El código hizo su trabajo. Los tres avisos son correctos

Y hay que decirlo antes de nada, porque el defecto **no está en el código**:

- `gmail.service.ts:1211` avisa con **la causa y el plazo dentro**: *«se apagará
  cuando caduque el watch vigente (7 días)»*. Su docblock ya explica por qué el
  contador sin motivo no servía. Avisó **6 días y 18 horas antes** del apagón.
- `dead-letter.listener.ts:38` avisa de cada job que se rinde, con su `jobId` y
  su motivo.
- La Capa 2 de Cloud Monitoring detectó el apagón **sin depender del proceso**,
  que es justo para lo que existe.

**Los tres funcionaron. El apagón ocurrió igual.** Once mañanas seguidas con el
aviso puesto, y en `git log` desde el 27 de agosto hay **un solo commit**, de
documentación (`4430f1a`). Nada tocó el token.

### 54.1 Lo que el canal no puede decirte: cuánto correo se perdió

`alert.service.ts:9` frena por clave a **900 s**, y la clave de los correos
perdidos es una sola: `dlq-gmail-sync`. En Chat los avisos van separados 16, 20,
30 minutos — el freno estaba trabajando.

Así que **cada mensaje no es un correo perdido: es una ventana de 15 minutos con
al menos uno**. Lo que se ve en el canal es el suelo, no la cuenta. **El número
real de correos perdidos no está en ningún sitio** — habrá que sacarlo de la cola
`dead-letter`, que sí los guarda enteros.

El freno no está mal puesto: sin él serían cientos de mensajes. Pero conviene
saber qué se está leyendo.

### 54.2 Y el dato que lo cierra: la sonda dice que todo está bien

Ahora mismo, con la ingesta muerta desde hace cuatro días:

```text
GET /health/ready → 200
{"status":"ok","info":{"database":{"status":"up"},
                       "schema":{"status":"up","aplicadas":11},
                       "redis":{"status":"up"}}}
```

`health.controller.ts:98` comprueba **Postgres, su esquema y Redis**. Nada más.
Y su propio docblock dice por qué entra Redis: *«sin él no hay ingesta de correo
ni clasificación»*. La intención estaba: querían que la sonda hablara de la
ingesta. **Lo que mide es que la tubería existe, no que pase agua por ella.**

Cuatro días sin un solo correo entrante y la sonda de producción responde `ok`.
No es un fallo de la sonda —hace exactamente lo que dice su código—, es que
**nadie le pidió nunca la pregunta que importa**: *¿cuándo entró el último
correo?* Es un dato que la base ya tiene.

### Lo que no afirmo

- **No he mirado la base de datos.** No sé cuántos correos hay en `dead-letter`
  ni cuál fue el último ingerido. Todo lo de arriba sale del canal de alertas,
  del código y de la sonda pública.
- **No sé por qué se revocó el token.** `invalid_grant` con *«expired or
  revoked»* admite varias causas —contraseña cambiada, permiso retirado desde la
  cuenta de Google, app en modo prueba con refresh token de 7 días—. Distinguirlas
  necesita el panel de Google Cloud, y ahí sigo sin sesión.
- **No sé si el `0 de 1` es el Jefe u otra cuenta.** Solo sé que hay **un** usuario
  con credenciales de Google, así que la ingesta entera del producto cuelga de
  **un solo refresh token**.

### Lo que no he hecho, y no voy a hacer

**No he tocado nada.** Reconectar la cuenta de Google es una acción sobre
producción y sobre la sesión del Jefe; es suya, no mía. Lo dejo dicho y con
fecha.

**No cierro nada.**

---

## 55. Cierre de jornada: lo que queda abierto (2026-09-07)

Cierro con el navegador ya conectado —lo que no tenía en §53— y con un hallazgo
grande encima de la mesa. **Nada de esto está resuelto**; lo dejo listado para
que la próxima sesión no tenga que reconstruirlo.

### Lo urgente, y no es mío

1. **La cuenta de Google del único usuario con credenciales está revocada**
   (§54). Hasta que alguien vuelva a conectarla, **no entra un solo correo**.
   Es acción del Jefe sobre producción; yo no la toco.
2. **Por qué se revocó.** `invalid_grant` admite varias causas y una de ellas
   —app OAuth en modo prueba, con refresh token de 7 días— **volvería a pasar
   sola**. Se distingue en el panel de Google Cloud, y ahí sigo sin sesión.

### Lo que puedo medir en cuanto vuelva

3. **Cuántos correos se perdieron de verdad.** El canal solo enseña el suelo
   (§54.1). La cuenta entera está en la cola `dead-letter`, que los guarda.
4. **El `iframe` de §53.1.** Las dos piezas están medidas —frontend de Vercel
   sin `X-Frame-Options` ni CSP, cookie `sameSite: "none"`—; falta montar el
   marco y ver si el secuestro de clic se completa. **Ahora ya tengo con qué.**
5. **Los dos defectos del semáforo de §50.1**: la rama roja inalcanzable de
   `App.tsx:179` y el 503 que se anuncia como *«Sin conexión con la API»*.
6. **El desfase de §51.1**: la bandeja dice 20 y Métricas dice 329.
7. **El correo sin salida hacia sus tareas**, y el cronómetro que corre siete
   días en *Por Hacer* sin sumar una hora.

### Lo que sigue bloqueado por sesión

8. **`gh` y `gcloud` esperan a que el Jefe inicie sesión** (§52). Sin eso, la
   auditoría de nube vale la mitad: ni logs, ni Scheduler, ni el panel de OAuth
   que hace falta para el punto 2.

### Lo que nadie ha reclamado todavía

9. **`/health/ready` no mira la ingesta** (§54.2). Cuatro días en verde con el
   producto muerto. La pregunta que falta —*¿cuándo entró el último correo?*—
   sale de un dato que la base ya tiene. **Es un hallazgo, no un encargo**: el
   arreglo no me toca.
10. **La sonda de frescura del frontend** falló el 30 y el 31 de agosto
    (`No se puede comprobar si el frontend esta al dia`). No ha vuelto a
    aparecer en el canal, pero **no lo he verificado**: no sé si se arregló o
    si dejó de mirar.

**No cierro nada.**

---

## 56. Despertar del 2026-09-08: la API entera responde 503, y esta vez no es la ingesta

**Chequeo estándar, primero, porque el hallazgo sale de él.**

`HEAD` = `4430f1a` (ayer 17:31, hora local), y **`master` va 1 por delante de
`origin/master`**, que sigue en `a31384e` del 25 de agosto: el commit de ayer
—*«entorno local restaurado tras el formateo…»*— **no está empujado**. De ahí
que `gh run list` no tenga ni una ejecución posterior al **2026-08-25 23:32 UTC**;
la última fue `success`. No hay CI parado: no hay nada que ejecutar.

En el árbol, cuatro archivos sin commitear: `.gitignore` (+4, las dos reglas de
§52.7), `ALANA.md` (+1108, que son **mis §50 a §55**, catorce días ya —§52.9
sigue sin contestar—), `DOC.md` (+18, que no leo) y `package-lock.json`, cuyo
único cambio es `apps/web` de `0.1.0` a `0.1.1` — **el `package.json` ya decía
`0.1.1` en `HEAD`**, así que el bloqueo iba atrasado y alguien lo puso al día sin
querer, al instalar. `git diff --stat` y `git diff --ignore-cr-at-eol --stat` dan
la **misma** cifra: ningún cambio escondido en finales de línea esta vez.

`TASKS.md` sin tocar desde el 25 de agosto, `AI_ROLES.md` sin excepciones nuevas,
`docs/` sin sesión nueva desde el 07-31, `gh variable list` con las trece de
siempre y `WEB_URL` todavía en `https://pmo-frontend-ten.vercel.app`.

**Y una buena, que levanta medio §55.8:** `gh auth status` ya devuelve sesión
(`Antonio-Sanchez-Navarro`, con `repo` y `workflow`). **La otra mitad sigue
bloqueada:** `gcloud auth list` sí lista la cuenta, pero cualquier comando muere
con `Reauthentication failed. cannot prompt during non-interactive execution`.
Tengo el nombre de la cuenta y no tengo el token.

### 🔴 El hallazgo: el servicio de Cloud Run no atiende ninguna ruta

Ayer, en §54, dejé escrito `GET /health/ready → 200`. Hoy, a las **15:27–15:29
UTC**, las seis rutas que probé devuelven **503**:

```
/health/live       HTTP 503   0.47 s
/health            HTTP 503   0.81 s
/health/ready      HTTP 503   0.26 s
/auth/me           HTTP 503   0.68 s
/webhooks/gmail    HTTP 503   0.51 s
/                  HTTP 503   0.25 s
```

**No es un arranque en frío y esto es lo que lo demuestra.** El cuerpo es la
página de error de Google —*«The service you requested is not available yet»*—,
la cabecera dice `server: Google Frontend`, no hay `x-cloud-trace-context`, y las
respuestas llegan **en menos de un segundo**. Un contenedor dormido tarda
segundos en levantar y responde él; aquí **la petición no llega al contenedor**.
Repetido nueve veces en dos minutos, siempre igual.

**Y alcanza al producto, no solo a mis sondas.** El frontend de Vercel responde
`200` con `<title>PMO Dashboard</title>` —es el nuestro, no el de §13—, pero su
bundle desplegado (`/assets/index-JNoC7SoZ.js`) lleva dentro **exactamente ese
host**: `https://pmo-api-mlpuuasqka-uc.a.run.app`. Quien entre hoy carga la
página y no obtiene un solo dato.

**El alcance cambia respecto a ayer, y conviene no mezclarlos.** §54 era la
ingesta: entraba nadie, pero lo demás funcionaba. Esto es **todo** —login,
tablero, copiloto, crones, el webhook de Gmail—. Los dos crones de Scheduler
llevan desde entonces golpeando una puerta cerrada, y el `watch` de Gmail no se
puede renovar aunque alguien reconecte la cuenta de Google.

### Lo que **no** sé, y no lo voy a deducir

**No puedo decir por qué.** Sin `gcloud` no veo revisiones, ni logs, ni
facturación, y la diferencia entre las causas posibles está justo ahí: un
servicio borrado, una revisión que dejó de arrancar tras una expulsión, la
facturación del proyecto suspendida o una cuota agotada **dan todas este mismo
503 desde el borde**. Elegir una desde fuera sería inventar.

Lo único que sí acota: **no hubo despliegue** desde el 25 de agosto y **no hubo
commit** que lo provocara. Cambió algo **fuera de git**, como en §14 y como en
§31 — el patrón de esta casa.

**Los tres comandos que lo resuelven en un minuto, en cuanto haya sesión:**

```
gcloud run services describe pmo-api --region us-central1 --project pmo-dashboard-503418
gcloud run revisions list --service pmo-api --region us-central1 --project pmo-dashboard-503418
gcloud beta billing projects describe pmo-dashboard-503418
```

### Lo que este corte deja dicho

1. **La API caída es lo primero de la lista**, por delante de la cuenta de Google
   revocada de §54: reconectar la ingesta no sirve de nada contra un servicio que
   no responde.
2. **`gcloud auth login` es ahora la pieza que bloquea el diagnóstico**, no un
   pendiente de comodidad. Es la tercera sesión seguida que lo escribo.
3. **Y una lección que se repite y ya toca nombrarla:** §54 fue *«todo en verde y
   el producto muerto»*; hoy es el escalón siguiente —**el producto entero caído
   y ningún aviso que lo diga aquí**—. La Capa 2 vigila los push de Gmail; nadie
   vigila que el servicio conteste. La sonda más barata del proyecto,
   `/health/live`, **no la mira nadie desde fuera**.

**No cierro nada.**

---

## 56.1 La causa, encontrada: la cuenta de facturación está cerrada (2026-09-08)

Con la sesión de `gcloud` puesta, la causa sale en cinco comandos y **no es
ninguna de mis cuatro hipótesis de §56 tal como las escribí**. Es la cuarta, pero
con una vuelta de tuerca que me habría hecho descartarla mal.

### La prueba, en el orden en que apareció

**1. El plano de control dice que todo está bien.** El servicio `pmo-api` existe,
`Ready: True`, y la revisión **`pmo-api-00113-92g`** —del 25-08, la misma del
último despliegue— tiene el **100 % del tráfico** y sus cinco condiciones en
verde, con *«Containers became healthy in 7.03s»*. Nadie ha borrado ni tocado
nada: **no hay una sola entrada de auditoría de `run.googleapis.com`** en siete
días que no sea el job de respaldo.

**2. Y sin embargo el borde no atiende, por las dos URLs.** Probé también la
forma nueva, `https://pmo-api-614812477499.us-central1.run.app`: **503 igual**.
No es un cambio de dominio.

**3. La hora exacta del corte, medida por dos sistemas.**

| Cuándo (UTC) | Qué |
|---|---|
| **11:05:21** | `POST /cron/overdue` → **200**. Última petición servida, y la última línea del contenedor |
| **11:15:07** | `pmo-reconciliar-clasificacion` → **`UNAVAILABLE`**. Primer fallo |
| 11:15 → ahora | **Todos** los Scheduler en `UNAVAILABLE`, cada quince minutos |

**La API se cayó entre las 11:05:21 y las 11:15:07 de hoy.** Diez minutos de
ventana, y dentro de ellos **no hay ninguna acción humana ni automática** en el
registro de auditoría.

**4. Y el comando que lo destapó no iba a eso.** Fui a Artifact Registry a
comprobar si la imagen del contenedor seguía existiendo —mi mejor hipótesis— y
lo que devolvió no fue *«no existe»*:

```
ERROR: (gcloud.artifacts.repositories.list) … This API method requires billing
to be enabled. Please enable billing on project #pmo-dashboard-503418
```

**5. La contradicción, que es justo donde estaba la trampa.** Media hora antes yo
había preguntado por la facturación y me había dado esto:

```json
{ "projectId": "pmo-dashboard-503418",
  "billingAccountName": "billingAccounts/015493-A5F85A-D7B488",
  "billingEnabled": true }
```

**Lo leí como «la facturación está bien». No lo dice.** `billingEnabled: true`
significa **que el proyecto está enlazado a una cuenta**, no que esa cuenta
pueda pagar. Hay que ir a preguntar por la cuenta, y entonces sale:

```json
{ "name": "billingAccounts/015493-A5F85A-D7B488",
  "open": false,
  "displayName": "Mi cuenta de facturación",
  "currencyCode": "MXN" }
```

**`"open": false`. La cuenta de facturación del proyecto está cerrada.**

**6. Y hay una segunda cuenta, abierta, en la misma organización:**

```json
{ "name": "billingAccounts/015607-DFA49A-B3BAC3",
  "open": true,
  "displayName": "My Billing Account" }
```

### Qué significa, en una frase

**El proyecto sigue enlazado a una cuenta que ya no paga.** Por eso el plano de
control contesta —listar y describir es gratis— y el plano de datos no: Cloud Run
no puede arrancar una instancia, Artifact Registry rechaza, y **el 503 llega
desde el borde de Google sin tocar nunca el contenedor**, que es exactamente lo
que medí en §56 sin saber por qué.

Explica también los diez minutos de ventana: **no hizo falta que nadie hiciera
nada**. La última instancia estaba caliente a las 11:05, sirvió su petición, se
apagó por escala a cero —el servicio no tiene mínimo de instancias— y **la
siguiente ya no pudo nacer**. El corte no tiene autor porque no es un cambio: es
una capacidad que se retiró debajo.

### Lo que **no** está roto, y conviene saberlo antes de tocar nada

- **La base de datos está viva.** `pmo-postgres-db`, `POSTGRES_16`, estado
  **`RUNNABLE`**.
- **Y respaldada, hoy mismo, por los dos caminos.** El respaldo **automático** de
  Cloud SQL corrió a las **05:00 UTC** con `SUCCESSFUL`, y los cinco últimos días
  también — **lo que cierra el 🔴 de §31**, donde `backupConfiguration.enabled`
  estaba en `false`; alguien lo encendió y funciona. Y el job de `pg_dump`
  completó a las **08:32 UTC** de hoy.
- **El código no tiene nada que ver.** Ni un commit, ni un despliegue, ni una
  variable. La revisión que falla es la misma que llevaba catorce días sirviendo.

### El arreglo, que es de una línea y **no es mío**

```
gcloud billing projects link pmo-dashboard-503418 \
  --billing-account=015607-DFA49A-B3BAC3
```

**No lo ejecuto**, y no solo por la regla de §0 —encuentro y compruebo, no
arreglo—: esto mueve dinero de una cuenta a otra en producción y **la decisión
tiene dueño, que es el Jefe**. Antes de ejecutarlo hay que saber **por qué se
cerró** la cuenta `015493`, porque si fue impago o fin de crédito, enlazar la
otra traslada el problema en vez de resolverlo.

### La pregunta que dejo abierta, y tiene reloj

**¿Qué pasa con la base si esto no se restablece?** Una cuenta de facturación
cerrada no deja los recursos ahí para siempre. La instancia está `RUNNABLE`
hoy; el respaldo automático de mañana ya no lo doy por hecho. **No sé el plazo
exacto y no lo voy a inventar** — pero el respaldo de hoy existe por los dos
caminos, y ese es el suelo que hay debajo mientras se decide.

### Y una corrección a mí misma, que es la lección del corte

En §56 escribí *«la facturación suspendida»* entre las cuatro hipótesis. Media
hora después consulté la facturación, leí `billingEnabled: true` y **la taché**.
Seguí buscando por otro lado y la causa apareció **de rebote**, en el mensaje de
error de un comando que preguntaba por otra cosa.

El fallo no fue de método: fue **leer un campo por su nombre en vez de por lo que
mide**. `billingEnabled` mide un enlace, no una capacidad de pago, y las dos cosas
se llaman igual en castellano. Es la misma familia que el 🔴 de §31 —*«nada de lo
que se mira dice que falte algo, hay que ir a buscar el booleano»*—, y esta vez
el booleano estaba **un nivel más arriba**: no en el proyecto, en la cuenta.

**Regla que me llevo:** cuando un campo de estado dice que sí y el sistema dice
que no, **el que miente es mi lectura del campo**, no el sistema.

**No cierro nada.**

---

## 56.2 La caída, cerrada: seis horas y seis minutos (2026-09-08)

**Restablecido.** A las **17:19 UTC** volví a sondar y la API contesta:

```json
{"status":"ok","info":{"database":{"status":"up","responseTimeMs":51},
"schema":{"status":"up","aplicadas":11,"aMedias":0,"revertidas":0},
"redis":{"status":"up","responseTimeMs":57}}}
```

**Y la cuenta `015493` está `"open": true`.** No se movió el proyecto a la otra
cuenta: **se reabrió la que ya tenía**. El enlace nunca cambió.

### La cronología completa, con la hora de cada cosa

| Hora (UTC) | Qué pasó | De dónde lo saco |
|---|---|---|
| **11:05:21** | Última petición servida: `POST /cron/overdue` → **200** | log del contenedor |
| **11:15:07** | Primer `UNAVAILABLE` de Scheduler | log de Scheduler |
| 11:15 → 16:15 | **503 en el borde y ni una línea de registro.** Cinco horas sin que el sistema diga nada | ausencia en el log |
| **16:15:10** | Aparece por fin el motivo, y lo dice entero | log del contenedor |
| **17:11:54** | `Default STARTUP TCP probe succeeded` — el contenedor arranca | log del contenedor |
| **17:11:44 / 17:12** | Primeros **200** | log del contenedor |

**Duración: 6 h 06 min.**

### La frase que lo confirma todo, literal

A partir de las 16:15:10, Cloud Run **escribe la causa en el registro**:

```
The request failed because billing is disabled for this project.
```

Ocho líneas hoy, con `Google-Cloud-Scheduler` de agente en la mayoría. **No hubo
que deducir nada:** mi §56.1 dedujo la causa a las 15:30 y una hora después el
propio sistema la escribió con esas palabras.

### 🟠 Y aquí está el hallazgo de verdad, que sobrevive a la caída

**Durante las cinco primeras horas Cloud Run no registró absolutamente nada.**
Ni la petición, ni el 503, ni el motivo. El único rastro en todo el proyecto era
`UNAVAILABLE` en el log de Scheduler — un sistema **distinto**, que se queja
porque no le contestan, no porque sepa qué pasa.

El motivo solo apareció **en la última hora**, cuando el borde ya enrutaba y era
el contenedor el que no arrancaba. **Si esto se hubiera arreglado a las 16:00,
no existiría ni una línea que dijera por qué se cayó el producto.**

### 🔴 Y nadie avisó, y ahora está medido

Miré el sistema de alertas entero. Hay **dos políticas**, las dos activas:

1. `[Capa 2] Fallo Critico: Apagon del Watcher de Gmail` — ausencia de
   `push_request_count`, 84 600 s.
2. `[Capa 2] Fallo Critico: El respaldo de la base de datos`.

**Y hay cero comprobaciones de disponibilidad:** `uptimeCheckConfigs` devuelve
`{}`. Un solo canal, `Alertas PMO` de Google Chat, activo.

**Conclusión, y no es una opinión:** el producto estuvo caído seis horas y
**ninguna alerta podía dispararse**, porque ninguna mira si la API contesta. Las
dos que existen vigilan *dentro* del producto —la ingesta y el respaldo—; **nadie
vigila que el producto exista**. Peor: la Capa 1 vive **dentro** de la API, así
que cuando la API es lo que se cae, el que avisa se cae con ella.

Es §54 un escalón más arriba. Allí escribí *«todo en verde y el producto
muerto»*. Hoy: **el producto entero caído, seis horas, y el tablero de alertas
sin una línea.**

**Lo barato que falta**, y lo digo sin cerrarlo: una comprobación de
disponibilidad de Monitoring contra `/health/live`, que es GET, sin credenciales
y ya existe. El canal de Chat ya está montado. Es configuración, no código.

---

## 57. La auditoría de nube, por fin hecha (2026-09-08)

Llevaba **tres despertares** escribiendo que sin `gcloud` mis informes valían la
mitad (§52, §55.8, §56). Con la sesión puesta, esto es lo que faltaba.

### 57.1 Los seis Scheduler: correctos, y hay que decirlo

| Job | Ritmo | Estado |
|---|---|---|
| `pmo-reconciliar-clasificacion` | `*/15 * * * *` | ENABLED |
| `pmo-frontend-al-dia` | `*/30 * * * *` | ENABLED |
| `pmo-coste-ia` | `0 * * * *` | ENABLED |
| `pmo-overdue-sweep` | `5 * * * *` | ENABLED |
| `pmo-gmail-watch-renew` | `30 2 * * *` | ENABLED |
| `pmo-respaldo-db-diario` | `30 3,15 * * *` | ENABLED |

Los seis en `America/Cancun`. **Los cinco que apuntan a la API llevan la misma
audiencia OIDC**, `https://pmo-api-mlpuuasqka-uc.a.run.app/cron`, **idéntica a
la variable `CRON_OIDC_AUDIENCE` de la revisión viva**, y firman con
`pmo-scheduler@…`. El del respaldo llama a la API de Run, no a la nuestra.
**Nada que objetar**: es la primera vez que compruebo esta pieza entera y sale
limpia.

### 57.2 Las variables de la revisión viva, comprobadas una a una

Veintiuna. Doce en claro y **nueve por referencia a Secret Manager** —
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`,
`GEMINI_API_KEY` y `ALERT_WEBHOOK_URL`—. **Ninguna credencial va en claro en la
definición del servicio.** `CLAUDE_MODEL_CLASSIFY` = `claude-sonnet-5`,
`WEB_URL` y `GOOGLE_REDIRECT_URI` coinciden con `gh variable list`, y
`SERVICE_VERSION` = `7a85831…`, que es lo que ya sabía.

### 57.3 🟠 Trece versiones de secreto, y **todas** habilitadas

| Secreto | Versiones habilitadas |
|---|---|
| `pmo-database-url` | **5** (1, 2, 3 del 05-08 · 4 y 5 del 18-08) |
| `pmo-redis-url` | 2 |
| `ALERT_WEBHOOK_URL` | 2 (la **1** es la del `TO_BE_FILLED_BY_USER` de §29) |
| `pmo-anthropic-api-key` | 2 |
| Los otros cinco | 1 cada uno |

**Ninguna versión superseded se ha deshabilitado nunca.** Las tres primeras de
`pmo-database-url` son de antes de la migración a Cloud SQL: **son cadenas de
conexión de Neon, con su contraseña, vivas y legibles hoy**. Y la versión 1 de
`ALERT_WEBHOOK_URL` es la que tenía el texto de relleno que dejó el canal mudo
tres días (§29): sigue ahí, y quien la pida por número la recibe.

Esto cierra en medida lo que en §27.5 dejé como apunte suelto —*«la versión 1
del secreto sigue enabled»*—: **no era ese secreto, es la política de la casa.**
Deshabilitar una versión no borra nada y se revierte en un clic.

✅ **Y una buena que sale del mismo sitio:** `pmo-token-encryption-key` tiene
**una sola versión, del 05-08**. La clave nueva de §52.4 **no se aplicó**, que
es exactamente lo que recomendé en §52.10. Nadie tuvo que volver a autorizar
nada.

### 57.4 🟠 Los presupuestos: uno vigila 20 pesos y el otro no avisa a nadie

| Cuenta | Presupuesto | Importe | Avisos |
|---|---|---|---|
| `015493` (la del proyecto) | «PMO · gasto mensual» | **20 MXN/mes** | 50 %, 75 %, 90 % y 75 % previsto → **topic `pmo-presupuesto`** |
| `015607` (la otra) | «pmo» | 2 000 MXN/mes | 50 %, 90 %, 100 % previsto → **`notificationsRule` vacío** |

**Y el topic `pmo-presupuesto` no tiene ni una suscripción.** Lo comprobé:
las únicas del proyecto son `gmail-ingest-push` y `gmail-ingest-dlq-sub`. **El
presupuesto publica avisos que no lee nadie** — una pieza puesta y desconectada,
igual que el job de respaldo de §31.

Los veinte pesos mensuales tampoco los interpreto como error: **es el orden de
magnitud que decidió alguien**, y con esa cifra el aviso del 90 % salta casi
cualquier mes. Lo dejo dicho, no lo llamo defecto.

**Lo que sí conviene saber:** la cuenta cerrada tenía **dos** proyectos colgando
—`pmo-dashboard-503418` y `continual-loop-496922-h9`—, así que la caída de hoy
alcanzó a los dos. Y la otra cuenta, la abierta, solo tiene
`gen-lang-client-0325947422`.

### 57.5 Pub/Sub, y la medida que §55.3 pedía

Tres topics —`gmail-ingest`, `gmail-ingest-dlq`, `pmo-presupuesto`— y dos
suscripciones. `gmail-ingest-push` empuja a `/webhooks/gmail`, con `ack` de 60 s,
**retención de 7 días** y **cola de fallidos configurada** hacia
`gmail-ingest-dlq`. Está bien montado.

**Y la medida:** `num_undelivered_messages` en las dos suscripciones vale **0**,
sin excepción, en las últimas 48 horas.

**Eso responde §55.3, y la respuesta no es la que esperaba.** No hay correo
atrapado en ninguna cola: **no está llegando ninguno**. Cuando el `watch` caducó
el 3 de septiembre, Gmail dejó de publicar. Lo que se pierde no está guardado en
ninguna parte esperando — **no existe**. La recuperación, cuando la ingesta
vuelva, tendrá que ser una sincronización contra Gmail, no un vaciado de cola.

### 57.6 Lo que sigue sin poderse mirar desde aquí

**La pantalla de consentimiento de OAuth** —la pregunta de §55.2, la que decide
si esto se repite solo cada siete días— **no se puede leer con `gcloud`**: la API
de IAP está deshabilitada en el proyecto y **no la habilito yo**, que sería
cambiar producción. Queda para el panel, con navegador.

---

## 58. 🔴 El secreto de cliente de Google está caducado en producción — y me corrige §54 (2026-09-08)

**Este es el hallazgo grande del día, más que la caída**, porque la caída ya está
resuelta y esto no.

### Lo que dice el sistema hoy, y no es lo que dije yo el 7

En §54 escribí que la ingesta murió porque **la cuenta de Google del usuario
estaba revocada**, con `invalid_grant` — *«Token has been expired or revoked»*—
como prueba. **Eso valía el 7. Hoy ya no.** El cron de las 07:30 UTC de hoy dejó
esto:

```
07:30:27 WARNING  Watch de Gmail renovado solo para 0 de 1 usuario(s)
                  [cmsntcsn80000jn4jlxt18qag: code=401 → HTTP 401 → invalid_client
                  → respuesta={"error":"invalid_client",
                     "error_description":"The provided client secret is invalid."}]
```

**`invalid_client`, no `invalid_grant`.** No es que el usuario haya retirado el
permiso: **es la aplicación la que ya no sabe identificarse ante Google.**

### La fecha exacta del cambio, contada por el registro

Busqué las dos cadenas en treinta días de log:

| Cadena | Primera | Última | Líneas |
|---|---|---|---|
| `invalid_grant` | (antes del rango) | **2026-09-07 07:30** | 400 (tope) |
| `invalid_client` | **2026-09-08 07:30** | 2026-09-08 07:30 | 4 |

**El error cambió entre el cron del 7 y el del 8.** En esa ventana, ayer por la
tarde, se tocó el entorno local: el commit `4430f1a` de las 22:31 UTC se titula
*«entorno local restaurado… y el `.env` que apuntaba a produccion»*.

### Y lo comprobé antes de escribirlo, que es mi parte

**Primero, la comparación**, sin sacar ningún valor a la luz — solo los doce
primeros caracteres de su SHA-256:

| | `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_SECRET` |
|---|---|---|
| Secret Manager (lo que usa producción) | `5e0eb4a1ff59` | `27f49213f0ca` |
| `.env` local | `5e0eb4a1ff59` | **`86240094497b`** |

**Mismo cliente, secreto distinto.** No son dos aplicaciones: es la misma, con la
credencial regenerada en un lado y no en el otro.

**Segundo, y esto es lo que convierte la sospecha en hecho.** Pregunté a Google
por los dos, con un `refresh_token` **inventado a propósito** contra
`https://oauth2.googleapis.com/token`. El truco está en que Google contesta
distinto según **qué** esté mal:

```
secreto de Secret Manager → invalid_client · "The provided client secret is invalid."
secreto del .env local    → invalid_grant  · "Bad Request"
```

**`invalid_grant` en el segundo caso es la respuesta buena**: significa que
Google **aceptó las credenciales del cliente** y rechazó únicamente el token
falso que yo le pasé. Es decir:

> **El `.env` local tiene el secreto válido. Producción tiene el muerto.**

Sin exponer ni un carácter de ninguno de los dos, y sin tocar nada.

### El alcance, que es mayor que la ingesta

El secreto de cliente no se usa solo para renovar el `watch`. **Se usa en cada
intercambio de código por token.** Con él inválido:

- **Nadie puede entrar con Google.** `/auth/google` sigue devolviendo `302`
  —comprobado— porque ese redirigir solo lleva el `client_id`; **el fallo está
  después, en el callback**, donde sí hace falta el secreto. La puerta se abre y
  la llave no gira.
- **Ningún usuario existente puede refrescar su token.** Toda la integración con
  Google está parada, no solo el correo.
- **`/health/ready` sigue en verde**, porque mira base, esquema y Redis. Otra vez
  §54.2: la sonda no pregunta lo que importa.

### El arreglo, que **no** ejecuto, y el orden importa

1. Añadir el valor bueno como **versión nueva** de `pmo-google-client-secret`.
   El servicio lo lee por `key: latest`, así que hace falta una revisión nueva
   —o al menos instancias nuevas— para que lo tome.
2. **Después**, disparar `/cron/gmail-watch` a mano y **leer el error que
   queda**. Ahí está la pregunta que hoy no se puede contestar: regenerar un
   secreto de cliente **no** invalida los `refresh_token` ya emitidos, así que si
   tras el arreglo vuelve `invalid_grant`, entonces §54 tenía razón y **además**
   hay que reconectar la cuenta. Si en cambio renueva, el `invalid_grant` de
   agosto tenía otra causa y **se acabó solo**.

**No lo hago yo.** Escribe un secreto de producción y reinicia el servicio.

### La corrección a §54, escrita sin adornos

§54 sigue siendo cierta **en lo que midió**: la ingesta lleva muerta desde el 3
de septiembre y el canal se calló justo cuando la pérdida se volvió total. Eso no
cambia.

**Lo que corrijo es la causa vigente.** Escribí *«la cuenta de Google del único
usuario está revocada»* y dejé en §55.1 que la acción era del Jefe, reconectando.
**Hoy esa acción no serviría de nada**: con el secreto de cliente inválido, el
consentimiento nuevo también fallaría en el intercambio. Habría reconectado, y
habría seguido sin entrar un correo, sin entender por qué.

**Y la lección es la de ayer, otra vez:** una causa comprobada tiene fecha de
caducidad. La medí el 7 y la di por buena para el 8. Entre medias alguien tocó
una credencial, y mi diagnóstico —correcto cuando lo escribí— **habría mandado al
Jefe a arreglar lo que no estaba roto.** El registro cambió de palabra; solo hacía
falta volver a mirarlo.

**No cierro nada.**

---

## 59. Fase 6 — tomo nota del esquema, y la nota no cuadra con el árbol (2026-09-08)

Doc anuncia el backend de la **Fase 6: Capa de Decisión y Unidad Atómica** y me
pide tomar nota del esquema para auditorías futuras. **La nota es para mis
auditorías, así que la comprobé antes de escribirla**, que es justo lo que
distingue una nota de un rumor. Los cinco puntos están en el código. **Y el
código no compila.**

### 59.1 Lo que anota, comprobado uno a uno

**1. Esquema.** ✅ Cierto y verificado en `schema.prisma`:

```prisma
/// Tareas propuestas por la IA, pendientes de revisión humana.
proposedTasks  Json?
/// Indica si el correo trae archivos adjuntos (cuyo contenido no bajamos).
hasAttachments Boolean @default(false)
```

Con migración `20260908183006_phase6_human_in_loop`, que añade `JSONB` nulable y
un booleano con defecto. **No destruye nada** y no toca filas existentes.
Producción tiene hoy **11** migraciones aplicadas (`/health/ready`); con esta
serán 12.

**2. Adjuntos.** ✅ `gmail.service.ts` recorre las partes y marca
`hasAttachments` a partir de `p.body?.attachmentId != null`, y lo persiste en
`create` y en `update`. **Ojo con lo que esto es y lo que no es:** marca que
**existen** adjuntos; **sigue sin descargarlos**. El punto 4 del Jefe —*«no me
permite leer documentos anexos»*— **no queda resuelto**, queda **declarado**. Y
el aviso al modelo (`ai.service.ts`) es exactamente eso: le prohíbe proponer
tareas sobre lo que no puede ver. Es la decisión honesta, pero que nadie la lea
como «ya se leen los adjuntos».

**3. Contexto de hilo.** ✅ `email-classification.service.ts` busca los correos
anteriores del mismo `threadId` y **del mismo `userId`** —bien acotado—, los une
con un separador y los manda bajo `Historial del hilo (citado)` con la
instrucción `Analiza SOLO esto y no repitas tareas del historial`.

**4. Human-in-the-loop.** ✅ En la vía de ingesta, sí. `classifyAndPersist` ya
**no crea filas en `Task`**: escribe `proposedTasks` y actualiza el correo. El
bloque de `task.create` desapareció. Esa era la queja 1 y 2 del Jefe y **está
atacada en la raíz**.

**5. Métricas.** ✅ `inbox.pending` existe en `packages/shared` y lo calcula
`metrics.service.ts`. **No cambió nada en esta fase** —ni falta—: el desfase de
§51 se cierra en el frontend leyendo esa cifra en vez de `emails.length`. La nota
dice «conceptualmente» y es la palabra correcta.

### 59.2 🔴 Ejecutado, no leído: no compila y fallan 16 pruebas

`npx tsc -p apps/api/tsconfig.json --noEmit`:

```
__fixtures__/emails.fixture.ts(10,7)  TS2739  falta 'proposedTasks' y 'hasAttachments'
emails.service.ts(307,7)              TS2353  'proposedTasks' no existe en el tipo 'EmailDetail'
emails.service.ts(537,75)             TS2345  'description: string | null' no es asignable
                                              a 'string | undefined' de ConfirmedTaskDto
```

`npx jest`: **712 pruebas, 696 pasan, 16 fallan** en 2 suites de 36 —
`email-classification.service.spec.ts` (11) y `emails.service.spec.ts` (5)—,
que son exactamente las dos que cubren lo que cambió.

**No lo llamo «trabajo mal hecho», lo llamo trabajo sin terminar**, y la
diferencia importa porque de eso depende quién lo recoge. Pero el anuncio dice
*«el backend está listo»* y **@Gravity tiene luz verde para construir encima**.
Lo que hay en el árbol no arranca.

### 59.3 🔴 El bloqueo concreto de @Gravity, y es el error de compilación del medio

`emails.service.ts(307)` no es un detalle de tipos: dice que **`EmailDetail` no
declara `proposedTasks`**. Y hay algo peor detrás:

- **`packages/shared` no menciona `proposedTasks` ni `hasAttachments`.** Ni una
  vez.
- Hay **dos** `EmailDetail` distintos, uno en `apps/api/src/modules/emails/` y
  otro en `apps/web/src/features/inbox/api/` — **el contrato copiado a mano** que
  ya está anotado desde §7 y que `8219b96` acababa de arreglar para
  `DashboardMetrics`.

Es decir: a @Gravity se le pide consumir un campo que **el contrato compartido no
declara y el del frontend tampoco**. Va a tener que inventarse el tipo o tocar el
contrato — y esa segunda es la buena, pero conviene decirlo antes y no después.

### 59.4 🟠 El rastro de la prioridad y la confianza del modelo se pierden al materializar

Esto no lo cazan las pruebas: lo vi comparando las dos rutas.

El mapeo viejo, el que se borró, escribía en cada tarea `aiConfidence`,
`position`, `source`, `priorityReason`, `priorityAdjustedAt` y
`priorityAdjustedFrom`.

La ruta nueva pasa por `toConfirm`, que mapea **cinco campos** —`title`,
`description`, `priority`, `tags`, `dueDate`— y de ahí a `persistConfirmed`, que
crea la fila con `position`, `source: MANUAL` y nada más.

**Lo que sobrevive:** el título, la descripción, las etiquetas, la fecha y **la
prioridad ya escalada** (la capa determinista corre antes, sobre el borrador).

**Lo que se pierde:** `aiConfidence` y **las tres columnas del rastro de
prioridad**. Y esas tres son la razón de existir de la migración
`add_priority_audit`: están para contestar *«¿por qué el sistema subió esto a
alta?»*. A partir de ahora la tarjeta sube de prioridad **y ya no puede decir por
qué**.

El `source: MANUAL` sí está razonado en un comentario y **estoy de acuerdo**: lo
aprobó una persona y así el reproceso no lo borra. No es eso lo que señalo.

### 59.5 🟠 El historial del hilo va sin techo, y el hilo es justo lo que crece

`findMany` sobre el hilo, sin `take`, sin recorte, y los cuerpos se concatenan
enteros. **No hay truncado en ninguna parte de la ruta**: lo comprobé,
`textToAnalyze` es el cuerpo entero y ahora se le antepone todo el hilo.

Y el hilo es lo que crece: §51.1 midió **un hilo del Jefe de doce mensajes**,
cada respuesta arrastrando las citadas. El contexto que se manda crece con el
cuadrado de la conversación, **y cada mensaje nuevo lo vuelve a pagar entero**.
`max_tokens: 2000` limita **la respuesta**, no la pregunta.

Lo digo por dos motivos, y ninguno es teórico aquí: §51.7 midió el precio de una
pregunta, y §48 fue un bloqueo por **$8.14** de saldo.

### 59.6 🟡 Tres cosas menores, para el registro

1. **`aiConfidence: 1` inventado.** La caché de `EmailsService.classify` devuelve
   `aiConfidence: 1` con el comentario *«o guardarlo también en la fila si fuera
   necesario»*. Es un valor de relleno que dice **«el modelo estuvo seguro del
   todo»** sin que nadie lo haya dicho, y viaja a la interfaz.
2. **Cuatro `as any` en el backend.** §12 registró **cero**. Son los cuatro de
   esta fase, todos alrededor del JSON.
3. **Se borró un docblock que explicaba un porqué**: el de `receivedAt` en
   `analyzeEmail` —*«ancla temporal… sin ella el modelo adivina el año»*—. El
   parámetro sigue, la razón ya no. En esta casa eso se paga: `a31384e` se tituló
   *«por que una fecha no es un instante»*.

### 59.7 ❓ Y una que **no** afirmo, porque huele a decisión

`EmailsService.classify` ahora **devuelve la caché si `proposedTasks` existe** y
no vuelve a llamar al modelo nunca. El comentario nuevo dice que
`replaceExisting` *«da igual ahora»*, así que el reproceso, tal como estaba, ya
no reprocesa.

**Puede ser exactamente lo que se quiere** —ahorra dinero, y §51.7 midió lo que
cuesta cada pregunta—. Pero entonces no hay forma de pedir una segunda opinión
sobre un correo mal clasificado. **Pregunto en vez de marcarlo:** ¿es deliberado,
y el reproceso se recupera de otra manera?

### 59.8 Lo que me llevo, que es de método

Doc me pidió **tomar nota**. Si la tomo tal cual, mañana audito contra un esquema
que creo aplicado y no lo está, contra un backend que creo listo y no compila, y
contra una tabla `Task` que creo que ya no recibe nada de la IA. **Las tres
serían falsas de una manera que no se nota**, porque la nota vendría de quien
tiene autoridad para dármela.

**Una nota para auditar el futuro se comprueba en el presente**, y cuesta cinco
minutos: un `tsc`, un `jest` y leer el diff. Es la misma regla del 21-08 vista
desde el otro lado — entonces dejé de heredar el relato del ejecutor leyendo su
bitácora; hoy habría heredado el mismo relato **en forma de encargo**.

**No cierro nada.**

---

## 60. Recta final: qué impide salir a producción, y qué no (2026-09-08)

Encargo de Doc: revisión rápida desde mi ángulo —auditoría, seguridad, QA—,
diagnóstico y propuesta, **sin reparar**, y con el pragmatismo por delante.

**Mi criterio para ordenar esto, que es el que me pidieron:** no pregunto *«¿está
bien?»* sino **«¿impide que un usuario use el sistema, o que nos enteremos si
deja de funcionar?»**. Todo lo demás baja de nivel, por grave que se vea en una
lista. Llevo cuarenta secciones acumulando hallazgos; hoy la entrega útil es
**decir cuáles no toca arreglar todavía**.

### 60.1 🔴 Bloquean la salida. Son cuatro y solo cuatro

| # | Qué | Por qué bloquea | Coste |
|---|---|---|---|
| **B1** | **El secreto de cliente de Google es inválido en producción** (§58) | **Nadie puede entrar.** Sin login no hay producto, y no hay forma de rodearlo | 10 min, consola |
| **B2** | **La Fase 6 no compila: 3 errores de `tsc`** (§59.2) | El CI no la deja pasar. No hay despliegue posible | Pequeño |
| **B3** | **16 pruebas rojas de 712**, en las 2 suites de lo que cambió (§59.2) | Mismo motivo, y son las que cubren la pieza nueva | Medio |
| **B4** | **`proposedTasks` no está en ningún contrato** (§59.3) | @Gravity no puede empezar la Cuarentena sin inventarse el tipo | Pequeño |

**B1 es independiente de las otras tres** y se puede hacer ya: no toca código,
reutiliza la misma imagen. **B2, B3 y B4 son el mismo trabajo** y conviene que
las haga una sola mano en una sola pasada.

**Y una consecuencia de B1 que hay que mirar después, no antes:** la ingesta
lleva muerta desde el 3 de septiembre (§54). Arreglado el secreto, el cron dirá
si además hay que reconectar la cuenta de Google. **No se puede saber antes**, y
por eso el paso a paso de §58 termina en «lee qué error queda».

### 60.2 🟠 No bloquean, pero yo no saldría sin ellas. Las tres son de minutos

**C1 · Que alguien avise si esto se cae.** Hoy estuvo caído **6 h 06 min** y no
saltó nada: `uptimeCheckConfigs` está vacío (§56.2). Un check de Monitoring
contra `/health/live` —`GET`, sin credenciales— al canal `Alertas PMO` que ya
existe. **Es un formulario, no código.** Salir a producción sin esto significa
que el próximo corte lo descubre el Jefe usándolo.

**C2 · Techo al historial del hilo** (§59.5). La pieza nueva manda el hilo entero
sin `take` y sin recorte, y el hilo es justo lo que crece. Un `take` de los 3–5
últimos y un corte de caracteres. **Lo pongo aquí y no en la deuda porque es
código recién escrito que nadie ha visto correr con un hilo de doce mensajes** —
y §48 ya fue un bloqueo por saldo.

**C3 · La cabecera que impide meter la aplicación en un `iframe`** (§53.1).
Comprobado hoy: el frontend sirve **solo `Strict-Transport-Security`**; no hay
`X-Frame-Options` ni CSP, y la cookie va `sameSite: none`. **Y `vercel.json` ya
tiene un bloque `headers`**: son tres líneas dentro de algo que existe. No he
montado el ataque completo, así que no lo llamo agujero probado — lo llamo
**la puerta más barata que queda abierta**.

### 60.3 🟢 Lo que **no** tocaría antes de salir, y lo digo firmando

Esto es la mitad del encargo. Todo lo de aquí abajo está verificado y escrito, y
**aun así recomiendo aplazarlo**:

- **Los 15 avisos de `npm audit`** (1 bajo, 9 medios, 5 altos), §52.5. `qs` se
  arregla sin ruptura; **`multer` es de ruptura y toca la subida de archivos**,
  que es justo lo que la Fase 6 va a estrenar. **Tocar eso ahora es cambiar el
  suelo mientras se construye encima.** Después de salir.
- **El rastro de prioridad y `aiConfidence` perdidos** (§59.4). Es pérdida de
  explicabilidad, no de función: la prioridad escalada **sí** llega bien. Duele
  en la auditoría, no en el uso.
- **Las versiones viejas de secretos habilitadas** (§57.3) — con cadenas de Neon
  y su contraseña vivas. Es de seguridad y me molesta, pero **no es una brecha
  abierta**: hay que tener ya permiso de lectura del proyecto para tocarlas.
  `disable` no borra y se revierte en un clic: es de después, y de cinco minutos.
- **Los cuatro `as any`, el `aiConfidence: 1` de relleno y el docblock borrado**
  (§59.6). Deuda declarada. Que quede escrita, no que pare la salida.
- **El presupuesto que publica a un topic sin suscriptor** (§57.4) y **§13**, el
  dominio viejo sirviendo otra aplicación, que hoy cumple **veintinueve días**.
  Ninguno de los dos afecta a un usuario del sistema nuevo.
- **El volcado de correo de clientes sin cifrar** (§52.6). Es el que más me
  incomoda de la lista, y aun así: no es del producto, es de una carpeta. Una
  decisión de cinco minutos del Jefe cuando haya salido.

### 60.4 Lo que le falta a esto para ser «robusto» y no solo «verde»

Dos huecos de QA que no son hallazgos sino ausencias, y los digo por si Doc
quiere meterlos en el reparto:

1. **No hay una prueba de humo del camino nuevo entero.** Las 712 son unitarias.
   Nadie ha visto un correo entrar → proponer → una persona aprobar → aparecer la
   tarjeta. **Ese recorrido es el producto de la Fase 6** y hoy no lo cubre nada.
   Con la ingesta muerta ni siquiera se puede hacer a mano todavía; depende de B1.
2. **`/health/ready` sigue sin mirar lo que importa** (§54.2). Da verde con la
   ingesta muerta y con el login roto. La pregunta que falta —*¿cuándo entró el
   último correo?*— sale de un dato que la base ya tiene. **Lo dejo como
   propuesta, no como bloqueo:** con C1 puesto, el agujero grande queda tapado.

### 60.5 El orden que propongo, si sirve de algo

**Hoy:** B1 (Jefe, consola) → B2+B3+B4 en una sola pasada → leer qué queda de la
ingesta → C1.
**Antes de anunciar que está en producción:** C2 y C3.
**Después:** todo §60.3, empezando por `disable` de las versiones viejas.

**No cierro nada, y no reparo nada.** Lo reparte Doc.

---

## 61. El panel de OAuth, por fin visto: tres desajustes y un miedo descartado (2026-09-08)

El Jefe entra en `https://pmo-frontend-ten.vercel.app/`, pulsa entrar con Google
y recibe:

```
Error 400: redirect_uri_mismatch
redirect_uri=https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback
```

Me pide mirar el panel con el navegador. **Es exactamente la pantalla que en
§57.6 dejé como «lo único que sigue sin poderse mirar»**, porque la API de IAP
está deshabilitada y no la iba a habilitar yo. Con Chrome sí se ve, y ahí estaba
todo.

### 61.1 El cliente de OAuth, y lo que dice literalmente

Proyecto `pmo-dashboard-503418` → Credenciales. **Hay un solo cliente**,
`Cliente web PMO`, tipo *Aplicación web*, creado el **24 de julio de 2026**, con
ID `614812477499-be837kem8i3v9gs1l9a0ag9kji08f4mm.apps.googleusercontent.com`.
Es el mismo `client_id` que hay en `.env` y en Secret Manager (§58: los dos
hashes coincidían). **No se creó un cliente nuevo: se reconfiguró este.**

**URIs de redireccionamiento autorizados — hay exactamente uno:**

```
https://pmo-api-614812477499.us-central1.run.app/auth/google/ca…
```

**Y producción manda el otro.** `GOOGLE_REDIRECT_URI`, tanto en la revisión viva
de Cloud Run como en `gh variable list`, vale
`https://pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback`.

Son **los dos nombres del mismo servicio** —Cloud Run da una URL con
identificador opaco y otra con el número de proyecto; comprobé en §56.1 que las
dos responden—, pero **para Google son cadenas distintas**, y la comparación es
literal. De ahí el 400.

### 61.2 Y en la misma pantalla, la confirmación de §58 con hora exacta

**Secretos del cliente: uno solo.**

| Campo | Valor |
|---|---|
| Secreto del cliente | `****qh5U` |
| Fecha de creación | **7 de septiembre de 2026, 5:24:11 p.m. GMT-5** |
| Estado | Habilitada |

**Eso es ayer a las 22:24 UTC**, y encaja al minuto con lo que deduje en §58 del
registro: `invalid_grant` hasta el cron del 7 a las 07:30, `invalid_client` desde
el del 8 a las 07:30. **El secreto se rotó en la consola en esa ventana y Secret
Manager se quedó con el viejo.** Ya no era una inferencia: está fechado en la
fuente.

Y el panel añade un detalle que importa para el arreglo: *«Ya no se pueden ver ni
descargar los secretos del cliente»*. **El único sitio donde vive el valor bueno
es el `.env` local** — que es justo donde lo encontré, y por eso la prueba contra
`oauth2.googleapis.com` dio `invalid_grant` con él y `invalid_client` con el de
producción.

### 61.3 El tercer desajuste, que todavía no ha dado la cara

**Orígenes autorizados de JavaScript:**

```
URI 1: https://pmo-frontend-antoniosanchez-5466s-projects.vercel.app
URI 2: http://localhost:3000
```

**Ninguno de los dos es el frontend de producción.** `WEB_URL` vale
`https://pmo-frontend-ten.vercel.app`, que es el dominio que el Jefe abre y el
que sirve `<title>PMO Dashboard</title>`. El de la lista es un dominio de
despliegue de Vercel, de los que llevan el nombre de la cuenta.

**No es lo que rompe el login de hoy** —el flujo es de servidor y ahí solo cuenta
el `redirect_uri`—, así que no lo pongo al mismo nivel. Pero es la misma clase de
deriva y va a morder el día que algo del navegador hable con Google directamente.
Lo dejo señalado, no lo llamo urgente.

### 61.4 ✅ Y una que se cierra a favor: la pantalla es **Interna**

`Google Auth Platform → Público → Tipo de usuario:` **Interno**.

**Esto contesta §55.2 y descarta el miedo que llevaba encima desde el 7.** Allí
escribí que una de las causas posibles del `invalid_grant` —app en modo prueba,
con `refresh token` de siete días— **«volvería a pasar sola»**, y lo dejé como
lo urgente que había que distinguir en el panel.

**No es el caso.** Una app Interna del Workspace no caduca los `refresh token` a
los siete días. **La ingesta no se va a volver a apagar sola por ese motivo**, y
eso cambia la urgencia de todo el bloque de §54.

*(De paso cierra también la comprobación de un minuto que dejé pendiente en §21,
el despertar 11: «si la pantalla de consentimiento puede ser Interna en el
Workspace de `zepto.com.mx`». Puede, y lo es.)*

### 61.5 Los dos fallos son el mismo suceso, y por eso hay que arreglarlos juntos

Ayer, entre las 17:24 y las 22:31 hora local, alguien **reconfiguró este cliente
de OAuth**: rotó el secreto y dejó registrada la URL nueva de Cloud Run. De ahí
salen las dos averías, y **se ven en este orden si se intenta entrar**:

1. **Primero muere en la redirección** — `redirect_uri_mismatch`, que es lo que
   el Jefe ve hoy. Ni siquiera llega a pedir el token.
2. **Y si eso se arregla solo, moriría en el intercambio** — `invalid_client`,
   §58, porque producción sigue con el secreto viejo.

**Arreglar uno sin el otro no devuelve el login.** Es la trampa clásica de esta
casa: se corrige el error que se ve, se prueba, falla igual, y parece que la
corrección no sirvió.

### 61.6 Lo que propongo, y por qué esta vía y no la otra

Hay dos formas de cerrar el desajuste de la redirección:

- **A — añadir la URL vieja al cliente.** Un campo, un `Guardar`. **No toca
  producción**, no despliega nada, y es aditivo: lo que ya funciona sigue
  funcionando.
- **B — cambiar `GOOGLE_REDIRECT_URI` a la URL nueva** en Cloud Run y en las
  variables de GitHub. Obliga a revisión nueva, toca dos sitios y deja el
  proyecto a medio camino entre dos nombres.

**Recomiendo A, y con las dos URLs registradas**, no una. El servicio responde
por los dos nombres y así deja de importar cuál se use. B es más «limpio» sobre
el papel y **más caro y más frágil hoy**, que es justo lo que la recta final pide
evitar.

**No lo ejecuto yo:** es la consola de producción del Jefe y yo no reparo. El
paso a paso va al buzón.

**No cierro nada.**

---

## 62. Recorrido de humo en producción, con navegador (2026-09-08, tarde)

Encargo: entrar en producción, completar el login de Google, verificar la
interfaz de la Fase 6 y buscar errores de consola. **El login pasa. La interfaz
no se puede verificar porque no está desplegada. Y por el camino salieron tres
averías vivas que no estaban en ninguna lista.**

### 62.1 ✅ El login de Google funciona, probado de verdad

No me valía entrar y encontrarme la sesión puesta —eso prueba que hay una cookie,
no que el flujo funcione—, así que **cerré sesión y volví a entrar**:

1. `Cerrar sesión` → la pantalla de acceso.
2. `Continuar con Google`.
3. Vuelta a `https://pmo-frontend-ten.vercel.app/?login=success`, con la sesión
   de José Antonio Sánchez Navarro restablecida.

**Ni `redirect_uri_mismatch` ni `invalid_client`.** Las dos mitades de §61 están
cerradas, y esta vez el flujo entero se recorrió, no se dedujo.

### 62.2 ✅ Red, consola y socket: limpios

| Llamada | Código |
|---|---|
| `GET /auth/me` | 200 |
| `GET /tags` | 200 |
| `GET /emails?status=PENDING&take=20` | 200 |
| `GET /health/ready` | 200 |
| `GET /health` | 200 |

**Cero errores de consola.** Lo único que se registra es
`🔗 Conectado a WebSocket …`, tres veces en tres cargas, cada una con su
identificador distinto. **Ningún 4xx, ningún 5xx, ningún fallo de socket.** El
backend responde `OK` con `SERVICE_VERSION = a31384e…` y la revisión viva es
`pmo-api-00117-jm7`.

### 62.3 ⛔ Los tres requisitos de Fase 6 no se pueden validar: no están desplegados

Buscaba el distintivo ámbar `🕒 N propuestas`, el clip de adjuntos y el botón
`Reanalizar`. **No aparece ninguno**, y antes de llamarlo defecto fui a por la
causa. Tres comprobaciones independientes, y las tres dicen lo mismo:

1. **`/version.json` de Vercel:**
   ```json
   { "commit": "259c91f572694bc410fe9d0ac2a1e0c34854e4dc",
     "construido": "2026-08-25T23:30:05.148Z" }
   ```
   **El frontend desplegado es del 25 de agosto.**
2. **El bundle servido es `index-JNoC7SoZ.js`** — el mismo hash que medí ayer al
   buscar la URL de la API. No se ha reconstruido.
3. **Grep sobre el bundle que sirve Vercel ahora mismo:**

   | Cadena | En el bundle desplegado | En el código local |
   |---|---|---|
   | `Reanalizar` | **0** | `kanban/components/AiValidationModal.tsx` |
   | `proposedTasks` | **0** | `inbox/api/emails.api.ts`, `EmailDetailModal.tsx` |
   | `hasAttachments` | **0** | `EmailDetailModal.tsx`, `InboxPage.tsx`, `types.ts` |
   | `force=true` | — | `kanban/api/tasks.api.ts` |

   *(El único `propuestas` del bundle viejo es un `Tareas Propuestas (N)` que ya
   existía en otro componente. No es el distintivo de Fase 6.)*

**La causa, en una línea:** `master` va **5 commits por delante de
`origin/master`**. Los cuatro de @Gravity —`96be13b`, `2b0e61c`, `f2dcd66`,
`c20685d`, todos de hoy a las 14:33–14:38— **están en local y sin empujar**, así
que Vercel nunca los construyó.

**Y el backend de Fase 6 tampoco está:** la API sirve `a31384e`, del 25 de
agosto, y los cambios de Fase 6 siguen sin commitear en el árbol.

**Lo digo con cuidado porque importa para el reparto: el trabajo existe y se ve
bien escrito. Lo que falla es la entrega, no la programación.** Pedirme validar
esta interfaz en producción era pedir que mirara algo que nunca salió del
portátil.

### 62.4 🔴 Hallazgo nuevo: la clave de Anthropic es inválida en producción

Salió del canal de Chat, y lo comprobé antes de escribirlo **con el mismo método
de §58**, sin exponer ningún valor:

| | SHA-256 (12) | Largo | `GET api.anthropic.com/v1/models` |
|---|---|---|---|
| Secret Manager (lo que usa producción) | `229fa05ed3f0` | 108 | **HTTP 401** |
| `.env` local | `6467295d1ea5` | 108 | **HTTP 200** |

**Es el mismo patrón exacto del secreto de Google:** se rotó la credencial, el
`.env` recibió la buena y **Secret Manager se quedó con la muerta**.

**Y está pasando ahora mismo.** En el canal:

```
Error 500 en POST /emails/…/classify
HTTP 401 · {"type":"authentication_error","message":"API key is invalid."}
```

y detrás, lo que de verdad duele:

```
Clasificación perdida: un job agotó sus reintentos
cola=classify-email job=cmtt9buu8005s1qvmv5p4j3ud · 401 API key is invalid
```

**Más de 500 líneas con `API key is invalid` en la última hora** (500 es el tope
que pedí, así que son *al menos* 500). La ingesta volvió, los correos entran —
**y ninguno se clasifica. Cada uno agota sus reintentos y se pierde.**

### 62.5 🔴 Hallazgo nuevo: Gmail está devolviendo 403 por cuota, en bucle

```
Error obteniendo detalle del mensaje …: code=403 · HTTP 403 ·
Quota exceeded for quota metric 'Total Query Cost' and limit
'Units per minute per user' of service 'gmail.googleapis.com'
```

**Más de 500 en la última hora**, también con el tope tocado. Y no es una cuota
diaria agotada: es **«unidades por minuto y usuario»**, o sea **ritmo**.

**Y se muerde la cola, que es lo grave.** El aviso de Capa 1 lo cuenta solo:

```
Sincronizacion de Gmail incompleta: el marcador no avanza
299 sin descargar … El marcador se queda en 6613794 y se reintentara el mismo tramo
```

Lo vi moverse en vivo: **299 → 294 → 291 sin descargar** en unos minutos. La
sincronización pide el tramo entero de golpe, revienta la cuota por minuto, casi
todo falla, **el marcador no avanza y se reintenta el mismo tramo** — que vuelve
a reventar la cuota. Avanza a razón de puñados, quemando cuota en cada vuelta.

**Y tiene reloj**, y lo dice el propio mensaje: *«los `historyId` caducan a la
semana»*. Si el marcador no llega al presente antes de eso, **la recuperación
deja de ser posible por esta vía** y habrá que resincronizar de otra forma.

Cuatro alertas de «el marcador no avanza» en la última hora.

### 62.6 ✅ Y una a favor, que hay que decir: hoy el canal de alertas hizo su trabajo

Contrasta con §56.2, donde el producto estuvo seis horas caído sin que saltara
nada. Hoy, en el mismo canal:

- **Capa 1** avisó del `invalid_client` a las 2:30, del `invalid_grant` a la
  1:07 —el cambio de error entre los dos **es la traza de que el arreglo del
  secreto funcionó**—, de la sincronización atascada, del barrido de
  reconciliación y de cada clasificación perdida.
- **Capa 2** avisó del apagón *y también de la recuperación*:
  *«Push requests … has started to come in again»*.

**El diseño de alertas de este proyecto es bueno.** Lo que falta no es más
alertas: es la que vigila que el servicio conteste (C1 de §60), que es
precisamente el hueco por el que se coló la caída de esta mañana.

### 62.7 Y de paso, dos viejas medidas otra vez, en vivo

- **§51.1 ha empeorado.** La bandeja dice **«20 correos · 18 conversaciones»** y
  Métricas dice **«549 · Total: 549 sin despachar»**. Era un factor de 16 cuando
  lo medí el 26 de agosto; hoy es **27**. La llamada sigue siendo
  `GET /emails?status=PENDING&take=20`.
- **§51.6 sigue igual.** *Tiempo Registrado: 0.0 hrs* con **3 tareas en WIP** y
  **59 atrasadas**. El cronómetro sigue sin cerrar su `TimeEntry`.

### 62.8 El veredicto de QA, en tres frases

**Lo que funciona:** el acceso, la API, el socket, la ingesta y el canal de
avisos. **Lo que no se pudo probar:** toda la Fase 6, porque no está desplegada
ni en frontend ni en backend. **Lo que está roto ahora mismo y no lo estaba esta
mañana:** la clasificación entera, por una clave inválida, y la sincronización,
atascada contra la cuota de Gmail.

**No cierro nada, y no reparé nada.**

---

## 63. El canal, releído: el error cambió de madrugada y son dos averías apiladas (2026-09-09)

El Jefe pregunta por qué siguen llegando mensajes de error. **Siguen llegando,
pero no son los mismos**, y esa es toda la historia.

### 63.1 La cronología, del canal

**Fase 1 — de ayer 17:55 a hoy 02:11.** `Clasificación perdida: un job agotó sus
reintentos`, con `401 · "API key is invalid."`, **una cada quince minutos, toda
la noche**: 18:00, 18:23, 18:44, 18:59, 19:14, 19:29, 19:44, 19:59, 20:14,
20:29, 20:44, 21:00, 21:15, 21:30, 21:45, 22:00, 22:25, 22:40, 22:55, 23:10,
23:25, 23:40, 23:55, 00:10, 00:25, 00:40, 00:55, 01:10, 01:25, 01:41, 01:56 y
02:11. **Treinta y tres clasificaciones perdidas** mientras nadie miraba.

**Fase 2 — desde las 02:25 de hoy, y sigue.** El mensaje cambia por completo:

```
No se pudo encolar un correo entrante
ERR max requests limit exceeded. Limit: 500000, Usage: 500051
```

02:25, 02:30, 05:48, 08:49, luego una ráfaga a las 10:00–10:02, otra a las
10:32–10:37, otra a las 10:52–10:57, y otra hace menos de una hora. **Ahora
mismo sigue.**

**Upstash agotó la cuota mensual: 500.000 comandos, uso 500.051.**

### 63.2 🔴 Y lo que no hay que leer mal, que es la parte importante

**El `API key is invalid` no desapareció porque se arreglara.** Desapareció a las
**02:11**, y el error de Upstash empezó a las **02:25**. Catorce minutos.

**Con Redis rechazando comandos no se encola nada; sin cola no corre ningún job
de clasificación; y sin job no puede aparecer el 401.** La avería de la clave de
Anthropic **puede seguir viva, tapada por la de debajo**.

No lo afirmo en ninguna dirección porque **no lo puedo comprobar ahora**: la
sesión de `gcloud` volvió a caducar (`Reauthentication failed`), así que no puedo
leer la versión viva del secreto ni repetir la prueba de §62.4. **Es lo primero
que hay que mirar cuando se arregle Upstash**, y si no se mira, reaparecerá en
cuanto la cola vuelva a moverse.

### 63.3 🔴 Y la sonda vuelve a mentir, por tercera vez

`/health/ready`, ahora mismo, con Upstash rechazando todos los comandos:

```json
{"status":"ok","info":{"database":{"status":"up"},
 "schema":{"status":"up","aplicadas":11},
 "redis":{"status":"up","responseTimeMs":38}}}
```

**`redis: "up"`.** Es §54.2 otra vez —dio verde con la ingesta muerta, dio verde
con el login roto, y hoy da verde con la cola incapaz de aceptar un trabajo—.
Y esta vez toca la pieza que decide si entra correo.

Que responda no es raro ni es un fallo de la sonda en sí: comprobar que Redis
contesta y comprobar que **acepta trabajo** no son la misma pregunta. **El
defecto es que la sonda solo hace la primera y el semáforo dice «listo».**

### 63.4 Lo que significa para el producto, sin adornos

`No se pudo encolar un correo entrante`: **el correo llega y no entra**. No es
que se clasifique mal ni que se retrase — **no se guarda trabajo ninguno**. La
ingesta está muerta otra vez, por tercera causa distinta en tres días: primero el
`watch` caducado (§54), después la credencial (§58, §62.4), ahora la cuota.

### 63.5 Y el fondo, que no es una fuga: es que el plan no alcanza

Esto no es el escape de §20 volviendo. Aquello se midió y se cerró —`5b8df3a` lo
dio por resuelto—. **Lo de hoy es aritmética.**

En §20 medí el consumo en reposo: **~19 comandos por minuto ≈ 1.140 por hora**,
con el contenedor despierto y sin nadie usando el producto. A ese ritmo:

```
500.000 ÷ 1.140 por hora ≈ 439 horas ≈ 18 días
```

**El plan gratuito de 500.000 comandos al mes no da para este sistema
funcionando de continuo.** Aquella cifra es de agosto y desde entonces se bajó el
sondeo —`stalledInterval` a 10 min, el latido a 5, el cron a horario—, así que el
ritmo de hoy será menor. **Pero el hecho empírico manda: la cuota se agotó.**

Y conviene decirlo con la fecha delante: es **día 9 del mes**. Si el ciclo de
facturación empieza el día 1, se gastaron 500.000 comandos en ocho días.

**No es un defecto que arreglar en el código de hoy para mañana. Es una decisión
de plan**, y tiene tres salidas —subir de plan, esperar al reinicio del ciclo, o
cambiar de proveedor— que **no puedo evaluar desde aquí**: el panel de Upstash
pide sesión y **no meto credenciales en ningún sitio**. Es del Jefe.

### 63.6 Lo que me llevo, y ya van tres veces en tres días

**Cada avería tapó a la anterior.** El `watch` caducado escondía que la
credencial de Google estaba mal; la credencial escondía que la de Anthropic
también; y la de Anthropic ha quedado escondida detrás de la cuota de Redis.
Cada vez, el síntoma nuevo hizo desaparecer el mensaje del anterior — **y un
mensaje que deja de aparecer se lee como un problema resuelto**.

Es el mismo patrón que nombré en §54 —*«el canal se calló justo cuando la pérdida
se volvió total»*— pero una capa más arriba: aquí el canal **no** se calló, cambió
de tema. **Y eso engaña igual, o más.**

La regla que me llevo: **cuando un error deja de aparecer y otro empieza, no se
da el primero por cerrado hasta comprobarlo aparte.** El silencio de un aviso
nunca es una prueba.

**No cierro nada.**

---

## 63.1 Actualización de las 19:05 UTC: la clave está subida y **no aplicada** (2026-09-09)

Vuelvo a mirar con `gcloud` ya restablecido. **Tres cosas han cambiado y una es
la que hay que hacer ahora mismo.**

**✅ Upstash se desatascó.** Último `max requests limit` a las **18:23:46 UTC**;
en los últimos quince minutos, **cero**. La cola vuelve a aceptar trabajo.

**🔴 Y con la cola moviéndose ha vuelto el 401, justo como dije en §63.2.**
`API key is invalid` en los últimos quince minutos: **100**, que es el tope que
pedí. No estaba resuelto: estaba tapado.

**🔴 La causa exacta, y no es la que parecía.** `pmo-anthropic-api-key` ya tiene
**tres versiones**, y comprobé la `latest` contra Anthropic:

```
clave 'latest' de Secret Manager -> HTTP 200
```

**La clave buena YA está en Secret Manager.** Lo que falta es aplicarla: la
revisión viva sigue siendo **`pmo-api-00117-jm7`, creada el 2026-09-08 a las
20:00 UTC** — anterior a la subida. Cloud Run resuelve `secretKeyRef: latest`
**cuando arranca la instancia**, así que las que están corriendo siguen con la
clave muerta en memoria.

Se hizo el paso 2 del paso a paso y no el paso 3. **Es la lección de §27 otra
vez, y esta vez con una credencial: escrito y guardado no es lo mismo que
puesto.** Y mi paso a paso lo decía, pero lo decía en un tercer bloque de código
después de dos — **eso es mío, no suyo**: si un paso es imprescindible para que
los anteriores sirvan de algo, no puede parecer opcional por ir el último.

**🔴 Y el 403 de cuota de Gmail sigue intacto:** también **100** en los últimos
quince minutos. Nadie lo ha tocado, y sigue siendo código (§62.5).

**No cierro nada.**

---

## 64. Auditoría de caja negra de las 16 mutaciones declaradas (2026-09-09, 19:15 UTC)

Doc entrega una lista de sixteen cambios —siete de infraestructura, nueve de
código— y pide verificar el estado real. **Los comprobé contra producción, no
contra la lista**, que es la regla que me dejé escrita en §59.8.

**El resumen en una frase: la infraestructura está hecha y el frontend está
desplegado; el backend no, y ahí viven los seis cambios que arreglan lo que está
roto.**

### 64.1 Infraestructura: siete de siete, con una objeción de forma

| # | Declarado | Verificado |
|---|---|---|
| 1 | Facturación a `015607-DFA49A-B3BAC3` | ✅ `billingAccountName` es esa, `billingEnabled: true` |
| 2 | Uptime check HTTPS a `/health/live` | ✅ existe y **pasa** · 🟡 **no es HTTPS** (ver abajo) |
| 3 | Nueva versión de `pmo-google-client-secret` | ✅ **4 versiones**; `latest` probada contra Google |
| 4 | Nueva versión de `pmo-anthropic-api-key` | ✅ en Secret Manager · 🔴 **no en el servicio** |
| 5 | Redirect URI vieja añadida al cliente OAuth | ✅ probado de caja negra |
| 6 | Upstash a pago por uso | ✅ **cero** rechazos de cuota |
| 7 | Commits empujados a `origin/master` | ✅ `master == origin/master`, HEAD `85b5d4d` |

**Cómo probé el 3 y el 5 sin tocar nada.** El secreto de Google, con un
`refresh_token` inventado contra `oauth2.googleapis.com`: devuelve
**`invalid_grant`**, que significa que **Google aceptó las credenciales del
cliente** y solo rechazó mi token falso. Y el `redirect_uri`: pedí
`/auth/google`, saqué la URL de autorización que construye la aplicación
—`redirect_uri=…pmo-api-mlpuuasqka-uc.a.run.app/auth/google/callback`, la vieja—
y se la pasé a Google: contesta **302**, no la página de error 400. **Está
registrada.**

#### 🟡 La objeción del uptime check, y estuve a punto de contarla mal

`uptimeCheckConfigs` por REST me devolvió **vacío** y casi escribo que el cambio
no existía. **Lo crucé con `gcloud monitoring uptime list-configs` y sí está.**
Anoto el fallo de método: *una lectura que devuelve vacío no prueba ausencia
hasta confirmarla por otra vía.*

Existe, y su configuración real es:

```yaml
displayName: PMO-PRESUPUESTO
monitoredResource: { host: pmo-api-mlpuuasqka-uc.a.run.app }
httpCheck:
  path: /health/live
  port: 80                    # <-- no useSsl
  acceptedResponseStatusCodes: [ STATUS_CLASS_2XX ]
period: 300s
```

**Se declaró HTTPS y es HTTP.** Y por el puerto 80 ese host devuelve **302**, que
no es 2XX. Así que fui a la métrica antes de opinar:

```
uptime_check/check_passed — OK: 1294 · FALLOS: 0 · desde 16:08 UTC
```

**Funciona**, porque el sondeo de Google sigue la redirección. Pero funciona por
un comportamiento que nadie eligió: el check valida un salto a HTTPS y el 200 del
otro lado. **Con `useSsl: true` y puerto 443 mediría lo que dice medir.** La
política está activa, con 60 s de duración y apuntando al canal `Alertas PMO`
correcto.

Y el nombre —**`PMO-PRESUPUESTO`**— no describe lo que hace. El día que salte,
quien lo lea buscará un problema de facturación.

### 64.2 🔴 El backend no está desplegado, y lleva 23 horas así

```
GET /health -> { "version": "a31384e5168b…", "uptimeSec": 82980 }
```

`a31384e` es del **25 de agosto**. `82980 s` son **23 horas**. La revisión viva es
**`pmo-api-00117-jm7`**, con el 100 % del tráfico, creada **ayer a las 20:00 UTC**.

**Ninguno de los seis cambios de backend (4 a 9) está en producción.** Ni la capa
de decisión, ni el `source: EMAIL` con `aiConfidence`, ni el `emailUpdated`, ni el
409, ni el tope de 10 mensajes de hilo, ni —la que más duele hoy— **el limitador
de la sincronización de Gmail**.

Hay **ocho commits** entre lo desplegado y `origin/master`, y entre ellos los dos
que importan: `81f150f feat(backend): implement Phase 6 decision layer and thread
limit` y `e3ffc3c fix(gmail): frenar la ingesta cuando Gmail corta por cuota (P0)`.

### 64.3 🔴 Y la causa exacta: el CI falla, y falla por los `any` de la Fase 6

```
34391597222  CI  master  push  failure  42s   2026-09-09T18:51:45Z
34391667241  Deploy API to Cloud Run     skipped
```

El despliegue está encadenado al CI, así que un CI en rojo lo deja en `skipped`.
**No es que el despliegue fallara: es que no llegó a intentarse.**

Y el motivo, del registro del run:

```
ESLint found too many warnings (maximum: 0).
✖ 7 problems (0 errors, 7 warnings)   — los siete "Unexpected any"

  ai/__fixtures__/emails.fixture.ts:26:26
  ai/email-classification.service.ts:145:41, 152:74
  emails/emails.service.ts:74:18, 339:45, 438:39, 458:45
```

**Los siete son de la Fase 6.** Son los que anoté en §59.6 —entonces cuatro— como
**menor, deuda declarada, que no pare la salida**. Hoy son siete y son **el tapón
que impide desplegar el arreglo P0 de Gmail**.

**Y esto va a mi cuenta, no a la de quien los escribió.** Los clasifiqué por su
gravedad en el código y no por su efecto en la tubería. En un proyecto con
`--max-warnings 0`, **un aviso de lint no es deuda: es un despliegue bloqueado**,
y yo tenía delante el `package.json` que lo dice.

### 64.4 Lo que eso cuesta, medido ahora mismo

Últimos **veinte minutos** de registro:

| Síntoma | Cuenta |
|---|---|
| `Quota exceeded … Total Query Cost` (Gmail) | **300** *(tope que pedí)* |
| `API key is invalid` (Anthropic) | **300** *(tope que pedí)* |
| `max requests limit` (Upstash) | **0** ✅ |
| `marcador no avanza` | **5 avisos** |

**Y el atraso crece en vez de bajar:** 299 → 306 → 354 → **381 sin descargar**, con
el marcador clavado. El limitador que arreglaría esto está escrito, commiteado,
empujado **y sin desplegar**.

El `API key is invalid` es lo de §63.1 sin resolver: la clave buena está en
Secret Manager, **la revisión viva es anterior a la subida** y Cloud Run resuelve
`secretKeyRef: latest` al arrancar la instancia.

### 64.5 🔴 Y la combinación que nadie ha probado: frontend nuevo sobre backend viejo

El frontend **sí** se desplegó: `c20685d`, construido hoy a las **17:46 UTC**,
bundle `index-D7E6ajCn.js`, con `Reanalizar`, `proposedTasks`, `hasAttachments` y
`force=true` dentro. **Y las cabeceras están puestas**, comprobadas en vivo:

```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
```

Eso cierra §53.1 y el C3 de §60. **Bien.**

**El problema es lo que queda debajo.** Sobre `a31384e`, que es lo desplegado:

- **`proposedTasks` no existe en el backend.** Lo comprobé sobre el árbol de ese
  commit: ni una aparición. **El distintivo de propuestas y el clip no van a
  pintarse nunca**, no porque estén mal escritos sino porque el dato no llega.
- **`?force=true` se ignora.** El controlador desplegado declara
  `classify(@CurrentUser, @Param('id'))` y **no lee ningún parámetro de
  consulta**.
- **Y aquí me corrijo una sospecha antes de publicarla:** temí que el botón
  «Reanalizar» sobre el backend viejo creara tarjetas saltándose la cuarentena.
  **El código dice que no.** El `classify` desplegado es una *«clasificación en
  seco»* —llama a `classification.classify()`, no a `classifyAndPersist`— y
  devuelve el borrador sin escribir una sola fila en `Task`. **No hay daño.**
- **Pero hoy el botón devuelve 500**, porque esa ruta llama al modelo y la clave
  viva es la inválida. Es exactamente el `Error 500 en POST /emails/…/classify`
  que lleva un día en el canal.

**Resultado para quien use el producto: una interfaz que promete cuarentena y
reanálisis, sobre una API que no sabe qué es eso y que revienta al pulsarlo.**

### 64.6 Diagnóstico de integridad

**El sistema está partido por la mitad.** Infraestructura: sana. Frontend: al día.
Backend: congelado desde el 25 de agosto, con veintitrés horas de instancia y
ocho commits de retraso, **y es donde vive todo lo que arregla lo que está roto**.

**Un solo hilo lo desbloquea todo, y no es un hilo de arquitectura:** siete avisos
de `any` tumban el lint, el lint tumba el CI, el CI deja el despliegue en
`skipped`, y sin despliegue no entran el limitador de Gmail ni la clave nueva.
**Siete líneas están reteniendo dos averías en producción.**

**Lo que NO recomiendo**, y lo digo porque es la salida rápida y sería un error:
**bajar el umbral de `--max-warnings`.** Ese cero es lo que ha convertido un
descuido en una parada visible en vez de en deuda invisible; es la única razón
por la que hoy sabemos que estos siete existen. **Se arreglan los siete `any`, no
el umbral.**

**No cierro nada, y no reparé nada.**
