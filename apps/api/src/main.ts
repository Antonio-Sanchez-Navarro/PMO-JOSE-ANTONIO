import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe, Logger as NestLogger } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger as PinoNestLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { avisoDeConfiguracion } from "./common/observability/logger.config";

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

  /**
   * Lo que esté a medias en la configuración de logs se dice al arrancar, igual
   * que el transporte de correo del copiloto. Una capacidad que se apaga en
   * silencio se descubre el día que hace falta, que es el peor.
   */
  const aviso = avisoDeConfiguracion({
    NODE_ENV: config.get<string>("NODE_ENV"),
    LOG_FORMAT: config.get<string>("LOG_FORMAT"),
    GOOGLE_CLOUD_PROJECT: config.get<string>("GOOGLE_CLOUD_PROJECT"),
  });
  if (aviso) NestLogger.warn(aviso, "Observabilidad");

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

  /**
   * `PORT` delante de `API_PORT`, y no es un capricho de orden.
   *
   * Cloud Run **inyecta `PORT`** y espera que el contenedor escuche justo ahí:
   * si el proceso abre otro puerto, la revisión no pasa la sonda de arranque y
   * el despliegue se revierte con un error que habla de contenedor que no
   * arranca, no de puerto equivocado. `API_PORT` se queda para el desarrollo
   * local, donde es el nombre que usan `.env` y la documentación.
   */
  const port = config.get<number>("PORT") ?? config.get<number>("API_PORT") ?? 3000;

  /**
   * Y la interfaz explícita: dentro de un contenedor, escuchar solo en el bucle
   * local deja el puerto abierto para el propio proceso y cerrado para todo lo
   * demás, que es la otra mitad del mismo fallo.
   */
  await app.listen(port, "0.0.0.0");
  NestLogger.log(`PMO API escuchando en el puerto ${port}`, "Bootstrap");
}
bootstrap();
