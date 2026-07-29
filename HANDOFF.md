# Handoff — Sprint 5: Registro de tiempos

> **Estado: CERRADO** · actualizado por **Claude Code** el 2026-07-29
> **Asignado a:** nadie — a la espera de la planeación del Sprint 6
>
> El valor de este campo lo decide **solo Doc**. `TRABAJAR` = ponte con el encargo. `CERRADO` = el sprint ha concluido.
>
> **Sprint 5 terminado y verificado**, backend e interfaz, con la revisión manual
> del usuario sobre la app corriendo. Los contratos de abajo son los definitivos
> y se quedan aquí como referencia mientras se planifica el Sprint 6.

**Este archivo es tu única fuente de encargos.** Si algo no está escrito aquí, no es un encargo.

## Antes de nada: dos cosas que arreglé de lo tuyo

**1. El frontend no compilaba.** El cierre del Sprint 4 decía que "todos los
tests y builds están en verde"; `npm --workspace @pmo/web run build` fallaba con
dos errores. Los dejé arreglados en `ac32073` para poder seguir:

- `tags.api.ts` importaba `../../../lib/axios`, que no existe — **axios no es
  dependencia del frontend**. Lo reescribí con `fetch` y `credentials: 'include'`,
  como el resto de la capa de API. Si querías axios, hay que añadirlo a
  `package.json`, que es zona compartida y se avisa antes.
- `AiValidationModal` creaba la tarea nueva con `priority: 'MEDIUM'` en crudo, y
  `ProposedTask.priority` es el enum `TaskPriority`.

**Mira el build antes de dar un sprint por cerrado**: `npm run build` en la raíz
compila los tres paquetes.

**2. Las etiquetas se colgaban sin mirar de quién eran.** En
`emails.service.ts` metiste `tagIds` directo a `connect`. Con un id inventado
Prisma reventaba dentro de la transacción con un error opaco, y con el id de
otra persona la etiqueta ajena acababa colgada de la tarea. Corregido en
`a266111` con la misma comprobación que ya hacía `POST /tasks`
(`TagsService.resolveIds`, que devuelve **400** diciendo qué ids fallan).

Ahí va también algo que te sirve: **las tarjetas creadas desde la cuarentena
vuelven con sus `labels`**, igual que las de `POST /tasks`. Antes la respuesta
201 y el `task.created` llegaban sin los colores que la persona acababa de
elegir.

Y recuerda **`modules/emails/` es de Claude** (excepción escrita en
`AI_ROLES.md`): si necesitas otro campo, pídelo en vez de tocarlo.

---

## Cambio de contrato del 2026-07-29: la bandeja ya no retrocede sola

`PATCH /emails/:id/status` **te va a devolver un 409 nuevo**. Léelo antes de
tocar la bandeja.

Encargo del usuario: la regla es que un correo ya despachado —`IN_PROGRESS`,
`COMPLETED` o `DISMISSED`— **no vuelve a `PENDING` por las buenas**, porque si
bastara un clic descuidado para que reapareciera trabajo dado por cerrado, el
"Inbox Zero" dejaría de significar nada. Y él necesita poder saltársela cuando
lo decide.

```json
{ "status": "PENDING", "force": true }
```

- Sin `force`, reabrir da **409** con el mensaje que dice qué hacer.
- Con `force`, **200**, y queda un `Reapertura forzada` en el log de la API: es
  el único rastro de una decisión que salta la regla.
- **Todo lo demás sigue igual**: avanzar de pendiente a hecho, rectificar entre
  estados despachados o volver a marcar el que ya estaba así no piden nada.
  Marcar como pendiente lo que **ya** estaba pendiente tampoco: no reabre nada.
- Reabrir **no** borra las tareas que el correo generó ni toca `processedAt`.
  Que el worker lo analizara sigue siendo verdad aunque su dueño lo devuelva a
  la bandeja.

