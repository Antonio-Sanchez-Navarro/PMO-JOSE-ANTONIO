import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { EmailStatus, TaskSource } from '@prisma/client';
import { EmailsService } from './emails.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailClassificationService } from '../ai/email-classification.service';
import { TasksGateway } from '../tasks/tasks.gateway';
import { TagsService } from '../tags/tags.service';
import { GmailService } from '../gmail/gmail.service';
import { emailNoAccionable, emailSinTexto } from '../ai/__fixtures__/emails.fixture';

const USER_ID = 'user-1';

/**
 * El gateway se renueva antes de cada prueba, incluidas las de los `describe`
 * de abajo: este `beforeEach` se registra primero y corre antes que los suyos,
 * que son los que construyen el servicio.
 */
let gateway: {
  emitTaskCreated: jest.Mock;
  emitEmailUpdated: jest.Mock;
  emitEmailsBulkUpdated: jest.Mock;
};
/**
 * Por defecto acepta las etiquetas que le pidan: las pruebas que comprueban el
 * rechazo lo hacen fallar ellas mismas. Devuelve la forma de `connect` que
 * espera Prisma.
 */
let tags: { resolveIds: jest.Mock };
/**
 * Gmail solo hace falta para bajar adjuntos; el resto de pruebas no lo tocan.
 * Por defecto devuelve un binario cualquiera.
 */
let gmail: { fetchAttachment: jest.Mock };
beforeEach(() => {
  gateway = {
    emitTaskCreated: jest.fn(),
    emitEmailUpdated: jest.fn(),
    emitEmailsBulkUpdated: jest.fn(),
  };
  gmail = { fetchAttachment: jest.fn().mockResolvedValue(Buffer.from('PDF-de-mentira')) };
  tags = {
    resolveIds: jest.fn().mockImplementation((_userId: string, ids?: string[]) =>
      Promise.resolve((ids ?? []).map((id) => ({ id }))),
    ),
  };
});

