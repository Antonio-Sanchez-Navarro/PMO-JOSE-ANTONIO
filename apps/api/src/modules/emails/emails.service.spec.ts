import { ConflictException, NotFoundException } from '@nestjs/common';
import { TaskSource } from '@prisma/client';
import { EmailsService } from './emails.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailClassificationService } from '../ai/email-classification.service';
import { emailNoAccionable, emailSinTexto } from '../ai/__fixtures__/emails.fixture';

const USER_ID = 'user-1';

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
