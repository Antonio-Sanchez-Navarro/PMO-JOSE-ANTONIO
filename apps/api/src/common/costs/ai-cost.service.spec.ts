import type { ConfigService } from '@nestjs/config';
import type { AlertService } from '../alerts/alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AiCostService } from './ai-cost.service';
import { precioDe, subidaCercana } from './precios-modelo';

/**
 * La estimación de coste — Capa 3.
 *
 * **Lo que se fija aquí es que el aviso sirva para actuar.** «Has consumido el
 * 90 %» se archiva; «quedan ~11 días al ritmo de los últimos 7» se atiende. Y
 * que el precio que se está usando **tenga fecha**, porque el de Sonnet 5 sube
 * un 50 % el 31 de agosto y un precio sin fecha es un número correcto el día
 * que se escribió y silenciosamente falso después.
 */
describe('AiCostService · cuánto queda al ritmo actual', () => {
  const AHORA = new Date('2026-08-25T12:00:00Z');

  function crear(filas: { dia: string; model: string; entrada: number; salida: number }[], presupuesto = '20') {
    const avisar = jest.fn().mockResolvedValue(undefined);
    const upsert = jest.fn().mockResolvedValue({});

    const prisma = {
      aiUsage: {
        upsert,
        findMany: jest.fn().mockImplementation(({ where }: { where: { dia: { gte: Date } } }) =>
          Promise.resolve(
            filas
              .filter((f) => new Date(f.dia) >= where.dia.gte)
              .map((f) => ({
                dia: new Date(f.dia),
                model: f.model,
                inputTokens: f.entrada,
                outputTokens: f.salida,
              })),
          ),
        ),
      },
    };

    const service = new AiCostService(
      prisma as unknown as PrismaService,
      { get: () => presupuesto } as unknown as ConfigService,
      { avisar } as unknown as AlertService,
    );

    return { service, avisar, upsert };
  }

  it('el gasto sale de los tokens y del precio de su modelo', async () => {
    // Sonnet 5 a precio de lanzamiento: $2 la entrada, $10 la salida por millon.
    const { service } = crear([
      { dia: '2026-08-20', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 100_000 },
    ]);

    const e = await service.estimar(AHORA);

    expect(e.gastado).toBeCloseTo(2 + 1, 5);
  });

  it('cada dia se cuenta al precio que regia ESE dia', async () => {
    // Lo gastado antes de la subida siguio costando lo de antes. Sumarlo todo
    // al precio nuevo inflaria el pasado y el aviso llegaria antes de tiempo.
    const antes = crear([
      { dia: '2026-08-30', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 },
    ]);
    const despues = crear([
      { dia: '2026-09-01', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 },
    ]);

    expect((await antes.service.estimar(new Date('2026-08-30T12:00:00Z'))).gastado).toBeCloseTo(2, 5);
    expect((await despues.service.estimar(new Date('2026-09-01T12:00:00Z'))).gastado).toBeCloseTo(3, 5);
  });

  it('un modelo desconocido se estima por ARRIBA, no como gratis', async () => {
    // Contarlo como cero haria que el gasto pareciera menor justo cuando
    // alguien ha cambiado algo. Pasarse es recuperable; quedarse corto es como
    // se llega a cero sin aviso.
    const { service } = crear([
      { dia: '2026-08-20', model: 'modelo-que-nadie-anadio-a-la-tabla', entrada: 1_000_000, salida: 0 },
    ]);

    expect((await service.estimar(AHORA)).gastado).toBeGreaterThan(0);
  });

  it('avisa con los DIAS que quedan, no con el porcentaje', async () => {
    // 16 de 20 dolares: por encima del 75%.
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 8_000_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    const detalle = String(avisar.mock.calls[0][1]);
    expect(detalle).toMatch(/dia\(s\)/);
    expect(detalle).toContain('$16.00 de $20');
  });

  it('el aviso dice cuando se comprobaron los precios', async () => {
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 8_000_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    expect(String(avisar.mock.calls[0][1])).toContain('Precios comprobados el');
  });

  it('sin consumo reciente NO inventa un plazo', async () => {
    const { service } = crear([
      { dia: '2026-08-01', model: 'claude-sonnet-5', entrada: 8_000_000, salida: 0 },
    ]);

    const e = await service.estimar(AHORA);

    // El gasto del mes cuenta; el ritmo de los ultimos 7 dias es cero, asi que
    // los dias restantes son `null` -que es una respuesta- y no un numero
    // enorme disfrazado de tranquilidad.
    expect(e.gastado).toBeGreaterThan(0);
    expect(e.diasRestantes).toBeNull();
  });

  describe('el ritmo se reparte entre los dias observados, no entre 7 fijo', () => {
    // Regresion con fecha: el 2026-08-25, recien creada la tabla, produccion
    // dijo «ritmo $0.00/dia · quedan 20235 dia(s)» con UN dia de datos, porque
    // dividia entre siete. El sesgo empujaba hacia «queda mas de lo que queda»,
    // que es el lado por el que se llega a cero sin aviso.

    it('un solo dia de historia no se divide entre siete', async () => {
      const { service } = crear([
        { dia: '2026-08-25', model: 'claude-sonnet-5', entrada: 2_000_000, salida: 0 },
      ]);

      const e = await service.estimar(AHORA);

      // $4 gastados hoy. Con el suelo de 2 dias -el dia en curso esta a
      // medias-, el ritmo es $2/dia. Con el /7 de antes habrian sido $0,57.
      expect(e.gastado).toBeCloseTo(4, 5);
      expect(e.ritmoDiario).toBeCloseTo(2, 5);
      expect(e.ritmoDiario).not.toBeCloseTo(4 / 7, 5);
    });

    it('con la ventana entera cubierta se sigue dividiendo entre siete', async () => {
      // El arreglo no puede cambiar el caso normal, que es el de todos los dias
      // a partir de la primera semana.
      const dias = ['19', '20', '21', '22', '23', '24', '25'].map((d) => ({
        dia: `2026-08-${d}`,
        model: 'claude-sonnet-5',
        entrada: 1_000_000,
        salida: 0,
      }));

      const e = await crear(dias).service.estimar(AHORA);

      // $2 por dia durante siete dias = $14, repartidos entre 7 = $2/dia.
      expect(e.gastado).toBeCloseTo(14, 5);
      expect(e.ritmoDiario).toBeCloseTo(2, 5);
    });

    it('un hueco sin consumo cuenta como dia, porque es un cero real', async () => {
      // Tres dias cubiertos y solo dos con fila: el 24 no hubo correos. Ese
      // cero es informacion y tiene que pesar en la media; descontarlo inflaria
      // el ritmo y adelantaria el aviso sin motivo.
      const { service } = crear([
        { dia: '2026-08-23', model: 'claude-sonnet-5', entrada: 1_500_000, salida: 0 },
        { dia: '2026-08-25', model: 'claude-sonnet-5', entrada: 1_500_000, salida: 0 },
      ]);

      const e = await service.estimar(AHORA);

      // $6 entre los 3 dias cubiertos (23, 24 y 25), no entre los 2 con datos.
      expect(e.gastado).toBeCloseTo(6, 5);
      expect(e.ritmoDiario).toBeCloseTo(2, 5);
      expect(e.ritmoDiario).not.toBeCloseTo(3, 5);
    });

    it('el plazo que sale del ritmo nuevo es el que se puede atender', async () => {
      const { service } = crear(
        [{ dia: '2026-08-25', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 }],
        '10',
      );

      const e = await service.estimar(AHORA);

      // $2 gastados de $10, ritmo $1/dia -> quedan 8 dias. Con el /7 de antes
      // habrian salido 56, y 56 dias de margen no se atienden.
      expect(e.diasRestantes).toBe(8);
    });
  });

  it('por debajo del umbral no avisa DEL CONSUMO', async () => {
    // Escribir esta prueba destapo un fallo de diseno propio: el aviso de la
    // subida de precio saltaba por su cuenta, y con el cron diario habria
    // mandado el mismo mensaje catorce dias seguidos. Una subida programada es
    // el hecho mas estable que existe. Ahora lleva su propio freno, de una
    // semana, y avisa dos veces en la ventana en vez de catorce.
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    const titulos = avisar.mock.calls.map((c) => String(c[0]));
    expect(titulos.some((t) => t.includes('% del presupuesto'))).toBe(false);
  });

  it('el aviso de la subida lleva freno de dias, no de horas', async () => {
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    const subida = avisar.mock.calls.find((c) => String(c[2]).includes('subida'));
    expect(subida?.[3]).toBeGreaterThanOrEqual(7 * 24 * 3_600);
  });

  it('el freno es mas largo que la cadencia diaria del cron', async () => {
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 8_000_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    // Con un freno igual o menor que la cadencia, cada pasada caeria en el
    // borde y no frenaria nada. Es la leccion del barrido.
    expect(avisar.mock.calls[0][3]).toBeGreaterThan(12 * 3_600);
  });

  it('registrar nunca lanza, aunque la base falle', async () => {
    // El contador no puede tumbar el trabajo que esta midiendo: seria el
    // termometro rompiendo al enfermo.
    const { service, upsert } = crear([]);
    upsert.mockRejectedValue(new Error('la base dijo que no'));

    await expect(service.registrar('claude-sonnet-5', 100, 10)).resolves.toBeUndefined();
  });

  it('no anota llamadas sin consumo', async () => {
    const { service, upsert } = crear([]);

    await service.registrar('claude-sonnet-5', 0, 0);

    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('precios · el dato que caduca', () => {
  it('Sonnet 5 sube un 50% el 31 de agosto', () => {
    // Se usan horas explícitas después del UTC para asegurar que pasan
    // el umbral local.
    const antes = precioDe('claude-sonnet-5', new Date('2026-08-30T12:00:00Z'));
    const despues = precioDe('claude-sonnet-5', new Date('2026-08-31T12:00:00Z'));

    expect(antes.entrada).toBe(2);
    expect(despues.entrada).toBe(3);
    expect(despues.salida / antes.salida).toBeCloseTo(1.5, 5);
  });

  it('la fecha de subida se interpreta en la zona local, no en UTC', () => {
    // 2026-08-31T04:59Z es 23:59 del 30 de agosto en America/Cancun.
    // Si se usara UTC, esto ya aplicaría la subida, encareciendo horas antes.
    const vispera = precioDe('claude-sonnet-5', new Date('2026-08-31T04:59:00Z'));
    const diaD = precioDe('claude-sonnet-5', new Date('2026-08-31T05:00:00Z'));

    expect(vispera.entrada).toBe(2);
    expect(diaD.entrada).toBe(3);
  });

  it('la subida se anuncia antes de que ocurra', () => {
    const avisos = subidaCercana(new Date('2026-08-25T12:00:00Z'), 14);

    expect(avisos).toHaveLength(1);
    expect(avisos[0].model).toBe('claude-sonnet-5');
    expect(avisos[0].subida).toBe(50);
  });

  it('y deja de anunciarse cuando ya pasó', () => {
    expect(subidaCercana(new Date('2026-09-15T12:00:00Z'), 14)).toHaveLength(0);
  });
});
