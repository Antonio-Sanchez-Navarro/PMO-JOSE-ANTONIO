import { useCallback, useEffect, useState } from 'react';
import { DashboardMetrics } from '../types';
import { apiFetch } from '../../../lib/api';

/**
 * Las métricas del tablero, que son también la única fuente honesta de
 * "cuántos correos hay" en toda la aplicación.
 *
 * **`refresh` existe para la bandeja, no para el dashboard.** El dashboard se
 * pinta una vez y ya; la bandeja cambia sus contadores cada vez que alguien
 * despacha un correo, y sin una forma de volver a pedir el número, el rótulo se
 * queda mintiendo hasta que se recarga la página.
 *
 * No hay `setInterval` a propósito: esta ruta hace varias agregaciones en
 * Postgres y sondearla cada pocos segundos es la misma fuga que ya nos costó la
 * cuota de Upstash. Se pide al montar y después de cada acción de la persona,
 * que es justo cuando el número puede haber cambiado.
 */
export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const json = await apiFetch<DashboardMetrics>(`/dashboard/metrics?tz=${tz}`);

      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, isLoading, error, refresh: load };
}
