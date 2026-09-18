import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuthService } from '../auth/auth.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { describirError, stackDe } from '../../common/observability/describir-error';
import { AlertService } from '../../common/alerts/alert.service';
import type { ClassifyEmailJob } from '../ai/classify-email.job';
import { GmailQuotaError, esCuotaAgotada, esOmisionPermanente } from './gmail-quota';

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

/**
 * Un archivo adjunto, **sin su contenido**.
 *
 * Lo que se guarda es la ficha: con `attachmentId` se pide el binario a Gmail
 * cuando alguien lo necesita —al pulsar «descargar» o al clasificar— y mientras
 * tanto no ocupa nada en nuestra base. Un correo con tres PDF de 8 MB son tres
 * fichas de doscientos bytes.
 *
 * ⚠️ **`attachmentId` no es estable entre mensajes ni para siempre.** Es válido
 * para el `messageId` del que salió, así que la descarga siempre necesita los
 * dos — y por eso el endpoint de descarga cuelga del correo y no es una ruta
 * suelta de adjuntos.
 */
export interface AttachmentMeta {
  /** Lo que hay que darle a `messages.attachments.get` junto al id del mensaje. */
  attachmentId: string;
  filename: string;
  mimeType: string;
  /** Tamaño en bytes que declara Gmail. */
  size: number;
  /**
   * Va incrustado en el cuerpo (logo de la firma, imagen citada) en vez de ser
   * un archivo que alguien adjuntó a propósito.
   *
   * **Se distingue porque cuesta dinero.** Casi todas las firmas corporativas
   * llevan un logo, y sin esta marca la clasificación le mandaría a Claude el
   * logotipo de la empresa en **cada correo**, pagando tokens de imagen por
   * mirar un PNG de 4 KB que no dice nada. También ensucia la lista de
   * descargas con archivos que la persona nunca adjuntó.
   */
  inline: boolean;
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
  /** Indica si el correo trae algún archivo adjunto. */
  hasAttachments: boolean;
  /**
   * Fichas de los adjuntos, sin contenido. Vacío si no hay ninguno.
   *
   * `hasAttachments` se queda porque lo leen la bandeja y el prompt desde el
   * Sprint 3, y porque responde a otra pregunta: «¿enseño el clip?» no necesita
   * cargar la lista.
   */
  attachments: AttachmentMeta[];
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

/** Una etiqueta del buzón, tal como la necesita la bandeja para traducir ids. */
export interface GmailLabel {
  /** Lo que viene dentro de `Email.labels`. */
  id: string;
  /** Legible para las de usuario; la propia constante para las del sistema. */
  name: string;
  type: 'system' | 'user';
}

/**
 * «Este mensaje ya no está en Gmail», como resultado de una descarga.
 *
 * Es un `Symbol` y no `null` porque `null` ya significa otra cosa —«falló, quizá
 * se recupere»— y de la diferencia entre las dos depende que el marcador de
 * historial avance o se quede clavado. Un tercer estado disfrazado del segundo
 * fue exactamente el P0 de la cuota; con un símbolo propio, confundirlos deja de
 * compilar.
 */
const OMITIDO = Symbol('mensaje omitido: Gmail ya no lo tiene');

/** Lo que puede salir de intentar bajar un mensaje suelto. */
type ResultadoDescarga = EmailSnippet | typeof OMITIDO | null;

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
 * `fetchMessages` de lo que traigan tienen que caber en el timeout del
 * servicio, y el objetivo es **decidir nosotros** antes de que la plataforma
 * decida por nosotros a mitad de escritura.
 *
 * ⚠️ _Corregido el 2026-09-11:_ aqui ponia «los 300 s que Cloud Run da por
 * defecto». El despliegue pasa `--timeout=900s` desde que el copiloto lo
 * necesito, asi que el margen real es el triple del que decia este parrafo. Y
 * el margen ya no sobra como sobraba: con `PAUSA_ENTRE_TANDAS_MS` en 5 s, una
 * pasada de mas de ~1.100 mensajes no cabe. 20 paginas de historial pueden
 * traer muchos mas.
 *
 * Si algun dia hay mas de un usuario o el buzon recibe mucho mas, esto es lo
 * primero que hay que revisar -junto con el `--timeout` del servicio-.
 */
const MAX_PAGINAS_HISTORIAL = 20;

/**
 * Cuanto se admite que la cabecera `Date:` se adelante al reloj.
 *
 * Los desajustes reales entre servidores de correo son de **minutos**. Una hora
 * es margen de sobra para eso y muy poco para que sirva de escondite: un correo
 * fechado manana quedaria fuera del barrido durante un dia entero.
 */
const MARGEN_FECHA_FUTURA_MS = 60 * 60_000;

/**
 * Cuantos mensajes se piden a Gmail a la vez.
 *
 * `messages.get` cuesta 5 unidades de cuota y el limite es de 250 por segundo y
 * usuario: unas 50 llamadas por segundo. Un lote de recuperacion puede traer
 * cientos de ids, y dispararlos todos de golpe -que es lo que hacia el
 * `Promise.all` sobre la lista entera- es la forma mas directa de provocar el
 * 429 que luego se tragaba el `catch`.
 *
 * Diez deja margen de sobra bajo el limite y sigue siendo diez veces mas rapido
 * que ir de uno en uno. No se ha medido cual es el optimo porque el objetivo no
 * es la velocidad: es **no causar el fallo que ademas ocultabamos**.
 */
const TANDA_DESCARGA = 10;

/**
 * Pausa entre tandas de descarga.
 *
 * La cuota de Gmail se mide por ritmo, no por tamaño del lote, así que lo que
 * la agota es la velocidad a la que se encadenan las tandas. Con 10 mensajes
 * por tanda y esta pausa salen **unas 85 peticiones por minuto** sostenidas
 * (10 mensajes cada ~7 s contando lo que tarda la descarga en sí), frente a las
 * ~240 de cuando esto valía 1 s.
 *
 * **Subió a 5 s el 2026-09-11 para digerir el atasco de dos días** sin que
 * Google corte. El coste sigue siendo invisible para quien usa el tablero: la
 * ingesta es de fondo y nadie la está mirando.
 *
 * ⚠️ **El techo de este número no es la cuota: es el timeout de Cloud Run.**
 * El marcador de historial solo avanza **al final** de `syncHistory`, así que
 * una pasada que no termine no avanza nada — y Pub/Sub reintenta desde el mismo
 * sitio. Exactamente el bucle que esto viene a evitar, por la otra puerta.
 *
 * La cuenta, con el servicio desplegado a `--timeout=900s`:
 *
 * ```text
 * tandas = ceil(mensajes / 10)
 * tiempo ≈ (tandas - 1) × PAUSA + tandas × (lo que tarde la descarga, ~2 s)
 * ```
 *
 * Con 5 s salen **~1.100 mensajes por pasada** antes de rozar el timeout; con
 * 8 s, unos 800. Por eso 5 y no 8: el atasco es de dos días y no sabemos
 * cuántos correos son, así que entre los dos valores que se pidieron se elige
 * el que deja más margen mientras frena igual (1/5 del ritmo anterior).
 *
 * Si una pasada empieza a morir por timeout, **subir esto lo empeora**: lo que
 * hay que tocar entonces es cuántos mensajes entran en una pasada, no cuánto se
 * espera entre tandas.
 */
const PAUSA_ENTRE_TANDAS_MS = 5_000;

/**
 * Pausa entre tandas **cuando hay una persona esperando la respuesta**.
 *
 * `fetchMessages` lo usan dos clases de trabajo que no se parecen: la ingesta,
 * que es de fondo y puede tardar lo que haga falta, y `getInbox`, que contesta
 * a `GET /gmail/inbox` con alguien mirando la pantalla.
 *
 * **Sin esta separación, subir la pausa de fondo castiga al usuario**: con
 * `maxResults` en 20 son dos tandas, o sea una espera de 5 s añadida a cada
 * carga de la bandeja; con `?maxResults=100`, diez tandas y **45 s** mirando un
 * spinner. La ingesta puede permitirse gotear porque nadie la mira; esto no.
 *
 * Se queda en el segundo de siempre: es el ritmo que la bandeja llevaba hasta
 * hoy sin dar problemas, y una carga puntual de 20 correos no es lo que atasca
 * la cuota — lo que la atasca es el goteo sostenido de la recuperación.
 */
const PAUSA_INTERACTIVA_MS = 1_000;

/** `setTimeout` en forma de promesa. Sin dependencias: no hace falta más. */
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));


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
 * Espera base antes de que el barrido vuelva a reencolar un correo que ya
 * reencoló. Se dobla en cada intento y se acota en {@link RECONCILIACION_ESPERA_MAX_MS}.
 *
 * Es el cron entero: si un correo acaba de reencolarse, la pasada siguiente no
 * tiene nada nuevo que decirle. Sin esta espera, el barrido cogia los 100 mas
 * antiguos con `processedAt: null`, los reencolaba, fallaban todos -con la
 * clasificacion caida fallan todos- y quince minutos despues cogia
 * **exactamente los mismos 100**. Para siempre y sin avanzar uno: 96 vueltas
 * al dia de 200 operaciones de Redis en bucle cerrado, que es lo que agoto la
 * cuota de Upstash la madrugada del 2026-09-09.
 */
