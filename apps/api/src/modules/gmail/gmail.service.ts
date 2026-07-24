import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { AuthService } from '../auth/auth.service';

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

  constructor(private readonly auth: AuthService) {}

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
}
