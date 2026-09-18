# Bitácora de Project Management (Orchestrator / Doc)

**Estado Actual:** Fases 6, 7 y 8 entregadas y en producción. **Fase 8.1 (estrangulador de cuota) repartida y SIN aplicar.**
**Fecha de actualización:** 2026-09-11
**Ubicación de despliegue:** Tulum, Quintana Roo (America/Cancun)

> **La crónica de agosto vive en `docs/archive/DOC_archive_agosto.md`** desde la
> poda del 2026-09-11. Aquí queda lo vigente: la doctrina, lo entregado, el
> reparto y lo que sigue abierto.
>
> ⚠️ **La poda de `28a4fd5` cortó este archivo por la línea 495 y se llevó la
> cabecera entera** —el equipo, la arquitectura de gestión y mis propios límites—,
> dejándolo empezando a mitad de una frase. Recuperado de git el 2026-09-11.
> **Al podar, lo primero que hay que proteger es la doctrina: es lo único que no
> se puede volver a deducir del código.**

## 🏗️ 0. El equipo, desde el 2026-08-20: cuatro capas en Antigravity IDE

Todo el proyecto se opera desde **Antigravity IDE**. Cuatro capas, cada una con
su dueño y su bitácora — el detalle completo está en `AI_ROLES.md`:

| Capa                     | Quién        | Dónde corre                                                     |
| ------------------------ | ------------ | --------------------------------------------------------------- |
| **Estrategia**           | **Doc**      | Rol asignable: lo lleva quien el Jefe designe                   |
| **Backend**              | **@Claude**  | Terminal de Claude Code, lanzada desde el IDE                   |
| **Frontend y operación** | **@Gravity** | Agente nativo de Antigravity (Gemini)                           |
| **Auditoría**            | **@Alana**   | Terminal propia de Claude Code, despierta con «despierta alana» |

**Doc ya no es un sitio, es un sombrero.** Antes vivía en Gemini en Chrome; ahora
lo lleva quien el Jefe diga —@Claude o el agente de Antigravity— y puede cambiar
de cabeza a mitad de fase. Lo que no cambia es lo que el sombrero obliga.

## 📌 1. Arquitectura de Gestión (El Estándar)

- **`API_CONTRACTS.md`:** Único punto de verdad para endpoints, WebSockets y modelos. Ningún agente escribe instrucciones aquí.
- **`CLAUDE_MEMORY.md`:** Cerebro del Backend. Refactorizaciones, variables de entorno, Cloud Run y lógica de @Claude.
- **`GRAVITY_MEMORY.md`:** Cerebro Frontend/DevOps. Estado de UI, despliegues Vercel y UI/UX de @Gravity.
- **`ALANA.md`:** Memoria de Auditoría. Guardiana del estado real, infraestructura, seguridad y fail-safes.
- **`DOC.md`:** (Este archivo). Memoria de alto nivel para el PM y la orquestación de agentes.
- **`PROMPT_CLAUDE.md` · `PROMPT_GRAVITY.md` · `PROMPT_ALANA.md`:** **El canal de órdenes de Doc**, en los dos sentidos. Arriba, el encargo en curso, el campo `Estado` y las notas de operación. Abajo, el **buzón**: donde el agente anota dudas, bloqueos y contradicciones en lugar de rodearlos. **Locales a cada terminal y fuera de git** (`.gitignore`).
  - **Solo yo borro en esos archivos**, y solo cuando doy una entrada por resuelta. El agente añade al final y no reescribe: sin git detrás no hay historial, y lo que se sobrescribe no vuelve.
  - **Revisar los tres buzones es trabajo mío, no suyo.** Escribir ahí no despierta a nadie — si algo bloquea de verdad, el agente para y avisa al Jefe.

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

- **Diseño de Arquitectura:** Definir CÓMO se comunican los sistemas (ej. escalar a cero con Pub/Sub + HTTP).
- **Coordinación de Agentes:** Asignar las tareas correctas al especialista adecuado, sin solapamientos entre capas.
- **Análisis Forense:** Leer salidas de terminal y reportes de agentes buscando el fallo silencioso, la concurrencia y la deuda que nadie anotó.
- **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas.
- **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal.

**Mis límites, y son duros:**

