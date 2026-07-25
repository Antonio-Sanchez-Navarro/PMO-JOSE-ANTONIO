import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { BullModule } from "@nestjs/bullmq";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { SessionService } from "./session.service";

@Module({
  imports: [
    UsersModule,
    // Para encolar `watch-inbox` tras el login sin depender de GmailModule
    // (que ya importa este módulo y provocaría un ciclo).
    BullModule.registerQueue({ name: "gmail-sync" }),
    // El `expiresIn` se define por token en SessionService (access vs refresh).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, AuthGuard],
  // Otros módulos (Gmail, Tasks…) necesitan el guard y el cliente autorizado de Google.
  exports: [AuthService, SessionService, AuthGuard],
})
export class AuthModule {}