describe('EmailsService — POST /emails/:id/to-task', () => {
  let service: EmailsService;
  let prisma: any;
  let classification: { classifyAndPersist: jest.Mock; classify: jest.Mock };
  let tx: any;

  beforeEach(() => {
    // Fase 6: la vía IA ya no crea la fila por su cuenta — pasa por
    // `persistConfirmed`, que abre transacción igual que la confirmación de la
    // cuarentena. Sin este doble, el modo IA revienta con
    // «this.prisma.$transaction is not a function».
    tx = {
      task: {
        findFirst: jest.fn().mockResolvedValue({ position: 4 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-x', ...data })),
      },
      email: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({})
      },
    };
    prisma = {
      email: { findFirst: jest.fn().mockResolvedValue(emailNoAccionable) },
      task: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
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
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
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
      // Sin título aprovechable no hay vía manual, y desde P6 tampoco hay vía
      // automática: cae en el 409 que manda a la cuarentena.
      await expect(
        service.convertToTask(USER_ID, emailNoAccionable.id, { title: '   ' }),
      ).rejects.toThrow(ConflictException);
      expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    });
  });

  /**
   * P6: la vía que llamaba al modelo y creaba lo que dijera **ya no existe**.
   * Era la puerta trasera de la cuarentena — el tablero acababa igual de
   * contaminado, solo que por otro camino. Lo que se prueba aquí es que la
   * puerta está cerrada y que el 409 dice por dónde se pasa ahora.
   */
  describe('sin title y sin tasks[]: la puerta trasera está cerrada (P6)', () => {
    it('no llama al modelo ni crea nada: responde 409', async () => {
      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        ConflictException,
      );

      expect(classification.classifyAndPersist).not.toHaveBeenCalled();
      expect(classification.classify).not.toHaveBeenCalled();
      expect(prisma.task.create).not.toHaveBeenCalled();
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('el 409 explica las dos salidas: classify + tasks[], o title', async () => {
      // Un 409 que solo dice «no puedo» deja al frontend adivinando. Este
      // nombra los dos caminos que sí funcionan.
      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        /classify/,
      );
      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        /"tasks"/,
      );
      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        /"title"/,
      );
    });

    it('rechaza el correo sin texto pidiendo un title', async () => {
      prisma.email.findFirst.mockResolvedValue(emailSinTexto);

      await expect(service.convertToTask(USER_ID, emailSinTexto.id, {})).rejects.toThrow(
        /Envía "title"/,
      );
    });

    // Los overrides sueltos del cuerpo (`priority`, `dueDate`, `description`)
    // servían para corregir lo que proponía el modelo por esta vía. Sin la vía,
    // no corrigen nada: sin `title` ni `tasks[]` no hay nada que crear.
    it('los campos sueltos del cuerpo no abren la vía automática', async () => {
      await expect(
        service.convertToTask(USER_ID, emailNoAccionable.id, {
          priority: 'LOW' as any,
          dueDate: '2026-09-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(ConflictException);

      expect(tx.task.create).not.toHaveBeenCalled();
    });
  });

  describe('aviso al tablero', () => {
    it('anuncia la tarjeta creada por la vía manual', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'A mano' });

      expect(gateway.emitTaskCreated).toHaveBeenCalledTimes(1);
      expect(gateway.emitTaskCreated.mock.calls[0][0].title).toBe('A mano');
    });

    it('no anuncia nada cuando la conversión se rechaza por P6', async () => {
      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        ConflictException,
      );

      expect(gateway.emitTaskCreated).not.toHaveBeenCalled();
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
      email: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({})
      },
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
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
    );
  });

  it('no vuelve a llamar al modelo: se persiste lo aprobado, no lo que diga otra vez', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    expect(classification.classify).not.toHaveBeenCalled();
  });

  it('crea exactamente las tareas aprobadas, agrupadas en la tarea padre', async () => {
    const result = await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(result.mode).toBe('confirmed');
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create.mock.calls[0][0].data.subtasks.create[0].title).toBe('Enviar cotización');
    expect(tx.task.create.mock.calls[0][0].data.dueDate).toEqual(
      new Date('2026-08-10T00:00:00.000Z'),
    );
  });

  // Esto marcaba MANUAL, y el motivo era bueno: el reproceso del worker borraba
  // lo que tenía origen EMAIL y habría destruido trabajo ya aprobado. Ese
  // borrado desapareció en la Fase 6 —no queda un solo `deleteMany` sobre
  // `Task`—, así que P2 devuelve el rastro: la propuso el modelo aunque la
  // aprobara una persona, y el tablero tiene que poder decirlo.
  it('marca origen EMAIL: la aprobó una persona, pero la propuso el modelo (P2)', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(tx.task.create.mock.calls[0][0].data.source).toBe(TaskSource.EMAIL);
  });

  it('conserva la confianza del borrador guardado, no la que mande el cliente', async () => {
    prisma.email.findFirst.mockResolvedValue({
      ...emailNoAccionable,
      proposedTasks: [{ title: 'Enviar cotización', aiConfidence: 0.42 }],
    });

    await service.convertToTask(USER_ID, emailNoAccionable.id, {
      // Aunque el cuerpo intentara colar una confianza inventada, no se lee de
      // aquí: es un dato del análisis, no del usuario.
      tasks: aprobadas.map((t) => ({ ...t, aiConfidence: 0.99 })) as any,
    });

    expect(tx.task.create.mock.calls[0][0].data.aiConfidence).toBe(0.42);
  });

  it('sin borrador guardado, la tarea nace sin confianza en vez de con una inventada', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(tx.task.create.mock.calls[0][0].data).not.toHaveProperty('aiConfidence');
  });

  it('anexa al final de "Por hacer" en vez de colarse en la posición 0', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

    expect(tx.task.create.mock.calls[0][0].data.position).toBe(5);
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

  it('un tasks[] vacío no cuenta como confirmación', async () => {
    // Aprobar cero tareas no es aprobar: cae fuera de la vía de confirmación.
    // Antes eso lo recogía la vía automática; desde P6 no hay a dónde caer, y
    // el 409 es la respuesta honesta.
    await expect(
      service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: [] }),
    ).rejects.toThrow(ConflictException);

    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
  });

  it('anuncia al tablero la tarea agrupada que contiene las aprobadas', async () => {
    await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas }, 'socket-abc');

    expect(gateway.emitTaskCreated).toHaveBeenCalledTimes(1);
    // El que confirmó ya tiene las tareas en la respuesta 201: reenviárselas se
    // las duplicaría en pantalla.
    expect(gateway.emitTaskCreated.mock.calls[0][1]).toBe('socket-abc');
  });

  describe('etiquetas del usuario en las tareas aprobadas', () => {
    const conEtiquetas = [
      { title: 'Con etiquetas', priority: 'HIGH' as any, tagIds: ['tag-1', 'tag-1', 'tag-2'] },
    ];

    it('las cuelga de la tarea, sin repetir un id que llegó dos veces', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: conEtiquetas });

      expect(tx.task.create.mock.calls[0][0].data.labels).toEqual({
        connect: [{ id: 'tag-1' }, { id: 'tag-2' }],
      });
    });

    it('comprueba de quién son antes de abrir la transacción', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: conEtiquetas });

      expect(tags.resolveIds).toHaveBeenCalledWith(USER_ID, ['tag-1', 'tag-1', 'tag-2']);
    });

    it('un id ajeno o inventado da 400 y no escribe nada', async () => {
      tags.resolveIds.mockRejectedValue(new BadRequestException('no son tuyas'));

      await expect(
        service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: conEtiquetas }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sin tagIds no toca el campo: una tarea sin etiquetas no es una tarea con cero', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: aprobadas });

      expect(tx.task.create.mock.calls[0][0].data).not.toHaveProperty('labels');
    });

    it('la tarjeta creada vuelve con sus etiquetas, para el 201 y para el socket', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { tasks: conEtiquetas });

      expect(tx.task.create.mock.calls[0][0].include).toEqual({ labels: true });
    });
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
      email: {
        findFirst: jest.fn().mockResolvedValue(emailNoAccionable),
        findMany: jest.fn().mockImplementation(async () => {
          const result = await prisma.email.findFirst();
          return result ? [result] : [];
        }),
        // Desde P3, clasificar guarda el borrador que acaba de salir: es lo que
        // hace que un `?force=true` cambie lo que verá el siguiente que mire.
        update: jest.fn().mockResolvedValue({}),
      },
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
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
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

  it('no crea tareas ni comprueba duplicados', async () => {
    await service.classify(USER_ID, emailNoAccionable.id);

    expect(prisma.task.create).not.toHaveBeenCalled();
    // Mirar qué propondría el modelo no colisiona con las tareas que ya existan,
    // así que aquí no hay 409 por duplicados.
    expect(prisma.task.count).not.toHaveBeenCalled();
    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
  });

  /**
   * P3 — el borrador guardado se sirve tal cual, y `?force=true` es la única
   * forma de pedir otra opinión.
   *
   * Sin esta salida, un correo con borrador no se podía reanalizar **nunca**:
   * `[]` también es un array, así que hasta un correo del que el modelo no
   * propuso nada quedaba congelado para siempre.
   */
  describe('P3 · caché del borrador y ?force=true', () => {
    const conBorrador = {
      ...emailNoAccionable,
      category: 'FINANCE',
      isActionable: true,
      proposedTasks: [
        { title: 'Ya propuesta', description: '', priority: 'LOW', tags: [], dueDate: null, aiConfidence: 0.31 },
      ],
    };

    it('sin force, sirve el borrador guardado y no llama al modelo', async () => {
      prisma.email.findFirst.mockResolvedValue(conBorrador);

      const result = await service.classify(USER_ID, emailNoAccionable.id);

      expect(classification.classify).not.toHaveBeenCalled();
      expect(result.tasks).toHaveLength(1);
      expect(result.category).toBe('FINANCE');
    });

    it('devuelve la confianza real del borrador, no un 1 inventado', async () => {
      prisma.email.findFirst.mockResolvedValue(conBorrador);

      const result = await service.classify(USER_ID, emailNoAccionable.id);

      expect(result.aiConfidence).toBe(0.31);
    });

    it('un borrador viejo sin confianza dice 0 —«no consta»— y no 1', async () => {
      prisma.email.findFirst.mockResolvedValue({
        ...conBorrador,
        proposedTasks: [{ title: 'De antes de la Fase 6' }],
      });

      const result = await service.classify(USER_ID, emailNoAccionable.id);

      // Un 1 se leería en la cuarentena como certeza absoluta, que es
      // justamente lo contrario de lo que sabemos de ese borrador.
      expect(result.aiConfidence).toBe(0);
    });

    it('un borrador vacío también es caché: `[]` no vuelve a llamar al modelo', async () => {
      prisma.email.findFirst.mockResolvedValue({ ...conBorrador, proposedTasks: [] });

      await service.classify(USER_ID, emailNoAccionable.id);

      expect(classification.classify).not.toHaveBeenCalled();
    });

    it('con force sí vuelve a preguntar, y reemplaza el borrador', async () => {
      prisma.email.findFirst.mockResolvedValue(conBorrador);

      const result = await service.classify(USER_ID, emailNoAccionable.id, true);

      expect(classification.classify).toHaveBeenCalled();
      expect(result.aiConfidence).toBe(0.9);
      // Reemplazar es la mitad del trabajo: si el nuevo borrador no se guardara,
      // el siguiente que abriera el correo seguiría viendo el viejo.
      // Se compara contra la forma JSON, que es lo que de verdad se escribe:
      // el borrador entra con `Date` y sale con cadena ISO.
      expect(prisma.email.update.mock.calls[0][0].data.proposedTasks).toEqual([
        expect.objectContaining({
          title: 'Enviar cotización',
          dueDate: '2026-08-01T00:00:00.000Z',
        }),
      ]);
    });
  });

  it('guarda el borrador, pero no marca el correo como procesado', async () => {
    await service.classify(USER_ID, emailNoAccionable.id);

    const data = prisma.email.update.mock.calls[0][0].data;
    expect(data.proposedTasks).toEqual([
      expect.objectContaining({ title: 'Enviar cotización', dueDate: '2026-08-01T00:00:00.000Z' }),
    ]);
    // `processedAt` es del worker: si se marcara aquí, mirar un correo lo
    // sacaría de la cola sin haberlo despachado nadie.
    expect(data).not.toHaveProperty('processedAt');
  });

  it('no fuerza isActionable: si el modelo no ve nada, se dice', async () => {
    await service.classify(USER_ID, emailNoAccionable.id);

    expect(classification.classify).toHaveBeenCalledWith(emailNoAccionable.id, {
      forceActionable: false,
    });
  });

  // La cuarentena necesita triar sin abrir cada propuesta: `source` dice si la
  // sacó el modelo o el respaldo del asunto, y `aiConfidence` con cuánta
  // seguridad. Antes se recortaban por «internos»; desde P2 viajan.
  it('devuelve la propuesta con el origen y la confianza de cada borrador', async () => {
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
        dueDate: '2026-08-01T00:00:00.000Z',
        source: TaskSource.EMAIL,
        aiConfidence: undefined,
      },
    ]);
    expect(result.tasks[0].source).toBe(TaskSource.EMAIL);
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
      isActionable: true,
      company: 'Urbazepto',
      bank: 'Konfio',
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
      isActionable: false,
      company: null,
      bank: null,
      _count: { tasks: 0 },
    },
  ];

  beforeEach(() => {
    prisma = { email: { findMany: jest.fn().mockResolvedValue(filas) } };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
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

  it('entrega isActionable en cada fila (Fase 7)', async () => {
    // Sin esto la bandeja no puede ni filtrar los no accionables ni ofrecer
    // «marca todos»: la columna existia desde el Sprint 3 pero se quedaba fuera
    // del `select`, asi que llegaba `undefined` en los tres casos.
    const [accionable, no] = await service.listForTriage(USER_ID, {});

    expect(accionable.isActionable).toBe(true);
    expect(no.isActionable).toBe(false);
  });

  it('pide isActionable a la base, no lo deduce', async () => {
    await service.listForTriage(USER_ID, {});

    const { select } = prisma.email.findMany.mock.calls[0][0];
    expect(select.isActionable).toBe(true);
  });

  it('entrega company y bank en cada fila (Fase 8)', async () => {
    const [conBanco, sinBanco] = await service.listForTriage(USER_ID, {});

    expect(conBanco.company).toBe('Urbazepto');
    expect(conBanco.bank).toBe('Konfio');
    // `null` no es «sin clasificar»: es «este correo no menciona ninguno de
    // los nuestros», que es el caso normal.
    expect(sinBanco.company).toBeNull();
    expect(sinBanco.bank).toBeNull();
  });

  it('filtra por empresa', async () => {
    await service.listForTriage(USER_ID, { company: 'Urbazepto' });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where.company).toBe('Urbazepto');
  });

  it('filtra por banco', async () => {
    await service.listForTriage(USER_ID, { bank: 'Clara' });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where.bank).toBe('Clara');
  });

  it('sin filtro de empresa ni banco no acota por ellos', async () => {
    // Que no aparezcan como `undefined` en el `where`: Prisma lo trataria como
    // «da igual», pero la prueba de «sin filtros» compara el objeto entero.
    await service.listForTriage(USER_ID, {});

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where).toEqual({ userId: USER_ID });
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
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
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
    // Fase 6: los dos campos nuevos entran en `SELECT_TRIAGE`, así que la fila
    // que devuelve la base los trae y `aTriageEmail` los mapea.
    proposedTasks: null,
    hasAttachments: true,
    _count: { tasks: 2 },
  };

  let tx: any;

  beforeEach(() => {
    tx = {
      email: {
        // De partida, el correo está sin despachar: cada prueba que necesite
        // otro punto de salida lo dice.
        findFirst: jest.fn().mockResolvedValue({ status: EmailStatus.PENDING }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      email: { findFirstOrThrow: jest.fn().mockResolvedValue(fila) },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
    );
  });

  it('mueve el correo al estado pedido', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    expect(tx.email.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { status: EmailStatus.COMPLETED },
    });
  });

  it('comprueba la propiedad al leer el estado de partida', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.DISMISSED);

    expect(tx.email.findFirst.mock.calls[0][0].where).toEqual({
      id: 'email-1',
      userId: USER_ID,
    });
  });

  it('lee y escribe en la misma transacción, para que la regla mire el estado real', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    // Fuera de la transacción, entre comprobar de dónde viene y guardar cabría
    // otra pestaña moviendo el mismo correo.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('devuelve 404 si el correo no es del usuario', async () => {
    tx.email.findFirst.mockResolvedValue(null);

    await expect(service.updateStatus(USER_ID, 'ajeno', EmailStatus.COMPLETED)).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.email.update).not.toHaveBeenCalled();
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
      // Cuarentena: cuántas propuso la IA y siguen sin aprobar. `null` en el
      // JSON es cero, no «desconocido»: la bandeja pinta un número o nada.
      proposedTaskCount: 0,
      hasAttachments: true,
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

    expect(tx.email.update).toHaveBeenCalledTimes(4);
  });

  describe('la bandeja avanza pero no retrocede sola', () => {
    it.each([EmailStatus.IN_PROGRESS, EmailStatus.COMPLETED, EmailStatus.DISMISSED])(
      'devolver a PENDING desde %s sin force da 409 y no escribe',
      async (desde) => {
        tx.email.findFirst.mockResolvedValue({ status: desde });

        await expect(
          service.updateStatus(USER_ID, 'email-1', EmailStatus.PENDING),
        ).rejects.toThrow(ConflictException);
        expect(tx.email.update).not.toHaveBeenCalled();
        expect(gateway.emitEmailUpdated).not.toHaveBeenCalled();
      },
    );

    it.each([EmailStatus.IN_PROGRESS, EmailStatus.COMPLETED, EmailStatus.DISMISSED])(
      'con force sí lo reabre desde %s',
      async (desde) => {
        tx.email.findFirst.mockResolvedValue({ status: desde });

        await service.updateStatus(USER_ID, 'email-1', EmailStatus.PENDING, undefined, true);

        expect(tx.email.update).toHaveBeenCalledWith({
          where: { id: 'email-1' },
          data: { status: EmailStatus.PENDING },
        });
      },
    );

    it('marcar como pendiente lo que ya lo estaba no necesita force: no reabre nada', async () => {
      tx.email.findFirst.mockResolvedValue({ status: EmailStatus.PENDING });

      await service.updateStatus(USER_ID, 'email-1', EmailStatus.PENDING);

      expect(tx.email.update).toHaveBeenCalledTimes(1);
    });

    it('la regla solo mira las vueltas a PENDING, no el resto de movimientos', async () => {
      tx.email.findFirst.mockResolvedValue({ status: EmailStatus.COMPLETED });

      // Rectificar entre estados despachados es cosa de quien gestiona su
      // bandeja: aquí no hay nada que proteger.
      await service.updateStatus(USER_ID, 'email-1', EmailStatus.DISMISSED);
      await service.updateStatus(USER_ID, 'email-1', EmailStatus.IN_PROGRESS);

      expect(tx.email.update).toHaveBeenCalledTimes(2);
    });

    it('force no cambia nada cuando no hay regla que saltarse', async () => {
      await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED, undefined, true);

      expect(tx.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { status: EmailStatus.COMPLETED },
      });
    });

    it('reabrir no toca lo que el correo ya generó ni la marca del worker', async () => {
      tx.email.findFirst.mockResolvedValue({ status: EmailStatus.COMPLETED });

      await service.updateStatus(USER_ID, 'email-1', EmailStatus.PENDING, undefined, true);

      // Solo el estado: `processedAt` dice que el worker lo analizó, y eso
      // sigue siendo verdad aunque su dueño lo devuelva a la bandeja.
      expect(tx.email.update.mock.calls[0][0].data).toEqual({ status: EmailStatus.PENDING });
    });

    it('la reapertura forzada queda anotada en el log', async () => {
      tx.email.findFirst.mockResolvedValue({ status: EmailStatus.DISMISSED });
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await service.updateStatus(USER_ID, 'email-1', EmailStatus.PENDING, undefined, true);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Reapertura forzada'));
      warn.mockRestore();
    });

    it('la reapertura sale por socket como cualquier otro movimiento', async () => {
      tx.email.findFirst.mockResolvedValue({ status: EmailStatus.COMPLETED });

      await service.updateStatus(USER_ID, 'email-1', EmailStatus.PENDING, 'socket-abc', true);

      expect(gateway.emitEmailUpdated.mock.calls[0][1]).toBe('socket-abc');
    });
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
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
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

