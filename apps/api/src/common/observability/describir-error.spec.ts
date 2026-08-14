import { describirError, stackDe } from './describir-error';

/**
 * El formateador de errores.
 *
 * Estas pruebas existen por dos días de ingesta rota. `logger.error(msg, err)`
 * tiraba el objeto al suelo, así que la renovación del `watch` de Gmail falló
 * el 08-13 y el 08-14 sin dejar **ni una pista** de por qué: el `jsonPayload`
 * del registro traía `message`, `logger`, `pid` y `req`, y nada más.
 *
 * Lo que de verdad hacía falta —y lo que se comprueba aquí— es que el motivo
 * real de un rechazo de Google llegue al log. Google lo esconde dos niveles
 * adentro, en `err.response.data.error`, y sin eso un 400 no se distingue de
 * otro 400.
 */
describe('describirError', () => {
  /**
   * El error exacto que costó el diagnóstico, con la forma que le da
   * `googleapis`: mensaje arriba, cuerpo de la respuesta anidado.
   */
  function errorDeGoogle() {
    const mensaje =
      'Only one user push notification client allowed per developer (call /stop then try again)';
    return Object.assign(new Error(mensaje), {
      code: 400,
      response: {
        status: 400,
        data: {
          error: {
            code: 400,
            message: mensaje,
            errors: [{ message: mensaje, domain: 'global', reason: 'invalidArgument' }],
            status: 'INVALID_ARGUMENT',
          },
        },
      },
    });
  }

  it('saca el motivo real que Google esconde en response.data.error', () => {
    const texto = describirError(errorDeGoogle());

    // Lo que permite actuar: qué pide Google que hagas.
    expect(texto).toContain('call /stop then try again');
    // Y lo que permite clasificarlo sin leer el texto.
    expect(texto).toContain('INVALID_ARGUMENT');
    expect(texto).toContain('invalidArgument');
  });

  it('incluye el código y el estado HTTP, que es lo que distingue un 400 de otro', () => {
    const texto = describirError(errorDeGoogle());

    expect(texto).toContain('code=400');
    expect(texto).toContain('HTTP 400');
  });

  it('recorta el cuerpo: va a Cloud Logging, que lo retiene', () => {
    const err = Object.assign(new Error('boom'), {
      response: { status: 500, data: { relleno: 'x'.repeat(5000) } },
    });

    const texto = describirError(err);

    // El recorte es de 500 caracteres sobre el cuerpo; el resto del mensaje es
    // corto, así que un margen holgado basta para probar que no va entero.
    expect(texto.length).toBeLessThan(700);
    expect(texto).toContain('boom');
  });

  it('con un Error pelado devuelve su mensaje, sin adornos', () => {
    expect(describirError(new Error('algo se rompió'))).toBe('algo se rompió');
  });

  it('no revienta con lo que no es un Error', () => {
    expect(describirError('texto suelto')).toBe('texto suelto');
    expect(describirError(null)).toBe('(sin error)');
    expect(describirError(undefined)).toBe('(sin error)');
  });

  it('sobrevive a un cuerpo con referencias circulares', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.yo = circular;
    const err = Object.assign(new Error('ciclo'), { response: { data: circular } });

    // Lo que importa es que no lance: un fallo del logger dentro de un catch
    // se traga el error original y deja el diagnóstico peor que antes.
    expect(() => describirError(err)).not.toThrow();
    expect(describirError(err)).toContain('ciclo');
  });

  it('saca los códigos de red de Node y los de Prisma, no solo los de Google', () => {
    expect(describirError(Object.assign(new Error('conn'), { code: 'ECONNREFUSED' }))).toContain(
      'code=ECONNREFUSED',
    );
    expect(describirError(Object.assign(new Error('dup'), { code: 'P2002' }))).toContain(
      'code=P2002',
    );
  });
});

describe('stackDe', () => {
  it('devuelve el stack de un Error, que es lo que la segunda ranura espera', () => {
    expect(stackDe(new Error('x'))).toContain('Error: x');
  });

  it('devuelve undefined para lo que no es un Error, en vez de un [object Object]', () => {
    // Una ranura vacía se lee mejor que basura: es justo lo que rompió el
    // registro que estas pruebas vienen a evitar.
    expect(stackDe('texto')).toBeUndefined();
    expect(stackDe({ message: 'parece un error pero no lo es' })).toBeUndefined();
  });
});
