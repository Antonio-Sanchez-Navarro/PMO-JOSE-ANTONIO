import { TaskSource } from '@prisma/client';
import { EmailClassificationService } from './email-classification.service';
import { AiService } from './ai.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GmailService } from '../gmail/gmail.service';
import { GmailQuotaError } from '../gmail/gmail-quota';
import {
  emailConFechaRelativa,
  emailNoAccionable,
  emailSinTexto,
} from './__fixtures__/emails.fixture';

/**
 * Servicio compartido por el worker y el endpoint manual. Lo que se prueba aquí
 * es el contrato de persistencia: qué se borra, qué se crea y con qué marcas.
 */
describe('EmailClassificationService', () => {
  let service: EmailClassificationService;
  let ai: { analyzeEmail: jest.Mock };
  /** Solo se toca cuando el correo trae adjuntos. */
  let gmail: { fetchAttachment: jest.Mock };
  let prisma: any;
  let tx: any;

  const analisisConTarea = {
    isActionable: true,
    category: 'PROJECT_MANAGEMENT',
    aiConfidence: 0.9,
    tasks: [
      {
        title: 'Enviar cotización',
        description: 'ctx',
        priority: 'URGENT',
        tags: ['obra'],
        dueDate: new Date('2026-07-24'),
      },
    ],
  };

  const analisisSinTareas = {
    isActionable: false,
    category: 'INFORMATIONAL',
    aiConfidence: 0.95,
    tasks: [],
  };

  /**
   * Fase 6: lo que la IA propone ya no son filas de `Task`, es el JSON
   * `proposedTasks` que se escribe en el `Email` y espera aprobación humana.
   * Todo lo que antes se leía de `tx.task.create` se lee ahora de aquí.
   */
  const propuestas = () => tx.email.update.mock.calls[0][0].data.proposedTasks;

  /**
   * El cuarto argumento de `analyzeEmail`, nuevo en la Fase 6 y ampliado en la
   * Fase 8 con los adjuntos que viajan y los que no.
   */
  const sinHiloNiAdjuntos = {
    hasAttachments: false,
    threadContext: undefined,
    adjuntos: [],
    ausentes: [],
  };

  beforeEach(() => {
    tx = {
      task: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
      email: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      email: { 
        findUniqueOrThrow: jest.fn().mockResolvedValue(emailConFechaRelativa),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    gmail = { fetchAttachment: jest.fn().mockResolvedValue(Buffer.from('bytes')) };
    ai = { analyzeEmail: jest.fn().mockResolvedValue(analisisConTarea) };

    service = new EmailClassificationService(
      ai as unknown as AiService,
      prisma as unknown as PrismaService,
      gmail as unknown as GmailService,
    );
  });

  describe('classify — análisis sin escritura', () => {
    it('no toca la base de datos: ni tareas ni marca de procesado', async () => {
      await service.classify(emailConFechaRelativa.id, { forceActionable: false });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
      expect(tx.task.deleteMany).not.toHaveBeenCalled();
      expect(tx.email.update).not.toHaveBeenCalled();
    });

    it('devuelve las tareas propuestas sin id, porque aún no existen', async () => {
      const draft = await service.classify(emailConFechaRelativa.id, { forceActionable: false });

      expect(draft.tasks).toHaveLength(1);
      expect(draft.tasks[0]).not.toHaveProperty('id');
      // El título llega prefijado con el remitente de la cabecera (Sprint 4).
      expect(draft.tasks[0].title).toBe('[Elena R.] Enviar cotización');
      expect(draft.emailId).toBe(emailConFechaRelativa.id);
      expect(draft.aiConfidence).toBe(0.9);
    });

    it('la propuesta ya trae la prioridad escalada, no la del modelo', async () => {
      ai.analyzeEmail.mockResolvedValue({
        ...analisisConTarea,
        tasks: [
          {
            ...analisisConTarea.tasks[0],
            priority: 'LOW',
            dueDate: new Date(Date.now() + 3 * 3_600_000),
          },
        ],
      });

      const draft = await service.classify(emailConFechaRelativa.id, { forceActionable: false });

      // Si la cuarentena enseñara la prioridad cruda del modelo, el usuario
      // aprobaría una cosa y se guardaría otra.
      expect(draft.tasks[0].priority).toBe('URGENT');
    });

    it('sin forzar, un correo no accionable se devuelve vacío y honesto', async () => {
      ai.analyzeEmail.mockResolvedValue(analisisSinTareas);

      const draft = await service.classify(emailNoAccionable.id, { forceActionable: false });

      expect(draft.isActionable).toBe(false);
      expect(draft.tasks).toHaveLength(0);
      expect(draft.usedFallback).toBe(false);
    });

    it('falla igual que la vía que persiste si no hay texto', async () => {
      prisma.email.findUniqueOrThrow.mockResolvedValue(emailSinTexto);

      await expect(
        service.classify(emailSinTexto.id, { forceActionable: false }),
      ).rejects.toThrow(/no tiene texto/i);
      expect(ai.analyzeEmail).not.toHaveBeenCalled();
    });
  });

  it('falla si el correo no tiene texto que analizar', async () => {
    prisma.email.findUniqueOrThrow.mockResolvedValue(emailSinTexto);

    await expect(
      service.classifyAndPersist(emailSinTexto.id, { replaceExisting: true, forceActionable: false }),
    ).rejects.toThrow(/no tiene texto/i);
    expect(ai.analyzeEmail).not.toHaveBeenCalled();
  });

  it('usa el snippet cuando no hay bodyText', async () => {
    prisma.email.findUniqueOrThrow.mockResolvedValue({ ...emailNoAccionable, bodyText: null });
    ai.analyzeEmail.mockResolvedValue(analisisSinTareas);

    await service.classifyAndPersist(emailNoAccionable.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    expect(ai.analyzeEmail).toHaveBeenCalledWith(
      emailNoAccionable.subject,
      emailNoAccionable.snippet,
      emailNoAccionable.receivedAt,
      sinHiloNiAdjuntos,
    );
  });

  it('pasa la fecha de recepción como ancla temporal', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    expect(ai.analyzeEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      emailConFechaRelativa.receivedAt,
      sinHiloNiAdjuntos,
    );
  });

  it('pasa el contexto del hilo y la bandera de adjuntos (Fase 6)', async () => {
    prisma.email.findUniqueOrThrow.mockResolvedValue({
      ...emailConFechaRelativa,
      hasAttachments: true,
    });
    prisma.email.findMany.mockResolvedValue([
      { bodyText: 'Mensaje anterior del hilo', snippet: null },
    ]);

    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    // El hilo se busca por `threadId` y solo hacia atrás: un mensaje posterior
    // no es contexto de este, es una respuesta que aún no existía.
    const where = prisma.email.findMany.mock.calls[0][0].where;
    expect(where.threadId).toBe(emailConFechaRelativa.threadId);
    expect(where.receivedAt).toEqual({ lt: emailConFechaRelativa.receivedAt });

    expect(ai.analyzeEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Date),
      expect.objectContaining({ hasAttachments: true, threadContext: 'Mensaje anterior del hilo' }),
    );
  });

  /**
   * C2 — el hilo entra acotado.
   *
   * Sin techo, un hilo largo se manda entero en **cada** clasificación de la
   * tanda: son tokens de entrada que se pagan una y otra vez, y `max_tokens`
   * solo acota la respuesta. La factura aparecería después, en `pmo-coste-ia`,
   * sin nada que la explicara.
   */
  describe('C2 · techo del contexto del hilo', () => {
    const audiencia = () => ai.analyzeEmail.mock.calls[0][3].threadContext as string;

    it('pide como mucho 10 mensajes anteriores, y los más recientes', async () => {
      prisma.email.findMany.mockResolvedValue([{ bodyText: 'uno', snippet: null }]);

      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      const consulta = prisma.email.findMany.mock.calls[0][0];
      expect(consulta.take).toBe(10);
      // Descendente y no ascendente: se piden los últimos para que el recorte
      // sacrifique lo más antiguo, que es lo menos relevante.
      expect(consulta.orderBy).toEqual({ receivedAt: 'desc' });
    });

    it('los devuelve en el orden en que ocurrieron, no en el que se pidieron', async () => {
      // La base los da del más nuevo al más viejo…
      prisma.email.findMany.mockResolvedValue([
        { bodyText: 'el ultimo', snippet: null },
        { bodyText: 'el primero', snippet: null },
      ]);

      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      // …y el modelo tiene que leerlos al revés, o la conversación no se
      // entiende y las fechas relativas del hilo salen del revés.
      expect(audiencia()).toBe(['el primero', 'el ultimo'].join('\n---\n'));
    });

    it('recorta por caracteres cuando un solo mensaje se pasa de largo', async () => {
      prisma.email.findMany.mockResolvedValue([
        { bodyText: 'x'.repeat(20_000), snippet: null },
        { bodyText: 'este ya no cabe', snippet: null },
      ]);

      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      // El tope es 12.000: entra el recorte del más reciente y el viejo se cae
      // entero. Lo que no puede pasar es que se mande el hilo completo.
      expect(audiencia()).toHaveLength(12_000);
      expect(audiencia()).not.toContain('este ya no cabe');
    });

    it('sin mensajes anteriores no inventa contexto', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      // `undefined` y no cadena vacía: el prompt no debe llevar una sección de
      // historial vacía, que el modelo leería como «aquí no hubo nada».
      expect(ai.analyzeEmail.mock.calls[0][3].threadContext).toBeUndefined();
    });
  });

  /**
   * Antes esto se llamaba `replaceExisting` y probaba un `deleteMany` acotado
   * al origen `EMAIL`. Con la Fase 6 la IA no crea filas, así que no hay nada
   * que borrar: el reproceso se resuelve **reemplazando el borrador entero**.
   * El nombre del bloque cambia para no prometer un borrado que ya no ocurre.
   */
  describe('reproceso — el borrador se reemplaza, no se acumula', () => {
    it('el reproceso no toca la tabla Task: la IA ya no escribe ahí', async () => {
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      expect(tx.task.deleteMany).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('cada pasada reescribe `proposedTasks` entero, sin duplicar', async () => {
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      // Dos pasadas, dos escrituras, y la segunda con **una** tarea: si el
      // borrador se anexara en vez de sustituirse, aquí saldrían dos.
      expect(tx.email.update).toHaveBeenCalledTimes(2);
      expect(tx.email.update.mock.calls[1][0].data.proposedTasks).toHaveLength(1);
    });

    // ⚠️ `replaceExisting` sigue en la firma y `ai.processor.ts` lo pasa en
    // `true`, pero desde la Fase 6 **no cambia nada**. Este test lo deja
    // escrito para que no se lea como una opción viva: o se retira el
    // parámetro, o se le devuelve un significado. Ver buzón del 2026-09-08.
    it('hoy `replaceExisting` no cambia el comportamiento', async () => {
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });
      const conBorrado = tx.email.update.mock.calls[0][0].data.proposedTasks;

      tx.email.update.mockClear();

      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: false,
        forceActionable: false,
      });
      const sinBorrado = tx.email.update.mock.calls[0][0].data.proposedTasks;

      expect(sinBorrado).toEqual(conBorrado);
    });

    it('no borra nada en la vía manual', async () => {
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: false,
        forceActionable: true,
      });

      expect(tx.task.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('forceActionable', () => {
    it('no crea tareas si el modelo dice que no es accionable', async () => {
      ai.analyzeEmail.mockResolvedValue(analisisSinTareas);

      const result = await service.classifyAndPersist(emailNoAccionable.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      expect(tx.task.create).not.toHaveBeenCalled();
      expect(result.tasks).toHaveLength(0);
      expect(result.isActionable).toBe(false);
    });

    it('crea una tarea desde el asunto cuando se fuerza y el modelo no extrajo nada', async () => {
      ai.analyzeEmail.mockResolvedValue(analisisSinTareas);
      prisma.email.findUniqueOrThrow.mockResolvedValue(emailNoAccionable);

      const result = await service.classifyAndPersist(emailNoAccionable.id, {
        replaceExisting: false,
        forceActionable: true,
      });

      expect(result.usedFallback).toBe(true);
      expect(result.isActionable).toBe(true);
      // Fase 6: ni forzando se crea una fila. Se propone y espera aprobación.
      expect(tx.task.create).not.toHaveBeenCalled();

      const [propuesta] = propuestas();
      // El respaldo desde el asunto lleva el mismo prefijo que el resto.
      expect(propuesta.title).toBe(`[Boletín F.] ${emailNoAccionable.subject}`);
      expect(propuesta.priority).toBe('MEDIUM');
      // El origen viaja en el borrador: la propuso una persona forzando, no el
      // criterio del modelo, y eso hay que poder distinguirlo en la cuarentena.
      expect(propuesta.source).toBe(TaskSource.MANUAL);
    });

    it('respeta las tareas del modelo cuando sí extrajo alguna', async () => {
      const result = await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: false,
        forceActionable: true,
      });

      expect(result.usedFallback).toBe(false);
      // La tarea sigue siendo la del modelo; lo que cambia es que se propone
      // con el prefijo de contexto delante (Sprint 4).
      expect(propuestas()[0].title).toBe('[Elena R.] Enviar cotización');
    });
  });

  it('persiste categoría, isActionable y processedAt en la misma transacción', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const data = tx.email.update.mock.calls[0][0].data;
    expect(data.category).toBe('PROJECT_MANAGEMENT');
    expect(data.isActionable).toBe(true);
    expect(data.processedAt).toBeInstanceOf(Date);
  });

  it('el borrador traslada dueDate y marca el origen EMAIL', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    const [propuesta] = propuestas();
    // Cadena ISO y no `Date`: lo que se guarda es JSON, y es exactamente lo
    // que se relee. Mientras el tipo decía `Date`, esta prueba pasaba con un
    // objeto que la columna nunca llegó a contener.
    expect(propuesta.dueDate).toBe('2026-07-24T00:00:00.000Z');
    // `sourceEmailId` y `userId` ya no viajan en cada tarea: el borrador vive
    // dentro de la fila del correo, que es quien los tiene.
    expect(propuesta.source).toBe(TaskSource.EMAIL);
  });

  /**
   * Esto era un `it.todo`: `aiConfidence` se calculaba y se perdía. P2 lo
   * resuelve metiéndolo **en el borrador**, que es lo único que sobrevive entre
   * que la IA propone y una persona aprueba —pueden ser días—. Guardarlo solo
   * en el resultado del análisis no habría servido: ese objeto muere con la
   * petición.
   */
  it('la confianza del análisis viaja dentro de cada propuesta', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    expect(propuestas()[0].aiConfidence).toBe(0.9);
  });

  it('el respaldo desde el asunto hereda la confianza del análisis, no una inventada', async () => {
    ai.analyzeEmail.mockResolvedValue(analisisSinTareas);
    prisma.email.findUniqueOrThrow.mockResolvedValue(emailNoAccionable);

    await service.classifyAndPersist(emailNoAccionable.id, {
      replaceExisting: false,
      forceActionable: true,
    });

    // Forzar no mejora lo seguro que estaba el modelo: solo dice que una
    // persona quiso una tarea igualmente.
    expect(propuestas()[0].aiConfidence).toBe(0.95);
  });

  // El detalle de las reglas se prueba en `priority.rules.spec.ts`; aquí solo
  // se comprueba que lo que se persiste pasa por ellas.
  describe('capa determinista de prioridad', () => {
    const conFecha = (priority: string, dueDate: Date | null) => ({
      ...analisisConTarea,
      tasks: [{ ...analisisConTarea.tasks[0], priority, dueDate }],
    });

    const priorityPersistida = () => propuestas()[0].priority;

    const clasificar = () =>
      service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

    it('persiste la prioridad escalada, no la del modelo', async () => {
      ai.analyzeEmail.mockResolvedValue(conFecha('LOW', new Date(Date.now() + 3 * 3_600_000)));

      await clasificar();

      expect(priorityPersistida()).toBe('URGENT');
    });

    it('deja intacta la prioridad del modelo si no hay fecha', async () => {
      ai.analyzeEmail.mockResolvedValue(conFecha('LOW', null));

      await clasificar();

      expect(priorityPersistida()).toBe('LOW');
    });

    it('no rebaja lo que dijo el modelo', async () => {
      ai.analyzeEmail.mockResolvedValue(conFecha('URGENT', new Date(Date.now() + 400 * 3_600_000)));

      await clasificar();

      expect(priorityPersistida()).toBe('URGENT');
    });
  });
});

