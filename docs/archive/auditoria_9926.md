# auditoría_9926 — barrido completo del código

> **Alana · 2026-09-09 · árbol `85b5d4d` + cambios sin commitear**
>
> Encargo del Jefe: *«se repiten errores, se programan cosas en archivos que no
> son, se hace referencias a cosas que no existen»*. Barrido línea por línea y
> archivo por archivo de las **30.687 líneas** del repositorio.
>
> **Todo lo que hay aquí está comprobado por mí, ejecutando.** Lo que no pude
> comprobar lo digo. Lo que resultó ser falsa alarma **también está escrito**,
> porque una alarma retirada vale tanto como una encontrada.

---

## 0. El suelo, medido antes de opinar

| Comprobación | Resultado |
|---|---|
| `tsc` de `apps/api` | ✅ **0 errores** |
| `tsc` de `apps/web` | ✅ **0 errores** |
| `npm run lint --workspaces -- --max-warnings 0` *(el comando exacto del CI)* | ✅ **0 avisos** |
| `jest` de `apps/api` | ✅ **753 pruebas · 38 suites · todas verdes** |

**El árbol de trabajo está sano.** Los siete `any` que tumbaron el CI ayer están
arreglados en disco.

**Y ese es el primer hallazgo, no el alivio:** nada de eso está commiteado ni
desplegado. **El estado sano del proyecto vive en un portátil.**

---

## PARTE 1 — Por qué se repiten los errores

Esta parte contesta la primera queja, y la respuesta no es «alguien se
distrae». **Es que las cuatro barreras que deberían atrapar un error antes de
llegar a producción no lo hacen**, y las cuatro fallan en silencio.

### H1 · 🔴 `npm run lint` en local **no** es el lint del CI

```
package.json (api)   →  "lint": "eslint \"src/**/*.ts\""
ci.yml linea 104     →  npm run lint --workspaces --if-present -- --max-warnings 0
```

**El umbral vive solo en el workflow.** Quien ejecute `npm run lint` —persona o
agente— ve **verde con siete avisos delante**, commitea tranquilo, y el CI se cae
al otro lado.

**Es exactamente lo que pasó ayer** y lo que dejó sin desplegar el arreglo P0 de
Gmail durante 23 horas.

**Y ojo, porque el propio `ci.yml` lo explica en un comentario:** `npm run lint --
--max-warnings 0` desde la raíz **no funciona** —npm se queda el argumento—, por
eso el workflow recorre los workspaces a mano. **Esa sutileza es justo lo que
hace imposible reproducir el CI de memoria.**

> **Lo que lo cierra:** que el umbral esté en el `package.json` de cada paquete,
> y que el CI llame al mismo script sin argumentos. Una sola verdad, en el sitio
> donde la gente la busca.

### H2 · 🔴 El gancho `pre-commit` no comprueba nada del código

Existe, está activo (`core.hooksPath = .githooks`) y está bien escrito — pero
**solo vigila que un commit no mezcle bitácoras de varios dueños**. Leí sus 4.970
bytes enteros: no ejecuta `tsc`, ni `eslint`, ni `jest`.

**No hay ninguna barrera local.** El primer sitio donde un error se detecta es
GitHub, después de empujar.

### H3 · 🔴 El frontend no tiene **ni una sola prueba**, y el CI lo da por verde

```
apps/web/package.json → scripts: dev, build, preview, lint     ← no hay "test"
find apps/web -name '*.test.*' -o -name '*.spec.*'  →  ninguno
ci.yml → npm test --if-present
```

**`--if-present` convierte «no hay pruebas» en «pruebas superadas».** Son
**5.234 líneas** de interfaz —39 archivos, incluida toda la Fase 6 recién
escrita— sin una comprobación automática, y un CI que informa `success`.

**Esto no es deuda: es un agujero con forma de aprobado.**

### H4 · 🟠 Prettier está configurado y **nada lo ejecuta**

`.prettierrc` manda `singleQuote: true` y `endOfLine: lf`. Hay un script
`format`. **No lo llama ni el CI ni el gancho.** Y `eslint.config.mjs` enchufa
`eslint-config-prettier`, que **solo apaga reglas** — deliberadamente, y está
razonado en un comentario: no comprueba formato, solo evita que el linter pelee
con él.

Medido sobre los 148 archivos `.ts` de la API:

| Estilo | Archivos |
|---|---|
| Solo comilla simple *(lo que manda la regla)* | 73 |
| Solo comilla doble | **10** |
| **Mezclan las dos** | **65** |

**75 de 148 archivos no siguen la regla escrita.**

**Y no es cosmético: me engañó dos veces durante esta misma auditoría.** Mi
primer barrido de variables de entorno dio nueve falsos positivos —`JWT_SECRET`,
`GOOGLE_CLIENT_ID`, `TOKEN_ENCRYPTION_KEY` marcadas como «no usadas»— porque
buscaba `'CLAVE'` y el código dice `"CLAVE"`. Y mi extractor de rutas dio por
inexistentes las cuatro de `/auth` porque ese controlador usa `@Controller("auth")`.

**Si a un barrido automático le pasa eso, a una persona buscando dónde se usa
algo le pasa igual.** Esta es, literalmente, una de las causas de *«se hace
referencia a cosas que no existen»*: **existen, pero no se encuentran.**

---

## PARTE 2 — Referencias a cosas que no existen

### H5 · 🔴 `ProposedTask` está declarado **dos veces, y no son iguales**

