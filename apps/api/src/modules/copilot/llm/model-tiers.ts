import { LlmProvider, LlmTier } from './llm.types';

/**
 * Qué modelo hay detrás de cada (proveedor, nivel).
 *
 * Vive en un solo sitio porque es lo que más va a cambiar de todo el módulo:
 * salen modelos nuevos cada pocos meses y esto es una tabla, no lógica. El
 * resto del copiloto habla de niveles y no se entera.
 *
 * Cada entrada puede llevar además los parámetros que **solo** admite ese
 * modelo. No son adornos: pedirle `effort` a un modelo que no lo soporta es un
 * 400, así que la tabla es también el registro de qué acepta cada uno.
 */
export interface TierConfig {
  /** Variable de entorno que lo pisa, para probar un modelo sin tocar código. */
  readonly envVar: string;
  readonly model: string;
  /**
   * Profundidad de razonamiento. Solo la aceptan los modelos que la declaran;
   * en el resto se omite (mandarla da 400).
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/**
 * Anthropic:
 *
 * - `light` → **Haiku 4.5**, el más rápido y barato. No admite `effort` ni
 *   razonamiento adaptativo, así que su entrada no los lleva.
 * - `pro` → **Opus 5**. Piensa por defecto —no hay que pedírselo— y admite
 *   toda la escala de `effort`; se deja sin fijar para que use su `high` de
 *   fábrica hasta que haya con qué medirlo.
 *
 * Google: los ids se leen del entorno y **no** se fijan aquí a propósito.
 * Escribir de memoria el id de un modelo que este repositorio nunca ha llamado
 * es la clase de dato que parece correcto hasta que devuelve 404 en producción;
 * los pone quien conecte la cuenta, y hasta entonces el proveedor no está listo
 * (ver `google.strategy.ts`).
 */
const TIERS: Record<LlmProvider, Record<LlmTier, TierConfig>> = {
  [LlmProvider.ANTHROPIC]: {
    [LlmTier.LIGHT]: {
      envVar: 'COPILOT_ANTHROPIC_MODEL_LIGHT',
      model: 'claude-haiku-4-5',
    },
    [LlmTier.PRO]: {
      envVar: 'COPILOT_ANTHROPIC_MODEL_PRO',
      model: 'claude-opus-5',
    },
  },
  [LlmProvider.GOOGLE]: {
    [LlmTier.LIGHT]: {
      envVar: 'COPILOT_GOOGLE_MODEL_LIGHT',
      model: '',
    },
    [LlmTier.PRO]: {
      envVar: 'COPILOT_GOOGLE_MODEL_PRO',
      model: '',
    },
  },
};

/**
 * La configuración de ese nivel, con la variable de entorno pisando al valor
 * por defecto si está puesta.
 *
 * `env` se recibe en vez de leer `process.env` aquí para poder probarlo sin
 * ensuciar el entorno del proceso de pruebas.
 */
export function tierConfig(
  provider: LlmProvider,
  tier: LlmTier,
  env: Record<string, string | undefined> = process.env,
): TierConfig {
  const base = TIERS[provider][tier];
  const override = env[base.envVar]?.trim();

  return override ? { ...base, model: override } : base;
}
