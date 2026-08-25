import type { ConfigService } from '@nestjs/config';
import type { AlertService } from '../alerts/alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AiCostService } from './ai-cost.service';
import { precioDe, precioDelDia, subidaCercana } from './precios-modelo';

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
  // Las 07:00 de America/Cancun (UTC-5). La hora local importa desde que el
  // divisor del ritmo cuenta el dia en curso por lo que lleva transcurrido:
  // 7/24 de dia, no un dia entero.
  const AHORA = new Date('2026-08-25T12:00:00Z');
  const FRACCION_DEL_DIA = 7 / 24;

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

  it('el DIA de la subida ya se cobra caro, no el siguiente', async () => {
    // Regresion del 2026-08-25: `aiUsage.dia` guarda el dia local como
    // medianoche UTC, asi que la fila del 31 lleva dentro 2026-08-31T00:00:00Z
    // -las 19:00 del dia 30 en Tulum-. Pasandola por `precioDe`, que compara
    // instantes, el dia entero de la subida se cobraba al precio viejo: hasta
    // un 50% de menos justo el dia en que el gasto se encarece, y hacia «queda
    // mas de lo que queda». Se caza antes de que muerda: la subida es el 31.
    const { service } = crear([
      { dia: '2026-08-31', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 },
    ]);

    const e = await service.estimar(new Date('2026-08-31T12:00:00Z'));

    // $3 por el millon de entrada, que es el precio nuevo. Con el fallo eran $2.
    expect(e.gastado).toBeCloseTo(3, 5);
    expect(e.gastado).not.toBeCloseTo(2, 5);
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

      // $4 gastados hoy y solo 7/24 de dia transcurridos: por debajo del suelo
      // de un dia, asi que se reparte entre 1. Con el /7 de antes habrian sido
      // $0,57; con el suelo de 2 que hubo en medio, $2.
      expect(e.gastado).toBeCloseTo(4, 5);
      expect(e.ritmoDiario).toBeCloseTo(4, 5);
      expect(e.ritmoDiario).not.toBeCloseTo(4 / 7, 5);
    });

    it('el dia en curso pesa por las horas que lleva, no como un dia entero', async () => {
      // Regresion del 2026-08-25, al pasar el cron de diario a horario: el
      // divisor contaba hoy como un dia completo, asi que a las 00:30 un dia
      // aun vacio pesaba tanto como cualquier dia vivido y el ritmo salia por
      // debajo del real -«queda mas de lo que queda»-, que es por donde se
      // llega a cero sin aviso. Con la cita de las 08:00 el sesgo valia un
      // tercio de dia; con una cita horaria aparece entero cada madrugada.
      const dias = ['23', '24', '25'].map((d) => ({
        dia: `2026-08-${d}`,
        model: 'claude-sonnet-5',
        entrada: 1_000_000,
        salida: 0,
      }));

      // Las 00:30 y las 18:30 del mismo dia local, en America/Cancun.
      const alba = await crear(dias).service.estimar(new Date('2026-08-25T05:30:00Z'));
      const tarde = await crear(dias).service.estimar(new Date('2026-08-25T23:30:00Z'));

      // Los mismos $6 repartidos entre 2,02 dias y entre 2,77.
      expect(alba.ritmoDiario).toBeCloseTo(6 / (2 + 0.5 / 24), 5);
      expect(tarde.ritmoDiario).toBeCloseTo(6 / (2 + 18.5 / 24), 5);
      // Contando hoy como entero, las dos habrian dado $2 clavados: el ritmo no
      // se habria movido en dieciocho horas, y de madrugada habria salido un
      // 33% por debajo del real.
      expect(alba.ritmoDiario).toBeGreaterThan(tarde.ritmoDiario);
      expect(tarde.ritmoDiario).toBeGreaterThan(2);
    });

    it('con la ventana entera cubierta se reparte entre lo vivido, no entre 7', async () => {
      // El caso normal, el de todos los dias a partir de la primera semana.
      const dias = ['19', '20', '21', '22', '23', '24', '25'].map((d) => ({
        dia: `2026-08-${d}`,
        model: 'claude-sonnet-5',
        entrada: 1_000_000,
        salida: 0,
      }));

      const e = await crear(dias).service.estimar(AHORA);

      // $2 por dia durante siete dias = $14. Del 19 a ahora han pasado 6 dias
      // completos y 7/24 del septimo, asi que el divisor es 6,29 y no 7.
      expect(e.gastado).toBeCloseTo(14, 5);
      expect(e.ritmoDiario).toBeCloseTo(14 / (6 + FRACCION_DEL_DIA), 5);
      // Nunca por debajo del reparto entre la ventana entera: el tope de
      // arriba sigue siendo DIAS_DE_RITMO.
      expect(e.ritmoDiario).toBeGreaterThan(14 / 7);
    });

    it('la ventana se corta por dias locales, no restando 168 horas', async () => {
      // Con la cita diaria fija daba igual; con una horaria, restar horas al
      // instante actual metia y sacaba el dia mas viejo veinticuatro veces al
      // dia y el ritmo saltaba sin que el gasto se moviera. El dia 19 -el
      // septimo hacia atras- tiene que seguir dentro tanto a las 07:00 como a
      // las 22:00, porque es el mismo dia local en los dos casos.
      const dias = ['19', '25'].map((d) => ({
        dia: `2026-08-${d}`,
        model: 'claude-sonnet-5',
        entrada: 1_000_000,
        salida: 0,
      }));

      const manana = await crear(dias).service.estimar(new Date('2026-08-25T12:00:00Z'));
      const noche = await crear(dias).service.estimar(new Date('2026-08-26T03:00:00Z'));

      // 2026-08-26T03:00Z son las 22:00 del dia 25 en Cancun: sigue siendo el
      // mismo dia local, asi que la ventana es la misma y el gasto tambien.
      expect(manana.gastado).toBeCloseTo(4, 5);
      expect(noche.gastado).toBeCloseTo(4, 5);
      // El ritmo solo baja porque ha transcurrido mas dia, no porque se haya
      // caido una fila de la ventana.
      expect(noche.ritmoDiario).toBeLessThan(manana.ritmoDiario);
      expect(noche.ritmoDiario).toBeCloseTo(4 / (6 + 22 / 24), 5);
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

      // $6 entre lo cubierto -el 23, el 24 y las 7 horas que lleva el 25-, no
      // entre los 2 dias que tienen fila, que darian $3/dia.
      expect(e.gastado).toBeCloseTo(6, 5);
      expect(e.ritmoDiario).toBeCloseTo(6 / (2 + FRACCION_DEL_DIA), 5);
      expect(e.ritmoDiario).not.toBeCloseTo(3, 5);
    });

    it('el plazo que sale del ritmo nuevo es el que se puede atender', async () => {
      const { service } = crear(
        [{ dia: '2026-08-25', model: 'claude-sonnet-5', entrada: 1_000_000, salida: 0 }],
        '10',
      );

      const e = await service.estimar(AHORA);

      // $2 gastados de $10 y $2/dia de ritmo -> quedan 4 dias. Con el /7 de
      // antes habrian salido 28, y 28 dias de margen no se atienden.
      expect(e.diasRestantes).toBe(4);
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

  it('el freno aguanta la cadencia HORARIA del cron', async () => {
    // El cron paso de diario a cada hora el 2026-08-25 para cerrar las 24 h
    // ciegas. Con un freno igual o menor que la cadencia, cada pasada caeria en
    // el borde de la anterior y no frenaria nada -la leccion del barrido-, asi
    // que aqui se fija que siga muy por encima de una hora: 24 pasadas al dia
    // tienen que seguir siendo un mensaje al dia por umbral.
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 8_000_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    const ventana = Number(avisar.mock.calls[0][3]);
    expect(ventana).toBeGreaterThanOrEqual(23 * 3_600);
    expect(ventana).toBeGreaterThan(20 * 3_600);
  });

  it('la clave del freno separa los umbrales, para que el 90% no lo calle el 75%', async () => {
    // Si compartieran clave, cruzar el 90% dentro de las 23 h del aviso del 75%
    // no diria nada. Con la cadencia horaria eso serian 23 pasadas callando el
    // aviso que mas importa.
    const { service, avisar } = crear([
      { dia: '2026-08-24', model: 'claude-sonnet-5', entrada: 9_500_000, salida: 0 },
    ]);

    await service.comprobar(AHORA);

    const clave = String(avisar.mock.calls.find((c) => String(c[0]).includes('presupuesto'))?.[2]);
    expect(clave).toBe('coste-ia-0.9');
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

  describe('precioDelDia · una fecha del calendario NO es un instante', () => {
    // Las dos funciones reciben un `Date` y hacen cosas distintas a proposito.
    // `precioDe` compara instantes; `precioDelDia` compara dias del calendario,
    // que es lo que guarda `aiUsage.dia`. Confundirlas costaba un dia entero de
    // estimacion al 50% de menos.

    it('la fila del dia de la subida ya lleva el precio nuevo', () => {
      expect(precioDelDia('claude-sonnet-5', new Date('2026-08-31T00:00:00Z')).entrada).toBe(3);
    });

    it('y la vispera sigue con el viejo', () => {
      expect(precioDelDia('claude-sonnet-5', new Date('2026-08-30T00:00:00Z')).entrada).toBe(2);
    });

    it('las dos funciones NO coinciden sobre la misma fila, y por eso hay dos', () => {
      // La misma marca de dia por los dos caminos. Si esto empezara a coincidir
      // seria que alguien reunifico las escalas y el fallo puede volver.
      const marca = new Date('2026-08-31T00:00:00Z');

      expect(precioDelDia('claude-sonnet-5', marca).entrada).toBe(3);
      expect(precioDe('claude-sonnet-5', marca).entrada).toBe(2);
    });

    it('un modelo sin subida programada da igual por que camino se pregunte', () => {
      const marca = new Date('2026-08-31T00:00:00Z');

      expect(precioDelDia('claude-opus-5', marca)).toEqual(precioDe('claude-opus-5', marca));
      expect(precioDelDia('modelo-que-nadie-anadio', marca).entrada).toBe(10);
    });
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
