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
  makeEmail,
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
    // G.2.1: el correo y el hilo viajan para el log de uso por llamada.
    traza: expect.objectContaining({ emailId: expect.any(String), threadId: expect.any(String) }),
  };

  beforeEach(() => {
    tx = {
      task: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
      // G.2.4: el borrador va al más reciente y se vacían los demás del hilo.
      email: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma = {
      email: { 
        findUniqueOrThrow: jest.fn().mockResolvedValue(emailConFechaRelativa),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // G.2: lo aprobado del hilo entra en el contexto.
      task: { findMany: jest.fn().mockResolvedValue([]) },
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

  /**
   * G.2 — la IA piensa el hilo entero.
   *
   * Antes cada correo se analizaba solo, con los anteriores como «historial
   * citado» sin autor ni fecha, y con la orden de «analizar SOLO lo nuevo». Lo
   * resuelto en un mensaje posterior nunca anulaba lo pedido en uno anterior.
   * Fixtures sintéticos: nombres y correos inventados.
   */
  describe('G.2 · clasificación por hilo', () => {
    const peticion = makeEmail({
      id: 'hilo-1-peticion',
      threadId: 'hilo-1',
      from: 'Ana Pérez <ana@creditos.example>',
      subject: 'Escrituración depto 101',
      bodyText:
        'Hola, para avanzar necesito:\n1. Notaría con la que trabajan.\n2. Contacto para el avalúo.\n3. Boleta de agua.',
      receivedAt: new Date('2026-09-22T23:58:00.000Z'),
    });
    const resolucion = makeEmail({
      id: 'hilo-1-resolucion',
      threadId: 'hilo-1',
      from: 'Equipo <equipo@zepto.com.mx>',
      subject: 'Re: Escrituración depto 101',
      bodyText: [
        'Estimada Ana: la notaría es la 12 y el avalúo lo atiende Luis (555 000 0000).',
        'La boleta de agua se la enviamos en cuanto la tengamos.',
        '',
        'El mar, 22 sept 2026 a la(s) 5:58 p.m., Ana Pérez (ana@creditos.example)',
        'escribió:',
        '> Hola, para avanzar necesito:',
        '> 1. Notaría con la que trabajan.',
      ].join('\n'),
      receivedAt: new Date('2026-09-28T22:58:00.000Z'),
    });

    /** El texto que recibe el modelo del hilo, para mirarlo entero. */
    const loQueVeElModelo = () => {
      const [, cuerpo, , opciones] = ai.analyzeEmail.mock.calls[0];
      const h = opciones.hilo;
      return { cuerpo: cuerpo as string, hilo: h, todo: `${h?.mensajes ?? ''}\n${h?.ultimo ?? ''}\n${cuerpo}` };
    };

    it('(a) analizar la petición vieja manda el hilo entero, con la resolución posterior', async () => {
      // El worker procesa la petición, pero en la base ya está la respuesta
      // del equipo. Antes el contexto era solo «hacia atrás» y el modelo no
      // podía ver que la notaría y el avalúo ya se habían dado.
      prisma.email.findUniqueOrThrow.mockResolvedValue(peticion);
      prisma.email.findMany.mockResolvedValue([resolucion]);

      await service.classifyAndPersist(peticion.id, { replaceExisting: true, forceActionable: false });

      const { cuerpo, hilo } = loQueVeElModelo();
      // Lo que se analiza es el hilo desde su mensaje más reciente…
      expect(cuerpo).toContain('la notaría es la 12');
      // …con la petición antes, entera, como contexto.
      expect(hilo.mensajes).toContain('1. Notaría con la que trabajan.');
      expect(ai.analyzeEmail.mock.calls[0][2]).toEqual(resolucion.receivedAt);
      expect(ai.analyzeEmail.mock.calls[0][3].traza).toEqual({ emailId: resolucion.id, threadId: 'hilo-1' });
    });

    it('(a) y el borrador se guarda en el más reciente; los demás del hilo se vacían', async () => {
      prisma.email.findUniqueOrThrow.mockResolvedValue(peticion);
      prisma.email.findMany.mockResolvedValue([resolucion]);

      await service.classifyAndPersist(peticion.id, { replaceExisting: true, forceActionable: false });

      const [primero] = tx.email.update.mock.calls.map((c: any[]) => c[0]);
      expect(primero.where).toEqual({ id: resolucion.id });
      expect(primero.data.proposedTasks).toEqual([expect.objectContaining({ title: expect.any(String) })]);
      expect(primero.data.processedAt).toBeInstanceOf(Date);
      // Solo los de este hilo y de esta persona, y en ese momento.
      expect(tx.email.updateMany).toHaveBeenCalledWith({
        where: { userId: resolucion.userId, threadId: 'hilo-1', id: { not: resolucion.id } },
        data: { proposedTasks: expect.anything() },
      });
      // Encargo J: queda despachado todo lo pendiente del hilo hasta el ancla
      // (aquí, la petición que procesaba el worker), no solo el correo pedido.
      expect(tx.email.updateMany).toHaveBeenCalledWith({
        where: {
          userId: resolucion.userId,
          threadId: 'hilo-1',
          id: { not: resolucion.id },
          processedAt: null,
          receivedAt: { lte: resolucion.receivedAt },
        },
        data: { processedAt: expect.any(Date) },
      });
    });

    it('(c) una tarea aprobada sigue intacta: se le enseña al modelo y no se escribe en Task', async () => {
      prisma.email.findUniqueOrThrow.mockResolvedValue(resolucion);
      prisma.email.findMany.mockResolvedValue([peticion]);
      prisma.task.findMany.mockResolvedValue([
        {
          title: 'Escrituración depto 101',
          status: 'TODO',
          subtasks: [{ title: 'Enviar boleta de agua', isCompleted: false }],
        },
      ]);

      await service.classifyAndPersist(resolucion.id, { replaceExisting: true, forceActionable: false });

      // Se buscan por el hilo y la persona…
      expect(prisma.task.findMany.mock.calls[0][0].where).toEqual({
        userId: resolucion.userId,
        sourceEmail: { threadId: 'hilo-1' },
      });
      // …se le pasan al modelo para que no las vuelva a proponer…
      expect(loQueVeElModelo().hilo.aprobadas).toEqual([
        '- Escrituración depto 101 [TODO]\n  · Enviar boleta de agua (pendiente)',
      ]);
      // …y no se toca ninguna fila de Task: ni crear, ni borrar, ni actualizar.
      expect(tx.task.create).not.toHaveBeenCalled();
      expect(tx.task.deleteMany).not.toHaveBeenCalled();
      expect(prisma.task.update).toBeUndefined();
    });

    it('(d) el contexto lleva autor y fecha de cada mensaje, y no lleva citas', async () => {
      prisma.email.findUniqueOrThrow.mockResolvedValue(resolucion);
      prisma.email.findMany.mockResolvedValue([peticion]);

      await service.classifyAndPersist(resolucion.id, { replaceExisting: true, forceActionable: false });

      const { cuerpo, hilo } = loQueVeElModelo();
      expect(hilo.mensajes).toContain('De: Ana Pérez <ana@creditos.example> · 2026-09-22 23:58 UTC');
      expect(hilo.ultimo).toBe('De: Equipo <equipo@zepto.com.mx> (nuestro equipo) · 2026-09-28 22:58 UTC');
      // La respuesta llega sin lo que cita de la petición.
      expect(cuerpo).not.toContain('escribió:');
      expect(cuerpo).not.toContain('> ');
      expect(cuerpo).toContain('La boleta de agua se la enviamos');
    });

    it('el mensaje más antiguo de la base conserva sus citas: puede ser lo único que queda de antes', async () => {
      const primeroConCitas = makeEmail({
        ...peticion,
        bodyText: 'Sigo pendiente.\n\nEl lun, 21 sept 2026, Luis (luis@demo.example) escribió:\n> Les paso el contrato firmado.',
      });
      prisma.email.findUniqueOrThrow.mockResolvedValue(resolucion);
      prisma.email.findMany.mockResolvedValue([primeroConCitas]);

      await service.classifyAndPersist(resolucion.id, { replaceExisting: true, forceActionable: false });

      expect(loQueVeElModelo().hilo.mensajes).toContain('> Les paso el contrato firmado.');
    });

    it('tope de 8.000 caracteres de texto nuevo: se omite lo más antiguo y se dice', async () => {
      const largo = makeEmail({ ...peticion, id: 'largo', bodyText: 'x'.repeat(7_900) });
      const medio = makeEmail({
        ...peticion,
        id: 'medio',
        bodyText: 'Mensaje intermedio corto.',
        receivedAt: new Date('2026-09-25T10:00:00.000Z'),
        proposedTasks: [{ title: 'Propuesta pendiente de antes' }],
      });
      prisma.email.findUniqueOrThrow.mockResolvedValue(resolucion);
      prisma.email.findMany.mockResolvedValue([largo, medio]);

      await service.classifyAndPersist(resolucion.id, { replaceExisting: true, forceActionable: false });

      const { hilo } = loQueVeElModelo();
      expect(hilo.omitidos).toBe(1);
      expect(hilo.mensajes).not.toContain('xxxx');
      expect(hilo.mensajes).toContain('Mensaje intermedio corto.');
      // Lo que salió de lo omitido sigue a la vista.
      expect(hilo.borradorAnterior).toEqual(['- Propuesta pendiente de antes']);
    });

    it('un hilo de un solo correo sin nada aprobado se analiza como siempre, con el cuerpo entero', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      await service.classifyAndPersist(emailConFechaRelativa.id, {
        replaceExisting: true,
        forceActionable: false,
      });

      // `undefined` y no una sección vacía: el prompt no lleva hilo que no hay.
      expect(ai.analyzeEmail.mock.calls[0][3].hilo).toBeUndefined();
      expect(ai.analyzeEmail.mock.calls[0][1]).toBe(emailConFechaRelativa.bodyText);
    });

    it('«Volver a analizar» guarda el borrador del hilo sin marcar nada como procesado', async () => {
      prisma.email.findUniqueOrThrow.mockResolvedValue(peticion);
      prisma.email.findMany.mockResolvedValue([resolucion]);

      const draft = await service.reclassifyThread(peticion.id);

      expect(draft.emailId).toBe(resolucion.id);
      expect(tx.email.update).toHaveBeenCalledTimes(1);
      const data = tx.email.update.mock.calls[0][0].data;
      expect(tx.email.update.mock.calls[0][0].where).toEqual({ id: resolucion.id });
      expect(data).not.toHaveProperty('processedAt');
      expect(data).not.toHaveProperty('isActionable');
      expect(tx.email.updateMany).toHaveBeenCalled();
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
      email: { update: jest.fn(), updateMany: jest.fn() },
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
      // G.2: lo aprobado del hilo entra en el contexto.
      task: { findMany: jest.fn().mockResolvedValue([]) },
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
      // G.2.4: el borrador va al más reciente y se vacían los demás del hilo.
      email: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma = {
      email: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(conAdjuntos([ficha()])),
        findMany: jest.fn().mockResolvedValue([]),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
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