const RECONCILIACION_ESPERA_BASE_MS = 15 * 60_000;

/**
 * Techo de la espera. Un correo que no se clasifica nunca acaba reintentandose
 * una vez al dia en vez de noventa y seis, y **sigue reintentandose**: pararlo
 * del todo seria decidir en silencio que ese correo no existe.
 */
const RECONCILIACION_ESPERA_MAX_MS = 24 * 3_600_000;

/**
 * A partir de aqui, un correo deja de ser «se perdio una vez» y pasa a ser
 * «este no se clasifica». No cambia lo que hace el barrido -sigue
 * reintentandolo, mas espaciado- pero **si lo que se cuenta**, porque son dos
 * averias distintas y hasta ahora se veian iguales.
 */
const RECONCILIACION_INTENTOS_SOSPECHOSOS = 5;

/**
 * Cuanto esperar antes del siguiente reintento del barrido: exponencial desde
 * la ventana del cron y con techo.
 *
 * Con `intentos = 1` sale la ventana entera, asi que un correo reencolado ahora
 * no vuelve a entrar en la pasada de dentro de quince minutos -que es justo la
 * repeticion que hubo que cortar-. A partir de ahi se dobla: 15 min, 30, 1 h,
 * 2 h... hasta el tope de 24 h.
 */
