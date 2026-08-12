import { useState, useEffect } from 'react';
import { DashboardMetrics } from '../types';
import { apiFetch } from '../../../lib/api';

export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const json = await apiFetch<DashboardMetrics>(`/dashboard/metrics?tz=${tz}`);
        
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  return { data, isLoading, error };
}
