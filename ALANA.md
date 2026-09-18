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

---

## 65. Auditoría completa por encargo del Jefe — vive en `auditoria_9926.md` (2026-09-09)

El Jefe para la máquina: *«se repiten errores, se programan cosas en archivos que
no son, se hace referencias a cosas que no existen. ya me canse»*. Encargo:
barrido línea por línea, archivo por archivo, y **los hallazgos en un archivo
aparte llamado `auditoria_9926`**, no aquí.

**Aquí queda solo el apunte y la conclusión.** Los catorce hallazgos, con su
evidencia, están en **`auditoria_9926.md`**, en la raíz del repositorio.

### Lo que medí, y es el dato que cambia el tono

| Comprobación | Resultado |
|---|---|
| `tsc` api / web | ✅ 0 errores |
| `npm run lint --workspaces -- --max-warnings 0` (el comando exacto del CI) | ✅ **0 avisos** |
| `jest` de la API | ✅ **753 pruebas · 38 suites · verdes** |

**El árbol está sano.** Los siete `any` que tumbaron el CI ayer ya están
arreglados en disco. **Y nada de eso está commiteado ni desplegado**: el estado
bueno del proyecto vive en un portátil.

### El diagnóstico, en una frase

**Los tres síntomas que nombró el Jefe son el mismo problema visto por tres
lados: nada verifica en el sitio donde se escribe.**

`npm run lint` no lleva el umbral del CI (vive solo en el workflow). El gancho
`pre-commit` solo vigila mezclas de dueños, no ejecuta ni tipos ni lint ni
pruebas. El frontend **no tiene una sola prueba** y `--if-present` convierte esa
ausencia en un aprobado. Y Prettier está configurado sin que nada lo llame.

De ahí salen los otros dos solos: redeclarar `ProposedTask` al lado del que ya
existe **compila, pasa el lint y pasa las pruebas**; y la mitad de las
«referencias a cosas que no existen» **existen y no se encuentran**, porque la
misma clave se escribe con comilla simple en un archivo y doble en otro.

**Eso último no es una teoría mía: me pasó dos veces durante la propia
auditoría** —nueve falsos positivos de variables de entorno y las cuatro rutas de
`/auth` dadas por inexistentes—, y las dos veces era mi barrido, no el código.
Lo dejé escrito en el informe con nombre y apellido, porque un auditor que
esconde sus falsas alarmas no vale para esto.

### Y dos que cierro a favor, que también es trabajo

- **Los finales de línea están resueltos.** Iba a levantar la alarma —28 de 215
  archivos con CRLF en disco— y fui a mirar el repositorio en vez del disco:
  **cero archivos commiteados con CR**. El `.gitattributes` funciona. La deuda
  que arrastro desde §31 se cierra.
- **No hay rutas fantasma.** Crucé las 30 llamadas del frontend contra las 40
  rutas reales de los controladores: **todas existen**.

**No cierro nada más y no reparé nada.** Segunda vuelta pendiente: los recursos
externos con navegador, según el Jefe vaya habilitando entradas.

### 65.1 Segunda vuelta: los recursos externos, y una corrección mía (2026-09-09)

Añadida la **Parte 7** a `auditoria_9926.md` con los paneles de Upstash, Google
Cloud y Vercel. Diez hallazgos más. **El que importa me corrige a mí.**

**Ayer, en §63.5, escribí que «el plan de Upstash no alcanza» y lo calculé:
500.000 ÷ 1.140 comandos/hora ≈ 18 días de consumo normal.** El gráfico de
comandos diarios dice otra cosa: sábado, domingo y lunes **casi cero**; martes
~100 mil; **miércoles ~500 mil**. El consumo normal de este sistema es
prácticamente nulo. **Lo que agotó la cuota fue un pico de un solo día**, el
mismo en que volvió la ingesta con la clasificación rota.

> **No era el plan. Era el bucle** — el H10 de la auditoría, 100 reencolados cada
> quince minutos que fallan y vuelven a la cola.

