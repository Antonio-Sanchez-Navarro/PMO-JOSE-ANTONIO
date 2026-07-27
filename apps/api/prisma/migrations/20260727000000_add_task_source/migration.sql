-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('EMAIL', 'WHATSAPP', 'MANUAL');

-- AlterTable
-- Default MANUAL: las filas existentes que no se identifiquen como de correo
-- quedan protegidas del borrado por reproceso, no expuestas.
ALTER TABLE "Task" ADD COLUMN     "source" "TaskSource" NOT NULL DEFAULT 'MANUAL';

-- Backfill: hasta ahora el origen se deducía de la etiqueta 'manual' en `tags`
-- (ver MANUAL_TAG en email-classification.service.ts). Una tarea es de correo
-- si cuelga de un email y NO lleva esa etiqueta; todo lo demás es manual, que
-- ya es el default de la columna.
UPDATE "Task"
SET "source" = 'EMAIL'
WHERE "sourceEmailId" IS NOT NULL
  AND NOT ('manual' = ANY ("tags"));

-- Retirada del apaño: la etiqueta ya no significa nada, la columna la sustituye.
-- No se pierde información — el UPDATE anterior la acaba de traducir a `source`.
UPDATE "Task"
SET "tags" = array_remove("tags", 'manual')
WHERE 'manual' = ANY ("tags");
