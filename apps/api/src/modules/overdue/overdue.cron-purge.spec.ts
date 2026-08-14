import { OverdueCronPurge } from './overdue.cron-purge';
import { OVERDUE_SCHEDULER_ID } from './overdue.constants';

/**
 * La purga del cron viejo de BullMQ.
 *
 * **Su trabajo es borrar cosas de Redis, así que es la clase que más merece
 * pruebas y la que se subió sin ninguna.** Existe porque quitar del código el
 * `upsertJobScheduler` no apaga el cron: el planificador vive en Redis y con
 * Upstash —que es persistente— sobrevive al despliegue. Sin esta purga habría
 * dos barridos: el de Cloud Scheduler y el fantasma.
 *
 * Corre en cada arranque, así que la otra mitad de su contrato importa igual:
 * **no puede tumbar el arranque**. Un Redis caído dejaría la API entera fuera
 * por una tarea de limpieza.
 */
describe('OverdueCronPurge', () => {
  function crear(
    opciones: {
      removeJobScheduler?: jest.Mock;
      getJobSchedulers?: jest.Mock;
      getRepeatableJobs?: jest.Mock;
      removeRepeatableByKey?: jest.Mock;
    } = {},
  ) {
    const cola = {
      removeJobScheduler: opciones.removeJobScheduler ?? jest.fn().mockResolvedValue(false),
      getJobSchedulers: opciones.getJobSchedulers ?? jest.fn().mockResolvedValue([]),
      getRepeatableJobs: opciones.getRepeatableJobs ?? jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: opciones.removeRepeatableByKey ?? jest.fn().mockResolvedValue(true),
    };

    return { purga: new OverdueCronPurge(cola as never), cola };
  }

  it('borra el planificador con nuestro id, que es el que creaba el código viejo', async () => {
    const { purga, cola } = crear();

    await purga.onModuleInit();

    expect(cola.removeJobScheduler).toHaveBeenCalledWith(OVERDUE_SCHEDULER_ID);
  });

  it('barre también los planificadores huérfanos de la cola', async () => {
    // Si alguien cambió el id en el pasado, el anterior sigue vivo bajo otro
    // nombre y la primera pasada no lo ve.
    const getJobSchedulers = jest.fn().mockResolvedValue([{ key: 'id-viejo-de-otra-epoca' }]);
    const { purga, cola } = crear({ getJobSchedulers });

    await purga.onModuleInit();

    expect(cola.removeJobScheduler).toHaveBeenCalledWith('id-viejo-de-otra-epoca');
  });

  it('barre los repetibles del formato antiguo, que no aparecen como planificadores', async () => {
    // Este módulo llegó a usar `queue.add({ repeat })`, y aquella migración ya
    // dejó claves huérfanas una vez.
    const getRepeatableJobs = jest.fn().mockResolvedValue([{ key: 'repeat:overdue-sweep-cron:123' }]);
    const { purga, cola } = crear({ getRepeatableJobs });

    await purga.onModuleInit();

    expect(cola.removeRepeatableByKey).toHaveBeenCalledWith('repeat:overdue-sweep-cron:123');
  });

  it('es idempotente: sin nada que purgar no borra nada y no falla', async () => {
    const { purga, cola } = crear();

    await expect(purga.onModuleInit()).resolves.toBeUndefined();

    expect(cola.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  it('un planificador sin clave no revienta el barrido', async () => {
    const getJobSchedulers = jest.fn().mockResolvedValue([{ key: undefined }, { key: 'bueno' }]);
    const { purga, cola } = crear({ getJobSchedulers });

    await purga.onModuleInit();

    expect(cola.removeJobScheduler).toHaveBeenCalledWith('bueno');
  });

  it('NO tumba el arranque si Redis está caído', async () => {
    const removeJobScheduler = jest.fn().mockRejectedValue(new Error('Redis inalcanzable'));
    const { purga } = crear({ removeJobScheduler });

    // Es la garantía que hace segura esta clase: corre en `onModuleInit`, así
    // que lanzar aquí dejaría la API entera sin arrancar —tablero y sesiones
    // incluidos— por una tarea de limpieza.
    await expect(purga.onModuleInit()).resolves.toBeUndefined();
  });
});
