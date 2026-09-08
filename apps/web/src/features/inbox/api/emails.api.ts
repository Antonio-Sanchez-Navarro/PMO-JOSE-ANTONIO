import type { ProposedTask } from "@pmo/shared";
import { apiFetch } from "../../../lib/api";
import { EmailSnippet } from "../types";

/**
 * Lo que devuelve `GET /emails/:id`. Es el mismo correo del listado más el
 * cuerpo y —desde la Fase 6— la cuarentena.
 */
export interface EmailDetail extends EmailSnippet {
  bodyText?: string;
  isActionable?: boolean;
  /** ISO 8601, o `null` si el worker todavía no lo ha analizado. */
  processedAt?: string | null;
  /**
   * **La cuarentena.** Lo que la IA propuso para este correo y todavía no ha
   * aprobado nadie. Desde la Fase 6 el modelo ya no escribe en el tablero: deja
   * aquí su propuesta y espera.
   *
   * Ojo con las tres formas de "no hay nada", que no significan lo mismo:
   * `undefined` es un correo que la IA no ha mirado, `[]` es un correo que miró
   * y del que no sacó ninguna tarea, y `null` es un correo cuya propuesta ya se
   * aprobó y se limpió. Solo la segunda y la tercera dicen que el modelo hizo su
   * trabajo.
   */
  proposedTasks?: ProposedTask[] | null;
}

export async function fetchEmail(id: string): Promise<EmailDetail> {
  return apiFetch<EmailDetail>(`/emails/${id}`);
}
