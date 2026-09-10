import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  BulkDismissResult,
  ClassificationResult,
  EmailDetail,
  EmailsService,
  ThreadPage,
  ToTaskResult,
  TriageEmail,
} from './emails.service';
import { ToTaskDto } from './dto/to-task.dto';
import { QueryEmailsDto } from './dto/query-emails.dto';
import { QueryThreadsDto } from './dto/query-threads.dto';
import { BulkDismissDto } from './dto/bulk-dismiss.dto';
import { UpdateEmailStatusDto } from './dto/update-email-status.dto';
import { SOCKET_ID_HEADER } from '../tasks/tasks.gateway';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('emails')
@UseGuards(AuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
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
   * La bandeja agrupada por hilo de decisión (Fase 7).
   *
   * ⚠️ **Va declarada antes que `@Get(':id')` y tiene que seguir ahí.** Nest
   * resuelve las rutas en el orden en que se declaran, así que con `:id`
   * delante, `/emails/threads` entraría por el detalle con `id: "threads"` y
   * contestaría un 404 perfectamente razonable sobre un correo que nadie pidió.
   * Es un fallo que no da error al compilar y que solo se ve llamando.
   *
   * Devuelve **envoltorio**, al revés que `GET /emails`, y es deliberado: la
   * lista de hilos sin `total` obliga al cliente a mentir en el contador o a
   * bajarse la bandeja entera para contarla. Como la ruta es nueva, nadie tenía
   * que aprenderse la forma anterior.
   *
   * Acepta los mismos filtros que `GET /emails` —`?status=`, `?actionable=`,
   * `?converted=`, `?skip=`, `?take=`— con una diferencia que hay que tener
   * presente: aquí `skip` y `take` cuentan **hilos**, no correos.
   *
   * Respuestas: 200 con `{ items, total, totalEmails }` · 400 si un filtro trae
   * un valor fuera de vocabulario · 401 sin cookie.
   */
  @Get('threads')
  listThreads(
    @CurrentUser() user: CurrentUserContext,
    @Query() query: QueryThreadsDto,
  ): Promise<ThreadPage> {
    return this.emailsService.listThreads(user.userId, query);
  }

  /**
   * Descarta un lote de correos de una vez (Fase 7).
   *
   * El quick-win de la fase: los 318 no accionables se van en dos llamadas en
   * vez de en 318 clics.
   *
   * **Contesta 200 aunque parte del lote no se mueva.** Un id que ya no encaja
   * —descartado desde otra pestaña, o desaparecido entre que se pintó la lista
   * y se pulsó el botón— no puede tumbar las otras 317: sale nombrado en
   * `skipped` con su motivo (`NOT_FOUND`, `ALREADY_DISMISSED`, `NOT_PENDING`) y
   * el cliente decide qué enseñar. Se cumple siempre
   * `updated + skipped.length === requested`.
   *
   * Sin `force`, el lote solo mueve correos en `PENDING`: los que alguien ya
   * despachó vuelven como `NOT_PENDING` en vez de perder su estado.
   *
   * Respuestas: 200 con el desglose · 400 si `emailIds` viene vacío o pasa de
   * 200 entradas · 401 sin cookie.
   *
   * El cambio sale por socket como **un solo** `email.bulk_updated`, no como N
   * `email.updated`. Quien manda su `X-Socket-Id` no recibe el eco: ya tiene el
   * desglose en la respuesta.
   */
  @Post('bulk-dismiss')
  @HttpCode(200)
  bulkDismiss(
    @CurrentUser() user: CurrentUserContext,
    @Body() dto: BulkDismissDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ): Promise<BulkDismissResult> {
    return this.emailsService.bulkDismiss(user.userId, dto.emailIds, socketId, dto.force);
  }

  /**
   * Un correo con su texto completo, para la vista de lectura (Sprint 3).
   *
   * El listado no trae `bodyText` porque son ~8 KB por correo; aquí sí, que es
   * lo que se va a leer antes de aprobar las tareas propuestas. Devuelve además
   * las tareas que ese correo ya generó, para poder comparar al reprocesar.
   *
   * Respuestas: 200 con el detalle · 404 si el correo no es suyo o no existe.
   */
  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
  ): Promise<EmailDetail> {
    return this.emailsService.findOne(user.userId, id);
  }

  /**
   * Analiza un correo y devuelve lo que propondría, sin crear nada (Sprint 3).
   *
   * Primer paso de la validación humana: alimenta la cuarentena del frontend.
   * Es 200 y no 201 justamente porque no nace ningún recurso.
   *
   * Con un borrador ya guardado se devuelve **ese**, sin volver a preguntarle
   * al modelo: cuesta dinero y podría contestar algo distinto de lo que la
   * persona tiene en pantalla. `?force=true` pide explícitamente otra opinión y
   * reemplaza el borrador — es la única forma de reanalizar un correo.
   *
   * Respuestas: 200 con la propuesta · 404 si el correo no es suyo o no existe
   * · 409 si el correo no tiene texto que analizar.
   */
  @Post(':id/classify')
  @HttpCode(200)
  classify(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    // `'true'` y no `Boolean(...)`: en una query todo llega como cadena, y
    // `Boolean('false')` es `true`. Ese descuido convertiría el respaldo en
    // «reanaliza siempre», que es justo lo que cuesta dinero.
    @Query('force') force?: string,
  ): Promise<ClassificationResult> {
    return this.emailsService.classify(user.userId, id, force === 'true');
  }

  /**
   * Mueve el correo por el triage: pendiente, en proceso, hecho o descartado.
   *
   * Es el motor del "Inbox Zero" (Sprint 4). El estado lo decide la persona,
   * así que el cuerpo es obligatorio: `{ "status": "COMPLETED" }`.
   *
   * La bandeja avanza pero no retrocede sola: devolver a `PENDING` un correo ya
   * despachado responde **409**, y se insiste con
   * `{ "status": "PENDING", "force": true }` — la excepción del dueño, que
   * queda anotada en el log.
   *
   * Respuestas: 200 con el correo ya actualizado, en la misma forma que
   * devuelve `GET /emails` · 400 si el estado no está en el vocabulario · 404
   * si el correo no es suyo o no existe · 409 al reabrir sin `force`.
   *
   * El cambio sale además por socket como `email.updated`. Quien manda su
   * `X-Socket-Id` no recibe el eco: ya tiene el correo en la respuesta.
   */
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: CurrentUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateEmailStatusDto,
    @Headers(SOCKET_ID_HEADER) socketId?: string,
  ): Promise<TriageEmail> {
    return this.emailsService.updateStatus(user.userId, id, dto.status, socketId, dto.force);
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
