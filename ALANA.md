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
