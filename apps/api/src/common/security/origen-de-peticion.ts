import type { NextFunction, Request, Response } from 'express';

/**
 * Las peticiones que escriben solo se aceptan desde los orígenes del frontend.
 *
 * - `GET`, `HEAD` y `OPTIONS` pasan siempre: no cambian nada, y el login con
 *   Google es una cadena de `GET` y redirecciones.
 * - Las demás tienen que traer un `Origin` de la lista (la misma del CORS). Si
 *   no traen `Origin`, vale el origen del `Referer`. Sin ninguno de los dos, no.
 * - Las rutas de servidor a servidor (`/webhooks/`, `/cron/`) no pasan por aquí:
 *   no usan la sesión del navegador, se autentican con su propio token OIDC.
 */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RUTAS_DE_SERVIDOR = [/^\/webhooks\//, /^\/cron\//];

/** En desarrollo el frontend vive en Vite, en `localhost` o en `127.0.0.1`. */
const ORIGENES_DE_DESARROLLO = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function origenesAdmitidos(permitidos: string | string[], enProduccion: boolean): string[] {
  const lista = Array.isArray(permitidos) ? [...permitidos] : [permitidos];
  return enProduccion ? lista : [...new Set([...lista, ...ORIGENES_DE_DESARROLLO])];
}

function origenDe(valor: string | undefined): string | null {
  if (!valor || valor === 'null') return null;
  try {
    return new URL(valor).origin;
  } catch {
    return null;
  }
}

export function peticionDeOrigenAdmitido(
  req: Pick<Request, 'method' | 'path' | 'headers'>,
  admitidos: string[],
): boolean {
  if (METODOS_SEGUROS.has(req.method.toUpperCase())) return true;
  if (RUTAS_DE_SERVIDOR.some((ruta) => ruta.test(req.path))) return true;

  const cabeceraOrigin = req.headers.origin;
  const origen =
    typeof cabeceraOrigin === 'string'
      ? origenDe(cabeceraOrigin)
      : origenDe(typeof req.headers.referer === 'string' ? req.headers.referer : undefined);

  return origen !== null && admitidos.includes(origen);
}

export function filtroDeOrigen(admitidos: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (peticionDeOrigenAdmitido(req, admitidos)) {
      next();
      return;
    }
    res.status(403).json({ statusCode: 403, message: 'Origen no admitido' });
  };
}

/**
 * La misma regla para el tiempo real: una conexión de socket solo se acepta si
 * su `Origin` está en la lista. Un navegador siempre lo manda al abrirla.
 */
export function conexionDeOrigenAdmitido(origin: string | undefined, admitidos: string[]): boolean {
  const origen = origenDe(origin);
  return origen !== null && admitidos.includes(origen);
}
