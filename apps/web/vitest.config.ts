import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Configuración aparte de `vite.config.ts` a propósito.
 *
 * La de Vite lleva el `versionPlugin`, que escribe un `version.json` en el
 * bundle y lee `VERCEL_GIT_COMMIT_SHA`. En una prueba eso no aporta nada y sí
 * ata el resultado a variables del entorno de despliegue: un test que pasa o
 * falla según dónde se corra no es una prueba, es una lotería.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    // Sin `globals`: cada prueba importa `describe`/`it`/`expect` de `vitest`.
    // Así `tsc -b` type-checkea los tests con el resto del código, sin tener
    // que enseñarle un conjunto de nombres mágicos.
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
