/**
 * Reinicia el estado de clasificación por IA de los correos ya procesados.
 *
 * Motivo (Sprint 3): el prompt de `AiService` ahora resuelve fechas relativas
 * contra `receivedAt` y extrae `dueDate`. Los correos clasificados antes de ese
 * cambio tienen tareas sin fecha límite, así que hay que reanalizarlos.
 *
 * Qué hace, en UNA transacción:
 *   1. Borra las `Task` con `sourceEmailId != null` (las generadas por la IA).
 *      Las tareas manuales (`sourceEmailId = null`) no se tocan.
 *   2. Pone `processedAt = null` en los `Email` ya procesados, que es la guarda
 *      de idempotencia que consulta `AiProcessor`.
 *
 * Uso (desde la raíz del repo):
 *   node apps/api/prisma/scripts/reset-processed-emails.js              # simulación
 *   node apps/api/prisma/scripts/reset-processed-emails.js --yes        # ejecuta
 *   node apps/api/prisma/scripts/reset-processed-emails.js --yes --enqueue
 *
 * `--enqueue` además encola un job `classify` por correo en la cola
 * `classify-email`. Sin ese flag los correos quedan listos pero inertes: el
 * reproceso arranca en la siguiente sync de Gmail o al encolar a mano.
 *
 * Salvaguarda: aborta si alguna tarea derivada de correo tiene `TimeEntry`
 * asociados; borrarla perdería horas registradas.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function loadEnv() {
  for (const file of [path.join(REPO_ROOT, '.env'), path.join(REPO_ROOT, 'apps/api/.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

loadEnv();

const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--yes');
const ENQUEUE = process.argv.includes('--enqueue');

const prisma = new PrismaClient();

async function snapshot() {
  const [emails, processed, tasksTotal, tasksFromEmail, tasksManual, withDueDate] =
    await Promise.all([
      prisma.email.count(),
      prisma.email.count({ where: { processedAt: { not: null } } }),
      prisma.task.count(),
      prisma.task.count({ where: { sourceEmailId: { not: null } } }),
      prisma.task.count({ where: { sourceEmailId: null } }),
      prisma.task.count({ where: { sourceEmailId: { not: null }, dueDate: { not: null } } }),
    ]);
  return { emails, processed, tasksTotal, tasksFromEmail, tasksManual, withDueDate };
}

function print(label, s) {
  console.log(
    `${label}: emails=${s.emails} (procesados=${s.processed}) · ` +
      `tasks=${s.tasksTotal} (de correo=${s.tasksFromEmail}, manuales=${s.tasksManual}, con dueDate=${s.withDueDate})`,
  );
}

async function enqueue(emailIds) {
  const { Queue } = require('bullmq');
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  const queue = new Queue('classify-email', {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
    },
  });
  for (const emailId of emailIds) {
    // jobId por correo: reencolar el script no duplica jobs pendientes.
    await queue.add('classify', { emailId }, { jobId: `reclassify-${emailId}` });
  }
  await queue.close();
  console.log(`Encolados ${emailIds.length} jobs 'classify' en la cola classify-email.`);
}

(async () => {
  const before = await snapshot();
  print('ANTES ', before);

  const blocked = await prisma.timeEntry.count({
    where: { task: { sourceEmailId: { not: null } } },
  });
  if (blocked > 0) {
    throw new Error(
      `Abortado: ${blocked} TimeEntry cuelgan de tareas generadas por IA. ` +
        'Borrarlas perdería horas registradas; resuélvelo antes de reejecutar.',
    );
  }

  if (!APPLY) {
    console.log(
      `\n[SIMULACIÓN] Se borrarían ${before.tasksFromEmail} tareas y se resetearían ` +
        `${before.processed} correos. Añade --yes para ejecutar.`,
    );
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const { count: tasksDeleted } = await tx.task.deleteMany({
      where: { sourceEmailId: { not: null } },
    });
    const { count: emailsReset } = await tx.email.updateMany({
      where: { processedAt: { not: null } },
      data: { processedAt: null },
    });
    return { tasksDeleted, emailsReset };
  });

  console.log(
    `\nTransacción aplicada: ${result.tasksDeleted} tareas borradas, ` +
      `${result.emailsReset} correos con processedAt = null.`,
  );

  const after = await snapshot();
  print('DESPUÉS', after);

  if (after.processed !== 0 || after.tasksFromEmail !== 0) {
    throw new Error('Verificación fallida: la DB no quedó en el estado esperado.');
  }

  if (ENQUEUE) {
    const ids = (await prisma.email.findMany({ select: { id: true } })).map((e) => e.id);
    await enqueue(ids);
  } else {
    console.log('Correos listos para reprocesar. Usa --enqueue para lanzar la clasificación.');
  }
})()
  .catch((e) => {
    console.error(`\nERROR: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
