import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
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
   * Crea una tarea. Devuelve 201 con la tarea creada, sin envoltorio: es lo que
   * consume directamente la UI optimista del tablero.
   */
  @Post()
  create(@CurrentUser() user: CurrentUserContext, @Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(user.userId, createTaskDto);
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

  /**
   * Borra una tarea. 204 sin cuerpo: el tablero ya la quitó de su estado antes
   * de llamar, así que no tiene nada que leer de la respuesta.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: CurrentUserContext, @Param('id') id: string) {
    return this.tasksService.remove(user.userId, id);
  }
}
