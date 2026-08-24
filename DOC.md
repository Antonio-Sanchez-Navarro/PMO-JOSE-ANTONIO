# Bitácora de Project Management (Orchestrator / Doc)

**Estado Actual:** Fase 5 en curso (Operaciones Finales y Saneamiento). Fase 4 clausurada y bóveda de respaldos probada en fuego real.
**Fecha de actualización:** 2026-08-20
**Ubicación de despliegue:** Tulum, Quintana Roo (America/Cancun)

## 🏗️ 0. El equipo, desde el 2026-08-20: cuatro capas en Antigravity IDE

Todo el proyecto se opera desde **Antigravity IDE**. Cuatro capas, cada una con
su dueño y su bitácora — el detalle completo está en `AI_ROLES.md`:

| Capa | Quién | Dónde corre |
|---|---|---|
| **Estrategia** | **Doc** | Rol asignable: lo lleva quien el Jefe designe |
| **Backend** | **@Claude** | Terminal de Claude Code, lanzada desde el IDE |
| **Frontend y operación** | **@Gravity** | Agente nativo de Antigravity (Gemini) |
| **Auditoría** | **@Alana** | Terminal propia de Claude Code, despierta con «despierta alana» |

**Doc ya no es un sitio, es un sombrero.** Antes vivía en Gemini en Chrome; ahora
lo lleva quien el Jefe diga —@Claude o el agente de Antigravity— y puede cambiar
de cabeza a mitad de fase. Lo que no cambia es lo que el sombrero obliga.

## 📌 1. Arquitectura de Gestión (El Estándar)

* **`API_CONTRACTS.md`:** Único punto de verdad para endpoints, WebSockets y modelos. Ningún agente escribe instrucciones aquí.
* **`CLAUDE_MEMORY.md`:** Cerebro del Backend. Refactorizaciones, variables de entorno, Cloud Run y lógica de @Claude.
* **`GRAVITY_MEMORY.md`:** Cerebro Frontend/DevOps. Estado de UI, despliegues Vercel y UI/UX de @Gravity.
* **`ALANA.md`:** Memoria de Auditoría. Guardiana del estado real, infraestructura, seguridad y fail-safes.
* **`DOC.md`:** (Este archivo). Memoria de alto nivel para el PM y la orquestación de agentes.
* **`PROMPT_CLAUDE.md` · `PROMPT_GRAVITY.md` · `PROMPT_ALANA.md`:** **El canal de órdenes de Doc**, en los dos sentidos. Arriba, el encargo en curso, el campo `Estado` y las notas de operación. Abajo, el **buzón**: donde el agente anota dudas, bloqueos y contradicciones en lugar de rodearlos. **Locales a cada terminal y fuera de git** (`.gitignore`).
  * **Solo yo borro en esos archivos**, y solo cuando doy una entrada por resuelta. El agente añade al final y no reescribe: sin git detrás no hay historial, y lo que se sobrescribe no vuelve.
  * **Revisar los tres buzones es trabajo mío, no suyo.** Escribir ahí no despierta a nadie — si algo bloquea de verdad, el agente para y avisa al Jefe.

> **Las órdenes y la evidencia no se mezclan** — regla del Jefe, 2026-08-20. Una
> bitácora con encargos dentro deja de poder leerse: no se distingue lo que se
> pidió de lo que se entregó, y cada reparto pisa el historial de lo hecho. **La
> evidencia es lo único que no se puede reconstruir después**; las órdenes, sí.
> Y un encargo es de una terminal y de un momento: no es patrimonio del proyecto
> ni merece un commit. Lo que sí merece registro —la decisión y el porqué— viene
> a este archivo, que sí viaja.
>
> Se llegó aquí por las malas: el 2026-08-20 escribí encargos dentro de
> `GRAVITY_MEMORY.md` y `CLAUDE_MEMORY.md` varias veces en una tarde, y uno de
> esos repartos borró nueve líneas de la bitácora ajena al resumirse. Revertido
> en `865d470` y `ae26614`.

## 🧠 2. Mi Rol y Funciones en el Equipo

Como **Orquestador (Doc)**, soy el copiloto estratégico y arquitecto principal
del Jefe. Mi trabajo no es programar: es analizar, prever y **redactar las
instrucciones** que los agentes ejecutan.

* **Diseño de Arquitectura:** Definir CÓMO se comunican los sistemas (ej. escalar a cero con Pub/Sub + HTTP).
* **Coordinación de Agentes:** Asignar las tareas correctas al especialista adecuado, sin solapamientos entre capas.
* **Análisis Forense:** Leer salidas de terminal y reportes de agentes buscando el fallo silencioso, la concurrencia y la deuda que nadie anotó.
* **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas.
* **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal.

**Mis límites, y son duros:**

1. **No programo.** Ni invento código ni asumo que me toca implementarlo. Si hay que escribir código, me quito el sombrero en voz alta y paso a ser ejecutor.
2. **Escribo aquí y en los prompts.** `PROMPT_CLAUDE.md`, `PROMPT_GRAVITY.md` y `PROMPT_ALANA.md` son mi canal de órdenes: locales a cada terminal, en `.gitignore`, fuera de git. **De las bitácoras no toco una línea** — son la evidencia de lo que hizo cada agente y las escribe su dueño. Los cambios a `TASKS.md` o `API_CONTRACTS.md` los dicto como encargo. *(Regla del Jefe el 2026-08-20, después de que yo escribiera encargos dentro de dos bitácoras en una sola tarde. Ver abajo.)*
3. **Consulto antes de planear.** `ALANA.md` y `TASKS.md` primero, para no repartir dos veces lo ya entregado ni pasar por encima de una auditoría.
4. **Cero confianza.** Riesgos estructurales, de concurrencia y de dependencias se señalan **antes** de autorizar el paso. `git commit -a` y los despliegues a ciegas no pasan.
5. **Comandos aislados.** El CLI (`gcloud`, `gh`, PowerShell) va en su propio bloque, separado del mensaje al agente, para que no acabe pegado dentro de un prompt.

