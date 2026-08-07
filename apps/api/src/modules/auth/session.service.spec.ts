import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import type { CookieOptions, Response } from "express";
import { REFRESH_COOKIE, SESSION_COOKIE } from "./auth.constants";
import { SessionService } from "./session.service";

/**
 * Las cookies de sesión y el entorno.
 *
 * Esto existe porque el fallo que cubre **no da error en ninguna parte**: con
 * `SameSite=Lax` en producción el navegador descarta la cookie en cada petición
 * cross-site del tablero sin avisar, y lo que se ve es un 401 en todas las
 * rutas justo después de un login que pareció ir bien. No hay nada que mirar en
 * los logs del servidor: la petición llega, simplemente llega sin cookie.
 */
describe("SessionService — cookies", () => {
  /** Captura lo que el servicio pasa a `res.cookie`, por nombre de cookie. */
  function respuestaFalsa() {
    const puestas = new Map<string, CookieOptions>();
    const borradas = new Map<string, CookieOptions>();

    const res = {
      cookie: jest.fn((nombre: string, _valor: string, opciones: CookieOptions) => {
        puestas.set(nombre, opciones);
      }),
      clearCookie: jest.fn((nombre: string, opciones: CookieOptions) => {
        borradas.set(nombre, opciones);
      }),
    } as unknown as Response;

    return { res, puestas, borradas };
  }

  function servicio(nodeEnv: string) {
    const config = { get: (clave: string) => (clave === "NODE_ENV" ? nodeEnv : undefined) };
    const jwt = new JwtService({ secret: "secreto-de-prueba" });
    return new SessionService(jwt, config as unknown as ConfigService);
  }

  const usuario = { id: "u1", email: "quien@ejemplo.com" };

  describe("en producción", () => {
    it("emite las dos cookies con SameSite=None y Secure", async () => {
      const { res, puestas } = respuestaFalsa();

      await servicio("production").issue(res, usuario);

      for (const nombre of [SESSION_COOKIE, REFRESH_COOKIE]) {
        const opciones = puestas.get(nombre);
        expect(opciones).toBeDefined();
        // `None` es lo que hace que la cookie viaje de Vercel a Cloud Run.
        expect(opciones?.sameSite).toBe("none");
        // Y el navegador rechaza `None` sin `Secure`, así que van juntas.
        expect(opciones?.secure).toBe(true);
        expect(opciones?.httpOnly).toBe(true);
        expect(opciones?.path).toBe("/");
      }
    });

    it("borra con las mismas señas con las que puso, o el logout no borra nada", () => {
      const { res, borradas } = respuestaFalsa();

      servicio("production").clear(res);

      for (const nombre of [SESSION_COOKIE, REFRESH_COOKIE]) {
        const opciones = borradas.get(nombre);
        // Un `clearCookie` con otro `sameSite`/`secure`/`path` no identifica la
        // misma cookie: el navegador la deja donde estaba y la sesión sobrevive
        // a su propio cierre.
        expect(opciones?.sameSite).toBe("none");
        expect(opciones?.secure).toBe(true);
        expect(opciones?.path).toBe("/");
        // Sin `maxAge`: es lo que distingue borrar de volver a poner.
        expect(opciones).not.toHaveProperty("maxAge");
      }
    });
  });

  describe("en desarrollo", () => {
    it("se queda en Lax y sin Secure", async () => {
      const { res, puestas } = respuestaFalsa();

      await servicio("development").issue(res, usuario);

      const opciones = puestas.get(SESSION_COOKIE);
      // Por el proxy de Vite el frontend es mismo origen: `None` no hace falta.
      expect(opciones?.sameSite).toBe("lax");
      // Y `Secure` sobre http://localhost dejaría la cookie sin guardar.
      expect(opciones?.secure).toBe(false);
    });
  });

  it("las dos cookies caducan distinto: el refresco dura más que el acceso", async () => {
    const { res, puestas } = respuestaFalsa();

    await servicio("production").issue(res, usuario);

    const acceso = puestas.get(SESSION_COOKIE)?.maxAge ?? 0;
    const refresco = puestas.get(REFRESH_COOKIE)?.maxAge ?? 0;
    expect(refresco).toBeGreaterThan(acceso);
  });
});
