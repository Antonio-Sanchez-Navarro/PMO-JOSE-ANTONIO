import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface EmailSnippet {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getInbox(userId: string, maxResults = 20): Promise<EmailSnippet[]> {
    // `getAuthorizedClient` descifra las credenciales y se encarga de re-cifrar
    // y persistir el set cuando Google renueva el access_token.
    const auth = await this.auth.getAuthorizedClient(userId);

    // `googleapis-common` ancla su propia copia de google-auth-library (10.5.x).
    // Su `OAuth2Client` y el nuestro (10.9.x) solo difieren en una propiedad
    // privada, así que TypeScript los ve como tipos distintos aunque en runtime
    // sean el mismo objeto. El cast queda acotado a esta línea.
    const gmail = google.gmail({ version: 'v1', auth: auth as never });

    // 1. Obtener la lista de IDs de mensajes
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox',
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return [];

    // 2. Obtener los detalles de cada mensaje de forma concurrente
    const emailPromises = messages.map(async (msg) => {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata', // Solo metadata para ser rápidos (headers)
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'Desconocido';
        const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '(Sin Asunto)';
        const date = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();

        return {
          id: detail.data.id!,
          threadId: detail.data.threadId!,
          snippet: detail.data.snippet || '',
          from,
          subject,
          date,
        };
      } catch (err) {
        this.logger.warn(`Error obteniendo detalle del mensaje ${msg.id}`, err);
        return null;
      }
    });

    const results = await Promise.all(emailPromises);

    // 3. Filtrar fallos y devolver
    return results.filter((r): r is EmailSnippet => r !== null);
  }

  async watchInbox(userId: string): Promise<void> {
    const auth = await this.auth.getAuthorizedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: auth as never });
    
    const topicName = this.config.get<string>('GMAIL_PUBSUB_TOPIC');
    if (!topicName) {
      this.logger.warn('GMAIL_PUBSUB_TOPIC no está configurado. Omitiendo watchInbox.');
      return;
    }

    try {
      await gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: topicName,
        },
      });
      this.logger.log(`Bandeja de entrada observada (watch) para el usuario ${userId}`);
    } catch (err) {
      this.logger.error(`Error configurando watchInbox para ${userId}`, err);
    }
  }

  async syncHistory(userId: string): Promise<void> {
    // Aquí implementaremos la obtención de correos nuevos usando historyId.
    // Por simplicidad para este sprint, descargaremos los últimos 5 correos del inbox 
    // y los intentaremos guardar/actualizar en DB (upsert).
    this.logger.log(`Iniciando syncHistory para el usuario ${userId}`);
    
    const emails = await this.getInbox(userId, 5);
    
    let processedCount = 0;
    for (const email of emails) {
      try {
        await this.prisma.email.upsert({
          where: { gmailMessageId: email.id },
          update: {
            snippet: email.snippet,
          },
          create: {
            gmailMessageId: email.id,
            threadId: email.threadId,
            snippet: email.snippet,
            from: email.from,
            subject: email.subject,
            receivedAt: new Date(email.date),
            userId: userId,
          },
        });
        processedCount++;
      } catch (err) {
        this.logger.warn(`Error guardando correo ${email.id} en BD para usuario ${userId}`);
      }
    }
    
    this.logger.log(`Sincronizados ${processedCount} correos para ${userId}`);
  }
}
