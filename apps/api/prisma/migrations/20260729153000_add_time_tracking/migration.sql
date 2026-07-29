-- Sprint 5: registro de tiempos.
--
-- La tabla ya existía desde la migración inicial; lo que se añade aquí es el
-- centinela que garantiza un solo timer activo por persona y los índices por
-- los que preguntan la tarjeta y el informe.

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "activeFor" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_activeFor_key" ON "TimeEntry"("activeFor");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_startedAt_idx" ON "TimeEntry"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");
