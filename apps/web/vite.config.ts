import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";

const git = (comando: string) => execSync(`git ${comando}`, { encoding: "utf8" }).trim();

/**
 * El commit que se está construyendo, o un error que para el build (H.2).
 *
 * `version.json` tiene que decir **exactamente** qué código va en el bundle: la
 * sonda «frontend al día» lo compara con GitHub y una persona lo usa para saber
 * qué hay publicado. Antes salía de `git ls-remote origin`, el último commit de
 * GitHub, y no el que se construía: el 01-10 se publicó un commit sin empujar y
 * `version.json` dijo el anterior.
 *
 * - **Cambios sin commitear en `apps/web` o `packages/shared`: falla.** Lo
 *   construido no sería ningún commit, y `version.json` mentiría igual.
 * - **`HEAD` que no está en ningún remoto: falla, no avisa.** Publicarlo deja en
 *   `version.json` un commit que GitHub no tiene: la sonda no puede compararlo
 *   (sale «indeterminado» cada media hora) y nadie más puede reconstruir lo
 *   publicado. El arreglo es un `git push`, que no cuesta nada; un aviso en la
 *   consola de un build que se publica de todas formas no lo lee nadie.
 *   Se mira contra las ramas remotas **locales** (`git branch -r --contains`),
 *   sin red: tras empujar, `origin/master` ya contiene el commit.
 * - **En CI (`GITHUB_ACTIONS`) no se mira nada de eso:** el código sale de
 *   GitHub por definición, y en un PR `HEAD` es un merge que no está en
 *   ninguna rama.
 *
 * Ninguna variable de entorno manda: ni `VITE_COMMIT_SHA` ni
 * `VERCEL_GIT_COMMIT_SHA` decían lo que se construía, sino lo que alguien
 * escribía, y saltaban las comprobaciones de arriba. Vercel está desconectado
 * desde octubre (ALANA §90); su atajo se quitó en el remate de las 18:30 del 05-10.
 */
function commitDelBuild(): string {
  if (process.env.GITHUB_ACTIONS === "true") {
    // `rev-parse HEAD` y no `GITHUB_SHA`: en un `workflow_run`, `GITHUB_SHA` es
    // la punta de `master`, no el commit que aprobó el CI y que se ha traído.
    return git("rev-parse HEAD");
  }
  const head = git("rev-parse HEAD");
  const raiz = git("rev-parse --show-toplevel");

  const sucio = execSync(`git status --porcelain -- apps/web packages/shared`, {
    encoding: "utf8",
    cwd: raiz,
  }).trim();
  if (sucio) {
    throw new Error(
      `Hay cambios sin commitear en apps/web o packages/shared:\n${sucio}\n` +
        "version.json no podría decir qué se construye. Haz commit (y push) antes de construir para publicar.",
    );
  }

  if (!git(`branch -r --contains ${head}`)) {
    throw new Error(
      `El commit ${head.slice(0, 7)} no está en ningún remoto. Haz git push antes de construir para publicar: ` +
        "version.json diría un commit que GitHub no tiene y la sonda «frontend al día» no podría compararlo.",
    );
  }

  return head;
}

function versionPlugin(): Plugin {
  return {
    name: "version-generator",
    generateBundle() {
      let commit: string;
      try {
        commit = commitDelBuild();
      } catch (err) {
        // `this.error` para el build con el mensaje tal cual.
        this.error(err instanceof Error ? err.message : String(err));
      }
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
          let commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_COMMIT_SHA;
          if (!commit) {
            try {
              commit = execSync("git rev-parse HEAD").toString().trim();
            } catch {
              commit = "desconocido";
            }
          }
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
      },
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