**Cómo respondo:** en operación del proyecto, tres bloques —**[Análisis Rápido]**,
**[Decisión Táctica]** y **[Mensaje para el Agente]**—. En conversación directa,
dudas o regaños: sin estructura, natural y al grano, sin inventar comandos ni
poner agentes en copia cuando no hay tarea real.

---

### 🏆 3. Hitos Recientes (Cierre Definitivo Fase 4) - 2026-08-19

* **Simulacro de Restauración (Fuego Real):** La bóveda fue probada empíricamente. El job autónomo restauró el volcado desde el bucket hacia una base efímera, recuperando exactamente 394 filas de datos reales.
* **Superficie de Ataque Erradicada:** El proyecto temporal en Neon fue destruido permanentemente. La IP pública de Cloud SQL fue sellada al vaciar por completo las redes autorizadas.
* **IaC de Respaldos Saneada:** El job de respaldos (`pmo-respaldo-db`) ahora nace del pipeline en `deploy.yml`, validando que las banderas correctas operen desde el código y no desde la consola.

---

## 🚀 4. Lo que falta (Fase 5: Operaciones Finales y Saneamiento)

**Decisión de Producto:** La integración con WhatsApp (Sprint 7) queda relegada al final absoluto de la cola para evitar abrir cajas de Pandora con terceros antes de blindar la operativa interna.

**Objetivos Inmediatos (Frente DevOps):**

1. **Vigilancia del Job de Respaldo:** ✅ **FIRMADA el 2026-08-20 con fuego real.** Se provocó un fallo controlado —`pmo-respaldo-db-mcqnv`, vía bucket inexistente— y **sonaron las dos capas**: tres avisos de Capa 1, uno por intento, y uno de Capa 2. El `trap` no duplicó. El bucket pasó de 16 a 17 objetos y el nuevo es el de la recuperación: **el simulacro no dejó ni un volcado a medias**, que era la condición que puse.

   **Dato de operación que hay que saber antes de dudar de la alerta:** del primer síntoma al mensaje de Capa 2 pasan **entre 1 y 10 minutos**, según dónde caiga el fallo en la ventana de alineación de 300 s. No es una latencia fija.

   **Y el hallazgo, que vale más que la prueba:** **Google Chat descarta `documentation.content`**. De todo el runbook que habíamos escrito ahí dentro —los comandos de diagnóstico, el aviso de `PG_MAJOR` contra Cloud SQL— la tarjeta **solo enseña `documentation.subject`**, como título. Tampoco viaja el `displayName` de la condición. Era exactamente mi pregunta —si el que lo recibe a las 3 de la mañana sabe qué hacer— y la respuesta era **no**.

   Se descartó `conditions[].documentation` **con el error de la API en la mano**, no por suposición (`Unknown name "documentation"`): la documentación es de nivel política, un solo `subject` para las dos condiciones. Por eso el `subject` no puede redactarse para el caso del fallo —sería mentiroso para el de ausencia, donde lo probable es que ni haya ejecución— y quedó: *«Respaldo de la BD en rojo - fallo o 14 h sin volcado. Mira Scheduler y ejecuciones»*.

   **La lección del ciclo, y es de @Claude:** eran **cuatro** sitios, no tres. Se corrigieron los documentos y se dejó la fuente —el `content` del propio JSON, **desplegado en la política viva**— diciendo todavía lo desmentido. **Al desmentir algo, el sitio que hay que corregir primero es el que está en producción, no la prosa que lo describe.**

   Cerrado también el `--fail` del `curl` en `avisar`: sin él, un `400` del webhook devolvía 0 y el script daba por enviado lo que Chat había rechazado.

2. **Saneamiento del Pipeline Frontend (Vercel):** ✅ **FIRMADO el 2026-08-20**, con prueba en fuego real. El commit de solo `.md` `e031dee` devuelve **`Canceled by Ignored Build Step`**. La fuga está cerrada.

   **Lo que costó, y es la parte que hay que recordar.** El comando era correcto desde `580d2cb`; el archivo estaba en el sitio equivocado. Con **Root Directory = `./`**, Vercel lee `vercel.json` de la **raíz del monorepo**, y el nuestro vivía en `apps/web/`, donde nadie lo abría. Tres correcciones seguidas sobre un fichero inerte. Movido a la raíz en `adad87d`, con **una sola clave** — `buildCommand`, `outputDirectory` e `installCommand` siguen viniendo del panel, que es lo que evita repetir el destrozo del 2026-08-07.

   **Dónde se mira esto, porque el panel miente.** La lista de despliegues trae un filtro por defecto (`Status 6/7`) que **excluye `Canceled`**: los saltados existen y la vista no los enseña. De ahí el «ninguno se salta jamás» que sostuvimos cuatro rondas. El dato limpio está en el estado que Vercel publica en GitHub:

   ```bash
   gh api repos/Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO/commits/<sha>/status --jq '.statuses[].description'
   ```

   Ni el manifiesto de artefactos ni la duración sirven: un build saltado reutiliza la salida del anterior, así que enseña los **mismos bytes** que uno real.

   **Y un error mío, anotado para no repetirlo:** descarté la pregunta del Root Directory —«con `:(top)` la respuesta deja de importar»— y era la pregunta que decidía todo. Hice robusto el pathspec de un archivo que nadie leía. **Antes de arreglar cómo se ejecuta algo, comprueba que se ejecuta.**

**Decisión — cómo resuelve el pipeline el canal de la alerta (2026-08-20):**

@Claude preguntó antes de escribirlo, que era justo lo que el encargo pedía. Se
resuelve **por `displayName` «Alertas PMO»**, no por id incrustado ni por variable
de GitHub — una variable devolvería el id a un sitio fuera de git, la familia que
ya costó `WEB_URL` y `GOOGLE_REDIRECT_URI`.

Con tres condiciones, y las dos primeras no son opinables:

