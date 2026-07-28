import { Body, Controller, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ClassificationResult, EmailsService, ToTaskResult } from './emails.service';
import { ToTaskDto } from './dto/to-task.dto';
import { SOCKET_ID_HEADER } from '../tasks/tasks.gateway';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('emails')
@UseGuards(AuthGuard)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  /**
   * Analiza un correo y devuelve lo que propondría, sin crear nada (Sprint 3).
   *
   * Primer paso de la validación humana: alimenta la cuarentena del frontend.
   * Es 200 y no 201 justamente porque no nace ningún recurso.
   *
   * Respuestas: 200 con la propuesta · 404 si el correo no es suyo o no existe
   * · 409 si el correo no tiene texto que analizar.
   */
  @Post(':id/classify')
  @HttpCode(200)
  classify(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
  ): Promise<ClassificationResult> {
    return this.emailsService.classify(user.userId, id);
  }

  /**
   * Convierte un correo en tarea a petición del usuario (Sprint 3).
   *
   * Respuestas: 201 con las tareas creadas · 404 si el correo no es suyo o no
   * existe · 409 si ya tenía tareas (reenviar con `"force": true`).
   *
   * Cada tarjeta creada sale además por socket como `task.created`. Quien manda
   * su `X-Socket-Id` no recibe el eco: ya tiene las tareas en la respuesta y
   * volver a insertarlas se las duplicaría en pantalla.
   */
  @Post(':id/to-task')
  @HttpCode(201)
  toTask(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    @Body() dto: ToTaskDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ): Promise<ToTaskResult> {
    // `AuthGuard` expone el id como `userId` (ver auth.types.ts), no como `id`.
    return this.emailsService.convertToTask(user.userId, id, dto, socketId);
  }
}
