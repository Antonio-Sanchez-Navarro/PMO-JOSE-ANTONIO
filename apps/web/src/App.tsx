import { useEffect, useState } from "react";
import { LoginPage } from "./features/auth/LoginPage";
import { useSession, type SessionUser } from "./features/auth/useSession";
import { KanbanBoard } from "./features/kanban/components/KanbanBoard";

type Health = {
  status: string;
  service: string;
  version: string;
  uptimeSec: number;
  timestamp: string;
};

export function App() {
  const { user, status, logout } = useSession();

  // Al volver del callback de Google la URL trae `?login=success`: la limpiamos
  // una vez que la sesión está confirmada para no dejarlo en el historial.
  useEffect(() => {
    if (status === "authenticated" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [status]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-400">
        Cargando sesión…
      </div>
    );
  }

  if (status === "anonymous" || !user) {
    return <LoginPage />;
  }

  return <Dashboard user={user} onLogout={logout} />;
}

function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="font-semibold">PMO Dashboard</span>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{user.name ?? user.email}</span>
            <button
              onClick={onLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-12">
        <span className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          Sprint 4 · Tablero Kanban
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight">Hola, {user.name ?? user.email}</h1>
        <p className="mt-2 text-slate-500">
          Tus tareas extraídas por IA y organizadas.
        </p>

        <div className="mt-8 overflow-x-auto min-h-[600px] border border-slate-200 rounded-xl bg-white shadow-sm">
          <KanbanBoard />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Card title="Cuenta">
            <dl className="space-y-1 text-sm">
              <Row label="Correo" value={user.email} />
              <Row label="Rol" value={user.role} />
              <Row
                label="Permisos de Gmail"
                value={user.hasGoogleTokens ? "Concedidos" : "Faltantes"}
              />
            </dl>
          </Card>

          <Card title="Estado del backend (/health)">
            {health ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full bg-green-500" />
                <span className="font-medium">{health.status.toUpperCase()}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  v{health.version} · uptime {health.uptimeSec}s
                </span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
                <span className="text-red-600">Sin conexión con la API ({error}).</span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Consultando…</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