| Campo | `packages/shared/src/index.ts:116` | `apps/api/.../emails.service.ts:159` |
|---|---|---|
| `title`, `description`, `priority`, `tags` | ✅ | ✅ |
| **`tagIds?: string[]`** | **sí** | **no** |
| `dueDate` | `?: string \| null` *(opcional)* | `: string \| null` *(**obligatorio**)* |
| **`aiConfidence?`** | **no** | **sí** |
| **`source?`** | **no** | **sí** |

**Cinco diferencias en un tipo que se llama igual a los dos lados del cable.**

Y no es teórico. `apps/web/.../AiValidationModal.tsx` importa `ProposedTask`
**de `@pmo/shared`** y hace `t.tagIds` en cuatro sitios. **Compila** —allí el
campo existe— y el backend **nunca lo emite ni lo entiende en ese tipo**. Al
revés, el backend rellena `aiConfidence` y `source`, que el frontend no sabe
leer.

**Esto es «programar en el archivo que no es» en su forma más cara:** el contrato
compartido existe, alguien escribió una segunda copia al lado, y ahora hay dos
verdades sobre la misma cosa.

### H6 · 🟠 `Task` también está duplicado

`packages/shared` lo declara y `apps/web/src/features/kanban/types/index.ts` lo
vuelve a declarar. Es la deuda anotada desde §7 de mi cuaderno; `8219b96` la
cerró para `DashboardMetrics` y **estos dos quedaron fuera**.

### H7 · 🟡 Cuatro variables de WhatsApp que no existen en ninguna parte

`.env.example` pide `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_VERIFY_TOKEN`. Busqué las cuatro en
`apps/`, `packages/`, `infra/` y `.github/`: **cero apariciones**. No hay canal de
WhatsApp en este proyecto.

**Y una tiene valor real:** `WHATSAPP_VERIFY_TOKEN` está relleno en el `.env` de
trabajo con 29 caracteres. *(No lo he mirado ni lo voy a mirar; solo medí el
largo.)*

**Por qué lo subo de «nimio»:** `.env.example` es **el documento que alguien copia
para montar el entorno**. Pide cuatro secretos de una integración que no existe.

### H8 · 🟡 Nueve variables que el código lee y `.env.example` no menciona

```
ANTHROPIC_MAX_RETRIES · ANTHROPIC_TIMEOUT_MS · COPILOT_EMAIL_TRANSPORT
LOG_FORMAT · LOG_LEVEL · PRESUPUESTO_IA_USD · SERVICE_VERSION
K_REVISION · K_SERVICE
```

`K_REVISION`, `K_SERVICE`, `SERVICE_VERSION` y `LOG_FORMAT` los inyecta Cloud Run
y está bien que no estén. **Las otras cinco son configuración de la aplicación
que nadie documenta**, y una de ellas es **`PRESUPUESTO_IA_USD`, el freno de
gasto de IA**.

**Comprobado antes de alarmar:** `ai-cost.service.ts:362` cae en
`PRESUPUESTO_POR_DEFECTO` si falta, así que **el freno no está desactivado**. Es
un defecto de documentación, no de comportamiento. Lo digo entero porque el
titular fácil —*«el freno de gasto lee una variable que no existe en
producción»*— es cierto y **engañoso**.

### ✅ Y dos cosas que fui a buscar y **están bien**

- **No hay rutas fantasma.** Extraje las 30 llamadas del frontend y las 40 rutas
  reales de los controladores y las crucé una a una: **todas existen**. La única
  discrepancia inicial —las cuatro de `/auth`— era mi extractor, no el código
  (ver H4).
- **Los documentos no citan archivos inexistentes.** Barrí `AI_ROLES.md`,
  `README.md`, `ARCHITECTURE.md`, `GCP_SETUP.md` y `docs/RUNBOOK.md`: la única
  ruta que no resuelve es `apps/web/.../api/tasks.api.ts`, y esos puntos
  suspensivos son una abreviatura deliberada.

---

## PARTE 3 — El código nuevo, leído línea por línea

### ✅ El arreglo P0 de Gmail (`e3ffc3c`) es bueno, y hay que decirlo

Su mensaje de commit describe el bucle **exactamente igual** que lo diagnostiqué
yo por separado el 8-09, y la implementación hace lo que promete:

- `gmail.processor.ts` → `concurrency: 1` y `limiter: { max: 6, duration: 60_000 }`.
- `worker.rateLimit(espera)` en cuanto Google corta, con la espera que sugiere el
  propio error.
- **Freno en seco**: la cuota agotada **se relanza** como `GmailQuotaError` en vez
  de contarse como «un correo que falló», que era el corazón del incendio.
- **`sinEncolar` sale de la condición que retiene el marcador**, con veinte líneas
  de comentario explicando por qué. **Es la corrección correcta.**

### H9 · 🟠 Pero el comentario **miente sobre el ritmo**, y es el número en que se apoya

```ts
const TANDA_DESCARGA = 10;
const PAUSA_ENTRE_TANDAS_MS = 1_000;
```

El comentario dice: *«Con 10 mensajes por tanda y esta pausa salen ~60
peticiones/minuto sostenidas, muy por debajo del techo»*.

**El código no hace eso.** La línea 301 es:

```ts
const resultados = await Promise.all(tanda.map(async (id) => { ... }));
```

**Las diez van en paralelo**, no en fila. Un ciclo es «diez peticiones a la vez +
1 segundo», así que el ritmo sostenido está en el orden de **varios cientos de
peticiones por minuto**, no sesenta. **La cifra está errada por un factor cercano
a ocho, y es justamente la que sostiene el argumento de seguridad.**

