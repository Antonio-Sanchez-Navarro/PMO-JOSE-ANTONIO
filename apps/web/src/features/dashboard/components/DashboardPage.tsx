import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

export function DashboardPage() {
  const { data, isLoading, error } = useDashboardMetrics();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Cargando métricas...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Error al cargar métricas: {error?.message}
      </div>
    );
  }

  const { wip, overdue, throughput, time, inbox } = data;

  const timeData = time.perDay.map(d => ({
    ...d,
    hours: Number((d.seconds / 3600).toFixed(2))
  }));

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Métricas de Productividad</h2>
          <p className="text-sm text-slate-500 mt-1">
            Ventana: {new Date(data.window.from).toLocaleDateString()} - {new Date(data.window.to).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          title="Work in Progress (WIP)"
          value={wip}
          subtitle="Tareas activas actualmente"
          trend="neutral"
        />
        <MetricCard
          title="Tareas Atrasadas"
          value={overdue.count}
          subtitle={`Urgentes: ${overdue.byPriority.URGENT || 0} | Altas: ${overdue.byPriority.HIGH || 0}`}
          trend={overdue.count > 0 ? 'bad' : 'good'}
        />
        <MetricCard
          title="Completadas (Ventana)"
          value={throughput.completedInWindow}
          subtitle={`Promedio: ${throughput.avgPerDay.toFixed(1)}/día`}
          trend="good"
        />
        <MetricCard
          title="Bandeja Pendiente"
          value={inbox.pending}
          subtitle={`Total: ${inbox.byStatus.PENDING || 0} sin leer`}
          trend="neutral"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Throughput Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Throughput (Tareas Completadas)</h3>
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <span>⚠️</span>
              Nota: Las tareas completadas antes del último despliegue no tienen registro de fecha y no aparecerán aquí.
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={throughput.perDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(label: any) => formatDate(String(label))}
                />
                <Bar dataKey="count" name="Completadas" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Time Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Tiempo Registrado (Horas)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Total en ventana: {(time.totalSecInWindow / 3600).toFixed(1)} hrs
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(label: any) => formatDate(String(label))}
                  formatter={(value: any) => [`${value} hrs`, 'Tiempo']}
                />
                <Area type="monotone" dataKey="hours" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorHours)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, trend }: { title: string; value: string | number; subtitle: string; trend: 'good' | 'bad' | 'neutral' }) {
  const valueColor = trend === 'bad' ? 'text-red-600' : 'text-slate-900';
  
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className={`mt-2 text-3xl font-bold ${valueColor}`}>{value}</p>
      </div>
      <p className="mt-2 text-xs text-slate-400">{subtitle}</p>
    </div>
  );
}