function esperaReconciliacion(intentos: number): number {
  const espera = RECONCILIACION_ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1);
  return Math.min(espera, RECONCILIACION_ESPERA_MAX_MS);
}

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

  private async getLabelIdByName(gmail: GmailClient, name: string): Promise<string | undefined> {
    // Si falla (ej. por cuota 429), la excepción debe propagarse. No abrir la llave en silencio.
    const res = await gmail.users.labels.list({ userId: 'me' });
    const id = res.data.labels?.find((l) => l.name === name)?.id;
    return id ?? undefined;
  }

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

    const labelId = await this.getLabelIdByName(gmail, 'PMO');
    if (!labelId) throw new Error('La etiqueta PMO no existe en Gmail');

    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      labelIds: [labelId],
    });

    const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
    if (ids.length === 0) return [];

    // Lectura para la vista: aqui un fallo de descarga solo significa una fila
    // menos en la lista, no un correo perdido. No hay marcador que retener.
    const { correos } = await this.fetchMessages(
      gmail,
      ids,
      options.includeBody ? 'full' : 'metadata',
      // Aqui hay alguien mirando: la pausa larga de la ingesta convertiria una
      // carga de 20 correos en cinco segundos de spinner.
      PAUSA_INTERACTIVA_MS,
    );
    return correos;
  }

  /**
   * Descarga mensajes y los normaliza, **diciendo cuántos no pudo traer**.
   *
   * ⚠️ **Antes devolvía solo los que salían bien y el resto desaparecía.** Un
   * `catch` por mensaje, un `warn`, `null`, y un `filter` que los borraba de la
   * lista. Quien llamaba no tenía forma de saber que faltaba nada.
   *
   * Eso es `persistEmails` una capa más arriba, con el mismo final y peor: un
   * correo que falla **al descargarse** ni siquiera llega a `persistEmails`, así
   * que **no lo ve ninguno de los contadores del marcador**. El marcador avanza,
   * `users.history.list` deja de mencionarlo, y ese correo no se vuelve a ver
   * nunca. Silencioso, y sin quedar en ningún número.
   *
   * Y **se dispara justo en el peor momento**: al recuperarse de una caída, con
   * un lote grande, que es cuando más probable es que Gmail responda 429 — el
   * caso en el que más correos hay que perder.
   *
   * Ahora el recuento sube, y {@link syncHistory} retiene el marcador si falta
   * algo: el mismo criterio que ya se aplica al `upsert` y al `add`.
   *
   * ⚠️ **`omitidos` no es `fallidos`, y confundirlos era el P0 de la cuota.**
   * Un mensaje **borrado** responde 404 en cada intento, para siempre. Contarlo
   * como fallo hacía que {@link syncHistory} retuviera el marcador para no
   * perderlo — y retener no salva lo que ya no existe: solo garantiza que la
   * siguiente notificación vuelva a descargar el tramo entero, encuentre el
   * mismo 404 y retenga otra vez. Un bucle cerrado que se come la cuota de
   * Gmail, con el agravante de que **cuanta menos cuota queda, más se repite**.
   *
   * Así que hay tres desenlaces por mensaje y no dos:
   *
   * - **Cuota agotada** → se relanza y para la ingesta entera. No es este
   *   correo el que falla, es que Google dejó de atendernos.
   * - **Omisión permanente** (404/410) → se registra, no cuenta, y el marcador
   *   **avanza**. El correo no va a volver por insistir.
   * - **Cualquier otro fallo** → cuenta en `fallidos` y retiene el marcador,
   *   como hasta ahora. Puede ser pasajero, y ahí retener sí salva el correo.
   */
  private async fetchMessages(
    gmail: GmailClient,
    ids: string[],
    format: 'full' | 'metadata',
    // Por defecto, el ritmo de fondo. Quien conteste a una persona pasa
    // `PAUSA_INTERACTIVA_MS` y lo dice en la llamada, que es donde se entiende.
    pausaEntreTandasMs: number = PAUSA_ENTRE_TANDAS_MS,
  ): Promise<{ correos: EmailSnippet[]; fallidos: number; omitidos: number }> {
    const correos: EmailSnippet[] = [];
    let fallidos = 0;
    let omitidos = 0;

    // ─── De tandas, no todos a la vez ──────────────────────────────
    //
    // Era un `Promise.all` sobre la lista entera. Con `maxResults: 500` por
    // página de historial, recuperarse de una caída larga significaba **cientos
    // de peticiones a Gmail disparadas en el mismo instante** — la forma más
    // directa de provocar el 429 que luego se tragaba el `catch`.
    //
    // Las dos mitades se potenciaban: el lote sin tope **causaba** los fallos y
    // el `catch` mudo **los ocultaba**.
    for (let i = 0; i < ids.length; i += TANDA_DESCARGA) {
      const tanda = ids.slice(i, i + TANDA_DESCARGA);

      // ─── Espaciado entre tandas ────────────────────────────────────────
      //
      // El troceado por sí solo no limita el ritmo: diez peticiones, e
      // inmediatamente diez más. La cuota de Gmail se mide en **unidades por
      // minuto y por usuario**, así que lo que la agota no es el tamaño del
      // lote sino la velocidad a la que se encadenan. Esta pausa —solo entre
      // tandas, nunca antes de la primera— convierte una ráfaga en un goteo.
      if (i > 0) {
        await esperar(pausaEntreTandasMs);
      }

      const resultados = await Promise.all(
        tanda.map(async (id): Promise<ResultadoDescarga> => {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id,
              format,
              ...(format === 'metadata' ? { metadataHeaders: ['From', 'Subject', 'Date'] } : {}),
            });
            return this.toEmailSnippet(detail.data);
          } catch (err) {
            // ─── Freno en seco ─────────────────────────────────────────
            //
            // Un correo que falla por lo suyo se cuenta y se sigue: el resto
            // de la bandeja no tiene la culpa. **La cuota agotada es lo
            // contrario**: no es este correo el que falla, es que Google ha
            // dejado de atendernos, y cada petición que mandemos a partir de
            // aquí sólo hunde más el cubo y alarga la penalización.
            //
            // Por eso se relanza envuelta en vez de contarse como `fallidos`.
            // Contarla era el corazón del incendio del 09-08: un 403 subía el
            // contador, el contador retenía el marcador de historial, y el
            // marcador retenido garantizaba que el tramo entero se volviera a
            // descargar en la siguiente notificación. El propio remedio para
            // no perder correos se convirtió en el motor del bucle.
            if (esCuotaAgotada(err)) {
              throw new GmailQuotaError(err, `descargando el mensaje ${id}`);
            }

            // ─── Lo que no va a volver ─────────────────────────────────
            //
            // Un mensaje borrado da 404 hoy, mañana y la semana que viene.
            // Contarlo como fallo retiene el marcador, y el marcador retenido
            // vuelve a pedir este mismo mensaje en la siguiente pasada: el
            // bucle no lo provocaba el borrado, lo provocaba tratarlo como si
            // fuera recuperable.
            //
            // Se registra —no desaparece del relato— pero deja pasar al
            // marcador. `info` y no `warn`: un correo borrado es una cosa
            // normal que pasa en cualquier buzón, y llenar de avisos lo normal
            // es la forma de que nadie lea los avisos de verdad.
            if (esOmisionPermanente(err)) {
              this.logger.log(
                `Mensaje ${id} omitido: Gmail ya no lo tiene (${describirError(err)}). ` +
                  'No cuenta como fallo y el marcador avanza.',
              );
              return OMITIDO;
            }

            this.logger.warn(
              `Error obteniendo detalle del mensaje ${id}: ${describirError(err)}`,
              stackDe(err),
            );
            return null;
          }
        }),
      );

      for (const r of resultados) {
        if (r === OMITIDO) omitidos++;
        else if (r) correos.push(r);
        else fallidos++;
      }
    }

    if (omitidos > 0) {
      this.logger.warn(
        `${omitidos} mensaje(s) de ${ids.length} ya no estan en Gmail y se omiten. ` +
          'El marcador avanza igual: reintentarlos solo gastaria cuota.',
      );
    }

    return { correos, fallidos, omitidos };
  }

  private toEmailSnippet(message: gmail_v1.Schema$Message): EmailSnippet {
    const headers = message.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name)?.value ?? undefined;

    const bodyText = this.extractBodyText(message.payload);

    // ─── Cuerpo vacío: distinguir lo normal de lo anómalo ──────────────
    //
    // **Un cuerpo vacío no es un fallo por sí solo, y esto se supo midiendo.**
    // Los seis casos que había el 2026-08-24 resultó que eran correos **sin
    // texto de verdad**: cinco con un `text/html` que solo envuelve una imagen
    // incrustada —`htmlToText` lo deja en cadena vacía, correctamente— y uno con
    // un PDF y ninguna parte de texto. Gmail devuelve el `snippet` vacío **por
    // el mismo motivo**: no hay nada que previsualizar. Esa correlación que
    // parecía rara tenía una sola causa, y no era el parseo.
    //
    // Registrarlos todos como aviso sería repetir el error del barrido en el
    // log: gritar por una condición conocida y estable hasta que nadie lo lea.
    //
    // Lo que **sí** es anómalo es que haya una parte de texto que no hayamos
    // podido leer — Gmail manda `attachmentId` en vez de `data` cuando la parte
    // pasa de cierto tamaño, y ahí sí se perdería un cuerpo de verdad. Eso no ha
    // ocurrido todavía (242 de 247 correos extrajeron cuerpo), pero cuando
    // ocurra hay que verlo, y hay que verlo **separado del ruido**.
    if (!bodyText) {
      const partes = this.collectParts(message.payload);
      const textoIlegible = partes.filter(
        (p) => p.mimeType?.startsWith('text/') && !p.body?.data && p.body?.attachmentId,
      );

      const forma = partes
        .map((p) => {
          const tiene = p.body?.data ? 'data' : p.body?.attachmentId ? 'attachmentId' : 'vacia';
          return `${p.mimeType ?? '?'}:${tiene}:${p.body?.size ?? 0}`;
        })
        .join(' | ');

      if (textoIlegible.length > 0) {
        // Esto sí es un cuerpo perdido: había texto y no se pudo leer.
        this.logger.warn(
          `Mensaje ${message.id}: hay ${textoIlegible.length} parte(s) de texto con ` +
            `attachmentId que no se descargan, asi que el cuerpo se pierde. partes=[${forma}]`,
        );
      } else {
        // Lo esperado en un correo de solo imagen o solo adjunto. Se deja
        // constancia sin nivel de aviso: no hay nada que arreglar.
        this.logger.log(`Mensaje ${message.id} sin texto (sin parte legible). partes=[${forma}]`);
      }
    }

    const allParts = this.collectParts(message.payload);
    const attachments = this.collectAttachments(allParts);
    const hasAttachments = attachments.length > 0;

    return {
      id: message.id!,
      threadId: message.threadId!,
      snippet: message.snippet ?? '',
      from: header('from') ?? 'Desconocido',
      subject: header('subject') ?? '(Sin Asunto)',
      date: this.fechaDeRecepcion(header('date'), message),
      labels: message.labelIds ?? [],
      bodyText: bodyText || undefined,
      hasAttachments,
      attachments,
    };
  }

  /**
   * Las fichas de los adjuntos de un mensaje ya descargado.
   *
   * ⚠️ **Solo sirve con `format: 'full'`.** Con `'metadata'` Gmail no manda el
   * árbol MIME, así que esto devuelve `[]` — que es correcto para una lista
   * pero no significa «este correo no tiene adjuntos». Los dos sitios que
   * guardan en la base piden `'full'`.
   */
  private collectAttachments(parts: gmail_v1.Schema$MessagePart[]): AttachmentMeta[] {
    const fichas: AttachmentMeta[] = [];

    for (const parte of parts) {
      const attachmentId = parte.body?.attachmentId;
      if (!attachmentId) continue;

      const cabeceras = parte.headers ?? [];
      const cabecera = (nombre: string) =>
        cabeceras.find((h) => h.name?.toLowerCase() === nombre)?.value ?? '';

      // Incrustado si el propio correo lo dice (`inline`) o si tiene un
      // `Content-ID` al que apunta el HTML del cuerpo. Se miran los dos porque
      // no todos los clientes de correo escriben los dos.
      const disposicion = cabecera('content-disposition').toLowerCase();
      const inline = disposicion.startsWith('inline') || cabecera('content-id') !== '';

      fichas.push({
        attachmentId,
        // Sin nombre no es descargable de forma util; se le pone uno antes que
        // enseñar una fila en blanco en la lista de adjuntos.
        filename: parte.filename || '(sin nombre)',
        mimeType: parte.mimeType || 'application/octet-stream',
        size: parte.body?.size ?? 0,
        inline,
      });
    }

    return fichas;
  }

  /**
   * Baja el contenido de un adjunto, ya decodificado.
   *
   * Lo usan la descarga desde el frontend y la lectura por IA. Devuelve el
   * binario y no el base64url de Gmail porque los dos consumidores quieren
   * bytes: uno para mandarlos al navegador y otro para volver a codificarlos
   * como bloque de Anthropic.
   *
   * La cuota se reconoce igual que en `fetchMessages` —un 429 aquí no es «este
   * adjunto falla», es «Google dejó de atendernos»— y se relanza envuelta para
   * que quien la reciba pueda parar en vez de insistir.
   */
  async fetchAttachment(
    userId: string,
    gmailMessageId: string,
    attachmentId: string,
  ): Promise<Buffer> {
    const gmail = await this.getGmailClient(userId);

    try {
      const res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: gmailMessageId,
        id: attachmentId,
      });

      return Buffer.from(res.data.data ?? '', 'base64url');
    } catch (err) {
      if (esCuotaAgotada(err)) {
        throw new GmailQuotaError(err, `descargando el adjunto ${attachmentId}`);
      }
      throw err;
    }
  }


  /**
   * La fecha de recepción del correo, **sin fiarse de la cabecera**.
   *
   * ⚠️ **Esto es una entrada externa y hasta el 2026-08-22 no se validaba.**
   * `receivedAt` salía de `new Date(header('date'))`, y la cabecera `Date:` la
   * escribe **quien manda el correo**. Una fecha malformada daba `Invalid Date`,
   * Prisma lanzaba al guardar, el correo contaba como fallido — y **desde el
   * arreglo del marcador, un fallo detiene el avance de la ingesta**.
   *
   * Es decir: **cualquiera que pueda mandarte un correo podía parar la ingesta**
   * con una cabecera rara. La contrapartida que aceptamos a propósito
   * —«atascarse y gritar es mejor que avanzar y perder»— convertida en un vector
   * externo por una entrada que no validábamos.
   *
   * Y hay un segundo filo, más silencioso: **una fecha futura falsificada deja el
   * correo fuera del barrido para siempre**, porque el barrido busca
   * `receivedAt < ahora - gracia`. No falla: desaparece.
   *
   * El criterio es el mismo que `ai.service.parseDueDate` ya aplicaba al LLM,
   * aquí aplicado al remitente: **si no se puede confiar en el valor, se usa uno
   * que sí y se anota**. Nunca se rechaza el correo entero — eso volvería a parar
   * la ingesta, que es justo lo que se está cerrando.
   *
   * El respaldo es **`internalDate` de Gmail**, no `Date.now()`: es la marca de
   * cuándo lo recibió Gmail, **la pone Google y el remitente no la controla**, y
   * conserva el momento real en vez de sustituirlo por «cuando lo ingerimos».
   *
   * _Se mantiene la cabecera como primera opción y no se cambia a `internalDate`
   * sin más, aunque sea la fuente más fiable, porque eso movería la fecha de los
   * 247 correos ya guardados. Queda dicho para que sea una decisión y no un
   * descuido._
   */
  private fechaDeRecepcion(cabecera: string | undefined, message: gmail_v1.Schema$Message): string {
    const deGmail = message.internalDate ? new Date(Number(message.internalDate)) : undefined;
    const respaldo = deGmail && !Number.isNaN(deGmail.getTime()) ? deGmail : new Date();

    if (!cabecera) return respaldo.toISOString();

    const fecha = new Date(cabecera);
    if (Number.isNaN(fecha.getTime())) {
      this.logger.warn(
        `Cabecera Date ilegible en el mensaje ${message.id}: se usa la fecha de Gmail. ` +
          `Valor recibido: ${JSON.stringify(cabecera).slice(0, 120)}`,
      );
      return respaldo.toISOString();
    }

    // Una fecha por delante del reloj no es un error de formato: es una
    // afirmación del remitente que no podemos comprobar, y que además sacaría
    // el correo del barrido para siempre. Se admite un margen para desajustes
    // de reloj entre servidores de correo, que son de minutos, no de días.
    if (fecha.getTime() > Date.now() + MARGEN_FECHA_FUTURA_MS) {
      this.logger.warn(
        `Cabecera Date en el futuro en el mensaje ${message.id} (${fecha.toISOString()}): ` +
          'se usa la fecha de Gmail. Sin esto el correo quedaria fuera del barrido para siempre.',
      );
      return respaldo.toISOString();
    }

    return fecha.toISOString();
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

  /**
   * Las etiquetas del buzón, para traducir los identificadores que vienen en
   * cada correo a algo que se pueda leer.
   *
   * `Email.labels` guarda lo que manda Gmail —`INBOX`, `CATEGORY_PERSONAL`,
   * `Label_8214…`— y el frontend estaba pintando eso tal cual. Los de usuario
   * son los peores: `Label_8214` no significa nada para nadie, y es justo el
   * que la persona creó y nombró.
   *
   * ⚠️ **Esto traduce los de usuario, no humaniza los del sistema.** Para
   * `INBOX`, Gmail devuelve `name: "INBOX"` — el nombre *es* la constante. Que
   * en la pantalla ponga «Recibidos» es cosa del frontend, con un diccionario
   * suyo: la API no tiene una traducción que dar y fingir que sí sería inventar.
   * Por eso viaja `type`, que es lo que permite distinguir cuáles hay que
   * traducir a mano (`system`) y cuáles ya vienen con su nombre (`user`).
   *
   * Sin caché a propósito: `labels.list` cuesta **una unidad** de cuota, y
   * meterlo en Redis cambiaría esa unidad por una operación de Upstash, que es
   * justo el recurso que se agotó el 09-09. Si algún día pesa, el sitio donde
   * cachear es el navegador, que ya tiene la sesión abierta.
   */
  async listLabels(userId: string): Promise<GmailLabel[]> {
    const gmail = await this.getGmailClient(userId);
    const res = await gmail.users.labels.list({ userId: 'me' });

    return (res.data.labels ?? [])
      // `l?.` y no `l.`: un filtro defensivo que revienta con lo que dice
      // descartar es peor que no tenerlo — el fallo sale de la linea que
      // existia para evitarlo, y buscarlo lleva al sitio equivocado.
      .filter((l): l is { id: string; name: string; type?: string | null } =>
        Boolean(l?.id && l?.name),
      )
      .map((l) => ({
        id: l.id,
        name: l.name,
        // `system` o `user`. Se normaliza a `user` si Gmail no lo dice: una
        // etiqueta sin tipo declarado no es del sistema, y tratarla como tal
        // haría que el frontend buscara una traducción que no existe.
        type: l.type === 'system' ? 'system' : 'user',
      }));
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

      const descarga =
        messageIds.length > 0
          ? await this.fetchMessages(gmail, messageIds, 'full')
          : { correos: [], fallidos: 0, omitidos: 0 };

      const recuento = await this.persistEmails(userId, descarga.correos);

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
      // ⚠️ **`descarga.fallidos` cuenta aqui, y es la mitad que faltaba.** Un
      // correo que falla al DESCARGARSE no llega a `persistEmails`, asi que no
      // aparece en ninguno de sus contadores. Sin esta suma, el marcador
      // avanzaba y ese correo no se volvia a ver nunca — el mismo agujero de
      // §37.1 una capa mas arriba, y disparandose justo al recuperarse de una
      // caida, que es cuando mas correos hay que perder.
      // ⚠️ **`sinEncolar` NO retiene el marcador, y se sacó a propósito el
      // 2026-09-09.** Es la diferencia entre «el correo no existe» y «el correo
      // existe pero todavía no lo ha clasificado nadie», y solo la primera es
      // irrecuperable desde aquí.
      //
      // Un correo guardado sin encolar **ya tiene una red debajo**:
      // `reconciliarSinClasificar()` busca `processedAt: null` cada quince
      // minutos —que es exactamente este conjunto— y lo reencola. Retener el
      // marcador además de eso no lo salvaba dos veces: costaba **volver a
      // descargar el tramo entero en cada notificación de Pub/Sub**.
      //
      // Y ese coste fue el motor del P0 del 08-09. Con la clasificación caída
      // por una clave inválida, *todos* los correos quedaban `sinEncolar`, así
      // que el marcador no avanzaba nunca y cada aviso redescargaba lo mismo
      // hasta agotar la cuota de Gmail. Entonces el 403 pasó a contar como
      // `descarga.fallidos` —otro motivo para retener— y el bucle se cerró
      // sobre sí mismo.
      //
      // Los otros dos siguen reteniendo, y ahí no hay red que valga:
      // `recuento.fallidos` es un `upsert` que falló —el correo no está en
      // ninguna parte— y `descarga.fallidos` es uno que Gmail no dejó bajar,
      // que tampoco llegó a la base. Si el marcador avanzara, ninguno de los
      // dos se volvería a ver: `users.history.list` ya no los mencionaría.
      // ⚠️ **`descarga.omitidos` tampoco retiene, y es el arreglo del P0 de la
      // cuota (2026-09-11).** Son los 404: mensajes que Gmail ya no tiene
      // porque se borraron. Retener el marcador existe para no perder un correo
      // que sigue ahí; con uno borrado no hay nada que salvar, y lo único que
      // se consigue es que la siguiente notificación redescargue el tramo
      // entero, se encuentre el mismo 404 y retenga otra vez. El bucle no lo
      // causaba el borrado: lo causaba tratarlo como recuperable.
      const quedaPendiente = descarga.fallidos > 0 || recuento.fallidos > 0;
      const newHistoryId = quedaPendiente
        ? startHistoryId
        : (notifiedHistoryId ?? latestHistoryId ?? startHistoryId);

      if (!quedaPendiente) {
        await this.saveHistoryId(userId, newHistoryId);
      }

      this.logger.log(
        `Sync incremental para ${userId}: ${recuento.encolados} encolado(s), ` +
          `${recuento.guardados} guardado(s), ${descarga.fallidos} sin descargar, ` +
          `${descarga.omitidos} omitido(s), ${recuento.fallidos} fallido(s), ` +
          `${recuento.sinEncolar} sin encolar · historyId ${startHistoryId} → ${newHistoryId}` +
          (quedaPendiente ? ' (marcador RETENIDO: se reintentara el mismo tramo)' : ''),
      );

      if (quedaPendiente) {
        await this.alertas.avisar(
          'Sincronizacion de Gmail incompleta: el marcador no avanza',
          `Usuario ${userId}: ${descarga.fallidos} sin descargar y ${recuento.fallidos} ` +
            `sin guardar. Esos correos no estan en la base, asi que el marcador se queda ` +
            `en ${startHistoryId} y se reintentara el mismo tramo. Si esto se repite, ` +
            'mira los avisos anteriores: un correo que falla siempre atasca la ingesta ' +
            'y los historyId caducan a la semana.',
          `gmail-sync-incompleta:${userId}`,
        );
      }

      // Los `sinEncolar` se registran pero **no avisan desde aqui**: el barrido
      // de reconciliacion ya tiene su propio aviso para los huerfanos, con
      // freno y contando solo los ids nuevos. Duplicarlo gastaria el canal, y
      // un canal que avisa de mas es un canal que ya nadie lee.
      if (recuento.sinEncolar > 0) {
        this.logger.warn(
          `Sync de ${userId}: ${recuento.sinEncolar} correo(s) guardado(s) pero NO encolado(s). ` +
            'El marcador avanza igual; los recoge el barrido de reconciliacion en <=15 min.',
        );
      }

      return { processed: recuento.encolados, mode: 'incremental', historyId: newHistoryId };
    } catch (err) {
      // ─── La cuota va PRIMERO, y el orden no es estético ─────────────────
      //
      // Debajo, un error manda a `backfill`. `backfill` hace un `messages.list`
      // y hasta 25 `messages.get` **más**: si llegamos aquí porque Google ya no
      // nos atiende, caer ahí es echar gasolina — y encima `backfill` **avanza
      // el marcador a propósito**, así que un backfill que se queda a medias
      // por falta de cuota nos deja el `historyId` movido y el tramo real sin
      // ingerir. Perder correos por intentar arreglar la cuota.
      //
      // Se para aquí, con el marcador intacto —no se ha tocado en toda esta
      // rama— y se deja subir para que el worker pause la cola.
      if (err instanceof GmailQuotaError || esCuotaAgotada(err)) {
        const quota = err instanceof GmailQuotaError ? err : new GmailQuotaError(err, 'sincronizando');

        this.logger.warn(
          `Cuota de Gmail agotada para ${userId}: se detiene la ingesta y el marcador ` +
            `se queda en ${startHistoryId}. ${describirError(quota.causaOriginal)}`,
        );

        await this.alertas.avisar(
          'Cuota de Gmail agotada: ingesta detenida',
          `Usuario ${userId}: Google responde 403/429 por cuota. La ingesta se para y el ` +
            `historyId se queda en ${startHistoryId} sin avanzar, asi que no se pierde el ` +
            'tramo. Se reanuda sola cuando el cubo se rellene. Si esto se repite sin parar, ' +
            'busca que esta reteniendo el marcador: un marcador que no avanza hace que cada ' +
            'notificacion redescargue el mismo tramo, y eso agota la cuota por si solo. ' +
            'Hoy solo lo retienen un correo que no se pudo descargar o un upsert que fallo ' +
            '(mira el aviso gmail-sync-incompleta, que dice cuantos son de cada). Los ' +
            'correos guardados sin encolar dejaron de retenerlo el 2026-09-09, y los ' +
            'mensajes borrados en Gmail el 2026-09-11.',
          `gmail-cuota-agotada:${userId}`,
        );

        throw quota;
      }

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
    const labelId = await this.getLabelIdByName(gmail, 'PMO');
    if (!labelId) throw new Error('La etiqueta PMO no existe en Gmail');

    do {
      paginas++;
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'labelAdded'],
        labelId,
        maxResults: 500,
        pageToken,
      });

      for (const entry of res.data.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          if (added.message?.id) ids.add(added.message.id);
        }
        for (const added of entry.labelsAdded ?? []) {
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
    const labelId = await this.getLabelIdByName(gmail, 'PMO');
    if (!labelId) throw new Error('La etiqueta PMO no existe en Gmail. Abortando resincronización.');

    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: BACKFILL_SIZE,
      labelIds: [labelId],
    });

    const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
    const descarga =
      ids.length > 0
        ? await this.fetchMessages(gmail, ids, 'full')
        : { correos: [], fallidos: 0, omitidos: 0 };
    const recuento = await this.persistEmails(userId, descarga.correos);

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
        `${recuento.guardados} guardado(s), ${descarga.fallidos} sin descargar, ` +
        `${descarga.omitidos} omitido(s), ${recuento.fallidos} fallido(s), ` +
        `${recuento.sinEncolar} sin encolar · historyId → ${historyId}`,
    );

    if (descarga.fallidos > 0 || recuento.fallidos > 0 || recuento.sinEncolar > 0) {
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
            hasAttachments: email.hasAttachments,
            // Se reescriben en cada pasada: un reproceso del mismo tramo trae
            // las fichas otra vez y son las buenas. Y va como `Json` sin
            // ceremonia porque `AttachmentMeta` ya es JSON plano.
            attachments: email.attachments as unknown as Prisma.InputJsonValue,
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
            hasAttachments: email.hasAttachments,
            attachments: email.attachments as unknown as Prisma.InputJsonValue,
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
    // tope se llena, se grita.
    //
    // ⚠️ **Y el contador de intentos por correo, que aqui se llamaba
    // «complejidad especulativa para un problema que no existe», ya existe.**
    // El problema llego el 2026-09-08: con la clasificacion caida por una clave
    // invalida, *todos* los candidatos fallaban, ninguno conseguia `processedAt`
    // y este mismo `findMany` -ordenado por `receivedAt` ascendente- devolvia
    // los mismos 100 cada quince minutos. El aviso del canal lo dejo escrito
    // con el tope exacto: «100 correo(s) nuevo(s) ... (100 reencolado(s))».
    //
    // `reconcileAfter` es lo que rompe esa repeticion: un correo recien
    // reencolado no vuelve a entrar hasta que su espera venza, y la espera se
    // dobla en cada intento. Un correo sano lo cruza una vez; uno atascado se
    // aparta solo.
    const ahora = new Date();
    const huerfanos = await this.prisma.email.findMany({
      where: {
        processedAt: null,
        receivedAt: { lt: limite },
        // `null` es «nunca se ha intentado», que es elegible. Prisma no lo
        // incluiria en un `lte` a secas: en SQL, `NULL <= ahora` no es cierto.
        OR: [{ reconcileAfter: null }, { reconcileAfter: { lte: ahora } }],
      },
      select: { id: true, reconcileAttempts: true },
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

    let atascados = 0;

    for (const { id, reconcileAttempts } of huerfanos) {
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

        // El intento se anota **despues** de encolar y solo si encolar salio
        // bien: si el `add` falla no ha habido intento que contar, y penalizar
        // al correo por un tropiezo de Redis lo apartaria por algo que no es
        // suyo. El contador mide «cuantas veces le hemos dado su oportunidad»,
        // no «cuantas veces hemos pasado por aqui».
        const intentos = reconcileAttempts + 1;
        if (intentos >= RECONCILIACION_INTENTOS_SOSPECHOSOS) atascados++;

        await this.prisma.email.update({
          where: { id },
          data: {
            reconcileAttempts: intentos,
            reconcileAfter: new Date(Date.now() + esperaReconciliacion(intentos)),
          },
        });
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

    // ⚠️ **Dos averias distintas que hasta ahora se veian iguales.**
    //
    // Un correo que se perdio una vez y uno que **no se clasifica nunca** salen
    // los dos en este barrido, pero piden cosas opuestas: el primero se arregla
    // solo al reencolarlo, y el segundo seguira apareciendo cada vez con la
    // espera mas larga hasta que alguien mire por que. Sin este contador, el
    // aviso decia «N correos sin encolar» en los dos casos y el segundo se leia
    // como ruido del primero.
    if (atascados > 0) {
      this.logger.warn(
        `Reconciliacion: ${atascados} correo(s) llevan ${RECONCILIACION_INTENTOS_SOSPECHOSOS} ` +
          'reintentos o mas sin llegar a clasificarse. Ya no es un correo perdido: es uno ' +
          'que falla siempre. Miralos en la DLQ de `classify-email`.',
      );
    }

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
    // ⚠️ **Con testigos, porque un 0 puede ser una buena noticia o una consulta
    // rota, y desde fuera se ven igual.**
    //
    // `total` y `conSnippet` son el control: si `conSnippet` sale 0 tambien, el
    // que no funciona es el operador `not: ''` sobre una columna que admite
    // nulos, no la ingesta. Y `sinCuerpo` tiene que cuadrar con la suma
    // -`soloSnippet` + los cerrados sin texto- o falta algo por entender.
    //
    // Es el mismo error que llevamos una semana persiguiendo, aplicado a una
    // medicion: **un numero que no se puede distinguir de su propio fallo no
    // mide nada**.
    const [soloSnippet, sinCuerpo, conSnippet, total] = await Promise.all([
      this.prisma.email.count({ where: { bodyText: null, snippet: { not: '' } } }),
      this.prisma.email.count({ where: { bodyText: null } }),
      this.prisma.email.count({ where: { snippet: { not: '' } } }),
      this.prisma.email.count(),
    ]);

    this.logger.log(
      `SONDA alcance · solo-snippet=${soloSnippet} · sin-cuerpo=${sinCuerpo} · ` +
        `con-snippet=${conSnippet} · total=${total}`,
    );

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
      const pmoLabelId = await this.getLabelIdByName(gmail, 'PMO');
      if (!pmoLabelId) {
        throw new Error('La etiqueta PMO no existe en la cuenta de Gmail');
      }

      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: { labelIds: [pmoLabelId], topicName },
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
