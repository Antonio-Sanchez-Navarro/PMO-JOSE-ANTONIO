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

/**
 * Lo que salio de intentar guardar y encolar una tanda de correos.
 *
 * Son cuatro numeros y no uno porque **guardar y encolar fallan distinto**:
 * `fallidos` significa que el correo no esta en ninguna parte, y `sinEncolar`
 * que esta guardado pero nadie lo va a clasificar. El primero obliga a no
 * mover el marcador de historial; el segundo tambien, pero por otro motivo
 * (que el reintento lo recoja), y los dos merecen decirse por separado en el log.
 */
export interface PersistResult {
  /** Correos que llegaron a la base. */
  guardados: number;
  /** De los guardados, los que ademas entraron en la cola de clasificacion. */
  encolados: number;
  /** El `upsert` fallo: el correo NO esta guardado. */
  fallidos: number;
  /** El `upsert` fue bien y el `add` no: guardado y sin clasificar. */
  sinEncolar: number;
}

type GmailClient = gmail_v1.Gmail;

/** Cuántos correos trae la primera sincronización cuando no hay `historyId` previo. */
const BACKFILL_SIZE = 25;

/**
 * Tope de paginas de `users.history.list` en una sola sincronizacion.
 *
 * **Por que existe un tope.** El bucle paginaba `while (pageToken)` sin limite
 * de paginas ni de tiempo. Tras una caida larga encadenaba llamadas hasta que
 * Gmail dejara de paginar, y quien lo rompia no era el codigo: era **Cloud Run
 * cortando la peticion**. Entonces Pub/Sub reintentaba el push, que volvia a
 * empezar **desde el mismo marcador** -porque el marcador solo avanza al final-
 * y el resultado era un bucle de reintentos que no converge, con la DLQ como
 * unico final.
 *
 * **Por que 20 y no otro numero.** Cada pagina pide `maxResults: 500`, asi que
 * 20 paginas son hasta **10.000 entradas de historial** en una pasada. Con un
 * solo usuario (alcance N=1) eso es mucho mas de lo que cabe entre dos
 * notificaciones push, que llegan por correo recibido: llegar a este tope no
 * significa "buzon activo", significa **"el marcador lleva tanto tiempo parado
 * que ya no merece la pena alcanzarlo pagina a pagina"**.
 *
 * El limite real no es este numero, es el tiempo: 20 llamadas a Gmail mas el
 * `fetchMessages` de lo que traigan caben con holgura en los 300 s que Cloud Run
 * da por defecto, y el objetivo es **decidir nosotros** antes de que la
 * plataforma decida por nosotros a mitad de escritura.
 *
 * Si algun dia hay mas de un usuario o el buzon recibe mucho mas, esto es lo
 * primero que hay que revisar -junto con el `--timeout` del servicio-.
 */
const MAX_PAGINAS_HISTORIAL = 20;

/**
 * Antiguedad minima para que el barrido de reconciliacion toque un correo.
 *
 * No es cortesia: es lo que evita **duplicar clasificaciones**. Un correo recien
 * guardado puede estar en la cola esperando turno, y reencolarlo daria dos
 * trabajos simultaneos sobre el mismo correo, los dos capaces de pasar la
 * comprobacion de `processedAt` y crear las tareas por duplicado.
 *
 * Media hora es muy superior a lo que tarda el camino normal: tres intentos con
 * espera exponencial de 2 s se agotan en menos de un minuto. Lo que siga sin
 * clasificar despues de 30 min no esta en camino, se perdio.
 */
const GRACIA_RECONCILIACION_MS = 30 * 60_000;

/**
 * Tope de correos que reencola un solo barrido.
 *
 * El barrido corre dentro de una peticion HTTP con el `--timeout` de Cloud Run
 * encima, asi que tiene que **terminar**. Con 100 por vuelta y una vuelta cada
 * 15 minutos, un atasco de mil correos se drena en dos horas y media sin que
 * ninguna peticion se acerque al plazo. Preferimos tardar a que la plataforma
 * corte a mitad, que es como se llega a un bucle de reintentos.
 */
const MAX_RECONCILIADOS = 100;

