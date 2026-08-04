# Bitácora de Project Management (Doc & PM)

**Estado Actual:** Transición a Infraestructura GCP (Cloud Run / WIF)
**Fecha de actualización:** 2026-08-03

## Arquitectura de Gestión (El Nuevo Estándar)

* **`API_CONTRACTS.md`:** Único punto de verdad para endpoints, WebSockets y modelos. Ningún agente escribe instrucciones aquí.
* **`CLAUDE_MEMORY.md`:** Cerebro del Backend. Refactorizaciones, variables de entorno y lógica de Claude.
* **`GRAVITY_MEMORY.md`:** Cerebro Frontend/DevOps. Estado de UI, despliegues y comandos de infraestructura de Gravity.
* **`DOC.md`:** Memoria de alto nivel para el PM y el Asistente (Doc).

## Contexto Activo

* El CI/CD (`deploy.yml`) tiene una guarda para no fallar mientras los secretos de GCP no existan.
* Gravity tiene la orden de aprovisionar WIF y Cloud Run.

---

## Cómo se hizo la migración (2026-08-03)

`HANDOFF.md` **no se renombró tal cual**: se partió en dos, porque sus primeras
185 líneas no eran contratos sino la misión de DevOps activa de Gravity, con su
`Estado: TRABAJAR`. Renombrarlo entero habría metido instrucciones dentro del
archivo que este estándar declara libre de ellas, y habría dejado a Gravity sin
encargo escrito a mitad de trabajo.

| De | A |
|---|---|
| `HANDOFF.md` líneas 211–1281 (contratos, sockets, sondas, sesión) | `API_CONTRACTS.md` |
| `HANDOFF.md` líneas 1–210 (misión GCP + convenciones de trabajo) | `GRAVITY_MEMORY.md` |

Nada se perdió: `git log --follow API_CONTRACTS.md` sigue llevando al historial
completo de `HANDOFF.md`.

## Pendientes de decisión — para Doc

1. ⚠️ **`AI_ROLES.md` nombra `HANDOFF.md` como canal único de Gravity, y ese
   archivo ya no existe.** Hay que actualizar esa regla para que apunte a
   `GRAVITY_MEMORY.md`. `AI_ROLES.md` está modificado sin commitear desde el
   cambio de reparto, así que conviene cerrarlo de una vez.
2. **Las migraciones de Prisma no las corre el workflow.** El CLI está dentro de
   la imagen para poder ejecutarlas, pero el paso no se escribió porque depende
   de cómo se provisione Postgres, que sigue sin decidirse (hoy son dos
   contenedores de `docker-compose`). La opción que encaja es un Job de Cloud
   Run: el runner de GitHub no llega a Cloud SQL sin el Auth Proxy.
3. **Herramienta del copiloto para mover correos** (descartar, en proceso,
   completados) — anotada en el backlog de `TASKS.md`, pendiente de tu decisión.
   Va con confirmación humana obligatoria: un correo es texto de un desconocido
   y una herramienta que mueva sola es una puerta a la inyección de instrucciones.
4. **`MOCK_TASKS` como fallback del `catch` en `KanbanBoard.tsx`** — deuda de
   `apps/web` sin asignar, anotada en `GRAVITY_MEMORY.md`. Hoy Gravity está en
   la provisión y no debe tocar frontend, así que queda para el siguiente ciclo.
5. **Peso de la imagen**: 882 MB, de los que `googleapis` son 204 MB para usar
   solo Gmail. Cambiar a `@googleapis/gmail` ahorraría ~190 MB, pero es un
   cambio de código en varios archivos.

## Hitos del 2026-08-03

* **Primer CI en verde de la historia del proyecto** (`d653b5f`). Los tres
  motivos por los que nunca sirvió están saldados: rama, remoto y lint. Antes
  hubo tres runs seguidos en rojo, todos por el mismo `prisma generate` que
  faltaba.
* **`--max-warnings 0` encendido**, después de que Gravity saldara los 28 `any`.
* **Copiloto arreglado**: el segundo turno de cualquier conversación moría por un
  empate de fechas dentro de una transacción. Diagnóstico completo en
  `CLAUDE_MEMORY.md`.
* **Imagen y despliegue escritos y verificados** — construida, arrancada contra
  Postgres y Redis, y con el cierre ordenado comprobado.
* **Contratos de la API recuperados** de dos puntos del historial de git tras la
  reescritura que dejó `HANDOFF.md` en 10 líneas.

## Reglas de coordinación que ya costaron un disgusto

* **Añadir por ruta, nunca `git add -A`.** Dos agentes sobre el mismo árbol.
* **El campo `Estado` de un encargo lo pone solo Doc.** Ha fallado dos veces en
  los dos sentidos: trabajo entrando con el documento en pausa, y encargos
  pidiendo cosas ya entregadas.
* **Verificar en el código antes de dar una casilla por cerrada.** El commit de
  cierre del Sprint 4 marcó como hechas dos cosas que no lo estaban.
