import { Controller, Get, Patch, Param, Body, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserContext,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take: number,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.tasksService.findAll(user.userId, { skip, take, status, priority });
  }

  /**
   * Mueve una tarea a una columna y a un hueco concreto (drag & drop).
   *
   * Se declara antes que `@Patch(':id')` por convención; no colisionan porque
   * `:id` solo casa con un segmento de ruta.
   */
  @Patch(':id/move')
  move(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    @Body() moveTaskDto: MoveTaskDto,
  ) {
    return this.tasksService.move(user.userId, id, moveTaskDto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string, 
    @Body() updateTaskDto: UpdateTaskDto
  ) {
    return this.tasksService.update(user.userId, id, updateTaskDto);
  }
}