/**
 * El prefijo de contexto (Sprint 4) se compone en esta capa, no en el modelo:
 * ver el porqué en `title.prefix.ts`.
 */
describe('EmailClassificationService — prefijo de contexto en los títulos', () => {
  let service: EmailClassificationService;
  let ai: { analyzeEmail: jest.Mock };
  /** Solo se toca cuando el correo trae adjuntos. */
  let gmail: { fetchAttachment: jest.Mock };
  let prisma: any;
  let tx: any;

  const analisis = (extra: Record<string, unknown>) => ({
    isActionable: true,
    category: 'PROJECT_MANAGEMENT',
    aiConfidence: 0.9,
    senderName: 'Astrid R.',
    project: 'Citrotarte',
    tasks: [
      { title: 'Solicitar inmueble en garantía', description: '', priority: 'MEDIUM', tags: [], dueDate: null },
      { title: 'Confirmar tipo de cambio', description: '', priority: 'MEDIUM', tags: [], dueDate: null },
    ],
    ...extra,
  });

  beforeEach(() => {
    tx = {
      task: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 't', ...data })),
      },
      email: { update: jest.fn() },
    };
    prisma = {
      email: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...emailConFechaRelativa,
          // El remitente del prefijo sale de aquí, no del modelo.
          from: 'Astrid Robles <astrid@example.test>',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    gmail = { fetchAttachment: jest.fn().mockResolvedValue(Buffer.from('bytes')) };
    ai = { analyzeEmail: jest.fn().mockResolvedValue(analisis({})) };

    service = new EmailClassificationService(
      ai as unknown as AiService,
      prisma as unknown as PrismaService,
      gmail as unknown as GmailService,
    );
  });

  it('prefija y numera las tareas propuestas', async () => {
    const draft = await service.classify(emailConFechaRelativa.id, { forceActionable: false });

    expect(draft.tasks.map((t) => t.title)).toEqual([
      '[Astrid R. - Citrotarte 1/2] Solicitar inmueble en garantía',
      '[Astrid R. - Citrotarte 2/2] Confirmar tipo de cambio',
    ]);
  });

  it('sin remitente ni proyecto deja los títulos como los dio el modelo', async () => {
    // Sin cabecera aprovechable y sin nada del modelo no hay prefijo posible.
    prisma.email.findUniqueOrThrow.mockResolvedValue({ ...emailConFechaRelativa, from: '' });
    ai.analyzeEmail.mockResolvedValue(analisis({ senderName: null, project: null }));

    const draft = await service.classify(emailConFechaRelativa.id, { forceActionable: false });

    expect(draft.tasks[0].title).toBe('Solicitar inmueble en garantía');
  });

  it('el contador cuenta las tareas que van a existir, no las que propuso el modelo', async () => {
    // El modelo no ve nada accionable y una persona fuerza: la lista se sustituye
    // por una sola tarea desde el asunto, y el prefijo no puede decir "1/2".
    ai.analyzeEmail.mockResolvedValue(analisis({ isActionable: false, tasks: [] }));

    const draft = await service.classify(emailConFechaRelativa.id, { forceActionable: true });

    expect(draft.tasks).toHaveLength(1);
    expect(draft.tasks[0].title).toContain('[Astrid R. - Citrotarte]');
    expect(draft.tasks[0].title).not.toContain('/');
  });

  it('el borrador que se guarda lleva el prefijo, no solo el que se devuelve', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    const filas = tx.email.update.mock.calls[0][0].data.proposedTasks;
    expect(filas.map((f: { title: string }) => f.title)).toEqual([
      '[Astrid R. - Citrotarte 1/2] Solicitar inmueble en garantía',
      '[Astrid R. - Citrotarte 2/2] Confirmar tipo de cambio',
    ]);
  });
});

