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

// Módulos de dominio (se implementan por sprint — ver TASKS.md):
import { TasksModule } from "./modules/tasks/tasks.module";
// import { AiModule } from "./modules/ai/ai.module";
// import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
// import { TimeTrackingModule } from "./modules/time-tracking/time-tracking.module";

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
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
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
