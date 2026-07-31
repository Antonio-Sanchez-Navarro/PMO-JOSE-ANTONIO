/**
 * Identidad del servicio, en el formato que espera Google Cloud.
 *
 * Error Reporting agrupa los fallos por `serviceContext`: sin él, los errores
 * de dos revisiones distintas caen en el mismo montón y no se puede decir si un
 * despliegue arregló algo o lo rompió. Con él, cada incidencia dice de qué
 * versión viene.
 *
 * `K_SERVICE` y `K_REVISION` las inyecta **Cloud Run** en cada contenedor; en
 * local no existen y por eso hay valor por defecto. `SERVICE_VERSION` permite
 * fijarla a mano en cualquier otro sitio donde se despliegue.
 */
export const SERVICE_NAME = process.env.K_SERVICE ?? 'pmo-api';

export const SERVICE_VERSION =
  process.env.K_REVISION ?? process.env.SERVICE_VERSION ?? '0.1.0';

export const SERVICE_CONTEXT = {
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
} as const;