Y esto no es una precisión de contable: **con mi diagnóstico de ayer, la
conclusión razonable era pagar un plan mayor.** Con el gráfico delante, pagar sin
cerrar el bucle solo cambia un producto parado por una factura sin freno — y el
pago por uso está **sin presupuesto puesto**, mientras Upstash retira el
descuento que abarataba BullMQ.

**Y una que retiro a favor del código ajeno:** la cuota real de Gmail es de
**6.000 unidades por minuto y usuario** ⇒ 1.200 mensajes/minuto. El arreglo P0
va a ~450 peticiones/minuto: **cabe con margen de 2,5x**. Mi H9 se queda como
corrección de un comentario que miente y **pierde el filo de riesgo**.

**Tres que cierro:** el Root Directory de Vercel (§37.20, vivo desde el 21-08),
§13 —el dominio ajeno no pertenece a nuestra cuenta y no se puede cerrar desde
aquí— y el montaje de Vercel, que está bien hecho casi entero.

**Lo que queda sin mirar:** el panel de Anthropic, que me devuelve permiso
denegado de dominio.

### 65.2 Tercera vuelta: el sistema se arregló mientras lo auditaba (2026-09-09, 21:50 UTC)

Añadida la **Parte 8** a `auditoria_9926.md`. **Entre una vuelta y otra el
proyecto pasó de roto a funcionando, y lo encontré midiendo, no me lo dijo
nadie.**

El backend sirve ahora `8b5c9e3 fix(backend): resolve eslint any warnings to
unlock CI` — **exactamente el tapón que señalé en la Parte 1**. Siete avisos de
`any` tumbaban el lint, el lint el CI, el CI dejaba el despliegue en `skipped`.
**Se arreglaron siete líneas y se apagaron dos incendios.**

Medido en 30 minutos, contra lo de ayer: `API key is invalid` **300 → 0**,
`Total Query Cost` **300 → 2**, `max requests limit` **→ 0**, `marcador no
avanza` **→ 0**. Y la reconciliación dice **«0 reencolado(s) de 0 candidato(s)»**
cuatro pasadas seguidas, donde ayer decía «100 de 100». **El atasco está drenado,
no solo parado** — aunque el bucle de H10 sigue escrito y volverá a morder la
próxima vez que la IA falle.

**Cinco cosas que cierro hoy, y una es la más antigua que tenía viva:**

- **§31 entero**, del 18 de agosto: los respaldos automáticos encendidos,
  `requireSsl` en `true`, `sslMode` exigiendo certificado de cliente, **ninguna
  red autorizada** —se fue el «parche temporal» de la IP de casa— y, de propina,
  recuperación a un punto en el tiempo con 7 días de log. *«Los cuatro
  interruptores están donde deben.»*
- **§51.1**: bandeja **728** y métricas **728**. Coinciden. Y el encabezado ya
  dice «20 correos **cargados**», que es la verdad.
- **§37.20** (Root Directory de Vercel) y **§13** (el dominio ajeno, que no es de
  nuestra cuenta).
- **Los tres requisitos de la Fase 6**: el distintivo `🕒 1 propuesta` y el botón
  `Reanalizar` los vi funcionando; el clip **no puede verse todavía** porque la
  columna nació con `DEFAULT false` y nadie rellenó hacia atrás — solo saldrá en
  correos nuevos, y lo dejo escrito para que nadie lo reporte roto.
- **La capa de decisión existe** y dice *«Revisa la propuesta antes de enviarla
  al tablero»*. Es el punto 1 del Jefe del 26-08, cerrado palabra por palabra.

**Y cuatro que abro**, la primera de producto y las dos siguientes de una casilla
cada una:

- 🟠 **El modal de cuarentena no tiene salida no destructiva.** Ni `Escape`, ni
  clic fuera, ni ✕ — lo comprobé por las dos vías. Solo `Descartar`, `Aprobar e
  Insertar` o `Reanalizar`. **Abrir para mirar ya obliga a decidir**, que es la
  misma prisa que la Fase 6 venía a quitar.
