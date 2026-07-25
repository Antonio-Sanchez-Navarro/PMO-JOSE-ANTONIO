import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';

/**
 * Orden canónico de una columna del Kanban.
 *
 * `createdAt` desempata: mientras haya `position` repetidos (datos anteriores a
 * la renumeración) evita que la lista baile entre peticiones, porque sin
 * `ORDER BY` total Postgres no garantiza un orden estable.
 */
const COLUMN_ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { position: 'asc' },
  { createdAt: 'asc' },
];

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, params: { skip?: number; take?: number; status?: string; priority?: string; }) {
    const { skip = 0, take = 50, status, priority } = params;
    const where = { 
      userId,
      ...(status && { status: status as any }), 
      ...(priority && { priority: priority as any }) 
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        skip: Number(skip),
        take: Number(take),
        where,
        // Prisma expects relation name 'sourceEmail' not 'email' based on schema
        include: {
          sourceEmail: {
            select: {
              subject: true,
              from: true
            }
          }
        },
        // Sin `orderBy`, Postgres devolvía las filas en orden de heap: al
        // actualizar una tarea la lista podía reordenarse sola. `status` ordena
        // por el orden de declaración del enum, que es el de las columnas
        // (TODO, IN_PROGRESS, POSTPONED, DONE, OVERDUE).
        orderBy: [{ status: 'asc' }, ...COLUMN_ORDER],
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data, total, skip, take };
  }

  /**
   * Mueve una tarea a una columna y a un hueco concreto, renumerando el resto.
   *
   * Por qué no vale `PATCH /tasks/:id` con `position`: cambiar la posición de
   * una tarjeta desplaza a todas las que van detrás. Si solo se escribiera la
   * tarjeta movida quedarían posiciones repetidas y el orden volvería a ser
   * arbitrario. Aquí se recalcula la columna entera dentro de una transacción,
   * así que o cuadra todo o no se escribe nada.
   *
   * Las escrituras van secuenciales, no en `Promise.all`: Prisma desaconseja
   * lanzar consultas concurrentes sobre el cliente de una transacción
   * interactiva. Con columnas de decenas de tarjetas el coste es irrelevante.
   */
  async move(userId: string, id: string, dto: MoveTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id, userId } });
      if (!task) throw new NotFoundException(`La tarea con ID ${id} no existe.`);

      const from = task.status;
      const to = dto.status;

      const columnOf = (status: TaskStatus) =>
        tx.task.findMany({
          where: { userId, status },
          orderBy: COLUMN_ORDER,
          select: { id: true, position: true },
        });

      // Origen sin la tarjeta que se mueve: es el estado tras "levantarla".
      const origin = (await columnOf(from)).filter((t) => t.id !== id);

      // Dentro de la misma columna, origen y destino son la misma lista: se
      // reordena sobre ella. Si no, se carga la columna de destino aparte.
      const target = from === to ? origin : await columnOf(to);

      // El frontend no tiene por qué saber cuántas tarjetas hay en destino: una
      // posición pasada de rosca se acota al último hueco. `splice` ya lo haría
      // solo; el `min` se queda porque hace explícito el contrato del endpoint.
      const index = Math.min(dto.position, target.length);
      target.splice(index, 0, { id, position: task.position });

      const renumber = async (column: { id: string; position: number }[], status: TaskStatus) => {
        for (const [i, item] of column.entries()) {
          if (item.id === id) {
            // La tarjeta movida necesita escritura sí o sí: puede cambiar de columna.
            await tx.task.update({ where: { id }, data: { status, position: i } });
          } else if (item.position !== i) {
            await tx.task.update({ where: { id: item.id }, data: { position: i } });
          }
        }
        return column.map((t) => t.id);
      };

      const targetIds = await renumber(target, to);
      // Si cambió de columna, la de origen también queda con un hueco que cerrar.
      const originIds = from === to ? targetIds : await renumber(origin, from);

      const moved = await tx.task.findUniqueOrThrow({ where: { id } });

      // Se devuelve el orden final de las columnas tocadas para que el tablero
      // se reconcilie sin pedir la lista entera otra vez.
      const columns =
        from === to
          ? [{ status: to, taskIds: targetIds }]
          : [
              { status: to, taskIds: targetIds },
              { status: from, taskIds: originIds },
            ];

      return { task: moved, columns };
    });
  }

  async update(userId: string, id: string, updateTaskDto: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!task) throw new NotFoundException(`La tarea con ID ${id} no existe.`);

    return this.prisma.task.update({
      where: { id },
      data: updateTaskDto,
    });
  }
}
