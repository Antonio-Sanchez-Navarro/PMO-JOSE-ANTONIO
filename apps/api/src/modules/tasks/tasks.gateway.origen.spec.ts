import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as cliente, type Socket as SocketCliente } from 'socket.io-client';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { TasksGateway, permitirConexion } from './tasks.gateway';

const FRONT = 'https://app.ejemplo.test';
const AJENO = 'https://otro.ejemplo.test';

/**
 * Un servidor socket.io de verdad con el `allowRequest` del gateway, y clientes
 * que se conectan por WebSocket con un `Origin` u otro.
 */
describe('TasksGateway · qué conexiones de socket se aceptan', () => {
  const envAntes = { ...process.env };
  let http: HttpServer;
  let io: Server;
  let url: string;
  const abiertos: SocketCliente[] = [];

  beforeAll(async () => {
    process.env.WEB_URL = FRONT;
    delete process.env.WEB_URL_EXTRA;
    process.env.NODE_ENV = 'production';
    http = createServer();
    io = new Server(http, { allowRequest: permitirConexion, transports: ['websocket'] });
    io.on('connection', (s) => s.emit('hola', 'dentro'));
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    abiertos.forEach((s) => s.close());
    await new Promise<void>((r) => io.close(() => r()));
    process.env = envAntes;
  });

  /** Intenta conectar y dice si entró (y recibió el evento) o fue rechazado. */
  const conectar = (origin?: string) =>
    new Promise<'dentro' | 'rechazado'>((resolver) => {
      const s = cliente(url, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: origin ? { origin } : {},
      });
      abiertos.push(s);
      s.on('hola', () => resolver('dentro'));
      s.on('connect_error', () => resolver('rechazado'));
    });

  it('un cliente con el Origin del frontend entra y recibe eventos', async () => {
    expect(await conectar(FRONT)).toBe('dentro');
  });

  it('un cliente con un Origin ajeno es rechazado', async () => {
    expect(await conectar(AJENO)).toBe('rechazado');
  });

  it('un cliente sin Origin es rechazado', async () => {
    expect(await conectar()).toBe('rechazado');
  });

  it('el gateway de verdad lleva esta comprobación', () => {
    const opciones = Reflect.getMetadata(GATEWAY_OPTIONS, TasksGateway) as { allowRequest?: unknown };
    expect(opciones.allowRequest).toBe(permitirConexion);
  });
});
