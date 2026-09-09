import { describe, expect, it } from 'vitest';
import { isUnread, parseSender, visibleLabels } from './format';

describe('visibleLabels', () => {
  it('esconde las etiquetas que no aportan nada', () => {
    // `INBOX` la llevan todas y `UNREAD` se representa con el estilo de la
    // fila, no con una píldora.
    expect(visibleLabels(['INBOX', 'UNREAD'])).toEqual([]);
  });

  it('traduce las etiquetas de sistema a su nombre en castellano', () => {
    expect(visibleLabels(['IMPORTANT', 'CATEGORY_PERSONAL'])).toEqual([
      { id: 'IMPORTANT', name: 'Importante' },
      { id: 'CATEGORY_PERSONAL', name: 'Personal' },
    ]);
  });

  /**
   * Hallazgo C8 de la auditoría 9926: en la barra de filtros aparecían
   * `5704178821214641997 (2)` y `5894179508653781830 (1)` al lado de
   * «Novedades» e «Importante».
   */
  it('no pinta identificadores crudos de Gmail', () => {
    expect(visibleLabels(['5704178821214641997', '5894179508653781830'])).toEqual([]);
    // Tampoco los que traen el prefijo y nada legible detrás.
    expect(visibleLabels(['Label_12'])).toEqual([]);
  });

  it('conserva las etiquetas de usuario que sí tienen nombre', () => {
    expect(visibleLabels(['TRABAJO/CLIENTES', 'MI_ETIQUETA'])).toEqual([
      { id: 'TRABAJO/CLIENTES', name: 'Clientes' },
      { id: 'MI_ETIQUETA', name: 'Mi etiqueta' },
    ]);
  });

  it('descarta lo ilegible sin llevarse por delante lo que sí lo es', () => {
    // El caso real de la bandeja: las dos cosas mezcladas en el mismo correo.
    expect(visibleLabels(['INBOX', 'IMPORTANT', '5704178821214641997'])).toEqual([
      { id: 'IMPORTANT', name: 'Importante' },
    ]);
  });
});

describe('parseSender', () => {
  it('separa nombre y correo de una cabecera con las dos cosas', () => {
    expect(parseSender('Juan Perez <juan@example.com>')).toEqual({
      name: 'Juan Perez',
      email: 'juan@example.com',
    });
  });

  it('quita las comillas del nombre', () => {
    expect(parseSender('"Juan Perez" <juan@example.com>')).toEqual({
      name: 'Juan Perez',
      email: 'juan@example.com',
    });
  });

  it('cae al usuario del correo cuando no hay nombre', () => {
    expect(parseSender('juan@example.com')).toEqual({
      name: 'juan',
      email: 'juan@example.com',
    });
  });
});

describe('isUnread', () => {
  it('mira la etiqueta UNREAD y nada más', () => {
    expect(isUnread(['INBOX', 'UNREAD'])).toBe(true);
    expect(isUnread(['INBOX'])).toBe(false);
  });
});

describe('visibleLabels con el diccionario de GET /gmail/labels', () => {
  const diccionario = {
    '5704178821214641997': { name: 'Clientes', type: 'user' as const },
    '5894179508653781830': { name: 'PMO Interno', type: 'user' as const },
    Label_88: { name: 'Facturas/2026', type: 'user' as const },
    IMPORTANT: { name: 'IMPORTANT', type: 'system' as const },
    SENT: { name: 'SENT', type: 'system' as const },
  };

  it('resuelve el identificador crudo a su nombre real', () => {
    expect(visibleLabels(['5704178821214641997'], diccionario)).toEqual([
      { id: '5704178821214641997', name: 'Clientes' },
    ]);
  });

  /**
   * `prettifyLabelId` pasa a minúsculas todo menos la primera letra, que está
   * bien para un id (`MI_ETIQUETA` → «Mi etiqueta») y destroza un nombre que
   * escribió una persona: «PMO Interno» se quedaría en «Pmo interno».
   */
  it('respeta las mayúsculas del nombre que escribió su dueño', () => {
    expect(visibleLabels(['5894179508653781830'], diccionario)).toEqual([
      { id: '5894179508653781830', name: 'PMO Interno' },
    ]);
  });

  /**
   * Se pinta el nombre entero, no la hoja.
   *
   * Recortar «Facturas/2026» a «2026» parecía razonable —es lo que enseña
   * Gmail en su fila— hasta que se junta con el filtro de C8: «2026» no tiene
   * ni una letra, así que la etiqueta desaparecía de la pantalla. La hoja
   * además puede no significar nada por sí sola. Que el ancho lo resuelva el
   * CSS, que para eso está.
   */
  it('pinta el nombre completo de una etiqueta anidada', () => {
    expect(visibleLabels(['Label_88'], diccionario)).toEqual([
      { id: 'Label_88', name: 'Facturas/2026' },
    ]);
  });

  it('un nombre real sin letras se respeta, porque su dueño lo eligió', () => {
    const soloNumeros = { Label_99: { name: '2026', type: 'user' as const } };
    expect(visibleLabels(['Label_99'], soloNumeros)).toEqual([
      { id: 'Label_99', name: '2026' },
    ]);
  });

  /**
   * Gmail devuelve las de sistema con el nombre igual a su constante, así que
   * el diccionario diría «IMPORTANT». Traducirlas es decisión nuestra y gana.
   */
  it('la traducción de las de sistema manda sobre lo que diga Gmail', () => {
    expect(visibleLabels(['IMPORTANT'], diccionario)).toEqual([
      { id: 'IMPORTANT', name: 'Importante' },
    ]);
  });

  it('las de sistema sin traducción se siguen embelleciendo', () => {
    expect(visibleLabels(['SENT'], diccionario)).toEqual([{ id: 'SENT', name: 'Sent' }]);
  });

  /**
   * La red de seguridad de C8 sigue puesta: una etiqueta borrada en Gmail, o el
   * diccionario todavía cargando, no pueden devolver el número a la pantalla.
   */
  it('sigue escondiendo lo que el diccionario no conoce', () => {
    expect(visibleLabels(['1111111111111111111'], diccionario)).toEqual([]);
    expect(visibleLabels(['5704178821214641997'], {})).toEqual([]);
  });
});
