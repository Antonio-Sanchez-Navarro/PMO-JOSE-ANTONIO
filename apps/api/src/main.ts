import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(cookieParser());

  /**
   * Cabeceras de seguridad (Sprint 8).
   *
   * `contentSecurityPolicy` se desactiva porque esta aplicación **solo sirve
   * JSON y streams SSE**: no devuelve HTML, así que una CSP aquí no protege
   * nada y sí puede estorbar. La del frontend la pone quien sirva la SPA.
   *
   * `crossOriginResourcePolicy` en `cross-origin` porque el frontend vive en
   * otro puerto (5173 en desarrollo) y el valor por defecto de Helmet
   * —`same-origin`— bloquearía sus peticiones.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.enableCors({
    origin: config.get<string>("WEB_URL") ?? "http://localhost:5173",
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = config.get<number>("API_PORT") ?? 3000;
  await app.listen(port);
  Logger.log(`PMO API escuchando en http://localhost:${port}`, "Bootstrap");
}
bootstrap();
