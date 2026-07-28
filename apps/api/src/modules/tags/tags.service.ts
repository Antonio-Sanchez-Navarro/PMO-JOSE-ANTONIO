import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, Tag } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTagDto, DEFAULT_TAG_COLOR } from './dto/create-tag.dto';

/** Código de Prisma para violación de índice único. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Etiquetas del usuario: las que crea a mano, con color, y reutiliza entre
 * tareas.
 *
 * No confundir con `Task.tags`, el arreglo de texto libre que extrae el modelo
 * de cada correo. Se mantienen separadas a propósito: las del modelo nacen y
 * mueren con cada análisis y llenarían de ruido la lista del usuario; estas las
 * escribe una persona y esperan seguir ahí mañana.
 */
@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Alfabéticas, que es como se buscan en un desplegable. */
  list(userId: string): Promise<Tag[]> {
    return this.prisma.tag.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Crea una etiqueta.
   *
   * El duplicado lo detecta la clave única `(userId, name)` y no una consulta
   * previa: entre un `findFirst` y el `create` cabe otra petición del mismo
   * usuario —dos pestañas, un doble clic— y acabaríamos con dos etiquetas
   * idénticas. Así arbitra la base, que es la única que puede.
   */
  async create(userId: string, dto: CreateTagDto): Promise<Tag> {
    try {
      const tag = await this.prisma.tag.create({
        data: {
          userId,
          name: dto.name,
          color: dto.color ?? DEFAULT_TAG_COLOR,
        },
      });

      this.logger.log(`Etiqueta "${tag.name}" creada`);
      return tag;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ConflictException(`Ya tienes una etiqueta llamada "${dto.name}".`);
      }
      throw error;
    }
  }

  /**
   * Comprueba que unos ids de etiqueta existan y sean del usuario, y los
   * devuelve listos para `connect`.
   *
   * Lo usa la creación de tareas. Pasar los ids a `connect` sin mirar daría un
   * error opaco de Prisma ante un id inventado —y, con uno ajeno, colgaría en
   * tu tarea la etiqueta de otra persona— en vez de un 400 que dice cuál falla.
   */
  async resolveIds(userId: string, tagIds: string[] | undefined): Promise<{ id: string }[]> {
    if (!tagIds?.length) return [];

    // Repetir un id en la petición no es un error que merezca un 400: conectar
    // dos veces la misma etiqueta da la misma etiqueta.
    const unicos = [...new Set(tagIds)];

    const encontradas = await this.prisma.tag.findMany({
      where: { id: { in: unicos }, userId },
      select: { id: true },
    });

    if (encontradas.length !== unicos.length) {
      const validos = new Set(encontradas.map((t) => t.id));
      const invalidos = unicos.filter((id) => !validos.has(id));
      throw new BadRequestException(
        `Estas etiquetas no existen o no son tuyas: ${invalidos.join(', ')}`,
      );
    }

    return encontradas;
  }
}
