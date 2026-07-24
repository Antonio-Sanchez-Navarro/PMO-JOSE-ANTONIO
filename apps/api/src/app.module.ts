import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./modules/health/health.module";

// Módulos de dominio (se implementan por sprint — ver TASKS.md):
// import { AuthModule } from "./modules/auth/auth.module";
// import { GmailModule } from "./modules/gmail/gmail.module";
// import { TasksModule } from "./modules/tasks/tasks.module";
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
    HealthModule,
  ],
})
export class AppModule {}
