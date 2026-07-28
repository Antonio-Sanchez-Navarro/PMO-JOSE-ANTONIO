import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmailStatus, TaskSource } from '@prisma/client';
import { EmailsService } from './emails.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailClassificationService } from '../ai/email-classification.service';
import { TasksGateway } from '../tasks/tasks.gateway';
import { emailNoAccionable, emailSinTexto } from '../ai/__fixtures__/emails.fixture';

const USER_ID = 'user-1';

/**
 * El gateway se renueva antes de cada prueba, incluidas las de los `describe`
 * de abajo: este `beforeEach` se registra primero y corre antes que los suyos,
 * que son los que construyen el servicio.
 */
let gateway: { emitTaskCreated: jest.Mock };
beforeEach(() => {
  gateway = { emitTaskCreated: jest.fn() };
});

describe('EmailsService — POST /emails/:id/to-task', () => {
  let service: EmailsService;
  let prisma: any;
  let classification: { classifyAndPersist: jest.Mock; classify: jest.Mock };

  beforeEach(() => {
    prisma = {
      email: { findFirst: jest.fn().mockResolvedValue(emailNoAccionable) },
      task: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
    };
    classification = {
      classifyAndPersist: jest.fn().mockResolvedValue({
        isActionable: true,
        category: 'OTHER',
        usedFallback: true,
        tasks: [{ id: 'task-1', title: emailNoAccionable.subject, priority: 'MEDIUM' }],
      }),
      classify: jest.fn().mockResolvedValue({
        emailId: emailNoAccionable.id,
        isActionable: true,
        category: 'PROJECT_MANAGEMENT',
        aiConfidence: 0.9,
        usedFallback: false,
        tasks: [
          {
            title: 'Enviar cotización',
            description: 'ctx',
            priority: 'URGENT',
            tags: ['obra'],
            dueDate: new Date('2026-08-01'),
            source: TaskSource.EMAIL,
          },
        ],
      }),
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      classification as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  describe('propiedad del correo', () => {
    it('devuelve 404 si el correo no existe o no es del usuario', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.convertToTask(USER_ID, 'otro-id', {})).rejects.toThrow(NotFoundException);
    });

    it('filtra por userId además de por id', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'x' });

      expect(prisma.email.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: emailNoAccionable.id, userId: USER_ID } }),
      );
    });
  });

  describe('protección contra duplicados', () => {
    it('devuelve 409 si el correo ya tiene tareas', async () => {
      prisma.task.count.mockResolvedValue(2);

      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        ConflictException,
      );
      expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    });

    it('con force: true crea otra aunque ya existan', async () => {
      prisma.task.count.mockResolvedValue(2);

      const result = await service.convertToTask(USER_ID, emailNoAccionable.id, {
        title: 'Otra más',
        force: true,
      });

      expect(result.tasks).toHaveLength(1);
    });

    it('ni siquiera consulta el conteo cuando llega force', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'x', force: true });

      expect(prisma.task.count).not.toHaveBeenCalled();
    });
  });

  describe('modo manual (con title)', () => {
    it('no llama al modelo: la conversión manual no cuesta tokens', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'A mano' });

      expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    });

    it('marca la tarea como manual para que el reproceso no la borre', async () => {
      const result = await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'A mano' });

      expect(result.mode).toBe('manual');
      expect(prisma.task.create.mock.calls[0][0].data.source).toBe(TaskSource.MANUAL);
    });

    it('aplica priority y dueDate del cuerpo', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {
        title: 'A mano',
        priority: 'URGENT' as any,
        dueDate: '2026-08-15T00:00:00.000Z',
      });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.priority).toBe('URGENT');
      expect(data.dueDate).toEqual(new Date('2026-08-15T00:00:00.000Z'));
    });

    it('recorta el título y usa el snippet como descripción por defecto', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: '   Con espacios   ' });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.title).toBe('Con espacios');
      expect(data.description).toBe(emailNoAccionable.snippet);
    });

    it('un title en blanco no cuenta como modo manual', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: '   ' });

      expect(classification.classifyAndPersist).toHaveBeenCalled();
    });
  });

  describe('modo IA (sin title)', () => {
    it('fuerza la creación aunque el modelo no vea el correo accionable', async () => {
      const result = await service.convertToTask(USER_ID, emailNoAccionable.id, {});

      expect(classification.classifyAndPersist).toHaveBeenCalledWith(emailNoAccionable.id, {
        replaceExisting: false,
        forceActionable: true,
      });
      expect(result.mode).toBe('ai');
      expect(result.usedFallback).toBe(true);
    });

    it('rechaza el correo sin texto pidiendo un title', async () => {
      prisma.email.findFirst.mockResolvedValue(emailSinTexto);

      await expect(service.convertToTask(USER_ID, emailSinTexto.id, {})).rejects.toThrow(
        /Envía "title"/,
      );
    });

    it('los campos del cuerpo pisan lo que dijo el modelo', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {
        priority: 'LOW' as any,
        dueDate: '2026-09-01T00:00:00.000Z',
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { priority: 'LOW', dueDate: new Date('2026-09-01T00:00:00.000Z') },
      });
    });

    it('no toca la tarea si el cuerpo no traía overrides', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {});

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('aviso al tablero', () => {
    it('anuncia la tarjeta creada por la vía manual', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'A mano' });

      expect(gateway.emitTaskCreated).toHaveBeenCalledTimes(1);
      expect(gateway.emitTaskCreated.mock.calls[0][0].title).toBe('A mano');
    });

    it('anuncia también las que salieron del modelo', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {});

      expect(gateway.emitTaskCreated).toHaveBeenCalledTimes(1);
    });

    it('excluye del eco al socket que originó la conversión', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'x' }, 'socket-1');

      expect(gateway.emitTaskCreated).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'x' }),
        'socket-1',
      );
    });

    it('sin cabecera se anuncia a todas las pestañas del usuario', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'x' });

      expect(gateway.emitTaskCreated.mock.calls[0][1]).toBeUndefined();
    });

    it('no anuncia nada si la conversión falló', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.convertToTask(USER_ID, 'otro-id', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(gateway.emitTaskCreated).not.toHaveBeenCalled();
    });
  });
});

