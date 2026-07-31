import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger as NestLogger } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger as PinoNestLogger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  /**
   * `bufferLogs` retiene lo que se registre durante el arranque hasta que pino
   * esté en pie. Sin esto, todo lo anterior a `useLogger` sale con el formato
   * de Nest —texto de colores— y en Cloud Logging cada línea entra como
   * `DEFAULT` y sin estructura. Justo los mensajes de arranque, que son los que
   * se miran cuando un despliegue no levanta.
   */
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  /**
   * A partir de aquí, **los 33 `new Logger(...)` que ya había en el proyecto
   * escriben por pino sin que haya que tocar ninguno**: `nestjs-pino` implementa
   * el `LoggerService` de Nest, así que el cambio es este renglón y no una
   * edición en 32 archivos.
   */
  app.useLogger(app.get(PinoNestLogger));
  app.flushLogs();

  /**
   * Sin esto, el `onModuleDestroy` de `PrismaService` **no se ejecuta nunca**:
   * Cloud Run manda `SIGTERM` y el proceso muere con las conexiones abiertas y
   * las peticiones en vuelo cortadas a medias. Con los hooks, Nest cierra los
   * módulos en orden y da tiempo a terminar lo que estaba servido.
   */
  app.enableShutdownHooks();

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
  NestLogger.log(`PMO API escuchando en http://localhost:${port}`, "Bootstrap");
}
bootstrap();
