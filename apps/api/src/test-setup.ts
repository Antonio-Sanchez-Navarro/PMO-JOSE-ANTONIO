import { Logger } from '@nestjs/common';

/**
 * Silencia el logger de Nest durante las pruebas.
 *
 * Varios casos ejercitan a propósito rutas que registran avisos (categoría
 * corrupta, fecha no parseable); sin esto, la salida de una suite verde parece
 * llena de errores.
 */
Logger.overrideLogger(false);
