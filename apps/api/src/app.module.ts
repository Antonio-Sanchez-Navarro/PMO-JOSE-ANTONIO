import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from "./common/prisma/prisma.module";
import { CryptoModule } from "./common/crypto/crypto.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { GmailModule } from "./modules/gmail/gmail.module";
import { AiModule } from "./modules/ai/ai.module";
import { EmailsModule } from "./modules/emails/emails.module";
import { OverdueModule } from "./modules/overdue/overdue.module";
import { DeadLetterModule } from "./common/bullmq/dead-letter.module";

// Módulos de dominio (se implementan por sprint — ver TASKS.md):
import { TasksModule } from "./modules/tasks/tasks.module";
// import { AiModule } from "./modules/ai/ai.module";
// import { CopilotModule } from "./modules/copilot/copilot.module";
// import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
// import { TimeTrackingModule } from "./modules/time-tracking/time-tracking.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Lee el .env de la raíz del monorepo (y un .env local si existiera).
      envFilePath: ["../../.env", ".env"],
    }),
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
})
export class AppModule {}