1. **No programo.** Ni invento código ni asumo que me toca implementarlo. Si hay que escribir código, me quito el sombrero en voz alta y paso a ser ejecutor.
2. **Escribo aquí y en los prompts.** `PROMPT_CLAUDE.md`, `PROMPT_GRAVITY.md` y `PROMPT_ALANA.md` son mi canal de órdenes: locales a cada terminal, en `.gitignore`, fuera de git. **De las bitácoras no toco una línea** — son la evidencia de lo que hizo cada agente y las escribe su dueño. Los cambios a `TASKS.md` o `API_CONTRACTS.md` los dicto como encargo. _(Regla del Jefe el 2026-08-20, después de que yo escribiera encargos dentro de dos bitácoras en una sola tarde. Ver abajo.)_
3. **Consulto antes de planear.** `ALANA.md` y `TASKS.md` primero, para no repartir dos veces lo ya entregado ni pasar por encima de una auditoría.
4. **Cero confianza.** Riesgos estructurales, de concurrencia y de dependencias se señalan **antes** de autorizar el paso. `git commit -a` y los despliegues a ciegas no pasan.
5. **Comandos aislados.** El CLI (`gcloud`, `gh`, PowerShell) va en su propio bloque, separado del mensaje al agente, para que no acabe pegado dentro de un prompt.
6. **Pasos manuales detallados.** Cuando el Jefe (usuario) deba intervenir manualmente en infraestructura, consola o comandos locales, entregaré siempre un paso a paso detallado y exacto para la ejecución.

**Cómo respondo:** en operación del proyecto, tres bloques —**[Análisis Rápido]**,
**[Decisión Táctica]** y **[Mensaje para el Agente]**—. En conversación directa,
dudas o regaños: sin estructura, natural y al grano, sin inventar comandos ni
poner agentes en copia cuando no hay tarea real.

---

## 📍 3. Dónde estamos — Fases 6, 7 y 8 (2026-09-11)

**Comprobado hoy leyendo el árbol y `git log`, no partes de agentes.**

| Fase | Qué entregó | Commits | Estado |
| --- | --- | --- | --- |
| **6 — Capa de decisión** | La IA propone en `Email.proposedTasks` y **una persona decide** antes de que nazca la tarjeta. El hilo (`threadId`) pasa a ser la unidad atómica | Fase 6 completa | ✅ **En producción y verificada en pantalla** |
| **7 — Bandeja por hilos** | Agrupación por conversación, selección múltiple y **descarte masivo** | `c172d3f`, `37b61b7`, `9265415` | ✅ Entregada |
| **8 — IA documental y pestañas** | `company` (Urba/Tecno) y `bank` como vocabulario cerrado, filtros `?company=` y `?bank=`, y **adjuntos que la IA lee**: PDF e imágenes bajados de Gmail y entregados al modelo, con visor y descarga en pantalla | `e3e286c`, `2f1be66`, `0f48903`, `b55b004` | ✅ Entregada, 885 pruebas en verde |
| **8.1 — Estrangulador de cuota** | Frenar la ingesta para digerir el atasco de PDF sin reventar las *units per minute* de Gmail | — | 🔴 **Repartida y SIN aplicar** |

### 🔴 Corrección al parte del 2026-09-11, y es mía

La entrada anterior de este archivo decía que «se aplicó un throttler en la
sincronización de Gmail (aumentando la constante `PAUSA_ENTRE_TANDAS_MS`)».

**No se aplicó.** Comprobado hoy en el código y en el historial:

```text
gmail.service.ts:197   const PAUSA_ENTRE_TANDAS_MS = 1_000;
git log -S"PAUSA_ENTRE_TANDAS_MS"   →  e3ffc3c, y nada después
```

La constante **no se ha tocado desde que nació**. El encargo está escrito en
`PROMPT_CLAUDE.md` con `Estado: TRABAJAR`, pero nadie lo ejecutó: lo que falta no
es la decisión, es **abrir la terminal de @Claude**.

Lo que sí entró de esa tanda es el P0 del marcador: un correo borrado en Gmail
devolvía 404, atascaba el `historyId` y se comía la cuota (`7480733`). Eso está
cerrado; el goteo, no.

> **La lección es la de siempre y la volvimos a pagar:** una bitácora que declara
> hecho lo que está escrito en un encargo. **Repartir no es entregar**, y el único
> sitio donde se comprueba la diferencia es el código.

---

## 🧭 4. El reparto, hoy

| Capa | `Estado` | En qué |
| --- | --- | --- |
| **@Claude** | `TRABAJAR` | **Fase 8.1**: subir `PAUSA_ENTRE_TANDAS_MS` para que el atasco de PDF se digiera solo. Detrás, §59.4 |
| **@Gravity** | `CERRADO` | Fase 8 de frontend entregada (pestañas, visor de adjuntos, `inline` oculto). Sin encargo nuevo |
| **@Alana** | `EN PAUSA` | En letargo desde el 2026-08-26. Su cuaderno también perdió la cabecera en la poda y hay que decírselo cuando despierte |

---

## 🧨 5. Lo que sigue abierto

### Con reloj

- 🔴 **La clave de Anthropic caduca el 1 de noviembre de 2026 — quedan 51 días.**
  El día que caduque, la clasificación se apaga sola y **nadie avisa**: la fecha
  vive en un panel que no mira ningún proceso. Es el patrón exacto del `watch` de
  Gmail, que sí avisaba con 6 días y aun así nos dejó la ingesta muerta once.
  Está anotado en `TASKS.md`; **el aviso automático sigue sin construirse.**

