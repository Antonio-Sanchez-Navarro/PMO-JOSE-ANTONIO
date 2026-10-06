import { Injectable, Logger } from '@nestjs/common';
import { Email, Prisma, TaskPriority, TaskSource } from '@prisma/client';
import { AiService } from './ai.service';
import { adjustPriority } from './priority.rules';
import { senderFromHeader, withContextPrefix } from './title.prefix';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GmailService } from '../gmail/gmail.service';
import { GmailQuotaError } from '../gmail/gmail-quota';
import { describirError } from '../../common/observability/describir-error';
import {
  AdjuntoCandidato,
  MAX_BYTES_POR_ADJUNTO,
  repartirAdjuntos,
} from './attachment-budget';
import type { AdjuntoAusente, AdjuntoParaElModelo, HiloParaElModelo } from './ai.service';
import { quitarCitas } from './quitar-citas';

/**
 * Cuánto texto **nuevo** del hilo entra como contexto (G.2.3).
 *
 * Es texto ya sin citas: antes el tope era de 12.000 caracteres sobre cuerpos
 * que repetían el hilo entero, y se llenaba de repeticiones hasta perder lo más
 * antiguo. El mensaje más reciente entra siempre entero; el resto se llena del
 * más nuevo al más viejo y lo que no cabe se omite, avisando al modelo.
 */
const HILO_MAX_CARACTERES_NUEVOS = 8_000;

/**
 * Dominios del equipo. Un mensaje que sale de aquí es nuestro: si responde o
 * entrega algo, eso queda resuelto, y el modelo tiene que saberlo para no
 * proponerlo otra vez.
 */
const DOMINIOS_DEL_EQUIPO = ['zepto.com.mx', 'zeptorealty.com'];

/** El hilo de un correo tal como está en la base, en orden. */
interface Hilo {
  /** El correo por el que se pidió el análisis. */
  objetivo: Email;
  /** El más reciente del hilo: el que se analiza y el que guarda el borrador. */
  ancla: Email;
  /** Los demás, del más antiguo al más reciente, sin el ancla. */
  anteriores: Email[];
}

export function esDelEquipo(from: string): boolean {
  const correo = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  return DOMINIOS_DEL_EQUIPO.some((d) => correo.endsWith(`@${d}`));
}

/** «De: Nombre <correo> (nuestro equipo) · 2026-09-28 22:58 UTC». */
function cabeceraDe(e: Pick<Email, 'from' | 'receivedAt'>): string {
  const fecha = new Date(e.receivedAt).toISOString().slice(0, 16).replace('T', ' ');
  return `De: ${e.from}${esDelEquipo(e.from) ? ' (nuestro equipo)' : ''} · ${fecha} UTC`;
}

/** Entre mensajes del hilo, para que el modelo vea dónde acaba cada uno. */
const SEPARADOR_HILO = '\n---\n';

export interface ClassifyOptions {
  /**
   * Borra las tareas que la IA había generado antes para este correo.
   * `true` en el worker (reproceso = reemplazo); `false` en la vía manual,
   * que solo añade.
   */
  replaceExisting: boolean;
  /**
   * Crea una tarea aunque el modelo considere el correo no accionable. Lo usa
   * la vía manual: si una persona pide convertirlo, su criterio manda.
   */
  forceActionable: boolean;
}

export interface ClassifyResult {
  isActionable: boolean;
  category: string;
  /** Lo seguro que estaba el modelo, para que quien materialice pueda anotarlo. */
  aiConfidence: number;
  /**
   * Borradores, **no filas**: desde la Fase 6 la IA no crea nada en `Task`.
   * Decía `Task[]` y se devolvía `draft.tasks as any`, que es la firma de que
   * el tipo llevaba tiempo mintiendo — ninguna de esas "tareas" tenía `id`.
   */
  tasks: TaskDraft[];
  /** `true` si el modelo no extrajo tareas y se generó una desde el asunto. */
  usedFallback: boolean;
  /** Empresa y banco reconocidos, o `null`. Ver {@link ClassificationDraft}. */
  company: string | null;
  bank: string | null;
}