describe('EmailsService — to-task con tasks[] (confirmación de la cuarentena)', () => {
  let service: EmailsService;
  let prisma: any;
  let tx: any;
  let classification: { classifyAndPersist: jest.Mock; classify: jest.Mock };

  const aprobadas = [
    { title: '  Enviar cotización  ', priority: 'URGENT' as any, tags: ['obra'] },
    { title: 'Remitir KYC', priority: 'HIGH' as any, dueDate: '2026-08-10T00:00:00.000Z' },
  ];

  beforeEach(() => {
    tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ position: 4 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-x', ...data })),
      },
      email: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      email: { findFirst: jest.fn().mockResolvedValue(emailNoAccionable) },
      task: { count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    classification = { classifyAndPersist: jest.fn(), classify: jest.fn() };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      classification as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  it('no vuelve a llamar al modelo: se persiste lo aprobado, no lo que diga otra vez', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    expect(classification.classify).not.toHaveBeenCalled();
  });

  it('crea exactamente las tareas aprobadas, con el título recortado', async () => {
    const result = await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(result.mode).toBe('confirmed');
    expect(tx.task.create).toHaveBeenCalledTimes(2);
    expect(tx.task.create.mock.calls[0][0].data.title).toBe('Enviar cotización');
    expect(tx.task.create.mock.calls[1][0].data.dueDate).toEqual(
      new Date('2026-08-10T00:00:00.000Z'),
    );
  });

  it('marca origen MANUAL para que el reproceso no borre lo que un humano aprobó', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(tx.task.create.mock.calls[0][0].data.source).toBe(TaskSource.MANUAL);
  });

  it('anexa al final de "Por hacer" en vez de colarse en la posición 0', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(tx.task.create.mock.calls[0][0].data.position).toBe(5);
    expect(tx.task.create.mock.calls[1][0].data.position).toBe(6);
  });

  it('empieza en 0 cuando la columna está vacía', async () => {
    tx.task.findFirst.mockResolvedValue(null);

    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: [aprobadas[0]] });

    expect(tx.task.create.mock.calls[0][0].data.position).toBe(0);
  });

  it('marca el correo como procesado en la misma transacción', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const data = tx.email.update.mock.calls[0][0].data;
    expect(data.processedAt).toBeInstanceOf(Date);
    expect(data.isActionable).toBe(true);
  });

  it('solo pisa la categoría si la persona la cambió', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });
    expect(tx.email.update.mock.calls[0][0].data).not.toHaveProperty('category');

    await service.convertToTask(USER_ID, emailNoAccionable.id, {
      tasks: aprobadas,
      category: 'INVOICING',
    });
    expect(tx.email.update.mock.calls[1][0].data.category).toBe('INVOICING');
  });

  it('sigue respetando el 409 por duplicados', async () => {
    prisma.task.count.mockResolvedValue(3);

    await expect(
      service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un tasks[] vacío no cuenta como confirmación y cae a la vía de siempre', async () => {
    classification.classifyAndPersist.mockResolvedValue({
      isActionable: true,
      category: 'OTHER',
      usedFallback: false,
      tasks: [],
    });

    const result = await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: [] });

    expect(result.mode).toBe('ai');
  });

  it('anuncia al tablero una tarjeta por cada tarea aprobada', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas }, 'socket-abc');

    expect(gateway.emitTaskCreated).toHaveBeenCalledTimes(2);
    // El que confirmó ya tiene las tareas en la respuesta 201: reenviárselas se
    // las duplicaría en pantalla.
    expect(gateway.emitTaskCreated.mock.calls[0][1]).toBe('socket-abc');
  });

  it('tasks[] manda sobre title si llegan los dos', async () => {
    const result = await service.convertToTask(USER_ID, emailNoAccionable.id, {
      tasks: aprobadas,
      title: 'Un título suelto',
    });

    expect(result.mode).toBe('confirmed');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });
});

