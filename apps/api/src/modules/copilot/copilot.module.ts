import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { ConfigService } from '@nestjs/config';
import { LlmFactory, LLM_STRATEGIES } from './llm/llm.factory';
import { AnthropicStrategy } from './llm/anthropic.strategy';
import { GoogleStrategy } from './llm/google.strategy';
import { EMAIL_SENDER, GmailSender, MockSender } from './email/email-sender';
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
    GmailSender,
    MockSender,
    {
      /**
       * Qué transporte despacha los correos.
       *
       * Por defecto **Gmail**, que es enviar de verdad. `COPILOT_EMAIL_TRANSPORT=mock`
       * lo cambia por el simulado, que es lo que se quiere mientras se monta la
       * tarjeta del borrador: si no, cada clic en "Enviar" sale a la calle.
       *
       * Se decide al arrancar y se deja dicho en el log, porque "creía que
       * estaba en simulado" es un error que solo se descubre cuando el correo
       * ya llegó.
       */
      provide: EMAIL_SENDER,
      useFactory: (config: ConfigService, gmail: GmailSender, mock: MockSender) => {
        const simulado = config.get<string>('COPILOT_EMAIL_TRANSPORT') === 'mock';

        new Logger('CopilotEmail').log(
          simulado
            ? 'Transporte de correo: SIMULADO (no se envía nada)'
            : 'Transporte de correo: Gmail — los envíos salen de verdad',
        );

        return simulado ? mock : gmail;
      },
      inject: [ConfigService, GmailSender, MockSender],
    },
  ],
})
export class CopilotModule {}
