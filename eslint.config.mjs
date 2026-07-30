import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Configuración de ESLint del monorepo (2026-07-30).
 *
 * **Por qué hay una sola y vive en la raíz.** Hasta hoy `npm run lint` no
 * fallaba por un problema de estilo: fallaba porque **no había configuración en
 * ninguna parte**. ESLint 9 dejó de leer los `.eslintrc` y aquí no existía ni
 * el formato viejo ni el nuevo, así que el comando moría antes de abrir un solo
 * archivo. No se notó porque el CI escucha `main` y se trabaja en `master`.
 *
 * ESLint busca la configuración subiendo desde el directorio de trabajo, así
 * que los tres workspaces encuentran esta al ejecutar su propio `lint`. Una
 * sola configuración evita que `apps/api` y `apps/web` acaben con reglas
 * distintas para el mismo error.
 */
export default tseslint.config(
  {
    // Nada de esto es código nuestro. Sin ignorarlo, `dist` duplica cada aviso
    // sobre su propio fuente y `coverage` es ruido puro.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/generated/**',
      'apps/api/prisma/migrations/**',
    ],
  },

  js.configs.recommended,

  /**
   * Reglas de TypeScript **sin type-check** (`recommended`, no
   * `recommendedTypeChecked`).
   *
   * Las que necesitan tipos obligan a ESLint a levantar el programa entero de
   * `tsc`, y en este repo eso es justo lo que ya nos cuesta memoria: los tipos
   * de `googleapis` son enormes y por eso `start:dev` lleva
   * `--max-old-space-size=4096` y los tests transpilan sin type-check. El
   * type-check de verdad ya lo da `npx tsc -p apps/api/tsconfig.spec.json`, que
   * es exacto y no duplica el trabajo aquí.
   */
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      // Lo comprueba el compilador, y mejor: ESLint sin tipos daría falsos
      // positivos con los globales de Node y del navegador.
      'no-undef': 'off',

      // Un argumento que empieza por `_` es "sé que está y no lo uso": es la
      // forma de respetar una firma sin que el linter proteste.
      //
      // `ignoreRestSiblings` cubre el patrón de quitar un campo de un objeto
      // (`const { timeEntries, ...rest } = task`), que es justo lo contrario de
      // un descuido: la variable existe para que ese campo **no** salga.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Aviso y no error a propósito: hay `any` legítimos en las fronteras
      // (payloads del modelo, `$queryRaw`) y convertirlos en error obligaría a
      // sembrar el código de excepciones.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  {
    // Los `.spec.ts` viven de dobles: un mock de Prisma no tiene por qué
    // tiparse como el cliente entero para comprobar con qué se le llamó.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },

  {
    // Configuración y scripts sueltos: son de Node y se escriben en JS.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { sourceType: 'module' },
  },

  /**
   * Va **el último** y solo apaga reglas: `eslint-config-prettier` desactiva
   * las de formato que chocarían con Prettier.
   *
   * Deliberadamente **no** se enchufa `eslint-plugin-prettier`, que está en las
   * dependencias pero nunca llegó a usarse. Convertiría cada diferencia de
   * formato en un error de lint y el primer `--fix` reescribiría el repo
   * entero, incluido `apps/web`, que es dominio de Gravity. El formato lo sigue
   * poniendo `prettier` por su cuenta; el linter se queda con lo que de verdad
   * son fallos.
   */
  prettier,
);
