import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Task, TaskPriority, TaskSource, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailClassificationService } from '../ai/email-classification.service';
import { ConfirmedTaskDto, ToTaskDto } from './dto/to-task.dto';
import { QueryEmailsDto } from './dto/query-emails.dto';
import { TasksGateway } from '../tasks/tasks.gateway';

/** Un correo tal y como lo necesita la bandeja de triage del tablero. */
export interface TriageEmail {
  id: string;
  subject: string;
  from: string;
  /** ISO 8601, para que el cliente la formatee como quiera. */
  date: string;
  category: string | null;
  taskCount: number;
  /** Ya generó tareas: `to-task` daría 409 salvo que se insista con `force`. */
  isConverted: boolean;
  /** Hilo de Gmail, para agrupar la lista como hace la bandeja. */
  threadId: string;
  /** Etiquetas de Gmail (`INBOX`, `UNREAD`, `CATEGORY_*`…), para los filtros. */
  labels: string[];
  /** Vista previa corta. Cadena vacía si el correo no la trae. */
  snippet: string;
  /**
   * El id del mensaje en Gmail. No sirve para `classify` ni `to-task` —para eso
   * está `id`— pero permite casar esta lista con la que devuelve
   * `GET /gmail/inbox` sin tener que adivinar por asunto y fecha.
   */
  gmailMessageId: string;
}

/** Una tarea que ese correo ya generó, en su versión corta. */
export interface EmailTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
}

/** El correo completo, para la vista de lectura previa a la cuarentena. */
export interface EmailDetail extends TriageEmail {
  /** Texto completo. `null` si el correo se guardó sin cuerpo. */
  bodyText: string | null;
  isActionable: boolean;
  /** ISO 8601, o `null` si el worker todavía no lo ha despachado. */
  processedAt: string | null;
  /** Las tareas que ya salieron de este correo, en el orden del tablero. */
  tasks: EmailTaskSummary[];
}

export interface ToTaskResult {
  emailId: string;
  /**
   * `'confirmed'` si el cuerpo traía `tasks[]` (aprobación desde la cuarentena),
   * `'manual'` si traía `title`, `'ai'` si lo extrajo el modelo.
   */
  mode: 'confirmed' | 'manual' | 'ai';
  /** Solo en modo 'ai': el modelo no vio nada accionable y se usó el asunto. */
  usedFallback: boolean;
  tasks: Task[];
}

/** Una tarea propuesta: todavía no existe en la base de datos, por eso no hay `id`. */
export interface ProposedTask {
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  dueDate: Date | null;
}

