import {
  AdjuntoCandidato,
  MAX_ADJUNTOS_POR_CORREO,
  MAX_BYTES_POR_ADJUNTO,
  repartirAdjuntos,
} from './attachment-budget';

const MB = 1024 * 1024;

const ficha = (extra: Partial<AdjuntoCandidato> = {}): AdjuntoCandidato => ({
  attachmentId: 'att-1',
  filename: 'documento.pdf',
  mimeType: 'application/pdf',
  size: 100_000,
  inline: false,
  ...extra,
});

describe('repartirAdjuntos — qué ve el modelo y qué no (Fase 8)', () => {
  it('un PDF va como document y una imagen como image', () => {
    const { elegidos } = repartirAdjuntos([
      ficha({ attachmentId: 'a', mimeType: 'application/pdf' }),
      ficha({ attachmentId: 'b', mimeType: 'image/png', filename: 'plano.png' }),
    ]);

    expect(elegidos.map((e) => e.forma)).toEqual(['document', 'image']);
  });

  describe('lo incrustado no se manda', () => {
    it('el logo de la firma se queda fuera, y sin hacer ruido', () => {
      // Es el gasto silencioso de la epica: casi toda firma corporativa lleva
      // un logo, asi que sin este filtro la clasificacion pagaria tokens de
      // imagen por mirar el mismo PNG de 4 KB en CADA correo que entra.
      const { elegidos, descartados } = repartirAdjuntos([
        ficha({ attachmentId: 'logo', mimeType: 'image/png', filename: 'logo.png', inline: true }),
      ]);

      expect(elegidos).toEqual([]);
      // No es un ausente: no se le dice al modelo «no has visto el logo»,
      // porque no hay nada que pudiera querer leer ahi.
      expect(descartados).toEqual([]);
    });

    it('pero un adjunto de verdad del mismo tipo sí se manda', () => {
      const { elegidos } = repartirAdjuntos([
        ficha({ attachmentId: 'logo', mimeType: 'image/png', inline: true }),
        ficha({ attachmentId: 'plano', mimeType: 'image/png', filename: 'plano.png' }),
      ]);

      expect(elegidos).toHaveLength(1);
      expect(elegidos[0].candidato.filename).toBe('plano.png');
    });
  });

  describe('lo que se queda fuera se dice, y con nombre', () => {
    it('un tipo que el modelo no abre', () => {
      // Mandar un .docx seria pagar por que lo rechace.
      const { elegidos, descartados } = repartirAdjuntos([
        ficha({
          filename: 'contrato.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ]);

      expect(elegidos).toEqual([]);
      expect(descartados[0].filename).toBe('contrato.docx');
      expect(descartados[0].motivo).toContain('no soportado');
    });

    it('un archivo demasiado grande', () => {
      const { elegidos, descartados } = repartirAdjuntos([
        ficha({ filename: 'planos.pdf', size: 20 * MB }),
      ]);

      expect(elegidos).toEqual([]);
      // El nombre tiene que viajar: es lo que deja al prompt decirle al modelo
      // «hay un planos.pdf que no has visto», y eso es lo que evita que escriba
      // «segun el documento adjunto...» sobre algo que nunca leyo.
      expect(descartados[0].filename).toBe('planos.pdf');
      expect(descartados[0].motivo).toContain('grande');
    });

    it('el tope por archivo deja pasar lo que cabe justo', () => {
      const { elegidos } = repartirAdjuntos([ficha({ size: MAX_BYTES_POR_ADJUNTO })]);

      expect(elegidos).toHaveLength(1);
    });
  });

  describe('presupuesto del correo entero', () => {
    it('corta al llegar al tope de archivos', () => {
      const muchos = Array.from({ length: MAX_ADJUNTOS_POR_CORREO + 2 }, (_, i) =>
        ficha({ attachmentId: `a${i}`, filename: `doc-${i}.pdf`, size: 1000 }),
      );

      const { elegidos, descartados } = repartirAdjuntos(muchos);

      expect(elegidos).toHaveLength(MAX_ADJUNTOS_POR_CORREO);
      expect(descartados).toHaveLength(2);
      expect(descartados[0].motivo).toContain('tope de archivos');
    });

    it('corta al llegar al tope de tamaño sumado', () => {
      const { elegidos, descartados } = repartirAdjuntos([
        ficha({ attachmentId: 'a', filename: 'a.pdf', size: 4 * MB }),
        ficha({ attachmentId: 'b', filename: 'b.pdf', size: 4 * MB }),
        ficha({ attachmentId: 'c', filename: 'c.pdf', size: 4 * MB }),
      ]);

      expect(elegidos).toHaveLength(2);
      expect(descartados[0].filename).toBe('c.pdf');
      expect(descartados[0].motivo).toContain('tamaño total');
    });

    it('respeta el orden del correo, no el tamaño', () => {
      // Si hay que dejar algo fuera, se queda lo primero que adjunto quien
      // escribio, que suele ser lo principal. Ordenar por tamaño meteria la
      // miniatura y dejaria fuera el contrato.
      const { elegidos } = repartirAdjuntos([
        ficha({ attachmentId: 'grande', filename: 'contrato.pdf', size: 4 * MB }),
        ficha({ attachmentId: 'chico', filename: 'nota.pdf', size: 1000 }),
      ]);

      expect(elegidos[0].candidato.filename).toBe('contrato.pdf');
    });
  });

  it('sin adjuntos no hay nada que decidir', () => {
    expect(repartirAdjuntos([])).toEqual({ elegidos: [], descartados: [] });
  });
});
