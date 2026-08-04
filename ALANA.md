# ALANA — cuaderno de la terminal de observación

> **Uso exclusivo de Alana.** Este archivo no es un encargo para nadie, no
> reparte trabajo y no sustituye a `HANDOFF.md` (que es de Gravity) ni a
> `TASKS.md` (que es el plan). Es la memoria de esta terminal.

---

## 0. Protocolo de esta terminal

Reglas fijadas por el usuario el **2026-07-29**:

| Regla | Detalle |
|---|---|
| **Nombre** | Esta terminal se llama **Alana**. La otra terminal de Claude Code se llama **Claude** y ya tiene sus roles (`AI_ROLES.md`). |
| **Activación** | Alana **solo** despierta con la instrucción literal **«despierta alana»**. Nunca por iniciativa propia, nunca por inferencia. |
| **Qué hace al despertar** | 1) Revisa contextos · 2) Revisa cambios (git, archivos, docs) · 3) Actualiza **este** archivo · 4) **Para**. |
| **Alcance de escritura** | Alana **solo escribe en `ALANA.md`**. No toca código, no toca `TASKS.md`, no toca `HANDOFF.md`, no commitea, no arranca servidores. |
| **Fuera de activación** | Sin la orden, Alana no trabaja. |

**Chequeo estándar de despertar** (lo que hay que mirar, en orden):

```
git log --oneline -15          # qué se commiteó desde el último corte
git status --short             # qué hay sin commitear (y de quién es)
git diff --stat                # tamaño y forma de lo pendiente
TASKS.md                       # casillas que cambiaron de estado
HANDOFF.md → cabecera Estado   # TRABAJAR / EN PAUSA / CERRADO, y a quién
AI_ROLES.md → Excepciones      # si se acordó alguna nueva
docs/SESSION-*.md              # si hay registro de sesión nuevo
```

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

Documentos de referencia: `ARCHITECTURE.md` (diseño, v1.0 del 2026-07-24),
`TASKS.md` (plan por sprints), `HANDOFF.md` (encargos a Gravity),
`AI_ROLES.md` (quién toca qué), `GCP_SETUP.md`, `README.md`.

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

**Canal único con Gravity: `HANDOFF.md`.** Todos sus encargos van escritos ahí.
A Gravity solo se le dice «lee tu md». La cabecera lleva un campo **Estado**
(`TRABAJAR` / `EN PAUSA` / `CERRADO`) que **solo Doc** cambia.

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

## 4. Estado por sprints (corte del 2026-08-03)

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
| **8** | **Métricas, hardening, despliegue** | 🚧 **abierto el 2026-07-29**: seguridad ✅, métricas ✅, **observabilidad ✅ el 2026-08-03**. Queda CI/CD, runbook y backups |

### Sprint 8 — lo que entró (actualizado en el corte del 2026-08-03)

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
| CI/CD completo, runbook, backups | ⬜ |

### Sprint 8 — observabilidad (nuevo en este corte)

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

## 5. Árbol de trabajo (2026-08-03, rama `master`)

```
?? ALANA.md    (este archivo)
```

**Árbol limpio por tercera vez seguida.** HEAD es `0439a3b`, de hoy a las 11:36.

### 🟢🟢 CERRADO EL ÚNICO HALLAZGO ROJO DEL PROYECTO: **ya hay remoto**

```
origin  https://github.com/Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO.git (fetch/push)
HEAD == origin/master     (0 ahead, 0 behind)
```

Llevaba abierto desde el despertar 4 y era el que dejaba **todo el proyecto en
un solo disco**. Ahora está publicado y al día: hay copia y el CI —que apunta a
`master` desde `eb4449d`— tiene por fin dónde ejecutarse. **No lo hizo ningún
commit**: el remoto se configuró fuera del historial, así que no hay rastro de
cuándo ni de quién, solo el hecho.