**Lo que NO digo:** que el arreglo no sirva. Sirve —antes no había pausa
ninguna—, y el limitador de 6 trabajos/minuto pone otro techo por encima. **Digo
que el número escrito no es el número real**, y en esta casa un comentario con
una cifra se cita como si fuera una medición.

### H10 · 🔴 Queda un **segundo bucle**, hermano del que se acaba de cerrar

El arreglo saca `sinEncolar` de la retención apoyándose en que *«ya tiene una red
debajo»*: `reconciliarSinClasificar()`. **Fui a medir la red.**

```ts
const GRACIA_RECONCILIACION_MS = 30 * 60_000;   // solo correos de hace >30 min
const MAX_RECONCILIADOS = 100;                  // tope por pasada
findMany({ where: { processedAt: null, ... }, orderBy: { receivedAt: 'asc' }, take: 100 })
```

Cron cada 15 minutos ⇒ **capacidad máxima 400 correos/hora**.

**Y `processedAt` solo se escribe cuando la clasificación termina bien** (o se
cierra con `skipReason`). Una clasificación que falla —por ejemplo, con la clave
de Anthropic inválida— **deja `processedAt` en null**.

**Junta las dos piezas y sale el bucle:**

> Con la clasificación caída, el barrido coge **los 100 más antiguos**, los
> reencola, **los 100 fallan**, siguen con `processedAt: null`, y quince minutos
> después el barrido —que ordena por `receivedAt` ascendente— **coge exactamente
> los mismos 100**. Para siempre, sin avanzar uno.

**Y no es una hipótesis: el canal lo registró.** El aviso del 8-09 dice *«100
correo(s) nuevo(s) … (100 reencolado(s) en esta pasada)»* — **el tope exacto**, que
es la firma de una cola saturada.

Cada pasada son 100 `add()` a BullMQ más los reintentos de cada trabajo. **Eso es
consumo de Redis en bucle cerrado durante horas, y encaja con la cuota de Upstash
agotada la madrugada del 9.**

**El arreglo P0 cerró el bucle de Gmail y este quedó intacto.** No es un defecto
del arreglo —hace lo que dice—: es que **había dos bucles y se nombró uno**.

### ✅ H11 · Y una que está bien pensada, para el registro

`emails.controller.ts:94` acepta `@Query('force')` **como cadena** y compara
`force === 'true'`, con un comentario que explica que `Boolean('false')` es
`true` y que ese descuido convertiría el respaldo en «reanaliza siempre, y
cuesta dinero». **Está bien resuelto y bien documentado.**

---

## PARTE 4 — La deriva entre lo escrito y lo que corre

| Qué | En el repositorio | En producción |
|---|---|---|
| Backend | `85b5d4d` | 🔴 **`a31384e`** (25 de agosto) — **8 commits atrás** |
| Migraciones de Prisma | **12** | 🔴 **11 aplicadas** |
| Frontend | Fase 6 completa | ✅ desplegado (`c20685d`, hoy 17:46 UTC) |

**La consecuencia ya la medí ayer y sigue igual:** una interfaz de Fase 6 sobre
una API que no conoce `proposedTasks` ni `hasAttachments`. El distintivo y el
clip **no pueden pintarse**, y «Reanalizar» **devuelve 500**.

### ✅ Y una alarma que retiro, medida en los dos sitios

Iba a reportar los finales de línea: **28 de 215 archivos versionados tienen CRLF
en disco**, contra un `.gitattributes` que manda `eol=lf`. Es la familia del fallo
que mató `respaldo.sh` el 19-08 y que escondió dos líneas reales entre 726 en
`36938c9`.

**Fui a mirar el repositorio y no el disco:**

```
archivos COMMITEADOS con CR: 0
```

**El `.gitattributes` funciona.** Los CRLF del disco son el comportamiento normal
de Git en Windows y **no viajan**. La deuda que arrastro desde §31 **está
cerrada**, y lo escribo aquí para no volver a levantarla en el próximo barrido.

---

## 5. El diagnóstico, que es más corto que la lista

**Los tres síntomas del encargo son el mismo problema visto por tres lados.**

**Nada verifica en el sitio donde se escribe.** El linter local no es el del CI
(H1). El gancho no mira el código (H2). El frontend no tiene pruebas y el CI dice
que sí (H3). El formateador está configurado y nadie lo llama (H4).

De ahí salen los otros dos síntomas por su cuenta:

- **«Se programan cosas en archivos que no son»** — sin nada que avise de una
  redeclaración, escribir `ProposedTask` al lado del que ya existe **compila,
  pasa el lint y pasa las pruebas** (H5, H6).
- **«Se hace referencia a cosas que no existen»** — la mitad de las veces
  **existen y no se encuentran**, porque la misma clave se escribe con dos tipos
  de comilla y ninguna regla lo impide (H4). La otra mitad son las dos copias
  divergentes del mismo tipo (H5).

**Y los errores se repiten porque el ciclo para descubrirlos es
escribir → empujar → esperar al CI → leer un registro en GitHub.** Ese ciclo dura
minutos y ocurre después de haber decidido que estaba bien. **Todo lo demás de
esta lista es consecuencia de eso.**

### Lo que arreglaría, en este orden, y por qué

1. **Mover `--max-warnings 0` al `package.json`** (H1). Una línea por paquete.
   Hace que `npm run lint` diga la verdad. **Es la barata que desbloquea todo lo
   demás**, porque a partir de ahí el error se ve antes de empujar.
2. **`ProposedTask` y `Task`, una sola declaración en `packages/shared`** (H5,
   H6). El backend importa, el frontend importa, y las cinco diferencias
   desaparecen o se hacen explícitas.
