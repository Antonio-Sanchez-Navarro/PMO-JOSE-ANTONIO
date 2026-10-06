import { RETARDO_HILO_MS, idsDelHilo, programarAnalisisDelHilo, type ColaDeHilos } from './programar-hilo';

/**
 * Una cola de mentira que se porta como BullMQ en lo que importa aquí: un `add`
 * con un `jobId` que ya existe **se ignora**, esté en el estado que esté.
 */
function colaFalsa() {
  const trabajos = new Map<string, { estado: string; emailId: string }>();
  const cola: ColaDeHilos & { trabajos: typeof trabajos; altas: string[] } = {
    trabajos,
    altas: [],
    async getJob(id) {
      const t = trabajos.get(id);
      if (!t) return undefined;
      return {
        getState: async () => t.estado,
        remove: async () => {
          if (t.estado === 'active') throw new Error('no se puede borrar un trabajo activo');
          trabajos.delete(id);
        },
      };
    },
    async add(_nombre, data, opts) {
      if (trabajos.has(opts.jobId)) return;
      trabajos.set(opts.jobId, { estado: 'delayed', emailId: data.emailId });
      cola.altas.push(opts.jobId);
    },
  };
  return cola;
}

const correo = (emailId: string, threadId = 'hilo-1') => ({ emailId, userId: 'user-1', threadId });

describe('programarAnalisisDelHilo (encargo J)', () => {
  it('tres correos del mismo hilo en 10 s → UN trabajo, con 60 s de espera', async () => {
    const cola = colaFalsa();
    const add = jest.spyOn(cola, 'add');

    expect(await programarAnalisisDelHilo(cola, correo('e1'))).toBe('programado');
    expect(await programarAnalisisDelHilo(cola, correo('e2'))).toBe('ya-esperando');
    expect(await programarAnalisisDelHilo(cola, correo('e3'))).toBe('ya-esperando');

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'classify',
      { emailId: 'e1' },
      { jobId: 'hilo-user-1-hilo-1', delay: RETARDO_HILO_MS },
    );
    expect(RETARDO_HILO_MS).toBe(60_000);
  });

  it('un correo que entra mientras el trabajo se ejecuta → un segundo trabajo', async () => {
    const cola = colaFalsa();
    await programarAnalisisDelHilo(cola, correo('e1'));
    cola.trabajos.get('hilo-user-1-hilo-1')!.estado = 'active';

    expect(await programarAnalisisDelHilo(cola, correo('e2'))).toBe('programado');

    // El que corre leyó el hilo al empezar y puede no ver e2; el segundo sí.
    expect(cola.altas).toEqual(['hilo-user-1-hilo-1', 'hilo-user-1-hilo-1-tras']);
    // Y un tercero durante esa misma ejecución no crea un tercer trabajo.
    expect(await programarAnalisisDelHilo(cola, correo('e3'))).toBe('ya-esperando');
  });

  it('dos hilos distintos → dos trabajos', async () => {
    const cola = colaFalsa();

    await programarAnalisisDelHilo(cola, correo('e1', 'hilo-1'));
    await programarAnalisisDelHilo(cola, correo('e2', 'hilo-2'));

    expect(cola.altas).toEqual(['hilo-user-1-hilo-1', 'hilo-user-1-hilo-2']);
  });

  it('si el anterior ya terminó, se borra y se programa otro (si no, BullMQ ignoraría el alta)', async () => {
    const cola = colaFalsa();
    await programarAnalisisDelHilo(cola, correo('e1'));
    cola.trabajos.get('hilo-user-1-hilo-1')!.estado = 'completed';

    expect(await programarAnalisisDelHilo(cola, correo('e2'))).toBe('programado');

    expect(cola.trabajos.get('hilo-user-1-hilo-1')).toEqual({ estado: 'delayed', emailId: 'e2' });
  });

  it('igual con uno fallido: el correo nuevo no se queda sin analizar', async () => {
    const cola = colaFalsa();
    await programarAnalisisDelHilo(cola, correo('e1'));
    cola.trabajos.get('hilo-user-1-hilo-1')!.estado = 'failed';

    expect(await programarAnalisisDelHilo(cola, correo('e2'))).toBe('programado');
  });

  it('los ids no llevan «:», que BullMQ no admite en un jobId', () => {
    expect(idsDelHilo('u', 't').join('')).not.toContain(':');
  });
});