- 🔴 **`deletionProtectionEnabled: false`** en la base de producción.
- 🟠 **`master` sin protección de rama**: cualquiera empuja, fuerza o borra, sin
  exigir CI en verde. Es la sexta barrera ausente de la misma familia, **y
  exigir el CI ahí convierte H1 en inofensivo**.
- 🟡 Dos etiquetas pintadas con el identificador crudo de Gmail.

**Lo único que no se ha movido en dos semanas:** el cronómetro de §51.6 — 0.0
horas con tres tareas en marcha.

### 65.3 Cuarta vuelta: Anthropic, y la auditoría queda cerrada (2026-09-09)

El Jefe habilitó el dominio y entré. Añadida la **Parte 9** a
`auditoria_9926.md`. **Con esto la auditoría está completa: código, tubería,
nube, Vercel, Upstash, Gmail y Anthropic.**

**El hallazgo con reloj: la clave de producción caduca el 1 de noviembre de
2026.** Cincuenta y tres días. La clasificación se apagará sola — **el mismo
patrón exacto del `watch` de Gmail**, que caducó a los siete días y dejó la
ingesta muerta once. La diferencia es que aquél avisaba; **esta fecha vive en un
panel que nadie mira.**

**Y una comparación que vale por sí sola:** en Anthropic hay **una sola clave**;
la vieja se borró al rotar. En Secret Manager hay **trece versiones y todas
habilitadas**, con tres cadenas de Neon vivas dentro (§57.3). Misma casa, dos
higienes opuestas — y la buena es la de fuera.

**Lo que cierro:** la cadena de la clave está alineada en sus tres puntas por
primera vez —consola, Secret Manager y `.env`, mismo prefijo—, y §48 queda
mitigado, aunque **por la recarga automática y no por el saldo**: hay $13.26,
que es tan fino como los $8.14 que bloquearon el producto en agosto.

**Lo que abro:** el límite de gasto de 200 dólares **no tiene ni una notificación
configurada** — es un muro, no un semáforo. Y hay una tarjeta cargada dos veces.

**Y el dato operativo que faltaba:** el nivel es `Scale`, con **10.000
solicitudes/minuto** en Sonnet 5, contra el limitador propio de **20/minuto**.
**El freno es nuestro y es 500 veces más estricto que el del proveedor.** No es
defecto —es ahorro— pero conviene saberlo el día que haya que vaciar un atasco:
el cuello de botella es una constante nuestra, no Anthropic.

**La asimetría que me llevo de las dos últimas vueltas:** Anthropic tiene techo
de gasto y Upstash no tiene ninguno. **El freno está puesto donde el gasto es
previsible, y falta donde vive el bucle.**

### 65.4 Parte consolidado entregado a Doc para el reparto (2026-09-09)

Cerrada la auditoría, el Jefe pide que le pase a Doc el parte para repartir. **Y
eso no es reenviar las nueve entradas del buzón**: son cronológicas y por tema, y
Doc necesita una sola lista con dueño y coste al lado.

Escrito al final de `PROMPT_ALANA.md`: **25 puntos abiertos, ordenados por
urgencia real, con dueño propuesto** — Jefe, @Claude o @Gravity—, más tres
bloques que suelen faltar en un informe y son los que ahorran tiempo:

- **Lo que ya está cerrado, para que no se reparta.** Ocho entradas, incluida la
  comprobación del punto 4 de la lista de Doc: `persistConfirmed` **sí** graba
  `aiConfidence` y pone `source: EMAIL`, **y verifiqué que no hay riesgo** — no
  queda ni un `deleteMany` sobre `Task` en todo el backend, así que el cambio de
  `MANUAL` a `EMAIL` no expone las tareas aprobadas a un borrado.