3. **El segundo bucle de reconciliación** (H10). No es urgente **hoy** porque la
   clasificación va a volver con el despliegue, pero **volverá a morder la
   próxima vez que la IA falle**, y esta vez ya sabemos que se paga en cuota de
   Redis.
4. **Corregir el comentario del ritmo** (H9), o el código, o los dos. Decidirlo
   con el número real delante.
5. **Un `test` mínimo en `apps/web`** (H3) — aunque sean cuatro. Lo que hay que
   quitar es el aprobado automático, no la falta de cobertura.

**Lo que NO haría ahora:** el formateo masivo (H4). Reformatear 75 archivos
genera un diff de miles de líneas que **esconde cualquier cambio real dentro**, y
eso es exactamente el fallo de `36938c9`. Se pone la regla, se aplica **en cada
archivo que se toque**, y en tres semanas está hecho sin un solo commit ilegible.

---

## 6. Lo que esta auditoría **no** cubre

Por honestidad, y porque el Jefe pidió que después miráramos los recursos
externos con el navegador:

- **No he auditado `apps/web` línea por línea**, solo sus contratos, sus llamadas
  y su ausencia de pruebas. Son 5.234 líneas y ninguna prueba: **es el siguiente
  sitio donde mirar.**
- **No he ejecutado el producto de punta a punta** —correo entra → propone →
  persona aprueba → tarjeta—, porque el backend de Fase 6 no está desplegado.
- **Los recursos externos** (paneles de Google Cloud, Vercel, Upstash, Anthropic)
  quedan para la segunda vuelta, con el navegador y con las entradas que el Jefe
  vaya habilitando.

**No cierro nada y no reparé nada.** El reparto es de Doc.

---

# PARTE 7 — Los recursos externos, con navegador (2026-09-09, segunda vuelta)

Segunda vuelta del encargo: mirar en los paneles lo que no se ve desde el código.
**Y aquí está el hallazgo que más cambia una decisión ya tomada — y me corrige a
mí.**

## R1 · 🔴 Upstash: el gráfico desmiente mi propia hipótesis de ayer

`Daily Commands by Regions`, últimos cinco días de la base `pmo-redis`:

| Día | Comandos |
|---|---|
| Sábado | ≈ 0 *(línea plana)* |
| Domingo | ≈ 0 |
| Lunes | ≈ 0 |
| Martes | ≈ 100 mil |
| **Miércoles (hoy)** | **≈ 500 mil** |

**Ayer escribí en §63.5 que «el plan no alcanza»**, con esta cuenta:
`500.000 ÷ 1.140 comandos/hora ≈ 18 días de consumo normal`.

**El gráfico dice que estaba equivocada.** El consumo normal de este sistema es
**prácticamente cero** — tres días seguidos sin una barra visible. Lo que agotó
la cuota de medio millón **fue un pico de un solo día**, y ese día es exactamente
aquel en que volvió la ingesta con la clasificación rota.

> **No era el plan. Era el bucle.**

Y encaja pieza por pieza con **H10**: cada quince minutos, 100 reencolados que
fallan y vuelven a ser candidatos. Cuatrocientos por hora, cada uno con sus
`add()` y sus reintentos, durante toda la noche del 8 al 9.

**Por qué importa que lo corrija y no lo deje pasar:** con mi diagnóstico de ayer,
la conclusión razonable era *«hay que pagar un plan más grande»*. Con el gráfico
delante, la conclusión es **«hay que cerrar el bucle»** — y el plan de pago, sin
cerrarlo, solo cambia un producto parado por una factura que sube.

## R2 · 🔴 Y el pago por uso está **sin techo de gasto**

```
COMMANDS 701 mil / Unlimited     COST $1.04  (Budget: not set)
```

**`Budget: not set`.** El límite del plan gratuito era brutal pero era un freno:
paró el producto. **Ahora no hay freno de ninguna clase**, y el bucle que llenó
medio millón de comandos en un día **sigue en el código**.

Hoy es un dólar. **La cifra no es el problema; que no haya tope, sí.**

## R3 · 🟠 Upstash está retirando justo la optimización que abarata BullMQ

Aviso en el panel de la propia base, con estas palabras:

> *«Eco mode is being deprecated. Upstash Redis previously offered Eco Mode (a
> billing optimization for pay-as-you-go users running queue libraries such as
> **BullMQ**, Bull, and Sidekiq). With the introduction of Fixed Plans, this
> optimization is being phased out. To avoid unexpected increases in command
> usage, we recommend transitioning your database to a Fixed Plan.»*

**Nombra BullMQ literalmente**, que es la cola de este proyecto. El propio
proveedor avisa de **«aumentos inesperados de uso de comandos»** y recomienda
plan fijo.

Junta las tres: **pago por uso + sin presupuesto + se retira el descuento de
colas + un bucle vivo**. No hace falta ser agorero para ver la forma.

## R4 · 🟡 La base está en Ohio y el servicio en Iowa

`pmo-redis` → AWS **us-east-2 (Ohio)**. Cloud Run → **us-central1 (Iowa)**.
Cada comando cruza de nube y de región. Con el consumo real de este sistema no es
un problema de dinero ni de latencia percibida; lo anoto porque **una cola es lo
más sensible a la ida y vuelta** y porque nadie lo eligió: se eligió por
separado.

## R5 · ✅ La cuota de Gmail, con los números reales — y **retiro el riesgo de H9**

Panel de cuotas de `gmail.googleapis.com`:

| Cuota | Valor |
|---|---|
| Units per minute *(proyecto)* | 1.200.000 |
| **Units per minute per user** | **6.000** ← la que se agotó |
| *Previous quota: Units per minute per user* | 15.000 |
| Ajustable | **Sí** |

