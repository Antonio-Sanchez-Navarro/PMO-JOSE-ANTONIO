import { useState, useEffect } from 'react';
import { DashboardMetrics } from '../types';

const MOCK_METRICS: DashboardMetrics = {
  "generatedAt": "2026-07-29T21:00:00.000Z",
  "window": {
    "from": "2026-07-22T00:00:00.000Z",
    "to": "2026-07-29T23:59:59.999Z",
    "days": 7,
    "tz": "America/Mexico_City"
  },
  "tasks": {
    "byStatus": { "TODO": 12, "IN_PROGRESS": 3, "POSTPONED": 1, "DONE": 40, "OVERDUE": 5 },
    "total": 61
  },
  "wip": 3,
  "overdue": {
    "count": 5,
    "byPriority": { "URGENT": 2, "HIGH": 1, "MEDIUM": 2, "LOW": 0 }
  },
  "throughput": {
    "completedInWindow": 9,
    "avgPerDay": 1.3,
    "perDay": [
      { "date": "2026-07-22", "count": 0 },
      { "date": "2026-07-23", "count": 2 },
      { "date": "2026-07-24", "count": 3 },
      { "date": "2026-07-25", "count": 1 },
      { "date": "2026-07-26", "count": 0 },
      { "date": "2026-07-27", "count": 2 },
      { "date": "2026-07-28", "count": 1 },
      { "date": "2026-07-29", "count": 0 }
    ]
  },
  "time": {
    "totalSecInWindow": 43200,
    "perDay": [
      { "date": "2026-07-22", "seconds": 0 },
      { "date": "2026-07-23", "seconds": 7200 },
      { "date": "2026-07-24", "seconds": 14400 },
      { "date": "2026-07-25", "seconds": 3600 },
      { "date": "2026-07-26", "seconds": 0 },
      { "date": "2026-07-27", "seconds": 10800 },
      { "date": "2026-07-28", "seconds": 7200 },
      { "date": "2026-07-29", "seconds": 0 }
    ]
  },
  "inbox": {
    "pending": 7,
    "byStatus": { "PENDING": 7, "IN_PROGRESS": 2, "COMPLETED": 31, "DISMISSED": 4 }
  }
};

export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        // TODO: Replace with actual API call:
        // const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        // const response = await fetch(`/api/dashboard/metrics?tz=${tz}`);
        // if (!response.ok) throw new Error('Failed to fetch metrics');
        // const json = await response.json();
        // setData(json);
        
        // Simulating network latency
        await new Promise(resolve => setTimeout(resolve, 800));
        setData(MOCK_METRICS);
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
