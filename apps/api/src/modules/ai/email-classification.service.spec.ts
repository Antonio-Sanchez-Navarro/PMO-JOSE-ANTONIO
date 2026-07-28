import { TaskSource } from '@prisma/client';
import { EmailClassificationService } from './email-classification.service';
import { AiService } from './ai.service';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  beforeEach(() => {
    tx = {
      task: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
      email: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      email: { findUniqueOrThrow: jest.fn().mockResolvedValue(emailConFechaRelativa) },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    ai = { analyzeEmail: jest.fn().mockResolvedValue(analisisConTarea) };

    service = new EmailClassificationService(
      ai as unknown as AiService,
      prisma as unknown as PrismaService,
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
      expect(draft.tasks[0].title).toBe('Enviar cotización');
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
    );
  });

  describe('replaceExisting', () => {
    it('borra las tareas previas del correo cuando es un reproceso', async () => {
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      expect(tx.task.deleteMany).toHaveBeenCalledWith({
        where: { sourceEmailId: emailConFechaRelativa.id, source: TaskSource.EMAIL },
      });
    });

    it('acota el borrado al origen EMAIL: lo manual sobrevive al reproceso', async () => {
      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      const where = tx.task.deleteMany.mock.calls[0][0].where;
      expect(where.source).toBe(TaskSource.EMAIL);
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
      expect(tx.task.create).toHaveBeenCalledTimes(1);

      const creada = tx.task.create.mock.calls[0][0].data;
      expect(creada.title).toBe(emailNoAccionable.subject);
      expect(creada.priority).toBe('MEDIUM');
      // El origen es lo que la protege del borrado en un reproceso posterior:
      // la creó una persona forzando, no el criterio del modelo.
      expect(creada.source).toBe(TaskSource.MANUAL);
    });

    it('respeta las tareas del modelo cuando sí extrajo alguna', async () => {
      const result = await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: false,
        forceActionable: true,
      });

      expect(result.usedFallback).toBe(false);
      expect(tx.task.create.mock.calls[0][0].data.title).toBe('Enviar cotización');
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

  it('traslada dueDate y aiConfidence del análisis a la tarea', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    const creada = tx.task.create.mock.calls[0][0].data;
    expect(creada.dueDate).toEqual(new Date('2026-07-24'));
    expect(creada.aiConfidence).toBe(0.9);
    expect(creada.sourceEmailId).toBe(emailConFechaRelativa.id);
    expect(creada.userId).toBe(emailConFechaRelativa.userId);
    // Sin este marcado explícito el default del schema (MANUAL) blindaría las
    // tareas de la IA y el reproceso dejaría de reemplazarlas.
    expect(creada.source).toBe(TaskSource.EMAIL);
  });

  // El detalle de las reglas se prueba en `priority.rules.spec.ts`; aquí solo
  // se comprueba que lo que se persiste pasa por ellas.
  describe('capa determinista de prioridad', () => {
    const conFecha = (priority: string, dueDate: Date | null) => ({
      ...analisisConTarea,
      tasks: [{ ...analisisConTarea.tasks[0], priority, dueDate }],
    });

    const priorityPersistida = () => tx.task.create.mock.calls[0][0].data.priority;

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
      email: { findUniqueOrThrow: jest.fn().mockResolvedValue(emailConFechaRelativa) },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    ai = { analyzeEmail: jest.fn().mockResolvedValue(analisis({})) };

    service = new EmailClassificationService(
      ai as unknown as AiService,
      prisma as unknown as PrismaService,
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

  it('las tareas que se persisten llevan el prefijo, no solo las propuestas', async () => {
    await service.classifyAndPersist(emailConFechaRelativa.id, {
      replaceExisting: true,
      forceActionable: false,
    });

    const filas = tx.task.create.mock.calls.map((c: any[]) => c[0].data);
    expect(filas.map((f: { title: string }) => f.title)).toEqual([
      '[Astrid R. - Citrotarte 1/2] Solicitar inmueble en garantía',
      '[Astrid R. - Citrotarte 2/2] Confirmar tipo de cambio',
    ]);
  });
});