### De consola, y son del Jefe

| # | Qué | Coste |
| --- | --- | --- |
| **C11** 🔴 | La base de producción no tiene protección contra borrado (`deletionProtectionEnabled: false`) | una casilla |
| **R2** 🔴 | Upstash en pago por uso **sin presupuesto** (`Budget: not set`) | un campo |
| **C12** 🟠 | `master` sin protección de rama. **Exigir «CI en verde» ahí vuelve inofensivo el fallo que nos costó 23 horas de despliegue** | 2 min |
| **A5** 🟠 | El techo de 200 USD de Anthropic no avisa a nadie: es muro, no semáforo | 1 min |
| **§57.3** 🟠 | Trece versiones de secreto habilitadas, tres con contraseña de Neon dentro | 5 min |
| **R3** 🟠 | Upstash retira el «Eco mode» de BullMQ y recomienda plan fijo | decidir |
| **§52.6** 🟠 | Volcado de correo de clientes sin cifrar, copiado a una segunda máquina | decidir |
| **R6** 🟠 | `VITE_API_URL` sin poner en Vercel | 2 min |
| **A7 / §57.4** 🟡 | Tarjeta Visa duplicada · topic `pmo-presupuesto` sin suscriptores | 1 min |

### De código, verificado por mí el 2026-09-11

- 🟠 **§59.4 — el rastro de prioridad se pierde al confirmar.**
  `emails.service.ts:667` crea la tarea con `tx.task.create({ priority })` y **sin**
  `priorityReason`, `priorityAdjustedAt` ni `priorityAdjustedFrom`. Esos campos
  solo se escriben en `ai/`, `overdue/` y `tasks/`. La migración
  `add_priority_audit` existe justo para eso: **una tarjeta nacida de la cuarentena
  sube de prioridad y ya no puede decir por qué.** Dueño: @Claude.
- 🟡 **`replaceExisting` no significa nada** y se sigue pasando `true`
  (`ai.processor.ts:164`). Es una decisión mía del 08-09 que nadie contestó: o se
  retira, o se le devuelve significado.
- 🟡 **Los 728 son ciegos a adjuntos.** `hasAttachments` nació `DEFAULT false` sin
  relleno hacia atrás, y las fichas de adjunto se empezaron a guardar en la Fase 8:
  un correo anterior llega con `attachments: []` **aunque los tenga**. Quien despache
  el atasco lo hará con menos información de la que la pantalla aparenta.

### Lo que NO se reparte todavía, y es decisión tomada

El formateo masivo (75 de 148 archivos fuera de la regla: el diff escondería
cualquier cambio real dentro), `npm audit` con `multer` de ruptura, y la alta
disponibilidad de Cloud SQL (`ZONAL` en `db-f1-micro`, decisión de coste legítima).

---

## 🔑 6. Decisiones vigentes que cruzan dominios

> **Esta sección existe por un fallo mío del 2026-08-24**, anotado abajo: una
> decisión que obliga a alguien tiene que vivir donde ese alguien la vea.

### 🧊 El histórico de correo no se borra — decisión del Jefe (2026-09-11)

Ante el atasco de PDF que reventaba la cuota de Gmail había dos salidas: resetear
el marcador `historyId` —rápido, y **se pierde el histórico**— o **digerirlo
despacio**. El Jefe eligió lo segundo: el sistema se toma el fin de semana que
haga falta, pero no se tira un correo.

**Eso convierte el estrangulador de la Fase 8.1 en la única salida**, y es la
razón de que su encargo no sea opcional ni cosmético: sin él, el atasco no drena.

### Decisión — la zona horaria es `America/Cancun` (2026-08-22)

§44.2 de @Alana. `time-zone.ts:24` fija **`America/Mexico_City` (UTC−6)** y lo
justifica en su docblock como _«donde trabaja quien usa esto»_. **Toda la
infraestructura corre en `America/Cancun` (UTC−5 fijo)**, escrito dos veces en
`deploy.yml`.

**Efecto medido:** lo cerrado o fichado **entre 00:00 y 01:00 hora local cuenta en
el día anterior**, en `GET /dashboard/metrics` y en `GET /time/report`.

Ella no lo dio por defecto y acertó: el docblock lo declaraba **decisión de
producto**, así que _o el valor está mal o el comentario lo está_, y eso no es suyo.

**Decisión de Doc: el valor está mal.** El Jefe está en Tulum — `America/Cancun`,
UTC−5 **sin horario de verano**, que además es lo que evita que el número baile dos
veces al año. Se cambia la constante **y el comentario**: esa frase es justo la que
hizo que el error pareciera intencionado durante meses.

---


