import { ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './llm/google.strategy';
import { AnthropicStrategy } from './llm/anthropic.strategy';
import { COPILOT_EVENTS } from './copilot.controller';
import { DRAFT_EMAIL, parseDraftEmail } from './llm/tools';
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

  it('google: light es el rápido y pro el capaz, con ids vigentes', () => {
    expect(tierConfig(LlmProvider.GOOGLE, LlmTier.LIGHT, {}).model).toBe('gemini-3.5-flash-lite');
    expect(tierConfig(LlmProvider.GOOGLE, LlmTier.PRO, {}).model).toBe('gemini-3.6-flash');
  });

  it('ningún nivel apunta a la familia 1.5, que Google apagó el 2025-09-29', () => {
    // Regresión con fecha: el encargo del 2026-07-29 pedía `gemini-1.5-flash` y
    // `gemini-1.5-pro` sin saber que llevaban diez meses retirados. Un id
    // muerto aquí haría que el proveedor se anuncie listo y devuelva 404 en la
    // primera pregunta.
    for (const tier of Object.values(LlmTier)) {
      expect(tierConfig(LlmProvider.GOOGLE, tier, {}).model).not.toMatch(/gemini-1\.5/);
    }
  });
});

describe('draft_email — el payload que recibe el frontend', () => {
  const completo = {
    to: ['cliente@ejemplo.com'],
    cc: ['copia@ejemplo.com'],
    subject: 'Actualización',
    body: 'Cuerpo del correo...',
  };

  it('deja intacto lo que ya viene bien', () => {
    expect(parseDraftEmail(completo)).toEqual(completo);
  });

  it('siempre devuelve los cuatro campos, con cc vacío si no hay', () => {
    // El frontend no debería tener que distinguir "sin copia" de "campo
    // ausente" para pintar el editor.
    expect(parseDraftEmail({ to: ['a@b.mx'], subject: 'x', body: 'y' })).toEqual({
      to: ['a@b.mx'],
      cc: [],
      subject: 'x',
      body: 'y',
    });
  });

  it('acepta una dirección suelta como un destinatario', () => {
    // Error frecuente del modelo; descartarlo perdería el borrador entero.
    expect(parseDraftEmail({ ...completo, to: 'cliente@ejemplo.com' }).to).toEqual([
      'cliente@ejemplo.com',
    ]);
  });

  it('limpia huecos, espacios y repetidos de las listas', () => {
    expect(parseDraftEmail({ ...completo, to: ['  a@b.mx ', '', 'a@b.mx', null] }).to).toEqual([
      'a@b.mx',
    ]);
  });

  it('sobrevive a una respuesta vacía o absurda sin reventar', () => {
    // Pintar `undefined.length` en el editor sería peor que un borrador vacío.
    for (const basura of [undefined, null, {}, { to: 42, subject: [], body: null }]) {
      expect(parseDraftEmail(basura)).toEqual({ to: [], cc: [], subject: '', body: '' });
    }
  });
});

describe('El evento que sale por el cable', () => {
  it('un tool_call se pinta con el JSON exacto que espera Gravity', () => {
    // Este es el contrato literal acordado. Si alguien renombra un campo del
    // trozo, esta prueba lo caza antes que el frontend.
    const chunk: LlmChunk = {
      type: 'tool_call',
      toolName: DRAFT_EMAIL,
      payload: parseDraftEmail({
        to: ['cliente@ejemplo.com'],
        cc: [],
        subject: 'Actualización',
        body: 'Cuerpo del correo...',
      }),
    };

    expect(`event: ${COPILOT_EVENTS.tool_call}\ndata: ${JSON.stringify(chunk)}\n\n`).toBe(
      'event: tool_call\n' +
        'data: {"type":"tool_call","toolName":"draft_email","payload":' +
        '{"to":["cliente@ejemplo.com"],"cc":[],"subject":"Actualización","body":"Cuerpo del correo..."}}\n\n',
    );
  });
});

