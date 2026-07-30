import { BadRequestException } from '@nestjs/common';
import { EmailStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { MetricsService, VENTANA_DIAS, ZONA_POR_DEFECTO } from './metrics.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const USER_ID = 'user-1';

/** Los siete días que devuelve la ventana por defecto en las pruebas. */
const DIAS = [
  '2026-07-23',
  '2026-07-24',
  '2026-07-25',
  '2026-07-26',
  '2026-07-27',
  '2026-07-28',
  '2026-07-29',
];

const DESDE = new Date('2026-07-23T06:00:00.000Z');

describe('MetricsService', () => {
  let service: MetricsService;
  let prisma: any;
  /** Las consultas crudas, en el orden en que el servicio las lanza. */
  let crudas: { sql: string; valores: unknown[] }[];

  /**
   * Prepara `$queryRaw` para que conteste según lo que le pregunten.
   *
   * Las tres consultas crudas se distinguen por la tabla que nombran, no por el
   * orden de llamada: dos de ellas van dentro del mismo `Promise.all` y el orden
   * ahí no está garantizado.
   */
  const responder = (opciones: {
    cierres?: { dia: string; total: number }[];
    fichajes?: { dia: string; segundos: number }[];
    ventana?: { desde: Date; dias: string[] }[];
  }) => {
    prisma.$queryRaw = jest.fn().mockImplementation((consulta: any) => {
      const sql: string = consulta.sql ?? consulta.strings?.join('') ?? '';
      crudas.push({ sql, valores: consulta.values ?? [] });

      if (sql.includes('generate_series')) {
        return Promise.resolve(opciones.ventana ?? [{ desde: DESDE, dias: DIAS }]);
      }
      if (sql.includes('"Task"')) return Promise.resolve(opciones.cierres ?? []);
      if (sql.includes('"TimeEntry"')) return Promise.resolve(opciones.fichajes ?? []);

      return Promise.resolve([]);
    });
  };

  beforeEach(() => {
    crudas = [];
    prisma = {
      task: { groupBy: jest.fn().mockResolvedValue([]) },
      email: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    responder({});
    service = new MetricsService(prisma as unknown as PrismaService);
  });

  describe('dashboard', () => {
    it('trae las cinco columnas aunque el tablero esté vacío', async () => {
      const m = await service.dashboard(USER_ID);

      // Sin esto la leyenda de la gráfica cambiaría de tamaño según el día.
      expect(Object.keys(m.tasks.byStatus).sort()).toEqual(Object.values(TaskStatus).sort());
      expect(m.tasks.byStatus[TaskStatus.POSTPONED]).toBe(0);
      expect(m.tasks.total).toBe(0);
    });

    it('trae las cuatro prioridades y los cuatro estados de la bandeja', async () => {
      const m = await service.dashboard(USER_ID);

      expect(Object.keys(m.overdue.byPriority).sort()).toEqual(Object.values(TaskPriority).sort());
      expect(Object.keys(m.inbox.byStatus).sort()).toEqual(Object.values(EmailStatus).sort());
    });

    it('cuenta el WIP como solo IN_PROGRESS, sin sumarle las atrasadas', async () => {
      prisma.task.groupBy.mockImplementation(({ by }: any) =>
        Promise.resolve(
          by[0] === 'status'
            ? [
                { status: TaskStatus.IN_PROGRESS, _count: 3 },
                { status: TaskStatus.OVERDUE, _count: 5 },
                { status: TaskStatus.TODO, _count: 2 },
              ]
            : [{ priority: TaskPriority.URGENT, _count: 5 }],
        ),
      );

      const m = await service.dashboard(USER_ID);

      // 3, no 8: WIP es "en qué trabajo", no "cuánto debo".
      expect(m.wip).toBe(3);
      expect(m.overdue.count).toBe(5);
      expect(m.overdue.byPriority[TaskPriority.URGENT]).toBe(5);
      expect(m.tasks.total).toBe(10);
    });

    it('rellena con cero los días sin cierres y respeta el orden', async () => {
      responder({ cierres: [{ dia: '2026-07-27', total: 4 }] });

      const m = await service.dashboard(USER_ID);

      expect(m.throughput.perDay).toHaveLength(VENTANA_DIAS);
      expect(m.throughput.perDay.map((d) => d.date)).toEqual(DIAS);
      // Un hueco en el array haría que la gráfica uniera dos días con una recta.
      expect(m.throughput.perDay.map((d) => d.count)).toEqual([0, 0, 0, 0, 4, 0, 0]);
      expect(m.throughput.completedInWindow).toBe(4);
    });

    it('promedia sobre los días de la ventana, no sobre los que tienen datos', async () => {
      responder({
        cierres: [
          { dia: '2026-07-27', total: 4 },
          { dia: '2026-07-28', total: 3 },
        ],
      });

      const m = await service.dashboard(USER_ID);

      // 7 cierres en 7 días = 1, no 3.5 (que sería dividir entre los dos días
      // que tuvieron actividad).
      expect(m.throughput.avgPerDay).toBe(1);
    });

    it('suma los segundos fichados y rellena los días vacíos', async () => {
      responder({ fichajes: [{ dia: '2026-07-24', segundos: 7200 }] });

      const m = await service.dashboard(USER_ID);

      expect(m.time.totalSecInWindow).toBe(7200);
      expect(m.time.perDay.map((d) => d.seconds)).toEqual([0, 7200, 0, 0, 0, 0, 0]);
    });

    it('devuelve la ventana con la zona por defecto y su número de días', async () => {
      const m = await service.dashboard(USER_ID);

      expect(m.window.tz).toBe(ZONA_POR_DEFECTO);
      expect(m.window.days).toBe(VENTANA_DIAS);
      expect(m.window.from).toBe(DESDE.toISOString());
    });

    it('corta los días en la zona pedida y no en UTC', async () => {
      await service.dashboard(USER_ID, { tz: 'Europe/Madrid' });

      // La zona viaja como parámetro a las tres consultas crudas: si alguna se
      // quedara en UTC, un cierre de las 19:00 caería en el día siguiente solo
      // en esa serie y las dos gráficas no cuadrarían entre ellas.
      expect(crudas).toHaveLength(3);
      for (const consulta of crudas) {
        expect(consulta.valores).toContain('Europe/Madrid');
      }
    });

    it('convierte las fechas desde UTC antes de llevarlas a la zona pedida', async () => {
      await service.dashboard(USER_ID);

      // Regresión de un fallo real (2026-07-29): con un solo `AT TIME ZONE`,
      // Postgres *interpreta* la columna como si ya estuviera en esa zona en vez
      // de convertirla, porque Prisma la declara sin huso. Un cierre de las
      // 22:58 se contaba en el día siguiente. Si alguien quita el `'UTC'`, esto
      // avisa; las cuentas seguirían saliendo, solo en el día equivocado.
      const series = crudas.filter((c) => c.sql.includes('date_trunc'));
      const porColumna = series.filter((c) => !c.sql.includes('generate_series'));
      expect(porColumna).toHaveLength(2);
      for (const consulta of porColumna) {
        expect(consulta.sql).toMatch(/AT TIME ZONE 'UTC' AT TIME ZONE/);
      }
    });

    it('rechaza una ventana al revés en vez de devolver una serie vacía', async () => {
      await expect(
        service.dashboard(USER_ID, { from: '2026-07-29T00:00:00Z', to: '2026-07-20T00:00:00Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza la ventana si la serie de días sale vacía', async () => {
      responder({ ventana: [] });

      await expect(service.dashboard(USER_ID)).rejects.toThrow(BadRequestException);
    });
  });

  describe('summary (la proyección del copiloto)', () => {
    it('no lleva las series por día', async () => {
      responder({ fichajes: [{ dia: '2026-07-24', segundos: 7200 }] });

      const resumen = await service.summary(USER_ID);

      // Mandarle catorce puntos al modelo es quemar tokens para que conteste
      // "vas bien" con una frase.
      expect(JSON.stringify(resumen)).not.toContain('2026-07-24');
      expect(resumen).not.toHaveProperty('perDay');
    });

    it('pasa el tiempo a horas con un decimal', async () => {
      responder({ fichajes: [{ dia: '2026-07-24', segundos: 8100 }] });

      const resumen = await service.summary(USER_ID);

      expect(resumen.horasRegistradasUltimos7Dias).toBe(2.3);
    });

    it('cuenta los cierres de la semana, que antes no salían', async () => {
      responder({ cierres: [{ dia: '2026-07-27', total: 4 }] });

      const resumen = await service.summary(USER_ID);

      expect(resumen.tareasCerradasUltimos7Dias).toBe(4);
    });

    it('da los mismos números que la ruta REST', async () => {
      prisma.task.groupBy.mockImplementation(({ by }: any) =>
        Promise.resolve(
          by[0] === 'status' ? [{ status: TaskStatus.IN_PROGRESS, _count: 3 }] : [],
        ),
      );
      prisma.email.groupBy.mockResolvedValue([{ status: EmailStatus.PENDING, _count: 6 }]);

      const [rest, resumen] = [await service.dashboard(USER_ID), await service.summary(USER_ID)];

      // Un solo motor de cálculo: si divergen, el copiloto diría una cifra y la
      // gráfica de al lado, otra.
      expect(resumen.tareas).toEqual(rest.tasks.byStatus);
      expect(resumen.tareasTotales).toBe(rest.tasks.total);
      expect(resumen.correosPendientes).toBe(rest.inbox.pending);
    });
  });
});