1. **Coincidencia exacta y recuento, nunca `head -1`.** Con dos canales homónimos,
   `head -1` reescribe la política para que avise **a un sitio que nadie mira**, y
   seguiría diciendo `enabled`. 0 canales o más de 1 → no se toca la política.
2. **Verificar después de escribir** que `notificationChannels` no quedó vacío.
   Una política muda es indistinguible de una sana desde fuera.
3. **El id resuelto, al log del run**, para que «º a dónde avisa esto?» tenga
   respuesta en el registro y no en la consola.

El *fallback* que propuso @Claude se acepta tal cual — **«mejor la vieja que una
muda»**: si el canal no aparece, no se toca la política y no se bloquea el
despliegue de la API.

**Registro de estado (2026-08-20, verificado en `git log`, no en reporte):**

| Qué | Dónde | Estado |
|---|---|---|
| Deuda de frontend de Fase 5 (concurrencia del Inbox, URL de socket por `VITE_API_URL`, roles ARIA anidados, muerte de `mockTasks.ts`) | `251d60e` | ✅ entregado por @Gravity |
| `vercel.json` — fuga de builds por `.md` | `251d60e` → `580d2cb` → `adad87d` (a la raíz) | ✅ **firmado**: `e031dee` sale `Canceled by Ignored Build Step` |
| Política de alerta del respaldo | `285e3a2`, `ad1fe4c` | ⚠️ escrita, sin sonar |
| Capa 1 (portero CRLF + espejo en CI) y Capa 3 / simulacro mensual | — | ⬜ sin empezar, de @Claude al cerrar la Fase 5 |

## 🔍 6. Auditoría completa de @Alana (§37) y su reparto — 2026-08-21

Barrido de todo el árbol sobre `d5d2d45`: `lint` limpio, **614 pruebas en verde**,
19 hallazgos, y **diciendo qué no comprobó** —nada vivo en Google Cloud, nada en
navegador, nada de carga—. Esa última frase es lo que hace utilizable un informe
de 19 puntos.

**Doc verificó en el archivo los cuatro que mueven código antes de repartir.** Los
cuatro ciertos: el marcador de Gmail avanza pase lo que pase, `BullModule` no
declara `defaultJobOptions`, `trust proxy` no aparece en ninguna línea de
`apps/api`, y `maxScale` sale una sola vez en `deploy.yml` —dentro del comentario—.

**Lo que el informe deja implícito y conviene decir entero:** §37.1 y §37.2 juntos
son peores que por separado. El `add` a Redis está **dentro** del mismo `try` que
el `upsert` y `processedCount++` va **después**. Si Redis rechaza: el correo ya
está en la base, el contador no sube, el `catch` lo tapa con un `warn`, **el
marcador avanza igual**, y el log dice «N correo(s)» con N más bajo de lo real. El
operador ve un número menor y ningún error, y ese correo queda sin clasificar para
siempre.

| Encargo | Qué | Quién |
|---|---|---|
| **A** 🔴 | Los tres rojos, todos en `gmail.service.ts`: marcador, `catch` compartido, `defaultJobOptions`, tope de paginación | @Claude, tras el Punto 2 |
| **B** 🟠 | `--timeout` contra los 10 min del copiloto, y `--max-instances` + `connection_limit` | @Claude, con el Punto 2 — mismo archivo |
| **C** 🟠 | `trust proxy`. **Aparte a propósito**: mal puesto permite falsear la IP con una cabecera, peor que el problema que arregla | @Claude |
| **D** 🟡 | Seis de frontend: arrastre sin revertir, dos carreras de peticiones, el 401 por texto, refresco sin cerrojo, la URL duplicada | @Gravity |

**No repartido, y por qué:**

- **§37.8** (el socket reconecta para siempre y la sesión no se refresca) está
  **partido** entre los dos dominios. Un arreglo a medias deja el tablero mudo sin
  decirlo, que es el fallo que tiene hoy. Lo coordina Doc, no se reparte a ciegas.
- **§37.7** (escalar a cero apaga los workers y nadie los despierta) **es decisión
  del Jefe, no técnica**: `--min-instances=1` cuesta dinero todos los meses; un
  ping desde Cloud Scheduler es gratis y feo. Con N=1, Doc se inclina por el ping.

**Corrección al informe, y es mía:** §37.20 deja viva la pregunta de si el *Root
Directory* de Vercel es `apps/web`. **Ya está contestada**: entré al panel, es
`./`, y por eso el `vercel.json` va en la raíz y `e031dee` sale `Canceled by
Ignored Build Step`. Su §37.20 se escribió sin ese dato.

**Lo que enseña el barrido**, y lo firmo entero: los tres rojos son la misma forma
de fallo que toda la Fase 4 —**algo que sale en verde mientras pierde trabajo por
detrás**— y **dos están documentados al revés**: `ai.processor.ts` explica un
reintento que no existe y `deploy.yml` justifica un coste con un `maxScale` que no
fija. En un repositorio donde los comentarios son tan buenos, **un comentario
equivocado es peor que ninguno**: el siguiente no va a comprobarlo, va a creerlo.

### Decisión — §37.7: barrido de reconciliación, no ping ni `min-instances` (2026-08-21)

**Decidido con el Jefe.** El problema: Cloud Run escala a cero, con la instancia se
apagan los workers de BullMQ, y un trabajo que se quede atrás **espera al siguiente
correo**, no a un temporizador — con `stalledInterval` en 10 min, la reclamación
tampoco ocurre, porque reclamar exige un worker vivo.

**Lo que se descartó, y por qué:**

- **`--min-instances=1`** — ~15–25 USD al mes, fijos, para un proyecto de N=1.
- **Un ping periódico a secas** — y aquí está el detalle que cambia la
  comparación entera: el servicio va con **`--no-cpu-throttling`**, que asigna CPU
  **mientras la instancia viva**, no solo mientras atiende. Un ping cada cinco
  minutos la mantiene despierta casi todo el día y **cuesta casi lo mismo que
  `min-instances=1`, sin la garantía**. Un ping poco frecuente ya no es solución:
  es la misma latencia disfrazada.