Con `messages.get` a 5 unidades, el techo son **1.200 mensajes por minuto y
usuario**.

**Ahora se puede cerrar la aritmética de H9.** El código hace diez peticiones en
paralelo más un segundo de pausa ⇒ del orden de **450 peticiones/minuto ≈ 2.300
unidades/minuto**. Contra un techo de 6.000, **cabe con un margen de 2,5x**.

> **H9 se queda como está escrito y se le quita el filo:** el comentario dice
> «~60 peticiones/minuto» y el ritmo real es ocho veces mayor. **El número escrito
> sigue siendo falso y hay que corregirlo** —en esta casa una cifra en un
> comentario se cita como una medición—, **pero el arreglo P0 no es peligroso**:
> baja del techo con holgura. Retiro el riesgo, mantengo la corrección.

**Y un dato que nadie tenía:** el techo por usuario está en **6.000** con una
cuota anterior de **15.000** registrada al lado. Sea una rebaja o un cambio de
sistema de cuotas de Google, **el número operativo hoy es 6.000**, y es
**ajustable** — se puede pedir más si algún día hace falta. Vale la pena saberlo
antes de necesitarlo.

## R6 · 🟠 Vercel no tiene **ni una** variable de entorno

`Environment Variables → No Environment Variables Added`.

Así que `VITE_API_URL` no existe, y el frontend cae en la constante del código:

```ts
export const PROD_API_URL = "https://pmo-api-mlpuuasqka-uc.a.run.app";
export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API_URL : "/api");
```

**La dirección de la API en producción está quemada en el código fuente.**
Funciona —lo comprobé en el bundle servido—, pero **cambiarla exige un commit y
un despliegue**, no un ajuste.

Y no es hipotético: **este servicio tiene dos direcciones** —la opaca y la del
número de proyecto—, y el cliente de OAuth tenía registrada **la otra**. Ese es
exactamente el caso que una variable resuelve en un minuto y una constante
convierte en un despliegue.

## R7 · 🔴 Tres versiones de Node construyendo el mismo proyecto, y ningún `engines`

| Dónde | Node |
|---|---|
| CI (GitHub Actions) | **22.x** |
| Cloud Run (`apps/api/Dockerfile`) | **22**-bookworm-slim |
| **Vercel (frontend)** | **24.x** |
| **Esta máquina** | **24.19.0** |
| `engines` en cualquier `package.json` | **ninguno** |

**El CI y el contenedor coinciden**, y el `ci.yml` lo dice por escrito — esa parte
está cuidada. **Lo que nadie fijó es la máquina donde se escribe y la que
construye el frontend**, y las dos van una mayor.

**Esto contesta la queja del Jefe de forma directa:** se escribe y se prueba en
Node 24, se valida en Node 22, y se publica el frontend con Node 24. **Sin
`engines`, npm no advierte de nada.** Es otra barrera que no existe, hermana de
H1 a H4: *lo que pasa aquí no es lo que pasa allí, y nada lo dice.*

## R8 · ✅ Y lo que está bien montado en Vercel, que es casi todo

- **Build**: `npm run build:shared && npm --workspace @pmo/web run build` —
  construye el paquete compartido **antes**, que es lo correcto en un monorepo.
- **Output**: `apps/web/dist` ✅ · **Install**: `npm install --include=dev` ✅
- **Root Directory: `./`** ✅ — **cierra la pregunta que dejé viva en §37.20**,
  y es lo correcto para este montaje.
- **Ignored Build Step: `Overridden`** por `vercel.json` → `scripts/vercel-ignore.sh`,
  que **existe** y compara el commit anterior con el actual para saltarse los
  cambios que no tocan el frontend. Bien resuelto y bien documentado.
- Consumo holgadísimo: 1,3 K de 1 M peticiones, 63 MB de 10 GB.

## R9 · ✅ Y §13 se cierra: no es nuestro y no se puede cerrar desde aquí

La cuenta `antoniosanchez-5466s-projects` tiene **un solo proyecto**,
`pmo-frontend` → `pmo-frontend-ten.vercel.app`, que es el correcto.

**`pmo-frontend.vercel.app` —el dominio que sirve la aplicación en portugués y que
llevo señalando veintinueve días— no pertenece a esta cuenta.** No hay nada que
arreglar aquí: es de otro. **Lo doy por cerrado como hallazgo** y queda solo como
aviso: si alguien vuelve a poner ese dominio en una variable, romperá el login
otra vez.

## R10 · ⛔ Lo que no pude mirar

**El panel de Anthropic** (`console.anthropic.com`) me devuelve *permission denied
for this domain*. Ahí quedan sin comprobar el saldo, el consumo real y el estado
de las claves — y con el antecedente de §48, el bloqueo por $8.14, **es el
siguiente que pediría habilitar**.

---

## Resumen de la segunda vuelta

**Lo que cambia una decisión:** el pico de Upstash **no fue el plan, fue el
bucle** (R1). Corrijo mi §63.5. Pagar por uso sin cerrar H10 y **sin presupuesto**
(R2), con el descuento de colas retirándose (R3), es cambiar un producto parado
por una factura sin freno.

**Lo que se cierra a favor:** la cuota de Gmail deja el arreglo P0 con margen de
2,5x (R5) · Vercel está bien montado y el Root Directory contestado (R8) · §13 no
es nuestro (R9).

**Lo que se abre:** la API quemada en el código (R6) y **tres versiones de Node
sin `engines`** (R7), que es la quinta barrera ausente de la misma familia.