/**
 * Una tarea tal como la propone el análisis, antes de existir en la base de
 * datos. No tiene `id` porque todavía no es una fila: es lo que se le enseña a
 * una persona para que lo apruebe, lo edite o lo tire.
 */
export interface TaskDraft {
  title: string;
  description: string;
  priority: TaskPriority;
  tags: string[];
  dueDate: Date | null;
  /** `EMAIL` si la extrajo el modelo; `MANUAL` si es el respaldo del asunto. */
  source: TaskSource;
  /**
   * Lo seguro que estaba el modelo del análisis del que salió esta propuesta.
   *
   * Viaja **dentro del borrador** —y no solo en el resultado del análisis—
   * porque el JSON de `proposedTasks` es lo único que sobrevive entre que la IA
   * propone y una persona aprueba, que pueden ser días. Sin esto, la cuarentena
   * no tiene con qué triar y la tarjeta nace sin saber de dónde viene.
   */
  aiConfidence: number;
  /**
   * Por qué la capa determinista subió la prioridad que propuso el modelo, o
   * `null` si la dejó como venía.
   *
   * Viaja en el borrador —y no solo al log— porque este es el camino por el que
   * nacen casi todas las tareas: si el motivo se quedara aquí, la tarjeta del
   * tablero no tendría nada que enseñar.
   */
  priorityReason: string | null;
  /** De qué prioridad venía. `null` si no hubo ajuste. */
  priorityAdjustedFrom: TaskPriority | null;
}

/**
 * Pasa los borradores a algo que Prisma acepte en una columna `Json`.
 *
 * Existe porque `TaskDraft` **no es JSON**: lleva un `Date` en `dueDate`, y
 * `Prisma.InputJsonValue` no admite objetos con métodos. Antes esto se resolvía
 * con un `as any`, y el `as any` escondía algo peor que un tipo feo: al leer la
 * columna, `dueDate` ya no es un `Date` sino la cadena ISO en que Prisma lo
 * convirtió al guardarlo. El tipo decía `Date` y el valor era `string`, así que
 * cualquier `.toISOString()` sobre un borrador releído reventaba en ejecución.
 *
 * Convertir aquí, a la vista, hace que lo que se guarda y lo que se lee tengan
 * la misma forma — y que el compilador pueda vigilarlo.
 */
export function aJsonDeBorradores(tasks: TaskDraft[]): Prisma.InputJsonValue {
  return tasks.map((t) => ({
    title: t.title,
    description: t.description,
    priority: t.priority,
    tags: t.tags,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    source: t.source,
    aiConfidence: t.aiConfidence,
    priorityReason: t.priorityReason,
    priorityAdjustedFrom: t.priorityAdjustedFrom,
  }));
}

/**
 * Lee la columna `attachments` como lo que es: fichas, o nada.
 *
 * Mismo criterio que `aJsonDeBorradores` en sentido contrario: una columna
 * `Json` puede traer cualquier cosa, y un `as` a ciegas convertiria una fila
 * rara en un fallo varias capas mas abajo. Un correo anterior a la Fase 8 tiene
 * `null` aqui y sale como lista vacia.
 */
function fichasDeAdjuntos(valor: Prisma.JsonValue | null | undefined): AdjuntoCandidato[] {
  if (!Array.isArray(valor)) return [];
  return (valor as unknown as AdjuntoCandidato[]).filter(
    (f) => typeof f?.attachmentId === "string",
  );
}

/** Resultado del análisis sin tocar la base de datos. */
export interface ClassificationDraft {
  emailId: string;
  isActionable: boolean;
  category: string;
  aiConfidence: number;
  tasks: TaskDraft[];
  /** `true` si el modelo no extrajo tareas y se generó una desde el asunto. */
  usedFallback: boolean;  /**
   * Empresa del grupo y banco detectados, del vocabulario cerrado de
   * `@pmo/shared`. `null` = el correo no menciona ninguno de los nuestros.
   */
  company: string | null;
  bank: string | null;
}

