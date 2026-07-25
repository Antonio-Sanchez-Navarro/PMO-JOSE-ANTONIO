/**
 * Renumera el campo `position` de las tareas para que sea secuencial dentro de
 * cada columna.
 *
 * Motivo: hasta ahora `position` se asignaba solo al crear tareas desde un
 * correo (el índice dentro de ese correo), así que había valores repetidos
 * — p. ej. `TODO [0,0,0,0,0,0,1,2,2,3]`. Con duplicados, `ORDER BY position`
 * no define un orden y el tablero baila.
 *
 * Deja cada columna (userId + status) como 0, 1, 2, 3… respetando el orden que
 * ya se veía: `position` y, para desempatar, `createdAt`.
 *
 * Uso (desde la raíz del repo):
 *   node apps/api/prisma/scripts/renumber-task-positions.js         # simulación
 *   node apps/api/prisma/scripts/renumber-task-positions.js --yes   # ejecuta
 *
 * Es idempotente: reejecutarlo sobre datos ya limpios no escribe nada.
 *
 * Se hace por script y no por un endpoint temporal de "fix" a propósito: un
 * endpoint que renumera toda la tabla es una operación destructiva sin dueño
 * claro, fácil de dejar olvidada en producción.
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
const prisma = new PrismaClient();

(async () => {
  const tasks = await prisma.task.findMany({
    orderBy: [{ userId: 'asc' }, { status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, userId: true, status: true, position: true, title: true },
  });

  // Agrupar por columna, preservando el orden del findMany.
  const columns = new Map();
  for (const task of tasks) {
    const key = `${task.userId}|${task.status}`;
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(task);
  }

  const updates = [];
  for (const [key, column] of columns) {
    const [, status] = key.split('|');
    const before = column.map((t) => t.position);
    column.forEach((task, index) => {
      if (task.position !== index) updates.push({ id: task.id, position: index });
    });
    const after = column.map((_, i) => i);
    const changed = before.join(',') !== after.join(',');
    console.log(
      `  ${status.padEnd(12)} ${String(column.length).padStart(3)} tareas  ` +
        `[${before.join(', ')}]${changed ? ` -> [${after.join(', ')}]` : '  (ya correcto)'}`,
    );
  }

  console.log(`\n${updates.length} tarea(s) necesitan renumeración.`);

  if (updates.length === 0) {
    console.log('Nada que hacer.');
    return;
  }

  if (!APPLY) {
    console.log('[SIMULACIÓN] Añade --yes para escribir.');
    return;
  }

  await prisma.$transaction(updates.map(({ id, position }) =>
    prisma.task.update({ where: { id }, data: { position } }),
  ));
  console.log(`Aplicado: ${updates.length} posiciones actualizadas.`);

  // Verificación: cada columna debe quedar como 0..n-1 sin repetidos.
  const after = await prisma.task.findMany({ select: { userId: true, status: true, position: true } });
  const check = new Map();
  for (const t of after) {
    const key = `${t.userId}|${t.status}`;
    if (!check.has(key)) check.set(key, []);
    check.get(key).push(t.position);
  }
  const broken = [...check.entries()].filter(([, positions]) => {
    const sorted = [...positions].sort((a, b) => a - b);
    return sorted.some((p, i) => p !== i);
  });
  if (broken.length > 0) {
    throw new Error(`Verificación fallida en: ${broken.map(([k]) => k).join(', ')}`);
  }
  console.log('Verificado: todas las columnas son secuenciales y sin repetidos.');
})()
  .catch((e) => {
    console.error(`\nERROR: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
