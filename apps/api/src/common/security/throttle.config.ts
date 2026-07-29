import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Límite de peticiones por IP.
 *
 * No es defensa contra un ataque distribuido —para eso hace falta algo delante
 * de la aplicación— sino contra las tres formas realistas de hacer daño desde
 * un solo sitio: probar contraseñas, disparar el gasto de tokens del copiloto y
 * un bucle del frontend que se lleve la base por delante.
 *
 * **Un solo cubo, y las rutas que necesitan otro lo pisan por su nombre.**
 * Esto se escribió primero con tres cubos con nombre —`general`, `copilot`,
 * `auth`— y estaba mal: cada cubo declarado aquí se aplica a **todas** las
 * rutas, así que el más estrecho gobernaba la API entera y el copiloto cortaba
 * a las 10 peticiones en vez de a las 20. Comprobado contra la app: 10 y luego
 * 429 en todas partes, incluido el webhook que debía estar exento.
 */
export const THROTTLE_OPTIONS: ThrottlerModuleOptions = [
  {
    /**
     * Holgado a propósito: el tablero hace ráfagas legítimas —al arrastrar una
     * tarjeta salen varias peticiones seguidas— y un límite estrecho rompería
     * la interfaz antes que a un atacante.
     */
    name: 'default',
    ttl: 60_000,
    limit: 240,
  },
];

/**
 * El copiloto es el único sitio donde una petición cuesta dinero de verdad:
 * cada turno son tokens del modelo. 20 por minuto es más de lo que teclea una
 * persona y muy poco para un bucle.
 */
export const THROTTLE_COPILOT = { default: { ttl: 60_000, limit: 20 } };

/**
 * Autenticación: estrecho porque es donde se prueban contraseñas y donde un
 * intento legítimo es raro. El `/refresh` entra en el mismo cubo a propósito —
 * la sesión dura 15 minutos, así que un cliente sano lo llama cuatro veces por
 * hora; si choca con el límite, lo que hay es un bucle de refresco.
 */
export const THROTTLE_AUTH = { default: { ttl: 60_000, limit: 10 } };