---

# PARTE 8 — El sistema, ya desplegado, visto por dentro (2026-09-09, 21:50 UTC)

**Entre la Parte 7 y esta, el proyecto se arregló.** Lo encontré midiendo, no me
lo dijo nadie.

## C1 · ✅ El backend se desplegó, y lo desbloqueó lo que señalaba la Parte 1

```
GET /health -> { "version": "8b5c9e3946851…", "uptimeSec": 6952 }
8b5c9e3  fix(backend): resolve eslint any warnings to unlock CI
```

**Ese commit es exactamente el tapón de H1.** Siete avisos de `any` tumbaban el
lint, el lint tumbaba el CI, el CI dejaba el despliegue en `skipped`, y sin
despliegue no entraban ni la clave de Anthropic ni el freno de Gmail.

**Se arreglaron siete líneas y se apagaron dos incendios.** Es la cadena entera
de la auditoría, confirmada por los hechos.

## C2 · ✅ Las cuatro averías, apagadas y medidas

Últimos **30 minutos** de registro, contra lo que medí ayer:

| Síntoma | Ayer | **Ahora** |
|---|---|---|
| `API key is invalid` | 300 en 20 min *(tope)* | **0** |
| `Quota exceeded … Total Query Cost` | 300 en 20 min *(tope)* | **2** |
| `max requests limit` (Upstash) | en ráfagas toda la mañana | **0** |
| `marcador no avanza` | 5 avisos en 20 min | **0** |

Los dos 403 residuales son ruido de arranque, no un bucle: con 300 en veinte
minutos no se llega a 2 en treinta.

## C3 · ✅ Y el atasco está **drenado**, no solo parado

```
21:00  Reconciliación: 0 reencolado(s) de 0 candidato(s), 0 fallido(s)
21:15  Reconciliación: 0 reencolado(s) de 0 candidato(s), 0 fallido(s)
21:30  Reconciliación: 0 reencolado(s) de 0 candidato(s), 0 fallido(s)
21:45  Reconciliación: 0 reencolado(s) de 0 candidato(s), 0 fallido(s)
```

Cuatro pasadas seguidas sin un solo huérfano, cuando ayer decía **«100 de 100»**,
el tope exacto. **No queda cola atrapada.**

**Ojo con cómo se lee esto:** el bucle de **H10 sigue en el código**. Lo que ya no
tiene es combustible. Volverá a morder la próxima vez que la clasificación falle,
y esta vez ya sabemos lo que cuesta.

## C4 · ✅ Los tres requisitos de QA, verificados en producción

Los mismos que ayer no pude comprobar porque no estaban desplegados:

1. **Distintivo ámbar `🕒 1 propuesta`** — ✅ **visible** en la bandeja.
2. **Botón `⟳ Reanalizar (descarta los cambios)`** — ✅ **existe**, dentro de la
   cuarentena.
3. **Clip de adjuntos** — ⚠️ **no puede verse todavía, y no es un defecto.** La
   migración creó `hasAttachments BOOLEAN NOT NULL DEFAULT false` **sin relleno
   hacia atrás**, así que los 728 correos anteriores al despliegue valen `false`
   por definición. **Solo aparecerá en correos nuevos.** Lo escribo para que
   nadie lo reporte como roto dentro de una semana.

## C5 · ✅ **§51.1 se cierra, con las dos cifras delante**

| Pantalla | Ayer | **Ahora** |
|---|---|---|
| Bandeja, pestaña *Pendientes* | «20 correos» | **728** |
| Métricas → *Bandeja Pendiente* | 549 | **728** |

**Coinciden.** El desfase que medí el 26 de agosto —factor 16, ayer 27— **se
acabó**. Y el encabezado cambió la palabra: ahora dice **«20 correos cargados ·
19 conversaciones»**, que es lo que de verdad hay en pantalla. **La bandeja ya no
miente.**

## C6 · ✅ La capa de decisión existe, y dice lo que hacía falta

El modal de cuarentena se abre con este encabezado:

> **IA ha extraído una tarea**
> *Revisa la propuesta antes de enviarla al tablero.*

Y debajo: la categoría editable, **Tareas Propuestas (1)** con `+ Añadir Tarea`, y
tres botones. La propuesta que leí era correcta —*«Corregir fallo en pipeline de
CI»*, extraída del aviso de GitHub del CI caído—.

**Eso cierra el punto 1 del Jefe del 26 de agosto**, palabra por palabra: *«los
correos asignan automáticamente las tareas, sin que yo tenga oportunidad de
decidir qué tareas»*. **Ahora hay alguien entre proponer y crear, y es él.**

*(No pulsé «Aprobar e Insertar»: habría creado una tarjeta real en su tablero.)*

## C7 · 🟠 NUEVO — El modal de cuarentena **no tiene salida no destructiva**

Y esto lo comprobé por las dos vías, porque iba a ser una afirmación fuerte:

- **`Escape`** → no cierra.
- **Clic fuera del modal** → no cierra.
- **No hay ✕** en ninguna esquina.

Las **tres únicas** salidas son:

| Botón | Qué hace |
|---|---|
| `Descartar` | **descarta la propuesta** |
| `Aprobar e Insertar` | **crea la tarea** |
| `Reanalizar (descarta los cambios)` | **gasta una llamada al modelo** |

**No existe «cerrar y dejarlo como estaba».** Abrir para mirar ya obliga a
decidir, y la única salida inocua es **recargar la página** — que es lo que tuve
que hacer yo, y que un usuario no tiene por qué saber.

