import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmailStatus, Task, TaskPriority, TaskSource, TaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailClassificationService, aJsonDeBorradores } from '../ai/email-classification.service';
import { ConfirmedTaskDto, ToTaskDto } from './dto/to-task.dto';
import type { ProposedTask } from '@pmo/shared';
import { QueryEmailsDto } from './dto/query-emails.dto';
import { QueryThreadsDto } from './dto/query-threads.dto';
import { TasksGateway } from '../tasks/tasks.gateway';
import { TagsService } from '../tags/tags.service';
import { AttachmentMeta, GmailService } from '../gmail/gmail.service';

/** Un correo tal y como lo necesita la bandeja de triage del tablero. */
export interface TriageEmail {
  id: string;
  subject: string;
  from: string;
  /** ISO 8601, para que el cliente la formatee como quiera. */
  date: string;
  category: string | null;
  /** Triage de la persona: PENDING · IN_PROGRESS · COMPLETED · DISMISSED. */
  status: EmailStatus;
  /**
   * Veredicto del modelo: si de este correo sale trabajo o no.
   *
   * Estaba en la base desde el Sprint 3 y en `GET /emails/:id`, pero **no en el
   * listado**, así que la bandeja no podía ni filtrar por él ni ofrecer «marca
   * todos los no accionables». Es el campo que desbloqueó la Fase 7.
   *
   * ⚠️ **Un `false` no siempre es un veredicto.** La columna nace en `false` y
   * sigue ahí mientras nadie clasifique el correo, así que «no accionable» y
   * «todavía sin mirar» se leen igual desde aquí. Para separarlos hace falta
   * `processedAt`, y por eso `GET /emails/threads` no decide `allNonActionable`
   * solo con este campo.
   */
  isActionable: boolean;
  taskCount: number;
  /** Ya generó tareas: `to-task` daría 409 salvo que se insista con `force`. */
  isConverted: boolean;
  /** Número de tareas propuestas por la IA que esperan revisión en cuarentena. */
  proposedTaskCount: number;
  /** Indica si el correo contiene archivos adjuntos. */
  hasAttachments: boolean;
  /** Hilo de Gmail, para agrupar la lista como hace la bandeja. */
  threadId: string;
  /**
   * Empresa del grupo y banco que la IA reconoció en el correo, del vocabulario
   * cerrado de `@pmo/shared`. Son las pestañas de la bandeja.
   *
   * `null` es el caso normal y **no** significa «sin clasificar»: significa que
   * el correo no menciona ninguno de los que nos importan. Un correo que nadie
   * ha procesado tiene los dos en `null` igual que uno analizado sin banco —
   * para separarlos está `processedAt`, la misma trampa que con `isActionable`.
   */
  company: string | null;
  bank: string | null;
  /** Etiquetas de Gmail (`INBOX`, `UNREAD`, `CATEGORY_*`…), para los filtros. */
  labels: string[];
  /** Vista previa corta. Cadena vacía si el correo no la trae. */
  snippet: string;
  /**
   * El id del mensaje en Gmail. No sirve para `classify` ni `to-task` —para eso
   * está `id`— pero permite casar esta lista con la que devuelve
   * `GET /gmail/inbox` sin tener que adivinar por asunto y fecha.
   */
  gmailMessageId: string;
}

/**
 * Columnas que necesita una fila de la bandeja. Vive fuera de la clase porque
 * lo comparten el listado y la respuesta de `PATCH /:id/status`: si cada uno
 * escribiera su propio `select`, acabarían devolviendo formas distintas del
 * mismo correo.
 */
const SELECT_TRIAGE = {
  id: true,
  subject: true,
  from: true,
  receivedAt: true,
  category: true,
  status: true,
  isActionable: true,
  company: true,
  bank: true,
  threadId: true,
  labels: true,
  snippet: true,
  gmailMessageId: true,
  proposedTasks: true,
  hasAttachments: true,
  _count: { select: { tasks: true } },
} as const;

type FilaTriage = {
  id: string;
  subject: string | null;
  from: string;
  receivedAt: Date;
  category: string | null;
  status: EmailStatus;
  isActionable: boolean;
  company: string | null;
  bank: string | null;
  threadId: string;
  labels: string[];
  snippet: string | null;
  gmailMessageId: string;
  proposedTasks: Prisma.JsonValue;
  hasAttachments: boolean;
  _count: { tasks: number };
};

function aTriageEmail(email: FilaTriage): TriageEmail {
  return {
    id: email.id,
    // El asunto es opcional en la base y la bandeja necesita algo que pintar:
    // una fila sin texto parece un fallo de carga.
    subject: email.subject ?? '(sin asunto)',
    from: email.from,
    date: email.receivedAt.toISOString(),
    category: email.category,
    status: email.status,
    isActionable: email.isActionable,
    company: email.company,
    bank: email.bank,
    taskCount: email._count.tasks,
    isConverted: email._count.tasks > 0,
    proposedTaskCount: Array.isArray(email.proposedTasks) ? email.proposedTasks.length : 0,
    hasAttachments: email.hasAttachments,
    threadId: email.threadId,
    labels: email.labels,
    snippet: email.snippet ?? '',
    gmailMessageId: email.gmailMessageId,
  };
}

/**
 * El `where` de la bandeja, común al listado plano y al agrupado por hilos.
 *
 * Vive fuera de la clase por el mismo motivo que `SELECT_TRIAGE`: `GET /emails`
 * y `GET /emails/threads` tienen que estar mirando **el mismo conjunto de
 * correos**, o el contador de hilos hablaría de una bandeja distinta de la que
 * se pinta. Con dos `where` escritos aparte, la divergencia no la ve el
 * compilador — se ve en pantalla, como un total que no cuadra con las filas.
 */
function filtroDeBandeja(userId: string, query: QueryEmailsDto): Prisma.EmailWhereInput {
  return {
    userId,
    ...(query.actionable === undefined ? {} : { isActionable: query.actionable }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.company === undefined ? {} : { company: query.company }),
    ...(query.bank === undefined ? {} : { bank: query.bank }),
    // `converted` se traduce a "tiene o no tiene tareas", que es justo lo
    // que hace que `to-task` responda 409. `processedAt` no sirve para
    // esto: el worker lo marca aunque no crease ni una tarea.
    ...(query.converted === undefined
      ? {}
      : query.converted
        ? { tasks: { some: {} } }
        : { tasks: { none: {} } }),
  };
}

