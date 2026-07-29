/**
 * Contratos del copiloto multi-proveedor (Sprint 6).
 *
 * El cliente elige **proveedor** y **nivel**, nunca un modelo concreto: los ids
 * de modelo cambian cada pocos meses y una interfaz que los acepte obliga a
 * desplegar el frontend cada vez que sale uno nuevo. El nivel es una promesa
 * estable —"rápido y barato" o "el bueno"— y la traducción a id vive en el
 * backend (`model-tiers.ts`).
 */

/** Quién responde. */
export enum LlmProvider {
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
}

/**
 * Con cuánta capacidad.
 *
 * `LIGHT` para lo interactivo y de bajo riesgo (reformular, resumir un hilo);
 * `PRO` para lo que decide algo (redactar un correo que se va a enviar,
 * razonar sobre varias tareas).
 */
export enum LlmTier {
  LIGHT = 'light',
  PRO = 'pro',
}

/** Un turno de la conversación, en la forma mínima común a los dos proveedores. */
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmChatRequest {
  /** Instrucciones de sistema. Van aparte del historial en las dos APIs. */
  system?: string;
  /** Historial completo: las dos APIs son sin estado y hay que reenviarlo. */
  messages: LlmMessage[];
  tier: LlmTier;
  /**
   * Corta la generación cuando el cliente cierra la conexión SSE. Sin esto se
   * seguirían gastando tokens en una respuesta que ya no lee nadie.
   */
  signal?: AbortSignal;
}

/**
 * Un trozo de respuesta. Es una unión discriminada, y no una cadena suelta,
 * para que quepan sin romper el contrato los eventos que ya se ven venir
 * (`tool_use` del Sprint 6, razonamiento visible) sin que el cliente tenga que
 * adivinar qué está leyendo.
 */
export type LlmChunk =
  | { type: 'text'; text: string }
  /** Cierre limpio: el modelo terminó y estos son los contadores de la llamada. */
  | { type: 'done'; model: string; usage?: { inputTokens: number; outputTokens: number } };

/**
 * La estrategia: lo que tiene que saber hacer un proveedor para servir al
 * copiloto. Cada implementación encapsula su SDK y su vocabulario, y hacia
 * fuera todas se ven igual.
 */
export interface LlmStrategy {
  /** Con qué valor de `provider` la selecciona la fábrica. */
  readonly provider: LlmProvider;

  /**
   * Si el proveedor puede atender ahora mismo: dependencia instalada y
   * credencial configurada. La fábrica lo pregunta **antes** de elegirlo, para
   * fallar con un mensaje que dice qué falta en vez de reventar a mitad del
   * stream, cuando ya se han mandado cabeceras SSE y el cliente pinta una
   * respuesta a medias.
   */
  isReady(): boolean;

  /** El id de modelo que se usaría para ese nivel. Se registra en el log y viaja en el cierre. */
  modelFor(tier: LlmTier): string;

  /**
   * La respuesta, en trozos, según llegan.
   *
   * Es un `AsyncIterable` y no un callback ni un `Observable` porque es lo que
   * devuelven los dos SDK y lo que consume un `for await` del controlador: sin
   * adaptadores en medio, la cancelación se propaga sola al romper el bucle.
   */
  stream(request: LlmChatRequest): AsyncIterable<LlmChunk>;
}
