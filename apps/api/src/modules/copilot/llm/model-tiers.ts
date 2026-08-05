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
  /**
   * La variable **compartida con el resto de la API**, que es la que existe en
   * Secret Manager (`CLAUDE_MODEL_*`). Se consulta si la específica del
   * copiloto no está puesta.
   *
   * Las dos existen porque responden a preguntas distintas: la compartida dice
   * "qué modelo usa este despliegue" y se administra desde la nube; la
   * específica permite probar un modelo **solo en el copiloto** sin mover el de
   * la clasificación. Sin esta cadena, poner `CLAUDE_MODEL_REASONING` en
   * producción no cambiaba nada aquí y el copiloto seguía con el valor escrito
   * en esta tabla — una configuración que parece aplicada y no lo está.
   *
   * Google no la tiene: sus ids no comparten familia con los de Claude.
   */
  readonly envVarCompartida?: string;
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
 * Google:
 *
 * - `light` → **Gemini 3.5 Flash Lite**, el más rápido y barato de la familia.
 * - `pro` → **Gemini 3.6 Flash**, el estable más capaz.
 *
 * **Ojo con los ids de Gemini: caducan de verdad.** El encargo del 2026-07-29
 * pedía `gemini-1.5-flash` y `gemini-1.5-pro`, y esos dos **se apagaron el
 * 2025-09-29** —lo dicen las notas de versión de Google y la lista de modelos
 * vigentes, consultadas ese día; el propio `@google/genai` instalado no los
 * menciona ni una vez—. Fijarlos habría hecho que el proveedor se anunciara
 * como listo y devolviera 404 en la primera pregunta, que es exactamente lo
 * que `isReady()` existe para evitar. Si alguna vez hay que volver a un id
 * concreto, se cambia aquí o se pisa por entorno; no hace falta tocar nada más.
 */
const TIERS: Record<LlmProvider, Record<LlmTier, TierConfig>> = {
  [LlmProvider.ANTHROPIC]: {
    [LlmTier.LIGHT]: {
      envVar: 'COPILOT_ANTHROPIC_MODEL_LIGHT',
      envVarCompartida: 'CLAUDE_MODEL_CHEAP',
      model: 'claude-haiku-4-5',
    },
    [LlmTier.PRO]: {
      envVar: 'COPILOT_ANTHROPIC_MODEL_PRO',
      envVarCompartida: 'CLAUDE_MODEL_REASONING',
      model: 'claude-opus-5',
    },
  },
  [LlmProvider.GOOGLE]: {
    [LlmTier.LIGHT]: {
      envVar: 'COPILOT_GOOGLE_MODEL_LIGHT',
      model: 'gemini-3.5-flash-lite',
    },
    [LlmTier.PRO]: {
      envVar: 'COPILOT_GOOGLE_MODEL_PRO',
      model: 'gemini-3.6-flash',
    },
  },
};

/**
 * La configuración de ese nivel, con el entorno pisando al valor por defecto.
 *
 * El orden es de lo más específico a lo más general: primero la variable del
 * copiloto, después la compartida con el resto de la API, y si no hay ninguna
 * el modelo escrito en la tabla. Así una prueba puntual en el copiloto no
 * obliga a mover la configuración del despliegue, y la configuración del
 * despliegue no queda ignorada cuando no hay prueba puntual.
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
  const override =
    env[base.envVar]?.trim() ||
    (base.envVarCompartida ? env[base.envVarCompartida]?.trim() : undefined);

  return override ? { ...base, model: override } : base;
}
