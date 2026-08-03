import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ClassifyEmailJob } from '../ai/classify-email.job';

export interface EmailSnippet {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  subject: string;
  date: string;
  /** Etiquetas de Gmail (`INBOX`, `UNREAD`, `CATEGORY_PROMOTIONS`, …). */
  labels: string[];
  /** Cuerpo en texto plano. Solo se llena cuando se pide `format: 'full'`. */
  bodyText?: string;
}

export interface SyncResult {
  processed: number;
  mode: 'backfill' | 'incremental';
  historyId?: string;
}

type GmailClient = gmail_v1.Gmail;

/** Cuántos correos trae la primera sincronización cuando no hay `historyId` previo. */
const BACKFILL_SIZE = 25;

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    // Tipada con el contrato de la cola: si el productor y el consumidor dejan
    // de estar de acuerdo sobre el nombre del campo, falla aquí y no en
    // producción con el job ya encolado.
    @InjectQueue('classify-email') private readonly classifyQueue: Queue<ClassifyEmailJob>,
  ) {}

  private async getGmailClient(userId: string): Promise<GmailClient> {
    // `getAuthorizedClient` descifra las credenciales y se encarga de re-cifrar
    // y persistir el set cuando Google renueva el access_token.
    const auth = await this.auth.getAuthorizedClient(userId);

    // `googleapis-common` ancla su propia copia de google-auth-library (10.5.x).
    // Su `OAuth2Client` y el nuestro (10.9.x) solo difieren en una propiedad
    // privada, así que TypeScript los ve como tipos distintos aunque en runtime
    // sean el mismo objeto. El cast queda acotado a esta línea.
    return google.gmail({ version: 'v1', auth: auth as never });
  }

  // ─── Lectura ───────────────────────────────────────────────────────────

  /**
   * Lista la bandeja de entrada.
   *
   * Por defecto usa `format: 'metadata'`, que ya incluye `labelIds` y basta para
   * la vista de lista. `includeBody` sube a `format: 'full'` y descarga el cuerpo
   * completo — más lento, pensado para consumidores que necesitan el texto.
   */
  async getInbox(
    userId: string,
    maxResults = 20,
    options: { includeBody?: boolean } = {},
  ): Promise<EmailSnippet[]> {
    const gmail = await this.getGmailClient(userId);

    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox',
    });

    const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
    if (ids.length === 0) return [];

    return this.fetchMessages(gmail, ids, options.includeBody ? 'full' : 'metadata');
  }

  /** Descarga mensajes en paralelo y los normaliza. Los fallos individuales se descartan. */
  private async fetchMessages(
    gmail: GmailClient,
    ids: string[],
    format: 'full' | 'metadata',
  ): Promise<EmailSnippet[]> {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id,
            format,
            ...(format === 'metadata' ? { metadataHeaders: ['From', 'Subject', 'Date'] } : {}),
          });
          return this.toEmailSnippet(detail.data);
        } catch (err) {
          this.logger.warn(`Error obteniendo detalle del mensaje ${id}`, err);
          return null;
        }
      }),
    );

    return results.filter((r): r is EmailSnippet => r !== null);
  }

  private toEmailSnippet(message: gmail_v1.Schema$Message): EmailSnippet {
    const headers = message.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name)?.value ?? undefined;

    const bodyText = this.extractBodyText(message.payload);

    return {
      id: message.id!,
      threadId: message.threadId!,
      snippet: message.snippet ?? '',
      from: header('from') ?? 'Desconocido',
      subject: header('subject') ?? '(Sin Asunto)',
      date: header('date') ?? new Date().toISOString(),
      labels: message.labelIds ?? [],
      bodyText: bodyText || undefined,
    };
  }

  // ─── Parseo del cuerpo MIME ────────────────────────────────────────────

  /** Aplana el árbol de partes MIME en una lista. */
  private collectParts(
    part: gmail_v1.Schema$MessagePart | undefined,
    acc: gmail_v1.Schema$MessagePart[] = [],
  ): gmail_v1.Schema$MessagePart[] {
    if (!part) return acc;
    acc.push(part);
    for (const child of part.parts ?? []) this.collectParts(child, acc);
    return acc;
  }

  /** Gmail entrega los cuerpos en base64url. */
  private decodePart(data?: string | null): string {
    if (!data) return '';
    return Buffer.from(data, 'base64url').toString('utf-8');
  }

  /**
   * Extrae el cuerpo como texto plano: prefiere `text/plain` y, si el correo es
   * solo HTML, lo degrada a texto para que la IA del Sprint 3 no lea etiquetas.
   */
  private extractBodyText(payload?: gmail_v1.Schema$MessagePart): string {
    const parts = this.collectParts(payload);

    const plain = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
    if (plain) return this.decodePart(plain.body?.data).trim();

    const html = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
    if (html) return this.htmlToText(this.decodePart(html.body?.data));

    // Correos sin partes: el cuerpo cuelga directo de `payload.body`.
    if (payload?.body?.data) {
      const raw = this.decodePart(payload.body.data);
      return payload.mimeType === 'text/html' ? this.htmlToText(raw) : raw.trim();
    }

    return '';
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ─── Sincronización ────────────────────────────────────────────────────

  /**
   * Sincroniza la bandeja usando el `historyId` guardado del usuario.
   *
   * - Sin `historyId` previo → backfill de los últimos {@link BACKFILL_SIZE} correos
   *   y se guarda el `historyId` actual del buzón como punto de partida.
   * - Con `historyId` → `users.history.list` devuelve solo lo ocurrido desde
   *   entonces; procesamos los `messagesAdded` y avanzamos el marcador.
   * - Si Google responde 404, el `historyId` caducó (Gmail los retiene ~1 semana)
   *   y caemos a backfill.
   */
  async syncHistory(userId: string, notifiedHistoryId?: string): Promise<SyncResult> {
    const gmail = await this.getGmailClient(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { gmailHistoryId: true },
    });
    const startHistoryId = user?.gmailHistoryId ?? undefined;

    if (!startHistoryId) {
      this.logger.log(`Sin historyId previo para ${userId}: ejecutando backfill inicial`);
      return this.backfill(userId, gmail);
    }

    try {
      const { messageIds, latestHistoryId } = await this.collectHistory(gmail, startHistoryId);

      const emails =
        messageIds.length > 0 ? await this.fetchMessages(gmail, messageIds, 'full') : [];
      const processed = await this.persistEmails(userId, emails);

      const newHistoryId = notifiedHistoryId ?? latestHistoryId ?? startHistoryId;
      await this.saveHistoryId(userId, newHistoryId);

      this.logger.log(
        `Sync incremental para ${userId}: ${processed} correo(s) desde historyId ${startHistoryId} → ${newHistoryId}`,
      );
      return { processed, mode: 'incremental', historyId: newHistoryId };
    } catch (err) {
      if (this.isHistoryExpired(err)) {
        this.logger.warn(
          `historyId ${startHistoryId} caducado para ${userId}: se rehace con backfill`,
        );
        return this.backfill(userId, gmail);
      }
      throw err;
    }
  }

  /** Recorre todas las páginas de `users.history.list` y junta los mensajes añadidos. */
  private async collectHistory(
    gmail: GmailClient,
    startHistoryId: string,
  ): Promise<{ messageIds: string[]; latestHistoryId?: string }> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId: string | undefined;

    do {
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX',
        maxResults: 500,
        pageToken,
      });

      for (const entry of res.data.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id);
        }
      }

      if (res.data.historyId) latestHistoryId = res.data.historyId;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { messageIds: [...ids], latestHistoryId };
  }

  /** Primera sincronización: trae los últimos correos y fija el marcador de historial. */
  private async backfill(userId: string, gmail: GmailClient): Promise<SyncResult> {
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: BACKFILL_SIZE,
      q: 'in:inbox',
    });

    const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
    const emails = ids.length > 0 ? await this.fetchMessages(gmail, ids, 'full') : [];
    const processed = await this.persistEmails(userId, emails);

    // El historyId del perfil marca "todo lo anterior ya está sincronizado".
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const historyId = profile.data.historyId ?? undefined;
    await this.saveHistoryId(userId, historyId);

    this.logger.log(`Backfill para ${userId}: ${processed} correo(s), historyId → ${historyId}`);
    return { processed, mode: 'backfill', historyId };
  }

  private async saveHistoryId(userId: string, historyId?: string): Promise<void> {
    if (!historyId) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { gmailHistoryId: historyId },
    });
  }

  /** Gmail responde 404 cuando el `startHistoryId` es demasiado antiguo. */
  private isHistoryExpired(err: unknown): boolean {
    const status = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
    return status === 404;
  }

  /** Guarda los correos de forma idempotente (clave única `gmailMessageId`). */
  private async persistEmails(userId: string, emails: EmailSnippet[]): Promise<number> {
    let processedCount = 0;

    for (const email of emails) {
      try {
        const upsertedEmail = await this.prisma.email.upsert({
          where: { gmailMessageId: email.id },
          update: {
            threadId: email.threadId,
            from: email.from,
            subject: email.subject,
            snippet: email.snippet,
            bodyText: email.bodyText,
            labels: email.labels,
            receivedAt: new Date(email.date),
          },
          create: {
            gmailMessageId: email.id,
            threadId: email.threadId,
            from: email.from,
            subject: email.subject,
            snippet: email.snippet,
            bodyText: email.bodyText,
            labels: email.labels,
            receivedAt: new Date(email.date),
            userId,
          },
        });

        // Encolar clasificación por IA (Sprint 3)
        await this.classifyQueue.add('classify', { emailId: upsertedEmail.id });

        processedCount++;
      } catch (err) {
        this.logger.warn(`Error guardando correo ${email.id} en BD para usuario ${userId}`, err);
      }
    }

    return processedCount;
  }

  // ─── Suscripción push ──────────────────────────────────────────────────

  async watchInbox(userId: string): Promise<void> {
    const topicName = this.config.get<string>('GMAIL_PUBSUB_TOPIC');
    if (!topicName) {
      this.logger.warn('GMAIL_PUBSUB_TOPIC no está configurado. Omitiendo watchInbox.');
      return;
    }

    const gmail = await this.getGmailClient(userId);

    try {
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: { labelIds: ['INBOX'], topicName },
      });

      // `watch` devuelve el historyId vigente: si es la primera vez, sirve de
      // punto de partida para que la sync incremental no empiece desde cero.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { gmailHistoryId: true },
      });
      if (!user?.gmailHistoryId && res.data.historyId) {
        await this.saveHistoryId(userId, res.data.historyId);
      }

      this.logger.log(`Bandeja de entrada observada (watch) para el usuario ${userId}`);
    } catch (err) {
      this.logger.error(`Error configurando watchInbox para ${userId}`, err);
    }
  }
}
