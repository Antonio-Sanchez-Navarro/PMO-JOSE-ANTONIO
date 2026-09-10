# PMO Dashboard — Plan de Desarrollo (Fase 7)

> El historial de Sprints 0-8 y Fases 4-6 ha sido movido a `docs/archive/TASKS_archive.md` tras el éxito de la Fase 6.
> Este documento centraliza exclusivamente el trabajo vivo.

Leyenda de prioridad: 🔴 crítica · 🟡 alta · 🟢 normal

---

## Fase 7 — Interfaz de Carga de Trabajo Humana (Atasco de los 728)

**Contexto:** Al terminar la Fase 6, se descubrieron **728 correos pendientes (`PENDING`)** en la base de datos de producción. El sistema técnico está sano y el bucle drena correctamente; estos correos están estancados en espera de una decisión humana.

**Objetivo de la Fase:** Proveer a los usuarios (Jefe) de una interfaz y un flujo de trabajo para despachar esta deuda humana rápidamente, ya sea mediante archivado masivo o aprobación por lotes.

### Bloque 0 — Reconocimiento y Definición de Alcance (Data-Driven)
*Antes de diseñar ninguna interfaz, necesitamos medir la forma de los 728 correos.*

- [ ] 🔴 **Radiografía de los 728:** (Requiere acceso a BD de prod)
  - Medir cuántos tienen `isActionable: false`.
  - Medir cuántos tienen `proposedTasks` en cuarentena.
  - Medir la antigüedad de la cola (fecha de corte).
- [ ] 🔴 Definir alcance exacto de la Fase 7 en base a los números:
  - *Si mayoría es `isActionable: false`:* Implementar filtro y archivado masivo.
  - *Si mayoría es `proposedTasks`:* Implementar aprobación por lotes en el modal.
  - *Si son muy antiguos:* Definir fecha de corte e invalidar/archivar los previos a X fecha.
- [ ] 🟡 **Gestión de adjuntos (Backfill):** `hasAttachments` nació por defecto en `false` y no tiene relleno hacia atrás. Si el despacho requiere ver adjuntos, diseñar un backfill.

### Bloque 1 — Ejecución del Alcance 
*(A definirse tras completar Bloque 0)*
- [ ] 🔴 (Pendiente de definición técnica y UI)

---

## Deuda Técnica / Mantenimiento Continuo
- [ ] 🔴 **Recordatorio Crítico:** Rotar API Key de Anthropic (`sk-ant-...`) y actualizar Secret Manager antes del **1 de Noviembre de 2026** para evitar caída del sistema de clasificación.
- [ ] 🟡 **C12 (Protección de Ramas):** Definir y configurar si pasamos a un esquema de PRs para los commits de código (excluyendo commits de bitácoras) para aplicar el Status Check obligatorio de CI.