_Dos apuntes, ninguno bloqueante:_
- `origin/main` existe y contiene **solo `da8f015 "Initial commit"`**: 132
  commits por detrás de `master` y con un commit propio que `master` no tiene.
  Es la rama que GitHub crea sola. El CI escucha `master` y hace bien; lo único
  que puede confundir es que quien abra el repositorio por la web caiga en `main`
  y vea un repositorio vacío si esa es la rama por defecto.
- **No se puede comprobar desde aquí si el workflow llegó a correr**: `gh` no
  está instalado en esta máquina.

### Lo que se commiteó desde el corte anterior (4 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `66cf3ea` | 07-31 17:33 | **Cierre documental del ciclo**: acta del 30, dos casillas de `TASKS.md` y `HANDOFF.md` a `CERRADO` |
| `d358152` | 07-31 18:21 | **(Gravity)** teclado y `role` en las filas del Inbox |
| `37e634e` | 07-31 18:45 | Sondas de salud reales y logs en formato Cloud Logging (primera mitad) |
| `0439a3b` | **08-03 11:36** | Cierra la observabilidad: 71 pruebas, verificación viva y los dos fallos que solo salieron ahí |

### Verificado ejecutando, no leyendo (hoy, sobre HEAD)

```
npm run lint   →  ✖ 28 problems (0 errors, 28 warnings)
npm test       →  Test Suites: 18 passed · Tests: 497 passed
```

Las dos cifras que dice `0439a3b` cuadran con la realidad. Los 28 avisos siguen
siendo todos `no-explicit-any` y no bloquean: **si el CI se dispara hoy, sale en
verde**.

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

### ⚠️ El handoff volvió a quedarse atrás, y esta vez al revés

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

### Lo que se commiteó dos cortes atrás (2 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `b5995a7` | 07-30 18:02 | Los tres `catch (err)` sin usar de `CopilotDrawer.tsx` |
| `f9ce09b` | 07-30 18:04 | `HANDOFF.md`: reescribe la sección 0 caducada |

### Lo que se commiteó tres cortes atrás (3 commits)

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

### ⚠️ Un cambio de comportamiento viajó dentro del commit del linter (sigue vivo)

`2ceedd2` se llama «chore: fix eslint config and styling» y su mensaje dice que
los 22 errores se arreglaron **«sin cambiar comportamiento»**. Pero uno de los
trozos no es un arreglo de lint: en `features/kanban/api/time.api.ts:102` añade
las dos líneas que mandan `tz` en `getTimeReport`. Eso es el encargo de
`HANDOFF.md` §9 —dominio de Gravity— hecho a medias por la terminal de backend,
sin que el mensaje lo mencione, y **la §9 sigue pidiéndoselo a Gravity como si
estuviera sin hacer** (línea 629, reverificado el 2026-08-03). Nota menor del
mismo sitio: `TimeReportResult` **sigue sin declarar el campo `tz`** que el
backend ya devuelve (`time.api.ts:88-94`, comprobado hoy).

### Lo que se commiteó cuatro cortes atrás (3 commits)

| Hash | Fecha | Qué |
|---|---|---|
| `2ceedd2` | 07-30 12:01 | ESLint configurado por primera vez + los 22 errores que destapó |
| `4b3db45` | 07-30 12:06 | `TASKS.md`: la verificación viva del corte de días y el linter |
| `0af5a28` | 07-30 12:10 | `HANDOFF.md`: cabecera nueva con los tres frentes ordenados para Gravity |

### Lo que se commiteó cinco cortes atrás (7 commits)

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
3. **No ejecutar `nest build` con el watcher levantado** — el build borra `dist`
   bajo los pies del watcher y su hijo muere con `Cannot find module dist/main`.
   Para comprobar tipos con el servidor arriba:
   `npx tsc -p apps/api/tsconfig.spec.json` (lleva `noEmit`).
4. **Matar node por puerto, no por PID** (el hijo sobrevive al padre):
   `Get-NetTCPConnection -LocalPort 3000 -State Listen | ... Stop-Process -Force`.
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