- **Lo que recomiendo NO repartir todavía**: el formateo masivo y `npm audit`,
  los dos por la misma razón —cambiar el suelo mientras se construye encima.
- **Lo único con fecha**: la clave de Anthropic caduca el 1 de noviembre.

**Y una recomendación que me juego entera:** si de la lista solo se hace una
cosa, que sea **H1 + C12** — el umbral del linter en el `package.json` y «CI en
verde» obligatorio para fusionar. **Con eso el error se ve antes de empujar y no
entra si rompe**, y la mitad de esta lista baja de categoría sola.

Lo dejé escrito así porque es lo que hoy demostró el día: el proyecto se arregló
cuando alguien tocó **siete líneas de `any`** — no una arquitectura. **El cuello
de botella de este equipo no es la capacidad de programar, es que nada verifica
donde se escribe.**

**No cierro nada y no reparé nada.**

---

## 66. Despertar del 2026-09-18 — la radiografía de los 678 y la salida tapada otra vez

> Encargo de Doc en `PROMPT_ALANA.md`: **alcance dirigido**, dos preguntas —la
> radiografía del atasco y las nueve casillas de consola—. Ambas contestadas
> abajo. Al mirar el árbol apareció algo que no estaba en el encargo y que las
> tapa a las dos: **producción no corre el código de hoy y el frontend nuevo ya
> está publicado encima**. Va primero porque es lo que está roto ahora mismo.
>
> Hora del barrido: **2026-09-18, ~23:30 UTC** (18:30 en Tulum). El árbol se
> movió **mientras auditaba** —`92b5262` se commiteó y empujó entre dos de mis
> comandos—, así que todo lo de aquí lleva sello de hora.

### 66.0 Lo primero: la cabecera de este cuaderno, recuperada

`28a4fd5` cortó este archivo por la línea 9397 de 9696 y se llevó el título y el
**§0 entero** —el protocolo de esta terminal—. Recuperado hoy de `16a769a`:
**140 líneas repuestas por delante, sin tocar una coma de las 300 que quedaban**
(verificado: el archivo actual era exactamente la cola, byte a byte salvo fin de
línea). La poda deliberada de agosto **se respeta**; lo repuesto es solo la
cabecera, que es lo único que no se puede volver a deducir del código.

### 66.1 🔴 La salida está tapada por dos errores de lint. Otra vez.

**Producción sirve la revisión `pmo-api-00130-7nc`, del 2026-09-15.** El código
de hoy no está desplegado, y no es que el despliegue fallara a medias: falló dos
veces y de dos formas distintas.

| Intento | Qué pasó | Evidencia |
|---|---|---|
| `pmo-api-00131-z47` (23:19 UTC) | **El contenedor no arrancó.** `HealthCheckContainerError`: `Nest can't resolve dependencies of the AuthGuard (?) … available in the ObrasModule context` → `exit(1)` | registro de la revisión |
| `92b5262` (23:22 UTC) | Arregla justo eso —`ObrasModule` ya importa `AuthModule`—, **pero el CI cayó en el linter**, así que `Deploy API to Cloud Run` salió `skipped` | run `35405456429`, 36 s |

Los dos errores que tapan la salida:

```
apps/api/src/modules/emails/emails.service.ts:1186:11
  'position' is never reassigned. Use 'const' instead   (prefer-const)

apps/web/src/features/kanban/components/KanbanBoard.tsx:396:14
  '_error' is defined but never used   (@typescript-eslint/no-unused-vars)
```

**Es el §64.3 repetido, palabra por palabra**, y esta vez ni siquiera son `any`
heredados: son dos líneas escritas hoy. Con `--max-warnings 0`, **el linter no
es estilo: es el interruptor del despliegue.** Y sigue sin haber nada que lo
verifique antes de empujar —es lo que pedí en §65.4 como H1 + C12, y C12 sigue
abierta (66.6).

### 66.2 🔴 Y encima: el frontend nuevo ya está publicado sobre ese backend viejo

