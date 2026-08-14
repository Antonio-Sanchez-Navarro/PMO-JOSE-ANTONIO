import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { describirError, stackDe } from '../../common/observability/describir-error';
import { AlertService } from '../../common/alerts/alert.service';
import type { ClassifyEmailJob } from '../ai/classify-email.job';

/**
 * Qué pasó al intentar poner el `watch` de un buzón.
 *
 * Devuelve el motivo y no solo un booleano porque quien llama —el cron que
 * recorre a todos los usuarios— tiene que poder **decirlo en su aviso**. Un
 * «renovados: 0 de 1» sin causa no se puede accionar.
 */
export interface ResultadoDeWatch {
  ok: boolean;
  motivo?: string;
}

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
    private readonly alertas: AlertService,
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
          this.logger.warn(`Error obteniendo detalle del mensaje ${id}: ${describirError(err)}`, stackDe(err));
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
        this.logger.warn(`Error guardando correo ${email.id} en BD para usuario ${userId}: ${describirError(err)}`, stackDe(err));
      }
    }

    return processedCount;
  }

  // ─── Suscripción push ──────────────────────────────────────────────────

  /**
   * Registra (o renueva) la suscripción push de la bandeja de un usuario.
   *
   * Devuelve `true` si Gmail aceptó el `watch`. Antes no devolvía nada y los
   * fallos solo quedaban en el log, lo cual bastaba mientras el único llamador
   * era el worker; desde que `/cron/gmail-watch` recorre a todos los usuarios
   * hace falta saber **cuántos** quedaron observados de verdad, porque un
   * «renovados: 0 de 3» es la diferencia entre la ingesta viva y apagada.
   *
   * `GMAIL_PUBSUB_TOPIC` debe llevar el nombre completo del tema
   * (`projects/<proyecto>/topics/<tema>`): Gmail rechaza el nombre corto.
   */
  async watchInbox(userId: string): Promise<ResultadoDeWatch> {
    const topicName = this.config.get<string>('GMAIL_PUBSUB_TOPIC');
    if (!topicName) {
      const motivo = 'GMAIL_PUBSUB_TOPIC no está configurado';
      this.logger.warn(`${motivo}. Omitiendo watchInbox.`);
      return { ok: false, motivo };
    }

    const gmail = await this.getGmailClient(userId);

    // ⚠️ **Solo la llamada a Gmail va dentro del `try`.**
    //
    // Hasta el 2026-08-14 el `findUnique` de más abajo estaba aquí dentro, y
    // eso hacía imposible distinguir dos fallos muy distintos: que Gmail
    // rechazara el `watch` (la ingesta no queda observada) o que tropezara la
    // base de datos **después** de que Gmail lo aceptara (el watch está puesto
    // y solo falló guardar el marcador). El segundo caso se contaba como watch
    // fallido, y con el registro roto tampoco se podía leer cuál de los dos
    // era. Un tropiezo de Postgres no puede invalidar un watch que Gmail ya
    // aceptó.
    // ⚠️ **Hay que parar el watch anterior antes de poner el nuevo.**
    //
    // Gmail admite **un solo cliente de notificaciones push por desarrollador**
    // y rechaza el segundo con un 400 que lo dice literalmente:
    //
    //   "Only one user push notification client allowed per developer
    //    (call /stop then try again)"  ·  INVALID_ARGUMENT
    //
    // Es un fallo que **solo aparece a partir de la segunda ejecución**: el
    // watch inicial del 2026-08-13 se puso sin problema porque no había
    // ninguno, y desde entonces cada renovación chocaba contra el que aquel
    // mismo dejó puesto. Una vez bien y todas las siguientes mal, que es por
    // qué costó verlo — y por qué la ingesta iba camino de apagarse sola el
    // 2026-08-20, siete días después del único watch que Gmail llegó a aceptar.
    //
    // `stop` es idempotente: sobre un buzón sin watch no falla. Aun así se
    // captura aparte para no confundir un fallo suyo con un rechazo del
    // `watch`, que es lo que de verdad decide el resultado.
    //
    // **Sí hay una ventana sin push entre las dos llamadas**, y conviene que
    // esté escrita en vez de descubrirse: dura milisegundos y Gmail conserva el
    // historial, así que lo que entre en medio lo recupera la sincronización
    // incremental por `historyId`. No se pierde correo; se retrasa.
    try {
      await gmail.users.stop({ userId: 'me' });
    } catch (err) {
      this.logger.warn(
        `No se pudo parar el watch anterior de ${userId} (se intenta poner el nuevo igualmente): ${describirError(err)}`,
        stackDe(err),
      );
    }

    let historyIdInicial: string | null | undefined;
    try {
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: { labelIds: ['INBOX'], topicName },
      });
      historyIdInicial = res.data.historyId;
    } catch (err) {
      const motivo = describirError(err);
      // El motivo va **en el mensaje**: la segunda ranura de `logger.error` es
      // el stack y espera una cadena; pasarle el error ahí lo tira al suelo.
      // Ver `common/observability/describir-error.ts`.
      this.logger.error(`Gmail rechazó el watch de ${userId}: ${motivo}`, stackDe(err));
      return { ok: false, motivo };
    }

    // A partir de aquí el watch **ya está puesto en Gmail**. Lo que queda es
    // guardar el punto de partida del historial, y si eso falla el watch sigue
    // siendo bueno: se avisa y se devuelve `ok`.
    try {
      // `watch` devuelve el historyId vigente: si es la primera vez, sirve de
      // punto de partida para que la sync incremental no empiece desde cero.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { gmailHistoryId: true },
      });
      if (!user?.gmailHistoryId && historyIdInicial) {
        await this.saveHistoryId(userId, historyIdInicial);
      }
    } catch (err) {
      this.logger.warn(
        `Watch puesto para ${userId}, pero no se pudo guardar el historyId inicial: ${describirError(err)}`,
        stackDe(err),
      );
    }

    this.logger.log(`Bandeja de entrada observada (watch) para el usuario ${userId}`);
    return { ok: true };
  }

  /**
   * Renueva el `watch` de todos los usuarios que tengan credenciales de Google.
   *
   * **La razón de que esto exista es que `users.watch` caduca a los 7 días.**
   * No avisa al vencer y no deja ningún error: sencillamente dejan de llegar
   * push, y la ingesta de correo se apaga en silencio. Un producto que
   * funcionaba deja de funcionar sin que nada cambie ni nadie toque nada, que
   * es la clase de fallo más cara de diagnosticar.
   *
   * Un usuario que falla **no corta el recorrido**: `watchInbox` ya captura sus
   * propios errores, así que un token revocado no puede impedir que se renueve
   * el de los demás.
   */
  async renovarWatchDeTodos(): Promise<{ candidatos: number; renovados: number }> {
    const usuarios = await this.prisma.user.findMany({
      // Sin credenciales de Google no hay buzón que observar. Filtrar aquí evita
      // una llamada condenada al 401 por cada usuario que nunca entró con Google.
      where: { googleTokens: { not: null } },
      select: { id: true },
    });

    let renovados = 0;
    const fallos: string[] = [];

    for (const usuario of usuarios) {
      const resultado = await this.watchInbox(usuario.id);
      if (resultado.ok) renovados++;
      else fallos.push(`${usuario.id}: ${resultado.motivo ?? 'motivo desconocido'}`);
    }

    if (renovados < usuarios.length) {
      // ⚠️ **El aviso lleva el motivo, y esa es la mitad del arreglo.**
      // «0 de 1» sin causa es lo que dejó pasar dos días de ingesta condenada:
      // el contador decía que algo iba mal y no había forma de saber qué, así
      // que no se podía actuar sobre ello. Un contador sin causa no es una
      // alerta, es una intriga.
      // **La alerta que faltaba.** Este aviso estuvo dos días en el log sin que
      // nadie lo viera: el cron corre a las 02:30 y nadie lee logs de
      // madrugada. Mientras tanto la ingesta iba camino de apagarse sola.
      void this.alertas.avisar(
        `Watch de Gmail sin renovar: ${renovados} de ${usuarios.length}`,
        `La ingesta de correo se apagará cuando caduque el watch vigente (7 días). ${fallos.join(' | ')}`,
        'gmail-watch-sin-renovar',
      );

      this.logger.warn(
        `Watch de Gmail renovado solo para ${renovados} de ${usuarios.length} usuario(s) ` +
          `[${fallos.join(' | ')}]: ` +
          `los demás dejarán de recibir correo cuando caduque el suyo`,
      );
    }

    return { candidatos: usuarios.length, renovados };
  }
}