⚠️ **`GOOGLE_CLOUD_PROJECT` sigue vacía y ahora tiene una consecuencia nueva.**
Es de donde sale el `projects/<id>/traces/<hex>` del enlace de rastro, y
`traceFieldsFrom` devuelve `{}` sin ella —decisión correcta: mejor no escribir
el campo que escribirlo roto—, así que **hoy las líneas no correlacionan**. Lo
que hay que recordar al desplegar: **Cloud Run no inyecta
`GOOGLE_CLOUD_PROJECT`**; inyecta `K_SERVICE` y `K_REVISION`, que
`service-context.ts` sí aprovecha. Si nadie la pone a mano en el despliegue, la
correlación por traza se queda apagada **en silencio**, sin error ni aviso. Va
al runbook, que está sin escribir.

---

## 9. Pruebas y CI

- **Ahora son `497 pruebas en 18 suites`**, ejecutadas hoy sobre HEAD (`npm test`
  → 18 passed / 497 passed, 13,8 s). Las cuatro suites nuevas son las de
  observabilidad: `all-exceptions.filter.spec.ts`, `gcp-logging.spec.ts`,
  `logger.config.spec.ts` y `health.spec.ts` (`0439a3b`, 71 pruebas). Antes eran
  426 en 14.
  ⚠️ **`TASKS.md` línea 192 se quedó otra vez atrás:** dice «426 pruebas en 14
  suites» —correcto hasta el viernes— y, en la misma línea, **«sigue sin poder
  ejecutarse: no hay remoto configurado (`git remote -v` vacío)»**, que desde hoy
  es falso. Es la misma línea que ya arrastraba la cifra vieja en el corte
  anterior. La casilla, además, sigue como `[ ]` porque las e2e se movieron al
  backlog.
- ✅ **La migración que faltaba ya está** (`eb4449d`): «Estado del repo» del
  handoff lista las tres, con `20260729160000_add_priority_audit` incluida.
  Era el último hallazgo vivo del despertar 2. Confirmadas 9 migraciones en
  `apps/api/prisma/migrations`.
- ✅ **El CI apunta a `master`** (`eb4449d`, con un comentario en el propio
  `ci.yml` explicando por qué) y ✅ **ya hay remoto** (§5): `origin` en GitHub,
  con `HEAD == origin/master`. **Las tres piezas que faltaban están las tres
  puestas** —rama correcta, lint en verde y sitio donde correr—, y con eso el
  guardarraíl deja de depender de que alguien se acuerde de ejecutarlo a mano.
  ⚠️ **Lo que no puedo confirmar desde aquí es que el workflow haya corrido**:
  `gh` no está instalado, así que no se ve el resultado de ninguna ejecución.
  Que *pueda* dispararse está comprobado; que *se haya* disparado, no.
- ✅ **Y si se dispara, sale en verde:** HEAD da 0 errores y 28 avisos y las 497
  pruebas pasan, las dos cosas ejecutadas hoy (§5).
- **Ojo con lo que dice el handoff del linter:** «quedaron arreglados 11
  `catch (e) {}` de tu capa de API — **sin tocar comportamiento**». En el mismo
  commit y en los mismos archivos entró el `tz` de `getTimeReport`, que sí es
  comportamiento (ver §5).
- ✅ **Las dos casillas de Gravity sin marcar quedaron marcadas** en `66cf3ea`
  —vista de métricas y motivo de prioridad en la tarjeta—, y el commit deja
  escrito que se verificó en el código antes de cerrarlas, no por lo que dijera
  el handoff. Estuvieron cinco días sin marcar estándolo.
- ✅ **El hash inventado del acta del 29 está corregido** (`66cf3ea`): donde
  decía `bb0b73f`, que no existe en el repo, ahora dice `27ef27e`.
- Corren sin Postgres, sin Redis y sin llamar a Anthropic. Transpilan sin
  type-check (`isolatedModules`) porque jest moría de memoria si no.
- **No hay E2E** y ya no está previsto en el sprint: **movido al backlog el
  2026-07-31 por decisión de Doc** para no inflar el alcance del cierre. Ni
  Playwright ni Cypress en el repo; los flujos se han probado a mano.
