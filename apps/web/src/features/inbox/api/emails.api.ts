import { apiFetch } from "../../../lib/api";
import { EmailSnippet } from "../types";

export interface EmailDetail extends EmailSnippet {
  bodyText?: string;
}

export async function fetchEmail(id: string): Promise<EmailDetail> {
  return apiFetch<EmailDetail>(`/emails/${id}`);
}
