import { quitarCitas } from './quitar-citas';

/**
 * Fixtures **sintéticos**: nombres, correos y asuntos inventados. Imitan la
 * forma de lo que llega de Gmail (cabecera partida en dos líneas, bloques de
 * Outlook, citas con `>`), no el contenido de ningún hilo real.
 */
describe('quitarCitas', () => {
  it('corta en «El … escribió:» aunque Gmail la parta en dos líneas', () => {
    const texto = [
      'Estimada Ana:',
      '',
      'Adjunto los documentos. La notaría es la 12.',
      '',
      'Atentamente,',
      'Equipo Ejemplo',
      '',
      'El vie, 25 sept 2026 a la(s) 4:14 p.m., Ana Pérez | Créditos Demo by',
      'Demo SA (ana@demo.example) escribió:',
      '',
      '> Hola, ¿con qué notaría trabajan?',
      '> Saludos',
    ].join('\n');

    expect(quitarCitas(texto)).toBe(
      'Estimada Ana:\n\nAdjunto los documentos. La notaría es la 12.\n\nAtentamente,\nEquipo Ejemplo',
    );
  });

  it('corta en «On … wrote:»', () => {
    const texto = 'Done, sent it.\n\nOn Mon, Sep 28, 2026 at 10:00 AM Bob <bob@demo.example> wrote:\n> Can you send it?';
    expect(quitarCitas(texto)).toBe('Done, sent it.');
  });

  it('corta en un bloque De:/Para:/Cc:/Fecha:/Asunto: de Outlook', () => {
    const texto = [
      'Sigo atenta al documento pendiente.',
      '',
      'ANA PÉREZ',
      '',
      'De: Equipo Ejemplo <equipo@demo.example>',
      'Para: "Ana Pérez"<ana@demo.example>',
      'Cc: "Luis"<luis@demo.example>',
      'Fecha: lun, 28 sept 2026 16:58:20 -0600',
      'Asunto: Re: Operación 101',
      '',
      'Estimada Ana: adjunto los documentos.',
    ].join('\n');

    expect(quitarCitas(texto)).toBe('Sigo atenta al documento pendiente.\n\nANA PÉREZ');
  });

  it('corta en un bloque From:/Sent:/To:/Subject:', () => {
    const texto = 'Approved.\n\nFrom: Bob <bob@demo.example>\nSent: Monday\nTo: Ana\nSubject: Budget\n\nPlease approve.';
    expect(quitarCitas(texto)).toBe('Approved.');
  });

  it('corta en «-----Mensaje original-----»', () => {
    const texto = 'Recibido.\n\n-----Mensaje original-----\nDe: alguien\nTexto viejo';
    expect(quitarCitas(texto)).toBe('Recibido.');
  });

  it('quita las líneas con `>` aunque vayan intercaladas, y conserva las respuestas', () => {
    const texto = '> ¿Tienen el plano?\nSí, va adjunto.\n> ¿Y el predial?\nLo mando mañana.';
    expect(quitarCitas(texto)).toBe('Sí, va adjunto.\nLo mando mañana.');
  });

  describe('ante la duda, el texto entero', () => {
    it('un «De:» suelto en una frase no es una cabecera', () => {
      const texto = 'Hola.\nDe: parte de la dirección, favor de revisar el contrato.\nGracias.';
      expect(quitarCitas(texto)).toBe(texto);
    });

    it('un reenvío no se corta: lo reenviado es lo que se quiere leer', () => {
      const texto = [
        'Para tu revisión.',
        '',
        '---------- Mensaje reenviado ---------',
        'De: Proveedor <prov@demo.example>',
        'Fecha: mar, 29 sept 2026',
        'Asunto: Cotización',
        'Para: Equipo <equipo@demo.example>',
        '',
        'Les envío la cotización por 120,000.',
      ].join('\n');
      expect(quitarCitas(texto)).toBe(texto);
    });

    it('si todo es cita, devuelve el original en vez de nada', () => {
      const texto = 'De: Ana <ana@demo.example>\nPara: Equipo\nFecha: hoy\nAsunto: Hola\n\nTexto.';
      expect(quitarCitas(texto)).toBe(texto);
    });

    it('un texto sin citas sale igual', () => {
      expect(quitarCitas('Solo esto.')).toBe('Solo esto.');
      expect(quitarCitas('')).toBe('');
    });

    it('una frase que empieza por «El» y no termina en «escribió:» no corta', () => {
      const texto = 'Hola.\nEl banco escribió ayer que faltan dos firmas.\nGracias.';
      expect(quitarCitas(texto)).toBe(texto);
    });
  });
});
