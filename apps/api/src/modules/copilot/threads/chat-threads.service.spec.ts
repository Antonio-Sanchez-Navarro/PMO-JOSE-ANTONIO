import { ChatRole } from '@prisma/client';
import { ChatThreadsService } from './chat-threads.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Prisma de mentira con lo justo que toca este servicio. `$transaction` recibe
 * un arreglo de promesas ya construidas (es la forma por lotes), así que basta
 * con esperarlas.
 */
function prismaFalso() {
  const findMany = jest.fn().mockResolvedValue([]);
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const update = jest.fn().mockResolvedValue({});

  return {
    doble: {
      chatMessage: { findMany, createMany },
      chatThread: { update },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    } as unknown as PrismaService,
    findMany,
    createMany,
  };
}

const fila = (role: ChatRole, content: string) => ({ role, content });

describe('ChatThreadsService — rehidratación del historial', () => {
  /**
   * La que reproduce el fallo del 2026-08-03.
   *
   * Los dos mensajes de un turno se insertan en el mismo `createMany` dentro de
   * una transacción, y `now()` de Postgres sella las dos filas con la hora de
   * inicio de la transacción: el mismo instante al milisegundo. Con
   * `createdAt` como criterio único el empate lo deshacía el motor, y en la
   * base real devolvía el turno del revés — comprobado en un hilo de verdad:
   * `ASSISTANT → USER → USER`.
   *
   * Anthropic exige que el primer mensaje sea del usuario, así que el segundo
   * turno de **cualquier** conversación moría con un 400 del proveedor.
   */
  it('desempata por id, porque los dos mensajes de un turno comparten createdAt', async () => {
    const { doble, findMany } = prismaFalso();

    await new ChatThreadsService(doble).history('hilo-1');

    const { orderBy } = findMany.mock.calls[0][0];

    expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('devuelve el turno en el orden en que se dijo', async () => {
    const { doble, findMany } = prismaFalso();
    // Como las entrega Prisma: de la más reciente a la más antigua.
    findMany.mockResolvedValue([
      fila(ChatRole.ASSISTANT, 'No tengo herramienta para descartar correos'),
      fila(ChatRole.USER, 'mandalo a descartados'),
    ]);

    const historial = await new ChatThreadsService(doble).history('hilo-1');

    expect(historial).toEqual([
      { role: 'user', content: 'mandalo a descartados' },
      { role: 'assistant', content: 'No tengo herramienta para descartar correos' },
    ]);
  });

  /**
   * La ventana corta por número de mensajes, no por turnos: en un hilo largo el
   * corte cae donde cae, y si parte un turno por la mitad el historial empieza
   * por el asistente. Es el mismo 400 por otra puerta, y esta no se arregla
   * ordenando.
   */
  it('descarta las respuestas que la ventana dejó sin su pregunta', async () => {
    const { doble, findMany } = prismaFalso();
    findMany.mockResolvedValue([
      fila(ChatRole.ASSISTANT, 'la última respuesta'),
      fila(ChatRole.USER, 'la última pregunta'),
      // La más antigua que cupo: su pregunta se quedó fuera de la ventana.
      fila(ChatRole.ASSISTANT, 'respuesta huérfana'),
    ]);

    const historial = await new ChatThreadsService(doble).history('hilo-1');

    expect(historial[0].role).toBe('user');
    expect(historial.map((m) => m.content)).not.toContain('respuesta huérfana');
  });

  it('un hilo vacío no rompe el descarte', async () => {
    const { doble } = prismaFalso();

    await expect(new ChatThreadsService(doble).history('hilo-1')).resolves.toEqual([]);
  });
});

describe('ChatThreadsService — guardado del turno', () => {
  it('sella la pregunta antes que la respuesta, sin dejarlo al reloj de Postgres', async () => {
    const { doble, createMany } = prismaFalso();

    await new ChatThreadsService(doble).saveTurn('hilo-1', 'hola', {
      content: 'qué tal',
      provider: 'anthropic',
      model: 'claude-opus-5',
    });

    const [usuario, asistente] = createMany.mock.calls[0][0].data;

    expect(usuario.createdAt).toBeInstanceOf(Date);
    expect(asistente.createdAt).toBeInstanceOf(Date);
    expect(usuario.createdAt.getTime()).toBeLessThan(asistente.createdAt.getTime());
  });

  it('un turno que solo llamó a una herramienta no guarda respuesta en blanco', async () => {
    const { doble, createMany } = prismaFalso();

    await new ChatThreadsService(doble).saveTurn('hilo-1', 'redacta el correo', {
      content: '   ',
      provider: 'anthropic',
      model: 'claude-opus-5',
    });

    const { data } = createMany.mock.calls[0][0];

    expect(data).toHaveLength(1);
    expect(data[0].role).toBe(ChatRole.USER);
  });
});
