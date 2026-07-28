import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Tag } from '@prisma/client';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller('tags')
@UseGuards(AuthGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  /** Las etiquetas del usuario, alfabéticas. Arreglo sin envoltorio. */
  @Get()
  list(@CurrentUser() user: CurrentUserContext): Promise<Tag[]> {
    // `AuthGuard` deja el usuario como `{ userId, email }` (ver auth.types.ts);
    // el decorador devuelve ese objeto entero y no acepta una clave.
    return this.tagsService.list(user.userId);
  }

  /**
   * Crea una etiqueta.
   *
   * Respuestas: 201 con la etiqueta · 400 si falta el nombre o el color no es
   * `#RRGGBB` · 409 si ya tiene una con ese nombre.
   */
  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: CurrentUserContext, @Body() dto: CreateTagDto): Promise<Tag> {
    return this.tagsService.create(user.userId, dto);
  }
}
