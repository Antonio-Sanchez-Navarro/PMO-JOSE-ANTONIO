export interface DashboardMetrics {
  generatedAt: string;
  window: {
    from: string;
    to: string;
    days: number;
    tz: string;
  };
  tasks: {
    byStatus: Record<string, number>;
    total: number;
  };
  wip: number;
  overdue: {
    count: number;
    byPriority: Record<string, number>;
  };
  throughput: {
    completedInWindow: number;
    avgPerDay: number;
    perDay: Array<{
      date: string;
      count: number;
    }>;
  };
  time: {
    totalSecInWindow: number;
    perDay: Array<{
      date: string;
      seconds: number;
    }>;
  };
  inbox: {
    pending: number;
    byStatus: Record<string, number>;
  };
}
