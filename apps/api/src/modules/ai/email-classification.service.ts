import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TaskPriority, TaskSource } from '@prisma/client';
import { AiService } from './ai.service';
import { adjustPriority } from './priority.rules';
import { senderFromHeader, withContextPrefix } from './title.prefix';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Cuántos mensajes anteriores del hilo entran como contexto, y cuánto texto
 * suman como mucho. Los dos topes existen porque fallan por motivos distintos:
 * un hilo de muchos mensajes cortos agota el primero, y uno de tres mensajes
 * con un informe pegado dentro agota el segundo.
 */
const HILO_MAX_MENSAJES = 10;
const HILO_MAX_CARACTERES = 12_000;

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
  ) {}

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
    const email = await this.prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    return this.analyze(email, options.forceActionable);
  }

  async classifyAndPersist(emailId: string, options: ClassifyOptions): Promise<ClassifyResult> {
    const email = await this.prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    const draft = await this.analyze(email, options.forceActionable);
    const { isActionable, category, aiConfidence, usedFallback, company, bank } = draft;

    await this.prisma.$transaction(async (tx) => {
      // Human-in-the-loop: la IA ya no crea filas en `Task`. La propuesta se
      // guarda en el JSON `proposedTasks` del `Email` y **se reemplaza entera**
      // en cada pasada, así que un reproceso no acumula ni duplica. Lo que hay
      // en `Task` es lo que aprobó una persona, y eso no se toca desde aquí.
      //
      // ⚠️ Por eso `options.replaceExisting` ya no cambia nada: no queda nada
      // que borrar. Sigue en la firma y `ai.processor.ts` lo pasa en `true`.
      // Pendiente de decisión: retirarlo o devolverle significado.
      await tx.email.update({
        where: { id: email.id },
        data: {
          isActionable,
          category,
          // Se escriben **siempre**, tambien cuando son `null`. Dejar el valor
          // viejo por no pisarlo con `null` convertiria un banco corregido en
          // un banco pegado para siempre: la propuesta se reemplaza entera, y
          // estos dos son parte de la propuesta.
          company,
          bank,
          processedAt: new Date(),
          proposedTasks: aJsonDeBorradores(draft.tasks),
        },
      });
    });

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
   * El hilo citado que se le pasa al modelo, **acotado**.
   *
   * Sin techo, un hilo largo entra entero en cada clasificación: son tokens de
   * entrada que se pagan en cada correo de la tanda, y el `max_tokens` del SDK
   * solo acota la respuesta, no la petición. Un hilo de obra con cincuenta
   * mensajes desbordaría la ventana y encarecería la cola entera sin que nada
   * lo avisara — la cuenta aparecería después, en `pmo-coste-ia`.
   *
   * **Se piden del más nuevo al más viejo** y se le da la vuelta antes de armar
   * el texto: así el recorte sacrifica lo más antiguo, que es lo menos
   * relevante para el mensaje que se está analizando, y el modelo lo sigue
   * leyendo en el orden en que ocurrió.
   */
  private async buildThreadContext(email: {
    id: string;
    userId: string;
    threadId: string;
    receivedAt: Date;
  }): Promise<string | undefined> {
    const previos = await this.prisma.email.findMany({
      where: {
        userId: email.userId,
        threadId: email.threadId,
        // Solo hacia atrás: un mensaje posterior no es contexto de este.
        receivedAt: { lt: email.receivedAt },
      },
      orderBy: { receivedAt: 'desc' },
      take: HILO_MAX_MENSAJES,
      select: { bodyText: true, snippet: true },
    });

    const textos = previos.map((e) => e.bodyText || e.snippet || '').filter(Boolean);
    if (textos.length === 0) return undefined;

    let presupuesto = HILO_MAX_CARACTERES;
    const cabidos: string[] = [];
    let recortado = false;

    for (const texto of textos) {
      if (presupuesto <= 0) {
        recortado = true;
        break;
      }
      if (texto.length > presupuesto) {
        cabidos.push(texto.slice(0, presupuesto));
        recortado = true;
        presupuesto = 0;
      } else {
        cabidos.push(texto);
        presupuesto -= texto.length;
      }
    }

    if (recortado || previos.length === HILO_MAX_MENSAJES) {
      // Que quede en el log: si un hilo se clasifica raro, lo primero que hay
      // que saber es si el modelo vio el hilo entero o solo la cola.
      this.logger.log(
        `Hilo del email ${email.id} recortado: ${cabidos.length} de ${previos.length} mensajes ` +
          `(tope ${HILO_MAX_MENSAJES} mensajes / ${HILO_MAX_CARACTERES} caracteres)`,
      );
    }

    return cabidos.reverse().join(SEPARADOR_HILO);
  }

  /**
   * Lo común a las dos vías: pedirle el análisis al modelo y dejarlo listo para
   * persistir, con la prioridad ya pasada por la capa determinista.
   */
  private async analyze(
    email: {
      id: string;
      userId: string;
      subject: string | null;
      snippet: string | null;
      bodyText: string | null;
      receivedAt: Date;
      /** Cabecera `From` cruda: de ahí sale el remitente del prefijo. */
      from: string;
      hasAttachments: boolean;
      threadId: string;
    },
    forceActionable: boolean,
  ): Promise<ClassificationDraft> {
    const textToAnalyze = email.bodyText || email.snippet || '';
    if (!textToAnalyze) {
      throw new Error(`El email ${email.id} no tiene texto para analizar.`);
    }

    const threadContext = await this.buildThreadContext(email);

    const analysis = await this.ai.analyzeEmail(
      email.subject || '(Sin Asunto)',
      textToAnalyze,
      email.receivedAt,
      { hasAttachments: email.hasAttachments, threadContext }
    );

    const isActionable = analysis.isActionable || forceActionable;

    // Quién manda el correo sale de la cabecera, no del modelo (decisión de Doc
    // el 2026-07-28): es un dato duro y el modelo tendía a elegir a la persona
    // de la que hablaba el cuerpo. Solo si la cabecera no da nada aprovechable
    // se recurre a lo que dijera él, que es mejor que quedarse sin contexto.
    const contexto = {
      senderName: senderFromHeader(email.from) ?? analysis.senderName,
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
