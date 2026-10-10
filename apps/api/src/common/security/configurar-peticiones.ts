import type { NestExpressApplication } from '@nestjs/platform-express';
import { filtroDeOrigen, origenesAdmitidos } from './origen-de-peticion';

/**
 * Cómo se aceptan las peticiones. La usan `main.ts` y sus pruebas, para que lo
 * que se prueba sea lo que corre.
 *
 * - **Solo JSON en el cuerpo**: es lo único que manda el frontend. La app tiene
 *   que crearse con `bodyParser: false`, o Nest añadiría los suyos por delante.
 * - **Las peticiones que escriben, solo desde los orígenes del frontend**
 *   (`origen-de-peticion.ts`).
 */
export function configurarPeticiones(
  app: NestExpressApplication,
  origenes: string | string[],
  enProduccion: boolean,
): void {
  app.useBodyParser('json');
  app.use(filtroDeOrigen(origenesAdmitidos(origenes, enProduccion)));
}