/**
 * Lo que necesita una fila para agruparse en un hilo: todo lo del listado, más
 * las dos marcas con las que se distingue «el modelo dijo que no hay nada que
 * hacer» de «nadie ha mirado este correo todavía».
 */
const SELECT_HILO = {
  ...SELECT_TRIAGE,
  processedAt: true,
  skipReason: true,
} as const;

type FilaHilo = FilaTriage & {
  processedAt: Date | null;
  skipReason: string | null;
};

/**
 * ¿Este correo es no accionable **porque el modelo lo dijo**?
 *
 * `isActionable` nace en `false` y se queda ahí hasta que alguien clasifique el
 * correo, así que la columna sola no distingue un veredicto de un valor por
 * defecto. Preguntarle solo a ella metería en «marca todos los no accionables»
 * los correos que nadie ha analizado — y esos son justo los que no se pueden
 * descartar a ciegas, porque puede haber trabajo dentro.
 *
 * Por eso hacen falta las tres condiciones: el worker lo despachó
 * (`processedAt`), la IA llegó a opinar (`skipReason` vacío: si está puesto, el
 * correo se saltó la clasificación y su `false` no significa nada) y el
 * veredicto fue que no.
 */
function esNoAccionableConVeredicto(email: FilaHilo): boolean {
  return email.processedAt !== null && email.skipReason === null && !email.isActionable;
}

/** Un hilo de decisión: los correos de un mismo `threadId` vistos como uno. */
export interface DecisionThread {
  threadId: string;
  /** Correos del hilo **que pasan el filtro**, no los del hilo en Gmail. */
  messageCount: number;
  /** Del más reciente al más antiguo. Es lo que manda `bulk-dismiss`. */
  emailIds: string[];
  /** El más reciente, en la forma exacta de una fila de `GET /emails`. */
  latest: TriageEmail;
  /**
   * Todo el hilo es no accionable con veredicto del modelo detrás. Es la
   * condición del atajo «descarta esto entero», y por eso es `every` y no
   * `some`: basta un mensaje con trabajo dentro para que el hilo no se pueda
   * barrer sin mirarlo.
   */
  allNonActionable: boolean;
  /** Suma de las propuestas en cuarentena de todo el hilo. */
  proposedTaskCount: number;
  /** Algún mensaje del hilo trae adjuntos. */
  hasAttachments: boolean;
}

/** Una página de hilos, con los dos totales que el cliente necesita. */
export interface ThreadPage {
  items: DecisionThread[];
  /** Hilos que deja el filtro, no los de esta página. */
  total: number;
  /**
   * Correos que deja el filtro. Va junto al de hilos para que la pantalla pueda
   * decir «401 hilos · 728 correos» sin inventarse ninguno de los dos números
   * ni tener que bajarse la bandeja entera para contarlos.
   */
  totalEmails: number;
}

/**
 * Convierte los correos de un mismo hilo en la tarjeta que se pinta.
 *
 * `grupo` llega **ordenado del más reciente al más antiguo**, que es de donde
 * sale `latest` sin volver a ordenar.
 */
function aHiloDeDecision(grupo: FilaHilo[]): DecisionThread {
  const [ultimo] = grupo;

  return {
    threadId: ultimo.threadId,
    messageCount: grupo.length,
    emailIds: grupo.map((email) => email.id),
    latest: aTriageEmail(ultimo),
    allNonActionable: grupo.every(esNoAccionableConVeredicto),
    proposedTaskCount: grupo.reduce(
      (suma, email) => suma + (Array.isArray(email.proposedTasks) ? email.proposedTasks.length : 0),
      0,
    ),
    hasAttachments: grupo.some((email) => email.hasAttachments),
  };
}

/**
 * Por qué un id del lote no se movió.
 *
 * **Se programa contra el código, nunca contra el texto** — la misma regla que
 * el handshake del socket. Son los tres motivos posibles y no hay un cuarto:
 * cualquier id que no acabe en `updated` sale por uno de estos.
 */
export const MOTIVO_OMISION = {
  /** No existe, o no es de quien lo pide. Los dos casos se ven igual a propósito. */
  noEncontrado: 'NOT_FOUND',
  /** Ya estaba descartado: no hay nada que hacer, y no es un fallo. */
  yaDescartado: 'ALREADY_DISMISSED',
  /** Estaba en `IN_PROGRESS` o `COMPLETED` y el lote vino sin `force`. */
  noPendiente: 'NOT_PENDING',
} as const;

export type MotivoOmision = (typeof MOTIVO_OMISION)[keyof typeof MOTIVO_OMISION];

/** Un id que el lote no movió, con el motivo. */
export interface BulkDismissSkip {
  id: string;
  reason: MotivoOmision;
}

/**
 * Resultado de un descarte masivo.
 *
 * **Se cumple siempre `updated + skipped.length === requested`.** Es lo que
 * permite al cliente comprobar la respuesta en vez de creerla, y el motivo de
 * que los ids repetidos se cuenten una sola vez.
 */
export interface BulkDismissResult {
  /** Ids distintos que se pidieron mover. */
  requested: number;
  updated: number;
  skipped: BulkDismissSkip[];
}

/**
 * Un adjunto tal y como lo ve el frontend.
 *
 * Es `AttachmentMeta` **sin `attachmentId`**... no: lo lleva, porque es lo que
 * hay que poner en la URL de descarga. Lo que no lleva nunca es contenido.
 */
export type EmailAttachment = AttachmentMeta;

/**
 * Lee la columna `attachments` como lo que es: una lista de fichas, o nada.
 *
 * Mismo criterio que `tareasPropuestas`: una columna `Json` puede contener
 * cualquier cosa, así que afirmarle al compilador que es un array sin mirarlo
 * es justo el `as` que se quiere evitar. Un correo anterior a la Fase 8 tiene
 * `null` aquí y sale como lista vacía.
 */