describe('EmailClassificationService — adjuntos para el modelo (Fase 8)', () => {
  let service: EmailClassificationService;
  let prisma: any;
  let ai: { analyzeEmail: jest.Mock };
  let gmail: { fetchAttachment: jest.Mock };
  let tx: any;

  const ficha = (extra: Record<string, unknown> = {}) => ({
    attachmentId: 'att-1',
    filename: 'contrato.pdf',
    mimeType: 'application/pdf',
    size: 50_000,
    inline: false,
    ...extra,
  });

  /** El correo que lee `analyze`, con las fichas que pida cada prueba. */
  const conAdjuntos = (attachments: unknown) => ({
    ...emailConFechaRelativa,
    hasAttachments: true,
    gmailMessageId: 'gmail-msg-1',
    attachments,
  });

  beforeEach(() => {
    tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      email: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      email: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(conAdjuntos([ficha()])),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)),
    };
    ai = {
      analyzeEmail: jest.fn().mockResolvedValue({
        isActionable: false,
        category: 'OTHER',
        aiConfidence: 0.5,
        tasks: [],
        senderName: null,
        project: null,
        company: null,
        bank: null,
      }),
    };
    gmail = { fetchAttachment: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 de mentira')) };

    service = new EmailClassificationService(
      ai as unknown as AiService,
      prisma as unknown as PrismaService,
      gmail as unknown as GmailService,
    );
  });

  const clasificar = () =>
    service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

  it('baja el adjunto y se lo pasa al modelo', async () => {
    await clasificar();

    expect(gmail.fetchAttachment).toHaveBeenCalledWith(
      emailConFechaRelativa.userId,
      'gmail-msg-1',
      'att-1',
    );

    const opciones = ai.analyzeEmail.mock.calls[0][3];
    expect(opciones.adjuntos).toHaveLength(1);
    expect(opciones.adjuntos[0]).toEqual(
      expect.objectContaining({ filename: 'contrato.pdf', forma: 'document' }),
    );
    expect(opciones.ausentes).toEqual([]);
  });

  it('un correo sin fichas no gasta ni una llamada a Gmail', async () => {
    // Es el caso mayoritario: la epica no puede costar una peticion por correo.
    prisma.email.findUniqueOrThrow.mockResolvedValue(conAdjuntos(null));

    await clasificar();

    expect(gmail.fetchAttachment).not.toHaveBeenCalled();
  });

  describe('un adjunto que falla no puede tumbar la clasificación', () => {
    it('si no se deja bajar, se clasifica igual y se dice que falta', async () => {
      // Una excepcion que suba aqui es un correo que no se clasifica en
      // absoluto, y encima uno que el worker reintentara hasta cansarse.
      gmail.fetchAttachment.mockRejectedValue(new Error('Gmail dijo que no'));

      await expect(clasificar()).resolves.toBeDefined();

      const opciones = ai.analyzeEmail.mock.calls[0][3];
      expect(opciones.adjuntos).toEqual([]);
      expect(opciones.ausentes).toEqual([
        { filename: 'contrato.pdf', motivo: 'no se pudo descargar' },
      ]);
    });

    it('el que falla no arrastra al que sí bajó', async () => {
      prisma.email.findUniqueOrThrow.mockResolvedValue(
        conAdjuntos([
          ficha({ attachmentId: 'a', filename: 'bueno.pdf' }),
          ficha({ attachmentId: 'b', filename: 'roto.pdf' }),
        ]),
      );
      gmail.fetchAttachment.mockImplementation((_u: string, _m: string, id: string) =>
        id === 'b' ? Promise.reject(new Error('no')) : Promise.resolve(Buffer.from('ok')),
      );

      await clasificar();

      const opciones = ai.analyzeEmail.mock.calls[0][3];
      expect(opciones.adjuntos.map((a: { filename: string }) => a.filename)).toEqual([
        'bueno.pdf',
      ]);
      expect(opciones.ausentes[0].filename).toBe('roto.pdf');
    });

    it('pero la cuota SÍ sube: no es este adjunto, es que Google paró', async () => {
      // Seguir bajando los otros cuatro solo hunde mas el cubo. Sube para que
      // el worker frene la cola, igual que hace la ingesta.
      gmail.fetchAttachment.mockRejectedValue(new GmailQuotaError({ code: 429 }, 'bajando'));

      await expect(clasificar()).rejects.toBeInstanceOf(GmailQuotaError);
    });
  });

  it('lo incrustado no llega al modelo: es el logo de la firma', async () => {
    prisma.email.findUniqueOrThrow.mockResolvedValue(
      conAdjuntos([ficha({ mimeType: 'image/png', filename: 'logo.png', inline: true })]),
    );

    await clasificar();

    expect(gmail.fetchAttachment).not.toHaveBeenCalled();
    const opciones = ai.analyzeEmail.mock.calls[0][3];
    expect(opciones.adjuntos).toEqual([]);
    expect(opciones.ausentes).toEqual([]);
  });

  it('lo que no cabe se nombra como ausente sin llegar a bajarse', async () => {
    prisma.email.findUniqueOrThrow.mockResolvedValue(
      conAdjuntos([ficha({ filename: 'planos.pdf', size: 30 * 1024 * 1024 })]),
    );

    await clasificar();

    expect(gmail.fetchAttachment).not.toHaveBeenCalled();
    expect(ai.analyzeEmail.mock.calls[0][3].ausentes[0].filename).toBe('planos.pdf');
  });

  it('una fila corrupta en la columna no rompe nada', async () => {
    prisma.email.findUniqueOrThrow.mockResolvedValue(conAdjuntos(['no soy una ficha', 42]));

    await expect(clasificar()).resolves.toBeDefined();
    expect(gmail.fetchAttachment).not.toHaveBeenCalled();
  });
});
