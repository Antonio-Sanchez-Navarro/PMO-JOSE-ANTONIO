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
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { SOCKET_ID_HEADER } from './tasks.gateway';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * Lista las tareas del usuario con filtros opcionales.
   *
   * `?status=`, `?priority=`, `?search=` (título y descripción, sin distinguir
   * mayúsculas) y paginación `?skip=`/`?take=`. La validación y los valores por
   * defecto viven en `QueryTasksDto`, no en pipes sueltos por parámetro: así
   * `?status=BASURA` se rechaza con 400 en vez de llegar a Prisma.
   */
  @Get()
  findAll(@CurrentUser() user: CurrentUserContext, @Query() query: QueryTasksDto) {
    return this.tasksService.findAll(user.userId, query);
  }

  /**
   * Crea una tarea. Devuelve 201 con la tarea creada, sin envoltorio: es lo que
   * consume directamente la UI optimista del tablero.
   */
  @Post()
  create(
    @CurrentUser() user: CurrentUserContext, 
    @Body() createTaskDto: CreateTaskDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string
  ) {
    return this.tasksService.create(user.userId, createTaskDto, socketId);
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
    @Headers(SOCKET_ID_HEADER) socketId?: string
  ) {
    return this.tasksService.move(user.userId, id, moveTaskDto, socketId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string, 
    @Body() updateTaskDto: UpdateTaskDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string
  ) {
    return this.tasksService.update(user.userId, id, updateTaskDto, socketId);
  }

  /**
   * Borra una tarea. 204 sin cuerpo: el tablero ya la quitó de su estado antes
   * de llamar, así que no tiene nada que leer de la respuesta.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: CurrentUserContext, 
    @Param('id') id: string,
    @Headers(SOCKET_ID_HEADER) socketId?: string
  ) {
    return this.tasksService.remove(user.userId, id, socketId);
  }
}
