import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClassificationResult, EmailsService, ToTaskResult, TriageEmail } from './emails.service';
import { ToTaskDto } from './dto/to-task.dto';
import { QueryEmailsDto } from './dto/query-emails.dto';
import { SOCKET_ID_HEADER } from '../tasks/tasks.gateway';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('emails')
@UseGuards(AuthGuard)
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  /**
   * Los correos del usuario, para la bandeja de triage del tablero (Sprint 3).
   *
   * Devuelve el arreglo **sin envoltorio**, como `POST /tasks`. Filtros:
   * `?actionable=true|false` y `?converted=true|false`, más `skip` y `take`
   * (por defecto 50, tope 200). Un valor que no sea `true` ni `false` da 400.
   *
   * Es lo que permite que la cuarentena se abra desde un correo de verdad: sin
   * esta ruta el frontend no tenía de dónde sacar el `Email.id` que exigen
   * `classify` y `to-task`.
   */
  @Get()
  list(
    @CurrentUser() user: CurrentUserContext,
    @Query() query: QueryEmailsDto,
  ): Promise<TriageEmail[]> {
    return this.emailsService.listForTriage(user.userId, query);
  }

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
