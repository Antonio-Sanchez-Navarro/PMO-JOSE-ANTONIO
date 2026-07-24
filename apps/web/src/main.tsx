import React from "react";
import ReactDOM from "react-dom/client";

// Punto de entrada del frontend. La app real (router, layout, features)
// se construye a partir del Sprint 0 — ver TASKS.md.
function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1>PMO Dashboard</h1>
      <p>Base del proyecto lista. Ver ARCHITECTURE.md y TASKS.md.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