/**
 * Analiza un correo con la IA y persiste el resultado en una transacción.
 *
 * Vive aquí, y no en el worker, porque tiene dos consumidores que deben
 * comportarse igual: `AiProcessor` (cola `classify-email`) y la conversión
 * manual del `EmailsController`.
 */
@Injectable()
export class EmailClassificationService {
  private readonly logger = new Logger(EmailClassificationService.name);

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
  ) {}

  /**
   * Baja los adjuntos que el modelo va a poder mirar (Fase 8).
   *
   * **Nada de lo que pase aquí puede tumbar la clasificación.** Un adjunto que
   * no se deja bajar es un correo que se clasifica un poco peor; una excepción
   * que suba es un correo que no se clasifica en absoluto, y encima uno que el
   * worker reintentará hasta cansarse. Por eso cada descarga va en su propio
   * `try` y lo que falla se convierte en un ausente **con nombre**: el prompt
   * puede decirle al modelo qué no vio, que es lo que evita que se lo invente.
   *
   * La cuota sí sube: un `GmailQuotaError` no es «este adjunto falla», es que
   * Google dejó de atendernos, y seguir bajando los otros cuatro solo hunde más
   * el cubo. Se deja pasar para que el worker frene la cola, igual que hace la
   * ingesta.
   */
  private async descargarAdjuntos(
    userId: string,
    gmailMessageId: string,
    fichas: AdjuntoCandidato[],
  ): Promise<{ adjuntos: AdjuntoParaElModelo[]; ausentes: AdjuntoAusente[] }> {
    const { elegidos, descartados } = repartirAdjuntos(fichas);

    const adjuntos: AdjuntoParaElModelo[] = [];
    const ausentes: AdjuntoAusente[] = [...descartados];

    for (const { candidato, forma } of elegidos) {
      try {
        const contenido = await this.gmail.fetchAttachment(
          userId,
          gmailMessageId,
          candidato.attachmentId,
        );

        // Gmail declara el tamaño en la ficha, pero lo que cuenta para el
        // límite de Anthropic es lo que pesa de verdad. Se comprueba después de
        // bajarlo porque antes no se sabe, y mandar de más aquí no da un aviso:
        // da un 400 que tira la clasificación entera.
        if (contenido.length > MAX_BYTES_POR_ADJUNTO) {
          ausentes.push({
            filename: candidato.filename,
            motivo: 'demasiado grande al descargarlo',
          });
          continue;
        }

        adjuntos.push({
          filename: candidato.filename,
          mimeType: candidato.mimeType,
          forma,
          contenido,
        });
      } catch (err) {
        if (err instanceof GmailQuotaError) throw err;

        this.logger.warn(
          `No se pudo bajar el adjunto ${candidato.filename} del mensaje ${gmailMessageId}: ` +
            `${describirError(err)}. Se clasifica sin él.`,
        );
        ausentes.push({ filename: candidato.filename, motivo: 'no se pudo descargar' });
      }
    }

    return { adjuntos, ausentes };
  }

  /**
   * Analiza el correo y devuelve lo que propondría, **sin escribir nada**.
   *
   * Es la mitad de arriba de `classifyAndPersist`. Existe porque el flujo de
   * validación humana necesita enseñar la propuesta antes de que sea real: si
   * el análisis y la escritura van juntos, cuando el frontend recibe la
   * respuesta las tareas ya están creadas y no queda nada que aprobar.
   *
   * No marca el correo como procesado: clasificar para mirar no es haberlo
   * despachado, y dejar `processedAt` aquí haría que el worker se lo saltara.
   */
  async classify(
    emailId: string,
    options: { forceActionable: boolean },
  ): Promise<ClassificationDraft> {
    const hilo = await this.cargarHilo(emailId);
    return this.analyze(hilo, options.forceActionable);
  }

  /**
   * Vuelve a pensar el hilo entero y deja su borrador en el correo más
   * reciente. Es «Volver a analizar» (`?force=true`).
   *
   * No marca nada como procesado ni toca `isActionable`/`category`: mirar no
   * es despachar, igual que antes de G.2.
   */
  async reclassifyThread(emailId: string): Promise<ClassificationDraft> {
    const hilo = await this.cargarHilo(emailId);
    const draft = await this.analyze(hilo, false);
    await this.guardarBorradorDelHilo(hilo, draft, false);
    return draft;
  }

  async classifyAndPersist(emailId: string, options: ClassifyOptions): Promise<ClassifyResult> {
    const hilo = await this.cargarHilo(emailId);
    const draft = await this.analyze(hilo, options.forceActionable);
    const { isActionable, category, aiConfidence, usedFallback, company, bank } = draft;

    // ⚠️ `options.replaceExisting` no cambia nada desde la Fase 6: la IA no
    // crea filas en `Task`, así que no queda nada que borrar. Sigue en la firma
    // y `ai.processor.ts` lo pasa en `true`.
    await this.guardarBorradorDelHilo(hilo, draft, true);

    // Se devuelven los borradores, no filas: todavía no existen. Quien los
    // materialice lo hará al aprobarlos con `POST /emails/:id/to-task`.
    return {
      isActionable,
      category,
      aiConfidence,
      tasks: draft.tasks,
      usedFallback,
      company,
      bank,
    };
  }

  /**
   * Guarda la propuesta **del hilo** en un solo sitio (G.2.4).
   *
   * Human-in-the-loop: la IA no crea filas en `Task`. Lo que hay en `Task` es lo
   * que aprobó una persona, y **eso no se toca desde aquí, nunca**. La propuesta
   * va al JSON `proposedTasks` del correo más reciente del hilo y se reemplaza
   * entera; las de los demás correos **de este hilo** se vacían en la misma
   * transacción. Antes cada correo guardaba la suya y «Revisar» las sumaba: 16
   * propuestas en el hilo de seis mensajes del 30-09, muchas ya resueltas.
   */
  private async guardarBorradorDelHilo(
    hilo: Hilo,
    draft: ClassificationDraft,
    marcarProcesado: boolean,
  ): Promise<void> {
    const { ancla } = hilo;
    const ahora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.email.update({
        where: { id: ancla.id },
        data: {
          ...(marcarProcesado
            ? { isActionable: draft.isActionable, category: draft.category, processedAt: ahora }
            : {}),
          // Se escriben **siempre**, tambien cuando son `null`. Dejar el valor
          // viejo por no pisarlo con `null` convertiria un banco corregido en
          // un banco pegado para siempre: la propuesta se reemplaza entera, y
          // estos dos son parte de la propuesta.
          company: draft.company,
          bank: draft.bank,
          proposedTasks: aJsonDeBorradores(draft.tasks),
        },
      });

      await tx.email.updateMany({
        where: { userId: ancla.userId, threadId: ancla.threadId, id: { not: ancla.id } },
        data: { proposedTasks: Prisma.JsonNull },
      });

      // Encargo J: un análisis despacha **todo lo pendiente del hilo hasta el
      // correo que se pensó**, no solo el que pedía el worker. Si no, los
      // correos del medio de una ráfaga se quedaban con `processedAt` a `null`
      // y el barrido de reconciliación los volvía a programar, pagando otra vez
      // un análisis que ya estaba hecho. Lo que haya entrado **después** del
      // ancla no se toca: lo pensará el trabajo que su llegada programó.
      if (marcarProcesado) {
        await tx.email.updateMany({
          where: {
            userId: ancla.userId,
            threadId: ancla.threadId,
            id: { not: ancla.id },
            processedAt: null,
            receivedAt: { lte: ancla.receivedAt },
          },
          data: { processedAt: ahora },
        });
      }
    });
  }

  /** El correo pedido y el resto de su hilo, en orden. */
  private async cargarHilo(emailId: string): Promise<Hilo> {
    const objetivo = await this.prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    const otros: Email[] =
      (await this.prisma.email.findMany({
        where: { userId: objetivo.userId, threadId: objetivo.threadId, id: { not: objetivo.id } },
        orderBy: { receivedAt: 'asc' },
      })) ?? [];

    const todos = [...otros, objetivo].sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    );
    // El ancla es el más reciente **con texto**: uno sin texto (una invitación
    // de Calendar, un correo solo con adjunto) no se puede analizar, y el
    // worker ya lo marcó aparte. Si ninguno tiene texto, el más reciente, y
    // `analyze` dirá por qué no sigue.
    const conTexto = todos.filter((e) => e.bodyText || e.snippet);
    const ancla = conTexto[conTexto.length - 1] ?? todos[todos.length - 1];
    return { objetivo, ancla, anteriores: todos.filter((e) => e !== ancla && e.receivedAt <= ancla.receivedAt) };
  }

  /** Lo aprobado del hilo, con su estado y sus subtareas, para no proponerlo otra vez. */
  private async tareasAprobadasDelHilo(userId: string, threadId: string): Promise<string[]> {
    const tareas =
      (await this.prisma.task.findMany({
        where: { userId, sourceEmail: { threadId } },
        select: {
          title: true,
          status: true,
          subtasks: { select: { title: true, isCompleted: true }, orderBy: { order: 'asc' } },
        },
      })) ?? [];

    return tareas.map(
      (t) =>
        `- ${t.title} [${t.status}]` +
        (t.subtasks ?? [])
          .map((st) => `\n  · ${st.title} (${st.isCompleted ? 'hecha' : 'pendiente'})`)
          .join(''),
    );
  }

  /**
   * Lo que el modelo ve del hilo (G.2.3): cada mensaje con su autor y su fecha
   * y **solo su texto nuevo**, en orden, más lo ya aprobado.
   *
   * ⚠️ **El mensaje más antiguo que hay en la base conserva sus citas.** Si el
   * hilo empezó antes de etiquetarse PMO, los primeros mensajes no están en la
   * base y lo único que queda de ellos es lo que cita el primero que sí está.
   * Quitárselo sería perderlos.
   *
   * `undefined` si el hilo es un solo correo y no hay nada aprobado: entonces
   * se analiza como siempre, con el cuerpo entero.
   */
  private async contextoDelHilo(
    hilo: Hilo,
  ): Promise<{ paraElModelo: HiloParaElModelo; textoUltimo: string } | undefined> {
    const { ancla, anteriores } = hilo;
    const aprobadas = await this.tareasAprobadasDelHilo(ancla.userId, ancla.threadId);
    if (anteriores.length === 0 && aprobadas.length === 0) return undefined;

    const textoDe = (e: Email, esElMasAntiguo: boolean) => {
      const crudo = (e.bodyText || e.snippet || '').trim();
      return esElMasAntiguo ? crudo : quitarCitas(crudo);
    };

    const textoUltimo = textoDe(ancla, anteriores.length === 0);
    let presupuesto = HILO_MAX_CARACTERES_NUEVOS - textoUltimo.length;

    // Del más nuevo al más viejo: lo que no cabe es lo más antiguo.
    const cabidos: string[] = [];
    let omitidos = 0;
    for (let i = anteriores.length - 1; i >= 0; i--) {
      const texto = textoDe(anteriores[i], i === 0);
      if (!texto) continue;
      if (texto.length > presupuesto) {
        omitidos = i + 1;
        break;
      }
      cabidos.unshift(`${cabeceraDe(anteriores[i])}\n${texto}`);
      presupuesto -= texto.length;
    }

    if (omitidos > 0) {
      this.logger.log(
        `Hilo ${ancla.threadId}: ${omitidos} mensaje(s) antiguo(s) fuera del contexto ` +
          `(tope ${HILO_MAX_CARACTERES_NUEVOS} caracteres de texto nuevo)`,
      );
    }

    // Si se omite algo, lo que salió de ello sigue a la vista: lo aprobado va
    // siempre, y aquí se añade el borrador pendiente que tuviera el hilo.
    const borradorAnterior =
      omitidos > 0
        ? ([ancla, ...[...anteriores].reverse()]
            .map((e) => (Array.isArray(e.proposedTasks) ? e.proposedTasks : []))
            .find((p) => p.length > 0) ?? [])
            .map((p) => (p as { title?: unknown })?.title)
            .filter((t): t is string => typeof t === 'string' && t.length > 0)
            .map((t) => `- ${t}`)
        : [];

    return {
      textoUltimo,
      paraElModelo: {
        mensajes: cabidos.join(SEPARADOR_HILO),
        ultimo: cabeceraDe(ancla),
        aprobadas,
        omitidos,
        borradorAnterior,
      },
    };
  }

  /**
   * Lo común a las dos vías: pedirle el análisis al modelo y dejarlo listo para
   * persistir, con la prioridad ya pasada por la capa determinista.
   */
  private async analyze(hilo: Hilo, forceActionable: boolean): Promise<ClassificationDraft> {
    // Se analiza el hilo desde su correo más reciente: sus adjuntos son los
    // únicos que viajan, su fecha ancla las fechas relativas y en él se guarda
    // el borrador.
    const email = hilo.ancla;
    const cuerpo = email.bodyText || email.snippet || '';
    if (!cuerpo) {
      throw new Error(`El email ${email.id} no tiene texto para analizar.`);
    }

    const delHilo = await this.contextoDelHilo(hilo);
    const textToAnalyze = delHilo?.textoUltimo || cuerpo;

    // Solo se baja nada si el correo trae fichas. Un correo sin adjuntos no
    // gasta ni una llamada a Gmail, que es el caso mayoritario.
    let fichas = fichasDeAdjuntos(email.attachments);

    // Filtro de cuota: evitar descargar PDFs masivos de remitentes ruidosos
    const fromLower = email.from.toLowerCase();
    const isNoisy = ['noreply@banregio.com', 'donotreply@smartsheet.com', 'publicidad', 'ishop', 'konfio'].some(s => fromLower.includes(s));
    
    if (isNoisy) {
      const textLower = textToAnalyze.toLowerCase();
      const hasException = ['actualizacion de datos', 'actualización de datos', 'pdn', 'bim'].some(kw => textLower.includes(kw));
      if (!hasException) {
        this.logger.log(`Correo ${email.id}: Ignorando ${fichas.length} adjunto(s) por regla de remitente ruidoso (${email.from})`);
        fichas = [];
      }
    }

    const { adjuntos, ausentes } =
      fichas.length > 0
        ? await this.descargarAdjuntos(email.userId, email.gmailMessageId, fichas)
        : { adjuntos: [], ausentes: [] };

    if (adjuntos.length > 0 || ausentes.length > 0) {
      this.logger.log(
        `Correo ${email.id}: ${adjuntos.length} adjunto(s) al modelo, ` +
          `${ausentes.length} fuera (${ausentes.map((a) => a.motivo).join('; ') || 'ninguno'})`,
      );
    }

    const analysis = await this.ai.analyzeEmail(
      email.subject || '(Sin Asunto)',
      textToAnalyze,
      email.receivedAt,
      {
        hasAttachments: email.hasAttachments,
        hilo: delHilo?.paraElModelo,
        adjuntos,
        ausentes,
        traza: { emailId: email.id, threadId: email.threadId },
      },
    );

    const isActionable = analysis.isActionable || forceActionable;

    // Quién manda el correo sale de la cabecera, no del modelo (decisión de Doc
    // el 2026-07-28): es un dato duro y el modelo tendía a elegir a la persona
    // de la que hablaba el cuerpo. Solo si la cabecera no da nada aprovechable
    // se recurre a lo que dijera él, que es mejor que quedarse sin contexto.
    // En un hilo, el remitente del prefijo es el último que no es del equipo:
    // si el más reciente es una respuesta nuestra, «Zepto Main» no dice nada.
    const remitente =
      [email, ...[...hilo.anteriores].reverse()].find((e) => !esDelEquipo(e.from))?.from ?? email.from;
    const contexto = {
      senderName: senderFromHeader(remitente) ?? analysis.senderName,
      project: analysis.project,
    };

    // El prefijo se compone aquí, sobre la lista ya filtrada, para que el
    // contador cuadre con las tareas que de verdad van a existir.
    const titulos = withContextPrefix(
      analysis.tasks.map((t) => t.title),
      contexto,
    );

    let tasks: TaskDraft[] = isActionable
      ? analysis.tasks.map((task, i) => {
          // La prioridad del modelo pasa por la capa determinista antes de
          // persistirse: la fecha puede subirla, nunca bajarla.
          const decidida = this.resolvePriority(task, analysis.aiConfidence, email.id);

          return {
            title: titulos[i],
            description: task.description,
            priority: decidida.priority,
            tags: task.tags,
            dueDate: task.dueDate,
            source: TaskSource.EMAIL,
            aiConfidence: analysis.aiConfidence,
            priorityReason: decidida.reason,
            priorityAdjustedFrom: decidida.from,
          };
        })
      : [];

    // El modelo no vio nada accionable pero una persona insiste: no la dejamos
    // sin tarea. Se propone una desde el asunto y se marca MANUAL, porque el
    // criterio que la justifica es el de la persona, no el del modelo: un
    // reproceso posterior no debe borrarla.
    const usedFallback = forceActionable && tasks.length === 0;
    if (usedFallback) {
      tasks = [
        {
          // Lleva el mismo prefijo que las demás: al tablero le da igual que
          // esta saliera del asunto y no del modelo, y una tarjeta sin contexto
          // entre otras con él se lee como un fallo.
          title: withContextPrefix(
            [email.subject?.trim() || 'Tarea desde correo sin asunto'],
            contexto,
          )[0],
          description: email.snippet ?? '',
          priority: TaskPriority.MEDIUM,
          tags: [],
          dueDate: null,
          source: TaskSource.MANUAL,
          // La confianza sigue siendo la del análisis: el respaldo no la
          // mejora, solo dice que una persona pidió una tarea igualmente.
          aiConfidence: analysis.aiConfidence,
          // El respaldo desde el asunto nace en MEDIUM sin pasar por la capa
          // determinista: no hay fecha que pueda escalarla, así que no hay nada
          // que explicar.
          priorityReason: null,
          priorityAdjustedFrom: null,
        },
      ];
    }

    return {
      emailId: email.id,
      isActionable,
      category: analysis.category,
      aiConfidence: analysis.aiConfidence,
      tasks,
      usedFallback,
      company: analysis.company,
      bank: analysis.bank,
    };
  }

  /**
   * Aplica la capa determinista y deja constancia del ajuste.
   *
   * El log es, de momento, el único rastro de por qué una tarea acabó en
   * `URGENT`: la columna para persistir el motivo llega con el panel de
   * auditoría del Sprint 3, que sigue pendiente.
   */
  private resolvePriority(
    task: { title: string; priority: TaskPriority; dueDate: Date | null },
    aiConfidence: number,
    emailId: string,
  ): { priority: TaskPriority; reason: string | null; from: TaskPriority | null } {
    const decision = adjustPriority(
      { priority: task.priority, dueDate: task.dueDate, aiConfidence },
      // `new Date()` explícito: la función es pura y el instante entra por
      // parámetro para que las pruebas no dependan del reloj.
      new Date(),
    );

    if (decision.adjusted) {
      this.logger.log(`Prioridad ajustada en "${task.title}" (email ${emailId}): ${decision.reason}`);
    }

    // Devuelve el motivo además de la prioridad: antes solo salía al log, donde
    // la interfaz no puede leerlo y donde se pierde al rotar.
    return {
      priority: decision.priority,
      reason: decision.adjusted ? decision.reason : null,
      from: decision.adjusted ? task.priority : null,
    };
  }
}