/**
 * Silencio entre avisos del barrido.
 *
 * ⚠️ **Este numero esta atado a la cadencia del cron, y hasta el 2026-08-21
 * estaba mal.** Usaba el freno por defecto de `AlertService`: 900 s, contra un
 * cron que corre **cada 900 s**. Una ventana igual a la cadencia **no frena
 * nada** — cada pasada cae justo en el borde de la anterior, asi que un
 * problema persistente avisaria 96 veces al dia y el canal acabaria silenciado,
 * que es como se pierde una alerta buena.
 *
 * Una hora son **cuatro veces la cadencia**: un problema que dura avisa una vez
 * por hora, se nota igual, y no ensordece. Si algun dia se cambia
 * `--schedule` del barrido en `deploy.yml`, **este numero se cambia con el**.
 */
const FRENO_AVISO_RECONCILIACION_S = 3_600;

/** Donde se recuerda que huerfanos vio la pasada anterior. */
const CLAVE_HUERFANOS_VISTOS = 'pmo:reconciliacion:huerfanos-vistos';

/**
 * Cuanto dura ese recuerdo.
 *
 * Muy por encima de la cadencia de 15 min a proposito: si caducara cerca de
 * ella, cada pasada creeria que todo es nuevo y volveriamos al aviso por
 * condicion, que es justo lo que se esta arreglando. Un dia es desechable
 * -perderlo cuesta un aviso de mas- y sobra margen.
 */