describe('EmailsService — POST /emails/:id/classify', () => {
  let service: EmailsService;
  let prisma: any;
  let classification: { classifyAndPersist: jest.Mock; classify: jest.Mock };

  const propuesta = {
    emailId: emailNoAccionable.id,
    isActionable: true,
    category: 'PROJECT_MANAGEMENT',
    aiConfidence: 0.9,
    usedFallback: false,
    tasks: [
      {
        title: 'Enviar cotización',
        description: 'ctx',
        priority: 'URGENT',
        tags: ['obra'],
        dueDate: new Date('2026-08-01'),
        source: TaskSource.EMAIL,
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      email: { findFirst: jest.fn().mockResolvedValue(emailNoAccionable) },
      task: { count: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    classification = {
      classifyAndPersist: jest.fn(),
      classify: jest.fn().mockResolvedValue(propuesta),
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      classification as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  it('devuelve 404 si el correo no existe o no es del usuario', async () => {
    prisma.email.findFirst.mockResolvedValue(null);

    await expect(service.classify(USER_ID, 'otro-id')).rejects.toThrow(NotFoundException);
    expect(classification.classify).not.toHaveBeenCalled();
  });

  it('filtra por userId además de por id', async () => {
    await service.classify(USER_ID, emailNoAccionable.id);

    expect(prisma.email.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: emailNoAccionable.id, userId: USER_ID } }),
    );
  });

  it('rechaza con 409 el correo sin texto que analizar', async () => {
    prisma.email.findFirst.mockResolvedValue(emailSinTexto);

    await expect(service.classify(USER_ID, emailSinTexto.id)).rejects.toThrow(ConflictException);
    expect(classification.classify).not.toHaveBeenCalled();
  });

  it('no persiste nada: ni crea tareas ni comprueba duplicados', async () => {
    await service.classify(USER_ID, emailNoAccionable.id);

    expect(prisma.task.create).not.toHaveBeenCalled();
    // Mirar qué propondría el modelo no colisiona con las tareas que ya existan,
    // así que aquí no hay 409 por duplicados.
    expect(prisma.task.count).not.toHaveBeenCalled();
    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
  });

  it('no fuerza isActionable: si el modelo no ve nada, se dice', async () => {
    await service.classify(USER_ID, emailNoAccionable.id);

    expect(classification.classify).toHaveBeenCalledWith(emailNoAccionable.id, {
      forceActionable: false,
    });
  });

  it('devuelve la propuesta sin el origen interno de cada borrador', async () => {
    const result = await service.classify(USER_ID, emailNoAccionable.id);

    expect(result.emailId).toBe(emailNoAccionable.id);
    expect(result.category).toBe('PROJECT_MANAGEMENT');
    expect(result.aiConfidence).toBe(0.9);
    expect(result.tasks).toEqual([
      {
        title: 'Enviar cotización',
        description: 'ctx',
        priority: 'URGENT',
        tags: ['obra'],
        dueDate: new Date('2026-08-01'),
      },
    ]);
    expect(result.tasks[0]).not.toHaveProperty('source');
  });
});

describe('EmailsService — GET /emails (bandeja de triage)', () => {
  let service: EmailsService;
  let prisma: any;

  /** Dos correos: uno ya convertido y otro por despachar. */
  const filas = [
    {
      id: 'email-1',
      subject: 'Escrituración lote 36',
      from: 'notaria@ejemplo.mx',
      receivedAt: new Date('2026-07-25T18:00:00.000Z'),
      category: 'PROJECT_MANAGEMENT',
      threadId: 'hilo-1',
      labels: ['INBOX', 'UNREAD'],
      snippet: 'Adjunto el borrador de la escritura…',
      gmailMessageId: '19f95edbf2b0650a',
      _count: { tasks: 3 },
    },
    {
      id: 'email-2',
      subject: null,
      from: 'banco@ejemplo.mx',
      receivedAt: new Date('2026-07-24T09:00:00.000Z'),
      category: null,
      threadId: 'hilo-2',
      labels: [],
      snippet: null,
      gmailMessageId: '19f95edbf2b0650b',
      _count: { tasks: 0 },
    },
  ];

  beforeEach(() => {
    prisma = { email: { findMany: jest.fn().mockResolvedValue(filas) } };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  it('solo devuelve correos del usuario', async () => {
    await service.listForTriage(USER_ID, {});

    expect(prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: USER_ID }) }),
    );
  });

  it('marca como convertido el que ya tiene tareas', async () => {
    const [convertido, pendiente] = await service.listForTriage(USER_ID, {});

    expect(convertido.isConverted).toBe(true);
    expect(convertido.taskCount).toBe(3);
    expect(pendiente.isConverted).toBe(false);
    expect(pendiente.taskCount).toBe(0);
  });

  it('da un asunto que pintar cuando el correo no lo trae', async () => {
    const [, sinAsunto] = await service.listForTriage(USER_ID, {});

    expect(sinAsunto.subject).toBe('(sin asunto)');
  });

  it('entrega la fecha en ISO, no como objeto Date', async () => {
    const [primero] = await service.listForTriage(USER_ID, {});

    expect(primero.date).toBe('2026-07-25T18:00:00.000Z');
  });

  it('sin filtros no acota por accionable ni por convertido', async () => {
    await service.listForTriage(USER_ID, {});

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where).toEqual({ userId: USER_ID });
  });

  it('actionable=true deja solo los accionables', async () => {
    await service.listForTriage(USER_ID, { actionable: true });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where.isActionable).toBe(true);
  });

  it('actionable=false no se confunde con "sin filtro"', async () => {
    await service.listForTriage(USER_ID, { actionable: false });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where.isActionable).toBe(false);
  });

  it('converted=false es la bandeja por despachar: los que no tienen tareas', async () => {
    await service.listForTriage(USER_ID, { converted: false });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    // Por tareas y no por processedAt: el worker marca procesado aunque no
    // hubiera creado ninguna, y esos siguen pendientes de despachar.
    expect(where.tasks).toEqual({ none: {} });
    expect(where.processedAt).toBeUndefined();
  });

  it('converted=true devuelve los que ya generaron tareas', async () => {
    await service.listForTriage(USER_ID, { converted: true });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where.tasks).toEqual({ some: {} });
  });

  it('ordena del más reciente al más antiguo', async () => {
    await service.listForTriage(USER_ID, {});

    expect(prisma.email.findMany.mock.calls[0][0].orderBy).toEqual({ receivedAt: 'desc' });
  });

  it('pagina con valores por defecto sensatos', async () => {
    await service.listForTriage(USER_ID, {});

    const args = prisma.email.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(50);
  });

  it('respeta skip y take cuando llegan', async () => {
    await service.listForTriage(USER_ID, { skip: 10, take: 5 });

    const args = prisma.email.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(5);
  });

  it('trae lo que la bandeja necesita para agrupar y filtrar', async () => {
    const [primero] = await service.listForTriage(USER_ID, {});

    expect(primero.threadId).toBe('hilo-1');
    expect(primero.labels).toEqual(['INBOX', 'UNREAD']);
    expect(primero.snippet).toBe('Adjunto el borrador de la escritura…');
  });

  it('da cadena vacía cuando el correo no trae vista previa', async () => {
    const [, sinSnippet] = await service.listForTriage(USER_ID, {});

    expect(sinSnippet.snippet).toBe('');
  });

  it('expone el id de Gmail para casar con GET /gmail/inbox, sin confundirlo con el propio', async () => {
    const [primero] = await service.listForTriage(USER_ID, {});

    expect(primero.gmailMessageId).toBe('19f95edbf2b0650a');
    // El que sirve para classify y to-task es `id`, y no son el mismo.
    expect(primero.id).toBe('email-1');
    expect(primero.gmailMessageId).not.toBe(primero.id);
  });

  it('no arrastra el cuerpo del correo en el listado', async () => {
    await service.listForTriage(USER_ID, {});

    const { select } = prisma.email.findMany.mock.calls[0][0];
    // Son ~8 KB por correo: en una página de 50 serían 400 KB para pintar una
    // lista. El `snippet` sí va, que para eso es la vista previa.
    expect(select.bodyText).toBeUndefined();
    expect(select.snippet).toBe(true);
  });
});

