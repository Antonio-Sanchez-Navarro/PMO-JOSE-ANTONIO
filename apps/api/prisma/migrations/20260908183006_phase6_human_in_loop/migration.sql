-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposedTasks" JSONB;
