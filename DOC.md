# Bitácora de Project Management (Orchestrator / Doc)

**Estado Actual:** Fase 3 Completada & Blindada (Cero Deuda Técnica). Transición a Fase 4 (Alertas Proactivas y DLQ). Operación de BullMQ optimizada.
**Fecha de actualización:** 2026-08-18
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
* **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas.
* **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal.

---

### 🏆 3. Hitos Recientes (Cierre Definitivo Fase 4) - 2026-08-19

* **Simulacro de Restauración (Fuego Real):** La bóveda fue probada empíricamente. El job autónomo restauró el volcado desde el bucket hacia una base efímera, recuperando exactamente 394 filas de datos reales.
* **Superficie de Ataque Erradicada:** El proyecto temporal en Neon fue destruido permanentemente. La IP pública de Cloud SQL fue sellada al vaciar por completo las redes autorizadas.
* **IaC de Respaldos Saneada:** El job de respaldos (`pmo-respaldo-db`) ahora nace del pipeline en `deploy.yml`, validando que las banderas correctas operen desde el código y no desde la consola.

---

## 🚀 4. Lo que falta (Fase 5: Operaciones Finales y Saneamiento)

**Decisión de Producto:** La integración con WhatsApp (Sprint 7) queda relegada al final absoluto de la cola para evitar abrir cajas de Pandora con terceros antes de blindar la operativa interna.

**Objetivos Inmediatos (Frente DevOps):**

1. **Vigilancia del Job de Respaldo:** Actualmente, si el autómata de backups falla, nadie se entera porque la Capa 2 solo vigila la ingesta. Se debe implementar una alerta que vigile la ejecución de los respaldos.
2. **Saneamiento del Pipeline Frontend (Vercel):** Vercel está redesplegando el frontend con cada actualización de bitácora `.md`. Se debe configurar el `paths-ignore` equivalente en Vercel para detener el ruido.

## 🚨 5. Reglas de coordinación que ya costaron un disgusto

* **Añadir por ruta, nunca `git add -A` o `git add .`:** Dos o más agentes escriben sobre el mismo árbol. Un *add* masivo rompe las bitácoras y sube código no probado.
* **Preguntar "¿por qué?" en lugar de "¿está?":** Lección aprendida de los falsos positivos (ej. el fallo de encoding del `.gitignore`).
* **El campo `Estado` de un encargo lo pone solo Doc:** Ha fallado dos veces: trabajo entrando con el documento en pausa, y encargos pidiendo cosas ya entregadas.
* **Verificar en el código antes de dar una casilla por cerrada:** Nunca confiar ciegamente en el reporte sin evidencia (logs, HTTP 200 o el monitor en vivo).