describe('AnthropicStrategy — herramientas', () => {
  /** Un stream de mentira con la forma que devuelve el SDK. */
  function conRespuesta(content: unknown[]) {
    const strategy = new AnthropicStrategy({ get: () => 'clave' } as unknown as ConfigService);
    const final = {
      model: 'claude-opus-5',
      content,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    (strategy as unknown as { client: unknown }).client = {
      messages: {
        stream: () =>
          Object.assign(
            (async function* () {
              yield {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Va el borrador' },
              };
            })(),
            { finalMessage: async () => final },
          ),
      },
    };

    return strategy;
  }

  const recoger = async (strategy: AnthropicStrategy) => {
    const trozos: LlmChunk[] = [];
    for await (const chunk of strategy.stream({ messages: [], tier: LlmTier.PRO })) {
      trozos.push(chunk);
    }
    return trozos;
  };

  it('convierte un bloque tool_use en un tool_call normalizado', async () => {
    const trozos = await recoger(
      conRespuesta([
        { type: 'text', text: 'Va el borrador' },
        {
          type: 'tool_use',
          name: DRAFT_EMAIL,
          input: { to: 'cliente@ejemplo.com', subject: 'Actualización', body: 'Cuerpo' },
        },
      ]),
    );

    expect(trozos).toEqual([
      { type: 'text', text: 'Va el borrador' },
      {
        type: 'tool_call',
        toolName: DRAFT_EMAIL,
        payload: { to: ['cliente@ejemplo.com'], cc: [], subject: 'Actualización', body: 'Cuerpo' },
      },
      expect.objectContaining({ type: 'done', model: 'claude-opus-5' }),
    ]);
  });

  it('el tool_call va antes del done, nunca después', async () => {
    const trozos = await recoger(
      conRespuesta([{ type: 'tool_use', name: DRAFT_EMAIL, input: { to: ['a@b.mx'] } }]),
    );
    const tipos = trozos.map((t) => t.type);

    expect(tipos.indexOf('tool_call')).toBeLessThan(tipos.indexOf('done'));
  });

  it('ignora una herramienta que no es la nuestra', async () => {
    const trozos = await recoger(
      conRespuesta([{ type: 'tool_use', name: 'otra_herramienta', input: {} }]),
    );

    expect(trozos.some((t) => t.type === 'tool_call')).toBe(false);
    expect(trozos.at(-1)?.type).toBe('done');
  });

  it('sin herramienta, el stream se comporta como siempre', async () => {
    const trozos = await recoger(conRespuesta([{ type: 'text', text: 'Va el borrador' }]));

    expect(trozos.map((t) => t.type)).toEqual(['text', 'done']);
  });
});

describe('GoogleStrategy — herramientas', () => {
  function conTrozos(trozosSdk: unknown[]) {
    const strategy = new GoogleStrategy({ get: () => 'clave' } as unknown as ConfigService);

    (strategy as unknown as { client: unknown }).client = {
      models: {
        generateContentStream: async () =>
          (async function* () {
            for (const t of trozosSdk) yield t;
          })(),
      },
    };

    return strategy;
  }

  it('convierte un functionCall en el mismo tool_call que Anthropic', async () => {
    const strategy = conTrozos([
      { text: 'Va el borrador', functionCalls: undefined },
      {
        text: undefined,
        functionCalls: [
          { name: DRAFT_EMAIL, args: { to: ['cliente@ejemplo.com'], subject: 'A', body: 'B' } },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ]);

    const trozos: LlmChunk[] = [];
    for await (const chunk of strategy.stream({ messages: [], tier: LlmTier.PRO })) {
      trozos.push(chunk);
    }

    // Misma forma exacta que produce el otro proveedor: el frontend no debería
    // notar quién respondió.
    expect(trozos).toEqual([
      { type: 'text', text: 'Va el borrador' },
      {
        type: 'tool_call',
        toolName: DRAFT_EMAIL,
        payload: { to: ['cliente@ejemplo.com'], cc: [], subject: 'A', body: 'B' },
      },
      expect.objectContaining({ type: 'done', model: 'gemini-3.6-flash' }),
    ]);
  });

  it('ignora una herramienta que no es la nuestra', async () => {
    const strategy = conTrozos([{ functionCalls: [{ name: 'otra', args: {} }] }]);

    const trozos: LlmChunk[] = [];
    for await (const chunk of strategy.stream({ messages: [], tier: LlmTier.LIGHT })) {
      trozos.push(chunk);
    }

    expect(trozos.map((t) => t.type)).toEqual(['done']);
  });
});

describe('GoogleStrategy — qué le falta para estar lista', () => {
  /** Un `ConfigService` de mentira: solo tiene que responder `get`. */
  const config = (env: Record<string, string> = {}) =>
    ({ get: (clave: string) => env[clave] }) as unknown as ConfigService;

  it('con GEMINI_API_KEY queda lista: los ids ya tienen valor por defecto', () => {
    expect(new GoogleStrategy(config({ GEMINI_API_KEY: 'clave-de-prueba' })).isReady()).toBe(true);
  });

  it('sin la credencial no está lista, y la fábrica devolverá 503', () => {
    expect(new GoogleStrategy(config()).isReady()).toBe(false);
  });

  it('con la credencial pero un id vaciado por entorno tampoco', () => {
    // Sin esta comprobación la llamada saldría con `model: ""` y el fallo
    // aparecería a mitad del stream, cuando ya no se puede cambiar el código
    // de estado.
    const conIdVacio = new GoogleStrategy(
      config({ GEMINI_API_KEY: 'clave-de-prueba', COPILOT_GOOGLE_MODEL_PRO: '' }),
    );

    jest.spyOn(conIdVacio, 'modelFor').mockImplementation((tier) =>
      tier === LlmTier.PRO ? '' : 'gemini-3.5-flash-lite',
    );

    expect(conIdVacio.isReady()).toBe(false);
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