**Aviso, que esto te toca a ti**: la restricción que el cierre del Sprint 4 daba
por hecha ("validación en el backend y frontend") **no existía en ninguno de los
dos lados**. En el backend `updateStatus` escribía cualquier estado sin mirar el
anterior; ya está implementada y probada. En el frontend lo que no existe es lo
contrario: **no hay ningún botón que mande `PENDING`**, así que desde el
navegador no se puede reabrir un correo aunque la API ya lo permita.

**Tu encargo**: un botón "Devolver a pendientes" en la fila del correo, visible
cuando su `status` no sea `PENDING`, que mande `{ status: 'PENDING', force: true
}`. El 409 no lo verás si mandas el `force`, pero enseña su `message` igual que
haces con los demás: si mañana la regla cambia, el mensaje del servidor será el
que explique por qué.

---

## Lo que ya está hecho del Sprint 5 (backend)

El módulo que empezaste (`modules/time/`) lo completé y lo endurecí, **sin
cambiarte las rutas**: `POST /time/:taskId/start` y `POST /time/:taskId/stop`
siguen siendo las que llama tu `time.api.ts`. Lo que cambió por dentro:

- **Un solo cronómetro por persona lo arbitra la base**, no un `findFirst`. Hay
  una columna centinela `TimeEntry.activeFor` con índice único: lleva el
  `userId` mientras el fichaje corre y `null` cuando se cierra. Dos pestañas
  pulsando play a la vez pasaban las dos por la comprobación y acababan con dos
  relojes contando; ahora la segunda recibe **409**. _Verificado contra Postgres:
  el segundo insert activo lo rechaza el índice y los cerrados no molestan._
- **Los eventos salen por el gateway** (`emitTimeStarted` / `emitTimeStopped` /
  `emitTimeDeleted`) y no por `gateway.server.to(...)` a pelo. Así respetan el
  `X-Socket-Id` igual que las tareas y los correos, dejan rastro en el log y no
  tumban la petición HTTP si el socket falla.
- **El cambio de tarea es atómico**: cerrar el anterior y abrir el nuevo van en
  la misma transacción. Sueltos, un fallo en medio dejaba el tiempo anterior
  contando sobre una tarea que ya nadie mira.
- **Play sobre la tarea que ya corría devuelve el fichaje que había**, no abre
  otro: el doble clic no parte el tramo en dos.

### El contrato, endpoint por endpoint

Todo bajo `/time`, todo con cookie de sesión (**401** sin ella) y todo
respetando `X-Socket-Id` — mándalo siempre, que ya tienes la respuesta y el eco
solo te haría repintar.

Un `TimeEntry` se ve así (con su tarea dentro, para que puedas pintar sin
cruzar nada):

```json
{
  "id": "cmt...",
  "taskId": "cmr...",
  "userId": "cmr...",
  "startedAt": "2026-07-29T10:00:00.000Z",
  "endedAt": null,
  "durationSec": null,
  "note": null,
  "activeFor": "cmr...",
  "task": { "id": "cmr...", "title": "Escrituración Lote 36" }
}
```

`endedAt` y `durationSec` son `null` **mientras corre**; al pararlo se rellenan
los dos. `activeFor` es fontanería nuestra: ignóralo para pintar.

| Verbo y ruta | Qué hace |
|---|---|
| `POST /time/:taskId/start` | **201** con el fichaje. Cuerpo opcional `{ "note": "…" }`. Si ya corría sobre esa tarea devuelve el mismo; si corría sobre otra, la cierra y abre esta. **404** si la tarea no es tuya · **409** si otra pestaña ganó la carrera |
| `POST /time/:taskId/stop` | **200** con el fichaje cerrado. **409** si esa tarea no tenía ninguno en marcha |
| `POST /time/stop` | Igual, pero detiene **el que esté corriendo**, sea de la tarea que sea. Es el botón global de "parar" |
| `GET /time/active` | El fichaje en marcha o **`null`**. Pídelo al montar: recargar la página no debería perder de vista un reloj que sigue corriendo en la base |
| `GET /time/entries` | Los fichajes, del más reciente al más antiguo. Filtros: `?taskId=`, `?from=`, `?to=`, `?skip=`, `?take=` (50 por defecto, tope 200) |
| `POST /time/entries` | Tramo apuntado a mano: `{ taskId, startedAt, endedAt, note? }`, las dos fechas en ISO. **201**. Nace cerrado, así que no interfiere con el cronómetro |
| `PATCH /time/entries/:id` | Corrige `startedAt`, `endedAt` o `note`. **200** con el fichaje ya recalculado |
| `DELETE /time/entries/:id` | **204** sin cuerpo |
| `GET /time/report` | Sumas. `?groupBy=task\|day\|week` (por defecto `task`), `?from=`, `?to=` |

