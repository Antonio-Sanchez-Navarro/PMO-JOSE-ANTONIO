import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clienteSocket, type Socket as ClienteSocket } from 'socket.io-client';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE, TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH } from '../auth/auth.constants';
import { SessionService } from '../auth/session.service';
import { SESSION_EVENTS, TasksGateway } from './tasks.gateway';

/**
 * Los tres casos del contrato del socket, **provocados de verdad**.
 *
 * **Por qué esta prueba usa un servidor y un cliente reales en vez de dobles.**
 * Lo que se estaba arreglando no era una rama de código, era *qué evento ve el
 * navegador*. Antes, el rechazo ocurría dentro de `handleConnection` con un
 * `client.disconnect()`: la conexión **se establecía y luego se caía**, y eso
 * desde el cliente es un `connect` seguido de un `disconnect` — indistinguible
 * de que se vaya el wifi. Por eso el frontend reconectaba sin fin y no tenía
 * manejador de `connect_error`: **ese evento no llegaba a dispararse nunca**.
 *
 * Con dobles se puede comprobar que llamamos a `next(err)`, pero no que
 * `connect_error` llegue al otro lado con el código dentro, que es justo lo que
 * @Gravity va a programar. Así que aquí se levanta socket.io de verdad, se
 * conecta un cliente de verdad y se leen los eventos que recibe.
 *
 * El token caducado también es real: se firma con `expiresIn` negativo, que es
 * la forma honesta de provocarlo sin esperar quince minutos ni falsear relojes.
 */
describe('TasksGateway · el contrato del handshake, de punta a punta', () => {
  const SECRETO = 'secreto-de-prueba';
  const USUARIO = 'u1';

  let httpServer: HttpServer;
  let server: Server;
  let gateway: TasksGateway;
  let jwt: JwtService;
  let puerto: number;
  const abiertos: ClienteSocket[] = [];

  beforeAll(async () => {
    jwt = new JwtService({ secret: SECRETO });
    const session = new SessionService(jwt, { get: () => undefined } as unknown as ConfigService);

    gateway = new TasksGateway(session);

    httpServer = createServer();
    server = new Server(httpServer);
    gateway.server = server;
    gateway.afterInit(server);
    server.on('connection', (socket) => gateway.handleConnection(socket));

    await new Promise<void>((listo) => httpServer.listen(0, listo));
    puerto = (httpServer.address() as AddressInfo).port;
  });

  afterEach(() => {
    while (abiertos.length) abiertos.pop()?.disconnect();
  });

  afterAll(async () => {
    await server.close();
    await new Promise<void>((listo) => httpServer.close(() => listo()));
  });

  function conectar(cookie?: string): ClienteSocket {
    const cliente = clienteSocket(`http://localhost:${puerto}`, {
      transports: ['websocket'],
      reconnection: false,
      ...(cookie ? { extraHeaders: { cookie } } : {}),
    });
    abiertos.push(cliente);
    return cliente;
  }

  /** Espera al primero de los dos desenlaces posibles del handshake. */
  function desenlace(cliente: ClienteSocket): Promise<{ ok: boolean; codigo?: string }> {
    return new Promise((resolve) => {
      cliente.on('connect', () => resolve({ ok: true }));
      cliente.on('connect_error', (err: Error & { data?: { codigo?: string } }) =>
        resolve({ ok: false, codigo: err.data?.codigo }),
      );
    });
  }

  const firmar = (opciones: { expiresIn: string | number; typ?: string }) =>
    jwt.signAsync(
      { sub: USUARIO, email: 'a@b.c', typ: opciones.typ ?? TOKEN_TYPE_ACCESS },
      { secret: SECRETO, expiresIn: opciones.expiresIn },
    );

  it('cookie válida → conecta y entra en su sala', async () => {
    const token = await firmar({ expiresIn: '15m' });

    const resultado = await desenlace(conectar(`${SESSION_COOKIE}=${token}`));

    expect(resultado).toEqual({ ok: true });
    // La sala existe y es la del usuario: los eventos no salen de su dueño.
    expect(server.sockets.adapter.rooms.get(USUARIO)?.size).toBe(1);
  });

  it('sin cookie → connect_error con SESION_INVALIDA', async () => {
    const resultado = await desenlace(conectar());

    expect(resultado.ok).toBe(false);
    expect(resultado.codigo).toBe('SESION_INVALIDA');
  });

  it('token caducado → connect_error con SESION_CADUCADA', async () => {
    // El caso que importa: el cliente debe refrescar y reconectar **sin
    // molestar al usuario**, no mandarlo al login.
    const token = await firmar({ expiresIn: '-10s' });

    const resultado = await desenlace(conectar(`${SESSION_COOKIE}=${token}`));

    expect(resultado.ok).toBe(false);
    expect(resultado.codigo).toBe('SESION_CADUCADA');
  });

  it('un token de refresco no abre un socket, y no cuenta como caducado', async () => {
    // Está vivo: lo que falla es el `typ`. Refrescar no lo arreglaría, así que
    // tiene que salir como INVALIDA.
    const token = await firmar({ expiresIn: '30d', typ: TOKEN_TYPE_REFRESH });

    const resultado = await desenlace(conectar(`${SESSION_COOKIE}=${token}`));

    expect(resultado.ok).toBe(false);
    expect(resultado.codigo).toBe('SESION_INVALIDA');
  });

  it('con la revalidación apagada, un token caducado NO cierra el socket', async () => {
    // Es el comportamiento vigente desde el 2026-08-22 y **está elegido, no
    // heredado**: cerrar el socket contra un cliente que no escucha el cierre
    // producía una reconexión cada ~5 s por pestaña, unas 17.000 al día, cada
    // una despertando Cloud Run. La mitad servidor sola convertía un fallo
    // ocasional en uno garantizado.
    //
    // Esta prueba existe para que apagarlo sea una decisión visible: si alguien
    // enciende `REVALIDACION_ACTIVA` sin la mitad del cliente, esto salta.
    const token = await firmar({ expiresIn: 1 });
    const cliente = conectar(`${SESSION_COOKIE}=${token}`);

    await desenlace(cliente);

    const cerroSolo = await new Promise<boolean>((resolve) => {
      cliente.on(SESSION_EVENTS.rechazada, () => resolve(true));
      setTimeout(() => resolve(false), 3_000);
    });

    expect(cerroSolo).toBe(false);
    expect(cliente.connected).toBe(true);
  }, 10_000);

  // ⏸️ Dormida a propósito, no rota. Es la guarda de la revalidación periódica:
  // el día que `apps/web` escuche `SESSION_EVENTS.rechazada`, se pone
  // `REVALIDACION_ACTIVA = true`, se cambia este `it.skip` por `it` y se borra
  // la prueba de arriba. Se queda escrita para que reencender sea cambiar dos
  // líneas y no reconstruir la prueba que demostraba que funcionaba.
  it.skip('el socket no sobrevive a su propio token: avisa y cierra al caducar', async () => {
    // Antes se validaba una sola vez en el handshake y el socket vivía
    // indefinidamente: uno abierto toda la noche seguía recibiendo eventos con
    // una sesión caducada hacía horas.
    const token = await firmar({ expiresIn: 1 });
    const cliente = conectar(`${SESSION_COOKIE}=${token}`);

    await desenlace(cliente);

    const aviso = await new Promise<{ codigo?: string }>((resolve) => {
      cliente.on(SESSION_EVENTS.rechazada, resolve);
    });

    expect(aviso.codigo).toBe('SESION_CADUCADA');
  }, 15_000);
});
