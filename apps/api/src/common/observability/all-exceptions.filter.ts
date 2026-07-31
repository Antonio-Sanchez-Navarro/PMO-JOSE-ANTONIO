import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';
import { REPORTED_ERROR_EVENT_TYPE, sanitizeUrl } from './gcp-logging';
import { SERVICE_CONTEXT } from './service-context';

/**
 * Filtro global de excepciones: **es la pieza que sustituye a Sentry.**
 *
 * No manda nada a ningún servicio. Escribe en la salida estándar una entrada
 * con la marca `@type` de `ReportedErrorEvent` y la traza de pila dentro de
 * `message`, y **Cloud Error Reporting la recoge de Cloud Logging por su
 * cuenta**: la agrupa por firma de la pila, la cuenta por versión del servicio
 * y avisa de las nuevas. Lo que en Sentry es un SDK, una clave y una llamada de
 * red, aquí es el formato correcto en una línea de log.
 *
 * **Extiende `BaseExceptionFilter` y delega la respuesta en `super`** a
 * propósito: registrar no puede cambiar lo que la API devuelve. Un filtro
 * global que construya su propio cuerpo de error reescribe en silencio el
 * contrato de todas las rutas —los 400 de `class-validator`, los 401 del
 * guard, los 409 de la bandeja— y el frontend, que los lee por código y por
 * forma, empieza a fallar en sitios que nadie tocó.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger,
  ) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    // Solo tiene sentido para HTTP. Un fallo en un procesador de BullMQ o en el
    // gateway de sockets llega por otro contexto y no trae ni petición ni
    // respuesta que mirar; se deja pasar al comportamiento de siempre.
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const httpRequest = {
      requestMethod: request.method,
      requestUrl: sanitizeUrl(request.originalUrl ?? request.url ?? ''),
      status,
      userAgent: request.headers['user-agent'],
      remoteIp: request.ip,
    };

    if (status >= 500) {
      const error =
        exception instanceof Error ? exception : new Error(String(exception));

      /**
       * `message` lleva la **pila entera**, no el texto del error: es de ahí de
       * donde Error Reporting saca la firma con la que agrupa. Con solo el
       * mensaje, tres fallos distintos que digan "Internal server error"
       * acabarían contados como una sola incidencia.
       */
      this.logger.error(
        {
          '@type': REPORTED_ERROR_EVENT_TYPE,
          serviceContext: SERVICE_CONTEXT,
          context: { httpRequest },
          stack_trace: error.stack,
          err: { type: error.name, message: error.message },
        },
        error.stack ?? error.message,
      );
    } else {
      /**
       * Un 4xx se registra como aviso y **sin** la marca de Error Reporting: no
       * es una incidencia del servicio, es un cliente pidiendo algo que no
       * puede. Marcarlos abriría una incidencia por cada 401 de una cookie
       * caducada, que pasa varias veces al día por diseño.
       */
      this.logger.warn(
        { httpRequest, err: { message: describe(exception) } },
        `${request.method} ${httpRequest.requestUrl} ${status}`,
      );
    }

    /**
     * En un stream SSE las cabeceras salieron con el primer evento. Intentar
     * responder ahora lanza `ERR_HTTP_HEADERS_SENT` **dentro del filtro de
     * errores**, que es el último sitio donde uno quiere un error nuevo: el
     * original se pierde y lo que se ve es el del filtro. El fallo ya quedó
     * registrado arriba; aquí solo se cierra.
     */
    if (response.headersSent) {
      response.end();
      return;
    }

    super.catch(exception, host);
  }
}

const describe = (exception: unknown): string => {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    return typeof body === 'string' ? body : JSON.stringify(body);
  }
  return exception instanceof Error ? exception.message : String(exception);
};
