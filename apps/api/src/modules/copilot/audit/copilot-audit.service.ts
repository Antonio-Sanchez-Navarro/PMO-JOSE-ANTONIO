import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * La bitácora de lo que el copiloto hizo de verdad (Sprint 6, pedida por Doc).
 *
 * No sustituye al log del proceso: ese se rota y se pierde, y sirve para
 * depurar. Esto responde meses después a **"quién mandó ese correo y qué
 * decía"**, que es la pregunta que aparece cuando algo sale mal — y por eso lo
 * que importa registrar son las acciones que salen hacia afuera o destruyen
 * algo, no cada token generado.
 */
@Injectable()
export class CopilotAuditService {
  private readonly logger = new Logger(CopilotAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ejecuta una acción y la deja registrada, salga bien o mal.
   *
   * Envuelve en vez de que cada sitio escriba dos líneas de bitácora: así no
   * existe el camino en el que alguien registra el intento y olvida registrar
   * el resultado, que es justo el registro que no sirve para nada.
   *
   * El error se re-lanza tal cual: la bitácora observa, no decide.
   */
  async record<T>(
    userId: string,
    toolName: string,
    args: unknown,
    accion: () => Promise<T>,
  ): Promise<T> {
    try {
      const resultado = await accion();
      await this.write(userId, toolName, args, resultado as Prisma.InputJsonValue, true);
      return resultado;
    } catch (error) {
      await this.write(
        userId,
        toolName,
        args,
        { error: error instanceof Error ? error.message : String(error) },
        false,
      );
      throw error;
    }
  }

  /** Lo que el copiloto **propuso**, aunque la persona todavía no lo haya confirmado. */
  async proposal(userId: string, toolName: string, args: unknown): Promise<void> {
    await this.write(userId, `${toolName}.propuesta`, args, null, true);
  }

  /** Lo registrado, de lo más reciente a lo más antiguo. */
  list(userId: string, take = 50) {
    return this.prisma.copilotAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Escribe la fila.
   *
   * **Nunca propaga.** Si la bitácora falla, el correo ya se envió y la tarea
   * ya se creó: tumbar la petición por no haber podido anotarlo convertiría un
   * problema de registro en uno de cara al usuario, y encima dejaría la acción
   * hecha igualmente. El fallo queda en el log del proceso, que es donde se
   * mira cuando la bitácora aparece incompleta.
   */
  private async write(
    userId: string,
    toolName: string,
    args: unknown,
    result: Prisma.InputJsonValue | null,
    ok: boolean,
  ): Promise<void> {
    try {
      await this.prisma.copilotAuditLog.create({
        data: {
          userId,
          toolName,
          arguments: (args ?? {}) as Prisma.InputJsonValue,
          result: result ?? Prisma.JsonNull,
          ok,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar ${toolName} en la bitácora`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