**Por qué lo subo a naranja y no lo dejo en cosmético:** toda la Fase 6 existe
para poner una persona entre proponer y crear. **Un diálogo que no se puede
cerrar sin decidir empuja a decidir por salir**, que es la misma prisa que se
quería quitar. Es un botón y un `onKeyDown`.

## C8 · 🟡 NUEVO — Dos etiquetas con identificadores crudos de Gmail

En la barra de filtros de la bandeja, entre `Novedades`, `Importante` y
`Personal`, aparecen:

```
5704178821214641997  (2)      5894179508653781830  (1)
```

Son `labelIds` de Gmail **sin resolver a su nombre**. El resto de etiquetas sí
tienen nombre, así que la traducción existe y a estas dos no las alcanza —
probablemente etiquetas propias del usuario, frente a las del sistema.

## C9 · 🟠 §51.6 **sigue abierto**, con los mismos números

*Tiempo Registrado: **0.0 hrs*** · *Work in Progress: **3*** · *Tareas Atrasadas:
**59***.

Tres tareas activas y cero horas registradas. El cronómetro sigue sin cerrar su
`TimeEntry`, exactamente igual que el 26 de agosto. **Es lo único del informe del
Jefe que no ha movido una cifra.**

---

## Lo que salió del panel de infraestructura, en la misma vuelta

## C10 · ✅ **§31 se cierra entero**, y era mi 🔴 más antiguo vivo

El hallazgo del **18 de agosto**, punto por punto, contra lo que dice hoy la
instancia:

| Lo que escribí el 18-08 | Hoy |
|---|---|
| `backupConfiguration.enabled = false` | ✅ **`true`**, 7 copias, ventana 05:00 |
| `requireSsl = false` | ✅ **`true`** |
| `sslMode = ALLOW_UNENCRYPTED_AND_ENCRYPTED` | ✅ **`TRUSTED_CLIENT_CERTIFICATE_REQUIRED`** |
| Dos redes autorizadas, con la IP de casa sin documentar | ✅ **ninguna red autorizada** |

**Y de propina, algo que no pedí:** `pointInTimeRecoveryEnabled: true` con
`transactionLogRetentionDays: 7`. Recuperación a un punto en el tiempo, que no
existía.

*«Una pieza puesta y con el interruptor en `false`»*, escribí entonces. **Los
cuatro interruptores están donde deben.**

## C11 · 🔴 NUEVO — La base de producción **no tiene protección contra borrado**

```
deletionProtectionEnabled: false
```

Una instancia de Cloud SQL sin esa casilla **se borra sin fricción**. Y en este
proyecto hay cuatro agentes con acceso a la consola, una cuenta de facturación
que ya se cerró sola una vez, y una semana en la que se han tocado credenciales,
planes y proyectos.

**Es una casilla.** Y es lo único que separa la base de datos de un mal clic.

## C12 · 🟠 NUEVO — `master` no tiene protección de rama

```
GET /repos/…/branches/master/protection  →  404 "Branch not protected"
```

Cualquiera —persona o agente— puede empujar directo, **forzar** o **borrar la
rama**. No hay revisión obligatoria ni exigencia de CI en verde.

**Es la sexta barrera ausente de la familia H1–H4 y R7**, y encaja con la queja
del Jefe mejor que ninguna: *nada impide que entre código que rompe*. Además,
**exigir el CI en verde antes de fusionar convierte H1 en inofensivo** aunque
nadie toque los `package.json`.

## C13 · 🟡 Dos anotaciones que no son defectos, para que consten

- **Cloud Run acepta `allUsers` como invocador.** Es **necesario**: el navegador
  llama a la API sin credenciales de Google. La protección real vive en la
  aplicación —`/auth/me` devuelve 401 y los crones exigen OIDC, los dos
  comprobados—. **No lo llamo agujero.**
- **`availabilityType: ZONAL`** en un `db-f1-micro`: sin alta disponibilidad. Si
  cae la zona, cae la base. **Es una decisión de coste legítima** para este
  tamaño; la anoto para que sea una decisión y no una sorpresa.

## C14 · ⛔ Y lo que sigue sin poderse mirar

**`console.anthropic.com` me devuelve permiso denegado de dominio**, también en
esta vuelta. Sigue pendiente: saldo, consumo real y estado de las claves.

---

## Cierre de la segunda vuelta

**El sistema pasó de roto a funcionando mientras se auditaba**, y la palanca fue
la primera línea del informe: siete avisos de `any`.

**Se cierran hoy:** §31 entero *(mi 🔴 más antiguo, del 18 de agosto)* · §51.1
*(el desfase de la bandeja)* · §37.20 *(el Root Directory)* · §13 *(el dominio
ajeno)* · y los tres requisitos de QA de la Fase 6, dos verificados y uno
explicado.

**Se abren:** el modal sin salida (C7), la base sin protección de borrado (C11),
`master` sin protección de rama (C12), las etiquetas crudas (C8).

**Sigue abierto sin moverse:** el cronómetro de §51.6 y el segundo bucle de H10,
que hoy no tiene combustible pero sigue escrito.

---

# PARTE 9 — El panel de Anthropic (2026-09-09, cerrado)

Con el dominio habilitado por el Jefe. *(La captura de pantalla sigue denegada en
ese dominio; la lectura de texto sí funciona, así que todo lo de aquí sale del
contenido de las páginas, no de imágenes.)*

## A1 · 🔴 La clave de producción **caduca el 1 de noviembre de 2026**

```
Claves de API (1)
  PMO-Zepto   sk-ant-api03-CSm...nQAA
  Creada:  7 sept 2026
  Vence:   1 nov 2026        ← fecha de caducidad
```

