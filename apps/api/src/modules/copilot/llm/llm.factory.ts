import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LlmProvider, LlmStrategy } from './llm.types';

/** Token de la lista de estrategias registradas (ver `copilot.module.ts`). */
export const LLM_STRATEGIES = Symbol('LLM_STRATEGIES');

/**
 * Elige la estrategia que pide el payload.
 *
 * El índice se construye **una vez, al arrancar**, a partir de las estrategias
 * que el módulo registra: añadir un proveedor es escribir su clase y sumarla a
 * la lista, sin tocar ni la fábrica ni el servicio ni el controlador. Y como el
 * índice se arma con el `provider` que declara cada estrategia, no hay una
 * segunda tabla que se pueda desincronizar con las clases.
 */
@Injectable()
export class LlmFactory {
  private readonly logger = new Logger(LlmFactory.name);
  private readonly registro = new Map<LlmProvider, LlmStrategy>();

  constructor(@Inject(LLM_STRATEGIES) strategies: LlmStrategy[]) {
    for (const strategy of strategies) {
      if (this.registro.has(strategy.provider)) {
        // Al arrancar y no en la primera petición: dos estrategias para el
        // mismo proveedor son un error de cableado, y la última ganaría en
        // silencio.
        throw new Error(`Hay dos estrategias registradas para "${strategy.provider}".`);
      }
      this.registro.set(strategy.provider, strategy);
    }

    const listas = strategies.filter((s) => s.isReady()).map((s) => s.provider);
    this.logger.log(`Copiloto: proveedores listos → ${listas.join(', ') || 'ninguno'}`);
  }

  /**
   * Devuelve la estrategia, o lanza **503** si ese proveedor está declarado
   * pero no puede atender (le falta la dependencia o la credencial).
   *
   * La comprobación va aquí, antes de que el controlador escriba una sola
   * cabecera: un fallo a mitad del stream ya no puede cambiar el código de
   * estado, y el cliente vería una respuesta que empieza y se corta en vez de
   * un error que dice qué pasa.
   *
   * El `provider` desconocido no se contempla: el DTO lo valida contra el enum
   * y un valor fuera de él ya dio 400 mucho antes de llegar aquí.
   */
  get(provider: LlmProvider): LlmStrategy {
    const strategy = this.registro.get(provider);

    if (!strategy) {
      throw new ServiceUnavailableException(`No hay proveedor registrado para "${provider}".`);
    }

    if (!strategy.isReady()) {
      throw new ServiceUnavailableException(
        `El proveedor "${provider}" está declarado pero no configurado en este entorno.`,
      );
    }

    return strategy;
  }

  /** Qué puede ofrecer hoy la instalación. Lo pide la interfaz para pintar el selector. */
  available(): { provider: LlmProvider; ready: boolean }[] {
    return [...this.registro.values()].map((s) => ({
      provider: s.provider,
      ready: s.isReady(),
    }));
  }
}
