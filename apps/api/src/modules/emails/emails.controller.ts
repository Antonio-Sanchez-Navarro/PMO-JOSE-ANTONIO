import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { EmailsService, ToTaskResult } from './emails.service';
import { ToTaskDto } from './dto/to-task.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('emails')
@UseGuards(AuthGuard)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  /**
   * Convierte un correo en tarea a petición del usuario (Sprint 3).
   *
   * Respuestas: 201 con las tareas creadas · 404 si el correo no es suyo o no
   * existe · 409 si ya tenía tareas (reenviar con `"force": true`).
   */
  @Post(':id/to-task')
  @HttpCode(201)
  toTask(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    @Body() dto: ToTaskDto,
  ): Promise<ToTaskResult> {
    // `AuthGuard` expone el id como `userId` (ver auth.types.ts), no como `id`.
    return this.emailsService.convertToTask(user.userId, id, dto);
  }
}