describe('EmailsService — GET /emails/:id (vista de lectura)', () => {
  let service: EmailsService;
  let prisma: any;

  const fila = {
    id: 'email-1',
    subject: 'Escrituración lote 36',
    from: 'notaria@ejemplo.mx',
    receivedAt: new Date('2026-07-25T18:00:00.000Z'),
    category: 'PROJECT_MANAGEMENT',
    threadId: 'hilo-1',
    labels: ['INBOX'],
    snippet: 'Adjunto el borrador…',
    gmailMessageId: '19f95edbf2b0650a',
    bodyText: 'Buenas tardes, adjunto el borrador de la escritura para su revisión…',
    isActionable: true,
    processedAt: new Date('2026-07-25T18:45:08.667Z'),
    tasks: [
      { id: 'task-1', title: 'Confirmar TC', status: 'TODO', priority: 'URGENT' },
      { id: 'task-2', title: 'Remitir KYC', status: 'IN_PROGRESS', priority: 'HIGH' },
    ],
  };

  beforeEach(() => {
    prisma = { email: { findFirst: jest.fn().mockResolvedValue(fila) } };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  it('devuelve el texto completo, que es lo que el listado no trae', async () => {
    const detalle = await service.findOne(USER_ID, 'email-1');

    expect(detalle.bodyText).toContain('adjunto el borrador de la escritura');
    expect(prisma.email.findFirst.mock.calls[0][0].select.bodyText).toBe(true);
  });

  it('filtra por userId además de por id', async () => {
    await service.findOne(USER_ID, 'email-1');

    expect(prisma.email.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'email-1', userId: USER_ID } }),
    );
  });

  it('devuelve 404 si el correo no existe o es de otra persona', async () => {
    prisma.email.findFirst.mockResolvedValue(null);

    await expect(service.findOne(USER_ID, 'ajeno')).rejects.toThrow(NotFoundException);
  });

  it('trae las tareas que ese correo ya generó, para poder comparar al reprocesar', async () => {
    const detalle = await service.findOne(USER_ID, 'email-1');

    expect(detalle.tasks).toHaveLength(2);
    expect(detalle.tasks[0]).toEqual({
      id: 'task-1',
      title: 'Confirmar TC',
      status: 'TODO',
      priority: 'URGENT',
    });
    expect(detalle.taskCount).toBe(2);
    expect(detalle.isConverted).toBe(true);
  });

  it('mantiene el mismo contrato que el listado en los campos compartidos', async () => {
    const detalle = await service.findOne(USER_ID, 'email-1');

    expect(detalle.date).toBe('2026-07-25T18:00:00.000Z');
    expect(detalle.threadId).toBe('hilo-1');
    expect(detalle.labels).toEqual(['INBOX']);
    expect(detalle.gmailMessageId).toBe('19f95edbf2b0650a');
  });

  it('distingue el correo sin cuerpo guardado del cuerpo vacío', async () => {
    prisma.email.findFirst.mockResolvedValue({ ...fila, bodyText: null, snippet: null });

    const detalle = await service.findOne(USER_ID, 'email-1');

    // `null` en el cuerpo le dice a la vista que caiga al snippet en vez de
    // pintar un panel en blanco; el snippet sí se normaliza a cadena.
    expect(detalle.bodyText).toBeNull();
    expect(detalle.snippet).toBe('');
  });

  it('da la marca de procesado en ISO, o null si el worker no ha pasado', async () => {
    expect((await service.findOne(USER_ID, 'email-1')).processedAt).toBe(
      '2026-07-25T18:45:08.667Z',
    );

    prisma.email.findFirst.mockResolvedValue({ ...fila, processedAt: null });
    expect((await service.findOne(USER_ID, 'email-1')).processedAt).toBeNull();
  });

  it('sustituye el asunto ausente igual que el listado', async () => {
    prisma.email.findFirst.mockResolvedValue({ ...fila, subject: null });

    expect((await service.findOne(USER_ID, 'email-1')).subject).toBe('(sin asunto)');
  });
});

