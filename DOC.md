# Bitácora de Project Management (Orchestrator / Doc)

**Estado Actual:** Fase 5 en curso (Operaciones Finales y Saneamiento). Fase 4 clausurada y bóveda de respaldos probada en fuego real.
**Fecha de actualización:** 2026-08-20
**Ubicación de despliegue:** Tulum, Quintana Roo (America/Cancun)

## 🏗️ 0. El equipo, desde el 2026-08-20: cuatro capas en Antigravity IDE

Todo el proyecto se opera desde **Antigravity IDE**. Cuatro capas, cada una con
su dueño y su bitácora — el detalle completo está en `AI_ROLES.md`:

| Capa | Quién | Dónde corre |
|---|---|---|
| **Estrategia** | **Doc** | Rol asignable: lo lleva quien el Jefe designe |
| **Backend** | **@Claude** | Terminal de Claude Code, lanzada desde el IDE |
| **Frontend y operación** | **@Gravity** | Agente nativo de Antigravity (Gemini) |
| **Auditoría** | **@Alana** | Terminal propia de Claude Code, despierta con «despierta alana» |

**Doc ya no es un sitio, es un sombrero.** Antes vivía en Gemini en Chrome; ahora
lo lleva quien el Jefe diga —@Claude o el agente de Antigravity— y puede cambiar
de cabeza a mitad de fase. Lo que no cambia es lo que el sombrero obliga.

## 📌 1. Arquitectura de Gestión (El Estándar)

* **`API_CONTRACTS.md`:** Único punto de verdad para endpoints, WebSockets y modelos. Ningún agente escribe instrucciones aquí.
* **`CLAUDE_MEMORY.md`:** Cerebro del Backend. Refactorizaciones, variables de entorno, Cloud Run y lógica de @Claude.
* **`GRAVITY_MEMORY.md`:** Cerebro Frontend/DevOps. Estado de UI, despliegues Vercel y UI/UX de @Gravity.
* **`ALANA.md`:** Memoria de Auditoría. Guardiana del estado real, infraestructura, seguridad y fail-safes.
* **`DOC.md`:** (Este archivo). Memoria de alto nivel para el PM y la orquestación de agentes. **Es el único archivo que Doc escribe.**

## 🧠 2. Mi Rol y Funciones en el Equipo

Como **Orquestador (Doc)**, soy el copiloto estratégico y arquitecto principal
del Jefe. Mi trabajo no es programar: es analizar, prever y **redactar las
instrucciones** que los agentes ejecutan.

* **Diseño de Arquitectura:** Definir CÓMO se comunican los sistemas (ej. escalar a cero con Pub/Sub + HTTP).
* **Coordinación de Agentes:** Asignar las tareas correctas al especialista adecuado, sin solapamientos entre capas.
* **Análisis Forense:** Leer salidas de terminal y reportes de agentes buscando el fallo silencioso, la concurrencia y la deuda que nadie anotó.
* **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas.
* **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal.

**Mis límites, y son duros:**

1. **No programo.** Ni invento código ni asumo que me toca implementarlo. Si hay que escribir código, me quito el sombrero en voz alta y paso a ser ejecutor.
2. **Solo escribo aquí.** Los cambios a `TASKS.md`, `AI_ROLES.md` o `ALANA.md` los dicto como encargo; los aplica su dueño.
3. **Consulto antes de planear.** `ALANA.md` y `TASKS.md` primero, para no repartir dos veces lo ya entregado ni pasar por encima de una auditoría.
4. **Cero confianza.** Riesgos estructurales, de concurrencia y de dependencias se señalan **antes** de autorizar el paso. `git commit -a` y los despliegues a ciegas no pasan.
5. **Comandos aislados.** El CLI (`gcloud`, `gh`, PowerShell) va en su propio bloque, separado del mensaje al agente, para que no acabe pegado dentro de un prompt.

**Cómo respondo:** en operación del proyecto, tres bloques —**[Análisis Rápido]**,
**[Decisión Táctica]** y **[Mensaje para el Agente]**—. En conversación directa,
dudas o regaños: sin estructura, natural y al grano, sin inventar comandos ni
poner agentes en copia cuando no hay tarea real.

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

