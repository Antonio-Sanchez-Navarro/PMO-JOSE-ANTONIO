import { Module } from "@nestjs/common";

// Módulos de dominio (implementar por sprint — ver TASKS.md):
// import { AuthModule } from "./modules/auth/auth.module";
// import { GmailModule } from "./modules/gmail/gmail.module";
// import { TasksModule } from "./modules/tasks/tasks.module";
// import { AiModule } from "./modules/ai/ai.module";
// import { CopilotModule } from "./modules/copilot/copilot.module";
// import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
// import { TimeTrackingModule } from "./modules/time-tracking/time-tracking.module";

@Module({
  imports: [
    // AuthModule, GmailModule, TasksModule, AiModule,
    // CopilotModule, WhatsappModule, TimeTrackingModule,
  ],
})
export class AppModule {}
