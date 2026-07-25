import { Email } from '@prisma/client';

/**
 * Correos de ejemplo para las pruebas.
 *
 * Están inspirados en los correos reales de la bandeja (obra, notaría, facturas,
 * newsletters), pero con datos inventados: no se versionan correos de nadie.
 */

const BASE: Email = {
  id: 'email-base',
  userId: 'user-1',
  gmailMessageId: 'gmail-base',
  threadId: 'thread-base',
  from: 'Remitente <remitente@example.com>',
  subject: '(Sin Asunto)',
  snippet: null,
  bodyText: null,
  labels: ['INBOX'],
  category: null,
  isActionable: false,
  receivedAt: new Date('2026-07-24T15:30:00.000Z'),
  processedAt: null,
};

export const makeEmail = (overrides: Partial<Email> = {}): Email => ({
  ...BASE,
  ...overrides,
});

/** Accionable, con fecha límite relativa ("el viernes") que el modelo debe resolver. */
export const emailConFechaRelativa = makeEmail({
  id: 'email-fecha-relativa',
  gmailMessageId: 'gmail-fecha-relativa',
  from: 'Arq. Elena Ruiz <elena@constructora.example>',
  subject: 'Cotización de cimentación — pendiente',
  bodyText:
    'Buenas tardes,\n\nNecesito la cotización actualizada de la cimentación del bloque B ' +
    'a más tardar el viernes para poder cerrar el presupuesto con el cliente.\n\nGracias.',
  receivedAt: new Date('2026-07-22T09:00:00.000Z'), // martes → viernes = 2026-07-24
});

/** Accionable, sin ninguna fecha mencionada: `dueDate` debe quedar en null. */
export const emailSinFecha = makeEmail({
  id: 'email-sin-fecha',
  gmailMessageId: 'gmail-sin-fecha',
  from: 'Notaría 42 <contacto@notaria42.example>',
  subject: 'Documentación pendiente para la escritura',
  bodyText:
    'Estimado cliente, seguimos a la espera de la documentación corporativa y ' +
    'la identificación del apoderado legal para continuar con el trámite.',
});

/** No accionable: newsletter. Es el caso que dispara el fallback manual. */
export const emailNoAccionable = makeEmail({
  id: 'email-no-accionable',
  gmailMessageId: 'gmail-no-accionable',
  from: 'Boletín Financiero <mkt@boletin.example>',
  subject: 'Estamos entre las 500 empresas más importantes del país',
  snippet: 'Nos enorgullece anunciar que hemos sido reconocidos...',
  bodyText:
    'Nos enorgullece anunciar que hemos sido reconocidos entre las 500 empresas ' +
    'más importantes del país. Gracias por acompañarnos en este camino.',
});

/** Sin cuerpo ni snippet: no hay nada que analizar. */
export const emailSinTexto = makeEmail({
  id: 'email-sin-texto',
  gmailMessageId: 'gmail-sin-texto',
  subject: 'Adjunto',
  bodyText: null,
  snippet: null,
});
