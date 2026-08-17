import { GmailController } from './gmail.controller';
import type { GmailService } from './gmail.service';

/**
 * El webhook de Gmail y su deduplicación.
 *
 * **Por qué existen estas pruebas.** La primera versión de la deduplicación
 * reservaba la clave de Redis **antes** de encolar y no la liberaba si el
 * encolado fallaba. En producción había 27 fallos de encolado en dos días que
 * se recuperaban solos porque Google entrega cada aviso dos veces y el segundo
 * llegaba ~4 ms después. Reservar por adelantado convertía esa red de
 * seguridad en diez minutos de silencio: el primer aviso fallaba al encolar y
 * el segundo —el que salvaba el correo— se descartaba por duplicado.
 *
 * La regla que se prueba aquí: **deduplicar lo hecho es correcto; deduplicar
 * lo intentado pierde correos.**
 *
 * La reserva sigue ocurriendo antes del encolado y eso es deliberado: `SET NX`
 * es lo único atómico, y escribir la clave *después* dejaría pasar a las dos
 * entregas concurrentes: las dos verían la clave vacía y las dos encolarían,
 * que es justo el duplicado que se venía a evitar. Lo que arregla el fallo no
 * es mover la escritura, es **liberarla cuando el encolado no llega a
 * suceder**.
 */
