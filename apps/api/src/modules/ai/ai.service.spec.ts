import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { emailConFechaRelativa } from './__fixtures__/emails.fixture';
import * as R from './__fixtures__/ai-responses.fixture';
import { BANCOS, EMPRESAS } from '@pmo/shared';

/**
 * El SDK se sustituye por un doble: estas pruebas verifican **nuestro** contrato
 * de validación y parseo, no la calidad del modelo. No hay llamadas de red ni
 * consumo de tokens.
 */
const create = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class {
    messages = { create };
  },
}));

/** Envuelve una salida cruda en la forma que devuelve la API. */
const comoRespuestaDeHerramienta = (input: unknown) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'extract_email_tasks', input }],
});

const analizar = (service: AiService) =>
  service.analyzeEmail(
    emailConFechaRelativa.subject!,
    emailConFechaRelativa.bodyText!,
    emailConFechaRelativa.receivedAt,
  );

describe('AiService', () => {
  let service: AiService;

  /** El contador de costes: no decide nada aqui, solo se le llama. */
  const costesDeMentira = () =>
    ({ registrar: jest.fn().mockResolvedValue(undefined) }) as never;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue('sk-ant-de-prueba'),
      getOrThrow: jest.fn().mockReturnValue('claude-sonnet-5'),
    } as unknown as ConfigService;
    service = new AiService(config, costesDeMentira());
  });

  it('exige ANTHROPIC_API_KEY al construirse', () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
      getOrThrow: jest.fn().mockReturnValue('claude-sonnet-5'),
    } as unknown as ConfigService;
    expect(() => new AiService(config, costesDeMentira())).toThrow(/ANTHROPIC_API_KEY/);
  });


  /**
   * Fase 8 · banco y empresa.
   *
   * Van como vocabulario cerrado por lo mismo que `category`: mientras fue
   * texto libre, la API acepto salidas corruptas del modelo dentro del valor. Y
   * aqui hay un motivo extra — estos dos campos se convierten en pestañas de la
   * bandeja, asi que "Santander", "SANTANDER" y "santander" serian tres.
   */
  describe('banco y empresa (vocabularios cerrados)', () => {
    /** La salida minima del modelo, con lo que pida cada prueba encima. */
    const salida = (extra: Record<string, unknown>) => ({
      isActionable: false,
      category: 'OTHER',
      aiConfidence: 0.5,
      tasks: [],
      senderName: null,
      project: null,
      company: null,
      bank: null,
      ...extra,
    });

    it('acepta un banco y una empresa de la lista', async () => {
      create.mockResolvedValue(
        comoRespuestaDeHerramienta(salida({ bank: 'Konfio', company: 'Tecnoresin' })),
      );

      const result = await analizar(service);

      expect(result.bank).toBe('Konfio');
      expect(result.company).toBe('Tecnoresin');
    });

    it('normaliza mayusculas y espacios a la forma canonica', async () => {
      // El modelo escribe lo que ve en el correo. Tres grafias del mismo banco
      // parten en tres una pestaña que deberia ser una.
      create.mockResolvedValue(
        comoRespuestaDeHerramienta(salida({ bank: '  SANTANDER ', company: 'urbazepto' })),
      );

      const result = await analizar(service);

      expect(result.bank).toBe('Santander');
      expect(result.company).toBe('Urbazepto');
    });

    it('lo que no esta en la lista degrada a null, no a un valor de respaldo', async () => {
      // Un banco que no reconocemos no es «otro banco»: es que en ese correo no
      // hay ninguno de los nuestros. Un OTHER aqui seria una pestaña llena de
      // correos que no tienen nada en comun.
      create.mockResolvedValue(
        comoRespuestaDeHerramienta(salida({ bank: 'BBVA', company: 'Otra SA' })),
      );

      const result = await analizar(service);

      expect(result.bank).toBeNull();
      expect(result.company).toBeNull();
    });

    it('null se queda en null: es la respuesta correcta y la mas frecuente', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(salida({})));

      const result = await analizar(service);

      expect(result.bank).toBeNull();
      expect(result.company).toBeNull();
    });

    it('un valor que no es texto no tira la extraccion entera', async () => {
      // Las tareas son lo que de verdad importa: un banco raro no puede
      // llevarse por delante el analisis completo.
      create.mockResolvedValue(
        comoRespuestaDeHerramienta(salida({ bank: 42, tasks: [] })),
      );

      const result = await analizar(service);

      expect(result.bank).toBeNull();
      expect(result.category).toBe('OTHER');
    });

    it('los dos campos van en el esquema Y en su required', async () => {
      // `strict: true` exige que `required` liste **todas** las propiedades del
      // objeto: añadir una al esquema y olvidarla aqui hace que la API rechace
      // la llamada entera, no solo ese campo.
      create.mockResolvedValue(comoRespuestaDeHerramienta(salida({})));

      await analizar(service);

      const esquema = create.mock.calls[0][0].tools[0].input_schema as {
        required: string[];
        properties: Record<string, unknown>;
      };

      expect(esquema.required).toEqual(expect.arrayContaining(['company', 'bank']));
      expect(Object.keys(esquema.properties)).toEqual(
        expect.arrayContaining(['company', 'bank']),
      );
    });


  });


  /**
   * Fase 8 · los adjuntos que el modelo ve, y el aviso sobre los que no.
   *
   * Hasta ahora el prompt decia siempre «NO puedes ver su contenido», y era
   * verdad. Ahora depende, y **el aviso tiene que seguir al hecho**: quitarlo
   * del todo hace que el modelo escriba «segun el documento adjunto...» sobre
   * uno que no vio; dejarlo puesto cuando si lo ve le prohibe usar justo lo que
   * acabamos de pagar por mandarle.
   */
  describe('adjuntos', () => {
    const pdf = {
      filename: 'contrato.pdf',
      mimeType: 'application/pdf',
      forma: 'document' as const,
      contenido: Buffer.from('%PDF-1.4'),
    };

    const analizarCon = (opciones: Record<string, unknown>) =>
      service.analyzeEmail(
        emailConFechaRelativa.subject!,
        emailConFechaRelativa.bodyText!,
        emailConFechaRelativa.receivedAt,
        opciones,
      );

    beforeEach(() => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaAccionable));
    });

    it('el texto va primero y los archivos detras', async () => {
      // El cuerpo dice PARA QUE sirve el adjunto: leerlo antes le da al modelo
      // el marco con el que mirar el documento. Al reves, el PDF llega solo.
      await analizarCon({ hasAttachments: true, adjuntos: [pdf] });

      const bloques = create.mock.calls[0][0].messages[0].content;
      expect(bloques[0].type).toBe('text');
      expect(bloques[1].type).toBe('document');
      expect(bloques[1].source.media_type).toBe('application/pdf');
      expect(bloques[1].title).toBe('contrato.pdf');
    });

    it('una imagen viaja como bloque image con su tipo', async () => {
      await analizarCon({
        hasAttachments: true,
        adjuntos: [{ ...pdf, filename: 'plano.png', mimeType: 'image/png', forma: 'image' }],
      });

      const bloques = create.mock.calls[0][0].messages[0].content;
      expect(bloques[1]).toEqual(
        expect.objectContaining({
          type: 'image',
          source: expect.objectContaining({ media_type: 'image/png' }),
        }),
      );
    });

    it('el contenido viaja en base64', async () => {
      await analizarCon({ hasAttachments: true, adjuntos: [pdf] });

      const bloque = create.mock.calls[0][0].messages[0].content[1];
      expect(bloque.source.data).toBe(Buffer.from('%PDF-1.4').toString('base64'));
    });

    it('con adjuntos mandados, el prompt le dice que los lea', async () => {
      await analizarCon({ hasAttachments: true, adjuntos: [pdf] });

      const system = create.mock.calls[0][0].system as string;
      expect(system).toContain('ADJUNTOS');
      expect(system).not.toContain('NO puedes ver su contenido');
    });

    it('con adjuntos ausentes, los nombra uno a uno', async () => {
      // Es lo que impide que el modelo hable de lo que no ha visto.
      await analizarCon({
        hasAttachments: true,
        adjuntos: [pdf],
        ausentes: [{ filename: 'planos.pdf', motivo: 'demasiado grande (20.0 MB)' }],
      });

      const system = create.mock.calls[0][0].system as string;
      expect(system).toContain('planos.pdf');
      expect(system).toContain('demasiado grande');
      expect(system).toContain('ADJUNTOS QUE NO PUEDES VER');
      // Y la orden explicita: nombrarlos no basta si no se le prohibe hablar
      // de lo que contienen.
      expect(system).toContain('NUNCA afirmes');
    });

    it('si no se mando ninguno, sigue el aviso de siempre', async () => {
      // El unico caso en el que el texto anterior valia entero.
      await analizarCon({ hasAttachments: true, adjuntos: [], ausentes: [] });

      const system = create.mock.calls[0][0].system as string;
      expect(system).toContain('NO puedes ver su contenido');
    });

    it('sin adjuntos, el prompt no habla de adjuntos', async () => {
      await analizarCon({ hasAttachments: false });

      const system = create.mock.calls[0][0].system as string;
      expect(system).not.toContain('ADJUNTOS');
      expect(system).not.toContain('adjuntos pero NO puedes ver');
    });

    it('sin opciones se comporta como siempre: un solo bloque de texto', async () => {
      await analizarCon({});

      const bloques = create.mock.calls[0][0].messages[0].content;
      expect(bloques).toHaveLength(1);
      expect(bloques[0].type).toBe('text');
    });
  });

  describe('extracción de dueDate', () => {
    it('convierte la fecha del modelo en Date', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaAccionable));
      const result = await analizar(service);

      expect(result.tasks[0].dueDate).toEqual(new Date('2026-07-24'));
      expect(result.tasks[0].priority).toBe('URGENT');
    });

    it('deja dueDate en null cuando el correo no menciona fecha', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaSinFecha));
      const result = await analizar(service);

      expect(result.tasks[0].dueDate).toBeNull();
    });

    it('degrada a null una fecha no parseable en vez de romper', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaFechaInvalida));
      const result = await analizar(service);

      expect(result.tasks[0].dueDate).toBeNull();
      expect(result.tasks[0].title).toBe('Agendar reunión');
    });

    it('envía la fecha de recepción como ancla temporal en el prompt', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaAccionable));
      await analizar(service);

      // Desde la Fase 8 el contenido es una lista de bloques —el texto y, si
      // los hay, los adjuntos— y no una cadena suelta: el ancla vive en el
      // primer bloque, que es el de texto y va siempre delante.
      const enviado = create.mock.calls[0][0];
      expect(enviado.messages[0].content[0]).toEqual(
        expect.objectContaining({ type: 'text' }),
      );
      expect(enviado.messages[0].content[0].text).toContain('Fecha de recepción: 2026-07-22');
    });
  });

  describe('categoría', () => {
    it('declara la categoría como enum cerrado en el esquema de la herramienta', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaAccionable));
      await analizar(service);

      const tool = create.mock.calls[0][0].tools[0];
      expect(tool.input_schema.properties.category.enum).toEqual([
        'PROJECT_MANAGEMENT',
        'INVOICING',
        'MEETING',
        'INFORMATIONAL',
        'OTHER',
      ]);
    });

    // REGRESIÓN: capturas literales del reproceso del 2026-07-25.
    it.each([
      ['serialización incrustada', R.respuestaCategoriaCorrupta],
      ['comillas sueltas', R.respuestaCategoriaConBasura],
    ])('degrada a OTHER una categoría corrupta (%s)', async (_caso, respuesta) => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(respuesta));
      const result = await analizar(service);

      expect(result.category).toBe('OTHER');
    });
  });

  describe('validación de la salida', () => {
    it('acota aiConfidence al rango [0,1]', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaCategoriaCorrupta));
      const result = await analizar(service);

      expect(result.aiConfidence).toBe(1); // el fixture trae 1.98
    });

    it('rechaza una prioridad fuera del enum', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaPrioridadInvalida));
      await expect(analizar(service)).rejects.toThrow(/prioridad inválida/i);
    });

    it('rechaza una tarea sin título', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaSinTitulo));
      await expect(analizar(service)).rejects.toThrow(/no tiene título/i);
    });

    it('rechaza una respuesta sin bloque tool_use', async () => {
      create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hola' }] });
      await expect(analizar(service)).rejects.toThrow(/no devolvió un bloque tool_use/i);
    });

    it('propaga un rechazo del modelo', async () => {
      create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
      await expect(analizar(service)).rejects.toThrow(/rechazó analizar/i);
    });

    it('no devuelve tareas cuando el correo no es accionable', async () => {
      create.mockResolvedValue(comoRespuestaDeHerramienta(R.respuestaNoAccionable));
      const result = await analizar(service);

      expect(result.isActionable).toBe(false);
      expect(result.tasks).toHaveLength(0);
    });
  });
});
