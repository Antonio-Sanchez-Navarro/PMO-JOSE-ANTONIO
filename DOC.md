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
* **`DOC.md`:** (Este archivo). Memoria de alto nivel para el PM y la orquestación de agentes.
* **`PROMPT_CLAUDE.md` · `PROMPT_GRAVITY.md` · `PROMPT_ALANA.md`:** **El canal de órdenes de Doc.** Encargo en curso, campo `Estado` y notas de operación. **Locales a cada terminal y fuera de git** (`.gitignore`).

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

* **Diseño de Arquitectura:** Definir CÓMO se comunican los sistemas (ej. escalar a cero con Pub/Sub + HTTP).
* **Coordinación de Agentes:** Asignar las tareas correctas al especialista adecuado, sin solapamientos entre capas.
* **Análisis Forense:** Leer salidas de terminal y reportes de agentes buscando el fallo silencioso, la concurrencia y la deuda que nadie anotó.
* **Resolución de Bloqueos:** Analizar errores en cadena y tomar decisiones ejecutivas.
* **Guía Humana:** Darte instrucciones quirúrgicas para ejecutar comandos de infraestructura (`gcloud`, `gh`) de forma segura en tu terminal.

**Mis límites, y son duros:**

1. **No programo.** Ni invento código ni asumo que me toca implementarlo. Si hay que escribir código, me quito el sombrero en voz alta y paso a ser ejecutor.
2. **Escribo aquí y en los prompts.** `PROMPT_CLAUDE.md`, `PROMPT_GRAVITY.md` y `PROMPT_ALANA.md` son mi canal de órdenes: locales a cada terminal, en `.gitignore`, fuera de git. **De las bitácoras no toco una línea** — son la evidencia de lo que hizo cada agente y las escribe su dueño. Los cambios a `TASKS.md` o `API_CONTRACTS.md` los dicto como encargo. *(Regla del Jefe el 2026-08-20, después de que yo escribiera encargos dentro de dos bitácoras en una sola tarde. Ver abajo.)*
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

1. **Vigilancia del Job de Respaldo:** ✅ **Implementada, ⬜ sin firmar.** La política vive como archivo en `infra/alert_policy_respaldo.json` con sus dos condiciones (fallo y ausencia, `combiner: OR`) y la cadencia se dobló a `30 3,15 * * *` porque Cloud Monitoring topa la ventana de ausencia en 23 h 30 m. **Lo que falta no es código: es el fuego real.** Nadie ha visto sonar la política. La Capa 1 de la Fase 4 se firmó porque sonó sola, no porque estuviera escrita; esta se firma igual o no se firma.
2. **Saneamiento del Pipeline Frontend (Vercel):** ✅ **FIRMADO el 2026-08-20**, con prueba en fuego real. El commit de solo `.md` `e031dee` devuelve **`Canceled by Ignored Build Step`**. La fuga está cerrada.

   **Lo que costó, y es la parte que hay que recordar.** El comando era correcto desde `580d2cb`; el archivo estaba en el sitio equivocado. Con **Root Directory = `./`**, Vercel lee `vercel.json` de la **raíz del monorepo**, y el nuestro vivía en `apps/web/`, donde nadie lo abría. Tres correcciones seguidas sobre un fichero inerte. Movido a la raíz en `adad87d`, con **una sola clave** — `buildCommand`, `outputDirectory` e `installCommand` siguen viniendo del panel, que es lo que evita repetir el destrozo del 2026-08-07.

   **Dónde se mira esto, porque el panel miente.** La lista de despliegues trae un filtro por defecto (`Status 6/7`) que **excluye `Canceled`**: los saltados existen y la vista no los enseña. De ahí el «ninguno se salta jamás» que sostuvimos cuatro rondas. El dato limpio está en el estado que Vercel publica en GitHub:

   ```bash
   gh api repos/Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO/commits/<sha>/status --jq '.statuses[].description'
   ```

   Ni el manifiesto de artefactos ni la duración sirven: un build saltado reutiliza la salida del anterior, así que enseña los **mismos bytes** que uno real.

   **Y un error mío, anotado para no repetirlo:** descarté la pregunta del Root Directory —«con `:(top)` la respuesta deja de importar»— y era la pregunta que decidía todo. Hice robusto el pathspec de un archivo que nadie leía. **Antes de arreglar cómo se ejecuta algo, comprueba que se ejecuta.**

**Registro de estado (2026-08-20, verificado en `git log`, no en reporte):**

| Qué | Dónde | Estado |
|---|---|---|
| Deuda de frontend de Fase 5 (concurrencia del Inbox, URL de socket por `VITE_API_URL`, roles ARIA anidados, muerte de `mockTasks.ts`) | `251d60e` | ✅ entregado por @Gravity |
| `vercel.json` — fuga de builds por `.md` | `251d60e` → `580d2cb` → `adad87d` (a la raíz) | ✅ **firmado**: `e031dee` sale `Canceled by Ignored Build Step` |
| Política de alerta del respaldo | `285e3a2`, `ad1fe4c` | ⚠️ escrita, sin sonar |
| Capa 1 (portero CRLF + espejo en CI) y Capa 3 / simulacro mensual | — | ⬜ sin empezar, de @Claude al cerrar la Fase 5 |

## 🚨 5. Reglas de coordinación que ya costaron un disgusto

* **Añadir por ruta, nunca `git add -A` o `git add .`:** Dos o más agentes escriben sobre el mismo árbol. Un *add* masivo rompe las bitácoras y sube código no probado.
* **Preguntar "¿por qué?" en lugar de "¿está?":** Lección aprendida de los falsos positivos (ej. el fallo de encoding del `.gitignore`).
* **El campo `Estado` de un encargo lo decide solo Doc:** Ha fallado dos veces: trabajo entrando con el documento en pausa, y encargos pidiendo cosas ya entregadas. **Desde el 2026-08-20, con Doc escribiendo solo en este archivo, el valor lo dicta Doc y lo transcribe el dueño de la bitácora.** El ejecutor no lo elige; lo copia.
* **Un estado verificado caduca en cuanto alguien actúa sobre él:** lección de @Alana el 2026-08-20, que publicó una propuesta de tres capas y descubrió que la Capa 2 se había entregado mientras la escribía. Antes de publicar cualquier cosa que describa el estado del sistema, `git log` otra vez.
* **Verificar en el código antes de dar una casilla por cerrada:** Nunca confiar ciegamente en el reporte sin evidencia (logs, HTTP 200 o el monitor en vivo).

