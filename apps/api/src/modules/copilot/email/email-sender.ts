import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { AuthService } from '../../auth/auth.service';
import { SendEmailDto } from '../dto/send-email.dto';
import { buildRawMessage } from './mime';

/** Token del emisor activo: lo resuelve `copilot.module.ts` según el entorno. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/** Lo que devuelve un envío, sea real o simulado. */
export interface SendResult {
  /** Id del mensaje en Gmail, o `null` cuando el envío fue simulado. */
  id: string | null;
  threadId: string | null;
  /** Qué transporte lo despachó. Viaja en la respuesta para que la interfaz pueda avisar. */
  transport: 'gmail' | 'mock';
}

export interface EmailSender {
  send(userId: string, dto: SendEmailDto): Promise<SendResult>;
}

/**
 * Envía de verdad, como el propio usuario, por la API de Gmail.
 *
 * El scope `gmail.send` se concede desde el Sprint 1 y las credenciales salen
 * de `AuthService.getAuthorizedClient(userId)`, que es el único sitio donde se
 * renueva el token de Google: construir aquí un `OAuth2Client` propio
 * duplicaría esa lógica y se quedaría sin refrescar.
 */
@Injectable()
export class GmailSender implements EmailSender {
  private readonly logger = new Logger(GmailSender.name);

  constructor(private readonly auth: AuthService) {}

  async send(userId: string, dto: SendEmailDto): Promise<SendResult> {
    const client = await this.auth.getAuthorizedClient(userId);
    // `googleapis-common` ancla su propia copia de google-auth-library. Su
    // `OAuth2Client` y el nuestro solo difieren en una propiedad privada, así
    // que TypeScript los ve como tipos distintos aunque en runtime sean el
    // mismo objeto. Mismo cast acotado que en `gmail.service.ts`.
    const gmail = google.gmail({ version: 'v1', auth: client as never });

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: buildRawMessage(dto) },
    });

    this.logger.log(
      `Correo enviado a ${dto.to.join(', ')} (${res.data.id}): "${dto.subject}"`,
    );

    return { id: res.data.id ?? null, threadId: res.data.threadId ?? null, transport: 'gmail' };
  }
}

/**
 * No envía: deja constancia en el log y responde como si hubiera enviado.
 *
 * Existe para que se pueda montar y probar la tarjeta de borrador sin que cada
 * clic en "Enviar" salga a la calle. **Es el transporte por defecto** desde el
 * 2026-08-12: se usa salvo que `COPILOT_EMAIL_TRANSPORT` pida explícitamente
 * `real` o `smtp`. La respuesta lleva `transport: "mock"` para que la interfaz
 * pueda decirlo en vez de dar por enviado lo que no salió.
 */
@Injectable()
export class MockSender implements EmailSender {
  private readonly logger = new Logger(MockSender.name);

  async send(userId: string, dto: SendEmailDto): Promise<SendResult> {
    this.logger.warn(
      `SIMULADO (no se envió nada) → para: ${dto.to.join(', ')}` +
        (dto.cc?.length ? ` · cc: ${dto.cc.join(', ')}` : '') +
        ` · asunto: "${dto.subject}" · ${dto.body.length} caracteres de cuerpo`,
    );

    return { id: null, threadId: null, transport: 'mock' };
  }
}