describe('EmailsService — PATCH /emails/:id/status (Inbox Zero)', () => {
  let service: EmailsService;
  let prisma: any;

  const fila = {
    id: 'email-1',
    subject: 'Escrituración lote 36',
    from: 'notaria@ejemplo.mx',
    receivedAt: new Date('2026-07-25T18:00:00.000Z'),
    category: 'PROJECT_MANAGEMENT',
    status: EmailStatus.COMPLETED,
    threadId: 'hilo-1',
    labels: ['INBOX'],
    snippet: 'Adjunto…',
    gmailMessageId: '19f95edbf2b0650a',
    _count: { tasks: 2 },
  };

  beforeEach(() => {
    prisma = {
      email: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: jest.fn().mockResolvedValue(fila),
      },
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  it('mueve el correo al estado pedido', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'email-1', userId: USER_ID },
      data: { status: EmailStatus.COMPLETED },
    });
  });

  it('comprueba la propiedad en la misma escritura, sin hueco entre leer y escribir', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.DISMISSED);

    // El filtro por userId va en el where del update, no en una lectura previa.
    expect(prisma.email.updateMany.mock.calls[0][0].where.userId).toBe(USER_ID);
  });

  it('devuelve 404 si el correo no es del usuario', async () => {
    prisma.email.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.updateStatus(USER_ID, 'ajeno', EmailStatus.COMPLETED)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.email.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('responde con la misma forma que una fila del listado', async () => {
    const actualizado = await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    expect(actualizado).toEqual({
      id: 'email-1',
      subject: 'Escrituración lote 36',
      from: 'notaria@ejemplo.mx',
      date: '2026-07-25T18:00:00.000Z',
      category: 'PROJECT_MANAGEMENT',
      status: EmailStatus.COMPLETED,
      taskCount: 2,
      isConverted: true,
      threadId: 'hilo-1',
      labels: ['INBOX'],
      snippet: 'Adjunto…',
      gmailMessageId: '19f95edbf2b0650a',
    });
  });

  it('no toca las tareas del correo al moverlo de estado', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.DISMISSED);

    // Descartar un correo no borra lo que ya generó: la tarea vive en el
    // tablero por su cuenta desde que se creó.
    expect(prisma.task).toBeUndefined();
  });

  it('acepta los cuatro estados del vocabulario', async () => {
    for (const estado of [
      EmailStatus.PENDING,
      EmailStatus.IN_PROGRESS,
      EmailStatus.COMPLETED,
      EmailStatus.DISMISSED,
    ]) {
      await service.updateStatus(USER_ID, 'email-1', estado);
    }

    expect(prisma.email.updateMany).toHaveBeenCalledTimes(4);
  });
});

describe('EmailsService — filtro por estado en el listado', () => {
  let service: EmailsService;
  let prisma: any;

  beforeEach(() => {
    prisma = { email: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
    );
  });

  it('?status=PENDING deja solo lo que sigue sin despachar', async () => {
    await service.listForTriage(USER_ID, { status: EmailStatus.PENDING });

    expect(prisma.email.findMany.mock.calls[0][0].where.status).toBe(EmailStatus.PENDING);
  });

  it('sin el filtro no acota por estado', async () => {
    await service.listForTriage(USER_ID, {});

    expect(prisma.email.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });

  it('el estado viaja en cada fila para que la bandeja pinte sus pestañas', async () => {
    prisma.email.findMany.mockResolvedValue([
      {
        id: 'e1',
        subject: 'x',
        from: 'a@b.mx',
        receivedAt: new Date('2026-07-25T00:00:00.000Z'),
        category: null,
        status: EmailStatus.IN_PROGRESS,
        threadId: 'h1',
        labels: [],
        snippet: null,
        gmailMessageId: 'g1',
        _count: { tasks: 0 },
      },
    ]);

    const [fila] = await service.listForTriage(USER_ID, {});

    expect(fila.status).toBe(EmailStatus.IN_PROGRESS);
  });
});