function fichasDeAdjuntos(valor: Prisma.JsonValue | null | undefined): EmailAttachment[] {
  if (!Array.isArray(valor)) return [];
  return valor as unknown as EmailAttachment[];
}

/** Un adjunto listo para mandar al navegador. */
export interface AttachmentDownload {
  filename: string;
  mimeType: string;
  contenido: Buffer;
}

/** Una tarea que ese correo ya generó, en su versión corta. */
export interface EmailTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
}

/** El correo completo, para la vista de lectura previa a la cuarentena. */
export interface EmailDetail extends TriageEmail {
  /** Texto completo. `null` si el correo se guardó sin cuerpo. */
  bodyText: string | null;
  // `isActionable` ya no se declara aquí: lo hereda de `TriageEmail` desde la
  // Fase 7. Estaba en las dos, y dos declaraciones del mismo campo son dos
  // sitios donde cambiar su tipo el día que cambie.
  /** ISO 8601, o `null` si el worker todavía no lo ha despachado. */
  processedAt: string | null;
  /**
   * Los adjuntos del correo, sin contenido. Cada uno se baja por
   * `GET /emails/:id/attachments/:attachmentId`.
   *
   * Va en el detalle y no en el listado a propósito: la bandeja ya sabe con
   * `hasAttachments` si pintar el clip, y cargar la lista de las 50 filas de
   * una página para enseñar un icono sería pagar por lo que no se mira.
   */
  attachments: EmailAttachment[];
  /** Las tareas propuestas por la IA que aún no se han convertido. */
  proposedTasks?: ProposedTask[] | null;
  /** Las tareas que ya salieron de este correo, en el orden del tablero. */
  tasks: EmailTaskSummary[];
}

export interface ToTaskResult {
  emailId: string;
  /**
   * `'confirmed'` si el cuerpo traía `tasks[]` (aprobación desde la cuarentena)
   * o `'manual'` si traía `title`.
   *
   * `'ai'` desapareció en la Fase 6 (P6): ya no hay una vía que cree lo que
   * diga el modelo sin que nadie lo mire.
   */
  mode: 'confirmed' | 'manual';
  /**
   * Quedaba del modo `'ai'` y hoy es siempre `false`. Se mantiene en la
   * respuesta para no romper a quien ya la lee; retirarlo es una limpieza de
   * contrato que hay que coordinar con el frontend.
   */
  usedFallback: boolean;
  tasks: Task[];
}

/**
 * Estados desde los que volver a `PENDING` es una reapertura, no un movimiento
 * más: el correo ya lo despachó su dueño.
 *
 * `PENDING` no está en la lista a propósito — marcar como pendiente lo que ya
 * lo está no reabre nada, así que no hay nada que proteger ni que forzar.
 */
const YA_DESPACHADOS: EmailStatus[] = [
  EmailStatus.IN_PROGRESS,
  EmailStatus.COMPLETED,
  EmailStatus.DISMISSED,
];

/** ¿Este movimiento saca al correo de "despachado" y lo devuelve a la bandeja? */
function esReapertura(actual: EmailStatus, destino: EmailStatus): boolean {
  return destino === EmailStatus.PENDING && YA_DESPACHADOS.includes(actual);
}

/**
 * `ProposedTask` **vive en `@pmo/shared`** y se reexporta aquí para que los
 * consumidores del servicio no tengan que cambiar de import.
 *
 * Estaba declarado dos veces —aquí y en shared— con **cinco diferencias entre
 * las dos copias**: el frontend leía `tagIds` de la de shared y el backend
 * emitía `aiConfidence` y `source` desde esta, así que cada lado compilaba
 * contra una verdad distinta sobre el mismo JSON. Compilar no era la prueba de
 * nada: era el síntoma.
 *
 * ⚠️ `dueDate` es una **cadena ISO, no un `Date`**, y eso vale para las dos
 * vías. Un borrador vive en una columna `Json`, así que lo que se relee es lo
 * que Prisma dejó escrito: texto. Mientras el tipo decía `Date`, el recién
 * clasificado traía un objeto y el releído una cadena, y un `.toISOString()`
 * sobre el segundo reventaba en ejecución sin que el compilador lo viera.
 */
export type { ProposedTask } from '@pmo/shared';

/**
 * Lee la columna `proposedTasks` como lo que es: una lista de propuestas, o
 * nada.
 *
 * Una columna `Json` puede contener **cualquier cosa** —el tipo de Prisma es
 * `JsonValue`, que incluye `null`, un número o una cadena suelta—, así que
 * afirmarle al compilador que es un array sin mirarlo es exactamente el `as`
 * que había aquí. Si algún día una fila trae otra cosa, esto devuelve una lista
 * vacía en vez de reventar al recorrerla.
 */
function tareasPropuestas(valor: Prisma.JsonValue | null | undefined): ProposedTask[] {
  return Array.isArray(valor) ? (valor as unknown as ProposedTask[]) : [];
}

