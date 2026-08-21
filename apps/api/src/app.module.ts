import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { THROTTLE_OPTIONS } from "./common/security/throttle.config";
import { buildLoggerParams } from "./common/observability/logger.config";
import { AllExceptionsFilter } from "./common/observability/all-exceptions.filter";
import { PrismaModule } from "./common/prisma/prisma.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { GmailModule } from "./modules/gmail/gmail.module";
import { AiModule } from "./modules/ai/ai.module";
import { EmailsModule } from "./modules/emails/emails.module";
import { OverdueModule } from "./modules/overdue/overdue.module";
import { DeadLetterModule } from "./common/bullmq/dead-letter.module";
import { TagsModule } from './modules/tags/tags.module';
import { TimeModule } from './modules/time/time.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { CronModule } from './modules/cron/cron.module';
import { AlertModule } from './common/alerts/alert.module';

import { TasksModule } from "./modules/tasks/tasks.module";

// Lo único de dominio que falta por implementar: WhatsApp (Sprint 7), relegado
// al final de la cola por decisión de producto.
//
// Aquí había además dos importaciones comentadas que ya no describían nada:
// `AiModule` —importado de verdad quince líneas más arriba— y
// `TimeTrackingModule`, que existe desde el Sprint 5 con otro nombre
// (`TimeModule`). Un import comentado de algo que sí existe no es un recordatorio:
// es una afirmación falsa que se lee al abrir el archivo.
// import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";

@Module({
  imports: [
    /**
     * Límite de peticiones por IP (Sprint 8). Los cubos y el por qué de cada
     * uno están en `throttle.config.ts`.
     */
    ThrottlerModule.forRoot(THROTTLE_OPTIONS),
    ConfigModule.forRoot({
      isGlobal: true,
      // Lee el .env de la raíz del monorepo (y un .env local si existiera).
      envFilePath: ["../../.env", ".env"],
    }),
    /**
     * Logs estructurados (Sprint 8).
     *
     * Va **después** de `ConfigModule` porque necesita leer `LOG_FORMAT`,
     * `LOG_LEVEL` y `GOOGLE_CLOUD_PROJECT` del `.env` ya cargado. El formato y
     * el porqué de cada campo están en `common/observability/logger.config.ts`.
     */
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildLoggerParams({
          NODE_ENV: config.get<string>('NODE_ENV'),
          LOG_LEVEL: config.get<string>('LOG_LEVEL'),
          LOG_FORMAT: config.get<string>('LOG_FORMAT'),
          GOOGLE_CLOUD_PROJECT: config.get<string>('GOOGLE_CLOUD_PROJECT'),
        }),
    }),
    // Global: lo que hay que vigilar no vive en un dominio.
    AlertModule,
    PrismaModule,
    CryptoModule,
    TasksModule,
    HealthModule,
    AuthModule,
    GmailModule,
    AiModule,
    EmailsModule,
    OverdueModule,
    DeadLetterModule,
    TagsModule,
    TimeModule,
    CopilotModule,
    MetricsModule,
    // Las rutas que dispara Cloud Scheduler. Va después de OverdueModule y
    // GmailModule porque consume lo que ambos exportan.
    CronModule,
    /**
     * BullMQ. Hasta el 2026-08-21 esto declaraba **solo la conexion**, y por
     * tanto regian los valores de fabrica, que son dos malas noticias:
     *
     * - **`attempts` = 1: no habia reintento.** Y `ai.processor.ts` lanzaba con
     *   el comentario «para que BullMQ lo reintente si hay redelivery
     *   configurado». No lo habia: el comentario describia una red que nadie
     *   habia tendido, y un fallo pasajero de la IA mandaba el correo a fallidos
     *   a la primera. Sus dos vecinas (`gmail.controller.ts` y
     *   `auth.controller.ts`) si ponian `attempts: 3` en el `add`, asi que esto
     *   era un olvido y no una decision.
     * - **`removeOnComplete` = false: los trabajos completados se quedaban en
     *   Redis para siempre.** Crecimiento sin techo, y justo en Upstash, que es
     *   donde ya dolio una vez.
     *
     * Va aqui y no en cada `add` para que **una cola nueva nazca con red**, que
     * es el mismo criterio que el `ThrottlerGuard` global de mas abajo: lo que
     * depende de que alguien se acuerde, se olvida. Los `add` que ya traen sus
     * propias opciones siguen mandando sobre esto.
     */
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
        },
        defaultJobOptions: {
          // Tres intentos, los mismos que ya usaban las dos vecinas.
          attempts: 3,
          // Con espera creciente: un reintento inmediato contra un servicio
          // saturado es una segunda forma de saturarlo.
          backoff: { type: 'exponential', delay: 2_000 },
          // El techo que faltaba. Se guarda algo de historial reciente para
          // poder mirar que paso, pero acotado por numero **y** por edad.
          removeOnComplete: { count: 1_000, age: 24 * 3_600 },
          // Los fallidos duran mas -son los que se investigan- pero tampoco
          // para siempre. Los oyentes de la DLQ ya avisaron cuando ocurrieron,
          // asi que borrarlos a los 7 dias no pierde el aviso.
          removeOnFail: { count: 5_000, age: 7 * 24 * 3_600 },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    /**
     * El límite se aplica a **toda** la API, no ruta por ruta: una ruta nueva
     * nace protegida en vez de esperar a que alguien se acuerde de decorarla.
     * Donde no debe aplicarse se marca explícitamente con `@SkipThrottle()`,
     * que se lee y se revisa; un olvido, no.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    /**
     * Filtro global de excepciones. Registra cada fallo en el formato que Error
     * Reporting recoge de Cloud Logging y **delega la respuesta en el filtro de
     * Nest**, para no cambiar lo que la API devuelve hoy.
     */
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