- **CI** (`.github/workflows/ci.yml`): install → lint → build → test, sobre
  `master` (push y pull request).

---

## 10. Deuda abierta

**Deuda de plan** (sección propia al final de `TASKS.md`, aceptada por el
usuario el 2026-07-29 — estuvieron marcadas como hechas en `697784b` sin
estarlo). **Las dos se saldaron el 2026-07-29 por la tarde:**

- ✅ **Auditoría de prioridad** (del Sprint 3) — backend en `795bae1`,
  pintado en la tarjeta en `4191bda`. ✅ **Y la sub-casilla «Pintarlo en la
  tarjeta (Gravity)» ya está marcada** desde `66cf3ea`; estuvo cinco días sin
  marcar estándolo.
- ✅ **Filtros por etiqueta y rango de fechas en `GET /tasks`** (del Sprint 4) —
  `417941f`. Marcada correctamente.

**Deuda de arquitectura** (`AI_ROLES.md`): el refactor de `handleDragEnd` en
`KanbanBoard.tsx` (updater impuro).

**Movido al backlog el 2026-07-29 por Doc:** plantillas de correo reutilizables.

**Cancelado el 2026-07-29 por Doc:** `POST /copilot/draft-email` (lo cubre la
herramienta `draft_email` del chat).

**Otros avisos sueltos:**
- El bundle del frontend pasó de 411 kB a 794 kB al entrar Recharts; Vite ya lo
  comenta. Se parte con `import()` dinámico cuando moleste. Con el tablero de
  métricas ya pintando gráficas, esto deja de ser hipotético.
- **Dos contratos duplicados a mano en `apps/web`, los dos vivos hoy:**
  `features/dashboard/types.ts` copia `DashboardMetrics` en vez de importarlo de
  `@pmo/shared`, y `TimeReportResult` (`time.api.ts:88-94`) **sigue sin declarar
  el campo `tz`** que el backend ya devuelve. Ninguno rompe nada ahora; los dos
  pueden separarse en silencio.
- ✅ **El acta del 30 está escrita** (`66cf3ea`, `docs/SESSION-2026-07-30.md`,
  180 líneas). Era el agujero del histórico que anoté en el corte anterior.
  ⚠️ **Pero el hueco se ha movido:** `docs/` llega hasta el 30 y **el 31 cerró
  con tres commits sin acta** —entre ellos la mitad entera de la observabilidad—
  y hoy tampoco hay registro, aunque el día sigue abierto. El patrón se repite:
  el acta se escribe un día tarde y el día siguiente vuelve a quedarse fuera.
- ⚠️ **`role="button"` anidado en el Inbox** (`d358152`): el envoltorio y el
  contenido de la fila lo llevan los dos, con `tabIndex={0}` cada uno. Dos
  paradas de tabulación por fila y la misma forma del botón dentro de un botón
  que se vino a quitar, ahora en ARIA (§5).
- El `forbidNonWhitelisted` global se dejó fuera **a propósito**: rechazaría los
  campos de más en toda la API, incluidos los cuerpos que ya manda el frontend.
  Es zona compartida, se acuerda antes de tocarlo.
- ⚠️ **`GOOGLE_CLOUD_PROJECT` vacía apaga en silencio la correlación por traza**
  y Cloud Run no la inyecta sola (§8). Es material de runbook, que está sin
  escribir.
- ✅✅ **El guardarraíl del CI está entero.** Los tres motivos por los que no
  servía están saldados: rama (`eb4449d`), lint en verde (`b5995a7`) y **remoto,
  que era el hallazgo rojo único y se cerró en este corte** (§5). Queda sin
  comprobar desde aquí si alguna ejecución ha corrido de verdad.
- **Este corte se cierra sin ningún hallazgo rojo.** Es la primera vez.

---

## 11. Bitácora de Alana

