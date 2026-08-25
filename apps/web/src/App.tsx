import { useEffect, useState } from "react";
import { LoginPage } from "./features/auth/LoginPage";
import { useSession, type SessionUser } from "./features/auth/useSession";
import { KanbanBoard } from "./features/kanban/components/KanbanBoard";
import { apiFetch } from "./lib/api";

type Health = {
  status: string;
  service: string;
  version: string;
  uptimeSec: number;
  timestamp: string;
};

import { InboxPage } from "./features/inbox/InboxPage";
import { CopilotDrawer } from "./features/copilot";
import { CopilotProvider, useCopilot } from "./features/copilot/CopilotContext";
import { DashboardPage as MetricsPage } from "./features/dashboard/components/DashboardPage";

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
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <span className="text-sm font-medium">Cargando sesión...</span>
        </div>
      </div>
    );
  }

  if (status === "anonymous" || !user) {
    return <LoginPage />;
  }

  return (
    <CopilotProvider>
      <Dashboard user={user} onLogout={logout} />
    </CopilotProvider>
  );
}

function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inbox" | "kanban" | "metrics">("inbox");
  const { isCopilotOpen, setIsCopilotOpen } = useCopilot();

  useEffect(() => {
    const check = () => {
      // Vía el proxy de Vite: /api -> http://localhost:3000
      apiFetch<Health>("/health/ready")
        .then((data) => {
          setHealth(data);
          setError(null);
        })
        .catch((e: unknown) => {
          setHealth(null);
          setError(String(e));
        });
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      <header className="border-b border-slate-200 bg-white shrink-0">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <span className="font-bold text-xl text-slate-900 tracking-tight">PMO Dashboard</span>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab("inbox")}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  activeTab === "inbox" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Bandeja
              </button>
              <button
                onClick={() => setActiveTab("kanban")}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  activeTab === "kanban" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Tablero
              </button>
              <button
                onClick={() => setActiveTab("metrics")}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  activeTab === "metrics" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Métricas
              </button>
            </div>
            <span className="text-slate-500 ml-4 hidden sm:inline-block">{user.name ?? user.email}</span>
            <button
              onClick={onLogout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-6 overflow-hidden flex flex-col">
        {activeTab === "inbox" ? (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
             <InboxPage />
          </div>
        ) : activeTab === "kanban" ? (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
             <KanbanBoard />
          </div>
        ) : (
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
             <MetricsPage />
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 shrink-0">
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

          <Card title="Estado del backend (/health/ready)">
            {health ? (
              <div className="flex items-center gap-3 text-sm">
                <span className={`h-3 w-3 shrink-0 rounded-full ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
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
      </main>

      <CopilotDrawer isOpen={isCopilotOpen} onClose={() => setIsCopilotOpen(false)} />

      <button
        onClick={() => setIsCopilotOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-xl hover:bg-indigo-700 transition-transform hover:scale-105 z-40 flex items-center justify-center gap-2"
        title="Abrir Copiloto de IA"
      >
        <span className="text-xl">✨</span>
      </button>
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
