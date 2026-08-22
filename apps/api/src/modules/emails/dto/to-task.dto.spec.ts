import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TaskPriority } from '@prisma/client';
import { ConfirmedTaskDto } from './to-task.dto';

/**
 * `ConfirmedTaskDto` — el título en blanco que sí creaba tarjeta.
 *
 * **Por qué existe esta prueba.** `@IsNotEmpty()` da por buena cualquier cadena
 * que no sea vacía, **espacios incluidos**. Y `persistConfirmed` hace `.trim()`
 * al guardar, así que lo que llegaba como tres espacios se guardaba como una
 * tarjeta **con el título vacío**. No hacía falta trastear con la API: se llega
 * desde «añadir tarea» del modal.
 *
 * `CreateTaskDto`, en este mismo repositorio, ya lo hacía bien. Dos formas
 * distintas de validar lo mismo es cómo se acaba arreglando una y dejando la
 * otra — así que esto fija que la de aquí no vuelva atrás.
 */
describe('ConfirmedTaskDto · el título no puede ser espacios', () => {
  const valida = (title: unknown) =>
    validateSync(
      plainToInstance(ConfirmedTaskDto, { title, priority: TaskPriority.MEDIUM }),
      { whitelist: true },
    ).map((e) => e.property);

  it('rechaza una cadena de solo espacios', () => {
    // El caso real: `@IsNotEmpty()` la dejaba pasar y el `.trim()` de después
    // la convertía en una tarjeta sin título.
    expect(valida('   ')).toContain('title');
  });

  it('rechaza tabuladores y saltos de línea, que son igual de invisibles', () => {
    expect(valida('\t\n  ')).toContain('title');
  });

  it('rechaza la cadena vacía', () => {
    expect(valida('')).toContain('title');
  });

  it('acepta un título con espacios alrededor, y lo recorta', () => {
    // El `@Transform` va antes que la validación a propósito: al revés, la
    // regla vería los espacios y volvería a dejarlos pasar.
    const dto = plainToInstance(ConfirmedTaskDto, {
      title: '  Llamar al cliente  ',
      priority: TaskPriority.MEDIUM,
    });

    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto.title).toBe('Llamar al cliente');
  });

  it('acepta un título normal', () => {
    expect(valida('Revisar el contrato')).toHaveLength(0);
  });
});