| Fecha | Qué revisó | Corte de git |
|---|---|---|
| 2026-08-03 | **Despertar 6. El corte sin hallazgos rojos, el primero.** Cuatro commits nuevos (tres del viernes por la tarde, uno de hoy) y árbol limpio por tercera vez seguida. **Se cerró el hallazgo rojo único: ya hay remoto** —`origin` en GitHub, `HEAD == origin/master`, 0 ahead / 0 behind—, así que el proyecto deja de vivir en un solo disco y el CI tiene por fin dónde correr; no lo hizo ningún commit, se configuró fuera del historial. **Cerrada la observabilidad del Sprint 8** en dos tiempos: `37e634e` dejó escrito que no estaba probado contra la app, y `0439a3b` lo cierra con 71 pruebas y la verificación viva, donde aparecieron los dos únicos fallos — 🔒 **el código de autorización de Google se estaba escribiendo cuatro veces en el log** (el serializador de `pino-http` guarda la petición como binding del logger hijo, así que la URL cruda salía en todas las líneas de esa petición) y el 503 de la sonda abriendo una incidencia por latido. Sentry cancelado: Error Reporting lee de Cloud Logging, sin SDK ni credencial. Ejecutado, no leído: **497 pruebas en 18 suites, 0 errores y 28 avisos de lint**. Cerrados también el acta del 30, las dos casillas de Gravity, el hash inventado del acta del 29 y la fila del Inbox sin teclado. **Hallazgos nuevos, ninguno rojo:** el `role="button"` anidado con que se arregló el Inbox (dos paradas de tabulación por fila, el botón dentro del botón otra vez pero en ARIA); el handoff al revés —la §0 dice «no arranques hasta que Doc active» y el trabajo entró 48 minutos después—; `GOOGLE_CLOUD_PROJECT` vacía apagando en silencio la correlación por traza, que Cloud Run no inyecta sola; y el hueco del histórico, que se movió del 30 al 31. `TASKS.md` vuelve a arrastrar la cifra vieja y a decir que no hay remoto. No se puede comprobar desde aquí si el CI llegó a ejecutarse: `gh` no está instalado. Actualizadas las secciones 4, 5, 6, 8, 9, 10. | `0439a3b` + árbol limpio (solo `?? ALANA.md`) |
| 2026-07-31 | **Despertar 5.** Corte de cierre de día: dos commits nuevos, los dos de ayer a las 18:0x, **ninguno de hoy**, y el árbol limpio por segunda vez en la historia del proyecto. Los dos hallazgos que dejé abiertos anoche están cerrados: `b5995a7` quita los tres `catch (err)` y **`npm run lint` sobre HEAD da 0 errores / 28 avisos** (ejecutado, no leído del mensaje del commit); `f9ce09b` reescribe la sección 0 caducada del handoff y la sustituye por una regla útil para Gravity — lint en verde antes de cada commit. Anotado que esta vez la excepción de dominio en `apps/web` va **declarada** en el mensaje y comunicada, al contrario que el `tz` de `2ceedd2`. **Queda un solo hallazgo rojo, y es el mismo desde el despertar 4: no hay remoto** (`git remote -v` vacío) — sin CI y sin copia, el proyecto entero en un disco. Los demás hallazgos son de documentos que no siguen al código: la cabecera del HANDOFF sigue en `TRABAJAR` pidiendo cuatro cosas ya hechas, la §9 sigue pidiendo el `tz`, y **`TASKS.md` no se toca desde ayer al mediodía** (423/13 suites, CI en `main`, dos casillas de Gravity sin marcar). Y el 30 cerró con 9 commits y **sin acta**. Actualizadas las secciones 4, 5, 9, 10. | `f9ce09b` + árbol limpio (solo `?? ALANA.md`) |
| 2026-07-30 ~13:10 | **Despertar 4.** El corte del desbloqueo: **Gravity commiteó** (`0d2a4f4`) y con ello se cierran de golpe los dos hallazgos rojos que llevaban tres despertares abiertos — el tablero de métricas ya no pinta `MOCK_METRICS` y **las dos piezas de interfaz del Sprint 6 están hechas** (`threadId` en el cuerpo del chat, recogido del evento `done`, y la lista de hilos con sus tres rutas). Verificado en el código: el indicador de escritura no cuelga del primer `token`, pasa a `streaming` con las cabeceras. También cayeron el CI apuntando a `main` (`eb4449d`) y la migración ausente del handoff. **Hallazgo nuevo, rojo: HEAD no pasa el linter** — tres `catch (err)` sin usar en `CopilotDrawer.tsx`, cuyo arreglo está en el árbol sin commitear, otra vez tocado desde la terminal de backend en dominio de Gravity. **Y el CI recuperado todavía no puede correr: no hay remoto configurado.** La sección 0 del handoff, escrita 8 segundos después del commit que pedía, nació caducada. Actualizadas las secciones 4, 5, 6, 9, 10. | `877c06c` + `CopilotDrawer.tsx` modificado sin commitear |
| 2026-07-29 ~13:40 | Escaneo inicial completo del entorno. Sin modificar nada del proyecto. | `4fcbea6` + árbol de trabajo con la persistencia de hilos del copiloto sin commitear |
| 2026-07-30 ~12:15 | **Despertar 3.** Corte corto, 15 minutos después del anterior, con 3 commits nuevos y trabajo vivo en el árbol. **Se destapó que el linter nunca funcionó en todo el proyecto**: no había configuración de ESLint en ninguna parte, y el CI —que escucha `main` mientras se trabaja en `master`— nunca lo ejecutó, así que el fallo del workflow deja de ser sospecha y pasa a tener una consecuencia comprobada. Gravity está quitando el mock del tablero de métricas ahora mismo, sin commitear: el hallazgo rojo del corte anterior se está arreglando. **Nuevo hallazgo:** el `tz` de `getTimeReport` (encargo §9, dominio de Gravity) entró dentro del commit del linter, cuyo mensaje afirma que no cambia comportamiento. Corregida mi cifra de pruebas: son 423 en 13 suites, no ~407 — las tablas `it.each` declaran varios casos por llamada. De los hallazgos anteriores, el único que sigue vivo es la migración `add_priority_audit` ausente de «Estado del repo». Actualizadas las secciones 4, 5, 9, 10. | `0af5a28` + `useDashboardMetrics.ts` modificado sin commitear |
| 2026-07-30 ~12:00 | **Despertar 2.** Árbol limpio por primera vez: los 7 commits nuevos incluyen todo lo que estaba suelto de Gravity. Se saldó la deuda de plan entera (auditoría de prioridad y filtros) y se abrió el Sprint 8: seguridad, `GET /dashboard/metrics` con motor único de cálculo, `completedAt` encendida y los husos alineados entre métricas y `GET /time/report`. **Hallazgo principal: el tablero de métricas está enchufado en `App.tsx` pintando `MOCK_METRICS` con la llamada real comentada.** Otras discrepancias: la sub-casilla de pintar la prioridad está sin marcar y sí está hecha; falta la migración `add_priority_audit` en «Estado del repo»; el registro del 29 cita un hash que no existe (`bb0b73f`); y las dos piezas de interfaz del Sprint 6 (`threadId` y lista de hilos) siguen sin empezar. Actualizadas las secciones 4, 5, 6, 9, 10. | `3cffc21` + árbol limpio (solo `?? ALANA.md`) |
| 2026-07-29 ~16:30 | **Despertar 1.** 5 commits nuevos: el backend del Sprint 6 quedó completo y Doc lo cerró formalmente. Se commiteó todo lo que en el corte anterior estaba en el árbol de trabajo. Entraron las cuatro herramientas, la bitácora y el bucle de tool use. `POST /copilot/draft-email` cancelado y las plantillas al backlog. Lo pendiente pasó a ser solo frontend de Gravity: mandar `threadId` y la lista de conversaciones. Actualizadas las secciones 4, 5, 6, 9, 10. | `72e1b78` + árbol con 6 archivos de `apps/web/` modificados y `CreateTaskCard.tsx` sin rastrear |