- La preferencia por quedarnos en Google **no decidía**: las dos opciones son
  Google nativo. Decidió el coste y, sobre todo, lo que sigue.

**Lo elegido: un barrido de reconciliación en Cloud Scheduler, cada 15 minutos.**
La diferencia con el ping es que el ping despierta el contenedor y ya; el barrido
**despierta el contenedor y además recoge lo que se quedó atrás**. Tapa dos
agujeros en vez de uno: el de §37.7 y el que ni `min-instances` ni un ping ven
nunca — los **correos guardados y sin encolar** de §37.1, que un worker vivo no
reprocesa porque el trabajo **nunca llegó a existir**.

Y encaja con lo que ya hay: el módulo `cron` con `CronAuthGuard` y sus rutas
`/cron/overdue` y `/cron/gmail-watch`, invocadas por Cloud Scheduler con OIDC igual
que `pmo-respaldo-db-diario`. No hay arquitectura que inventar. El trabajo nace del
**mismo `deploy.yml`** que @Claude está tocando, así que no vivirá en la consola.

Coste: **cero** — el nivel gratuito de Scheduler cubre tres trabajos y hoy se usa uno.

**Secuencia, y no es negociable:** va **después del Encargo A**. Un barrido que
reencola sobre un `persistEmails` que todavía comparte `catch` puede reencolar en
bucle lo que vuelve a fallar. Primero la causa, luego la red.

### Entrega de @Gravity — los seis de frontend (2026-08-21)

Los seis hallazgos entregados, **un commit por hallazgo**, y verificados por Doc en
el archivo: `9ddecfa` (revierte y avisa con `toast`, copiando el camino que
`handleDeleteTask` ya hacía bien), `809d8e3` y `59f61b7` (la misma carrera, mismo
mecanismo), `5aa1802`, `dc45460` (promesa única en vuelo, limpiada en `finally`) y
`b259c27`. En §37.9 hizo **las tres cosas** que se pedían, no solo el `debounce`.

**Y de paso apareció una deuda saldada que nadie había cerrado por escrito:** la
excepción de `handleDragEnd` en `AI_ROLES.md` —abierta desde el 2026-07-27, *«hoy
funciona por suerte, no por diseño»*— describía el mundo anterior. `moveTask` ya
no se llama dentro del updater. Corregida ahí mismo.

### Decisión — @Alana audita sin leer bitácoras ajenas (2026-08-21)

**Del Jefe.** @Alana deja de leer `CLAUDE_MEMORY.md`, `GRAVITY_MEMORY.md` y **este
archivo**. Nació leyendo los tres porque Doc vivía en Chrome y necesitaba sus ojos
dentro del entorno; desde la mudanza a Antigravity esa razón ya no existe, y lo que
queda es el coste: **hereda el relato del que ejecutó**.

Sigue leyendo el código, git, la nube y los documentos neutrales —`AI_ROLES.md`,
`TASKS.md`, `API_CONTRACTS.md`, `ARCHITECTURE.md`, `GCP_SETUP.md`, `infra/`,
`docs/`—. Se cierran las tres bitácoras y nada más. Dos modos: barrido completo, o
alcance dirigido por Doc.

**Lo que esto me obliga a mí, y es el punto entero de la regla:** las bitácoras
guardan también el *porqué* de lo deliberado — el `stalledInterval` de 10 minutos
se subió para ahorrar comandos de Upstash, no por descuido. **Cuando una
restricción deliberada importe para lo que le pido, se la escribo en su prompt.**
Si un día marca como defecto algo que era una decisión, el fallo será mío por no
habérselo dicho, no suyo por no haberlo adivinado.

Su contrapartida: lo que huela a decisión consciente **se pregunta en el buzón
antes de afirmarse**.

### Fallo de reparto, y es mío — los cinco hallazgos sin dueño (2026-08-21)

@Alana cerró con código cinco hallazgos suyos (§37.15–§37.19) en `apps/api`,
`apps/web` e `infra/`. Su protocolo dice que solo escribe en `ALANA.md`.

**No empezó con la palabra «ciérralos». Empezó dos pasos antes, conmigo.** Repartí
los 19 hallazgos —A/B/C a @Claude, seis a @Gravity, el §37.7 al Jefe— y **dejé
cinco sin dueño**. Ella vio el hueco en su propia lista, se ofreció, y el Jefe
aceptó una oferta razonable. Nadie hizo nada raro: **el defecto fue que existiera la
categoría «sin dueño»**.

Y tiene una simetría que no conviene dejar pasar: **los hallazgos huérfanos de la
auditoría fallaron igual que los 27 correos huérfanos que la auditoría encontró.**
Algo que nadie posee, que no da error, y que alguien acaba recogiendo por
casualidad.

**Lo que salió bien, y hay que decirlo primero:** de los cinco, **dos no estaban
rotos**, y lo cantó ella. Los tres `findMany` que «faltaba» acotar **habrían abierto
tres agujeros nuevos**: `renovarWatchDeTodos` habría dejado de renovar a los
usuarios que quedaran fuera —apagando su ingesta sin un error— y el barrido de
vencidas habría dejado tarjetas atrás **saliendo en verde**.

**Lo que se corrige:**

1. **@Alana encuentra y comprueba; no cierra.** El motivo no es la línea de dominio:
   auditó y corrigió sus propios hallazgos, y eso deja a nadie fuera para decir «eso
   que arreglaste no estaba roto». Que lo dijera ella fue honestidad, no diseño.
2. **Ningún hallazgo se queda sin dueño.** Si es menor, tiene dueño y «más
   adelante».
3. **Los encargos dicen «comprueba y, si es cierto, cierra»**, nunca «ciérralos»
   sobre hallazgos sin verificar.

