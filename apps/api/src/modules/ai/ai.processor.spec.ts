import { AiProcessor } from './ai.processor';

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

    // El orden del constructor es (classification, prisma).
    const processor = new AiProcessor(classification as never, prisma as never);

    return { processor, update, classification };
  }

  const job = { data: { emailId: 'e1' } } as never;

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
