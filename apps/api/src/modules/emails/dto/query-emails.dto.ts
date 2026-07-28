import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { EmailStatus } from '@prisma/client';

/**
 * Convierte el `?flag=true` de la query en booleano.
 *
 * En una query todo llega como cadena, y `Boolean('false')` es `true`: sin esto,
 * `?converted=false` filtraría justo al revés de lo que pide quien lo escribe.
 * Cualquier otro valor se deja intacto para que `@IsBoolean` lo rechace con 400
 * en vez de interpretarlo a su manera.
 */
const aBooleano = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/**
 * Query de `GET /emails`. Todos los filtros son opcionales: sin ninguno
 * devuelve los correos del usuario, del más reciente al más antiguo.
 */
export class QueryEmailsDto {
  /**
   * `true` deja solo los que el modelo consideró accionables — los que tiene
   * sentido llevar a la cuarentena. `false` deja justo los otros, que sirve
   * para revisar si el modelo se dejó algo.
   */
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  actionable?: boolean;

  /**
   * Filtra por si el correo ya generó tareas. `converted=false` es la bandeja
   * de triage propiamente dicha: lo que queda por despachar.
   */
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  converted?: boolean;

  /**
   * Estado del triage. `?status=PENDING` es la bandeja de verdad: lo que
   * todavía no ha despachado su dueño. Un valor fuera del enum da 400.
   */
  @IsOptional()
  @IsEnum(EmailStatus)
  status?: EmailStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  /** Tope de 200, como en `GET /tasks`: un `?take=100000` no se lleva la tabla. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
