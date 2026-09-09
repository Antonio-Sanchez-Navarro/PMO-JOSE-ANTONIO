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
