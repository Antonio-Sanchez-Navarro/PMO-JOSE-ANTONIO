import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

function versionPlugin(): Plugin {
  return {
    name: "version-generator",
    generateBundle() {
      const commit =
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VITE_COMMIT_SHA ||
        "desconocido";
      const construido = new Date().toISOString();
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ commit, construido }, null, 2),
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/version.json") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader(
            "Cache-Control",
            "no-cache, no-store, must-revalidate",
          );
          const commit =
            process.env.VERCEL_GIT_COMMIT_SHA ||
            process.env.VITE_COMMIT_SHA ||
            "desconocido";
          const construido = new Date().toISOString();
          res.end(JSON.stringify({ commit, construido }, null, 2));
          return;
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Proxy al backend para evitar CORS en desarrollo.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