/** Lo que el modelo propone para un correo, sin haber escrito nada. */
export interface ClassificationResult {
  emailId: string;
  category: string;
  isActionable: boolean;
  aiConfidence: number;
  tasks: ProposedTask[];
  /**
   * Empresa y banco que el modelo acaba de reconocer, o `null`.
   *
   * Viajan en la propuesta y no solo en la fila guardada porque la cuarentena
   * enseña lo que va a pasar **antes** de que pase: si `?force=true` cambia el
   * banco de un correo, quien está mirando la pantalla tiene que verlo ahí, no
   * descubrirlo al recargar la bandeja.
   */
  company: string | null;
  bank: string | null;
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classification: EmailClassificationService,
    private readonly gateway: TasksGateway,
    private readonly tags: TagsService,
    private readonly gmail: GmailService,
  ) {}

  /**
   * Mueve el correo de estado en el triage (Inbox Zero, Sprint 4).
   *
   * El estado es de la persona, no del sistema: `processedAt` dice que el
   * worker ya analizó el correo, y eso puede convivir con un `PENDING` porque
   * su dueño todavía no lo ha despachado. Por eso es una columna aparte y no
   * una lectura derivada de las marcas que ya había.
   *
   * **La bandeja avanza, no retrocede.** Un correo ya despachado —en proceso,
   * hecho o descartado— no vuelve a `PENDING` por las buenas: si lo hiciera,
   * bastaría un clic descuidado para que reapareciera en la bandeja trabajo que
   * alguien ya dio por cerrado, y el "Inbox Zero" dejaría de significar nada.
   * Reabrirlo responde **409** y hace falta insistir con `force`.
   *
   * `force` es la excepción del dueño: reabrir es legítimo —el correo se
   * despachó por error, o el asunto ha vuelto— pero tiene que ser deliberado.
   * Queda anotado en el log, que es el único rastro de una decisión que salta
   * la regla.
   *
   * El resto de movimientos no se juzgan: de pendiente a hecho, de descartado a
   * en proceso o volver a marcar lo que ya estaba igual son cosa de quien
   * gestiona su bandeja.
   */
  async updateStatus(
    userId: string,
    emailId: string,
    status: EmailStatus,
    socketId?: string,
    force = false,
  ): Promise<TriageEmail> {
    // Leer y escribir dentro de la misma transacción: entre comprobar el estado
    // de partida y guardar el nuevo cabe otra pestaña moviendo el mismo correo,
    // y la regla se aplicaría sobre un estado que ya no es el que hay.
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.email.findFirst({
        // Por `userId` además de por `id`: sin esto, cualquier sesión válida
        // movería el correo de otra persona con solo conocer su id.
        where: { id: emailId, userId },
        select: { status: true },
      });

      if (!actual) {
        throw new NotFoundException(`No existe el correo ${emailId}`);
      }

      if (esReapertura(actual.status, status) && !force) {
        throw new ConflictException(
          `El correo ${emailId} ya está en ${actual.status} y la bandeja no retrocede. ` +
            `Reenvía con "force": true para devolverlo a ${EmailStatus.PENDING}.`,
        );
      }

      await tx.email.update({ where: { id: emailId }, data: { status } });

      if (esReapertura(actual.status, status)) {
        // El único rastro de que alguien saltó la regla a propósito.
        this.logger.warn(
          `Reapertura forzada del correo ${emailId}: ${actual.status} → ${status}`,
        );
      }
    });

    this.logger.log(`Correo ${emailId} movido a ${status}`);

    // Se relee con el mismo `select` del listado para devolver exactamente la
    // forma que el cliente ya sabe pintar, en vez de un objeto a medias.
    const fila = await this.prisma.email.findFirstOrThrow({
      where: { id: emailId, userId },
      select: SELECT_TRIAGE,
    });
    const actualizado = aTriageEmail(fila);

    // Las demás pestañas del usuario ven moverse el correo sin recargar. El
    // `userId` viaja en el payload porque es lo que encamina el evento a su
    // sala; la bandeja lo ignora para pintar, igual que hace con las tareas.
    this.gateway.emitEmailUpdated({ ...actualizado, userId }, socketId);

    return actualizado;
  }

  /**
   * Un correo con su texto completo, para la vista de lectura.
   *
   * Es la contraparte del listado: allí el `bodyText` se excluye porque son
   * ~8 KB por correo, aquí se incluye porque es justo lo que se va a leer. Una
   * persona no puede aprobar tareas propuestas sobre un correo que no ha
   * podido leer.
   *
   * Trae además las tareas que ese correo ya generó: al reprocesar, la vista
   * necesita poder enseñar contra qué se está comparando la propuesta nueva.
   */
  async findOne(userId: string, emailId: string): Promise<EmailDetail> {
    const email = await this.prisma.email.findFirst({
      // Por `userId` además de por `id`: sin esto, cualquier sesión válida
      // leería el correo de otra persona con solo conocer su id.
      where: { id: emailId, userId },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        category: true,
        threadId: true,
        labels: true,
        snippet: true,
        gmailMessageId: true,
        status: true,
        bodyText: true,
        isActionable: true,
        company: true,
        bank: true,
        processedAt: true,
        proposedTasks: true,
        hasAttachments: true,
        attachments: true,
        tasks: {
          select: { id: true, title: true, status: true, priority: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!email) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    return {
      id: email.id,
      subject: email.subject ?? '(sin asunto)',
      from: email.from,
      date: email.receivedAt.toISOString(),
      category: email.category,
      status: email.status,
      isActionable: email.isActionable,
      company: email.company,
      bank: email.bank,
      threadId: email.threadId,
      labels: email.labels,
      snippet: email.snippet ?? '',
      gmailMessageId: email.gmailMessageId,
      taskCount: email.tasks.length,
      isConverted: email.tasks.length > 0,
      // El detalle hereda de `TriageEmail`, así que contesta lo mismo que una
      // fila del listado: el badge de cuarentena y el clip de adjuntos no
      // pueden desaparecer al abrir el correo que los mostraba.
      proposedTaskCount: tareasPropuestas(email.proposedTasks).length,
      hasAttachments: email.hasAttachments,
      attachments: fichasDeAdjuntos(email.attachments),
      // `null` y no cadena vacía: distingue "este correo no tiene cuerpo
      // guardado" de "el cuerpo está vacío", y así la vista sabe cuándo caer
      // al snippet en vez de enseñar un panel en blanco.
      bodyText: email.bodyText,
      processedAt: email.processedAt?.toISOString() ?? null,
      proposedTasks: tareasPropuestas(email.proposedTasks),
      tasks: email.tasks,
    };
  }

  /**
   * Los correos del usuario para la bandeja de triage.
   *
   * Nace porque el frontend no tenía forma legítima de conocer el `Email.id`:
   * `GET /gmail/inbox` va en vivo a Google y devuelve el id de mensaje de Gmail,
   * que no es el que aceptan `classify` ni `to-task`. Sin esta ruta, la única
   * manera de probar la cuarentena era pegar un cuid a mano.
   *
   * Lee de nuestra base y no de Gmail a propósito: solo lo persistido tiene id
   * propio, y solo nosotros sabemos qué se convirtió ya. Gmail no lo sabe.
   */
  async listForTriage(userId: string, query: QueryEmailsDto): Promise<TriageEmail[]> {
    const emails = await this.prisma.email.findMany({
      where: filtroDeBandeja(userId, query),
      // `bodyText` se queda fuera a propósito: son ~8 KB por correo y en un
      // listado de 50 serían 400 KB por petición para pintar una lista.
      select: SELECT_TRIAGE,
      orderBy: { receivedAt: 'desc' },
      skip: query.skip ?? 0,
      take: query.take ?? 50,
    });

    return emails.map(aTriageEmail);
  }

  /**
   * La bandeja agrupada por hilo de Gmail (Fase 7).
   *
   * **Nace de una cuenta.** Los 728 correos pendientes de producción son 401
   * hilos: la lista plana obligaba a la persona a decidir 728 veces sobre 401
   * asuntos, y a leer seis veces la misma conversación citada. Aquí cada hilo
   * llega una vez, con el mensaje más reciente delante y los ids de todos sus
   * hermanos detrás para poder despacharlo entero.
   *
   * **La paginación es de hilos, y por eso hay tres consultas y no una.**
   * Agrupar en memoria lo que devuelve `GET /emails` habría sido más corto, y
   * habría paginado por correo: pedir «los 50 primeros hilos» exigiría bajarse
   * la bandeja completa para saber dónde acaba el hilo número 50. Con 728 hoy
   * se nota poco; el problema es que el número solo sube.
   *
   * 1. `groupBy` paginado, ordenado por el correo más reciente de cada hilo —
   *    los hilos de esta página.
   * 2. `groupBy` completo sin paginar — `total` (hilos) y `totalEmails` (la
   *    suma de sus cuentas). Devuelve una fila diminuta por hilo y evita un
   *    `COUNT(DISTINCT ...)` en SQL crudo, que aquí no aporta nada.
   * 3. `findMany` de los correos de esos hilos y solo de esos.
   *
   * ⚠️ **El hilo es el que deja el filtro, no el que hay en Gmail.** Con
   * `?status=PENDING`, un hilo de seis mensajes con dos pendientes llega con
   * `messageCount: 2`. Es lo correcto para lo que se va a hacer con él —los
   * `emailIds` que se devuelven son exactamente los que `bulk-dismiss` va a
   * mover— pero significa que el número **no** es «mensajes de la
   * conversación», y pintarlo como tal mentiría.
   */
  async listThreads(userId: string, query: QueryThreadsDto): Promise<ThreadPage> {
    const where = filtroDeBandeja(userId, query);
    const skip = query.skip ?? 0;
    const take = query.take ?? 50;

    const [pagina, todos] = await Promise.all([
      this.prisma.email.groupBy({
        by: ['threadId'],
        where,
        _max: { receivedAt: true },
        // Por el correo más reciente del hilo, no por el más antiguo: un hilo
        // al que acaba de llegar una respuesta sube, que es como se comporta
        // cualquier bandeja y lo que la persona espera ver arriba.
        orderBy: { _max: { receivedAt: 'desc' } },
        skip,
        take,
      }),
      this.prisma.email.groupBy({
        by: ['threadId'],
        where,
        _count: { _all: true },
      }),
    ]);

    const total = todos.length;
    const totalEmails = todos.reduce((suma, grupo) => suma + (grupo._count?._all ?? 0), 0);

    const threadIds = pagina.map((grupo) => grupo.threadId);
    if (threadIds.length === 0) {
      return { items: [], total, totalEmails };
    }

    const filas = (await this.prisma.email.findMany({
      // El `where` del filtro **y además** los hilos de esta página. Sin
      // repetir el filtro, un hilo con un correo pendiente y otro completado
      // traería los dos, y `messageCount` diría 2 mientras la bandeja enseña 1.
      where: { ...where, threadId: { in: threadIds } },
      select: SELECT_HILO,
      orderBy: { receivedAt: 'desc' },
    })) as FilaHilo[];

    const porHilo = new Map<string, FilaHilo[]>();
    for (const fila of filas) {
      const grupo = porHilo.get(fila.threadId);
      if (grupo) {
        grupo.push(fila);
      } else {
        porHilo.set(fila.threadId, [fila]);
      }
    }

    // Se recorre `threadIds` y no el mapa: el orden lo decidió la base en el
    // `groupBy`, y el de inserción de un `Map` solo lo respeta por accidente.
    const items = threadIds
      .map((threadId) => porHilo.get(threadId))
      .filter((grupo): grupo is FilaHilo[] => grupo !== undefined && grupo.length > 0)
      .map(aHiloDeDecision);

    return { items, total, totalEmails };
  }

  /**
   * Descarta un lote de correos de una sola vez (Fase 7).
   *
   * Es el atajo que vacía de golpe los 318 no accionables que llevaban meses
   * en la bandeja. Todo lo demás de esta función existe para que ese atajo no
   * se lleve por delante nada que no tocaba.
   *
   * **Un lote no es todo o nada.** La selección se hizo sobre una lista que
   * pudo pintarse hace diez minutos, así que es normal que algún id ya no
   * encaje: se movió, se descartó desde otra pestaña o dejó de existir. Tirar
   * las 317 buenas porque una falló sería exactamente el resultado que nadie
   * quiere, así que la respuesta es **200 con el desglose** y cada id que no se
   * movió sale nombrado en `skipped` con su motivo. Un fallo silencioso aquí es
   * peor que un error: la bandeja se queda con correos dentro y nadie sabe
   * cuáles.
   *
   * **Sin `force` solo se mueve lo que está en `PENDING`.** Descartar es
   * avanzar —nunca es la reapertura que protege `updateStatus`— pero arrastrar
   * a `DISMISSED` un correo que alguien ya completó sí es borrarle trabajo, y
   * un lote de 200 ids es el peor sitio para que eso pase sin que se vea.
   *
   * Los ids repetidos se cuentan **una vez**: así se sostiene
   * `updated + skipped.length === requested`, que es lo que permite al cliente
   * comprobar la respuesta en lugar de confiar en ella.
   */
  async bulkDismiss(
    userId: string,
    emailIds: string[],
    socketId?: string,
    force = false,
  ): Promise<BulkDismissResult> {
    const ids = [...new Set(emailIds)];

    // Leer y escribir en la misma transacción, igual que `updateStatus`: entre
    // clasificar los ids y guardar cabe otra pestaña moviendo uno de ellos, y
    // la regla de «solo lo pendiente» se aplicaría sobre un estado viejo.
    //
    // El desglose se construye **dentro** y se devuelve, en vez de ir
    // acumulando sobre un array de fuera: si la transacción se reintentara, un
    // array externo se quedaría con los duplicados de la vuelta anterior.
    const { movidos, skipped } = await this.prisma.$transaction(async (tx) => {
      const encontrados = await tx.email.findMany({
        // Por `userId` además de por `id`: sin esto, cualquier sesión válida
        // vaciaría la bandeja de otra persona mandando una lista de ids.
        where: { id: { in: ids }, userId },
        select: { id: true, status: true },
      });

      const estadoPorId = new Map(encontrados.map((email) => [email.id, email.status]));
      const aMover: string[] = [];
      const omitidos: BulkDismissSkip[] = [];

      for (const id of ids) {
        const estado = estadoPorId.get(id);

        if (estado === undefined) {
          // "No existe" y "no es tuyo" se contestan igual a propósito: la
          // diferencia solo le sirve a quien está probando ids ajenos.
          omitidos.push({ id, reason: MOTIVO_OMISION.noEncontrado });
        } else if (estado === EmailStatus.DISMISSED) {
          omitidos.push({ id, reason: MOTIVO_OMISION.yaDescartado });
        } else if (estado !== EmailStatus.PENDING && !force) {
          omitidos.push({ id, reason: MOTIVO_OMISION.noPendiente });
        } else {
          aMover.push(id);
        }
      }

      if (aMover.length > 0) {
        await tx.email.updateMany({
          where: { id: { in: aMover }, userId },
          data: { status: EmailStatus.DISMISSED },
        });
      }

      return { movidos: aMover, skipped: omitidos };
    });

    this.logger.log(
      `Descarte masivo: ${movidos.length} de ${ids.length} correos a ${EmailStatus.DISMISSED}` +
        (skipped.length > 0 ? ` (${skipped.length} omitidos)` : ''),
    );

    if (movidos.length > 0) {
      // **Un evento por lote, no uno por correo.** 318 `email.updated` seguidos
      // no son "más información": son 318 repintados que llegan intercalados y
      // dejan la bandeja parpadeando mientras se vacía.
      this.gateway.emitEmailsBulkUpdated(
        { userId, ids: movidos, status: EmailStatus.DISMISSED },
        socketId,
      );
    }

    return { requested: ids.length, updated: movidos.length, skipped };
  }

  /**
   * Baja un adjunto de Gmail para que el navegador se lo lleve (Fase 8).
   *
   * **El contenido no vive en nuestra base**: se guarda la ficha y el binario se
   * le pide a Gmail en el momento. Por eso esto necesita el `gmailMessageId`
   * además del adjunto — un `attachmentId` solo vale para el mensaje del que
   * salió.
   *
   * ⚠️ **Se comprueba que el adjunto sea de ese correo, no solo que el correo
   * sea del usuario.** Sin esa segunda comprobación, la ruta se convierte en un
   * proxy con el que bajar **cualquier** adjunto del buzón sabiendo su id, sin
   * pasar por la bandeja: el `userId` protege el correo, pero es la lista de
   * fichas la que dice qué adjuntos pertenecen a ese correo.
   *
   * El nombre y el tipo salen de **nuestra** ficha, no de lo que conteste Gmail:
   * es lo que la persona vio en la lista antes de pulsar.
   *
   * Respuestas: 200 con el archivo · 404 si el correo no es suyo, no existe, o
   * el adjunto no es de ese correo.
   */
  async downloadAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<AttachmentDownload> {
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, userId },
      select: { gmailMessageId: true, attachments: true },
    });

    if (!email) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    const ficha = fichasDeAdjuntos(email.attachments).find(
      (a) => a.attachmentId === attachmentId,
    );

    if (!ficha) {
      // 404 y no 403: decir «ese adjunto existe pero no es de este correo»
      // confirmaría su existencia a quien esté probando ids.
      throw new NotFoundException(
        `El correo ${emailId} no tiene un adjunto ${attachmentId}`,
      );
    }

    const contenido = await this.gmail.fetchAttachment(
      userId,
      email.gmailMessageId,
      attachmentId,
    );

    this.logger.log(
      `Adjunto ${ficha.filename} (${contenido.length} B) servido desde el correo ${emailId}`,
    );

    return { filename: ficha.filename, mimeType: ficha.mimeType, contenido };
  }

  /**
   * Devuelve lo que la IA propone para un correo **sin crear nada**.
   *
   * Es el primer paso de la validación humana: la persona ve las tareas
   * propuestas, las edita o las descarta, y solo entonces se crean con
   * `to-task`. Por eso no hay 409 por duplicados aquí — mirar qué propondría el
   * modelo no colisiona con nada — ni se marca el correo como procesado.
   *
   * No se fuerza `isActionable`: si el modelo no ve nada accionable, se dice y
   * ya decidirá la persona. Forzar aquí sería inventarle una tarea a alguien
   * que solo estaba mirando.
   */
  async classify(
    userId: string,
    emailId: string,
    force = false,
  ): Promise<ClassificationResult> {
    // Primero obtenemos el hilo al que pertenece este correo
    const targetEmail = await this.prisma.email.findFirst({
      where: { id: emailId, userId },
      select: { threadId: true }
    });

    if (!targetEmail) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    // Buscamos todos los correos del hilo, ordenados del más reciente al más antiguo
    const threadEmails = await this.prisma.email.findMany({
      where: { threadId: targetEmail.threadId, userId },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        bodyText: true,
        snippet: true,
        category: true,
        isActionable: true,
        company: true,
        bank: true,
        proposedTasks: true,
      },
    });

    const email = threadEmails.find(e => e.id === emailId)!;

    if (!email.bodyText && !email.snippet) {
      throw new ConflictException(`El correo ${emailId} no tiene texto que analizar.`);
    }

    // C-2: Las propuestas pueden estar en un correo anterior del mismo hilo.
    // Si no estamos forzando, agrupamos TODAS las propuestas del hilo.
    if (!force) {
      const allProposals = threadEmails.flatMap(e => 
        Array.isArray(e.proposedTasks) ? e.proposedTasks : []
      );
      
      // Si hay al menos una propuesta en todo el hilo, la devolvemos.
      // Así el modal "Revisar N" abre con las propuestas reales sin volver a cobrar.
      if (allProposals.length > 0) {
        this.logger.log(`Clasificación servida desde el borrador guardado del hilo para ${emailId}`);
        const guardadas = tareasPropuestas(allProposals);
        return {
          emailId: email.id,
          category: email.category ?? 'OTHER',
          isActionable: email.isActionable,
          aiConfidence: guardadas[0]?.aiConfidence ?? 0,
          tasks: guardadas,
          company: email.company,
          bank: email.bank,
        };
      }
      
      // Si este correo tiene un array vacío explicitamente, también se devuelve
      if (Array.isArray(email.proposedTasks)) {
        return {
          emailId: email.id,
          category: email.category ?? 'OTHER',
          isActionable: email.isActionable,
          aiConfidence: 0,
          tasks: [],
          company: email.company,
          bank: email.bank,
        };
      }
    }

    const draft = await this.classification.classify(email.id, { forceActionable: false });

    this.logger.log(
      `Clasificación ${force ? 'forzada' : 'en seco'} del correo ${emailId}: ` +
        `${draft.tasks.length} tarea(s) propuesta(s)`,
    );

    // Lo que acaba de decir el modelo pasa a ser **el** borrador del correo.
    // Sin esto, un `?force=true` devolvería una propuesta nueva a quien la pidió
    // y la siguiente lectura seguiría sirviendo la vieja: dos personas mirando
    // el mismo correo verían cosas distintas.
    //
    // No se toca `processedAt`: clasificar para mirar no es haber despachado el
    // correo, y marcarlo aquí haría que el worker se lo saltara.
    await this.prisma.email.update({
      where: { id: email.id },
      data: {
        proposedTasks: aJsonDeBorradores(draft.tasks),
        // Van con el borrador, no aparte. Sin esto, un `?force=true` que
        // corrigiera el banco lo devolveria en la respuesta y dejaria el viejo
        // en la base: la bandeja seguiria enseñando la pestaña equivocada
        // justo despues de que alguien pagara por corregirla.
        company: draft.company,
        bank: draft.bank,
      },
    });

    return {
      emailId: draft.emailId,
      category: draft.category,
      isActionable: draft.isActionable,
      aiConfidence: draft.aiConfidence,
      company: draft.company,
      bank: draft.bank,
      tasks: draft.tasks.map(
        ({ title, description, priority, tags, dueDate, source, aiConfidence }) => ({
          title,
          description,
          priority,
          tags,
          // A cadena ISO, igual que la del borrador releído. Las dos vías tienen
          // que devolver la misma forma o el frontend recibe un `Date` unas
          // veces y un `string` otras, según si el correo ya se había mirado.
          dueDate: dueDate ? dueDate.toISOString() : null,
          // `source` y `aiConfidence` sí viajan: la cuarentena necesita saber
          // si la propuso el modelo o el respaldo del asunto, y con cuánta
          // seguridad, para poder triar sin abrir cada una.
          source,
          aiConfidence,
        }),
      ),
    };
  }

  /**
   * Convierte un correo en tarea y anuncia las tarjetas nuevas al tablero.
   *
   * La emisión vive aquí, envolviendo a las tres vías, y no dentro de cada una:
   * al tablero le da igual si la tarjeta salió de la cuarentena, de un título
   * escrito a mano o del modelo — lo que necesita es enterarse siempre. Puesta
   * en cada rama, cualquier vía futura nacería muda.
   *
   * Va después de que la escritura haya terminado: un evento emitido dentro de
   * la transacción anunciaría tarjetas que aún podrían no llegar a existir.
   */
  async convertToTask(
    userId: string,
    emailId: string,
    dto: ToTaskDto,
    socketId?: string,
  ): Promise<ToTaskResult> {
    const result = await this.createFromEmail(userId, emailId, dto);

    // Un evento por tarjeta, como hace `POST /tasks`: el cliente ya sabe
    // insertar una tarea suelta y no hay que enseñarle un formato nuevo.
    for (const task of result.tasks) {
      this.gateway.emitTaskCreated(task, socketId);
    }

    return result;
  }

  /**
   * Las tres vías de conversión, sin la parte de anunciarlas.
   *
   * A diferencia del worker, aquí nunca se borran tareas: la conversión manual
   * solo añade. El guardarraíl contra duplicados es el 409, no el borrado.
   */
  private async createFromEmail(
    userId: string,
    emailId: string,
    dto: ToTaskDto,
  ): Promise<ToTaskResult> {
    // Filtrar por userId además de por id: sin esto, cualquier sesión válida
    // podría convertir el correo de otra persona con solo conocer su id.
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, userId },
      select: { id: true, subject: true, snippet: true, bodyText: true, proposedTasks: true },
    });

    if (!email) {
      throw new NotFoundException(`No existe el correo ${emailId}`);
    }

    if (!dto.force) {
      const existing = await this.prisma.task.count({ where: { sourceEmailId: email.id } });
      if (existing > 0) {
        throw new ConflictException(
          `El correo ${emailId} ya tiene ${existing} tarea(s). Reenvía con "force": true para crear otra.`,
        );
      }
    }

    // Confirmación de la cuarentena: la persona ya revisó la propuesta y esto
    // es lo que aprobó. No se vuelve a llamar al modelo — sería pagar otra vez
    // por una respuesta que además podría no coincidir con lo que aprobó.
    if (dto.tasks?.length) {
      // La confianza se recupera **del borrador guardado**, no del cuerpo de la
      // petición: es un dato del análisis, y aceptarlo del cliente dejaría que
      // cualquiera escribiera «0.99» en una tarea que el modelo dudó.
      const guardadas = tareasPropuestas(email.proposedTasks);
      return this.persistConfirmed(
        userId,
        email.id,
        email.subject,
        dto.tasks,
        dto.category,
        guardadas[0]?.aiConfidence,
      );
    }

    // Vía manual: la persona ya escribió el título, no hay nada que inferir.
    if (dto.title?.trim()) {
      // 400 con el id que falla si alguna etiqueta no es suya, igual que en la
      // confirmación de la cuarentena y en `POST /tasks`.
      const labels = await this.tags.resolveIds(userId, dto.tagIds);

      const task = await this.prisma.task.create({
        data: {
          userId,
          sourceEmailId: email.id,
          title: dto.title.trim(),
          description: dto.description ?? email.snippet ?? '',
          priority: dto.priority ?? TaskPriority.MEDIUM,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          ...(labels.length > 0 ? { labels: { connect: labels } } : {}),
          // Origen que protege esta tarea del borrado en un reproceso posterior.
          source: TaskSource.MANUAL,
        },
        include: { labels: true },
      });

      this.logger.log(`Tarea manual ${task.id} creada desde el correo ${emailId}`);
      return { emailId, mode: 'manual', usedFallback: false, tasks: [task] };
    }

    if (!email.bodyText && !email.snippet) {
      throw new ConflictException(
        `El correo ${emailId} no tiene texto que analizar. Envía "title" para crearla a mano.`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Aquí vivía la tercera vía: llamar al modelo y crear lo que dijera, sin
    // que nadie lo hubiera visto. **Se retira en la Fase 6** (P6).
    //
    // Era la puerta trasera de la cuarentena: mientras `classifyAndPersist`
    // dejaba de escribir en `Task` para que una persona aprobara primero, esta
    // rama seguía materializando la propuesta entera con un `to-task` sin
    // cuerpo. El tablero acababa igual de contaminado, solo que por otro
    // camino y sin que la pantalla de revisión se enterara.
    //
    // El flujo, ahora, es uno solo y en dos tiempos: `POST /:id/classify` para
    // ver qué propone, y `POST /:id/to-task` con `tasks[]` para aprobar lo que
    // se quiera. Quien no quiera pasar por ahí tiene la vía manual: `title`.
    // ─────────────────────────────────────────────────────────────────────
    throw new ConflictException(
      `El correo ${emailId} no se convierte solo: pide la propuesta con ` +
        `POST /emails/${emailId}/classify y envíala aprobada en "tasks", ` +
        `o manda "title" para crear la tarea a mano.`,
    );
  }

  /**
   * Escribe lo que la persona aprobó en la cuarentena.
   *
   * Todo en una transacción: o entran las tareas y el correo queda marcado, o
   * no pasa nada. Si se escribieran por separado, un fallo a medias dejaría
   * tareas sin correo procesado —el worker volvería a clasificarlo y las
   * duplicaría— o un correo procesado sin las tareas que lo justifican.
   */
  private async persistConfirmed(
    userId: string,
    emailId: string,
    emailSubject: string | null,
    confirmed: ConfirmedTaskDto[],
    category?: string,
    aiConfidence?: number,
  ): Promise<ToTaskResult> {
    // Antes de abrir la transacción, y de una sola consulta para todas las
    // tareas: si alguna etiqueta no existe o es de otra persona, esto lanza un
    // 400 diciendo cuál. Pasar los ids a `connect` sin mirar daría un error
    // opaco de Prisma con un id inventado —y, con uno ajeno, colgaría en la
    // tarea la etiqueta de otro usuario. Es la misma comprobación que hace
    // `POST /tasks`.
    const pedidos = confirmed.flatMap((task) => task.tagIds ?? []);
    await this.tags.resolveIds(userId, pedidos);

    const tasks = await this.prisma.$transaction(async (tx) => {
      // Las tarjetas aprobadas se anexan al final de "Por hacer", igual que las
      // que crea `POST /tasks`: nacer en la posición 0 las metería por delante
      // de lo que el usuario ya tenía ordenado.
      const last = await tx.task.findFirst({
        where: { userId, status: TaskStatus.TODO },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      const position = last ? last.position + 1 : 0;
      const created: Task[] = [];

      const uniqueTagIds = [...new Set(confirmed.flatMap((task) => task.tagIds ?? []))];
      const uniqueTags = [...new Set(confirmed.flatMap((task) => task.tags ?? []))];

      // Fase 2: Creamos una sola tarea que agrupa todo el correo.
      const parentTask = await tx.task.create({
        data: {
          userId,
          sourceEmailId: emailId,
          title: emailSubject?.trim() || '(Sin asunto)',
          description: confirmed.map(t => t.description).filter(Boolean).join('\n\n') || '',
          priority: confirmed.find(t => t.priority === 'URGENT') ? 'URGENT' : (confirmed[0]?.priority ?? 'MEDIUM'),
          tags: uniqueTags,
          ...(uniqueTagIds.length > 0
            ? { labels: { connect: uniqueTagIds.map((id) => ({ id })) } }
            : {}),
          dueDate: confirmed.find(t => t.dueDate)?.dueDate ? new Date(confirmed.find(t => t.dueDate)!.dueDate!) : null,
          position: position,
          source: TaskSource.EMAIL,
          ...(aiConfidence !== undefined ? { aiConfidence } : {}),
          subtasks: {
            create: confirmed.map((task, idx) => ({
              title: task.title.trim(),
              order: idx
            }))
          }
        },
        include: { labels: true },
      });

      created.push(parentTask);

      await tx.email.update({
        where: { id: emailId },
        data: {
          isActionable: true,
          processedAt: new Date(),
          proposedTasks: Prisma.JsonNull, // limpiar las propuestas tras aprobar
          // Solo si la persona la tocó: sin esto, confirmar borraría la
          // categoría que ya tuviera el correo.
          ...(category ? { category } : {}),
        },
      });

      return created;
    });

    this.logger.log(
      `Cuarentena confirmada en el correo ${emailId}: ${tasks.length} tarea(s) aprobada(s)`,
    );

    return { emailId, mode: 'confirmed', usedFallback: false, tasks };
  }
}
