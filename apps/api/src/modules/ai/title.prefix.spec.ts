import { MAX_TITLE_LENGTH, withContextPrefix } from './title.prefix';

const CONTEXTO = { senderName: 'Astrid R.', project: 'Citrotarte' };

describe('withContextPrefix — prefijo de contexto en el título (Sprint 4)', () => {
  describe('formato', () => {
    it('antepone remitente y proyecto', () => {
      expect(withContextPrefix(['Solicitar inmueble en garantía'], CONTEXTO)).toEqual([
        '[Astrid R. - Citrotarte] Solicitar inmueble en garantía',
      ]);
    });

    it('numera cuando el correo detona varias tareas', () => {
      const titulos = withContextPrefix(['Solicitar inmueble', 'Confirmar TC', 'Enviar KYC'], CONTEXTO);

      expect(titulos).toEqual([
        '[Astrid R. - Citrotarte 1/3] Solicitar inmueble',
        '[Astrid R. - Citrotarte 2/3] Confirmar TC',
        '[Astrid R. - Citrotarte 3/3] Enviar KYC',
      ]);
    });

    it('no numera una tarea suelta: "1/1" no informa de nada', () => {
      expect(withContextPrefix(['Única'], CONTEXTO)[0]).not.toContain('1/1');
    });
  });

  describe('datos incompletos', () => {
    it('con solo remitente, prefija con él', () => {
      expect(withContextPrefix(['Llamar'], { senderName: 'Astrid R.' })).toEqual([
        '[Astrid R.] Llamar',
      ]);
    });

    it('con solo proyecto, prefija con él', () => {
      expect(withContextPrefix(['Llamar'], { project: 'Citrotarte' })).toEqual([
        '[Citrotarte] Llamar',
      ]);
    });

    it('sin remitente ni proyecto deja el título intacto', () => {
      // Mejor sin contexto que con un "[Desconocido]" inventado ensuciando el tablero.
      expect(withContextPrefix(['Llamar'], { senderName: null, project: null })).toEqual(['Llamar']);
    });

    it('trata las cadenas vacías y los espacios como ausencia', () => {
      expect(withContextPrefix(['Llamar'], { senderName: '   ', project: '' })).toEqual(['Llamar']);
    });

    it('normaliza los espacios internos del contexto', () => {
      expect(withContextPrefix(['Llamar'], { senderName: ' Astrid   R. ', project: 'Torre  A' })).toEqual(
        ['[Astrid R. - Torre A] Llamar'],
      );
    });
  });

  describe('idempotencia', () => {
    it('no vuelve a prefijar un título que ya lo trae', () => {
      const yaPrefijado = '[Astrid R. - Citrotarte 1/2] Solicitar inmueble';

      expect(withContextPrefix([yaPrefijado], CONTEXTO)).toEqual([yaPrefijado]);
    });

    it('reprocesar un correo no encadena prefijos', () => {
      const primera = withContextPrefix(['Solicitar', 'Confirmar'], CONTEXTO);
      const segunda = withContextPrefix(primera, CONTEXTO);

      expect(segunda).toEqual(primera);
      expect(segunda[0].match(/\[/g)).toHaveLength(1);
    });

    it('respeta un prefijo escrito por una persona aunque no sea el nuestro', () => {
      expect(withContextPrefix(['[Urgente] Llamar al notario'], CONTEXTO)).toEqual([
        '[Urgente] Llamar al notario',
      ]);
    });
  });

  describe('límite de longitud', () => {
    it('recorta el cuerpo y nunca el prefijo', () => {
      const largo = 'a'.repeat(MAX_TITLE_LENGTH + 100);

      const [titulo] = withContextPrefix([largo], CONTEXTO);

      expect(titulo.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
      expect(titulo.startsWith('[Astrid R. - Citrotarte] ')).toBe(true);
      expect(titulo.endsWith('…')).toBe(true);
    });

    it('deja pasar intacto lo que cabe', () => {
      const [titulo] = withContextPrefix(['Corto'], CONTEXTO);

      expect(titulo).toBe('[Astrid R. - Citrotarte] Corto');
    });
  });

  it('recorta los espacios del título original', () => {
    expect(withContextPrefix(['  Solicitar  '], CONTEXTO)).toEqual([
      '[Astrid R. - Citrotarte] Solicitar',
    ]);
  });

  it('sobre una lista vacía no hace nada', () => {
    expect(withContextPrefix([], CONTEXTO)).toEqual([]);
  });
});
