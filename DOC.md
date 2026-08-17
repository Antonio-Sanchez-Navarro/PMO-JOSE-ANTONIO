# Bitácora de Project Management (Orchestrator / Doc)

**Estado Actual:** Fase 3 Completada & Blindada (Cero Deuda Técnica). Transición a Fase 4 (Alertas Proactivas y DLQ).
**Fecha de actualización:** 2026-08-14
**Ubicación de despliegue:** Tulum, Quintana Roo (America/Cancun)[cite: 2]

## 📌 1. Arquitectura de Gestión (El Estándar)

* **`API_CONTRACTS.md`:** Único punto de verdad para endpoints, WebSockets y modelos[cite: 2]. Ningún agente escribe instrucciones aquí[cite: 2].
* **`CLAUDE_MEMORY.md`:** Cerebro del Backend[cite: 2]. Refactorizaciones, variables de entorno, Cloud Run y lógica de Claude[cite: 2].
* **`GRAVITY_MEMORY.md`:** Cerebro Frontend/DevOps[cite: 2]. Estado de UI, despliegues Vercel y UI/UX de Gravity[cite: 2].
* **`ALANA.md`:** Memoria de Auditoría[cite: 2]. Guardiana del estado real, infraestructura, seguridad y fail-safes (En pausa durante inicio de Fase 4).
* **`DOC.md`:** (Este archivo)[cite: 2]. Memoria de alto nivel para el PM y la orquestación de agentes[cite: 2].

## 🧠 2. Mi Rol y Funciones en el Equipo

Como **Orquestador (Doc)**, mi responsabilidad es dirigir la sinfonía[cite: 2]:
* **Diseño de Arquitectura:** Definir CÓMO se comunican los sistemas (ej. escalar a cero con Pub/Sub + HTTP)[cite: 2].
* **Coordinación de Agentes:** Asignar las tareas correctas al especialista adecuado[cite: 2].
* **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas[cite: 2].
* **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal[cite: 2].

---

## 🏆 3. Hitos Recientes (Cierre Definitivo Fase 3) - 2026-08-14

* **El Misterio del Webhook Resuelto:** Se desactivó la "bomba de tiempo" del 20 de agosto. Gmail rechazaba la renovación del webhook con un error HTTP 400 (`Only one user push notification client allowed`). Claude implementó la solución definitiva llamando a `gmail.users.stop()` antes de `gmail.users.watch()` de forma idempotente.
* **Observabilidad Reparada:** Se descubrió que el logger descartaba los errores reales de la API de Google. Se creó el helper `describir-error.ts` para extraer `err.response.data.error` de `googleapis` y exponer la causa real de los fallos en Cloud Logging.
* **Deduplicación Segura:** Se corrigió una regresión grave en Redis. El `SET NX` se mantiene antes de encolar en BullMQ (para evitar *race conditions* de eventos simultáneos), pero ahora la clave se libera correctamente en el bloque `catch` si el encolado falla, evitando la pérdida de correos.
* **Cobertura Total (Deuda Saldada):** Se añadieron 385 líneas de pruebas unitarias verificando la observabilidad, la liberación de Redis y el orden `stop() -> watch()`. Pasamos a 569 pruebas en 25 suites, validadas revirtiendo el código para confirmar que las pruebas "muerden".

## 🚀 4. Lo que falta (Fase 4 y Backlog Técnico)

**Fase 4 Inmediata: Alertamiento Proactivo y DLQ (En curso)**
*Decisión de Producto:* El alcance se mantiene en `N=1` (desarrollo personal). Se descarta el modo multiusuario.

1. **Canal Oficial de Alertas:** Se utilizará **Google Chat** mediante un webhook entrante. Proporciona independencia de la ruta de fallo de OAuth de Gmail y evita tener que crear cuentas en plataformas de terceros.
2. **Seguridad de Credenciales:** La URL del webhook de Google Chat es una credencial sensible. Debe almacenarse en **Secret Manager** como `ALERT_WEBHOOK_URL` y nunca exponerse en código o variables planas.
3. **Alertas Capa 1 (Aplicación - Claude):** Creación del `AlertService` inyectado en eventos de fallo (Cron, DLQ, 5xx). Obligatorio el uso de un freno en Redis (`SET NX EX`) para deduplicar notificaciones en ráfaga.
4. **Alertas Capa 2 por Silencio (Infraestructura - Gravity):** "El vigía fuera de la muralla". La alerta de silencio total o caída de infraestructura debe residir fuera de Cloud Run (ej. Cloud Monitoring o un job en Scheduler), ya que un servidor caído no puede notificar que ha caído.
5. **Dead Letter Queue (DLQ):** Configurar tema muerto en Pub/Sub (`--dead-letter-topic`) con roles IAM (`publisher` para Pub/Sub, `subscriber` para la suscripción). Se fija `--max-delivery-attempts=5` para asegurar un *fail-fast* que dispare la alerta rápidamente sin perder el payload del correo.
6. **Limpieza de Variables:** Fijar `CLAUDE_MODEL_CLASSIFY` con una versión estable en GCP para silenciar warnings.

**Trámites Cancelados (Gran Victoria):**
* 🛑 **Verificación OAuth de Google:** Alana descubrió que al estar configurados como **Internos** en Google Workspace (`hd=zepto.com.mx`), **no aplica la caducidad de 7 días** de los refresh tokens ni se requiere verificación pública[cite: 2]. Este pendiente se elimina del backlog[cite: 2].

---

## 🚨 5. Reglas de coordinación que ya costaron un disgusto

* **Añadir por ruta, nunca `git add -A` o `git add .`:** Dos o más agentes escriben sobre el mismo árbol[cite: 2]. Un *add* masivo rompe las bitácoras y sube código no probado[cite: 2].
* **El campo `Estado` de un encargo lo pone solo Doc:** Ha fallado dos veces: trabajo entrando con el documento en pausa, y encargos pidiendo cosas ya entregadas[cite: 2].
* **Verificar en el código antes de dar una casilla por cerrada:** Nunca confiar ciegamente en el reporte sin evidencia (logs, HTTP 200 o el monitor en vivo)[cite: 2].