const TTL_HUERFANOS_VISTOS_S = 24 * 3_600;

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

    // ─── Sonda de diagnóstico (2026-08-22) ──────────────────────────
    //
    // **Está aquí para medir, no para arreglar**, y por orden expresa: primero el
    // número, luego el parseo.
    //
    // Las tres ramas de `extractBodyText` exigen `p.body?.data`, y **Gmail manda
    // `attachmentId` en vez de `data` cuando la parte pasa de cierto tamaño**.
    // Un correo grande pierde el cuerpo entero — y si además trae `snippet`,
    // **no queda huérfano**: se clasifica igual, leyendo doscientos caracteres
    // de vista previa en lugar del correo. Termina bien, no da error y no
    // aparece en ningún contador. Eso es lo que hay que medir.
    //
    // Se registran **solo formas, nunca contenido**: los `mimeType` de las
    // partes, si cada una trae `data` o `attachmentId`, y el tamaño. Ni asunto,
    // ni remitente, ni una línea del cuerpo. El log no es sitio para el correo
    // de nadie.
    if (!bodyText) {
      const partes = this.collectParts(message.payload).map((p) => {
        const tiene = p.body?.data ? 'data' : p.body?.attachmentId ? 'attachmentId' : 'vacia';
        return `${p.mimeType ?? '?'}:${tiene}:${p.body?.size ?? 0}`;
      });

      this.logger.warn(
        `SONDA cuerpo vacio · mensaje=${message.id} · snippet=${message.snippet ? 'si' : 'NO'} · ` +
          `partes=[${partes.join(' | ')}]`,
      );
    }

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
      const { messageIds, latestHistoryId, truncado } = await this.collectHistory(
        gmail,
        startHistoryId,
      );

      // El historial es mas largo de lo que se puede recorrer de una sentada.
      // Seguir seria encadenar llamadas hasta que Cloud Run corte la peticion a
      // mitad, y entonces Pub/Sub reintenta desde el mismo marcador: un bucle
      // que no converge. Se rehace con backfill, que es finito y termina.
      //
      // ⚠️ **Y esto pierde correos**, hay que decirlo: el backfill trae los
      // ultimos BACKFILL_SIZE (25) de la bandeja, no el tramo que faltaba. Se
      // elige porque la alternativa -el bucle- no trae ninguno y ademas no
      // termina. Por eso avisa: la decision de que hacer con el hueco es de una
      // persona, no de este `if`.
      if (truncado) {
        await this.alertas.avisar(
          'Historial de Gmail demasiado largo: se rehace con backfill',
          `Usuario ${userId}: el historial desde ${startHistoryId} supera ` +
            `${MAX_PAGINAS_HISTORIAL} paginas. Se cae a backfill de los ultimos ` +
            `${BACKFILL_SIZE} correos, asi que el tramo intermedio NO se ingiere. ` +
            'Suele significar que la ingesta estuvo caida mucho tiempo.',
          `gmail-historial-truncado:${userId}`,
        );
        return this.backfill(userId, gmail);
      }

      const emails =
        messageIds.length > 0 ? await this.fetchMessages(gmail, messageIds, 'full') : [];
      const recuento = await this.persistEmails(userId, emails);

      // ─── El marcador solo avanza si NO se quedo nada atras ──────────────
      //
      // Antes esto era una linea: se guardaba el marcador nuevo pasara lo que
      // pasara. Y como `persistEmails` se traga los fallos correo a correo, un
      // correo que fallara al guardarse **no se volvia a ver nunca**: la
      // siguiente sincronizacion arrancaba del marcador nuevo y
      // `users.history.list` ya no lo mencionaba. Perdida de datos silenciosa,
      // con el log diciendo un numero mas bajo y ningun error.
      //
      // Ahora, si algo quedo pendiente, **el marcador se queda donde estaba** y
      // la siguiente pasada vuelve a traer el mismo tramo. Repetir es barato y
      // seguro: el `upsert` es idempotente por `gmailMessageId` y el `add` se
      // reintenta solo, asi que un fallo pasajero de Redis se cura en la
      // siguiente vuelta sin que nadie haga nada.
      //
      // ⚠️ **El precio, y hay que conocerlo:** si un correo falla *siempre*
      // -uno con datos que la base rechaza- el marcador no avanza nunca y la
      // sincronizacion repite ese tramo indefinidamente. Eso NO detiene la
      // ingesta (el tramo repetido incluye los correos nuevos), pero desperdicia
      // trabajo, y sobre todo: los `historyId` caducan a la semana. Si el atasco
      // dura tanto, Gmail respondera 404 y se caera a `backfill`, que solo trae
      // los ultimos BACKFILL_SIZE (25). **Por eso esto avisa en vez de callarse**:
      // atascarse y gritar es preferible a avanzar y perder, pero solo si
      // alguien se entera.
      const quedaPendiente = recuento.fallidos > 0 || recuento.sinEncolar > 0;
      const newHistoryId = quedaPendiente
        ? startHistoryId
        : (notifiedHistoryId ?? latestHistoryId ?? startHistoryId);

      if (!quedaPendiente) {
        await this.saveHistoryId(userId, newHistoryId);
      }

      this.logger.log(
        `Sync incremental para ${userId}: ${recuento.encolados} encolado(s), ` +
          `${recuento.guardados} guardado(s), ${recuento.fallidos} fallido(s), ` +
          `${recuento.sinEncolar} sin encolar · historyId ${startHistoryId} → ${newHistoryId}` +
          (quedaPendiente ? ' (marcador RETENIDO: se reintentara el mismo tramo)' : ''),
      );

      if (quedaPendiente) {
        await this.alertas.avisar(
          'Sincronizacion de Gmail incompleta: el marcador no avanza',
          `Usuario ${userId}: ${recuento.fallidos} correo(s) sin guardar y ` +
            `${recuento.sinEncolar} guardado(s) sin encolar. El marcador se queda en ` +
            `${startHistoryId} y se reintentara el mismo tramo. Si esto se repite, ` +
            'mira los avisos anteriores: un correo que falla siempre atasca la ingesta ' +
            'y los historyId caducan a la semana.',
          `gmail-sync-incompleta:${userId}`,
        );
      }

      return { processed: recuento.encolados, mode: 'incremental', historyId: newHistoryId };
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
  ): Promise<{ messageIds: string[]; latestHistoryId?: string; truncado: boolean }> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId: string | undefined;
    let paginas = 0;

    do {
      paginas++;
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

      if (pageToken && paginas >= MAX_PAGINAS_HISTORIAL) {
        // Se corta y se avisa a quien llama. No se lanza: quedarse a medias del
        // historial y avanzar el marcador seria perder justo lo que falta.
        this.logger.warn(
          `El historial desde ${startHistoryId} supera ${MAX_PAGINAS_HISTORIAL} paginas: ` +
            'se corta la paginacion y se rehace con backfill.',
        );
        return { messageIds: [...ids], latestHistoryId, truncado: true };
      }
    } while (pageToken);

    return { messageIds: [...ids], latestHistoryId, truncado: false };
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
    const recuento = await this.persistEmails(userId, emails);

    // El historyId del perfil marca "todo lo anterior ya está sincronizado".
    //
    // ⚠️ **Aqui el marcador SI avanza aunque algo falle, y es a proposito.** En
    // el camino incremental retener el marcador sirve para reintentar el tramo;
    // aqui no hay tramo al que volver -el `backfill` es "los ultimos N de la
    // bandeja"- y no guardarlo dejaria al usuario sin punto de partida, es decir
    // repitiendo el backfill entero en cada notificacion y sin pasar nunca al
    // modo incremental. Lo que si se hace es **decirlo**.
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const historyId = profile.data.historyId ?? undefined;
    await this.saveHistoryId(userId, historyId);

    this.logger.log(
      `Backfill para ${userId}: ${recuento.encolados} encolado(s), ` +
        `${recuento.guardados} guardado(s), ${recuento.fallidos} fallido(s), ` +
        `${recuento.sinEncolar} sin encolar · historyId → ${historyId}`,
    );

    if (recuento.fallidos > 0 || recuento.sinEncolar > 0) {
      await this.alertas.avisar(
        'Backfill de Gmail incompleto',
        `Usuario ${userId}: ${recuento.fallidos} correo(s) sin guardar y ` +
          `${recuento.sinEncolar} guardado(s) sin encolar. El marcador avanza igual porque ` +
          'un backfill no tiene tramo al que volver, asi que esos correos NO se recuperan solos.',
        `gmail-backfill-incompleto:${userId}`,
      );
    }

    return { processed: recuento.encolados, mode: 'backfill', historyId };
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

  /**
   * Guarda los correos de forma idempotente (clave única `gmailMessageId`) y los
   * encola para clasificar.
   *
   * ⚠️ **Devuelve un recuento y no un número, y esa es la mitad del arreglo.**
   *
   * Antes devolvía sólo `processedCount` y envolvía el `upsert` **y** el `add` a
   * la cola en el **mismo** `try`. Eso juntaba dos fallos que no se parecen en
   * nada:
   *
   * - **El `upsert` falla** → el correo **no está en ninguna parte**. Si el
   *   marcador de historial avanza igual, ese correo no se vuelve a ver nunca:
   *   la siguiente sincronización arranca del marcador nuevo y
   *   `users.history.list` ya no lo menciona.
   * - **El `add` falla** → el correo **sí está guardado**, pero nadie lo va a
   *   clasificar. No se pierde el dato, se pierde el procesamiento. Y como el
   *   `processedCount++` estaba **después** del `add`, el log decía «Sync
   *   incremental: N correo(s)» con **N más bajo de lo real** y sin un solo
   *   error: el operador veía un número pequeño y nada más.
   *
   * No hay barrido que recoja «guardados sin encolar», así que ese correo se
   * quedaba sin clasificar para siempre. Ahora cada caso se cuenta por separado
   * y quien decide si el marcador avanza es {@link syncHistory}, con el recuento
   * delante.
   */
  private async persistEmails(userId: string, emails: EmailSnippet[]): Promise<PersistResult> {
    const resultado: PersistResult = { guardados: 0, encolados: 0, fallidos: 0, sinEncolar: 0 };

    for (const email of emails) {
      let upsertedEmail: { id: string };

      // ── Primer riesgo: la base de datos ──────────────────────────────────
      try {
        upsertedEmail = await this.prisma.email.upsert({
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
      } catch (err) {
        // El correo NO esta guardado. Es el caso grave: si el marcador avanza,
        // desaparece para siempre.
        resultado.fallidos++;
        this.logger.warn(
          `Error guardando correo ${email.id} en BD para usuario ${userId}: ${describirError(err)}`,
          stackDe(err),
        );
        continue;
      }

      resultado.guardados++;

      // ── Segundo riesgo: Redis ────────────────────────────────────────────
      // Va en su propio `try` a proposito. Si esto falla, el correo ya esta en
      // la base: no se pierde el dato, se pierde la clasificacion. Contarlo
      // aparte es lo que permite distinguir «no llego» de «llego y nadie lo
      // miro», que es justo lo que el `catch` compartido borraba.
      try {
        // `jobId` determinista: BullMQ ignora un alta cuyo id ya existe, asi
        // que reprocesar el mismo tramo -que ahora pasa a proposito cuando el
        // marcador se retiene- no encola el mismo correo dos veces. Es tambien
        // lo que impide que el barrido de reconciliacion duplique un trabajo
        // que ya esta en vuelo.
        await this.classifyQueue.add('classify', { emailId: upsertedEmail.id }, { jobId: upsertedEmail.id });
        resultado.encolados++;
      } catch (err) {
        resultado.sinEncolar++;
        this.logger.warn(
          `Correo ${email.id} guardado para ${userId} pero NO encolado para clasificar: ${describirError(err)}`,
          stackDe(err),
        );
      }
    }

    return resultado;
  }


  /**
   * Barrido de reconciliación: reencola los correos que se quedaron guardados y
   * sin clasificar.
   *
   * ── Por qué existe ────────────────────────────────────────────────────────
   *
   * Tapa **dos agujeros a la vez**, y esa es la razón de que sea un barrido y no
   * un ping.
   *
   * **1. Cloud Run escala a cero y con la instancia se apagan los workers.** Un
   * trabajo que se quede atrás espera al **siguiente correo**, no a un
   * temporizador: `stalledInterval` no lo reclama porque reclamar exige un
   * worker vivo. Cualquier petición periódica despierta el contenedor, así que
   * esto ya bastaría.
   *
   * **2. Y además recoge lo que ningún worker vivo recogería.** Cuando el
   * `upsert` va bien y el `add` a la cola falla, el correo queda en la base y
   * **el trabajo nunca llegó a existir**. No hay nada que reintentar: no está
   * atascado, no está fallido, no está. Ni `--min-instances=1` ni un ping ven
   * eso nunca. Esto sí.
   *
   * ── Qué busca ─────────────────────────────────────────────────────────────
   *
   * `processedAt` es el marcador de «la IA ya pasó por aquí» y lo escribe
   * `email-classification.service`. Un correo con `processedAt` en nulo y con
   * cierta antigüedad es, por definición, uno que no se clasificó.
   *
   * ⚠️ **La ventana de gracia no es un margen de cortesía, es lo que evita
   * duplicar clasificaciones.** Sin ella, este barrido reencolaría correos que
   * están **en la cola ahora mismo** esperando su turno, y dos trabajos
   * simultáneos sobre el mismo correo pueden pasar los dos la comprobación de
   * `processedAt` y crear las tareas por duplicado. Media hora es mucho más de
   * lo que tarda el camino normal —tres intentos con espera exponencial de 2 s
   * se agotan en menos de un minuto—, así que lo que quede después es que algo
   * se perdió de verdad.
   */
  async reconciliarSinClasificar(): Promise<{
    candidatos: number;
    reencolados: number;
    fallidos: number;
    sinTexto: number;
  }> {
    const limite = new Date(Date.now() - GRACIA_RECONCILIACION_MS);

    // ⚠️ **El orden `asc` con tope se acepta a sabiendas, y conviene saber por
    // que.** Los mas viejos primero es lo justo -son los que llevan mas
    // esperando- pero significa que **un correo que se atasque ocupa plaza fija
    // por delante de los recientes**. Con el tope lleno de casos
    // irrecuperables, un correo nuevo que necesite el barrido no entraria nunca.
    //
    // Se deja `asc` porque despues del arreglo del 2026-08-21 **ya no hay
    // atasco permanente**: un correo sin texto se marca terminal y sale del
    // conjunto. Lo unico que puede volver a ocupar plaza para siempre es uno
    // que falle la clasificacion una y otra vez, y de eso ya avisan los oyentes
    // de la DLQ por su cuenta.
    //
    // Lo que **no** se acepta es que vuelva a pasar sin que nadie lo vea: si el
    // tope se llena, se grita. Un contador de intentos por correo seria la
    // solucion completa, y hoy seria complejidad especulativa para un problema
    // que no existe; el chivato es lo que avisara el dia que exista.
    const huerfanos = await this.prisma.email.findMany({
      where: { processedAt: null, receivedAt: { lt: limite } },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: MAX_RECONCILIADOS,
    });

    if (huerfanos.length === MAX_RECONCILIADOS) {
      this.logger.warn(
        `El barrido llego al tope de ${MAX_RECONCILIADOS} candidatos: puede haber ` +
          'correos recientes que no entren en esta pasada. Si se repite, mira si hay ' +
          'correos atascados ocupando plaza fija (los mas viejos van primero).',
      );
    }

    let reencolados = 0;
    let fallidos = 0;

    for (const { id } of huerfanos) {
      try {
        // ⚠️ **El `remove` antes del `add` es lo que hace que esto funcione, y
        // el orden importa.**
        //
        // El `add` usa `jobId: id`, así que BullMQ **ignora** un alta cuyo id ya
        // existe. Eso es justo lo que se quiere frente a un trabajo **activo**
        // —no duplicar— pero jugaría en contra frente a uno ya **terminado o
        // fallido**, que sigue guardado (`removeOnComplete`/`removeOnFail` los
        // conservan un tiempo) y bloquearía el reintento durante días.
        //
        // `remove` sobre un trabajo activo **falla**, y por eso el fallo se
        // traga: si está corriendo, no se toca y el `add` de después se ignora
        // solo. Si está terminado o fallido, se borra y el `add` entra. Las dos
        // ramas hacen lo correcto sin preguntar en qué estado está.
        await this.classifyQueue.remove(id).catch(() => undefined);
        await this.classifyQueue.add('classify', { emailId: id }, { jobId: id });
        reencolados++;
      } catch (err) {
        fallidos++;
        this.logger.warn(
          `Reconciliación: no se pudo reencolar el correo ${id}: ${describirError(err)}`,
          stackDe(err),
        );
      }
    }

    // ── Avisar de lo que APARECE, no de lo que HAY ───────────────────────
    //
    // ⚠️ **Este bloque avisaba por la condición y no por el cambio, y eso no es
    // una alerta: es una suscripción.**
    //
    // El aviso del primer barrido —27 correos rescatados, uno con una tarea
    // dentro que nunca llegó al tablero— valía oro. Los cuatro siguientes eran
    // el mismo hecho contado otra vez, y el daño no es la molestia: **la
    // próxima alerta de verdad llegará enterrada entre mensajes idénticos que
    // ya nadie lee**. Un canal se gasta.
    //
    // Así que se compara con lo que se vio en la pasada anterior y solo se
    // avisa de los **ids nuevos**. Un problema que sigue ahí ya se contó; uno
    // que crece, no.
    const nuevos = await this.huerfanosNuevos(huerfanos.map((h) => h.id));

    if (nuevos.length > 0) {
      await this.alertas.avisar(
        'Barrido de reconciliación: correos guardados sin encolar',
        `${nuevos.length} correo(s) nuevo(s) estaban en la base sin trabajo de ` +
          `clasificación asociado (${reencolados} reencolado(s) en esta pasada). ` +
          'Ningun worker los habria recogido, porque no habia nada que recoger. ' +
          'Donde mirar, en este orden: (1) lineas "guardado pero NO encolado" en ' +
          'el log de sincronizacion, que serian un fallo del `add`; (2) si no las ' +
          'hay, el worker probablemente murio entre el guardado y el procesado ' +
          '-Cloud Run escala a cero-; (3) el recuento de `skipReason` si los ' +
          'mismos vuelven a aparecer.',
        'reconciliacion-huerfanos',
        FRENO_AVISO_RECONCILIACION_S,
      );
    }

    // Cuantos correos se cerraron sin clasificar, acumulado. Es el numero que
    // convierte «cinco, que curioso» en «cincuenta, esto es una averia de la
    // ingesta»: se registra cada pasada para que la tendencia se vea sola, sin
    // que nadie tenga que acordarse de consultarla.
    const sinTexto = await this.prisma.email.count({ where: { skipReason: { not: null } } });
    if (sinTexto > 0) {
      this.logger.log(`Correos cerrados sin clasificar (acumulado): ${sinTexto}`);
    }

    // ─── La medida que convierte la sospecha en hecho (2026-08-22) ─────────
    //
    // Correos **sin cuerpo pero con snippet**: los que se clasificaron leyendo
    // doscientos caracteres de vista previa en lugar del correo entero. No son
    // huérfanos —terminaron bien, sin error y sin aparecer en ningún contador—
    // y por eso nadie los había visto.
    //
    // Va aquí y no en una ruta aparte porque el barrido ya corre cada quince
    // minutos y ya cuenta: el número aparece solo, y su tendencia también. Cinco
    // es una curiosidad; doscientos significa que llevamos semanas clasificando a
    // ciegas, y **de ese número sale una decisión que no es de este código**:
    // si lo ya clasificado hay que reprocesar. Cuesta llamadas a Anthropic y la
    // toma el Jefe.
    const soloSnippet = await this.prisma.email.count({
      where: { bodyText: null, snippet: { not: '' } },
    });
    this.logger.log(`SONDA alcance · correos clasificados solo con snippet: ${soloSnippet}`);

    return { candidatos: huerfanos.length, reencolados, fallidos, sinTexto };
  }


  /**
   * De los huérfanos de esta pasada, cuáles no estaban en la anterior.
   *
   * **Por qué hace falta estado entre pasadas.** Sin él, la única pregunta que
   * el barrido puede hacerse es «¿hay huérfanos?», y esa condición es estable:
   * responde que sí en cada vuelta mientras el problema dure. Avisar de eso es
   * repetir el mismo hecho cada quince minutos hasta que quien lo recibe deja de
   * leer el canal — y entonces la alerta que sí importaba llega enterrada.
   *
   * Con la lista anterior, la pregunta pasa a ser **«¿ha aparecido algo
   * nuevo?»**, que es la que tiene información. Un problema que sigue igual ya
   * se contó; uno que crece, no.
   *
   * Se guarda en Redis y no en la base porque es estado operativo y desechable:
   * si se pierde, lo peor que pasa es un aviso de más, y el freno de una hora lo
   * acota. Por eso también **si Redis falla se avisa igual** — prefiero un aviso
   * repetido a callarme la primera vez que ocurre algo de verdad.
   */
  private async huerfanosNuevos(ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      await this.recordarHuerfanos([]);
      return [];
    }

    try {
      const redis = (await this.classifyQueue.client) as unknown as {
        get(clave: string): Promise<string | null>;
      };
      const crudo = await redis.get(CLAVE_HUERFANOS_VISTOS);
      const vistos = new Set<string>(crudo ? (JSON.parse(crudo) as string[]) : []);

      await this.recordarHuerfanos(ids);
      return ids.filter((id) => !vistos.has(id));
    } catch (err) {
      // Fallo abierto: se avisa de todos. El freno acota el ruido y no se
      // pierde la primera vez que ocurre algo.
      this.logger.warn(
        `No se pudo leer el estado del barrido; se avisa de todos los huerfanos: ${describirError(err)}`,
      );
      return ids;
    }
  }

  /** Deja la lista de esta pasada para que la siguiente sepa qué es nuevo. */
  private async recordarHuerfanos(ids: string[]): Promise<void> {
    try {
      const redis = (await this.classifyQueue.client) as unknown as {
        set(c: string, v: string, modo: 'EX', ttl: number): Promise<unknown>;
      };
      await redis.set(CLAVE_HUERFANOS_VISTOS, JSON.stringify(ids), 'EX', TTL_HUERFANOS_VISTOS_S);
    } catch {
      // Que no se pueda recordar no rompe el barrido: la proxima pasada
      // avisara de mas, que es el lado bueno del que equivocarse.
    }
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
    // ⚠️ **Sin `take`, y tiene que seguir sin él.** Un tope aquí dejaría a los
    // usuarios de la cola sin renovar, su `watch` caducaría a los 7 días y su
    // ingesta se apagaría **en silencio** — exactamente el fallo que esta
    // función existe para evitar, reintroducido por el arreglo. Si algún día
    // esta lista crece, se pagina y se recorre entera; no se recorta.
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
      await this.alertas.avisar(
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