describe('EmailsService — aviso a la bandeja al mover un correo', () => {
  let service: EmailsService;
  let prisma: any;

  const fila = {
    id: 'email-1',
    subject: 'Escrituración',
    from: 'notaria@ejemplo.mx',
    receivedAt: new Date('2026-07-25T18:00:00.000Z'),
    category: null,
    status: EmailStatus.COMPLETED,
    threadId: 'hilo-1',
    labels: [],
    snippet: null,
    gmailMessageId: 'g1',
    _count: { tasks: 0 },
  };

  let tx: any;

  beforeEach(() => {
    tx = {
      email: {
        findFirst: jest.fn().mockResolvedValue({ status: EmailStatus.PENDING }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      email: { findFirstOrThrow: jest.fn().mockResolvedValue(fila) },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
    );
  });

  it('anuncia el correo ya actualizado, no el estado anterior', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    expect(gateway.emitEmailUpdated).toHaveBeenCalledTimes(1);
    const [payload] = gateway.emitEmailUpdated.mock.calls[0];
    expect(payload.status).toBe(EmailStatus.COMPLETED);
    expect(payload.id).toBe('email-1');
  });

  it('mete el userId en el payload, que es lo que encamina el evento a su sala', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    expect(gateway.emitEmailUpdated.mock.calls[0][0].userId).toBe(USER_ID);
  });

  it('excluye del eco a la pestaña que movió el correo', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED, 'socket-1');

    expect(gateway.emitEmailUpdated.mock.calls[0][1]).toBe('socket-1');
  });

  it('sin cabecera se anuncia a todas las pestañas del usuario', async () => {
    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    expect(gateway.emitEmailUpdated.mock.calls[0][1]).toBeUndefined();
  });

  it('no anuncia nada si el correo no era suyo', async () => {
    tx.email.findFirst.mockResolvedValue(null);

    await expect(service.updateStatus(USER_ID, 'ajeno', EmailStatus.COMPLETED)).rejects.toThrow(
      NotFoundException,
    );
    expect(gateway.emitEmailUpdated).not.toHaveBeenCalled();
  });

  it('anuncia después de escribir, no antes', async () => {
    const orden: string[] = [];
    tx.email.update.mockImplementation(async () => {
      orden.push('escritura');
      return {};
    });
    gateway.emitEmailUpdated.mockImplementation(() => {
      orden.push('evento');
    });

    await service.updateStatus(USER_ID, 'email-1', EmailStatus.COMPLETED);

    // Un evento emitido antes de que la escritura cuaje anunciaría un estado
    // que todavía podría no existir.
    expect(orden).toEqual(['escritura', 'evento']);
  });
});

