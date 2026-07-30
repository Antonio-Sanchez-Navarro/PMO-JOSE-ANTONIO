import { useState, useEffect } from 'react';
import { DashboardMetrics } from '../types';

export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(`/api/dashboard/metrics?tz=${tz}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }
        
        const json = await response.json();
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
