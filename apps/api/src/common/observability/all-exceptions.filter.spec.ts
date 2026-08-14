import {
  ArgumentsHost,
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { REPORTED_ERROR_EVENT_TYPE } from './gcp-logging';

const host = (
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  tipo = 'http',
) =>
  ({
    getType: () => tipo,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  }) as unknown as ArgumentsHost;

describe('AllExceptionsFilter', () => {
  let logger: { error: jest.Mock; warn: jest.Mock };
  let alertas: { avisar: jest.Mock };
  let filtro: AllExceptionsFilter;
  let base: jest.SpyInstance;

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn() };
    alertas = { avisar: jest.fn().mockResolvedValue(undefined) };
    filtro = new AllExceptionsFilter(logger as unknown as PinoLogger, alertas as never);
    // El filtro de Nest es quien responde; aquí solo interesa *que* se le
    // delegue, no lo que escriba en el socket.
    base = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation();
  });

  afterEach(() => base.mockRestore());

  const peticion = {
    method: 'POST',
    originalUrl: '/tasks',
    headers: { 'user-agent': 'jest' },
    ip: '10.0.0.1',
  };

  describe('Fallos del servidor', () => {
    it('los marca para que Error Reporting los recoja', () => {
      const error = new Error('la base se cayó');

      filtro.catch(error, host(peticion, { headersSent: false }));

      const [carga] = logger.error.mock.calls[0];
      expect(carga['@type']).toBe(REPORTED_ERROR_EVENT_TYPE);
      expect(carga.serviceContext).toMatchObject({ service: expect.any(String) });
    });

    it('manda la pila entera como mensaje, que es de donde sale la firma', () => {
      const error = new Error('reventó');

      filtro.catch(error, host(peticion, { headersSent: false }));

      // Con solo el texto, tres fallos distintos que digan "Internal server
      // error" se agruparían como una sola incidencia.
      const [, mensaje] = logger.error.mock.calls[0];
      expect(mensaje).toBe(error.stack);
      expect(mensaje).toContain('at ');
    });

    it('lo que se lanza sin ser un Error también se registra', () => {
      filtro.catch('me lanzaron una cadena', host(peticion, { headersSent: false }));

      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('no mete la URL sin tapar en el registro', () => {
      filtro.catch(
        new Error('x'),
        host(
          { ...peticion, originalUrl: '/auth/google/callback?code=secreto' },
          { headersSent: false },
        ),
      );

      const [carga] = logger.error.mock.calls[0];
      expect(carga.context.httpRequest.requestUrl).not.toContain('secreto');
    });
  });

  describe('Fallos de una sonda de salud', () => {
    /**
     * Comprobado contra la aplicación el 2026-08-03: con Redis parado,
     * `/health/ready` devolvía 503 —que es su trabajo— y el filtro lo marcaba
     * como incidencia. La sonda se dispara cada pocos segundos: un minuto de
     * caída son decenas de incidencias diciendo lo que el cuerpo del 503 ya
     * decía, y lo que sí hay que mirar queda enterrado debajo.
     */
    it('el 503 de readiness no abre incidencia en Error Reporting', () => {
      const sonda = { ...peticion, method: 'GET', originalUrl: '/health/ready' };

      filtro.catch(
        new ServiceUnavailableException('redis down'),
        host(sonda, { headersSent: false }),
      );

      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('pero queda registrado: la dependencia se cayó y eso se ve', () => {
      const sonda = { ...peticion, originalUrl: '/health/ready' };

      filtro.catch(new ServiceUnavailableException(), host(sonda, { headersSent: false }));

      const [carga] = logger.warn.mock.calls[0];
      expect(carga.httpRequest.status).toBe(503);
    });

    it('un 500 de verdad en cualquier otra ruta sí se marca', () => {
      filtro.catch(new Error('x'), host(peticion, { headersSent: false }));

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Fallos del cliente', () => {
    it('un 4xx es aviso y **sin** la marca de Error Reporting', () => {
      filtro.catch(new UnauthorizedException(), host(peticion, { headersSent: false }));

      expect(logger.error).not.toHaveBeenCalled();
      const [carga] = logger.warn.mock.calls[0];
      expect(carga['@type']).toBeUndefined();
    });

    it('un 400 de validación tampoco abre incidencia', () => {
      // Pasa cada vez que alguien manda un campo mal: no es un fallo del
      // servicio y no puede llenar de rojo el panel.
      filtro.catch(
        new BadRequestException(['tz no es una zona válida']),
        host(peticion, { headersSent: false }),
      );

      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lo que responde', () => {
    it('delega la respuesta en el filtro de Nest, sin inventar cuerpo', () => {
      // Construir aquí el cuerpo reescribiría en silencio el contrato de todas
      // las rutas, y el frontend los lee por código y por forma.
      const excepcion = new BadRequestException('mal');
      const contexto = host(peticion, { headersSent: false });

      filtro.catch(excepcion, contexto);

      expect(base).toHaveBeenCalledWith(excepcion, contexto);
    });

    it('con las cabeceras ya enviadas cierra y no intenta responder', () => {
      // En un stream SSE responder ahora lanza ERR_HTTP_HEADERS_SENT dentro del
      // propio filtro de errores: el fallo original se pierde y se ve el nuevo.
      const end = jest.fn();

      filtro.catch(new Error('se cortó el stream'), host(peticion, { headersSent: true, end }));

      expect(end).toHaveBeenCalledTimes(1);
      expect(base).not.toHaveBeenCalled();
      // Pero registrado sí queda.
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('lo que no es HTTP pasa de largo', () => {
      // Un fallo en un procesador de BullMQ no trae petición que mirar.
      const excepcion = new Error('falló un job');
      const contexto = host({}, {}, 'ws');

      filtro.catch(excepcion, contexto);

      expect(base).toHaveBeenCalledWith(excepcion, contexto);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