`22f4e0c` movió el frontend a **Firebase Hosting** y metió
`app.setGlobalPrefix("api")` en `main.ts`. El hosting **sí** se publicó; la API
con prefijo **no**. Sondeado ahora mismo:

```
https://pmo-dashboard-503418.web.app/                 → 200   (la SPA carga)
https://pmo-dashboard-503418.web.app/api/health/ready → 404
https://pmo-api-…run.app/health/ready                 → 200   (sin prefijo: el viejo)
https://pmo-api-…run.app/api/health/ready             → 404
```

Y ya está pasando en el registro de los últimos días, no es teoría:
**`/api/auth/google` → 404 (9 veces), `/api/auth/me` → 404 (12),
`/api/health/ready` → 404 (12)**. Es decir: **el tablero nuevo está en pantalla
y no puede ni iniciar sesión.** Es exactamente §64.5 —frontend nuevo sobre
backend viejo— con otro traje.

### 66.3 🔴 La mina del prefijo: ocho enchufes apuntan a la puerta vieja

Esto es lo que importa **el día que el despliegue por fin pase**, porque
entonces se rompe lo contrario: `/api` existirá y **lo de fuera seguirá llamando
a la puerta sin prefijo**. `setGlobalPrefix("api")` va **sin exclusiones**, así
que arrastra webhooks y cron igual que al resto.

| Qué | Valor hoy | Lo que hará falta |
|---|---|---|
| Suscripción push `gmail-ingest-push` | `…/webhooks/gmail` | `…/api/webhooks/gmail` |
| Variable de repo `GMAIL_PUBSUB_AUDIENCE` | `…/webhooks/gmail` (08-13) | idem — la audiencia OIDC se valida |
| Variable de repo `CRON_OIDC_AUDIENCE` | `…/cron` (08-13) | `…/api/cron` |
| 5 tareas de Cloud Scheduler | `/cron/frontend-al-dia`, `/cron/coste-ia`, `/cron/reconciliar`, `/cron/gmail-watch`, `/cron/overdue` | las cinco con `/api` |

**`pmo-gmail-watch-renew` está en esa lista**, y es la que mantiene vivo el
`watch` de Gmail: si queda en 404, la ingesta se muere sola en siete días y
**nadie avisa**. Es el patrón del `watch` caducado de agosto, con la diferencia
de que esta vez está escrito antes de que pase.

Lo que **sí** se actualizó hoy (23:03) y está bien: `WEB_URL` y
`GOOGLE_REDIRECT_URI` ya apuntan a `https://pmo-dashboard-503418.web.app` con
`/api/auth/google/callback`. **Queda comprobar que ese URI exacto esté dado de
alta en la consola de OAuth**, que no se ve desde aquí.

### 66.4 🔴 La ingesta lleva nueve días muerta, y contesta 200 en la puerta

El dato duro de la base: **el último correo guardado es del 2026-09-09 18:52**;
el último `processedAt`, del 09-09 22:54. **Cero filas nuevas en nueve días.**

Y al mismo tiempo, en el registro de los últimos 7 días: **83 entregas a
`/webhooks/gmail` con estado 200**, y `/cron/gmail-watch` en 200 cada mañana
(la última, hoy 07:30 UTC). O sea: **Gmail avisa, la API contesta que sí, y no
entra nada.** Un fallo que responde 200 no aparece en ningún panel.

Dos causas, y las dos con evidencia:

1. **09-09, 18:23 UTC — Upstash cortó por cuota**, seis veces seguidas:
   `ReplyError: ERR max requests limit exceeded. Limit: 500000, Usage: 500051`.
   Es el minuto exacto en que la base deja de crecer. No hay ni un error de
   Redis posterior en el registro, así que **el corte fue ahí y desde entonces
   solo hay silencio** — que es lo que hace una cola que ya no drena.