**Y una deuda que salió de revisar sus commits:** `36938c9` se titula «siete
mensajes en inglés» y cambió **726 líneas** de `CopilotDrawer.tsx`. Con
`--ignore-cr-at-eol` son **dos**. Las otras 724 son finales de línea, y el archivo
quedó mezclado de otra forma de la que estaba. Hay `.gitattributes` desde el 19-08
y **no lo está impidiendo** — 5 de los primeros 60 archivos de `apps/web` tienen
finales mezclados. Repartido a @Gravity: **diagnóstico antes que normalización**,
porque normalizar sin saber por qué falló el control garantiza que vuelva.

### 🔴 El barrido que aprobé tiene un bucle sin final (2026-08-21)

**Corrección de la premisa, y me corrige a mí.** Abrí el expediente de los 27
huérfanos con la hipótesis de que un rechazo de Redis dejaba el correo guardado y
sin encolar. @Alana fue a Cloud Logging: **el `add` a Redis no falló ni una vez en
30 días.** Cero OOM, cero `evicted`, cero `ENOTFOUND`, cero `ECONNREFUSED`.

El `catch` de `persistEmails` dejó **una** línea en un mes: `2026-08-17`, `P1001`,
base inalcanzable en Neon. **Es la base, no Redis** — y como falló el `upsert`, ese
correo **nunca llegó a guardarse**: es la *otra* mitad de §37.1, el correo perdido
con el marcador avanzando igual. Un caso real de aquel hallazgo, pero no de este.

**Consecuencia para la decisión de Cloud Tasks: este expediente no la apoya ni la
descarta.** No hay fallo de Redis que migrar. La tendencia de cuota —334 k de 500 k
a día 21— sigue en pie como argumento aparte, y el gasto en reposo del sondeo de
BullMQ también; pero los 27 no eran eso.

**Qué pasó de verdad: 23 de los 27 se recuperaron en la primera pasada.** El barrido
funcionó y §37.7 queda justificado por ese número solo.

**Y los otros cuatro —ahora cinco— son un bucle sin final que nació hoy con el
propio barrido.** Verificado por Doc en el código: `ai.processor.ts` hace `return`
**sin escribir `processedAt`** cuando el correo no tiene `bodyText` ni `snippet`, y
`gmail.service.ts:641` consulta `where: { processedAt: null }`. Un correo sin texto
**no sale nunca del conjunto de candidatos**: 96 vueltas al día despertando Cloud
Run, tocando Cloud SQL y gastando Upstash para no hacer nada. Con dos efectos
medidos por @Alana: el freno de alertas tiene **margen cero** (ventana de 900 s
contra un cron cada 900 s) y `MAX_RECONCILIADOS=100` con `receivedAt asc` deja que
**cada atascado ocupe una plaza permanente por delante de los nuevos**.

**Y la parte que es mía, dicha entera:** el barrido se desplegó **sin ver una sola
pasada completa**. Firmé §37.7 por diseño y no por observación — exactamente lo que
llevamos una semana exigiéndole a todo lo demás— y la cadencia de quince minutos
la elegí yo, que es lo que convierte un caso raro en 96 al día. **Es la forma de
fallo de esta casa cometida dentro del arreglo que la perseguía.**

Repartido a @Claude con tres piezas: cerrar el bucle **dejando rastro** —marcado
terminal y contable, no excluido de la consulta, que sería cambiar un problema
ruidoso por uno silencioso—, subir el margen del freno, y decidir qué hacer con el
orden. Y una pregunta de fondo que va con el encargo: **¿por qué llegan correos sin
`bodyText` ni `snippet`?** Si el parseo MIME se los está comiendo, el bucle es el
síntoma menor de los dos.

**Condición de firma:** no se cierra con código ni con pruebas, sino con **una
pasada real del barrido con los cinco fuera**. El error fue aprobarlo sin
observarlo; no se repite en el arreglo.

### El freno pasa uno de cada dos, y el aviso miente (2026-08-21)

**Dato del Jefe, que los logs no podían dar** — la línea del aviso se registra
**antes** de consultar el freno, así que @Alana no podía saber si Chat los recibía.
Pegó su Chat y se cruzó con las pasadas: llegaron los de **22:37, 23:00 y 23:30
UTC**; no llegaron los de 22:45, 23:15 ni 23:45.

**El freno funciona a medias, que es exactamente lo que predice un margen cero:**
ventana de 900 s contra un cron de 900 s, cada aviso cae en el borde y **pasa uno
de cada dos**. No son 96 al día, son unos 48.

**Y hay algo peor que la frecuencia, y solo se ve leyendo el texto que llegó:**

> *«Si esto se repite, mira los avisos de sincronización de Gmail: el camino normal
> está perdiendo el `add` a la cola.»*

**Es falso.** El `add` no falló ni una vez en 30 días. El aviso manda a quien lo
recibe a buscar una causa que no existe, a las tres de la mañana, que es cuando
nadie va a comprobarla. Misma familia que el `maxScale` del comentario y el
`attempts` inexistente, **pero dentro de la alerta** — el único sitio donde un texto
equivocado se convierte directamente en tiempo perdido de una persona.

**Y una distinción que sale de mirar los cinco mensajes seguidos:** el de las 5:37
con 27 correos **valía oro**; los cuatro siguientes son ruido. **Un aviso que se
dispara por una condición conocida y estable no es un aviso, es una suscripción.**
Debe avisar por que **aparezca algo nuevo**, no por que *haya* candidatos.

El daño real no es la molestia: **la próxima alerta de verdad —un respaldo caído—
llegará enterrada entre mensajes idénticos que ya se han aprendido a ignorar.** Un
canal de alertas se gasta, y este se está gastando.

Añadido al encargo de @Claude como pieza 4, y la pieza 2 sube de prioridad.

### ✅ El bucle, cerrado — y lo que apareció debajo (2026-08-22)

**Firmado, y por primera vez en toda la Fase 5 firmado habiéndolo visto correr.**
Verificado por Doc en Cloud Logging, no en el reporte de nadie:

