import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { LlmFactory, LLM_STRATEGIES } from './llm/llm.factory';
import { AnthropicStrategy } from './llm/anthropic.strategy';
import { GoogleStrategy } from './llm/google.strategy';
import { AuthModule } from '../auth/auth.module';

/**
 * Copiloto de IA (Sprint 6).
 *
 * **Aquí y solo aquí se dice qué proveedores existen.** La lista que se
 * inyecta bajo `LLM_STRATEGIES` es el registro completo: añadir uno es escribir
 * su estrategia y sumarla a estas dos líneas — ni la fábrica, ni el servicio,
 * ni el controlador se enteran.
 */
@Module({
  // `AuthModule` porque el controlador va tras el `AuthGuard`; `ConfigModule`
  // porque cada estrategia lee su credencial y sus ids de modelo.
  imports: [AuthModule, ConfigModule],
  controllers: [CopilotController],
  providers: [
    CopilotService,
    LlmFactory,
    AnthropicStrategy,
    GoogleStrategy,
    {
      provide: LLM_STRATEGIES,
      useFactory: (anthropic: AnthropicStrategy, google: GoogleStrategy) => [anthropic, google],
      inject: [AnthropicStrategy, GoogleStrategy],
    },
  ],
})
export class CopilotModule {}
