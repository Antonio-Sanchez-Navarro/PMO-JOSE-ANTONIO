import { Injectable, Logger } from '@nestjs/common';
import { EmailStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CopilotAuditService } from '../audit/copilot-audit.service';
import { GET_METRICS, SEARCH_EMAILS } from '../llm/tools';

/** Tope de correos que devuelve una búsqueda. */
const LIMITE_MAX = 25;
const LIMITE_DEFECTO = 10;

/** Cuánto texto de cada correo se le devuelve al modelo. */
const VISTA_PREVIA = 400;

/**
 * Ejecuta las herramientas de **solo lectura** y le devuelve el resultado al
 * modelo dentro del mismo turno.
 *
 * Van por aquí y no por el frontend porque no cambian nada: parar el turno para
 * preguntar "¿puedo mirar tus correos?" sería interrumpir para pedir permiso de
 * leer algo que ya es suyo. Las que sí actúan —mandar un correo, crear una
 * tarea— siguen el camino contrario y las confirma una persona.
 *
 * Todo se consulta **filtrando por `userId`**: el modelo pide "busca X" sin
 * saber de quién son los datos, y es aquí donde se decide que solo puede ver
 * los de quien pregunta.
 */
@Injectable()
export class ToolRunnerService {
  private readonly logger = new Logger(ToolRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CopilotAuditService,
  ) {}

  /**
   * Ejecuta y devuelve el resultado ya serializable.
   *
   * **Nunca lanza.** Un fallo vuelve como `{ error }` para que el modelo lo lea
   * y siga hablando —"no pude buscar, inténtalo de otra forma"— en vez de
   * romper el stream a media respuesta, cuando el cliente ya está pintando
   * texto y el código de estado se mandó hace rato.
   */
  async run(userId: string, toolName: string, args: unknown): Promise<unknown> {
    try {
      return await this.audit.record(userId, toolName, args, () =>
        this.dispatch(userId, toolName, args),
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.error(`La herramienta ${toolName} falló: ${mensaje}`);

      return { error: `No se pudo ejecutar ${toolName}: ${mensaje}` };
    }
  }

  private dispatch(userId: string, toolName: string, args: unknown): Promise<unknown> {
    if (toolName === SEARCH_EMAILS) return this.searchEmails(userId, args);
    if (toolName === GET_METRICS) return this.getMetrics(userId);

    return Promise.resolve({ error: `Herramienta desconocida: ${toolName}` });
  }

  /**
   * Busca en asunto, remitente y cuerpo.
   *
   * `mode: 'insensitive'` es el ILIKE de Postgres, igual que la búsqueda de
   * tareas del Sprint 4. Se devuelve una vista previa recortada y no el cuerpo
   * entero: hay correos de más de 50 KB y diez de ellos llenarían el contexto
   * del turno con texto que el modelo no va a citar.
   */
  private async searchEmails(userId: string, args: unknown) {
    const entrada = (args ?? {}) as { query?: unknown; limit?: unknown };
    const query = typeof entrada.query === 'string' ? entrada.query.trim() : '';

    if (!query) return { error: 'Hace falta un texto que buscar.' };

    const limit = Math.min(
      typeof entrada.limit === 'number' && entrada.limit > 0 ? entrada.limit : LIMITE_DEFECTO,
      LIMITE_MAX,
    );

    const correos = await this.prisma.email.findMany({
      where: {
        userId,
        OR: [
          { subject: { contains: query, mode: 'insensitive' } },
          { from: { contains: query, mode: 'insensitive' } },
          { bodyText: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        status: true,
        bodyText: true,
        snippet: true,
      },
    });

    this.logger.log(`search_emails "${query}": ${correos.length} resultado(s)`);

    return {
      query,
      total: correos.length,
      // El `id` va incluido a propósito: es lo que el modelo copia si después
      // propone una tarea a partir de uno de estos correos.
      emails: correos.map((c) => ({
        id: c.id,
        subject: c.subject ?? '(sin asunto)',
        from: c.from,
        date: c.receivedAt.toISOString(),
        status: c.status,
        preview: (c.bodyText ?? c.snippet ?? '').slice(0, VISTA_PREVIA),
      })),
    };
  }

  /** El estado del tablero y de la bandeja, en una sola consulta por bloque. */
  private async getMetrics(userId: string) {
    const inicioSemana = new Date();
    inicioSemana.setDate(inicioSemana.getDate() - 7);

    const [porEstado, correosPendientes, tiempo] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], where: { userId }, _count: true }),
      this.prisma.email.count({ where: { userId, status: EmailStatus.PENDING } }),
      this.prisma.timeEntry.aggregate({
        where: { userId, startedAt: { gte: inicioSemana }, durationSec: { not: null } },
        _sum: { durationSec: true },
      }),
    ]);

    const tareas = Object.fromEntries(
      Object.values(TaskStatus).map((estado) => [
        estado,
        porEstado.find((g) => g.status === estado)?._count ?? 0,
      ]),
    );

    return {
      tareas,
      tareasTotales: Object.values(tareas).reduce((a, b) => a + b, 0),
      correosPendientes,
      // En horas y no en segundos: el modelo va a escribir esto en una frase.
      horasRegistradasUltimos7Dias: Math.round(((tiempo._sum.durationSec ?? 0) / 3600) * 10) / 10,
    };
  }
}