```
00:45:06  pmo-api-00086  5 reencolado(s) de 5 candidato(s), 5 cerrado(s) sin clasificar
00:49:27  pmo-api-00087  0 reencolado(s) de 0 candidato(s), 5 cerrado(s) sin clasificar
```

Seis pasadas idénticas y luego cero. **Los cinco se curaron solos** — la primera
pasada con el código nuevo los reencoló, el worker entró por la rama sin texto y
los marcó—, sin tocar la base a mano. Las cuatro piezas cerradas: `skipReason`
terminal y contable, freno a 3.600 s, el orden aceptado con chivato, y el aviso
que ya no miente **y que solo se dispara por huérfanos nuevos**.

**Dos correcciones de @Claude que van al registro porque me corrigen a mí:**

1. **La pieza 2 sola no bastaba.** Con 3.600 s habríamos pasado de un mensaje cada
   media hora a uno cada hora — menos ruido, **misma naturaleza**. Lo que corta el
   problema es la 4: dejar de avisar por una condición conocida. Yo presenté la 2
   como el arreglo y la 4 como el añadido; era al revés.
2. Y el descarte que escribió antes de arreglar: *«la salida fácil habría sido
   excluirlos en la consulta del barrido. Se descarta: eso cambia un problema
   ruidoso por uno silencioso.»*

---

### 🔴 Lo que apareció debajo: el cuerpo de los correos grandes se pierde

Registrar las **etiquetas de Gmail** de los correos cerrados sin clasificar —idea
de @Claude, no del encargo— contestó la pregunta de fondo. Y contestó mal:

```
UNREAD, IMPORTANT, CATEGORY_PERSONAL, INBOX
UNREAD, CATEGORY_UPDATES, INBOX
CATEGORY_PROMOTIONS, UNREAD, INBOX   (×2)
UNREAD, CATEGORY_UPDATES, INBOX
```

**No son invitaciones ni correos solo-adjunto. Es correo corriente de la bandeja, y
uno marcado `IMPORTANT`.** La hipótesis cómoda descartada por evidencia.

Causa verificada por Doc en el código: **las tres ramas de `extractBodyText` exigen
`p.body?.data`**, y Gmail manda `attachmentId` en vez de `data` cuando la parte
pasa de cierto tamaño. Un correo largo pierde el cuerpo entero.

**Y la consecuencia que no dijo nadie, que es la que cambia el tamaño del
problema:** esos cinco solo destacaron porque además tenían el `snippet` vacío.
**Un correo grande *con* snippet no queda huérfano: se clasifica igual, leyendo
solo el snippet** — doscientos caracteres en vez del correo entero. Termina bien,
no da error, no cuenta en ningún sitio.

**Es posible que la IA lleve semanas leyendo las dos primeras líneas de los correos
largos.** No es un fallo del barrido: es **la función central del producto
degradada en silencio**, la forma de fallo de esta casa en el sitio donde más caro
sale.

**Repartido a @Claude con la medición por delante del arreglo:**

```sql
SELECT count(*) FROM "Email" WHERE "bodyText" IS NULL AND "snippet" <> '';
```

Cinco es una curiosidad; doscientos es que llevamos semanas clasificando a ciegas.

**Y una decisión que será del Jefe y por eso el número va primero:** si hay muchos,
**lo ya clasificado está degradado**. El camino de reproceso existe
(`replaceExisting: true`), pero cuesta llamadas a Anthropic. Nadie reprocesa nada
por iniciativa propia hasta que él lo diga.

Queda sin explicar el `snippet` vacío, y @Claude hizo bien en no adivinarlo:
arreglar el parseo sin entender eso sería **medio arreglo con cara de entero**.

### 🔴 Vercel llevaba dos días sin desplegar, y el comando era mío (2026-08-22)

**Treinta correos de error a la bandeja del Jefe fueron el único aviso.** Todos los
despliegues de producción fallaban desde `9aae796`:

```
Command failed with exit code 128: git diff --quiet $VERCEL_GIT_PREVIOUS_SHA ...
fatal: bad object fc4216a
```

Vercel **clona en superficie**. `$VERCEL_GIT_PREVIOUS_SHA` apuntaba al último
despliegue correcto —del día 20— y ese commit ya no estaba en el clon. Y se
retroalimentaba: como todos fallaban, el puntero no avanzaba y el SHA se alejaba un
commit más en cada push.

**Mi error, textual:** escribí en dos encargos que *«Vercel aborta el build solo con
salida 0; cualquier otra cosa significa construye»*. **Es falso.** Un
`ignoreCommand` que **falla** no construye: **hunde el despliegue**. Con ese
razonamiento descarté la versión de @Gravity con rutas relativas diciendo que «la
fuga volvería entera», cuando el fallo real de un 128 es el contrario.

**El daño:** los seis hallazgos de frontend de la auditoría, la normalización de
finales de línea y todo lo demás **estaban en `master` y no en el navegador de
nadie**. Los dimos por cerrados dos días antes de que existieran.

**La regla que sale de aquí:** *el `ignoreCommand` no puede fallar nunca; si no
puede decidir, que construya.* Un build de más cuesta segundos; uno de menos costó
dos días. Cerrado por @Gravity en `f4afa28` con `git cat-file -e` y `exit 1` de
respaldo, y **verificado con las tres condiciones**: despliegue en verde
(`80ce4de`), el salto sigue vivo (`73cc1a8` → `Canceled by Ignored Build Step`), y
**el trabajo dentro del bundle en vivo** — abrió el JS desplegado y buscó el texto
del §37.10 y la constante del §37.14.

**Y el hueco que esto destapa, que sigue abierto:** **Vercel no está en ninguna de
las dos capas de vigilancia.** Ni la Capa 1 ni la Capa 2 miran el frontend.
Llevamos una semana blindando ingesta y respaldos mientras la mitad visible del
producto avisaba solo por correo, a un canal que nadie había declarado como tal.

---

### ✅ Y la alarma del parseo era falsa — corrección mía (2026-08-22)