### 🔑 La clave de Gemini de producción está fuera de nuestro control (2026-08-24)

Vive en otro proyecto de Google (`gen-lang-client-0325947422`), la paga otra
cuenta de facturación y se creó el 20 de mayo — dos meses antes de que este
producto existiera. **No se puede rotar, revocar ni ver su gasto desde la consola
del proyecto.** No es un fallo técnico: es una pieza de producción fuera del
control administrativo del dueño. Sigue igual.

### 🔧 Fallo de mi diseño de canales, dos veces en un día (2026-08-24)

@Alana reportó como hallazgo que la URL del webhook acabó en dos sitios — **y fue
una decisión mía**, deliberada y razonada: que el avisador no comparta suerte con la
autenticación de GCP. **Ella no podía saberlo**: vive en `DOC.md` y en el prompt de
@Claude, y desde el 21-08 no lee `DOC.md`.

Es la segunda vez hoy. La primera: @Gravity tocó la prueba de @Claude sin poder
saber que había una decisión tomada sobre ella.

**El patrón:** separar los canales evita que hereden el relato ajeno — y de paso
**esconde las decisiones que restringen a otros**. Una decisión que obliga a alguien
tiene que vivir donde ese alguien la vea. `DOC.md` no vale si no todos lo leen.

**Pendiente de arreglar**, y es de Doc: llevar las decisiones vigentes que cruzan
dominios a un sitio que los tres lean — `AI_ROLES.md` es el candidato — en vez de
dejarlas solo en el prompt de quien las ejecuta.

### Rutina de Doc — revisar los tres buzones (2026-08-21)

El buzón lleva escrita desde el 20-08 su propia limitación: _«no hay nadie sondeando
este archivo: escribir aquí deja constancia, pero no despierta a Doc»_. **Hoy se
cumplió dos veces en la misma tarde.** @Claude dejó un bloqueo sobre el
`trust proxy` que estuvo **un día** sin respuesta, y @Alana dejó el resultado de los
27 con un «corre ahora mismo» encima. **Las dos las vi porque el Jefe me las
señaló, no porque yo mirara.**

Escribir la limitación no la arregla. **Desde hoy, revisar los tres buzones es
parte de la rutina de Doc**, junto con `git log` y `git status`:

```text
PROMPT_CLAUDE.md   → buzón
PROMPT_GRAVITY.md  → buzón
PROMPT_ALANA.md    → buzón
```

Y de paso: **retirar lo contestado.** Había una entrada de los tres roles de IAM
que seguía viva días después de resolverse. Un buzón con entradas muertas dentro
deja de leerse, que es la segunda forma de que un canal falle.

---

## 🚨 7. Reglas de coordinación que ya costaron un disgusto

- **Añadir por ruta, nunca `git add -A` o `git add .`:** Dos o más agentes escriben sobre el mismo árbol. Un _add_ masivo rompe las bitácoras y sube código no probado.
- **Preguntar "¿por qué?" en lugar de "¿está?":** Lección aprendida de los falsos positivos (ej. el fallo de encoding del `.gitignore`).
- **El campo `Estado` de un encargo lo decide solo Doc:** Ha fallado dos veces: trabajo entrando con el documento en pausa, y encargos pidiendo cosas ya entregadas. **Desde el 2026-08-20, con Doc escribiendo solo en este archivo, el valor lo dicta Doc y lo transcribe el dueño de la bitácora.** El ejecutor no lo elige; lo copia.
- **Un estado verificado caduca en cuanto alguien actúa sobre él:** lección de @Alana el 2026-08-20, que publicó una propuesta de tres capas y descubrió que la Capa 2 se había entregado mientras la escribía. Antes de publicar cualquier cosa que describa el estado del sistema, `git log` otra vez.
- **Verificar en el código antes de dar una casilla por cerrada:** Nunca confiar ciegamente en el reporte sin evidencia (logs, HTTP 200 o el monitor en vivo).
- **Doc escribe los encargos en los buzones (PROMPT_*.md) y da el comando exacto al Jefe:** Repartir no significa decirle al Jefe "dile a Claude que haga esto". Repartir significa que Doc va al archivo `PROMPT_CLAUDE.md` o `PROMPT_GRAVITY.md`, escribe el encargo detallado (basado en la investigación previa), y le entrega al Jefe la orden exacta de consola (ej. `! Lee tu buzón en PROMPT_CLAUDE.md`) para despertar al agente. Lo que no está escrito y listo para correr, no está repartido.
- **Resumen ejecutivo de Doc en el chat:** Siempre que Doc proponga una estrategia y escriba un encargo en los buzones, **debe dejar en el chat un resumen en lenguaje claro para el Jefe.** El Jefe necesita entender exactamente qué se está proponiendo *antes* de dar la orden en consola, para poder vetar o cambiar el plan si la estrategia no le encaja.

---

