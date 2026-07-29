import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChatRole } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { LlmMessage } from '../llm/llm.types';

/** Cuántos turnos se rehidratan en cada llamada. */
const VENTANA = 20;

/** Tope del título compuesto desde el primer mensaje. */
const TITULO_MAX = 80;

/**
 * Los hilos de conversación del copiloto (Sprint 6).
 *
 * Existe porque un copiloto sin memoria de la conversación obliga a repetir el
 * contexto en cada frase: "¿y ese correo de quién era?" no se puede responder
 * si cada turno empieza de cero.
 */
@Injectable()
export class ChatThreadsService {
  private readonly logger = new Logger(ChatThreadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * El hilo al que pertenece este turno: el que venga en `threadId`, o uno
   * nuevo si no viene.
   *
   * Filtra por `userId` además de por id: sin eso, cualquier sesión válida
   * podría continuar —y leer— la conversación de otra persona con solo conocer
   * su id.
   */
  async resolve(userId: string, threadId: string | undefined, primerMensaje: string) {
    if (!threadId) {
      const thread = await this.prisma.chatThread.create({
        data: { userId, title: titulo(primerMensaje) },
      });

      this.logger.log(`Hilo nuevo ${thread.id}: "${thread.title}"`);
      return thread;
    }

    const thread = await this.prisma.chatThread.findFirst({ where: { id: threadId, userId } });
    if (!thread) {
      throw new NotFoundException(`No existe la conversación ${threadId}`);
    }

    return thread;
  }

  /**
   * Los últimos turnos del hilo, en orden, listos para el modelo.
   *
   * Se acota a `VENTANA` porque el historial crece sin techo y cada turno se
   * reenvía entero: sin límite, una conversación larga acabaría costando más en
   * historial que en respuesta. Se piden los más **recientes** y se les da la
   * vuelta, que es lo contrario de coger los primeros: lo que importa para
   * seguir hablando es el final.
   */
  async history(threadId: string): Promise<LlmMessage[]> {
    const filas = await this.prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: VENTANA,
      select: { role: true, content: true },
    });

    return filas
      .reverse()
      .map((m) => ({ role: m.role === ChatRole.USER ? 'user' : 'assistant', content: m.content }));
  }

  /**
   * Guarda el turno completo —lo que preguntó y lo que respondió— y toca el
   * hilo para que suba en la lista.
   *
   * Los dos mensajes van en una transacción: media conversación guardada es
   * peor que ninguna, porque al rehidratarla el modelo leería una pregunta sin
   * respuesta como si se hubiera quedado callado.
   *
   * Se llama **después** de que el stream termine, con el texto ya completo.
   */
  async saveTurn(
    threadId: string,
    userMessage: string,
    assistant: { content: string; provider: string; model: string },
  ): Promise<void> {
    // Una respuesta vacía no se guarda: pasa cuando el turno fue solo una
    // llamada a herramienta, y un mensaje en blanco en el historial solo sirve
    // para confundir al modelo en el turno siguiente.
    const mensajes = [
      { threadId, role: ChatRole.USER, content: userMessage },
      ...(assistant.content.trim()
        ? [
            {
              threadId,
              role: ChatRole.ASSISTANT,
              content: assistant.content,
              provider: assistant.provider,
              model: assistant.model,
            },
          ]
        : []),
    ];

    await this.prisma.$transaction([
      this.prisma.chatMessage.createMany({ data: mensajes }),
      this.prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
    ]);
  }

  /** Los hilos del usuario, del más reciente al más antiguo. */
  list(userId: string) {
    return this.prisma.chatThread.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  /** Una conversación entera, para reabrirla en el panel. */
  async findOne(userId: string, threadId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: { id: threadId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, model: true, createdAt: true },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException(`No existe la conversación ${threadId}`);
    }

    return thread;
  }

  /** Borra una conversación. Los mensajes caen con ella (cascada en el esquema). */
  async remove(userId: string, threadId: string): Promise<void> {
    const { count } = await this.prisma.chatThread.deleteMany({ where: { id: threadId, userId } });

    if (count === 0) {
      throw new NotFoundException(`No existe la conversación ${threadId}`);
    }
  }
}

/**
 * Título del hilo a partir del primer mensaje.
 *
 * Se compone en vez de pedírselo al modelo: una llamada extra por conversación
 * nueva costaría tokens y latencia para pintar una línea en una lista.
 */
function titulo(mensaje: string): string {
  const limpio = mensaje.trim().replace(/\s+/g, ' ');

  return limpio.length > TITULO_MAX ? `${limpio.slice(0, TITULO_MAX - 1)}…` : limpio || 'Sin título';
}