Escribí que **«es posible que la IA lleve semanas leyendo las dos primeras líneas
de los correos largos»**. No ocurrió. La sonda, con sus testigos:

```
solo-snippet=0 · sin-cuerpo=5 · con-snippet=242 · total=247
```

`con-snippet=242` prueba que el operador funciona —el cero no es una consulta
rota— y la aritmética cierra: 247 − 5 = 242. **Ningún correo se clasificó leyendo
solo la vista previa**, y la decisión sobre reprocesar que iba a plantearle al Jefe
**no existe**.

Lo presenté con más peso del que aguantaba. Y que se sepa no fue por razonar mejor:
fue porque **@Claude exigió medir antes de arreglar y luego desconfió de su propia
medida** — *«un número que no se puede distinguir de su propio fallo no mide
nada»—. Un cero sin testigos habría cerrado el encargo con un «todo bien» falso.

**Reencuadre:** el hueco del `attachmentId` es real y **no ha mordido** (242 de 247
extrajeron cuerpo), y desde hoy deja rastro. **Baja de prioridad porque lo
medimos.** Queda una pregunta más pequeña y más rara: los cinco tienen cuerpo **y**
snippet vacíos a la vez, y esa correlación el `attachmentId` no la explica.

**Reparto:** §43.2 primero —se dispara justo al recuperarse de una caída, y los
correos que fallan al descargarse ni llegan a `persistEmails`, así que el marcador
avanza igual—; el `attachmentId` detrás.

### Decisión — la zona horaria es `America/Cancun` (2026-08-22)

§44.2 de @Alana. `time-zone.ts:24` fija **`America/Mexico_City` (UTC−6)** y lo
justifica en su docblock como *«donde trabaja quien usa esto»*. **Toda la
infraestructura corre en `America/Cancun` (UTC−5 fijo)**, escrito dos veces en
`deploy.yml`.

**Efecto medido:** lo cerrado o fichado **entre 00:00 y 01:00 hora local cuenta en
el día anterior**, en `GET /dashboard/metrics` y en `GET /time/report`.

Ella no lo dio por defecto y acertó: el docblock lo declaraba **decisión de
producto**, así que *o el valor está mal o el comentario lo está*, y eso no es suyo.

**Decisión de Doc: el valor está mal.** El Jefe está en Tulum — `America/Cancun`,
UTC−5 **sin horario de verano**, que además es lo que evita que el número baile dos
veces al año. Se cambia la constante **y el comentario**: esa frase es justo la que
hizo que el error pareciera intencionado durante meses.

---

### 👀 Frente abierto: vigilancia del despliegue — las dos capas (2026-08-22)

Comprobado por Doc: **ningún workflow avisa ante fallo.** `deploy.yml` menciona el
webhook solo para **inyectárselo a los servicios**. Y no es solo Vercel: **si el
despliegue de la API se cae, tampoco se entera nadie.** Lleva funcionando porque no
ha fallado.

La asimetría, dicha en voz alta: para el respaldo construimos **dos capas** —una
dentro que dice el motivo, otra fuera que garantiza que te enteras— y escribimos por
qué hacían falta las dos. Para el despliegue, **cero**. La misma casa, el mismo mes.

| | Quién | Qué garantiza | Su punto ciego |
|---|---|---|---|
| **Dentro** | Workflow con `deployment_status: failure` y `workflow_run: failure` → Chat | dice **qué** falló y dónde mirar | no ve lo que **no llega a fallar**: si Vercel deja de disparar, no hay evento |
| **Fuera** | Sonda periódica que compara el commit servido con el último que tocó el frontend | garantiza que **te enteras**, sea cual sea la causa | no sabe el motivo |

**Dos detalles de diseño que deciden si esto sirve:**

1. **La sonda NO compara contra la cabeza de `master`.** El `ignoreCommand` hace que
   producción **legítimamente** no avance con commits de backend o de `.md`. Compara
   contra **el último commit que tocó `apps/web` o `packages/shared`** — el mismo
   criterio del `ignoreCommand`. Cualquier otra cosa avisa todo el día y acabamos
   ignorándola, que es como se muere un vigilante.
2. **El trabajo que avisa no puede vivir dentro del que falla.** Job aparte, con su
   propia autenticación — la misma lección que el `avisar` dentro de `respaldo.sh`.

Repartido: la Capa 1 y la sonda a @Claude; publicar el commit del build en una URL
sin sesión, a @Gravity.

### ✅ Cerrado el hilo de los 27 huérfanos, y no era lo que parecía (2026-08-24)

El diagnóstico de los cinco correos sin texto cierra una cadena que empezó con
«la ingesta pierde correos en silencio». **Ninguna de las tres alarmas sucesivas
resultó ser lo que se supuso**, y cada una se desmontó midiendo:

| Se supuso | Lo que era |
|---|---|
| Un rechazo de Redis dejaba correos sin encolar | **Cero fallos de Redis en 30 días.** La única línea del `catch` era `P1001` contra la base |
| La IA llevaba semanas leyendo solo la vista previa | **`solo-snippet = 0`**, con testigos que lo hacen falsable |
| El hueco del `attachmentId` se está comiendo cuerpos | **Aquí no perdió ni uno.** Cinco de seis sí tenían `text/html` con `data` |
| Son dos fallos, y el del `snippet` vacío sin explicar | **Es uno, y no es un fallo** |

**La respuesta, con mecanismo y no con deducción:** esos correos son
legítimamente vacíos — un `text/html` que solo envuelve una imagen incrustada, y
uno con `multipart/mixed` y un PDF. El `attachmentId` de esos mensajes **es la
imagen, no el cuerpo**, y el parseo hizo bien en ignorarla. Comprobado en seco:
solo imagen → `""`, con texto → `"Hola
que tal"`.

> **Gmail devuelve el snippet vacío por el mismo motivo por el que nosotros no
> sacamos cuerpo: no hay nada que previsualizar. No eran dos cosas, era una.**