Detalles que te ahorran sorpresas:

- **400** si un tramo acaba antes de empezar (o en el mismo instante), y **400**
  si el `PATCH` va sin ningún campo: corregir un fichaje es una decisión
  explícita.
- **`taskId` no se puede cambiar** en el `PATCH`. Mover un tramo de una tarea a
  otra falsearía el informe de las dos; para eso se borra y se apunta donde toca.
- Poner `endedAt` con el `PATCH` sobre el fichaje **que está corriendo lo cierra
  de verdad** — libera el centinela y calcula la duración. Es el caso de "me
  olvidé de pararlo ayer".
- Los rangos `from`/`to` son **cerrados por abajo y abiertos por arriba**, para
  que dos rangos consecutivos no cuenten dos veces el mismo tramo.

El informe responde así:

```json
{
  "groupBy": "task",
  "from": null,
  "to": null,
  "totalSec": 4200,
  "rows": [
    { "key": "cmr...", "label": "Escrituración Lote 36", "seconds": 3600 },
    { "key": "cmr...", "label": "Remitir KYC", "seconds": 600 }
  ]
}
```

Con `groupBy=task` el `key` es el id de la tarea y el `label` su título, ya
ordenado de más a menos tiempo. Con `day` o `week`, los dos son la fecha en
`YYYY-MM-DD` (en semanas, el lunes), en orden cronológico. `rows` está pensado
para entrar tal cual en la gráfica.

**Dos avisos sobre los números**:

1. **El informe solo cuenta fichajes cerrados.** El que está corriendo aún no
   tiene duración, y estimarla haría que dos lecturas seguidas del mismo informe
   dieran cifras distintas. Si quieres enseñar "lo de hoy incluyendo lo que va
   corriendo", suma en el cliente el reloj vivo, que ya tienes en
   `GET /time/active`.
2. **Los días y las semanas se cortan en UTC**, que es como Postgres guarda las
   marcas. Con husos alejados, un tramo de última hora puede caer en el día
   siguiente. Si el dashboard necesita el huso local, pídemelo: se pasa la zona
   como parámetro, no se reinterpreta en el cliente.

### Eventos de socket — por el que ya tienes

Van por el **mismo socket** de `useSocket`, como `email.updated`:

| Evento | Cuándo |
|---|---|
| `time.started` | Arrancó un cronómetro |
| `time.stopped` | Se detuvo, o se apuntó o corrigió un tramo a mano |
| `time.deleted` | `{ id, taskId, userId }` — se borró un fichaje: resta ese tramo del total de la tarjeta |

`time.started` y `time.stopped` llevan el fichaje entero, con su `task` dentro.
Ojo con un caso que sí verás: **cambiar de tarea emite los dos**, primero el
`time.stopped` del anterior y luego el `time.started` del nuevo.

---

## El Sprint 5 está cerrado — no queda encargo abierto

Lo que en la versión anterior de este archivo eran cuatro encargos tuyos está
hecho y comprobado el 2026-07-29:

1. **Cronómetro de la tarjeta** — `TaskCard` con reloj y botón (`d73637f`).
2. **Entradas manuales** — `TimeEntriesModal.tsx` (`a431022`).
3. **Gráfica de tiempos** — `TimeReportModal.tsx` con `BarChart` de Recharts
   (`a431022`). Recharts `^3.10.1` quedó en `apps/web/package.json` con el
   `package-lock.json` al día. _Aviso sin urgencia: el bundle pasó de 411 kB a
   794 kB y Vite ya lo comenta. Cuando toque, se parte con `import()` dinámico._
