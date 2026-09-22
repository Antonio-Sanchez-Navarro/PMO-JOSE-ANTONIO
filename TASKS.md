# PMO Dashboard — Plan de Desarrollo (Fase 9.1)

> El historial de Sprints 0-8 y Fases 4-7 ha sido movido a `docs/archive/TASKS_archive.md` tras el éxito de la Fase 7.
> Este documento centraliza exclusivamente el trabajo vivo.

Leyenda de prioridad: 🔴 crítica · 🟡 alta · 🟢 normal

---

## Fase 9.1 — Mantenimiento Operativo y Resolución de Deuda Crítica

**Contexto:** El sistema se encuentra en producción, habiéndose superado el embotellamiento del Linter y desplegando exitosamente la revisión actual. Claude ha implementado un sistema automático de alertas de caducidad para Anthropic y el backend fue ajustado para manejar las exclusiones del prefijo `/api` sobre webhooks.

**Objetivo de la Fase:** Asegurar que los componentes críticos de infraestructura estén monitoreados (Anthropic, Upstash), asegurar la rama `master` y recuperar el retraso en la ingesta de Gmail de los últimos 12 días debido a la falta de la etiqueta `PMO`.

### Tareas en Progreso (Acciones Manuales)

- [ ] 🔴 **Reactivar la Ingesta de Gmail:**
  - Crear la etiqueta `PMO` en Gmail.
  - Etiquetar manualmente las conversaciones de los últimos 14 días con `PMO` para permitir el `backfill` de la API.
- [ ] 🔴 **Prueba de Humo de Alertas (Anthropic):**
  - Cambiar la variable de repositorio `ANTHROPIC_API_KEY_EXPIRY` a la fecha de mañana.
  - Ejecutar el cron `pmo-coste-ia` en Cloud Scheduler y verificar recepción en Google Chat.
  - Cambiar la variable `ANTHROPIC_API_KEY_EXPIRY` a la fecha real: `2026-11-01`.
- [ ] 🟡 **Protección de Ramas (C12):**
  - Configurar `master` en GitHub para requerir "Status Checks" obligatorios antes del merge.
- [ ] 🟡 **Suscripciones de Presupuesto:**
  - Crear una suscripción válida para el topic de Pub/Sub `pmo-presupuesto`.

---

## Deuda Técnica / Mantenimiento Continuo

- [ ] 🟡 Renovar la clave de Anthropic (`sk-ant-...`) y actualizar Secret Manager antes del **1 de Noviembre de 2026** para evitar caída del sistema de clasificación (actualmente monitoreado por el cron de expiración).

---

## Backlog / Pospuesto

- [ ] ⏸️ **Integración WhatsApp:** (Notificaciones salientes y recepción de comandos por texto). Pospuesto sin fecha de desarrollo por decisión de la dirección (2026-09-22).
