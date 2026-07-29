import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmChatRequest, LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm.types';
import { tierConfig } from './model-tiers';

/**
 * El copiloto sobre Gemini. **Declarado, todavía no conectado.**
 *
 * Existe entero —con su sitio en la fábrica y su contrato— para que enchufarlo
 * sea rellenar `stream()` y no rediseñar nada. Le faltan dos cosas que no puede
 * poner este archivo:
 *
 * 1. **El SDK.** `@google/genai` no es dependencia del backend, y
 *    `package.json` es zona compartida (ver `AI_ROLES.md`): se avisa antes de
 *    añadirlo.
 * 2. **La credencial y los ids de modelo**: `GEMINI_API_KEY` y las variables
 *    `COPILOT_GOOGLE_MODEL_LIGHT` / `_PRO`. Los ids no se escriben por defecto
 *    a propósito — los pone quien conecte la cuenta contra la lista real, no
 *    quien escribe el esqueleto de memoria.
 *
 * Mientras falte cualquiera de las dos, `isReady()` responde `false` y la
 * fábrica devuelve **503 con el motivo**, en vez de dejar que el fallo salga a
 * mitad del stream cuando el cliente ya está pintando una respuesta.
 */
@Injectable()
export class GoogleStrategy implements LlmStrategy {
  readonly provider = LlmProvider.GOOGLE;

  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(private readonly config: ConfigService) {}

  isReady(): boolean {
    const tieneCredencial = Boolean(this.config.get<string>('GEMINI_API_KEY'));
    const tieneModelos = Boolean(
      this.modelFor(LlmTier.LIGHT) && this.modelFor(LlmTier.PRO),
    );

    // El SDK no está instalado, así que hoy esto es `false` incluso con las dos
    // variables puestas. Se deja escrito para que el día que entre la
    // dependencia el único cambio sea `stream()`.
    return tieneCredencial && tieneModelos && false;
  }

  modelFor(tier: LlmTier): string {
    return tierConfig(this.provider, tier).model;
  }

  // eslint-disable-next-line require-yield
  async *stream(_request: LlmChatRequest): AsyncIterable<LlmChunk> {
    this.logger.warn('Se pidió Gemini y el proveedor no está conectado.');

    throw new ServiceUnavailableException(
      'El proveedor google todavía no está conectado: falta la dependencia @google/genai, ' +
        'la credencial GEMINI_API_KEY y los ids de modelo (COPILOT_GOOGLE_MODEL_LIGHT / _PRO).',
    );
  }
}
