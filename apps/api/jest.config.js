/**
 * Configuración de pruebas de la API.
 *
 * Alcance actual (Sprint 3): pruebas unitarias con dependencias simuladas. No
 * se toca Postgres ni Redis ni se llama a la API de Anthropic, así que `npm test`
 * corre sin `docker compose up` y sin gastar tokens.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  // `tsconfig.spec.json` acota el programa a `src` y desactiva la emisión: con
  // el tsconfig de build (sin `include`) ts-jest agotaba el heap de Node.
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }] },
  moduleFileExtensions: ['js', 'json', 'ts'],
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  clearMocks: true,
};
