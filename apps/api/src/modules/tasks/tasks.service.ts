import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTaskDto } from './dto/update-task.dto';

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
        }
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data, total, skip, take };
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
