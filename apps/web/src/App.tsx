import { useEffect, useState } from "react";

type Health = {
  status: string;
  service: string;
  version: string;
  uptimeSec: number;
  timestamp: string;
};

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Vía el proxy de Vite: /api -> http://localhost:3000
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          Sprint 0 · Fundaciones
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">PMO Dashboard</h1>
        <p className="mt-2 text-slate-500">
          Monorepo listo · Backend NestJS · Frontend React + Vite + Tailwind.
        </p>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Estado del backend (/health)
          </h2>
          {health ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="font-medium">{health.status.toUpperCase()}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">
                {health.service} v{health.version} · uptime {health.uptimeSec}s
              </span>
            </div>
          ) : error ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-red-600">
                Sin conexión con la API ({error}). ¿Está corriendo en :3000?
              </span>
            </div>
          ) : (
            <p className="mt-3 text-slate-400">Consultando…</p>
          )}
        </div>
      </div>
    </div>
  );
}
