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

  // ⏰ **Despertada el 2026-08-25**, al encender `REVALIDACION_ACTIVA`.
  //
  // Aquí vivía su contraria —«con la revalidación apagada, un token caducado NO
  // cierra el socket»—, que fijaba el comportamiento del 08-22 para que apagarlo
  // fuera una decisión visible. Ya no describe el mundo, así que se retira: dos
  // pruebas que se contradicen no son más cobertura, son una que miente.
  //
  // Se retira **aquí y no en otro sitio** porque es donde estaba escrito que
  // había que retirarla. Lo dejó dicho quien la escribió, y el encargo de hoy no
  // lo mencionaba: al encender sin borrarla, la suite se pone roja.
  it('el socket no sobrevive a su propio token: avisa y cierra al caducar', async () => {
    // Antes se validaba una sola vez en el handshake y el socket vivía
    // indefinidamente: uno abierto toda la noche seguía recibiendo eventos con
    // una sesión caducada hacía horas.
    const token = await firmar({ expiresIn: 1 });
    const cliente = conectar(`${SESSION_COOKIE}=${token}`);

    await desenlace(cliente);

    // ⚠️ **Esta espera dura ~6 s de reloj de pared por diseño**: 1 s de token
    // más los 5 s de `MARGEN_DE_RELOJ_MS`. No se puede acortar sin hacer
    // configurable ese margen, que es código de producción.
    //
    // Y por eso lleva **30 s y no 15**: con 15 se cayó en CI el 2026-08-25
    // —`Exceeded timeout of 15000 ms`— mientras en local pasaba tres de tres.
    // La diferencia no es el código: **en CI jest reparte las 36 suites entre
    // varios workers y el `setTimeout` del gateway compite por CPU**, así que
    // seis segundos de reloj se estiran. En local, con `--runInBand`, no compite
    // con nadie. Es la trampa de siempre del revés: verde donde miramos.
    //
    // El corte propio está para que, si el aviso no llega, el fallo diga **qué**
    // no pasó en vez del error genérico de jest — que además señalaba la línea
    // equivocada y me mandó a mirar una prueba que no era.
    // El corte **se cancela al ganar la carrera**. Sin ese `clearTimeout`, el
    // temporizador de 20 s sigue vivo cuando la prueba ya terminó y jest avisa
    // con «Jest did not exit one second after the test run has completed» —
    // exactamente lo que me salió al escribir esto sin limpiarlo. Un vigía que
    // sobrevive a lo que vigilaba es un recurso colgando.
    let corte: NodeJS.Timeout | undefined;

    const aviso = await Promise.race([
      new Promise<{ codigo?: string }>((resolve) => {
        cliente.on(SESSION_EVENTS.rechazada, resolve);
      }),
      new Promise<never>((_, reject) => {
        corte = setTimeout(
          () =>
            reject(
              new Error(
                'No llegó SESSION_EVENTS.rechazada en 20 s: ¿REVALIDACION_ACTIVA está apagada?',
              ),
            ),
          20_000,
        );
      }),
    ]).finally(() => clearTimeout(corte));

    expect(aviso.codigo).toBe('SESION_CADUCADA');
  }, 30_000);
});
