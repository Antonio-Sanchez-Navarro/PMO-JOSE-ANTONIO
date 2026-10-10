import { Body, Controller, Get, Module, Post, Redirect } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configurarPeticiones } from './configurar-peticiones';
import { peticionDeOrigenAdmitido } from './origen-de-peticion';

const FRONT = 'https://app.ejemplo.test';
const AJENO = 'https://otro.ejemplo.test';

@Controller()
class EcoController {
  @Post('api/eco')
  eco(@Body() cuerpo: unknown) {
    return { cuerpo };
  }

  @Get('api/auth/google')
  @Redirect('https://accounts.google.com/o/oauth2/v2/auth', 302)
  login() {
    return undefined;
  }

  @Post('webhooks/gmail')
  webhook() {
    return { ok: true };
  }
}

@Module({ controllers: [EcoController] })
class EcoModule {}

/** Una app Nest de verdad, con la misma configuración que `main.ts`. */
describe('configurarPeticiones', () => {
  let app: NestExpressApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(EcoModule, { bodyParser: false, logger: false });
    configurarPeticiones(app, FRONT, true);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (ruta: string, cuerpo: string, cabeceras: Record<string, string>) =>
    fetch(`${base}${ruta}`, { method: 'POST', body: cuerpo, headers: cabeceras, redirect: 'manual' });

  it('acepta JSON desde el frontend', async () => {
    const r = await post('/api/eco', '{"a":1}', { origin: FRONT, 'content-type': 'application/json' });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ cuerpo: { a: 1 } });
  });

  it('rechaza una petición que escribe con un Origin ajeno', async () => {
    const r = await post('/api/eco', '{"a":1}', { origin: AJENO, 'content-type': 'application/json' });
    expect(r.status).toBe(403);
  });

  it('un cuerpo de formulario no se lee aunque venga del frontend: solo JSON', async () => {
    const r = await post('/api/eco', 'a=1&b=2', {
      origin: FRONT,
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(await r.json()).toEqual({ cuerpo: {} });
  });

  it('sin Origin vale el Referer del frontend; sin ninguno de los dos, no', async () => {
    const conReferer = await post('/api/eco', '{}', { referer: `${FRONT}/tablero`, 'content-type': 'application/json' });
    expect(conReferer.status).toBe(201);

    const sinNada = await post('/api/eco', '{}', { 'content-type': 'application/json' });
    expect(sinNada.status).toBe(403);
  });

  it('el login con Google sigue funcionando: GET y redirección, desde donde sea', async () => {
    const r = await fetch(`${base}/api/auth/google`, { redirect: 'manual', headers: { origin: AJENO } });
    expect(r.status).toBe(302);
  });

  it('las rutas de servidor a servidor no dependen del Origin (llevan su propio token)', async () => {
    const r = await post('/webhooks/gmail', '{}', { 'content-type': 'application/json' });
    expect(r.status).toBe(201);
  });
});

describe('peticionDeOrigenAdmitido', () => {
  const req = (method: string, headers: Record<string, string>, path = '/api/tasks') => ({ method, path, headers });

  it('un Origin «null» no vale', () => {
    expect(peticionDeOrigenAdmitido(req('POST', { origin: 'null' }), [FRONT])).toBe(false);
  });

  it('compara el origen exacto, no un prefijo', () => {
    expect(peticionDeOrigenAdmitido(req('POST', { origin: `${FRONT}.otro.test` }), [FRONT])).toBe(false);
    expect(peticionDeOrigenAdmitido(req('DELETE', { referer: `${FRONT}.otro.test/x` }), [FRONT])).toBe(false);
  });

  it('PATCH, PUT y DELETE también se filtran', () => {
    for (const m of ['PATCH', 'PUT', 'DELETE']) {
      expect(peticionDeOrigenAdmitido(req(m, { origin: AJENO }), [FRONT])).toBe(false);
      expect(peticionDeOrigenAdmitido(req(m, { origin: FRONT }), [FRONT])).toBe(true);
    }
  });
});
