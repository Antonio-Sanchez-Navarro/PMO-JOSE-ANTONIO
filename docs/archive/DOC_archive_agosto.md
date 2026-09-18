# DOC.md — archivo de agosto de 2026

> Crónica de Doc entre el 2026-08-21 y el 2026-08-26, retirada de `DOC.md` el
> **2026-09-11** por la poda de contexto. **Todo lo que hay aquí está cerrado y
> verificado**; se archiva en vez de borrarse porque cada entrada explica *por qué*
> se decidió algo, y ese porqué no se reconstruye después.
>
> Lo que seguía vivo al archivar se quedó en `DOC.md`: la zona horaria de Cancún,
> la rutina de los tres buzones, el fallo de diseño de canales y la clave de Gemini
> fuera del proyecto.

---

producto avisaba solo por correo, a un canal que nadie había declarado como tal.

---

### ✅ Y la alarma del parseo era falsa — corrección mía (2026-08-22)

Escribí que **«es posible que la IA lleve semanas leyendo las dos primeras líneas
de los correos largos»**. No ocurrió. La sonda, con sus testigos:

```text
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

### 👀 Frente abierto: vigilancia del despliegue — las dos capas (2026-08-22)

Comprobado por Doc: **ningún workflow avisa ante fallo.** `deploy.yml` menciona el
webhook solo para **inyectárselo a los servicios**. Y no es solo Vercel: **si el
despliegue de la API se cae, tampoco se entera nadie.** Lleva funcionando porque no
ha fallado.

La asimetría, dicha en voz alta: para el respaldo construimos **dos capas** —una
dentro que dice el motivo, otra fuera que garantiza que te enteras— y escribimos por
qué hacían falta las dos. Para el despliegue, **cero**. La misma casa, el mismo mes.

|            | Quién                                                                            | Qué garantiza                                       | Su punto ciego                                                                |
| ---------- | -------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Dentro** | Workflow con `deployment_status: failure` y `workflow_run: failure` → Chat       | dice **qué** falló y dónde mirar                    | no ve lo que **no llega a fallar**: si Vercel deja de disparar, no hay evento |
| **Fuera**  | Sonda periódica que compara el commit servido con el último que tocó el frontend | garantiza que **te enteras**, sea cual sea la causa | no sabe el motivo                                                             |

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

| Se supuso                                             | Lo que era                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Un rechazo de Redis dejaba correos sin encolar        | **Cero fallos de Redis en 30 días.** La única línea del `catch` era `P1001` contra la base |
| La IA llevaba semanas leyendo solo la vista previa    | **`solo-snippet = 0`**, con testigos que lo hacen falsable                                 |
| El hueco del `attachmentId` se está comiendo cuerpos  | **Aquí no perdió ni uno.** Cinco de seis sí tenían `text/html` con `data`                  |
| Son dos fallos, y el del `snippet` vacío sin explicar | **Es uno, y no es un fallo**                                                               |

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

### 🔴 Vigilamos lo que el sistema hace y no lo que consume (2026-08-24)

@Alana barrió las consolas (§46) y su conclusión reordena las prioridades:

> **«Las tres pasadas de código dieron 27 hallazgos y ninguno era una cuenta atrás.
> De las dos formas de que esto se pare un martes por la mañana, la segunda es hoy
> la más probable.»**

**Anthropic: quedan $8,14.** Consumo de agosto — 1.354.565 tokens de entrada,
113.599 de salida— cuesta entre **$3,85 y $9,61** con los precios vigentes (Sonnet 5
a $3/$15 por millón, con lanzamiento a $2/$10 **hasta el 31 de agosto**; Opus 5 a
$5/$25). **Tres a seis semanas**, y el **31 de agosto la clasificación sube un 50 %**.

**Y lo que pasa al llegar a cero, trazado por ella en el código:** `convieneEsperar`
leerá el 429 como falta de cuota, **`frenarLaCola` pausará el worker entero**, y los
correos entrarán sin clasificar. **La DLQ avisaría del síntoma; la causa no la dice
nadie.**

**GCP factura desde el 19-08**, y comprobado por Doc: **la Cloud Billing API ni
siquiera está activada en el proyecto**. No es que el umbral esté mal puesto — no
existe dónde ponerlo.

**Dato de producto que cambia la lectura:** el cliente OAuth marca «último uso: 20
de agosto». **Nadie entra desde hace cuatro días**, así que el gasto actual no es de
uso: es de clasificar los correos que siguen llegando solos. Se quema saldo sin que
nadie mire el tablero.

**Repartida la Capa 3 a @Claude**, con la misma forma que las dos anteriores:

|             | Qué                                                                                                                                                  | Su punto ciego       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Pronto**  | Estimación del gasto desde el `usage` que ya devuelve cada llamada, contra un presupuesto configurado. Avisa en **días restantes**, no en porcentaje | No es exacto         |
| **Nativo**  | Presupuesto de Cloud Billing con notificación por Pub/Sub                                                                                            | Solo GCP             |
| **Al filo** | Distinguir el 429 de **saldo agotado** del 429 de ritmo, y decir la causa                                                                            | Llega cuando ya pasó |

**Y una condición escrita en el encargo:** los precios van **en configuración con su
fecha**, porque el de Sonnet 5 caduca el 31 de agosto. Un precio incrustado que
caduca en una fecha conocida es la familia del `maxScale` del comentario.

**Lo que NO se toca todavía:** `--no-cpu-throttling`, la cadencia del barrido y el
escalado — las tres decisiones que se tomaron cuando esto era gratis. Revisarlas sin
la factura delante es cambiar un número por otro inventado. Primero la Capa 3.

---

### ⚠️ Decisiones pendientes del Jefe (2026-08-24)

1. **Recargar el saldo de Anthropic:** ✅ **RESUELTO (2026-08-25).** El Jefe confirmó que la cuenta tiene recarga automática. El riesgo de que la máquina se apague sola por falta de fondos está mitigado. La Capa 3 (alerta de consumo) de @Claude sigue siendo válida para vigilar el ritmo de gasto, pero ya no es un aviso de muerte inminente del sistema.
2. **La clave de Gemini de producción vive en otro proyecto de Google**
   (`gen-lang-client-0325947422`), la paga otra cuenta de facturación y se creó el
   20 de mayo — dos meses antes de que este producto existiera. **No se puede rotar,
   revocar ni ver su gasto desde la consola del proyecto.** No es un fallo técnico:
   es una pieza de producción fuera del control administrativo del dueño.

---

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

### Estado del reparto — cierre del 2026-08-21

| Capa         | Estado     | En qué                                                                                                   |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| **@Claude**  | `TRABAJAR` | **§37.8, el contrato del socket** y su mitad. Último hallazgo vivo de la auditoría                       |
| **@Gravity** | `EN PAUSA` | Sin encargo. La mitad cliente del socket es suya y espera al contrato                                    |
| **@Alana**   | `TRABAJAR` | Los 27 huérfanos: el texto de los `warn` en Cloud Logging, si es pico o goteo, y si sigue tras `337340e` |

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

### Resolución Fase 5 y Auditoría (2026-08-25)

El día de hoy se completó la resolución de los **19 hallazgos** (14 en la API, 5 en el Frontend) reportados por Alana durante la auditoría de la Fase 5.

El trabajo en local resultó en un 100% de éxito en los 704 tests unitarios de Jest. Sin embargo, tal como se tiene documentado, el trabajo no cuenta hasta llegar a producción. Durante el despliegue automático surgieron tres inconvenientes que probaron nuestras redes de alerta:

- **Semáforo del backend (Frontend)**: Alana detectó que el `/health/ready` fallaba en resetear su estado local al encontrar errores (503), manteniendo la luz verde. Se aplicó `setHealth(null)` en el catch (`f65ca20`).
- **ESLint en CI**: Unas quejas estrictas del linter por usar `require('fs')` y `require('path')` dentro de `frontend-al-dia.service.spec.ts` reventaron la etapa `build-and-lint`. Se cambió por `import * as fs` (`030b003`).
- **Prisma y el inferido `never[]`**: Los arrays vacíos `subidas` y `creadas` en `precios-modelo.ts` y `email-classification.service.ts` rompían la compilación de TypeScript al no poder inferir tipo. Se tiparon explícitamente (`3c4cf5d` y `780ad95`).

- **Contrato de DashboardMetrics (§48.5)**: Eliminada la duplicación de tipos en `apps/api`. Ahora el backend consume el contrato directamente desde `@pmo/shared`, resolviendo el último detalle técnico pendiente.
- **Formato Documental (MD-Lint)**: Corrección de reglas MD040 (bloques sin lenguaje) y MD031 (espaciado) en `DOC.md` y `RUNBOOK.md` mediante Prettier.

Con esto el código y la documentación están inmaculados, el CI/CD en verde, y la Fase 5 cierra su bloque de implementación preparándose para las pruebas en vivo.

### 🧊 Fase de Congelación (2026-08-26)

**Decisión ejecutiva del Jefe:** El producto funciona (ingesta, copiloto, interfaz) y los riesgos urgentes (cuota Upstash y alerta Anthropic) están mitigados. 
- **Pausa general:** Cero auditorías nuevas. @Alana entra en letargo.
- **Congelación de arreglos:** A menos que algo esté literalmente roto en la pantalla o quemando dinero, no se toca. Los casos de borde (zona horaria, campo CC, textos de 503, presupuesto al centavo) quedan en espera.
- **Objetivo:** Dejar que el sistema respire en producción sin inyectar 10 commits diarios.

### ⚠️ Aviso sobre cuota de Upstash (Sondeo de 30s)

✅ **RESUELTO (2026-08-25).** Alana alertó que el primer arreglo de @Gravity usaba `/health` para el latido periódico y reservaba `/health/ready` para fallos, lo que dejaba al semáforo ciego a las caídas de Redis/Postgres. @Gravity lo corrigió (`ba609aa`): el latido ahora es contra `/health/ready` para mantener lectura profunda, pero el intervalo subió a **5 minutos (300s)**. Esto recorta el consumo a ~288 comandos/día por pestaña (1.7% del plan gratuito), siendo sostenible y devolviendo al semáforo su utilidad.

