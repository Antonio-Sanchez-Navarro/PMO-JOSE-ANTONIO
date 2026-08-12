import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';
import { ConfigService } from '@nestjs/config';
import { LlmFactory, LLM_STRATEGIES } from './llm/llm.factory';
import { AnthropicStrategy } from './llm/anthropic.strategy';
import { GoogleStrategy } from './llm/google.strategy';
import { EMAIL_SENDER, GmailSender, MockSender } from './email/email-sender';
import { ChatThreadsService } from './threads/chat-threads.service';
import { CopilotContextService } from './context/copilot-context.service';
import { CopilotAuditService } from './audit/copilot-audit.service';
import { ToolRunnerService } from './tools/tool-runner.service';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { MetricsModule } from '../metrics/metrics.module';

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
  // `TasksModule` porque crear una tarea desde el copiloto reutiliza
  // `TasksService`: ahí viven el escalado de prioridad, el nacer en `OVERDUE` y
  // el aviso por socket al tablero. Duplicarlo aquí divergiría.
  // `MetricsModule` por lo mismo con `get_metrics`: los números del panel se
  // cuentan en un solo sitio y aquí solo se pide la proyección compacta.
  imports: [AuthModule, ConfigModule, TasksModule, MetricsModule],
  controllers: [CopilotController],
  providers: [
    CopilotService,
    ChatThreadsService,
    CopilotContextService,
    CopilotAuditService,
    ToolRunnerService,
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
       * **Por defecto SIMULADO, y hay que pedir el envío real por su nombre**
       * (`COPILOT_EMAIL_TRANSPORT=real` o `=smtp`). Cualquier otra cosa —vacía,
       * ausente o un valor que no se reconoce— se queda en simulado.
       *
       * Hasta el 2026-08-12 era al revés: el valor por defecto era Gmail y solo
       * `=mock` lo apagaba. Se invirtió porque el modo peligroso no puede ser el
       * que sale de no hacer nada. Esa variable **no llegó a producción** —el
       * pipeline la borraba en cada despliegue, y sigue siendo opcional—, así
       * que durante días bastaba un clic en «Enviar» para que saliera un correo
       * auténtico a un destinatario real. Un fallo por olvido debe caer del lado
       * que no se puede deshacer, y un correo enviado no se recoge.
       *
       * De ahí que se comparen los valores que **encienden** el envío en vez de
       * los que lo apagan: la lista de lo que envía de verdad es cerrada y corta;
       * la de lo que no, es infinita. Un `=reall` con un dedazo se queda en
       * simulado y lo dice, en vez de salir a la calle.
       *
       * Se decide al arrancar y se deja dicho en el log, porque «creía que
       * estaba en simulado» es un error que solo se descubre cuando el correo
       * ya llegó.
       */
      provide: EMAIL_SENDER,
      useFactory: (config: ConfigService, gmail: GmailSender, mock: MockSender) => {
        const TRANSPORTES_REALES = ['real', 'smtp'];

        const configurado = (config.get<string>('COPILOT_EMAIL_TRANSPORT') ?? '').trim();
        const enviaDeVerdad = TRANSPORTES_REALES.includes(configurado.toLowerCase());

        const registro = new Logger('CopilotEmail');

        if (enviaDeVerdad) {
          registro.warn(
            `Transporte de correo: Gmail (COPILOT_EMAIL_TRANSPORT=${configurado}) — los envíos salen de verdad`,
          );
        } else {
          // El valor no reconocido se avisa aparte: el resultado es el seguro,
          // pero quien escribió algo esperaba que hiciera *algo*, y callarlo
          // deja a alguien creyendo que configuró un transporte que no existe.
          if (configurado !== '' && configurado.toLowerCase() !== 'mock') {
            registro.warn(
              `COPILOT_EMAIL_TRANSPORT="${configurado}" no es un transporte conocido; ` +
                `se usa el simulado. Para enviar de verdad: ${TRANSPORTES_REALES.join(' o ')}.`,
            );
          }

          registro.log('Transporte de correo: SIMULADO (no se envía nada)');
        }

        return enviaDeVerdad ? gmail : mock;
      },
      inject: [ConfigService, GmailSender, MockSender],
    },
  ],
})
export class CopilotModule {}