4. **Botón "A Pendientes"** — `c768db7`, mandando `{ status: 'PENDING',
   force: true }`. Comprobado que el `force` viaja en el cuerpo y no se queda en
   el cliente.
5. **La E2E de las dos pestañas**, pendiente desde el Sprint 4, la dio por buena
   el usuario en su revisión manual del mismo día.

**Dos casillas que hubo que reabrir.** El commit de cierre `697784b` marcó
además el *panel de auditoría de prioridad* y los *filtros por etiqueta y
fecha*. Ninguna de las dos está hecha —lo dicen sus propias notas, y hoy lo
comprobé en el código: no hay nada de auditoría en `apps/web` y
`query-tasks.dto.ts` no tiene filtro de etiqueta ni de fechas— y ninguna
pertenece al Sprint 4.5 ni al 5, que era lo que se cerraba.

Por decisión del usuario ese mismo día, **se aceptan como deuda**: siguen
abiertas, pero fuera de sus sprints, en la sección
**[DEUDA TÉCNICA — Sprints anteriores]** al final de `TASKS.md`, con lo que
falta de cada una escrito para poder retomarlas sin volver a investigarlas. Así
el sprint en curso queda libre y las dos siguen a la vista.

No hace falta que las hagas ahora: las prioriza quien planifique el Sprint 6.
El panel de auditoría, cuando llegue, es de los dos — exponer el motivo en el
contrato es mío, pintarlo en la tarjeta es tuyo.

---

## Nota de coordinación — chocamos en `apps/api` esta mañana

Mientras yo escribía el módulo de tiempos, tú escribías otro con el mismo nombre
y en la misma carpeta. No se perdió nada, pero fue por poco: **`modules/time/`
era backend, o sea dominio mío**, igual que `emails/`.

Lo que hice fue quedarme con **tus rutas** y reescribir la implementación, para
no romper el `time.api.ts` que ya tenías escrito. Tu `GET /tasks` con
`totalTimeSec` se queda como está; le añadí las pruebas que le faltaban (dos
tarjetas del `findAll` se caían con `task.timeEntries is not iterable`).

Para la próxima: si el backend te bloquea, **pídelo aquí** en vez de escribirlo.
Es más rápido que deshacer un choque.

---

## Estado del repo

- `293 pruebas en 9 suites`, todas en verde. Build de los tres paquetes, en
  verde, ya con Recharts dentro.
- Migración `20260729153000_add_time_tracking` aplicada.
- La API y Vite están levantados. Recuerda: **un solo `dev:api` a la vez**
  (ver `AI_ROLES.md`, notas de operación).

---

# Histórico

## Sprint 4 — cerrado el 2026-07-29

Etiquetas del usuario (`Tag` + `TagManagerModal`), cuarentena de IA con edición
completa, máquina de estados de correos (Inbox Zero) y tarjetas que pintan las
etiquetas de la persona junto a las que extrae el modelo.

Contratos que siguen vigentes y no se repiten aquí: `GET /emails`,
`GET /emails/:id`, `PATCH /emails/:id/status`, `POST /emails/:id/classify`,
`POST /emails/:id/to-task`, `GET`/`POST /tags`, `GET /auth/me` y
`GET /gmail/inbox`. Están en el histórico de este archivo en git
(`git show 7232c17:HANDOFF.md`) y en `TASKS.md`, sprint por sprint.

**Esquema de sesión** (vigente desde el Sprint 1): dos cookies httpOnly con
`path: "/"` — `pmo_session` (JWT de acceso, 15 min) y `pmo_refresh` (JWT de
refresco, 30 días). Ante un 401 el frontend renueva con `POST /auth/refresh`;
`POST /auth/logout` borra las dos. El claim `typ` impide que un refresco se use
como token de acceso, y el socket exige `typ: access` en su handshake.
