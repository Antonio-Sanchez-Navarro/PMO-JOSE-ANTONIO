# Bitácora de Project Management (Orchestrator / Doc)

**Estado Actual:** Fase 3 Completada (Tubería IA + Pub/Sub). Transición a Fase 4 (OAuth & Backups).
**Fecha de actualización:** 2026-08-12
**Ubicación de despliegue:** Tulum, Quintana Roo (America/Cancun)

## 📌 1. Arquitectura de Gestión (El Estándar)

* **`API_CONTRACTS.md`:** Único punto de verdad para endpoints, WebSockets y modelos. Ningún agente escribe instrucciones aquí.
* **`CLAUDE_MEMORY.md`:** Cerebro del Backend. Refactorizaciones, variables de entorno, Cloud Run y lógica de Claude.
* **`GRAVITY_MEMORY.md`:** Cerebro Frontend/DevOps. Estado de UI, despliegues Vercel y UI/UX de Gravity.
* **`ALANA.md`:** Memoria de Auditoría. Guardiana del estado real, infraestructura, seguridad y fail-safes.
* **`DOC.md`:** (Este archivo). Memoria de alto nivel para el PM y la orquestación de agentes.

## 🧠 2. Mi Rol y Funciones en el Equipo

Como **Orquestador (Doc)**, mi responsabilidad es dirigir la sinfonía:
* **Diseño de Arquitectura:** Definir CÓMO se comunican los sistemas (ej. escalar a cero con Pub/Sub + HTTP).
* **Coordinación de Agentes:** Asignar las tareas correctas al especialista adecuado.
* **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas que resuelvan choques de directrices (ej. separación de Service Accounts para Scheduler y Pub/Sub).
* **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal.

---

## 🏆 3. Hitos Recientes (Cierre Fases 1, 2 y 3) - 2026-08-12

* **Infraestructura Serverless:** Cloud Run ahora escala a cero (`min-instances=0`). La ingesta de Gmail ocurre vía notificaciones Push de Pub/Sub validadas por OIDC.
* **Flujo IA en Producción:** La tubería completa está operativa (Gmail → Pub/Sub → Worker → Anthropic → Neon DB). La IA demostró capacidad de desglosar 1 correo complejo en múltiples tareas accionables.
* **Observabilidad y WIF:** El frontend de Vercel consume datos en tiempo real (WebSockets). Se instrumentaron los webhooks para atrapar avisos de control de Google sin generar errores falsos.
* **Fail-Safe del Copiloto:** Si faltan variables de entorno, el envío de correos arranca en modo **SIMULADO**, protegiendo al proyecto de enviar spam accidental.
* **Crons de Tulum:** Cloud Scheduler reemplazó a BullMQ para tareas programadas (barrido de vencidas y renovación del watch de Gmail), operando bajo la zona horaria `America/Cancun` (UTC-5).

## 🏛️ 4. Memoria Histórica (Cómo se hizo la migración original)

`HANDOFF.md` no se renombró tal cual: se partió en dos, porque sus primeras 185 líneas no eran contratos sino la misión de DevOps activa.
* `HANDOFF.md` líneas 211–1281 (contratos, sockets, sondas, sesión) → Pasaron a `API_CONTRACTS.md`.
* `HANDOFF.md` líneas 1–210 (misión GCP + convenciones) → Pasaron a `GRAVITY_MEMORY.md`.

## 🚀 5. Lo que falta (Fase 4 y Backlog Técnico)

**Fase 4 Inmediata:**
1. **Verificación OAuth de Google:** La pantalla de consentimiento sigue en "Prueba", lo que hace que los tokens de Gmail caduquen a los 7 días. Requiere trámite formal en GCP.
2. **Backups en Neon DB:** Configurar política de retención y copias de seguridad de la base de datos de producción (PostgreSQL).

**Backlog de Deuda Técnica / UX (Pendientes de decisión):**
3. ⚠️ **Deduplicación en Pub/Sub:** Google envía 2 notificaciones por evento; la idempotencia lo absorbe, pero duplica lecturas en Redis innecesariamente (Identificado en Fase 3).
4. **Herramienta del copiloto para mover correos:** Pendiente de implementación con confirmación humana obligatoria.
5. **Peso de la imagen (Optimización):** `googleapis` pesa 204 MB. Cambiar a `@googleapis/gmail` ahorraría ~190 MB de RAM en Cloud Run.
6. **UX de Conversión:** Evitar error `409 Conflict` ocultando/deshabilitando el botón de "Convertir a Tarea" si la IA ya lo procesó.
7. **Fallback MOCK_TASKS:** Resolver el `catch` en `KanbanBoard.tsx` (Deuda de UI sin asignar).

---

## 🚨 6. Reglas de coordinación que ya costaron un disgusto

* **Añadir por ruta, nunca `git add -A` o `git add .`.** Dos o más agentes escriben sobre el mismo árbol. Un *add* masivo rompe las bitácoras y sube código no probado.
* **El campo `Estado` de un encargo lo pone solo Doc.** Ha fallado dos veces: trabajo entrando con el documento en pausa, y encargos pidiendo cosas ya entregadas.
* **Verificar en el código antes de dar una casilla por cerrada.** Nunca confiar a ciegas en el reporte de un agente sin evidencia (logs, HTTP 200, visualización de DB).