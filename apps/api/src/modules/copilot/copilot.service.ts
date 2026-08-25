import { BadGatewayException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { CopilotAuditService } from './audit/copilot-audit.service';
import { ToolRunnerService } from './tools/tool-runner.service';
import { CreateTaskFromCopilotDto } from './dto/create-task-from-copilot.dto';
import { LlmFactory } from './llm/llm.factory';
import { LlmChunk, LlmMessage } from './llm/llm.types';
import { StartChatDto } from './dto/start-chat.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { EMAIL_SENDER, EmailSender, SendResult } from './email/email-sender';
import { ChatThreadsService } from './threads/chat-threads.service';
import { CopilotContextService } from './context/copilot-context.service';

/**
 * Instrucciones de sistema del copiloto.
 *
 * Constante y al principio del prompt a propósito: es el prefijo estable que
 * permite que la caché del proveedor sirva de algo. Interpolar aquí la fecha o
 * el nombre del usuario invalidaría la caché en cada petición — el contexto
 * variable va en los mensajes, que llegan después.
 */
const SYSTEM_PROMPT = [
  'Eres el copiloto de un PMO inmobiliario. Trabajas sobre correos y tareas reales.',
  'Respondes en español, breve y al grano: quien pregunta está gestionando su día, no leyendo un informe.',
  'Si no tienes un dato, dices que no lo tienes en vez de suponerlo.',
  // Sin esta línea el modelo escribe el correo en la respuesta y la herramienta
  // no se llama nunca: el frontend recibiría texto donde espera un borrador
  // editable. Comprobado con los dos proveedores.
  'Cuando te pidan redactar o responder un correo, usa la herramienta draft_email en vez de escribirlo en la respuesta.',
].join(' ');

/**
 * Orquesta un turno del copiloto: arma el prompt, elige el proveedor y devuelve
 * la respuesta en trozos.
 *
 * No conoce a Claude ni a Gemini: pide a la fábrica la estrategia del payload y
 * habla con ella por el contrato. Añadir un proveedor no toca este archivo.
 */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(
    private readonly factory: LlmFactory,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    private readonly threads: ChatThreadsService,
    private readonly context: CopilotContextService,
    private readonly audit: CopilotAuditService,
    private readonly tasks: TasksService,
    private readonly prisma: PrismaService,
    private readonly toolRunner: ToolRunnerService,
  ) {}

  /**
   * Un turno de conversación.
   *
   * La estrategia se resuelve **antes** de devolver el iterable, de modo que un
   * proveedor no configurado lanza su 503 en la propia llamada y el controlador
   * puede convertirlo en una respuesta de error normal. Si se resolviera dentro
   * del generador, el fallo no aparecería hasta el primer `next()`, con las
   * cabeceras SSE ya enviadas.
   */
  async chat(
    userId: string,
    dto: StartChatDto,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<LlmChunk>> {
    const strategy = this.factory.get(dto.provider);

    // Todo lo que puede fallar se resuelve **antes** de devolver el iterable:
    // el 503 del proveedor, el 404 del hilo ajeno y el 404 del contexto que no
    // es suyo. Dentro del generador ya no habría forma de responder con un
    // código: el controlador habría mandado las cabeceras SSE.
    const thread = await this.threads.resolve(userId, dto.threadId, dto.message);
    const [history, contexto] = await Promise.all([
      this.threads.history(thread.id),
      this.context.build(userId, dto.context),
    ]);

    const model = strategy.modelFor(dto.tier);
    this.logger.log(
      `Copiloto: ${dto.provider}/${dto.tier} → ${model} (hilo ${thread.id}, ${history.length} turnos previos)`,
    );

    const messages: LlmMessage[] = [...history, { role: 'user', content: dto.message }];

    return this.run(
      strategy.stream({
        system: SYSTEM_PROMPT + contexto,
        messages,
        tier: dto.tier,
        signal,
        // Las de solo lectura las ejecuta el backend y el resultado vuelve al
        // modelo dentro del mismo turno. El `userId` se cierra aquí: el modelo
        // pide "busca X" sin saber de quién son los datos.
        execute: (toolName, args) => this.toolRunner.run(userId, toolName, args),
      }),
      { threadId: thread.id, userMessage: dto.message, provider: dto.provider, model },
    );
  }

  /**
   * Envuelve el stream del proveedor para guardar el turno cuando termina.
   *
   * El texto se va acumulando según sale hacia el cliente —no se retiene nada—
   * y se persiste al final, cuando ya está completo. Guardar por trozos
   * escribiría en la base una vez por token.
   *
   * El `threadId` se añade al evento de cierre porque el cliente lo necesita
   * para el turno siguiente y en una conversación nueva no lo conoce todavía.
   *
   * Si el cliente corta a media respuesta, el `finally` guarda **lo que se
   * alcanzó a decir**: perderlo dejaría el hilo con una pregunta sin respuesta,
   * que al rehidratarlo el modelo leería como que se quedó callado.
   */
  private async *run(
    stream: AsyncIterable<LlmChunk>,
    turno: { threadId: string; userMessage: string; provider: string; model: string },
  ): AsyncIterable<LlmChunk> {
    let respuesta = '';
    let guardado = false;

    const guardar = async () => {
      if (guardado) return;
      guardado = true;

      try {
        await this.threads.saveTurn(turno.threadId, turno.userMessage, {
          content: respuesta,
          provider: turno.provider,
          model: turno.model,
        });
      } catch (error) {
        // No se propaga: la respuesta ya la recibió el usuario y tumbar el
        // stream por un fallo al archivar sería cambiar un problema pequeño
        // por uno visible.
        this.logger.error(
          `No se pudo guardar el turno del hilo ${turno.threadId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    };

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'text') respuesta += chunk.text;

        yield chunk.type === 'done' ? { ...chunk, threadId: turno.threadId } : chunk;
      }
    } finally {
      await guardar();
    }
  }

  /** Qué proveedores puede ofrecer esta instalación. */
  providers() {
    return this.factory.available();
  }

  /**
   * Crea la tarea que la persona confirmó en la tarjeta.
   *
   * Reutiliza `TasksService.create`, que es donde viven las reglas del tablero
   * —el escalado de prioridad por fecha, nacer en `OVERDUE` si ya venció, la
   * posición al final de la columna—. Una creación paralela aquí acabaría
   * divergiendo de lo que hace el tablero, y la tarea del copiloto se
   * comportaría distinto que las demás.
   *
   * El `sourceEmailId` se comprueba antes de enlazarlo: el id lo copia el
   * modelo del bloque de contexto y uno ajeno colgaría la tarea del correo de
   * otra persona.
   */
  async createTask(userId: string, dto: CreateTaskFromCopilotDto, socketId?: string) {
    return this.audit.record(userId, 'create_task', dto, async () => {
      const sourceEmailId = dto.sourceEmailId
        ? (
            await this.prisma.email.findFirst({
              where: { id: dto.sourceEmailId, userId },
              select: { id: true },
            })
          )?.id
        : undefined;

      if (dto.sourceEmailId && !sourceEmailId) {
        throw new NotFoundException(`No existe el correo ${dto.sourceEmailId}`);
      }

      const task = await this.tasks.create(
        userId,
        {
          title: dto.title.trim(),
          description: dto.description,
          priority: dto.priority,
          dueDate: dto.dueDate ?? undefined,
        } as never,
        socketId,
      );

      // El enlace se pone después porque `TasksService.create` no lo acepta:
      // su DTO es el del tablero, donde una tarea a mano no viene de un correo.
      return sourceEmailId
        ? this.prisma.task.update({
            where: { id: task.id },
            data: { sourceEmailId },
            include: { labels: true },
          })
        : task;
    });
  }

  /** La bitácora del copiloto, para el panel de auditoría. */
  auditLog(userId: string) {
    return this.audit.list(userId);
  }

  /**
   * Envía el borrador ya aprobado por la persona.
   *
   * Un fallo de Gmail sale como **502** y no como 500: el problema no es de esta
   * API sino del servicio de arriba —token caducado, cuota, dirección
   * rechazada— y quien lo lea en la interfaz necesita saber que reintentar
   * puede tener sentido. El motivo real se registra en el log; hacia fuera va
   * un mensaje que se puede enseñar.
   */
  async sendEmail(userId: string, dto: SendEmailDto): Promise<SendResult> {
    try {
      // Envuelto en la bitácora: enviar un correo sale hacia afuera y es
      // irreversible, así que es exactamente lo que hay que poder auditar tres
      // meses después.
      return await this.audit.record(userId, 'send_email', dto, () =>
        this.emailSender.send(userId, dto),
      );
    } catch (error) {
      this.logger.error(
        `No se pudo enviar el correo a ${dto.to.join(', ')}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new BadGatewayException(
        'No se pudo enviar el correo. Revisa la sesión de Google y vuelve a intentarlo.',
      );
    }
  }
}