describe('EmailsService — GET /emails/threads (bandeja por hilos, Fase 7)', () => {
  let service: EmailsService;
  let prisma: any;

  /** Base de una fila: cada hilo cambia solo lo que la prueba mira. */
  const fila = (extra: Record<string, unknown>) => ({
    subject: 'Asunto',
    from: 'quien@ejemplo.mx',
    category: 'OTHER',
    status: EmailStatus.PENDING,
    labels: [],
    snippet: null,
    company: null,
    bank: null,
    proposedTasks: null,
    hasAttachments: false,
    processedAt: new Date('2026-09-01T00:00:00.000Z'),
    skipReason: null,
    isActionable: false,
    _count: { tasks: 0 },
    ...extra,
  });

  /**
   * Tres hilos que cubren los tres desenlaces de `allNonActionable`:
   * un boletin de dos mensajes, un hilo con trabajo dentro, y uno que nadie ha
   * clasificado todavia.
   */
  const filas = [
    fila({
      id: 'e1',
      threadId: 'hilo-boletin',
      gmailMessageId: 'g1',
      receivedAt: new Date('2026-09-05T10:00:00.000Z'),
      hasAttachments: true,
    }),
    fila({
      id: 'e2',
      threadId: 'hilo-boletin',
      gmailMessageId: 'g2',
      receivedAt: new Date('2026-09-04T10:00:00.000Z'),
    }),
    fila({
      id: 'e3',
      threadId: 'hilo-con-trabajo',
      gmailMessageId: 'g3',
      receivedAt: new Date('2026-09-03T10:00:00.000Z'),
      isActionable: true,
      proposedTasks: [{ title: 'a' }, { title: 'b' }],
    }),
    fila({
      id: 'e4',
      threadId: 'hilo-con-trabajo',
      gmailMessageId: 'g4',
      receivedAt: new Date('2026-09-02T10:00:00.000Z'),
    }),
    fila({
      id: 'e5',
      threadId: 'hilo-sin-clasificar',
      gmailMessageId: 'g5',
      receivedAt: new Date('2026-09-01T10:00:00.000Z'),
      processedAt: null,
    }),
  ];

  const pagina = [
    { threadId: 'hilo-boletin', _max: { receivedAt: new Date('2026-09-05T10:00:00.000Z') } },
    { threadId: 'hilo-con-trabajo', _max: { receivedAt: new Date('2026-09-03T10:00:00.000Z') } },
    { threadId: 'hilo-sin-clasificar', _max: { receivedAt: new Date('2026-09-01T10:00:00.000Z') } },
  ];

  const todos = [
    { threadId: 'hilo-boletin', _count: { _all: 2 } },
    { threadId: 'hilo-con-trabajo', _count: { _all: 2 } },
    { threadId: 'hilo-sin-clasificar', _count: { _all: 1 } },
  ];

  beforeEach(() => {
    prisma = {
      email: {
        // El `groupBy` completo es el que pide `_count`; el paginado, el que
        // pide `_max` para poder ordenar. Es lo que separa las dos llamadas.
        groupBy: jest.fn().mockImplementation((args: any) =>
          Promise.resolve(args._count ? todos : pagina),
        ),
        findMany: jest.fn().mockResolvedValue(filas),
      },
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
    );
  });

  it('devuelve un item por hilo, no uno por correo', async () => {
    const { items } = await service.listThreads(USER_ID, {});

    expect(items).toHaveLength(3);
    expect(items.map((h) => h.threadId)).toEqual([
      'hilo-boletin',
      'hilo-con-trabajo',
      'hilo-sin-clasificar',
    ]);
  });

  it('cuenta hilos y correos por separado', async () => {
    // Es el par de numeros que deja pintar «3 hilos · 5 correos» sin que el
    // cliente se baje la bandeja entera para contarla.
    const { total, totalEmails } = await service.listThreads(USER_ID, {});

    expect(total).toBe(3);
    expect(totalEmails).toBe(5);
  });

  it('trae los ids de todo el hilo, del mas reciente al mas antiguo', async () => {
    const [boletin] = (await service.listThreads(USER_ID, {})).items;

    expect(boletin.messageCount).toBe(2);
    expect(boletin.emailIds).toEqual(['e1', 'e2']);
  });

  it('latest es el mensaje mas reciente, en la forma de GET /emails', async () => {
    const [boletin] = (await service.listThreads(USER_ID, {})).items;

    expect(boletin.latest.id).toBe('e1');
    expect(boletin.latest.date).toBe('2026-09-05T10:00:00.000Z');
    expect(boletin.latest.gmailMessageId).toBe('g1');
  });

  it('allNonActionable es true solo si TODO el hilo es no accionable', async () => {
    const [boletin, conTrabajo] = (await service.listThreads(USER_ID, {})).items;

    expect(boletin.allNonActionable).toBe(true);
    // Basta un mensaje con trabajo dentro para que el hilo no se pueda barrer.
    expect(conTrabajo.allNonActionable).toBe(false);
  });

  it('un hilo sin clasificar NO cuenta como no accionable', async () => {
    // La trampa de la fase: `isActionable` nace en `false`, asi que un correo
    // que nadie ha analizado se lee igual que uno que la IA descarto. Si esto
    // se rompe, «marca todos los no accionables» barre correos sin mirar.
    const sinClasificar = (await service.listThreads(USER_ID, {})).items[2];

    expect(sinClasificar.latest.isActionable).toBe(false);
    expect(sinClasificar.allNonActionable).toBe(false);
  });

  it('suma las propuestas en cuarentena de todo el hilo', async () => {
    const [boletin, conTrabajo] = (await service.listThreads(USER_ID, {})).items;

    expect(conTrabajo.proposedTaskCount).toBe(2);
    expect(boletin.proposedTaskCount).toBe(0);
  });

  it('marca el clip si cualquier mensaje del hilo trae adjuntos', async () => {
    const [boletin, conTrabajo] = (await service.listThreads(USER_ID, {})).items;

    expect(boletin.hasAttachments).toBe(true);
    expect(conTrabajo.hasAttachments).toBe(false);
  });

  it('pagina hilos en la base, no correos en memoria', async () => {
    await service.listThreads(USER_ID, { skip: 10, take: 25 });

    const paginado = prisma.email.groupBy.mock.calls.find((c: any[]) => c[0].skip !== undefined);
    expect(paginado[0]).toEqual(
      expect.objectContaining({ by: ['threadId'], skip: 10, take: 25 }),
    );
    // Y el `findMany` no pagina: ya viene acotado por los hilos de la pagina.
    expect(prisma.email.findMany.mock.calls[0][0].take).toBeUndefined();
  });

  it('ordena por el correo mas reciente de cada hilo', async () => {
    await service.listThreads(USER_ID, {});

    const paginado = prisma.email.groupBy.mock.calls.find((c: any[]) => c[0].skip !== undefined);
    expect(paginado[0].orderBy).toEqual({ _max: { receivedAt: 'desc' } });
  });

  it('solo devuelve hilos del usuario', async () => {
    await service.listThreads(USER_ID, {});

    for (const [args] of prisma.email.groupBy.mock.calls) {
      expect(args.where).toEqual(expect.objectContaining({ userId: USER_ID }));
    }
    expect(prisma.email.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it('aplica el mismo filtro al agrupar y al traer los correos', async () => {
    // Sin repetir el filtro en el `findMany`, un hilo con un correo pendiente y
    // otro completado traeria los dos: `messageCount` diria 2 y la bandeja 1.
    await service.listThreads(USER_ID, { status: EmailStatus.PENDING });

    const { where } = prisma.email.findMany.mock.calls[0][0];
    expect(where.status).toBe(EmailStatus.PENDING);
    expect(where.threadId).toEqual({ in: ['hilo-boletin', 'hilo-con-trabajo', 'hilo-sin-clasificar'] });
  });

  it('no pide correos cuando la pagina no tiene hilos', async () => {
    prisma.email.groupBy.mockImplementation((args: any) =>
      Promise.resolve(args._count ? todos : []),
    );

    const { items, total } = await service.listThreads(USER_ID, { skip: 999 });

    expect(items).toEqual([]);
    // El total sigue siendo el de la bandeja, no el de la pagina vacia.
    expect(total).toBe(3);
    expect(prisma.email.findMany).not.toHaveBeenCalled();
  });
});

describe('EmailsService — POST /emails/bulk-dismiss (Fase 7)', () => {
  let service: EmailsService;
  let prisma: any;
  let tx: any;

  /** Lo que hay en la base para estas pruebas, por id. */
  const enBase = [
    { id: 'p1', status: EmailStatus.PENDING },
    { id: 'p2', status: EmailStatus.PENDING },
    { id: 'ya', status: EmailStatus.DISMISSED },
    { id: 'hecho', status: EmailStatus.COMPLETED },
    { id: 'curso', status: EmailStatus.IN_PROGRESS },
  ];

  beforeEach(() => {
    tx = {
      email: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(enBase.filter((e) => where.id.in.includes(e.id))),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma = { $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)) };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
    );
  });

  it('mueve a DISMISSED los correos pendientes del lote', async () => {
    const r = await service.bulkDismiss(USER_ID, ['p1', 'p2']);

    expect(r).toEqual({ requested: 2, updated: 2, skipped: [] });
    expect(tx.email.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2'] }, userId: USER_ID },
      data: { status: EmailStatus.DISMISSED },
    });
  });

  it('un id muerto no tumba el lote entero', async () => {
    // El escenario del encargo: 318 ids y uno que ya no existe. Sin esto, el
    // lote se cae por completo y la bandeja se queda igual de llena.
    const r = await service.bulkDismiss(USER_ID, ['p1', 'fantasma', 'p2']);

    expect(r.updated).toBe(2);
    expect(r.skipped).toEqual([{ id: 'fantasma', reason: 'NOT_FOUND' }]);
  });

  it('el que ya estaba descartado se omite, y no es un fallo', async () => {
    const r = await service.bulkDismiss(USER_ID, ['p1', 'ya']);

    expect(r.updated).toBe(1);
    expect(r.skipped).toEqual([{ id: 'ya', reason: 'ALREADY_DISMISSED' }]);
  });

  it('sin force no arrastra lo que alguien ya despacho', async () => {
    // Descartar es avanzar, asi que la regla de reapertura no protege esto:
    // el guardarrail es propio del lote. Un clic dirigido a los boletines no
    // puede llevarse por delante trabajo ya completado.
    const r = await service.bulkDismiss(USER_ID, ['p1', 'hecho', 'curso']);

    expect(r.updated).toBe(1);
    expect(r.skipped).toEqual([
      { id: 'hecho', reason: 'NOT_PENDING' },
      { id: 'curso', reason: 'NOT_PENDING' },
    ]);
  });

  it('con force si los arrastra', async () => {
    const r = await service.bulkDismiss(USER_ID, ['p1', 'hecho', 'curso'], undefined, true);

    expect(r.updated).toBe(3);
    expect(r.skipped).toEqual([]);
  });

  it('force no revive lo que ya estaba descartado', async () => {
    const r = await service.bulkDismiss(USER_ID, ['ya'], undefined, true);

    expect(r.updated).toBe(0);
    expect(r.skipped).toEqual([{ id: 'ya', reason: 'ALREADY_DISMISSED' }]);
    expect(tx.email.updateMany).not.toHaveBeenCalled();
  });

  it('cuenta los ids repetidos una sola vez', async () => {
    const r = await service.bulkDismiss(USER_ID, ['p1', 'p1', 'p2']);

    expect(r.requested).toBe(2);
    expect(r.updated).toBe(2);
  });

  it('siempre cuadra updated + skipped = requested', async () => {
    // Es la invariante que deja al cliente comprobar la respuesta en vez de
    // creersela: cada id que se mando sale por una puerta o por la otra.
    const r = await service.bulkDismiss(USER_ID, ['p1', 'ya', 'hecho', 'fantasma', 'p1']);

    expect(r.updated + r.skipped.length).toBe(r.requested);
    expect(r.requested).toBe(4);
  });

  it('filtra por userId al leer y al escribir', async () => {
    await service.bulkDismiss(USER_ID, ['p1']);

    expect(tx.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p1'] }, userId: USER_ID } }),
    );
    expect(tx.email.updateMany.mock.calls[0][0].where.userId).toBe(USER_ID);
  });

  it('lee y escribe dentro de la misma transaccion', async () => {
    await service.bulkDismiss(USER_ID, ['p1']);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('avisa con UN evento por lote, no con uno por correo', async () => {
    // 318 `email.updated` seguidos dejan la bandeja parpadeando mientras se
    // vacia. Es el motivo entero de que exista `email.bulk_updated`.
    await service.bulkDismiss(USER_ID, ['p1', 'p2'], 'socket-9');

    expect(gateway.emitEmailUpdated).not.toHaveBeenCalled();
    expect(gateway.emitEmailsBulkUpdated).toHaveBeenCalledTimes(1);
    expect(gateway.emitEmailsBulkUpdated).toHaveBeenCalledWith(
      { userId: USER_ID, ids: ['p1', 'p2'], status: EmailStatus.DISMISSED },
      'socket-9',
    );
  });

  it('no anuncia nada si no se movio ningun correo', async () => {
    await service.bulkDismiss(USER_ID, ['fantasma']);

    expect(gateway.emitEmailsBulkUpdated).not.toHaveBeenCalled();
  });
});

describe('EmailsService — descarga de adjuntos (Fase 8)', () => {
  let service: EmailsService;
  let prisma: any;

  const FICHAS = [
    {
      attachmentId: 'att-contrato',
      filename: 'Cotización obra.pdf',
      mimeType: 'application/pdf',
      size: 120_000,
      inline: false,
    },
  ];

  beforeEach(() => {
    prisma = {
      email: {
        findFirst: jest.fn().mockResolvedValue({
          gmailMessageId: 'gmail-msg-1',
          attachments: FICHAS,
        }),
      },
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      {} as unknown as EmailClassificationService,
      gateway as unknown as TasksGateway,
      tags as unknown as TagsService,
      gmail as unknown as GmailService,
    );
  });

  it('baja el adjunto de Gmail y devuelve nombre y tipo de NUESTRA ficha', async () => {
    // El nombre y el tipo salen de lo que la persona vio en la lista antes de
    // pulsar, no de lo que conteste Gmail en ese momento.
    const r = await service.downloadAttachment(USER_ID, 'email-1', 'att-contrato');

    expect(r.filename).toBe('Cotización obra.pdf');
    expect(r.mimeType).toBe('application/pdf');
    expect(r.contenido).toBeInstanceOf(Buffer);
    expect(gmail.fetchAttachment).toHaveBeenCalledWith(USER_ID, 'gmail-msg-1', 'att-contrato');
  });

  it('el contenido NO sale de nuestra base: se le pide a Gmail', async () => {
    // Es la decision que hace que un correo con tres PDF de 8 MB nos cueste
    // tres fichas de doscientos bytes.
    await service.downloadAttachment(USER_ID, 'email-1', 'att-contrato');

    const { select } = prisma.email.findFirst.mock.calls[0][0];
    expect(select).toEqual({ gmailMessageId: true, attachments: true });
  });

  describe('lo que impide que esto sea un proxy al buzon entero', () => {
    it('404 si el correo no es del usuario o no existe', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(
        service.downloadAttachment(USER_ID, 'de-otro', 'att-contrato'),
      ).rejects.toThrow(NotFoundException);
      expect(gmail.fetchAttachment).not.toHaveBeenCalled();
    });

    it('filtra por userId ademas de por id', async () => {
      await service.downloadAttachment(USER_ID, 'email-1', 'att-contrato');

      expect(prisma.email.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'email-1', userId: USER_ID } }),
      );
    });

    it('404 si el adjunto NO es de ese correo, aunque el correo si sea suyo', async () => {
      // Sin esta comprobacion, la ruta sirve para bajar cualquier adjunto del
      // buzon sabiendo su id y saltandose la bandeja: el userId protege el
      // correo, pero es la lista de fichas la que dice que adjuntos son suyos.
      await expect(
        service.downloadAttachment(USER_ID, 'email-1', 'att-de-otro-correo'),
      ).rejects.toThrow(NotFoundException);
      expect(gmail.fetchAttachment).not.toHaveBeenCalled();
    });

    it('un correo anterior a la Fase 8 (attachments null) no revienta: da 404', async () => {
      prisma.email.findFirst.mockResolvedValue({
        gmailMessageId: 'gmail-viejo',
        attachments: null,
      });

      await expect(
        service.downloadAttachment(USER_ID, 'email-viejo', 'att-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