2. **Desde el 09-15 hay una segunda puerta cerrada, y es deliberada**: la Fase 9
   (`e3c9cb3`) exige que **exista la etiqueta PMO** en Gmail o `backfill` y
   `getInbox` abortan. La etiqueta aún no está creada. Ese tramo está explicado.

Lo que **no** está explicado es el hueco **09-09 → 09-15**, y por eso lo dejo
como pregunta y no como conclusión. Lo que sí afirmo, porque está medido: **crear
la etiqueta PMO no va a arrancar esto por sí solo.**

### 66.5 La radiografía del atasco — Bloque 0 de la Fase 7, por fin medida

Consultado en la base de producción a través del proxy, **solo lectura**, hoy.
**Ya no son 728: son 678.** (752 correos en total; 68 `DISMISSED`, 4
`COMPLETED`, 2 `IN_PROGRESS`.)

| Forma de los 678 pendientes | Cuántos | % |
|---|---|---|
| `isActionable: false` (ruido puro) | **274** | 40 % |
| Accionables **sin** propuestas | **208** | 31 % |
| Accionables **con** propuestas en cuarentena | **196** | 29 % |

- **369 tareas propuestas** esperando decisión, repartidas en esos 196 correos
  (1,9 de media).
- **378 hilos distintos** — la bandeja por hilos reduce el despacho de 678 fichas
  a 378 conversaciones.
- **Antigüedad: no hay cola vieja.** El más antiguo es del **13-08** y el más
  reciente del **09-09**: 524 dentro de los últimos 30 días y 154 entre 31 y 90.
  **Ninguno pasa de 90 días**, así que **una fecha de corte no sirve de nada
  aquí** — no hay un tramo antiguo que archivar en bloque.
- `processedAt` puesto en los 678: **la IA ya los vio todos.** Solo 10 traen
  `skipReason`, y los 10 son `SIN_TEXTO`.

**Lo que eso dicta para la Fase 7** (era la decisión que el Bloque 0 tenía que
desatascar): **no hay mayoría, hay tres tercios**, así que el alcance no puede
ser «filtro y archivado masivo» **o** «aprobación por lotes»: **hacen falta los
dos**, y el reparto natural es 274 fuera de en medio con archivado masivo y 196
por lotes en la cuarentena. Los 208 del medio —accionables sin propuesta— son
los que hoy no tienen ni botón ni pantalla.

**Y el dato incómodo, que cambia lo que se ve al despachar:**

| Campo | Cuántos de los 678 lo traen |
|---|---|
| `attachments` (fichas de la Fase 8) | **0** — son `NULL` en los 678 |
| `hasAttachments: true` | **0** |
| `company` | **0** |
| `bank` | **0** |

Las tres funciones de la Fase 8 —adjuntos, empresa y banco— **están construidas
y son ciegas sobre todo lo que ya hay dentro**, porque nacieron sin relleno hacia
atrás y desde entonces no ha entrado un solo correo nuevo (66.4). Traducido:
**las pestañas de empresa y banco saldrán vacías para los 678**, y el visor de
adjuntos no tendrá nada que enseñar. Confirma la casilla 🟡 del Bloque 0 de
`TASKS.md` y la agranda: no es solo `hasAttachments`, son tres campos.

### 66.6 Las nueve casillas de consola, hoy