**Lo que queda vivo de todo esto**, que no es poco: el marcador que ya no avanza
sobre lo que falló, los reintentos que antes no existían, el tope de paginación,
`skipReason` como estado terminal y contable, el barrido de reconciliación —que
rescató 23 correos reales con una tarea dentro— y su aviso por novedad. **Las
alarmas eran falsas; los arreglos, no.**

**Y el `attachmentId` sigue abierto a propósito**: es un hueco real que no ha
mordido nunca. La diferencia con ayer es que **la sonda solo se enciende en el caso
que import** — una parte **de texto** con `attachmentId`—, así que sabremos qué
aspecto tiene el día que muerda.

**Tres cosas de método que salieron de aquí y valen para el resto del proyecto:**

1. **Un número que no se puede distinguir de su propio fallo no mide nada.** El
   `solo-snippet = 0` solo valió cuando trajo `con-snippet = 242` al lado y la
   aritmética cerró.
2. **Se puede diagnosticar sin leer el contenido de nadie.** Solo formas —
   `mimeType`, `data`/`attachmentId`, tamaño— y contestó la pregunta entera.
3. **El código con fecha de caducidad se retira el día que caduca.** La ruta de
   diagnóstico llevaba escrito que sobraba en cuanto se supiera la respuesta, y se
   fue con ella. Lo contrario es un endpoint sin dueño que nadie se atreve a borrar.

### Estado del reparto — cierre del 2026-08-21

| Capa | Estado | En qué |
|---|---|---|
| **@Claude** | `TRABAJAR` | **§37.8, el contrato del socket** y su mitad. Último hallazgo vivo de la auditoría |
| **@Gravity** | `EN PAUSA` | Sin encargo. La mitad cliente del socket es suya y espera al contrato |
| **@Alana** | `TRABAJAR` | Los 27 huérfanos: el texto de los `warn` en Cloud Logging, si es pico o goteo, y si sigue tras `337340e` |

**El hallazgo que desbloquea el §37.8, y no estaba en ningún informe.**
`tasks.gateway.ts` rechaza dentro de `handleConnection` llamando a
`client.disconnect()`. Eso significa que **la conexión se establece y después se
cae**: desde el cliente no es un rechazo, es un `connect` seguido de un
`disconnect`, o sea **una caída de red normal**. Y ante una caída normal,
reconectar indefinidamente es exactamente lo correcto.

O sea que **el reintento infinito del frontend no es un defecto del frontend**, y
la ausencia de manejador de `connect_error` **no es un olvido de @Gravity**: ese
evento **no se dispara nunca**. El arreglo empieza por rechazar en middleware, y
por eso el contrato va antes que las dos mitades.

Decisión de Doc que va con él: el socket **se revalida periódicamente**. Hoy se
autentica una sola vez con un token de 15 minutos y luego vive indefinidamente —
un socket abierto toda la noche sigue oyendo con una sesión caducada, y si el
usuario cierra sesión **sigue oyendo igual**.

**Cerrado hoy también: los finales de línea de `apps/web`.** Y el diagnóstico de
@Gravity fue mejor que el encargo: además de que `.gitattributes` solo cubría
`*.sh`, **`CopilotDrawer.tsx` estaba clasificado como binario en el índice** por
los `
` sueltos — y a un binario `--renormalize` no lo toca. Aunque el archivo de
atributos hubiera estado completo, ese fichero habría seguido igual. Verificado por
Doc: los 40 de `apps/web/src` en `i/lf w/lf`, y sin `.bat`/`.cmd`/`.ps1` que el
`eol=lf` pudiera romper.

### Rutina de Doc — revisar los tres buzones (2026-08-21)

El buzón lleva escrita desde el 20-08 su propia limitación: *«no hay nadie sondeando
este archivo: escribir aquí deja constancia, pero no despierta a Doc»*. **Hoy se
cumplió dos veces en la misma tarde.** @Claude dejó un bloqueo sobre el
`trust proxy` que estuvo **un día** sin respuesta, y @Alana dejó el resultado de los
27 con un «corre ahora mismo» encima. **Las dos las vi porque el Jefe me las
señaló, no porque yo mirara.**

Escribir la limitación no la arregla. **Desde hoy, revisar los tres buzones es
parte de la rutina de Doc**, junto con `git log` y `git status`:

```
PROMPT_CLAUDE.md   → buzón
PROMPT_GRAVITY.md  → buzón
PROMPT_ALANA.md    → buzón
```

Y de paso: **retirar lo contestado.** Había una entrada de los tres roles de IAM
que seguía viva días después de resolverse. Un buzón con entradas muertas dentro
deja de leerse, que es la segunda forma de que un canal falle.

## 🚨 5. Reglas de coordinación que ya costaron un disgusto

* **Añadir por ruta, nunca `git add -A` o `git add .`:** Dos o más agentes escriben sobre el mismo árbol. Un *add* masivo rompe las bitácoras y sube código no probado.
* **Preguntar "¿por qué?" en lugar de "¿está?":** Lección aprendida de los falsos positivos (ej. el fallo de encoding del `.gitignore`).
* **El campo `Estado` de un encargo lo decide solo Doc:** Ha fallado dos veces: trabajo entrando con el documento en pausa, y encargos pidiendo cosas ya entregadas. **Desde el 2026-08-20, con Doc escribiendo solo en este archivo, el valor lo dicta Doc y lo transcribe el dueño de la bitácora.** El ejecutor no lo elige; lo copia.
* **Un estado verificado caduca en cuanto alguien actúa sobre él:** lección de @Alana el 2026-08-20, que publicó una propuesta de tres capas y descubrió que la Capa 2 se había entregado mientras la escribía. Antes de publicar cualquier cosa que describa el estado del sistema, `git log` otra vez.
* **Verificar en el código antes de dar una casilla por cerrada:** Nunca confiar ciegamente en el reporte sin evidencia (logs, HTTP 200 o el monitor en vivo).