describe('GmailController · webhook de Gmail', () => {
  const CORREO = 'antonio.sanchez@zepto.com.mx';
  const HISTORY_ID = '6578238';
  const CLAVE = `gmail:webhook:${CORREO}:${HISTORY_ID}`;

  /** Un push de Pub/Sub con la forma real: el payload va en base64. */
  function avisoDeGmail(messageId = 'msg-1') {
    const payload = JSON.stringify({ emailAddress: CORREO, historyId: HISTORY_ID });
    return {
      message: { data: Buffer.from(payload).toString('base64'), messageId },
    };
  }

  function crear(
    opciones: { set?: jest.Mock; del?: jest.Mock; add?: jest.Mock; avisar?: jest.Mock } = {},
  ) {
    // `null` = la clave ya existía (duplicado). `'OK'` = la reservamos nosotros.
    const set = opciones.set ?? jest.fn().mockResolvedValue('OK');
    const del = opciones.del ?? jest.fn().mockResolvedValue(1);
    const add = opciones.add ?? jest.fn().mockResolvedValue({ id: 'job-1' });

    const alertas = { avisar: opciones.avisar ?? jest.fn().mockResolvedValue(undefined) };
    const queue = { client: Promise.resolve({ set, del }), add };
    const controller = new GmailController(
      {} as unknown as GmailService,
      queue as never,
      alertas as never,
    );

    return { controller, set, del, add, alertas };
  }

  it('encola el aviso y DEJA la clave puesta cuando todo va bien', async () => {
    const { controller, set, del, add } = crear();

    await controller.handleGmailWebhook(avisoDeGmail());

    expect(set).toHaveBeenCalledWith(CLAVE, '1', 'EX', 600, 'NX');
    expect(add).toHaveBeenCalled();
    // La clave se queda: el trabajo ya está hecho y el duplicado sobra.
    expect(del).not.toHaveBeenCalled();
  });

  // El messageId real de Pub/Sub son solo dígitos. El helper de arriba usa
  // «msg-1», que no lo es, y por eso los tests pasaban mientras producción
  // rechazaba **todos** los avisos con `Custom Id cannot be integers`.
  const MESSAGE_ID_REAL = '15481022266393333';

  /** La comprobación literal de BullMQ (job.js): forma, no tipo. */
  function bullmqLoRechaza(jobId?: string) {
    return jobId !== undefined && `${parseInt(jobId, 10)}` === jobId;
  }

  it('el jobId no tiene forma de entero, o BullMQ rechaza el encolado', async () => {
    const { controller, add } = crear();

    await controller.handleGmailWebhook(avisoDeGmail(MESSAGE_ID_REAL));

    const { jobId } = add.mock.calls[0][2];
    expect(jobId).toBe(`gmail-sync-${MESSAGE_ID_REAL}`);
    expect(bullmqLoRechaza(jobId)).toBe(false);
    // BullMQ solo admite `:` en jobId de tres partes; el prefijo usa guiones.
    expect(jobId).not.toContain(':');
  });

  it('sigue deduplicando: dos avisos con el mismo messageId dan el mismo jobId', async () => {
    const { controller, add } = crear();

    await controller.handleGmailWebhook(avisoDeGmail(MESSAGE_ID_REAL));
    await controller.handleGmailWebhook(avisoDeGmail(MESSAGE_ID_REAL));

    expect(add.mock.calls[0][2].jobId).toBe(add.mock.calls[1][2].jobId);
  });

  it('sin messageId deja que BullMQ genere el id, en vez de colapsarlos en uno', async () => {
    const { controller, add } = crear();

    const aviso = avisoDeGmail();
    delete (aviso.message as { messageId?: string }).messageId;
    await controller.handleGmailWebhook(aviso);

    // «gmail-sync-undefined» sería el mismo id para avisos distintos: el
    // segundo correo se descartaría como duplicado del primero.
    expect(add.mock.calls[0][2].jobId).toBeUndefined();
  });

  it('LIBERA la clave si el encolado falla, para que la segunda entrega lo salve', async () => {
    const add = jest.fn().mockRejectedValue(new Error('Redis caído'));
    const { controller, del } = crear({ add });

    await controller.handleGmailWebhook(avisoDeGmail());

    // Sin esto, el reintento de Google que llega 4 ms después se descarta como
    // duplicado y el correo se pierde en silencio durante diez minutos.
    expect(del).toHaveBeenCalledWith(CLAVE);
  });

  it('suelta la clave ANTES de esperar al aviso, y no termina hasta que el aviso termina', async () => {
    // Dos invariantes de una vez, y las dos se pierden con facilidad:
    //
    // 1. Sin `await`, el fetch del webhook queda sin dueño y Cloud Run puede
    //    congelarlo al cerrar la petición: la alerta se pierde en silencio.
    // 2. Pero si se espera **antes** de soltar la clave de deduplicación, la
    //    reserva se retiene hasta 5 s y la segunda entrega de Google —que llega
    //    a los ~4 ms y es la que salva el correo— se descarta como duplicada.
    //
    // Es decir: hay que esperar, y hay que esperar en el sitio correcto.
    const add = jest.fn().mockRejectedValue(new Error('Redis caído'));
    let terminarAviso!: () => void;
    const avisar = jest.fn().mockImplementation(
      () => new Promise<void>((resolver) => { terminarAviso = resolver; }),
    );
    const { controller, del } = crear({ add, avisar });

    let terminado = false;
    const enCurso = controller
      .handleGmailWebhook(avisoDeGmail())
      .then(() => { terminado = true; });

    // Vacía la cola de microtareas: el handler llega hasta el `await` del aviso.
    await new Promise((resolver) => setImmediate(resolver));

    expect(del).toHaveBeenCalledWith(CLAVE);   // la clave ya está libre…
    expect(terminado).toBe(false);             // …pero el handler sigue esperando

    terminarAviso();
    await enCurso;
    expect(terminado).toBe(true);
  });

  it('el segundo aviso SÍ encola cuando el primero falló al encolar', async () => {
    // Simula Redis de verdad: la clave se guarda al reservarla y se borra al
    // liberarla, para que la segunda llamada encuentre el terreno libre.
    const claves = new Set<string>();
    const set = jest.fn(async (clave: string) => {
      if (claves.has(clave)) return null;
      claves.add(clave);
      return 'OK';
    });
    const del = jest.fn(async (clave: string) => (claves.delete(clave) ? 1 : 0));
    const add = jest
      .fn()
      .mockRejectedValueOnce(new Error('Redis caído')) // 1ª entrega: falla
      .mockResolvedValueOnce({ id: 'job-2' }); // 2ª entrega: encola

    const { controller } = crear({ set, del, add });

    await controller.handleGmailWebhook(avisoDeGmail('msg-1'));
    await controller.handleGmailWebhook(avisoDeGmail('msg-2'));

    // La prueba de la regresión: con la clave reservada por adelantado y sin
    // liberar, la segunda llamada se habría cortado en el duplicado y `add`
    // solo se habría llamado una vez.
    expect(add).toHaveBeenCalledTimes(2);
    expect(claves.has(CLAVE)).toBe(true);
  });

  it('descarta el duplicado real: si la clave ya existe, no encola', async () => {
    const set = jest.fn().mockResolvedValue(null);
    const { controller, add, del } = crear({ set });

    await controller.handleGmailWebhook(avisoDeGmail());

    expect(add).not.toHaveBeenCalled();
    // No es nuestra: no se toca. Borrarla reabriría la ventana del duplicado.
    expect(del).not.toHaveBeenCalled();
  });

  it('si Redis no responde al deduplicar, procesa igualmente', async () => {
    const set = jest.fn().mockRejectedValue(new Error('sin conexión'));
    const { controller, add, del } = crear({ set });

    await controller.handleGmailWebhook(avisoDeGmail());

    // Perder un correo es peor que procesarlo dos veces, y el duplicado ya se
    // sabe inofensivo: la sincronización es idempotente.
    expect(add).toHaveBeenCalled();
    // Nunca se reservó, así que no hay nada que liberar.
    expect(del).not.toHaveBeenCalled();
  });

  it('una notificación de control sin emailAddress se ignora sin tocar Redis', async () => {
    const { controller, set, add } = crear();
    const control = {
      message: { data: Buffer.from(JSON.stringify({ historyId: '1' })).toString('base64') },
    };

    await controller.handleGmailWebhook(control);

    expect(set).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('siempre responde OK: un error devuelto haría a Pub/Sub reintentar en bucle', async () => {
    const add = jest.fn().mockRejectedValue(new Error('Redis caído'));
    const { controller } = crear({ add });

    await expect(controller.handleGmailWebhook(avisoDeGmail())).resolves.toBe('OK');
  });
});
