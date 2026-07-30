import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { SendEmailDto } from './dto/send-email.dto';
import { buildRawMessage, encodeHeader } from './email/mime';
import { MockSender } from './email/email-sender';
import type { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './llm/google.strategy';
import { AnthropicStrategy } from './llm/anthropic.strategy';
import { COPILOT_EVENTS } from './copilot.controller';
import {
  COPILOT_TOOLS,
  CREATE_TASK,
  DRAFT_EMAIL,
  GET_METRICS,
  SEARCH_EMAILS,
  esEjecutable,
  parseCreateTask,
  parseDraftEmail,
  parseToolArgs,
} from './llm/tools';
import { CopilotAuditService } from './audit/copilot-audit.service';
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

/** Hilos de mentira, con la forma mínima que usa el servicio. */
const HILOS_BASE = () => ({
  resolve: jest.fn().mockResolvedValue({ id: 'hilo-1', title: 'x' }),
  history: jest.fn().mockResolvedValue([]),
  saveTurn: jest.fn().mockResolvedValue(undefined),
});

/**
 * Construye el servicio con dobles razonables y deja pisar lo que cada prueba
 * mire. Sin esto, cada dependencia nueva obligaría a tocar todas las pruebas.
 *
 * La bitácora por defecto **ejecuta la acción**: es un envoltorio, no un
 * interruptor, y una que no ejecutara convertiría en verdes pruebas que en
 * realidad no llaman a nada.
 */
function copiloto(opts: Partial<Record<string, unknown>> = {}) {
  return new CopilotService(
    (opts.factory as LlmFactory) ?? new LlmFactory([]),
    (opts.sender ?? { send: jest.fn() }) as never,
    (opts.threads ?? HILOS_BASE()) as never,
    (opts.context ?? { build: jest.fn().mockResolvedValue('') }) as never,
    (opts.audit ?? {
      record: (_u: string, _t: string, _a: unknown, fn: () => unknown) => fn(),
      proposal: jest.fn(),
      list: jest.fn(),
    }) as never,
    (opts.tasks ?? { create: jest.fn() }) as never,
    (opts.prisma ?? {}) as never,
    (opts.toolRunner ?? { run: jest.fn().mockResolvedValue({}) }) as never,
  );
}

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

describe('El correo que sale hacia Gmail', () => {
  const borrador = {
    to: ['cliente@ejemplo.com'],
    cc: [],
    subject: 'Actualización',
    body: 'Buenos días,\n\nLe escribo sobre el lote 36.',
  } as never;

  /** Deshace el base64url para poder mirar el mensaje como lo verá Gmail. */
  const leer = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');

  it('el asunto con acentos va codificado, no en crudo', () => {
    // En crudo, "Actualización" llega ilegible al destinatario o lo rechaza el
    // servidor: las cabeceras son ASCII de siete bits.
    expect(encodeHeader('Actualización')).toBe('=?UTF-8?B?QWN0dWFsaXphY2nDs24=?=');
  });

  it('un asunto en ASCII se deja legible, sin envolver', () => {
    // Envolverlo sería ruido ilegible en un cliente que no lo decodifique.
    expect(encodeHeader('Weekly update')).toBe('Weekly update');
  });

  it('lleva las cabeceras mínimas y separa el cuerpo con una línea en blanco', () => {
    const [cabeceras, cuerpo] = leer(buildRawMessage(borrador)).split('\r\n\r\n');

    expect(cabeceras).toContain('To: cliente@ejemplo.com');
    expect(cabeceras).toContain('Content-Type: text/plain; charset="UTF-8"');
    // Sin la línea en blanco, Gmail lee el correo entero como cabeceras.
    expect(Buffer.from(cuerpo, 'base64').toString('utf8')).toBe(
      'Buenos días,\n\nLe escribo sobre el lote 36.',
    );
  });

  it('omite Cc cuando no hay copias, en vez de mandarlo vacío', () => {
    expect(leer(buildRawMessage(borrador))).not.toContain('Cc:');
    expect(leer(buildRawMessage({ ...(borrador as object), cc: ['jefe@ejemplo.com'] } as never)))
      .toContain('Cc: jefe@ejemplo.com');
  });

  it('sale en base64url: el base64 normal viaja mal en la petición', () => {
    const raw = buildRawMessage({ ...(borrador as object), body: 'ñ'.repeat(200) } as never);

    expect(raw).not.toMatch(/[+/=]/);
  });
});

describe('POST /copilot/emails/send', () => {
  const borrador = {
    to: ['cliente@ejemplo.com'],
    subject: 'Actualización',
    body: 'Cuerpo',
  } as never;

  const servicio = (send: jest.Mock) => copiloto({ sender: { send } });

  it('devuelve lo que responde el transporte', async () => {
    const send = jest.fn().mockResolvedValue({ id: 'msg-1', threadId: 'hilo-1', transport: 'gmail' });

    await expect(servicio(send).sendEmail('user-1', borrador)).resolves.toEqual({
      id: 'msg-1',
      threadId: 'hilo-1',
      transport: 'gmail',
    });
    expect(send).toHaveBeenCalledWith('user-1', borrador);
  });

  it('un fallo de Gmail sale como 502, no como 500', async () => {
    // El problema es del servicio de arriba —token caducado, cuota, dirección
    // rechazada— y quien lo lea necesita saber que reintentar puede servir.
    const send = jest.fn().mockRejectedValue(new Error('invalid_grant'));

    await expect(servicio(send).sendEmail('user-1', borrador)).rejects.toThrow(BadGatewayException);
  });

  it('el mensaje crudo de Google no se filtra al cliente', async () => {
    const send = jest.fn().mockRejectedValue(new Error('invalid_grant: token expired for xyz'));

    await expect(servicio(send).sendEmail('user-1', borrador)).rejects.not.toThrow(/invalid_grant/);
  });

  it('el simulado no envía y lo dice en la respuesta', async () => {
    // `transport` viaja para que la interfaz pueda avisar en vez de dar por
    // enviado lo que no salió.
    expect(await new MockSender().send('user-1', borrador)).toEqual({
      id: null,
      threadId: null,
      transport: 'mock',
    });
  });
});

describe('SendEmailDto — el contrato del envío', () => {
  const validarEnvio = (body: unknown) =>
    validateSync(plainToInstance(SendEmailDto, body), { whitelist: true }).map((e) => e.property);

  const valido = { to: ['cliente@ejemplo.com'], subject: 'Hola', body: 'Cuerpo' };

  it('acepta el borrador mínimo', () => {
    expect(validarEnvio(valido)).toEqual([]);
  });

  it('exige al menos un destinatario', () => {
    expect(validarEnvio({ ...valido, to: [] })).toContain('to');
  });

  it('rechaza direcciones que no lo son', () => {
    // El modelo redacta el borrador y puede inventarse una dirección; que la
    // rechace el servidor evita una llamada perdida a Gmail y un error opaco.
    expect(validarEnvio({ ...valido, to: ['sin-arroba'] })).toContain('to');
    expect(validarEnvio({ ...valido, cc: ['tampoco vale'] })).toContain('cc');
  });

  it('cc es opcional', () => {
    expect(validarEnvio({ ...valido, cc: undefined })).toEqual([]);
  });

  it('exige asunto y cuerpo', () => {
    expect(validarEnvio({ ...valido, subject: '' })).toContain('subject');
    expect(validarEnvio({ ...valido, body: '' })).toContain('body');
  });
});

describe('create_task — la tarea que propone el copiloto', () => {
  it('normaliza la propuesta a la forma que espera la tarjeta', () => {
    expect(
      parseCreateTask({
        title: '  Llamar a la notaría  ',
        priority: 'urgent',
        dueDate: '2026-08-10T00:00:00.000Z',
        sourceEmailId: 'cmr1',
      }),
    ).toEqual({
      title: 'Llamar a la notaría',
      description: '',
      priority: 'URGENT',
      dueDate: '2026-08-10T00:00:00.000Z',
      sourceEmailId: 'cmr1',
    });
  });

  it('una prioridad inventada cae a MEDIUM en vez de tumbar la propuesta', () => {
    expect(parseCreateTask({ title: 'x', priority: 'MUY URGENTE' }).priority).toBe('MEDIUM');
  });

  it('una fecha que no lo es se descarta: "Invalid Date" en la tarjeta es peor', () => {
    expect(parseCreateTask({ title: 'x', dueDate: 'mañana' }).dueDate).toBeNull();
  });

  it('sobrevive a una respuesta vacía', () => {
    expect(parseCreateTask(undefined)).toEqual({
      title: '',
      description: '',
      priority: 'MEDIUM',
      dueDate: null,
      sourceEmailId: null,
    });
  });

  it('el despachador elige el parser por nombre, sin que las estrategias decidan', () => {
    // Si cada proveedor eligiera el suyo, añadir una herramienta obligaría a
    // tocar los dos y sería cuestión de tiempo que uno se quedara atrás.
    expect(parseToolArgs(CREATE_TASK, { title: 'x' })).toHaveProperty('priority', 'MEDIUM');
    expect(parseToolArgs(DRAFT_EMAIL, { to: 'a@b.mx' })).toHaveProperty('cc', []);
  });

  it('el catálogo es uno solo y dice de cada herramienta quién la ejecuta', () => {
    // Lo que actúa hacia afuera lo confirma una persona; lo que solo lee lo
    // ejecuta el backend en el mismo turno. Si alguien añadiera una herramienta
    // que escribe como `execute`, se saltaría la confirmación humana sin que
    // nadie lo note — por eso la lista está fijada aquí.
    expect(COPILOT_TOOLS.map((t) => `${t.name}:${t.kind}`)).toEqual([
      'draft_email:propose',
      'create_task:propose',
      'search_emails:execute',
      'get_metrics:execute',
    ]);
  });

  it('esEjecutable distingue las de leer de las de actuar', () => {
    expect(esEjecutable(SEARCH_EMAILS)).toBe(true);
    expect(esEjecutable(GET_METRICS)).toBe(true);
    expect(esEjecutable(DRAFT_EMAIL)).toBe(false);
    expect(esEjecutable(CREATE_TASK)).toBe(false);
  });
});

describe('Bitácora de auditoría', () => {
  const prismaFalso = () => ({ copilotAuditLog: { create: jest.fn().mockResolvedValue({}) } });

  it('registra la acción con su resultado cuando sale bien', async () => {
    const prisma = prismaFalso();
    const audit = new CopilotAuditService(prisma as never);

    await audit.record('user-1', 'send_email', { to: ['a@b.mx'] }, async () => ({ id: 'msg-1' }));

    expect(prisma.copilotAuditLog.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-1',
      toolName: 'send_email',
      arguments: { to: ['a@b.mx'] },
      result: { id: 'msg-1' },
      ok: true,
    });
  });

  it('registra también el fallo, y re-lanza el error: la bitácora observa, no decide', async () => {
    const prisma = prismaFalso();
    const audit = new CopilotAuditService(prisma as never);

    await expect(
      audit.record('user-1', 'send_email', {}, async () => {
        throw new Error('invalid_grant');
      }),
    ).rejects.toThrow('invalid_grant');

    expect(prisma.copilotAuditLog.create.mock.calls[0][0].data).toMatchObject({
      ok: false,
      result: { error: 'invalid_grant' },
    });
  });

  it('si la bitácora falla, la acción sigue valiendo', async () => {
    // El correo ya se envió: tumbar la petición por no poder anotarlo
    // convertiría un problema de registro en uno de cara al usuario, y encima
    // dejaría la acción hecha igualmente.
    const prisma = { copilotAuditLog: { create: jest.fn().mockRejectedValue(new Error('db')) } };
    const audit = new CopilotAuditService(prisma as never);

    await expect(audit.record('user-1', 'send_email', {}, async () => 'enviado')).resolves.toBe(
      'enviado',
    );
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

  describe('bucle de herramientas de solo lectura', () => {
    /** Un cliente que responde distinto en cada vuelta del bucle. */
    function conVueltas(respuestas: { content: unknown[] }[]) {
      const strategy = new AnthropicStrategy({ get: () => 'clave' } as unknown as ConfigService);
      const llamadas: unknown[] = [];
      let vuelta = 0;

      (strategy as unknown as { client: unknown }).client = {
        messages: {
          stream: (params: unknown) => {
            llamadas.push(params);
            const final = {
              model: 'claude-opus-5',
              content: respuestas[vuelta++]?.content ?? [],
              usage: { input_tokens: 10, output_tokens: 5 },
            };
            return Object.assign((async function* () {})(), { finalMessage: async () => final });
          },
        },
      };

      return { strategy, llamadas };
    }

    it('ejecuta la herramienta y vuelve a llamar con el resultado', async () => {
      const { strategy, llamadas } = conVueltas([
        { content: [{ type: 'tool_use', id: 'tu-1', name: SEARCH_EMAILS, input: { query: 'lote' } }] },
        { content: [{ type: 'text', text: 'Encontré tres correos.' }] },
      ]);
      const execute = jest.fn().mockResolvedValue({ total: 3 });

      const trozos: LlmChunk[] = [];
      for await (const c of strategy.stream({ messages: [], tier: LlmTier.PRO, execute })) {
        trozos.push(c);
      }

      expect(execute).toHaveBeenCalledWith(SEARCH_EMAILS, { query: 'lote' });
      // Dos llamadas al modelo: sin la segunda, el turno se cortaría justo
      // cuando iba a usar lo que pidió.
      expect(llamadas).toHaveLength(2);

      const segunda = (llamadas[1] as { messages: { role: string; content: unknown }[] }).messages;
      expect(segunda.at(-1)).toMatchObject({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: '{"total":3}' }],
      });
      // La de leer no sale hacia el frontend: no hay nada que confirmar.
      expect(trozos.some((t) => t.type === 'tool_call')).toBe(false);
    });

    it('las de actuar sí salen al frontend y no reabren el bucle', async () => {
      const { strategy, llamadas } = conVueltas([
        { content: [{ type: 'tool_use', id: 'tu-1', name: DRAFT_EMAIL, input: { to: ['a@b.mx'] } }] },
      ]);

      const trozos: LlmChunk[] = [];
      for await (const c of strategy.stream({
        messages: [],
        tier: LlmTier.PRO,
        execute: jest.fn(),
      })) {
        trozos.push(c);
      }

      expect(llamadas).toHaveLength(1);
      expect(trozos.filter((t) => t.type === 'tool_call')).toHaveLength(1);
    });

    it('el turno tiene tope de vueltas: un modelo que insista no agota la cuota', async () => {
      const busca = {
        content: [{ type: 'tool_use', id: 'tu-1', name: SEARCH_EMAILS, input: { query: 'x' } }],
      };
      const { strategy, llamadas } = conVueltas([busca, busca, busca, busca, busca, busca]);

      for await (const _ of strategy.stream({
        messages: [],
        tier: LlmTier.PRO,
        execute: jest.fn().mockResolvedValue({}),
      })) {
        // consumir
      }

      expect(llamadas.length).toBeLessThanOrEqual(4);
    });

    it('los contadores suman todas las vueltas: el turno costó las dos llamadas', async () => {
      const { strategy } = conVueltas([
        { content: [{ type: 'tool_use', id: 'tu-1', name: SEARCH_EMAILS, input: {} }] },
        { content: [{ type: 'text', text: 'ya' }] },
      ]);

      const trozos: LlmChunk[] = [];
      for await (const c of strategy.stream({
        messages: [],
        tier: LlmTier.PRO,
        execute: jest.fn().mockResolvedValue({}),
      })) {
        trozos.push(c);
      }

      expect(trozos.at(-1)).toMatchObject({ usage: { inputTokens: 20, outputTokens: 10 } });
    });

    it('sin ejecutor no se abre el bucle: la estrategia no inventa el resultado', async () => {
      const { strategy, llamadas } = conVueltas([
        { content: [{ type: 'tool_use', id: 'tu-1', name: SEARCH_EMAILS, input: {} }] },
      ]);

      for await (const _ of strategy.stream({ messages: [], tier: LlmTier.PRO })) {
        // consumir
      }

      expect(llamadas).toHaveLength(1);
    });
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

// Los dobles de correo, hilos y contexto que había aquí sueltos se quedaron sin
// uso cuando `copiloto()` pasó a construirlos por su cuenta: cada prueba que
// necesita mirarlos se los redefine. Borrados el 2026-07-30 al encender el
// linter, que fue quien los encontró.

describe('CopilotService', () => {
  it('el proveedor no configurado falla en la llamada, antes de abrir el stream', async () => {
    const factory = new LlmFactory([estrategia(LlmProvider.GOOGLE, false)]);
    const service = copiloto({ factory });

    // Si el 503 saliera dentro del generador, el controlador ya habría mandado
    // las cabeceras SSE y el cliente vería una respuesta cortada en vez de un
    // error con su código.
    await expect(
      service.chat('user-1', { ...CUERPO_MINIMO, provider: LlmProvider.GOOGLE }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('pasa el nivel y el mensaje a la estrategia, con las instrucciones de sistema delante', async () => {
    const stream = jest.fn().mockReturnValue((async function* () {
      yield { type: 'text', text: 'hola' } as LlmChunk;
    })());
    const anthropic = { ...estrategia(LlmProvider.ANTHROPIC), stream };
    const service = copiloto({ factory: new LlmFactory([anthropic]) });

    const trozos: LlmChunk[] = [];
    for await (const chunk of await service.chat('user-1', CUERPO_MINIMO)) {
      trozos.push(chunk);
    }

    const peticion = stream.mock.calls[0][0];
    expect(peticion.tier).toBe(LlmTier.PRO);
    expect(peticion.messages).toEqual([{ role: 'user', content: CUERPO_MINIMO.message }]);
    expect(peticion.system).toContain('copiloto');
    expect(trozos).toEqual([{ type: 'text', text: 'hola' }]);
  });

  /** Un servicio con estrategia controlable, para mirar qué recibe el modelo. */
  function conHilos(
    threads: Record<string, jest.Mock>,
    context: Record<string, jest.Mock> = { build: jest.fn().mockResolvedValue('') },
    trozos: LlmChunk[] = [{ type: 'text', text: 'hola' }],
  ) {
    const stream = jest.fn().mockReturnValue((async function* () {
      for (const t of trozos) yield t;
    })());

    const service = copiloto({
      factory: new LlmFactory([{ ...estrategia(LlmProvider.ANTHROPIC), stream }]),
      threads,
      context,
    });

    return { service, stream };
  }

  const HILOS_BASE = () => ({
    resolve: jest.fn().mockResolvedValue({ id: 'hilo-1', title: 'x' }),
    history: jest.fn().mockResolvedValue([]),
    saveTurn: jest.fn().mockResolvedValue(undefined),
  });

  const consumir = async (iterable: AsyncIterable<LlmChunk>) => {
    const trozos: LlmChunk[] = [];
    for await (const chunk of iterable) trozos.push(chunk);
    return trozos;
  };

  describe('persistencia de hilos', () => {
    it('antepone el historial al mensaje nuevo', async () => {
      const threads = HILOS_BASE();
      threads.history.mockResolvedValue([
        { role: 'user', content: '¿de quién era el correo?' },
        { role: 'assistant', content: 'De Astrid.' },
      ]);
      const { service, stream } = conHilos(threads);

      await consumir(await service.chat('user-1', CUERPO_MINIMO));

      // Sin esto, "¿y ese correo de quién era?" no se puede responder: cada
      // turno empezaría de cero.
      expect(stream.mock.calls[0][0].messages).toEqual([
        { role: 'user', content: '¿de quién era el correo?' },
        { role: 'assistant', content: 'De Astrid.' },
        { role: 'user', content: CUERPO_MINIMO.message },
      ]);
    });

    it('guarda el turno al terminar, con el texto completo', async () => {
      const threads = HILOS_BASE();
      const { service } = conHilos(threads, undefined, [
        { type: 'text', text: 'Según ' },
        { type: 'text', text: 'el correo' },
        { type: 'done', model: 'claude-opus-5' },
      ]);

      await consumir(await service.chat('user-1', CUERPO_MINIMO));

      expect(threads.saveTurn).toHaveBeenCalledWith(
        'hilo-1',
        CUERPO_MINIMO.message,
        expect.objectContaining({ content: 'Según el correo', model: 'modelo-de-prueba' }),
      );
    });

    it('el threadId viaja en el cierre: en una conversación nueva el cliente no lo sabe', async () => {
      const { service } = conHilos(HILOS_BASE(), undefined, [
        { type: 'done', model: 'claude-opus-5' },
      ]);

      const trozos = await consumir(await service.chat('user-1', CUERPO_MINIMO));

      expect(trozos.at(-1)).toMatchObject({ type: 'done', threadId: 'hilo-1' });
    });

    it('si el cliente corta a media respuesta se guarda lo que se alcanzó a decir', async () => {
      const threads = HILOS_BASE();
      const { service } = conHilos(threads, undefined, [
        { type: 'text', text: 'media res' },
        { type: 'text', text: 'puesta' },
      ]);

      // Cortar el bucle es lo que hace el controlador cuando se cierra la
      // conexión SSE. Perder el turno dejaría una pregunta sin respuesta, que
      // al rehidratar el hilo el modelo leería como un silencio.
      for await (const chunk of await service.chat('user-1', CUERPO_MINIMO)) {
        if (chunk.type === 'text') break;
      }

      expect(threads.saveTurn).toHaveBeenCalledWith(
        'hilo-1',
        CUERPO_MINIMO.message,
        expect.objectContaining({ content: 'media res' }),
      );
    });

    it('un fallo al archivar no tumba la respuesta que el usuario ya recibió', async () => {
      const threads = HILOS_BASE();
      threads.saveTurn.mockRejectedValue(new Error('se cayó la base'));
      const { service } = conHilos(threads);

      await expect(consumir(await service.chat('user-1', CUERPO_MINIMO))).resolves.toHaveLength(1);
    });

    it('el hilo se resuelve antes de abrir el stream: un id ajeno da 404, no un stream cortado', async () => {
      const threads = HILOS_BASE();
      threads.resolve.mockRejectedValue(new NotFoundException('No existe la conversación'));
      const { service, stream } = conHilos(threads);

      await expect(service.chat('user-1', { ...CUERPO_MINIMO, threadId: 'ajeno' })).rejects.toThrow(
        NotFoundException,
      );
      expect(stream).not.toHaveBeenCalled();
    });
  });

  describe('contexto adjunto', () => {
    it('el contexto va detrás de las instrucciones de sistema, no en los mensajes', async () => {
      const context = { build: jest.fn().mockResolvedValue('\n<correo_seleccionado>…') };
      const { service, stream } = conHilos(HILOS_BASE(), context);

      await consumir(
        await service.chat('user-1', { ...CUERPO_MINIMO, context: { emailId: 'cmr1' } }),
      );

      expect(context.build).toHaveBeenCalledWith('user-1', { emailId: 'cmr1' });
      expect(stream.mock.calls[0][0].system).toContain('<correo_seleccionado>');
      // En el sistema y no en el historial: así no se confunde con lo que dijo
      // la persona, y no se guarda como parte de la conversación.
      expect(JSON.stringify(stream.mock.calls[0][0].messages)).not.toContain('correo_seleccionado');
    });

    it('sin contexto el prompt de sistema queda como estaba', async () => {
      const { service, stream } = conHilos(HILOS_BASE());

      await consumir(await service.chat('user-1', CUERPO_MINIMO));

      expect(stream.mock.calls[0][0].system).not.toContain('<');
    });
  });

  it('propaga la señal de cancelación para no seguir generando sin nadie al otro lado', async () => {
    const stream = jest.fn().mockReturnValue((async function* () {})());
    const service = copiloto({
      factory: new LlmFactory([{ ...estrategia(LlmProvider.ANTHROPIC), stream }]),
    });
    const abort = new AbortController();

    await service.chat('user-1', CUERPO_MINIMO, abort.signal);

    expect(stream.mock.calls[0][0].signal).toBe(abort.signal);
  });
});
