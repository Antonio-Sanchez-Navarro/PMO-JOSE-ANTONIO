import { contentDisposition, contentTypeSeguro, nombreSeguro } from './attachment-headers';

describe('nombreSeguro — el nombre lo escribió quien mandó el correo', () => {
  it('deja en paz un nombre normal', () => {
    expect(nombreSeguro('Cotización obra.pdf')).toBe('Cotización obra.pdf');
  });

  it('quita los saltos de línea, que parten la cabecera en dos', () => {
    // Con un CRLF dentro, quien manda el correo escribe las cabeceras que
    // quiera en nuestra respuesta (response splitting).
    expect(nombreSeguro('factura.pdf\r\nSet-Cookie: sesion=robada')).not.toContain('\n');
    expect(nombreSeguro('factura.pdf\r\nSet-Cookie: sesion=robada')).not.toContain('\r');
  });

  it('quita las comillas, que cierran el valor antes de tiempo', () => {
    expect(nombreSeguro('a".pdf')).toBe('a.pdf');
  });

  it('convierte las barras en guion bajo: un nombre no es una ruta', () => {
    expect(nombreSeguro('../../etc/passwd')).toBe('.._.._etc_passwd');
  });

  it('un nombre vacío no deja la cabecera sin valor', () => {
    expect(nombreSeguro('   ')).toBe('adjunto');
    expect(nombreSeguro('')).toBe('adjunto');
  });

  it('acota la longitud', () => {
    expect(nombreSeguro('a'.repeat(500))).toHaveLength(200);
  });
});

describe('contentDisposition — qué se enseña y qué se descarga', () => {
  it('un PDF se puede mirar sin bajarlo', () => {
    expect(contentDisposition('plano.pdf', 'application/pdf')).toMatch(/^inline;/);
  });

  it('una imagen también', () => {
    expect(contentDisposition('foto.png', 'image/png')).toMatch(/^inline;/);
  });

  it('un HTML se descarga SIEMPRE, y ese es el punto', () => {
    // Servido `inline` se ejecutaria en nuestro origen, con la cookie de sesion
    // al alcance: bastaria mandarle un correo al Jefe para robarle la sesion en
    // cuanto abriera el adjunto. Descargado es inerte.
    expect(contentDisposition('pagina.html', 'text/html')).toMatch(/^attachment;/);
  });

  it('lo que no esté en la lista de permitidos se descarga', () => {
    expect(contentDisposition('raro.xyz', 'application/x-cualquier-cosa')).toMatch(/^attachment;/);
    expect(contentDisposition('app.svg', 'image/svg+xml')).toMatch(/^attachment;/);
  });

  it('escribe el nombre en las dos formas, y la acentuada en UTF-8', () => {
    const cabecera = contentDisposition('Cotización.pdf', 'application/pdf');

    // La copia ASCII es el respaldo para clientes viejos: los acentos se
    // sustituyen en vez de salir como bytes rotos.
    expect(cabecera).toContain('filename="Cotizaci_n.pdf"');
    // La buena, que es la que entiende cualquier navegador de hoy.
    expect(cabecera).toContain("filename*=UTF-8''Cotizaci%C3%B3n.pdf");
  });

  it('un nombre con salto de línea no se cuela en la cabecera', () => {
    const cabecera = contentDisposition('x.pdf\r\nX-Malo: si', 'application/pdf');

    expect(cabecera).not.toContain('\r');
    expect(cabecera).not.toContain('\n');
  });
});

describe('contentTypeSeguro — el tipo también lo declara el remitente', () => {
  it('deja pasar un tipo con la forma de un tipo', () => {
    expect(contentTypeSeguro('application/pdf')).toBe('application/pdf');
    expect(contentTypeSeguro('image/svg+xml')).toBe('image/svg+xml');
  });

  it('degrada lo que trae parámetros pegados', () => {
    // Con `;` dentro se añaden parametros a la cabecera que nadie ha revisado.
    expect(contentTypeSeguro('text/html; charset=utf-8')).toBe('application/octet-stream');
  });

  it('degrada lo que trae controles o espacios', () => {
    expect(contentTypeSeguro('text/html\r\nX-Malo: si')).toBe('application/octet-stream');
    expect(contentTypeSeguro('')).toBe('application/octet-stream');
  });
});