| # | Estado | Lo comprobado |
|---|---|---|
| **C11** 🔴 base sin protección de borrado | ✅ **CERRADA** | `pmo-postgres-db`: `DELETION_PROTECTION_ENABLED: True`, backups `True` |
| **§57.3** secretos con la contraseña de Neon dentro | ✅ **CERRADA la parte grave** | `pmo-database-url`: versiones 1, 2 y 3 **destroyed**. Quedan 17 versiones habilitadas en total (eran 13): **higiene, ya no fuga** |
| **§57.4** `pmo-presupuesto` sin suscriptores | ❌ **ABIERTA** | el topic existe y **sigue sin una sola suscripción**: el aviso de presupuesto no llega a ningún sitio |
| **C12** `master` sin protección de rama | 🟠 **A MEDIAS** | ya hay protección (no force-push, no borrado) pero **sin `required_status_checks`**: «CI en verde» **no** es obligatorio. Por eso `92b5262` pudo entrar con el linter roto |
| **R2** Upstash sin presupuesto | ❌ **ABIERTA, y ya cobró** | no se ve desde consola aquí, pero el registro del 09-09 demuestra que **el tope se alcanzó y tumbó la ingesta nueve días** |
| **R3** Upstash retira el «Eco mode» | ⏸️ **la decide el concepto** | el Jefe sacó Upstash del stack el 17-09; esto ya no es «elegir plan», es «apagarlo» |
| **R6** `VITE_API_URL` sin poner en Vercel | ✅ **SIN OBJETO** | el frontend ya no vive en Vercel y `apps/web/src/lib/api.ts` usa ruta relativa `/api`. Lo que lo sustituye es 66.2/66.3 |
| **A5** el techo de 200 USD de Anthropic no avisa | ❓ **de consola, sin verificar** | no se ve sin el panel de Anthropic |
| **A7** tarjeta Visa duplicada | ❓ **de consola, sin verificar** | idem, panel de facturación |

**Y la que tiene reloj**: la clave de Anthropic caduca el **1 de noviembre de
2026** — quedan **44 días** — y el aviso automático sigue sin construirse.

### 66.7 Lo que NO marco como defecto, porque está dicho

- **`PAUSA_ENTRE_TANDAS_MS` está en `5_000`**, con la cuenta del timeout escrita
  al lado (`gmail.service.ts:229`). El encargo de la Fase 8.1 **se ejecutó**.
  ⚠️ Pero el parte que @Claude me dejó en `scratch/mensaje_alana.txt` dice, en su
  punto 4, «el goteo **ya está configurado en 1000 ms**». **El código dice 5 s y
  el parte dice 1 s.** El código gana, y lo anoto porque Doc me había avisado de
  que un `1_000` aquí significaría «el encargo no se ejecutó»: **el parte, leído
  solo, me habría hecho abrir un hallazgo falso.**
- El histórico de correo **no se borra** (decisión del 09-11) y los contadores
  por pestaña **están ocultos a propósito**. No los toco.
- **Nada de la Fase 8 se ha ejecutado contra Gmail de verdad**, y ahora está
  medido: cero adjuntos, cero `company`, cero `bank` en la base (66.5).

### 66.8 Tres hechos más, medidos, que alguien debería querer saber

1. **La tabla `Task` está vacía: 0 filas.** También `Subtask`, `TimeEntry` y
   `Obra`. El respaldo de las 08:33 de hoy pesaba 1 124 854 bytes y el de las
   20:34, **1 084 875**: algo se borró hoy entre esas dos copias. Encaja con el
   «arranque limpio» que el Jefe decidió el 17-09 —las tareas se archivan, no se
   migran—, así que **lo registro como hecho, no como incidente**. Si nadie lo
   ordenó, es un incidente grave y hay copia de las 08:33 para volver.
2. **En la base hay tablas que no están en `schema.prisma`**: `user`, `session`,
   `account`, `organization`, `member`, `invitation`, `jwks`, `verification`
   (better-auth) y `project_config`. Todas vacías salvo `project_config` (1
   fila). **Dos esquemas de autenticación conviviendo en la misma base** es algo
   que conviene decidir antes de que el segundo tenga datos dentro.
3. **`TASKS.md` va dos fases por detrás del árbol**: sigue titulado «Fase 7» y su
   Bloque 0 sigue sin marcar, mientras el repositorio va por la 9.1. El plan
   escrito ya no dice lo que está pasando.

**No he cerrado nada y no he reparado nada.** Lo único que escribí fuera de este
cuaderno es la entrada del buzón de `PROMPT_ALANA.md`, que es mi entrega.
