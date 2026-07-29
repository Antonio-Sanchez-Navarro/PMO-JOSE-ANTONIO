import { ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { StartChatDto } from './dto/start-chat.dto';
import { LlmFactory } from './llm/llm.factory';
import { CopilotService } from './copilot.service';
import { LlmChunk, LlmProvider, LlmStrategy, LlmTier } from './llm/llm.types';
import { tierConfig } from './llm/model-tiers';

/** Valida el DTO como lo haría el `ValidationPipe`, y devuelve las propiedades que fallaron. */
function validar(body: unknown): string[] {
  const dto = plainToInstance(StartChatDto, body);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

const CUERPO_MINIMO = {
  provider: LlmProvider.ANTHROPIC,
  tier: LlmTier.PRO,
  message: 'Resume el hilo de Escrituración',
};

describe('StartChatDto — el contrato del chat', () => {
  it('acepta el cuerpo mínimo: proveedor, nivel y mensaje', () => {
    expect(validar(CUERPO_MINIMO)).toEqual([]);
  });

  it('exige proveedor y nivel: sin ellos no se sabe quién responde ni con qué capacidad', () => {
    expect(validar({ message: 'hola' })).toEqual(
      expect.arrayContaining(['provider', 'tier']),
    );
  });

  it.each(['gpt', 'openai', 'ANTHROPIC', ''])('rechaza el proveedor %p', (provider) => {
    expect(validar({ ...CUERPO_MINIMO, provider })).toContain('provider');
  });

  it.each(['medium', 'max', 'PRO', ''])('rechaza el nivel %p', (tier) => {
    expect(validar({ ...CUERPO_MINIMO, tier })).toContain('tier');
  });

  it('acepta los dos proveedores y los dos niveles del vocabulario', () => {
    for (const provider of Object.values(LlmProvider)) {
      for (const tier of Object.values(LlmTier)) {
        expect(validar({ ...CUERPO_MINIMO, provider, tier })).toEqual([]);
      }
    }
  });

  it('un modelo pedido a mano no llega al servicio: el id lo decide el backend', async () => {
    // Esto reproduce el pipe **global** de `main.ts`, que es el que manda: corre
    // antes que el de la ruta y descarta el campo, así que la petición responde
    // 200 con el modelo que dicta el nivel en vez del 400 que uno esperaría.
    // Comprobado contra la app el 2026-07-29 — el `forbidNonWhitelisted` del
    // controlador no llega a verlo nunca.
    //
    // La garantía que sí se sostiene, y la que importa, es que `model` no entra.
    const pipeGlobal = new ValidationPipe({ whitelist: true, transform: true });

    const dto = await pipeGlobal.transform(
      { ...CUERPO_MINIMO, model: 'claude-opus-5' },
      { type: 'body', metatype: StartChatDto },
    );

    expect(dto).not.toHaveProperty('model');
    expect(dto.provider).toBe(LlmProvider.ANTHROPIC);
    expect(dto.tier).toBe(LlmTier.PRO);
  });

  it('rechaza un mensaje vacío', () => {
    expect(validar({ ...CUERPO_MINIMO, message: '' })).toContain('message');
  });

  it('el contexto viaja como ids, nunca como contenido', () => {
    expect(validar({ ...CUERPO_MINIMO, context: { taskId: 'cmr123', emailId: 'cmr456' } })).toEqual([]);
    expect(validar({ ...CUERPO_MINIMO, context: { taskText: 'texto inyectado' } })).toContain('context');
  });
});

describe('Mapa de niveles', () => {
  it('anthropic: light es el rápido y pro el capaz', () => {
    expect(tierConfig(LlmProvider.ANTHROPIC, LlmTier.LIGHT, {}).model).toBe('claude-haiku-4-5');
    expect(tierConfig(LlmProvider.ANTHROPIC, LlmTier.PRO, {}).model).toBe('claude-opus-5');
  });

  it('el nivel ligero no pide effort: Haiku responde 400 si se lo mandan', () => {
    expect(tierConfig(LlmProvider.ANTHROPIC, LlmTier.LIGHT, {}).effort).toBeUndefined();
  });

  it('una variable de entorno pisa el modelo, para probar uno nuevo sin tocar código', () => {
    const config = tierConfig(LlmProvider.ANTHROPIC, LlmTier.PRO, {
      COPILOT_ANTHROPIC_MODEL_PRO: 'claude-sonnet-5',
    });

    expect(config.model).toBe('claude-sonnet-5');
  });

  it('una variable vacía o en blanco no cuenta como configurada', () => {
    expect(tierConfig(LlmProvider.ANTHROPIC, LlmTier.PRO, { COPILOT_ANTHROPIC_MODEL_PRO: '  ' }).model)
      .toBe('claude-opus-5');
  });

  it('google no trae ids por defecto: los pone quien conecte la cuenta', () => {
    expect(tierConfig(LlmProvider.GOOGLE, LlmTier.PRO, {}).model).toBe('');
  });
});

/** Estrategia de mentira, para probar la fábrica sin SDK ni credenciales. */
function estrategia(provider: LlmProvider, ready = true): LlmStrategy {
  return {
    provider,
    isReady: () => ready,
    modelFor: () => 'modelo-de-prueba',
    // eslint-disable-next-line require-yield
    stream: async function* (): AsyncIterable<LlmChunk> {
      throw new Error('no se usa');
    },
  };
}

describe('LlmFactory — elegir proveedor', () => {
  it('devuelve la estrategia que pide el payload', () => {
    const anthropic = estrategia(LlmProvider.ANTHROPIC);
    const google = estrategia(LlmProvider.GOOGLE);
    const factory = new LlmFactory([anthropic, google]);

    expect(factory.get(LlmProvider.GOOGLE)).toBe(google);
    expect(factory.get(LlmProvider.ANTHROPIC)).toBe(anthropic);
  });

  it('503 si el proveedor está declarado pero no configurado', () => {
    const factory = new LlmFactory([
      estrategia(LlmProvider.ANTHROPIC),
      estrategia(LlmProvider.GOOGLE, false),
    ]);

    expect(() => factory.get(LlmProvider.GOOGLE)).toThrow(ServiceUnavailableException);
  });

  it('503 si no hay ninguna estrategia para ese proveedor', () => {
    const factory = new LlmFactory([estrategia(LlmProvider.ANTHROPIC)]);

    expect(() => factory.get(LlmProvider.GOOGLE)).toThrow(ServiceUnavailableException);
  });

  it('dos estrategias para el mismo proveedor revientan al arrancar, no en la primera petición', () => {
    expect(() => new LlmFactory([
      estrategia(LlmProvider.ANTHROPIC),
      estrategia(LlmProvider.ANTHROPIC),
    ])).toThrow(/dos estrategias/i);
  });

  it('enumera lo que puede ofrecer la instalación, para pintar el selector', () => {
    const factory = new LlmFactory([
      estrategia(LlmProvider.ANTHROPIC),
      estrategia(LlmProvider.GOOGLE, false),
    ]);

    expect(factory.available()).toEqual([
      { provider: LlmProvider.ANTHROPIC, ready: true },
      { provider: LlmProvider.GOOGLE, ready: false },
    ]);
  });
});

describe('CopilotService', () => {
  it('el proveedor no configurado falla en la llamada, antes de abrir el stream', () => {
    const factory = new LlmFactory([estrategia(LlmProvider.GOOGLE, false)]);
    const service = new CopilotService(factory);

    // Si el 503 saliera dentro del generador, el controlador ya habría mandado
    // las cabeceras SSE y el cliente vería una respuesta cortada en vez de un
    // error con su código.
    expect(() =>
      service.chat('user-1', { ...CUERPO_MINIMO, provider: LlmProvider.GOOGLE }),
    ).toThrow(ServiceUnavailableException);
  });

  it('pasa el nivel y el mensaje a la estrategia, con las instrucciones de sistema delante', async () => {
    const stream = jest.fn().mockReturnValue((async function* () {
      yield { type: 'text', text: 'hola' } as LlmChunk;
    })());
    const anthropic = { ...estrategia(LlmProvider.ANTHROPIC), stream };
    const service = new CopilotService(new LlmFactory([anthropic]));

    const trozos: LlmChunk[] = [];
    for await (const chunk of service.chat('user-1', CUERPO_MINIMO)) {
      trozos.push(chunk);
    }

    const peticion = stream.mock.calls[0][0];
    expect(peticion.tier).toBe(LlmTier.PRO);
    expect(peticion.messages).toEqual([{ role: 'user', content: CUERPO_MINIMO.message }]);
    expect(peticion.system).toContain('copiloto');
    expect(trozos).toEqual([{ type: 'text', text: 'hola' }]);
  });

  it('propaga la señal de cancelación para no seguir generando sin nadie al otro lado', async () => {
    const stream = jest.fn().mockReturnValue((async function* () {})());
    const service = new CopilotService(
      new LlmFactory([{ ...estrategia(LlmProvider.ANTHROPIC), stream }]),
    );
    const abort = new AbortController();

    service.chat('user-1', CUERPO_MINIMO, abort.signal);

    expect(stream.mock.calls[0][0].signal).toBe(abort.signal);
  });
});
