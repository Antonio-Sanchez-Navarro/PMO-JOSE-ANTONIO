-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "reconcileAfter" TIMESTAMP(3),
ADD COLUMN     "reconcileAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Email_processedAt_reconcileAfter_idx" ON "Email"("processedAt", "reconcileAfter");
