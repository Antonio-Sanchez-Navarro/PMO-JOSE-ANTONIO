/**
 * El contrato de la cola `classify-email`.
 *
 * Vive en su propio archivo, y no dentro del procesador, porque **lo firman
 * dos módulos distintos**: `GmailService` encola y `AiProcessor` consume. Con
 * el `any` que había antes, cambiar el nombre del campo en un lado compilaba
 * igual y el fallo aparecía en producción, con el job ya en la cola y el
 * consumidor leyendo `undefined`.
 */
export interface ClassifyEmailJob {
  /** Id del `Email` que hay que clasificar. */
  emailId: string;
}

/**
 * El procesador no devuelve nada: escribe el resultado en la base y deja que
 * un fallo se propague para que BullMQ reintente. `void` lo dice; `any`
 * dejaba creer que había un valor de retorno del que fiarse.
 */
export type ClassifyEmailResult = void;
