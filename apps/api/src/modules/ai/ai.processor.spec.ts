import { AiProcessor } from './ai.processor';
import { GmailQuotaError } from '../gmail/gmail-quota';

/**
 * El correo sin texto — el caso que puso el barrido en bucle infinito.
 *
 * **Estas pruebas no existían, y por eso esto llegó a producción.** El
 * procesador hacía `return` sin escribir nada cuando un correo no tenía
 * `bodyText` ni `snippet`; el barrido busca `processedAt IS NULL`, así que el
 * correo **volvía a ser candidato en la pasada siguiente, para siempre**. Cinco
 * correos, 96 vueltas al día, despertando Cloud Run y tocando Cloud SQL para
 * salir por la misma línea.
 *
 * Lo que se fija aquí es el contrato del cierre, que tiene tres partes y ninguna
 * sobra:
 *
 * 1. **Terminal** — `processedAt` puesto, o el bucle vuelve.
 * 2. **Distinguible** — `skipReason`, o el correo queda indistinguible de uno
 *    clasificado de verdad y la categoría desaparece de la vista.
 * 3. **No clasificado** — no se llama al modelo por un correo vacío.
 */
describe('AiProcessor · el correo sin texto se cierra dejando rastro', () => {
  function crear(email: Record<string, unknown> | null) {
    const update = jest.fn().mockResolvedValue({});
    const prisma = { email: { findUnique: jest.fn().mockResolvedValue(email), update } };
    const classification = { classifyAndPersist: jest.fn().mockResolvedValue({ isActionable: false, tasks: [] }) };

    const alertas = { avisar: jest.fn().mockResolvedValue(undefined) };
    // P5: el worker anuncia por socket cuando termina de clasificar, así que
    // el gateway entra en el constructor —(classification, prisma, alertas,
    // gateway)— y hace falta un doble aunque la prueba no lo mire.
    const gateway = { emitEmailUpdated: jest.fn() };
    const processor = new AiProcessor(
      classification as never,
      prisma as never,
      alertas as never,
      gateway as never,
    );

    return { processor, update, classification, alertas, gateway };
  }

  const job = { data: { emailId: 'e1' } } as never;

  /**
   * P5 — el aviso que faltaba.
   *
   * La clasificación es asíncrona: quien tuviera la bandeja abierta llevaba un
   * rato mirando una fila sin categoría y sin contador de cuarentena, y la
   * propuesta no aparecía hasta recargar. El producto se sentía roto justo en
   * el momento en que acababa de funcionar.
   */
  describe('P5 · al terminar, la bandeja abierta se entera', () => {
    it('anuncia el correo por socket cuando la clasificación sale bien', async () => {
      const { processor, gateway } = crear({
        id: 'e1',
        userId: 'user-1',
        processedAt: null,
        bodyText: 'Hay texto de sobra para clasificar',
        snippet: null,
        labels: ['INBOX'],
      });

      await processor.process(job);

      // Sin `exceptSocketId`: lo disparó la cola, no una pestaña, así que se
      // anuncia a todas las del usuario.
      expect(gateway.emitEmailUpdated).toHaveBeenCalledWith({ id: 'e1', userId: 'user-1' });
    });

    it('no anuncia el correo que se cierra sin clasificar', async () => {
      const { processor, gateway } = crear({
        id: 'e1',
        userId: 'user-1',
        processedAt: null,
        bodyText: null,
        snippet: null,
        labels: ['INBOX'],
      });

      await processor.process(job);

      // Un correo cerrado por `sinTexto` no estrena propuesta: avisar aquí haría
      // que la bandeja se refrescara para no enseñar nada nuevo.
      expect(gateway.emitEmailUpdated).not.toHaveBeenCalled();
    });
  });

  it('lo marca como procesado: sin esto vuelve a ser candidato para siempre', async () => {
    const { processor, update } = crear({
      id: 'e1',
      processedAt: null,
      bodyText: null,
      snippet: '',
      labels: ['INBOX'],
    });

    await processor.process(job);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.processedAt).toBeInstanceOf(Date);
  });

  it('deja el motivo, para que no se confunda con uno clasificado de verdad', async () => {
    const { processor, update } = crear({
      id: 'e1',
      processedAt: null,
      bodyText: null,
      snippet: null,
      labels: [],
    });

    await processor.process(job);

    expect(update.mock.calls[0][0].data.skipReason).toBe('SIN_TEXTO');
  });

  it('no llama al modelo por un correo vacío', async () => {
    const { processor, classification } = crear({
      id: 'e1',
      processedAt: null,
      bodyText: '',
      snippet: '',
      labels: [],
    });

    await processor.process(job);

    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
  });

  it('con snippet pero sin cuerpo SÍ clasifica: el snippet basta', async () => {
    // La guarda es `!bodyText && !snippet`, no `!bodyText`. Un correo corto que
    // solo trae snippet es clasificable y no debe cerrarse como sin texto.
    const { processor, classification, update } = crear({
      id: 'e1',
      processedAt: null,
      bodyText: null,
      snippet: 'Nos vemos el jueves',
      labels: [],
    });

    await processor.process(job);

    expect(classification.classifyAndPersist).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('uno ya procesado no se vuelve a tocar', async () => {
    const { processor, update, classification } = crear({
      id: 'e1',
      processedAt: new Date(),
      bodyText: null,
      snippet: null,
      labels: [],
    });

    await processor.process(job);

    expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * Saldo agotado — la causa, no el síntoma.
 *
 * **No es un 429.** Un 429 es `rate_limit_error` y esperar arregla; el saldo
 * agotado llega como **`billing_error` con 403** y esperar no rellena la cuenta.
 * Sin distinguirlos, el día que se acabe el crédito cada correo agota sus tres
 * intentos y cae en la DLQ: la DLQ avisaría de que «un job falló» y **nadie
 * diría por qué**.
 */
describe('AiProcessor · el credito agotado se dice con su nombre', () => {
  function crear(error: unknown) {
    const prisma = {
      email: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1',
          processedAt: null,
          bodyText: 'hola',
          snippet: 'hola',
          labels: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const classification = { classifyAndPersist: jest.fn().mockRejectedValue(error) };
    const alertas = { avisar: jest.fn().mockResolvedValue(undefined) };
    const gateway = { emitEmailUpdated: jest.fn() };
    const processor = new AiProcessor(
      classification as never,
      prisma as never,
      alertas as never,
      gateway as never,
    );
    return { processor, alertas, gateway };
  }

  const job = { data: { emailId: 'e1' } } as never;

  it('un billing_error avisa de que se acabo el credito y NO se relanza', async () => {
    // No se relanza porque reintentar no rellena la cuenta: gastar los tres
    // intentos solo llena la DLQ de sintomas.
    const { processor, alertas } = crear(
      Object.assign(new Error('Your credit balance is too low'), { status: 403, type: 'billing_error' }),
    );

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(String(alertas.avisar.mock.calls[0][0])).toContain('credito de Anthropic');
  });

  it('lo detecta por el texto aunque el `type` no viaje', async () => {
    const { processor, alertas } = crear(
      Object.assign(new Error('Your credit balance is too low to access the API'), { status: 403 }),
    );

    await processor.process(job);

    expect(alertas.avisar).toHaveBeenCalledTimes(1);
  });

  it('un 403 de permisos NO se confunde con falta de saldo', async () => {
    // 403 lo comparten `billing_error` y `permission_error`, y piden cosas
    // distintas: una es «paga» y la otra «la clave no tiene permiso».
    const { processor, alertas } = crear(
      Object.assign(new Error('API key lacks permission'), { status: 403, type: 'permission_error' }),
    );

    await expect(processor.process(job)).rejects.toThrow();
    expect(alertas.avisar).not.toHaveBeenCalled();
  });

  it('un 429 sigue siendo freno de cola, no falta de saldo', async () => {
    const { processor, alertas } = crear(
      Object.assign(new Error('rate limited'), { status: 429, type: 'rate_limit_error' }),
    );

    await processor.process(job).catch(() => undefined);

    expect(alertas.avisar).not.toHaveBeenCalled();
  });
});

describe('AiProcessor · la cuota de GMAIL frena esta cola (Fase 8.2)', () => {
  /**
   * El agujero que esto cierra, y que costo el atasco del 2026-09-14:
   *
   * Desde la Fase 8, clasificar un correo con adjuntos los baja antes de Gmail,
   * asi que `classifyAndPersist` puede lanzar `GmailQuotaError`. Aqui no se
   * reconocia, caia al `throw` generico y BullMQ lo reintentaba **tres veces**
   * — cada reintento volviendo a pedir los mismos adjuntos del mismo cubo
   * agotado. El 429 de Gmail no solo no frenaba esta cola: la hacia pedir el
   * triple, y la ingesta —que si frenaba bien— volvia 258 veces seguidas a
   * encontrarse el cubo vacio.
   */
  function crear(error: unknown) {
    const prisma = {
      email: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1',
          userId: 'u1',
          processedAt: null,
          bodyText: 'hola',
          snippet: 'hola',
          labels: [],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const classification = { classifyAndPersist: jest.fn().mockRejectedValue(error) };
    const alertas = { avisar: jest.fn().mockResolvedValue(undefined) };
    const gateway = { emitEmailUpdated: jest.fn() };
    const processor = new AiProcessor(
      classification as never,
      prisma as never,
      alertas as never,
      gateway as never,
    );

    // `worker` lo inyecta BullMQ en produccion; aqui se pone a mano para poder
    // comprobar que se llama a `rateLimit` y con cuanto.
    const rateLimit = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(processor, 'worker', { value: { rateLimit }, writable: true });

    return { processor, rateLimit, classification };
  }

  const job = { data: { emailId: 'e1' } } as never;

  it('pausa la cola y devuelve el job SIN gastarle un intento', async () => {
    const { processor, rateLimit } = crear(new GmailQuotaError({ code: 429 }, 'bajando adjuntos'));

    // `RateLimitError` es la señal convenida de BullMQ: el job vuelve a la
    // espera como si no se hubiera ejecutado. Con un error normal gastaria uno
    // de sus tres intentos y volveria a bajar los adjuntos en el siguiente.
    await expect(processor.process(job)).rejects.toThrow();
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it('respeta el plazo que pida Google', async () => {
    const error = new GmailQuotaError({ code: 429 }, 'bajando adjuntos');
    Object.defineProperty(error, 'esperaMs', { value: 90_000 });

    const { processor, rateLimit } = crear(error);

    await processor.process(job).catch(() => undefined);

    expect(rateLimit).toHaveBeenCalledWith(90_000);
  });

  it('sin plazo de Google espera cinco minutos, no un minuto', async () => {
    // Cuando esto salta de verdad, el cubo lleva vacio un buen rato porque lo
    // esta vaciando la propia recuperacion: volver al minuto es volver a chocar.
    const { processor, rateLimit } = crear(new GmailQuotaError({ code: 429 }, 'bajando'));

    await processor.process(job).catch(() => undefined);

    expect(rateLimit).toHaveBeenCalledWith(5 * 60_000);
  });

  it('tambien reconoce el 429 crudo de Google, no solo el envuelto', async () => {
    // `fetchAttachment` envuelve, pero cualquier otra llamada a googleapis en
    // el camino podria subir el error tal cual.
    const { processor, rateLimit } = crear(
      Object.assign(new Error('Quota exceeded'), { code: 429 }),
    );

    await processor.process(job).catch(() => undefined);

    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it('un fallo normal NO frena la cola: se relanza para que se reintente', async () => {
    const { processor, rateLimit } = crear(new Error('el modelo dijo una tonteria'));

    await expect(processor.process(job)).rejects.toThrow('tonteria');
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('un 404 de Gmail tampoco frena la cola: no es cuota', async () => {
    // Un adjunto borrado no tiene nada que ver con el cubo, y dormir la cola
    // cinco minutos por el pararia la digestion del atasco sin motivo.
    const { processor, rateLimit } = crear(
      Object.assign(new Error('Not Found'), { code: 404 }),
    );

    await processor.process(job).catch(() => undefined);

    expect(rateLimit).not.toHaveBeenCalled();
  });
});
