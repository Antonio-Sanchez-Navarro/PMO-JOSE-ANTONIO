import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Task, TaskPriority } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  EmailClassificationService,
  MANUAL_TAG,
} from '../ai/email-classification.service';
import { ToTaskDto } from './dto/to-task.dto';

export interface ToTaskResult {
  emailId: string;
  /** 'manual' si el cuerpo traía `title`; 'ai' si lo extrajo el modelo. */
  mode: 'manual' | 'ai';
  /** Solo en modo 'ai': el modelo no vio nada accionable y se usó el asunto. */
  usedFallback: boolean;
  tasks: Task[];
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classification: EmailClassificationService,
  ) {}

  /**
   * Convierte un correo en tarea a petición de una persona.
   *
   * A diferencia del worker, aquí nunca se borran tareas: la conversión manual
   * solo añade. El guardarraíl contra duplicados es el 409, no el borrado.
   */
  async convertToTask(userId: string, emailId: string, dto: ToTaskDto): Promise<ToTaskResult> {
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
          // Marca que protege esta tarea del borrado en un reproceso posterior.
          tags: [MANUAL_TAG],
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
}
