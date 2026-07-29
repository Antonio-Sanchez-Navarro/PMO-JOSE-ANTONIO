import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TimeService } from './time.service';
import { StartTimeDto } from './dto/start-time.dto';
import { CreateEntryDto } from './dto/create-entry.dto';
import { UpdateEntryDto } from './dto/update-entry.dto';
import { QueryReportDto, QueryTimeDto } from './dto/query-time.dto';
import { SOCKET_ID_HEADER } from '../tasks/tasks.gateway';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

/**
 * Registro de tiempos (Sprint 5).
 *
 * Las rutas con `:taskId` se declaran después de las de segmento fijo
 * (`active`, `entries`, `report`, `stop`) por convención; no colisionan, porque
 * `:taskId` solo casa con un segmento y las fijas tienen su propia forma.
 */
@Controller('time')
@UseGuards(AuthGuard)
export class TimeController {
  constructor(private readonly timeService: TimeService) {}

  /**
   * El cronómetro en marcha, o `null`.
   *
   * Lo pide la interfaz al montar: recargar la página no debería perder de
   * vista un reloj que sigue corriendo en la base.
   */
  @Get('active')
  findActive(@CurrentUser() user: CurrentUserContext) {
    return this.timeService.findActive(user.userId);
  }

  /** Los fichajes del usuario. Filtros: `?taskId=`, `?from=`, `?to=`, `?skip=`, `?take=`. */
  @Get('entries')
  findAll(@CurrentUser() user: CurrentUserContext, @Query() query: QueryTimeDto) {
    return this.timeService.findAll(user.userId, query);
  }

  /** Suma de tiempo por tarea (por defecto), por día o por semana. */
  @Get('report')
  report(@CurrentUser() user: CurrentUserContext, @Query() query: QueryReportDto) {
    return this.timeService.report(user.userId, query);
  }

  /** Apunta a mano un tramo que ya terminó. 201 con el fichaje. */
  @Post('entries')
  createEntry(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: CreateEntryDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.timeService.createEntry(user.userId, dto, socketId);
  }

  /** Corrige un fichaje: sus extremos o su nota. */
  @Patch('entries/:id')
  update(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateEntryDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.timeService.update(user.userId, id, dto, socketId);
  }

  /** Borra un fichaje. 204 sin cuerpo. */
  @Delete('entries/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.timeService.remove(user.userId, id, socketId);
  }

  /**
   * Detiene el cronómetro que esté corriendo, sea de la tarea que sea.
   *
   * Es la versión que necesita un botón global de "parar", que no sabe sobre
   * qué tarjeta está el reloj.
   */
  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stopActive(
    @CurrentUser() user: CurrentUserContext,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.timeService.stop(user.userId, undefined, socketId);
  }

  /**
   * Arranca el cronómetro sobre una tarea. Si ya corría sobre otra, la detiene
   * en la misma transacción.
   */
  @Post(':taskId/start')
  start(
    @CurrentUser() user: CurrentUserContext,
    @Param('taskId') taskId: string,
    @Body() dto: StartTimeDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.timeService.start(user.userId, taskId, dto, socketId);
  }

  /** Detiene el cronómetro de esa tarea. 409 si no había ninguno. */
  @Post(':taskId/stop')
  @HttpCode(HttpStatus.OK)
  stop(
    @CurrentUser() user: CurrentUserContext,
    @Param('taskId') taskId: string,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ) {
    return this.timeService.stop(user.userId, taskId, socketId);
  }
}