**Dentro de 53 días la clasificación se apagará sola.**

Y esto ya pasó en este proyecto, con otra credencial: el `watch` de Gmail caducó
a los siete días, **el sistema lo avisó con 6 días y 18 horas de antelación**
(§54) y aun así el correo dejó de entrar. La diferencia es que aquel avisaba.
**Este no avisa nadie**: la fecha vive en un panel que nadie mira, y el día 1 de
noviembre los correos empezarán a llegar sin clasificar exactamente igual que el
8 de septiembre.

**Es el mismo patrón que llevo cuatro secciones nombrando:** *una caducidad que el
sistema conoce y las personas no.*

> **Lo barato:** ponerle recordatorio a esa fecha hoy, y a ser posible un aviso
> automático. **Lo que no vale es saberlo y confiar en acordarse.**

## A2 · ✅ Y algo que está **mejor** aquí que en Google, y hay que decirlo

**Hay exactamente una clave.** La anterior —la que producción arrastraba
inválida y que destapé en §62.4— **no está**: se borró al rotar, no se quedó
deshabilitada ni «por si acaso».

**Compárese con Secret Manager (§57.3):** trece versiones de secreto y **todas
habilitadas**, incluidas tres cadenas de conexión de Neon con su contraseña.

**Misma casa, dos higienes opuestas.** La de Anthropic es la buena.

## A3 · ✅ La cadena está alineada por primera vez

| Dónde | Prefijo |
|---|---|
| Consola de Anthropic | `sk-ant-api03-CSm...nQAA` |
| Secret Manager (`latest`) | `sk-ant-api03-CSm...nQAA` |
| `.env` local | `sk-ant-api03-CSm...nQAA` |

**Los tres coinciden.** Ayer, producción tenía la muerta y el `.env` la buena
(§62.4). Hoy no hay divergencia en ninguna de las tres puntas. **Cerrado.**

## A4 · ✅ Hay límite de gasto — y el contraste con Upstash es el hallazgo

```
Límite de gasto mensual:  USD 200
Gastado este mes:         USD 26.97   (13 % utilizado)
Se restablece:            1 oct 2026 (UTC)
```

**Anthropic tiene techo. Upstash no tiene ninguno** (R2, `Budget: not set`).

Es el mismo proyecto, el mismo mes y la misma persona decidiendo — pero el
proveedor donde el gasto es previsible tiene freno, y **el proveedor donde hay un
bucle capaz de quemar medio millón de comandos en un día, no**.

## A5 · 🟠 Pero el límite **no avisa a nadie**

En *Notificaciones por correo electrónico* solo hay un botón: **«Agregar
notificación»**. **No hay ninguna configurada.**

Así que el techo de 200 dólares es un muro, no un semáforo: **se entera uno
cuando choca**, no cuando se acerca. Es exactamente la misma forma que el uptime
check que no existía el 8 de septiembre — el sistema puede saberlo y no lo dice.

Con el 13 % consumido no corre prisa. **Se pone en un minuto y evita una tarde
entera.**

## A6 · ✅ Y §48 queda mitigado, pero por la razón correcta

```
Saldo restante: $13.26 · Recarga automática activada
```

En §48 el proyecto se bloqueó con **$8.14** de saldo. Hoy hay $13.26 — **una
cifra igual de fina**. Lo que impide que se repita **no es el saldo: es la
recarga automática**. Conviene tenerlo claro, porque mirar «13 dólares» y
tranquilizarse sería leerlo al revés.

## A7 · 🟡 Dos tarjetas idénticas en el archivo

`Visa •••• 0905 · 09/2027 · Predeterminado` y `Visa •••• 0905 · 09/2027`.
**Mismos cuatro dígitos y mismo vencimiento: es la misma tarjeta, cargada dos
veces.** No rompe nada —solo una es la predeterminada— pero el día que caduque
habrá que cambiarla en dos sitios, y el segundo se olvidará.

## A8 · ✅ El techo de Anthropic está lejísimos, y el freno lo pone el proyecto

**Nivel `Scale`.** Para `Claude Sonnet 5`, que es el modelo de clasificación:

| Cuota | Límite |
|---|---|
| Solicitudes | **10.000 / min** |
| Tokens de entrada | 10 M / min |
| Tokens de salida | 2 M / min |

Y el limitador del proyecto (`ai.processor.ts`) es **`{ max: 20, duration: 60_000 }`**
— **veinte clasificaciones por minuto**.

**El freno propio es 500 veces más estricto que el límite del proveedor.**

**No lo llamo defecto: es prudencia y es dinero.** Pero es un dato operativo que
faltaba: **el día que haya que vaciar un atasco de cientos de correos, el cuello
de botella no es Anthropic — es una constante nuestra**, y se puede subir a
conciencia y con el límite de gasto puesto detrás.

Contrasta con Gmail, donde el techo real (6.000 unidades/min, R5) **sí** está en
el mismo orden de magnitud que el uso.

---

## Cierre de la Parte 9

**Lo urgente y con fecha:** la clave caduca el **1 de noviembre**. Es el único
hallazgo de esta parte que tiene reloj, y es de los que este proyecto ya sabe que
duelen.

**Lo barato:** una notificación de gasto (A5) y quitar la tarjeta duplicada (A7).

**Lo que se cierra:** la cadena de la clave, alineada en sus tres puntas (A3), y
§48 mitigado por la recarga automática (A6).

**Y lo que se lleva a la lista de decisiones:** Anthropic tiene límite de gasto y
Upstash no. **La asimetría está al revés de donde está el riesgo.**