/** Lo que el modelo propone para un correo, sin haber escrito nada. */
export interface ClassificationResult {
  emailId: string;
  category: string;
  isActionable: boolean;
  aiConfidence: number;
  tasks: ProposedTask[];
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classification: EmailClassificationService,
    private readonly gateway: TasksGateway,
  ) {}

  /**
   * Devuelve lo que la IA propone para un correo **sin crear nada**.
   *
   * Es el primer paso de la validación humana: la persona ve las tareas
   * propuestas, las edita o las descarta, y solo entonces se crean con
   * `to-task`. Por eso no hay 409 por duplicados aquí — mirar qué propondría el
   * modelo no colisiona con nada — ni se marca el correo como procesado.
   *
   * No se fuerza `isActionable`: si el modelo no ve nada accionable, se dice y
   * ya decidirá la persona. Forzar aquí sería inventarle una tarea a alguien
   * que solo estaba mirando.
   */
  /**
   * Los correos del usuario para la bandeja de triage.
   *
   * Nace porque el frontend no tenía forma legítima de conocer el `Email.id`:
   * `GET /gmail/inbox` va en vivo a Google y devuelve el id de mensaje de Gmail,
   * que no es el que aceptan `classify` ni `to-task`. Sin esta ruta, la única
   * manera de probar la cuarentena era pegar un cuid a mano.
   *
   * Lee de nuestra base y no de Gmail a propósito: solo lo persistido tiene id
   * propio, y solo nosotros sabemos qué se convirtió ya. Gmail no lo sabe.
   */
  /**
   * Un correo con su texto completo, para la vista de lectura.
   *
   * Es la contraparte del listado: allí el `bodyText` se excluye porque son
   * ~8 KB por correo, aquí se incluye porque es justo lo que se va a leer. Una
   * persona no puede aprobar tareas propuestas sobre un correo que no ha
   * podido leer.
   *
   * Trae además las tareas que ese correo ya generó: al reprocesar, la vista
   * necesita poder enseñar contra qué se está comparando la propuesta nueva.
   */
  async findOne(userId: string, emailId: string): Promise<EmailDetail> {
    const email = await this.prisma.email.findFirst({
      // Por `userId` además de por `id`: sin esto, cualquier sesión válida
      // leería el correo de otra persona con solo conocer su id.
      where: { id: emailId, userId },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        category: true,
        threadId: true,
        labels: true,
        snippet: true,
        gmailMessageId: true,
        bodyText: true,
        isActionable: true,
        processedAt: true,
        tasks: {
          select: { id: true, title: true, status: true, priority: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!email) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    return {
      id: email.id,
      subject: email.subject ?? '(sin asunto)',
      from: email.from,
      date: email.receivedAt.toISOString(),
      category: email.category,
      threadId: email.threadId,
      labels: email.labels,
      snippet: email.snippet ?? '',
      gmailMessageId: email.gmailMessageId,
      // `null` y no cadena vacía: distingue "este correo no tiene cuerpo
      // guardado" de "el cuerpo está vacío", y así la vista sabe cuándo caer
      // al snippet en vez de enseñar un panel en blanco.
      bodyText: email.bodyText,
      isActionable: email.isActionable,
      processedAt: email.processedAt?.toISOString() ?? null,
      taskCount: email.tasks.length,
      isConverted: email.tasks.length > 0,
      tasks: email.tasks,
    };
  }

  async listForTriage(userId: string, query: QueryEmailsDto): Promise<TriageEmail[]> {
    const emails = await this.prisma.email.findMany({
      where: {
        userId,
        ...(query.actionable === undefined ? {} : { isActionable: query.actionable }),
        // `converted` se traduce a "tiene o no tiene tareas", que es justo lo
        // que hace que `to-task` responda 409. `processedAt` no sirve para
        // esto: el worker lo marca aunque no crease ni una tarea.
        ...(query.converted === undefined
          ? {}
          : query.converted
            ? { tasks: { some: {} } }
            : { tasks: { none: {} } }),
      },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        category: true,
        threadId: true,
        labels: true,
        snippet: true,
        gmailMessageId: true,
        // `bodyText` se queda fuera a propósito: son ~8 KB por correo y en un
        // listado de 50 serían 400 KB por petición para pintar una lista.
        _count: { select: { tasks: true } },
      },
      orderBy: { receivedAt: 'desc' },
      skip: query.skip ?? 0,
      take: query.take ?? 50,
    });

    return emails.map((email) => ({
      id: email.id,
      // El asunto es opcional en la base y la bandeja necesita algo que pintar:
      // una fila sin texto parece un fallo de carga.
      subject: email.subject ?? '(sin asunto)',
      from: email.from,
      date: email.receivedAt.toISOString(),
      category: email.category,
      taskCount: email._count.tasks,
      isConverted: email._count.tasks > 0,
      threadId: email.threadId,
      labels: email.labels,
      snippet: email.snippet ?? '',
      gmailMessageId: email.gmailMessageId,
    }));
  }

  async classify(userId: string, emailId: string): Promise<ClassificationResult> {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, userId },
      select: { id: true, bodyText: true, snippet: true },
    });

    if (!email) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    if (!email.bodyText && !email.snippet) {
      throw new ConflictException(`El correo ${emailId} no tiene texto que analizar.`);
    }

    const draft = await this.classification.classify(email.id, { forceActionable: false });

    this.logger.log(
      `Clasificación en seco del correo ${emailId}: ${draft.tasks.length} tarea(s) propuesta(s)`,
    );

    return {
      emailId: draft.emailId,
      category: draft.category,
      isActionable: draft.isActionable,
      aiConfidence: draft.aiConfidence,
      // `source` se queda fuera: al frontend le da igual de dónde salió el
      // borrador, y lo que acabe creándose lo decide `to-task`.
      tasks: draft.tasks.map(({ title, description, priority, tags, dueDate }) => ({
        title,
        description,
        priority,
        tags,
        dueDate,
      })),
    };
  }

  /**
   * Convierte un correo en tarea y anuncia las tarjetas nuevas al tablero.
   *
   * La emisión vive aquí, envolviendo a las tres vías, y no dentro de cada una:
   * al tablero le da igual si la tarjeta salió de la cuarentena, de un título
   * escrito a mano o del modelo — lo que necesita es enterarse siempre. Puesta
   * en cada rama, cualquier vía futura nacería muda.
   *
   * Va después de que la escritura haya terminado: un evento emitido dentro de
   * la transacción anunciaría tarjetas que aún podrían no llegar a existir.
   */
  async convertToTask(
    userId: string,
    emailId: string,
    dto: ToTaskDto,
    socketId?: string,
  ): Promise<ToTaskResult> {
    const result = await this.createFromEmail(userId, emailId, dto);

    // Un evento por tarjeta, como hace `POST /tasks`: el cliente ya sabe
    // insertar una tarea suelta y no hay que enseñarle un formato nuevo.
    for (const task of result.tasks) {
      this.gateway.emitTaskCreated(task, socketId);
    }

    return result;
  }

  /**
   * Las tres vías de conversión, sin la parte de anunciarlas.
   *
   * A diferencia del worker, aquí nunca se borran tareas: la conversión manual
   * solo añade. El guardarraíl contra duplicados es el 409, no el borrado.
   */
  private async createFromEmail(
    userId: string,
    emailId: string,
    dto: ToTaskDto,
  ): Promise<ToTaskResult> {
    // Filtrar por userId además de por id: sin esto, cualquier sesión válida
    // podría convertir el correo de otra persona con solo conocer su id.
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, userId },
      select: { id: true, subject: true, snippet: true, bodyText: true },
    });

    if (!email) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    if (!dto.force) {
      const existing = await this.prisma.task.count({ where: { sourceEmailId: email.id } });
      if (existing > 0) {
        throw new ConflictException(
          `El correo ${emailId} ya tiene ${existing} tarea(s). Reenvía con "force": true para crear otra.`,
        );
      }
    }

    // Confirmación de la cuarentena: la persona ya revisó la propuesta y esto
    // es lo que aprobó. No se vuelve a llamar al modelo — sería pagar otra vez
    // por una respuesta que además podría no coincidir con lo que aprobó.
    if (dto.tasks?.length) {
      return this.persistConfirmed(userId, email.id, dto.tasks, dto.category);
    }

    // Vía manual: la persona ya escribió el título, no hay nada que inferir.
    if (dto.title?.trim()) {
      const task = await this.prisma.task.create({
        data: {
          userId,
          sourceEmailId: email.id,
          title: dto.title.trim(),
          description: dto.description ?? email.snippet ?? '',
          priority: dto.priority ?? TaskPriority.MEDIUM,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          // Origen que protege esta tarea del borrado en un reproceso posterior.
          source: TaskSource.MANUAL,
        },
      });

      this.logger.log(`Tarea manual ${task.id} creada desde el correo ${emailId}`);
      return { emailId, mode: 'manual', usedFallback: false, tasks: [task] };
    }

    if (!email.bodyText && !email.snippet) {
      throw new ConflictException(
        `El correo ${emailId} no tiene texto que analizar. Envía "title" para crearla a mano.`,
      );
    }

    const result = await this.classification.classifyAndPersist(email.id, {
      // Nunca borrar en la vía manual.
      replaceExisting: false,
      // Si alguien pide convertirlo, se convierte aunque el modelo diga que no.
      forceActionable: true,
    });

    // Los campos del cuerpo pisan lo que dijo el modelo en la primera tarea.
    const [first, ...rest] = result.tasks;
    let tasks = result.tasks;
    if (first && (dto.priority || dto.dueDate || dto.description)) {
      const updated = await this.prisma.task.update({
        where: { id: first.id },
        data: {
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
          ...(dto.description ? { description: dto.description } : {}),
        },
      });
      tasks = [updated, ...rest];
    }

    this.logger.log(
      `Conversión por IA del correo ${emailId}: ${tasks.length} tarea(s)` +
        (result.usedFallback ? ' (fallback desde el asunto)' : ''),
    );

    return { emailId, mode: 'ai', usedFallback: result.usedFallback, tasks };
  }

  /**
   * Escribe lo que la persona aprobó en la cuarentena.
   *
   * Todo en una transacción: o entran las tareas y el correo queda marcado, o
   * no pasa nada. Si se escribieran por separado, un fallo a medias dejaría
   * tareas sin correo procesado —el worker volvería a clasificarlo y las
   * duplicaría— o un correo procesado sin las tareas que lo justifican.
   */
  private async persistConfirmed(
    userId: string,
    emailId: string,
    confirmed: ConfirmedTaskDto[],
    category?: string,
  ): Promise<ToTaskResult> {
    const tasks = await this.prisma.$transaction(async (tx) => {
      // Las tarjetas aprobadas se anexan al final de "Por hacer", igual que las
      // que crea `POST /tasks`: nacer en la posición 0 las metería por delante
      // de lo que el usuario ya tenía ordenado.
      const last = await tx.task.findFirst({
        where: { userId, status: TaskStatus.TODO },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      let position = last ? last.position + 1 : 0;
      const created: Task[] = [];

      // Secuencial y no `Promise.all`: Prisma desaconseja lanzar consultas
      // concurrentes sobre el cliente de una transacción interactiva.
      for (const task of confirmed) {
        created.push(
          await tx.task.create({
            data: {
              userId,
              sourceEmailId: emailId,
              title: task.title.trim(),
              description: task.description ?? '',
              priority: task.priority,
              tags: task.tags ?? [],
              dueDate: task.dueDate ? new Date(task.dueDate) : null,
              position: position++,
              // MANUAL y no EMAIL aunque las propusiera el modelo: las aprobó
              // una persona. El reproceso del worker borra lo que tiene origen
              // EMAIL, y eso destruiría trabajo ya validado.
              source: TaskSource.MANUAL,
            },
          }),
        );
      }

      await tx.email.update({
        where: { id: emailId },
        data: {
          isActionable: true,
          processedAt: new Date(),
          // Solo si la persona la tocó: sin esto, confirmar borraría la
          // categoría que ya tuviera el correo.
          ...(category ? { category } : {}),
        },
      });

      return created;
    });

    this.logger.log(
      `Cuarentena confirmada en el correo ${emailId}: ${tasks.length} tarea(s) aprobada(s)`,
    );

    return { emailId, mode: 'confirmed', usedFallback: false, tasks };
  }
}
